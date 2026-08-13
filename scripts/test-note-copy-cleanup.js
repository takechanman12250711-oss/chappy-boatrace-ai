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

console.log("note copy cleanup tests passed");
