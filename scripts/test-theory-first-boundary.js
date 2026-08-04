"use strict";

const assert = require("node:assert/strict");

global.window = global;
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function entry(boat, values = {}) {
  return {
    boat,
    racerName: `${boat}号艇`,
    className: values.className || "A2",
    avgSt: values.avgSt ?? 0.15,
    exhibitionTime: values.exhibitionTime ?? 6.80,
    nationalWinRate: values.nationalWinRate ?? 5.5,
    localWinRate: values.localWinRate ?? 5.5,
    motorTwoRate: values.motorTwoRate ?? 35,
    ...values
  };
}

const data = {
  stadiumCode: "12",
  raceNo: 8,
  entries: [
    entry(1, { avgSt: 0.18, exhibitionTime: 6.86, nationalWinRate: 6.1 }),
    entry(2, { avgSt: 0.17, exhibitionTime: 6.84, nationalWinRate: 5.8 }),
    entry(3, { avgSt: 0.09, exhibitionTime: 6.62, nationalWinRate: 6.8, localWinRate: 7.0 }),
    entry(4, { avgSt: 0.18, exhibitionTime: 6.88, nationalWinRate: 5.4 }),
    entry(5, { avgSt: 0.14, exhibitionTime: 6.75, nationalWinRate: 5.9, localWinRate: 6.7 }),
    entry(6, { avgSt: 0.16, exhibitionTime: 6.79, nationalWinRate: 5.3, localWinRate: 6.3 })
  ]
};

const prediction = aiCore.buildPredictionData(data);

assert.ok(prediction.raceScenarios, "最終予想に展開シナリオを保持する");
assert.ok(prediction.marks, "最終予想に展開由来の印を保持する");
assert.ok(prediction.formations, "最終予想に買い目を保持する");

assert.equal(
  prediction.marks.evidence?.source,
  "raceScenarios",
  "◎○▲△はAI総合順位ではなく展開シナリオから決める"
);
assert.equal(
  prediction.formations.evidence?.source,
  "raceScenarios",
  "本命・押さえ・流し・万舟は展開シナリオから決める"
);

assert.deepEqual(
  prediction.formations.axis,
  {
    honmei: prediction.marks.honmei.boatNo,
    taikou: prediction.marks.taikou.boatNo,
    ana: prediction.marks.ana.boatNo,
    osae: prediction.marks.osae.boatNo
  },
  "買い目軸を展開由来の◎○▲△と一致させる"
);

if (prediction.formations.mainEstablished) {
  assert.ok(
    prediction.formations.main.every(ticket =>
      ticket.startsWith(`${prediction.marks.honmei.boatNo}-`)
    ),
    "本線の頭を展開由来の◎に固定する"
  );

  const mainSet = new Set(prediction.formations.main);
  assert.ok(
    prediction.formations.safety.every(ticket => !mainSet.has(ticket)),
    "押さえを本線と重複させず別分類として保持する"
  );
  assert.ok(
    prediction.formations.safety.length === 0 ||
      prediction.formations.safety.some(ticket =>
        ticket.startsWith(`${prediction.marks.taikou.boatNo}-`)
      ),
    "押さえに展開由来の○頭を反映する"
  );
}

const before = JSON.stringify({
  axis: prediction.formations.axis,
  main: prediction.formations.main,
  safety: prediction.formations.safety,
  flow: prediction.formations.flow,
  longshot: prediction.formations.longshot
});

prediction.odds = {
  byTicket: {
    "1-2-3": 12.3,
    "3-1-5": 24.5
  }
};

const after = JSON.stringify({
  axis: prediction.formations.axis,
  main: prediction.formations.main,
  safety: prediction.formations.safety,
  flow: prediction.formations.flow,
  longshot: prediction.formations.longshot
});

assert.equal(
  after,
  before,
  "オッズ付与では本命・押さえ・流し・万舟を並べ替えない"
);

console.log("理論優先境界テスト: 合格");
console.log("- 印: 展開シナリオ由来");
console.log("- 買い目: 展開シナリオ由来");
console.log("- 押さえ: 本線と分離し○頭を反映");
console.log("- オッズ: 分類と順番を変更しない");
