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
  assert.equal(aborted, true);
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
  const guardIndex = appRuntime.indexOf("js/result-request-timeout.js");
  const scriptIndex = appRuntime.indexOf("js/script.js");

  assert.ok(guardIndex >= 0, "result timeout guard is missing from race runtime");
  assert.ok(scriptIndex >= 0, "script.js is missing from race runtime");
  assert.ok(
    guardIndex < scriptIndex,
    "result timeout guard must load before script.js"
  );
  assert.match(appRuntime, /20260824-result-timeout1/);

  const indexHtml = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8"
  );
  assert.match(
    indexHtml,
    /js\/app-runtime-loader\.js\?v=20260824-result-timeout1/,
    "index.html must cache-bust the fixed app runtime"
  );
  assert.doesNotMatch(
    indexHtml,
    /js\/app-runtime-loader\.js\?v=20260816-static-race1/,
    "index.html still points to the stale app runtime"
  );

  console.log("official result request timeout contract passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
