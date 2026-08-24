"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const theoryInput = require(
  "../js/theory-input"
);
const {
  MIN_SCORE,
  loadOptionalV2Dependency,
  safeFingerprintFiles,
  buildCollectionHealth,
  buildRecoveryPlan,
  insufficientReasons,
  compactStoredVerification,
  attachVenueRaceHistory,
  attachShadowReferenceHistory,
  safelyBuildShadowV2,
  safelyUpsertShadowSnapshots,
  captureStoredConditions,
  selectedRaceKeyFor,
  scoreBandForSelection,
  buildActiveV2Selection,
  buildActiveV2Comparison,
  applySelectedRaceKey,
  buildStoredPrediction,
  detachShadowV2,
  upsertByRaceKey,
  saveRun
} = require("./collect-predictions");

const charter = require(
  "../config/chappy-charter.json"
);
const collectorSource = fs.readFileSync(
  path.join(__dirname, "collect-predictions.js"),
  "utf8"
);
assert.match(
  collectorSource,
  /const practicalPriorityShadow\s*=\s*\n?\s*loadOptionalV2Dependency\(/,
  "順位候補シャドー評価器の読込失敗で本番収集を止めない"
);
assert.match(
  collectorSource,
  /const practicalPriorityShadowReport\s*=\s*\n?\s*loadOptionalV2Dependency\(/,
  "順位候補固定契約の読込失敗で本番収集を止めない"
);

assert.equal(
  MIN_SCORE,
  charter.shadowSelectionV2.selectionThreshold,
  "自動選定基準は憲章設定を正本にする"
);
assert.equal(MIN_SCORE, 60);

const belowThresholdSelection =
  buildActiveV2Selection({
    status: "ready",
    calibrationEligible: true,
    evaluation: { totalScore: 59.9 }
  }, {});
const exactThresholdSelection =
  buildActiveV2Selection({
    status: "ready",
    calibrationEligible: true,
    evaluation: { totalScore: 60 }
  }, {});
const upperSixtiesSelection =
  buildActiveV2Selection({
    status: "ready",
    calibrationEligible: true,
    evaluation: { totalScore: 69.9 }
  }, {});

assert.equal(
  belowThresholdSelection.qualified,
  false,
  "59.9点は自動選定しない"
);
assert.equal(
  exactThresholdSelection.qualified,
  true,
  "60.0点は自動選定する"
);
assert.equal(
  upperSixtiesSelection.qualified,
  true,
  "69.9点も自動選定する"
);
assert.equal(
  exactThresholdSelection.threshold,
  60,
  "保存する判定基準も60点に統一する"
);
assert.equal(
  scoreBandForSelection(
    belowThresholdSelection
  ),
  "under_60"
);
assert.equal(
  scoreBandForSelection(
    exactThresholdSelection
  ),
  "60_69"
);
assert.equal(
  scoreBandForSelection(
    upperSixtiesSelection
  ),
  "60_69"
);
assert.equal(
  scoreBandForSelection({
    ready: true,
    score: 70
  }),
  "70_plus"
);
assert.equal(
  scoreBandForSelection({
    ready: false,
    score: 99
  }),
  "not_ready"
);
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    {
      raceKey: "20260726-12-6",
      selection: belowThresholdSelection
    }
  ),
  ""
);
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    {
      raceKey: "20260726-12-7",
      selection: exactThresholdSelection
    }
  ),
  "20260726-12-7"
);
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    {
      raceKey: "20260726-12-8",
      selection: upperSixtiesSelection
    }
  ),
  "20260726-12-8"
);

const provenanceConditions =
  captureStoredConditions(
    {
      rawRaceData: {
        source: "boatrace-official",
        fetchedAt: "2026-08-10T00:30:00.000Z",
        entries: [{
          boat: 1,
          racerName: "公式値",
          avgSt: 0.14
        }],
        weather: {
          windDirection: "向かい風",
          windSpeed: 2,
          waveHeight: 1
        }
      },
      raceData: {
        source: "boatrace-official",
        fetchedAt: "2026-08-10T00:30:00.000Z",
        entries: [{
          boat: 1,
          racerName: "補正値",
          avgSt: 0.09
        }],
        weather: {
          windDirection: "追い風",
          windSpeed: 9,
          waveHeight: 8
        }
      }
    },
    {
      weather: {
        windDirection: "横風",
        windSpeed: 7,
        waveHeight: 6
      }
    }
  );
assert.equal(
  provenanceConditions.shadow.boats[0].racerName,
  "公式値"
);
assert.equal(
  provenanceConditions.shadow.boats[0].avgST,
  0.14
);
assert.equal(
  provenanceConditions.shadow.weather.windSpeed,
  2
);
assert.equal(
  provenanceConditions.legacy.weather.windSpeed,
  9
);
for (const snapshot of [
  provenanceConditions.shadow,
  provenanceConditions.legacy
]) {
  assert.equal(snapshot.source, "boatrace-official");
  assert.equal(snapshot.sourceFetchedAt, "2026-08-10T00:30:00.000Z");
  assert.equal(snapshot.analysisProfile, "hiyori-compatible");
}

const rawWeatherMissing =
  captureStoredConditions(
    {
      rawRaceData: {
        entries: []
      },
      raceData: {
        weather: {
          windDirection: "追い風",
          windSpeed: 9,
          waveHeight: 8
        }
      }
    },
    {
      weather: {
        windDirection: "横風",
        windSpeed: 7,
        waveHeight: 6
      }
    }
  );
