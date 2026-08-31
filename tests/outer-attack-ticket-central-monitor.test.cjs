'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const monitor = require('../scripts/build-outer-attack-ticket-central-monitor.cjs');
const shadow = require('../js/outer-attack-ticket-shadow.js');
const settlement = require('../js/outer-attack-ticket-settlement.js');
const gate = require('../js/outer-attack-ticket-decision-gate.js');
const input = require('../scripts/analysis-input-contract.js');

const deps = { shadow, settlement, gate, input };

function analysis(boatNo, options = {}) {
  return {
    boatNo,
    indexes: {
      raceFlow: 40,
      st: 40,
      exhibition: 40,
      local: 40,
      turn: 40,
      national: 40,
      motor: 40,
      ...(options.indexes || {})
    },
    roleScores: {
      attack: 40,
      hold: 40,
      pickup: 40,
      ...(options.roleScores || {})
    },
    courseStructureTheory: { appliedIndex: options.courseIndex ?? 40 }
  };
}

function activeRecord(overrides = {}) {
  const record = {
    raceKey: '20260831-05-7',
    date: '20260831',
    jcd: '05',
    raceNo: 7,
    generatedAt: '2026-08-31T04:30:00.000Z',
    selectedAt: '2026-08-31T04:30:00.000Z',
    deadlineAt: '2026-08-31T05:00:00.000Z',
    preRaceConditions: {
      schemaVersion: 4,
      sourceTiming: 'pre_deadline',
      officialResultUsed: false,
      source: 'boatrace-official',
      sourceFetchedAt: '2026-08-31T04:29:00.000Z'
    },
    formations: {
      main: ['1-2-4', '1-4-2'],
      cover: [
        { ticket: '1-2-5', amountYen: 200 },
        { ticket: '1-5-2', amountYen: 100 }
      ],
      flow: ['1-2-6', '1-6-2'],
      hole: ['2-1-5', '2-5-1']
    },
    practicalSelection: {
      frameRiseFallReplayBasis: {
        source: 'pre-deadline-production-prediction',
        analyses: [
          analysis(1, {
            indexes: { raceFlow: 80, st: 50, exhibition: 50 },
            roleScores: { attack: 50 },
            courseIndex: 90
          }),
          analysis(2),
          analysis(3, {
            indexes: { raceFlow: 60, st: 51, exhibition: 56 },
            roleScores: { attack: 53 },
            courseIndex: 70
          }),
          analysis(4), analysis(5), analysis(6)
        ]
      }
    },
    evaluatedScenarioCandidates: {
      candidatePool: [
        { id: 'cover', ticket: '1-4-3', sourceCategory: 'cover', evidenceQualified: true, purchaseEligible: true, priorityScore: 80 },
        { id: 'flow', ticket: '1-5-3', sourceCategory: 'フォーメーション', evidenceQualified: true, purchaseEligible: false, priorityScore: 40 },
        { id: 'hole', ticket: '2-3-5', sourceCategory: '穴候補', evidenceQualified: true, purchaseEligible: false, priorityScore: 30 }
      ]
    }
  };
  return { ...record, ...overrides };
}

function officialResult(raceNo = 7, overrides = {}) {
  const top = overrides.top || [1, 4, 3];
  const rest = [1, 2, 3, 4, 5, 6].filter(boat => !top.includes(boat));
  return {
    source: 'boatrace-official',
    date: '20260831',
    jcd: '05',
    raceNo,
    checkedAt: overrides.checkedAt || '2026-08-31T06:00:00.000Z',
    resultAvailable: true,
    finishers: [...top, ...rest].map((boat, index) => ({ rank: index + 1, boat })),
    trifecta: {
      combination: top.join('-'),
      payout: overrides.payout || 1500
    }
  };
}

function resultDirectory(rows) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'outer-central-results-'));
  fs.writeFileSync(path.join(root, '20260831.json'), JSON.stringify({
    schemaVersion: 1,
    source: 'boatrace-official',
    date: '20260831',
    races: rows
  }, null, 2));
  return root;
}

