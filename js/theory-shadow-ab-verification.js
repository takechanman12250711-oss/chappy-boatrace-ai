"use strict";

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function verify(shadow, resultTicket) {
  const actual = normalizeTicket(resultTicket);
  const bTickets = Array.isArray(shadow?.b?.tickets) ? shadow.b.tickets : [];
  const changed = bTickets.filter(row => row?.changed === true || Number(row?.adjustmentPoints || 0) !== 0);
  const actualRow = bTickets.find(row => normalizeTicket(row?.ticket) === actual) || null;
  const points = Number(actualRow?.adjustmentPoints || 0);
  const covered = Boolean(actual && actualRow);
  const comparable = covered && changed.length > 0;
  const verdict = !covered
    ? "not-covered"
    : points > 0
      ? "b-promoted-winner"
      : points < 0
        ? "b-demoted-winner"
        : "neutral";

  return {
    version: "1.0.0",
    status: comparable ? "comparable" : "not-comparable",
    resultTicket: actual,
    covered,
    comparable,
    changedTicketCount: changed.length,
    winnerAdjustmentPoints: points,
    verdict,
    bWin: verdict === "b-promoted-winner",
    aWin: verdict === "b-demoted-winner",
    draw: verdict === "neutral",
    appliedTheories: Array.isArray(actualRow?.theories) ? actualRow.theories : [],
    usableForPrediction: false,
    automaticApplication: false
  };
}

function percent(numerator, denominator) {
  return denominator ? Math.round(numerator / denominator * 1000) / 10 : 0;
}

function summarize(rows) {
  const source = (Array.isArray(rows) ? rows : []).filter(row => row?.comparable === true);
  const bWins = source.filter(row => row.bWin).length;
  const aWins = source.filter(row => row.aWin).length;
  const draws = source.filter(row => row.draw).length;
  return {
    comparableCount: source.length,
    bWins,
    aWins,
    draws,
    bWinRate: percent(bWins, source.length),
    aWinRate: percent(aWins, source.length),
    drawRate: percent(draws, source.length)
  };
}

module.exports = { normalizeTicket, verify, summarize };