assert.equal(
  rawWeatherMissing.shadow
    .dataAvailability.windDirection,
  false
);
assert.equal(
  rawWeatherMissing.shadow
    .dataAvailability.wind,
  false
);
assert.equal(
  rawWeatherMissing.shadow
    .dataAvailability.wave,
  false,
  "V2完全性へ予想側の気象値を補完しない"
);

const rawCaptureFailure = {};
Object.defineProperty(
  rawCaptureFailure,
  "entries",
  {
    get() {
      throw new Error(
        "shadow snapshot failure"
      );
    }
  }
);
let captureWarning = "";
const warnBeforeCapture = console.warn;
console.warn = message => {
  captureWarning = String(message || "");
};
const isolatedCapture =
  captureStoredConditions(
    {
      rawRaceData: rawCaptureFailure,
      raceData: {
        entries: [{
          boat: 1,
          racerName: "現行予想"
        }]
      }
    },
    fakePrediction()
  );
console.warn = warnBeforeCapture;
assert.equal(
  isolatedCapture.legacy.boats[0].racerName,
  "現行予想"
);
assert.deepEqual(
  isolatedCapture.shadow,
  {},
  "V2スナップショット障害時も現行予想を保持する"
);
assert.ok(
  captureWarning.includes(
    "shadow snapshot failure"
  )
);

const originalWarn = console.warn;
let isolatedWarning = "";
console.warn = message => {
  isolatedWarning = String(message || "");
};
const isolatedFailure = safelyBuildShadowV2(
  { raceKey: "test" },
  () => {
    throw new Error("V2 test failure");
  }
);
console.warn = originalWarn;
assert.equal(isolatedFailure, null);
assert.ok(
  isolatedWarning.includes("V2 test failure"),
  "V2障害を現行予想から分離して記録する"
);

let startupWarning = "";
console.warn = message => {
  startupWarning += String(message || "");
};
const optionalFallback =
  loadOptionalV2Dependency(
    () => {
      throw new Error(
        "optional module failure"
      );
    },
    { ready: false },
    "テスト"
  );
const unavailableFingerprint =
  safeFingerprintFiles(
    ["not-used"],
    "テスト",
    () => {
      throw new Error(
        "fingerprint failure"
      );
    }
  );
const existingShadow = [{
  recordKey: "existing"
}];
const preservedShadow =
  safelyUpsertShadowSnapshots(
    existingShadow,
    [{ recordKey: "incoming" }],
    () => {
      throw new Error(
        "upsert failure"
      );
    }
  );
console.warn = originalWarn;
assert.deepEqual(
  optionalFallback,
  { ready: false }
);
assert.equal(
  unavailableFingerprint,
  "unavailable"
);
assert.deepEqual(
  preservedShadow,
  existingShadow,
  "V2保存統合障害時も既存データを維持する"
);
assert.ok(
  startupWarning.includes(
    "optional module failure"
  ) &&
    startupWarning.includes(
      "fingerprint failure"
    ) &&
    startupWarning.includes(
      "upsert failure"
    ),
  "V2起動・識別・保存の障害を診断できる"
);

function fakePrediction() {
  return {
    version: "prediction-fake",
    raceFlow: {
      title: "1逃げ"
    },
    mainSheet: {
      honmei: {
        boatNo: 1,
        name: "1号艇"
      }
    },
    aiCore: {
      version: "core-fake"
    }
  };
}

const legacyItem = {
  jcd: "12",
  place: "住之江",
  raceNo: 8,
  deadlineAt:
    "2026-07-26T10:02:00.000Z",
  capturedAt:
    "2026-07-26T10:00:00.000Z",
  score: 69.9,
  type: "本線",
  evaluation: {
    ready: true,
    honmei: { score: 69.9 },
    manshu: { score: 40 }
  },
  rawRaceData: {
    entries: [],
    weather: {}
  },
  raceData: {
    entries: [],
    weather: {}
  },
  shadowRaceData: {
    entries: []
  }
};
const practicalTickets = [{
  ticket: "1-2-3",
  category: "本線"
}];
const highShadowRecord =
  buildStoredPrediction(
    "20260726",
    legacyItem,
    false,
    legacyItem.capturedAt,
    {
      createPrediction: fakePrediction,
      createPracticalSelection() {
        return practicalTickets;
      },
      shadowBuilder() {
        return {
          status: "ready",
          complete: true,
          calibrationEligible: true,
          evaluation: {
            totalScore: 100,
            scenario: {
              label: "2コース差し"
            }
          }
        };
      },
      coreApi: {}
    }
  );
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    highShadowRecord
  ),
  "20260726-12-8",
  "旧評価69.9点でもV2が100点なら選定する"
);
assert.equal(
  highShadowRecord.scoreBand,
  "70_plus"
);
assert.equal(
  highShadowRecord.selection.score,
  100
);
assert.equal(
  highShadowRecord.selection.legacy.score,
  69.9,
  "旧評価は監査用に保持する"
);
assert.equal(
  highShadowRecord.selection.selected,
  false
);
assert.deepEqual(
  highShadowRecord.prediction.practicalTickets,
  practicalTickets,
  "V2追加後も現行の実戦買い目をそのまま保存する"
);
assert.equal(
  highShadowRecord
    .practicalPriorityShadow
    .applicationMode,
  "shadow-only",
  "順位候補は締切前にシャドー専用で保存する"
);
assert.equal(
  highShadowRecord
    .practicalPriorityShadow
    .automaticApplication,
  false,
  "順位候補を自動採用しない"
);
assert.equal(
  highShadowRecord
    .practicalPriorityShadow
    .usableForPrediction,
  false,
  "順位候補を現行予想へ接続しない"
);
assert.deepEqual(
  highShadowRecord
    .practicalPriorityShadow
    .baseTickets,
  highShadowRecord
    .practicalPriorityShadow
    .shadowTickets,
  "候補不成立時も現行買い目を変更しない"
);
const failedPriorityShadowRecord =
  buildStoredPrediction(
    "20260726",
    legacyItem,
    false,
    legacyItem.capturedAt,
    {
      createPrediction: fakePrediction,
      createPracticalSelection() {
        return practicalTickets;
      },
      practicalPriorityShadowBuilder() {
        throw new Error("shadow failure");
      },
      shadowBuilder() {
        return {
          status: "ready",
          complete: true,
          calibrationEligible: true,
          evaluation: { totalScore: 100 }
        };
      },
      coreApi: {}
    }
  );
