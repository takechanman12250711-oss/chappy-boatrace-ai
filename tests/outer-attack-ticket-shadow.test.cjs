"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const shadow = require("../js/outer-attack-ticket-shadow.js");

function analysis(boatNo, overrides = {}) {
  const indexes = {
    raceFlow: 40,
    st: 40,
    exhibition: 40,
    local: 40,
    turn: 40,
    national: 40,
    motor: 40,
    ...(overrides.indexes || {})
  };
  const roleScores = {
    attack: 40,
    hold: 40,
    pickup: 40,
    ...(overrides.roleScores || {})
  };

  return {
    boatNo,
    indexes,
    roleScores,
    courseStructureTheory: {
      appliedIndex:
        overrides.courseIndex ?? 40
    }
  };
}

function activeRecord(overrides = {}) {
  const record = {
    raceKey: "20260831-05-7",
    generatedAt: "2026-08-31T04:30:00.000Z",
    formations: {
      main: [
        "1-2-4",
        "1-4-2"
      ],
      cover: [
        {
          ticket: "1-2-5",
          amountYen: 200
        },
        {
          ticket: "1-5-2",
          amountYen: 100
        }
      ],
      flow: [
        "1-2-6",
        "1-6-2"
      ],
      hole: [
        "2-1-5",
        "2-5-1"
      ]
    },
    practicalSelection: {
      frameRiseFallReplayBasis: {
        schemaVersion: 1,
        source:
          "pre-deadline-production-prediction",
        analyses: [
          analysis(1, {
            indexes: {
              raceFlow: 80,
              st: 50,
              exhibition: 50
            },
            roleScores: {
              attack: 50,
              hold: 40,
              pickup: 40
            },
            courseIndex: 90
          }),
          analysis(2),
          analysis(3, {
            indexes: {
              raceFlow: 60,
              st: 51,
              exhibition: 56
            },
            roleScores: {
              attack: 53,
              hold: 40,
              pickup: 40
            },
            courseIndex: 70
          }),
          analysis(4),
          analysis(5),
          analysis(6)
        ]
      }
    },
    evaluatedScenarioCandidates: {
      candidatePool: [
        {
          id: "candidate:1-3-5",
          ticket: "1-3-5",
          sourceCategory: "cover",
          candidateKind:
            "evaluation-coverage",
          evidenceQualified: true,
          purchaseEligible: false,
          priorityScore: 80
        },
        {
          id: "candidate:1-4-3",
          ticket: "1-4-3",
          sourceCategory: "safety",
          candidateKind:
            "independent-scenario",
          evidenceQualified: true,
          purchaseEligible: true,
          priorityScore: 5
        },
        {
          id: "candidate:1-5-3",
          ticket: "1-5-3",
          sourceCategory: "フォーメーション",
          candidateKind:
            "canonical-formation",
          evidenceQualified: true,
          purchaseEligible: false,
          priorityScore: 40
        },
        {
          id: "candidate:2-3-5",
          ticket: "2-3-5",
          sourceCategory: "穴候補",
          candidateKind:
            "evaluation-coverage",
          evidenceQualified: true,
          purchaseEligible: false,
          priorityScore: 30
        },
        {
          id: "candidate:2-3-6",
          ticket: "2-3-6",
          sourceCategory: "longshot",
          candidateKind:
            "independent-scenario",
          evidenceQualified: false,
          purchaseEligible: true,
          priorityScore: 999
        },
        {
          id: "candidate:3-1-5",
          ticket: "3-1-5",
          sourceCategory: "hole",
          candidateKind:
            "independent-scenario",
          evidenceQualified: true,
          purchaseEligible: true,
          priorityScore: 100
        }
      ]
    }
  };

  return {
    ...record,
    ...overrides
  };
}

function memoryRoot() {
  const values = new Map();

  return {
    localStorage: {
      getItem(key) {
        return values.has(key)
          ? values.get(key)
          : null;
      },
      setItem(key, value) {
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      }
    },
    ChappyStorage: {
      upsertPrediction(prediction) {
        return {
          ...JSON.parse(
            JSON.stringify(prediction)
          ),
          persisted: true
        };
      }
    }
  };
}

assert.equal(
  shadow.VERSION,
  "outer-attack-ticket-shadow-v1"
);
assert.deepEqual(
  shadow.BASELINE_PROFILE.weights,
  {
    raceFlow: 0.25,
    courseIndex: 0.24,
    roleAttack: 0.11,
    st: 0.1,
    exhibition: 0.09,
    roleHold: 0.08,
    rolePickup: 0.03,
    local: 0.05,
    turn: 0.025,
    national: 0.02,
    motor: 0.005
  }
);
assert.deepEqual(
  {
    st: shadow.FIXED_SIGNAL.stMinimum,
    roleAttack:
      shadow.FIXED_SIGNAL
        .roleAttackMinimum,
    exhibition:
      shadow.FIXED_SIGNAL
        .exhibitionMinimum
  },
  {
    st: 0,
    roleAttack: 0.25,
    exhibition: 0.5
  }
);

