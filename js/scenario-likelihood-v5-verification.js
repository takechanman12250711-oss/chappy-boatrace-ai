"use strict";

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function actualScenario(result) {
  const ticket = normalizeTicket(result?.trifecta?.combination);
  const winner = Number(ticket.split("-")[0] || 0);
  const method = String(result?.winningMethod || "").trim();
  if (winner === 1 && /逃げ/.test(method)) return { key: "inEscape", label: "1逃げ" };
  if (winner === 2 && /差し/.test(method)) return { key: "course2Sashi", label: "2差し" };
  if (winner === 3 && /まくり|まくり差し|差し/.test(method)) return { key: "course3Attack", label: "3攻め" };
  if (winner === 4 && /まくり|まくり差し|差し/.test(method)) return { key: "course4Kado", label: "4カド" };
  return null;
}

function verify(shadow, result) {
  const actual = actualScenario(result);
  const scenarios = Array.isArray(shadow?.scenarios) ? shadow.scenarios : [];
  const leader = shadow?.leader || null;
  const runnerUp = shadow?.runnerUp || null;
  if (!actual || !scenarios.length || !leader?.key) {
    return {
      comparable: false,
      actualScenario: actual,
      leaderHit: false,
      top2Hit: false,
      ambiguity: String(shadow?.ambiguity || ""),
      reason: !actual ? "公式結果から4展開を一意に判定できない" : "展開AI v5の保存データが不足"
    };
  }
  const actualRow = scenarios.find(row => row?.key === actual.key) || null;
  return {
    comparable: true,
    actualScenario: actual,
    predictedLeader: {
      key: String(leader.key || ""),
      label: String(leader.label || ""),
      relativeLikelihood: Number(leader.relativeLikelihood || 0)
    },
    predictedRunnerUp: runnerUp ? {
      key: String(runnerUp.key || ""),
      label: String(runnerUp.label || ""),
      relativeLikelihood: Number(runnerUp.relativeLikelihood || 0)
    } : null,
    actualRelativeLikelihood: Number(actualRow?.relativeLikelihood || 0),
    leaderHit: leader.key === actual.key,
    top2Hit: leader.key === actual.key || runnerUp?.key === actual.key,
    likelihoodGap: Number(shadow?.likelihoodGap || 0),
    ambiguity: String(shadow?.ambiguity || ""),
    status: "shadow-verification"
  };
}

function buildSummary(rows) {
  const comparable = (Array.isArray(rows) ? rows : []).filter(row => row?.comparable === true);
  const leaderHits = comparable.filter(row => row.leaderHit).length;
  const top2Hits = comparable.filter(row => row.top2Hit).length;
  const byAmbiguity = {};
  comparable.forEach(row => {
    const key = String(row.ambiguity || "unknown");
    const bucket = byAmbiguity[key] || { count: 0, leaderHits: 0, top2Hits: 0 };
    bucket.count += 1;
    if (row.leaderHit) bucket.leaderHits += 1;
    if (row.top2Hit) bucket.top2Hits += 1;
    byAmbiguity[key] = bucket;
  });
  Object.values(byAmbiguity).forEach(bucket => {
    bucket.leaderHitRate = bucket.count ? Math.round(bucket.leaderHits / bucket.count * 1000) / 10 : 0;
    bucket.top2HitRate = bucket.count ? Math.round(bucket.top2Hits / bucket.count * 1000) / 10 : 0;
  });
  return {
    comparableCount: comparable.length,
    leaderHits,
    leaderHitRate: comparable.length ? Math.round(leaderHits / comparable.length * 1000) / 10 : 0,
    top2Hits,
    top2HitRate: comparable.length ? Math.round(top2Hits / comparable.length * 1000) / 10 : 0,
    byAmbiguity
  };
}

module.exports = { actualScenario, verify, buildSummary };
