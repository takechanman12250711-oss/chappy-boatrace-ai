"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");
const boundary = require("../js/ai-correction-boundary");

const data = {
  stadiumCode: "12",
  raceNo: 8,
  entries: [
    { boat: 1, racerName: "1号艇", className: "A2", avgSt: 0.18, exhibitionTime: 6.86, nationalWinRate: 6.1, localWinRate: 6.0, motorTwoRate: 35 },
    { boat: 2, racerName: "2号艇", className: "A2", avgSt: 0.17, exhibitionTime: 6.84, nationalWinRate: 5.8, localWinRate: 5.7, motorTwoRate: 34 },
    { boat: 3, racerName: "3号艇", className: "A1", avgSt: 0.09, exhibitionTime: 6.62, nationalWinRate: 6.8, localWinRate: 7.0, motorTwoRate: 38 },
    { boat: 4, racerName: "4号艇", className: "A2", avgSt: 0.18, exhibitionTime: 6.88, nationalWinRate: 5.4, localWinRate: 5.2, motorTwoRate: 33 },
    { boat: 5, racerName: "5号艇", className: "A2", avgSt: 0.14, exhibitionTime: 6.75, nationalWinRate: 5.9, localWinRate: 6.7, motorTwoRate: 36 },
    { boat: 6, racerName: "6号艇", className: "B1", avgSt: 0.16, exhibitionTime: 6.79, nationalWinRate: 5.3, localWinRate: 6.3, motorTwoRate: 32 }
  ]
};

assert.equal(
  global.ChappyAICore.__theoryBoundaryInstalled,
  true,
  "ai-coreへAI補正境界を接続する"
);

const prediction = global.ChappyAICore.buildPredictionData(data);
const original = boundary.snapshotTheory(prediction);

assert.equal(
  prediction.theoryBoundary.source,
  "raceScenarios",
  "展開シナリオ由来の理論境界を保持する"
);

const maliciousCorrection = {
  confidence: 74,
  dangerScore: 31,
  warnings: ["展示変化を再確認"],
  reasons: ["AIは監査情報だけを追加"],
  marks: {
    honmei: { boatNo: 6 },
    taikou: { boatNo: 5 }
  },
  formations: {
    main: ["6-5-4"],
    safety: ["5-6-4"],
    flow: ["6-5-4"],
    longshot: ["4-6-5"]
  }
};

global.ChappyAICore.applyAiCorrection(
  prediction,
  maliciousCorrection
);

assert.deepEqual(
  boundary.snapshotTheory(prediction),
  original,
  "AI補正へ印・買い目を渡しても理論結果を変更しない"
);
assert.equal(prediction.aiCorrection.role, "audit-only");
assert.equal(prediction.aiCorrection.confidence, 74);
assert.equal(prediction.aiCorrection.dangerScore, 31);
assert.deepEqual(
  prediction.aiCorrection.warnings,
  ["展示変化を再確認"]
);
assert.equal(
  Object.hasOwn(prediction.aiCorrection, "marks"),
  false,
  "AI補正に印を保持させない"
);
assert.equal(
  Object.hasOwn(prediction.aiCorrection, "formations"),
  false,
  "AI補正に買い目を保持させない"
);

prediction.marks.honmei.boatNo = 6;
prediction.formations.main = ["6-5-4"];
boundary.apply(prediction, { danger: "理論結果との不一致を修復" });

assert.deepEqual(
  boundary.snapshotTheory(prediction),
  original,
  "後段で印・買い目が改変されても理論スナップショットへ戻す"
);

console.log("AI補正境界テスト: 合格");
console.log("- AI補正: 信頼度・危険度・注意情報のみ");
console.log("- 印・買い目: raceScenarios由来を維持");
console.log("- 後段改変: 理論結果へ自動復元");