assert.equal(monitor.VERSION, 'outer-attack-ticket-central-monitor-v1');
assert.equal(monitor.ARCHIVE_ID, 'outer-attack-ticket-central-shadow-archive-v1');
assert.equal(monitor.SETTLEMENT_STORE_ID, 'outer-attack-ticket-central-settlements-v1');
assert.equal(monitor.REPORT_ID, 'outer-attack-ticket-central-report-v1');

const firstData = { date: '20260831', verificationPredictions: [activeRecord()] };
const first = monitor.capture(firstData, null, {
  dependencies: deps,
  now: '2026-08-31T04:31:00.000Z'
});
assert.equal(first.diagnostics.capturedCount, 1);
assert.equal(first.archive.snapshotCount, 1);
assert.equal(first.archive.productionChanged, false);
assert.equal(first.archive.automaticApplication, false);
const firstEntry = Object.values(first.archive.snapshots)[0];
assert.equal(firstEntry.centralCapturedAt, '2026-08-31T04:31:00.000Z');
assert.equal(firstEntry.snapshot.resultUsedForGeneration, false);
assert.equal(firstEntry.snapshot.retrospectiveBackfillAllowed, false);
assert.equal(firstEntry.snapshot.readyVariantCount, 3);
assert.equal(firstEntry.snapshot.a.totalStakeYen, 900);
assert.equal(firstEntry.snapshot.variants.cover.b.totalStakeYen, 900);

const repeat = monitor.capture(firstData, first.archive, {
  dependencies: deps,
  now: '2026-08-31T04:32:00.000Z'
});
assert.equal(repeat.diagnostics.preservedCount, 1);
assert.equal(repeat.archive.snapshotCount, 1);
assert.equal(Object.values(repeat.archive.snapshots)[0].centralCapturedAt, '2026-08-31T04:31:00.000Z');

const changed = activeRecord();
changed.formations.cover[1] = { ticket: '1-6-5', amountYen: 100 };
const conflict = monitor.capture({ date: '20260831', verificationPredictions: [changed] }, repeat.archive, {
  dependencies: deps,
  now: '2026-08-31T04:33:00.000Z'
});
assert.equal(conflict.diagnostics.conflictCount, 1);
assert.equal(conflict.archive.snapshotCount, 1);
assert.equal(conflict.archive.conflicts[0].action, 'blocked-preserve-first-central-capture');
assert.equal(Object.values(conflict.archive.snapshots)[0].immutableFingerprint, firstEntry.immutableFingerprint);

const newerRecord = activeRecord({
  generatedAt: '2026-08-31T04:40:00.000Z',
  selectedAt: '2026-08-31T04:40:00.000Z',
  preRaceConditions: {
    ...activeRecord().preRaceConditions,
    sourceFetchedAt: '2026-08-31T04:39:00.000Z'
  }
});
const newer = monitor.capture({ date: '20260831', verificationPredictions: [newerRecord] }, conflict.archive, {
  dependencies: deps,
  now: '2026-08-31T04:41:00.000Z'
});
assert.equal(newer.diagnostics.capturedCount, 1);
assert.equal(newer.archive.snapshotCount, 2);

const resultsDir = resultDirectory([officialResult()]);
const settled = monitor.settle(newer.archive, null, {
  dependencies: deps,
  resultsDir,
  now: '2026-08-31T06:10:00.000Z'
});
assert.equal(settled.diagnostics.settledCount, 1);
assert.equal(settled.diagnostics.supersededSnapshotCount, 1);
assert.equal(settled.store.settlementCount, 1);
const row = settled.store.settlements['20260831-05-7'];
assert.equal(row.centralCaptureOrder, 'central-before-result');
assert.equal(row.centralCapturedAt, '2026-08-31T04:41:00.000Z');
assert.equal(row.centralComparisonEligible, true);
assert.equal(row.comparison.a.hit, false);
assert.equal(row.comparison.variants.cover.outcome.hit, true);
assert.equal(row.comparison.a.investmentYen, row.comparison.variants.cover.outcome.investmentYen);
assert.equal(row.productionChanged, false);
assert.equal(row.automaticApplication, false);

