"use strict";

const assert = require("node:assert/strict");

global.window = global;
const noteGenerator = require("../js/note-generator");

assert.equal(
  noteGenerator.formatDeadlineLabel("締切時刻未取得"),
  "締切時刻未取得"
);
assert.equal(
  noteGenerator.formatDeadlineLabel("14:35"),
  "締切 14:35"
);

const duplicated =
  "3号艇の主筋から、4号艇が2着へ追走・残し、2号艇が3着で展開を拾う筋。 " +
  "3号艇の主筋から、4号艇が2着へ追走・残し、2号艇が3着で残る筋。";

assert.equal(
  noteGenerator.compactTicketComment(duplicated),
  "3号艇の主筋から、4号艇が2着へ追走・残し、2号艇が3着で展開を拾う筋。"
);

const different =
  "3号艇の主筋から、1号艇が2着に残る筋。 " +
  "4号艇が攻め切り、5号艇が3着を拾う筋。";

assert.equal(
  noteGenerator.compactTicketComment(different),
  different
);

global.ChappyPracticalSelection = {
  createPracticalSelection() {
    return [{
      ticket: "1-3-4",
      category: "流し",
      displayCategory:
        "フォーメーション",
      scenarioSummary:
        "同一1着軸の正式根拠から選んだ券。"
    }, {
      ticket: "2-3-1",
      category: "候補補完",
      displayCategory: "流し",
      scenarioSummary:
        "旧保存の流し候補。"
    }];
  }
};

const paidSection =
  noteGenerator.buildPaidSection({
    confidence: 80,
    manshuPower: 20,
    mainSheet: {
      flowTickets: [{
        ticket: "1-3-4",
        category: "流し"
      }, {
        ticket: "1-3-5",
        category: "流し"
      }]
    },
    ticketSheets: {}
  });

assert.match(
  paidSection,
  /［フォーメーション］/,
  "noteの実戦厳選も約束した表示名を使う"
);
assert.doesNotMatch(
  paidSection,
  /［流し］/,
  "noteの候補欄と実戦厳選で同一軸の券を流しと呼ばない"
);
assert.match(
  paidSection,
  /1-3-5[^\n]*［フォーメーション候補］/,
  "非選択の内部flow候補もユーザー向け名称で表示する"
);
assert.match(
  paidSection,
  /2-3-1[^\n]*［候補補完］/,
  "Tierを持たない旧保存行も最終分類で表示する"
);
assert.doesNotMatch(
  paidSection,
  /流し|2連単/,
  "note全文へ禁則語を残さない"
);

// Reduced from the saved 2026-09-28 Amagasaki 4R article: the global
// ranking reason named boat 4, while every saved main ticket used boat 1.
const rangeArticle = {
  ok: true,
  format: "formation-v4",
  freeText: "無料部分",
  paidText: "🔥 実戦厳選\n・1-2-3\n計 1点",
  fullText: "無料部分\n🔥 実戦厳選\n・1-2-3\n計 1点"
};
const rangePrediction = {
  raceFlow: { summary: "最有力展開は1号艇逃げ。" },
  mainSheet: {
    reason: "本命は4号艇。カド攻めを評価。",
    tickets: [{
      ticket: "1-2-3",
      scenarioSummary: "1号艇逃げから作られた本線候補。1号艇1着、2号艇2着、3号艇3着の順で評価する。"
    }, { ticket: "1-4-3" }],
    coverTickets: [{ ticket: "2-1-3" }],
    flowTickets: [{ ticket: "1-2-5" }]
  },
  manshuSheet: {
    reason: "5号艇の展開突きを評価。",
    tickets: [{ ticket: "5-1-3" }]
  }
};
const originalPrediction = JSON.stringify(rangePrediction);
const originalArticle = JSON.stringify(rangeArticle);
const corrected = noteGenerator.compactArticle(rangeArticle, rangePrediction);
assert.match(corrected.allRangeGroups[0].reason, /^1号艇逃げ/);
assert.doesNotMatch(corrected.paidText, /本命は4号艇/);
assert.deepEqual(corrected.allRangeGroups.map(group => group.tickets), [
  ["1-2-3", "1-4-3"], ["2-1-3"], ["1-2-5"], ["5-1-3"]
]);
assert.match(corrected.paidText, /🔥 実戦厳選\n+・1-2-3\n+計 1点/);
assert.equal(JSON.stringify(rangePrediction), originalPrediction, "保存予想を変更しない");
assert.equal(JSON.stringify(rangeArticle), originalArticle, "保存原稿を変更しない");
assert.equal(corrected.allRangeGroups[3].reason, rangePrediction.manshuSheet.reason);

const matchingPrediction = structuredClone(rangePrediction);
matchingPrediction.mainSheet.reason = "本命は1号艇。イン逃げを評価。";
assert.equal(noteGenerator.compactArticle(rangeArticle, matchingPrediction)
  .allRangeGroups[0].reason, matchingPrediction.mainSheet.reason);

const fallbackPrediction = structuredClone(rangePrediction);
fallbackPrediction.mainSheet.tickets[0].scenarioSummary = "本命は4号艇。";
assert.equal(noteGenerator.compactArticle(rangeArticle, fallbackPrediction)
  .allRangeGroups[0].reason, "本命の買い目は1号艇を1着にした組み合わせです。");

const multipleHeads = structuredClone(rangePrediction);
multipleHeads.mainSheet.tickets.push({ ticket: "4-1-3" });
assert.equal(noteGenerator.compactArticle(rangeArticle, multipleHeads)
  .allRangeGroups[0].reason, multipleHeads.mainSheet.reason,
  "本命群に4号艇1着が実在する場合は説明を置き換えない");

console.log("note copy cleanup tests passed");