assert.equal(
  failedPriorityShadowRecord.raceKey,
  highShadowRecord.raceKey,
  "シャドー専用処理が失敗しても締切前予想を保存する"
);
assert.equal(
  failedPriorityShadowRecord
    .practicalPriorityShadow
    .status,
  "shadow-builder-unavailable"
);
assert.equal(
  failedPriorityShadowRecord
    .practicalPriorityShadow
    .eligible,
  false
);
assert.deepEqual(
  failedPriorityShadowRecord.prediction.practicalTickets,
  practicalTickets,
  "シャドー失敗時も現行買い目を変更しない"
);
const detachedShadowRecord =
  detachShadowV2({
    ...highShadowRecord,
    shadowV2: {
      ...highShadowRecord.shadowV2,
      recordKey:
        "shadow-record-a",
      cohortKey:
        "shadow-cohort-a",
      capturedAt:
        legacyItem.capturedAt,
      evaluatorVersion:
        "shadow-selection-v2.0.0",
      versions: {
        logicFingerprint:
          "shadow-logic-a",
        theoryInput:
          "theory-input-v1"
      },
      evaluation: {
        totalScore: 100
      }
    }
  });
assert.equal(
  detachedShadowRecord.shadowV2,
  undefined,
  "検証行には重いV2原本を重複保存しない"
);
assert.deepEqual(
  detachedShadowRecord
    .shadowV2Reference,
  {
    recordKey:
      "shadow-record-a",
    cohortKey:
      "shadow-cohort-a",
    capturedAt:
      legacyItem.capturedAt,
    evaluatorVersion:
      "shadow-selection-v2.0.0",
    logicFingerprint:
      "shadow-logic-a",
    theoryInputVersion:
      "theory-input-v1",
    totalScore: 100
  },
  "100R集計でV2原本を厳密照合できる参照を保持する"
);

const staleEvidenceRecord =
  compactStoredVerification({
    raceKey:
      "20260722-08-9",
    prediction: {
      verificationEvidence: {
        roleSchemaVersion: 1,
        theorySchemaVersion: 0,
        theorySetFingerprint:
          "stale"
      },
      practicalSelection: {
        verificationEvidence: {
          roleSchemaVersion: 1,
          theorySchemaVersion: 1,
          theorySetFingerprint:
            "current"
        }
      },
      practicalTickets: []
    }
  });
assert.equal(
  staleEvidenceRecord
    .prediction
    .verificationEvidence
    .theorySetFingerprint,
  "current",
  "保存時は実戦選定が生成した最新の構造化根拠を優先する"
);

const thresholdItem = {
  ...legacyItem,
  raceNo: 9,
  score: 99
};
const lowShadowRecord =
  buildStoredPrediction(
    "20260726",
    thresholdItem,
    true,
    thresholdItem.capturedAt,
    {
      createPrediction: fakePrediction,
      createPracticalSelection() {
        return practicalTickets;
      },
      shadowBuilder() {
        return {
          status: "ready",
          complete: true,
          calibrationEligible: true,
          evaluation: {
            totalScore: 1
          }
        };
      },
      coreApi: {}
    }
  );
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    lowShadowRecord
  ),
  "",
  "旧評価99点でもV2が1点なら選定しない"
);
assert.equal(
  lowShadowRecord.scoreBand,
  "under_60"
);
assert.equal(
  lowShadowRecord.selection.selected,
  false
);

const activeComparison =
  buildActiveV2Comparison(
    "20260726",
    [
      thresholdItem,
      legacyItem
    ],
    [
      lowShadowRecord,
      highShadowRecord
    ]
  );
assert.equal(
  activeComparison[0].raceKey,
  "20260726-12-8",
  "旧評価順ではなくV2総合点で並べる"
);
assert.equal(
  activeComparison[0].score,
  100
);
assert.equal(
  activeComparison[0].legacyScore,
  69.9
);
assert.equal(
  activeComparison[0].type,
  "8項目V2"
);
assert.equal(
  activeComparison[0].scenarioLabel,
  "2コース差し"
);

const markedRecords =
  applySelectedRaceKey(
    [
      lowShadowRecord,
      highShadowRecord
    ],
    "20260726-12-8"
  );
assert.equal(
  markedRecords.find(
    item =>
      item.raceKey ===
      "20260726-12-8"
  ).selection.selected,
  true
);
assert.equal(
  markedRecords.find(
    item =>
      item.raceKey ===
      "20260726-12-9"
  ).selection.selected,
  false
);

