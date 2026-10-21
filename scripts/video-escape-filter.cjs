"use strict";

// 外部動画（あべけん「初心者でも的中率8割を狙う3連単の買い方」2026-10-20公開）の
// イン逃げレース選定ルールを、公式結果原本だけで再現・検証するための純粋関数群。
// 研究用。本番予想・note・購入判断へは接続しない。

const VERSION = "video-escape-filter-v1";

const DEFAULT_PARAMS = Object.freeze({
  windowSize: 10,              // 「過去10走」
  boatOneMinFrameSamples: 10,  // 1号艇は1枠の10走がそろう選手だけ判定
  boatOneMinWins: 7,           // 1号艇: 1枠過去10走で1着7回以上
  othersMaxWins: 3,            // 2〜6号艇: 各枠過去10走で1着3回以下
  stWindowSize: 10,            // コース別平均STは直近10回
  minStSamples: 3,             // 平均STの算出に必要な最少回数
  wallMarginSec: 0.03,         // 壁: 2・3号艇の平均STが1号艇+0.03秒以内（動画に数値なし・仮置き）
  exhibitionDentSec: 0.05,     // 展示: 1号艇が2・3号艇の速い方より0.05秒以上遅ければ「へこみ」（仮置き）
  outerNobiSec: 0.05           // 展示: 4〜6号艇の最速展示タイムが1号艇より0.05秒以上速ければ「伸び」（仮置き）
});

const FORMATIONS = Object.freeze({
  f12: { label: "1-234-全（12点）", first: [1], second: [2, 3, 4], third: [1, 2, 3, 4, 5, 6] },
  f4: { label: "1-23-234（4点）", first: [1], second: [2, 3], third: [2, 3, 4] }
});

function expandFormation(formation) {
  const tickets = [];
  for (const a of formation.first) {
    for (const b of formation.second) {
      if (b === a) continue;
      for (const c of formation.third) {
        if (c === a || c === b) continue;
        tickets.push([a, b, c]);
      }
    }
  }
  return tickets;
}

function createState() {
  return new Map();
}

function racerRecord(state, registerNo) {
  let record = state.get(registerNo);
  if (!record) {
    record = { frames: {}, courseSt: {}, lastDate: "" };
    state.set(registerNo, record);
  }
  return record;
}

function pushCapped(list, value, cap) {
  list.push(value);
  if (list.length > cap) list.splice(0, list.length - cap);
}

function isValidStart(start) {
  return Boolean(start) &&
    !start.falseStart &&
    !start.lateStart &&
    typeof start.st === "number" &&
    Number.isFinite(start.st) &&
    start.st >= 0 &&
    start.st < 1;
}

function startsByBoat(race) {
  const map = new Map();
  for (const start of race.starts || []) {
    if (Number.isInteger(start?.boat)) map.set(start.boat, start);
  }
  return map;
}

function isSettledRace(race) {
  return race?.status === "finished" &&
    race.void !== true &&
    Array.isArray(race.finishers) &&
    race.finishers.length > 0 &&
    Array.isArray(race?.trifecta?.boats) &&
    race.trifecta.boats.length === 3;
}

// 完走した選手だけ登録番号が分かるため、完走記録だけを履歴へ積む。
function updateStateWithRace(state, race, params = DEFAULT_PARAMS) {
  if (!isSettledRace(race)) return;
  const starts = startsByBoat(race);
  for (const finisher of race.finishers) {
    const registerNo = String(finisher.registerNo || "");
    const boat = Number(finisher.boat);
    const rank = Number(finisher.rank);
    if (!/^\d{4}$/.test(registerNo) || !(boat >= 1 && boat <= 6) || !(rank >= 1 && rank <= 6)) continue;
    const record = racerRecord(state, registerNo);
    record.frames[boat] = record.frames[boat] || [];
    pushCapped(record.frames[boat], rank, params.windowSize);
    const start = starts.get(boat);
    if (isValidStart(start) && start.course >= 1 && start.course <= 6) {
      record.courseSt[start.course] = record.courseSt[start.course] || [];
      pushCapped(record.courseSt[start.course], start.st, params.stWindowSize);
    }
    if (race.date && race.date > record.lastDate) record.lastDate = race.date;
  }
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value, digits = 4) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

