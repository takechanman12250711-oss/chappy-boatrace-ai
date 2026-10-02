'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const exp = require('./analyze-ticket-expansion-7-12-18-24.cjs');

const ROOT = path.resolve(__dirname, '..');
const PROMOTION_LANES = new Set([3, 4]);
const MIN_SUPPORT_SCORE = 85;
const FORBIDDEN_ROOTS = ['__officialResult', 'officialResult', 'result', 'results', 'settlement', 'payout'];

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 4) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function percent(numerator, denominator) {
  return denominator ? round((100 * numerator) / denominator, 1) : 0;
}

function safePreResultRecord(record) {
  const safe = { ...record };
  for (const key of FORBIDDEN_ROOTS) delete safe[key];
  if (record?.prediction && typeof record.prediction === 'object') {
    safe.prediction = { ...record.prediction };
    for (const key of FORBIDDEN_ROOTS) delete safe.prediction[key];
  }
  return safe;
}

function predictionOf(record) {
  return record?.prediction || record || {};
}

function conditionsOf(record) {
  const prediction = predictionOf(record);
  return prediction?.preRaceConditions || record?.preRaceConditions || {};
}

function boatNumber(entry, index) {
  const candidates = [entry?.boatNo, entry?.boat, entry?.frameNo, entry?.number, entry?.course];
  for (const value of candidates) {
    const number = Number(value);
    if (Number.isInteger(number) && number >= 1 && number <= 6) return number;
  }
  return index + 1;
}

function boatEntries(record) {
  const conditions = conditionsOf(record);
  const raw = Array.isArray(conditions?.boats)
    ? conditions.boats
    : Array.isArray(conditions?.entries)
      ? conditions.entries
      : [];
  return raw.slice(0, 6).map((entry, index) => ({ ...entry, __boatNo: boatNumber(entry, index) }));
}

function byBoat(entries, boatNo) {
  return entries.find(entry => entry.__boatNo === boatNo) || entries[boatNo - 1] || null;
}

function finiteValues(entries, field) {
  return entries.map(entry => numeric(entry?.[field])).filter(Number.isFinite);
}

function rankAscending(value, values) {
  if (!Number.isFinite(value) || !values.length) return null;
  return 1 + values.filter(candidate => candidate < value).length;
}

function rankDescending(value, values) {
  if (!Number.isFinite(value) || !values.length) return null;
  return 1 + values.filter(candidate => candidate > value).length;
}

function difference(left, right) {
  return Number.isFinite(left) && Number.isFinite(right) ? round(left - right, 4) : null;
}

function minGap(value, values) {
  return Number.isFinite(value) && values.length ? round(value - Math.min(...values), 4) : null;
}

function supportCandidates(pool) {
  const heads = new Set(pool.map(candidate => parts(candidate.ticket)[0]).filter(Number.isInteger));
  const support = new Map();
  for (const candidate of pool) {
    const ticket = parts(candidate.ticket);
    if (ticket.length !== 3) continue;
    const score = numeric(candidate.score);
    if (!Number.isFinite(score)) continue;
    for (const position of [1, 2]) {
      const boat = ticket[position];
      if (!PROMOTION_LANES.has(boat) || heads.has(boat)) continue;
      const current = support.get(boat) || {
        boat,
        maxScore: null,
        maxSecondScore: null,
        maxThirdScore: null,
        appearances: 0
      };
      current.appearances += 1;
      if (!Number.isFinite(current.maxScore) || score > current.maxScore) current.maxScore = score;
      const key = position === 1 ? 'maxSecondScore' : 'maxThirdScore';
      if (!Number.isFinite(current[key]) || score > current[key]) current[key] = score;
      support.set(boat, current);
    }
  }
  return [...support.values()]
    .filter(candidate => candidate.maxScore >= MIN_SUPPORT_SCORE)
    .sort((left, right) => right.maxScore - left.maxScore || left.boat - right.boat);
}

