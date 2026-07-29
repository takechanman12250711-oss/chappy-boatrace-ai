"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const calibration = require("../js/prediction-calibration");
const {
  MAX_CALIBRATION_BYTES,
  calibrationByteSize,
  assertCalibrationSize,
  collectPredictionRecords,
  buildFromDirectory,
  assertModeSeparatedCalibration,
  preserveGeneratedAtWhenUnchanged
} = require("./build-prediction-calibration");

const GENERATION_A = {
  logicFingerprint: "logic-a",
  confidenceDefinitionVersion: "score-v1",
  ticketPolicyVersion: "ticket-v1"
};
const GENERATION_B = {
  logicFingerprint: "logic-b",
  confidenceDefinitionVersion: "score-v1",
  ticketPolicyVersion: "ticket-v1"
};

function record({
  raceKey,
  score,
  matched,
  generation = GENERATION_A,
  mode = "main",
  roleSchemaVersion = 1,
  settled = true,
  scenarioStatus,
  ...extra
}) {
  return {
    raceKey,
    date: "20260729",
    jcd: "03",
    raceNo: Number(String(raceKey || "").split("-").at(-1) || 1),
    selectedAt: "2026-07-29T03:50:00.000Z",
    deadlineAt: "2026-07-29T04:00:00.000Z",
    verificationMode: "selected",
    selection: {
      ready: true,
      selected: true,
      status: "ready"
    },
    prediction: {
      predictionMode:
        "server_pre_deadline",
      internalEvaluation: {
        mode,
        label: "AI評価",
        score,
        probability: false
      },
      verificationEvidence: {
        roleSchemaVersion,
        generation
      }
    },
    result: {
      settled,
      verification: {
        scenarioVerification: {
          status:
            scenarioStatus ||
            (matched ? "matched" : "missed")
        }
      }
    },
    ...extra
  };
}

assert.equal(calibration.SCORE_BANDS.length, 10);
assert.equal(calibration.scoreBandFor(0).key, "0-9");
assert.equal(calibration.scoreBandFor(79).key, "70-79");
assert.equal(calibration.scoreBandFor(89.9).key, "80-89");
assert.equal(calibration.scoreBandFor(100).key, "90-100");
assert.equal(calibration.scoreBandFor(-10).key, "0-9");
assert.equal(calibration.scoreBandFor(110).key, "90-100");
assert.equal(calibration.scoreBandFor(null), null);
assert.equal(calibration.normalizeMode("MAIN"), "main");
assert.equal(calibration.normalizeMode("chaos"), "chaos");
assert.equal(calibration.normalizeMode("unknown"), "");

assert.equal(calibration.sampleGate(29).status, "collecting");
assert.equal(calibration.sampleGate(30).status, "reference");
assert.equal(calibration.sampleGate(49).status, "reference");
assert.equal(calibration.sampleGate(50).status, "trend");
assert.equal(calibration.sampleGate(99).status, "trend");
assert.equal(calibration.sampleGate(100).status, "ready");
assert.equal(calibration.wilsonInterval(0, 0), null);
assert.deepEqual(
  calibration.wilsonInterval(50, 100),
  {
    low: 40.4,
    high: 59.6,
    confidenceLevel: 95,
    unit: "percent"
  }
);
assert.equal(
  preserveGeneratedAtWhenUnchanged(
    path.join(
      os.tmpdir(),
      "missing-calibration.json"
    ),
    {
      generatedAt:
        "2026-07-29T00:00:00.000Z",
      generations: []
    }
  ).generatedAt,
  "2026-07-29T00:00:00.000Z"
);

const flagConfirmed = record({
  raceKey: "flag-confirmed",
  score: 75,
  matched: true,
  selectedAt: "",
  deadlineAt: "",
  timing: {
    beforeDeadline: true
  }
});
assert.equal(
  calibration.assessRecord(flagConfirmed).eligible,
  true,
  "信頼できる締切前フラグを時刻の代わりに使える"
);

