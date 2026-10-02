"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");

const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-main-head-selection-audit.json");

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function key(row = {}) {
  return `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
}

function load(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const name of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc?.[name])) {
        const rowKey = key(row);
        if (name === "predictions" || !map.has(rowKey)) map.set(rowKey, row);
      }
    }
  }
  return [...map.values()];
}

function resultMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const race of arr(doc?.races)) {
      if (race?.resultAvailable === true && race?.status === "finished") {
        map.set(key(race), race);
      }
    }
  }
  return map;
}

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total ? round1(count / total * 100) : null;
}

function boatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number : null;
}

function objectBoatNo(value = {}) {
  for (const field of ["boatNo", "boat", "number", "waku", "teiban", "targetBoatNo", "candidateBoatNo"]) {
    const number = boatNumber(value?.[field]);
    if (number) return number;
  }
  return null;
}

function exactTicketHead(value) {
  if (value == null) return null;
  const text = String(value)
    .trim()
    .replace(/[＝=＞>]/g, "-")
    .replace(/\s+/g, "");
  const exact = text.match(/^([1-6])-([1-6])-([1-6])$/);
  if (exact && new Set(exact.slice(1).map(Number)).size === 3) return Number(exact[1]);
  const formation = text.match(/^([1-6])-(?:[1-6]{1,5}|全)-/);
  return formation ? Number(formation[1]) : null;
}

function explicitBoatNumbers(value, fieldName = "") {
  const out = new Set();
  const field = String(fieldName || "");
  const directNumberField = /(?:^|_)(?:boatNo|boat|waku|teiban|targetBoatNo|candidateBoatNo|headBoatNo|headBoat|firstBoatNo|winnerBoatNo)$/i.test(field) ||
    /^(?:boatNo|boat|waku|teiban|targetBoatNo|candidateBoatNo|headBoatNo|headBoat|firstBoatNo|winnerBoatNo)$/i.test(field);

  const visit = (node, parentField = field) => {
    if (node == null) return;
    if (typeof node === "number") {
      if (directNumberField || /candidates|boats|targets/i.test(parentField)) {
        const number = boatNumber(node);
        if (number) out.add(number);
      }
      return;
    }
    if (typeof node === "string") {
      for (const match of node.matchAll(/([1-6])号艇/g)) out.add(Number(match[1]));
      const head = exactTicketHead(node);
      if (head) out.add(head);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, parentField));
      return;
    }
    if (typeof node === "object") {
      for (const [childField, child] of Object.entries(node)) {
        const childDirect = /^(?:boatNo|boat|waku|teiban|targetBoatNo|candidateBoatNo|headBoatNo|headBoat|firstBoatNo|winnerBoatNo)$/i.test(childField);
        if (childDirect) {
          const number = boatNumber(child);
          if (number) out.add(number);
        }
        if (/ticket|combination|formation/i.test(childField)) {
          const head = exactTicketHead(child);
          if (head) out.add(head);
        }
        if (/candidates|boats|targets|boatNo|boat|waku|teiban/i.test(childField)) visit(child, childField);
      }
    }
  };

  visit(value, field);
  return [...out];
}

function resolveStage(pathText, inheritedStage = null) {
  const pathValue = String(pathText || "");
  if (/^verificationEvidence\.mainScenario(?:\.|$)/i.test(pathValue) || /^raceFlow\.scenario(?:\.|$)/i.test(pathValue)) {
    return "final";
  }
  if (/(?:^|\.)(?:practicalTickets|selectedCandidate|selectedTicket|adoptedTicket|bestCandidateTicket)(?:\.|\[|$)/i.test(pathValue)) {
    return "selected";
  }
  if (/(?:^|\.)(?:raceScenarios|mainScenario|alternateScenario|scenarioBranches|scenarioCandidates)(?:\.|\[|$)/i.test(pathValue)) {
    return "scenario";
  }
  if (/(?:candidate|targetDecisions|preservedEvaluationTargets|evaluatedScenarioCandidates|headCandidates|attackBoats)/i.test(pathValue)) {
    return "candidate";
  }
  return inheritedStage;
}

function emptyStage() {
  return {
    explicitHead: new Set(),
    headEligible: new Set(),
    support: new Set(),
    generic: new Set(),
    headPaths: [],
    supportPaths: [],
    reasonRows: []
  };
}

function addEvidence(target, kind, boat, pathText, detail = "") {
  const number = boatNumber(boat);
  if (!number || !target || !target[kind]) return;
  target[kind].add(number);
  if (kind === "explicitHead" || kind === "headEligible") {
    target.headPaths.push({ boatNo: number, path: pathText, detail: String(detail || "").slice(0, 160) });
  } else if (kind === "support") {
    target.supportPaths.push({ boatNo: number, path: pathText, detail: String(detail || "").slice(0, 160) });
  }
}

function inspectPrediction(prediction = {}) {
  const stages = {
    candidate: emptyStage(),
    scenario: emptyStage(),
    selected: emptyStage(),
    final: emptyStage()
  };

  const walk = (node, pathText = "", inheritedStage = null) => {
    if (node == null) return;
    const stage = resolveStage(pathText, inheritedStage);

    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${pathText}[${index}]`, stage));
      return;
    }
    if (typeof node !== "object") return;

    const target = stage ? stages[stage] : null;
    const objectBoat = objectBoatNo(node);
    const roleText = [
      node.role,
      node.roleIntent,
      node.type,
      ...(Array.isArray(node.roleIntents) ? node.roleIntents : [])
    ].filter(Boolean).join(" ");
    const eligiblePositions = arr(node.eligiblePositions).map(Number);
    const explicitHeadRole = /(?:^|[\s_-])(?:head|alternate-head)(?:$|[\s_-])|頭|1着/i.test(roleText);
    const eligibleForHead = eligiblePositions.includes(1) || Number(node.position) === 1 || Number(node.targetPosition) === 1;

    if (target && objectBoat) {
      if (explicitHeadRole) addEvidence(target, "explicitHead", objectBoat, pathText, roleText);
      else if (eligibleForHead) addEvidence(target, "headEligible", objectBoat, pathText, `eligiblePositions=${eligiblePositions.join(",")}`);
      else target.generic.add(objectBoat);
    }

    if (target && objectBoat) {
      const reason = [node.status, node.decision, node.reason, node.flowReason, node.rejectionReason, node.decisionReason]
        .filter(Boolean).map(String).join("・").slice(0, 220);
      if (reason) target.reasonRows.push({ boatNo: objectBoat, path: pathText, reason });
    }

    for (const [field, value] of Object.entries(node)) {
      const childPath = pathText ? `${pathText}.${field}` : field;
      const childStage = resolveStage(childPath, stage);
      const childTarget = childStage ? stages[childStage] : null;

      if (childTarget && /^(?:headBoatNo|headBoat|firstBoatNo|firstBoat|winnerBoatNo|winnerBoat|winner)$/i.test(field)) {
        const number = boatNumber(typeof value === "object" ? objectBoatNo(value) : value);
        if (number) addEvidence(childTarget, "explicitHead", number, childPath, field);
      }

      if (childTarget && /ticket|combination|formation/i.test(field)) {
        const head = exactTicketHead(value);
        if (head) addEvidence(childTarget, "explicitHead", head, childPath, String(value));
      }

      if (childTarget && /secondCandidates|thirdCandidates|hold|pickup|support|opponent/i.test(field)) {
        for (const number of explicitBoatNumbers(value, field)) {
          addEvidence(childTarget, "support", number, childPath, field);
        }
      }

      walk(value, childPath, childStage);
    }
  };

  walk(prediction, "", null);

  const replayScenarios = prediction?.practicalSelection?.frameRiseFallReplayBasis?.raceScenarios || {};
  const directHeads = {
    final: localWater.predictedHead({ prediction }),
    verification: boatNumber(prediction?.verificationEvidence?.mainScenario?.headBoatNo),
    raceFlow: boatNumber(prediction?.raceFlow?.scenario?.headBoatNo),
    aiCoreMain: boatNumber(prediction?.aiCore?.raceScenarios?.mainScenario?.headBoatNo),
    replayMain: boatNumber(replayScenarios?.mainScenario?.headBoatNo),
    replayAlternate: boatNumber(replayScenarios?.alternateScenario?.headBoatNo)
  };

  return { stages, directHeads };
}

