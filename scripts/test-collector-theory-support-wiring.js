"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "../js/prediction-simple-evaluation.js");
const source = fs.readFileSync(file, "utf8");
const modules = [
  "prediction-flow-priority",
  "prediction-st-exhibition-support",
  "prediction-venue-water-support",
  "prediction-skill-local-support",
  "prediction-motor-engine-support",
  "prediction-engine-integration"
];

let previous = -1;
for (const name of modules) {
  const index = source.indexOf(`./${name}`);
  if (index < 0) throw new Error(`${name} がNode履歴収集へ接続されていません`);
  if (index <= previous) throw new Error(`${name} の接続順が本番runtimeと一致していません`);
  previous = index;
}
if (!source.includes('typeof module !== "undefined"') || !source.includes('typeof require === "function"')) {
  throw new Error("ブラウザへNode専用requireを漏らさない安全条件がありません");
}

global.window = global;
global.addEventListener = () => {};
global.document = { addEventListener() {} };
require("../js/boat-identity");
require("../js/ai-core");
global.createPrediction = () => ({ flowPriority: { attackBoatNo: 3 } });
require("../js/prediction-flow-priority");
require("../js/prediction-st-exhibition-support");

const officialPreparedEntries = [
  { boatNo: 1, avgSt: 0.16, averageSt: 0.16, exhibitionSt: 0.15, currentSeries: { st: [0.15, 0.16] } },
  { boatNo: 2, avgSt: 0.18, averageSt: 0.18, exhibitionSt: 0.14, currentSeries: { st: [0.17, 0.18] } },
  { boatNo: 3, avgSt: 0.14, averageSt: 0.14, exhibitionSt: 0.13, currentSeries: { st: [0.09, 0.11] } },
  { boatNo: 4, avgSt: 0.17, averageSt: 0.17, exhibitionSt: 0.12, currentSeries: { st: [0.16, 0.17] } },
  { boatNo: 5, avgSt: 0.19, averageSt: 0.19, exhibitionSt: 0.11, currentSeries: { st: [0.18, 0.19] } },
  { boatNo: 6, avgSt: 0.20, averageSt: 0.20, exhibitionSt: 0.10, currentSeries: { st: [0.19, 0.20] } }
];
const prediction = global.ChappyPredictionSTExhibitionSupport.enhance(
  { flowPriority: { attackBoatNo: 3 } },
  { entries: officialPreparedEntries }
);

assert.equal(prediction.flowSupport.dataCoverage.st, 6, "公式収集のlower-camel ST項目を6艇分読む");
assert.equal(prediction.flowSupport.attackSTRank, 1, "今節ST平均を優先して攻め艇順位を作る");
assert.match(prediction.flowSupport.confirms.join(" "), /スリット上位/);

const theorySnapshot = require("../js/theory-tag-snapshot").build(
  prediction,
  [{ ticket: "3-1-2", category: "本線" }]
);
const startTheory = theorySnapshot.theories.find(row => row.theoryKey === "stSlit");
assert.ok(startTheory, "公式収集入力からST・スリットの正式証拠を保存する");
assert.deepEqual(startTheory.tickets, ["3-1-2"]);
assert.equal(
  theorySnapshot.evidenceDiagnostics.rows.find(row => row.theoryKey === "start")?.formal,
  true
);

const courseByBoat = {
  1: 6,
  2: 2,
  3: 1,
  4: 4,
  5: 5,
  6: 3
};
const nonIdentityData = {
  entries: [1, 2, 3, 4, 5, 6].map(boat => ({
    boat,
    racerName: `${boat}号艇`,
    currentST: {
      1: 0.17,
      2: 0.05,
      3: 0.16,
      4: 0.21,
      5: 0.01,
      6: 0.20
    }[boat],
    exhibitionTime: 6.8 + boat * 0.01
  })),
  startExhibition: [1, 2, 3, 4, 5, 6].map(boat => ({
    boat,
    course: courseByBoat[boat],
    st: 0.10 + boat * 0.01,
    isOfficialCourse: true,
    mappingSource: "official-start-image"
  }))
};
const mappedFlow = global.ChappyPredictionFlowPriority.build({
  raceFlow: {
    attacker: 3,
    attackBoats: [{ boatNo: 6, course: 6 }]
  },
  mainSheet: { honmei: { boatNo: 6 } },
  race: { raw: nonIdentityData }
}, nonIdentityData);

assert.equal(mappedFlow.attackBoatNo, 6);
assert.equal(mappedFlow.attackCourse, 3);
assert.equal(mappedFlow.title, "3コース攻め中心");
assert.match(mappedFlow.mainComment, /6号艇の3コース攻め/);
assert.match(mappedFlow.mainComment, /3・2号艇の残し/);
assert.deepEqual(
  mappedFlow.remains,
  ["3号艇のイン残り", "2号艇の差し残り"]
);

const storedMappedFlow =
  global.ChappyPredictionFlowPriority.build({
    preRaceConditions: nonIdentityData,
    entries: nonIdentityData.entries,
    raceFlow: {
      attacker: 3,
      attackBoats: [{ boatNo: 6, course: 6 }]
    },
    mainSheet: { honmei: { boatNo: 6 } }
  });
assert.deepEqual(
  storedMappedFlow,
  mappedFlow,
  "保存済みpreRaceConditionsからも展開の公式進入写像を復元する"
);

const identityFlow = global.ChappyPredictionFlowPriority.build({
  raceFlow: {
    attackBoats: [{ boatNo: 3, course: 3 }]
  },
  mainSheet: { honmei: { boatNo: 3 } }
});
assert.equal(
  identityFlow.mainComment,
  "3号艇の攻めを中心に、1・2号艇の残しと外の展開拾いを評価する。",
  "枠なり表示の既存文言を変更しない"
);

const mappedSupport = global.ChappyPredictionSTExhibitionSupport.build(
  {
    flowPriority: {
      ...mappedFlow,
      attackCourse: 6
    }
  },
  nonIdentityData
);
assert.equal(mappedSupport.attackBoatNo, 6);
assert.equal(mappedSupport.attackCourse, 3);
assert.match(
  mappedSupport.alerts.join(" "),
  /2号艇が6号艇よりSTで0\.10以上先行/,
  "実2コース艇を3コース攻め艇の隣接艇として比較する"
);
assert.doesNotMatch(
  mappedSupport.alerts.join(" "),
  /5号艇が6号艇よりSTで0\.10以上先行/,
  "物理艇番だけが隣の5号艇を比較しない"
);

const storedMappedSupport =
  global.ChappyPredictionSTExhibitionSupport.build({
    preRaceConditions: nonIdentityData,
    entries: nonIdentityData.entries,
    flowPriority: {
      ...mappedFlow,
      attackCourse: 6
    }
  });
assert.equal(storedMappedSupport.attackCourse, 3);
assert.match(
  storedMappedSupport.alerts.join(" "),
  /2号艇が6号艇よりSTで0\.10以上先行/,
  "保存済みpreRaceConditionsでも実コース隣接のSTを使う"
);

const partialCourseData = {
  ...nonIdentityData,
  startExhibition:
    nonIdentityData.startExhibition.slice(0, 5)
};
const partialSupport =
  global.ChappyPredictionSTExhibitionSupport.build(
    {
      flowPriority: {
        attackBoatNo: 4,
        attackCourse: 1
      }
    },
    partialCourseData
  );
assert.equal(
  partialSupport.attackCourse,
  4,
  "公式6艇写像が欠ける時は部分コースを使わず物理艇番へ戻す"
);

console.log("collector theory support wiring tests passed");
