'use strict';
// ボートデータ帳：締切が近いレースの直前情報（展示タイム・チルト・部品交換・スタート展示の進入・水面気象）を
// 公式 beforeinfo から集め、締切前に保存する。保存済みで内容のそろったレースは書き換えない。
const fs = require('node:fs');
const path = require('node:path');
const { parseOfficialRaceHtml } = require('../../api/_parser');
const { classifyRoughness } = require('../build-race-insight-report.cjs');
const day = require('./collect-day.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const OFFICIAL = 'https://www.boatrace.jp/owpc/pc/race/beforeinfo';
const ROUGHNESS_CONFIG = path.join(ROOT, 'config', 'race-roughness-v1.json');
const WINDOW_MINUTES = 50;   // 締切まで50分以内のレースを見る（展示は締切の約30分前）
const MIN_LEAD_SECONDS = 60; // 締切1分前を切ったら取りに行かない
const REQUEST_GAP_MS = 350;

function outputPath(date) { return `data/site/before/${date}.json`; }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const deadlineMs = (date, hhmm) => (hhmm ? Date.parse(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T${hhmm.padStart(5, '0')}:00+09:00`) : NaN);

function complete(entry) {
  return Boolean(entry && entry.boats?.length === 6 && entry.boats.every(b => Number.isFinite(b.exT)) && entry.start?.length === 6);
}

function compactBefore(parsed, savedAt) {
  const info = parsed.beforeInfo || [];
  const times = info.map(b => b.exhibition?.displayTime).filter(Number.isFinite);
  const boats = info.map(b => {
    const exT = b.exhibition?.displayTime ?? null;
    return {
      boat: b.boat, exT,
      exRank: Number.isFinite(exT) ? 1 + times.filter(t => t < exT).length : null,
      tilt: b.exhibition?.tilt ?? null,
      weight: b.exhibition?.weight ?? null,
      propeller: b.exhibition?.propeller || '',
      parts: b.exhibition?.partsExchange || ''
    };
  });
  const start = (parsed.startExhibition || []).filter(s => s.isOfficialCourse)
    .map(s => ({ course: s.course, boat: s.boat, st: s.st, marker: s.marker || '' }));
  const w = parsed.weather || {};
  return {
    savedAt, boats, start,
    weather: { weather: w.weather || '', temperature: w.temperature ?? null, windSpeed: w.windSpeed ?? null,
      windDirection: w.windDirection || '', waveHeight: w.waveHeight ?? null, waterTemperature: w.waterTemperature ?? null }
  };
}

// 直前の見立て：出走表に、実際の進入（スタート展示）と風・波を足して同じ固定式で分け直す。
function lookoutBefore(race, before, config, jcd) {
  if (!race?.boats?.length || before.start.length !== 6) return null;
  const courseOf = new Map(before.start.map(s => [s.boat, s.course]));
  const tiltOf = new Map(before.boats.map(b => [b.boat, b.tilt]));
  const boats = race.boats.map(b => ({ boat: b.boat, course: courseOf.get(b.boat) ?? b.boat, cls: b.cls, nw: b.nw, m2: b.m2, m3: b.m3, avgST: b.avgST, tilt: tiltOf.get(b.boat) ?? null }));
  if (boats.some(b => !b.cls)) return null;
  const result = classifyRoughness({ jcd, raceNo: race.raceNo, boats, wind: before.weather.windSpeed, wave: before.weather.waveHeight }, config);
  return result ? { label: result.label, score: Math.round(result.probability * 1000) / 10 } : null;
}

async function collect(options = {}) {
  const date = options.date || day.jstDate();
  const now = options.now ?? Date.now();
  const fetchImpl = options.fetch || fetch;
  const gap = options.gapMs ?? REQUEST_GAP_MS;
  const config = options.config || JSON.parse(fs.readFileSync(ROUGHNESS_CONFIG, 'utf8'));
  const dayFile = options.day;
  if (!day.isDayFile(dayFile) || dayFile.date !== date) throw new Error('day-file-missing');
  const races = { ...(options.existing?.date === date ? options.existing.races : {}) };
  let fetched = 0, saved = 0, failed = 0;
  for (const venue of dayFile.venues) {
    for (const race of venue.races) {
      const key = `${venue.jcd}-${race.raceNo}`;
      if (complete(races[key])) continue;
      const deadline = deadlineMs(date, race.deadline);
      if (!Number.isFinite(deadline)) continue;
      const lead = (deadline - now) / 1000;
      if (lead < MIN_LEAD_SECONDS || lead > WINDOW_MINUTES * 60) continue;
      try {
        const res = await fetchImpl(`${OFFICIAL}?rno=${race.raceNo}&jcd=${venue.jcd}&hd=${date}`,
          { headers: { 'user-agent': 'Mozilla/5.0 BoatDataBook/1.0' }, signal: AbortSignal.timeout(15000) });
        fetched++;
        if (!res.ok) throw new Error(`official ${res.status}`);
        const savedAt = new Date(options.now ?? Date.now()).toISOString();
        if (Date.parse(savedAt) >= deadline) continue; // 締切を過ぎた取得は保存しない
        const entry = compactBefore(parseOfficialRaceHtml('', await res.text()), savedAt);
        if (!entry.boats.some(b => Number.isFinite(b.exT))) continue; // 展示前
        entry.deadline = race.deadline;
        entry.lookout = lookoutBefore(race, entry, config, venue.jcd);
        races[key] = entry;
        saved++;
      } catch (error) {
        failed++;
      }
      if (gap) await wait(gap);
    }
  }
  return {
    report: { schemaVersion: 1, kind: 'boat-data-before', date, generatedAt: new Date().toISOString(), lookoutModel: config.modelId, races },
    stats: { fetched, saved, failed }
  };
}

function isBeforeFile(file) {
  return file?.schemaVersion === 1 && file.kind === 'boat-data-before' && /^\d{8}$/.test(file.date || '') &&
    file.races && typeof file.races === 'object' && Object.keys(file.races).length > 0 &&
    Object.values(file.races).every(r => Date.parse(r.savedAt) < deadlineMs(file.date, r.deadline));
}

if (require.main === module) {
  const date = process.argv[2] || process.env.BOAT_DATA_DATE || day.jstDate();
  const read = p => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')); } catch { return null; } };
  collect({ date, day: read(day.outputPath(date)), existing: read(outputPath(date)) }).then(({ report, stats }) => {
    console.log(JSON.stringify({ date, races: Object.keys(report.races).length, ...stats }));
    if (!isBeforeFile(report) || stats.saved === 0) { console.log('nothing-new-to-save'); return; } // 変化がなければ書かない
    const out = path.join(ROOT, outputPath(date));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report) + '\n');
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { collect, compactBefore, lookoutBefore, complete, isBeforeFile, outputPath, deadlineMs, WINDOW_MINUTES };