function hasHead(stage, boat) {
  return Boolean(stage?.explicitHead?.has(boat) || stage?.headEligible?.has(boat));
}

function classifyTarget(record, result) {
  const actualHead = localWater.actualHead(result);
  const inspection = inspectPrediction(record?.prediction || {});
  const candidate = hasHead(inspection.stages.candidate, actualHead);
  const scenario = hasHead(inspection.stages.scenario, actualHead);
  const selected = hasHead(inspection.stages.selected, actualHead);
  const finalHead = inspection.directHeads.final;
  const finalCorrect = finalHead === actualHead;
  const supportOnly = ["candidate", "scenario", "selected"].some((name) =>
    inspection.stages[name].support.has(actualHead) || inspection.stages[name].generic.has(actualHead)
  );

  let classification = "no-saved-outer-head-evidence";
  if (finalCorrect) classification = "final-correct";
  else if (selected) classification = "selected-outer-head-not-final";
  else if (scenario) classification = "scenario-head-not-selected";
  else if (candidate) classification = "candidate-head-not-promoted";
  else if (supportOnly) classification = "support-only-not-head-eligible";

  return {
    date: record.date,
    jcd: String(record.jcd || "").padStart(2, "0"),
    raceNo: Number(record.raceNo || 0),
    actualHead,
    finalHead,
    candidate,
    scenario,
    selected,
    finalCorrect,
    finalAny56: finalHead === 5 || finalHead === 6,
    supportOnly,
    classification,
    directHeads: inspection.directHeads,
    actualHeadPaths: {
      candidate: inspection.stages.candidate.headPaths.filter((row) => row.boatNo === actualHead).slice(0, 8),
      scenario: inspection.stages.scenario.headPaths.filter((row) => row.boatNo === actualHead).slice(0, 8),
      selected: inspection.stages.selected.headPaths.filter((row) => row.boatNo === actualHead).slice(0, 8),
      support: ["candidate", "scenario", "selected"].flatMap((name) =>
        inspection.stages[name].supportPaths.filter((row) => row.boatNo === actualHead).map((row) => ({ ...row, stage: name }))
      ).slice(0, 12)
    },
    actualHeadReasons: ["candidate", "scenario", "selected"].flatMap((name) =>
      inspection.stages[name].reasonRows.filter((row) => row.boatNo === actualHead).map((row) => ({ ...row, stage: name }))
    ).slice(0, 12)
  };
}

