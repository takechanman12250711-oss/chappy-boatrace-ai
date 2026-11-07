'use strict';
// ボートデータ帳：その日の全レースの公式出走表を集め、見どころ（荒れる／混戦／堅め）と
// 場ごとのモーター順位をつけた1日分のファイルを作る。予想・買い目は作らない。
const fs = require('node:fs');
const path = require('node:path');
const { parseOfficialRaceHtml } = require('../../api/_parser');
const scheduleApi = require('../../api/schedule');
const { classifyRoughness } = require('../build-race-insight-report.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const OFFICIAL = 'https://www.boatrace.jp/owpc/pc/race/racelist';
const ROUGHNESS_CONFIG = path.join(ROOT, 'config', 'race-roughness-v1.json');
const REQUEST_GAP_MS = 350; // 公式サイトへの負担を抑える

function jstDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date).replaceAll('-', '');
}
function outputPath(date) { return `data/site/days/${date}.json`; }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function callApi(handler, query) {
  return new Promise((resolve, reject) => {
    let code = 200;
    const res = {
      setHeader() {},
      status(value) { code = value; return this; },
      json(data) { if (code >= 400 || !data?.ok) reject(new Error(data?.error || `schedule ${code}`)); else resolve(data); }
    };
    Promise.resolve(handler({ query }, res)).catch(reject);
  });
}

