"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/utils");
require("../js/ai-core");
require("../js/theory");

const aiCore = global.ChappyAICore;
const theory = global.ChappyTheory;

function entry(boatNo, exhibitionSt, avgSt = 0.15, currentSt = []) {
  return {
    boatNo,
    registerNo: String(4100 + boatNo),
    racerName: `${boatNo}号艇`,
    className: boatNo === 3 ? "A1" : "B1",
    avgSt,
    exhibitionSt,
    fCount: 0,
    currentSeries: { st: currentSt },
    startExhibition: {
      boat: boatNo,
      course: boatNo,
      isOfficialCourse: true,
      mappingSource:
        "official-start-image"
    },
    exhibitionTime: 6.8,
    lapTime: 37.5
  };
}

function courseHistory(
  course,
  starts,
  averageSt,
  stStdDev = 0.022
) {
  return {
    course,
    starts,
    averageSt,
    stStdDev,
    stRange:
      Number(
        (stStdDev * 4).toFixed(3)
      )
  };
}

function historyContext(sourceEntries) {
  return {
    racers: sourceEntries.map(boat => ({
      registerNo: boat.registerNo,
      skillHistory: {
        windows: {
          all3Years: {
            byCourse: {
              [boat.boatNo]:
                courseHistory(
                  boat.boatNo,
                  36,
                  boat.avgSt || 0.16
                )
            }
          },
          recent1Year: {
            byCourse: {
              [boat.boatNo]:
                courseHistory(
                  boat.boatNo,
                  18,
                  boat.avgSt || 0.16,
                  0.02
                )
            }
          },
          previous2Years: {
            byCourse: {
              [boat.boatNo]:
                courseHistory(
                  boat.boatNo,
                  18,
                  (boat.avgSt || 0.16) +
                    0.01,
                  0.025
                )
            }
          }
        }
      }
    }))
  };
}

const entries = [
  entry(1, 0.14),
  entry(2, 0.16),
  entry(3, 0.04, 0.14, [0.12, 0.14, 0.13]),
  entry(4, 0.18),
  entry(5, 0.15),
  entry(6, 0.16)
];
const formalData = {
  stadiumCode: "12",
  historyContext:
    historyContext(entries)
};

const slit = aiCore.buildSlitAnalysis(entries, {
  inPower: 60,
  sashi: 60,
  makuri: 60,
  kado: 60,
  makuriSashi: 60,
  outside: 60
}, formalData);

const boat3 = slit.ranking.find((boat) => boat.boatNo === 3);
const boat4 = slit.ranking.find((boat) => boat.boatNo === 4);

assert.equal(slit.source, "neighbor-exhibition-st");
assert.equal(slit.threshold, 0.10);
assert.equal(slit.attackBoat, 3);
assert.equal(boat3.slitAlert, true);
assert.equal(boat3.slitDiff, 0.14);
assert.equal(boat3.comparedBoatNo, 4);
assert.equal(boat3.isStableBoat, true);
assert.equal(boat3.isAttackBoat, true);
assert.equal(boat3.stTheory.isFormal, true);
assert.equal(boat4.slitAlert, false, "遅い側を攻め警報にしない");
assert.equal(boat4.slitRisk, true);
assert.equal(boat4.slitLossDiff, 0.14);

const data = {
  ...formalData,
  stadiumCode: "12",
  entries,
  startExhibition:
    entries.map(boat => ({
      ...boat.startExhibition,
      st: boat.exhibitionSt
    }))
};

const analyses = entries.map((boat) => ({
  boatNo: boat.boatNo,
  playerName: boat.racerName,
  indexes: {
    total: 65,
    st: 65,
    exhibition: 65,
    raceFlow: 65,
    local: 60
  },
  roleScores: {
    attack: 65,
    flow: 65,
    hold: 65,
    pickup: 65,
    road: 65
  }
}));

const scenarios = aiCore.buildRaceScenarios(analyses, data);
const threeAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "threeAttack"
);
const fourAttack = scenarios.scenarios.find(
  (scenario) => scenario.type === "fourAttack"
);

assert.equal(threeAttack.slitAdjustment, 8);
assert.equal(fourAttack.slitAdjustment, -8);
assert.equal(scenarios.evidence.slit.alerts[0].boatNo, 3);
assert.equal(scenarios.evidence.slit.risks[0].boatNo, 4);

const noExhibition = entries.map(({ exhibitionSt, ...boat }) => boat);
const noExhibitionSlit = aiCore.buildSlitAnalysis(noExhibition, {
  inPower: 60,
  sashi: 60,
  makuri: 60,
  kado: 60,
  makuriSashi: 60,
  outside: 60
}, {
  ...formalData,
  historyContext:
    historyContext(noExhibition)
});

assert.equal(noExhibitionSlit.alerts.length, 0);
assert.equal(noExhibitionSlit.risks.length, 0);
assert.equal(noExhibitionSlit.attackBoat, null);

const theoryAlerts = theory.calcSlitAlerts([
  { boatNo: 3, course: 3, exhibitionST: 0.04 },
  { boatNo: 1, course: 1, exhibitionST: 0.14 },
  { boatNo: 4, course: 4, exhibitionST: 0.18 },
  { boatNo: 2, course: 2, exhibitionST: 0.16 }
]);

assert.deepEqual(
  theoryAlerts.map((alert) => alert.boatNo),
  [3],
  "理論表示も進入順の符号付き比較で速い艇だけを警報にする"
);
assert.equal(theoryAlerts[0].comparedBoatNo, 4);
assert.equal(theoryAlerts[0].diff, 0.14);

