"use strict";

const assert = require("node:assert/strict");

global.window = global;
const selector = require("../js/practical-selection");
const noteGenerator = require("../js/note-generator");

function prediction(overrides = {}) {
  return {
    aiCore: {
      formations: {
        mainEstablished: true,
        evidence: { flow: false, longshot: false }
      }
    },
    mainSheet: {
      tickets: ["1-2-3", "1-3-2", "1-2-4", "1-4-2"],
      coverTickets: ["2-1-3", "2-1-4", "3-1-2"],
      flowTickets: ["3-1-4"]
    },
    manshuSheet: {
      tickets: ["4-1-5"]
    },
    ...overrides
  };
}

const standard = selector.select(prediction());
assert.equal(standard.status, "selected");
assert.equal(standard.tickets.length, 5);
assert.deepEqual(
  standard.tickets.map(item => item.category),
  ["本線", "本線", "本線", "押さえ", "押さえ"]
);

const maximumPrediction = prediction();
maximumPrediction.aiCore.formations.evidence = {
  flow: true,
  longshot: true
};
const maximum = selector.select(maximumPrediction);
assert.equal(maximum.tickets.length, 7);
assert.equal(maximum.tickets[5].category, "流し");
assert.equal(maximum.tickets[6].category, "万舟・穴");

const flowOnlyPrediction = prediction();
flowOnlyPrediction.aiCore.formations.evidence = {
  flow: true,
  longshot: false
};
const flowOnly = selector.select(flowOnlyPrediction);
assert.equal(flowOnly.tickets.length, 6);
assert.equal(flowOnly.tickets[5].category, "流し");

const longshotOnlyPrediction = prediction();
longshotOnlyPrediction.aiCore.formations.evidence = {
  flow: false,
  longshot: true
};
const longshotOnly = selector.select(longshotOnlyPrediction);
assert.equal(longshotOnly.tickets.length, 6);
assert.equal(longshotOnly.tickets[5].category, "万舟・穴");

const missingEvidence = prediction();
missingEvidence.aiCore.formations.mainEstablished = false;
assert.equal(selector.select(missingEvidence).status, "skipped");
assert.equal(selector.createPracticalSelection(missingEvidence).length, 0);

const incompleteBase = prediction();
incompleteBase.mainSheet.coverTickets = ["2-1-3"];
assert.equal(selector.select(incompleteBase).status, "skipped");

const duplicatedBase = prediction();
duplicatedBase.mainSheet.coverTickets = [
  "1-2-3",
  "2-1-3",
  "2-1-3"
];
assert.equal(selector.select(duplicatedBase).status, "skipped");

const invalidBase = prediction();
invalidBase.mainSheet.tickets = [
  "1-1-2",
  "7-1-2",
  "1-2-3",
  "1-3-2"
];
assert.equal(selector.select(invalidBase).status, "skipped");

const duplicatedExtras = prediction();
duplicatedExtras.aiCore.formations.evidence = {
  flow: true,
  longshot: true
};
duplicatedExtras.mainSheet.flowTickets = ["1-2-3"];
duplicatedExtras.manshuSheet.tickets = ["2-1-3"];
const noForcedExtras = selector.select(duplicatedExtras);
assert.equal(noForcedExtras.status, "selected");
assert.equal(noForcedExtras.tickets.length, 5);
assert.deepEqual(
  noForcedExtras.tickets.map(item => item.category),
  ["本線", "本線", "本線", "押さえ", "押さえ"]
);

const tooManyExtras = prediction();
tooManyExtras.aiCore.formations.evidence = {
  flow: true,
  longshot: true
};
tooManyExtras.mainSheet.flowTickets = ["3-1-4", "3-4-1"];
tooManyExtras.manshuSheet.tickets = ["4-1-5", "5-1-4"];
assert.equal(selector.select(tooManyExtras).tickets.length, 7);

const noteTickets = noteGenerator.createPracticalSelection(maximumPrediction);
assert.deepEqual(noteTickets, maximum.tickets);

console.log("実戦厳選共通テスト: 合格");
console.log("- 基本5点: 本線3＋押さえ2");
console.log("- 最大7点: 根拠がある流し1＋万舟1のみ追加");
console.log("- 本線不成立・基本5点不足: 見送り");
console.log("- 重複・不正買い目: 除外し、基本5点不足なら見送り");
console.log("- 追加候補不足: 別の買い目で水増ししない");
console.log("- noteと共通処理: 完全一致");
