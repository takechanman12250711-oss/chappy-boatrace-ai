"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const shadow = require("../js/outer-attack-ticket-shadow.js");

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
    raceKey: "20260831-05-7",
    generatedAt: "2026-08-31T04:30:00.000Z",
    formations: {
      main: ["1-2-4", "1-4-2"],
      cover: [
        { ticket: "1-2-5", amountYen: 200 },
        { ticket: "1-5-2", amountYen: 100 }
      ],
      flow: ["1-2-6", "1-6-2"],
      hole: ["2-1-5", "2-5-1"]
    },
    practicalSelection: {
      frameRiseFallReplayBasis: {
        source: "pre-deadline-production-prediction",
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
        { id: "cover-high", ticket: "1-3-5", sourceCategory: "cover", evidenceQualified: true, purchaseEligible: false, priorityScore: 80 },
        { id: "cover-buy", ticket: "1-4-3", sourceCategory: "safety", evidenceQualified: true, purchaseEligible: true, priorityScore: 5 },
        { id: "flow", ticket: "1-5-3", sourceCategory: "フォーメーション", evidenceQualified: true, purchaseEligible: false, priorityScore: 40 },
        { id: "hole", ticket: "2-3-5", sourceCategory: "穴候補", evidenceQualified: true, purchaseEligible: false, priorityScore: 30 },
        { id: "no-evidence", ticket: "2-3-6", sourceCategory: "longshot", evidenceQualified: false, purchaseEligible: true, priorityScore: 999 },
        { id: "head", ticket: "3-1-5", sourceCategory: "hole", evidenceQualified: true, purchaseEligible: true, priorityScore: 100 }
      ]
    }
  };
  return { ...record, ...overrides };
}

function memoryRoot() {
  const values = new Map();
  return {
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value))
    },
    ChappyStorage: {
      upsertPrediction(prediction) {
        return { ...JSON.parse(JSON.stringify(prediction)), persisted: true };
      }
    }
  };
}

assert.equal(shadow.VERSION, "outer-attack-ticket-shadow-v1");
assert.deepEqual(shadow.BASELINE_PROFILE.weights, {
  raceFlow: 0.25, courseIndex: 0.24, roleAttack: 0.11, st: 0.1,
  exhibition: 0.09, roleHold: 0.08, rolePickup: 0.03, local: 0.05,
  turn: 0.025, national: 0.02, motor: 0.005
});
assert.deepEqual(
  [shadow.FIXED_SIGNAL.stMinimum, shadow.FIXED_SIGNAL.roleAttackMinimum, shadow.FIXED_SIGNAL.exhibitionMinimum],
  [0, 0.25, 0.5]
);

const record = activeRecord();
const before = JSON.stringify(record);
const snapshot = shadow.buildSnapshot(record, { now: "2026-08-31T04:31:00.000Z" });
assert.equal(JSON.stringify(record), before, "A入力を変更しない");
assert.equal(snapshot.productionChanged, false);
assert.equal(snapshot.automaticApplication, false);
assert.equal(snapshot.resultUsedForGeneration, false);
assert.equal(snapshot.retrospectiveBackfillAllowed, false);
assert.equal(snapshot.signal.status, "active");
assert.equal(snapshot.signal.targetBoatNo, 3);
assert.deepEqual(
  [snapshot.a.ticketCount, snapshot.a.uniqueTicketCount, snapshot.a.totalStakeYen, snapshot.readyVariantCount],
  [8, 8, 900, 3]
);

const expected = {
  cover: ["1-5-2", "1-4-3", 3],
  flow: ["1-6-2", "1-5-3", 3],
  hole: ["2-5-1", "2-3-5", 2]
};
for (const [key, [from, to, position]] of Object.entries(expected)) {
  const variant = snapshot.variants[key];
  assert.equal(variant.status, "ready");
  assert.deepEqual(
    [variant.replacement.fromTicket, variant.replacement.toTicket, variant.replacement.targetPosition],
    [from, to, position]
  );
  assert.deepEqual(
    [variant.b.ticketCount, variant.b.totalStakeYen],
    [8, 900]
  );
  assert.deepEqual(variant.invariants, {
    sameTicketCount: true,
    sameStake: true,
    mainUnchanged: true,
    exactlyOneTicketReplaced: true,
    targetNotHead: true
  });
}
assert.equal(snapshot.variants.cover.replacement.purchaseEligible, true);
assert.notEqual(snapshot.variants.hole.replacement.toTicket, "3-1-5");
assert.notEqual(snapshot.variants.hole.replacement.toTicket, "2-3-6");

