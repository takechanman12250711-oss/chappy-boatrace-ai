import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);

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

  const diagnostics = {
    errors: [],
    rejections: [],
    appendedScripts: [],
    functionSources: []
  };
  window.__chappyFormulaDiagnostics = diagnostics;

  window.addEventListener("error", event => {
    const row = {
      message: String(event.message || ""),
      filename: String(event.filename || ""),
      lineno: Number(event.lineno || 0),
      colno: Number(event.colno || 0),
      name: String(event.error?.name || ""),
      stack: String(event.error?.stack || "")
    };
    diagnostics.errors.push(row);
    console.log("FORMULA_DIAG_ERROR", JSON.stringify(row));
  }, true);

  window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    const row = {
      message: String(reason?.message || reason || ""),
      name: String(reason?.name || ""),
      stack: String(reason?.stack || "")
    };
    diagnostics.rejections.push(row);
    console.log("FORMULA_DIAG_REJECTION", JSON.stringify(row));
  }, true);

  const nativeAppendChild = Node.prototype.appendChild;
  Node.prototype.appendChild = function (node) {
    if (node?.tagName === "SCRIPT") {
      const text = String(node.textContent || "");
      const row = {
        src: String(node.src || ""),
        type: String(node.type || ""),
        textLength: text.length,
        sourceURL: (text.match(/sourceURL\s*=\s*([^\s]+)/i) || [])[1] || "",
        textStart: text.slice(0, 1000),
        textAroundFormula: (() => {
          const index = text.toLowerCase().indexOf("formula");
          return index >= 0
            ? text.slice(Math.max(0, index - 600), index + 1600)
            : "";
        })()
      };
      diagnostics.appendedScripts.push(row);
      if (row.sourceURL || row.textAroundFormula) {
        console.log("FORMULA_DIAG_SCRIPT", JSON.stringify(row));
      }
    }
    return nativeAppendChild.call(this, node);
  };

  const NativeFunction = Function;
  try {
    window.Function = new Proxy(NativeFunction, {
      apply(target, thisArg, args) {
        const source = args.map(value => String(value)).join("\n");
        if (/formula|sourceURL/i.test(source)) {
          const row = {
            mode: "apply",
            length: source.length,
            sourceURL: (source.match(/sourceURL\s*=\s*([^\s]+)/i) || [])[1] || "",
            sourceStart: source.slice(0, 1500),
            sourceAroundFormula: (() => {
              const index = source.toLowerCase().indexOf("formula");
              return index >= 0
                ? source.slice(Math.max(0, index - 800), index + 2400)
                : "";
            })()
          };
          diagnostics.functionSources.push(row);
          console.log("FORMULA_DIAG_FUNCTION", JSON.stringify(row));
        }
        return Reflect.apply(target, thisArg, args);
      },
      construct(target, args, newTarget) {
        const source = args.map(value => String(value)).join("\n");
        if (/formula|sourceURL/i.test(source)) {
          const row = {
            mode: "construct",
            length: source.length,
            sourceURL: (source.match(/sourceURL\s*=\s*([^\s]+)/i) || [])[1] || "",
            sourceStart: source.slice(0, 1500),
            sourceAroundFormula: (() => {
              const index = source.toLowerCase().indexOf("formula");
              return index >= 0
                ? source.slice(Math.max(0, index - 800), index + 2400)
                : "";
            })()
          };
          diagnostics.functionSources.push(row);
          console.log("FORMULA_DIAG_FUNCTION", JSON.stringify(row));
        }
        return Reflect.construct(target, args, newTarget);
      }
    });
  } catch (_) {}
});

const page = await context.newPage();
const network = [];
const pageErrors = [];
const consoleRows = [];