// entriesByBoat: {1: "4321", 2: "5012", ...}。不明な艇は null。
// 枠なり進入を前提に、n号艇のコース別平均STはnコースの記録を使う。
function evaluateEntries(state, entriesByBoat, params = DEFAULT_PARAMS) {
  const boats = [1, 2, 3, 4, 5, 6].map((boat) => {
    const registerNo = entriesByBoat[boat] || null;
    const record = registerNo ? state.get(registerNo) : null;
    const frameRanks = record?.frames?.[boat] || [];
    const stList = record?.courseSt?.[boat] || [];
    return {
      boat,
      registerNo,
      frameSamples: frameRanks.length,
      frameWins: frameRanks.filter((rank) => rank === 1).length,
      stSamples: stList.length,
      avgSt: stList.length >= params.minStSamples ? round(average(stList)) : null
    };
  });

  const one = boats[0];
  const others = boats.slice(1);
  const unknownBoats = boats.filter((boat) => !boat.registerNo).map((boat) => boat.boat);

  if (!one.registerNo) {
    return { status: "boat1-unknown", boats, unknownBoats };
  }
  // 選手不明の艇を「弱い相手」とみなすと、完走したか（レース後の情報）で対象が変わるため判定しない。
  if (unknownBoats.length) {
    return { status: "other-boat-unknown", boats, unknownBoats };
  }
  if (one.frameSamples < params.boatOneMinFrameSamples) {
    return { status: "boat1-insufficient-history", boats, unknownBoats };
  }
  // 「各自の枠の過去10走」がそろわない相手は、勝ち数が少なく見えるだけなので判定しない。
  if (others.some((boat) => boat.frameSamples < params.windowSize)) {
    return { status: "other-boat-insufficient-history", boats, unknownBoats };
  }

  const boatOneStrong = one.frameWins >= params.boatOneMinWins;
  const othersWeak = others.every((boat) => boat.frameWins <= params.othersMaxWins);
  const filter1 = boatOneStrong && othersWeak;

  // 5艇すべての平均STがそろわなければ「最速」とは判定しない。
  const stComparable = one.avgSt !== null && others.every((boat) => boat.avgSt !== null);
  const boatOneStTop = stComparable && others.every((boat) => one.avgSt <= boat.avgSt);
  const wallBoats = [boats[1], boats[2]];
  const wallHolds = one.avgSt !== null &&
    wallBoats.every((boat) => boat.avgSt !== null && round(boat.avgSt - one.avgSt) <= params.wallMarginSec);

  return {
    status: "evaluated",
    boats,
    unknownBoats,
    checks: { boatOneStrong, othersWeak, stComparable, boatOneStTop, wallHolds },
    filter1,
    filter12: filter1 && boatOneStTop,
    filter12wall: filter1 && boatOneStTop && wallHolds
  };
}

function entriesFromResult(race) {
  const entries = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
  for (const finisher of race.finishers || []) {
    const boat = Number(finisher.boat);
    if (boat >= 1 && boat <= 6 && /^\d{4}$/.test(String(finisher.registerNo || ""))) {
      entries[boat] = String(finisher.registerNo);
    }
  }
  return entries;
}

// 返還艇: フライング・出遅れ・欠場（スタート記録なし）。その艇を含む舟券は返還。
function refundedBoats(race) {
  const starts = race.starts || [];
  if (!starts.length) return new Set();
  const map = startsByBoat(race);
  const refunded = new Set();
  for (let boat = 1; boat <= 6; boat += 1) {
    const start = map.get(boat);
    if (!start || start.falseStart || start.lateStart) refunded.add(boat);
  }
  return refunded;
}

function settleTickets(race, tickets, unit = 100) {
  const refunded = refundedBoats(race);
  const winning = race.trifecta.boats.join("-");
  let stake = 0;
  let returned = 0;
  let hit = false;
  let refundedTickets = 0;
  for (const ticket of tickets) {
    if (ticket.some((boat) => refunded.has(boat))) {
      refundedTickets += 1;
      continue; // 返還券は購入額・払戻ともに計上しない
    }
    stake += unit;
    if (ticket.join("-") === winning) {
      hit = true;
      returned += Number(race.trifecta.payout) * (unit / 100);
    }
  }
  return { stake, returned, hit, refundedTickets };
}

