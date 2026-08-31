'use strict';

const fs = require('node:fs');
const path = require('node:path');
const base = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const RESULTS_DIR = path.join(ROOT, 'data', 'results');
const TIERS = [7, 12, 18, 24];

function pct(a, b) {
  return b ? Number((100 * a / b).toFixed(1)) : 0;
}

function payoutMap() {
  const map = new Map();
  if (!fs.existsSync(RESULTS_DIR)) return map;
  for (const file of fs.readdirSync(RESULTS_DIR)) {
    if (!/^\d{8}\.json$/.test(file)) continue;
    let doc;
    try { doc = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8')); }
    catch { continue; }
    const races = Array.isArray(doc?.races) ? doc.races : [];
    for (const race of races) {
      if (!race?.resultAvailable) continue;
      const date = String(race.date || doc.date || '').replace(/\D/g, '');
      const jcd = String(race.jcd || '').padStart(2, '0');
      const raceNo = Number(race.raceNo);
      const payout = Number(race?.trifecta?.payout || 0);
      if (!date || !jcd || !raceNo || !(payout > 0)) continue;
      map.set(`${date}-${jcd}-${raceNo}`, payout);
    }
  }
  return map;
}

function build() {
  const report = base.build();
  const payouts = payoutMap();
  let missingPayoutHitCount = 0;

  for (const limit of TIERS) {
    const tier = report.tiers[String(limit)] || report.tiers[limit];
    tier.returnYen = 0;
    tier.incrementalReturnYenVsPrevious = 0;
  }

  for (const row of report.rows) {
    const payout = payouts.get(row.raceKey) || 0;
    row.payoutYen = payout;
    let previousReturn = 0;
    for (const limit of TIERS) {
      const tierRow = row.tiers[String(limit)] || row.tiers[limit];
      if (!tierRow) continue;
      const returned = tierRow.hit ? payout : 0;
      tierRow.returnYen = returned;
      const metric = report.tiers[String(limit)] || report.tiers[limit];
      metric.returnYen += returned;
      if (tierRow.hit && !(payout > 0)) missingPayoutHitCount += 1;
      if (limit !== TIERS[0]) metric.incrementalReturnYenVsPrevious += returned - previousReturn;
      previousReturn = returned;
    }
  }

  for (const limit of TIERS) {
    const metric = report.tiers[String(limit)] || report.tiers[limit];
    metric.returnYen = Math.round(metric.returnYen);
    metric.profitYen = metric.returnYen - metric.investmentYen;
    metric.roiPercent = pct(metric.returnYen, metric.investmentYen);
    metric.incrementalReturnYenVsPrevious = Math.round(metric.incrementalReturnYenVsPrevious);
  }

  report.comparisons = [];
  for (let i = 1; i < TIERS.length; i += 1) {
    const from = report.tiers[String(TIERS[i - 1])] || report.tiers[TIERS[i - 1]];
    const to = report.tiers[String(TIERS[i])] || report.tiers[TIERS[i]];
    report.comparisons.push({
      from: from.limit,
      to: to.limit,
      additionalTicketsPerFullRace: to.limit - from.limit,
      hitCountDelta: to.hitCount - from.hitCount,
      hitRatePointDelta: Number((to.hitRatePercent - from.hitRatePercent).toFixed(1)),
      investmentDeltaYen: to.investmentYen - from.investmentYen,
      returnDeltaYen: to.returnYen - from.returnYen,
      profitDeltaYen: to.profitYen - from.profitYen,
      roiPointDelta: Number((to.roiPercent - from.roiPercent).toFixed(1))
    });
  }

  report.analysisId = 'ticket-expansion-7-12-18-24-v2-payout-fixed';
  report.generatedAt = new Date().toISOString();
  report.diagnostics.payoutLookupRaceCount = payouts.size;
  report.diagnostics.payoutMissingHitCount = missingPayoutHitCount;
  report.methodology.payoutSource = 'data/results/YYYYMMDD.json races[].trifecta.payout';
  return report;
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, payoutMap };
