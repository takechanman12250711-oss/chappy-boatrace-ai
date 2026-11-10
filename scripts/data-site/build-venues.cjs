'use strict';
// ボートデータ帳：24場の特徴を公式結果（data/results）から集計する。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = 'data/site/venues.json';
const PLACES = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
  '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
const METHODS = ['逃げ', '差し', 'まくり', 'まくり差し', '抜き', '恵まれ'];
const WATER = { '01': '淡水', '02': '淡水', '03': '汽水', '04': '海水', '05': '淡水', '06': '汽水', '07': '汽水', '08': '海水',
  '09': '汽水', '10': '淡水', '11': '淡水', '12': '淡水', '13': '淡水', '14': '海水', '15': '海水', '16': '海水', '17': '海水',
  '18': '海水', '19': '海水', '20': '海水', '21': '淡水', '22': '汽水', '23': '淡水', '24': '海水' };

const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);
function shiftDate(yyyymmdd, days) {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8)));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10).replaceAll('-', '');
}

function emptyStats() {
  return { races: 0, inWins: 0, courseWins: [0, 0, 0, 0, 0, 0], rough: 0, manshu: 0, payouts: [], methods: {}, recentRaces: 0, recentInWins: 0 };
}

function addRace(stats, race, recent) {
  const payout = Number(race?.trifecta?.payout);
  const starts = Array.isArray(race.starts) ? race.starts : [];
  const winner = (race.finishers || []).find(f => Number(f.rank) === 1);
  if (!Number.isFinite(payout) || !winner || starts.length < 6) return false;
  const course = starts.find(s => Number(s.boat) === Number(winner.boat))?.course;
  if (!(course >= 1 && course <= 6)) return false;
  stats.races++;
  stats.courseWins[course - 1]++;
  if (course === 1) stats.inWins++;
  if (payout >= 5000) stats.rough++;
  if (payout >= 10000) stats.manshu++;
  stats.payouts.push(payout);
  const method = METHODS.includes(race.winningMethod) ? race.winningMethod : null;
  if (method) stats.methods[method] = (stats.methods[method] || 0) + 1;
  if (recent) { stats.recentRaces++; if (course === 1) stats.recentInWins++; }
  return true;
}

function summarize(jcd, s) {
  const sorted = [...s.payouts].sort((a, b) => a - b);
  const methodTotal = Object.values(s.methods).reduce((a, b) => a + b, 0);
  return {
    jcd, place: PLACES[Number(jcd)] || jcd, water: WATER[jcd] || '', races: s.races,
    inWinRate: pct(s.inWins, s.races),
    recentInWinRate: pct(s.recentInWins, s.recentRaces), recentRaces: s.recentRaces,
    courseWinRates: s.courseWins.map(w => pct(w, s.races)),
    roughRate: pct(s.rough, s.races), manshuRate: pct(s.manshu, s.races),
    medianPayout: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    methods: METHODS.map(m => ({ method: m, share: pct(s.methods[m] || 0, methodTotal) }))
  };
}

function build(options = {}) {
  const dir = options.resultsDir || path.join(ROOT, 'data', 'results');
  const files = fs.readdirSync(dir).filter(f => /^\d{8}\.json$/.test(f)).sort();
  const last = options.untilDate || files.at(-1)?.slice(0, 8);
  const from = shiftDate(last, -365 * 3 + 1);
  const recentFrom = shiftDate(last, -89);
  const byJcd = {};
  let total = emptyStats();
  for (const file of files) {
    const date = file.slice(0, 8);
    if (date < from || date > last) continue;
    const day = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    for (const race of day.races || []) {
      if (!race?.resultAvailable || race.void) continue;
      const jcd = String(race.jcd || '').padStart(2, '0');
      if (!PLACES[Number(jcd)]) continue;
      byJcd[jcd] ??= emptyStats();
      if (addRace(byJcd[jcd], race, date >= recentFrom)) addRace(total, race, date >= recentFrom);
    }
  }
  return {
    schemaVersion: 1, kind: 'boat-data-venues', generatedAt: new Date().toISOString(),
    period: { from, to: last, recentFrom }, source: 'data/results（公式結果）',
    definitions: { rough: '3連単5,000円以上', manshu: '3連単10,000円以上（万舟）', recent: '直近90日' },
    all: summarize('00', total),
    venues: Object.keys(byJcd).sort().map(jcd => summarize(jcd, byJcd[jcd]))
  };
}

function isVenuesFile(v) {
  return v?.schemaVersion === 1 && v.kind === 'boat-data-venues' && Array.isArray(v.venues) && v.venues.length >= 20 &&
    v.venues.every(x => x.races > 0);
}

if (require.main === module) {
  const out = path.join(ROOT, OUTPUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build(), null, 1) + '\n');
}

module.exports = { OUTPUT, build, isVenuesFile, shiftDate, addRace, emptyStats };
