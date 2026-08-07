"use strict";

const assert = require("node:assert/strict");
const { parseRaceHref } = require("../api/_schedule-parser");
const schedule = require("../api/schedule");

const currentOrder = '<tbody><a href="/owpc/pc/race/racelist?hd=20260807&jcd=02&rno=6">出走表</a><span>13:14</span></tbody>';
const legacyOrder = '<tbody><a href="/owpc/pc/race/racelist?rno=6&amp;jcd=02&amp;hd=20260807">出走表</a><span>13:14</span></tbody>';

assert.deepEqual(parseRaceHref(currentOrder), {
  href: "/owpc/pc/race/racelist?hd=20260807&jcd=02&rno=6",
  jcd: "02",
  raceNo: 6,
  date: "20260807"
});
assert.equal(parseRaceHref(legacyOrder).jcd, "02");
assert.equal(parseRaceHref(legacyOrder).raceNo, 6);

const nowMs = Date.parse("2026-08-07T13:00:00+09:00");
const venues = schedule.parseVenues(currentOrder, "20260807", nowMs);
assert.equal(venues.length, 1);
assert.equal(venues[0].jcd, "02");
assert.equal(venues[0].place, "戸田");
assert.equal(venues[0].currentRaceNo, 6);
assert.equal(venues[0].nextDeadline, "13:14");
assert.equal(venues[0].selectable, true);

console.log("schedule parser tests passed");
