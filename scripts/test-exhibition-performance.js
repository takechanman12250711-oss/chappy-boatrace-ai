"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/ai-core");
require("../js/prediction");

const aiCore = global.ChappyAICore;

function entry(
  boatNo,
  exhibitionTime = null,
  lapTime = null,
  exhibitionSt = 0.15
) {
  return {
    boatNo,
    racerName: `${boatNo}号艇`,
    avgSt: 0.15,
    exhibitionSt,
    exhibitionTime,
    lapTime
  };
}

const noData = Array.from(
  { length: 6 },
  (_, index) => entry(index + 1)
);
const noDataTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    noData
  );

assert.equal(noDataTheory.mode, "provisional");
assert.equal(noDataTheory.isFormal, false);
assert.ok(
  noDataTheory.roles.every(
    (boat) => boat.appliedIndex === 50
  ),
  "完全未取得は全艇を中立50点にする"
);

const officialEntries = [
  entry(1, 6.70),
  entry(2, 6.71),
  entry(3, 6.74),
  entry(4, 6.77),
  entry(5, 6.80),
  entry(6, 6.84)
];
const officialTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    officialEntries,
    {
      exhibitionSource:
        "BOAT RACE公式"
    }
  );

assert.equal(officialTheory.mode, "official");
assert.equal(officialTheory.isFormal, true);
assert.equal(officialTheory.exhibitionCount, 6);
assert.equal(officialTheory.lapCount, 0);
assert.equal(officialTheory.source.label, "BOAT RACE公式");
assert.equal(
  officialTheory.roles.find(
    (boat) => boat.boatNo === 1
  ).exhibitionRank,
  1
);
assert.equal(
  officialTheory.roles.find(
    (boat) => boat.boatNo === 2
  ).exhibitionRank,
  1,
  "0.01秒以内は同等順位にする"
);
assert.ok(
  officialTheory.roles[0].appliedIndex >
    officialTheory.roles[5].appliedIndex,
  "展示タイムの順位と差を100点へ反映する"
);

const changedExhibitionSt =
  officialEntries.map((boat) => ({
    ...boat,
    exhibitionSt:
      boat.boatNo === 1 ? 0.30 : 0.01
  }));
const stChangedTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    changedExhibitionSt
  );

assert.deepEqual(
  stChangedTheory.roles.map(
    (boat) => boat.appliedIndex
  ),
  officialTheory.roles.map(
    (boat) => boat.appliedIndex
  ),
  "展示STは展示・足100点へ混ぜない"
);

const fullEntries = [
  entry(1, 6.70, 37.40),
  entry(2, 6.72, 37.43),
  entry(3, 6.74, 37.46),
  entry(4, 6.76, 37.49),
  entry(5, 6.78, 37.52),
  entry(6, 6.80, 37.55)
];
const fullTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    fullEntries,
    {
      exhibitionSource:
        "BOAT RACE公式",
      source: {
        exhibition:
          "BOAT RACE公式"
      }
    }
  );
const fullBoat1 = fullTheory.roles.find(
  (boat) => boat.boatNo === 1
);

assert.equal(fullTheory.mode, "full");
assert.equal(fullTheory.isFullMode, true);
assert.equal(fullTheory.doubleTimeBoat, 1);
assert.equal(fullBoat1.isDoubleTime, true);
assert.equal(fullBoat1.components.doubleTime, 5);
assert.equal(
  Number(
    Object.values(fullBoat1.components)
      .reduce(
        (sum, value) => sum + Number(value || 0),
        0
      )
      .toFixed(1)
  ),
  fullBoat1.score,
  "フルモードの7要素合計を100点にする"
);

const partialLap = fullEntries.map(
  (boat) =>
    boat.boatNo === 6
      ? { ...boat, lapTime: null }
      : boat
);
const partialTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    partialLap
  );

