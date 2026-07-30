"use strict";

function settlePurchase(purchase = {}, result = {}) {
  const trifecta = result?.trifecta || null;
  if (!result?.resultAvailable || !trifecta?.combination) {
    return {
      ...purchase,
      settlementStatus: "pending",
      hit: null,
      payout: 0,
      profit: null,
      returnRate: null
    };
  }

  const amount = Math.max(0, Math.round(Number(purchase.amount || 0)));
  const hit = String(purchase.ticket || "") === String(trifecta.combination || "");
  const unitPayout = Math.max(0, Math.round(Number(trifecta.payout || 0)));
  const payout = hit ? Math.round((amount / 100) * unitPayout) : 0;
  const profit = payout - amount;
  const returnRate = amount > 0 ? Math.round((payout / amount) * 1000) / 10 : 0;

  return {
    ...purchase,
    settlementStatus: "settled",
    resultCombination: String(trifecta.combination),
    resultPayoutPer100: unitPayout,
    resultPopularity: trifecta.popularity ?? null,
    winningMethod: String(result.winningMethod || ""),
    hit,
    payout,
    profit,
    returnRate,
    settledAt: new Date().toISOString()
  };
}

function settlePurchases(purchases = [], resultsByRace = {}) {
  return (Array.isArray(purchases) ? purchases : []).map((purchase) =>
    settlePurchase(purchase, resultsByRace[purchase.raceKey] || null)
  );
}

function summarizeSettlements(purchases = []) {
  const settled = purchases.filter((item) => item.settlementStatus === "settled");
  const stake = settled.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const payout = settled.reduce((sum, item) => sum + Number(item.payout || 0), 0);
  const hits = settled.filter((item) => item.hit).length;
  return {
    settledTickets: settled.length,
    pendingTickets: purchases.length - settled.length,
    hits,
    stake,
    payout,
    profit: payout - stake,
    returnRate: stake > 0 ? Math.round((payout / stake) * 1000) / 10 : 0
  };
}

module.exports = { settlePurchase, settlePurchases, summarizeSettlements };
