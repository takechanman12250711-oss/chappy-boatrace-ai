(function (root, factory) {
  "use strict";
  const api = factory();
  root.ChappyScenarioAiV6Shadow = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "6.1.1-shadow";
  const LOGIC_FINGERPRINT = "scenario-ai-v6-multi-candidate-v2-actual-course";

  function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, n(value))); }
  function uniqueBoats(values) { return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(v => v >= 1 && v <= 6))]; }
  function ticketOf(first, second, third) {
    const boats = [Number(first), Number(second), Number(third)];
    return new Set(boats).size === 3 && boats.every(v => v >= 1 && v <= 6) ? boats.join("-") : "";
  }
  function identityCourseMapping() {
    return {
      formal: false,
      boatAtCourse(course) {
        return n(course) || null;
      },
      courseOfBoat(boatNo) {
        return n(boatNo) || null;
      }
    };
  }
  function officialCourseMapping(input = {}) {
    const conditions =
      input?.preRaceConditions ||
      input?.prediction?.preRaceConditions ||
      {};
    const source = Array.isArray(conditions?.boats)
      ? conditions.boats
      : [];
    const rows = source.map((row, index) => ({
      boatNo: n(row?.boatNo ?? row?.boat ?? row?.waku ?? index + 1),
      course: n(row?.course),
      official:
        row?.courseOfficial === true ||
        row?.isOfficialCourse === true ||
        String(row?.courseMappingSource || row?.mappingSource || "") ===
          "official-start-image"
    }));
    const boats = new Set(rows.map(row => row.boatNo));
    const courses = new Set(rows.map(row => row.course));
    const formal =
      rows.length === 6 &&
      rows.every(row =>
        row.official &&
        row.boatNo >= 1 && row.boatNo <= 6 &&
        row.course >= 1 && row.course <= 6
      ) &&
      boats.size === 6 &&
      courses.size === 6;

    if (!formal) return identityCourseMapping();

    const byBoat = new Map(rows.map(row => [row.boatNo, row.course]));
    const byCourse = new Map(rows.map(row => [row.course, row.boatNo]));
    return {
      formal: true,
      boatAtCourse(course) {
        return byCourse.get(n(course)) || null;
      },
      courseOfBoat(boatNo) {
        return byBoat.get(n(boatNo)) || null;
      }
    };
  }
  function scenarioCourse(scenario, mapping = identityCourseMapping()) {
    const explicit = n(scenario?.attackerCourse);
    if (explicit >= 1 && explicit <= 6) return explicit;
    const legacy = n(scenario?.attacker);
    if (legacy >= 1 && legacy <= 6) return legacy;
    const boatNo = n(scenario?.attackerBoatNo ?? scenario?.headBoatNo);
    return boatNo >= 1 && boatNo <= 6
      ? n(mapping.courseOfBoat(boatNo)) || boatNo
      : 0;
  }
  function scenarioHeadBoatNo(scenario, mapping = identityCourseMapping()) {
    const explicit = [
      scenario?.headBoatNo,
      scenario?.attackerBoatNo
    ]
      .map(Number)
      .find(value => value >= 1 && value <= 6);
    if (explicit) return explicit;
    const course = scenarioCourse(scenario, mapping);
    return course >= 1 && course <= 6
      ? n(mapping.boatAtCourse(course)) || course
      : 0;
  }
  function scenarioText(scenario) {
    return `${String(scenario?.type || "")} ${String(scenario?.label || "")}`.trim();
  }
  function inferFinishOrder(
    scenario,
    marks = {},
    mapping = identityCourseMapping()
  ) {
    const type = scenarioText(scenario);
    const scenarioHead = scenarioHeadBoatNo(scenario, mapping);
    const attackCourse = scenarioCourse(scenario, mapping);
    const boatAtCourse = course =>
      n(mapping.boatAtCourse(course)) || n(course);
    const insideBoat = boatAtCourse(1);
    const markedAttacker = Number(marks?.attacker?.boatNo || 0);
    const attackFallback =
      markedAttacker >= 1 && markedAttacker <= 6
        ? markedAttacker
        : 0;
    const wall = Number(marks?.wall?.boatNo || marks?.wallBoat?.boatNo || 0);
    const main = Number(marks?.main?.boatNo || marks?.honmei?.boatNo || 1);
    const rival = Number(marks?.rival?.boatNo || marks?.taikou?.boatNo || 2);
    const third = Number(marks?.third?.boatNo || marks?.tanana?.boatNo || 4);
    if (/escape|nige|逃げ/i.test(type)) return uniqueBoats([scenarioHead || insideBoat, rival, third, wall]).slice(0, 3);
    if (/makuri-sashi|まくり差し/i.test(type)) return uniqueBoats([scenarioHead || attackFallback || boatAtCourse(3), insideBoat, third, rival]).slice(0, 3);
    if (/sashi|差し/i.test(type)) return uniqueBoats([scenarioHead || boatAtCourse(2), insideBoat, third, rival]).slice(0, 3);
    if (/makuri|まくり/i.test(type)) {
      const attacker = scenarioHead || attackFallback || boatAtCourse(3);
      const follower =
        attackCourse >= 1 && attackCourse < 6
          ? boatAtCourse(attackCourse + 1)
          : third;
      return uniqueBoats([attacker, follower, insideBoat, rival, third]).slice(0, 3);
    }
    if (/threeAttack|3(?:コース)?攻め|3攻め/i.test(type)) return uniqueBoats([scenarioHead || boatAtCourse(3), insideBoat, third, rival]).slice(0, 3);
    if (/fourAttack|4(?:カド)?攻め|4攻め/i.test(type)) return uniqueBoats([scenarioHead || boatAtCourse(4), insideBoat, third, rival]).slice(0, 3);
    const attacker = scenarioHead || attackFallback;
    if (attacker) return uniqueBoats([attacker, main, rival, third, insideBoat]).slice(0, 3);
    return uniqueBoats([main, rival, third, insideBoat]).slice(0, 3);
  }
  function breakConditions(
    scenario,
    order,
    mapping = identityCourseMapping()
  ) {
    const type = scenarioText(scenario);
    const attacker = scenarioHeadBoatNo(scenario, mapping) || Number(order?.[0] || 0);
    const insideBoat = n(mapping.boatAtCourse(1)) || 1;
    const conditions = [];
    if (/escape|nige|逃げ/i.test(type)) conditions.push(`${insideBoat}号艇がスリットで後手を踏む`);
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
  function representativeTicketOf(
    scenario,
    order,
    selectedTickets,
    marks,
    mapping = identityCourseMapping()
  ) {
    const headBoatNo = scenarioHeadBoatNo(scenario, mapping) || Number(order?.[0] || 0);
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
    const courseMapping = officialCourseMapping(input);
    const resolvedSource = scenarioSourceOf(input, evidence);
    const source = resolvedSource.rows;
    const marks = evidence?.marks || input?.aiCore?.marks || input?.marks || {};
    const selectedTickets = selectedTicketsOf(input, evidence);
    const scenarios = normalize(source.slice(0, 4).map((scenario, index) => {
      const order = inferFinishOrder(scenario, marks, courseMapping);
      const rawScore = clamp(n(scenario?.score) + n(scenario?.frameMovementAdjustment) + (index === 0 ? 3 : 0), 0, 100);
      const headBoatNo = scenarioHeadBoatNo(scenario, courseMapping) || Number(order[0] || 0);
      return {
        rank: index + 1,
        scenarioType: String(scenario?.type || "unknown"),
        label: String(scenario?.label || `展開候補${index + 1}`),
        rawScore,
        keyBoat: headBoatNo || null,
        finishOrder: order,
        representativeTicket: representativeTicketOf(scenario, order, selectedTickets, marks, courseMapping),
        blockedBoats: uniqueBoats(scenario?.blockedBoats),
        breakConditions: breakConditions(scenario, order, courseMapping)
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
      courseMappingFormal: courseMapping.formal === true,
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
    scenarioCourse,
    officialCourseMapping,
    scenarioSourceOf,
    scenarioRows
  };
});
