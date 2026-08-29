"use strict";

const crypto = require("node:crypto");

const VERSION = "effective-score-weight-ab-v1";
const EPSILON = 1e-12;
const COMPONENT_ORDER = Object.freeze([
  "raceFlow",
  "courseIndex",
  "roleAttack",
  "st",
  "exhibition",
  "roleHold",
  "rolePickup",
  "local",
  "turn",
  "national",
  "motor"
]);
const RANKING_TIE_BREAK = Object.freeze([
  "total-desc",
  "roleAttack-desc",
  "boatNo-asc"
]);
const DIRECT_COEFFICIENT_ORDER = Object.freeze([
  "raceFlow",
  "courseIndex",
  "roleAttack",
  "st",
  "exhibition",
  "roleHold",
  "local",
  "rolePickup",
  "turn",
  "national",
  "motor"
]);
const DISCOVERY_TIE_BREAK = Object.freeze([
  "netTop1Wins-desc",
  "pairwiseFinishOrderConcordanceDelta-desc",
  "winnerTop3Delta-desc",
  "l1DistanceFromBaseline-asc",
  "candidateId-asc"
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nearlyEqual(left, right, epsilon = EPSILON) {
  return Math.abs(left - right) <= epsilon;
}

function round(value, digits = 1) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    assert(Number.isFinite(value), "fingerprint対象に有限でない数値があります");
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  const prototype = value && typeof value === "object"
    ? Object.getPrototypeOf(value)
    : undefined;
  assert(
    value && typeof value === "object" &&
      (prototype === Object.prototype || prototype === null),
    "fingerprint対象はJSON互換のplain objectである必要があります"
  );
  return Object.keys(value).sort().reduce((output, key) => {
    assert(value[key] !== undefined, `fingerprint対象の${key}がundefinedです`);
    output[key] = canonical(value[key]);
    return output;
  }, {});
}

function fingerprint(value) {
  const payload = JSON.stringify(canonical(value));
  return `sha256:${crypto.createHash("sha256").update(payload).digest("hex")}`;
}

function sameStringArray(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function assertWeights(profile, config, baseline = null) {
  const weights = profile?.weights;
  assert(weights && typeof weights === "object", `${profile?.id || "profile"}のweightsがありません`);
  const keys = Object.keys(weights).sort();
  const expectedKeys = [...COMPONENT_ORDER].sort();
  assert(sameStringArray(keys, expectedKeys), `${profile.id}のweight keyが11成分と一致しません`);

  COMPONENT_ORDER.forEach(key => {
    assert(
      typeof weights[key] === "number" && Number.isFinite(weights[key]),
      `${profile.id}.${key}は有限数である必要があります`
    );
    assert(weights[key] >= 0, `${profile.id}.${key}は0以上である必要があります`);
  });

  const sum = COMPONENT_ORDER.reduce((total, key) => total + weights[key], 0);
  assert(
    nearlyEqual(sum, Number(config.constraints.weightSum)),
    `${profile.id}のweight合計が${config.constraints.weightSum}ではありません`
  );
  assert(
    nearlyEqual(weights.exhibition, Number(config.constraints.exhibitionWeight)),
    `${profile.id}の展示weightが固定値と一致しません`
  );
  assert(
    weights.motor <= Number(config.constraints.motorWeightMaximum) + EPSILON,
    `${profile.id}のmotor weightが上限を超えています`
  );

  if (config.constraints.preserveDirectCoefficientOrder === true) {
    DIRECT_COEFFICIENT_ORDER.slice(0, -1).forEach((key, index) => {
      const nextKey = DIRECT_COEFFICIENT_ORDER[index + 1];
      assert(
        weights[key] > weights[nextKey] + EPSILON,
        `${profile.id}の直接係数順が${key}>${nextKey}ではありません`
      );
    });
  }

  if (!baseline || baseline === profile) return;
  COMPONENT_ORDER.forEach(key => {
    assert(
      Math.abs(weights[key] - baseline.weights[key]) <=
        Number(config.constraints.maximumAbsoluteChangeFromBaseline) + EPSILON,
      `${profile.id}.${key}のbaseline差が上限を超えています`
    );
  });

  if (config.constraints.preserveDirectCoefficientOrder === true) {
    COMPONENT_ORDER.forEach((left, leftIndex) => {
      COMPONENT_ORDER.slice(leftIndex + 1).forEach(right => {
        const baselineDifference = baseline.weights[left] - baseline.weights[right];
        const candidateDifference = weights[left] - weights[right];
        if (baselineDifference > EPSILON) {
          assert(
            candidateDifference >= -EPSILON,
            `${profile.id}が${left}と${right}の係数順を反転しています`
          );
        } else if (baselineDifference < -EPSILON) {
          assert(
            candidateDifference <= EPSILON,
            `${profile.id}が${left}と${right}の係数順を反転しています`
          );
        } else {
          assert(
            nearlyEqual(candidateDifference, 0),
            `${profile.id}がbaselineで同値の${left}と${right}を分離しています`
          );
        }
      });
    });
  }
}

function validateConfig(config = {}) {
  assert(config?.schemaVersion === 1, "effective score A/B config schemaVersionが不正です");
  assert(config?.experimentId === VERSION, "effective score A/B experimentIdが不正です");
  assert(config?.status === "preregistered-shadow-only", "A/B configは事前登録shadow-onlyである必要があります");
  assert(config?.target?.scope === "effective-final-eleven-coefficient-score", "A/B対象scopeが不正です");
  assert(
    sameStringArray(config?.target?.componentOrder, COMPONENT_ORDER),
    "A/B対象の11成分または順序が不正です"
  );
  assert(config?.target?.roundDigits === 1, "effective scoreは小数1桁丸めである必要があります");
  assert(config?.target?.minimumScore === 1, "effective score下限は1である必要があります");
  assert(config?.target?.maximumScore === 100, "effective score上限は100である必要があります");
  assert(
    sameStringArray(config?.target?.rankingTieBreak, RANKING_TIE_BREAK),
    "effective score順位tie-breakが不正です"
  );

  const constraints = config?.constraints || {};
  assert(constraints.allWeightsFinite === true, "有限weight制約が無効です");
  assert(constraints.allWeightsNonNegative === true, "非負weight制約が無効です");
  [
    "weightSum",
    "exhibitionWeight",
    "motorWeightMaximum",
    "maximumAbsoluteChangeFromBaseline"
  ].forEach(key => {
    assert(
      typeof constraints[key] === "number" && Number.isFinite(constraints[key]),
      `${key}制約は有限数である必要があります`
    );
  });
  assert(constraints.weightSum > 0, "weightSumは正である必要があります");
  assert(constraints.preserveDirectCoefficientOrder === true, "係数順保存制約が無効です");

  const profiles = config?.profiles;
  assert(Array.isArray(profiles) && profiles.length >= 2, "baselineと候補profileが必要です");
  const identifiers = profiles.map(profile => String(profile?.id || ""));
  assert(identifiers.every(Boolean), "profile idが欠落しています");
  assert(new Set(identifiers).size === identifiers.length, "profile idが重複しています");
  profiles.forEach(profile => {
    assert(
      profile?.kind === "baseline" || profile?.kind === "candidate",
      `${profile?.id || "profile"}のkindが不正です`
    );
    assert(String(profile?.hypothesis || "").trim(), `${profile.id}のhypothesisが欠落しています`);
  });
  const baselines = profiles.filter(profile => profile.kind === "baseline");
  assert(baselines.length === 1, "baseline profileは1件である必要があります");
  assert(profiles.some(profile => profile.kind === "candidate"), "candidate profileがありません");
  profiles.forEach(profile => assertWeights(profile, config, baselines[0]));

  const discovery = config?.discoverySelection || {};
  assert(discovery.selectAtMostOneCandidate === true, "discoveryは最大1候補に限定する必要があります");
  assert(
    sameStringArray(discovery.tieBreakOrder, DISCOVERY_TIE_BREAK),
    "discovery候補のtie-breakが不正です"
  );

  const discoveryDates = config?.cohort?.discoveryDates;
  const holdoutDates = config?.cohort?.holdoutDates;
  [discoveryDates, holdoutDates].forEach((dates, index) => {
    assert(Array.isArray(dates) && dates.length > 0, `${index ? "holdout" : "discovery"}日がありません`);
    assert(dates.every(date => /^\d{8}$/.test(date)), "cohort日付形式が不正です");
    assert(new Set(dates).size === dates.length, "cohort日付が重複しています");
    assert([...dates].sort().every((date, dateIndex) => date === dates[dateIndex]), "cohort日付は昇順である必要があります");
  });
  assert(
    discoveryDates.every(date => !holdoutDates.includes(date)),
    "discoveryとholdoutの日付が重複しています"
  );
  assert(
    discoveryDates.at(-1) < holdoutDates[0],
    "discoveryはholdoutより前の時系列期間である必要があります"
  );

  const safety = config?.safety || {};
  assert(safety.productionChanged === false, "productionChangedはfalseである必要があります");
  assert(safety.automaticApplication === false, "automaticApplicationはfalseである必要があります");
  assert(safety.usableForPrediction === false, "usableForPredictionはfalseである必要があります");
  assert(safety.runtimeImportAllowed === false, "runtimeImportAllowedはfalseである必要があります");
  assert(
    safety.downstreamScenarioMarksTicketsClaimAllowed === false,
    "downstream scenario・印・買い目の効果主張は禁止する必要があります"
  );
  assert(safety.finalHumanApprovalRequired === true, "最終human approvalを必須にする必要があります");
  assert(
    safety.productionApplicationRequiresSeparatePullRequest === true,
    "production適用は別PRである必要があります"
  );
  return config;
}

function profileById(config, profileId) {
  validateConfig(config);
  const profile = config.profiles.find(row => row.id === profileId);
  assert(profile, `profileが見つかりません: ${profileId}`);
  return profile;
}

function baselineProfile(config) {
  validateConfig(config);
  return config.profiles.find(profile => profile.kind === "baseline");
}

function resolveProfile(config, profileOrId) {
  if (typeof profileOrId === "string") return profileById(config, profileOrId);
  validateConfig(config);
  const id = String(profileOrId?.id || "");
  const profile = config.profiles.find(row => row.id === id);
  assert(profile === profileOrId || (profile && fingerprint(profile) === fingerprint(profileOrId)), `未登録profileです: ${id}`);
  return profile;
}

function finiteComponent(value, key, boatNo) {
  assert(
    typeof value === "number" && Number.isFinite(value),
    `${boatNo}号艇の${key}が有限数ではありません`
  );
  return value;
}

function componentsFromAnalysis(analysis = {}) {
  const boatNo = Number(analysis?.boatNo);
  assert(Number.isInteger(boatNo) && boatNo >= 1 && boatNo <= 6, "analysis.boatNoは1..6の整数である必要があります");
  const indexes = analysis?.indexes || {};
  const roleScores = analysis?.roleScores || {};
  return {
    raceFlow: finiteComponent(indexes.raceFlow, "raceFlow", boatNo),
    courseIndex: finiteComponent(
      analysis?.courseStructureTheory?.appliedIndex,
      "courseStructureTheory.appliedIndex",
      boatNo
    ),
    roleAttack: finiteComponent(roleScores.attack, "roleScores.attack", boatNo),
    st: finiteComponent(indexes.st, "st", boatNo),
    exhibition: finiteComponent(indexes.exhibition, "exhibition", boatNo),
    roleHold: finiteComponent(roleScores.hold, "roleScores.hold", boatNo),
    rolePickup: finiteComponent(roleScores.pickup, "roleScores.pickup", boatNo),
    local: finiteComponent(indexes.local, "local", boatNo),
    turn: finiteComponent(indexes.turn, "turn", boatNo),
    national: finiteComponent(indexes.national, "national", boatNo),
    motor: finiteComponent(indexes.motor, "motor", boatNo)
  };
}

function scoreAnalysis(analysis, profileOrId, config) {
  const profile = resolveProfile(config, profileOrId);
  const components = componentsFromAnalysis(analysis);
  const rawTotal = COMPONENT_ORDER.reduce(
    (total, key) => total + components[key] * profile.weights[key],
    0
  );
  const total = clamp(
    round(rawTotal, config.target.roundDigits),
    config.target.minimumScore,
    config.target.maximumScore
  );
  return {
    boatNo: Number(analysis.boatNo),
    profileId: profile.id,
    rawTotal,
    total,
    roleAttack: components.roleAttack,
    components
  };
}

function rankAnalyses(analyses, profileOrId, config) {
  assert(Array.isArray(analyses) && analyses.length === 6, "保存basisのanalysesは6艇exactである必要があります");
  const rows = analyses.map(analysis => scoreAnalysis(analysis, profileOrId, config));
  assert(new Set(rows.map(row => row.boatNo)).size === rows.length, "保存basisのboatNoが重複しています");
  assert(
    rows.map(row => row.boatNo).sort((left, right) => left - right)
      .every((boatNo, index) => boatNo === index + 1),
    "保存basisのboatNoは1..6を各1件含む必要があります"
  );
  return rows
    .sort((left, right) =>
      right.total - left.total ||
      right.roleAttack - left.roleAttack ||
      left.boatNo - right.boatNo
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

function normalizeFinishOrder(finishOrder) {
  if (!Array.isArray(finishOrder)) return [];
  const boats = finishOrder.map(Number);
  if (
    boats.length < 2 ||
    boats.some(boatNo => !Number.isInteger(boatNo) || boatNo < 1 || boatNo > 6) ||
    new Set(boats).size !== boats.length
  ) return [];
  return boats;
}

function finishOrderConcordance(ranking, finishOrder) {
  const official = normalizeFinishOrder(finishOrder);
  if (!official.length) return { concordant: 0, comparable: 0, rate: null };
  const predictedRank = new Map(ranking.map(row => [row.boatNo, row.rank]));
  let concordant = 0;
  let comparable = 0;
  for (let earlier = 0; earlier < official.length; earlier += 1) {
    for (let later = earlier + 1; later < official.length; later += 1) {
      if (!predictedRank.has(official[earlier]) || !predictedRank.has(official[later])) continue;
      comparable += 1;
      if (predictedRank.get(official[earlier]) < predictedRank.get(official[later])) concordant += 1;
    }
  }
  return {
    concordant,
    comparable,
    rate: comparable ? concordant / comparable : null
  };
}

function profileDistance(left, right) {
  return COMPONENT_ORDER.reduce(
    (distance, key) => distance + Math.abs(left.weights[key] - right.weights[key]),
    0
  );
}

function compactRanking(ranking) {
  return ranking.map(({ boatNo, total, roleAttack, rank }) => ({
    boatNo,
    total,
    roleAttack,
    rank
  }));
}

function compareRace(race = {}, candidateOrId, config) {
  validateConfig(config);
  const baseline = baselineProfile(config);
  const candidate = resolveProfile(config, candidateOrId);
  assert(candidate.kind === "candidate", "compareRaceのBはcandidate profileである必要があります");
  const analyses = race?.analyses;
  const winnerBoatNo = Number(race?.winnerBoatNo);
  assert(Number.isInteger(winnerBoatNo) && winnerBoatNo >= 1 && winnerBoatNo <= 6, "winnerBoatNoは1..6の整数である必要があります");

  const aRanking = rankAnalyses(analyses, baseline, config);
  const bRanking = rankAnalyses(analyses, candidate, config);
  const aWinnerRank = aRanking.find(row => row.boatNo === winnerBoatNo)?.rank;
  const bWinnerRank = bRanking.find(row => row.boatNo === winnerBoatNo)?.rank;
  assert(aWinnerRank && bWinnerRank, "winnerBoatNoが保存basisのanalysesにありません");
  const aPairwise = finishOrderConcordance(aRanking, race.finishOrder);
  const bPairwise = finishOrderConcordance(bRanking, race.finishOrder);
  const aTop1 = aWinnerRank === 1;
  const bTop1 = bWinnerRank === 1;

  return {
    raceKey: String(race?.raceKey || ""),
    date: String(race?.date || ""),
    selectedAt: String(race?.selectedAt || ""),
    candidateId: candidate.id,
    l1DistanceFromBaseline: profileDistance(baseline, candidate),
    winnerBoatNo,
    finishOrder: normalizeFinishOrder(race.finishOrder),
    top1Outcome: aTop1 && bTop1 ? "both" : aTop1 ? "a-only" : bTop1 ? "b-only" : "neither",
    a: {
      profileId: baseline.id,
      topBoatNo: aRanking[0].boatNo,
      top1Win: aTop1,
      winnerTop3: aWinnerRank <= 3,
      winnerRank: aWinnerRank,
      pairwiseFinishOrder: aPairwise,
      ranking: compactRanking(aRanking)
    },
    b: {
      profileId: candidate.id,
      topBoatNo: bRanking[0].boatNo,
      top1Win: bTop1,
      winnerTop3: bWinnerRank <= 3,
      winnerRank: bWinnerRank,
      pairwiseFinishOrder: bPairwise,
      ranking: compactRanking(bRanking)
    }
  };
}

function oneSidedExactBinomial(aOnly, bOnly) {
  assert(Number.isInteger(aOnly) && aOnly >= 0, "aOnlyは0以上の整数である必要があります");
  assert(Number.isInteger(bOnly) && bOnly >= 0, "bOnlyは0以上の整数である必要があります");
  const discordant = aOnly + bOnly;
  if (!discordant) return 1;

  // H0: discordant pairのA/B勝率は同じ。B-onlyが観測値以上となる厳密上側確率。
  let probability = 2 ** (-discordant);
  let tail = bOnly === 0 ? probability : 0;
  for (let successes = 1; successes <= discordant; successes += 1) {
    probability *= (discordant - successes + 1) / successes;
    if (successes >= bOnly) tail += probability;
  }
  return Math.min(1, Math.max(0, tail));
}

function chronologicalCompare(left, right) {
  return String(left?.date || "").localeCompare(String(right?.date || "")) ||
    String(left?.selectedAt || "").localeCompare(String(right?.selectedAt || "")) ||
    String(left?.raceKey || "").localeCompare(String(right?.raceKey || "")) ||
    String(left?.candidateId || "").localeCompare(String(right?.candidateId || ""));
}

function chronologicalHalves(rows = []) {
  const sorted = [...rows].sort(chronologicalCompare);
  const midpoint = Math.floor(sorted.length / 2);
  return [
    { period: "first-half", rows: sorted.slice(0, midpoint) },
    { period: "second-half", rows: sorted.slice(midpoint) }
  ];
}

function summarizeRows(rows) {
  const raceCount = rows.length;
  const bothTop1Wins = rows.filter(row => row.top1Outcome === "both").length;
  const aOnlyTop1Wins = rows.filter(row => row.top1Outcome === "a-only").length;
  const bOnlyTop1Wins = rows.filter(row => row.top1Outcome === "b-only").length;
  const neitherTop1Wins = rows.filter(row => row.top1Outcome === "neither").length;
  const aTop1Wins = bothTop1Wins + aOnlyTop1Wins;
  const bTop1Wins = bothTop1Wins + bOnlyTop1Wins;
  const aWinnerTop3 = rows.filter(row => row.a?.winnerTop3 === true).length;
  const bWinnerTop3 = rows.filter(row => row.b?.winnerTop3 === true).length;
  const aWinnerRankTotal = rows.reduce((sum, row) => sum + Number(row.a?.winnerRank || 0), 0);
  const bWinnerRankTotal = rows.reduce((sum, row) => sum + Number(row.b?.winnerRank || 0), 0);
  const aConcordant = rows.reduce((sum, row) => sum + Number(row.a?.pairwiseFinishOrder?.concordant || 0), 0);
  const bConcordant = rows.reduce((sum, row) => sum + Number(row.b?.pairwiseFinishOrder?.concordant || 0), 0);
  const aComparable = rows.reduce((sum, row) => sum + Number(row.a?.pairwiseFinishOrder?.comparable || 0), 0);
  const bComparable = rows.reduce((sum, row) => sum + Number(row.b?.pairwiseFinishOrder?.comparable || 0), 0);
  assert(aComparable === bComparable, "A/Bのfinish-order比較可能pair数が一致しません");
  const aPairwiseRate = aComparable ? aConcordant / aComparable : null;
  const bPairwiseRate = bComparable ? bConcordant / bComparable : null;
  return {
    raceCount,
    bothTop1Wins,
    aOnlyTop1Wins,
    bOnlyTop1Wins,
    neitherTop1Wins,
    aTop1Wins,
    bTop1Wins,
    netTop1Wins: bOnlyTop1Wins - aOnlyTop1Wins,
    oneSidedExactPValue: oneSidedExactBinomial(aOnlyTop1Wins, bOnlyTop1Wins),
    aWinnerTop3,
    bWinnerTop3,
    winnerTop3Delta: bWinnerTop3 - aWinnerTop3,
    aMeanWinnerRank: raceCount ? aWinnerRankTotal / raceCount : null,
    bMeanWinnerRank: raceCount ? bWinnerRankTotal / raceCount : null,
    meanWinnerRankDelta: raceCount ? (bWinnerRankTotal - aWinnerRankTotal) / raceCount : null,
    pairwiseFinishOrderComparable: aComparable,
    aPairwiseFinishOrderConcordant: aConcordant,
    bPairwiseFinishOrderConcordant: bConcordant,
    aPairwiseFinishOrderConcordance: aPairwiseRate,
    bPairwiseFinishOrderConcordance: bPairwiseRate,
    pairwiseFinishOrderConcordanceDelta:
      aPairwiseRate === null ? null : bPairwiseRate - aPairwiseRate,
    top1ChangedRaceCount: aOnlyTop1Wins + bOnlyTop1Wins,
    rankingChangedRaceCount: rows.filter(row =>
      JSON.stringify(row.a?.ranking?.map(item => item.boatNo) || []) !==
      JSON.stringify(row.b?.ranking?.map(item => item.boatNo) || [])
    ).length
  };
}

function summarizePaired(rows = []) {
  assert(Array.isArray(rows), "paired rowsは配列である必要があります");
  const candidateIds = [...new Set(rows.map(row => String(row?.candidateId || "")))];
  assert(candidateIds.length <= 1 && candidateIds.every(Boolean), "paired rowsのcandidateIdが不正です");
  const distances = [...new Set(rows.map(row => Number(row?.l1DistanceFromBaseline)))];
  assert(
    !rows.length || (distances.length === 1 && Number.isFinite(distances[0])),
    "paired rowsのbaseline距離が不正です"
  );
  const sorted = [...rows].sort(chronologicalCompare);
  const summary = {
    candidateId: candidateIds[0] || "",
    l1DistanceFromBaseline: distances[0] ?? null,
    ...summarizeRows(sorted)
  };
  summary.chronologicalHalves = chronologicalHalves(sorted).map(({ period, rows: halfRows }) => ({
    period,
    startRaceKey: halfRows[0]?.raceKey || "",
    endRaceKey: halfRows.at(-1)?.raceKey || "",
    ...summarizeRows(halfRows)
  }));
  return summary;
}

function discoveryEligibility(summary = {}, config = {}) {
  validateConfig(config);
  const policy = config.discoverySelection;
  const halves = Array.isArray(summary.chronologicalHalves) ? summary.chronologicalHalves : [];
  const checks = {
    nonEmptyCohort: Number(summary.raceCount || 0) > 0,
    positiveNetTop1Wins:
      policy.candidateMustHavePositiveNetTop1Wins !== true || Number(summary.netTop1Wins) > 0,
    winnerTop3NonDecrease:
      policy.winnerTop3CoverageMustNotDecrease !== true || Number(summary.winnerTop3Delta) >= 0,
    meanWinnerRankNonIncrease:
      policy.meanWinnerRankMustNotIncrease !== true || Number(summary.meanWinnerRankDelta) <= EPSILON,
    chronologicalHalvesPresent: halves.length === 2 && halves.every(half => Number(half.raceCount) > 0),
    chronologicalHalfNetMinimum:
      halves.length === 2 && halves.every(half =>
        Number(half.netTop1Wins) >= Number(policy.eachChronologicalHalfNetTop1WinsMinimum)
      )
  };
  return {
    eligible: Object.values(checks).every(Boolean),
    checks,
    reasons: Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name)
  };
}

function discoverySort(left, right) {
  const leftPairwise = left.summary.pairwiseFinishOrderConcordanceDelta;
  const rightPairwise = right.summary.pairwiseFinishOrderConcordanceDelta;
  return Number(right.summary.netTop1Wins) - Number(left.summary.netTop1Wins) ||
    (rightPairwise === null ? -Infinity : Number(rightPairwise)) -
      (leftPairwise === null ? -Infinity : Number(leftPairwise)) ||
    Number(right.summary.winnerTop3Delta) - Number(left.summary.winnerTop3Delta) ||
    Number(left.summary.l1DistanceFromBaseline) - Number(right.summary.l1DistanceFromBaseline) ||
    String(left.summary.candidateId).localeCompare(String(right.summary.candidateId));
}

function selectDiscoveryCandidate(summaries = [], config = {}) {
  validateConfig(config);
  assert(Array.isArray(summaries), "candidate summariesは配列である必要があります");
  const normalizedSummaries = summaries.map(entry => {
    const summary = entry?.summary && typeof entry.summary === "object"
      ? entry.summary
      : entry;
    const candidateId = String(entry?.candidateId || summary?.candidateId || "");
    assert(
      !summary?.candidateId || summary.candidateId === candidateId,
      "candidate wrapperとsummaryのcandidateIdが一致しません"
    );
    return { ...summary, candidateId };
  });
  const candidateIds = normalizedSummaries.map(summary => String(summary?.candidateId || ""));
  assert(candidateIds.every(Boolean), "candidate summaryのcandidateIdがありません");
  assert(new Set(candidateIds).size === candidateIds.length, "candidate summaryが重複しています");
  candidateIds.forEach(candidateId => {
    const profile = profileById(config, candidateId);
    assert(profile.kind === "candidate", `${candidateId}はcandidate profileではありません`);
  });
  const evaluations = normalizedSummaries.map(summary => ({
    candidateId: summary.candidateId,
    summary,
    ...discoveryEligibility(summary, config)
  }));
  const eligible = evaluations.filter(row => row.eligible).sort(discoverySort);
  const selected = eligible[0] || null;
  return {
    selectedCandidateId: selected?.candidateId || null,
    selectedCandidate: selected?.summary || null,
    eligibleCandidateIds: eligible.map(row => row.candidateId),
    evaluations
  };
}

function evaluateSealedHoldout(summary = {}, config = {}) {
  validateConfig(config);
  const policy = config.sealedHoldoutGate;
  const halves = Array.isArray(summary.chronologicalHalves) ? summary.chronologicalHalves : [];
  const checks = {
    nonEmptyCohort: Number(summary.raceCount || 0) > 0,
    bOnlyExceedsAOnly:
      policy.top1BOnlyMustExceedAOnly !== true ||
      Number(summary.bOnlyTop1Wins) > Number(summary.aOnlyTop1Wins),
    exactPValue:
      Number(summary.oneSidedExactPValue) <= Number(policy.maximumOneSidedExactPValue),
    chronologicalHalvesPresent: halves.length === 2 && halves.every(half => Number(half.raceCount) > 0),
    chronologicalHalfNetMinimum:
      halves.length === 2 && halves.every(half =>
        Number(half.netTop1Wins) >= Number(policy.eachChronologicalHalfNetTop1WinsMinimum)
      ),
    winnerTop3NonDecreaseOverallAndByHalf:
      policy.winnerTop3CoverageMustNotDecreaseOverallOrByHalf !== true ||
      (Number(summary.winnerTop3Delta) >= 0 && halves.every(half => Number(half.winnerTop3Delta) >= 0)),
    meanWinnerRankNonIncrease:
      policy.meanWinnerRankMustNotIncrease !== true || Number(summary.meanWinnerRankDelta) <= EPSILON
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    passed,
    decision: passed ? policy.maximumDecision : "holdout-gate-failed",
    checks,
    reasons: Object.entries(checks).filter(([, value]) => !value).map(([name]) => name)
  };
}

function configFingerprint(config) {
  validateConfig(config);
  return fingerprint(config);
}

function formulaFingerprint(config, profileOrId) {
  const profile = resolveProfile(config, profileOrId);
  return fingerprint({
    version: VERSION,
    componentOrder: config.target.componentOrder,
    roundDigits: config.target.roundDigits,
    minimumScore: config.target.minimumScore,
    maximumScore: config.target.maximumScore,
    rankingTieBreak: config.target.rankingTieBreak,
    profileId: profile.id,
    weights: profile.weights
  });
}

function cohortFingerprint(rows = []) {
  assert(Array.isArray(rows), "cohort rowsは配列である必要があります");
  return fingerprint([...rows].sort(chronologicalCompare));
}

module.exports = {
  VERSION,
  COMPONENT_ORDER,
  RANKING_TIE_BREAK,
  DIRECT_COEFFICIENT_ORDER,
  DISCOVERY_TIE_BREAK,
  canonical,
  fingerprint,
  configFingerprint,
  formulaFingerprint,
  cohortFingerprint,
  validateConfig,
  profileById,
  baselineProfile,
  componentsFromAnalysis,
  scoreAnalysis,
  rankAnalyses,
  finishOrderConcordance,
  profileDistance,
  compareRace,
  oneSidedExactBinomial,
  chronologicalHalves,
  summarizePaired,
  discoveryEligibility,
  selectDiscoveryCandidate,
  evaluateSealedHoldout
};
