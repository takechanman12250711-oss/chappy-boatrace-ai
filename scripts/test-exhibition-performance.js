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

// 内隣展示差: 実進入と艇番の混同、ST秒との混同、境界値、保存時の欠測を検査。
const adjacentEntries = [6.80, 6.70, 6.69, 6.79, 6.78, 6.68].map((time, index) => ({
  ...entry(index + 1, time),
  startExhibition: { boat: index + 1, course: index + 1, isOfficialCourse: true }
}));
const beforeAdjacent = JSON.stringify(adjacentEntries);
const adjacent = aiCore.buildAdjacentExhibitionEvidence(adjacentEntries);
const rowAt = (evidence, no) => evidence.rows.find(row => row.boatNo === no);
assert.equal(rowAt(adjacent, 2).alert, true, "0.10秒ちょうどを成立とする");
assert.equal(rowAt(adjacent, 3).alert, false, "外隣より速くても内隣との差で判定");
assert.equal(rowAt(adjacent, 4).alert, false, "遅い側へ警報を付けない");
assert.equal(rowAt(adjacent, 1).alert, null, "1コースを対象外にする");
assert.equal(rowAt(adjacent, 2).superAlert, null, "平均ST秒があっても一般戦平均順位には代用しない");
const belowThreshold = structuredClone(adjacentEntries);
belowThreshold[1].exhibitionTime = 6.7004;
assert.equal(rowAt(aiCore.buildAdjacentExhibitionEvidence(belowThreshold), 2).alert, false,
  "表示用丸めで0.10秒未満を成立させない");

const swapped = structuredClone(adjacentEntries);
swapped[1].startExhibition.course = 3;
swapped[5].startExhibition.course = 2;
swapped[2].startExhibition.course = 6;
const reordered = aiCore.buildAdjacentExhibitionEvidence(swapped.slice().reverse());
assert.equal(rowAt(reordered, 2).insideBoatNo, 6);
assert.equal(rowAt(reordered, 2).alert, false);
assert.equal(rowAt(reordered, 6).insideBoatNo, 1);
assert.equal(rowAt(reordered, 6).alert, true, "6号艇でも実2コースなら1コース艇と比較");
for (const mutate of [
  rows => { rows[5].startExhibition.course = 5; },
  rows => { delete rows[5].startExhibition; },
  rows => { rows[5].exhibitionTime = null; },
  rows => { rows[5].boatNo = 5; },
  rows => { rows[5].exhibitionTime = 9.99; }
]) {
  const invalid = structuredClone(adjacentEntries); mutate(invalid);
  assert(aiCore.buildAdjacentExhibitionEvidence(invalid).rows.every(row => row.alert === null));
}

const adjacentPerformance = aiCore.buildExhibitionPerformanceEvaluation(adjacentEntries);
assert.equal(adjacentPerformance.roles[1].components.exhibitionNeighborGap, 20);
assert.equal(adjacentPerformance.roles[2].components.exhibitionNeighborGap, 10,
  "0.01秒以内は同等評価");
const fullAdjacent = aiCore.buildExhibitionPerformanceEvaluation(
  adjacentEntries.map(row => ({ ...row, lapTime: 37.5 }))
);
assert.equal(fullAdjacent.roles[1].components.exhibitionInsideGap, 12);
assert.equal(fullAdjacent.roles[1].components.exhibitionAverageDiff, undefined,
  "フルモードも従来の差成分と置き換え、追加加点しない");
assert.deepEqual(aiCore.buildAdjacentExhibitionEvidence(adjacentEntries.map(row => ({
  ...row, avgSt: 0.01, exhibitionSt: 0.40, avgSTRank: 1, startRank: 1
}))), adjacent, "展示ST・平均ST・推測した順位を内隣展示差やスーパーに混ぜない");

const adjacentData = { source: "boatrace-official", entries: adjacentEntries, stadiumCode: "12" };
const coreAdjacent = aiCore.buildPredictionData(adjacentData);
const changedInside = structuredClone(adjacentData);
[changedInside.entries[0].exhibitionTime, changedInside.entries[2].exhibitionTime] =
  [changedInside.entries[2].exhibitionTime, changedInside.entries[0].exhibitionTime];
const coreChangedInside = aiCore.buildPredictionData(changedInside);
const evaluated2 = core => core.analyses.find(row => row.boatNo === 2);
assert.equal(evaluated2(coreAdjacent).exhibitionPerformanceTheory.exhibitionRank,
  evaluated2(coreChangedInside).exhibitionPerformanceTheory.exhibitionRank);
assert(evaluated2(coreAdjacent).indexes.exhibition > evaluated2(coreChangedInside).indexes.exhibition,
  "対象艇のタイム・順位・全体平均が同じでも内隣のタイムで展示評価が変わる");
assert(evaluated2(coreAdjacent).indexes.total > evaluated2(coreChangedInside).indexes.total,
  "内隣差の変更が表示だけでなく総合9%枠へ到達する");
assert.equal(evaluated2(coreAdjacent).indexes.st, evaluated2(coreChangedInside).indexes.st);
assert.deepEqual(coreAdjacent.exhibitionPerformanceTheory.adjacentExhibition, adjacent);
assert.deepEqual(coreAdjacent.raceScenarios.evidence.adjacentExhibition, adjacent);
assert(coreAdjacent.comments.some(text => /内隣展示アラート/.test(text)));
const conditions = require("../js/prediction-conditions");
const captured = conditions.capture(adjacentData, { aiCore: coreAdjacent });
assert.deepEqual(captured.adjacentExhibitionEvidence, adjacent);
captured.adjacentExhibitionEvidence.rows[1].alert = false;
assert.equal(coreAdjacent.exhibitionPerformanceTheory.adjacentExhibition.rows[1].alert, true);
assert.equal(conditions.capture({}, {}).adjacentExhibitionEvidence, null, "旧保存予想へ再計算しない");
require("../js/prediction-st-exhibition-support");
const support = global.ChappyPredictionSTExhibitionSupport.build({
  aiCore: coreAdjacent, flowPriority: { attackBoatNo: 2 }
}, adjacentData);
assert.match(support.comment, /内隣の1号艇.*0.10秒速い/);
const innerSupport = global.ChappyPredictionSTExhibitionSupport.build({
  aiCore: coreAdjacent, flowPriority: { attackBoatNo: 1 }
}, adjacentData);
assert.match(innerSupport.alerts.join(" "), /中心艇の外隣に展示優位/);
assert.equal(JSON.stringify(adjacentEntries), beforeAdjacent, "公式取得原本を変更しない");
console.log("- 内隣展示差: 境界・実進入・欠測・9%枠内の置換・説明・不変保存が合格");
