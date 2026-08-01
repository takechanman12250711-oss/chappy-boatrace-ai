"use strict";

const assert = require("node:assert/strict");

global.window = global;
const noteGenerator = require("../js/note-generator");

assert.deepEqual(
  noteGenerator.contradictoryRoleBoats(
    "2号艇は2着残し。別展開では2号艇が3着を拾う。"
  ),
  [],
  "別展開・別文の残しと拾いは矛盾扱いしない"
);

assert.deepEqual(
  noteGenerator.contradictoryRoleBoats(
    "2号艇が同一展開で残しと拾いの両役割になる。"
  ),
  [2],
  "同一展開・同一文の残しと拾いは矛盾として検出する"
);

assert.deepEqual(
  noteGenerator.contradictoryRoleBoats(
    "1号艇が残し、2号艇が拾う。"
  ),
  [],
  "別艇の役割は矛盾扱いしない"
);

console.log("note role conflict scope tests passed");
