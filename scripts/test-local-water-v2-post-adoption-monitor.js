"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const monitor = require("./monitor-local-water-v2-post-adoption");

function scenario(headBoatNo, score, ticket) {
  return {
    headBoatNo,
    score,
    blockedBoats: [],
    ticket,
    outcome: {
      firstCandidates: [{ boatNo: headBoatNo }],
      secondCandidates: [{ boatNo: headBoatNo === 1 ? 2 : 1 }],
      thirdCandidates: [{ boatNo: 3 }],
      remainers: [{ boatNo: 4 }],
      pickupCandidates: [{ boatNo: 5 }],
    },
  };
}

assert.equal(
  monitor.baseAiCore.__localWaterV2TiebreakInstalled,
  undefined,
  "比較基準はLocal/Water V2未適用coreを保持する",
);
assert.equal(
  global.ChappyAICore.__localWaterV2TiebreakInstalled,
  true,
  "本番global coreはLocal/Water V2を維持する",
);
assert.notEqual(
  monitor.baseAiCore,
  global.ChappyAICore,
  "基準coreと本番wrapperを混同しない",
);

const baselineScenario = scenario(1, 80, "1-2-3");
const v2Scenario = scenario(2, 78, "2-3-1");
const baselineAi = {
  analyses: [1, 2, 3, 4, 5, 6].map(boatNo => ({ boatNo })),
  raceScenarios: {
    mainScenario: baselineScenario,
    scenarios: [baselineScenario, v2Scenario],
    holdPickupTheory: {},
  },
  formations: {
    main: [
      { ticket: "1-2-3" },
      { ticket: "1-3-2" },
      { ticket: "1-2-4" },
    ],
    safety: [{ ticket: "1-4-2" }, { ticket: "1-3-4" }],
  },
};
const baselineSnapshot = JSON.parse(JSON.stringify(baselineAi));
const core = {
  buildPredictionData() {
    return baselineAi;
  },
  buildFormations(_analyses, raceScenarios) {
    assert.equal(raceScenarios.mainScenario.headBoatNo, 2);
    return {
      main: [
        { ticket: "2-3-1" },
        { ticket: "2-1-3" },
        { ticket: "2-3-4" },
      ],
      safety: [{ ticket: "2-4-1" }, { ticket: "2-1-4" }],
    };
  },
};
const prepared = {
  localWaterTheoryV2: {
    isFormal: true,
    rows: [
      { boatNo: 2, score: 90, isFormal: true },
      { boatNo: 1, score: 80, isFormal: true },
    ],
  },
};
const race = {
  key: "fixture-01-1",
  date: "20260828",
  jcd: "01",
  raceNo: 1,
  actual: "2-3-1",
  pay: 1230,
};
const result = monitor.comparePrepared(race, prepared, core);

assert.equal(result.gap, 2);
assert.equal(result.curHead, 1);
assert.equal(result.v2Head, 2);
assert.equal(result.changed, true);
assert.equal(result.productionHit, true);
assert.equal(result.counterfactualHit, false);
assert.deepEqual(result.prodTickets, [
  "2-3-1",
  "2-1-3",
  "2-3-4",
  "2-4-1",
  "2-1-4",
]);
assert.deepEqual(result.oldTickets, [
  "1-2-3",
  "1-3-2",
  "1-2-4",
  "1-4-2",
  "1-3-4",
]);
assert.deepEqual(
  baselineAi,
  baselineSnapshot,
  "本番比較を適用しても基準AIを変更しない",
);

const summary = monitor.blank();
monitor.add(summary, result);
assert.equal(summary.sourceRaces, 1);
assert.equal(summary.comparableRaces, 1);
assert.equal(summary.appliedRaces, 1);
assert.equal(summary.productionHits, 1);
assert.equal(summary.counterfactualHits, 0);

