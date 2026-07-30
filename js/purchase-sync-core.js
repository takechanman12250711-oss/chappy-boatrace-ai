"use strict";

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function normalizeDate(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 8 ? digits : "";
}

function normalizePurchase(raw = {}) {
  const date = normalizeDate(raw.date || raw.raceDate);
  const jcd = String(raw.jcd || raw.venueCode || "").padStart(2, "0");
  const raceNo = Number(raw.raceNo || raw.rno || 0);
  const ticket = normalizeTicket(raw.ticket || raw.combination);
  const amount = Math.max(0, Math.round(Number(raw.amount || raw.stake || 0)));
  const sourceId = String(raw.sourceId || raw.contractId || raw.id || "").trim();

  if (!date || !/^\d{2}$/.test(jcd) || raceNo < 1 || raceNo > 12 || !ticket || amount <= 0) {
    return null;
  }

  const raceKey = `${date}-${jcd}-${raceNo}`;
  const purchaseKey = sourceId || `${raceKey}-${ticket}-${amount}`;

  return {
    schemaVersion: 1,
    purchaseKey,
    sourceId,
    source: String(raw.source || "teleboat-session"),
    date,
    jcd,
    raceNo,
    raceKey,
    ticket,
    amount,
    purchasedAt: String(raw.purchasedAt || raw.createdAt || ""),
    importedAt: String(raw.importedAt || new Date().toISOString())
  };
}

function mergePurchases(existing = [], incoming = []) {
  const byKey = new Map();

  [...existing, ...incoming]
    .map(normalizePurchase)
    .filter(Boolean)
    .forEach((purchase) => {
      const previous = byKey.get(purchase.purchaseKey);
      byKey.set(purchase.purchaseKey, previous ? { ...previous, ...purchase } : purchase);
    });

  return [...byKey.values()].sort((a, b) =>
    `${a.date}-${a.jcd}-${String(a.raceNo).padStart(2, "0")}-${a.ticket}`.localeCompare(
      `${b.date}-${b.jcd}-${String(b.raceNo).padStart(2, "0")}-${b.ticket}`
    )
  );
}

function linkPurchasesToPredictions(purchases = [], predictions = []) {
  const predictionByRace = new Map(
    (Array.isArray(predictions) ? predictions : []).map((prediction) => [prediction.raceKey, prediction])
  );

  return mergePurchases([], purchases).map((purchase) => {
    const prediction = predictionByRace.get(purchase.raceKey) || null;
    const recommended = new Set(
      (prediction?.prediction?.practicalTickets || prediction?.practicalTickets || [])
        .map((item) => normalizeTicket(item?.ticket || item))
        .filter(Boolean)
    );

    return {
      ...purchase,
      predictionLinked: Boolean(prediction),
      recommendedTicket: recommended.has(purchase.ticket)
    };
  });
}

module.exports = {
  normalizeTicket,
  normalizeDate,
  normalizePurchase,
  mergePurchases,
  linkPurchasesToPredictions
};
