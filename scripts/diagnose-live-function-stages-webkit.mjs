import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const TRACE_MS = Number(process.env.TRACE_MS || 100000);

const stamp = () => new Date().toISOString();
const log = (name, detail = "") =>
  console.log(`LIVE_STAGE ${stamp()} ${name}${detail ? ` ${detail}` : ""}`);

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  timezoneId: "UTC",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
    "Mobile/15E148 Safari/604.1"
});

await context.addInitScript(() => {
  const stale = JSON.stringify({
    savedAt: Date.now(),
    scheduleDate: "20260824",
    schedule: [{
      jcd: "01",
      place: "桐生",
      currentRaceNo: 1,
      deadlineAt: "2026-08-24T14:57:00+09:00",
      selectable: true
    }]
  });
  sessionStorage.setItem("chappy-home-v2-cache", stale);
  localStorage.setItem("chappy-home-v2-cache", stale);
});

const page = await context.newPage();
const started = new Map();

page.on("request", request => {
  started.set(request, Date.now());
  const url = request.url();
  if (/\.js(?:\?|$)|chappy-boatrace-api/.test(url)) {
    log("request", `${request.method()} ${url}`);
  }
});
page.on("response", response => {
  const request = response.request();
  const url = response.url();
  if (/\.js(?:\?|$)|chappy-boatrace-api/.test(url)) {
    log(
      "response",
      `${response.status()} ${Date.now() - Number(started.get(request) || Date.now())}ms ${url}`
    );
  }
});
page.on("requestfailed", request =>
  log(
    "request-failed",
    `${request.failure()?.errorText || ""} ${request.url()}`
  )
);
page.on("pageerror", error =>
  log("pageerror", `${error?.message || error} STACK=${String(error?.stack || "")}`)
);
page.on("console", message => {
  const text = message.text();
  if (
    text.startsWith("LIVE_STAGE_PAGE") ||
    message.type() === "error" ||
    /fetchAndRenderRace|prediction\.js error|official result error/i.test(text)
  ) {
    log(
      `console-${message.type()}`,
      `${text} LOCATION=${JSON.stringify(message.location())}`
    );
  }
});

const target = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
  `liveStage=${Date.now()}`;
log("open-start", target);
await page.goto(target, {
  waitUntil: "domcontentloaded",
  timeout: 60000
});
log("open-finished");

await page.waitForFunction(
  () => Boolean(
    window.ChappyLiveRaceSelectionTerminalGuard &&
    window.ChappyHomeDashboardV2 &&
    window.ChappyAppRuntime
  ),
  null,
  { timeout: 30000 }
);

