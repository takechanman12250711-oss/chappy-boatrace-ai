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

console.log("note copy cleanup tests passed");
