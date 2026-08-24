import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL ||
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";
const DATE = process.env.RACE_DATE || "2026-08-25";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const OUTPUT_DIR = process.env.DIAG_OUTPUT || "artifacts/live-kiryu-webkit";
const TOTAL_WAIT_MS = Number(process.env.TOTAL_WAIT_MS || 90000);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const report = {
  appUrl: APP_URL,
  date: DATE,
  place: PLACE,
  raceNo: RACE_NO,
  startedAt: new Date().toISOString(),
  events: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  responses: [],
  snapshots: [],
  final: null,
  fatalError: null
};

function save() {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "live-kiryu-webkit.json"),
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

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cacheBust(url) {
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}liveKiryuDiag=${Date.now()}`;
}

async function stateOf(page) {
  return page.evaluate(() => {
    const text = id =>
      document.getElementById(id)?.textContent?.replace(/\s+/g, " ").trim() || "";
    const result = document.getElementById("resultArea");
    const predictionSection = document.getElementById("predictionSection");
    const fetchButton = document.getElementById("fetchRaceBtn");
    const scripts = [...document.scripts]
      .filter(script =>
        script.dataset.chappyRuntimeModule ||
        script.dataset.chappyPredictionModule ||
        /prediction-runtime-loader|app-runtime-loader|script\.js/.test(script.src)
      )
      .map(script => ({
        src: script.src.split("/").pop() || script.src,
        runtimeModule: script.dataset.chappyRuntimeModule || "",
        predictionModule: script.dataset.chappyPredictionModule || "",
        loaded: script.dataset.chappyLoaded || "",
        failed: script.dataset.chappyLoadFailed || ""
      }));

    return {
      href: location.href,
      visibility: document.visibilityState,
      resultLoading: result?.dataset?.raceLoading || "",
      resultText: text("resultArea").slice(0, 900),
      resultTextLength: text("resultArea").length,
      errorText: text("errorArea").slice(0, 1200),
      oddsText: text("predictionOddsStatus").slice(0, 500),
      oddsState:
        document.getElementById("predictionOddsStatus")?.dataset?.state || "",
      statusText: text("statusArea").slice(0, 500),
      predictionVisible: predictionSection?.hidden === false,
      fetchButtonBound:
        fetchButton?.dataset?.chappyRaceControlBound || "",
      fetchButtonDisabled: fetchButton?.disabled ?? null,
      selectedMode: document.getElementById("raceModeSelect")?.value || "",
      selectedPlace: document.getElementById("placeSelect")?.value || "",
      selectedRace: document.getElementById("raceSelect")?.value || "",
      selectedDate: document.getElementById("dateInput")?.value || "",
      appRuntime: window.ChappyAppRuntime?.version || "",
      predictionRuntime: window.ChappyPredictionRuntime?.version || "",
      resultTimeout:
        window.ChappyResultRequestTimeout?.version || "",
      resultTimeoutInstalled:
        window.ChappyResultRequestTimeout?.installed === true,
      fetchResultTimeoutPatched:
        window.fetch?.__chappyResultRequestTimeoutPatched === true,
      raceControls: Boolean(window.ChappyRaceControls),
      raceSelection: Boolean(window.ChappyRaceSelection),
      raceSelectionSelect:
        typeof window.ChappyRaceSelection?.select === "function",
      aiCore: Boolean(window.ChappyAICore),
      createPrediction: typeof window.createPrediction === "function",
      renderAll: typeof window.renderAll === "function",
      scripts
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
    mark("request-start", {
      method: request.method(),
      url
    });
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
  report.responses.push(row);
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
    /Chappy|予想|レース|オッズ|script\.js|runtime/i.test(text)
  ) {
    console.log(`[CONSOLE ${message.type()}]`, text);
  }
});

let failure = null;

try {
  const targetUrl = cacheBust(APP_URL);
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
    const emit = (name, detail) => {
      console.log(`DIAG_EVENT ${name} ${JSON.stringify(detail || {})}`);
    };
    [
      "chappy:view-changed",
      "chappy:prediction-runtime-ready",
      "chappy:prediction-rendered",
      "chappy:odds-prefetched",
      "chappy:home-schedule"
    ].forEach(name => {
      window.addEventListener(name, event => emit(name, event.detail));
    });

    const observed = [
      "resultArea",
      "predictionOddsStatus",
      "errorArea",
      "statusArea"
    ];
    const observer = new MutationObserver(records => {
      const ids = [...new Set(records.map(record =>
        record.target?.id || record.target?.parentElement?.id || ""
      ).filter(Boolean))];
      if (ids.length) emit("mutation", { ids });
    });
    observed.forEach(id => {
      const node = document.getElementById(id);
      if (node) observer.observe(node, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true
      });
    });
  });

  const baseState = await stateOf(page);
  mark("base-state", baseState);

  await page.waitForFunction(
    ({ place, raceNo }) =>
      [...document.querySelectorAll("[data-place][data-race]")].some(button =>
        button.dataset.place === place &&
        Number(button.dataset.race) === raceNo &&
        button.disabled !== true
      ),
    { place: PLACE, raceNo: RACE_NO },
    { timeout: 60000 }
  );

  const selector =
    `[data-place="${PLACE}"][data-race="${RACE_NO}"]:not([disabled])`;
  const matched = await page.locator(selector).count();
  mark("race-button-ready", { selector, matched });

  const startedAt = Date.now();
  await page.locator(selector).first().click();
  mark("race-button-clicked");

  let terminal = false;
  let rendered = false;
  let lastSnapshotKey = "";

  while (Date.now() - startedAt < TOTAL_WAIT_MS) {
    await page.waitForTimeout(2000);
    const snapshot = await stateOf(page);
    const key = JSON.stringify({
      resultLoading: snapshot.resultLoading,
      resultText: snapshot.resultText,
      errorText: snapshot.errorText,
      oddsText: snapshot.oddsText,
      statusText: snapshot.statusText,
      raceSelection: snapshot.raceSelection,
      aiCore: snapshot.aiCore,
      createPrediction: snapshot.createPrediction,
      renderAll: snapshot.renderAll,
      scripts: snapshot.scripts
    });
    if (key !== lastSnapshotKey) {
      lastSnapshotKey = key;
      report.snapshots.push({
        elapsedMs: Date.now() - startedAt,
        ...snapshot
      });
      save();
      console.log("[SNAPSHOT]", JSON.stringify(report.snapshots.at(-1)));
    }

    rendered =
      snapshot.resultTextLength > 500 &&
      snapshot.resultLoading !== "true" &&
      !/読み込み中/.test(snapshot.resultText);
    terminal = rendered || Boolean(snapshot.errorText) ||
      snapshot.resultLoading === "error";
    if (terminal) break;
  }

  report.final = {
    elapsedMs: Date.now() - startedAt,
    terminal,
    rendered,
    ...(await stateOf(page))
  };
  save();
  mark("final-state", report.final);

  if (!terminal) {
    throw new Error(
      `live prediction did not reach a terminal state in ${TOTAL_WAIT_MS}ms`
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
    path: path.join(OUTPUT_DIR, "live-kiryu-webkit.png"),
    fullPage: true
  }).catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

if (failure) process.exitCode = 1;
else console.log("live Kiryu WebKit diagnostic: PASS");
