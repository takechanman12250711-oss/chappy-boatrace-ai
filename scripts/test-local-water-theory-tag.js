"use strict";
const assert = require("node:assert/strict");
const snapshot = require("../js/theory-tag-snapshot");

const prediction = {
  venueWaterSupport: {
    venue: "大村",
    wind: 4,
    wave: 2,
    tide: "満潮前",
    confirmations: ["イン有利を強く評価", "潮汐情報（満潮前）を展開補正に使用"],
    cautions: ["2差しは頭まで届きにくい傾向"]
  }
};

const result = snapshot.build(prediction, [
  { ticket: "1-3-4", category: "本線" },
  { ticket: "1-2-3", category: "押さえ" }
]);
const localWater = result.theories.find(row => row.theoryKey === "localWater");
assert.ok(localWater, "当地・水面の具体的補正がある場合は正式証拠化する");
assert.equal(localWater.ticketCount, 2);
assert.deepEqual(localWater.sources, ["venue-water-support"]);

const generic = snapshot.localWaterEvidence({
  venueWaterSupport: {
    venue: "未知場",
    wind: null,
    wave: null,
    tide: "",
    confirmations: ["開催場の水面特性を補助評価"],
    cautions: []
  }
});
assert.equal(generic.formal, false, "一般文だけでは当地・水面理論を水増ししない");

assert.equal(result.usableForPrediction, false);
assert.equal(result.automaticApplication, false);
console.log("local water theory tag tests passed");
