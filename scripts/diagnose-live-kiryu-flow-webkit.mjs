import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL ||
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const OUTPUT_DIR = process.env.DIAG_OUTPUT ||
  "artifacts/live-kiryu-flow-webkit";
const TOTAL_WAIT_MS = Number(process.env.TOTAL_WAIT_MS || 120000);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const report = {
  appUrl: APP_URL,
  place: PLACE,
  raceNo: RACE_NO,
  startedAt: new Date().toISOString(),
  events: [],
  pageErrors: [],
  consoleErrors: [],
  requests: [],
  failedRequests: [],
  snapshots: [],
  final: null,
  fatalError: null
};

function save() {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "live-kiryu-flow-webkit.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
}

function mark(name, detail = {}) {
  const row = { name, at: new Date().toISOString(), ...detail };
  report.events.push(row);
  save();
  console.log(`[MARK] ${name}`, JSON.stringify(detail));
}

function bust(url) {
  return `${url}${url.includes("?") ? "&" : "?"}kiryuFlowDiag=${Date.now()}`;
}

async function snapshot(page) {
  return page.evaluate(() => {
    const text = id =>
      document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() || "";
    const result = document.getElementById("resultArea");
    const predictionScripts = [...document.scripts]
      .filter(script =>
        script.dataset.chappyPredictionModule ||
        script.dataset.chappyRuntimeModule
      )
      .map(script => ({
        file: script.src.split("/").pop() || script.src,
        predictionModule: script.dataset.chappyPredictionModule || "",
        runtimeModule: script.dataset.chappyRuntimeModule || "",
        loaded: script.dataset.chappyLoaded || "",
        failed: script.dataset.chappyLoadFailed || ""
      }));
    return {
      resultLoading: result?.dataset?.raceLoading || "",
      resultLength: text("resultArea").length,
      resultText: text("resultArea").slice(0, 1000),
      errorText: text("errorArea").slice(0, 1500),
      oddsText: text("predictionOddsStatus").slice(0, 600),
      oddsState:
        document.getElementById("predictionOddsStatus")?.dataset?.state || "",
      statusText: text("statusArea").slice(0, 600),
      currentView:
        document.getElementById("predictionSection")?.hidden === false
          ? "prediction"
          : document.getElementById("homeDashboardV2")?.hidden === false
            ? "home"
            : "other",
      appRuntime: window.ChappyAppRuntime?.version || "",
      predictionRuntime: window.ChappyPredictionRuntime?.version || "",
      raceControls: Boolean(window.ChappyRaceControls),
      raceSelection: Boolean(window.ChappyRaceSelection),
      createPrediction: typeof window.createPrediction === "function",
      renderAll: typeof window.renderAll === "function",
      aiCore: Boolean(window.ChappyAICore),
      raceFlowReady: Boolean(window.ChappyRaceFlowResultPanel),
      currentFlowRace:
        window.ChappyRaceFlowResultPanel?.getCurrent?.() || null,
      predictionScripts
    };
  });
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
const requestStarted = new Map();

page.on("request", request => {
  requestStarted.set(request, Date.now());
  const url = request.url();
  if (/chappy-boatrace-api|\.js(?:\?|$)/.test(url)) {
    console.log("[REQUEST]", request.method(), url);
  }
});

page.on("response", response => {
  const request = response.request();
  const url = response.url();
  if (!/chappy-boatrace-api|\.js(?:\?|$)/.test(url)) return;
  const row = {
    url,
    status: response.status(),
    elapsedMs: Date.now() - Number(requestStarted.get(request) || Date.now())
  };
  report.requests.push(row);
  save();
  console.log("[RESPONSE]", JSON.stringify(row));
});

page.on("requestfailed", request => {
  const row = {
    url: request.url(),
    method: request.method(),
    errorText: request.failure()?.errorText || "",
    elapsedMs: Date.now() - Number(requestStarted.get(request) || Date.now())
  };
  report.failedRequests.push(row);
  save();
  console.error("[REQUEST FAILED]", JSON.stringify(row));
});

page.on("pageerror", error => {
  const row = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  report.pageErrors.push(row);
  save();
  console.error("[PAGEERROR]", row.message);
});

page.on("console", message => {
  const text = message.text();
  if (message.type() === "error") {
    report.consoleErrors.push(text);
    save();
  }
  if (
    message.type() === "error" ||
    /DIAG_EVENT|script\.js|予想|レース|オッズ|runtime/i.test(text)
  ) {
    console.log(`[CONSOLE ${message.type()}]`, text);
  }
});

let failure = null;

try {
  const targetUrl = bust(APP_URL);
  mark("open-start", { targetUrl });
  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  mark("open-finished");

  await page.waitForFunction(
    () => Boolean(
      window.ChappyAppRuntime &&
      window.ChappyPredictionRuntime &&
      window.ChappyHomeDashboardV2
    ),
    null,
    { timeout: 30000 }
  );

  await page.evaluate(() => {
    const emit = (name, detail) =>
      console.log(`DIAG_EVENT ${name} ${JSON.stringify(detail || {})}`);
    [
      "chappy:home-schedule",
      "chappy:race-flow-ready",
      "chappy:view-changed",
      "chappy:prediction-runtime-ready",
      "chappy:prediction-rendered",
      "chappy:odds-prefetched"
    ].forEach(name =>
      window.addEventListener(name, event => emit(name, event.detail))
    );
  });

  await page.waitForFunction(
    place =>
      [...document.querySelectorAll("[data-open-venue]")]
        .some(button => button.dataset.openVenue === place),
    PLACE,
    { timeout: 60000 }
  );

  const openVenueSelector =
    `[data-open-venue="${PLACE}"]`;
  mark("open-venue-click", { selector: openVenueSelector });
  await page.locator(openVenueSelector).first().click();

  const raceSelector =
    `[data-flow-place="${PLACE}"][data-flow-race="${RACE_NO}"]:not([disabled])`;
  await page.waitForSelector(raceSelector, {
    state: "visible",
    timeout: 60000
  });
  const raceButton = await page.locator(raceSelector).first().evaluate(button => ({
    text: button.textContent?.replace(/\s+/g, " ").trim() || "",
    jcd: button.dataset.flowJcd || "",
    deadline: button.dataset.flowDeadline || "",
    disabled: button.disabled
  }));
  mark("flow-race-ready", raceButton);

  const before = await snapshot(page);
  mark("before-click", before);

  const startedAt = Date.now();
  await page.locator(raceSelector).first().click();
  mark("flow-race-clicked");

  let lastKey = "";
  let terminal = false;
  let rendered = false;

  while (Date.now() - startedAt < TOTAL_WAIT_MS) {
    await page.waitForTimeout(1500);
    const current = await snapshot(page);
    const key = JSON.stringify(current);
    if (key !== lastKey) {
      lastKey = key;
      report.snapshots.push({
        elapsedMs: Date.now() - startedAt,
        ...current
      });
      save();
      console.log("[SNAPSHOT]", JSON.stringify(report.snapshots.at(-1)));
    }

    rendered =
      current.resultLength > 500 &&
      current.resultLoading !== "true" &&
      !/読み込み中/.test(current.resultText);
    terminal =
      rendered ||
      current.resultLoading === "error" ||
      Boolean(current.errorText);
    if (terminal) break;
  }

  report.final = {
    elapsedMs: Date.now() - startedAt,
    terminal,
    rendered,
    ...(await snapshot(page))
  };
  save();
  mark("final", report.final);

  if (!terminal) {
    throw new Error(
      `expanded Kiryu ${RACE_NO}R did not reach a terminal state in ${TOTAL_WAIT_MS}ms`
    );
  }
} catch (error) {
  failure = error;
  report.fatalError = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  save();
  console.error("[FATAL]", report.fatalError.message);
} finally {
  await page.screenshot({
    path: path.join(OUTPUT_DIR, "live-kiryu-flow-webkit.png"),
    fullPage: true
  }).catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

if (failure) process.exitCode = 1;
else console.log("live Kiryu expanded-flow WebKit diagnostic: PASS");
