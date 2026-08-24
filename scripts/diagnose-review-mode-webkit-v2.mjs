import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const EXPECTED_RUNTIME = process.env.EXPECTED_RUNTIME || "20260824-readonly-core-fix1";
const OUTPUT_DIR = process.env.DIAG_OUTPUT || "artifacts/review-mode-webkit-v2";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE = process.env.REVIEW_RACE || "12R";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const report = {
  appUrl: APP_URL,
  expectedRuntime: EXPECTED_RUNTIME,
  review: { date: REVIEW_DATE, place: REVIEW_PLACE, race: REVIEW_RACE },
  steps: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  badResponses: [],
  runtimeVersion: "",
  final: null,
  fatalError: null
};

function step(name, detail = {}) {
  const row = { name, at: new Date().toISOString(), ...detail };
  report.steps.push(row);
  console.log(`[STEP] ${name}`, JSON.stringify(detail));
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function busted(url) {
  const mark = url.includes("?") ? "&" : "?";
  return `${url}${mark}webkitReviewV2=${Date.now()}`;
}

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
    "Mobile/15E148 Safari/604.1"
});
const page = await context.newPage();

page.on("pageerror", error => {
  const row = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  report.pageErrors.push(row);
  console.error("[PAGEERROR]", row.message);
});

page.on("console", message => {
  if (message.type() !== "error") return;
  const text = message.text();
  report.consoleErrors.push(text);
  console.error("[CONSOLE ERROR]", text);
});

page.on("requestfailed", request => {
  const row = {
    url: request.url(),
    method: request.method(),
    errorText: request.failure()?.errorText || ""
  };
  report.failedRequests.push(row);
  console.error("[REQUEST FAILED]", JSON.stringify(row));
});

page.on("response", response => {
  if (response.status() < 400) return;
  const row = { url: response.url(), status: response.status() };
  report.badResponses.push(row);
  console.error("[BAD RESPONSE]", JSON.stringify(row));
});

let failed = null;

try {
  const url = busted(APP_URL);
  step("open", { url });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  await page.waitForFunction(
    () => Boolean(window.ChappyPredictionRuntime && window.ChappyHomeDashboardV2),
    null,
    { timeout: 30_000 }
  );

  report.runtimeVersion = await page.evaluate(
    () => String(window.ChappyPredictionRuntime?.version || "")
  );
  step("runtime-visible", { runtimeVersion: report.runtimeVersion });
  if (report.runtimeVersion !== EXPECTED_RUNTIME) {
    throw new Error(
      `runtime mismatch: expected=${EXPECTED_RUNTIME} actual=${report.runtimeVersion}`
    );
  }

  await page.evaluate(async () => {
    await window.ChappyPredictionRuntime.ensureReady();
    await window.ChappyAppRuntime.ensure("race");
    window.ChappyHomeDashboardV2.setView("race");
  });
  step("race-view-opened-programmatically");

  await page.waitForSelector("#raceModeSelect", {
    state: "visible",
    timeout: 20_000
  });

  const initialView = await page.evaluate(() => ({
    raceHidden: document.getElementById("raceSection")?.hidden ?? null,
    predictionHidden: document.getElementById("predictionSection")?.hidden ?? null,
    homeHidden: document.getElementById("homeDashboardV2")?.hidden ?? null,
    modeVisible:
      document.getElementById("raceModeSelect")?.getClientRects().length > 0
  }));
  step("race-controls-visible", initialView);

  await page.selectOption("#raceModeSelect", "review");
  step("review-mode-selected");

  await page.waitForFunction(
    () => document.querySelector("#fetchRaceBtn span")?.textContent?.includes("振り返り予想"),
    null,
    { timeout: 20_000 }
  );

  await page.fill("#dateInput", REVIEW_DATE);
  await page.dispatchEvent("#dateInput", "change");
  step("date-selected", { date: REVIEW_DATE });

  await page.waitForFunction(
    () => {
      const status = document.getElementById("statusArea")?.textContent || "";
      const options = document.querySelectorAll("#placeSelect option").length;
      return options > 0 && !status.includes("確認中");
    },
    null,
    { timeout: 60_000 }
  );

  const places = await page.locator("#placeSelect option").allTextContents();
  step("venues-loaded", { count: places.length, places });
  if (!places.includes(REVIEW_PLACE)) {
    throw new Error(`venue unavailable: ${REVIEW_PLACE}`);
  }

  await page.selectOption("#placeSelect", { label: REVIEW_PLACE });
  step("place-selected", { place: REVIEW_PLACE });

  await page.waitForFunction(
    race => [...document.querySelectorAll("#raceSelect option")]
      .some(option => option.textContent?.trim() === race),
    REVIEW_RACE,
    { timeout: 60_000 }
  );

  const races = await page.locator("#raceSelect option").allTextContents();
  step("races-loaded", { count: races.length, races });
  await page.selectOption("#raceSelect", { label: REVIEW_RACE });
  step("race-selected", { race: REVIEW_RACE });

  await page.click("#fetchRaceBtn");
  step("prediction-clicked");

  await page.waitForFunction(
    () => {
      const error = compactForPage(document.getElementById("errorArea")?.textContent || "");
      const result = compactForPage(document.getElementById("resultArea")?.textContent || "");
      const status = compactForPage(document.getElementById("statusArea")?.textContent || "");
      const loading = /読み込み中|解析中|取得中/.test(`${result} ${status}`);
      const rendered = result.length > 160 && !result.includes("ホームで開催場とレースを選ぶ");
      return Boolean(error) || (rendered && !loading);

      function compactForPage(value) {
        return String(value ?? "").replace(/\s+/g, " ").trim();
      }
    },
    null,
    { timeout: 120_000 }
  );

  report.final = await page.evaluate(() => {
    const text = id => document.getElementById(id)?.textContent || "";
    return {
      errorArea: text("errorArea"),
      resultArea: text("resultArea"),
      statusArea: text("statusArea"),
      oddsStatus: text("predictionOddsStatus"),
      raceHidden: document.getElementById("raceSection")?.hidden ?? null,
      predictionHidden: document.getElementById("predictionSection")?.hidden ?? null,
      runtimeVersion: window.ChappyPredictionRuntime?.version || "",
      coreFrozen: Boolean(window.ChappyAICore && Object.isFrozen(window.ChappyAICore)),
      assignmentCompat: window.ChappyAICoreAssignmentCompat || null
    };
  });

  for (const key of ["errorArea", "resultArea", "statusArea", "oddsStatus"]) {
    report.final[key] = compact(report.final[key]).slice(0, 6000);
  }
  step("flow-finished", report.final);

  if (report.final.errorArea) {
    throw new Error(`review error: ${report.final.errorArea}`);
  }

  const readonlyErrors = report.pageErrors.filter(row =>
    /readonly|read only|Attempted to assign/i.test(row.message)
  );
  if (readonlyErrors.length) {
    throw new Error(
      `readonly page error: ${readonlyErrors.map(row => row.message).join(" | ")}`
    );
  }
} catch (error) {
  failed = error;
  report.fatalError = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  console.error("[FATAL]", report.fatalError.message);
} finally {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "review-mode-webkit-v2.png"),
    fullPage: true
  }).catch(() => {});

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "review-mode-webkit-v2.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  await browser.close();
}

if (failed) process.exitCode = 1;
else console.log("review mode WebKit v2 diagnostic: PASS");