const unknownTiming = record({
  raceKey: "unknown-timing",
  score: 75,
  matched: true,
  selectedAt: "",
  deadlineAt: ""
});
assert.equal(
  calibration.assessRecord(unknownTiming).reason,
  "preDeadlineUnconfirmed",
  "時刻も明示フラグもなければ校正対象にしない"
);

const legacyConfidenceOnly = record({
  raceKey: "confidence-only",
  score: 75,
  matched: true
});
delete legacyConfidenceOnly.prediction.internalEvaluation;
legacyConfidenceOnly.prediction.confidence = {
  score: 99
};
assert.equal(
  calibration.assessRecord(legacyConfidenceOnly).reason,
  "missingScore",
  "旧confidenceを内部評価点へ読み替えない"
);

const missingMode = record({
  raceKey: "missing-mode",
  score: 75,
  matched: true
});
delete missingMode.prediction.internalEvaluation.mode;
assert.equal(
  calibration.assessRecord(missingMode).reason,
  "missingMode",
  "評価mode不明は校正対象にしない"
);

assert.equal(
  calibration.assessRecord(
    record({
      raceKey: "chaos-not-calibrated",
      score: 75,
      matched: true,
      mode: "chaos"
    })
  ).reason,
  "unsupportedMode",
  "波乱入口を主シナリオ成立率で校正しない"
);

const retrospectiveRecord = record({
  raceKey: "retrospective-record",
  score: 75,
  matched: true,
  isRetrospective: true
});
const retrospectivePrediction = record({
  raceKey: "retrospective-prediction",
  score: 75,
  matched: true
});
retrospectivePrediction
  .prediction
  .isRetrospective = true;
const retrospectiveModeRecord = record({
  raceKey: "retrospective-mode-record",
  score: 75,
  matched: true,
  predictionMode:
    "retrospective_reference"
});
const retrospectiveModePrediction = record({
  raceKey: "retrospective-mode-prediction",
  score: 75,
  matched: true
});
retrospectiveModePrediction
  .prediction
  .predictionMode =
  "retrospective_reference";
const officialConditionRecord = record({
  raceKey: "official-condition-record",
  score: 75,
  matched: true,
  preRaceConditions: {
    officialResultUsed: true
  }
});
const officialConditionPrediction = record({
  raceKey: "official-condition-prediction",
  score: 75,
  matched: true
});
officialConditionPrediction
  .prediction
  .preRaceConditions = {
    officialResultUsed: true
  };
const retrospectiveFixtures = [
  retrospectiveRecord,
  retrospectivePrediction,
  retrospectiveModeRecord,
  retrospectiveModePrediction
];
const officialConditionFixtures = [
  officialConditionRecord,
  officialConditionPrediction
];

retrospectiveFixtures.forEach(item => {
  assert.equal(
    calibration.assessRecord(item).reason,
    "retrospectiveReference",
    "振り返り予想を校正対象にしない"
  );
});
officialConditionFixtures.forEach(item => {
  assert.equal(
    calibration.assessRecord(item).reason,
    "officialResultLeakage",
    "事前条件へ公式結果を使用した予想を校正対象にしない"
  );
});

const incompleteReadyFalse = record({
  raceKey: "incomplete-ready-false",
  score: 75,
  matched: true
});
incompleteReadyFalse.selection.ready = false;
const incompleteReadyUnknown = record({
  raceKey: "incomplete-ready-unknown",
  score: 75,
  matched: true
});
delete incompleteReadyUnknown.selection.ready;
const provisionalSelection = record({
  raceKey: "provisional-selection",
  score: 75,
  matched: true
});
provisionalSelection.selection.status =
  "provisional";
const shadowVerification = record({
  raceKey: "shadow-verification",
  score: 75,
  matched: true,
  verificationMode: "shadow"
});
const shadowPrediction = record({
  raceKey: "shadow-prediction",
  score: 75,
  matched: true
});
shadowPrediction.prediction.predictionMode =
  "server_pre_deadline_shadow";
