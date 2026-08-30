"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "data", "stats", "local-water-outer-head-bottleneck-audit.json");
const UPSTREAM = path.join(ROOT, "data", "stats", "local-water-main-head-selection-audit.json");

const arr = (value) => Array.isArray(value) ? value : [];
const raceKey = (row = {}) => `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;

function loadDaily(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_error) {
    return fallback;
  }
}

function predictionRows(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const source of ["predictions", "verificationPredictions"]) {
      for (const row of arr(doc?.[source])) {
        const key = raceKey(row);
        if (source === "predictions" || !map.has(key)) map.set(key, row);
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
        map.set(raceKey(race), race);
      }
    }
  }
  return map;
}

function boatNo(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number : null;
}

function objectBoatNo(value = {}) {
  for (const field of [
    "boatNo", "boat", "number", "waku", "teiban",
    "targetBoatNo", "candidateBoatNo", "headBoatNo"
  ]) {
    const number = boatNo(value?.[field]);
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

function resolveStage(pathText, inherited = null) {
  const value = String(pathText || "");
  if (
    /^verificationEvidence\.mainScenario(?:\.|$)/i.test(value) ||
    /^raceFlow\.scenario(?:\.|$)/i.test(value)
  ) return "final";
  if (/(?:practicalTickets|selectedCandidate|selectedTicket|adoptedTicket|bestCandidateTicket)/i.test(value)) {
    return "selected";
  }
  if (/(?:raceScenarios|mainScenario|alternateScenario|scenarioBranches|scenarioCandidates)/i.test(value)) {
    return "scenario";
  }
  if (/(?:candidate|targetDecisions|preservedEvaluationTargets|evaluatedScenarioCandidates|headCandidates|attackBoats|boatEvaluation|evaluations|marks)/i.test(value)) {
    return "candidate";
  }
  return inherited;
}

function roleText(value = {}) {
  return [
    value.role,
    value.type,
    value.intent,
    value.category,
    value.status,
    ...arr(value.roleIntents),
    ...arr(value.roles)
  ].filter((item) => typeof item === "string").join(" ").toLowerCase();
}

function positions(value = {}) {
  return [
    ...arr(value.eligiblePositions),
    ...arr(value.positions),
    value.position,
    value.targetPosition
  ].map(Number).filter(Number.isFinite);
}

function reasonText(value = {}) {
  return [
    value.reason,
    value.flowReason,
    value.comment,
    value.shortComment,
    value.description,
    value.rejectionReason,
    value.exclusionReason
  ].filter(Boolean).map(String).join(" / ").trim();
}

function strongestScore(value = {}) {
  const fields = [
    "headScore", "score", "totalScore", "attackScore", "attack",
    "tenkai", "flowScore", "likelihood", "probability", "confidence"
  ];
  return fields
    .map((field) => ({ field, value: Number(value?.[field]) }))
    .filter((row) => Number.isFinite(row.value))
    .sort((a, b) => b.value - a.value)[0] || null;
}

function emptyStage() {
  return { head: new Set(), support: new Set(), headPaths: [], supportPaths: [] };
}

function collectWinnerEvidence(prediction, winner) {
  const stages = {
    candidate: emptyStage(),
    scenario: emptyStage(),
    selected: emptyStage(),
    final: emptyStage()
  };
  const blockers = new Set();
  const rows = [];

  function add(stageName, kind, value, pathText, detail = "") {
    const number = boatNo(value);
    const stage = stages[stageName];
    if (!stage || !number) return;
    stage[kind].add(number);
    stage[kind === "head" ? "headPaths" : "supportPaths"].push({
      path: pathText,
      boatNo: number,
      detail: String(detail || "").slice(0, 240)
    });
  }

  function inspectObject(node, pathText, stageName) {
    const number = objectBoatNo(node);
    if (number !== winner) return;

    const roles = roleText(node);
    const eligible = positions(node);
    const reason = reasonText(node);
    const score = strongestScore(node);
    const headRole = /(?:^|\s)(?:head|alternate-head|first|winner)(?:$|\s)/i.test(` ${roles} `);
    const supportRole = /(hold|pickup|support|second|third|相手|残し|拾い)/i.test(roles);
    const headEligible = eligible.includes(1);
    const rejected = node?.qualified === false || node?.isAdopted === false || node?.selected === false ||
      /(reject|excluded|skip|見送り|除外|非採用|不成立)/i.test(`${roles} ${reason}`);

    if (stageName && (headRole || headEligible)) add(stageName, "head", winner, pathText, reason || roles);
    else if (stageName && (supportRole || (eligible.length > 0 && !headEligible))) add(stageName, "support", winner, pathText, reason || roles);

    if (supportRole) blockers.add("support-role-only");
    if (eligible.length > 0 && !headEligible) blockers.add("position-1-not-eligible");
    if (roles && !headRole) blockers.add("role-intent-without-head");
    if (rejected) blockers.add("candidate-rejected-or-not-selected");
    if (!roles && eligible.length === 0) blockers.add("no-explicit-head-role-contract");

    rows.push({
      path: pathText,
      stage: stageName,
      roles,
      eligiblePositions: eligible,
      score,
      rejected,
      reason: reason.slice(0, 320)
    });
  }

  function visit(node, pathText = "", inheritedStage = null) {
    if (node == null) return;
    const stageName = resolveStage(pathText, inheritedStage);

    if (typeof node === "string") {
      const head = exactTicketHead(node);
      if (head && stageName) add(stageName, "head", head, pathText, node);
      return;
    }
    if (typeof node === "number") {
      if (stageName && /(?:second|third|hold|pickup|support)/i.test(pathText)) add(stageName, "support", node, pathText, "support-list");
      if (stageName && /(?:headCandidates|firstCandidates)/i.test(pathText)) add(stageName, "head", node, pathText, "head-list");
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${pathText}[${index}]`, stageName));
      return;
    }
    if (typeof node !== "object") return;

    inspectObject(node, pathText, stageName);

    for (const [field, child] of Object.entries(node)) {
      const childPath = pathText ? `${pathText}.${field}` : field;
      const childStage = resolveStage(childPath, stageName);
      if (/^(?:headBoatNo|headBoat|firstBoatNo|winnerBoatNo)$/i.test(field)) {
        add(childStage, "head", child, childPath, String(child));
      }
      if (/ticket|combination|formation/i.test(field)) {
        const head = exactTicketHead(child);
        if (head) add(childStage, "head", head, childPath, String(child));
      }
      if (/^(?:secondCandidates|thirdCandidates|holdBoats|pickupBoats|supportBoats)$/i.test(field)) {
        for (const item of arr(child)) {
          const supportBoat = boatNo(item) || objectBoatNo(item);
          if (supportBoat) add(childStage, "support", supportBoat, childPath, field);
        }
      }
      visit(child, childPath, childStage);
    }
  }

  visit(prediction || {});

  const finalHead = localWater.predictedHead({ prediction });
  const candidateHead = stages.candidate.head.has(winner);
  const scenarioHead = stages.scenario.head.has(winner);
  const selectedHead = stages.selected.head.has(winner);
  const supportVisible = ["candidate", "scenario", "selected"].some((name) => stages[name].support.has(winner));

  let classification = "no-saved-outer-head-evidence";
  if (finalHead === winner) classification = "final-correct";
  else if (selectedHead) classification = "selected-head-not-final";
  else if (scenarioHead) classification = "scenario-head-not-selected";
  else if (candidateHead) classification = "candidate-head-not-promoted";
  else if (supportVisible) classification = "support-only-not-head-eligible";

  if (!candidateHead && supportVisible) blockers.add("support-visible-but-no-head-role");
  if (candidateHead && !scenarioHead) blockers.add("head-candidate-not-promoted");
  if (scenarioHead && !selectedHead) blockers.add("head-scenario-not-selected");
  if (selectedHead && finalHead !== winner) blockers.add("selected-head-not-final-handoff");

  const score = rows.map((row) => row.score).filter(Boolean).sort((a, b) => b.value - a.value)[0] || null;
  const headPaths = [...new Set(Object.values(stages).flatMap((stage) => stage.headPaths).filter((row) => row.boatNo === winner).map((row) => row.path))];
  const supportPaths = [...new Set(["candidate", "scenario", "selected"].flatMap((name) => stages[name].supportPaths).filter((row) => row.boatNo === winner).map((row) => row.path))];

  return {
    classification,
    finalHead,
    candidateHead,
    scenarioHead,
    selectedHead,
    supportVisible,
    blockerFlags: [...blockers],
    strongestScore: score,
    roles: [...new Set(rows.flatMap((row) => row.roles ? row.roles.split(/\s+/) : []).filter(Boolean))].slice(0, 30),
    eligiblePositions: [...new Set(rows.flatMap((row) => row.eligiblePositions))].sort((a, b) => a - b),
    reasons: [...new Set(rows.map((row) => row.reason).filter(Boolean))].slice(0, 12),
    headPaths: headPaths.slice(0, 40),
    supportPaths: supportPaths.slice(0, 40)
  };
}

