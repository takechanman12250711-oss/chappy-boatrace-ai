'use strict';

const assert = require('node:assert/strict');
const audit = require('../scripts/validate-st-role-attack-exhibition-holdout.cjs');

function row(boatNo, components) {
  return { boatNo, components };
}

const baseline = {
  weights: {
    st: 1,
    roleAttack: 1,
    exhibition: 1,
    raceFlow: 1,
    courseIndex: 1
  }
};

{
  const ranked = [
    row(1, { st: 1, roleAttack: 1, exhibition: 1, raceFlow: 2, courseIndex: 6 }),
    row(3, { st: 2, roleAttack: 2, exhibition: 2, raceFlow: 1, courseIndex: 3 }),
    row(4, { st: 3, roleAttack: 2, exhibition: 0.5, raceFlow: 0, courseIndex: 2 })
  ];
  const candidate = audit.chooseCandidate(ranked, baseline);
  assert.equal(candidate.boatNo, 3, 'all three positive gaps are required');
  assert.equal(candidate.baselineRank, 2);
}

{
  const ranked = [
    row(1, { st: 1, roleAttack: 1, exhibition: 1, raceFlow: 2, courseIndex: 6 }),
    row(3, { st: 2, roleAttack: 2, exhibition: 1, raceFlow: 1, courseIndex: 3 })
  ];
  assert.equal(audit.chooseCandidate(ranked, baseline), null, 'an exhibition tie must not qualify');
}

{
  const prepared = [];
  for (let index = 0; index < 12; index += 1) {
    prepared.push({
      currentHead: 1,
      shadowHead: 3,
      actualHead: index < 8 ? 3 : (index < 10 ? 1 : 2),
      eligible: true
    });
  }
  const summary = audit.summarize(prepared);
  assert.equal(summary.wrongToCorrectCount, 8);
  assert.equal(summary.correctToWrongCount, 2);
  assert.equal(summary.netCorrectGain, 6);
  assert.equal(summary.candidateWinnerCount, 8);
  assert.equal(summary.innerWinnerCount, 2);
}

{
  const overall = {
    raceCount: 120,
    eligibleCount: 20,
    candidateWinnerCount: 10,
    netCorrectGain: 5,
    eligibleAccuracyChangePt: 25,
    oneSidedPValue: 0.05,
    switchRate: 16.7,
    wrongToCorrectCount: 10,
    correctToWrongCount: 5
  };
  const half = { eligibleCount: 10, netCorrectGain: 2 };
  const decision = audit.decide({
    sourceReady: true,
    discoveryOverlapCount: 0,
    overall,
    firstHalf: half,
    secondHalf: { eligibleCount: 10, netCorrectGain: 3 }
  });
  assert.equal(decision.nextStep, 'prepare-prospective-shadow-st-attack-exhibition');
}

{
  const overall = {
    raceCount: 120,
    eligibleCount: 20,
    candidateWinnerCount: 4,
    netCorrectGain: -3,
    eligibleAccuracyChangePt: -15,
    oneSidedPValue: 0.9,
    switchRate: 16.7,
    wrongToCorrectCount: 4,
    correctToWrongCount: 7
  };
  const decision = audit.decide({
    sourceReady: true,
    discoveryOverlapCount: 0,
    overall,
    firstHalf: { eligibleCount: 10, netCorrectGain: -1 },
    secondHalf: { eligibleCount: 10, netCorrectGain: -2 }
  });
  assert.equal(decision.nextStep, 'reject-st-role-attack-exhibition-composite');
}

{
  const decision = audit.decide({
    sourceReady: true,
    discoveryOverlapCount: 1,
    overall: { raceCount: 200 },
    firstHalf: {},
    secondHalf: {}
  });
  assert.equal(decision.nextStep, 'blocked-discovery-holdout-overlap');
}

assert.equal(audit.oneSidedBinomialPValue(4, 5), 0.1875);
console.log('st-role-attack-exhibition untouched holdout tests passed');