assert.throws(
  () =>
    monitor.assertCompleteRaceApi(
      { date: race.date, stadiumCode: race.jcd, raceNo: race.raceNo, entries: [] },
      race,
    ),
  /entries are invalid/,
);
assert.throws(
  () =>
    monitor.assertCompleteRaceApi(
      {
        date: race.date,
        stadiumCode: race.jcd,
        raceNo: race.raceNo,
        entries: Array.from({ length: 6 }, (_, index) => ({ waku: index + 1 })),
        beforeInfoAvailable: false,
      },
      race,
    ),
  /beforeinfo is unavailable/,
);
assert.doesNotThrow(() =>
  monitor.assertCompleteRaceApi(
    {
      date: race.date,
      stadiumCode: race.jcd,
      raceNo: race.raceNo,
      entries: Array.from({ length: 6 }, (_, index) => ({ waku: index + 1 })),
      beforeInfoAvailable: true,
    },
    race,
  ),
);
assert.throws(
  () =>
    monitor.prepareCompleteRaceApi(
      {
        date: race.date,
        stadiumCode: race.jcd,
        raceNo: race.raceNo,
        entries: Array.from({ length: 6 }, (_, index) => ({ waku: index + 1 })),
        beforeInfoAvailable: true,
      },
      race,
    ),
  /production input is not ready.*st=0\/6/,
  "艇番だけのparser placeholderを完全な本番入力として扱わない",
);
assert.throws(
  () =>
    monitor.assertCompleteRaceApi(
      {
        date: race.date,
        stadiumCode: race.jcd,
        raceNo: race.raceNo,
        entries: Array.from({ length: 6 }, () => ({ waku: 1 })),
        beforeInfoAvailable: true,
      },
      race,
    ),
  /entries are invalid/,
);
assert.throws(
  () =>
    monitor.assertCompleteRaceApi(
      {
        date: "20260827",
        stadiumCode: race.jcd,
        raceNo: race.raceNo,
        entries: Array.from({ length: 6 }, (_, index) => ({ waku: index + 1 })),
        beforeInfoAvailable: true,
      },
      race,
    ),
  /race identity does not match/,
);
assert.throws(
  () => monitor.assertCandidate({ key: "bad-ticket", actual: "", pay: 100 }),
  /settled ticket is invalid/,
);
assert.throws(
  () =>
    monitor.assertCandidate({ key: "bad-payout", actual: "1-2-3", pay: 0 }),
  /settled payout is invalid/,
);
assert.doesNotThrow(() =>
  monitor.assertCandidate({ key: "valid", actual: "1-2-3", pay: 100 }),
);
assert.throws(
  () => monitor.assertCompleteRun(["fixture failure"], 0, 1),
  /refused partial output: 0\/1 completed/,
);
assert.throws(
  () => monitor.assertCompleteRun([], 0, 1),
  /refused partial output: 0\/1 completed/,
);
assert.throws(
  () => monitor.assertCompleteRun([], 0, 0),
  /refused partial output: 0\/0 completed/,
);
assert.doesNotThrow(() => monitor.assertCompleteRun([], 1, 1));
assert.deepEqual(
  monitor.sortSamples([{ raceKey: "b" }, { raceKey: "a" }]),
  [{ raceKey: "a" }, { raceKey: "b" }],
  "並列取得順に依存せずsampleを固定順保存する",
);

