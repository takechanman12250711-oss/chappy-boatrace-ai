"use strict";

const assert = require("node:assert/strict");
const conditions = require("../js/prediction-conditions");
const shadowV2 = require("../js/shadow-selection-v2");

function buildRaceData({
  newEngine = false,
  tide = false
} = {}) {
  const entries = Array.from(
    { length: 6 },
    (_, index) => ({
      boat: index + 1,
      boatNo: 50 + index,
      registerNo: String(4001 + index),
      racerName: `選手${index + 1}`,
      className: index === 0 ? "A1" : "B1",
      avgSt: 0.13 + index * 0.01,
      nationalWinRate: 6.5 - index * 0.2,
      national2Rate: 45 - index,
      national3Rate: 65 - index,
      localWinRate: 6.2 - index * 0.2,
      local2Rate: 42 - index,
      local3Rate: 62 - index,
      motor2Rate: 40 - index,
      motor3Rate: 55 - index,
      boat2Rate: 38 - index,
      currentRace: {
        stList: [0.14 + index * 0.01]
      },
      exhibition: {
        displayTime: 6.72 + index * 0.02
      }
    })
  );

  return {
    stadiumCode: "12",
    raceNo: 8,
    raceInfo: {
      motorTerm:
        newEngine ? "新エンジン" : "通常"
    },
    entries,
    beforeInfo: entries.map(entry => ({
      boat: entry.boat,
      exhibition: {
        displayTime:
          entry.exhibition.displayTime
      }
    })),
    startExhibition: entries.map((entry, index) => ({
      boat: entry.boat,
      course: index + 1,
      st: 0.10 + index * 0.01,
      isOfficialCourse: true,
      mappingSource: "official-start-image"
    })),
    weather: {
      windDirection: "向かい風",
      windSpeed: 3,
      waveHeight: 2,
      waterType: tide ? "海水" : "淡水",
      tideLevel: tide ? 120 : null,
      tideFlow: tide ? "上げ潮" : "",
      liveTideAvailable: tide
    },
    historyContext: {
      racers: entries.map((entry, index) => ({
        registerNo: entry.registerNo,
        localStarts: 30 + index
      }))
    }
  };
}

function role(boatNo, score, extra = {}) {
  return {
    boatNo,
    score,
    isFormal: true,
    status: "正式反映",
    ...extra
  };
}

function buildPrediction({
  newEngine = false,
  tidal = false,
  odds = null,
  officialResult = null
} = {}) {
  const prediction = {
    version: "prediction-test-v1",
    isNewEngineMode: newEngine,
    raceFlow: {
      title: "1号艇逃げ",
      summary: "1号艇を軸に評価"
    },
    mainSheet: {
      honmei: {
        boatNo: 1,
        name: "選手1"
      },
      taikou: {
        boatNo: 2,
        name: "選手2"
      }
    },
    aiCore: {
      version: "ai-core-test-v1",
      analyses: [
        {
          boatNo: 1,
          playerName: "選手1",
          indexes: {
            national: 20,
            motor: 99
          }
        }
      ],
      raceScenarios: {
        attacker: 1,
        mainScenario: {
          type: "escape",
          label: "1号艇逃げ",
          score: 80,
          attacker: 1,
          outcome: {
            firstCandidates: [{ boatNo: 1 }],
            secondCandidates: [{ boatNo: 2 }],
            thirdCandidates: [{ boatNo: 3 }]
          }
        }
      },
      marks: {
        honmei: { boatNo: 1 }
      },
      courseStructureTheory: {
        source: "course-test",
        roles: [
          role(1, 70, { course: 1 })
        ]
      },
      stSlitTheory: {
        source: "st-test",
        roles: [
          role(1, 60, {
            course: 1,
            samples: 30
          })
        ]
      },
      exhibitionPerformanceTheory: {
        source: "exhibition-test",
        roles: [
          role(1, 50, { mode: "official" })
        ]
      },
      holdPickupTheory: {
        source: "hold-pickup-test",
        isFormal: true,
        roles: [
          {
            boatNo: 2,
            hold: role(2, 40),
            pickup: role(2, 10)
          },
          {
            boatNo: 3,
            hold: role(3, 10),
            pickup: role(3, 40)
          }
        ]
      },
      waterWeatherTheory: {
        surface: {
          isTidal: tidal,
          waterType: tidal ? "海水" : "淡水"
        }
      }
    }
  };

  if (odds) prediction.odds = odds;
  if (officialResult) {
    prediction.officialResult = officialResult;
  }
  return prediction;
}