page.on("request", request => {
  const url = request.url();
  if (/\.js(?:\?|$)|blob:|data:|chappy-boatrace-api/.test(url)) {
    network.push({ phase: "request", method: request.method(), url });
    console.log("[REQUEST]", request.method(), url);
  }
});
page.on("response", response => {
  const url = response.url();
  if (/\.js(?:\?|$)|blob:|data:|chappy-boatrace-api/.test(url)) {
    network.push({ phase: "response", status: response.status(), url });
    console.log("[RESPONSE]", response.status(), url);
  }
});
page.on("requestfailed", request => {
  const row = {
    phase: "failed",
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText || ""
  };
  network.push(row);
  console.error("[REQUEST FAILED]", JSON.stringify(row));
});
page.on("pageerror", error => {
  const row = {
    message: String(error?.message || error),
    name: String(error?.name || ""),
    stack: String(error?.stack || "")
  };
  pageErrors.push(row);
  console.error("[PAGEERROR]", JSON.stringify(row));
});
page.on("console", message => {
  const row = {
    type: message.type(),
    text: message.text(),
    location: message.location()
  };
  if (
    message.type() === "error" ||
    /FORMULA_DIAG|prediction|formula|fetchAndRenderRace/i.test(row.text)
  ) {
    consoleRows.push(row);
    console.log("[CONSOLE]", JSON.stringify(row));
  }
});

let failure = null;

try {
  const target = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
    `formulaDiag=${Date.now()}`;
  await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await page.waitForFunction(
    () => Boolean(
      window.ChappyLiveRaceSelectionTerminalGuard &&
      window.ChappyHomeDashboardV2 &&
      window.ChappyAppRuntime
    ),
    null,
    { timeout: 30_000 }
  );

  await page.waitForFunction(
    place => [...document.querySelectorAll("[data-open-venue]")]
      .some(button => button.dataset.openVenue === place),
    PLACE,
    { timeout: 60_000 }
  );

  await page.locator(`[data-open-venue="${PLACE}"]`).first().click();

  const raceSelector =
    `[data-flow-place="${PLACE}"][data-flow-race="${RACE_NO}"]:not([disabled])`;
  await page.waitForSelector(raceSelector, {
    state: "visible",
    timeout: 60_000
  });
  await page.locator(raceSelector).first().click();

  await page.waitForFunction(
    () => {
      const diagnostics = window.__chappyFormulaDiagnostics;
      const resultArea = document.getElementById("resultArea");
      const resultText = (resultArea?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
      return (
        diagnostics?.errors?.length > 0 ||
        diagnostics?.rejections?.length > 0 ||
        (
          resultArea?.dataset?.raceLoading !== "true" &&
          resultText.length > 500 &&
          !resultText.includes("読み込み中")
        )
      );
    },
    null,
    { timeout: 120_000 }
  );

  const final = await page.evaluate(() => {
    const text = id =>
      (document.getElementById(id)?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    const scripts = [...document.scripts].map(script => ({
      src: String(script.src || ""),
      type: String(script.type || ""),
      textLength: String(script.textContent || "").length,
      runtimeModule: script.dataset.chappyRuntimeModule || "",
      predictionModule: script.dataset.chappyPredictionModule || "",
      loaded: script.dataset.chappyLoaded || "",
      failed: script.dataset.chappyLoadFailed || ""
    }));
    const resources = performance.getEntriesByType("resource").map(entry => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      duration: Math.round(entry.duration)
    }));
    return {
      diagnostics: window.__chappyFormulaDiagnostics,
      scripts,
      resources,
      date: document.getElementById("dateInput")?.value || "",
      mode: document.getElementById("raceModeSelect")?.value || "",
      place: document.getElementById("placeSelect")?.value || "",
      race: document.getElementById("raceSelect")?.value || "",
      loading: document.getElementById("resultArea")?.dataset?.raceLoading || "",
      resultLength: text("resultArea").length,
      resultStart: text("resultArea").slice(0, 1200),
      error: text("errorArea").slice(0, 2000),
      status: text("statusArea"),
      oddsStatus: text("predictionOddsStatus"),
      globals: {
        createPrediction: typeof window.createPrediction,
        renderAll: typeof window.renderAll,
        aiCore: Boolean(window.ChappyAICore),
        practicalSelection: Boolean(window.ChappyPracticalSelection)
      }
    };
  });

  console.log("FORMULA_DIAG_FINAL_START");
  console.log(JSON.stringify({
    final,
    pageErrors,
    consoleRows,
    network
  }, null, 2));
  console.log("FORMULA_DIAG_FINAL_END");
} catch (error) {
  failure = error;
  console.error("[FATAL]", error?.stack || error);
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

if (failure) process.exitCode = 1;
