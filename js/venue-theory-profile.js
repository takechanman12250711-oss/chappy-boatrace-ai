"use strict";

const VENUES = Object.freeze([
  ["01", "桐生"], ["02", "戸田"], ["03", "江戸川"], ["04", "平和島"],
  ["05", "多摩川"], ["06", "浜名湖"], ["07", "蒲郡"], ["08", "常滑"],
  ["09", "津"], ["10", "三国"], ["11", "びわこ"], ["12", "住之江"],
  ["13", "尼崎"], ["14", "鳴門"], ["15", "丸亀"], ["16", "児島"],
  ["17", "宮島"], ["18", "徳山"], ["19", "下関"], ["20", "若松"],
  ["21", "芦屋"], ["22", "福岡"], ["23", "唐津"], ["24", "大村"]
]);

const MIN_EVALUATED = 20;
const WEAK_RECOVERY = 80;
const PROFITABLE_RECOVERY = 100;

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classify(row = {}) {
  const evaluatedCount = Number(row.evaluatedCount || 0);
  const recoveryRate = numberOrNull(row.recoveryRate);
  if (evaluatedCount < MIN_EVALUATED || recoveryRate === null) return "INSUFFICIENT_EVIDENCE";
  if (recoveryRate >= PROFITABLE_RECOVERY) return "STRONG";
  if (recoveryRate < WEAK_RECOVERY) return "WEAK";
  return "WATCH";
}

function compact(row = {}) {
  return {
    theoryKey: String(row.theoryKey || ""),
    label: String(row.label || row.theoryKey || ""),
    evaluatedCount: Number(row.evaluatedCount || 0),
    practicalHitRate: numberOrNull(row.practicalHitRate),
    recoveryRate: numberOrNull(row.recoveryRate),
    profit: Number(row.profit || 0),
    classification: classify(row)
  };
}

function driver(row = {}) {
  return {
    scenarioKey: String(row.scenarioKey || ""),
    scenarioLabel: String(row.scenarioLabel || row.scenarioKey || ""),
    ...compact(row)
  };
}

function buildVenue(jcd, place, theoryRows, scenarioRows) {
  const theories = theoryRows
    .filter(row => String(row.jcd || "").padStart(2, "0") === jcd)
    .map(compact)
    .sort((a, b) => (b.recoveryRate ?? -1) - (a.recoveryRate ?? -1) || b.evaluatedCount - a.evaluatedCount);
  const eligible = theories.filter(row => row.classification !== "INSUFFICIENT_EVIDENCE");
  const drivers = scenarioRows
    .filter(row => String(row.jcd || "").padStart(2, "0") === jcd)
    .filter(row => Number(row.evaluatedCount || 0) >= MIN_EVALUATED)
    .map(driver);
  const profitDrivers = drivers
    .filter(row => row.profit > 0)
    .sort((a, b) => b.profit - a.profit || (b.recoveryRate ?? -1) - (a.recoveryRate ?? -1))
    .slice(0, 5);
  const lossDrivers = drivers
    .filter(row => row.profit < 0)
    .sort((a, b) => a.profit - b.profit || (a.recoveryRate ?? 999) - (b.recoveryRate ?? 999))
    .slice(0, 5);

  return {
    jcd,
    place,
    eligibleTheoryCount: eligible.length,
    strongTheories: eligible.filter(row => row.classification === "STRONG"),
    watchTheories: eligible.filter(row => row.classification === "WATCH"),
    weakTheories: eligible.filter(row => row.classification === "WEAK"),
    insufficientTheories: theories.filter(row => row.classification === "INSUFFICIENT_EVIDENCE"),
    strongestTheory: eligible[0] || null,
    weakestTheory: eligible.length ? eligible[eligible.length - 1] : null,
    profitDrivers,
    lossDrivers
  };
}

function build(report = {}) {
  const theoryRows = Array.isArray(report.byVenueTheory) ? report.byVenueTheory : [];
  const scenarioRows = Array.isArray(report.byVenueScenarioTheory) ? report.byVenueScenarioTheory : [];
  const venues = VENUES.map(([jcd, place]) => buildVenue(jcd, place, theoryRows, scenarioRows));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: report.generatedAt || null,
    source: "data/stats/theory-performance-report.json",
    analysisInputContract: report.analysisInputContract || null,
    productionChanged: false,
    automaticProductionChange: false,
    usableForPrediction: false,
    thresholds: {
      minimumEvaluated: MIN_EVALUATED,
      weakRecoveryRateBelow: WEAK_RECOVERY,
      strongRecoveryRateAtLeast: PROFITABLE_RECOVERY
    },
    metricWarning: "理論ごとに買い目集合が異なるため、理論間の利益は合算せず個別の診断値として扱う。",
    scenarioCoverage: scenarioRows.length ? "AVAILABLE" : "NOT_YET_AVAILABLE",
    venueCount: venues.length,
    venues
  };
}

module.exports = {
  VENUES,
  MIN_EVALUATED,
  WEAK_RECOVERY,
  PROFITABLE_RECOVERY,
  classify,
  compact,
  buildVenue,
  build
};
