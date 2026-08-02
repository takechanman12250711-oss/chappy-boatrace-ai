"use strict";

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function resultOrder(result = {}) {
  const ticket = normalizeTicket(result?.trifecta?.combination);
  if (ticket) return ticket.split("-").map(Number);
  return (Array.isArray(result?.finishers) ? result.finishers : [])
    .slice()
    .sort((a, b) => Number(a?.rank || a?.place || 99) - Number(b?.rank || b?.place || 99))
    .map(row => Number(row?.boat || row?.boatNo || row?.lane || 0))
    .filter(boat => boat >= 1 && boat <= 6)
    .slice(0, 3);
}

function methodMatches(type, winningMethod) {
  const scenario = String(type || "").toLowerCase();
  const method = String(winningMethod || "");
  if (!method) return null;
  if (/escape|nige|逃げ/.test(scenario)) return /逃げ/.test(method);
  if (/makuri-sashi|まくり差し/.test(scenario)) return /まくり差し/.test(method);
  if (/makuri|まくり/.test(scenario)) return /まくり/.test(method) && !/まくり差し/.test(method);
  if (/sashi|差し/.test(scenario)) return /差し/.test(method) && !/まくり差し/.test(method);
  return null;
}

function verifyScenario(scenario = {}, result = {}) {
  const predicted = Array.isArray(scenario?.finishOrder)
    ? scenario.finishOrder.map(Number).filter(Boolean).slice(0, 3)
    : normalizeTicket(scenario?.representativeTicket).split("-").map(Number).filter(Boolean);
  const actual = resultOrder(result);
  const exact = predicted.length === 3 && actual.length === 3 && predicted.every((boat, i) => boat === actual[i]);
  const firstHit = Boolean(predicted[0] && actual[0] && predicted[0] === actual[0]);
  const top2Hit = predicted.length >= 2 && actual.length >= 2 && predicted.slice(0, 2).every(boat => actual.slice(0, 2).includes(boat));
  const winningMethodMatch = methodMatches(scenario?.scenarioType, result?.winningMethod);
  let status = "miss";
  if (exact) status = "exact";
  else if (firstHit) status = "first-hit";
  else if (top2Hit) status = "top2-boats";
  const breakReasons = [];
  if (!firstHit && predicted[0]) breakReasons.push(`想定頭${predicted[0]}号艇が1着ではなかった`);
  if (firstHit && !exact) breakReasons.push("相手または着順が想定と異なった");
  if (winningMethodMatch === false) breakReasons.push(`決まり手が想定展開と不一致（実際：${String(result?.winningMethod || "不明")}）`);
  if (!actual.length) breakReasons.push("公式着順を取得できない");
  return {
    rank: Number(scenario?.rank || 0) || null,
    scenarioType: String(scenario?.scenarioType || ""),
    likelihood: Number(scenario?.likelihood || 0),
    predictedOrder: predicted,
    actualOrder: actual,
    status,
    exact,
    firstHit,
    top2Hit,
    winningMethod: String(result?.winningMethod || ""),
    winningMethodMatch,
    breakReasons
  };
}

function verify(snapshot = {}, result = {}) {
  const rows = (Array.isArray(snapshot?.scenarios) ? snapshot.scenarios : []).map(row => verifyScenario(row, result));
  const exactRows = rows.filter(row => row.exact);
  const firstRows = rows.filter(row => row.firstHit);
  const best = exactRows[0] || firstRows[0] || rows.find(row => row.top2Hit) || null;
  const actual = resultOrder(result);
  return {
    version: "6.0.0-verification",
    status: !actual.length ? "result-unavailable" : rows.length ? "verified" : "scenario-unavailable",
    scenarioCount: rows.length,
    exactCount: exactRows.length,
    firstHitCount: firstRows.length,
    topCandidateExact: Boolean(rows[0]?.exact),
    topCandidateFirstHit: Boolean(rows[0]?.firstHit),
    exactWithinCandidates: exactRows.length > 0,
    firstHitWithinCandidates: firstRows.length > 0,
    matchedRank: best?.rank || null,
    actualOrder: actual,
    winningMethod: String(result?.winningMethod || ""),
    scenarios: rows,
    usableForPrediction: false,
    automaticApplication: false
  };
}

function buildSummary(rows = []) {
  const verified = rows.filter(row => row?.status === "verified");
  const exact = verified.filter(row => row?.exactWithinCandidates);
  const topExact = verified.filter(row => row?.topCandidateExact);
  const first = verified.filter(row => row?.firstHitWithinCandidates);
  return {
    verifiedCount: verified.length,
    exactWithinCandidatesCount: exact.length,
    exactWithinCandidatesRate: verified.length ? Math.round(exact.length / verified.length * 1000) / 10 : 0,
    topCandidateExactCount: topExact.length,
    topCandidateExactRate: verified.length ? Math.round(topExact.length / verified.length * 1000) / 10 : 0,
    firstHitWithinCandidatesCount: first.length,
    firstHitWithinCandidatesRate: verified.length ? Math.round(first.length / verified.length * 1000) / 10 : 0,
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { verify, verifyScenario, buildSummary, resultOrder, methodMatches };