const settledAgain = monitor.settle(newer.archive, settled.store, {
  dependencies: deps,
  resultsDir,
  now: '2026-08-31T06:11:00.000Z'
});
assert.equal(settledAgain.diagnostics.preservedCount, 1);
assert.equal(settledAgain.diagnostics.revisedCount, 0);
assert.equal(settledAgain.store.settlements['20260831-05-7'].revision, 1);

const centralReport = monitor.report(newer.archive, settledAgain.store, {
  dependencies: deps,
  now: '2026-08-31T06:12:00.000Z'
});
assert.equal(centralReport.pipeline.immutableSnapshotCount, 2);
assert.equal(centralReport.pipeline.archivedRaceCount, 1);
assert.equal(centralReport.pipeline.eligibleSettlementCount, 1);
assert.equal(centralReport.decision.variants.cover.sampleCount, 1);
assert.equal(centralReport.decision.variants.cover.remainingToNextMilestone, 99);
assert.equal(centralReport.automaticApplication, false);
assert.equal(centralReport.humanApprovalRequired, true);
assert.equal(centralReport.safety.oddsUsedForTicketGenerationOrDeletion, false);

const correctedResultsDir = resultDirectory([officialResult(7, { payout: 1700 })]);
const corrected = monitor.settle(newer.archive, settledAgain.store, {
  dependencies: deps,
  resultsDir: correctedResultsDir,
  now: '2026-08-31T06:20:00.000Z'
});
assert.equal(corrected.diagnostics.revisedCount, 1);
assert.equal(corrected.store.settlements['20260831-05-7'].revision, 2);
assert.equal(corrected.store.settlements['20260831-05-7'].official.payoutPer100Yen, 1700);

const lateRecord = activeRecord({
  raceKey: '20260831-05-8',
  raceNo: 8,
  generatedAt: '2026-08-31T04:35:00.000Z',
  selectedAt: '2026-08-31T04:35:00.000Z',
  deadlineAt: '2026-08-31T05:05:00.000Z',
  preRaceConditions: {
    ...activeRecord().preRaceConditions,
    sourceFetchedAt: '2026-08-31T04:34:00.000Z'
  }
});
const lateCapture = monitor.capture({ date: '20260831', verificationPredictions: [lateRecord] }, null, {
  dependencies: deps,
  now: '2026-08-31T07:00:00.000Z'
});
const lateResultsDir = resultDirectory([officialResult(8)]);
const lateSettlement = monitor.settle(lateCapture.archive, null, {
  dependencies: deps,
  resultsDir: lateResultsDir,
  now: '2026-08-31T07:10:00.000Z'
});
assert.equal(lateSettlement.store.settlementCount, 0);
assert.equal(lateSettlement.diagnostics.missedPreResultCentralCaptureCount, 1);
assert.equal(lateSettlement.store.exclusions['20260831-05-8'].status, 'missed-pre-result-central-capture');

const tampered = JSON.parse(JSON.stringify(first.archive));
Object.values(tampered.snapshots)[0].snapshot.a.entries[0].ticket = '6-5-4';
const tamperedSettlement = monitor.settle(tampered, null, {
  dependencies: deps,
  resultsDir,
  now: '2026-08-31T06:10:00.000Z'
});
assert.equal(tamperedSettlement.store.settlementCount, 0);
assert.equal(tamperedSettlement.diagnostics.immutableConflictCount, 1);
assert.equal(tamperedSettlement.store.exclusions['20260831-05-7'].status, 'blocked-immutable-shadow-mismatch');

const badTiming = activeRecord({ selectedAt: '2026-08-31T05:00:00.000Z' });
const rejected = monitor.capture({ date: '20260831', verificationPredictions: [badTiming] }, null, {
  dependencies: deps,
  now: '2026-08-31T05:01:00.000Z'
});
assert.equal(rejected.archive.snapshotCount, 0);
assert.equal(rejected.diagnostics.excludedReasons['captured-at-or-after-deadline'], 1);

for (const directory of [resultsDir, correctedResultsDir, lateResultsDir]) {
  fs.rmSync(directory, { recursive: true, force: true });
}

console.log('outer attack ticket central monitor tests passed');
