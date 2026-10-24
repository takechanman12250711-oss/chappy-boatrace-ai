"use strict";

// 外部動画「勝ちやすいレースの選び方」の3段階チェックを、判定できる形にした純粋関数。
// ①場の1コース1着率 ②直前情報の水面（風速・波高） ③1号艇の堅さ（進入・当地勝率・展示タイム・本節成績）。
// 1つでも外れたら見送り。研究用で本番の予想・買い目・選定には使わない。

const VERSION = "race-selection-filter-v1";

// 動画に数値がない閾値は仮置き（docs/race-selection-filter-v1.md）。結果を見る前に固定した値。
const DEFAULT_PARAMS = Object.freeze({
  venueWindowDays: 365,     // 場の1コース1着率を数える期間（前日まで）
  venueMinRaces: 200,       // これ未満の場は判定不能
  venueMinCourse1Rate: 0.55, // ① これ以上なら「インが強い場」（全国平均の目安54.6%）
  maxWindSpeed: 4,          // ② 風速5m以上で見送り（動画の実例は6m）
  maxWaveHeight: 4,         // ② 波高5cm以上で見送り
  minLocalWinRate: 5.5,     // ③ 1号艇の当地勝率
  maxExhibitionGap: 0.1,    // ③ 1号艇の展示タイムが6艇の最速から0.10秒より遅いと「極端に見劣り」
  seriesWindowDays: 6,      // ③ 本節＝同じ場の前日までの6日以内
  seriesMinRaces: 2,        // ③ 本節の走数がこれ未満なら本節は判定しない
  maxSeriesAvgFinish: 3.5   // ③ 本節の平均着順
});

function dayNumber(date) {
  const s = String(date);
  return Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8))) / 86400000;
}

function startsByBoat(race) {
  const map = new Map();
  for (const start of race?.starts || []) if (Number.isInteger(start?.boat)) map.set(start.boat, start);
  return map;
}

function isSettledRace(race) {
  return race?.status === "finished" && race.void !== true &&
    Array.isArray(race.finishers) && race.finishers.length > 0 &&
    Array.isArray(race?.trifecta?.boats) && race.trifecta.boats.length === 3;
}

// 返還艇：フライング・出遅れ・欠場（スタート記録なし）。その艇を含む券は購入額・払戻から除く。
function refundedBoats(race) {
  const starts = race?.starts || [];
  if (!starts.length) return new Set();
  const map = startsByBoat(race);
  const refunded = new Set();
  for (let boat = 1; boat <= 6; boat += 1) {
    const start = map.get(boat);
    if (!start || start.falseStart || start.lateStart) refunded.add(boat);
  }
  return refunded;
}

function createState() {
  return { venues: new Map(), racers: new Map() };
}

// 判定後に、その日の確定レースを履歴へ積む（場の1コース1着、選手の着順）
function updateStateWithRace(state, race) {
  if (!isSettledRace(race)) return;
  const day = dayNumber(race.date);
  const winner = race.finishers.find((finisher) => finisher.rank === 1);
  const course1 = (race.starts || []).find((start) => start.course === 1);
  if (winner && course1) {
    const list = state.venues.get(race.jcd) || [];
    list.push({ day, win: winner.boat === course1.boat });
    state.venues.set(race.jcd, list);
  }
  for (const finisher of race.finishers) {
    if (!/^\d{4}$/.test(String(finisher.registerNo || "")) || !Number.isInteger(finisher.rank)) continue;
    const list = state.racers.get(finisher.registerNo) || [];
    list.push({ day, jcd: race.jcd, rank: finisher.rank });
    if (list.length > 40) list.splice(0, list.length - 40);
    state.racers.set(finisher.registerNo, list);
  }
}

function venueCourse1Rate(state, jcd, date, params = DEFAULT_PARAMS) {
  const today = dayNumber(date);
  const list = (state.venues.get(jcd) || []).filter((item) => item.day < today && item.day >= today - params.venueWindowDays);
  if (list.length < params.venueMinRaces) return { races: list.length, rate: null };
  return { races: list.length, rate: list.filter((item) => item.win).length / list.length };
}

function seriesRecord(state, registerNo, jcd, date, params = DEFAULT_PARAMS) {
  const today = dayNumber(date);
  const list = (state.racers.get(String(registerNo || "")) || [])
    .filter((item) => item.jcd === jcd && item.day < today && item.day >= today - params.seriesWindowDays);
  if (!list.length) return { races: 0, avgFinish: null };
  return { races: list.length, avgFinish: list.reduce((sum, item) => sum + item.rank, 0) / list.length };
}

const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

// 1条件の判定：pass / fail / unknown（材料不足）
function checkVenue(venue, params = DEFAULT_PARAMS) {
  if (venue.rate === null) return { status: "unknown", reason: "venue-sample-short" };
  return venue.rate >= params.venueMinCourse1Rate ? { status: "pass" } : { status: "fail", reason: "venue-course1-low" };
}

function checkWater(weather = {}, params = DEFAULT_PARAMS) {
  const wind = num(weather?.windSpeed), wave = num(weather?.waveHeight);
  if (wind === null || wave === null) return { status: "unknown", reason: "weather-missing" };
  if (wind > params.maxWindSpeed) return { status: "fail", reason: "wind-strong" };
  if (wave > params.maxWaveHeight) return { status: "fail", reason: "wave-high" };
  return { status: "pass" };
}