function conditionBand(evidence = {}) {
  const wind = Number(evidence.wind);
  const wave = Number(evidence.wave);
  if ((Number.isFinite(wind) && wind >= 5) || (Number.isFinite(wave) && wave >= 5)) return "strong";
  if ((Number.isFinite(wind) && wind >= 3) || (Number.isFinite(wave) && wave >= 3)) return "medium";
  return "calm";
}

function scoreBand(score) {
  if (!score || !Number.isFinite(Number(score.value))) return "unavailable";
  const value = Number(score.value);
  if (value >= 80) return "80plus";
  if (value >= 65) return "65to79";
  if (value >= 50) return "50to64";
  return "under50";
}

function increment(map, keyValue) {
  const key = String(keyValue || "unknown");
  map.set(key, (map.get(key) || 0) + 1);
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function chooseFocus(upstreamNextStep, classifications = {}) {
  const fixed = {
    "audit-local-water-outer-head-role-generation": "inspect-head-role-qualification-blockers",
    "audit-local-water-outer-head-scenario-promotion": "inspect-head-scenario-promotion-blockers",
    "audit-local-water-outer-head-candidate-ranking": "inspect-selected-head-ranking-blockers",
    "audit-local-water-main-head-ranking-and-handoff": "inspect-main-head-ranking-handoff",
    "audit-local-water-outer-head-rank-order": "inspect-outer-head-rank-order",
    "continue-collecting-evidence": "continue-collecting-evidence",
    "continue-monitoring": "continue-monitoring"
  };
  if (fixed[upstreamNextStep]) return fixed[upstreamNextStep];

  const fallback = [
    ["support-only-not-head-eligible", "inspect-head-role-qualification-blockers"],
    ["candidate-head-not-promoted", "inspect-head-scenario-promotion-blockers"],
    ["scenario-head-not-selected", "inspect-selected-head-ranking-blockers"],
    ["selected-head-not-final", "inspect-main-head-ranking-handoff"]
  ].sort((a, b) => Number(classifications[b[0]] || 0) - Number(classifications[a[0]] || 0));
  return Number(classifications[fallback[0][0]] || 0) > 0 ? fallback[0][1] : "continue-monitoring";
}

function build(predictionDocs, resultDocs, upstreamReport = null) {
  const results = resultMap(resultDocs);
  const classifications = new Map();
  const blockers = new Map();
  const byBoat = new Map();
  const byVenue = new Map();
  const byCondition = new Map();
  const finalHeads = new Map();
  const scoreBands = new Map();
  const headPaths = new Map();
  const supportPaths = new Map();
  const examples = [];

  const targetRows = predictionRows(predictionDocs)
    .map((record) => ({ record, evidence: localWater.evidence(record), result: results.get(raceKey(record)) || null }))
    .filter((row) => row.evidence.formal && row.result)
    .map((row) => ({ ...row, actualHead: localWater.actualHead(row.result) }))
    .filter((row) => row.actualHead === 5 || row.actualHead === 6);

  for (const row of targetRows) {
    const audit = collectWinnerEvidence(row.record.prediction || {}, row.actualHead);
    increment(classifications, audit.classification);
    increment(byBoat, row.actualHead);
    increment(byVenue, row.evidence.venue || row.record.jcd || "unknown");
    increment(byCondition, conditionBand(row.evidence));
    increment(finalHeads, audit.finalHead || "none");
    increment(scoreBands, scoreBand(audit.strongestScore));
    audit.blockerFlags.forEach((flag) => increment(blockers, flag));
    audit.headPaths.forEach((savedPath) => increment(headPaths, savedPath));
    audit.supportPaths.forEach((savedPath) => increment(supportPaths, savedPath));

    examples.push({
      date: row.record.date,
      jcd: String(row.record.jcd || "").padStart(2, "0"),
      raceNo: Number(row.record.raceNo || 0),
      venue: row.evidence.venue || "",
      wind: row.evidence.wind,
      wave: row.evidence.wave,
      conditionBand: conditionBand(row.evidence),
      actualHead: row.actualHead,
      finalHead: audit.finalHead,
      classification: audit.classification,
      candidateHead: audit.candidateHead,
      scenarioHead: audit.scenarioHead,
      selectedHead: audit.selectedHead,
      supportVisible: audit.supportVisible,
      strongestScore: audit.strongestScore,
      blockerFlags: audit.blockerFlags,
      roles: audit.roles,
      eligiblePositionsSeen: audit.eligiblePositions,
      reasons: audit.reasons,
      headPaths: audit.headPaths,
      supportPaths: audit.supportPaths
    });
  }

  const classificationObject = sortedObject(classifications);
  const upstreamNextStep = String(upstreamReport?.nextStep || "");
  return {
    schemaVersion: 1,
    version: "local-water-outer-head-bottleneck-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "締切前に保存済みの当地・水面正式証拠と公式結果だけを使い、実際に5・6号艇が勝ったレースを頭候補・頭シナリオ・選択済み頭・最終頭へ追跡する。2着・3着・hold・pickupは頭候補へ数えない。",
    actualHead56RaceCount: targetRows.length,
    upstream: upstreamReport ? {
      version: upstreamReport.version || null,
      nextStep: upstreamNextStep || null,
      metrics: upstreamReport.metrics || null,
      classifications: upstreamReport.classifications || null
    } : null,
    classifications: classificationObject,
    blockerSignals: sortedObject(blockers),
    strongestScoreBands: sortedObject(scoreBands),
    actualHeadByBoat: sortedObject(byBoat),
    actualHeadByVenue: sortedObject(byVenue),
    actualHeadByConditionBand: sortedObject(byCondition),
    selectedFinalHeadDistribution: sortedObject(finalHeads),
    topHeadEvidencePaths: [...headPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([savedPath, count]) => ({ path: savedPath, count })),
    topSupportEvidencePaths: [...supportPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([savedPath, count]) => ({ path: savedPath, count })),
    diagnosisFocus: chooseFocus(upstreamNextStep, classificationObject),
    examples: examples.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.jcd.localeCompare(b.jcd) || a.raceNo - b.raceNo).slice(-60)
  };
}

function main() {
  const report = build(
    loadDaily(path.join(ROOT, "data", "predictions")),
    loadDaily(path.join(ROOT, "data", "results")),
    readJson(UPSTREAM, null)
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    actualHead56RaceCount: report.actualHead56RaceCount,
    classifications: report.classifications,
    blockerSignals: report.blockerSignals,
    diagnosisFocus: report.diagnosisFocus
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  exactTicketHead,
  resolveStage,
  collectWinnerEvidence,
  conditionBand,
  scoreBand,
  chooseFocus,
  build
};