const incompleteFixtures = [
  incompleteReadyFalse,
  incompleteReadyUnknown,
  provisionalSelection
];
const nonSelectedFixtures = [
  shadowVerification,
  shadowPrediction
];

incompleteFixtures.forEach(item => {
  assert.equal(
    calibration.assessRecord(item).reason,
    "incompleteInput",
    "未完成またはreadiness不明の入力を校正対象にしない"
  );
});
nonSelectedFixtures.forEach(item => {
  assert.equal(
    calibration.assessRecord(item).reason,
    "nonSelectedPrediction",
    "shadow予想を完成入力予想へ混ぜない"
  );
});

const records = [];
for (let index = 0; index < 30; index += 1) {
  records.push(
    record({
      raceKey: `20260729-03-${index + 1}`,
      score: 75,
      matched: index < 12
    })
  );
}
records.push(
  record({
    raceKey: "20260729-03-1",
    score: 75,
    matched: false
  })
);
for (let index = 0; index < 50; index += 1) {
  records.push(
    record({
      raceKey: `20260730-04-${index + 1}`,
      score: 85,
      matched: index < 25,
      generation: GENERATION_B
    })
  );
}
for (let index = 0; index < 30; index += 1) {
  records.push(
    record({
      raceKey: `20260731-05-${index + 1}`,
      score: 75,
      matched: index < 24,
      mode: "chaos"
    })
  );
}
records.push(
  record({
    raceKey: "legacy-race",
    score: 95,
    matched: true,
    roleSchemaVersion: 0
  }),
  record({
    raceKey: "unsettled-race",
    score: 95,
    matched: true,
    settled: false
  }),
  record({
    raceKey: "not-comparable",
    score: 95,
    matched: false,
    scenarioStatus: "not_comparable"
  }),
  record({
    raceKey: "leaked-race",
    score: 95,
    matched: true,
    officialResultUsedForEvaluation: true
  }),
  record({
    raceKey: "prediction-leaked-race",
    score: 95,
    matched: true,
    officialResultUsedForPrediction: true
  }),
  record({
    raceKey: "post-deadline",
    score: 95,
    matched: true,
    selectedAt: "2026-07-29T04:01:00.000Z",
    deadlineAt: "2026-07-29T04:00:00.000Z"
  })
);
const nestedPredictionLeak = record({
  raceKey: "nested-prediction-leak",
  score: 95,
  matched: true
});
nestedPredictionLeak.prediction.officialResultUsedForPrediction = true;
records.push(nestedPredictionLeak);
records.push(missingMode);
records.push(
  ...retrospectiveFixtures,
  ...officialConditionFixtures,
  ...incompleteFixtures,
  ...nonSelectedFixtures
);

const built = calibration.buildCalibration(records, {
  activeGeneration: GENERATION_A,
  generatedAt: "2026-07-29T00:00:00.000Z",
  fileCount: 2
});
const builtB = calibration.buildCalibration(records, {
  activeGeneration: GENERATION_B,
  generatedAt: "2026-07-29T00:00:00.000Z",
  fileCount: 2
});
const keyA = calibration.generationKey(GENERATION_A);
const keyB = calibration.generationKey(GENERATION_B);
const cohortA = built.generations.find(item => item.key === keyA);
const cohortB = builtB.generations.find(item => item.key === keyB);
const mainA = cohortA.modes.find(item => item.mode === "main");
const chaosA = cohortA.modes.find(item => item.mode === "chaos");
const mainB = cohortB.modes.find(item => item.mode === "main");
const bandA = mainA.bands.find(item => item.key === "70-79");
const chaosBandA = chaosA.bands.find(item => item.key === "70-79");
const bandB = mainB.bands.find(item => item.key === "80-89");