function buildPreparedRaceData(raceData) {
  return {
    ...raceData,
    entries: raceData.entries.map(
      (entry, index) => ({
        ...entry,
        boatNo: entry.boat,
        exhibitionCourse: index + 1
      })
    ),
    localWaterTheoryV2: {
      version: "local-water-theory-v2-test",
      rows: Array.from(
        { length: 6 },
        (_, index) => ({
          boatNo: index + 1,
          score: index === 0 ? 30 : 20,
          isFormal: true,
          hasLocalEvidence: true,
          hasConditionEvidence: true,
          hasReliableSample: true,
          localStarts: 30 + index,
          waterType:
            raceData.weather.waterType,
          windType: "head"
        })
      )
    },
    motorMaintenanceTheoryV2: {
      version:
        "motor-maintenance-theory-v2-test",
      rows: Array.from(
        { length: 6 },
        (_, index) => ({
          boatNo: index + 1,
          isFormal: true,
          originalMotor: {
            motor2:
              raceData.entries[index].motor2Rate,
            motor3:
              raceData.entries[index].motor3Rate,
            boat2:
              raceData.entries[index].boat2Rate
          }
        })
      )
    }
  };
}

const coreApi = {
  calcMotorIndex() {
    return 10;
  }
};

function buildRecord({
  newEngine = false,
  tidal = false,
  tide = false,
  capturedAt = "2026-07-26T01:54:00.000Z",
  deadlineAt = "2026-07-26T10:56:00+09:00",
  snapshot = null,
  prediction = null,
  preparedRaceData = null,
  logicFingerprint = "logic-test",
  referenceGenerationId = "reference-generation-test",
  referenceDataFingerprint = "stats-test",
  coreOverride = coreApi,
  practicalTickets = [
    {
      ticket: "1-2-3",
      category: "本線"
    }
  ]
} = {}) {
  const builtPrediction =
    prediction ||
    buildPrediction({
      newEngine,
      tidal
    });
  const rawRaceData = buildRaceData({
    newEngine,
    tide
  });
  const builtSnapshot =
    snapshot ||
    conditions.capture(
      rawRaceData,
      builtPrediction
    );
  const prepared =
    preparedRaceData ||
    buildPreparedRaceData(rawRaceData);

  return shadowV2.buildRecord({
    raceKey: "20260726-12-8",
    date: "20260726",
    jcd: "12",
    place: "住之江",
    raceNo: 8,
    deadlineAt,
    capturedAt,
    sourceCommit: "abc123",
    logicFingerprint,
    referenceGenerationId,
    referenceDataFingerprint,
    theoryInputVersion: "theory-input-test",
    selection: {
      type: "本線",
      score: 45,
      threshold: 70,
      qualified: false
    },
    preRaceConditions: builtSnapshot,
    preparedRaceData: prepared,
    practicalTickets,
    prediction: builtPrediction,
    coreApi: coreOverride
  });
}

const normal = buildRecord();

