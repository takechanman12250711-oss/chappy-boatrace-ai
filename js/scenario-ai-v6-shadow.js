(function (root, factory) {
  "use strict";
  const api = factory();
  root.ChappyScenarioAiV6Shadow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "6.1.0-shadow";
  const LOGIC_FINGERPRINT = "scenario-ai-v6-multi-candidate-v1";

  function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, n(value))); }
  function uniqueBoats(values) { return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(v => v >= 1 && v <= 6))]; }
  function ticketOf(first, second, third) {
    const boats = [Number(first), Number(second), Number(third)];
    return new Set(boats).size === 3 && boats.every(v => v >= 1 && v <= 6) ? boats.join("-") : "";
  }
  function scenarioHeadBoatNo(scenario) {
    const explicit = [
      scenario?.headBoatNo,
      scenario?.attackerBoatNo,
      scenario?.attacker
    ]
      .map(Number)
      .find(value => value >= 1 && value <= 6);
    return explicit || 0;
  }
  function scenarioText(scenario) {
    return `${String(scenario?.type || "")} ${String(scenario?.label || "")}`.trim();
  }
  function inferFinishOrder(scenario, marks = {}) {
    const type = scenarioText(scenario);
    const scenarioHead = scenarioHeadBoatNo(scenario);
    const markedAttacker = Number(marks?.attacker?.boatNo || 0);
    const attackFallback =
      markedAttacker >= 1 && markedAttacker <= 6
        ? markedAttacker
        : 0;
    const wall = Number(marks?.wall?.boatNo || marks?.wallBoat?.boatNo || 0);
    const main = Number(marks?.main?.boatNo || marks?.honmei?.boatNo || 1);
    const rival = Number(marks?.rival?.boatNo || marks?.taikou?.boatNo || 2);
    const third = Number(marks?.third?.boatNo || marks?.tanana?.boatNo || 4);
    if (/escape|nige|逃げ/i.test(type)) return uniqueBoats([scenarioHead || 1, rival, third, wall]).slice(0, 3);
    if (/makuri-sashi|まくり差し/i.test(type)) return uniqueBoats([scenarioHead || attackFallback || 3, 1, third, rival]).slice(0, 3);
    if (/sashi|差し/i.test(type)) return uniqueBoats([scenarioHead || 2, 1, third, rival]).slice(0, 3);
    if (/makuri|まくり/i.test(type)) {
      const attacker = scenarioHead || attackFallback || 3;
      return uniqueBoats([attacker, attacker === 3 ? 4 : third, 1, rival]).slice(0, 3);
    }
    if (/threeAttack|3(?:コース)?攻め|3攻め/i.test(type)) return uniqueBoats([scenarioHead || 3, 1, third, rival]).slice(0, 3);
    if (/fourAttack|4(?:カド)?攻め|4攻め/i.test(type)) return uniqueBoats([scenarioHead || 4, 1, third, rival]).slice(0, 3);
    const attacker = scenarioHead || attackFallback;
    if (attacker) return uniqueBoats([attacker, main, rival, third, 1]).slice(0, 3);
    return uniqueBoats([main, rival, third, 1]).slice(0, 3);
  }
  function breakConditions(scenario, order) {
    const type = scenarioText(scenario);
    const attacker = scenarioHeadBoatNo(scenario) || Number(order?.[0] || 0);
    const conditions = [];
    if (/escape|nige|逃げ/i.test(type)) conditions.push("1号艇がスリットで後手を踏む");
    if (/sashi|差し/i.test(type)) conditions.push(`${attacker || 2}号艇の差し場が閉じる`);
    if (/makuri/i.test(type)) conditions.push(`${attacker || 3}号艇が攻め切れず壁に止められる`);
    if (Array.isArray(scenario?.blockedBoats) && scenario.blockedBoats.length) conditions.push(`壁・ブロック関係が崩れる（対象${scenario.blockedBoats.map(Number).join("・")}号艇）`);
    if (!conditions.length) conditions.push("展示・進入・直前気象で前提が変化する");
    return conditions;
  }
  function normalizedTicket(row) {
    const value = String(
      typeof row === "string"
        ? row
        : row?.ticket ?? row?.combo ?? row?.bet ?? row?.combination ?? ""
    ).trim();
    const match = value.match(/^([1-6])-([1-6])-([1-6])$/);
    return match ? ticketOf(match[1], match[2], match[3]) : "";
  }
  function selectedTicketsOf(input, evidence) {
    const rows = [
      ...(Array.isArray(evidence?.tickets) ? evidence.tickets : []),
      ...(Array.isArray(input?.practicalSelection?.tickets) ? input.practicalSelection.tickets : []),
      ...(Array.isArray(input?.practicalTickets) ? input.practicalTickets : [])
    ];
    const seen = new Set();
    return rows.map(normalizedTicket).filter(ticket => {
      if (!ticket || seen.has(ticket)) return false;
      seen.add(ticket);
      return true;
    });
  }
  function representativeTicketOf(scenario, order, selectedTickets, marks) {
    const headBoatNo = scenarioHeadBoatNo(scenario, marks) || Number(order?.[0] || 0);
    const selected = selectedTickets.find(ticket => Number(ticket.split("-")[0]) === headBoatNo);
    if (selected) return selected;

    // 正式買い目があるときは、そこに存在しない推測券を代表目として表示しない。
    if (headBoatNo && selectedTickets.length) return "";

    const own = normalizedTicket(scenario?.representativeTicket);
    if (own && (!headBoatNo || Number(own.split("-")[0]) === headBoatNo)) return own;
    return ticketOf(order?.[0], order?.[1], order?.[2]);
  }
  function scenarioRows(values) {
    return (Array.isArray(values) ? values : [])
      .filter(Boolean)
      .filter(row => String(row?.type || row?.key || "") !== "canonical-evaluated-scenario");
  }
  function scenarioSourceOf(input, evidence) {
    const evidenceScenarios = scenarioRows(evidence?.scenarios);
    const raceScenarios = input?.aiCore?.raceScenarios || input?.raceScenarios || {};
    const richScenarioRows = scenarioRows(raceScenarios?.scenarios);
    const richScenarios = richScenarioRows.length
      ? richScenarioRows
      : [raceScenarios?.mainScenario, raceScenarios?.subScenario].filter(Boolean);

    if (evidenceScenarios.length >= 2) return { rows: evidenceScenarios, source: "verification-evidence-scenarios" };
    if (richScenarios.length >= 2) return { rows: richScenarios, source: "race-scenarios" };
    if (evidenceScenarios.length) return { rows: evidenceScenarios, source: "verification-evidence-scenarios" };

    const compactRows = [evidence?.mainScenario, evidence?.subScenario].filter(Boolean);
    if (compactRows.length) return { rows: compactRows, source: "verification-evidence" };
    return { rows: richScenarios, source: "race-scenarios" };
  }
  function normalize(rows) {
    const total = rows.reduce((sum, row) => sum + Math.max(0, n(row.rawScore)), 0);
    if (!total) return rows.map(row => ({ ...row, likelihood: 0 }));
    let used = 0;
    return rows.map((row, index) => {
      const likelihood = index === rows.length - 1 ? Math.max(0, 100 - used) : Math.round(Math.max(0, n(row.rawScore)) / total * 1000) / 10;
      used = Math.round((used + likelihood) * 10) / 10;
      return { ...row, likelihood };
    });
  }
  function build(input = {}) {
    const evidence = input?.verificationEvidence || input?.evidence || {};
    const resolvedSource = scenarioSourceOf(input, evidence);
    const source = resolvedSource.rows;
    const marks = evidence?.marks || input?.aiCore?.marks || input?.marks || {};
    const selectedTickets = selectedTicketsOf(input, evidence);
    const scenarios = normalize(source.slice(0, 4).map((scenario, index) => {
      const order = inferFinishOrder(scenario, marks);
      const rawScore = clamp(n(scenario?.score) + n(scenario?.frameMovementAdjustment) + (index === 0 ? 3 : 0), 0, 100);
      const headBoatNo = scenarioHeadBoatNo(scenario, marks) || Number(order[0] || 0);
      return {
        rank: index + 1,
        scenarioType: String(scenario?.type || "unknown"),
        label: String(scenario?.label || `展開候補${index + 1}`),
        rawScore,
        keyBoat: headBoatNo || null,
        finishOrder: order,
        representativeTicket: representativeTicketOf(scenario, order, selectedTickets, marks),
        blockedBoats: uniqueBoats(scenario?.blockedBoats),
        breakConditions: breakConditions(scenario, order)
      };
    })).sort((a, b) => b.likelihood - a.likelihood || b.rawScore - a.rawScore).map((row, index) => ({ ...row, rank: index + 1 }));
    return {
      version: VERSION,
      logicFingerprint: LOGIC_FINGERPRINT,
      inputSourceKind: String(input?.inputSourceKind || resolvedSource.source),
      status: scenarios.length ? "shadow-ready" : "insufficient-evidence",
      scenarios,
      mainScenario: scenarios[0] || null,
      alternativeScenarioCount: Math.max(0, scenarios.length - 1),
      totalLikelihood: Math.round(scenarios.reduce((sum, row) => sum + n(row.likelihood), 0) * 10) / 10,
      source: resolvedSource.source,
      usableForPrediction: false,
      automaticApplication: false
    };
  }
  return {
    VERSION,
    LOGIC_FINGERPRINT,
    build,
    inferFinishOrder,
    normalize,
    ticketOf,
    scenarioHeadBoatNo,
    scenarioSourceOf,
    scenarioRows
  };
});
