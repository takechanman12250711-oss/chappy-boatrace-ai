// js/hiyori-production-simulator.js
// 本番反映前の比較専用シミュレーター。予想本体へは書き込まない。
(function () {
  "use strict";

  const PACKAGE_KEY = "chappy_hiyori_final_approval_packages_v1";
  const CHECKLIST_KEY = "chappy_hiyori_production_checklist_v1";
  const SIM_KEY = "chappy_hiyori_production_simulations_v1";
  const MAX_ROWS = 300;

  function read(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value ?? fallback;
    } catch (_) {
      return fallback;
    }
  }

  function asList(value) {
    return Array.isArray(value) ? value : value?.items || [];
  }

  function order(scores) {
    return scores.map((score, index) => ({ boatNo: index + 1, score: Number(score) || 0 }))
      .sort((a, b) => b.score - a.score)
      .map(row => row.boatNo);
  }

  function markMap(list) {
    const marks = ["◎", "○", "▲", "△", "注", "消"];
    return Object.fromEntries(list.map((boatNo, index) => [boatNo, marks[index] || ""]));
  }

  function topTickets(list) {
    const first = list[0];
    const seconds = list.slice(1, 4);
    const thirds = list.slice(1, 5);
    const tickets = [];
    seconds.forEach(second => {
      thirds.forEach(third => {
        if (third !== second) tickets.push(`${first}-${second}-${third}`);
      });
    });
    return tickets.slice(0, 7);
  }

  function simulate(input) {
    const proposalId = input?.proposalId;
    const packages = asList(read(PACKAGE_KEY, []));
    const pkg = packages.find(row => row?.proposalId === proposalId);
    const checklist = asList(read(CHECKLIST_KEY, [])).find(row => row?.proposalId === proposalId);
    const baseScores = Array.isArray(input?.baseScores) ? input.baseScores.slice(0, 6).map(Number) : [];
    const deltas = Array.isArray(input?.deltas) ? input.deltas.slice(0, 6).map(Number) : [];

    if (!pkg || baseScores.length !== 6 || deltas.length !== 6) return null;

    const simulatedScores = baseScores.map((score, index) => Math.round((score + deltas[index]) * 10) / 10);
    const baseOrder = order(baseScores);
    const simulatedOrder = order(simulatedScores);
    const baseMarks = markMap(baseOrder);
    const simulatedMarks = markMap(simulatedOrder);
    const markChanges = baseOrder.map(boatNo => ({
      boatNo,
      before: baseMarks[boatNo],
      after: simulatedMarks[boatNo],
      changed: baseMarks[boatNo] !== simulatedMarks[boatNo]
    }));

    const row = {
      id: `${proposalId}-${Date.now()}`,
      proposalId,
      packageId: pkg.id,
      createdAt: new Date().toISOString(),
      checklistReady: checklist?.readyForPresentation === true,
      baseScores,
      simulatedScores,
      deltas,
      baseOrder,
      simulatedOrder,
      rankingChanged: baseOrder.join("-") !== simulatedOrder.join("-"),
      markChanges,
      baseTicketCandidates: topTickets(baseOrder),
      simulatedTicketCandidates: topTickets(simulatedOrder),
      ticketCandidatesChanged: topTickets(baseOrder).join("|") !== topTickets(simulatedOrder).join("|"),
      mainAxisChanged: baseOrder[0] !== simulatedOrder[0],
      comparisonOnly: true,
      writesToPrediction: false,
      productionApplied: false,
      appliedToPrediction: false,
      globalProductionLock: true
    };

    const rows = asList(read(SIM_KEY, []));
    localStorage.setItem(SIM_KEY, JSON.stringify([row, ...rows].slice(0, MAX_ROWS)));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-production-simulated", { detail: row }));
    return row;
  }

  function latest(limit) {
    return asList(read(SIM_KEY, [])).slice(0, Number(limit) || 10);
  }

  window.ChappyHiyoriProductionSimulator = { simulate, latest };
})();
