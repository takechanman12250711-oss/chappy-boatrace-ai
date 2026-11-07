'use strict';
// Research-only report. Reads saved pre-deadline predictions and official
// results; never changes predictions, tickets or the frozen model config.
//  1. race-roughness-v1: 荒れる／混戦／堅め classification + nightly check
//  2. tilt: finish rates by tilt angle and actual course
//  3. motor: how motor strength relates to finishes (with data-source caveat)
//  4. venue: チャッピー hit rate by venue and whether it is stable over time
const fs = require('node:fs');
const path = require('node:path');
const input = require('./analysis-input-contract');
const { compactLedgerRecord } = require('./report-input-projection.cjs');
const ledger = require('./build-continuous-performance-ledger.cjs');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'race-roughness-v1.json');
const SHADOW_PATH = path.join(ROOT, 'config', 'datazeme-shadow-ab-v1.json');
const OUTPUT = 'data/stats/race-insight-report.json';
const VENUES = ['', '桐生', '戸田', '江戸川', '平和島', '多摩川', '浜名湖', '蒲郡', '常滑', '津', '三国', 'びわこ', '住之江',
  '尼崎', '鳴門', '丸亀', '児島', '宮島', '徳山', '下関', '若松', '芦屋', '福岡', '唐津', '大村'];
const TILT_MAX = 3.5; // official tilt range is -0.5 .. +3.5; larger values are input errors

const num = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const round = (value, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};
const pct = (part, whole) => (whole ? round(part / whole * 100, 1) : null);

// Tilt is not in preRaceConditions.boats; it is kept on the saved raw entries.
function collectTilts(record) {
  const out = {};
  const stack = [record];
  let guard = 0;
  while (stack.length && guard++ < 400000) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (const value of node) if (value && typeof value === 'object') stack.push(value);
      continue;
    }
    if (!node || typeof node !== 'object') continue;
    if ('tilt' in node) {
      const boat = num(node.boatNo ?? node.lane ?? node.boat);
      const tilt = num(node.tilt);
      if (boat >= 1 && boat <= 6 && tilt !== null && out[boat] === undefined) out[boat] = tilt;
    }
    for (const key in node) {
      const value = node[key];
      if (value && typeof value === 'object') stack.push(value);
    }
  }
  return out;
}

function extractFeatures(record) {
  const conditions = record?.prediction?.preRaceConditions || record?.preRaceConditions || {};
  const tilts = collectTilts(record);
  const boats = (Array.isArray(conditions.boats) ? conditions.boats : []).map(b => ({
    boat: num(b.boatNo), course: num(b.course), cls: b.className || '',
    nw: num(b.nationalWinRate), m2: num(b.motor2Rate), m3: num(b.motor3Rate), avgST: num(b.avgST),
    tilt: tilts[num(b.boatNo)] ?? null
  }));
  const weather = conditions.weather || {};
  return { boats, wind: num(weather.windSpeed), wave: num(weather.waveHeight) };
}

function projector(record) {
  const out = compactLedgerRecord(record);
  if (out) out.__insight = extractFeatures(record);
  return out;
}

// Must stay identical to the features the frozen coefficients were fitted on.
function roughnessFeatures(race, config) {
  const d = config.defaults;
  const g = (value, fallback) => (value === null || value === undefined ? fallback : value);
  const boats = [...race.boats].sort((a, b) => g(a.course, a.boat) - g(b.course, b.boat));
  const b1 = boats.find(b => b.course === 1) || boats[0];
  const nws = boats.map(b => g(b.nw, d.nationalWinRate));
  const m2s = boats.map(b => g(b.m2, d.motor2Rate));
  const mean = values => values.reduce((s, v) => s + v, 0) / values.length;
  const nwMean = mean(nws);
  const others = boats.filter(b => b !== b1).map(b => g(b.nw, d.nationalWinRate));
  const prior = config.venuePrior.byJcd[race.jcd] || {};
  const b1nw = g(b1.nw, d.nationalWinRate);
  return {
    b1_nw: b1nw,
    b1_cls: config.classScore[b1.cls] ?? d.classScore,
    b1_gap: b1nw - Math.max(...others),
    b1_m2: g(b1.m2, d.motor2Rate) - mean(m2s),
    a1_others: boats.filter(b => b !== b1 && b.cls === 'A1').length,
    nw_std: Math.sqrt(mean(nws.map(v => (v - nwMean) ** 2))),
    b1_st: g(b1.avgST, d.avgST),
    wind: g(race.wind, d.windSpeed),
    wave: g(race.wave, d.waveHeight),
    v_in1: g(prior.inCourseWinRate, d.venueInCourseWinRate),
    v_rough: g(prior.roughRate, d.venueRoughRate),
    race12: race.raceNo === 12 ? 1 : 0,
    race1: race.raceNo === 1 ? 1 : 0,
    outer_strong: Math.max(...boats.filter(b => g(b.course, 0) >= 4).map(b => g(b.nw, 0))) - b1nw
  };
}