const unavailableV2 =
  buildStoredPrediction(
    "20260726",
    {
      ...legacyItem,
      raceNo: 10,
      score: 99
    },
    true,
    legacyItem.capturedAt,
    {
      createPrediction: fakePrediction,
      createPracticalSelection() {
        return practicalTickets;
      },
      shadowBuilder() {
        return {
          status: "incomplete",
          complete: false,
          calibrationEligible: false,
          evaluation: {
            totalScore: 95
          }
        };
      },
      coreApi: {}
    }
  );
assert.equal(
  selectedRaceKeyFor(
    "20260726",
    unavailableV2
  ),
  "",
  "V2が不完全な場合は旧99点へ戻さず見送る"
);

const historyAttached = attachVenueRaceHistory(
  { stadiumCode: "24", raceNo: 5 },
  "24",
  5
);
const frameOne =
  historyAttached.historyTrend?.frameMovement?.["1"];

assert.equal(historyAttached.raceData.historyContext.ready, true);
assert.ok(frameOne.samples >= 30);
assert.equal(frameOne.hasBaseline, true);
assert.ok(Number.isFinite(frameOne.movementDelta));

const referenceBase = attachVenueRaceHistory(
  {
    entries: [{
      boat: 1,
      boatNo: 88,
      registerNo: "2014",
      racerName: "参照選手"
    }],
    startExhibition: [{
      boat: 1,
      course: 2,
      st: 0.11,
      mappingSource: "official-start-image",
      isOfficialCourse: true
    }]
  },
  "24",
  5
).raceData;
const shadowReference =
  attachShadowReferenceHistory(
    referenceBase,
    "24"
  );
assert.ok(
  shadowReference.historyContext
    .courseStructure.venue
    .all3Years,
  "V2専用入力へ場×実進入コース履歴を接続する"
);
assert.ok(
  shadowReference.historyContext
    .racers[0].skillHistory
    .windows.all3Years,
  "V2専用入力へ選手の実進入ST履歴を接続する"
);
assert.equal(
  shadowReference.entries[0].boatNo,
  1,
  "V2専用入力だけで機材番号を艇番へ正規化する"
);
assert.equal(
  shadowReference.entries[0]
    .startExhibition
    .isOfficialCourse,
  true,
  "V2専用入力へ公式展示進入の取得元を保持する"
);
assert.equal(
  referenceBase.entries[0].boatNo,
  88,
  "現行予想入力の艇番号は変更しない"
);
assert.equal(
  referenceBase.historyContext
    .courseStructure,
  undefined,
  "現行予想入力にはV2専用参照履歴を混在させない"
);

const completeRegisterNos = [
  "2878",
  "3075",
  "3107",
  "3161",
  "3175",
  "3233"
];
const completeRacerNames = [
  "富山弘幸",
  "中村裕将",
  "平岡重典",
  "古場輝義",
  "渡辺千草",
  "小畑実成"
];
const completeRawRaceData = {
  ok: true,
  source: "boatrace-official-fixture",
  stadiumCode: "12",
  raceNo: 8,
  date: "20260726",
  fetchedAt:
    "2026-07-26T10:00:00.000Z",
  waterType: "淡水",
  weather: {
    weather: "晴",
    windDirection: "向かい風",
    windDirectionCode: 5,
    windSpeed: 3,
    waveHeight: 2,
    temperature: 29,
    waterTemperature: 27,
    waterType: "淡水",
    liveTideAvailable: false
  },
  entries:
    completeRegisterNos.map(
      (registerNo, index) => {
        const boat = index + 1;
        return {
          boat,
          registerNo,
          racerName:
            completeRacerNames[index],
          className:
            boat <= 2 ? "A1" : "A2",
          avgSt:
            0.11 + boat * 0.01,
          nationalWinRate:
            7.3 - boat * 0.15,
          national2Rate: 45 + boat,
          national3Rate: 65 + boat,
          localWinRate:
            7 - boat * 0.12,
          local2Rate: 44 + boat,
          local3Rate: 64 + boat,
          motor2Rate: 32 + boat,
          motor3Rate: 48 + boat,
          boat2Rate: 31 + boat,
          currentRace: {
            stList: [
              0.10 + boat * 0.005,
              0.12 + boat * 0.005
            ]
          },
          currentResults: [2, 3, 2],
          exhibition: {
            displayTime:
              6.70 + boat * 0.02,
            partsExchange: ""
          }
        };
      }
    ),
  startExhibition:
    completeRegisterNos.map(
      (_registerNo, index) => ({
        boat: index + 1,
        course: index + 1,
        st: 0.09 + index * 0.01,
        isOfficialCourse: true,
        mappingSource:
          "official-start-image"
      })
    ),
  beforeInfo:
    completeRegisterNos.map(
      (_registerNo, index) => ({
        boat: index + 1,
        racerName:
          completeRacerNames[index],
        lapTimeSource:
          "BOATRACE浜名湖公式・独自計測一周",
        exhibition: {
          displayTime:
            6.72 + index * 0.02,
          lapTime: 37 + index * 0.1
        }
      })
    )
};
const completeHistory =
  attachVenueRaceHistory(
    completeRawRaceData,
    "12",
    8
  );
[1, 2, 3, 4].forEach(boatNo => {
  completeHistory.raceData.historyContext
    .venueRace.trend.frameMovement[
      String(boatNo)
    ] = {
      boatNo,
      samples: 200,
      reliability: "high",
      riseRate: 60,
      stayRate: 30,
      sinkRate: 10,
      label: "浮上",
      hasBaseline: true,
      baselineRiseRate: 30,
      baselineStayRate: 40,
      baselineSinkRate: 30,
      movementDelta: 50
    };
});
const completeLegacyInput =
  theoryInput.prepare(
    JSON.parse(
      JSON.stringify(
        completeHistory.raceData
      )
    ),
    global.ChappyAICore
  );