assert.equal(normal.schemaVersion, 2);
assert.equal(normal.complete, true);
assert.equal(normal.calibrationEligible, true);
assert.equal(normal.status, "ready");
assert.equal(normal.timing.secondsBeforeDeadline, 120);
assert.equal(normal.timing.beforeCutoff, true);
assert.equal(
  normal.timing.policy,
  "at_or_before_deadline_minus_120s"
);
assert.deepEqual(
  normal.evaluation.components.map(
    item => item.label
  ),
  [
    "展開",
    "コース",
    "ST・スリット",
    "展示・足",
    "残し・拾い",
    "当地・水面",
    "技量",
    "モーター"
  ]
);
assert.deepEqual(
  normal.evaluation.components.map(
    item => item.score
  ),
  [80, 70, 60, 50, 40, 30, 20, 10]
);
assert.ok(
  normal.evaluation.components.every(
    item => item.formal === true
  )
);
assert.deepEqual(
  normal.profile.weights,
  {
    flow: 30,
    course: 20,
    stSlit: 15,
    exhibition: 12,
    holdPickup: 9,
    localWater: 7,
    skill: 4,
    motor: 3
  }
);
assert.equal(
  Object.values(normal.profile.weights)
    .reduce((sum, value) => sum + value, 0),
  100
);
assert.equal(normal.evaluation.totalScore, 59.8);
assert.equal(normal.availability.tideStatus, "not_applicable");
assert.equal(normal.selectionReference.score, 45);
assert.equal(normal.selectionReference.threshold, 70);
assert.equal(normal.selectionReference.qualified, false);
assert.equal(normal.officialResultUsedForEvaluation, false);
assert.equal(
  normal.predictionReference.practicalTickets[0].ticket,
  "1-2-3"
);
assert.equal(normal.snapshot.boats[0].registerNo, "4001");
assert.equal(normal.snapshot.boats[0].motor3Rate, 55);
assert.equal(normal.snapshot.boats[0].localStarts, 30);
assert.ok(normal.recordKey.includes("logic-test"));
assert.ok(normal.versions.sourceCommit);
assert.ok(normal.versions.evaluator);
assert.ok(normal.versions.config);
assert.ok(normal.versions.configHash);
assert.ok(normal.versions.prediction);
assert.ok(normal.versions.aiCore);
assert.ok(normal.versions.theoryInput);
assert.ok(normal.versions.referenceGenerationId);
assert.ok(normal.versions.referenceDataFingerprint);
assert.match(
  normal.verificationCohortKey,
  /^explicit-v1:/,
  "新形式の検証母集団を旧形式と明示的に分離する"
);

const newEngine = buildRecord({
  newEngine: true
});
assert.equal(newEngine.profile.mode, "new_engine");
assert.deepEqual(
  newEngine.profile.weights,
  {
    flow: 30,
    course: 20,
    stSlit: 16,
    exhibition: 14,
    holdPickup: 9,
    localWater: 7,
    skill: 3,
    motor: 1
  }
);
assert.equal(
  Object.values(newEngine.profile.weights)
    .reduce((sum, value) => sum + value, 0),
  100
);
assert.equal(newEngine.evaluation.totalScore, 61);

const coreDetectedNewEngine = buildRecord({
  coreOverride: {
    ...coreApi,
    isNewEngineMode() {
      return true;
    }
  }
});
assert.equal(
  coreDetectedNewEngine.profile.mode,
  "new_engine",
  "実コアと同じ新エンジン判定を配点へ使う"
);

const coreDetectedNormal = buildRecord({
  newEngine: true,
  coreOverride: {
    ...coreApi,
    isNewEngineMode() {
      return false;
    }
  }
});
assert.equal(
  coreDetectedNormal.profile.mode,
  "normal",
  "実コア判定と文字列推測が食い違う場合は実コアを優先する"
);

const oddsPrediction = buildPrediction({
  odds: {
    "1-2-3": 12.4,
    "1-3-2": 18.6
  }
});
const resultPrediction = buildPrediction({
  officialResult: {
    trifecta: "6-5-4",
    payout: 999999
  }
});
const withOdds = buildRecord({
  prediction: oddsPrediction
});
const withResult = buildRecord({
  prediction: resultPrediction
});