function classifyRoughness(race, config) {
  if (!Array.isArray(race.boats) || race.boats.length !== 6) return null;
  const f = roughnessFeatures(race, config);
  let z = config.intercept;
  config.features.forEach((key, i) => { z += config.coefficients[i] * (f[key] - config.mean[i]) / config.scale[i]; });
  const probability = 1 / (1 + Math.exp(-z));
  const label = probability >= config.thresholds.roughAtOrAbove ? 'rough'
    : probability < config.thresholds.solidBelow ? 'solid' : 'mixed';
  return { probability, label };
}

function money(rows) {
  const stake = rows.reduce((s, r) => s + r.chappy.stakeYen, 0);
  const ret = rows.reduce((s, r) => s + r.chappy.returnYen, 0);
  const hits = rows.filter(r => r.chappy.hit).length;
  return { races: rows.length, hits, hitRate: pct(hits, rows.length), roi: stake ? round(ret / stake * 100, 1) : null };
}

function roughnessWindow(rows) {
  const all = rows.length;
  const rough = rows.filter(r => r.rough).length;
  const by = label => rows.filter(r => r.roughness.label === label);
  const describe = label => {
    const items = by(label);
    const roughCount = items.filter(r => r.rough).length;
    return { races: items.length, roughRaces: roughCount, roughRate: pct(roughCount, items.length),
      solidRate: pct(items.length - roughCount, items.length), chappy: money(items) };
  };
  return { races: all, baseRoughRate: pct(rough, all), baseSolidRate: pct(all - rough, all), chappy: money(rows),
    rough: describe('rough'), mixed: describe('mixed'), solid: describe('solid') };
}

function tiltBucket(tilt) {
  if (tilt < 0) return '-0.5';
  if (tilt === 0) return '0';
  if (tilt === 0.5) return '+0.5';
  if (tilt <= 1.5) return '+1〜1.5';
  return '+2以上';
}
// Wilson 95% interval, used only to flag differences that are unlikely to be chance.
function wilson(success, n) {
  if (!n) return [0, 0];
  const z = 1.96, p = success / n, denom = 1 + z * z / n;
  const centre = (p + z * z / (2 * n)) / denom;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom;
  return [centre - half, centre + half];
}

function tiltReport(rows) {
  const entries = [];
  for (const r of rows) {
    const rank = new Map(r.finishers.map(f => [f.boat, f.rank]));
    const course = new Map(r.starts.map(s => [s.boat, s.course]));
    for (const b of r.boats) {
      if (b.tilt === null || b.tilt > TILT_MAX || !rank.has(b.boat)) continue;
      entries.push({ tilt: b.tilt, course: course.get(b.boat) || b.course, win: rank.get(b.boat) === 1, top3: rank.get(b.boat) <= 3 });
    }
  }
  const byCourse = [];
  for (let c = 1; c <= 6; c++) {
    const inCourse = entries.filter(e => e.course === c);
    if (!inCourse.length) continue;
    const baseWin = inCourse.filter(e => e.win).length / inCourse.length;
    const baseTop3 = inCourse.filter(e => e.top3).length / inCourse.length;
    const buckets = ['-0.5', '0', '+0.5', '+1〜1.5', '+2以上'].map(bucket => {
      const items = inCourse.filter(e => tiltBucket(e.tilt) === bucket);
      const wins = items.filter(e => e.win).length, top3 = items.filter(e => e.top3).length;
      const [wl, wh] = wilson(wins, items.length), [tl, th] = wilson(top3, items.length);
      const signal = items.length < 25 ? 'too-few'
        : wl > baseWin || tl > baseTop3 ? 'better' : wh < baseWin || th < baseTop3 ? 'worse' : 'same';
      return { tilt: bucket, entries: items.length, winRate: pct(wins, items.length), top3Rate: pct(top3, items.length), signal };
    }).filter(b => b.entries);
    byCourse.push({ course: c, entries: inCourse.length, winRate: round(baseWin * 100, 1), top3Rate: round(baseTop3 * 100, 1), buckets });
  }
  return { entries: entries.length, races: rows.filter(r => r.boats.some(b => b.tilt !== null)).length, byCourse };
}

