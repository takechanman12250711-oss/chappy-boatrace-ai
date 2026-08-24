import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE_NO = Number(process.env.REVIEW_RACE_NO || 12);

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
    "Mobile/15E148 Safari/604.1"
});
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
let resultRequestSeen = false;

page.on("pageerror", error => {
  pageErrors.push(String(error?.message || error));
});
page.on("console", message => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

// 公式結果APIだけを意図的に応答待ちへする。
// 予想本体は通常どおり描画し、12秒後に終端状態へ移ることを確認する。
await page.route("**/api/result**", route => {
  resultRequestSeen = true;
  // continue / fulfill / abort を呼ばず、サーバー無応答を再現する。
  void route;
});

const targetUrl =
  `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
  `reviewResultTimeout=${Date.now()}`;

await page.goto(targetUrl, {
  waitUntil: "domcontentloaded",
  timeout: 60_000
});

await page.waitForFunction(
  () => Boolean(
    window.ChappyPredictionRuntime &&
    window.ChappyAppRuntime &&
    window.ChappyHomeDashboardV2
  ),
  null,
  { timeout: 30_000 }
);

await page.evaluate(async () => {
  await window.ChappyPredictionRuntime.ensureReady();
  await window.ChappyAppRuntime.ensure("race");
  window.ChappyHomeDashboardV2.setView("race");
});

const runtimeState = await page.evaluate(() => ({
  appRuntime: window.ChappyAppRuntime?.version || "",
  predictionRuntime: window.ChappyPredictionRuntime?.version || "",
  resultGuard:
    window.ChappyResultRequestTimeout?.version || "",
  resultGuardInstalled:
    window.ChappyResultRequestTimeout?.installed === true,
  fetchPatched:
    window.fetch?.__chappyResultRequestTimeoutPatched === true
}));

if (runtimeState.appRuntime !== "20260824-result-timeout1") {
  throw new Error(
    `app runtime mismatch: ${JSON.stringify(runtimeState)}`
  );
}
if (
  runtimeState.resultGuard !== "20260824-result-timeout1" ||
  runtimeState.resultGuardInstalled !== true ||
  runtimeState.fetchPatched !== true
) {
  throw new Error(
    `result timeout guard is not active: ${JSON.stringify(runtimeState)}`
  );
}

await page.selectOption("#raceModeSelect", "review");
await page.fill("#dateInput", REVIEW_DATE);
await page.dispatchEvent("#dateInput", "change");

const venueSelector =
  `#officialVenueGrid button[data-place="${REVIEW_PLACE}"]:not([disabled])`;
await page.waitForSelector(venueSelector, {
  state: "visible",
  timeout: 60_000
});
await page.click(venueSelector);

const raceSelector =
  `#officialRaceGrid button[data-race-no="${REVIEW_RACE_NO}"]:not([disabled])`;
await page.waitForSelector(raceSelector, {
  state: "visible",
  timeout: 60_000
});
await page.click(raceSelector);

await page.evaluate(() => {
  window.__chappyRenderedForResultTimeoutTest = false;
  window.addEventListener(
    "chappy:prediction-rendered",
    () => {
      window.__chappyRenderedForResultTimeoutTest = true;
    },
    { once: true }
  );
});

const startedAt = Date.now();
await page.click("#fetchRaceBtn");

await page.waitForFunction(
  () => window.__chappyRenderedForResultTimeoutTest === true,
  null,
  { timeout: 90_000 }
);
const renderedAt = Date.now();

await page.waitForFunction(
  () =>
    document.getElementById("statusArea")?.textContent?.trim() ===
    "振り返り予想を表示しました。公式結果の取得に失敗しました",
  null,
  { timeout: 30_000 }
);
const terminalAt = Date.now();

const finalState = await page.evaluate(() => ({
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
      .trim()
}));

if (!resultRequestSeen) {
  throw new Error("official result request was not issued");
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

const terminalWaitMs = terminalAt - renderedAt;
if (terminalWaitMs < 9_000 || terminalWaitMs > 25_000) {
  throw new Error(
    `unexpected result timeout duration: ${terminalWaitMs}ms`
  );
}

console.log(JSON.stringify({
  ok: true,
  runtimeState,
  elapsedMs: terminalAt - startedAt,
  renderElapsedMs: renderedAt - startedAt,
  terminalWaitMs,
  resultTextLength: finalState.resultText.length,
  status: finalState.status,
  pageErrors,
  consoleErrors
}, null, 2));

await browser.close();