const unsupportedEntries = entries.map((boat) => ({
  ...boat,
  avgSt: null,
  currentSeries: { st: [] }
}));
const unsupportedAnalyses = unsupportedEntries.map((boat) => ({
  boatNo: boat.boatNo,
  playerName: boat.racerName,
  indexes: {
    total: 65,
    st: 65,
    exhibition: 65,
    raceFlow: 65,
    local: 60
  },
  roleScores: {
    attack: 65,
    flow: 65,
    hold: 65,
    pickup: 65,
    road: 65
  }
}));
const unsupportedScenarios = aiCore.buildRaceScenarios(
  unsupportedAnalyses,
  {
    stadiumCode: "12",
    entries: unsupportedEntries,
    startExhibition:
      unsupportedEntries.map(
        boat => ({
          ...boat.startExhibition,
          st: boat.exhibitionSt
        })
      ),
    historyContext:
      historyContext(
        unsupportedEntries
      )
  }
);
const unsupportedThree = unsupportedScenarios.scenarios.find(
  (scenario) => scenario.type === "threeAttack"
);

assert.equal(
  unsupportedThree.slitAdjustment,
  0,
  "平均・今節STの裏付けがない単発展示STだけでは展開を加点しない"
);

const moderateEntries = entries.map(boat => ({
  ...boat,
  exhibitionSt:
    boat.boatNo === 3
      ? 0.09
      : boat.boatNo === 4
        ? 0.16
        : 0.14
}));
const moderate = aiCore.buildSlitAnalysis(
  moderateEntries,
  {
    inPower: 60,
    sashi: 60,
    makuri: 60,
    kado: 60,
    makuriSashi: 60,
    outside: 60
  },
  {
    stadiumCode: "12",
    historyContext:
      historyContext(
        moderateEntries
      )
  }
);
const moderateBoat3 =
  moderate.ranking.find(
    boat => boat.boatNo === 3
  );
assert.equal(
  moderateBoat3.slitAdvantage,
  true,
  "0.05〜0.09差を攻め優勢候補として分離する"
);
assert.equal(
  moderateBoat3.slitAlert,
  false,
  "0.05〜0.09差を明確な警報へ格上げしない"
);

const flyingEntries = entries.map(boat => ({
  ...boat,
  fCount:
    boat.boatNo === 3 ? 1 : 0,
  currentSeries:
    boat.boatNo === 3
      ? { st: [] }
      : boat.currentSeries
}));
const flying = aiCore.buildSlitAnalysis(
  flyingEntries,
  {
    inPower: 60,
    sashi: 60,
    makuri: 60,
    kado: 60,
    makuriSashi: 60,
    outside: 60
  },
  {
    stadiumCode: "12",
    historyContext:
      historyContext(
        flyingEntries
      )
  }
);
const flyingBoat3 =
  flying.ranking.find(
    boat => boat.boatNo === 3
  );
assert.equal(
  flyingBoat3.slitAlert,
  true,
  "F持ちでも展示上の明確な隊形差は表示する"
);
assert.equal(
  flyingBoat3.isAttackBoat,
  false,
  "F持ちは今節STの裏付けなしで正式な攻め艇にしない"
);

const provisionalEntry = {
  ...entries[2],
  startExhibition: {
    ...entries[2].startExhibition,
    isOfficialCourse: false,
    mappingSource:
      "legacy-course-order"
  }
};
const provisionalEntries =
  entries.map(boat =>
    boat.boatNo === 3
      ? provisionalEntry
      : boat
  );
const provisional =
  aiCore.buildStFoundationEvaluation(
    provisionalEntry,
    provisionalEntries,
    formalData
  );
assert.equal(
  provisional.isFormal,
  false,
  "実進入が確定しない場合は新ST点を正式反映しない"
);
assert.equal(
  provisional.appliedToScore,
  false
);

const classA1 = {
  ...entries[2],
  className: "A1"
};
const classB2 = {
  ...entries[2],
  className: "B2"
};
const a1Evaluation =
  aiCore.buildStFoundationEvaluation(
    classA1,
    entries,
    formalData
  );
const b2Evaluation =
  aiCore.buildStFoundationEvaluation(
    classB2,
    entries,
    formalData
  );
assert.equal(
  a1Evaluation.score,
  b2Evaluation.score,
  "級別をST基礎点へ二重加算しない"
);

const integrated =
  aiCore.buildPredictionData(data);
const integratedBoat3 =
  integrated.analyses.find(
    boat => boat.boatNo === 3
  );
assert.equal(
  integratedBoat3.indexes.st,
  integratedBoat3.stTheory.score,
  "正式ST基礎点で既存ST指数を置き換える"
);
assert.equal(
  integrated.stSlitTheory.appliedWeight,
  0.10,
  "STの総合比重10％を維持する"
);
assert.equal(
  integrated.stSlitTheory.isFormal,
  true,
  "6艇の実進入と履歴がそろった場合に正式成立する"
);

console.log("ST・スリット理論専用テスト: 合格");
console.log("- 実進入コース別STを7項目100点で評価");
console.log("- 展示ST差0.05と0.10を分離");
console.log("- 速い艇と遅い艇を分離");
console.log("- F持ちは今節STの裏付けを必須化");
console.log("- 級別・攻め指数の二重加点なし");
console.log("- 4展開への補正は最大±8点");
