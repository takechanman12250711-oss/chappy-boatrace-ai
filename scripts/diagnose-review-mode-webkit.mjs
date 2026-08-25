import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const EXPECTED_RUNTIME = process.env.EXPECTED_RUNTIME || "20260825-mobile-startup-terminal4";
const OUTPUT_DIR = process.env.DIAG_OUTPUT || "artifacts/review-mode-webkit";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE = process.env.REVIEW_RACE || "12R";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function withCacheBust(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}webkitDiagnostic=${Date.now()}`;
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const diagnostic = {
  appUrl: APP_URL,
  expectedRuntime: EXPECTED_RUNTIME,
  review: {
    date: REVIEW_DATE,
    place: REVIEW_PLACE,
    race: REVIEW_RACE
  },
  runtimeVersion: "",
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  badResponses: [],
  steps: [],
  final: null
};

function recordStep(name, detail = {}) {
  diagnostic.steps.push({
    name,
    at: new Date().toISOString(),
    ...detail
  });
  console.log(`[STEP] ${name}`, JSON.stringify(detail));
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
  const detail = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  diagnostic.pageErrors.push(detail);
  console.error("[PAGEERROR]", detail.message);
});

page.on("console", message => {
  if (message.type() !== "error") return;
  const text = message.text();
  diagnostic.consoleErrors.push(text);
  console.error("[CONSOLE ERROR]", text);
});

page.on("requestfailed", request => {
  const failure = request.failure();
  const row = {
    url: request.url(),
    method: request.method(),
    errorText: failure?.errorText || ""
  };
  diagnostic.failedRequests.push(row);
  console.error("[REQUEST FAILED]", JSON.stringify(row));
});

page.on("response", response => {
  if (response.status() < 400) return;
  const row = {
    url: response.url(),
    status: response.status()
  };
  diagnostic.badResponses.push(row);
  console.error("[BAD RESPONSE]", JSON.stringify(row));
});

let fatalError = null;

try {
  const targetUrl = withCacheBust(APP_URL);
  recordStep("open", { targetUrl });
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await page.waitForFunction(
    () => Boolean(window.ChappyPredictionRuntime),
    null,
    { timeout: 20_000 }
  );

  diagnostic.runtimeVersion = await page.evaluate(
    () => String(window.ChappyPredictionRuntime?.version || "")
  );
  recordStep("runtime-loader-visible", {
    runtimeVersion: diagnostic.runtimeVersion
  });

  if (diagnostic.runtimeVersion !== EXPECTED_RUNTIME) {
    throw new Error(
      `runtime version mismatch: expected=${EXPECTED_RUNTIME} actual=${diagnostic.runtimeVersion}`
    );
  }

  await page.evaluate(async () => {
    await window.ChappyPredictionRuntime.ensureReady();
  });
  recordStep("prediction-runtime-ready");

  const coreState = await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      window,
      "ChappyAICore"
    );
    const core = window.ChappyAICore;
    return {
      exists: Boolean(core),
      frozen: Boolean(core && Object.isFrozen(core)),
      writable:
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? descriptor.writable === true
          : false,
      accessor: Boolean(descriptor?.get || descriptor?.set),
      localWaterInstalled:
        core?.__localWaterTheoryV2Installed === true,
      motorInstalled:
        core?.__motorMaintenanceTheoryV2Installed === true,
      assignmentCompat:
        window.ChappyAICoreAssignmentCompat || null
    };
  });
  recordStep("core-state", coreState);

  await page.evaluate(async () => {
    await window.ChappyAppRuntime.ensure("race");
    window.ChappyHomeDashboardV2?.setView("race");
  });
  recordStep("race-runtime-ready");

  await page.waitForSelector("#raceModeSelect", { timeout: 15_000 });
  await page.selectOption("#raceModeSelect", "review");
  await page.dispatchEvent("#raceModeSelect", "change");
  recordStep("review-mode-selected");

  await page.waitForFunction(
    () => {
      const button = document.querySelector("#fetchRaceBtn span");
      return button?.textContent?.includes("振り返り予想");
    },
    null,
    { timeout: 15_000 }
  );

  await page.fill("#dateInput", REVIEW_DATE);
  await page.dispatchEvent("#dateInput", "change");
  recordStep("review-date-selected", { date: REVIEW_DATE });

  const venueSelector =
    `#officialVenueGrid button[data-place="${REVIEW_PLACE}"]:not([disabled])`;
  await page.waitForSelector(venueSelector, {
    state: "visible",
    timeout: 60_000
  });
  await page.click(venueSelector);
  recordStep("review-place-selected", { place: REVIEW_PLACE });

  const reviewRaceNo = Number(REVIEW_RACE.replace(/R$/i, ""));
  const raceSelector =
    `#officialRaceGrid button[data-race-no="${reviewRaceNo}"]:not([disabled])`;
  await page.waitForSelector(raceSelector, {
    state: "visible",
    timeout: 60_000
  });
  await page.click(raceSelector);
  recordStep("review-race-selected", { race: REVIEW_RACE });

  await page.evaluate(() => {
    document.getElementById("fetchRaceBtn")?.click();
  });
  recordStep("review-prediction-clicked");

  await page.waitForFunction(
    () => {
      const error = document.getElementById("errorArea")?.textContent || "";
      const result = document.getElementById("resultArea")?.textContent || "";
      const loading =
        result.includes("読み込み中") ||
        result.includes("解析中") ||
        result.includes("取得中");
      const rendered =
        result.length > 120 &&
        !result.includes("ホームで開催場とレースを選ぶ");
      return Boolean(error.trim()) || (rendered && !loading);
    },
    null,
    { timeout: 90_000 }
  );

  diagnostic.final = await page.evaluate(() => ({
    errorArea: document.getElementById("errorArea")?.textContent || "",
    resultArea: document.getElementById("resultArea")?.textContent || "",
    statusArea: document.getElementById("statusArea")?.textContent || "",
    oddsStatus:
      document.getElementById("predictionOddsStatus")?.textContent || ""
  }));

  diagnostic.final = Object.fromEntries(
    Object.entries(diagnostic.final).map(([key, value]) => [
      key,
      compact(value).slice(0, 4000)
    ])
  );
  recordStep("review-flow-finished", diagnostic.final);

  const finalError = diagnostic.final.errorArea;
  if (finalError) {
    throw new Error(`review flow error: ${finalError}`);
  }

  if (diagnostic.pageErrors.length) {
    throw new Error(
      `page errors detected: ${diagnostic.pageErrors.map(row => row.message).join(" | ")}`
    );
  }
} catch (error) {
  fatalError = error;
  diagnostic.fatalError = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  console.error("[FATAL]", diagnostic.fatalError.message);
} finally {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "review-mode-webkit.png"),
    fullPage: true
  }).catch(() => {});

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "review-mode-webkit.json"),
    `${JSON.stringify(diagnostic, null, 2)}\n`,
    "utf8"
  );

  await browser.close();
}

if (fatalError) {
  process.exitCode = 1;
} else {
  console.log("review mode WebKit diagnostic: PASS");
}