assert.equal(built.schemaVersion, 1);
assert.equal(built.target, "structured-main-scenario-v1");
assert.deepEqual(
  built.cohortDimensions,
  [
    "selectionCohort",
    "generation",
    "mode",
    "scoreBand"
  ]
);
assert.equal(
  built.selectionCohort.key,
  "auto-selected-complete-v1"
);
assert.equal(
  built.selectionCohort.metricLabel,
  "同点数帯における本線展開一致率"
);
assert.equal(
  assertModeSeparatedCalibration(
    built
  ),
  built
);
assert.throws(
  () =>
    assertModeSeparatedCalibration({
      ...built,
      generations:
        built.generations.map(
          generation => ({
            ...generation,
            modes: []
          })
        )
    }),
  /generation・mode・scoreBand/
);
assert.equal(built.activeGenerationKey, keyA);
assert.equal(
  built.generations.length,
  1,
  "配信JSONはactive世代だけを保持する"
);
assert.equal(
  built.generations.some(
    item => item.key === keyB
  ),
  false,
  "別世代のbandを配信JSONへ混ぜない"
);
assert.ok(
  calibrationByteSize(built) <=
    MAX_CALIBRATION_BYTES,
  "2世代入力でも配信JSONを10KB以内に保つ"
);
assert.equal(
  assertCalibrationSize(built),
  built
);
assert.throws(
  () =>
    assertCalibrationSize({
      ...built,
      oversized:
        "x".repeat(
          MAX_CALIBRATION_BYTES
        )
    }),
  /配信上限を超えました/
);
assert.equal(built.source.fileCount, 2);
assert.equal(built.source.recordCount, 130);
assert.equal(built.source.eligibleRecordCount, 30);
assert.equal(built.source.excluded.duplicateRace, 1);
assert.equal(built.source.excluded.legacySchema, 1);
assert.equal(built.source.excluded.notSettled, 1);
assert.equal(built.source.excluded.scenarioNotComparable, 1);
assert.equal(built.source.excluded.retrospectiveReference, 4);
assert.equal(built.source.excluded.officialResultLeakage, 5);
assert.equal(built.source.excluded.nonSelectedPrediction, 2);
assert.equal(built.source.excluded.incompleteInput, 3);
assert.equal(built.source.excluded.preDeadlineUnconfirmed, 1);
assert.equal(built.source.excluded.missingMode, 1);
assert.equal(built.source.excluded.unsupportedMode, 30);
assert.equal(built.source.excluded.nonActiveGeneration, 50);
assert.equal(cohortA.sampleSize, 30);
assert.equal(cohortB.sampleSize, 50);
assert.equal(mainA.sampleSize, 30);
assert.equal(chaosA.sampleSize, 0);
assert.equal(bandA.status, "reference");
assert.equal(bandA.sampleSize, 30);
assert.equal(bandA.hitCount, 12);
assert.equal(bandA.rate, 40);
assert.ok(bandA.interval.low < 40);
assert.ok(bandA.interval.high > 40);
assert.equal(chaosBandA.status, "collecting");
assert.equal(chaosBandA.sampleSize, 0);
assert.equal(chaosBandA.hitCount, 0);
assert.equal(chaosBandA.rate, null);
assert.equal(bandB.status, "trend");
assert.equal(bandB.sampleSize, 50);
assert.equal(bandB.rate, 50);

const referenceDisplay = calibration.displayFor({
  score: 75,
  generation: GENERATION_A,
  mode: "main",
  calibration: built
});
assert.equal(referenceDisplay.status, "reference");
assert.equal(referenceDisplay.sampleSize, 30);
assert.equal(referenceDisplay.rate, 40);
assert.equal(referenceDisplay.generationKey, keyA);
assert.equal(
  referenceDisplay.cohortKey,
  "auto-selected-complete-v1"
);
assert.match(
  referenceDisplay.message,
  /自動厳選・完成入力の同点数帯における本線展開一致率（参考成立率） 40%/
);
assert.match(
  referenceDisplay.message,
  /任意レースの的中確率ではありません/
);