function supportRole(candidate) {
  const second = candidate.maxSecondScore;
  const third = candidate.maxThirdScore;
  if (Number.isFinite(second) && Number.isFinite(third)) {
    if (second === third) return 'second_and_third_equal';
    return second > third ? 'second_stronger' : 'third_stronger';
  }
  if (Number.isFinite(second)) return 'second_only';
  if (Number.isFinite(third)) return 'third_only';
  return 'missing';
}

function promotionOpportunities(record) {
  const safeRecord = safePreResultRecord(record);
  const pool = exp.collectTicketPool(safeRecord).slice(0, 24);
  if (pool.length < 7) return [];

  const entries = boatEntries(safeRecord);
  if (entries.length < 6) return [];

  const prediction = predictionOf(safeRecord);
  const conditions = conditionsOf(safeRecord);
  const weather = conditions?.weather || {};
  const attackerBoatNo = numeric(prediction?.verificationEvidence?.mainScenario?.attackerBoatNo);
  const arrays = {
    avgST: finiteValues(entries, 'avgST'),
    currentST: finiteValues(entries, 'currentST'),
    exhibitionST: finiteValues(entries, 'exhibitionST'),
    exhibitionTime: finiteValues(entries, 'exhibitionTime'),
    motor2Rate: finiteValues(entries, 'motor2Rate'),
    motor3Rate: finiteValues(entries, 'motor3Rate')
  };

  return supportCandidates(pool).map(candidate => {
    const entry = byBoat(entries, candidate.boat);
    const inside = byBoat(entries, candidate.boat - 1);
    const values = {
      avgST: numeric(entry?.avgST),
      currentST: numeric(entry?.currentST),
      exhibitionST: numeric(entry?.exhibitionST),
      exhibitionTime: numeric(entry?.exhibitionTime),
      localStarts: numeric(entry?.localStarts),
      motor2Rate: numeric(entry?.motor2Rate),
      motor3Rate: numeric(entry?.motor3Rate)
    };
    const insideValues = {
      avgST: numeric(inside?.avgST),
      currentST: numeric(inside?.currentST),
      exhibitionST: numeric(inside?.exhibitionST),
      exhibitionTime: numeric(inside?.exhibitionTime)
    };

    return {
      raceKey: record.__analysisRaceKey || input.raceKey(record) || '',
      boat: candidate.boat,
      supportRole: supportRole(candidate),
      features: {
        supportScore: candidate.maxScore,
        supportSecondScore: candidate.maxSecondScore,
        supportThirdScore: candidate.maxThirdScore,
        supportAppearances: candidate.appearances,
        avgST: values.avgST,
        currentST: values.currentST,
        exhibitionST: values.exhibitionST,
        exhibitionTime: values.exhibitionTime,
        localStarts: values.localStarts,
        motor2Rate: values.motor2Rate,
        motor3Rate: values.motor3Rate,
        avgSTGapToInside: difference(values.avgST, insideValues.avgST),
        currentSTGapToInside: difference(values.currentST, insideValues.currentST),
        exhibitionSTGapToInside: difference(values.exhibitionST, insideValues.exhibitionST),
        exhibitionTimeGapToInside: difference(values.exhibitionTime, insideValues.exhibitionTime),
        currentSTGapToFieldBest: minGap(values.currentST, arrays.currentST),
        exhibitionSTGapToFieldBest: minGap(values.exhibitionST, arrays.exhibitionST),
        exhibitionTimeGapToFieldBest: minGap(values.exhibitionTime, arrays.exhibitionTime),
        avgSTRank: rankAscending(values.avgST, arrays.avgST),
        currentSTRank: rankAscending(values.currentST, arrays.currentST),
        exhibitionSTRank: rankAscending(values.exhibitionST, arrays.exhibitionST),
        exhibitionTimeRank: rankAscending(values.exhibitionTime, arrays.exhibitionTime),
        motor2Rank: rankDescending(values.motor2Rate, arrays.motor2Rate),
        motor3Rank: rankDescending(values.motor3Rate, arrays.motor3Rate),
        attackerMatch: Number.isFinite(attackerBoatNo) ? (attackerBoatNo === candidate.boat ? 1 : 0) : null,
        courseOfficial: entry?.courseOfficial === true ? 1 : entry?.courseOfficial === false ? 0 : null,
        windSpeed: numeric(weather?.windSpeed),
        waveHeight: numeric(weather?.waveHeight),
        windDirectionCode: numeric(weather?.windDirectionCode)
      }
    };
  });
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function sampleSd(values) {
  if (values.length < 2) return null;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
}

function quantile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function describe(values) {
  return {
    count: values.length,
    mean: round(mean(values), 4),
    median: round(quantile(values, 0.5), 4),
    q1: round(quantile(values, 0.25), 4),
    q3: round(quantile(values, 0.75), 4),
    sd: round(sampleSd(values), 4)
  };
}

function standardizedMeanDifference(hitValues, missValues) {
  if (hitValues.length < 2 || missValues.length < 2) return null;
  const hitSd = sampleSd(hitValues);
  const missSd = sampleSd(missValues);
  if (!Number.isFinite(hitSd) || !Number.isFinite(missSd)) return null;
  const pooledVariance = (((hitValues.length - 1) * hitSd ** 2) + ((missValues.length - 1) * missSd ** 2)) /
    (hitValues.length + missValues.length - 2);
  if (!(pooledVariance > 0)) return null;
  return round((mean(hitValues) - mean(missValues)) / Math.sqrt(pooledVariance), 4);
}

const NUMERIC_FEATURES = [
  ['supportScore', 'higher'],
  ['supportSecondScore', 'higher'],
  ['supportThirdScore', 'higher'],
  ['supportAppearances', 'higher'],
  ['avgST', 'lower'],
  ['currentST', 'lower'],
  ['exhibitionST', 'lower'],
  ['exhibitionTime', 'lower'],
  ['localStarts', 'higher'],
  ['motor2Rate', 'higher'],
  ['motor3Rate', 'higher'],
  ['avgSTGapToInside', 'lower'],
  ['currentSTGapToInside', 'lower'],
  ['exhibitionSTGapToInside', 'lower'],
  ['exhibitionTimeGapToInside', 'lower'],
  ['currentSTGapToFieldBest', 'lower'],
  ['exhibitionSTGapToFieldBest', 'lower'],
  ['exhibitionTimeGapToFieldBest', 'lower'],
  ['avgSTRank', 'lower'],
  ['currentSTRank', 'lower'],
  ['exhibitionSTRank', 'lower'],
  ['exhibitionTimeRank', 'lower'],
  ['motor2Rank', 'lower'],
  ['motor3Rank', 'lower'],
  ['attackerMatch', 'higher'],
  ['courseOfficial', 'higher'],
  ['windSpeed', 'neutral'],
  ['waveHeight', 'neutral'],
  ['windDirectionCode', 'neutral']
];

function numericComparison(rows, feature, preferredDirection) {
  const hits = rows.filter(row => row.hit).map(row => row.features[feature]).filter(Number.isFinite);
  const misses = rows.filter(row => !row.hit).map(row => row.features[feature]).filter(Number.isFinite);
  const hitMean = mean(hits);
  const missMean = mean(misses);
  const smd = standardizedMeanDifference(hits, misses);
  return {
    feature,
    preferredDirection,
    hit: describe(hits),
    miss: describe(misses),
    hitMeanMinusMissMean: Number.isFinite(hitMean) && Number.isFinite(missMean) ? round(hitMean - missMean, 4) : null,
    standardizedMeanDifference: smd,
    absoluteStandardizedDifference: Number.isFinite(smd) ? round(Math.abs(smd), 4) : null,
    hitMissingPercent: percent(rows.filter(row => row.hit && !Number.isFinite(row.features[feature])).length, rows.filter(row => row.hit).length),
    missMissingPercent: percent(rows.filter(row => !row.hit && !Number.isFinite(row.features[feature])).length, rows.filter(row => !row.hit).length)
  };
}

function groupSummary(rows, keyFunction) {
  const groups = new Map();
  const overallHitRate = rows.length ? rows.filter(row => row.hit).length / rows.length : 0;
  for (const row of rows) {
    const key = String(keyFunction(row) ?? 'missing');
    const group = groups.get(key) || { opportunities: 0, hits: 0 };
    group.opportunities += 1;
    if (row.hit) group.hits += 1;
    groups.set(key, group);
  }
  return Object.fromEntries([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, group]) => {
    const hitRate = group.opportunities ? group.hits / group.opportunities : 0;
    return [key, {
      ...group,
      misses: group.opportunities - group.hits,
      hitRatePercent: percent(group.hits, group.opportunities),
      hitRateLiftPointVsOverall: round(100 * (hitRate - overallHitRate), 1)
    }];
  }));
}