await page.evaluate(() => {
  const mark = (phase, name, detail = "") => {
    console.log(
      `LIVE_STAGE_PAGE ${new Date().toISOString()} ${phase} ${name}` +
      `${detail ? ` ${detail}` : ""}`
    );
  };

  const wrap = (owner, key, label) => {
    const original = owner?.[key];
    if (typeof original !== "function") {
      mark("missing", label);
      return false;
    }
    if (original.__chappyLiveStageWrapped === true) return true;

    const wrapped = function (...args) {
      mark("start", label);
      try {
        const value = original.apply(this, args);
        if (value && typeof value.then === "function") {
          return value.then(
            result => {
              mark("end", label);
              return result;
            },
            error => {
              mark(
                "fail",
                label,
                `${String(error?.message || error)} STACK=${String(error?.stack || "")}`
              );
              throw error;
            }
          );
        }
        mark("end", label);
        return value;
      } catch (error) {
        mark(
          "fail",
          label,
          `${String(error?.message || error)} STACK=${String(error?.stack || "")}`
        );
        throw error;
      }
    };
    Object.defineProperty(wrapped, "__chappyLiveStageWrapped", {
      configurable: true,
      value: true
    });
    try {
      owner[key] = wrapped;
      return owner[key] === wrapped;
    } catch (error) {
      mark("wrap-fail", label, String(error?.message || error));
      return false;
    }
  };

  const replaceObjectMethod = (globalKey, method, label) => {
    const current = window[globalKey];
    const original = current?.[method];
    if (typeof original !== "function") {
      mark("missing", label);
      return false;
    }
    const replacement = {
      ...current,
      [method](...args) {
        mark("start", label);
        try {
          const value = original.apply(current, args);
          if (value && typeof value.then === "function") {
            return value.then(
              result => {
                mark("end", label);
                return result;
              },
              error => {
                mark(
                  "fail",
                  label,
                  `${String(error?.message || error)} STACK=${String(error?.stack || "")}`
                );
                throw error;
              }
            );
          }
          mark("end", label);
          return value;
        } catch (error) {
          mark(
            "fail",
            label,
            `${String(error?.message || error)} STACK=${String(error?.stack || "")}`
          );
          throw error;
        }
      }
    };
    try {
      window[globalKey] = Object.freeze(replacement);
      return true;
    } catch (error) {
      mark("wrap-fail", label, String(error?.message || error));
      return false;
    }
  };

  const installRuntimeWrappers = () => {
    mark("ready", "runtime-wrappers-start");
    wrap(window, "createPrediction", "createPrediction");
    wrap(window, "createTheory", "createTheory");
    wrap(window, "analyzeTheory", "analyzeTheory");
    wrap(window, "createAI", "createAI");
    wrap(window, "createAIIndex", "createAIIndex");
    wrap(window, "renderAll", "renderAll");
    replaceObjectMethod(
      "ChappyTheoryInput",
      "prepare",
      "theoryInput.prepare"
    );
    replaceObjectMethod(
      "ChappyPracticalSelection",
      "select",
      "practical.select"
    );
    mark("ready", "runtime-wrappers-end");
  };

  replaceObjectMethod(
    "ChappyPredictionConditions",
    "capture",
    "predictionConditions.capture"
  );

  window.addEventListener(
    "chappy:prediction-runtime-ready",
    event => {
      mark(
        "event",
        "prediction-runtime-ready",
        JSON.stringify(event.detail || {})
      );
      installRuntimeWrappers();
    }
  );
  window.addEventListener(
    "chappy:prediction-rendered",
    event => mark(
      "event",
      "prediction-rendered",
      JSON.stringify(event.detail || {})
    )
  );
  window.addEventListener(
    "chappy:view-changed",
    event => mark(
      "event",
      "view-changed",
      JSON.stringify(event.detail || {})
    )
  );

  const state = () => {
    const result = document.getElementById("resultArea");
    const compact = id =>
      (document.getElementById(id)?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    const guardState =
      window.ChappyLiveRaceSelectionTerminalGuard?.getState?.() || null;
    return {
      date: document.getElementById("dateInput")?.value || "",
      mode: document.getElementById("raceModeSelect")?.value || "",
      loading: result?.dataset?.raceLoading || "",
      resultLength: compact("resultArea").length,
      resultStart: compact("resultArea").slice(0, 180),
      error: compact("errorArea").slice(0, 240),
      status: compact("statusArea").slice(0, 180),
      oddsStatus: compact("predictionOddsStatus").slice(0, 120),
      runtimeReady: typeof window.createPrediction === "function",
      renderReady: typeof window.renderAll === "function",
      guardState
    };
  };

  const reportState = label =>
    mark("state", label, JSON.stringify(state()));

  reportState("initial");
  window.setInterval(() => reportState("interval"), 5000);

  const resultArea = document.getElementById("resultArea");
  if (resultArea && typeof MutationObserver === "function") {
    new MutationObserver(() => reportState("mutation"))
      .observe(resultArea, {
        attributes: true,
        childList: true,
        subtree: true
      });
  }

  window.__chappyLiveStageInstallWrappers = installRuntimeWrappers;
});

await page.waitForFunction(
  place => [...document.querySelectorAll("[data-open-venue]")]
    .some(button => button.dataset.openVenue === place),
  PLACE,
  { timeout: 60000 }
);
log("venue-click", PLACE);
await page.locator(`[data-open-venue="${PLACE}"]`).first().click();

const raceSelector =
  `[data-flow-place="${PLACE}"][data-flow-race="${RACE_NO}"]:not([disabled])`;
await page.waitForSelector(raceSelector, {
  state: "visible",
  timeout: 60000
});
log("race-click", `${PLACE} ${RACE_NO}R`);
await page.locator(raceSelector).first().click();

setTimeout(() => {
  log("node-trace-end", `${TRACE_MS}ms`);
  process.exit(0);
}, TRACE_MS);