const record = activeRecord();
const recordBefore = JSON.stringify(record);
const snapshot = shadow.buildSnapshot(
  record,
  {
    now: "2026-08-31T04:31:00.000Z"
  }
);

assert.equal(
  JSON.stringify(record),
  recordBefore,
  "shadow生成で現行A入力を変更してはいけない"
);
assert.equal(snapshot.status, "shadow-only");
assert.equal(snapshot.productionChanged, false);
assert.equal(snapshot.automaticApplication, false);
assert.equal(snapshot.resultUsedForGeneration, false);
assert.equal(
  snapshot.retrospectiveBackfillAllowed,
  false
);
assert.equal(snapshot.signal.status, "active");
assert.equal(snapshot.signal.targetBoatNo, 3);
assert.equal(snapshot.signal.matchedBoatNos.length, 1);
assert.equal(snapshot.a.ticketCount, 8);
assert.equal(snapshot.a.uniqueTicketCount, 8);
assert.equal(snapshot.a.totalStakeYen, 900);
assert.equal(snapshot.a.inputUnchanged, true);
assert.equal(snapshot.readyVariantCount, 3);
assert.equal(
  snapshot.comparisonStatus,
  "awaiting-official-result"
);

const expectedReplacements = {
  cover: {
    fromTicket: "1-5-2",
    toTicket: "1-4-3",
    targetPosition: 3,
    carriedAmountYen: 100
  },
  flow: {
    fromTicket: "1-6-2",
    toTicket: "1-5-3",
    targetPosition: 3,
    carriedAmountYen: 100
  },
  hole: {
    fromTicket: "2-5-1",
    toTicket: "2-3-5",
    targetPosition: 2,
    carriedAmountYen: 100
  }
};

for (const [key, expected] of
  Object.entries(expectedReplacements)) {
  const variant = snapshot.variants[key];

  assert.equal(variant.status, "ready");
  assert.equal(
    variant.replacementPolicy,
    "category-tail-preserve-leading-order"
  );
  assert.equal(
    variant.replacement.fromTicket,
    expected.fromTicket
  );
  assert.equal(
    variant.replacement.toTicket,
    expected.toTicket
  );
  assert.equal(
    variant.replacement.targetPosition,
    expected.targetPosition
  );
  assert.equal(
    variant.replacement.carriedAmountYen,
    expected.carriedAmountYen
  );
  assert.equal(
    variant.b.ticketCount,
    snapshot.a.ticketCount
  );
  assert.equal(
    variant.b.totalStakeYen,
    snapshot.a.totalStakeYen
  );
  assert.deepEqual(
    variant.invariants,
    {
      sameTicketCount: true,
      sameStake: true,
      mainUnchanged: true,
      exactlyOneTicketReplaced: true,
      targetNotHead: true
    }
  );
}

assert.equal(
  snapshot.variants.cover
    .replacement.purchaseEligible,
  true,
  "候補順位は既存purchaseEligibleを最優先する"
);
assert.notEqual(
  snapshot.variants.hole
    .replacement.toTicket,
  "3-1-5",
  "外攻め艇を1着に置く候補は使用しない"
);
assert.notEqual(
  snapshot.variants.hole
    .replacement.toTicket,
  "2-3-6",
  "構造化根拠のない候補は高優先度でも使用しない"
);
assert.equal(
  snapshot.variants.hole
    .replacement.evidenceQualified,
  true
);


const practicalFallback = activeRecord({
  formations: {},
  practicalTickets: [
    { ticket: "1-2-4", category: "main", amountYen: 100 },
    { ticket: "1-4-2", category: "本線", amountYen: 100 },
    { ticket: "1-2-5", category: "cover", amountYen: 200 },
    { ticket: "1-5-2", category: "押さえ", amountYen: 100 },
    { ticket: "1-2-6", category: "flow", amountYen: 100 },
    { ticket: "1-6-2", category: "フォーメーション", amountYen: 100 },
    { ticket: "2-1-5", category: "hole", amountYen: 100 },
    { ticket: "2-5-1", category: "万舟・穴", amountYen: 100 }
  ]
});
const practicalFallbackSnapshot = shadow.buildSnapshot(
  practicalFallback,
  { now: "2026-08-31T04:31:30.000Z" }
);
assert.equal(
  practicalFallbackSnapshot.a.ticketCount,
  8,
  "formationsが空でも実戦買い目配列からAを固定する"
);
assert.equal(practicalFallbackSnapshot.a.totalStakeYen, 900);
assert.equal(practicalFallbackSnapshot.readyVariantCount, 3);

