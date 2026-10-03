"use strict";

const fs = require("node:fs");
const path = require("node:path");
const sourceReport = require("./build-frame-rise-fall-shadow-result-report");

const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");
const resultDir = path.join(root, "data", "results");
const output = path.join(root, "data", "stats", "race-flow-4kado-alert-skip-ab-report.json");
const STAKE_PER_TICKET = 100;
const TARGET_LABEL = "4カド攻め警戒";
const PROSPECTIVE_CUTOFF = "2026-08-17T06:45:00Z";

function ticket(value) {
  const s = String(value?.ticket || value || "").trim();
  return /^[1-6]-[1-6]-[1-6]$/.test(s) && new Set(s.split("-")).size === 3 ? s : "";
}

function tickets(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(ticket).filter(Boolean))];
}

function raceKey(record = {}) {
  return `${String(record.date || "")}-${String(record.jcd || "").padStart(2, "0")}-${Number(record.raceNo || 0)}`;
}

function load(dir, compact = value => value) {
  if (!fs.existsSync(dir)) return [];
  const documents = [];
  for (const name of fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    documents.push(compact(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))));
  }
  return documents;
}

function compactPredictionRecord(record = {}) {
  const prediction = record?.prediction || {};
  const raceFlow = prediction?.raceFlow || {};
  const scenario = raceFlow?.scenario || {};
  const practicalSelection = prediction?.practicalSelection || {};
  const result = record?.result || null;
  return {
    date: record?.date,
    jcd: record?.jcd,
    raceNo: record?.raceNo,
    selectedAt: record?.selectedAt,
    capturedAt: record?.capturedAt,
    scenarioLabel: record?.scenarioLabel,
    selection: record?.selection ? {
      scenarioLabel: record.selection.scenarioLabel
    } : undefined,
    prediction: {
      scenarioLabel: prediction?.scenarioLabel,
      raceFlow: {
        scenario: raceFlow?.scenario ? { title: scenario.title } : undefined,
        scenarioLabel: raceFlow?.scenarioLabel,
        label: raceFlow?.label
      },
      practicalTickets: prediction?.practicalTickets,
      practicalSelection: prediction?.practicalSelection ? {
        tickets: practicalSelection.tickets
      } : undefined
    },
    result: result ? {
      settled: result.settled,
      resultTicket: result.resultTicket,
      payout: result.payout
    } : undefined
  };
}

function compactPredictionDoc(doc = {}) {
  return {
    predictions: (Array.isArray(doc?.predictions) ? doc.predictions : [])
      .map(compactPredictionRecord),
    verificationPredictions: (Array.isArray(doc?.verificationPredictions) ? doc.verificationPredictions : [])
      .map(compactPredictionRecord)
  };
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const race of (Array.isArray(doc.races) ? doc.races : [])) {
      if (race.resultAvailable && race.status === "finished") map.set(raceKey(race), race);
    }
  }
  return map;
}

function scenarioLabel(record = {}) {
  const p = record.prediction || {};
  const values = [
    p?.raceFlow?.scenario?.title,
    p?.raceFlow?.scenarioLabel,
    p?.raceFlow?.label,
    p.scenarioLabel,
    record.scenarioLabel,
    record?.selection?.scenarioLabel
  ];
  for (const value of values) {
    const label = String(value || "").trim();
    if (label) return label;
  }
  return "";
}

function selectedEpoch(record = {}) {
  const value = Date.parse(String(record.selectedAt || record.capturedAt || ""));
  return Number.isFinite(value) ? value : null;
}

function isProspective(record = {}) {
  const epoch = selectedEpoch(record);
  return epoch !== null && epoch >= Date.parse(PROSPECTIVE_CUTOFF);
}

function practicalTickets(record = {}) {
  return tickets(record?.prediction?.practicalTickets || record?.prediction?.practicalSelection?.tickets);
}

function embeddedResult(record = {}) {
  const r = record.result || {};
  if (r.settled && ticket(r.resultTicket)) {
    return { trifecta: { combination: ticket(r.resultTicket), payout: Math.max(0, Number(r.payout || 0)) } };
  }
  return null;
}

