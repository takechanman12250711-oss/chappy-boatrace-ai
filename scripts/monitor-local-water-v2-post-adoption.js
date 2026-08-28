"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const raceApi = require("../api/race");
const boatIdentity = require("../js/boat-identity");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");
require("../js/history-insights");
require("../js/motor-maintenance-insights");

// Capture the unwrapped core before loading the production Local/Water V2
// bootstrap. The monitor needs this reference for its counterfactual side.
const baseAiCore = global.ChappyAICore;

const theoryInput = require("../js/theory-input");
const branchReport = require("./build-local-water-branch-report");
const localWaterV2Tiebreak = require("../js/local-water-v2-tiebreak");
const { attachVenueRaceHistory } = require("./venue-race-history");

const DIR = path.join(process.cwd(), "data", "predictions");
const OUT = path.join(
  process.cwd(),
  "data",
  "stats",
  "local-water-v2-post-adoption-monitor.json",
);
const INPUT_CACHE = path.join(
  process.cwd(),
  "data",
  "stats",
  "local-water-v2-post-adoption-input-cache.json",
);
const START_DATE = "20260824";
const INPUT_CACHE_FINGERPRINT = (() => {
  const hash = crypto.createHash("sha256");
  for (const relativePath of [
    "api/race.js",
    "api/_parser.js",
    "api/_original-exhibition.js",
  ]) {
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(process.cwd(), relativePath)));
    hash.update("\0");
  }
  return hash.digest("hex");
})();
const TEMP_OUTPUTS = [`${OUT}.next`, `${INPUT_CACHE}.next`];
let activeInputCacheProgress = null;

const rows = data => [
  ...(data.predictions || []),
  ...(data.verificationPredictions || []),
];
const ticket = value => {
  const matches = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return matches.length >= 3 ? matches.slice(0, 3).join("-") : "";
};

function callRace(query) {
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = {
      setHeader() {},
      status(code) {
        status = code;
        return this;
      },
      json(data) {
        if (status >= 400 || !data?.ok) {
          reject(new Error(data?.error || `API ${status}`));
        } else {
          resolve(data);
        }
      },
    };
    Promise.resolve(raceApi({ query }, res)).catch(reject);
  });
}

