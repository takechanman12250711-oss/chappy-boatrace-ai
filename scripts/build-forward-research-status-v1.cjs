'use strict';

const scoreboard = require('./build-forward-research-scoreboard-v1.cjs');
const decisionGate = require('./evaluate-forward-research-decision-gate-v1.cjs');

function build() {
  const board = scoreboard.build();
  const gate = decisionGate.build();
  const passed = (gate.evaluatedCandidates || []).filter(x => x?.passed);

  return {
    schemaVersion: 1,
    statusId: 'forward-research-status-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    commonSettledRaceCount: board.commonSettledRaceCount,
    nextGate: board.nextGate,
    progressPercent: board.progressPercent,
    decisionStatus: gate.status,
    reachedGate: gate.reachedGate,
    gateThresholds: gate.thresholds,
    recommendation: gate.recommendation,
    passedCandidateCount: passed.length,
    passedCandidates: passed.slice(0, 10),
    topObservedCandidates: gate.topObservedCandidates || [],
    auditSummary: Object.fromEntries(Object.entries(board.audits || {}).map(([name,a]) => [name, {
      settledCount: a.settledCount,
      gates: a.gates,
      bestMode: a.bestMode
    }])),
    policy: 'Single research status output only. It cannot change prediction logic, scores, candidate order, tickets, note output, purchases, UI, or automatically adopt any candidate.'
  };
}

if (require.main === module) process.stdout.write(JSON.stringify(build(), null, 2) + '\n');
module.exports = { build };