const fallback = activeRecord({
  formations: {},
  practicalTickets: [
    ["1-2-4", "main", 100], ["1-4-2", "本線", 100],
    ["1-2-5", "cover", 200], ["1-5-2", "押さえ", 100],
    ["1-2-6", "flow", 100], ["1-6-2", "フォーメーション", 100],
    ["2-1-5", "hole", 100], ["2-5-1", "万舟・穴", 100]
  ].map(([ticket, category, amountYen]) => ({ ticket, category, amountYen }))
});
const fallbackSnapshot = shadow.buildSnapshot(fallback);
assert.deepEqual(
  [fallbackSnapshot.a.ticketCount, fallbackSnapshot.a.totalStakeYen, fallbackSnapshot.readyVariantCount],
  [8, 900, 3]
);

const comparison = shadow.compareOutcome(snapshot, { ticket: "1-4-3", payoutPer100Yen: 1500 });
assert.equal(comparison.a.hit, false);
assert.deepEqual(
  [comparison.variants.cover.outcome.hit, comparison.variants.cover.outcome.investmentYen, comparison.variants.cover.outcome.returnYen, comparison.variants.cover.outcome.profitYen, comparison.variants.cover.outcome.roiPercent],
  [true, 900, 1500, 600, 166.7]
);

const inactiveRecord = activeRecord();
inactiveRecord.practicalSelection.frameRiseFallReplayBasis.analyses[2].roleScores.attack = 52;
assert.equal(shadow.buildSnapshot(inactiveRecord).signal.status, "inactive");

const ambiguousRecord = activeRecord();
ambiguousRecord.practicalSelection.frameRiseFallReplayBasis.analyses[3] = analysis(4, {
  indexes: { raceFlow: 60, st: 51, exhibition: 56 },
  roleScores: { attack: 53 },
  courseIndex: 70
});
const ambiguous = shadow.buildSnapshot(ambiguousRecord);
assert.equal(ambiguous.signal.status, "ambiguous-multiple-targets");
assert.equal(ambiguous.readyVariantCount, 0);

const noSourceRecord = activeRecord();
delete noSourceRecord.formations.flow;
assert.equal(shadow.buildSnapshot(noSourceRecord).variants.flow.status, "no-source-ticket");

const root = memoryRoot();
assert.equal(shadow.installStorageHook(root), true);
assert.equal(shadow.installStorageHook(root), false);
const hookInput = activeRecord();
const hookBefore = JSON.stringify(hookInput);
const saved = root.ChappyStorage.upsertPrediction(hookInput);
assert.equal(JSON.stringify(hookInput), hookBefore);
assert.equal(saved.persisted, true);
assert.equal(Object.hasOwn(saved, "outerAttackTicketShadow"), false);
assert.equal(shadow.readHistory(root).length, 1);
root.ChappyStorage.upsertPrediction(activeRecord());
assert.equal(shadow.readHistory(root).length, 1);
const changed = activeRecord();
changed.formations.cover[1] = { ticket: "1-6-5", amountYen: 100 };
root.ChappyStorage.upsertPrediction(changed);
assert.equal(shadow.readHistory(root)[0].a.fingerprint, snapshot.a.fingerprint);
const inactiveStored = activeRecord({ raceKey: "20260831-05-8", generatedAt: "2026-08-31T04:40:00.000Z" });
inactiveStored.practicalSelection.frameRiseFallReplayBasis.analyses[2].roleScores.attack = 52;
root.ChappyStorage.upsertPrediction(inactiveStored);
assert.equal(shadow.readHistory(root).length, 1);

const loader = fs.readFileSync(path.join(__dirname, "..", "js", "app-runtime-loader.js"), "utf8");
assert.equal(
  loader.includes('groups={race:["js/utils.js","js/storage.js","js/prediction-conditions.js","js/prediction-runtime-loader.js","js/script.js","js/hiyori-runtime-loader.js"]'),
  true,
  "既存race起動契約を維持する"
);
assert.match(
  loader,
  /groups\.race\.splice\(2,0,"js\/outer-attack-ticket-shadow\.js"\)/,
  "storage直後にshadow hookを挿入する"
);

console.log("outer attack ticket shadow tests passed");
