"use strict";

const fs = require("node:fs");
const path = require("node:path");
const base = require("./build-race-flow-2course-sashi-skip-ab-report");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "venue-2course-sashi-skip-shadow.json");
const VERSION = "venue-race-flow-2course-sashi-skip-ab-v1-prospective";
const BASE_RULE_VERSION = "race-flow-2course-sashi-skip-ab-v1-prospective";
const DISCOVERY_ARTIFACT = "data/stats/venue-scenario-improvement-candidates.json";
const DISCOVERY_GENERATED_AT = "2026-09-20T08:43:08.378Z";
const PROSPECTIVE_CUTOFF = "2026-09-21T00:00:00.000Z";
const TARGET_VENUES = Object.freeze([
  Object.freeze({ jcd: "01", place: "桐生" }),
  Object.freeze({ jcd: "18", place: "徳山" })
]);
const MIN_TARGET_SETTLED_PER_VENUE = 30;

function compactTickets(values) {
  if (!Array.isArray(values)) return [];
  return values.map(value => value?.ticket || value);
}

function compactPredictionRecord(record = {}) {
  const prediction = record.prediction || {};
  const raceFlow = prediction.raceFlow || {};
  return {
    date: record.date,
    jcd: record.jcd,
    raceNo: record.raceNo,
    selectedAt: record.selectedAt,
    capturedAt: record.capturedAt,
    deadlineAt: record.deadlineAt,
    scenarioLabel: record.scenarioLabel,
    selection: record.selection ? { scenarioLabel: record.selection.scenarioLabel } : undefined,
    prediction: {
      scenarioLabel: prediction.scenarioLabel,
      raceFlow: {
        scenarioLabel: raceFlow.scenarioLabel,
        label: raceFlow.label,
        scenario: raceFlow.scenario ? { title: raceFlow.scenario.title } : undefined
      },
      practicalTickets: compactTickets(prediction.practicalTickets),
      practicalSelection: prediction.practicalSelection
        ? { tickets: compactTickets(prediction.practicalSelection.tickets) }
        : undefined
    }
  };
}

function compactPredictionDoc(doc = {}) {
  return {
    predictions: (Array.isArray(doc.predictions) ? doc.predictions : []).map(compactPredictionRecord),
    verificationPredictions: (Array.isArray(doc.verificationPredictions) ? doc.verificationPredictions : []).map(compactPredictionRecord)
  };
}

function compactResultDoc(doc = {}) {
  return {
    races: (Array.isArray(doc.races) ? doc.races : []).map(race => ({
      date: race.date,
      jcd: race.jcd,
      raceNo: race.raceNo,
      resultAvailable: race.resultAvailable,
      status: race.status,
      trifecta: race.trifecta ? {
        combination: race.trifecta.combination,
        payout: race.trifecta.payout
      } : undefined
    }))
  };
}

function load(dir, compactDoc = doc => doc) {
  if (!fs.existsSync(dir)) return [];
  const docs = [];
  const names = fs.readdirSync(dir)
    .filter(name => /^\d{8}\.json$/.test(name))
    .sort();
  for (const name of names) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    docs.push(compactDoc(parsed));
  }
  return docs;
}

function summarize(rows) {
  const targetRows = rows.filter(row => base.scenarioLabel(row.record) === base.TARGET_LABEL);
  return {
    raceCount: rows.length,
    settledCount: rows.filter(row => row.result).length,
    targetRaceCount: targetRows.length,
    targetSettledCount: targetRows.filter(row => row.result).length,
    a: base.settle(rows, "A"),
    b: base.settle(rows, "B")
  };
}

function delta(a, b) {
  return {
    stake: b.stake - a.stake,
    return: b.return - a.return,
    profit: b.profit - a.profit,
    recoveryRate: a.recoveryRate !== null && b.recoveryRate !== null
      ? Math.round((b.recoveryRate - a.recoveryRate) * 10) / 10
      : null,
    hitRate: a.hitRate !== null && b.hitRate !== null
      ? Math.round((b.hitRate - a.hitRate) * 10) / 10
      : null
  };
}

function build(predDocs, resultDocs) {
  const cohort = base.collectCohort(predDocs, resultDocs, {
    cutoff: PROSPECTIVE_CUTOFF,
    venues: TARGET_VENUES.map(row => row.jcd),
    requirePreDeadline: true,
    officialResultsOnly: true
  });
  const total = summarize(cohort);
  const byVenue = TARGET_VENUES.map(venue => {
    const rows = cohort.filter(row => String(row.record.jcd || "").padStart(2, "0") === venue.jcd);
    const summary = summarize(rows);
    return {
      ...venue,
      cohort: {
        raceCount: summary.raceCount,
        settledCount: summary.settledCount,
        targetRaceCount: summary.targetRaceCount,
        targetSettledCount: summary.targetSettledCount
      },
      a: { label: "current-A", ...summary.a },
      b: { label: "skip-exact-2course-sashi-B", ...summary.b },
      delta: delta(summary.a, summary.b),
      validationReady: summary.targetSettledCount >= MIN_TARGET_SETTLED_PER_VENUE
    };
  });

  return {
    schemaVersion: 1,
    version: VERSION,
    baseRuleVersion: BASE_RULE_VERSION,
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticProductionChange: false,
    usableForPrediction: false,
    targetLabel: base.TARGET_LABEL,
    targetVenues: TARGET_VENUES,
    preregistration: {
      discoveryArtifact: DISCOVERY_ARTIFACT,
      discoveryGeneratedAt: DISCOVERY_GENERATED_AT,
      cutoffSelectedAtInclusive: PROSPECTIVE_CUTOFF,
      discoveryRowsUsableForValidation: false,
      oldRecordsBackfilled: false,
      retrospectiveClassificationAllowed: false,
      requiresStoredPreDeadlineSelection: true,
      requiresOfficialSettledResult: true,
      exactScenarioLabelOnly: true,
      actualPurchase: false
    },
    cohort: {
      raceCount: total.raceCount,
      settledCount: total.settledCount,
      targetRaceCount: total.targetRaceCount,
      targetSettledCount: total.targetSettledCount
    },
    a: {
      label: "current-A",
      rule: "保存済みの現行実戦厳選をそのまま評価",
      ...total.a
    },
    b: {
      label: "skip-exact-2course-sashi-B",
      rule: "対象2場で保存済み締切前展開ラベルが完全一致で2コース差しの時だけshadow上で見送り",
      ...total.b
    },
    delta: delta(total.a, total.b),
    byVenue,
    interpretation: {
      minimumTargetSettledCountPerVenue: MIN_TARGET_SETTLED_PER_VENUE,
      allVenuesValidationReady: byVenue.every(row => row.validationReady),
      automaticApplication: false,
      automaticPhase8Handoff: false,
      affectsCurrentTickets: false,
      adoptionRequiresUserApproval: true
    }
  };
}

function main() {
  const report = build(load(predictionDir, compactPredictionDoc), load(resultDir, compactResultDoc));
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`場別2コース差しshadow: ${report.cohort.raceCount}R / 対象確定 ${report.cohort.targetSettledCount}R`);
}

if (require.main === module) main();

module.exports = {
  VERSION,
  BASE_RULE_VERSION,
  DISCOVERY_ARTIFACT,
  DISCOVERY_GENERATED_AT,
  PROSPECTIVE_CUTOFF,
  TARGET_VENUES,
  MIN_TARGET_SETTLED_PER_VENUE,
  compactPredictionRecord,
  compactPredictionDoc,
  compactResultDoc,
  summarize,
  delta,
  build
};
