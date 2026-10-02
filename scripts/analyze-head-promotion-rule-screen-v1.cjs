'use strict';

const path = require('node:path');
const input = require('./analysis-input-contract');
const exp = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutFix = require('./analyze-ticket-expansion-payout-v2.cjs');
const comparison = require('./analyze-head-promotion-feature-comparison-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const FORBIDDEN_ROOTS = ['__officialResult', 'officialResult', 'result', 'results', 'settlement', 'payout'];
const Z_95 = 1.959963984540054;

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

function bestByPosition(pool, position, excluded) {
  const best = new Map();
  for (const candidate of pool) {
    const ticket = parts(candidate.ticket);
    if (ticket.length !== 3) continue;
    const boat = ticket[position];
    if (excluded.has(boat)) continue;
    const score = numeric(candidate.score);
    if (!Number.isFinite(score)) continue;
    const current = best.get(boat);
    if (!current || score > current.score) best.set(boat, { boat, score });
  }
  return [...best.values()].sort((left, right) => right.score - left.score || left.boat - right.boat);
}

function ticketsForHead(pool, headBoat, thirdCount) {
  const generated = new Set();
  const base = new Set(pool.slice(0, 7).map(candidate => candidate.ticket));
  const seconds = bestByPosition(pool, 1, new Set([headBoat])).slice(0, 1);
  for (const second of seconds) {
    const thirds = bestByPosition(pool, 2, new Set([headBoat, second.boat])).slice(0, thirdCount);
    for (const third of thirds) {
      const ticket = `${headBoat}-${second.boat}-${third.boat}`;
      if (!base.has(ticket)) generated.add(ticket);
    }
  }
  return [...generated];
}

function signalFlags(opportunity) {
  const features = opportunity.features || {};
  const averageSTStrong = Number.isFinite(features.avgSTGapToInside) && features.avgSTGapToInside <= -0.03;
  const currentSTStrong = Number.isFinite(features.currentSTGapToInside) && features.currentSTGapToInside <= -0.03;
  const displayTimeGapStrong = Number.isFinite(features.exhibitionTimeGapToInside) && features.exhibitionTimeGapToInside <= -0.03;
  const displayTimeRankStrong = Number.isFinite(features.exhibitionTimeRank) && features.exhibitionTimeRank <= 2;
  const displayStrong = displayTimeGapStrong || displayTimeRankStrong;
  return {
    averageSTStrong,
    currentSTStrong,
    displayTimeGapStrong,
    displayTimeRankStrong,
    displayStrong,
    stStrong: averageSTStrong || currentSTStrong,
    domainConfirmationCount: [averageSTStrong, currentSTStrong, displayStrong].filter(Boolean).length
  };
}

function enrichedOpportunity(opportunity) {
  return { ...opportunity, signals: signalFlags(opportunity) };
}

function repeatSupport(opportunity) {
  const features = opportunity.features || {};
  return features.supportScore >= 90 &&
    features.supportAppearances >= 7 &&
    !['third_only', 'second_only'].includes(opportunity.supportRole);
}

const CONFIGS = [
  {
    id: 'baseline_85',
    description: '3/4号艇・下位支持85点以上の全候補。比較基準。',
    predicate: () => true
  },
  {
    id: 'support_90',
    description: '下位支持90点以上。',
    predicate: opportunity => opportunity.features.supportScore >= 90
  },
  {
    id: 'repeat7_non_third_only',
    description: '支持90点以上・下位候補に7回以上出現・3着専用候補を除外。',
    predicate: repeatSupport
  },
  {
    id: 'avg_st_inside_003',
    description: '反復支持条件に加え、平均STが内艇より0.03以上速い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.averageSTStrong
  },
  {
    id: 'current_st_inside_003',
    description: '反復支持条件に加え、今節STが内艇より0.03以上速い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.currentSTStrong
  },
  {
    id: 'display_time_inside_003',
    description: '反復支持条件に加え、展示タイムが内艇より0.03秒以上速い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.displayTimeGapStrong
  },
  {
    id: 'display_time_rank_12',
    description: '反復支持条件に加え、展示タイム1～2位。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.displayTimeRankStrong
  },
  {
    id: 'display_domain_strong',
    description: '反復支持条件に加え、展示タイム差0.03秒以上または展示タイム1～2位。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.displayStrong
  },
  {
    id: 'one_strong_domain',
    description: '反復支持条件に加え、平均ST差・今節ST差・展示タイムのどれか1領域が強い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.domainConfirmationCount >= 1
  },
  {
    id: 'two_strong_domains',
    description: '反復支持条件に加え、平均ST差・今節ST差・展示タイムのうち2領域以上が強い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.domainConfirmationCount >= 2
  },
  {
    id: 'st_plus_display',
    description: '反復支持条件に加え、ST領域と展示タイム領域の両方が強い。',
    predicate: opportunity => repeatSupport(opportunity) && opportunity.signals.stStrong && opportunity.signals.displayStrong
  },
  {
    id: 'lane3_one_strong_domain',
    description: '3号艇に限定し、反復支持＋1領域以上の強い裏付け。',
    predicate: opportunity => opportunity.boat === 3 && repeatSupport(opportunity) && opportunity.signals.domainConfirmationCount >= 1
  },
  {
    id: 'lane4_one_strong_domain',
    description: '4号艇に限定し、反復支持＋1領域以上の強い裏付け。',
    predicate: opportunity => opportunity.boat === 4 && repeatSupport(opportunity) && opportunity.signals.domainConfirmationCount >= 1
  },
  {
    id: 'one_strong_domain_wind_le4',
    description: '1領域以上の強い裏付けがあり、風速5m以上を除外。風欠損は残す。',
    predicate: opportunity => {
      const wind = opportunity.features.windSpeed;
      return repeatSupport(opportunity) &&
        opportunity.signals.domainConfirmationCount >= 1 &&
        (!Number.isFinite(wind) || wind <= 4);
    }
  }
];

function rolePriority(role) {
  return ({ second_and_third_equal: 4, second_stronger: 3, third_stronger: 2, second_only: 1, third_only: 0 })[role] ?? -1;
}

function sortableNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function selectOneCandidate(opportunities, config) {
  return opportunities
    .filter(config.predicate)
    .sort((left, right) =>
      right.signals.domainConfirmationCount - left.signals.domainConfirmationCount ||
      right.features.supportAppearances - left.features.supportAppearances ||
      right.features.supportScore - left.features.supportScore ||
      rolePriority(right.supportRole) - rolePriority(left.supportRole) ||
      sortableNumber(left.features.exhibitionTimeRank, 99) - sortableNumber(right.features.exhibitionTimeRank, 99) ||
      sortableNumber(left.features.avgSTGapToInside, 99) - sortableNumber(right.features.avgSTGapToInside, 99) ||
      left.boat - right.boat)[0] || null;
}

function wilsonInterval(successes, total) {
  if (!total) return { lowPercent: 0, highPercent: 0 };
  const proportion = successes / total;
  const z2 = Z_95 ** 2;
  const denominator = 1 + z2 / total;
  const center = (proportion + z2 / (2 * total)) / denominator;
  const margin = Z_95 * Math.sqrt((proportion * (1 - proportion) / total) + (z2 / (4 * total ** 2))) / denominator;
  return {
    lowPercent: round(100 * Math.max(0, center - margin), 1),
    highPercent: round(100 * Math.min(1, center + margin), 1)
  };
}

function emptyTicketStats() {
  return { tickets: 0, hits: 0, investmentYen: 0, returnYen: 0, payoutHits: [] };
}

function finalizeTicketStats(stats) {
  const payouts = [...stats.payoutHits].sort((left, right) => right - left);
  const result = {
    tickets: stats.tickets,
    hits: stats.hits,
    ticketHitRatePercent: percent(stats.hits, stats.tickets),
    investmentYen: stats.investmentYen,
    returnYen: stats.returnYen,
    profitYen: stats.returnYen - stats.investmentYen,
    roiPercent: stats.investmentYen ? round((100 * stats.returnYen) / stats.investmentYen, 1) : 0
  };
  for (const count of [1, 2]) {
    const removedReturn = Math.max(0, stats.returnYen - payouts.slice(0, count).reduce((sum, value) => sum + value, 0));
    result[`max${count}PayoutRemoved`] = {
      returnYen: removedReturn,
      profitYen: removedReturn - stats.investmentYen,
      roiPercent: stats.investmentYen ? round((100 * removedReturn) / stats.investmentYen, 1) : 0
    };
  }
  return result;
}

function evaluateRows(preRows, labels, config, includedKeys) {
  const candidate = {
    availableRaceCount: 0,
    selectedRaceCount: 0,
    headHits: 0,
    selectedLane3: 0,
    selectedLane4: 0,
    completeSTExhibitionCount: 0,
    payoutCoveredSelectedRaceCount: 0
  };
  const ticketModes = { s1t1: emptyTicketStats(), s1t2: emptyTicketStats() };

  for (const row of preRows) {
    if (includedKeys && !includedKeys.has(row.raceKey)) continue;
    candidate.availableRaceCount += 1;
    const selected = selectOneCandidate(row.opportunities, config);
    if (!selected) continue;
    candidate.selectedRaceCount += 1;
    if (selected.boat === 3) candidate.selectedLane3 += 1;
    if (selected.boat === 4) candidate.selectedLane4 += 1;
    if (['avgST', 'currentST', 'exhibitionST', 'exhibitionTime'].every(key => Number.isFinite(selected.features[key]))) {
      candidate.completeSTExhibitionCount += 1;
    }

    const label = labels.get(row.raceKey) || {};
    const actual = label.actualTicket || '';
    if (parts(actual)[0] === selected.boat) candidate.headHits += 1;

    if (!Number.isFinite(label.payoutYen)) continue;
    candidate.payoutCoveredSelectedRaceCount += 1;

    for (const [mode, thirdCount] of [['s1t1', 1], ['s1t2', 2]]) {
      const tickets = ticketsForHead(row.pool, selected.boat, thirdCount);
      for (const ticket of tickets) {
        const stats = ticketModes[mode];
        stats.tickets += 1;
        stats.investmentYen += 100;
        if (ticket === actual && Number.isFinite(label.payoutYen)) {
          stats.hits += 1;
          stats.returnYen += label.payoutYen;
          stats.payoutHits.push(label.payoutYen);
        }
      }
    }
  }

  const headMisses = candidate.selectedRaceCount - candidate.headHits;
  return {
    candidates: {
      ...candidate,
      headMisses,
      selectionCoveragePercent: percent(candidate.selectedRaceCount, candidate.availableRaceCount),
      headHitRatePercent: percent(candidate.headHits, candidate.selectedRaceCount),
      payoutCoveragePercent: percent(candidate.payoutCoveredSelectedRaceCount, candidate.selectedRaceCount),
      headHitRateWilson95: wilsonInterval(candidate.headHits, candidate.selectedRaceCount)
    },
    tickets: {
      s1t1: finalizeTicketStats(ticketModes.s1t1),
      s1t2: finalizeTicketStats(ticketModes.s1t2)
    }
  };
}

function splitKeys(raceKeys) {
  const sorted = [...raceKeys].sort();
  const oneThird = Math.floor(sorted.length / 3);
  const twoThirds = Math.floor((2 * sorted.length) / 3);
  const third1 = new Set(sorted.slice(0, oneThird));
  const third2 = new Set(sorted.slice(oneThird, twoThirds));
  const third3 = new Set(sorted.slice(twoThirds));
  return {
    all: new Set(sorted),
    development: new Set(sorted.slice(0, twoThirds)),
    evaluation: new Set(sorted.slice(twoThirds)),
    third1,
    third2,
    third3,
    metadata: {
      uniqueRaceCount: sorted.length,
      developmentRaceCount: twoThirds,
      evaluationRaceCount: sorted.length - twoThirds,
      developmentFirstRaceKey: sorted[0] || null,
      developmentLastRaceKey: sorted[twoThirds - 1] || null,
      evaluationFirstRaceKey: sorted[twoThirds] || null,
      evaluationLastRaceKey: sorted.at(-1) || null
    }
  };
}

function addBaselineLift(configResults) {
  const baseline = configResults.baseline_85;
  for (const result of Object.values(configResults)) {
    for (const segment of ['all', 'development', 'evaluation', 'third1', 'third2', 'third3']) {
      const baseRate = baseline[segment].candidates.headHitRatePercent;
      const currentRate = result[segment].candidates.headHitRatePercent;
      result[segment].candidates.headHitLiftPointVsBaseline = round(currentRate - baseRate, 1);
    }
  }
}

function gateFor(result, baseline) {
  const evaluation = result.evaluation;
  const baselineEvaluation = baseline.evaluation;
  const sampleSufficient = evaluation.candidates.selectedRaceCount >= 40 && evaluation.candidates.headHits >= 4;
  const headLiftPositive = evaluation.candidates.headHitRatePercent >= baselineEvaluation.candidates.headHitRatePercent + 2;
  const roiPositive = evaluation.tickets.s1t1.roiPercent >= 100;
  const robustRoiPositive = evaluation.tickets.s1t1.max1PayoutRemoved.roiPercent >= 100;
  const bothLateThirdsPositive = result.third2.candidates.headHitLiftPointVsBaseline > 0 &&
    result.third3.candidates.headHitLiftPointVsBaseline > 0;
  const passed = sampleSufficient && headLiftPositive && roiPositive && robustRoiPositive && bothLateThirdsPositive;
  return {
    status: passed ? 'pass_for_next_research_only' : sampleSufficient ? 'not_passed' : 'insufficient_sample',
    sampleSufficient,
    headLiftPositive,
    roiPositive,
    robustRoiPositive,
    bothLateThirdsPositive,
    productionAdoptionAllowed: false
  };
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const preRows = [];
  const labels = new Map();

  for (const record of cohort.records) {
    const safeRecord = safePreResultRecord(record);
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    if (!raceKey) continue;
    const pool = exp.collectTicketPool(safeRecord).slice(0, 24);
    if (pool.length < 7) continue;
    const opportunities = comparison.promotionOpportunities(safeRecord).map(enrichedOpportunity);
    if (!opportunities.length) continue;
    preRows.push({ raceKey, pool, opportunities });
  }

  const payouts = payoutFix.payoutMap();
  for (const record of cohort.records) {
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    if (!raceKey) continue;
    labels.set(raceKey, {
      actualTicket: input.actualTicket(record.__officialResult),
      payoutYen: payouts.get(raceKey)
    });
  }

  const split = splitKeys(new Set(preRows.map(row => row.raceKey)));
  const configResults = {};
  for (const config of CONFIGS) {
    configResults[config.id] = {
      id: config.id,
      description: config.description,
      all: evaluateRows(preRows, labels, config, split.all),
      development: evaluateRows(preRows, labels, config, split.development),
      evaluation: evaluateRows(preRows, labels, config, split.evaluation),
      third1: evaluateRows(preRows, labels, config, split.third1),
      third2: evaluateRows(preRows, labels, config, split.third2),
      third3: evaluateRows(preRows, labels, config, split.third3)
    };
  }
  addBaselineLift(configResults);

  const baseline = configResults.baseline_85;
  const researchGates = Object.fromEntries(CONFIGS
    .filter(config => config.id !== 'baseline_85')
    .map(config => [config.id, gateFor(configResults[config.id], baseline)]));

  const passingConfigIds = Object.entries(researchGates)
    .filter(([, gate]) => gate.status === 'pass_for_next_research_only')
    .map(([id]) => id);
  const leakedKeys = Object.keys(configResults).filter(key => /result|settlement|payout/i.test(key));

  return {
    schemaVersion: 1,
    auditId: 'head-promotion-rule-screen-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    candidateSelectionUsesOfficialResult: false,
    ticketGenerationUsesOfficialResult: false,
    officialResultUsedOnlyForEvaluationLabelAndSettlement: true,
    configurationSource: 'Pre-registered theory-led screen based on the broad hit-vs-miss signals reported by head-promotion-feature-comparison-v1. No configuration is automatically adopted.',
    candidatePolicy: {
      oneCandidatePerRace: true,
      candidateLanes: [3, 4],
      baseOpportunity: 'Head absent from saved top24, present as second/third, saved support score >=85.',
      priority: ['strong-domain-count desc', 'support-appearances desc', 'support-score desc', 'support-role', 'exhibition-time-rank asc', 'average-ST-gap-to-inside asc', 'boat asc'],
      strongDomains: {
        averageST: 'candidate average ST at least 0.03 faster than inside boat',
        currentST: 'candidate current ST at least 0.03 faster than inside boat',
        displayTime: 'candidate exhibition time at least 0.03 seconds faster than inside boat OR exhibition-time rank 1-2'
      },
      motorExcludedFromPromotionGate: true,
      exhibitionSTExcludedFromPromotionGate: true
    },
    split: split.metadata,
    cohortDiagnostics: cohort.diagnostics,
    preResultOpportunityRaceCount: preRows.length,
    configCount: CONFIGS.length,
    configs: configResults,
    researchGates,
    passingConfigIds,
    invariants: {
      labelsAttachedAfterPreResultRowsBuilt: true,
      leakedConfigKeys: leakedKeys,
      allConfigsProductionAdoptionAllowedFalse: Object.values(researchGates).every(gate => gate.productionAdoptionAllowed === false),
      baselineAvailableRaceCountMatchesPreRows: baseline.all.candidates.availableRaceCount === preRows.length
    },
    policy: 'Research-only screen of pre-specified lane-3/4 head-promotion conditions. Candidate selection and ticket generation use saved pre-deadline data only. Official finish and payout are attached afterward solely for evaluation and settlement. Passing a research gate does not permit production adoption; explicit review, forward validation, and user approval remain required.'
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
module.exports = { build };
