import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const EXPECTED_DATE = process.env.EXPECTED_DATE || "20260825";
const MAX_WAIT_MS = Number(process.env.MAX_WAIT_MS || 110000);

const requests = [];
const pageErrors = [];
const consoleErrors = [];
const snapshots = [];

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function terminal(snapshot) {
  return (
    snapshot.loading === "error" ||
    Boolean(snapshot.error) ||
    (
      snapshot.loading !== "true" &&
      snapshot.resultLength > 500 &&
      !snapshot.resultStart.includes("読み込み中")
    )
  );
}

async function stateOf(page) {
  return page.evaluate(() => {
    const resultArea = document.getElementById("resultArea");
    const text = id =>
      (document.getElementById(id)?.textContent || "")
        .replace(/\s+/g, " ")
        .trim();
    return {
      inputDate: document.getElementById("dateInput")?.value || "",
      mode: document.getElementById("raceModeSelect")?.value || "",
      place: document.getElementById("placeSelect")?.value || "",
      race: document.getElementById("raceSelect")?.value || "",
      loading: resultArea?.dataset?.raceLoading || "",
      resultLength: text("resultArea").length,
      resultStart: text("resultArea").slice(0, 900),
      error: text("errorArea").slice(0, 1500),
      oddsStatus: text("predictionOddsStatus"),
      status: text("statusArea"),
      intent: window.__CHAPPY_LIVE_RACE_SELECTION_INTENT__ || null,
      runtime: window.ChappyPredictionRuntime?.version || "",
      renderedEvent:
        window.__CHAPPY_LIVE_SELECTION_E2E_RENDERED__ === true,
      guardState:
        window.ChappyLiveRaceSelectionTerminalGuard?.getState?.() || null
    };
  });
}

let browser = null;
let context = null;
let page = null;
let failure = null;

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
    pageErrors.push(String(error?.message || error));
    console.error("[PAGEERROR]", error?.message || error);
  });
  page.on("console", message => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
      console.error("[CONSOLE ERROR]", message.text());
    }
  });

  const target = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
    `liveSelectionGuard=${Date.now()}`;
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

  const startup = await page.evaluate(() => {
    window.__CHAPPY_LIVE_SELECTION_E2E_RENDERED__ = false;
    window.addEventListener(
      "chappy:prediction-rendered",
      () => {
        window.__CHAPPY_LIVE_SELECTION_E2E_RENDERED__ = true;
      },
      { once: true }
    );

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
      version:
        window.ChappyLiveRaceSelectionTerminalGuard?.version || "",
      installed:
        window.ChappyLiveRaceSelectionTerminalGuard?.installed === true,
      dateInputProtected:
        window.ChappyLiveRaceSelectionTerminalGuard
          ?.dateInputProtected === true,
      inputDate: document.getElementById("dateInput")?.value || "",
      cacheDates
    };
  });

  console.log("[STARTUP]", JSON.stringify(startup));

  if (
    startup.version !== "20260825-live-selection-terminal2" ||
    !startup.installed ||
    !startup.dateInputProtected
  ) {
    throw new Error(`guard is not active: ${JSON.stringify(startup)}`);
  }
  if (startup.inputDate !== "2026-08-25") {
    throw new Error(`JST date was not primed: ${JSON.stringify(startup)}`);
  }
  if (startup.cacheDates.some(date => date === "20260824")) {
    throw new Error(`stale home cache survived: ${JSON.stringify(startup)}`);
  }

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

  const startedAt = Date.now();
  let final = await stateOf(page);
  let previousKey = "";

  while (Date.now() - startedAt < MAX_WAIT_MS) {
    final = await Promise.race([
      stateOf(page),
      delay(8_000).then(() => {
        throw new Error("page state response exceeded 8 seconds");
      })
    ]);

    const key = JSON.stringify({
      loading: final.loading,
      resultLength: final.resultLength,
      error: final.error,
      oddsStatus: final.oddsStatus,
      status: final.status,
      renderedEvent: final.renderedEvent,
      inputDate: final.inputDate
    });
    if (key !== previousKey) {
      previousKey = key;
      const row = {
        elapsedMs: Date.now() - startedAt,
        ...final
      };
      snapshots.push(row);
      console.log("[SNAPSHOT]", JSON.stringify(row));
    }

    if (terminal(final)) break;
    await delay(1000);
  }

  console.log("[FINAL]", JSON.stringify(final));

  const staleRequests = requests.filter(url =>
    /[?&]date=20260824(?:&|$)/.test(url)
  );
  const expectedRequests = requests.filter(url =>
    new RegExp(`[?&]date=${EXPECTED_DATE}(?:&|$)`).test(url)
  );

  if (staleRequests.length) {
    throw new Error(
      `previous-day API requests were issued: ${staleRequests.join(" | ")}`
    );
  }
  if (!expectedRequests.length) {
    throw new Error(
      `no API request used ${EXPECTED_DATE}: ${requests.join(" | ")}`
    );
  }
  if (final.inputDate !== "2026-08-25") {
    throw new Error(`date changed back: ${JSON.stringify(final)}`);
  }
  if (
    final.intent?.date !== EXPECTED_DATE ||
    final.intent?.place !== PLACE ||
    Number(final.intent?.raceNo) !== RACE_NO
  ) {
    throw new Error(`selection intent mismatch: ${JSON.stringify(final.intent)}`);
  }
  if (!terminal(final)) {
    throw new Error(
      `prediction did not reach a terminal state in ${MAX_WAIT_MS}ms: ` +
      JSON.stringify(final)
    );
  }
  if (final.loading === "true" || final.loading === "error") {
    throw new Error(`prediction loading failed: ${JSON.stringify(final)}`);
  }
  if (final.error) {
    throw new Error(`prediction error: ${final.error}`);
  }
  if (!final.renderedEvent || final.resultLength <= 500) {
    throw new Error(
      `prediction was not rendered: ${JSON.stringify(final)}`
    );
  }
  if (pageErrors.some(message => /readonly|read only/i.test(message))) {
    throw new Error(`readonly page error: ${pageErrors.join(" | ")}`);
  }

  console.log(JSON.stringify({
    ok: true,
    final,
    snapshots,
    apiRequests: requests,
    pageErrors,
    consoleErrors
  }));
} catch (error) {
  failure = error;
  console.error("[FATAL]", error?.stack || error);
} finally {
  if (page) {
    await Promise.race([
      page.screenshot({
        path: "live-race-selection-terminal-webkit.png",
        fullPage: true
      }).catch(() => {}),
      delay(5_000)
    ]);
  }
  if (context) {
    await Promise.race([
      context.close().catch(() => {}),
      delay(5_000)
    ]);
  }
  if (browser) {
    await Promise.race([
      browser.close().catch(() => {}),
      delay(5_000)
    ]);
  }
}

process.exit(failure ? 1 : 0);