const cachedApi = {
  date: race.date,
  stadiumCode: race.jcd,
  raceNo: race.raceNo,
  entries: Array.from({ length: 6 }, (_, index) => ({ waku: index + 1 })),
  beforeInfoAvailable: true,
};
const readyApi = {
  ...cachedApi,
  entries: Array.from({ length: 6 }, (_, index) => ({
    boat: index + 1,
    registerNo: String(4000 + index),
    className: "A1",
    avgSt: 0.15,
    nationalWinRate: 6,
    localWinRate: 6,
    motor2Rate: 35,
    exhibition: { displayTime: 6.8 + index * 0.01 },
  })),
};
const validCache = monitor.normalizeInputCache({
  schemaVersion: 1,
  version: "local-water-v2-post-adoption-input-cache-v1",
  startDate: monitor.START_DATE,
  inputFingerprint: monitor.INPUT_CACHE_FINGERPRINT,
  races: [{ raceKey: "cached-race", api: cachedApi }],
});
assert.deepEqual(validCache.get("cached-race"), cachedApi);
assert.equal(
  monitor.normalizeInputCache({
    schemaVersion: 1,
    version: "local-water-v2-post-adoption-input-cache-v1",
    startDate: monitor.START_DATE,
    inputFingerprint: "stale",
    races: [{ raceKey: "cached-race", api: cachedApi }],
  }).size,
  0,
  "parser fingerprint変更時は全入力を再取得する",
);
const secondRace = { ...race, key: "fixture-01-2", raceNo: 2 };
const sanitized = monitor.sanitizeInputCache(
  new Map([
    [race.key, readyApi],
    [secondRace.key, { ...cachedApi, raceNo: secondRace.raceNo }],
    ["not-in-source", readyApi],
  ]),
  [race, secondRace],
);
assert.deepEqual([...sanitized.cacheRows.keys()], [race.key]);
assert.deepEqual([...sanitized.completedKeys], [race.key]);

const partialProgress = {
  source: [race, secondRace],
  cacheRows: new Map([[race.key, readyApi]]),
  completedKeys: new Set([race.key]),
  dirty: true,
};
const partialCacheReport = monitor.buildInputCacheReport(
  partialProgress,
  "2026-08-28T00:00:00.000Z",
);
assert.equal(partialCacheReport.sourceCompleteness.completedRaces, 1);
assert.equal(partialCacheReport.sourceCompleteness.expectedRaces, 2);
assert.equal(partialCacheReport.sourceCompleteness.complete, false);
assert.equal(partialCacheReport.races.length, 1);

const temporaryDirectory = fs.mkdtempSync(
  path.join(os.tmpdir(), "chappy-local-water-v2-test-"),
);
try {
  const output = path.join(temporaryDirectory, "report.json");
  monitor.writeJsonAtomic(output, { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), { ok: true });
  assert.equal(fs.existsSync(`${output}.next`), false);

  const cacheOutput = path.join(temporaryDirectory, "input-cache.json");
  fs.writeFileSync(cacheOutput, "sentinel\n");
  assert.equal(
    monitor.persistInputCacheProgress(
      { ...partialProgress, dirty: false },
      "2026-08-28T00:00:01.000Z",
      cacheOutput,
    ),
    null,
    "新規取得がなければgeneratedAtだけのcache更新を作らない",
  );
  assert.equal(fs.readFileSync(cacheOutput, "utf8"), "sentinel\n");

  const persistedProgress = { ...partialProgress, dirty: true };
  monitor.persistInputCacheProgress(
    persistedProgress,
    "2026-08-28T00:00:02.000Z",
    cacheOutput,
  );
  const persistedCache = JSON.parse(fs.readFileSync(cacheOutput, "utf8"));
  assert.equal(persistedCache.sourceCompleteness.complete, false);
  assert.deepEqual(persistedCache.races.map(row => row.raceKey), [race.key]);
  assert.equal(persistedProgress.dirty, false);
  assert.equal(fs.existsSync(`${cacheOutput}.next`), false);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

async function testIncompleteCacheFallback() {
  let fetches = 0;
  const completed = await monitor.completeApi(
    race,
    new Map([[race.key, cachedApi]]),
    async query => {
      fetches++;
      assert.deepEqual(query, {
        date: race.date,
        jcd: race.jcd,
        rno: String(race.raceNo),
      });
      return readyApi;
    },
  );
  assert.equal(fetches, 1, "不完全cacheはlive公式入力へfallbackする");
  assert.equal(completed.cached, false);
  assert.equal(
    monitor.baseAiCore.buildRaceTrendEvaluation(completed.prepared).ready,
    true,
  );
}

testIncompleteCacheFallback()
  .then(() => {
    console.log("Local/Water V2 post-adoption monitor fixture: passed");
  })
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