function topCounts(rows, selector, limit = 20) {
  const counts = new Map();
  for (const row of rows) {
    for (const value of arr(selector(row))) {
      const text = String(value || "").trim();
      if (!text) continue;
      counts.set(text, (counts.get(text) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

function chooseNextStep(metrics) {
  if (metrics.actualHead56Count < 20) return "continue-collecting-evidence";
  if (metrics.candidateActualCoverageRate < 50) return "audit-local-water-outer-head-role-generation";
  if (metrics.candidateActualCoverageRate - metrics.scenarioActualCoverageRate >= 10) {
    return "audit-local-water-outer-head-scenario-promotion";
  }
  if (metrics.scenarioActualCoverageRate - metrics.selectedActualCoverageRate >= 10) {
    return "audit-local-water-outer-head-candidate-ranking";
  }
  if (metrics.scenarioActualCoverageRate - metrics.finalCorrectRate >= 10) {
    return "audit-local-water-main-head-ranking-and-handoff";
  }
  if (metrics.finalCorrectRate < 20) return "audit-local-water-outer-head-rank-order";
  return "continue-monitoring";
}

function build(predDocs, resultDocs) {
  const results = resultMap(resultDocs);
  const settledFormal = predictionRows(predDocs)
    .map((record) => ({ record, evidence: localWater.evidence(record), result: results.get(key(record)) || null }))
    .filter((row) => row.evidence.formal && row.result && localWater.actualHead(row.result));
  const targetRows = settledFormal
    .filter((row) => [5, 6].includes(localWater.actualHead(row.result)))
    .map((row) => classifyTarget(row.record, row.result));

  const count = (predicate) => targetRows.filter(predicate).length;
  const classifications = {};
  for (const row of targetRows) classifications[row.classification] = (classifications[row.classification] || 0) + 1;

  const metrics = {
    settledFormalEvidenceRaceCount: settledFormal.length,
    actualHead56Count: targetRows.length,
    actualHead5Count: count((row) => row.actualHead === 5),
    actualHead6Count: count((row) => row.actualHead === 6),
    candidateActualHeadCount: count((row) => row.candidate),
    scenarioActualHeadCount: count((row) => row.scenario),
    selectedActualHeadCount: count((row) => row.selected),
    finalAny56Count: count((row) => row.finalAny56),
    finalCorrectCount: count((row) => row.finalCorrect)
  };
  metrics.candidateActualCoverageRate = rate(metrics.candidateActualHeadCount, metrics.actualHead56Count);
  metrics.scenarioActualCoverageRate = rate(metrics.scenarioActualHeadCount, metrics.actualHead56Count);
  metrics.selectedActualCoverageRate = rate(metrics.selectedActualHeadCount, metrics.actualHead56Count);
  metrics.finalAny56Rate = rate(metrics.finalAny56Count, metrics.actualHead56Count);
  metrics.finalCorrectRate = rate(metrics.finalCorrectCount, metrics.actualHead56Count);

  const transitions = topCounts(targetRows, (row) => [
    `${row.directHeads.replayMain || 0}->${row.directHeads.verification || row.directHeads.final || 0}`,
    `${row.directHeads.aiCoreMain || 0}->${row.directHeads.verification || row.directHeads.final || 0}`
  ]);
  const headPaths = topCounts(targetRows, (row) => [
    ...row.actualHeadPaths.candidate.map((item) => `candidate:${item.path}`),
    ...row.actualHeadPaths.scenario.map((item) => `scenario:${item.path}`),
    ...row.actualHeadPaths.selected.map((item) => `selected:${item.path}`)
  ]);
  const supportPaths = topCounts(targetRows, (row) => row.actualHeadPaths.support.map((item) => `${item.stage}:${item.path}`));
  const reasons = topCounts(targetRows, (row) => row.actualHeadReasons.map((item) => `${item.stage}:${item.reason}`), 15);

  return {
    schemaVersion: 1,
    version: "local-water-main-head-selection-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "The same settled formal local-water cohort is traced with strict role semantics. A boat counts as a head only through an explicit head field, first-position ticket, head role, or eligible position 1; second/third/support mentions do not count as a head.",
    metrics,
    classifications,
    nextStep: chooseNextStep(metrics),
    topHeadEvidencePaths: headPaths,
    topSupportOnlyPaths: supportPaths,
    topDecisionReasons: reasons,
    topHeadTransitions: transitions,
    targetRaces: targetRows
  };
}

function main() {
  const report = build(
    load(path.join(root, "data", "predictions")),
    load(path.join(root, "data", "results"))
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ metrics: report.metrics, classifications: report.classifications, nextStep: report.nextStep }, null, 2));
}

if (require.main === module) main();
module.exports = {
  exactTicketHead,
  resolveStage,
  inspectPrediction,
  classifyTarget,
  chooseNextStep,
  build
};