// Until 2026-10-27 (#1385) the saved motor2Rate was an internal score
// re-encoded as 30+delta (motor3 = motor2 + 15). Report both sources apart.
function motorSource(boats) {
  if (boats.some(b => b.m2 === null || b.m3 === null)) return 'missing';
  return boats.every(b => Math.abs(b.m3 - b.m2 - 15) < 0.02) ? 'internal-score' : 'official';
}
function motorReport(rows) {
  const out = {};
  for (const source of ['official', 'internal-score']) {
    const subset = rows.filter(r => motorSource(r.boats) === source);
    const inByRank = [];
    for (let k = 1; k <= 6; k++) inByRank.push({ motorRank: k, races: 0, inWins: 0 });
    const courseTerciles = {};
    for (const r of subset) {
      const course = new Map(r.starts.map(s => [s.boat, s.course]));
      const winner = r.finishers.find(f => f.rank === 1)?.boat;
      const top3 = new Set(r.finishers.filter(f => f.rank <= 3).map(f => f.boat));
      const sorted = [...r.boats].sort((a, b) => b.m2 - a.m2);
      const mean = r.boats.reduce((s, b) => s + b.m2, 0) / 6;
      sorted.forEach((b, i) => {
        const c = course.get(b.boat) || b.course;
        if (c === 1) { inByRank[i].races++; if (winner === b.boat) inByRank[i].inWins++; }
        const diff = b.m2 - mean;
        const band = diff >= 3 ? 'strong' : diff <= -3 ? 'weak' : 'even';
        const key = String(c);
        courseTerciles[key] ??= { strong: [0, 0, 0], even: [0, 0, 0], weak: [0, 0, 0] };
        const cell = courseTerciles[key][band];
        cell[0]++; if (winner === b.boat) cell[1]++; if (top3.has(b.boat)) cell[2]++;
      });
    }
    out[source] = {
      races: subset.length,
      inCourseWinByMotorRank: inByRank.map(x => ({ motorRank: x.motorRank, races: x.races, inWinRate: pct(x.inWins, x.races) })),
      byCourse: Object.entries(courseTerciles).sort(([a], [b]) => a - b).map(([course, bands]) => ({
        course: Number(course),
        ...Object.fromEntries(Object.entries(bands).map(([band, [n, w, t]]) => [band, { entries: n, winRate: pct(w, n), top3Rate: pct(t, n) }]))
      }))
    };
  }
  return out;
}

function venueReport(rows, splitDate) {
  const byJcd = {};
  for (const r of rows) (byJcd[r.jcd] ??= []).push(r);
  return Object.entries(byJcd).sort(([a], [b]) => a.localeCompare(b)).map(([jcd, items]) => ({
    jcd, venue: VENUES[Number(jcd)] || jcd,
    all: money(items),
    early: money(items.filter(r => r.date < splitDate)),
    late: money(items.filter(r => r.date >= splitDate))
  }));
}

function correlation(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n, my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? round(sxy / Math.sqrt(sxx * syy), 2) : null;
}

// チャッピーの1着軸：保存した実戦厳選の券で、1着に置かれた回数がいちばん多い艇（同数なら先に出た艇）。
function headBoat(tickets) {
  const count = new Map();
  for (const t of tickets || []) {
    const b = Number(String(t).split('-')[0]);
    if (b >= 1 && b <= 6) count.set(b, (count.get(b) || 0) + 1);
  }
  let best = null;
  for (const [b, n] of count) if (best === null || n > count.get(best)) best = b;
  return best;
}

// 3つの見送りルール（config/datazeme-shadow-ab-v1.json に文章で固定）。結果は見ない。
function shadowRules(row) {
  const course4 = row.boats.find(b => b.course === 4);
  const kadoTilt = Boolean(course4 && Number.isFinite(course4.tilt) && course4.tilt >= 2 && course4.tilt <= TILT_MAX && row.head !== course4.boat);
  let weakInMotor = false;
  if (motorSource(row.boats) === 'official') {
    const inBoat = row.boats.find(b => b.course === 1);
    if (inBoat && row.head === inBoat.boat) {
      const min = Math.min(...row.boats.map(b => b.m2));
      weakInMotor = inBoat.m2 === min && row.boats.filter(b => b.m2 === min).length === 1;
    }
  }
  return { B1_skipRough: row.roughness.label === 'rough', B2_skipKadoTilt: kadoTilt, B3_skipWeakInMotor: weakInMotor };
}