const completeShadowInput =
  theoryInput.prepare(
    attachShadowReferenceHistory(
      JSON.parse(
        JSON.stringify(
          completeHistory.raceData
        )
      ),
      "12"
    ),
    global.ChappyAICore
  );
const completeEvaluation =
  global.ChappyAICore
    .buildRaceTrendEvaluation(
      completeLegacyInput
    );
const completeHonmeiScore = Number(
  completeEvaluation.honmei?.score || 0
);
const completeManshuScore = Number(
  completeEvaluation.manshu?.score || 0
);
const completeStored =
  buildStoredPrediction(
    "20260726",
    {
      jcd: "12",
      place: "住之江",
      raceNo: 8,
      deadlineAt:
        "2026-07-26T10:02:00.000Z",
      capturedAt:
        "2026-07-26T10:00:00.000Z",
      score: Math.max(
        completeHonmeiScore,
        completeManshuScore
      ),
      type:
        completeHonmeiScore >=
        completeManshuScore
          ? "本線"
          : "波乱",
      evaluation:
        completeEvaluation,
      rawRaceData:
        completeHistory.raceData,
      raceData:
        completeLegacyInput,
      shadowRaceData:
        completeShadowInput
    },
    false,
    "2026-07-26T10:00:00.000Z"
  );
const completeV2 =
  completeStored.shadowV2;
const completeStartDiagnostic =
  completeStored.theoryTagSnapshot
    .evidenceDiagnostics.rows.find(
      row => row.theoryKey === "start"
    );
const completeStartTheory =
  completeStored.theoryTagSnapshot
    .theories.find(
      row => row.theoryKey === "stSlit"
    );
const completeFrameDiagnostic =
  completeStored.theoryTagSnapshot
    .evidenceDiagnostics.rows.find(
      row => row.theoryKey === "frame-rise-fall"
    );
const completeFrameTheory =
  completeStored.theoryTagSnapshot
    .theories.find(
      row => row.theoryKey === "frameRiseSink"
    );
const completeDoubleDiagnostic =
  completeStored.theoryTagSnapshot
    .evidenceDiagnostics.rows.find(
      row => row.theoryKey === "double-time"
    );
const completeDoubleTheory =
  completeStored.theoryTagSnapshot
    .theories.find(
      row => row.theoryKey === "doubleTime"
    );

assert.equal(
  completeStartDiagnostic.formal,
  true,
  "公式入力のavgSt・今節ST・展示STからST正式証拠を生成する"
);
assert.equal(
  completeStartDiagnostic.metrics.coverage,
  6
);
assert.ok(
  completeStartTheory?.ticketCount > 0,
  "正式ST証拠を実戦買い目へ帰属して日次記録へ保存する"
);
assert.equal(
  completeFrameDiagnostic.formal,
  true,
  "AI計算へ適用済みの枠別浮沈率を正式証拠として保存する"
);
assert.ok(
  completeFrameTheory?.ticketCount > 0,
  "枠別浮沈率を実際に補正した枠を含む実戦買い目へ帰属する"
);
assert.equal(
  completeDoubleDiagnostic.formal,
  true,
  "開催場公式の一周6艇と展示・足Ver2の実配点からダブルタイム正式証拠を保存する"
);
assert.equal(
  completeDoubleDiagnostic.metrics.lapCount,
  6
);
assert.ok(
  completeDoubleTheory?.ticketCount > 0,
  "実際に5点を統合したダブルタイム艇を含む実戦買い目へ帰属する"
);
assert.deepEqual(
  compactStoredVerification(
    completeStored
  ).theoryTagSnapshot,
  completeStored.theoryTagSnapshot,
  "検証予想の軽量化後もST正式証拠を保持する"
);
const completeStartEvaluation =
  require("../js/theory-evaluation-engine")
    .build({
      ...completeStored,
      result: {
        settled: true,
        resultTicket:
          completeStartTheory.tickets[0]
      }
    })
    .evaluations.find(
      row => row.theoryKey === "start"
    );
assert.equal(
  completeStartEvaluation.status,
  "evaluated",
  "保存したstSlit証拠をPhase7のstart評価へ接続する"
);
assert.equal(
  completeStartEvaluation.matched,
  true
);
const completeFrameEvaluation =
  require("../js/theory-evaluation-engine")
    .build({
      ...completeStored,
      result: {
        settled: true,
        resultTicket:
          completeFrameTheory.tickets[0]
      }
    })
    .evaluations.find(
      row => row.theoryKey === "frame-rise-fall"
    );
assert.equal(
  completeFrameEvaluation.status,
  "evaluated",
  "保存した枠別浮沈率証拠をPhase7評価へ接続する"
);
assert.equal(
  completeFrameEvaluation.matched,
  true
);
const completeDoubleEvaluation =
  require("../js/theory-evaluation-engine")
    .build({
      ...completeStored,
      result: {
        settled: true,
        resultTicket:
          completeDoubleTheory.tickets[0]
      }
    })
    .evaluations.find(
      row => row.theoryKey === "double-time"
    );
assert.equal(
  completeDoubleEvaluation.status,
  "evaluated",
  "保存したダブルタイム証拠をPhase7評価へ接続する"
);
assert.equal(
  completeDoubleEvaluation.matched,
  true
);

