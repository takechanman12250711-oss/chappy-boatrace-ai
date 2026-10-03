"use strict";

const fs = require("node:fs");
const path = require("node:path");
const sourceReport = require("./build-frame-rise-fall-shadow-result-report");

const root = path.resolve(__dirname, "..");
const START = Date.parse("2026-08-17T10:30:00Z");
const OUT = path.join(root, "data", "stats", "remain-pickup-hold3-shadow-ab-report.json");

const arr = value => Array.isArray(value) ? value : [];
const ticket = value => {
  const text = String(value?.ticket || value || "");
  return /^[1-6]-[1-6]-[1-6]$/.test(text) &&
    new Set(text.split("-")).size === 3 ? text : "";
};
const key = record =>
  `${record.date}-${String(record.jcd).padStart(2, "0")}-${Number(record.raceNo)}`;

function compactRoleTicket(value = {}) {
  return {
    ticket: value?.ticket,
    roleClaims: arr(value?.roleClaims).map(claim => ({
      role: claim?.role,
      expectedPositions: claim?.expectedPositions
    }))
  };
}

function compactCandidateDecision(value = {}) {
  return {
    ticket: value?.ticket,
    roleLabels: arr(value?.roleLabels).map(label => ({
      structured: label?.structured,
      role: label?.role,
      position: label?.position
    }))
  };
}

function compactPredictionRecord(record = {}) {
  const prediction = record?.prediction || {};
  const practicalSelection = prediction?.practicalSelection || {};
  return {
    date: record?.date,
    jcd: record?.jcd,
    raceNo: record?.raceNo,
    selectedAt: record?.selectedAt,
    capturedAt: record?.capturedAt,
    generatedAt: record?.generatedAt,
    prediction: {
      capturedAt: prediction?.capturedAt,
      practicalTickets: prediction?.practicalTickets,
      verificationEvidence: prediction?.verificationEvidence ? {
        tickets: arr(prediction.verificationEvidence.tickets).map(compactRoleTicket)
      } : undefined,
      practicalSelection: prediction?.practicalSelection ? {
        verificationEvidence: practicalSelection?.verificationEvidence ? {
          tickets: arr(practicalSelection.verificationEvidence.tickets).map(compactRoleTicket)
        } : undefined,
        targetDecisions: arr(practicalSelection?.targetDecisions).map(decision => ({
          candidateDecisions: arr(decision?.candidateDecisions).map(compactCandidateDecision)
        }))
      } : undefined
    }
  };
}

function compactPredictionDoc(document = {}) {
  return {
    predictions: arr(document?.predictions).map(compactPredictionRecord),
    verificationPredictions: arr(document?.verificationPredictions).map(compactPredictionRecord)
  };
}

function load(directory, compact = value => value) {
  if (!fs.existsSync(directory)) return [];
  const documents = [];
  for (const name of fs.readdirSync(directory).filter(name => /^\d{8}\.json$/.test(name)).sort()) {
    documents.push(compact(JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))));
  }
  return documents;
}

function rows(documents) {
  const map = new Map();
  for (const document of documents) {
    for (const name of ["predictions", "verificationPredictions"]) {
      for (const record of arr(document[name])) {
        const raceKey = key(record);
        if (name === "predictions" || !map.has(raceKey)) map.set(raceKey, record);
      }
    }
  }
  return [...map.values()];
}

function results(documents) {
  const map = new Map();
  for (const document of documents) {
    for (const record of arr(document.races)) {
      if (record.resultAvailable && record.status === "finished") map.set(key(record), record);
    }
  }
  return map;
}

function selected(record) {
  return [...new Set(arr(record?.prediction?.practicalTickets).map(ticket).filter(Boolean))];
}

function hold3Tickets(record) {
  const prediction = record?.prediction || {};
  const output = new Set();
  const evidence = prediction.verificationEvidence ||
    prediction?.practicalSelection?.verificationEvidence || {};
  for (const value of arr(evidence.tickets)) {
    const parsed = ticket(value);
    if (
      parsed &&
      arr(value.roleClaims).some(claim =>
        String(claim?.role) === "hold" &&
        arr(claim?.expectedPositions).map(Number).includes(3)
      )
    ) output.add(parsed);
  }
  for (const decision of arr(prediction?.practicalSelection?.targetDecisions)) {
    for (const candidate of arr(decision.candidateDecisions)) {
      const parsed = ticket(candidate);
      if (
        parsed &&
        arr(candidate.roleLabels).some(label =>
          label?.structured === true &&
          String(label?.role) === "hold" &&
          Number(label?.position) === 3
        )
      ) output.add(parsed);
    }
  }
  return output;
}

function captured(record) {
  return Date.parse(
    record.selectedAt ||
    record.capturedAt ||
    record?.prediction?.capturedAt ||
    record.generatedAt ||
    0
  );
}

function stat(records, resultMap, mode) {
  let settled = 0;
  let hit = 0;
  let stake = 0;
  let returned = 0;
  let affected = 0;
  for (const record of records) {
    const result = resultMap.get(key(record));
    if (!result) continue;
    const a = selected(record);
    const hold = hold3Tickets(record);
    const b = a.filter(value => !hold.has(value));
    if (hold.size) affected++;
    const selectedTickets = mode === "B" ? b : a;
    settled++;
    stake += selectedTickets.length * 100;
    const actual = ticket(result?.trifecta?.combination);
    if (actual && selectedTickets.includes(actual)) {
      hit++;
      returned += Math.max(0, Number(result?.trifecta?.payout || 0));
    }
  }
  return {
    settledCount: settled,
    affectedRaceCount: affected,
    hitCount: hit,
    hitRate: settled ? Math.round(hit / settled * 1000) / 10 : null,
    stake,
    return: returned,
    profit: returned - stake,
    recoveryRate: stake ? Math.round(returned / stake * 1000) / 10 : null
  };
}

function build(predictionDocuments, resultDocuments) {
  const resultMap = results(resultDocuments);
  const cohort = rows(predictionDocuments).filter(record => captured(record) >= START);
  const A = stat(cohort, resultMap, "A");
  const B = stat(cohort, resultMap, "B");
  const decision = A.affectedRaceCount >= 30 ? "review-ready" : "collecting";
  return {
    schemaVersion: 1,
    version: "remain-pickup-hold3-shadow-ab-v1",
    generatedAt: new Date().toISOString(),
    cohortStart: "2026-08-17T10:30:00Z",
    productionAUnchanged: true,
    automaticApplication: false,
    usableForPrediction: false,
    actualPurchase: false,
    A,
    B,
    decision,
    minimumAffectedSettledCount: 30,
    ruleB: "exclude-only-tickets-with-structured-hold-role-at-3rd-position"
  };
}

function main() {
  const report = build(
    load(path.join(root, "data", "predictions"), compactPredictionDoc),
    load(path.join(root, "data", "results"), sourceReport.compactResultDoc)
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main();
module.exports = {
  compactPredictionRecord,
  compactPredictionDoc,
  hold3Tickets,
  build
};
