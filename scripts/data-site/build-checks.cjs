'use strict';
// ボートデータ帳：朝に保存した「荒れそう／混戦／堅そう」を、公式結果（data/results）で毎晩答え合わせする。
// 見立ては朝の日次ファイルに保存したものだけを使い、結果を見てから直すことはしない。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = 'data/site/checks.json';
const ROUGH_YEN = 5000;
const pct = (a, b) => (b ? Math.round(a / b * 1000) / 10 : null);

function emptyTally() { return { races: 0, rough: 0 }; }
function addTally(t, rough) { t.races++; if (rough) t.rough++; }
function summary(tallies) {
  const all = tallies.all, r = tallies.rough, s = tallies.solid, m = tallies.mixed;
  return {
    races: all.races, baseRoughRate: pct(all.rough, all.races), baseSolidRate: pct(all.races - all.rough, all.races),
    rough: { races: r.races, hit: r.rough, rate: pct(r.rough, r.races) },
    mixed: { races: m.races, roughRate: pct(m.rough, m.races) },
    solid: { races: s.races, hit: s.races - s.rough, rate: pct(s.races - s.rough, s.races) }
  };
}
const newTallies = () => ({ all: emptyTally(), rough: emptyTally(), mixed: emptyTally(), solid: emptyTally() });

function gradeDay(day, results, before) {
  const byKey = new Map();
  for (const r of results?.races || []) {
    if (!r?.resultAvailable || r.void) continue;
    const payout = Number(r?.trifecta?.payout);
    if (!Number.isFinite(payout)) continue;
    byKey.set(`${String(r.jcd).padStart(2, '0')}-${Number(r.raceNo)}`, { payout, combination: r.trifecta.combination || '' });
  }
  const tallies = newTallies();
  const beforeTallies = newTallies();
  const races = [];
  for (const v of day.venues || []) {
    for (const race of v.races || []) {
      const label = race.lookout?.label;
      const result = byKey.get(`${v.jcd}-${race.raceNo}`);
      if (!label || !result) continue;
      const rough = result.payout >= ROUGH_YEN;
      addTally(tallies.all, rough); addTally(tallies[label], rough);
      const late = before?.races?.[`${v.jcd}-${race.raceNo}`]?.lookout?.label || null;
      if (late) { addTally(beforeTallies.all, rough); addTally(beforeTallies[late], rough); }
      races.push({ jcd: v.jcd, place: v.place, raceNo: race.raceNo, label, beforeLabel: late, payout: result.payout, combination: result.combination,
        correct: label === 'rough' ? rough : label === 'solid' ? !rough : null });
    }
  }
  return { tallies, beforeTallies, races };
}

function build(options = {}) {
  const daysDir = options.daysDir || path.join(ROOT, 'data', 'site', 'days');
  const resultsDir = options.resultsDir || path.join(ROOT, 'data', 'results');
  const beforeDir = options.beforeDir || path.join(ROOT, 'data', 'site', 'before');
  const files = fs.existsSync(daysDir) ? fs.readdirSync(daysDir).filter(f => /^\d{8}\.json$/.test(f)).sort() : [];
  const total = newTallies();
  const beforeTotal = newTallies();
  const days = [];
  let latest = null;
  for (const file of files) {
    const date = file.slice(0, 8);
    const resultFile = path.join(resultsDir, file);
    if (!fs.existsSync(resultFile)) continue;
    const day = JSON.parse(fs.readFileSync(path.join(daysDir, file), 'utf8'));
    const beforeFile = path.join(beforeDir, file);
    const before = fs.existsSync(beforeFile) ? JSON.parse(fs.readFileSync(beforeFile, 'utf8')) : null;
    const graded = gradeDay(day, JSON.parse(fs.readFileSync(resultFile, 'utf8')), before);
    if (!graded.tallies.all.races) continue;
    for (const key of Object.keys(total)) {
      total[key].races += graded.tallies[key].races; total[key].rough += graded.tallies[key].rough;
      beforeTotal[key].races += graded.beforeTallies[key].races; beforeTotal[key].rough += graded.beforeTallies[key].rough;
    }
    days.push({ date, ...summary(graded.tallies), before: graded.beforeTallies.all.races ? summary(graded.beforeTallies) : null });
    latest = { date, ...summary(graded.tallies), races: graded.races };
  }
  return {
    schemaVersion: 1, kind: 'boat-data-checks', generatedAt: new Date().toISOString(),
    definition: `3連単の払戻が${ROUGH_YEN.toLocaleString('ja-JP')}円以上なら「荒れた」`,
    cumulative: summary(total), beforeCumulative: beforeTotal.all.races ? summary(beforeTotal) : null, days: days.reverse(), latest
  };
}

function isChecksFile(c) {
  return c?.schemaVersion === 1 && c.kind === 'boat-data-checks' && Array.isArray(c.days) && c.days.length > 0 && c.cumulative?.races > 0;
}

if (require.main === module) {
  const out = path.join(ROOT, OUTPUT);
  const report = build();
  if (!isChecksFile(report)) { console.error('no-graded-days-yet'); process.exitCode = 1; }
  else { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(report) + '\n'); }
}

module.exports = { OUTPUT, build, gradeDay, isChecksFile };
