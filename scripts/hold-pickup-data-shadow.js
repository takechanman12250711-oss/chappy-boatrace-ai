"use strict";

/*
  2着残し・3着拾いの「データ併用」比較用（shadow）評価。

  現行の buildHoldPickupTheory（js/ai-core.js）は、最有力展開と
  進入コースの固定表だけで 2着・3着候補の点数を決めており、
  ST・展示・当地・技量・モーターを見ていない。そのため同じ展開の
  レースでは 2着・3着候補がほぼ毎回同じになる。

  ここでは現行点数を残したまま、各艇の保存済み指数を加えた
  比較用の順位を作る。本番の予想・保存原本・note には一切使わない
  （usableForPrediction=false / automaticApplication=false）。

  データ側の重みは憲章の優先順（展開→コース→ST/スリット→
  展示/足→残し/拾い→当地/水面→技量→モーター）に合わせ、
  結果を見る前に固定した値を使う。
*/

const VERSION = "hold-pickup-data-shadow-v1";

const DATA_WEIGHTS = Object.freeze({
  hold: Object.freeze({
    courseTop3: 0.25,
    st: 0.22,
    exhibition: 0.22,
    local: 0.12,
    national: 0.11,
    motor: 0.08
  }),
  pickup: Object.freeze({
    courseTop3: 0.2,
    st: 0.15,
    exhibition: 0.25,
    raceFlow: 0.12,
    local: 0.1,
    national: 0.1,
    motor: 0.08
  })
});

// 現行（コース構造）点数とデータ点数の混ぜ方。0.5 = 半々。
const DEFAULT_DATA_SHARE = 0.5;
// コース別3連対率の実績が少ない選手は全体平均へ寄せる。
const COURSE_PRIOR_RATE = 50;
const COURSE_PRIOR_STARTS = 10;

const num = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const round1 = (value) => Math.round(value * 10) / 10;

function courseTop3Score(analysis) {
  const history =
    analysis?.racerSkillTheory?.courseHistory?.all3Years || {};
  const starts = num(history.starts, 0);
  const rate = num(history.top3Rate, null);

  if (!starts || rate === null) return COURSE_PRIOR_RATE;

  return (
    (rate * starts + COURSE_PRIOR_RATE * COURSE_PRIOR_STARTS) /
    (starts + COURSE_PRIOR_STARTS)
  );
}

function dataScore(analysis, role) {
  const weights = DATA_WEIGHTS[role];
  const indexes = analysis?.indexes || {};
  let sum = 0;
  let used = 0;
  const parts = {};

  for (const [key, weight] of Object.entries(weights)) {
    const value =
      key === "courseTop3"
        ? courseTop3Score(analysis)
        : num(indexes[key], null);

    if (value === null) continue;
    parts[key] = round1(value);
    sum += clamp(value, 0, 100) * weight;
    used += weight;
  }

  return {
    score: used > 0 ? round1(sum / used) : 50,
    coverage: round1(used),
    parts
  };
}

function baselineRole(analysis, role) {
  const theory = analysis?.holdPickupTheory?.[role] || {};

  return {
    score: num(theory.score, 1),
    isAdopted: theory.isAdopted === true
  };
}

function courseOf(basis, boatNo) {
  return num(basis?.courseMapping?.byBoat?.[String(boatNo)], boatNo);
}

/*
  現行の rankRole と同じ並び（点数降順→内コース優先）で
  採用済み（65点以上）の艇を並べる。
*/
function baselineRanking(basis, role, limit) {
  const head = num(basis?.raceScenarios?.headBoatNo, 0);

  return (basis?.analyses || [])
    .map((analysis) => ({
      boatNo: num(analysis?.boatNo, 0),
      course: courseOf(basis, analysis?.boatNo),
      ...baselineRole(analysis, role)
    }))
    .filter(
      (row) =>
        row.boatNo >= 1 &&
        row.boatNo <= 6 &&
        row.boatNo !== head &&
        row.isAdopted
    )
    .sort((a, b) => b.score - a.score || a.course - b.course)
    .slice(0, limit)
    .map((row) => row.boatNo);
}