const chaosReferenceDisplay = calibration.displayFor({
  score: 75,
  generation: GENERATION_A,
  mode: "chaos",
  calibration: built
});
assert.equal(chaosReferenceDisplay.status, "unavailable");
assert.equal(chaosReferenceDisplay.sampleSize, 0);
assert.equal(chaosReferenceDisplay.rate, null);
assert.equal(chaosReferenceDisplay.interval, null);
assert.equal(chaosReferenceDisplay.mode, "chaos");
assert.match(
  chaosReferenceDisplay.message,
  /定義整備中/
);
assert.doesNotMatch(
  chaosReferenceDisplay.message,
  /成立率\s+\d/
);

const trendDisplay = calibration.displayFor({
  score: 85,
  generation: GENERATION_B,
  mode: "main",
  calibration: builtB
});
assert.equal(trendDisplay.status, "trend");
assert.equal(trendDisplay.sampleSize, 50);
assert.equal(trendDisplay.rate, 50);

const collectingDisplay = calibration.displayFor({
  score: 95,
  generation: GENERATION_A,
  mode: "main",
  calibration: built
});
assert.equal(collectingDisplay.status, "collecting");
assert.equal(collectingDisplay.sampleSize, 0);
assert.equal(collectingDisplay.rate, null);
assert.equal(collectingDisplay.interval, null);

const unknownGenerationDisplay = calibration.displayFor({
  score: 75,
  generation: {
    logicFingerprint: "unknown",
    confidenceDefinitionVersion: "score-v1",
    ticketPolicyVersion: "ticket-v1"
  },
  mode: "main",
  calibration: built
});
assert.equal(unknownGenerationDisplay.status, "collecting");
assert.equal(unknownGenerationDisplay.sampleSize, 0);
assert.equal(unknownGenerationDisplay.rate, null);

const missingGenerationDisplay = calibration.displayFor({
  score: 75,
  generation: {},
  mode: "main",
  calibration: built
});
assert.equal(
  missingGenerationDisplay.status,
  "collecting"
);
assert.equal(
  missingGenerationDisplay.sampleSize,
  0,
  "世代不明の旧予想をactive世代へフォールバックしない"
);
assert.equal(
  missingGenerationDisplay.generationKey,
  ""
);

const missingModeDisplay = calibration.displayFor({
  score: 75,
  generation: GENERATION_A,
  calibration: built
});
assert.equal(missingModeDisplay.status, "collecting");
assert.equal(missingModeDisplay.sampleSize, 0);
assert.equal(missingModeDisplay.rate, null);
assert.equal(missingModeDisplay.mode, "");

const retrospectiveDisplay = calibration.displayFor({
  score: 75,
  generation: GENERATION_A,
  mode: "main",
  isRetrospective: true,
  calibration: built
});
assert.equal(
  retrospectiveDisplay.status,
  "unavailable"
);
assert.equal(retrospectiveDisplay.rate, null);
assert.match(
  retrospectiveDisplay.message,
  /振り返り予想のため校正対象外/
);
assert.equal(
  calibration.displayFor({
    score: 75,
    generation: GENERATION_A,
    mode: "main",
    predictionMode:
      "retrospective_reference",
    calibration: built
  }).status,
  "unavailable"
);

assert.throws(
  () =>
    calibration.setData({
      ...built,
      cohortDimensions: [
        "generation",
        "scoreBand"
      ]
    }),
  /校正JSONの形式が正しくありません/,
  "mode軸のない旧校正JSONを読み込まない"
);

calibration.setData(built);
const copied = calibration.getData();
copied.generations[0].sampleSize = 9999;
assert.notEqual(calibration.getData().generations[0].sampleSize, 9999);

let fetchCount = 0;
const loaded = calibration.load("memory://calibration", {
  force: true,
  fetchImpl: async url => {
    fetchCount += 1;
    assert.equal(url, "memory://calibration");
    return {
      ok: true,
      async json() {
        return built;
      }
    };
  }
});

