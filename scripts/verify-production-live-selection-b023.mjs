import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL ||
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const EXPECTED_DATE = process.env.EXPECTED_DATE || "20260825";
const EXPECTED_INPUT_DATE = `${EXPECTED_DATE.slice(0, 4)}-${EXPECTED_DATE.slice(4, 6)}-${EXPECTED_DATE.slice(6, 8)}`;
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS || 150000);

const requests = [];
const pageErrors = [];
const consoleErrors = [];
let browser = null;
let context = null;
let page = null;
let failure = null;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  browser = await webkit.launch({ headless: true });
  context = await browser.newContext({
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

  page = await context.newPage();
  page.on("request", request => {
    const url = request.url();
    if (/chappy-boatrace-api/.test(url)) {
      requests.push(url);
      console.log("[REQUEST]", url);
    }
  });
  page.on("pageerror", error => {
    const message = String(error?.message || error);
    pageErrors.push(message);
    console.error("[PAGEERROR]", message);
  });
  page.on("console", message => {
    if (message.type() === "error") {
      const text = message.text();
      consoleErrors.push(text);
      console.error("[CONSOLE ERROR]", text);
    }
  });

  const target = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
    `verifyProduction=${Date.now()}`;
  console.log("[OPEN]", target);
  await page.goto(target, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForFunction(
    () => Boolean(
      window.ChappyLiveRaceSelectionTerminalGuard &&
      window.ChappyHomeDashboardV2 &&
      window.ChappyAppRuntime
    ),
    null,
    { timeout: 60000 }
  );

  const startup = await page.evaluate(() => {
    const cacheDates = [sessionStorage, localStorage].map(storage => {
      const raw = storage.getItem("chappy-home-v2-cache");
      if (!raw) return "";
      try {
        return String(JSON.parse(raw)?.scheduleDate || "");
      } catch (_) {
        return "invalid";
      }
    });
    return {
      guardVersion: window.ChappyLiveRaceSelectionTerminalGuard?.version || "",
      installed: window.ChappyLiveRaceSelectionTerminalGuard?.installed === true,
      dateInputProtected:
        window.ChappyLiveRaceSelectionTerminalGuard?.dateInputProtected === true,
      inputDate: document.getElementById("dateInput")?.value || "",
      cacheDates
    };
  });
  console.log("[STARTUP]", JSON.stringify(startup));

  if (startup.guardVersion !== "20260825-live-selection-terminal2") {
    throw new Error(`production guard version mismatch: ${JSON.stringify(startup)}`);
  }
  if (!startup.installed || !startup.dateInputProtected) {
    throw new Error(`production guard is not active: ${JSON.stringify(startup)}`);
  }
  if (startup.inputDate !== EXPECTED_INPUT_DATE) {
    throw new Error(`production JST date mismatch: ${JSON.stringify(startup)}`);
  }
  if (startup.cacheDates.some(date => date === "20260824")) {
    throw new Error(`production stale cache survived: ${JSON.stringify(startup)}`);
  }

  let resolveTerminal;
  const terminalPromise = new Promise(resolve => {
    resolveTerminal = resolve;
  });

  await page.exposeFunction("__chappyProductionTerminal", payload => {
    resolveTerminal(payload);
  });

  await page.evaluate(() => {
    const snapshot = kind => {
      const resultArea = document.getElementById("resultArea");
      const text = id =>
        (document.getElementById(id)?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
      return {
        kind,
        inputDate: document.getElementById("dateInput")?.value || "",
        mode: document.getElementById("raceModeSelect")?.value || "",
        place: document.getElementById("placeSelect")?.value || "",
        race: document.getElementById("raceSelect")?.value || "",
        loading: resultArea?.dataset?.raceLoading || "",
        resultLength: text("resultArea").length,
        resultStart: text("resultArea").slice(0, 800),
        error: text("errorArea").slice(0, 1000),
        oddsStatus: text("predictionOddsStatus"),
        status: text("statusArea"),
        intent: window.__CHAPPY_LIVE_RACE_SELECTION_INTENT__ || null,
        guardState:
          window.ChappyLiveRaceSelectionTerminalGuard?.getState?.() || null
      };
    };

    window.addEventListener(
      "chappy:prediction-rendered",
      () => window.__chappyProductionTerminal(snapshot("rendered")),
      { once: true }
    );
    window.addEventListener(
      "chappy:live-race-selection-timeout",
      () => window.__chappyProductionTerminal(snapshot("guard-timeout")),
      { once: true }
    );
  });

  await page.waitForFunction(
    place => [...document.querySelectorAll("[data-open-venue]")]
      .some(button => button.dataset.openVenue === place),
    PLACE,
    { timeout: 60000 }
  );
  await page.locator(`[data-open-venue="${PLACE}"]`).first().click();

  const raceSelector =
    `[data-flow-place="${PLACE}"][data-flow-race="${RACE_NO}"]:not([disabled])`;
  await page.waitForSelector(raceSelector, {
    state: "visible",
    timeout: 60000
  });
  await page.locator(raceSelector).first().click();

  const terminal = await Promise.race([
    terminalPromise,
    delay(TIMEOUT_MS).then(() => ({ kind: "node-timeout" }))
  ]);
  console.log("[TERMINAL]", JSON.stringify(terminal, null, 2));

  const staleRequests = requests.filter(url =>
    /[?&]date=20260824(?:&|$)/.test(url)
  );
  const expectedRequests = requests.filter(url =>
    new RegExp(`[?&]date=${EXPECTED_DATE}(?:&|$)`).test(url)
  );

  if (terminal.kind !== "rendered") {
    throw new Error(`production did not render: ${JSON.stringify(terminal)}`);
  }
  if (terminal.inputDate !== EXPECTED_INPUT_DATE) {
    throw new Error(`production date changed back: ${JSON.stringify(terminal)}`);
  }
  if (terminal.loading === "true") {
    throw new Error("production remained in loading state after render event");
  }
  if (terminal.error) {
    throw new Error(`production prediction error: ${terminal.error}`);
  }
  if (terminal.resultLength <= 500) {
    throw new Error(`production result was not rendered: ${JSON.stringify(terminal)}`);
  }
  if (staleRequests.length) {
    throw new Error(`production requested previous date: ${staleRequests.join(" | ")}`);
  }
  if (!expectedRequests.length) {
    throw new Error(`production made no ${EXPECTED_DATE} API request: ${requests.join(" | ")}`);
  }
  if (
    terminal.intent?.date !== EXPECTED_DATE ||
    terminal.intent?.place !== PLACE ||
    Number(terminal.intent?.raceNo) !== RACE_NO
  ) {
    throw new Error(`production selection intent mismatch: ${JSON.stringify(terminal.intent)}`);
  }
  if (pageErrors.some(message => /readonly|read only/i.test(message))) {
    throw new Error(`production readonly page error: ${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    startup,
    terminal,
    apiRequests: requests,
    pageErrors,
    consoleErrors
  }, null, 2));
} catch (error) {
  failure = error;
  console.error("[FATAL]", error?.stack || error);
} finally {
  if (page) {
    await page.screenshot({
      path: "production-live-selection-b023.png",
      fullPage: true
    }).catch(() => {});
  }
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
}

if (failure) process.exitCode = 1;
