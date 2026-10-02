import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-24";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "蒲郡";
const REVIEW_RACE_NO = Number(process.env.REVIEW_RACE_NO || 12);
const ODDS_DELAY_MS = Number(process.env.ODDS_DELAY_MS || 45000);

const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 " +
    "Mobile/15E148 Safari/604.1"
});
const page = await context.newPage();

const events = [];
const mark = (name, detail = {}) => {
  const row = { name, at: new Date().toISOString(), ...detail };
  events.push(row);
  console.log(`[MARK] ${name}`, JSON.stringify(detail));
};

page.on("pageerror", error => mark("pageerror", { message: error.message }));
page.on("console", message => {
  const text = message.text();
  if (/DIAG_STAGE|fetchAndRenderRace|prediction\.js error|render/i.test(text)) {
    mark("console", { type: message.type(), text });
  }
});
page.on("requestfailed", request =>
  mark("requestfailed", {
    url: request.url(),
    error: request.failure()?.errorText || ""
  })
);

await page.route("**/api/odds**", async route => {
  mark("odds-request-delayed", { url: route.request().url(), delayMs: ODDS_DELAY_MS });
  await new Promise(resolve => setTimeout(resolve, ODDS_DELAY_MS));
  await route.fulfill({
    status: 503,
    contentType: "application/json",
    body: JSON.stringify({ ok: false, error: "diagnostic delayed odds" })
  });
  mark("odds-request-released");
});

const targetUrl = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}noEarlyOdds=${Date.now()}`;
mark("open", { targetUrl });
await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(
  () => Boolean(window.ChappyPredictionRuntime && window.ChappyAppRuntime && window.ChappyHomeDashboardV2),
  null,
  { timeout: 30000 }
);

await page.evaluate(() => {
  window.addEventListener("chappy:prediction-rendered", event => {
    console.log("DIAG_STAGE prediction-rendered", JSON.stringify(event.detail || {}));
  });
  window.addEventListener("chappy:view-changed", event => {
    console.log("DIAG_STAGE view-changed", JSON.stringify(event.detail || {}));
  });
});

await page.evaluate(async () => {
  await window.ChappyPredictionRuntime.ensureReady();
  await window.ChappyAppRuntime.ensure("race");
  window.ChappyHomeDashboardV2.setView("race");
});
mark("race-view-ready");

await page.selectOption("#raceModeSelect", "review");
await page.fill("#dateInput", REVIEW_DATE);
await page.dispatchEvent("#dateInput", "change");

const venueSelector = `#officialVenueGrid button[data-place="${REVIEW_PLACE}"]:not([disabled])`;
await page.waitForSelector(venueSelector, { state: "visible", timeout: 60000 });
await page.click(venueSelector);
mark("venue-selected", { place: REVIEW_PLACE });

const raceSelector = `#officialRaceGrid button[data-race-no="${REVIEW_RACE_NO}"]:not([disabled])`;
await page.waitForSelector(raceSelector, { state: "visible", timeout: 60000 });
await page.click(raceSelector);
mark("race-selected", { raceNo: REVIEW_RACE_NO });

const renderedPromise = page.waitForEvent("console", {
  predicate: message => message.text().startsWith("DIAG_STAGE prediction-rendered"),
  timeout: 90000
});

await page.evaluate(() => {
  document.getElementById("fetchRaceBtn")?.click();
});
mark("prediction-clicked");

await renderedPromise;
mark("prediction-render-event-received");

const final = await page.evaluate(() => ({
  resultLoading: document.getElementById("resultArea")?.dataset?.raceLoading || "",
  resultLength: document.getElementById("resultArea")?.textContent?.length || 0,
  resultStart: (document.getElementById("resultArea")?.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500),
  status: document.getElementById("statusArea")?.textContent?.trim() || "",
  error: document.getElementById("errorArea")?.textContent?.trim() || "",
  currentView: document.getElementById("predictionSection")?.hidden === false
    ? "prediction"
    : "other"
}));
mark("final", final);

await browser.close();
console.log(JSON.stringify({ ok: true, events, final }, null, 2));