assert.deepEqual(
  withOdds.evaluation,
  normal.evaluation,
  "オッズはV2スコアへ使わない"
);
assert.deepEqual(
  withResult.evaluation,
  normal.evaluation,
  "公式結果はV2スコアへ使わない"
);
assert.equal(
  JSON.stringify(withOdds).includes('"odds"'),
  false,
  "V2保存データへオッズを混ぜない"
);
assert.equal(
  JSON.stringify(withResult)
    .includes('"officialResult"'),
  false,
  "V2保存データへ公式結果を混ぜない"
);

const postCutoff = buildRecord({
  capturedAt: "2026-07-26T01:54:00.001Z"
});
assert.equal(postCutoff.complete, false);
assert.equal(postCutoff.calibrationEligible, false);
assert.equal(postCutoff.status, "cutoff_missed");
assert.ok(
  postCutoff.missingReasonCodes
    .includes("timing.cutoff")
);

const noDeadline = buildRecord({
  deadlineAt: ""
});
assert.equal(noDeadline.status, "deadline_unknown");
assert.ok(
  noDeadline.missingReasonCodes
    .includes("timing.deadline")
);

const tidalMissing = buildRecord({
  tidal: true,
  tide: false
});
assert.equal(tidalMissing.complete, false);
assert.equal(
  tidalMissing.availability.tideStatus,
  "missing"
);
assert.ok(
  tidalMissing.missingReasonCodes
    .includes("data.tide")
);

const tidalReady = buildRecord({
  tidal: true,
  tide: true
});
assert.equal(tidalReady.complete, true);
assert.equal(
  tidalReady.availability.tideStatus,
  "acquired"
);

[
  ["entries", "data.entries"],
  ["officialCourses", "data.officialCourses"],
  ["averageST", "data.averageST"],
  ["exhibitionST", "data.exhibitionST"],
  ["exhibitionTime", "data.exhibitionTime"],
  ["skill", "data.skill"],
  ["motor", "data.motor"]
].forEach(([key, code]) => {
  const snapshot = structuredClone(normal.snapshot);
  snapshot.dataAvailability[key] = 5;
  const incomplete = buildRecord({ snapshot });
  assert.equal(
    incomplete.complete,
    false,
    `${key}不足を検出`
  );
  assert.equal(incomplete.calibrationEligible, false);
  assert.ok(
    incomplete.missingReasonCodes.includes(code)
  );
});

[
  ["windDirection", "data.windDirection"],
  ["wind", "data.wind"],
  ["wave", "data.wave"]
].forEach(([key, code]) => {
  const snapshot = structuredClone(normal.snapshot);
  snapshot.dataAvailability[key] = false;
  const incomplete = buildRecord({ snapshot });
  assert.equal(
    incomplete.complete,
    false,
    `${key}不足を検出`
  );
  assert.ok(
    incomplete.missingReasonCodes.includes(code)
  );
});

const provisionalCoursePrediction = buildPrediction();
provisionalCoursePrediction
  .aiCore
  .courseStructureTheory
  .roles[0]
  .isFormal = false;
const provisional = buildRecord({
  prediction: provisionalCoursePrediction
});
assert.equal(provisional.complete, true);
assert.equal(provisional.calibrationEligible, false);
assert.equal(provisional.status, "provisional");
assert.ok(
  provisional.eligibilityReasonCodes
    .includes("component.course.provisional")
);

const unknownLogicGeneration =
  buildRecord({
    logicFingerprint:
      "unavailable"
  });
assert.equal(
  unknownLogicGeneration.complete,
  true,
  "世代不明でも診断用完全データは保存する"
);
assert.equal(
  unknownLogicGeneration
    .calibrationEligible,
  false,
  "世代不明レコードを校正母集団へ入れない"
);
assert.equal(
  unknownLogicGeneration.status,
  "provisional"
);
assert.equal(
  unknownLogicGeneration.readiness
    .versionIdentityComplete,
  false
);
assert.ok(
  unknownLogicGeneration
    .eligibilityReasonCodes
    .includes(
      "version.logicFingerprint.unknown"
    )
);