loaded
  .then(async data => {
    assert.equal(data.source.eligibleRecordCount, 30);
    await calibration.load("memory://calibration", {
      fetchImpl: async () => {
        fetchCount += 1;
        return { ok: true, json: async () => built };
      }
    });
    assert.equal(fetchCount, 1, "同じURLの軽量JSONは再取得しない");

    const hadWindow =
      Object.hasOwn(global, "window");
    const hadCustomEvent =
      Object.hasOwn(
        global,
        "CustomEvent"
      );
    const originalWindow =
      global.window;
    const originalCustomEvent =
      global.CustomEvent;
    const calibrationEvents = [];
    global.window = {
      dispatchEvent(event) {
        calibrationEvents.push(
          event.type
        );
      }
    };
    global.CustomEvent = class {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    };
    try {
      await assert.rejects(
        calibration.load("memory://missing", {
          force: true,
          fetchImpl: async () => ({
            ok: false,
            status: 404
          })
        }),
        /校正JSONを取得できません/
      );
    } finally {
      if (hadWindow) {
        global.window =
          originalWindow;
      } else {
        delete global.window;
      }
      if (hadCustomEvent) {
        global.CustomEvent =
          originalCustomEvent;
      } else {
        delete global.CustomEvent;
      }
    }
    assert.equal(calibration.getData(), null);
    assert.equal(
      calibration.getState().status,
      "unavailable"
    );
    assert.ok(
      calibrationEvents.includes(
        "chappy:prediction-calibration-unavailable"
      )
    );
    assert.ok(
      calibrationEvents.includes(
        "chappy:prediction-calibration-state"
      )
    );
    const unavailableDisplay =
      calibration.displayFor({
        score: 75,
        generation: GENERATION_A,
        mode: "main"
      });
    assert.equal(
      unavailableDisplay.status,
      "unavailable",
      "取得失敗を0件の収集中と表示しない"
    );
    assert.match(
      unavailableDisplay.message,
      /実績校正データを取得できません/
    );

    const temporaryDirectory = fs.mkdtempSync(
      path.join(os.tmpdir(), "prediction-calibration-")
    );
    try {
      fs.writeFileSync(
        path.join(temporaryDirectory, "20260729.json"),
        JSON.stringify({
          predictions: [records[0]],
          verificationPredictions: [records[1]]
        }),
        "utf8"
      );
      fs.writeFileSync(
        path.join(temporaryDirectory, "index.json"),
        JSON.stringify({ verificationPredictions: records }),
        "utf8"
      );

      const collected = collectPredictionRecords(temporaryDirectory);
      assert.deepEqual(collected.files, ["20260729.json"]);
      assert.equal(collected.records.length, 2);

      const outputPath = path.join(
        temporaryDirectory,
        "calibration.json"
      );
      const directoryBuild = buildFromDirectory({
        inputDirectory: temporaryDirectory,
        outputPath,
        activeGeneration: GENERATION_A,
        generatedAt: "2026-07-29T00:00:00.000Z"
      });
      const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
      assert.equal(directoryBuild.result.source.fileCount, 1);
      assert.equal(output.source.recordCount, 2);
      assert.equal(output.source.eligibleRecordCount, 2);
      assert.ok(
        fs.statSync(outputPath).size <=
          MAX_CALIBRATION_BYTES
      );
      const repeatedBuild =
        buildFromDirectory({
          inputDirectory:
            temporaryDirectory,
          outputPath,
          activeGeneration:
            GENERATION_A,
          generatedAt:
            "2026-07-30T00:00:00.000Z"
        });
      assert.equal(
        repeatedBuild.result
          .generatedAt,
        "2026-07-29T00:00:00.000Z",
        "校正内容が同じなら生成時刻だけでファイルを更新しない"
      );
    } finally {
      fs.rmSync(temporaryDirectory, {
        recursive: true,
        force: true
      });
    }

    console.log("AI評価実績校正テスト: 合格");
  })
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