function shadowAb(rows, shadow) {
  const variants = ['B1_skipRough', 'B2_skipKadoTilt', 'B3_skipWeakInMotor', 'B_all'];
  const flagged = rows.map(r => { const f = shadowRules(r); f.B_all = f.B1_skipRough || f.B2_skipKadoTilt || f.B3_skipWeakInMotor; return { r, f }; });
  const windowOf = items => ({
    A_current: money(items.map(x => x.r)),
    variants: Object.fromEntries(variants.map(v => [v, {
      kept: money(items.filter(x => !x.f[v]).map(x => x.r)),
      skipped: money(items.filter(x => x.f[v]).map(x => x.r))
    }]))
  });
  const cut = shadow.exploredThroughRaceDate;
  return {
    analysisId: shadow.analysisId, fixedAt: shadow.fixedAt, rules: shadow.rules,
    minimumHoldoutRacesForDecision: shadow.minimumHoldoutRacesForDecision,
    explored: windowOf(flagged.filter(x => x.r.date <= cut)),
    holdout: windowOf(flagged.filter(x => x.r.date > cut)),
    productionChanged: false, usableForPrediction: false, automaticApplication: false
  };
}

function buildRows(records, config) {
  const rows = [];
  for (const record of records) {
    const result = record.__officialResult || {};
    const payout = num(result?.trifecta?.payout);
    const feat = record.__insight;
    if (payout === null || !feat || feat.boats.length !== 6) continue;
    const key = record.__analysisRaceKey;
    const [date, jcd, raceNo] = key.split('-');
    const race = { jcd: jcd.padStart(2, '0'), raceNo: num(record.raceNo) ?? Number(raceNo), boats: feat.boats, wind: feat.wind, wave: feat.wave };
    const roughness = classifyRoughness(race, config);
    if (!roughness) continue;
    rows.push({
      raceKey: key, date, jcd: race.jcd, boats: feat.boats, roughness,
      rough: payout >= config.roughDefinition.roughAtOrAboveYen,
      finishers: (result.finishers || []).map(f => ({ rank: num(f.rank), boat: num(f.boat) })),
      starts: (result.starts || []).map(s => ({ course: num(s.course), boat: num(s.boat) })),
      chappy: ledger.evaluate(record),
      head: headBoat(ledger.practicalTickets(record?.prediction || record))
    });
  }
  return rows.sort((a, b) => a.raceKey.localeCompare(b.raceKey));
}

function build(options = {}) {
  const config = options.config || JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const shadow = options.shadow || JSON.parse(fs.readFileSync(SHADOW_PATH, 'utf8'));
  const cohort = options.records ? { records: options.records, diagnostics: {} }
    : input.buildDefaultCohort({ root: options.root || ROOT, compactPredictionRecord: projector });
  const rows = buildRows(cohort.records, config);
  const split = config.fit.trainedOnRaceDatesBefore;
  const frozen = config.fit.frozenAfterRaceDate;
  const venues = venueReport(rows, split);
  const stable = venues.filter(v => v.early.races >= 40 && v.late.races >= 30);
  const latest = rows.length ? rows[rows.length - 1] : null;
  return {
    schemaVersion: 1,
    analysisId: 'race-insight-report-v1',
    generatedAt: new Date().toISOString(),
    productionChanged: false,
    automaticProductionChange: false,
    usableForPrediction: false,
    sourceCohort: { ...cohort.diagnostics, analyzedRaces: rows.length, firstDate: rows[0]?.date || null, lastDate: latest?.date || null },
    roughness: {
      modelId: config.modelId,
      definition: `3連単の払戻が${config.roughDefinition.roughAtOrAboveYen.toLocaleString('ja-JP')}円以上なら「荒れた」`,
      trainedOnRaceDatesBefore: split,
      frozenAfterRaceDate: frozen,
      // fitted window, the later window never used for fitting, and races after the config was frozen
      fitWindow: roughnessWindow(rows.filter(r => r.date < split)),
      holdoutWindow: roughnessWindow(rows.filter(r => r.date >= split)),
      forwardWindow: roughnessWindow(rows.filter(r => r.date > frozen)),
      latestDay: latest ? { date: latest.date, ...roughnessWindow(rows.filter(r => r.date === latest.date)) } : null
    },
    tilt: tiltReport(rows),
    motor: motorReport(rows),
    shadowAb: shadowAb(rows, shadow),
    venue: {
      splitDate: split,
      hitRateStabilityCorrelation: correlation(stable.map(v => v.early.hitRate), stable.map(v => v.late.hitRate)),
      roiStabilityCorrelation: correlation(stable.map(v => v.early.roi), stable.map(v => v.late.roi)),
      byVenue: venues
    }
  };
}

if (require.main === module) {
  const out = path.join(ROOT, OUTPUT);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(build(), null, 2) + '\n');
}

module.exports = { OUTPUT, headBoat, shadowRules, shadowAb, build, buildRows, classifyRoughness, roughnessFeatures, extractFeatures, collectTilts, tiltBucket, motorSource, projector };