function gapBand(value) {
  if (!Number.isFinite(value)) return 'missing';
  if (value <= -0.03) return 'candidate_faster_by_0.03_or_more';
  if (value < 0) return 'candidate_slightly_faster';
  if (value < 0.03) return 'candidate_up_to_0.03_slower';
  return 'candidate_slower_by_0.03_or_more';
}

function rankBand(value) {
  if (!Number.isFinite(value)) return 'missing';
  if (value <= 2) return 'rank_1_2';
  if (value <= 4) return 'rank_3_4';
  return 'rank_5_6';
}

function windBand(value) {
  if (!Number.isFinite(value)) return 'missing';
  if (value <= 2) return '0_2m';
  if (value <= 4) return '3_4m';
  return '5m_plus';
}

function waveBand(value) {
  if (!Number.isFinite(value)) return 'missing';
  if (value <= 3) return '0_3cm';
  if (value <= 6) return '4_6cm';
  return '7cm_plus';
}

function chronologicalThirds(rows) {
  const sorted = [...rows].sort((left, right) => left.raceKey.localeCompare(right.raceKey) || left.boat - right.boat);
  const size = sorted.length;
  const cuts = [0, Math.floor(size / 3), Math.floor((2 * size) / 3), size];
  return [0, 1, 2].map(index => {
    const segment = sorted.slice(cuts[index], cuts[index + 1]);
    const hits = segment.filter(row => row.hit).length;
    return {
      segment: index + 1,
      opportunities: segment.length,
      hits,
      hitRatePercent: percent(hits, segment.length),
      firstRaceKey: segment[0]?.raceKey || null,
      lastRaceKey: segment.at(-1)?.raceKey || null
    };
  });
}