assert.equal(
  completeEvaluation.ready,
  true,
  "現行収集経路の評価が成立する"
);
assert.equal(
  completeV2.status,
  "ready"
);
assert.equal(
  completeV2.complete,
  true
);
assert.equal(
  completeV2.calibrationEligible,
  true,
  "実収集経路の完全データを校正対象にできる"
);
assert.equal(
  completeV2.readiness
    .formalComponentCount,
  8
);
assert.equal(
  completeV2.readiness
    .allComponentsFormal,
  true
);
assert.deepEqual(
  completeV2.missingReasonCodes,
  []
);
assert.deepEqual(
  completeV2.eligibilityReasonCodes,
  []
);
assert.equal(
  completeV2.timing
    .secondsBeforeDeadline,
  120
);
assert.equal(
  completeV2.timing.beforeCutoff,
  true
);
[
  "entries",
  "officialCourses",
  "averageST",
  "exhibitionST",
  "exhibitionTime",
  "skill",
  "motor"
].forEach(key => {
  assert.equal(
    completeV2.availability[key],
    6,
    `${key}を6艇保存する`
  );
});
assert.equal(
  completeV2.availability
    .windDirection,
  true
);
assert.equal(
  completeV2.availability.wind,
  true
);
assert.equal(
  completeV2.availability.wave,
  true
);
assert.equal(
  completeV2.availability
    .tideRequired,
  false
);
assert.equal(
  completeV2.evaluation
    .components.length,
  8
);
assert.ok(
  completeV2.evaluation
    .components.every(
      component =>
        component.score !== null &&
        component.formal === true
    )
);

const collectionHealth = buildCollectionHealth(
  "20260722",
  [
    { jcd: "08", place: "常滑", raceNo: 1, deadlineAt: "2026-07-22T10:00:00+09:00" },
    { jcd: "19", place: "下関", raceNo: 2, deadlineAt: "2026-07-22T10:05:00+09:00" },
    { jcd: "24", place: "大村", raceNo: 3, deadlineAt: "2026-07-22T10:10:00+09:00" }
  ],
  [
    { jcd: "08", raceNo: 1, status: "evaluated", error: "" },
    { jcd: "19", raceNo: 2, status: "insufficient_data", error: "データ不足" },
    { jcd: "24", raceNo: 3, status: "fetch_failed", error: "HTTP 500" }
  ],
  [{
    raceKey: "20260722-08-1",
    selection: {
      ready: true,
      status: "ready",
      qualified: true,
      selected: true
    }
  }, {
    raceKey: "20260722-08-1",
    selection: {
      ready: false,
      status: "incomplete",
      qualified: false,
      selected: false,
      eligibilityReasonCodes: [
        "component.tide.provisional"
      ]
    },
    shadowV2: {
      missingReasonCodes: [
        "data.tide"
      ],
      missingReasons: [{
        code: "data.tide",
        label: "潮汐場の現在潮位・潮流"
      }],
      eligibilityReasonCodes: [
        "component.tide.provisional"
      ],
      eligibilityReasons: [{
        code:
          "component.tide.provisional",
        label: "当地・水面が暫定"
      }]
    }
  }]
);

assert.equal(collectionHealth.targetCount, 3);
assert.equal(collectionHealth.savedCount, 1);
assert.equal(collectionHealth.insufficientDataCount, 1);
assert.equal(collectionHealth.failedCount, 1);
assert.equal(collectionHealth.complete, false);
assert.equal(collectionHealth.targets[0].status, "saved");
assert.equal(collectionHealth.targets[1].status, "insufficient_data");
assert.equal(collectionHealth.targets[2].status, "fetch_failed");
assert.equal(collectionHealth.schemaVersion, 3);
assert.equal(collectionHealth.v2.evaluatedCount, 2);
assert.equal(collectionHealth.v2.readyCount, 1);
assert.equal(collectionHealth.v2.qualifiedCount, 1);
assert.equal(collectionHealth.v2.selectedCount, 1);
assert.equal(collectionHealth.v2.notReadyCount, 1);
assert.deepEqual(
  collectionHealth.v2.missingReasons,
  [{
    code:
      "component.tide.provisional",
    label: "当地・水面が暫定",
    count: 1
  }, {
    code: "data.tide",
    label: "潮汐場の現在潮位・潮流",
    count: 1
  }]
);

assert.deepEqual(insufficientReasons({
  ready: false,
  honmei: { reasons: ["出走データ5/6艇", "STデータ3/6艇"] },
  manshu: { reasons: ["STデータ3/6艇"] }
}), ["出走データ5/6艇", "STデータ3/6艇"]);

const recoveryPlan = buildRecoveryPlan(
  "20260722",
  [{ jcd: "24", place: "大村", raceNo: 7, deadlineAt: "2026-07-22T20:25:00+09:00" }],
  {
    runs: [{
      checkedAt: "2026-07-22T10:00:00.000Z",
      collectionHealth: {
        targets: [
          {
            raceKey: "20260722-15-11",
            jcd: "15",
            place: "丸亀",
            raceNo: 11,
            deadlineAt: "2026-07-22T20:06:00+09:00",
            status: "insufficient_data",
            missingReasons: ["STデータ3/6艇"],
            attemptCount: 1
          },
          {
            raceKey: "20260722-19-10",
            jcd: "19",
            place: "下関",
            raceNo: 10,
            deadlineAt: "2026-07-22T19:45:00+09:00",
            status: "fetch_failed",
            attemptCount: 2
          }
        ]
      }
    }]
  },
  new Date("2026-07-22T11:00:00.000Z")
);