async function fetchText(url, fetchImpl) {
  const res = await fetchImpl(url, { headers: { 'user-agent': 'Mozilla/5.0 BoatDataBook/1.0' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`official ${res.status}`);
  return res.text();
}

function compactBoat(e) {
  return {
    boat: e.boat, reg: e.registerNo || '', name: e.racerName || '', cls: e.className || '',
    branch: e.branch || '', age: e.age, f: e.fCount, l: e.lCount, avgST: e.avgSt,
    nw: e.nationalWinRate, n2: e.national2Rate, n3: e.national3Rate,
    lw: e.localWinRate, l2: e.local2Rate,
    motorNo: e.motorNo, m2: e.motor2Rate, m3: e.motor3Rate, boatNo: e.boatNo, b2: e.boat2Rate
  };
}

// 見立ての理由を、だれでも読める短い言葉で出す（分類そのものは固定した式）。
function reasons(race, venuePrior, label) {
  const out = [];
  const b = race.boats;
  const one = b[0];
  const others = b.slice(1);
  const nw = x => (Number.isFinite(x?.nw) ? x.nw : null);
  const maxOther = Math.max(...others.map(x => nw(x) ?? 0));
  const a1Outer = b.filter(x => x.boat >= 4 && x.cls === 'A1').length;
  const outerBest = Math.max(...b.filter(x => x.boat >= 4).map(x => nw(x) ?? 0));
  const rank1 = 1 + others.filter(x => (nw(x) ?? 0) > (nw(one) ?? 0)).length;
  if (label === 'solid') {
    if (one.cls === 'A1') out.push('1号艇がA1級');
    if (nw(one) !== null && nw(one) - maxOther >= 1) out.push(`1号艇の勝率が他より${(nw(one) - maxOther).toFixed(1)}高い`);
    if (venuePrior && venuePrior.inCourseWinRate >= 0.57) out.push(`インが強い場（1着${Math.round(venuePrior.inCourseWinRate * 100)}%）`);
    if (!out.length && rank1 === 1) out.push('1号艇の勝率が6艇でいちばん高い');
    if (!out.length) out.push('外枠に目立って強い選手がいない');
  } else {
    if (rank1 >= 3) out.push(`1号艇の勝率が6艇中${rank1}番目`);
    if (one.cls === 'B1' || one.cls === 'B2') out.push(`1号艇が${one.cls}級`);
    if (a1Outer >= 1) out.push(`外枠(4〜6)にA1が${a1Outer}人`);
    else if (nw(one) !== null && outerBest - nw(one) >= 0.5) out.push('外枠に1号艇より勝率の高い選手');
    if (venuePrior && venuePrior.inCourseWinRate < 0.5) out.push(`インが弱い場（1着${Math.round(venuePrior.inCourseWinRate * 100)}%）`);
    const nws = b.map(x => nw(x)).filter(x => x !== null);
    if (nws.length === 6 && Math.max(...nws) - Math.min(...nws) < 1.5) out.push('6艇の実力が近い');
    if (!out.length && label === 'rough') out.push('1号艇が抜けておらず、外の艇にも勝ち目がある');
  }
  return out.slice(0, 3);
}

function lookout(race, config, jcd) {
  // 朝の時点では進入・展示・風は未確定なので、枠なり・既定値で分類する。
  const boats = race.boats.map(x => ({ boat: x.boat, course: x.boat, cls: x.cls, nw: x.nw, m2: x.m2, m3: x.m3, avgST: x.avgST, tilt: null }));
  if (boats.some(x => !x.cls)) return null;
  const result = classifyRoughness({ jcd, raceNo: race.raceNo, boats, wind: null, wave: null }, config);
  if (!result) return null;
  return { label: result.label, score: Math.round(result.probability * 1000) / 10, reasons: reasons(race, config.venuePrior.byJcd[jcd], result.label) };
}

function motorRanking(races) {
  const motors = new Map();
  for (const race of races) {
    for (const b of race.boats) {
      if (!Number.isFinite(b.motorNo) || !Number.isFinite(b.m2)) continue;
      const current = motors.get(b.motorNo) || { motorNo: b.motorNo, m2: b.m2, m3: b.m3, races: [] };
      current.races.push({ raceNo: race.raceNo, boat: b.boat, name: b.name });
      motors.set(b.motorNo, current);
    }
  }
  return [...motors.values()].sort((a, b) => b.m2 - a.m2 || (b.m3 ?? 0) - (a.m3 ?? 0) || a.motorNo - b.motorNo)
    .map((m, i) => ({ rank: i + 1, ...m }));
}

async function collect(options = {}) {
  const date = options.date || jstDate();
  const fetchImpl = options.fetch || fetch;
  const gap = options.gapMs ?? REQUEST_GAP_MS;
  const config = options.config || JSON.parse(fs.readFileSync(ROUGHNESS_CONFIG, 'utf8'));
  const schedule = options.schedule || await callApi(scheduleApi, { date });
  const venues = [];
  let failed = 0;
  for (const venue of schedule.venues || []) {
    const races = [];
    for (let raceNo = 1; raceNo <= 12; raceNo++) {
      const planned = (venue.races || []).find(r => r.raceNo === raceNo) || {};
      try {
        const html = await fetchText(`${OFFICIAL}?rno=${raceNo}&jcd=${venue.jcd}&hd=${date}`, fetchImpl);
        const parsed = parseOfficialRaceHtml(html, '');
        const boats = parsed.entries.map(compactBoat);
        if (boats.filter(x => x.reg).length < 6) throw new Error('entries-incomplete');
        const race = { raceNo, deadline: planned.deadline || '', title: parsed.raceInfo?.title || '', boats };
        race.lookout = lookout(race, config, venue.jcd);
        races.push(race);
      } catch (error) {
        failed++;
        races.push({ raceNo, deadline: planned.deadline || '', error: String(error?.message || error).slice(0, 80), boats: [] });
      }
      if (gap) await wait(gap);
    }
    venues.push({
      jcd: venue.jcd, place: venue.place, grade: venue.eventGrade || '', title: venue.eventTitle || '',
      session: venue.eventSession || null, races, motors: motorRanking(races.filter(r => r.boats.length))
    });
  }
  const ok = venues.reduce((n, v) => n + v.races.filter(r => r.boats.length).length, 0);
  return {
    schemaVersion: 1, kind: 'boat-data-day', date, generatedAt: new Date().toISOString(),
    source: 'boatrace.jp racelist (official)', lookoutModel: config.modelId,
    lookoutNote: '朝の出走表だけで分類（進入は枠なり、展示・風は未反映）。買い目・予想ではありません。',
    raceCount: ok, failedRaceCount: failed, venues
  };
}

function isDayFile(day) {
  return day?.schemaVersion === 1 && day.kind === 'boat-data-day' && /^\d{8}$/.test(day.date || '') &&
    Array.isArray(day.venues) && day.venues.length > 0 && day.raceCount > 0;
}

if (require.main === module) {
  const date = process.argv[2] || process.env.BOAT_DATA_DATE || jstDate();
  collect({ date }).then(day => {
    if (!isDayFile(day)) throw new Error('no-races-collected');
    const out = path.join(ROOT, outputPath(date));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(day) + '\n');
    console.log(JSON.stringify({ date, venues: day.venues.length, races: day.raceCount, failed: day.failedRaceCount }));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { collect, compactBoat, lookout, reasons, motorRanking, isDayFile, outputPath, jstDate };
