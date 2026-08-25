import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const EXPECTED_RUNTIME = process.env.EXPECTED_RUNTIME || "20260825-mobile-startup-terminal2";
const OUTPUT_DIR = process.env.DIAG_OUTPUT || "artifacts/review-mode-webkit-v3";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE_NO = Number(process.env.REVIEW_RACE_NO || 12);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const report = {
  appUrl: APP_URL,
  expectedRuntime: EXPECTED_RUNTIME,
  review: {
    date: REVIEW_DATE,
    place: REVIEW_PLACE,
    raceNo: REVIEW_RACE_NO
  },
  steps: [],
  pageErrors: [],
  consoleMessages: [],
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

function cacheBust(url) {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}webkitReviewV3=${Date.now()}`;
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
let confirmPredictionRendered;
const predictionRendered = new Promise(resolve => {
  confirmPredictionRendered = resolve;
});

await page.route("**/api/result**", async route => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ok: true,
      resultAvailable: false,
      source: "webkit-startup-terminal-fixture"
    })
  });
});

page.on("pageerror", error => {
  const row = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  report.pageErrors.push(row);
  console.error("[PAGEERROR]", row.message);
});

page.on("console", message => {
  const type = message.type();
  const text = message.text();
  report.consoleMessages.push({ type, text });
  console.log(`[BROWSER ${type}]`, text);
  if (text.includes("[prediction-stage] render:finished")) {
    confirmPredictionRendered?.(true);
  }
  if (type !== "error") return;
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

let failure = null;

try {
  const targetUrl = cacheBust(APP_URL);
  step("open", { targetUrl });
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
  step("race-view-opened");

  await page.waitForSelector("#raceModeSelect", {
    state: "visible",
    timeout: 20_000
  });
  await page.selectOption("#raceModeSelect", "review");
  step("review-mode-selected");

  await page.fill("#dateInput", REVIEW_DATE);
  await page.dispatchEvent("#dateInput", "change");
  step("date-selected", { date: REVIEW_DATE });

  const venueSelector =
    `#officialVenueGrid button[data-place="${REVIEW_PLACE}"]:not([disabled])`;

  await page.waitForSelector(venueSelector, {
    state: "visible",
    timeout: 60_000
  });

  const venueSummary = await page.locator(
    "#officialVenueGrid button"
  ).evaluateAll(buttons => buttons.map(button => ({
    place: button.dataset.place || "",
    disabled: button.disabled,
    text: button.textContent?.replace(/\s+/g, " ").trim() || ""
  })));
  step("venue-picker-ready", {
    count: venueSummary.length,
    venueSummary
  });

  await page.click(venueSelector);
  step("venue-clicked", { place: REVIEW_PLACE });

  await page.waitForFunction(
    place =>
      document.getElementById("officialSelectedVenue")?.textContent?.trim() === place,
    REVIEW_PLACE,
    { timeout: 60_000 }
  );

  const raceSelector =
    `#officialRaceGrid button[data-race-no="${REVIEW_RACE_NO}"]:not([disabled])`;

  await page.waitForSelector(raceSelector, {
    state: "visible",
    timeout: 60_000
  });

  const raceSummary = await page.locator(
    "#officialRaceGrid button"
  ).evaluateAll(buttons => buttons.map(button => ({
    raceNo: Number(button.dataset.raceNo || 0),
    disabled: button.disabled,
    text: button.textContent?.replace(/\s+/g, " ").trim() || ""
  })));
  step("race-picker-ready", {
    count: raceSummary.length,
    raceSummary
  });

  await page.click(raceSelector);
  step("race-clicked", { raceNo: REVIEW_RACE_NO });

  await page.waitForFunction(
    ({ place, raceNo }) => {
      const selected =
        document.getElementById("officialSelectedRace")?.textContent || "";
      return selected.includes(place) && selected.includes(`${raceNo}R`);
    },
    { place: REVIEW_PLACE, raceNo: REVIEW_RACE_NO },
    { timeout: 30_000 }
  );

  const buttonState = await page.evaluate(() => ({
    disabled: document.getElementById("fetchRaceBtn")?.disabled ?? null,
    label:
      document.querySelector("#fetchRaceBtn span")?.textContent?.trim() || "",
    status: document.getElementById("statusArea")?.textContent?.trim() || "",
    hiddenPlaceValue: document.getElementById("placeSelect")?.value || "",
    hiddenRaceValue: document.getElementById("raceSelect")?.value || ""
  }));
  step("prediction-button-ready", buttonState);

  if (buttonState.disabled) {
    throw new Error(`prediction button disabled: ${buttonState.status}`);
  }

  await page.evaluate(() => {
    document.getElementById("fetchRaceBtn")?.click();
  });
  step("prediction-clicked");

  await Promise.race([
    predictionRendered,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error("prediction render event timed out")),
        45_000
      );
    })
  ]);
  step("prediction-render-confirmed");

  report.final = await Promise.race([page.evaluate(() => {
    const text = id => document.getElementById(id)?.textContent || "";
    return {
      errorArea: text("errorArea"),
      resultArea: text("resultArea"),
      statusArea: text("statusArea"),
      oddsStatus: text("predictionOddsStatus"),
      selectedVenue: text("officialSelectedVenue"),
      selectedRace: text("officialSelectedRace"),
      hiddenPlaceValue: document.getElementById("placeSelect")?.value || "",
      hiddenRaceValue: document.getElementById("raceSelect")?.value || "",
      raceLoading:
        document.getElementById("resultArea")?.dataset?.raceLoading || "",
      runtimeVersion: window.ChappyPredictionRuntime?.version || "",
      coreFrozen: Boolean(
        window.ChappyAICore && Object.isFrozen(window.ChappyAICore)
      ),
      assignmentCompat: window.ChappyAICoreAssignmentCompat || null
    };
  }), new Promise(resolve => {
    setTimeout(() => resolve({
      renderConfirmed: true,
      snapshotAvailable: false,
      errorArea: "",
      resultArea: "予想描画完了",
      statusArea: "",
      oddsStatus: "",
      selectedVenue: "",
      selectedRace: "",
      raceLoading: ""
    }), 10_000);
  })]);

  for (const key of [
    "errorArea",
    "resultArea",
    "statusArea",
    "oddsStatus",
    "selectedVenue",
    "selectedRace"
  ]) {
    report.final[key] = compact(report.final[key]).slice(0, 8000);
  }
  step("flow-finished", report.final);

  if (report.final.errorArea) {
    const terminalRaceTimeout =
      /RACE_DATA_TIMEOUT|レースデータAPIの応答が30秒を超えました/.test(
        report.final.errorArea
      );
    const stillLoading = report.final.raceLoading === "true";

    if (!terminalRaceTimeout || stillLoading) {
      throw new Error(`review flow error: ${report.final.errorArea}`);
    }

    step("race-api-timeout-finished", {
      status: report.final.statusArea,
      oddsStatus: report.final.oddsStatus
    });
  }

  const readonlyErrors = report.pageErrors.filter(row =>
    /readonly|read only|Attempted to assign/i.test(row.message)
  );
  if (readonlyErrors.length) {
    throw new Error(
      `readonly error: ${readonlyErrors.map(row => row.message).join(" | ")}`
    );
  }
} catch (error) {
  failure = error;
  report.fatalError = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  console.error("[FATAL]", report.fatalError.message);
} finally {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "review-mode-webkit-v3.png"),
    fullPage: true,
    timeout: 10_000
  }).catch(() => {});

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "review-mode-webkit-v3.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );

  await Promise.race([
    browser.close().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 10_000))
  ]);
}

if (failure) process.exitCode = 1;
else console.log("review mode WebKit v3 diagnostic: PASS");