assert.equal(recoveryPlan.targets.length, 2);
assert.equal(recoveryPlan.targets.find(item => item.jcd === "15").recoveryAttempt, true);
assert.equal(recoveryPlan.finalizedTargets.length, 1);
assert.equal(recoveryPlan.finalizedTargets[0].status, "final_uncollected");

const recoveredHealth = buildCollectionHealth(
  "20260722",
  recoveryPlan.targets,
  [
    { jcd: "15", raceNo: 11, status: "evaluated" },
    { jcd: "24", raceNo: 7, status: "evaluated" }
  ],
  [
    { raceKey: "20260722-15-11" },
    { raceKey: "20260722-24-7" }
  ],
  recoveryPlan.finalizedTargets,
  "2026-07-22T11:01:00.000Z"
);
assert.equal(recoveredHealth.recoveredCount, 1);
assert.equal(recoveredHealth.finalUncollectedCount, 1);
assert.equal(recoveredHealth.targets.find(item => item.jcd === "15").attemptCount, 2);
assert.deepEqual(
  recoveredHealth.targets.find(item => item.jcd === "15").missingReasons,
  ["STデータ3/6艇"]
);

const records = upsertByRaceKey(
  [
    { raceKey: "20260722-08-1", selectedAt: "old", scoreBand: "under_70" },
    { raceKey: "20260722-12-1", selectedAt: "kept", scoreBand: "under_70" }
  ],
  [
    { raceKey: "20260722-08-1", selectedAt: "new", scoreBand: "70_plus" },
    { raceKey: "20260722-19-1", selectedAt: "added", scoreBand: "under_70" }
  ]
);

assert.equal(records.length, 3);
assert.equal(records.find(item => item.raceKey === "20260722-08-1").selectedAt, "new");
assert.equal(records.find(item => item.raceKey === "20260722-12-1").selectedAt, "kept");
assert.equal(records.find(item => item.raceKey === "20260722-19-1").scoreBand, "under_70");

const compacted = compactStoredVerification({
  raceKey: "20260722-19-1",
  result: { settled: true },
  prediction: {
    version: "test",
    predictionMode: "server_pre_deadline_shadow",
    raceFlow: { title: "1逃げ本線", summary: "要約", oversized: "削除" },
    mainSheet: {
      honmei: { boatNo: 1, name: "本命", buffs: ["大きな分析"] },
      taikou: { boatNo: 2, name: "対抗" },
      tickets: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" }))
    },
    manshuSheet: { oversized: true },
    ticketRanks: Array.from({ length: 30 }, () => ({ ticket: "1-2-3" })),
    practicalTickets: [{ ticket: "1-2-3", category: "本線" }],
    simpleEvaluation: {
      mode: "chaos",
      label: "波乱入口",
      score: 79
    },
    preRaceConditions: { weather: { windSpeed: 3 } },
    verificationEvidence: {
      roleSchemaVersion: 1,
      theorySchemaVersion: 1,
      theorySetFingerprint:
        "structured-ticket-support-v1:flow+holdPickup",
      generation: {
        logicFingerprint:
          "evaluated-scenarios-v1",
        confidenceDefinitionVersion:
          "internal-score-v1",
        ticketPolicyVersion:
          "practical-5-7-10-v1"
      },
      sourceCommit: "abc123",
      aiCoreVersion: "ai-core-test",
      mainScenario: {
        type: "threeAttack",
        label: "3コース攻め",
        score: 88,
        frameMovementAdjustment: -2,
        attacker: 3,
        blockedBoats: [4]
      },
      roles: {
        attacker: 3,
        wallBoat: 2,
        remainers: [1, 2],
        followers: [5],
        pickupCandidates: [5, 6],
        roadRaceBoats: [6],
        localExperts: [],
        blockedBoats: [4]
      },
      roleClaims: [{
        role: "attack",
        boatNo: 3,
        expectedPositions: [1]
      }],
      theoryClaims: [{
        theoryKey: "flow",
        label: "展開",
        formal: true,
        source:
          "pre_race_structured_branch"
      }],
      tickets: [{
        ticket: "3-1-5",
        roleClaims: [{
          role: "attack",
          boatNo: 3,
          expectedPositions: [1]
        }],
        theoryClaims: [{
          theoryKey: "flow",
          label: "展開",
          formal: true,
          source:
            "pre_race_structured_branch"
        }]
      }]
    }
  }
});

assert.equal(compacted.result.settled, true);
assert.equal(compacted.prediction.raceFlow.title, "1逃げ本線");
assert.equal(compacted.prediction.mainSheet.honmei.boatNo, 1);
assert.equal(compacted.prediction.practicalTickets.length, 1);
assert.deepEqual(
  compacted.prediction.internalEvaluation,
  {
    mode: "chaos",
    label: "波乱入口",
    score: 79,
    probability: false
  },
  "自動保存でも本線・波乱modeを校正用に保持する"
);
assert.equal(compacted.prediction.preRaceConditions.weather.windSpeed, 3);
assert.equal(
  compacted.prediction.verificationEvidence.mainScenario.type,
  "threeAttack"
);
assert.equal(
  compacted.prediction.verificationEvidence.roles.attacker,
  3
);
assert.equal(
  compacted.prediction.verificationEvidence
    .theorySchemaVersion,
  1
);
assert.equal(
  compacted.prediction.verificationEvidence
    .theoryClaims[0].theoryKey,
  "flow"
);
assert.equal(
  compacted.prediction.verificationEvidence
    .tickets[0].theoryClaims[0]
    .source,
  "pre_race_structured_branch"
);
assert.equal(compacted.prediction.manshuSheet, undefined);
assert.equal(compacted.prediction.ticketRanks, undefined);
assert.equal(compacted.prediction.mainSheet.tickets, undefined);

