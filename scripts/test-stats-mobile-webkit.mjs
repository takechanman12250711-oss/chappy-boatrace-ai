import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { webkit } from "playwright";

// Serve the checkout itself: no fabricated page, stats responses, or app functions.
// The unrelated live schedule API alone is replaced by an empty successful read.
// This checks mobile WebKit UI, not live schedule availability or physical iOS.
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const APP_URL = process.env.APP_URL || "http://127.0.0.1:4173/";
const ARTIFACT_DIR = path.resolve(process.env.STATS_UI_ARTIFACT_DIR || "artifacts/stats-mobile");
const require = createRequire(import.meta.url);
const autoStats = require("../js/auto-stats.js");
const verification = require("../js/prediction-verification.js");
const marks = [];
const diagnostics = [];
let browser;
let failed = false;

const readJson = async relative => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
const cleanText = text => String(text || "").replace(/\s+/g, " ").trim();
const timeLabel = value => new Date(Date.parse(value) + 9 * 60 * 60 * 1000)
  .toISOString().slice(0, 16).replace("T", " ") + " JST";
const percent = value => Number.isFinite(value) ? `${value.toFixed(1)}%` : "—";
function mark(name, detail = {}) {
  const entry = { name, at: new Date().toISOString(), ...detail };
  marks.push(entry);
  console.log(`[stats-mobile] ${name}`, JSON.stringify(detail));
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function expectedEvidence() {
  const manifest = await readJson("data/predictions/index-manifest.json");
  const index = { ...manifest };
  for (const [collection, info] of Object.entries(manifest.collections)) {
    index[collection] = (await Promise.all(info.shards.map(shard =>
      readJson(`data/predictions/${shard.path}`)))).flatMap(shard => shard.records);
  }
  const normalized = autoStats.normalizeIndex(index);
  // Deliberately do not call buildDetailedMethodProgress (the changed selector).
  // Derive the expected cohort directly from normalized saved record identities.
  const selected = normalized.predictions.filter(row =>
    row.predictionSource === "automatic" && normalized.activeGenerationKey &&
    row.selectionGenerationKey === normalized.activeGenerationKey);
  const detailed = selected.filter(prediction => {
    const result = normalized.results.find(row => row.raceKey === prediction.raceKey);
    const checked = verification.verifyPrediction(prediction, {
      resultAvailable: Boolean(result), result: result?.result,
      officialPayoutPer100: result?.officialPayoutPer100,
      officialPopularity: result?.officialPopularity,
      winningMethod: result?.winningMethod,
      finishers: result?.finishers || [], starts: result?.starts || []
    });
    return checked.settled && checked.internalEvaluation && checked.scenarioVerification?.structured;
  });
  return {
    manifestTime: timeLabel(manifest.generatedAt),
    selectedCount: selected.length, detailedCount: detailed.length,
    activeGenerationKey: normalized.activeGenerationKey,
    review: await readJson("data/stats/race-review-progress.json"),
    candidate: await readJson("data/stats/candidate24-report.json")
  };
}

async function settleFrames(page) {
  await page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function assertView(page, view) {
  const state = await page.evaluate(() => ({
    visible: ["race", "prediction", "result"].filter(key =>
      document.getElementById(`${key}Section`)?.hidden === false),
    active: document.querySelector('.bottom-nav-item[aria-current="page"]')?.dataset.view
  }));
  assert.deepEqual(state, { visible: [view], active: view });
}
async function waitForTerminal(page) {
  await page.waitForFunction(() => {
    const section = document.getElementById("resultSection");
    const status = document.getElementById("resultSyncStatus");
    return section?.hidden === false && status?.dataset.state === "ready" && status.hidden &&
      document.querySelector('[data-stats-load-state="ready"]') &&
      !document.querySelector('[data-stats-load-state="loading"]') &&
      !/読み込|読込|照合中/.test(status.textContent);
  }, null, { timeout: 45_000 });
  await settleFrames(page);
  await assertView(page, "result");
}
async function assertNoOverflow(page, scene) {
  const layout = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    pageWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    panels: [...document.querySelectorAll('#resultSection, #statsArea, #candidate24Performance')]
      .filter(element => element.getClientRects().length)
      .map(element => ({ id: element.id, left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right }))
  }));
  assert.equal(layout.viewport, 390, `${scene}: expected mobile viewport`);
  assert.ok(layout.pageWidth <= layout.viewport + 1, `${scene}: horizontal overflow ${JSON.stringify(layout)}`);
  for (const panel of layout.panels) {
    assert.ok(panel.left >= -1 && panel.right <= layout.viewport + 1,
      `${scene}: panel overflow ${JSON.stringify(panel)}`);
  }
  mark("no-horizontal-overflow", { scene, ...layout });
}
async function screenshot(page, name) {
  await settleFrames(page);
  await page.screenshot({ path: path.join(ARTIFACT_DIR, `${name}.png`) });
}
async function openDetails(page, selector) {
  const details = page.locator(selector);
  if (!(await details.evaluate(element => element.open))) {
    await details.locator(":scope > summary").tap();
  }
  assert.equal(await details.evaluate(element => element.open), true);
  await settleFrames(page);
  return details;
}
async function assertSavedEvidence(page, expected) {
  await page.waitForFunction(() =>
    document.getElementById("candidate24Performance")?.textContent.includes("結果待ち"));
  const candidateText = cleanText(await page.locator("#candidate24Performance").innerText());
  const candidate = expected.candidate;
  for (const text of [timeLabel(candidate.generatedAt), `結果待ち ${candidate.pending}R`,
    `返還・不成立除外 ${candidate.excludedRefundOrVoid}R`, `払戻未確認 ${candidate.unknownPayout}R`,
    `最大24点候補：的中率 ${percent(candidate.candidate24.hitRate)}`,
    `同じレースの実戦厳選：的中率 ${percent(candidate.practical.hitRate)}`]) {
    assert.ok(candidateText.includes(text), `saved candidate evidence missing: ${text}`);
  }
  const overview = cleanText(await page.locator('[data-stats-load-state="ready"]').innerText());
  assert.ok(overview.includes(expected.manifestTime), "manifest timestamp must match served saved data");
  const current = await openDetails(page, '[data-result-panel="new-method-performance"]');
  const currentText = cleanText(await current.innerText());
  assert.ok(currentText.includes(`現行方式の採用記録 ${expected.selectedCount}R ／ 詳細照合 ${expected.detailedCount}R`),
    `current method differs from saved records: ${currentText}`);
  assert.ok(currentText.includes(expected.manifestTime));
  await assertNoOverflow(page, "current-method-open");
  await current.locator(":scope > summary").scrollIntoViewIfNeeded();
  await screenshot(page, "02-current-method");

  const review = await openDetails(page, '[data-result-panel="accuracy-review"]');
  const currentCohort = expected.review.cohorts.find(group => group.active === true);
  const oldCohorts = expected.review.cohorts.filter(group => group.active !== true);
  let reviewText = cleanText(await review.innerText());
  assert.ok(reviewText.includes(timeLabel(expected.review.generatedAt)));
  if (currentCohort) {
    assert.ok(reviewText.includes(`${currentCohort.currentWindowCount}/100R`));
    assert.ok(reviewText.includes(`保存${currentCohort.captured}R ／ 照合済み${currentCohort.settled}R ／ 結果待ち${currentCohort.pending}R`));
    assert.ok(reviewText.includes(`${currentCohort.method.split(":")[1].slice(0, 8)}（現行）`));
  }
  if (oldCohorts.length) {
    const old = review.locator("details").filter({ has: page.locator("summary", { hasText: "過去の方式・記録" }) });
    assert.equal(await old.count(), 1);
    assert.equal(await old.evaluate(element => element.open), false, "old methods start folded");
    await old.locator(":scope > summary").tap();
    assert.equal(await old.evaluate(element => element.open), true);
    reviewText = cleanText(await old.innerText());
    for (const cohort of oldCohorts) {
      assert.ok(reviewText.includes(`保存${cohort.captured}R ／ 照合済み${cohort.settled}R ／ 結果待ち${cohort.pending}R`));
    }
    assert.ok(reviewText.includes("現行方式へは合算しません"));
    await assertNoOverflow(page, "old-methods-open");
    await old.locator(":scope > summary").scrollIntoViewIfNeeded();
    await screenshot(page, "03-old-methods");
  }
  mark("saved-evidence-verified", { currentSelected: expected.selectedCount,
    currentDetailed: expected.detailedCount, manifestTime: expected.manifestTime,
    candidateTime: timeLabel(candidate.generatedAt), oldMethods: oldCohorts.length });
}

