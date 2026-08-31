'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const INPUT = path.join(ROOT, 'data', 'stats', 'local-water-priority-selector-shadow-replay.json');

function bandScoreGap(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'unknown';
  if (n <= 1) return '0-1';
  if (n <= 3) return '2-3';
  if (n <= 7) return '4-7';
  return '8+';
}

function bandSourceIndex(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'unknown';
  if (n < 32) return '0-31';
  if (n < 64) return '32-63';
  if (n < 128) return '64-127';
  return '128+';
}

function summarize(rows, keyFn) {
  const out = new Map();
  for (const row of rows) {
    const key = String(keyFn(row) ?? 'unknown');
    const cur = out.get(key) || { total: 0, rescue: 0, falsePromotion: 0 };
    cur.total += 1;
    if (row.rescuedOuterWinner === true) cur.rescue += 1;
    else cur.falsePromotion += 1;
    out.set(key, cur);
  }
  return Object.fromEntries([...out.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0])));
}

function build(report) {
  const rows = (Array.isArray(report?.switchedRaces) ? report.switchedRaces : [])
    .filter(row => row?.shadowOuterPromotion === true)
    .map(row => {
      const promoted = (Array.isArray(row.topCandidates) ? row.topCandidates : [])
        .find(item => Number(item?.boatNo) === Number(row.shadowHead));
      return {
        date: row.date,
        jcd: row.jcd,
        raceNo: row.raceNo,
        venue: row.venue || '',
        conditionBand: row.conditionBand || 'unknown',
        currentHead: row.currentHead,
        shadowHead: row.shadowHead,
        actualHead: row.actualHead,
        scoreImprovement: row.scoreImprovement,
        promotedScore: promoted?.score ?? row.bestCandidateScore ?? null,
        promotedSourceIndex: promoted?.index ?? null,
        rescuedOuterWinner: row.rescuedOuterWinner === true,
        falseOuterPromotion: row.falseOuterPromotion === true,
        outcome: row.outcome || ''
      };
    });

  const rescues = rows.filter(row => row.rescuedOuterWinner);
  const falsePromotions = rows.filter(row => !row.rescuedOuterWinner);

  return {
    schemaVersion: 1,
    analysisId: 'outer-head-rescue-false-promotion-audit-v1',
    generatedAt: new Date().toISOString(),
    sourceVersion: report?.version || null,
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Hypothesis-generation audit to separate rescued 5/6-head promotions from false 5/6-head promotions using only fields already saved in the prior shadow replay.',
    warning: 'Retrospective descriptive audit only. Do not choose a production threshold from the best historical subgroup; any candidate rule requires preregistered forward validation.',
    totals: {
      outerPromotionSwitchCount: rows.length,
      rescuedOuterWinnerCount: rescues.length,
      falseOuterPromotionCount: falsePromotions.length,
      falsePromotionsPerRescue: rescues.length ? Number((falsePromotions.length / rescues.length).toFixed(2)) : null
    },
    byHead: summarize(rows, row => row.shadowHead),
    byConditionBand: summarize(rows, row => row.conditionBand),
    byScoreGapBand: summarize(rows, row => bandScoreGap(row.scoreImprovement)),
    bySourceIndexBand: summarize(rows, row => bandSourceIndex(row.promotedSourceIndex)),
    byCurrentHead: summarize(rows, row => row.currentHead),
    byVenue: summarize(rows, row => row.venue || 'unknown'),
    rescueRows: rescues,
    falsePromotionRows: falsePromotions
  };
}

function main() {
  const report = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  process.stdout.write(JSON.stringify(build(report), null, 2) + '\n');
}

if (require.main === module) main();
module.exports = { build, bandScoreGap, bandSourceIndex, summarize };
