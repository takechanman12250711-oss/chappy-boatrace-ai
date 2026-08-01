"use strict";

const assert = require("node:assert/strict");

global.window = global;

global.ChappyPracticalSelection = {
  createPracticalSelection() {
    return [
      "1-2-3",
      "1-2-4",
      "1-3-2",
      "2-1-3",
      "2-1-4",
      "1-2-6",
      "3-1-2",
      "1-2-5"
    ].map(ticket => ({ ticket }));
  }
};

const noteGenerator = require("../js/note-generator");

const prediction = {
  date: "20260801",
  race: {
    stadiumName: "唐津",
    raceNo: 10,
    raceInfo: {
      deadline: "12:55"
    }
  },
  confidence: 84,
  manshuPower: 23,
  raceFlow: {
    title: "イン逃げ本線",
    summary: "2号艇は2着残し。別展開では2号艇が3着を拾う。"
  },
  mainSheet: {
    honmei: { boatNo: 1, name: "1号艇", course: 1 },
    taikou: { boatNo: 2, name: "2号艇" },
    ana: { boatNo: 3, name: "3号艇" },
    osae: { boatNo: 4, name: "4号艇" },
    evaluations: [
      { boatNo: 1, name: "1号艇", course: 1, score: 84, shortComment: "頭候補" },
      { boatNo: 2, name: "2号艇", score: 78 },
      { boatNo: 3, name: "3号艇", score: 75 },
      { boatNo: 4, name: "4号艇", score: 72 },
      { boatNo: 5, name: "5号艇", score: 68 },
      { boatNo: 6, name: "6号艇", score: 65 }
    ],
    tickets: ["1-2-3", "1-2-4", "1-3-2"],
    coverTickets: ["2-1-3", "2-1-4"],
    flowTickets: ["1-2-6", "1-2-5"]
  },
  manshuSheet: {
    tickets: ["3-1-2"],
    candidates: []
  },
  dataQuality: {
    level: "高",
    boatIdentity: { valid: true }
  }
};

const article = noteGenerator.generateArticle(prediction);

assert.equal(article.ok, true);
assert.equal(article.publishable, true);
assert.equal(article.rejectionReasons, undefined);
assert.equal(article.freeText.includes("締切締切"), false);
assert.equal(article.freeText.includes("締切 12:55"), true);
assert.deepEqual(
  article.practicalTickets.map(item => item.ticket),
  ["1-2-3", "1-2-4", "1-3-2", "2-1-3", "2-1-4", "1-2-6", "3-1-2", "1-2-5"]
);

const compacted = noteGenerator.compactTicketComment(
  "2号艇が3着で展開を拾う筋。2号艇が3着で残る筋。"
);
assert.equal(compacted, "2号艇が3着で展開を拾う筋。");

console.log("karatsu note regression tests passed");
