import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
    "Mobile/15E148 Safari/604.1"
});
const page = await context.newPage();

const lines = [];
const log = text => {
  const row = `${new Date().toISOString()} ${text}`;
  lines.push(row);
  console.log(row);
};

page.on("console", message => {
  const text = message.text();
  if (text.startsWith("FLOW_STAGE")) log(text);
});
page.on("pageerror", error => log(`PAGEERROR ${error.message}`));
page.on("requestfailed", request =>
  log(`REQUEST_FAILED ${request.url()} ${request.failure()?.errorText || ""}`)
);

const targetUrl = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}functionStages=${Date.now()}`;
log(`OPEN ${targetUrl}`);
await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.ChappyPredictionRuntime && window.ChappyAppRuntime && window.ChappyHomeDashboardV2),
  null,
  { timeout: 30000 }
);

await page.evaluate(async () => {
  await window.ChappyPredictionRuntime.ensureReady();
  await window.ChappyAppRuntime.ensure("race");
  window.ChappyHomeDashboardV2.setView("race");

  const mark = (phase, name, detail = "") => {
    console.log(`FLOW_STAGE ${phase} ${name}${detail ? ` ${detail}` : ""}`);
  };

  const wrapFunction = (owner, key, label) => {
    const original = owner?.[key];
    if (typeof original !== "function") {
      mark("missing", label);
      return false;
    }
    owner[key] = function (...args) {
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
              mark("fail", label, String(error?.message || error));
              throw error;
            }
          );
        }
        mark("end", label);
        return value;
      } catch (error) {
        mark("fail", label, String(error?.message || error));
        throw error;
      }
    };
    return true;
  };

  wrapFunction(window, "createPrediction", "createPrediction");
  wrapFunction(window, "createTheory", "createTheory");
  wrapFunction(window, "analyzeTheory", "analyzeTheory");
  wrapFunction(window, "createAI", "createAI");
  wrapFunction(window, "createAIIndex", "createAIIndex");
  wrapFunction(window, "renderAll", "renderAll");

  const theoryInput = window.ChappyTheoryInput;
  if (theoryInput && typeof theoryInput.prepare === "function") {
    const originalPrepare = theoryInput.prepare.bind(theoryInput);
    window.ChappyTheoryInput = Object.freeze({
      ...theoryInput,
      prepare(...args) {
        mark("start", "theoryInput.prepare");
        try {
          const result = originalPrepare(...args);
          mark("end", "theoryInput.prepare");
          return result;
        } catch (error) {
          mark("fail", "theoryInput.prepare", String(error?.message || error));
          throw error;
        }
      }
    });
  } else {
    mark("missing", "theoryInput.prepare");
  }

  const core = window.ChappyAICore;
  if (core && typeof core.buildPredictionData === "function") {
    const originalBuild = core.buildPredictionData.bind(core);
    window.ChappyAICore = Object.freeze({
      ...core,
      buildPredictionData(...args) {
        mark("start", "aiCore.buildPredictionData");
        try {
          const result = originalBuild(...args);
          mark("end", "aiCore.buildPredictionData");
          return result;
        } catch (error) {
          mark("fail", "aiCore.buildPredictionData", String(error?.message || error));
          throw error;
        }
      }
    });
  } else {
    mark("missing", "aiCore.buildPredictionData");
  }

  const practical = window.ChappyPracticalSelection;
  if (practical && typeof practical.select === "function") {
    const originalSelect = practical.select.bind(practical);
    window.ChappyPracticalSelection = Object.freeze({
      ...practical,
      select(...args) {
        mark("start", "practical.select");
        try {
          const result = originalSelect(...args);
          mark("end", "practical.select");
          return result;
        } catch (error) {
          mark("fail", "practical.select", String(error?.message || error));
          throw error;
        }
      }
    });
  } else {
    mark("missing", "practical.select");
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = String(args[0]?.url || args[0] || "");
    const label = /\/api\/race/.test(url)
      ? "fetch.race"
      : /\/api\/odds/.test(url)
        ? "fetch.odds"
        : /\/api\/result/.test(url)
          ? "fetch.result"
          : /\/api\/schedule/.test(url)
            ? "fetch.schedule"
            : "fetch.other";
    mark("start", label, url);
    try {
      const response = await originalFetch(...args);
      mark("end", label, `${response.status} ${url}`);
      return response;
    } catch (error) {
      mark("fail", label, `${String(error?.message || error)} ${url}`);
      throw error;
    }
  };

  window.addEventListener("chappy:prediction-rendered", event =>
    mark("event", "prediction-rendered", JSON.stringify(event.detail || {}))
  );
  window.addEventListener("chappy:view-changed", event =>
    mark("event", "view-changed", JSON.stringify(event.detail || {}))
  );
  mark("ready", "wrappers-installed");
});

await page.selectOption("#raceModeSelect", "review");
await page.fill("#dateInput", "2026-08-24");
await page.dispatchEvent("#dateInput", "change");
await page.waitForSelector(
  '#officialVenueGrid button[data-place="蒲郡"]:not([disabled])',
  { state: "visible", timeout: 60000 }
);
await page.click('#officialVenueGrid button[data-place="蒲郡"]:not([disabled])');
await page.waitForSelector(
  '#officialRaceGrid button[data-race-no="12"]:not([disabled])',
  { state: "visible", timeout: 60000 }
);
await page.click('#officialRaceGrid button[data-race-no="12"]:not([disabled])');
log("CLICK prediction");
await page.click("#fetchRaceBtn");

await new Promise(resolve => setTimeout(resolve, 120000));
log("NODE_TIMEOUT_REACHED");
console.log("TRACE_SUMMARY_START");
console.log(lines.join("\n"));
console.log("TRACE_SUMMARY_END");
process.exit(0);