async function runScenario(name, run) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) " +
      "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const info = { name, pageErrors: [], consoleErrors: [], failedRequests: [], scheduleReadsStubbed: 0 };
  diagnostics.push(info);
  page.on("pageerror", error => info.pageErrors.push(String(error.stack || error)));
  page.on("console", message => { if (message.type() === "error") info.consoleErrors.push(message.text()); });
  page.on("requestfailed", request => info.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.route("https://chappy-boatrace-api.vercel.app/api/schedule?*", async route => {
    info.scheduleReadsStubbed += 1;
    const date = new URL(route.request().url()).searchParams.get("date");
    await route.fulfill({ json: { date, venues: [] }, headers: { "access-control-allow-origin": "*" } });
  });
  try {
    await run(page);
    assert.deepEqual(info.pageErrors, [], `${name}: uncaught page errors`);
    mark("scenario-passed", { name });
  } catch (error) {
    info.failure = String(error.stack || error);
    await screenshot(page, `${name}-failure`).catch(() => {});
    info.finalState = await page.evaluate(() => ({
      status: document.getElementById("resultSyncStatus")?.outerHTML,
      statsText: document.getElementById("statsArea")?.innerText.slice(0, 5000),
      visibleSections: [...document.querySelectorAll("main > section:not([hidden])")].map(element => element.id)
    })).catch(() => null);
    throw error;
  } finally {
    await context.close();
  }
}
async function openApp(page) {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(window.ChappyAppRuntime && window.ChappyHomeDashboardV2));
  await assertView(page, "race");
}

