"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.resolve(__dirname, "../js/script.js"),
  "utf8"
);

function functionSource(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} が存在する`);
  const argsOpen = source.indexOf("(", match.index);
  let argsDepth = 0;
  let argsClose = -1;
  for (let index = argsOpen; index < source.length; index += 1) {
    if (source[index] === "(") argsDepth += 1;
    if (source[index] === ")") argsDepth -= 1;
    if (argsDepth === 0) {
      argsClose = index;
      break;
    }
  }
  const open = source.indexOf("{", argsClose);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(match.index, index + 1);
  }
  throw new Error(`${name} の終端を取得できません`);
}

const requestSource = functionSource("requestSchedule");
const primeSource = functionSource("primeScheduleCache");
let fetchCount = 0;
const sandbox = {
  AbortController,
  encodeURIComponent,
  fetch: async () => {
    fetchCount += 1;
    await Promise.resolve();
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          ok: true,
          selectedVenue: { jcd: "23", races: [{ raceNo: 1 }] }
        };
      }
    };
  },
  window: {
    setTimeout,
    clearTimeout
  }
};

vm.runInNewContext(`
  const SCHEDULE_REQUEST_TIMEOUT_MS = 30000;
  const SCHEDULE_CACHE_TTL_MS = 30000;
  const scheduleRequestCache = new Map();
  ${requestSource}
  ${primeSource}
  this.api = { requestSchedule, primeScheduleCache };
`, sandbox);

(async () => {
  const [first, second] = await Promise.all([
    sandbox.api.requestSchedule("20260803", "23"),
    sandbox.api.requestSchedule("20260803", "23")
  ]);
  assert.equal(fetchCount, 1, "同じ開催詳細の同時通信を1本へまとめる");
  assert.equal(first.selectedVenue.jcd, "23");
  assert.equal(second.selectedVenue.jcd, "23");

  await sandbox.api.requestSchedule("20260803", "23");
  assert.equal(fetchCount, 1, "30秒以内の同じ開催詳細を再利用する");

  const suppliedDetail = {
    jcd: "24",
    place: "大村",
    races: [{ raceNo: 12, selectable: true }]
  };
  assert.equal(
    sandbox.api.primeScheduleCache("20260803", "24", suppliedDetail),
    true,
    "ホームで取得済みの開催詳細をAPIレスポンス形式へ包んで保存する"
  );
  const primed = await sandbox.api.requestSchedule("20260803", "24");
  assert.equal(fetchCount, 1, "ホームから予想へ移動しても同じ場を再取得しない");
  assert.equal(primed.selectedVenue.place, "大村");

  assert.match(source, /const SCHEDULE_REQUEST_TIMEOUT_MS = 30000/);
  assert.match(source, /const SCHEDULE_CACHE_TTL_MS = 30000/);
  console.log("開催情報の同時通信共有・30秒キャッシュ 回帰テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