function checkBoat1(boats = [], series = { races: 0, avgFinish: null }, params = DEFAULT_PARAMS) {
  const boat1 = boats.find((boat) => Number(boat?.boatNo) === 1);
  if (!boat1) return { status: "unknown", reason: "boat1-missing" };
  const course = num(boat1.course);
  if (course === null) return { status: "unknown", reason: "boat1-course-missing" };
  if (course !== 1) return { status: "fail", reason: "boat1-not-course1" };
  const local = num(boat1.localWinRate);
  if (local === null) return { status: "unknown", reason: "boat1-local-missing" };
  if (local < params.minLocalWinRate) return { status: "fail", reason: "boat1-local-low" };
  const times = [1, 2, 3, 4, 5, 6].map((no) => num(boats.find((boat) => Number(boat?.boatNo) === no)?.exhibitionTime));
  if (times.some((time) => time === null || time <= 0)) return { status: "unknown", reason: "exhibition-time-missing" };
  // 0.01秒単位の整数で比べる（浮動小数の誤差で境界がずれないように）
  const gap = Math.round(times[0] * 100) - Math.round(Math.min(...times) * 100);
  if (gap > Math.round(params.maxExhibitionGap * 100)) return { status: "fail", reason: "boat1-exhibition-slow" };
  if (series.races >= params.seriesMinRaces && series.avgFinish > params.maxSeriesAvgFinish) return { status: "fail", reason: "boat1-series-poor" };
  // 選手が特定できないときは「本節の走数が少ない」と区別して判定不能にする
  if (series.known === false) return { status: "unknown", reason: "boat1-identity-missing" };
  return { status: "pass" };
}

// 3つを順に見て、1つでも外れたら見送り。外れがなく材料不足があれば判定不能。
function combine(checks) {
  const failed = checks.find((check) => check.status === "fail");
  if (failed) return { status: "fail", reason: failed.reason };
  const unknown = checks.find((check) => check.status === "unknown");
  if (unknown) return { status: "unknown", reason: unknown.reason };
  return { status: "pass" };
}

// 券の精算（1点100円）。返還艇を含む券は除く。
function settle(race, tickets) {
  const refunded = refundedBoats(race);
  const winning = race.trifecta.boats.join("-");
  const payoutPer100 = Number(race.trifecta.payout) || 0;
  let stake = 0, payout = 0, hit = false, counted = 0;
  for (const ticket of tickets) {
    const boats = String(ticket).split("-").map(Number);
    if (boats.length !== 3 || boats.some((boat) => refunded.has(boat))) continue;
    counted += 1;
    stake += 100;
    if (boats.join("-") === winning) { hit = true; payout += payoutPer100; }
  }
  return { counted, stake, payout, hit };
}

// 1号艇1着・2着3着は全部（20点）
const BOAT1_HEAD_ALL = (() => {
  const list = [];
  for (let b = 2; b <= 6; b += 1) for (let c = 2; c <= 6; c += 1) if (b !== c) list.push(`1-${b}-${c}`);
  return list;
})();

function emptyGroup() {
  return { races: 0, boat1Wins: 0, practical: { races: 0, hits: 0, tickets: 0, stake: 0, payout: 0 }, boat1Head: { hits: 0, tickets: 0, stake: 0, payout: 0 } };
}

function addToGroup(group, race, practicalTickets) {
  group.races += 1;
  const winner = race.finishers.find((finisher) => finisher.rank === 1);
  if (winner?.boat === 1) group.boat1Wins += 1;
  if (practicalTickets && practicalTickets.length) {
    const s = settle(race, practicalTickets);
    if (s.counted) {
      group.practical.races += 1;
      group.practical.hits += s.hit ? 1 : 0;
      group.practical.tickets += s.counted;
      group.practical.stake += s.stake;
      group.practical.payout += s.payout;
    }
  }
  const head = settle(race, BOAT1_HEAD_ALL);
  group.boat1Head.hits += head.hit ? 1 : 0;
  group.boat1Head.tickets += head.counted;
  group.boat1Head.stake += head.stake;
  group.boat1Head.payout += head.payout;
}

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

function summarizeGroup(group) {
  return {
    races: group.races,
    boat1WinRate: pct(group.boat1Wins, group.races),
    practical: {
      races: group.practical.races,
      hitRate: pct(group.practical.hits, group.practical.races),
      tickets: group.practical.tickets,
      stake: group.practical.stake,
      payout: group.practical.payout,
      returnRate: pct(group.practical.payout, group.practical.stake)
    },
    boat1Head20: {
      hitRate: pct(group.boat1Head.hits, group.races),
      stake: group.boat1Head.stake,
      payout: group.boat1Head.payout,
      returnRate: pct(group.boat1Head.payout, group.boat1Head.stake)
    }
  };
}

module.exports = {
  VERSION,
  DEFAULT_PARAMS,
  BOAT1_HEAD_ALL,
  dayNumber,
  isSettledRace,
  refundedBoats,
  createState,
  updateStateWithRace,
  venueCourse1Rate,
  seriesRecord,
  checkVenue,
  checkWater,
  checkBoat1,
  combine,
  settle,
  emptyGroup,
  addToGroup,
  summarizeGroup
};
