'use strict';

const scoreboard = require('./build-forward-research-scoreboard-v1.cjs');

const THRESHOLDS = {
  50:  { minRoiPercent: 100, minAddedTickets: 20,  minRescueCount: 2 },
  100: { minRoiPercent: 100, minAddedTickets: 50,  minRescueCount: 4 },
  250: { minRoiPercent: 100, minAddedTickets: 100, minRescueCount: 8 }
};

function num(v, fallback=0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function candidateRows(board) {
  const rows = [];
  for (const [auditName, audit] of Object.entries(board.audits || {})) {
    const raw = audit?.raw || {};
    const groups = [raw.modes, raw.triggers].filter(x => x && typeof x === 'object');
    for (const group of groups) {
      for (const [modeName, metric] of Object.entries(group)) {
        if (!metric || typeof metric !== 'object') continue;
        const addedTickets = num(metric.addedTickets || metric.addedTicketCount);
        if (addedTickets <= 0) continue;
        rows.push({
          auditName,
          modeName,
          roiPercent: num(metric.roiPercent),
          addedTickets,
          rescueCount: num(metric.rescueCount),
          manboatRescueCount: num(metric.manboatRescueCount),
          profitYen: num(metric.profitYen),
          investmentYen: num(metric.investmentYen),
          returnYen: num(metric.returnYen)
        });
      }
    }
  }
  return rows.sort((a,b) => b.roiPercent-a.roiPercent || b.rescueCount-a.rescueCount || b.addedTickets-a.addedTickets);
}

function evaluateCandidate(c, t) {
  const checks = {
    roi: c.roiPercent >= t.minRoiPercent,
    addedTickets: c.addedTickets >= t.minAddedTickets,
    rescues: c.rescueCount >= t.minRescueCount,
    nonNegativeProfit: c.profitYen >= 0
  };
  return { ...c, checks, passed: Object.values(checks).every(Boolean) };
}

function build() {
  const board = scoreboard.build();
  const settled = num(board.commonSettledRaceCount);
  const reachedGate = settled >= 250 ? 250 : settled >= 100 ? 100 : settled >= 50 ? 50 : 0;
  const rows = candidateRows(board);

  let status = 'collecting';
  let gate = null;
  let evaluated = [];
  let recommendation = 'No adoption decision before 50 common settled races.';

  if (reachedGate) {
    gate = reachedGate;
    const t = THRESHOLDS[gate];
    evaluated = rows.map(c => evaluateCandidate(c,t));
    const passed = evaluated.filter(x => x.passed);
    if (gate < 250) {
      status = passed.length ? 'continue_promising_candidates' : 'continue_without_promotion';
      recommendation = passed.length
        ? `At ${gate} races, keep passed candidates in forward shadow only; do not change production.`
        : `At ${gate} races, no candidate clears the precommitted research gate; keep collecting without production changes.`;
    } else {
      status = passed.length ? 'adoption_review_candidates' : 'no_adoption_candidate';
      recommendation = passed.length
        ? 'At 250 races, passed candidates may be presented for explicit human adoption review. No automatic adoption.'
        : 'At 250 races, no candidate clears the precommitted adoption-review gate.';
    }
  }

  return {
    schemaVersion: 1,
    decisionGateId: 'forward-research-decision-gate-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    commonSettledRaceCount: settled,
    reachedGate,
    thresholds: THRESHOLDS,
    status,
    gate,
    recommendation,
    topObservedCandidates: rows.slice(0,10),
    evaluatedCandidates: evaluated,
    policy: 'Thresholds are precommitted before the first 50 common settled races. They govern research review only and cannot automatically alter prediction logic, tickets, note output, purchases, or UI.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build, THRESHOLDS, candidateRows, evaluateCandidate };