function compactExample(row) {
  return {
    raceKey: row.raceKey,
    boat: row.boat,
    supportRole: row.supportRole,
    supportScore: row.features.supportScore,
    currentSTGapToInside: row.features.currentSTGapToInside,
    exhibitionSTGapToInside: row.features.exhibitionSTGapToInside,
    exhibitionTimeRank: row.features.exhibitionTimeRank,
    attackerMatch: row.features.attackerMatch
  };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const rows = [];
  for (const record of cohort.records) {
    const opportunities = promotionOpportunities(record);
    const actual = input.actualTicket(record.__officialResult);
    const actualWinner = parts(actual)[0];
    for (const opportunity of opportunities) {
      rows.push({ ...opportunity, hit: opportunity.boat === actualWinner });
    }
  }

  const hitCount = rows.filter(row => row.hit).length;
  const missCount = rows.length - hitCount;
  const numericComparisons = NUMERIC_FEATURES.map(([feature, preferredDirection]) =>
    numericComparison(rows, feature, preferredDirection));
  const topNumericSignals = numericComparisons
    .filter(signal => signal.hit.count >= 20 && signal.miss.count >= 20 && Number.isFinite(signal.absoluteStandardizedDifference))
    .sort((left, right) => right.absoluteStandardizedDifference - left.absoluteStandardizedDifference || left.feature.localeCompare(right.feature))
    .slice(0, 15);

  const featureKeys = new Set(rows.flatMap(row => Object.keys(row.features)));
  const leakedFeatureKeys = [...featureKeys].filter(key => /result|settlement|payout/i.test(key));
  if (leakedFeatureKeys.length) throw new Error(`post-result feature leaked: ${leakedFeatureKeys.join(',')}`);

  return {
    schemaVersion: 1,
    auditId: 'head-promotion-feature-comparison-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    selectionUsesOfficialResult: false,
    officialResultUsedOnlyForLabel: true,
    selectionRule: {
      candidateLanes: [...PROMOTION_LANES],
      candidateHeadAbsentFromSavedTop24: true,
      candidateAppearsAsSecondOrThirdInSavedTop24: true,
      minimumSavedSupportScoreInclusive: MIN_SUPPORT_SCORE,
      resultIndependentCandidateSelection: true
    },
    cohortDiagnostics: cohort.diagnostics,
    overall: {
      opportunityCount: rows.length,
      uniqueRaceCount: new Set(rows.map(row => row.raceKey)).size,
      hitCount,
      missCount,
      hitRatePercent: percent(hitCount, rows.length),
      rowsWithCompleteCoreSTExhibition: rows.filter(row =>
        ['avgST', 'currentST', 'exhibitionST', 'exhibitionTime'].every(key => Number.isFinite(row.features[key]))).length
    },
    chronologicalThirds: chronologicalThirds(rows),
    categoricalComparisons: {
      lane: groupSummary(rows, row => `lane_${row.boat}`),
      laneAndAttacker: groupSummary(rows, row => `lane_${row.boat}__attacker_${row.features.attackerMatch}`),
      supportScoreBand: groupSummary(rows, row => row.features.supportScore >= 90 ? '90_plus' : '85_89.99'),
      supportRole: groupSummary(rows, row => row.supportRole),
      attackerMatch: groupSummary(rows, row => row.features.attackerMatch === 1 ? 'yes' : row.features.attackerMatch === 0 ? 'no' : 'missing'),
      avgSTGapToInside: groupSummary(rows, row => gapBand(row.features.avgSTGapToInside)),
      currentSTGapToInside: groupSummary(rows, row => gapBand(row.features.currentSTGapToInside)),
      exhibitionSTGapToInside: groupSummary(rows, row => gapBand(row.features.exhibitionSTGapToInside)),
      exhibitionTimeGapToInside: groupSummary(rows, row => gapBand(row.features.exhibitionTimeGapToInside)),
      currentSTRank: groupSummary(rows, row => rankBand(row.features.currentSTRank)),
      exhibitionSTRank: groupSummary(rows, row => rankBand(row.features.exhibitionSTRank)),
      exhibitionTimeRank: groupSummary(rows, row => rankBand(row.features.exhibitionTimeRank)),
      motor2Rank: groupSummary(rows, row => rankBand(row.features.motor2Rank)),
      windSpeed: groupSummary(rows, row => windBand(row.features.windSpeed)),
      waveHeight: groupSummary(rows, row => waveBand(row.features.waveHeight))
    },
    numericComparisons,
    topNumericSignals,
    examples: {
      hits: rows.filter(row => row.hit).slice(0, 10).map(compactExample),
      misses: rows.filter(row => !row.hit).slice(0, 10).map(compactExample)
    },
    invariants: {
      opportunityCountEqualsHitPlusMiss: rows.length === hitCount + missCount,
      leakedFeatureKeys,
      officialResultFeatureCount: 0
    },
    policy: 'Research-only hit-vs-miss comparison for result-independent lane-3/4 head-promotion opportunities. Candidate selection and every compared feature come from saved pre-deadline prediction data; the official result is used only after selection to label whether the promoted boat actually won. No production score, ticket, note, purchase, UI, or automatic adoption change.'
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
module.exports = { build, promotionOpportunities };