const comparison = shadow.compareOutcome(
  snapshot,
  {
    ticket: "1-4-3",
    payoutPer100Yen: 1500
  }
);
assert.equal(comparison.a.hit, false);
assert.equal(
  comparison.variants.cover.outcome.hit,
  true
);
assert.equal(
  comparison.variants.cover
    .outcome.investmentYen,
  comparison.a.investmentYen
);
assert.equal(
  comparison.variants.cover
    .outcome.returnYen,
  1500
);
assert.equal(
  comparison.variants.cover
    .outcome.profitYen,
  600
);
assert.equal(
  comparison.variants.cover
    .outcome.roiPercent,
  166.7
);

const inactiveRecord = activeRecord();
inactiveRecord.practicalSelection
  .frameRiseFallReplayBasis
  .analyses[2]
  .roleScores.attack = 52;
const inactive = shadow.buildSnapshot(
  inactiveRecord,
  {
    now: "2026-08-31T04:32:00.000Z"
  }
);
assert.equal(inactive.signal.status, "inactive");
assert.equal(inactive.readyVariantCount, 0);
for (const variant of
  Object.values(inactive.variants)) {
  assert.equal(
    variant.status,
    "signal-not-active"
  );
  assert.deepEqual(
    variant.b.entries,
    inactive.a.entries
  );
}

const ambiguousRecord = activeRecord();
ambiguousRecord.practicalSelection
  .frameRiseFallReplayBasis
  .analyses[3] = analysis(4, {
    indexes: {
      raceFlow: 60,
      st: 51,
      exhibition: 56
    },
    roleScores: {
      attack: 53,
      hold: 40,
      pickup: 40
    },
    courseIndex: 70
  });
const ambiguous = shadow.buildSnapshot(
  ambiguousRecord,
  {
    now: "2026-08-31T04:33:00.000Z"
  }
);
assert.equal(
  ambiguous.signal.status,
  "ambiguous-multiple-targets"
);
assert.deepEqual(
  ambiguous.signal.matchedBoatNos,
  [3, 4]
);
assert.equal(ambiguous.readyVariantCount, 0);

const noSourceRecord = activeRecord();
delete noSourceRecord.formations.flow;
const noSource = shadow.buildSnapshot(
  noSourceRecord,
  {
    now: "2026-08-31T04:34:00.000Z"
  }
);
assert.equal(
  noSource.variants.flow.status,
  "no-source-ticket"
);
assert.equal(
  noSource.variants.flow.b.ticketCount,
  noSource.a.ticketCount
);

const hookRoot = memoryRoot();
assert.equal(
  shadow.installStorageHook(hookRoot),
  true
);
assert.equal(
  shadow.installStorageHook(hookRoot),
  false,
  "storage hookは二重に装着しない"
);

const hookInput = activeRecord();
const hookInputBefore =
  JSON.stringify(hookInput);
const hookResult =
  hookRoot.ChappyStorage
    .upsertPrediction(hookInput);
assert.equal(
  JSON.stringify(hookInput),
  hookInputBefore,
  "storage hookで現行予想を変更してはいけない"
);
assert.equal(hookResult.persisted, true);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    hookResult,
    "outerAttackTicketShadow"
  ),
  false,
  "本番予想recordへshadowを混入させない"
);
let history = shadow.readHistory(hookRoot);
assert.equal(history.length, 1);
assert.equal(history[0].a.ticketCount, 8);
assert.equal(history[0].readyVariantCount, 3);

hookRoot.ChappyStorage
  .upsertPrediction(activeRecord());
history = shadow.readHistory(hookRoot);
assert.equal(
  history.length,
  1,
  "同一captureKeyは重複保存しない"
);

const changedSameCapture = activeRecord();
changedSameCapture.formations.cover[1] = {
  ticket: "1-6-5",
  amountYen: 100
};
hookRoot.ChappyStorage
  .upsertPrediction(changedSameCapture);
history = shadow.readHistory(hookRoot);
assert.equal(history.length, 1);
assert.equal(
  history[0].a.fingerprint,
  snapshot.a.fingerprint,
  "同一captureKeyのA買い目を後から書き換えない"
);

const inactiveHookInput = activeRecord({
  raceKey: "20260831-05-8",
  generatedAt:
    "2026-08-31T04:40:00.000Z"
});
inactiveHookInput.practicalSelection
  .frameRiseFallReplayBasis
  .analyses[2]
  .roleScores.attack = 52;
hookRoot.ChappyStorage
  .upsertPrediction(inactiveHookInput);
history = shadow.readHistory(hookRoot);
assert.equal(
  history.length,
  1,
  "固定外攻め信号がないレースは別履歴へ保存しない"
);

const loaderPath = path.join(
  __dirname,
  "..",
  "js",
  "app-runtime-loader.js"
);
if (fs.existsSync(loaderPath)) {
  const loader = fs.readFileSync(
    loaderPath,
    "utf8"
  );
  assert.match(
    loader,
    /"js\/storage\.js","js\/outer-attack-ticket-shadow\.js","js\/prediction-conditions\.js"/,
    "race runtimeはstorage直後にshadow hookを読む必要がある"
  );
}

console.log(
  "outer attack ticket shadow tests passed"
);
