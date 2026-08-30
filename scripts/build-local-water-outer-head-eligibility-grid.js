"use strict";

const fs = require("node:fs");
const path = require("node:path");
const localWater = require("./build-local-water-result-breakdown");
const bottleneck = require("./build-local-water-outer-head-bottleneck-audit");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "data", "stats", "local-water-outer-head-role-qualification-audit.json");
const OUTPUT = path.join(ROOT, "data", "stats", "local-water-outer-head-eligibility-grid.json");

const EXPECTED_SOURCE_STEP = "build-outer-head-eligibility-counterfactual-grid";
const MINIMUM_COHORT = 300;
const MINIMUM_ACTUAL_OUTER_HEAD = 30;
const MINIMUM_NEW_WINNER_CAPTURE = 5;
const MINIMUM_INCREMENTAL_COVERAGE_PT = 10;
const MAXIMUM_FALSE_PER_NEW_WINNER = 4;
const MAXIMUM_NEW_PROMOTION_RACE_RATE = 25;

const RULES = Object.freeze([
  { id: "current-explicit-head", order: 0, mode: "baseline" },
  { id: "support-score85", order: 10, mode: "support", scoreMinimum: 85 },
  { id: "support-score75", order: 11, mode: "support", scoreMinimum: 75 },
  { id: "support-score65", order: 12, mode: "support", scoreMinimum: 65 },
  { id: "attack-score85", order: 20, mode: "attack", scoreMinimum: 85 },
  { id: "attack-score75", order: 21, mode: "attack", scoreMinimum: 75 },
  { id: "attack-score65", order: 22, mode: "attack", scoreMinimum: 65 },
  { id: "mediumplus-support-score75", order: 30, mode: "support", scoreMinimum: 75, conditions: ["medium", "strong"] },
  { id: "strong-support-score65", order: 31, mode: "support", scoreMinimum: 65, conditions: ["strong"] },
  { id: "mediumplus-attack-score65", order: 40, mode: "attack", scoreMinimum: 65, conditions: ["medium", "strong"] },
  { id: "strong-attack-score65", order: 41, mode: "attack", scoreMinimum: 65, conditions: ["strong"] }
]);

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function raceKey(row = {}) {
  return `${row.date}-${String(row.jcd || "").padStart(2, "0")}-${Number(row.raceNo || 0)}`;
}

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