/*
  データ併用の並び。1着軸以外の5艇すべてを対象にし、
  現行点数（展開に合わない艇は1点）とデータ点数を混ぜる。
  候補数は現行と同じにして、点数（購入額）をそろえて比べる。
*/
function dataRanking(
  basis,
  role,
  limit,
  dataShare = DEFAULT_DATA_SHARE,
  ineligibleFloor = null
) {
  const head = num(basis?.raceScenarios?.headBoatNo, 0);

  return (basis?.analyses || [])
    .map((analysis) => {
      const boatNo = num(analysis?.boatNo, 0);
      const base = baselineRole(analysis, role);
      const data = dataScore(analysis, role);
      // 探索用：展開の固定表で外れた艇（1点）にも下限点を与え、
      // データが強ければ候補に入れるようにする。null なら現行どおり。
      const baseScore =
        ineligibleFloor === null
          ? base.score
          : Math.max(base.score, ineligibleFloor);

      return {
        boatNo,
        course: courseOf(basis, boatNo),
        score:
          baseScore * (1 - dataShare) +
          data.score * dataShare
      };
    })
    .filter(
      (row) =>
        row.boatNo >= 1 &&
        row.boatNo <= 6 &&
        row.boatNo !== head
    )
    .sort((a, b) => b.score - a.score || a.course - b.course)
    .slice(0, limit)
    .map((row) => row.boatNo);
}

/*
  noteの先頭3点と同じ組み方：2着候補を上から順に、
  それと重ならない最上位の3着候補を組み合わせる。
*/
function mainTickets(head, holds, pickups, limit = 3) {
  const tickets = [];

  for (const hold of holds) {
    const pickup = pickups.find(
      (boatNo) => boatNo !== hold && boatNo !== head
    );
    if (!pickup) continue;
    const ticket = `${head}-${hold}-${pickup}`;
    if (!tickets.includes(ticket)) tickets.push(ticket);
    if (tickets.length >= limit) break;
  }

  return tickets;
}

/* 1着軸 → 2着候補 → 3着候補 のフォーメーション全券 */
function formationTickets(head, holds, pickups) {
  const tickets = [];

  for (const hold of holds) {
    for (const pickup of pickups) {
      if (pickup === hold || pickup === head) continue;
      tickets.push(`${head}-${hold}-${pickup}`);
    }
  }

  return [...new Set(tickets)];
}

function evaluateRace(basis, options = {}) {
  const head = num(basis?.raceScenarios?.headBoatNo, 0);
  const analyses = basis?.analyses || [];

  if (!head || analyses.length !== 6) return null;

  const scenarioType =
    basis?.raceScenarios?.mainScenario?.type || "";
  const baselineHold = baselineRanking(basis, "hold", 3);
  const baselinePickup = baselineRanking(basis, "pickup", 4);

  if (!baselineHold.length || !baselinePickup.length) return null;

  const share = num(options.dataShare, DEFAULT_DATA_SHARE);
  const floor = num(options.ineligibleFloor, null);
  const dataHold = dataRanking(
    basis,
    "hold",
    baselineHold.length,
    share,
    floor
  );
  const dataPickup = dataRanking(
    basis,
    "pickup",
    baselinePickup.length,
    share,
    floor
  );

  return {
    head,
    scenarioType,
    baseline: {
      hold: baselineHold,
      pickup: baselinePickup,
      main: mainTickets(head, baselineHold, baselinePickup),
      formation: formationTickets(
        head,
        baselineHold,
        baselinePickup
      )
    },
    data: {
      hold: dataHold,
      pickup: dataPickup,
      main: mainTickets(head, dataHold, dataPickup),
      formation: formationTickets(head, dataHold, dataPickup)
    }
  };
}

module.exports = {
  VERSION,
  DATA_WEIGHTS,
  DEFAULT_DATA_SHARE,
  courseTop3Score,
  dataScore,
  baselineRanking,
  dataRanking,
  mainTickets,
  formationTickets,
  evaluateRace
};