function emptyCohort() {
  return {
    races: 0,
    boatOneWins: 0,
    secondWhenBoatOneWins: { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    formations: Object.fromEntries(Object.keys(FORMATIONS).map((key) => [key, {
      stake: 0, returned: 0, hitRaces: 0, playedRaces: 0, torigamiHits: 0, fullyRefundedRaces: 0
    }]))
  };
}

const EXPANDED = Object.fromEntries(
  Object.entries(FORMATIONS).map(([key, formation]) => [key, expandFormation(formation)])
);

function addRaceToCohort(cohort, race) {
  cohort.races += 1;
  const [first, second] = race.trifecta.boats;
  if (first === 1) {
    cohort.boatOneWins += 1;
    if (cohort.secondWhenBoatOneWins[second] !== undefined) cohort.secondWhenBoatOneWins[second] += 1;
  }
  for (const [key, tickets] of Object.entries(EXPANDED)) {
    const result = settleTickets(race, tickets);
    const bucket = cohort.formations[key];
    if (result.stake === 0) {
      bucket.fullyRefundedRaces += 1;
      continue;
    }
    bucket.playedRaces += 1;
    bucket.stake += result.stake;
    bucket.returned += result.returned;
    if (result.hit) {
      bucket.hitRaces += 1;
      if (result.returned < result.stake) bucket.torigamiHits += 1;
    }
  }
}

function summarizeCohort(cohort) {
  const pct = (num, den) => (den ? round((num / den) * 100, 1) : null);
  const winCount = cohort.boatOneWins;
  return {
    races: cohort.races,
    boatOneWinRatePct: pct(winCount, cohort.races),
    secondPlaceWhenBoatOneWinsPct: Object.fromEntries(
      Object.entries(cohort.secondWhenBoatOneWins).map(([boat, count]) => [boat, pct(count, winCount)])
    ),
    formations: Object.fromEntries(Object.entries(cohort.formations).map(([key, bucket]) => [key, {
      label: FORMATIONS[key].label,
      playedRaces: bucket.playedRaces,
      fullyRefundedRaces: bucket.fullyRefundedRaces,
      hitRaces: bucket.hitRaces,
      hitRatePct: pct(bucket.hitRaces, bucket.playedRaces),
      stakeYen: bucket.stake,
      returnedYen: bucket.returned,
      roiPct: pct(bucket.returned, bucket.stake),
      torigamiHitSharePct: pct(bucket.torigamiHits, bucket.hitRaces)
    }]))
  };
}

// 直前情報（当日運用向け）。公式APIの startExhibition / entries[].exhibition.displayTime を使う。
// 閾値は動画に数値がないため仮置きで、過去原本では未検証。
// 0.01秒単位の値を整数で比べ、境界（ちょうど0.05秒など）を浮動小数点の誤差で外さない。
function hundredths(value) {
  return Math.round(value * 100);
}

function evaluateExhibition(apiRace, params = DEFAULT_PARAMS) {
  const startRows = Array.isArray(apiRace?.startExhibition) ? apiRace.startExhibition : [];
  const exStByBoat = new Map();
  const exCourseByBoat = new Map();
  for (const row of startRows) {
    // 公式のスタート展示画像から読めた進入だけを使う（legacy-course-order の仮の枠なり行は使わない）。
    if (row?.isOfficialCourse !== true) continue;
    if (!Number.isInteger(row?.boat) || typeof row.st !== "number") continue;
    const early = String(row.marker || "").toUpperCase().includes("F");
    exStByBoat.set(row.boat, early ? -row.st : row.st);
    if (Number.isInteger(row.course)) exCourseByBoat.set(row.boat, row.course);
  }
  const displayByBoat = new Map();
  for (const entry of apiRace?.entries || []) {
    const time = entry?.exhibition?.displayTime;
    if (Number.isInteger(entry?.boat) && typeof time === "number" && time > 0) displayByBoat.set(entry.boat, time);
  }

  const courses = new Set(exCourseByBoat.values());
  const officialCourses = exCourseByBoat.size === 6 && courses.size === 6 && [...courses].every((course) => course >= 1 && course <= 6);
  const result = { available: exStByBoat.size === 6 && officialCourses && displayByBoat.size === 6, checks: {} };
  if (!result.available) return { ...result, pass: null };

  // 過去のコース別STは枠なり前提で作っているため、6艇すべてが枠なり進入のときだけ通過させる。
  result.checks.frameOrderEntry = [1, 2, 3, 4, 5, 6].every((boat) => exCourseByBoat.get(boat) === boat);
  const neighborBest = Math.min(exStByBoat.get(2), exStByBoat.get(3));
  result.checks.noStartDent = hundredths(exStByBoat.get(1)) - hundredths(neighborBest) < hundredths(params.exhibitionDentSec);
  const outerBest = Math.min(displayByBoat.get(4), displayByBoat.get(5), displayByBoat.get(6));
  result.checks.noOuterNobi = hundredths(displayByBoat.get(1)) - hundredths(outerBest) < hundredths(params.outerNobiSec);
  result.pass = Object.values(result.checks).every(Boolean);
  return result;
}

// オッズ: oddsByTicket は {"1-2-3": 8.4, ...}。動画の見送り規則（最低オッズ×100円 ≥ 総購入額）。
// これはトリガミ回避であり、期待値プラスや回収率100%超を保証しない。
function evaluateOdds(oddsByTicket, formationKey = "f4") {
  const tickets = EXPANDED[formationKey];
  const odds = tickets.map((ticket) => Number(oddsByTicket?.[ticket.join("-")]));
  if (odds.some((value) => !Number.isFinite(value) || value <= 0)) {
    return { available: false, pass: null, tickets: tickets.length };
  }
  const minOdds = Math.min(...odds);
  return {
    available: true,
    tickets: tickets.length,
    minOdds,
    stakeYen: tickets.length * 100,
    minPayoutYen: Math.round(minOdds * 100),
    pass: minOdds * 100 >= tickets.length * 100
  };
}

module.exports = {
  VERSION,
  DEFAULT_PARAMS,
  FORMATIONS,
  expandFormation,
  createState,
  updateStateWithRace,
  evaluateEntries,
  entriesFromResult,
  refundedBoats,
  settleTickets,
  isSettledRace,
  emptyCohort,
  addRaceToCohort,
  summarizeCohort,
  evaluateExhibition,
  evaluateOdds
};