assert.equal(
  partialTheory.mode,
  "official",
  "一周不足時は展示6艇による公式展示モードを使う"
);
assert.ok(
  partialTheory.roles.every(
    (boat) => boat.isFormal
  )
);

const abnormalEntries =
  officialEntries.map(
    (boat) =>
      boat.boatNo === 3
        ? {
            ...boat,
            exhibitionTime: 9.99
          }
        : boat
  );
const abnormalTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    abnormalEntries
  );

assert.equal(abnormalTheory.mode, "provisional");
assert.ok(
  abnormalTheory.roles.every(
    (boat) => boat.appliedIndex === 50
  ),
  "異常値があれば新しい展示点を反映しない"
);

const duplicateEntries =
  officialEntries.map((boat) => ({ ...boat }));
duplicateEntries[5].boatNo = 5;
const duplicateTheory =
  aiCore.buildExhibitionPerformanceEvaluation(
    duplicateEntries
  );

assert.equal(duplicateTheory.mode, "provisional");
assert.ok(
  duplicateTheory.roles.every(
    (boat) => boat.appliedIndex === 50
  ),
  "艇番重複時は中立50点を維持する"
);

function analysis(boatNo) {
  return {
    boatNo,
    playerName: `${boatNo}号艇`,
    indexes: {
      total: 68,
      st: 65,
      exhibition: 50,
      raceFlow: 66,
      local: 60
    },
    roleScores: {
      attack: 65,
      flow: 65,
      hold: 65,
      pickup: 65,
      road: 65
    }
  };
}

const analyses = fullEntries.map(
  (boat) => analysis(boat.boatNo)
);
const reversedTimes = fullEntries.map(
  (boat, index) => ({
    ...boat,
    exhibitionTime:
      fullEntries[5 - index]
        .exhibitionTime,
    lapTime:
      fullEntries[5 - index].lapTime
  })
);
const scenariosA =
  aiCore.buildRaceScenarios(
    analyses,
    {
      stadiumCode: "12",
      entries: fullEntries
    }
  );
const scenariosB =
  aiCore.buildRaceScenarios(
    analyses,
    {
      stadiumCode: "12",
      entries: reversedTimes
    }
  );

assert.deepEqual(
  scenariosA.scenarios.map(
    (scenario) => ({
      type: scenario.type,
      score: scenario.score,
      outcomes:
        scenario.outcome.boats.map(
          (boat) => [
            boat.boatNo,
            boat.firstScore,
            boat.secondScore,
            boat.thirdScore
          ]
        )
    })
  ),
  scenariosB.scenarios.map(
    (scenario) => ({
      type: scenario.type,
      score: scenario.score,
      outcomes:
        scenario.outcome.boats.map(
          (boat) => [
            boat.boatNo,
            boat.firstScore,
            boat.secondScore,
            boat.thirdScore
          ]
        )
    })
  ),
  "展示・一周を展開・役割・着順候補へ別枠加点しない"
);

const integratedPrediction =
  global.createPrediction({
    date: "20260724",
    stadiumCode: "12",
    stadiumName: "住之江",
    raceNo: 1,
    entries: fullEntries.map(
      (boat) => ({
        ...boat,
        className:
          boat.boatNo === 1
            ? "A1"
            : "B1",
        nationalWinRate: 5.5,
        localWinRate: 5.3,
        motor2Rate: 32
      })
    )
  });

assert.equal(
  integratedPrediction
    .exhibitionPerformanceTheory
    ?.mode,
  "full",
  "prediction.jsもAIコアの統一展示判定を使用する"
);
assert.equal(
  integratedPrediction
    .exhibitionPerformanceTheory
    ?.roles?.length,
  6
);

console.log(
  "展示・足理論 Ver2 専用テスト: 合格"
);
console.log(
  "- 公式展示／フル／同タイム／欠損／異常値を確認"
);
console.log(
  "- 展示ST・ダブルタイム・新サムの二重加点なし"
);
