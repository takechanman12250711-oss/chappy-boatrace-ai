"use strict";

const store = require("./_purchase-store");
const settlement = require("../js/purchase-settlement-core");

function getBearerToken(req) {
  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function isAuthorized(req, env = process.env) {
  const expected = String(env.CHAPPY_PURCHASE_SYNC_TOKEN || "");
  return Boolean(expected) && getBearerToken(req) === expected;
}

function getOrigin(req, env = process.env) {
  const configured = String(env.CHAPPY_API_BASE_URL || "").replace(/\/$/, "");
  if (configured) return configured;
  const host = String(req?.headers?.["x-forwarded-host"] || req?.headers?.host || "");
  const protocol = String(req?.headers?.["x-forwarded-proto"] || "https");
  return host ? `${protocol}://${host}` : "";
}

function getPendingRaceKeys(purchases = []) {
  return [...new Set(
    purchases
      .filter((purchase) => purchase?.settlementStatus !== "settled")
      .map((purchase) => purchase?.raceKey)
      .filter(Boolean)
  )];
}

async function fetchResult(raceKey, options = {}) {
  const [date, jcd, raceNo] = String(raceKey).split("-");
  const origin = String(options.origin || "").replace(/\/$/, "");
  if (!origin) throw new Error("結果APIの接続先を特定できません");

  const response = await (options.fetchImpl || fetch)(
    `${origin}/api/result?date=${encodeURIComponent(date)}&jcd=${encodeURIComponent(jcd)}&rno=${encodeURIComponent(raceNo)}`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!response.ok) throw new Error(`公式結果取得失敗: ${response.status}`);
  return response.json();
}

async function handler(req, res, dependencies = {}) {
  const env = dependencies.env || process.env;
  const purchaseStore = dependencies.store || store;
  const fetchImpl = dependencies.fetchImpl || fetch;

  res.setHeader?.("Cache-Control", "no-store");

  if (!isAuthorized(req, env)) {
    return res.status(401).json({ ok: false, error: "購入同期の認証に失敗しました" });
  }
  if (req.method !== "POST") {
    res.setHeader?.("Allow", "POST");
    return res.status(405).json({ ok: false, error: "POSTを使用してください" });
  }

  try {
    const purchases = await purchaseStore.loadPurchases({ env });
    const raceKeys = getPendingRaceKeys(purchases);
    const origin = dependencies.origin || getOrigin(req, env);
    const resultByRace = new Map();
    const errors = [];

    for (const raceKey of raceKeys) {
      try {
        const result = await fetchResult(raceKey, { origin, fetchImpl });
        resultByRace.set(raceKey, result);
      } catch (error) {
        errors.push({ raceKey, error: String(error?.message || error) });
      }
    }

    const settled = purchases.map((purchase) => {
      const result = resultByRace.get(purchase.raceKey);
      return result ? settlement.settlePurchase(purchase, result) : purchase;
    });

    await purchaseStore.savePurchases(settled, { env });
    const summary = settlement.summarizeSettlements(settled);

    return res.status(200).json({
      ok: true,
      checkedRaces: raceKeys.length,
      updatedPurchases: settled.filter((purchase) => resultByRace.has(purchase.raceKey)).length,
      errors,
      summary,
      settledAt: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
}

module.exports = function settlePurchasesHandler(req, res) {
  return handler(req, res);
};

module.exports._test = {
  getBearerToken,
  isAuthorized,
  getOrigin,
  getPendingRaceKeys,
  fetchResult,
  handler
};