function candidates() {
  const output = [];
  const seen = new Set();
  const files = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter(name => /^\d{8}\.json$/.test(name)).sort()
    : [];

  for (const file of files) {
    const date = file.slice(0, 8);
    if (date < START_DATE) continue;
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    for (const row of rows(data)) {
      if (row?.result?.settled !== true || branchReport.ev(row).formal !== true) {
        continue;
      }
      const key = row.raceKey || `${date}-${row.jcd}-${row.raceNo}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const candidate = {
        key,
        date,
        jcd: String(row.jcd || "").padStart(2, "0"),
        raceNo: Number(row.raceNo || 0),
        actual: ticket(
          row?.result?.resultTicket || row?.result?.review?.resultTicket,
        ),
        pay: Number(
          row?.result?.payoutPer100 || row?.result?.review?.payoutPer100 || 0,
        ),
      };
      assertCandidate(candidate);
      output.push(candidate);
    }
  }
  return output;
}

function assertCandidate(candidate) {
  const ticketBoats = String(candidate?.actual || "").split("-");
  if (
    ticketBoats.length !== 3 ||
    ticketBoats.some(value => !/^[1-6]$/.test(value)) ||
    new Set(ticketBoats).size !== 3
  ) {
    throw new Error(`${candidate?.key || "unknown"}: settled ticket is invalid`);
  }
  if (!Number.isFinite(candidate?.pay) || candidate.pay <= 0) {
    throw new Error(`${candidate?.key || "unknown"}: settled payout is invalid`);
  }
}

function normalizeInputCache(cache) {
  if (
    cache?.schemaVersion !== 1 ||
    cache?.version !== "local-water-v2-post-adoption-input-cache-v1" ||
    cache?.startDate !== START_DATE ||
    cache?.inputFingerprint !== INPUT_CACHE_FINGERPRINT ||
    !Array.isArray(cache?.races)
  ) {
    return new Map();
  }
  return new Map(
    cache.races
      .filter(row => typeof row?.raceKey === "string" && row?.api)
      .map(row => [row.raceKey, row.api]),
  );
}

function loadInputCache() {
  if (!fs.existsSync(INPUT_CACHE)) return new Map();
  try {
    return normalizeInputCache(
      JSON.parse(fs.readFileSync(INPUT_CACHE, "utf8")),
    );
  } catch (error) {
    console.warn(`Local/Water V2 input cache ignored: ${error?.message || error}`);
    return new Map();
  }
}

function cacheableApi(api) {
  const { historyContext: _historyContext, ...cacheable } = api || {};
  return cacheable;
}

function analysesOf(ai, prepared, core) {
  for (const value of [
    ai?.analyses,
    ai?.evaluations,
    ai?.boatEvaluations,
    ai?.boatEvaluation?.evaluations,
    ai?.mainSheet?.evaluations,
  ]) {
    if (Array.isArray(value) && value.length === 6) return value;
  }
  const trend = core.buildRaceTrendEvaluation(prepared);
  for (const value of [
    trend?.analyses,
    trend?.evaluations,
    trend?.boats,
    trend?.boatEvaluations,
  ]) {
    if (Array.isArray(value) && value.length === 6) return value;
  }
  throw new Error("analyses unavailable");
}

function basic5(formations) {
  return [
    ...(formations?.main || []).slice(0, 3),
    ...(formations?.safety || []).slice(0, 2),
  ].map(ticket).filter(Boolean);
}

function assertCompleteRaceApi(api, race) {
  if (
    String(api?.date || "") !== race.date ||
    String(api?.stadiumCode || "").padStart(2, "0") !== race.jcd ||
    Number(api?.raceNo || 0) !== race.raceNo
  ) {
    throw new Error(`${race.key}: official race identity does not match`);
  }
  const identity = boatIdentity.inspectEntries(api?.entries, {
    allowBoatNoFallback: false,
  });
  if (!identity.valid) {
    throw new Error(
      `${race.key}: official entries are invalid: ` +
        (boatIdentity.reasonText(identity) || "boat identity unavailable"),
    );
  }
  if (api?.beforeInfoAvailable !== true) {
    throw new Error(`${race.key}: official beforeinfo is unavailable`);
  }
}

function prepareCompleteRaceApi(api, race, core = baseAiCore) {
  assertCompleteRaceApi(api, race);
  const history = attachVenueRaceHistory(api, race.jcd, race.raceNo);
  const prepared = theoryInput.prepare(history.raceData, core);
  const trend = core.buildRaceTrendEvaluation(prepared);
  if (trend?.ready !== true) {
    const status = trend?.dataStatus || {};
    throw new Error(
      `${race.key}: official production input is not ready ` +
        `(entries=${Number(status.entryCount || 0)}/6, ` +
        `st=${Number(status.stCount || 0)}/6, ` +
        `exhibition=${Number(status.exhibitionCount || 0)}/6)`,
    );
  }
  return prepared;
}

function sanitizeInputCache(inputCache, source) {
  const cacheRows = new Map();
  const completedKeys = new Set();
  for (const race of source) {
    const api = inputCache.get(race.key);
    if (!api) continue;
    try {
      prepareCompleteRaceApi(api, race);
      cacheRows.set(race.key, api);
      completedKeys.add(race.key);
    } catch {
      // Identity-mismatched or production-incomplete rows are refetched.
    }
  }
  return { cacheRows, completedKeys };
}

function comparePrepared(
  race,
  prepared,
  core = baseAiCore,
  tiebreak = localWaterV2Tiebreak,
) {
  if (prepared?.localWaterTheoryV2?.isFormal !== true) return null;

  const counterfactualAi = core.buildPredictionData(prepared);
  const productionAi = tiebreak.apply(counterfactualAi, prepared, core);
  const evidence = productionAi?.localWaterV2Tiebreak;
  if (evidence?.applied !== true) return null;

  const analyses = analysesOf(counterfactualAi, prepared, core);
  const counterfactualScenarios =
    counterfactualAi.raceScenarios || core.buildRaceScenarios(analyses, prepared);
  const counterfactualTickets = basic5(
    counterfactualAi.formations ||
      core.buildFormations(analyses, counterfactualScenarios),
  );
  const productionTickets = basic5(productionAi.formations);

  return {
    ...race,
    gap: Number(evidence.gap),
    curHead: Number(evidence.previousHead),
    v2Head: Number(evidence.selectedHead),
    oldTickets: counterfactualTickets,
    prodTickets: productionTickets,
    changed:
      JSON.stringify(counterfactualTickets) !== JSON.stringify(productionTickets),
    productionHit: productionTickets.includes(race.actual),
    counterfactualHit: counterfactualTickets.includes(race.actual),
  };
}

async function completeApi(race, inputCache, fetchRace = callRace) {
  const cached = inputCache.get(race.key);
  if (cached) {
    try {
      const prepared = prepareCompleteRaceApi(cached, race);
      return { api: cached, prepared, cached: true };
    } catch {
      // A malformed cached row is replaced only after a complete live fetch.
    }
  }
  const api = await fetchRace({
    date: race.date,
    jcd: race.jcd,
    rno: String(race.raceNo),
  });
  const cacheable = cacheableApi(api);
  const prepared = prepareCompleteRaceApi(cacheable, race);
  return { api: cacheable, prepared, cached: false };
}

function blank() {
  return {
    sourceRaces: 0,
    comparableRaces: 0,
    appliedRaces: 0,
    productionHits: 0,
    counterfactualHits: 0,
    gains: 0,
    losses: 0,
    productionReturn: 0,
    counterfactualReturn: 0,
  };
}

function add(summary, result) {
  summary.sourceRaces++;
  if (!result) return;
  summary.comparableRaces++;
  if (!result.changed) return;
  summary.appliedRaces++;
  if (result.productionHit) {
    summary.productionHits++;
    summary.productionReturn += result.pay;
  }
  if (result.counterfactualHit) {
    summary.counterfactualHits++;
    summary.counterfactualReturn += result.pay;
  }
  if (result.productionHit && !result.counterfactualHit) summary.gains++;
  if (!result.productionHit && result.counterfactualHit) summary.losses++;
}

function finish(summary) {
  return {
    ...summary,
    hitDelta: summary.productionHits - summary.counterfactualHits,
    returnDelta: summary.productionReturn - summary.counterfactualReturn,
  };
}

function assertCompleteRun(failures, completedRaces, expectedRaces) {
  if (expectedRaces > 0 && !failures.length && completedRaces === expectedRaces) {
    return;
  }
  throw new Error(
    `Local/Water V2 monitor refused partial output: ` +
      `${completedRaces}/${expectedRaces} completed; ` +
      `${failures.slice(0, 3).join(" | ")}`,
  );
}

function sortSamples(samples) {
  return samples.sort((left, right) =>
    left.raceKey.localeCompare(right.raceKey, "en"),
  );
}

function cleanupTemporaryOutputs() {
  for (const file of TEMP_OUTPUTS) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // A later run removes the same fixed temporary path before writing.
    }
  }
}

function writeJsonAtomic(file, value) {
  const temporary = `${file}.next`;
  fs.rmSync(temporary, { force: true });
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function buildInputCacheReport(progress, generatedAt = new Date().toISOString()) {
  const latestDate = progress.source.reduce(
    (latest, race) => (race.date > latest ? race.date : latest),
    null,
  );
  const races = [...progress.cacheRows.entries()]
    .filter(([raceKey]) => progress.completedKeys.has(raceKey))
    .map(([raceKey, api]) => ({
      raceKey,
      date: String(api?.date || ""),
      jcd: String(api?.stadiumCode || "").padStart(2, "0"),
      raceNo: Number(api?.raceNo || 0),
      api,
    }))
    .sort((left, right) => left.raceKey.localeCompare(right.raceKey, "en"));
  return {
    schemaVersion: 1,
    version: "local-water-v2-post-adoption-input-cache-v1",
    generatedAt,
    startDate: START_DATE,
    latestDate,
    inputFingerprint: INPUT_CACHE_FINGERPRINT,
    productionChanged: false,
    automaticApplication: false,
    sourceCompleteness: {
      expectedRaces: progress.source.length,
      completedRaces: progress.completedKeys.size,
      storedRaces: races.length,
      complete:
        progress.source.length > 0 &&
        progress.completedKeys.size === progress.source.length,
    },
    races,
  };
}

function persistInputCacheProgress(
  progress = activeInputCacheProgress,
  generatedAt = new Date().toISOString(),
  file = INPUT_CACHE,
) {
  if (!progress?.dirty) return null;
  const report = buildInputCacheReport(progress, generatedAt);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJsonAtomic(file, report);
  progress.dirty = false;
  return report;
}

async function main() {
  const source = candidates();
  const total = blank();
  const byDate = {};
  const samples = [];
  const failures = [];
  const loadedCache = loadInputCache();
  const { cacheRows, completedKeys } = sanitizeInputCache(loadedCache, source);
  activeInputCacheProgress = {
    source,
    cacheRows,
    completedKeys,
    dirty: false,
  };
  let cachedRaces = 0;
  let fetchedRaces = 0;
  let index = 0;

  async function worker() {
    while (index < source.length) {
      const race = source[index++];
      byDate[race.date] ||= blank();
      try {
        const completed = await completeApi(race, cacheRows);
        cacheRows.set(race.key, completed.api);
        completedKeys.add(race.key);
        if (completed.cached) cachedRaces++;
        else {
          fetchedRaces++;
          activeInputCacheProgress.dirty = true;
        }
        const result = comparePrepared(race, completed.prepared);
        add(total, result);
        add(byDate[race.date], result);
        if (result?.changed) {
          samples.push({
            raceKey: race.key,
            date: race.date,
            jcd: race.jcd,
            raceNo: race.raceNo,
            gap: result.gap,
            previousHead: result.curHead,
            selectedHead: result.v2Head,
            actual: race.actual,
            productionTickets: result.prodTickets,
            counterfactualTickets: result.oldTickets,
            productionHit: result.productionHit,
            counterfactualHit: result.counterfactualHit,
            payoutPer100: race.pay,
          });
        }
      } catch (error) {
        failures.push(`${race.key}: ${error?.message || error}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(4, source.length || 1) }, worker),
  );

  // The input cache is a resumable, parser-fingerprint-scoped acquisition
  // checkpoint. It may be partial; the evaluation report below never is.
  const generatedAt = new Date().toISOString();
  persistInputCacheProgress(activeInputCacheProgress, generatedAt);
  assertCompleteRun(failures, total.sourceRaces, source.length);
  sortSamples(samples);

  const latestDate = source.reduce(
    (latest, race) => (race.date > latest ? race.date : latest),
    null,
  );
  const report = {
    schemaVersion: 2,
    version: "local-water-v2-post-adoption-monitor-v2",
    generatedAt,
    adoptionPr: 614,
    adoptionCommit: "b230d52969b3aa612498e4c994d840c9b7120abc",
    startDate: START_DATE,
    latestDate,
    method:
      "2026-08-24以降の確定レースだけを対象に、A=本番Local/Water V2 gap<=3タイブレーク、B=同じ未適用base coreの旧展開のまま、固定5点で比較。本番と同じrace trend ready条件を満たす公式入力だけをfingerprint世代別cacheで再利用し、評価レポートは全件揃った場合だけ保存。",
    productionChanged: false,
    automaticApplication: false,
    sourceCompleteness: {
      expectedRaces: source.length,
      completedRaces: total.sourceRaces,
      cachedRaces,
      fetchedRaces,
      complete: true,
    },
    total: finish(total),
    byDate: Object.fromEntries(
      Object.entries(byDate).map(([date, summary]) => [date, finish(summary)]),
    ),
    appliedSamples: samples,
    apiFailures: 0,
    failures: [],
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  writeJsonAtomic(OUT, report);
  activeInputCacheProgress = null;
  console.log(JSON.stringify(report, null, 2));
  return report;
}

if (require.main === module) {
  process.once("exit", cleanupTemporaryOutputs);
  for (const [signal, exitCode] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ]) {
    process.once(signal, () => {
      try {
        persistInputCacheProgress();
      } catch (error) {
        console.error(
          `Local/Water V2 input cache checkpoint failed: ${error?.message || error}`,
        );
      }
      cleanupTemporaryOutputs();
      process.exit(exitCode);
    });
  }
  main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}

module.exports = {
  START_DATE,
  INPUT_CACHE_FINGERPRINT,
  baseAiCore,
  candidates,
  assertCandidate,
  comparePrepared,
  assertCompleteRaceApi,
  prepareCompleteRaceApi,
  sanitizeInputCache,
  completeApi,
  blank,
  add,
  finish,
  assertCompleteRun,
  sortSamples,
  normalizeInputCache,
  cleanupTemporaryOutputs,
  writeJsonAtomic,
  buildInputCacheReport,
  persistInputCacheProgress,
  main,
};