function settle(rows, mode) {
  let settledCount = 0;
  let betRaceCount = 0;
  let skippedRaceCount = 0;
  let hitCount = 0;
  let stake = 0;
  let returned = 0;

  for (const row of rows) {
    if (!row.result) continue;
    settledCount++;
    const label = scenarioLabel(row.record);
    const skip = mode === "B" && label === TARGET_LABEL;
    if (skip) {
      skippedRaceCount++;
      continue;
    }
    const ts = practicalTickets(row.record);
    if (!ts.length) continue;
    betRaceCount++;
    stake += ts.length * STAKE_PER_TICKET;
    const actual = ticket(row.result?.trifecta?.combination);
    const payout = Math.max(0, Number(row.result?.trifecta?.payout || 0));
    if (actual && ts.includes(actual)) {
      hitCount++;
      returned += payout;
    }
  }

  return {
    settledCount,
    betRaceCount,
    skippedRaceCount,
    hitCount,
    hitRate: betRaceCount ? Math.round(hitCount / betRaceCount * 1000) / 10 : null,
    stake,
    return: returned,
    profit: returned - stake,
    recoveryRate: stake ? Math.round(returned / stake * 1000) / 10 : null
  };
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const selected = predDocs.flatMap(doc => Array.isArray(doc.predictions) ? doc.predictions : []);
  const verification = predDocs.flatMap(doc => Array.isArray(doc.verificationPredictions) ? doc.verificationPredictions : []);
  const rows = [
    ...verification.map(record => ({ record, sourcePriority: 0 })),
    ...selected.map(record => ({ record, sourcePriority: 1 }))
  ]
    .filter(row => isProspective(row.record))
    .map(row => ({ ...row, result: embeddedResult(row.record) || results.get(raceKey(row.record)) || null }));

  const dedup = new Map();
  for (const row of rows) {
    const key = raceKey(row.record);
    if (!dedup.has(key) || row.sourcePriority > dedup.get(key).sourcePriority) dedup.set(key, row);
  }
  const cohort = [...dedup.values()];
  const targetRows = cohort.filter(row => scenarioLabel(row.record) === TARGET_LABEL);
  const a = settle(cohort, "A");
  const b = settle(cohort, "B");

  return {
    schemaVersion: 1,
    version: "race-flow-4kado-alert-skip-ab-v1-prospective",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    targetLabel: TARGET_LABEL,
    prospectiveProtocol: {
      cutoffSelectedAtInclusive: PROSPECTIVE_CUTOFF,
      oldRecordsBackfilled: false,
      retrospectiveClassificationAllowed: false,
      actualPurchase: false
    },
    cohort: {
      raceCount: cohort.length,
      settledCount: cohort.filter(row => row.result).length,
      targetRaceCount: targetRows.length,
      targetSettledCount: targetRows.filter(row => row.result).length
    },
    a: {
      label: "current-A",
      rule: "現行どおり全対象を購入候補として評価",
      ...a
    },
    b: {
      label: "skip-4kado-alert-B",
      rule: `展開ラベルが「${TARGET_LABEL}」の時だけ購入見送り`,
      ...b
    },
    delta: {
      stake: b.stake - a.stake,
      return: b.return - a.return,
      profit: b.profit - a.profit,
      recoveryRate: a.recoveryRate !== null && b.recoveryRate !== null ? Math.round((b.recoveryRate - a.recoveryRate) * 10) / 10 : null,
      hitRate: a.hitRate !== null && b.hitRate !== null ? Math.round((b.hitRate - a.hitRate) * 10) / 10 : null
    },
    interpretation: {
      minimumTargetSettledCount: 30,
      automaticApplication: false,
      usableForPrediction: false,
      affectsCurrentTickets: false,
      adoptionDecisionReady: targetRows.filter(row => row.result).length >= 30
    }
  };
}

function main() {
  const report = build(
    load(predictionDir, compactPredictionDoc),
    load(resultDir, sourceReport.compactResultDoc)
  );
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`4カド攻め警戒 prospective A/B: cohort ${report.cohort.raceCount}R / target settled ${report.cohort.targetSettledCount}R`);
}

if (require.main === module) main();
module.exports = {
  load,
  compactPredictionRecord,
  compactPredictionDoc,
  build,
  settle,
  scenarioLabel,
  selectedEpoch,
  isProspective,
  TARGET_LABEL,
  PROSPECTIVE_CUTOFF
};
