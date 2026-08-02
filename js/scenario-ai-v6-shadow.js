"use strict";

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, n(value)));
}

function uniqueBoats(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(v => v >= 1 && v <= 6))];
}

function ticketOf(first, second, third) {
  const boats = [Number(first), Number(second), Number(third)];
  return new Set(boats).size === 3 && boats.every(v => v >= 1 && v <= 6)
    ? boats.join("-")
    : "";
}

function inferFinishOrder(scenario, marks = {}) {
  const type = String(scenario?.type || "");
  const attacker = Number(scenario?.attacker || marks?.attacker?.boatNo || 0);
  const wall = Number(marks?.wall?.boatNo || marks?.wallBoat?.boatNo || 0);
  const main = Number(marks?.main?.boatNo || marks?.honmei?.boatNo || 1);
  const rival = Number(marks?.rival?.boatNo || marks?.taikou?.boatNo || 2);
  const third = Number(marks?.third?.boatNo || marks?.tanana?.boatNo || 4);

  if (/escape|nige|逃げ/i.test(type)) {
    return uniqueBoats([1, rival, third, wall]).slice(0, 3);
  }
  if (/sashi|差し/i.test(type)) {
    return uniqueBoats([attacker || 2, 1, third, rival]).slice(0, 3);
  }
  if (/makuri-sashi|まくり差し/i.test(type)) {
    return uniqueBoats([attacker || 3, 1, third, rival]).slice(0, 3);
  }
  if (/makuri|まくり/i.test(type)) {
    return uniqueBoats([attacker || 3, attacker === 3 ? 4 : third, 1, rival]).slice(0, 3);
  }
  return uniqueBoats([main, rival, third, 1]).slice(0, 3);
}

function breakConditions(scenario, order) {
  const type = String(scenario?.type || "");
  const attacker = Number(scenario?.attacker || order?.[0] || 0);
  const conditions = [];
  if (/escape|nige|逃げ/i.test(type)) conditions.push("1号艇がスリットで後手を踏む");
  if (/sashi|差し/i.test(type)) conditions.push(`${attacker || 2}号艇の差し場が閉じる`);
  if (/makuri/i.test(type)) conditions.push(`${attacker || 3}号艇が攻め切れず壁に止められる`);
  if (Array.isArray(scenario?.blockedBoats) && scenario.blockedBoats.length) {
    conditions.push(`壁・ブロック関係が崩れる（対象${scenario.blockedBoats.map(Number).join("・")}号艇）`);
  }
  if (!conditions.length) conditions.push("展示・進入・直前気象で前提が変化する");
  return conditions;
}

function normalize(rows) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, n(row.rawScore)), 0);
  if (!total) return rows.map(row => ({ ...row, likelihood: 0 }));
  let used = 0;
  return rows.map((row, index) => {
    const likelihood = index === rows.length - 1
      ? Math.max(0, 100 - used)
      : Math.round(Math.max(0, n(row.rawScore)) / total * 1000) / 10;
    used = Math.round((used + likelihood) * 10) / 10;
    return { ...row, likelihood };
  });
}

function build(input = {}) {
  const evidence = input?.verificationEvidence || input?.evidence || {};
  const source = Array.isArray(evidence?.scenarios) && evidence.scenarios.length
    ? evidence.scenarios
    : [evidence?.mainScenario, evidence?.subScenario].filter(Boolean);
  const marks = evidence?.marks || input?.marks || {};

  const scenarios = normalize(source.slice(0, 4).map((scenario, index) => {
    const order = inferFinishOrder(scenario, marks);
    const ticket = ticketOf(order[0], order[1], order[2]);
    const rawScore = clamp(
      n(scenario?.score) + n(scenario?.frameMovementAdjustment) + (index === 0 ? 3 : 0),
      0,
      100
    );
    return {
      rank: index + 1,
      scenarioType: String(scenario?.type || "unknown"),
      label: String(scenario?.label || `展開候補${index + 1}`),
      rawScore,
      keyBoat: Number(scenario?.attacker || order[0] || 0) || null,
      finishOrder: order,
      representativeTicket: ticket,
      blockedBoats: uniqueBoats(scenario?.blockedBoats),
      breakConditions: breakConditions(scenario, order)
    };
  })).sort((a, b) => b.likelihood - a.likelihood || b.rawScore - a.rawScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));

  return {
    version: "6.0.0-shadow",
    status: scenarios.length ? "shadow-ready" : "insufficient-evidence",
    scenarios,
    mainScenario: scenarios[0] || null,
    alternativeScenarioCount: Math.max(0, scenarios.length - 1),
    totalLikelihood: Math.round(scenarios.reduce((sum, row) => sum + n(row.likelihood), 0) * 10) / 10,
    source: "existing-verification-evidence",
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = { build, inferFinishOrder, normalize, ticketOf };
