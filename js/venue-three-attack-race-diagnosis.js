"use strict";

const theoryPerformance = require("./theory-performance-report");

const TARGET_SCENARIO = "threeAttack";
const FOCUS_VENUES = Object.freeze([
  ["06", "浜名湖", "loss-focus"],
  ["16", "児島", "loss-focus"],
  ["20", "若松", "positive-control"]
]);

function pct(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : null;
}

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length === 3 && new Set(boats).size === 3 ? boats.join("-") : "";
}

function practicalTickets(record = {}) {
  const verified = record?.result?.verification?.practicalTickets;
  const source = Array.isArray(verified)
    ? verified
    : Array.isArray(record?.prediction?.practicalTickets)
      ? record.prediction.practicalTickets
      : [];
  return [...new Set(source.map(item => normalizeTicket(
    item && typeof item === "object" ? item.ticket || item.combination : item
  )).filter(Boolean))];
}

function theoryClaims(record = {}) {
  const prediction = record?.prediction || {};
  const evidence = prediction?.verificationEvidence || prediction?.practicalSelection?.verificationEvidence || {};
  const rows = Array.isArray(evidence?.theoryClaims) ? evidence.theoryClaims : [];
  return rows.map(row => ({
    theoryKey: String(row?.theoryKey || row?.key || "").trim(),
    label: String(row?.label || row?.theoryLabel || row?.theoryKey || row?.key || "").trim(),
    formal: row?.formal === true
  })).filter(row => row.theoryKey);
}

function finishCoverage(actualTicket, tickets) {
  const actual = String(actualTicket || "").split("-");
  const rows = tickets.map(ticket => ticket.split("-"));
  const positionCovered = actual.map((boat, index) => rows.some(ticket => ticket[index] === boat));
  const prefixCovered = actual.map((boat, index) => rows.some(ticket =>
    actual.slice(0, index + 1).every((expected, position) => ticket[position] === expected)
  ));
  const firstDivergence = prefixCovered[0]
    ? prefixCovered[1]
      ? prefixCovered[2] ? "HIT" : "THIRD_POSITION"
      : "SECOND_POSITION"
    : "HEAD_POSITION";
  return { positionCovered, prefixCovered, firstDivergence };
}

function raceRow(record = {}) {
  const primary = theoryPerformance.primaryScenarioOf(record);
  const jcd = String(record?.jcd || "").padStart(2, "0");
  if (primary.scenarioKey !== TARGET_SCENARIO || !FOCUS_VENUES.some(row => row[0] === jcd)) return null;
  const actualTicket = normalizeTicket(record?.result?.resultTicket || record?.result?.verification?.resultTicket);
  if (!actualTicket || record?.result?.settled !== true) return null;
  const tickets = practicalTickets(record);
  const payout = Number(record?.result?.payout || record?.result?.payoutPer100 || 0);
  const hit = tickets.includes(actualTicket);
  const order = actualTicket.split("-");
  const coverage = finishCoverage(actualTicket, tickets);
  const claims = theoryClaims(record);
  return {
    raceKey: String(record?.raceKey || record?.__analysisRaceKey || ""),
    date: String(record?.date || ""),
    jcd,
    place: String(record?.place || FOCUS_VENUES.find(row => row[0] === jcd)?.[1] || ""),
    raceNo: Number(record?.raceNo || 0),
    scenarioKey: primary.scenarioKey,
    scenarioLabel: primary.scenarioLabel,
    actualTicket,
    winningMethod: String(record?.result?.winningMethod || ""),
    payout,
    ticketCount: tickets.length,
    stake: tickets.length * 100,
    return: hit ? payout : 0,
    hit,
    actualHead: order[0],
    actualSecond: order[1],
    actualThird: order[2],
    boat3Finish: order.indexOf("3") >= 0 ? order.indexOf("3") + 1 : null,
    firstDivergence: coverage.firstDivergence,
    positionCovered: coverage.positionCovered,
    prefixCovered: coverage.prefixCovered,
    theoryClaims: claims
  };
}

