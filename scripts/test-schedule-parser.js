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

const preparingOrder = '<tbody><a href="/owpc/pc/race/racelist?hd=20260807&jcd=07&rno=1">出走表</a><span>発売準備中</span></tbody>';
const preparingVenues = schedule.parseVenues(preparingOrder, "20260807", nowMs);
assert.equal(preparingVenues[0].status, "schedule_pending");
assert.equal(preparingVenues[0].selectable, true, "開始前の開催場は場別時刻を確認できる");

const closedOrder = '<tbody><a href="/owpc/pc/race/racelist?hd=20260807&jcd=07&rno=12">出走表</a><span>最終Ｒ発売終了</span></tbody>';
const closedVenues = schedule.parseVenues(closedOrder, "20260807", nowMs);
assert.equal(closedVenues[0].status, "closed");
assert.equal(closedVenues[0].selectable, false);

const expiredVenues = schedule.parseVenues(preparingOrder, "20260807", Date.parse("2026-08-08T00:01:00+09:00"));
assert.equal(expiredVenues[0].status, "closed");
assert.equal(expiredVenues[0].selectable, false, "過去日の時刻未掲載を準備中へ戻さない");

console.log("schedule parser tests passed");
