"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.join(__dirname, "..");

function memoryLocalStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
    removeItem(key) {
      values.delete(String(key));
    },
    clear() {
      values.clear();
    }
  };
}

function analysis(boatNo, options = {}) {
  return {
    boatNo,
    indexes: {
      raceFlow: 40,
      st: 40,
      exhibition: 40,
      local: 40,
      turn: 40,
      national: 40,
      motor: 40,
      ...(options.indexes || {})
    },
    roleScores: {
      attack: 40,
      hold: 40,
      pickup: 40,
      ...(options.roleScores || {})
    },
    courseStructureTheory: {
      appliedIndex: options.courseIndex ?? 40
    }
  };
}

function activePrediction() {
  return {
    raceKey: "20260908-05-7",
    date: "2026-09-08",
    jcd: "05",
    raceNo: 7,
    generatedAt: "2026-09-08T06:00:00.000Z",
    formations: {
      main: ["1-2-4", "1-4-2"],
      cover: [
        { ticket: "1-2-5", amountYen: 200 },
        { ticket: "1-5-2", amountYen: 100 }
      ],
      flow: ["1-2-6", "1-6-2"],
      hole: ["2-1-5", "2-5-1"]
    },
    practicalSelection: {
      frameRiseFallReplayBasis: {
        source: "pre-deadline-production-prediction",
        analyses: [
          analysis(1, {
            indexes: { raceFlow: 80, st: 50, exhibition: 50 },
            roleScores: { attack: 50 },
            courseIndex: 90
          }),
          analysis(2),
          analysis(3, {
            indexes: { raceFlow: 60, st: 51, exhibition: 56 },
            roleScores: { attack: 53 },
            courseIndex: 70
          }),
          analysis(4),
          analysis(5),
          analysis(6)
        ]
      }
    },
    evaluatedScenarioCandidates: {
      candidatePool: [
        {
          id: "cover",
          ticket: "1-4-3",
          sourceCategory: "cover",
          evidenceQualified: true,
          purchaseEligible: true,
          priorityScore: 50
        },
        {
          id: "flow",
          ticket: "1-5-3",
          sourceCategory: "flow",
          evidenceQualified: true,
          purchaseEligible: true,
          priorityScore: 40
        },
        {
          id: "hole",
          ticket: "2-3-5",
          sourceCategory: "hole",
          evidenceQualified: true,
          purchaseEligible: true,
          priorityScore: 30
        }
      ]
    }
  };
}

function officialResult() {
  return {
    raceKey: "20260908-05-7",
    date: "2026-09-08",
    jcd: "05",
    raceNo: 7,
    recordType: "official_result",
    resultSource: "boatrace-official",
    result: "1-4-3",
    officialPayoutPer100: 1500,
    finishers: [1, 4, 3],
    officialCheckedAt: "2026-09-08T05:00:00.000Z"
  };
}

function loadBrowserScript(context, relativePath) {
  const source = fs.readFileSync(path.join(rootDir, relativePath), "utf8");
  vm.runInContext(source, context, { filename: relativePath });
}

const browser = {
  console,
  localStorage: memoryLocalStorage()
};
browser.window = browser;
browser.globalThis = browser;
vm.createContext(browser);

assert.doesNotThrow(
  () => loadBrowserScript(browser, "js/storage.js"),
  "base storage must load first"
);
assert.equal(typeof browser.ChappyStorage.findResultByRaceKey, "function");
assert.equal(
  browser.ChappyStorage.findResult,
  undefined,
  "browser storage exposes findResultByRaceKey, not the obsolete findResult API"
);

assert.doesNotThrow(
  () => loadBrowserScript(browser, "js/manshu-forecast-ledger.js"),
  "manshu ledger must compose over base storage"
);

const storage = browser.ChappyStorage;
const loadManshuForecastPerformance =
  storage.loadManshuForecastPerformance;

assert.equal(Object.isExtensible(storage), true, "wrapped storage stays composable");
storage.integrationProbe = true;
assert.equal(storage.integrationProbe, true, "later browser modules can extend storage");

let resultLookupCount = 0;
const findResultByRaceKey = storage.findResultByRaceKey;
storage.findResultByRaceKey = function countedFindResultByRaceKey(raceKey) {
  resultLookupCount += 1;
  return findResultByRaceKey.call(storage, raceKey);
};

assert.doesNotThrow(
  () => loadBrowserScript(browser, "js/outer-attack-ticket-shadow.js"),
  "outer shadow must install after the manshu wrapper without a guard"
);
assert.doesNotThrow(
  () => loadBrowserScript(browser, "js/outer-attack-ticket-settlement.js"),
  "outer settlement must install after shadow without a guard"
);

assert.ok(
  Object.hasOwn(storage, "__chappyOuterAttackTicketShadowV1"),
  "shadow hook mark is installed on the composed storage"
);
assert.ok(
  Object.hasOwn(storage, "__chappyOuterAttackTicketSettlementV1"),
  "settlement hook mark is installed on the composed storage"
);
assert.equal(
  browser.ChappyOuterAttackTicketShadow.installStorageHook(browser),
  false,
  "shadow installation is idempotent"
);
assert.equal(
  browser.ChappyOuterAttackTicketSettlement.installStorageHooks(browser),
  false,
  "settlement installation is idempotent"
);

assert.equal(
  storage.loadManshuForecastPerformance,
  loadManshuForecastPerformance,
  "outer hooks preserve the manshu performance API"
);
assert.equal(
  typeof storage.loadManshuForecastPerformance().overall,
  "object"
);

storage.upsertResult(officialResult());
assert.equal(
  browser.ChappyOuterAttackTicketSettlement.readSettlements(browser).length,
  0,
  "a result saved before its prediction waits for shadow capture"
);

storage.upsertPrediction(activePrediction());

const history = browser.ChappyOuterAttackTicketShadow.readHistory(browser);
assert.equal(history.length, 1, "prediction save captures one outer-attack shadow");
assert.equal(history[0].sourceRaceKey, "20260908-05-7");
assert.equal(history[0].comparisonStatus, "awaiting-official-result");

assert.ok(
  resultLookupCount > 0,
  "prediction-side settlement uses the real findResultByRaceKey storage API"
);
const settlements =
  browser.ChappyOuterAttackTicketSettlement.readSettlements(browser);
assert.equal(settlements.length, 1, "result-first storage order settles after prediction");
assert.equal(settlements[0].sourceRaceKey, "20260908-05-7");
assert.equal(settlements[0].captureOrder, "result-before-prediction");
assert.equal(settlements[0].comparison.variants.cover.outcome.hit, true);

console.log("outer attack ticket storage integration tests passed");