await mkdir(ARTIFACT_DIR, { recursive: true });
try {
  const expected = await expectedEvidence();
  mark("saved-fixture", { selectedCount: expected.selectedCount, detailedCount: expected.detailedCount,
    activeGenerationKey: expected.activeGenerationKey });
  browser = await webkit.launch({ headless: true });
  await runScenario("first-open-and-repeat", async page => {
    await openApp(page);
    await page.locator('.bottom-nav-item[data-view="result"]').tap();
    await waitForTerminal(page);
    await assertNoOverflow(page, "first-open");
    await screenshot(page, "01-first-open");
    await assertSavedEvidence(page, expected);
    for (let tap = 0; tap < 3; tap += 1) {
      await page.locator('.bottom-nav-item[data-view="result"]').tap();
      await waitForTerminal(page);
    }
    mark("repeated-taps-terminal");
    await page.locator('.bottom-nav-item[data-view="prediction"]').tap();
    await assertView(page, "prediction");
    await page.locator('.bottom-nav-item[data-view="result"]').tap();
    await waitForTerminal(page);
    await assertNoOverflow(page, "revisit");
    await screenshot(page, "04-revisit");
  });
  await runScenario("cold-navigation", async page => {
    const seen = deferred();
    const release = deferred();
    // Delay actual script delivery, then continue the original local response.
    // Both parser loads and preloads are held; app code/data remain unchanged.
    await page.route("**/js/stats-runtime-loader.js?*", async route => {
      seen.resolve();
      await release.promise;
      await route.continue();
    });
    try {
      await openApp(page);
      await page.locator('.bottom-nav-item[data-view="result"]').tap();
      let deadline;
      try {
        await Promise.race([seen.promise, new Promise((_, reject) => {
          deadline = setTimeout(() => reject(new Error("cold stats script request not observed")), 10_000);
        })]);
      } finally { clearTimeout(deadline); }
      await page.locator('.bottom-nav-item[data-view="result"]').tap();
      await page.locator('.bottom-nav-item[data-view="prediction"]').tap();
      await assertView(page, "prediction");
      release.resolve();
      await page.evaluate(() => window.ChappyAppRuntime.ensure("stats"));
      await settleFrames(page);
      await assertView(page, "prediction");
      await screenshot(page, "05-cold-navigation-preserved");
      mark("newer-navigation-preserved-after-script-load");
      await page.locator('.bottom-nav-item[data-view="result"]').tap();
      await waitForTerminal(page);
      await assertNoOverflow(page, "cold-revisit");
      await screenshot(page, "06-cold-revisit");
    } finally { release.resolve(); }
  });
} catch (error) {
  failed = true;
  console.error("[stats-mobile:FATAL]", error.stack || error);
  mark("failed", { error: String(error.stack || error) });
} finally {
  await browser?.close();
  await writeFile(path.join(ARTIFACT_DIR, "report.json"), JSON.stringify({
    ok: !failed, appUrl: APP_URL, viewport: { width: 390, height: 844 }, browser: "WebKit",
    limitations: ["Live schedule API is stubbed with an empty successful read; stats JSON and app assets are served unchanged from checkout.",
      "This is mobile WebKit emulation, not a physical iPhone or deployed-site availability check."],
    marks, diagnostics
  }, null, 2) + "\n");
}
if (failed) process.exitCode = 1;
