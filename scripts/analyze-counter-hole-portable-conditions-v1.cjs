'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const input = require('./analysis-input-contract');
const expansion = require('./analyze-ticket-expansion-7-12-18-24.cjs');
const payoutAudit = require('./analyze-ticket-expansion-payout-v2.cjs');
const structured = require('./analyze-structured-formation-backtest-v1.cjs');
const marginal = require('./analyze-formation-marginal-roi-v1.cjs');
const attribution = require('./analyze-rescue-scenario-attribution-v1.cjs');

const ROOT = path.resolve(__dirname, '..');
const STAKE = 100;
const BASE_LIMIT = 7;
const POOL_LIMIT = 24;

function pct(numerator, denominator) {
  return denominator ? Number((100 * numerator / denominator).toFixed(1)) : 0;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (!text) return null;
  const front = /^F\s*([0-9.]+)/i.exec(text);
  if (front) return -Number(front[1]);
  const late = /^L\s*([0-9.]+)/i.exec(text);
  if (late) return Number(late[1]);
  const parsed = Number(text.replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parts(ticket) {
  return String(ticket || '').split('-').map(Number);
}

function readObjectLiteral(source, marker) {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error(`marker not found: ${marker}`);
  const start = source.indexOf('{', markerIndex + marker.length);
  if (start < 0) throw new Error(`object start not found: ${marker}`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated object: ${marker}`);
}

function loadVenueFeatures() {
  const source = fs.readFileSync(path.join(ROOT, 'js', 'ai-core.js'), 'utf8');
  const literal = readObjectLiteral(source, 'const VENUE_FEATURES =');
  const value = vm.runInNewContext(`(${literal})`, Object.create(null), { timeout: 1000 });
  if (!value || typeof value !== 'object') throw new Error('VENUE_FEATURES is not an object');
  return value;
}

function boatNo(entry, fallback = 0) {
  if (!entry || typeof entry !== 'object') return fallback;
  const values = [
    entry.boatNo, entry.boat, entry.waku, entry.course, entry.cource,
    entry.lane, entry.frame, entry.number, entry.teiban,
    entry.raw?.boatNo, entry.raw?.boat, entry.raw?.waku, entry.raw?.course
  ];
  for (const value of values) {
    const match = String(value ?? '').match(/[1-6]/);
    if (match) return Number(match[0]);
  }
  return fallback;
}

function firstNumber(object, keys) {
  if (!object || typeof object !== 'object') return null;
  const sources = [
    object,
    object.raw,
    object.beforeInfo,
    object.startExhibition,
    object.exhibition,
    object.metrics,
    object.scores,
    object.components,
    object.analysis,
    object.evaluation
  ].filter(value => value && typeof value === 'object');
  for (const source of sources) {
    for (const key of keys) {
      const value = numeric(source[key]);
      if (value !== null) return value;
    }
  }
  return null;
}

function predictionAnalyses(record) {
  const prediction = record?.prediction || record || {};
  const candidates = [
    prediction.analyses,
    prediction.analysis,
    prediction.boatAnalyses,
    prediction.boatAnalysis,
    prediction.ai?.analyses,
    prediction.aiResult?.analyses,
    prediction.aiEvaluation?.boats,
    prediction.aiEvaluation?.analyses,
    record?.analyses,
    record?.boatAnalyses
  ];
  return candidates.find(Array.isArray) || [];
}

function analysisForBoat(record, targetBoat) {
  return predictionAnalyses(record).find((item, index) => boatNo(item, index + 1) === targetBoat) || null;
}

function snapshot(record) {
  const frozen = input.referenceTagInput(record, { strictFrozenInputs: true });
  const entries = Array.isArray(frozen?.entries) ? frozen.entries : [];
  return {
    entries,
    byBoat: new Map(entries.map((entry, index) => [boatNo(entry, index + 1), entry])),
    weather: frozen?.weather && typeof frozen.weather === 'object' ? frozen.weather : {}
  };
}

function weatherNumber(weather, keys) {
  const sources = [weather, weather?.condition, weather?.raceCondition].filter(Boolean);
  for (const source of sources) {
    for (const key of keys) {
      const value = numeric(source?.[key]);
      if (value !== null && value >= 0) return value;
    }
  }
  return null;
}

function scoreBand(score) {
  const value = numeric(score);
  if (value === null) return 'unknown';
  if (value >= 98) return '98-100';
  if (value >= 95) return '95-97';
  if (value >= 90) return '90-94';
  return '85-89';
}

function rankBand(rank) {
  return Number(rank) <= 9 ? '8-9' : '10-12';
}

function scoreGapBand(gap) {
  if (gap === null) return 'unknown';
  if (gap >= 10) return '+10_or_more';
  if (gap >= 5) return '+5_to_9.9';
  if (gap >= 0) return '0_to_4.9';
  if (gap >= -5) return '-0.1_to_-5';
  return 'below_-5';
}

function edgeBand(edge, strong = 0.05, slight = 0.01) {
  if (edge === null) return 'unknown';
  if (edge >= strong) return 'selected_better_strong';
  if (edge >= slight) return 'selected_better_slight';
  if (edge > -slight) return 'near_equal';
  if (edge > -strong) return 'selected_worse_slight';
  return 'selected_worse_strong';
}

function componentEdgeBand(edge) {
  if (edge === null) return 'unknown';
  if (edge >= 5) return 'selected_better_5plus';
  if (edge > 0) return 'selected_better_under5';
  if (edge === 0) return 'equal';
  if (edge > -5) return 'selected_worse_under5';
  return 'selected_worse_5plus';
}

function strengthBand(value, high = 70, medium = 55) {
  if (!Number.isFinite(Number(value))) return 'unknown';
  const number = Number(value);
  return number >= high ? 'high' : number >= medium ? 'medium' : 'low';
}

function windBand(value) {
  if (value === null) return 'unknown';
  return value >= 6 ? 'strong' : value >= 3 ? 'moderate' : 'calm';
}

function waveBand(value) {
  if (value === null) return 'unknown';
  return value >= 8 ? 'high' : value >= 4 ? 'moderate' : 'low';
}

function actualWaterBand(wind, wave) {
  if (wind === null && wave === null) return 'unknown';
  if ((wind !== null && wind >= 6) || (wave !== null && wave >= 8)) return 'rough';
  if ((wind === null || wind <= 3) && (wave === null || wave <= 3)) return 'calm';
  return 'moderate';
}

function mainAndCandidateSignals(record, mainHead, candidateHead, frozen) {
  const mainEntry = frozen.byBoat.get(mainHead) || null;
  const candidateEntry = frozen.byBoat.get(candidateHead) || null;
  const mainAnalysis = analysisForBoat(record, mainHead);
  const candidateAnalysis = analysisForBoat(record, candidateHead);

  const mainSt = firstNumber(mainEntry, [
    'exhibitionSt', 'exhibitionST', 'displaySt', 'displayST', 'tenjiSt',
    'st', 'startTime', 'averageStart', 'averageST', 'avgSt', 'avgST'
  ]);
  const candidateSt = firstNumber(candidateEntry, [
    'exhibitionSt', 'exhibitionST', 'displaySt', 'displayST', 'tenjiSt',
    'st', 'startTime', 'averageStart', 'averageST', 'avgSt', 'avgST'
  ]);
  const mainExhibition = firstNumber(mainEntry, ['exhibitionTime', 'displayTime', 'tenjiTime', 'time']);
  const candidateExhibition = firstNumber(candidateEntry, ['exhibitionTime', 'displayTime', 'tenjiTime', 'time']);
  const mainLap = firstNumber(mainEntry, ['lapTime', 'oneLapTime', 'roundTime']);
  const candidateLap = firstNumber(candidateEntry, ['lapTime', 'oneLapTime', 'roundTime']);
  const mainAttack = firstNumber(mainAnalysis || mainEntry, ['roleAttack', 'attack', 'attackScore', 'attackPower']);
  const candidateAttack = firstNumber(candidateAnalysis || candidateEntry, ['roleAttack', 'attack', 'attackScore', 'attackPower']);
  const mainFlow = firstNumber(mainAnalysis || mainEntry, ['raceFlow', 'tenkai', 'flow', 'raceFlowScore']);
  const candidateFlow = firstNumber(candidateAnalysis || candidateEntry, ['raceFlow', 'tenkai', 'flow', 'raceFlowScore']);

  return {
    stEdge: mainSt !== null && candidateSt !== null ? Number((mainSt - candidateSt).toFixed(3)) : null,
    exhibitionEdge: mainExhibition !== null && candidateExhibition !== null
      ? Number((mainExhibition - candidateExhibition).toFixed(3))
      : null,
    lapEdge: mainLap !== null && candidateLap !== null ? Number((mainLap - candidateLap).toFixed(3)) : null,
    attackEdge: mainAttack !== null && candidateAttack !== null
      ? Number((candidateAttack - mainAttack).toFixed(3))
      : null,
    raceFlowEdge: mainFlow !== null && candidateFlow !== null
      ? Number((candidateFlow - mainFlow).toFixed(3))
      : null
  };
}

function chronologicalFoldMap(records) {
  const keys = [...new Set(records.map(record => record.__analysisRaceKey || input.raceKey(record)).filter(Boolean))].sort();
  return new Map(keys.map((key, index) => [key, Math.min(4, Math.floor(index * 4 / Math.max(1, keys.length)) + 1)]));
}

function emptyAccumulator() {
  return {
    rows: [],
    races: new Set(),
    venues: new Set(),
    payouts: [],
    folds: new Map(),
    venuesMetrics: new Map()
  };
}

function addToAccumulator(accumulator, row) {
  accumulator.rows.push(row);
  accumulator.races.add(row.raceKey);
  accumulator.venues.add(row.jcd);
  if (row.rescued) accumulator.payouts.push(row.payoutYen);
  const fold = accumulator.folds.get(row.fold) || { tickets: 0, rescues: 0, returnYen: 0 };
  fold.tickets += 1;
  if (row.rescued) {
    fold.rescues += 1;
    fold.returnYen += row.payoutYen;
  }
  accumulator.folds.set(row.fold, fold);
  const venue = accumulator.venuesMetrics.get(row.jcd) || { tickets: 0, rescues: 0, returnYen: 0 };
  venue.tickets += 1;
  if (row.rescued) {
    venue.rescues += 1;
    venue.returnYen += row.payoutYen;
  }
  accumulator.venuesMetrics.set(row.jcd, venue);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(1));
}

function finishAccumulator(accumulator) {
  const rows = accumulator.rows;
  const rescueRows = rows.filter(row => row.rescued);
  const investmentYen = rows.length * STAKE;
  const returnYen = rescueRows.reduce((sum, row) => sum + row.payoutYen, 0);
  const foldMetrics = [...accumulator.folds.entries()].sort((a, b) => a[0] - b[0]).map(([fold, value]) => ({
    fold,
    addedTicketCount: value.tickets,
    rescueCount: value.rescues,
    returnYen: value.returnYen,
    roiPercent: pct(value.returnYen, value.tickets * STAKE)
  }));
  const eligibleVenueMetrics = [...accumulator.venuesMetrics.entries()]
    .map(([jcd, value]) => ({
      jcd,
      addedTicketCount: value.tickets,
      rescueCount: value.rescues,
      roiPercent: pct(value.returnYen, value.tickets * STAKE),
      profitYen: value.returnYen - value.tickets * STAKE
    }))
    .filter(value => value.addedTicketCount >= 20);
  const payouts = accumulator.payouts.slice().sort((a, b) => b - a);
  const top1Share = returnYen ? pct(payouts[0] || 0, returnYen) : 0;

  return {
    addedTicketCount: rows.length,
    triggeredRaceCount: accumulator.races.size,
    rescueCount: rescueRows.length,
    manboatRescueCount: rescueRows.filter(row => row.payoutYen >= 10000).length,
    investmentYen,
    returnYen,
    profitYen: returnYen - investmentYen,
    roiPercent: pct(returnYen, investmentYen),
    rescuesPer1000AddedTickets: rows.length ? Number((1000 * rescueRows.length / rows.length).toFixed(1)) : 0,
    distinctVenueCount: accumulator.venues.size,
    chronologicalFoldCount: accumulator.folds.size,
    profitableFoldCount: foldMetrics.filter(value => value.roiPercent >= 100).length,
    minimumFoldRoiPercent: foldMetrics.length ? Math.min(...foldMetrics.map(value => value.roiPercent)) : 0,
    top1ReturnSharePercent: top1Share,
    eligibleVenueCount: eligibleVenueMetrics.length,
    profitableVenueCount: eligibleVenueMetrics.filter(value => value.profitYen > 0).length,
    medianEligibleVenueRoiPercent: median(eligibleVenueMetrics.map(value => value.roiPercent)),
    foldMetrics
  };
}

function summarizeRows(rows) {
  const accumulator = emptyAccumulator();
  rows.forEach(row => addToAccumulator(accumulator, row));
  return finishAccumulator(accumulator);
}

function featureGroups(rows, dimensions) {
  const output = {};
  for (const dimension of dimensions) {
    const groups = new Map();
    for (const row of rows) {
      const value = String(row[dimension] ?? 'unknown');
      if (!groups.has(value)) groups.set(value, []);
      groups.get(value).push(row);
    }
    output[dimension] = [...groups.entries()]
      .map(([value, selected]) => ({ value, ...summarizeRows(selected) }))
      .sort((left, right) => right.addedTicketCount - left.addedTicketCount || left.value.localeCompare(right.value));
  }
  return output;
}

function buildFilters() {
  const knownEdge = row => row.stEdge !== null || row.exhibitionEdge !== null;
  const edgePositive = row => (row.stEdge !== null && row.stEdge >= 0.01)
    || (row.exhibitionEdge !== null && row.exhibitionEdge >= 0.01);
  const edgeNotWorse = row => (row.stEdge !== null && row.stEdge >= -0.01)
    || (row.exhibitionEdge !== null && row.exhibitionEdge >= -0.01);

  return [
    { id: 'all_counter_hole_pair', theory: 'current frozen counter-hole-pair-9 additions', test: () => true },
    { id: 'counter_only', theory: 'retain only the strongest counter-head addition', test: row => row.role === 'counter' },
    { id: 'hole_only', theory: 'retain only the strongest third-or-later head addition', test: row => row.role === 'hole' },
    { id: 'rank_8_9', theory: 'retain only candidates already near the seven-ticket boundary', test: row => row.rankBand === '8-9' },
    { id: 'score_95_plus', theory: 'retain only high saved pre-race score candidates', test: row => row.candidateScore >= 95 },
    { id: 'inner_head_1_3', theory: 'retain additional heads in boats 1-3', test: row => row.candidateHead <= 3 },
    { id: 'outer_head_4_6', theory: 'retain additional heads in boats 4-6', test: row => row.candidateHead >= 4 },
    { id: 'venue_in_not_high', theory: 'retain when venue inPower is below 70', test: row => row.venueInPower !== null && row.venueInPower < 70 },
    { id: 'venue_outside_high', theory: 'retain when venue outside strength is at least 55', test: row => row.venueOutside !== null && row.venueOutside >= 55 },
    { id: 'venue_rough_high', theory: 'retain when venue roughWater is at least 70', test: row => row.venueRoughWater !== null && row.venueRoughWater >= 70 },
    { id: 'actual_water_not_rough', theory: 'retain under calm or moderate observed wind/wave', test: row => ['calm', 'moderate'].includes(row.actualWaterBand) },
    { id: 'actual_water_rough', theory: 'retain under strong observed wind or wave', test: row => row.actualWaterBand === 'rough' },
    { id: 'st_selected_faster', theory: 'retain when the added head has at least 0.01 exhibition-ST edge over main head', test: row => row.stEdge !== null && row.stEdge >= 0.01 },
    { id: 'st_selected_not_slower', theory: 'retain when exhibition ST is not more than 0.01 slower than main head', test: row => row.stEdge !== null && row.stEdge >= -0.01 },
    { id: 'exhibition_selected_better', theory: 'retain when exhibition time is at least 0.01 faster than main head', test: row => row.exhibitionEdge !== null && row.exhibitionEdge >= 0.01 },
    { id: 'exhibition_selected_not_worse', theory: 'retain when exhibition time is not more than 0.01 slower than main head', test: row => row.exhibitionEdge !== null && row.exhibitionEdge >= -0.01 },
    { id: 'st_or_exhibition_edge', theory: 'retain when either exhibition ST or exhibition time beats main head', test: row => knownEdge(row) && edgePositive(row) },
    { id: 'st_or_exhibition_not_worse', theory: 'retain when either exhibition ST or exhibition time is effectively not worse', test: row => knownEdge(row) && edgeNotWorse(row) },
    { id: 'st_and_exhibition_edge', theory: 'retain only when both exhibition ST and exhibition time beat main head', test: row => row.stEdge !== null && row.exhibitionEdge !== null && row.stEdge >= 0.01 && row.exhibitionEdge >= 0.01 },
    { id: 'attack_scenario', theory: 'retain candidates whose saved scenario explicitly indicates attack', test: row => row.scenarioTag === 'attack' },
    { id: 'counter_rank_8_9', theory: 'near-boundary counter-head candidate', test: row => row.role === 'counter' && row.rankBand === '8-9' },
    { id: 'hole_rank_8_9', theory: 'near-boundary hole-head candidate', test: row => row.role === 'hole' && row.rankBand === '8-9' },
    { id: 'counter_with_edge', theory: 'counter head with ST or exhibition edge', test: row => row.role === 'counter' && edgePositive(row) },
    { id: 'hole_with_edge', theory: 'hole head with ST or exhibition edge', test: row => row.role === 'hole' && edgePositive(row) },
    { id: 'outer_head_outside_or_rough', theory: 'outer head only at outside-friendly or rough-water venue', test: row => row.candidateHead >= 4 && ((row.venueOutside ?? -Infinity) >= 55 || (row.venueRoughWater ?? -Infinity) >= 70) },
    { id: 'inner_head_in_not_high', theory: 'boats 1-3 at venues where inPower is below 70', test: row => row.candidateHead <= 3 && row.venueInPower !== null && row.venueInPower < 70 },
    { id: 'rank_8_9_score_95_plus', theory: 'near-boundary and high-score candidate', test: row => row.rankBand === '8-9' && row.candidateScore >= 95 }
  ];
}

function build() {
  const cohort = input.buildDefaultCohort({ root: ROOT });
  const payouts = payoutAudit.payoutMap();
  const venueFeatures = loadVenueFeatures();
  const folds = chronologicalFoldMap(cohort.records);
  const rows = [];
  const coverage = {
    selectedAddedTicketCount: 0,
    snapshotEntryCount: 0,
    weatherWindCount: 0,
    weatherWaveCount: 0,
    venueFeatureCount: 0,
    stPairCount: 0,
    exhibitionPairCount: 0,
    lapPairCount: 0,
    attackPairCount: 0,
    raceFlowPairCount: 0
  };

  for (const record of cohort.records) {
    const raceKey = record.__analysisRaceKey || input.raceKey(record);
    const actual = input.actualTicket(record.__officialResult);
    if (!raceKey || !actual) continue;
    const pool = expansion.collectTicketPool(record).slice(0, POOL_LIMIT);
    const base = pool.slice(0, BASE_LIMIT);
    if (!base.length) continue;
    const baseSet = new Set(base.map(item => item.ticket));
    const selected = structured.select(record, 'counter-hole-pair-9');
    const selectedAddedTickets = new Set(selected.map(item => item.ticket).filter(ticket => !baseSet.has(ticket)));
    if (!selectedAddedTickets.size) continue;

    const roleData = marginal.headRoles(pool);
    const mainHead = roleData.orderedHeads[0] || parts(base[0]?.ticket)[0] || 0;
    const extraByTicket = new Map(structured.rankedExtras(record).extras.map(item => [item.ticket, item]));
    const frozen = snapshot(record);
    const wind = weatherNumber(frozen.weather, ['windSpeed', 'wind', 'wind_velocity']);
    const wave = weatherNumber(frozen.weather, ['waveHeight', 'wave', 'wave_height']);
    const jcd = raceKey.slice(9, 11);
    const venue = venueFeatures[jcd] || {};
    const boundaryScore = numeric(base.at(-1)?.score);
    const baseHeadDiversity = new Set(base.map(item => parts(item.ticket)[0]).filter(Boolean)).size;
    const fold = folds.get(raceKey) || 0;
    const baselineHit = baseSet.has(actual);
    const payout = payouts.get(raceKey) || 0;

    for (const ticket of selectedAddedTickets) {
      const item = extraByTicket.get(ticket) || selected.find(candidate => candidate.ticket === ticket) || {};
      const candidateHead = Number(item.head || parts(ticket)[0]);
      const candidateScore = numeric(item.score) ?? 0;
      const signals = mainAndCandidateSignals(record, mainHead, candidateHead, frozen);
      const rescued = !baselineHit && ticket === actual;

      coverage.selectedAddedTicketCount += 1;
      if (frozen.entries.length) coverage.snapshotEntryCount += 1;
      if (wind !== null) coverage.weatherWindCount += 1;
      if (wave !== null) coverage.weatherWaveCount += 1;
      if (Object.keys(venue).length) coverage.venueFeatureCount += 1;
      if (signals.stEdge !== null) coverage.stPairCount += 1;
      if (signals.exhibitionEdge !== null) coverage.exhibitionPairCount += 1;
      if (signals.lapEdge !== null) coverage.lapPairCount += 1;
      if (signals.attackEdge !== null) coverage.attackPairCount += 1;
      if (signals.raceFlowEdge !== null) coverage.raceFlowPairCount += 1;

      rows.push({
        raceKey,
        jcd,
        fold,
        ticket,
        role: item.role || roleData.map.get(candidateHead) || 'hole',
        mainHead,
        candidateHead,
        headPath: `${mainHead}->${candidateHead}`,
        candidateRank: Number(item.poolRank || 0),
        rankBand: rankBand(item.poolRank),
        candidateScore,
        scoreBand: scoreBand(candidateScore),
        boundaryScore,
        scoreGap: boundaryScore === null ? null : Number((candidateScore - boundaryScore).toFixed(2)),
        scoreGapBand: scoreGapBand(boundaryScore === null ? null : candidateScore - boundaryScore),
        source: item.source || 'unknown',
        scenarioTag: attribution.scenarioTag(item.scenario),
        baseHeadDiversity,
        baseHeadDiversityBand: baseHeadDiversity >= 3 ? '3_or_more' : String(baseHeadDiversity),
        venueInPower: numeric(venue.inPower),
        venueInPowerBand: strengthBand(venue.inPower, 70, 60),
        venueOutside: numeric(venue.outside),
        venueOutsideBand: strengthBand(venue.outside, 55, 50),
        venueRoughWater: numeric(venue.roughWater),
        venueRoughWaterBand: strengthBand(venue.roughWater, 70, 55),
        venueKado: numeric(venue.kado),
        venueKadoBand: strengthBand(venue.kado, 65, 60),
        venueNight: venue.night === true ? 'night' : venue.night === false ? 'day' : 'unknown',
        wind,
        windBand: windBand(wind),
        wave,
        waveBand: waveBand(wave),
        actualWaterBand: actualWaterBand(wind, wave),
        ...signals,
        stEdgeBand: edgeBand(signals.stEdge),
        exhibitionEdgeBand: edgeBand(signals.exhibitionEdge),
        lapEdgeBand: edgeBand(signals.lapEdge),
        attackEdgeBand: componentEdgeBand(signals.attackEdge),
        raceFlowEdgeBand: componentEdgeBand(signals.raceFlowEdge),
        rescued,
        payoutYen: rescued ? payout : 0,
        manboatRescue: rescued && payout >= 10000
      });
    }
  }

  const overall = summarizeRows(rows);
  const filters = buildFilters().map(filter => {
    const selected = rows.filter(filter.test);
    const metrics = summarizeRows(selected);
    return {
      id: filter.id,
      theory: filter.theory,
      ...metrics,
      addedTicketRetentionPercent: pct(metrics.addedTicketCount, overall.addedTicketCount),
      rescueRetentionPercent: pct(metrics.rescueCount, overall.rescueCount),
      manboatRetentionPercent: pct(metrics.manboatRescueCount, overall.manboatRescueCount),
      profitDeltaVsAllAdditionsYen: metrics.profitYen - overall.profitYen
    };
  });

  const portableFilters = filters
    .filter(filter => filter.id !== 'all_counter_hole_pair')
    .filter(filter => filter.addedTicketCount >= 150)
    .filter(filter => filter.rescueCount >= 5)
    .filter(filter => filter.distinctVenueCount >= 12)
    .filter(filter => filter.chronologicalFoldCount === 4)
    .filter(filter => filter.profitableFoldCount >= 2)
    .filter(filter => filter.roiPercent >= 100)
    .filter(filter => filter.top1ReturnSharePercent <= 50)
    .sort((left, right) => right.profitYen - left.profitYen || right.roiPercent - left.roiPercent);

  const dimensions = [
    'role', 'candidateHead', 'mainHead', 'headPath', 'rankBand', 'scoreBand',
    'scoreGapBand', 'source', 'scenarioTag', 'baseHeadDiversityBand',
    'venueInPowerBand', 'venueOutsideBand', 'venueRoughWaterBand', 'venueKadoBand',
    'venueNight', 'actualWaterBand', 'windBand', 'waveBand', 'stEdgeBand',
    'exhibitionEdgeBand', 'lapEdgeBand', 'attackEdgeBand', 'raceFlowEdgeBand'
  ];
  const byFeature = featureGroups(rows, dimensions);
  const portableCells = Object.entries(byFeature)
    .flatMap(([dimension, cells]) => cells.map(cell => ({ dimension, ...cell })))
    .filter(cell => cell.value !== 'unknown')
    .filter(cell => cell.addedTicketCount >= 100)
    .filter(cell => cell.rescueCount >= 3)
    .filter(cell => cell.distinctVenueCount >= 10)
    .filter(cell => cell.chronologicalFoldCount === 4)
    .filter(cell => cell.roiPercent >= 100)
    .sort((left, right) => right.profitYen - left.profitYen || right.roiPercent - left.roiPercent);

  const coveragePercent = Object.fromEntries(Object.entries(coverage).map(([key, value]) => [
    key.replace(/Count$/, 'Percent'),
    key === 'selectedAddedTicketCount' ? 100 : pct(value, coverage.selectedAddedTicketCount)
  ]));

  return {
    schemaVersion: 1,
    analysisId: 'counter-hole-portable-conditions-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticApplication: false,
    usableForPrediction: false,
    purpose: 'Replace venue-name selection with portable pre-race conditions for counter-hole-pair-9 by measuring role, head, candidate rank/score, venue traits, observed wind/wave, exhibition ST/time/lap edges, and saved attack/flow signals.',
    methodology: {
      cohort: 'official pre-deadline predictions joined to official settled results',
      baseRule: 'baseline 7 plus at most one highest-score counter head and one highest-score hole head from ranks 8-12, score >=85, maximum 9 tickets',
      venueTraits: 'read directly from current js/ai-core.js VENUE_FEATURES; venue code is used only for coverage, never as an adoption condition',
      signalDirection: 'positive ST/time/lap edge means the selected additional head was better than the main head in saved pre-race data',
      stake: `${STAKE} yen per retained added ticket`,
      selectionUsesOutcome: false,
      resultAndPayoutUse: 'evaluation only',
      portableFilterGate: '>=150 tickets, >=5 rescues, >=12 venues, all 4 folds, >=2 profitable folds, ROI>=100%, top rescue <=50% of return',
      warning: 'Retrospective portability audit only. Passing conditions are hypotheses and require a new frozen forward shadow before any production use.'
    },
    diagnostics: cohort.diagnostics,
    coverage: { ...coverage, ...coveragePercent },
    overall,
    filters,
    portableFilters,
    portableCells,
    byFeature,
    rows
  };
}

if (require.main === module) process.stdout.write(`${JSON.stringify(build(), null, 2)}\n`);
module.exports = { build, loadVenueFeatures, mainAndCandidateSignals, summarizeRows };
