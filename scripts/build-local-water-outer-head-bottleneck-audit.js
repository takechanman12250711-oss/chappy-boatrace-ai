"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");

const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-outer-head-bottleneck-audit.json");
const UPSTREAM = path.join(root, "data", "stats", "local-water-main-head-selection-audit.json");

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

function boatNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 6 ? number : null;
}

function objectBoatNo(value = {}) {
  for (const field of [
    "boatNo", "boat", "number", "waku", "teiban",
    "targetBoatNo", "candidateBoatNo", "headBoatNo"
  ]) {
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

function resolveStage(pathText, inheritedStage = null) {
  const value = String(pathText || "");
  if (
    /^verificationEvidence\.mainScenario(?:\.|$)/i.test(value) ||
    /^raceFlow\.scenario(?:\.|$)/i.test(value)
  ) return "final";
  if (/(?:^|\.)(?:practicalTickets|selectedCandidate|selectedTicket|adoptedTicket|bestCandidateTicket)(?:\.|\[|$)/i.test(value)) {
    return "selected";
  }
  if (/(?:^|\.)(?:raceScenarios|mainScenario|alternateScenario|scenarioBranches|scenarioCandidates)(?:\.|\[|$)/i.test(value)) {
    return "scenario";
  }
  if (/(?:candidate|targetDecisions|preservedEvaluationTargets|evaluatedScenarioCandidates|headCandidates|attackBoats|boatEvaluation|evaluations|marks)(?:\.|\[|$)/i.test(value)) {
    return "candidate";
  }
  return inheritedStage;
}

function emptyStage() {
  return {
    head: new Set(),
    support: new Set(),
    headPaths: [],
    supportPaths: []
  };
}

function addStageEvidence(stage, kind, boatNo, pathText, detail = "") {
  const boat = boatNumber(boatNo);
  if (!stage || !boat || !stage[kind]) return;
  stage[kind].add(boat);
  const target = kind === "head" ? stage.headPaths : stage.supportPaths;
  target.push({ path: pathText, boatNo: boat, detail: String(detail || "").slice(0, 240) });
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

function positionValues(value = {}) {
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

function numericScore(value = {}) {
  const fields = [
    "headScore", "score", "totalScore", "attackScore", "attack",
    "tenkai", "flowScore", "likelihood", "probability", "confidence"
  ];
  const scores = [];
  for (const field of fields) {
    const number = Number(value?.[field]);
    if (Number.isFinite(number)) scores.push({ field, value: number });
  }
  return scores.sort((a, b) => b.value - a.value)[0] || null;
}

function explicitHeadFromField(field, value) {
  if (/^(?:headBoatNo|headBoat|firstBoatNo|winnerBoatNo)$/i.test(field)) {
    return boatNumber(value);
  }
  if (/ticket|combination|formation/i.test(field)) return exactTicketHead(value);
  return null;
}

function collectWinnerEvidence(prediction, winner) {
  const stages = {
    candidate: emptyStage(),
    scenario: emptyStage(),
    selected: emptyStage(),
    final: emptyStage()
  };
  const winnerRows = [];
  const blockerFlags = new Set();

  function recordRow(node, pathText, stage) {
    const targetBoat = objectBoatNo(node);
    if (targetBoat !== winner) return;

    const roles = roleText(node);
    const positions = positionValues(node);
    const reason = reasonText(node);
    const score = numericScore(node);
    const isHeadRole = /(?:^|\s)(?:head|alternate-head|first|winner)(?:$|\s)/i.test(` ${roles} `);
    const isSupportRole = /(hold|pickup|support|second|third|相手|残し|拾い)/i.test(roles);
    const headEligible = positions.includes(1);
    const rejected = node?.qualified === false || node?.isAdopted === false || node?.selected === false ||
      /(reject|excluded|skip|見送り|除外|非採用|不成立)/i.test(`${roles} ${reason}`);

    if (stage && (isHeadRole || headEligible)) {
      addStageEvidence(stages[stage], "head", winner, pathText, reason || roles);
    } else if (stage && (isSupportRole || (positions.length > 0 && !positions.includes(1)))) {
      addStageEvidence(stages[stage], "support", winner, pathText, reason || roles);
    }

    if (isSupportRole) blockerFlags.add("support-role-only");
    if (positions.length > 0 && !positions.includes(1)) blockerFlags.add("position-1-not-eligible");
    if (roles && !isHeadRole) blockerFlags.add("role-intent-without-head");
    if (rejected) blockerFlags.add("candidate-rejected-or-not-selected");
    if (!roles && positions.length === 0) blockerFlags.add("no-explicit-head-role-contract");

    winnerRows.push({
      path: pathText,
      stage,
      roles,
      positions,
      score,
      rejected,
      reason: reason.slice(0, 320)
    });
  }

  function visit(node, pathText = "", inheritedStage = null) {
    if (node == null) return;
    const stage = resolveStage(pathText, inheritedStage);

    if (typeof node === "string") {
      const head = exactTicketHead(node);
      if (head && stage) addStageEvidence(stages[stage], "head", head, pathText, node);
      return;
    }
    if (typeof node === "number") {
      if (/(?:second|third|hold|pickup|support)/i.test(pathText) && stage) {
        addStageEvidence(stages[stage], "support", node, pathText, "support-list");
      }
      if (/(?:headCandidates|firstCandidates)/i.test(pathText) && stage) {
        addStageEvidence(stages[stage], "head", node, pathText, "head-list");
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${pathText}[${index}]`, stage));
      return;
    }
    if (typeof node !== "object") return;

    recordRow(node, pathText, stage);

    for (const [field, child] of Object.entries(node)) {
      const childPath = pathText ? `${pathText}.${field}` : field;
      const childStage = resolveStage(childPath, stage);
      const explicitHead = explicitHeadFromField(field, child);
      if (explicitHead && childStage) {
        addStageEvidence(stages[childStage], "head", explicitHead, childPath, String(child));
      }
      if (/^(?:secondCandidates|thirdCandidates|holdBoats|pickupBoats|supportBoats)$/i.test(field)) {
        for (const item of arr(child)) {
          const supportBoat = boatNumber(item) || objectBoatNo(item);
          if (supportBoat && childStage) addStageEvidence(stages[childStage], "support", supportBoat, childPath, field);
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
  const supportOnly = ["candidate", "scenario", "selected"].some((name) => stages[name].support.has(winner));

  let classification;
  if (finalHead === winner) classification = "final-correct";
  else if (selectedHead) classification = "selected-head-not-final";
  else if (scenarioHead) classification = "scenario-head-not-selected";
  else if (candidateHead) classification = "candidate-head-not-promoted";
  else if (supportOnly) classification = "support-only-not-head-eligible";
  else classification = "no-saved-outer-head-evidence";

  if (!candidateHead && supportOnly) blockerFlags.add("support-visible-but-no-head-role");
  if (candidateHead && !scenarioHead) blockerFlags.add("head-candidate-not-promoted");
  if (scenarioHead && !selectedHead) blockerFlags.add("head-scenario-not-selected");
  if (selectedHead && finalHead !== winner) blockerFlags.add("selected-head-not-final-handoff");

  const strongestScore = winnerRows
    .map((row) => row.score)
    .filter(Boolean)
    .sort((a, b) => b.value - a.value)[0] || null;

  return {
    classification,
    finalHead,
    candidateHead,
    scenarioHead,
    selectedHead,
    supportOnly,
    blockerFlags: [...blockerFlags],
    strongestScore,
    roles: [...new Set(winnerRows.flatMap((row) => row.roles ? row.roles.split(/\s+/) : []).filter(Boolean))].slice(0, 30),
    positions: [...new Set(winnerRows.flatMap((row) => row.positions))].sort((a, b) => a - b),
    reasons: [...new Set(winnerRows.map((row) => row.reason).filter(Boolean))].slice(0, 12),
    headPaths: [...new Set([
      ...stages.candidate.headPaths,
      ...stages.scenario.headPaths,
      ...stages.selected.headPaths,
      ...stages.final.headPaths
    ].filter((row) => row.boatNo === winner).map((row) => row.path))].slice(0, 40),
    supportPaths: [...new Set([
      ...stages.candidate.supportPaths,
      ...stages.scenario.supportPaths,
      ...stages.selected.supportPaths
    ].filter((row) => row.boatNo === winner).map((row) => row.path))].slice(0, 40)
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

function increment(map, keyValue, amount = 1) {
  const target = String(keyValue || "unknown");
  map.set(target, (map.get(target) || 0) + amount);
}

function mapObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function chooseFocus(upstreamNextStep, classifications = {}) {
  const mapping = {
    "audit-local-water-outer-head-role-generation": "inspect-head-role-qualification-blockers",
    "audit-local-water-outer-head-scenario-promotion": "inspect-head-scenario-promotion-blockers",
    "audit-local-water-outer-head-candidate-ranking": "inspect-selected-head-ranking-blockers",
    "audit-local-water-main-head-ranking-and-handoff": "inspect-main-head-ranking-handoff",
    "audit-local-water-outer-head-rank-order": "inspect-outer-head-rank-order",
    "continue-collecting-evidence": "continue-collecting-evidence",
    "continue-monitoring": "continue-monitoring"
  };
  if (mapping[upstreamNextStep]) return mapping[upstreamNextStep];
  const ordered = [
    ["support-only-not-head-eligible", "inspect-head-role-qualification-blockers"],
    ["candidate-head-not-promoted", "inspect-head-scenario-promotion-blockers"],
    ["scenario-head-not-selected", "inspect-selected-head-ranking-blockers"],
    ["selected-head-not-final", "inspect-main-head-ranking-handoff"]
  ].sort((a, b) => Number(classifications[b[0]] || 0) - Number(classifications[a[0]] || 0));
  return Number(classifications[ordered[0][0]] || 0) > 0 ? ordered[0][1] : "continue-monitoring";
}

function build(predictionDocs, resultDocs, upstreamReport = null) {
  const results = resultMap(resultDocs);
  const classifications = new Map();
  const blockers = new Map();
  const byBoat = new Map();
  const byVenue = new Map();
  const byCondition = new Map();
  const finalHeadCounts = new Map();
  const scoreBands = new Map();
  const headPathCounts = new Map();
  const supportPathCounts = new Map();
  const examples = [];

  const rows = predictionRows(predictionDocs)
    .map((record) => ({
      record,
      evidence: localWater.evidence(record),
      result: results.get(key(record)) || null
    }))
    .filter((row) => row.evidence.formal && row.result)
    .map((row) => ({ ...row, actualHead: localWater.actualHead(row.result) }))
    .filter((row) => row.actualHead === 5 || row.actualHead === 6);

  for (const row of rows) {
    const audit = collectWinnerEvidence(row.record.prediction || {}, row.actualHead);
    increment(classifications, audit.classification);
    increment(byBoat, row.actualHead);
    increment(byVenue, row.evidence.venue || String(row.record.jcd || "unknown"));
    increment(byCondition, conditionBand(row.evidence));
    increment(finalHeadCounts, audit.finalHead || "none");
    increment(scoreBands, scoreBand(audit.strongestScore));
    audit.blockerFlags.forEach((flag) => increment(blockers, flag));
    audit.headPaths.forEach((savedPath) => increment(headPathCounts, savedPath));
    audit.supportPaths.forEach((savedPath) => increment(supportPathCounts, savedPath));

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
      supportOnly: audit.supportOnly,
      strongestScore: audit.strongestScore,
      blockerFlags: audit.blockerFlags,
      roles: audit.roles,
      eligiblePositionsSeen: audit.positions,
      reasons: audit.reasons,
      headPaths: audit.headPaths,
      supportPaths: audit.supportPaths
    });
  }

  const classificationObject = mapObject(classifications);
  const upstreamNextStep = String(upstreamReport?.nextStep || "");

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-bottleneck-audit-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    methodology: "締切前に保存済みの当地・水面正式証拠と公式結果だけを使い、実際に5・6号艇が勝ったレースを頭候補・頭シナリオ・選択済み頭・最終頭へ厳密に追跡する。2着・3着・hold・pickupは頭候補へ数えない。",
    actualHead56RaceCount: rows.length,
    upstream: upstreamReport ? {
      version: upstreamReport.version || null,
      nextStep: upstreamNextStep || null,
      metrics: upstreamReport.metrics || null,
      classifications: upstreamReport.classifications || null
    } : null,
    classifications: classificationObject,
    blockerSignals: mapObject(blockers),
    strongestScoreBands: mapObject(scoreBands),
    actualHeadByBoat: mapObject(byBoat),
    actualHeadByVenue: mapObject(byVenue),
    actualHeadByConditionBand: mapObject(byCondition),
    selectedFinalHeadDistribution: mapObject(finalHeadCounts),
    topHeadEvidencePaths: [...headPathCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([savedPath, count]) => ({ path: savedPath, count })),
    topSupportEvidencePaths: [...supportPathCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([savedPath, count]) => ({ path: savedPath, count })),
    diagnosisFocus: chooseFocus(upstreamNextStep, classificationObject),
    examples: examples.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.jcd.localeCompare(b.jcd) || a.raceNo - b.raceNo).slice(-60)
  };
}

function main() {
  const report = build(
    load(path.join(root, "data", "predictions")),
    load(path.join(root, "data", "results")),
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
