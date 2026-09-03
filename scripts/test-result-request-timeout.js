"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const timeoutModule = require(
  path.join(__dirname, "..", "js", "result-request-timeout.js")
);

const RESULT_URL =
  "https://chappy-boatrace-api.vercel.app/api/result" +
  "?date=20260824&jcd=07&rno=12";
const OTHER_URL =
  "https://chappy-boatrace-api.vercel.app/api/race" +
  "?date=20260824&jcd=07&rno=12";

function createRoot(fetchImpl) {
  return {
    URL,
    AbortController,
    location: {
      href: "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/"
    },
    setTimeout,
    clearTimeout,
    fetch: fetchImpl
  };
}

async function main() {
  const params = timeoutModule.resultRequestParams(
    createRoot(() => Promise.resolve()),
    RESULT_URL
  );

  assert.deepEqual(params, {
    date: "20260824",
    jcd: "07",
    rno: "12"
  });
  assert.equal(
    timeoutModule.resultRequestParams(
      createRoot(() => Promise.resolve()),
      OTHER_URL
    ),
    null
  );

  let otherCalls = 0;
  const passthroughRoot = createRoot(async () => {
    otherCalls += 1;
    return { ok: true, status: 200 };
  });
  passthroughRoot.fetch.__chappyOddsFirstBridge = true;
  passthroughRoot.fetch.__chappyOddsFetchCachePatched = true;

  const installed = timeoutModule.install(
    passthroughRoot,
    { timeoutMs: 30 }
  );

  assert.equal(installed.installed, true);
  assert.equal(
    passthroughRoot.fetch.__chappyResultRequestTimeoutPatched,
    true
  );
  assert.equal(
    passthroughRoot.fetch.__chappyOddsFirstBridge,
    true
  );
  assert.equal(
    passthroughRoot.fetch.__chappyOddsFetchCachePatched,
    true
  );

  const otherResponse = await passthroughRoot.fetch(OTHER_URL);
  assert.equal(otherResponse.ok, true);
  assert.equal(otherCalls, 1);

  let aborted = false;
  const hangingRoot = createRoot((_input, init = {}) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        aborted = true;
        const error = new Error("Aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  );
  timeoutModule.install(hangingRoot, { timeoutMs: 25 });

  const startedAt = Date.now();
  await assert.rejects(
    hangingRoot.fetch(RESULT_URL),
    error => {
      assert.equal(error.name, "ResultTimeoutError");
      assert.equal(error.code, "CHAPPY_RESULT_TIMEOUT");
      assert.match(error.message, /公式結果APIの応答が0秒を超えました|公式結果APIの応答が1秒を超えました/);
      return true;
    }
  );
  const elapsed = Date.now() - startedAt;
  assert.equal(
    aborted,
    false,
    "WebKitの終端保証をabort完了へ依存させない"
  );
  assert.ok(elapsed >= 15, `timeout was too early: ${elapsed}ms`);
  assert.ok(elapsed < 500, `timeout did not terminate promptly: ${elapsed}ms`);

  const successPayload = { ok: true, resultAvailable: true };
  const successRoot = createRoot(async () => ({
    ok: true,
    status: 200,
    async json() {
      return successPayload;
    }
  }));
  timeoutModule.install(successRoot, { timeoutMs: 100 });
  const successResponse = await successRoot.fetch(RESULT_URL);
  assert.deepEqual(await successResponse.json(), successPayload);

  const appRuntime = fs.readFileSync(
    path.join(__dirname, "..", "js", "app-runtime-loader.js"),
    "utf8"
  );
  assert.match(
    appRuntime,
    /const VERSION = "20260828-ui-audit-display1"/,
    "race runtime contract must remain unchanged"
  );
  assert.doesNotMatch(
    appRuntime,
    /js\/result-request-timeout\.js/,
    "result timeout guard must not change the lazy race group"
  );

  const appSource = fs.readFileSync(
    path.join(__dirname, "..", "js", "script.js"),
    "utf8"
  );
  assert.match(
    appSource,
    /const OFFICIAL_RESULT_TIMEOUT_MS = 12000/,
    "official result requests must have a local terminal timeout"
  );
  assert.match(
    appSource,
    /const result = await response\.json\(\);[\s\S]*Promise\.race\(\[request, timeout\]\)/,
    "official result body parsing must share the terminal timeout"
  );
  assert.match(
    appSource,
    /window\.ChappyDirectFetch[\s\S]*directFetch\(url\)/,
    "local full-body timeout must use the pre-wrapper fetch transport"
  );
  assert.match(
    appSource,
    /await fetchOfficialResultPayload\(url\)/,
    "review result fetch must use the local terminal timeout"
  );
  assert.doesNotMatch(
    appSource,
    /"✅ API成功 entries=",\s*data\?\.entries\?\.length \|\| 0,\s*data\s*\)/,
    "the mobile startup path must not send the full race payload to Safari console"
  );

  const indexHtml = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8"
  );
  const guardIndex = indexHtml.indexOf(
    'src="js/result-request-timeout.js?v=20260825-mobile-startup-terminal4&app=20260828-ui-audit-display1"'
  );
  const appIndex = indexHtml.indexOf(
    'src="js/app-runtime-loader.js?v=20260816-static-race1&app=20260828-ui-audit-display1&stats=20260831-outer-attack-central-report1"'
  );
  const oddsFirstIndex = indexHtml.indexOf(
    'src="js/odds-first-navigation.js?v=20260815-odds-consume2"'
  );

  assert.ok(guardIndex >= 0, "result timeout guard is missing from index.html");
  assert.ok(appIndex >= 0, "approved app runtime cache version is missing");
  assert.ok(oddsFirstIndex >= 0, "approved odds bridge is missing");
  assert.ok(
    appIndex < oddsFirstIndex && oddsFirstIndex < guardIndex,
    "result timeout guard must wrap the final fetch bridge before user interaction"
  );
  assert.doesNotMatch(
    indexHtml,
    /src="js\/script\.js/,
    "script.js must remain lazy-loaded"
  );

  console.log("official result request timeout contract passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