const unknownReferenceSnapshot =
  buildRecord({
    referenceDataFingerprint: ""
  });
assert.equal(
  unknownReferenceSnapshot
    .calibrationEligible,
  false
);
assert.ok(
  unknownReferenceSnapshot
    .eligibilityReasonCodes
    .includes(
      "version.referenceDataFingerprint.unknown"
    )
);

const unknownReferenceGeneration =
  buildRecord({
    referenceGenerationId: ""
  });
assert.equal(
  unknownReferenceGeneration
    .calibrationEligible,
  false
);
assert.ok(
  unknownReferenceGeneration
    .eligibilityReasonCodes
    .includes(
      "version.referenceGenerationId.unknown"
    )
);

const missingCoursePrediction = buildPrediction();
missingCoursePrediction
  .aiCore
  .courseStructureTheory
  .roles = [];
const missingComponent = buildRecord({
  prediction: missingCoursePrediction
});
assert.equal(
  missingComponent.evaluation.totalScore,
  null
);
assert.equal(
  missingComponent.calibrationEligible,
  false
);
assert.ok(
  missingComponent.missingReasonCodes
    .includes("component.course")
);

const earlierReady = buildRecord({
  capturedAt: "2026-07-26T01:50:00.000Z"
});
const latestReady = buildRecord({
  capturedAt: "2026-07-26T01:54:00.000Z"
});
const lateComplete = buildRecord({
  capturedAt: "2026-07-26T01:55:00.000Z"
});
const retained = shadowV2.upsertSnapshots(
  [earlierReady],
  [latestReady, lateComplete]
);

assert.equal(retained.length, 1);
assert.equal(
  retained[0].capturedAt,
  latestReady.capturedAt,
  "締切2分前以前の最新完全スナップショットを固定"
);

const otherGeneration = buildRecord({
  logicFingerprint: "logic-next"
});
const generations = shadowV2.upsertSnapshots(
  [normal],
  [otherGeneration]
);
assert.equal(
  generations.length,
  2,
  "異なるロジック世代を同じレースでも混ぜない"
);

const otherReferenceGeneration = buildRecord({
  referenceDataFingerprint: "stats-next"
});
const referenceGenerations =
  shadowV2.upsertSnapshots(
    [normal],
    [otherReferenceGeneration]
  );
assert.equal(
  referenceGenerations.length,
  2,
  "異なる参照データスナップショットを監査レコード上は区別する"
);
assert.equal(
  otherReferenceGeneration.cohortKey,
  normal.cohortKey,
  "日々の参照データ更新では校正母集団を分断しない"
);
assert.equal(
  otherReferenceGeneration
    .verificationCohortKey,
  normal.verificationCohortKey,
  "日々の参照データ更新では検証母集団も分断しない"
);

const otherReferenceCompatibilityGeneration = buildRecord({
  referenceGenerationId: "reference-generation-next"
});
assert.notEqual(
  otherReferenceCompatibilityGeneration.cohortKey,
  normal.cohortKey,
  "参照データの生成方式が変わった場合だけ校正母集団を分ける"
);
assert.notEqual(
  otherReferenceCompatibilityGeneration
    .verificationCohortKey,
  normal.verificationCohortKey,
  "参照データ生成方式が変わった検証結果を混ぜない"
);

console.log(
  "自動選定V2 8項目評価テスト: 合格"
);
console.log(
  "- 完全データと締切2分前カットオフを検証"
);
console.log(
  "- 8項目の通常・新エンジン配点を検証"
);
console.log(
  "- 70点の自動選定へ使用し、オッズ・公式結果とは分離"
);
