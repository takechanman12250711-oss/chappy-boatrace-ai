import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const PLACE = process.env.RACE_PLACE || "桐生";
const RACE_NO = Number(process.env.RACE_NO || 1);
const EXPECTED_DATE = process.env.EXPECTED_DATE || "20260825";

const requests = [];
const pageErrors = [];
const consoleErrors = [];

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
    schedule: [
      {
        jcd: "01",
        place: "桐生",
        currentRaceNo: 1,
        deadlineAt: "2026-08-24T14:57:00+09:00",
        selectable: true
      }
    ]
  });
  sessionStorage.setItem("chappy-home-v2-cache", stale);
  localStorage.setItem("chappy-home-v2-cache", stale);
});

const page = await context.newPage();
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

let failure = null;

try {
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

  if (startup.version !== "20260825-live-selection-terminal2") {
    throw new Error(`guard version mismatch: ${JSON.stringify(startup)}`);
  }
  if (!startup.installed || !startup.dateInputProtected) {
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

  await page.waitForFunction(
    () => {
      const resultArea = document.getElementById("resultArea");
      const resultText =
        (resultArea?.textContent || "").replace(/\s+/g, " ").trim();
      const errorText =
        (document.getElementById("errorArea")?.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
      return (
        resultArea?.dataset?.raceLoading === "error" ||
        Boolean(errorText) ||
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
      resultStart: text("resultArea").slice(0, 600),
      error: text("errorArea").slice(0, 1000),
      oddsStatus: text("predictionOddsStatus"),
      status: text("statusArea"),
      intent: window.__CHAPPY_LIVE_RACE_SELECTION_INTENT__ || null,
      runtime: window.ChappyPredictionRuntime?.version || ""
    };
  });

  console.log("[FINAL]", JSON.stringify(final, null, 2));

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
  if (final.loading === "true") {
    throw new Error("prediction remained in loading state");
  }
  if (final.error) {
    throw new Error(`prediction error: ${final.error}`);
  }
  if (final.resultLength <= 500) {
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
    apiRequests: requests,
    pageErrors,
    consoleErrors
  }, null, 2));
} catch (error) {
  failure = error;
  console.error("[FATAL]", error?.stack || error);
} finally {
  await page.screenshot({
    path: "live-race-selection-terminal-webkit.png",
    fullPage: true
  }).catch(() => {});
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
}

if (failure) process.exitCode = 1;
