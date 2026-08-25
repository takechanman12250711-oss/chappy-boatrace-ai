import fs from "node:fs";
import process from "node:process";
import { webkit } from "playwright";

const APP_URL = process.env.APP_URL ||
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";
const EXPECTED_BUILD = process.env.EXPECTED_BUILD ||
  "20260825-progressive-screen1";
const REVIEW_DATE = process.env.REVIEW_DATE || "2026-08-25";
const REVIEW_PLACE = process.env.REVIEW_PLACE || "桐生";
const REVIEW_JCD = process.env.REVIEW_JCD || "01";
const REVIEW_RACE = Number(process.env.REVIEW_RACE || 1);
const OUTPUT = process.env.OUTPUT ||
  "production-progressive-screen.json";
const SCREENSHOT = process.env.SCREENSHOT ||
  "production-progressive-screen.png";

const result = {
  appUrl: APP_URL,
  expectedBuild: EXPECTED_BUILD,
  review: {
    date: REVIEW_DATE,
    place: REVIEW_PLACE,
    jcd: REVIEW_JCD,
    raceNo: REVIEW_RACE
  },
  build: "",
  preview: null,
  full: null,
  events: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  apiRequests: [],
  ok: false
};

function record(name, detail = {}) {
  const row = {
    name,
    at: new Date().toISOString(),
    ...detail
  };
  result.events.push(row);
  console.log(`[${name}]`, JSON.stringify(detail));
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
  result.pageErrors.push({
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  });
});
page.on("console", message => {
  if (message.type() === "error") {
    result.consoleErrors.push(message.text());
  }
});
page.on("request", request => {
  const url = request.url();
  if (url.includes("chappy-boatrace-api.vercel.app/api/")) {
    result.apiRequests.push(url);
  }
});
page.on("requestfailed", request => {
  result.failedRequests.push({
    url: request.url(),
    errorText: request.failure()?.errorText || ""
  });
});

let failure = null;

try {
  const url = `${APP_URL}${APP_URL.includes("?") ? "&" : "?"}` +
    `verifyProgressive=${Date.now()}`;
  record("open", { url });
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60_000
  });

  await page.waitForFunction(
    expected => window.__CHAPPY_APP_BUILD__ === expected,
    EXPECTED_BUILD,
    { timeout: 30_000 }
  );
  result.build = await page.evaluate(
    () => String(window.__CHAPPY_APP_BUILD__ || "")
  );
  record("build-ready", { build: result.build });

  await page.waitForFunction(
    () => Boolean(
      window.ChappyAppRuntime &&
      window.ChappyPredictionRuntime &&
      window.ChappyHomeDashboardV2
    ),
    null,
    { timeout: 30_000 }
  );

  await page.evaluate(() => {
    window.__PROGRESSIVE_VERIFY_EVENTS__ = [];
    window.addEventListener(
      "chappy:prediction-preview-rendered",
      event => {
        window.__PROGRESSIVE_VERIFY_EVENTS__.push({
          name: "preview",
          at: performance.now(),
          detail: event.detail || {}
        });
      }
    );
    window.addEventListener(
      "chappy:prediction-rendered",
      event => {
        window.__PROGRESSIVE_VERIFY_EVENTS__.push({
          name: "full",
          at: performance.now(),
          detail: event.detail || {}
        });
      }
    );
  });

  await page.evaluate(async () => {
    await window.ChappyAppRuntime.ensure("race");
    window.ChappyHomeDashboardV2.setView("race");
  });
  record("race-runtime-ready");

  await page.waitForFunction(
    () => typeof window.ChappyRaceSelection?.select === "function",
    null,
    { timeout: 30_000 }
  );

  await page.evaluate(async input => {
    await window.ChappyRaceSelection.select(input);
    window.ChappyHomeDashboardV2.setView("prediction");
    document.getElementById("fetchRaceBtn")?.click();
  }, {
    mode: "review",
    date: REVIEW_DATE.replaceAll("-", ""),
    place: REVIEW_PLACE,
    jcd: REVIEW_JCD,
    raceNo: REVIEW_RACE
  });
  record("prediction-requested");

  await page.waitForFunction(
    () => window.__PROGRESSIVE_VERIFY_EVENTS__
      ?.some(row => row.name === "preview"),
    null,
    { timeout: 90_000 }
  );

  result.preview = await page.evaluate(() => {
    const resultArea = document.getElementById("resultArea");
    const previewEvent = window.__PROGRESSIVE_VERIFY_EVENTS__
      ?.find(row => row.name === "preview");
    return {
      event: previewEvent || null,
      loading: resultArea?.dataset?.raceLoading || "",
      previewFlag: resultArea?.dataset?.progressivePreview || "",
      entryCards:
        resultArea?.querySelectorAll(".prediction-entry-preview")
          ?.length || 0,
      text: (resultArea?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1200)
    };
  });
  record("preview-rendered", result.preview);

  if (result.preview.entryCards !== 6) {
    throw new Error(
      `progressive preview entry count must be 6; actual=${result.preview.entryCards}`
    );
  }
  if (result.preview.loading !== "ai") {
    throw new Error(
      `preview loading state must be ai; actual=${result.preview.loading}`
    );
  }
  if (!result.preview.text.includes(EXPECTED_BUILD)) {
    throw new Error("progressive preview does not expose current build");
  }

  await page.waitForFunction(
    () => window.__PROGRESSIVE_VERIFY_EVENTS__
      ?.some(row => row.name === "full"),
    null,
    { timeout: 180_000 }
  );

  result.full = await page.evaluate(() => {
    const resultArea = document.getElementById("resultArea");
    const rows = window.__PROGRESSIVE_VERIFY_EVENTS__ || [];
    const preview = rows.find(row => row.name === "preview");
    const full = rows.find(row => row.name === "full");
    return {
      previewAt: preview?.at || 0,
      fullAt: full?.at || 0,
      orderValid: Boolean(
        preview && full && preview.at < full.at
      ),
      loading: resultArea?.dataset?.raceLoading || "",
      previewFlag: resultArea?.dataset?.progressivePreview || "",
      resultLength: resultArea?.textContent?.length || 0,
      text: (resultArea?.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 1500),
      error:
        document.getElementById("errorArea")?.textContent?.trim() || "",
      status:
        document.getElementById("statusArea")?.textContent?.trim() || "",
      oddsStatus:
        document.getElementById("predictionOddsStatus")
          ?.textContent?.trim() || ""
    };
  });
  record("full-rendered", result.full);

  if (!result.full.orderValid) {
    throw new Error("full prediction rendered before progressive preview");
  }
  if (result.full.loading === "true" || result.full.loading === "ai") {
    throw new Error(
      `loading state remains after full render: ${result.full.loading}`
    );
  }
  if (result.full.resultLength < 1000) {
    throw new Error(
      `full prediction output is too short: ${result.full.resultLength}`
    );
  }
  if (result.full.error) {
    throw new Error(`prediction error area is not empty: ${result.full.error}`);
  }
  if (result.pageErrors.length) {
    throw new Error(
      `page errors: ${result.pageErrors.map(row => row.message).join(" | ")}`
    );
  }

  result.ok = true;
} catch (error) {
  failure = error;
  result.error = {
    message: String(error?.message || error),
    stack: String(error?.stack || "")
  };
  console.error("[VERIFY_ERROR]", result.error.message);
} finally {
  await page.screenshot({
    path: SCREENSHOT,
    fullPage: true
  }).catch(() => {});
  fs.writeFileSync(
    OUTPUT,
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  await browser.close();
}

console.log(JSON.stringify(result, null, 2));
if (failure) process.exitCode = 1;
