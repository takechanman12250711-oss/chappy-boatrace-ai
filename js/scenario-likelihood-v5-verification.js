"use strict";

const SCENARIO_KEYS = [
  "inEscape",
  "course2Sashi",
  "course3Attack",
  "course4Kado"
];

const SCENARIO_KEY_ALIASES = Object.freeze({
  inEscape: "inEscape",
  escape: "inEscape",
  oneEscape: "inEscape",
  escape_1: "inEscape",
  course2Sashi: "course2Sashi",
  sashi: "course2Sashi",
  twoSashi: "course2Sashi",
  sashi_2: "course2Sashi",
  course3Attack: "course3Attack",
  threeAttack: "course3Attack",
  attack_3: "course3Attack",
  course4Kado: "course4Kado",
  fourAttack: "course4Kado",
  attack_4: "course4Kado"
});

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function canonicalScenarioKey(value) {
  const key = String(value || "").trim();
  return SCENARIO_KEY_ALIASES[key] || key;
}

function isCompleteScenarioSet(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length !== SCENARIO_KEYS.length) {
    return false;
  }
  const keys = scenarios.map(row => canonicalScenarioKey(row?.key));
  return (
    new Set(keys).size === SCENARIO_KEYS.length &&
    keys.every(key => SCENARIO_KEYS.includes(key))
  );
}

function actualScenario(result) {
  const ticket = normalizeTicket(
    result?.trifecta?.combination || result?.resultTicket
  );
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
  const actualKey = canonicalScenarioKey(actual?.key);
  const leaderKey = canonicalScenarioKey(leader?.key);
  const runnerUpKey = canonicalScenarioKey(runnerUp?.key);
  const completeScenarioSet = isCompleteScenarioSet(scenarios);
  const recognizedLeaders =
    SCENARIO_KEYS.includes(leaderKey) &&
    SCENARIO_KEYS.includes(runnerUpKey);
  if (!actual || !completeScenarioSet || !recognizedLeaders) {
    return {
      comparable: false,
      actualScenario: actual,
      leaderHit: false,
      top2Hit: false,
      ambiguity: String(shadow?.ambiguity || ""),
      reason: !actual
        ? "公式結果から4展開を一意に判定できない"
        : "展開AI v5の4展開保存データが不足または形式不一致"
    };
  }
  const actualRow = scenarios.find(
    row => canonicalScenarioKey(row?.key) === actualKey
  ) || null;
  if (!actualRow) {
    return {
      comparable: false,
      actualScenario: {
        ...actual,
        key: actualKey
      },
      leaderHit: false,
      top2Hit: false,
      ambiguity: String(shadow?.ambiguity || ""),
      reason: "展開AI v5に公式展開と対応する保存データがない"
    };
  }
  return {
    comparable: true,
    actualScenario: {
      ...actual,
      key: actualKey
    },
    predictedLeader: {
      key: leaderKey,
      label: String(leader.label || ""),
      relativeLikelihood: Number(leader.relativeLikelihood || 0)
    },
    predictedRunnerUp: runnerUp ? {
      key: runnerUpKey,
      label: String(runnerUp.label || ""),
      relativeLikelihood: Number(runnerUp.relativeLikelihood || 0)
    } : null,
    actualRelativeLikelihood: Number(actualRow?.relativeLikelihood || 0),
    leaderHit: leaderKey === actualKey,
    top2Hit: leaderKey === actualKey || runnerUpKey === actualKey,
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

module.exports = {
  SCENARIO_KEYS,
  canonicalScenarioKey,
  isCompleteScenarioSet,
  actualScenario,
  verify,
  buildSummary
};
