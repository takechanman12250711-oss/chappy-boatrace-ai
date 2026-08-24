import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE_NO = Number(process.env.REVIEW_RACE_NO || 12);
const TEST_RESULT_TIMEOUT_MS = Number(
  process.env.TEST_RESULT_TIMEOUT_MS || 1500
);
const TERMINAL_STATUS =
  "振り返り予想を表示しました。公式結果の取得に失敗しました";

const marks = [];
function mark(name, detail = {}) {
  const row = { name, at: new Date().toISOString(), ...detail };
  marks.push(row);
  console.log(`[MARK] ${name}`, JSON.stringify(detail));
}

let browser = null;
let context = null;
let page = null;
let failure = null;

const pageErrors = [];
const consoleErrors = [];

try {
  mark("browser-launch-start");
  browser = await webkit.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
      "Mobile/15E148 Safari/604.1"
  });
  page = await context.newPage();
  mark("browser-launch-finished");

  page.on("pageerror", error => {
    pageErrors.push(String(error?.message || error));
  });
  page.on("console", message => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const targetUrl =
    `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
    `reviewResultTimeout=${Date.now()}`;

  mark("page-open-start", { targetUrl });
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });
  mark("page-open-finished");

  await page.waitForFunction(
    () => Boolean(
      window.ChappyPredictionRuntime &&
      window.ChappyAppRuntime &&
      window.ChappyHomeDashboardV2 &&
      window.ChappyResultRequestTimeout
    ),
    null,
    { timeout: 30_000 }
  );

  mark("runtime-ensure-start");
  await page.evaluate(async () => {
    await window.ChappyPredictionRuntime.ensureReady();
    await window.ChappyAppRuntime.ensure("race");
    window.ChappyHomeDashboardV2.setView("race");
  });
  mark("runtime-ensure-finished");

  const runtimeState = await page.evaluate(() => ({
    appRuntime: window.ChappyAppRuntime?.version || "",
    predictionRuntime: window.ChappyPredictionRuntime?.version || "",
    resultGuard: window.ChappyResultRequestTimeout?.version || "",
    productionTimeoutMs:
      Number(window.ChappyResultRequestTimeout?.timeoutMs || 0),
    resultGuardInstalled:
      window.ChappyResultRequestTimeout?.installed === true,
    fetchPatched:
      window.fetch?.__chappyResultRequestTimeoutPatched === true
  }));
  mark("runtime-state", runtimeState);

  if (runtimeState.appRuntime !== "20260815-odds-immediate1") {
    throw new Error(
      `app runtime mismatch: ${JSON.stringify(runtimeState)}`
    );
  }
  if (
    runtimeState.resultGuard !== "20260824-result-timeout1" ||
    runtimeState.productionTimeoutMs !== 12_000 ||
    runtimeState.resultGuardInstalled !== true ||
    runtimeState.fetchPatched !== true
  ) {
    throw new Error(
      `result timeout guard is not active: ${JSON.stringify(runtimeState)}`
    );
  }

  // Playwright の page.route() を未解決のまま待たせると、WebKit と
  // Playwright 間のプロトコル処理まで止まり、ページ内のタイマーを
  // 正しく観測できない。そこでページ内の最終 fetch 層だけを差し替え、
  // /api/result のみ「接続済み・応答なし」を再現する。
  const testBridgeState = await page.evaluate(
    ({ timeoutMs, terminalStatus }) => {
      const api = window.ChappyResultRequestTimeout;
      const guardedFetch = window.fetch.bind(window);
      const state = {
        resultRequests: 0,
        resultRequestAt: 0,
        predictionRenderedAt: 0,
        terminalAt: 0,
        downstreamAbortSeen: false,
        statusHistory: [],
        installState: null
      };

      window.__chappyResultTimeoutWebKitTest = state;

      window.addEventListener(
        "chappy:prediction-rendered",
        () => {
          if (!state.predictionRenderedAt) {
            state.predictionRenderedAt = performance.now();
          }
        },
        { once: true }
      );

      const statusArea = document.getElementById("statusArea");
      const recordStatus = () => {
        const text = statusArea?.textContent?.trim() || "";
        if (
          text &&
          state.statusHistory[state.statusHistory.length - 1] !== text
        ) {
          state.statusHistory.push(text);
          if (state.statusHistory.length > 30) {
            state.statusHistory.shift();
          }
        }
        if (text === terminalStatus && !state.terminalAt) {
          state.terminalAt = performance.now();
        }
      };

      recordStatus();
      if (statusArea && typeof MutationObserver === "function") {
        const observer = new MutationObserver(recordStatus);
        observer.observe(statusArea, {
          childList: true,
          characterData: true,
          subtree: true
        });
        state.disconnectStatusObserver = () => observer.disconnect();
      }

      const hangingResultFetch = function (input, init = {}) {
        const method = String(
          init?.method || input?.method || "GET"
        ).toUpperCase();
        const params = api.resultRequestParams(window, input);

        if (params && method === "GET") {
          state.resultRequests += 1;
          if (!state.resultRequestAt) {
            state.resultRequestAt = performance.now();
          }

          return new Promise((_resolve, reject) => {
            const signal = init?.signal || input?.signal || null;
            if (signal?.aborted) {
              state.downstreamAbortSeen = true;
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
              return;
            }
            signal?.addEventListener?.(
              "abort",
              () => {
                state.downstreamAbortSeen = true;
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
              },
              { once: true }
            );
          });
        }

        return guardedFetch(input, init);
      };

      [
        "__chappyOddsFirstBridge",
        "__chappyOddsFetchCachePatched"
      ].forEach(key => {
        if (window.fetch?.[key] !== true) return;
        Object.defineProperty(hangingResultFetch, key, {
          configurable: true,
          value: true
        });
      });

      window.fetch = hangingResultFetch;
      state.installState = api.install(window, { timeoutMs });

      return {
        installState: state.installState,
        fetchPatched:
          window.fetch?.__chappyResultRequestTimeoutPatched === true,
        oddsBridge:
          window.fetch?.__chappyOddsFirstBridge === true,
        oddsCache:
          window.fetch?.__chappyOddsFetchCachePatched === true
      };
    },
    {
      timeoutMs: TEST_RESULT_TIMEOUT_MS,
      terminalStatus: TERMINAL_STATUS
    }
  );
  mark("test-fetch-bridge-installed", testBridgeState);

  if (
    testBridgeState.installState?.installed !== true ||
    Number(testBridgeState.installState?.timeoutMs) !==
      TEST_RESULT_TIMEOUT_MS ||
    testBridgeState.fetchPatched !== true
  ) {
    throw new Error(
      `test result bridge is not active: ${JSON.stringify(testBridgeState)}`
    );
  }

  // 開催一覧APIの応答時間をテスト条件に含めない。
  // 本番と同じ hidden select を直接設定し、予想ボタン以降の実処理を検証する。
  const selected = await page.evaluate(
    ({ date, place, raceNo }) => {
      const modeSelect = document.getElementById("raceModeSelect");
      const dateInput = document.getElementById("dateInput");
      const placeSelect = document.getElementById("placeSelect");
      const raceSelect = document.getElementById("raceSelect");

      if (!modeSelect || !dateInput || !placeSelect || !raceSelect) {
        throw new Error("race selection controls are missing");
      }

      modeSelect.value = "review";
      dateInput.value = date;
      placeSelect.value = place;
      raceSelect.value = `${raceNo}R`;

      return {
        mode: modeSelect.value,
        date: dateInput.value,
        place: placeSelect.value,
        race: raceSelect.value,
        buttonDisabled:
          document.getElementById("fetchRaceBtn")?.disabled ?? null
      };
    },
    {
      date: REVIEW_DATE,
      place: REVIEW_PLACE,
      raceNo: REVIEW_RACE_NO
    }
  );
  mark("review-race-selected", selected);

  if (
    selected.mode !== "review" ||
    selected.date !== REVIEW_DATE ||
    selected.place !== REVIEW_PLACE ||
    selected.race !== `${REVIEW_RACE_NO}R` ||
    selected.buttonDisabled === true
  ) {
    throw new Error(`review selection mismatch: ${JSON.stringify(selected)}`);
  }

  const startedAt = Date.now();
  mark("prediction-click-start");

  // Playwright の click 完了条件に非同期処理を結び付けず、ページ内で
  // 通常の click イベントだけを発火させる。
  await page.evaluate(() => {
    const button = document.getElementById("fetchRaceBtn");
    if (!button) throw new Error("prediction button is missing");
    button.click();
  });

  await page.waitForFunction(
    terminalStatus => {
      const status =
        document.getElementById("statusArea")?.textContent?.trim() || "";
      const resultArea = document.getElementById("resultArea");
      const resultText =
        (resultArea?.textContent || "").replace(/\s+/g, " ").trim();
      const reviewResultText =
        (document.getElementById("reviewResultArea")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();

      return (
        status === terminalStatus &&
        resultText.length >= 500 &&
        !resultArea?.dataset?.raceLoading &&
        reviewResultText.includes("結果を取得できませんでした")
      );
    },
    TERMINAL_STATUS,
    { timeout: 90_000 }
  );
  const terminalReachedAt = Date.now();
  mark("review-terminal-state", {
    elapsedMs: terminalReachedAt - startedAt
  });

  const finalState = await page.evaluate(() => {
    const testState = window.__chappyResultTimeoutWebKitTest || {};
    testState.disconnectStatusObserver?.();

    return {
      status:
        document.getElementById("statusArea")?.textContent?.trim() || "",
      errorArea:
        document.getElementById("errorArea")?.textContent?.trim() || "",
      resultLoading:
        document.getElementById("resultArea")?.dataset?.raceLoading || "",
      resultText:
        (document.getElementById("resultArea")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim(),
      reviewResultText:
        (document.getElementById("reviewResultArea")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim(),
      resultRequests: Number(testState.resultRequests || 0),
      resultRequestAt: Number(testState.resultRequestAt || 0),
      predictionRenderedAt: Number(testState.predictionRenderedAt || 0),
      terminalAt: Number(testState.terminalAt || performance.now()),
      downstreamAbortSeen: testState.downstreamAbortSeen === true,
      statusHistory: Array.isArray(testState.statusHistory)
        ? [...testState.statusHistory]
        : []
    };
  });

  if (finalState.resultRequests !== 1) {
    throw new Error(
      `unexpected official result request count: ${finalState.resultRequests}`
    );
  }
  if (!finalState.downstreamAbortSeen) {
    throw new Error("official result request was not aborted at timeout");
  }
  if (!finalState.predictionRenderedAt) {
    throw new Error("prediction-rendered event was not observed");
  }
  if (!finalState.resultRequestAt) {
    throw new Error("official result request start was not observed");
  }
  if (finalState.predictionRenderedAt > finalState.resultRequestAt + 250) {
    throw new Error(
      "official result request started before the prediction was rendered"
    );
  }
  if (finalState.errorArea) {
    throw new Error(`unexpected prediction error: ${finalState.errorArea}`);
  }
  if (finalState.resultLoading) {
    throw new Error(
      `prediction remained loading: ${finalState.resultLoading}`
    );
  }
  if (finalState.resultText.length < 500) {
    throw new Error(
      `prediction was not rendered: textLength=${finalState.resultText.length}`
    );
  }
  if (!finalState.reviewResultText.includes("結果を取得できませんでした")) {
    throw new Error(
      `review result timeout was not shown: ${finalState.reviewResultText}`
    );
  }
  if (pageErrors.some(message => /readonly|read only/i.test(message))) {
    throw new Error(`readonly page error: ${pageErrors.join(" | ")}`);
  }

  const terminalWaitMs =
    finalState.terminalAt - finalState.resultRequestAt;
  if (
    terminalWaitMs < Math.max(500, TEST_RESULT_TIMEOUT_MS - 600) ||
    terminalWaitMs > TEST_RESULT_TIMEOUT_MS + 8_000
  ) {
    throw new Error(
      `unexpected result timeout duration: ${terminalWaitMs}ms`
    );
  }

  console.log(JSON.stringify({
    ok: true,
    runtimeState,
    testBridgeState,
    elapsedMs: terminalReachedAt - startedAt,
    renderBeforeResultMs:
      finalState.resultRequestAt - finalState.predictionRenderedAt,
    terminalWaitMs,
    resultTextLength: finalState.resultText.length,
    status: finalState.status,
    statusHistory: finalState.statusHistory,
    pageErrors,
    consoleErrors,
    marks
  }, null, 2));
} catch (error) {
  failure = error;
  console.error("[FATAL]", error?.stack || error);
} finally {
  if (context) {
    await Promise.race([
      context.close().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 10_000))
    ]);
  }

  if (browser) {
    await Promise.race([
      browser.close().catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 10_000))
    ]);
  }

  mark("cleanup-finished");
}

if (failure) {
  process.exitCode = 1;
}
