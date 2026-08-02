"use strict";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approvedCandidates(report) {
  return Array.isArray(report?.approvalGate?.approvedCandidates)
    ? report.approvalGate.approvedCandidates
    : Array.isArray(report?.approvedCandidates)
      ? report.approvedCandidates
      : [];
}

function candidateMap(report, jcd) {
  const map = new Map();
  approvedCandidates(report).forEach(candidate => {
    if (candidate?.approved !== true && candidate?.status !== "approved") return;
    const scope = String(candidate?.scope || "theory");
    const candidateJcd = String(candidate?.jcd || "").padStart(2, "0");
    if (scope === "venue-theory" && candidateJcd !== String(jcd || "").padStart(2, "0")) return;
    const key = String(candidate?.theoryKey || candidate?.key || "");
    if (!key) return;
    const points = clamp(Number(candidate?.suggestedAdjustmentPoints || 0), -2, 2);
    const current = map.get(key) || 0;
    map.set(key, clamp(current + points, -4, 4));
  });
  return map;
}

function build(theoryTagSnapshot, approvalReport, context = {}) {
  const theories = Array.isArray(theoryTagSnapshot?.theories)
    ? theoryTagSnapshot.theories
    : [];
  const adjustments = candidateMap(approvalReport, context.jcd);
  const tickets = new Map();

  theories.forEach(theory => {
    const theoryKey = String(theory?.theoryKey || "");
    const points = Number(adjustments.get(theoryKey) || 0);
    (Array.isArray(theory?.tickets) ? theory.tickets : []).forEach(ticket => {
      const key = String(ticket || "");
      if (!key) return;
      const row = tickets.get(key) || { ticket: key, adjustmentPoints: 0, theories: [] };
      row.adjustmentPoints = clamp(row.adjustmentPoints + points, -4, 4);
      row.theories.push({ theoryKey, adjustmentPoints: points });
      tickets.set(key, row);
    });
  });

  const ticketRows = [...tickets.values()]
    .map(row => ({
      ...row,
      changed: row.adjustmentPoints !== 0
    }))
    .sort((a, b) => b.adjustmentPoints - a.adjustmentPoints || a.ticket.localeCompare(b.ticket));

  return {
    version: "1.0.0",
    status: ticketRows.some(row => row.changed) ? "shadow-adjusted" : "no-approved-adjustment",
    applicationMode: "shadow-only",
    usableForPrediction: false,
    automaticApplication: false,
    a: {
      label: "current-theory-selection",
      tickets: ticketRows.map(row => ({ ticket: row.ticket, adjustmentPoints: 0 }))
    },
    b: {
      label: "approved-theory-adjustment-shadow",
      tickets: ticketRows
    },
    changedTicketCount: ticketRows.filter(row => row.changed).length,
    appliedCandidateCount: [...adjustments.values()].filter(Boolean).length
  };
}

module.exports = { build, candidateMap, approvedCandidates };