function round1(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function rate(count, total) {
  return total > 0 ? round1(Number(count || 0) / total * 100) : null;
}

function conditionBand(evidence = {}) {
  const wind = Number(evidence.wind);
  const wave = Number(evidence.wave);
  if ((Number.isFinite(wind) && wind >= 5) || (Number.isFinite(wave) && wave >= 5)) return "strong";
  if ((Number.isFinite(wind) && wind >= 3) || (Number.isFinite(wave) && wave >= 3)) return "medium";
  return "calm";
}

function targetSnapshot(prediction, targetBoatNo, evidence = {}) {
  const audit = bottleneck.collectWinnerEvidence(prediction || {}, targetBoatNo);
  const score = Number(audit.strongestScore?.value);
  const roleText = arr(audit.roles).map(String).join(" ").toLowerCase();
  const reasonText = arr(audit.reasons).map(String).join(" ").toLowerCase();
  const attackEvidence = /(?:attack|attacker|攻め|まくり|差し|カド)/i.test(`${roleText} ${reasonText}`);

  return {
    boatNo: targetBoatNo,
    explicitHead: audit.candidateHead === true,
    supportVisible: audit.supportVisible === true,
    attackEvidence,
    score: Number.isFinite(score) ? score : null,
    conditionBand: conditionBand(evidence),
    roles: arr(audit.roles),
    reasons: arr(audit.reasons),
    blockerFlags: arr(audit.blockerFlags)
  };
}

function ruleEligible(rule, snapshot) {
  if (snapshot.explicitHead) return true;
  if (rule.mode === "baseline") return false;
  if (arr(rule.conditions).length && !rule.conditions.includes(snapshot.conditionBand)) return false;
  if (!Number.isFinite(snapshot.score) || snapshot.score < rule.scoreMinimum) return false;
  if (rule.mode === "support") return snapshot.supportVisible;
  if (rule.mode === "attack") return snapshot.attackEvidence;
  return false;
}

function evaluateRule(rule, rows) {
  let eligibleCandidateCount = 0;
  let eligibleRaceCount = 0;
  let actualOuterWinnerCoveredCount = 0;
  let falseCandidateCount = 0;
  let newPromotedCandidateCount = 0;
  let newPromotionRaceCount = 0;
  let newWinnerCaptureCount = 0;
  let newFalsePromotionCandidateCount = 0;
  const byBoat = { "5": { actual: 0, covered: 0, newCovered: 0 }, "6": { actual: 0, covered: 0, newCovered: 0 } };
  const byConditionBand = {
    calm: { actual: 0, covered: 0, newCovered: 0 },
    medium: { actual: 0, covered: 0, newCovered: 0 },
    strong: { actual: 0, covered: 0, newCovered: 0 }
  };

  for (const row of rows) {
    let raceEligible = false;
    let raceNew = false;
    const actualOuter = row.actualHead === 5 || row.actualHead === 6;
    if (actualOuter) {
      byBoat[String(row.actualHead)].actual++;
      byConditionBand[row.conditionBand].actual++;
    }

    for (const snapshot of row.snapshots) {
      const baselineEligible = snapshot.explicitHead;
      const eligible = ruleEligible(rule, snapshot);
      const newlyPromoted = eligible && !baselineEligible;
      const correct = row.actualHead === snapshot.boatNo;

      if (eligible) {
        eligibleCandidateCount++;
        raceEligible = true;
        if (!correct) falseCandidateCount++;
      }
      if (newlyPromoted) {
        newPromotedCandidateCount++;
        raceNew = true;
        if (correct) newWinnerCaptureCount++;
        else newFalsePromotionCandidateCount++;
      }
    }

    if (raceEligible) eligibleRaceCount++;
    if (raceNew) newPromotionRaceCount++;

    if (actualOuter) {
      const winningSnapshot = row.snapshots.find((snapshot) => snapshot.boatNo === row.actualHead);
      const covered = winningSnapshot ? ruleEligible(rule, winningSnapshot) : false;
      if (covered) {
        actualOuterWinnerCoveredCount++;
        byBoat[String(row.actualHead)].covered++;
        byConditionBand[row.conditionBand].covered++;
      }
      if (covered && winningSnapshot && !winningSnapshot.explicitHead) {
        byBoat[String(row.actualHead)].newCovered++;
        byConditionBand[row.conditionBand].newCovered++;
      }
    }
  }

  const actualOuterHeadCount = rows.filter((row) => row.actualHead === 5 || row.actualHead === 6).length;
  const falsePerNewWinner = newWinnerCaptureCount > 0
    ? round1(newFalsePromotionCandidateCount / newWinnerCaptureCount)
    : null;

  return {
    ruleId: rule.id,
    order: rule.order,
    rule: {
      mode: rule.mode,
      scoreMinimum: rule.scoreMinimum ?? null,
      conditions: arr(rule.conditions)
    },
    eligibleCandidateCount,
    eligibleRaceCount,
    eligibleRaceRate: rate(eligibleRaceCount, rows.length),
    actualOuterWinnerCoveredCount,
    actualOuterWinnerCoverageRate: rate(actualOuterWinnerCoveredCount, actualOuterHeadCount),
    falseCandidateCount,
    candidatePrecision: rate(actualOuterWinnerCoveredCount, eligibleCandidateCount),
    newPromotedCandidateCount,
    newPromotionRaceCount,
    newPromotionRaceRate: rate(newPromotionRaceCount, rows.length),
    newWinnerCaptureCount,
    newFalsePromotionCandidateCount,
    falsePerNewWinner,
    byBoat,
    byConditionBand
  };
}

function qualifies(result, baseline, cohortCount, actualOuterHeadCount) {
  const incrementalCoveragePt = round1(
    Number(result.actualOuterWinnerCoverageRate || 0) -
    Number(baseline.actualOuterWinnerCoverageRate || 0)
  );
  const enoughData = cohortCount >= MINIMUM_COHORT && actualOuterHeadCount >= MINIMUM_ACTUAL_OUTER_HEAD;
  const enoughNewWinners = result.newWinnerCaptureCount >= MINIMUM_NEW_WINNER_CAPTURE;
  const enoughCoverage = incrementalCoveragePt >= MINIMUM_INCREMENTAL_COVERAGE_PT;
  const controlledFalsePromotions = result.falsePerNewWinner !== null &&
    result.falsePerNewWinner <= MAXIMUM_FALSE_PER_NEW_WINNER;
  const boundedRacePromotion = result.newPromotionRaceRate !== null &&
    result.newPromotionRaceRate <= MAXIMUM_NEW_PROMOTION_RACE_RATE;

  return {
    qualifies: enoughData && enoughNewWinners && enoughCoverage && controlledFalsePromotions && boundedRacePromotion,
    incrementalCoveragePt,
    checks: {
      enoughData,
      enoughNewWinners,
      enoughCoverage,
      controlledFalsePromotions,
      boundedRacePromotion
    }
  };
}

function selectRule(results, baseline, cohortCount, actualOuterHeadCount) {
  return results
    .filter((result) => result.ruleId !== "current-explicit-head")
    .map((result) => ({
      ...result,
      gate: qualifies(result, baseline, cohortCount, actualOuterHeadCount)
    }))
    .filter((result) => result.gate.qualifies)
    .sort((left, right) =>
      right.newWinnerCaptureCount - left.newWinnerCaptureCount ||
      left.falsePerNewWinner - right.falsePerNewWinner ||
      left.newPromotionRaceRate - right.newPromotionRaceRate ||
      left.order - right.order
    )[0] || null;
}

function build(predictionDocs, resultDocs, sourceReport = null) {
  const source = sourceReport && typeof sourceReport === "object" ? sourceReport : {};
  const applicable = source.nextStep === EXPECTED_SOURCE_STEP;
  const results = resultMap(resultDocs);

  const rows = predictionRows(predictionDocs)
    .map((record) => ({
      record,
      result: results.get(raceKey(record)) || null,
      evidence: localWater.evidence(record)
    }))
    .filter((row) => row.result && row.evidence.formal)
    .map((row) => {
      const actualHead = localWater.actualHead(row.result);
      const band = conditionBand(row.evidence);
      return {
        key: raceKey(row.record),
        actualHead,
        conditionBand: band,
        snapshots: [
          targetSnapshot(row.record.prediction || {}, 5, row.evidence),
          targetSnapshot(row.record.prediction || {}, 6, row.evidence)
        ]
      };
    })
    .filter((row) => Number.isInteger(row.actualHead));

  const actualOuterHeadCount = rows.filter((row) => row.actualHead === 5 || row.actualHead === 6).length;
  const ruleResults = RULES.map((rule) => evaluateRule(rule, rows));
  const baseline = ruleResults.find((result) => result.ruleId === "current-explicit-head");
  const evaluatedRules = ruleResults.map((result) => ({
    ...result,
    gate: result.ruleId === "current-explicit-head"
      ? { qualifies: false, incrementalCoveragePt: 0, checks: {} }
      : qualifies(result, baseline, rows.length, actualOuterHeadCount)
  }));
  const selected = applicable
    ? selectRule(evaluatedRules, baseline, rows.length, actualOuterHeadCount)
    : null;

  let nextStep = "follow-upstream-diagnosis-focus";
  let decisionReason = "上流の固定判定が反実仮想グリッドではないため適用しない。";
  if (applicable && (rows.length < MINIMUM_COHORT || actualOuterHeadCount < MINIMUM_ACTUAL_OUTER_HEAD)) {
    nextStep = "continue-collecting-outer-head-eligibility-evidence";
    decisionReason = `対象${rows.length}R・実5/6頭${actualOuterHeadCount}Rで、固定した最低件数に未到達。`;
  } else if (applicable && selected) {
    nextStep = "build-outer-head-eligibility-shadow-ab";
    decisionReason = `${selected.ruleId}が、新規勝ち艇被覆${selected.newWinnerCaptureCount}R、誤昇格/新規被覆${selected.falsePerNewWinner}、新規昇格レース率${selected.newPromotionRaceRate}%で全固定条件を満たした。`;
  } else if (applicable) {
    nextStep = "do-not-open-outer-head-eligibility-shadow-ab";
    decisionReason = "全候補ルールが、事前固定した被覆改善・誤昇格・昇格範囲のいずれかを満たさなかった。";
  }

  return {
    schemaVersion: 1,
    version: "local-water-outer-head-eligibility-grid-v1",
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    usesOdds: false,
    methodology: "締切前保存済みの当地・水面正式証拠だけを使い、現在の明示的頭資格に、相手役または攻め根拠と保存済み評価点を組み合わせた候補ルールを反実仮想比較する。実際の結果は評価にのみ使用し、条件作成には使用しない。",
    sourceVersion: source.version || null,
    sourceNextStep: source.nextStep || null,
    expectedSourceNextStep: EXPECTED_SOURCE_STEP,
    applicable,
    cohortCount: rows.length,
    actualOuterHeadCount,
    gates: {
      minimumCohort: MINIMUM_COHORT,
      minimumActualOuterHead: MINIMUM_ACTUAL_OUTER_HEAD,
      minimumNewWinnerCapture: MINIMUM_NEW_WINNER_CAPTURE,
      minimumIncrementalCoveragePt: MINIMUM_INCREMENTAL_COVERAGE_PT,
      maximumFalsePerNewWinner: MAXIMUM_FALSE_PER_NEW_WINNER,
      maximumNewPromotionRaceRate: MAXIMUM_NEW_PROMOTION_RACE_RATE,
      selectionOrder: [
        "newWinnerCaptureCount desc",
        "falsePerNewWinner asc",
        "newPromotionRaceRate asc",
        "pre-registered rule order asc"
      ]
    },
    rules: RULES,
    baseline,
    results: evaluatedRules,
    selectedRule: selected ? {
      ruleId: selected.ruleId,
      rule: selected.rule,
      newWinnerCaptureCount: selected.newWinnerCaptureCount,
      incrementalCoveragePt: selected.gate.incrementalCoveragePt,
      newFalsePromotionCandidateCount: selected.newFalsePromotionCandidateCount,
      falsePerNewWinner: selected.falsePerNewWinner,
      newPromotionRaceCount: selected.newPromotionRaceCount,
      newPromotionRaceRate: selected.newPromotionRaceRate,
      gate: selected.gate
    } : null,
    nextStep,
    decisionReason
  };
}

function main() {
  const report = build(
    loadDaily(path.join(ROOT, "data", "predictions")),
    loadDaily(path.join(ROOT, "data", "results")),
    readJson(SOURCE, null)
  );
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    applicable: report.applicable,
    cohortCount: report.cohortCount,
    actualOuterHeadCount: report.actualOuterHeadCount,
    baseline: report.baseline,
    selectedRule: report.selectedRule,
    nextStep: report.nextStep
  }, null, 2));
}

if (require.main === module) main();
module.exports = {
  RULES,
  conditionBand,
  targetSnapshot,
  ruleEligible,
  evaluateRule,
  qualifies,
  selectRule,
  build
};