function countBy(rows, valueFn) {
  const counts = new Map();
  rows.forEach(row => {
    const value = String(valueFn(row) ?? "").trim();
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function claimSummary(rows) {
  const groups = new Map();
  rows.forEach(row => row.theoryClaims.forEach(claim => {
    if (!groups.has(claim.theoryKey)) groups.set(claim.theoryKey, {
      theoryKey: claim.theoryKey,
      label: claim.label || claim.theoryKey,
      raceKeys: new Set(),
      hitRaceKeys: new Set(),
      missRaceKeys: new Set(),
      formalRaceKeys: new Set()
    });
    const group = groups.get(claim.theoryKey);
    group.raceKeys.add(row.raceKey);
    (row.hit ? group.hitRaceKeys : group.missRaceKeys).add(row.raceKey);
    if (claim.formal) group.formalRaceKeys.add(row.raceKey);
  }));
  return [...groups.values()].map(group => ({
    theoryKey: group.theoryKey,
    label: group.label,
    raceCount: group.raceKeys.size,
    hitRaceCount: group.hitRaceKeys.size,
    missRaceCount: group.missRaceKeys.size,
    formalRaceCount: group.formalRaceKeys.size,
    hitRate: pct(group.hitRaceKeys.size, group.raceKeys.size)
  })).sort((a, b) => b.raceCount - a.raceCount || a.theoryKey.localeCompare(b.theoryKey));
}

function median(values) {
  const rows = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  return rows.length % 2 ? rows[middle] : Math.round((rows[middle - 1] + rows[middle]) * 5) / 10;
}

function summarizeVenue(jcd, place, role, rows) {
  const scoped = rows.filter(row => row.jcd === jcd);
  const hits = scoped.filter(row => row.hit);
  const stake = scoped.reduce((sum, row) => sum + row.stake, 0);
  const totalReturn = scoped.reduce((sum, row) => sum + row.return, 0);
  const highestHit = hits.slice().sort((a, b) => b.return - a.return || a.raceKey.localeCompare(b.raceKey))[0] || null;
  const returnWithoutHighest = totalReturn - Number(highestHit?.return || 0);
  return {
    jcd,
    place,
    role,
    raceCount: scoped.length,
    hitCount: hits.length,
    hitRate: pct(hits.length, scoped.length),
    stake,
    return: totalReturn,
    profit: totalReturn - stake,
    recoveryRate: pct(totalReturn, stake),
    ticketCount: {
      minimum: scoped.length ? Math.min(...scoped.map(row => row.ticketCount)) : null,
      maximum: scoped.length ? Math.max(...scoped.map(row => row.ticketCount)) : null,
      median: median(scoped.map(row => row.ticketCount)),
      average: scoped.length ? Math.round(scoped.reduce((sum, row) => sum + row.ticketCount, 0) / scoped.length * 10) / 10 : null
    },
    payoutDependence: {
      hitPayoutMedian: median(hits.map(row => row.payout)),
      highestHit: highestHit ? { raceKey: highestHit.raceKey, ticket: highestHit.actualTicket, payout: highestHit.payout } : null,
      highestHitReturnShare: pct(Number(highestHit?.return || 0), totalReturn),
      recoveryRateWithoutHighestHit: pct(returnWithoutHighest, stake),
      noHitReturn: hits.length === 0
    },
    actualHeads: countBy(scoped, row => row.actualHead),
    hitTickets: countBy(hits, row => row.actualTicket),
    winningMethods: countBy(scoped, row => row.winningMethod || "不明"),
    boat3Finish: {
      first: scoped.filter(row => row.boat3Finish === 1).length,
      second: scoped.filter(row => row.boat3Finish === 2).length,
      third: scoped.filter(row => row.boat3Finish === 3).length,
      outsideTop3: scoped.filter(row => row.boat3Finish === null).length
    },
    firstDivergence: countBy(scoped, row => row.firstDivergence),
    theoryClaims: claimSummary(scoped),
    races: scoped
  };
}

function compactComparison(venue) {
  return {
    jcd: venue.jcd,
    place: venue.place,
    raceCount: venue.raceCount,
    hitRate: venue.hitRate,
    recoveryRate: venue.recoveryRate,
    medianTicketCount: venue.ticketCount.median,
    highestHitReturnShare: venue.payoutDependence.highestHitReturnShare,
    recoveryRateWithoutHighestHit: venue.payoutDependence.recoveryRateWithoutHighestHit,
    boat3FirstRate: pct(venue.boat3Finish.first, venue.raceCount),
    headDivergenceRate: pct(venue.firstDivergence.find(row => row.key === "HEAD_POSITION")?.count || 0, venue.raceCount)
  };
}

function build(records = [], options = {}) {
  const rows = records.map(raceRow).filter(Boolean).sort((a, b) => a.raceKey.localeCompare(b.raceKey));
  const venues = FOCUS_VENUES.map(([jcd, place, role]) => summarizeVenue(jcd, place, role, rows));
  const control = venues.find(row => row.role === "positive-control");
  return {
    schemaVersion: 1,
    analysisId: "venue-three-attack-race-diagnosis-v1",
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: options.sourceGeneratedAt || null,
    source: "official pre-deadline predictions joined to official results",
    analysisInputContract: options.analysisInputContract || null,
    targetScenario: { key: TARGET_SCENARIO, label: "3コース攻め" },
    productionChanged: false,
    automaticProductionChange: false,
    usableForPrediction: false,
    retrospectiveDiagnosisOnly: true,
    metricDefinitions: {
      raceCount: "保存済み締切前予想の主展開が3コース攻めで、公式3連単結果と結合できたレース数",
      hitRate: "保存済み実戦買い目に公式3連単が含まれた割合。既存の理論別中央値とは別指標",
      recoveryRate: "保存済み実戦買い目を1点100円で購入した場合の払戻率。理論別買い目は合算しない",
      firstDivergence: "公式着順と保存買い目を先頭から比較した最初の不一致位置",
      payoutDependence: "的中払戻のうち最高1件の寄与率と、その1件を除いた診断上の回収率"
    },
    diagnostics: options.diagnostics || null,
    focusVenueCount: venues.length,
    raceCount: rows.length,
    venues,
    positiveControl: control ? compactComparison(control) : null,
    comparisons: venues.filter(row => row.role === "loss-focus").map(row => ({
      venue: compactComparison(row),
      control: control ? compactComparison(control) : null,
      deltaVsControl: control ? {
        hitRate: row.hitRate === null || control.hitRate === null ? null : Math.round((row.hitRate - control.hitRate) * 10) / 10,
        recoveryRate: row.recoveryRate === null || control.recoveryRate === null ? null : Math.round((row.recoveryRate - control.recoveryRate) * 10) / 10,
        medianTicketCount: row.ticketCount.median === null || control.ticketCount.median === null ? null : row.ticketCount.median - control.ticketCount.median,
        boat3FirstRate: row.raceCount && control.raceCount ? Math.round((row.boat3Finish.first / row.raceCount - control.boat3Finish.first / control.raceCount) * 1000) / 10 : null
      } : null
    })),
    limitations: [
      "結果後に買い目・理論claim・展開判定を作り直さず、保存済み締切前予想だけを使用する。",
      "高配当依存は最高的中払戻の寄与と除外時回収率を診断表示するだけで、買い目の採否条件には使わない。",
      "発見期間の場差をそのまま本番ルールや正式検証の合格根拠に使わない。"
    ]
  };
}

module.exports = {
  TARGET_SCENARIO,
  FOCUS_VENUES,
  pct,
  normalizeTicket,
  practicalTickets,
  theoryClaims,
  finishCoverage,
  raceRow,
  countBy,
  claimSummary,
  median,
  summarizeVenue,
  compactComparison,
  build
};
