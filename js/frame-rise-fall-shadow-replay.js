"use strict";

const VERSION = "frame-rise-fall-shadow-replay-v1";

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function ticketStrings(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map(row => String(row?.ticket || row || "").trim())
    .filter(ticket => /^[1-6]-[1-6]-[1-6]$/.test(ticket));
}

function scenarioDecision(scenario = {}) {
  return {
    type: String(scenario?.type || ""),
    headBoatNo: Number(
      scenario?.headBoatNo ??
      scenario?.attackerBoatNo ??
      scenario?.attacker ??
      0
    ) || null
  };
}

function fingerprint(decision = {}) {
  return JSON.stringify({
    skipDecision: decision?.skipDecision === true,
    mainScenario: scenarioDecision(decision?.mainScenario || {}),
    practicalTickets: ticketStrings(decision?.practicalTickets)
  });
}

function withShadowScenario(source = {}, shadow = {}) {
  const next = clone(source) || {};
  next.mainScenario = clone(shadow?.mainScenario || null);
  next.scenarios = clone(shadow?.scenarios || []);
  const headBoatNo = scenarioDecision(next.mainScenario).headBoatNo;
  next.attacker = headBoatNo;
  next.attackerBoatNo = headBoatNo;
  next.headBoatNo = headBoatNo;
  return next;
}

function build(record = {}, snapshot = {}, dependencies = {}) {
  const coreApi = dependencies.coreApi;
  const selector = dependencies.selector;
  const basis = record?.prediction?.practicalSelection?.frameRiseFallReplayBasis || null;

  if (snapshot?.status !== "shadow-ready") {
    return { version: VERSION, status: "shadow-scenario-not-ready", comparableForFixed100: false };
  }
  if (!basis || !Array.isArray(basis.analyses) || basis.analyses.length < 6 || !basis.raceScenarios) {
    return { version: VERSION, status: "replay-basis-unavailable", comparableForFixed100: false };
  }
  if (!coreApi || typeof coreApi.buildMarks !== "function" || typeof coreApi.buildFormations !== "function") {
    return { version: VERSION, status: "ai-core-replay-unavailable", comparableForFixed100: false };
  }
  if (!selector || typeof selector.select !== "function") {
    return { version: VERSION, status: "practical-selector-unavailable", comparableForFixed100: false };
  }

  try {
    const analyses = clone(basis.analyses);
    const bRaceScenarios = withShadowScenario(basis.raceScenarios, snapshot.b);
    const marks = coreApi.buildMarks(analyses, bRaceScenarios);
    const formations = coreApi.buildFormations(analyses, bRaceScenarios);
    const bPrediction = {
      aiCore: {
        version: String(basis.aiCoreVersion || ""),
        analyses,
        raceScenarios: bRaceScenarios,
        formations,
        marks,
        courseMapping: clone(basis.courseMapping || null)
      },
      raceFlow: {
        ...(clone(basis.raceFlow || {}) || {}),
        title: String(snapshot?.b?.mainScenario?.label || basis?.raceFlow?.title || ""),
        scenario: clone(snapshot?.b?.mainScenario || null)
      },
      mainSheet: {
        honmei: marks?.honmei || null,
        taikou: marks?.taikou || null,
        ana: marks?.ana || null,
        osae: marks?.osae || null,
        tickets: clone(formations?.main || []),
        coverTickets: clone(formations?.safety || []),
        flowTickets: clone(formations?.flow || []),
        flowFormations: clone(formations?.flowFormations || [])
      },
      manshuSheet: {
        tickets: clone(formations?.longshot || [])
      },
      formation: clone(formations)
    };
    const bSelection = selector.select(bPrediction);
    const bTickets = ticketStrings(bSelection?.tickets);
    const aSelection = record?.prediction?.practicalSelection || {};
    const aTickets = ticketStrings(record?.prediction?.practicalTickets || aSelection?.tickets);
    const aDecision = {
      skipDecision: String(aSelection?.status || "") === "skipped",
      mainScenario: record?.prediction?.verificationEvidence?.mainScenario || snapshot?.a?.mainScenario || null,
      practicalTickets: aTickets
    };
    const bDecision = {
      skipDecision: String(bSelection?.status || "") === "skipped",
      mainScenario: snapshot?.b?.mainScenario || bRaceScenarios?.mainScenario || null,
      practicalTickets: bTickets
    };
    const aFingerprint = fingerprint(aDecision);
    const bFingerprint = fingerprint(bDecision);
    const ticketContractViolations = bTickets.filter(ticket => new Set(ticket.split("-")).size !== 3).length;
    const complete = Boolean(
      aDecision.mainScenario &&
      bDecision.mainScenario &&
      Array.isArray(aDecision.practicalTickets) &&
      Array.isArray(bDecision.practicalTickets) &&
      ["selected", "skipped"].includes(String(bSelection?.status || ""))
    );
    const decisionChanged = complete && aFingerprint !== bFingerprint;

    return {
      version: VERSION,
      status: complete ? "replay-ready" : "replay-incomplete",
      a: { ...aDecision, decisionFingerprint: aFingerprint },
      b: { ...bDecision, decisionFingerprint: bFingerprint },
      bSelectionStatus: String(bSelection?.status || ""),
      bSelectionReason: String(bSelection?.reason || ""),
      bMarks: clone(marks),
      decisionChanged,
      ticketContractViolations,
      comparableForFixed100: complete && decisionChanged && ticketContractViolations === 0,
      productionAUnchanged: true,
      applicationMode: "shadow-only",
      usableForPrediction: false,
      automaticApplication: false
    };
  } catch (error) {
    return {
      version: VERSION,
      status: "replay-failed",
      error: String(error?.message || error).slice(0, 240),
      comparableForFixed100: false,
      usableForPrediction: false,
      automaticApplication: false
    };
  }
}

module.exports = { VERSION, ticketStrings, scenarioDecision, fingerprint, withShadowScenario, build };
