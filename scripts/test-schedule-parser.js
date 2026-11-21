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


// Exercise the real handler with fake HTTP. A failed schedule remains a failure.
async function checkFetchDiagnostics() {
  const secret = "unit-only-untrusted-cause";
  const nativeFailure = code => new TypeError("fetch failed", { cause: { code, message: secret } });
  const getterCause = {};
  Object.defineProperty(getterCause, "code", { get() { throw new Error(secret); } });
  const cases = [
    { name: "connection cause", error: nativeFailure("UND_ERR_CONNECT_TIMEOUT"), expected: "fetch failed [UND_ERR_CONNECT_TIMEOUT]" },
    { name: "body cause", bodyError: nativeFailure("ECONNRESET"), expected: "fetch failed [ECONNRESET]" },
    { name: "HTTP503", httpStatus: 503, expected: "公式情報取得失敗: 503" },
    { name: "unknown cause", error: nativeFailure(secret), expected: "fetch failed" },
    { name: "code plus arbitrary text", error: nativeFailure("UND_ERR_CONNECT_TIMEOUT " + secret), expected: "fetch failed" },
    { name: "nonstring cause", error: nativeFailure({ toString() { throw new Error(secret); } }), expected: "fetch failed" },
    { name: "throwing cause property", error: new TypeError("fetch failed", { cause: getterCause }), expected: "fetch failed" },
    { name: "ordinary error", error: new Error("unchanged error", { cause: { code: "ECONNRESET" } }), expected: "unchanged error" },
    { name: "successful empty official page", success: true }
  ];
  for (const item of cases) {
    const originalFetch = global.fetch;
    let calls = 0, bodyCalls = 0, status = 200, data;
    global.fetch = async (url, options) => {
      calls += 1;
      assert.equal(url, "https://www.boatrace.jp/owpc/pc/race/index?hd=20260807");
      assert(options.signal, "the existing request timeout is retained");
      if (item.error) throw item.error;
      return { ok: !item.httpStatus, status: item.httpStatus || 200, async text() {
        bodyCalls += 1;
        if (item.httpStatus) throw new Error("a failed HTTP response body must not be read");
        if (item.bodyError) throw item.bodyError;
        return "";
      }};
    };
    try {
      const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { data = value; return value; } };
      await schedule({ query: { date: "20260807" } }, res);
      assert.equal(calls, 1, "diagnostics must not add retries: " + item.name);
      if (item.success) {
        assert.equal(status, 200); assert.equal(data.ok, true); assert.equal(data.venueCount, 0);
      } else {
        assert.equal(status, 500); assert.equal(data.ok, false); assert.equal(data.error, item.expected);
        assert.equal(JSON.stringify(data).includes(secret), false, "untrusted cause text must not be returned");
        if (item.httpStatus) assert.equal(bodyCalls, 0);
      }
    } finally { global.fetch = originalFetch; }
  }
  console.log("schedule fetch diagnostics tests passed (9 scenarios)");
}
checkFetchDiagnostics().then(() => console.log("schedule parser tests passed")).catch(error => {
  console.error(error); process.exitCode = 1;
});