const generatedEvidence = compactStoredVerification({
  raceKey: "20260723-24-1",
  prediction: {
    version: "prediction-test",
    aiCore: {
      version: "ai-core-v4.8.0-theory-integration",
      raceScenarios: {
        mainScenario: {
          type: "fourAttack",
          label: "4カド攻め",
          score: 91,
          frameMovementAdjustment: 3,
          attacker: 4,
          attackerCourse: 4,
          attackerBoatNo: 4,
          headBoatNo: 4,
          blockedBoats: []
        },
        subScenario: {
          type: "escape",
          label: "1号艇逃げ",
          score: 86,
          frameMovementAdjustment: -1,
          attacker: 1,
          blockedBoats: []
        },
        scenarios: [],
        attacker: 4,
        attackerCourse: 4,
        attackerBoatNo: 4,
        headBoatNo: 4,
        wallBoat: 3,
        remainers: [1, 2],
        followers: [5],
        pickupCandidates: [5, 6],
        roadRaceBoats: [6],
        localExperts: [1],
        blockedBoats: [],
        evidence: {
          relations: { fourVsThree: 9 },
          frameMovement: [{ boatNo: 4, scoreAdjustment: 3 }]
        }
      },
      marks: {
        honmei: { boatNo: 4, playerName: "4号艇" },
        taikou: { boatNo: 1, playerName: "1号艇" },
        ana: { boatNo: 5, playerName: "5号艇" },
        osae: { boatNo: 2, playerName: "2号艇" }
      },
      formations: {
        mainEstablished: true,
        axis: { honmei: 4, taikou: 1, ana: 5, osae: 2 },
        evidence: { scenarioType: "fourAttack" }
      }
    }
  }
});

assert.equal(
  generatedEvidence.prediction.verificationEvidence.aiCoreVersion,
  "ai-core-v4.8.0-theory-integration"
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario.type,
  "fourAttack"
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario
    .frameMovementAdjustment,
  3
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario
    .attackerCourse,
  4
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.mainScenario
    .attackerBoatNo,
  4
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.roles
    .attackerCourse,
  4
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.roles
    .attackerBoatNo,
  4
);

const generatedMappedEvidence = compactStoredVerification({
  raceKey: "20260723-24-2",
  prediction: {
    practicalSelection: {
      verificationEvidence: {
        mainScenario: {
          type: "threeAttack",
          headBoatNo: 6,
          attackerBoatNo: 6
        }
      }
    },
    aiCore: {
      raceScenarios: {
        mainScenario: {
          type: "threeAttack",
          attacker: 3,
          attackerCourse: 3,
          attackerBoatNo: 6,
          headBoatNo: 6
        },
        subScenario: {
          type: "escape",
          attacker: 1,
          attackerCourse: 1,
          attackerBoatNo: 1,
          headBoatNo: 1
        },
        attacker: 6,
        attackerCourse: 3,
        attackerBoatNo: 6,
        headBoatNo: 6
      }
    }
  }
});
assert.equal(
  generatedMappedEvidence.prediction.verificationEvidence
    .mainScenario.attackerCourse,
  3,
  "実戦選択の簡略証拠を優先してもAIコアの実コースを保持する"
);
assert.equal(
  generatedMappedEvidence.prediction.verificationEvidence
    .mainScenario.attackerBoatNo,
  6
);
assert.equal(
  generatedMappedEvidence.prediction.verificationEvidence
    .subScenario.attackerCourse,
  1
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.marks.honmei.boatNo,
  4
);
assert.equal(
  generatedEvidence.prediction.verificationEvidence.formation.scenarioType,
  "fourAttack"
);

const temporaryRoot = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "chappy-shadow-v2-save-"
  )
);
const originalCwd = process.cwd();
try {
  process.chdir(temporaryRoot);
  saveRun(
    "20260726",
    [],
    null,
    [{
      raceKey: "20260726-12-8",
      selection: {
        score: 45,
        threshold: 60
      },
      prediction: {}
    }],
    [{
      recordKey:
        "20260726-12-8:logic-a:config-a",
      raceKey: "20260726-12-8",
      calibrationEligible: true,
      evaluation: {
        totalScore: 59.8
      }
    }],
    null
  );

  const saved = JSON.parse(
    fs.readFileSync(
      path.join(
        temporaryRoot,
        "data",
        "predictions",
        "20260726.json"
      ),
      "utf8"
    )
  );
  assert.equal(saved.schemaVersion, 3);
  assert.equal(
    saved.runs[0].threshold,
    60,
    "保存runにも現行60点基準を残す"
  );
  assert.equal(
    saved.verificationPredictions.length,
    1
  );
  assert.equal(
    saved.verificationPredictions[0].shadowV2,
    undefined,
    "現行検証レコードへV2を混在させない"
  );
  assert.equal(saved.shadowV2Predictions.length, 1);
  assert.equal(
    saved.shadowV2Predictions[0]
      .calibrationEligible,
    true
  );
  assert.deepEqual(
    fs.readdirSync(
      path.join(
        temporaryRoot,
        "data",
        "predictions"
      )
    ),
    ["20260726.json"],
    "一時ファイルを残さず日次JSONを原子的に確定する"
  );
} finally {
  process.chdir(originalCwd);
  fs.rmSync(
    temporaryRoot,
    {
      recursive: true,
      force: true
    }
  );
}

console.log("シャドー予想保存テスト: 合格");
