"use strict";

const purchaseSync = require("../js/purchase-sync-core");
const store = require("./_purchase-store");

const MAX_BATCH_SIZE = 500;

function getBearerToken(req) {
  const authorization = String(
    req?.headers?.authorization ||
    req?.headers?.Authorization ||
    ""
  );
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

  const host = String(
    req?.headers?.["x-forwarded-host"] ||
    req?.headers?.host ||
    ""
  );
  const protocol = String(req?.headers?.["x-forwarded-proto"] || "https");
  return host ? `${protocol}://${host}` : "";
}

async function triggerSettlement(req, env = process.env, fetchImpl = fetch) {
  const origin = getOrigin(req, env);
  const token = String(env.CHAPPY_PURCHASE_SYNC_TOKEN || "");

  if (!origin || !token) {
    return {
      triggered: false,
      reason: "settlement_endpoint_unavailable"
    };
  }

  try {
    const response = await fetchImpl(`${origin}/api/settle-purchases`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: AbortSignal.timeout(20000)
    });

    return {
      triggered: response.ok,
      status: response.status
    };
  } catch (error) {
    return {
      triggered: false,
      reason: String(error?.message || error)
    };
  }
}

function parseBody(req) {
  if (req?.body && typeof req.body === "object") return req.body;
  if (typeof req?.body !== "string" || !req.body.trim()) return {};

  try {
    return JSON.parse(req.body);
  } catch {
    throw new Error("JSON形式が不正です");
  }
}

function normalizeBatch(body) {
  const source = Array.isArray(body)
    ? body
    : Array.isArray(body?.purchases)
      ? body.purchases
      : [];

  if (!source.length) {
    throw new Error("purchasesが空です");
  }
  if (source.length > MAX_BATCH_SIZE) {
    throw new Error(`1回の同期は${MAX_BATCH_SIZE}件までです`);
  }

  const normalized = source
    .map(purchaseSync.normalizePurchase)
    .filter(Boolean);

  if (!normalized.length) {
    throw new Error("有効な購入明細がありません");
  }
  if (normalized.length !== source.length) {
    throw new Error("不正な購入明細が含まれています");
  }

  return normalized;
}

function filterPurchases(purchases, query = {}) {
  const date = String(query.date || "").replace(/\D/g, "");
  const raceKey = String(query.raceKey || "");

  return purchases.filter((purchase) => {
    if (date && purchase.date !== date) return false;
    if (raceKey && purchase.raceKey !== raceKey) return false;
    return true;
  });
}

async function handler(req, res, dependencies = {}) {
  const env = dependencies.env || process.env;
  const purchaseStore = dependencies.store || store;
  const fetchImpl = dependencies.fetchImpl || fetch;

  res.setHeader?.("Cache-Control", "no-store");

  if (!isAuthorized(req, env)) {
    return res.status(401).json({
      ok: false,
      error: "購入同期の認証に失敗しました"
    });
  }

  try {
    if (req.method === "GET") {
      const purchases = await purchaseStore.loadPurchases({ env });
      const filtered = filterPurchases(purchases, req.query || {});
      return res.status(200).json({
        ok: true,
        count: filtered.length,
        purchases: filtered
      });
    }

    if (req.method === "POST") {
      const incoming = normalizeBatch(parseBody(req));
      const existing = await purchaseStore.loadPurchases({ env });
      const merged = purchaseSync.mergePurchases(existing, incoming);
      await purchaseStore.savePurchases(merged, { env });

      const autoSettlement = await triggerSettlement(req, env, fetchImpl);

      return res.status(200).json({
        ok: true,
        received: incoming.length,
        stored: merged.length,
        added: Math.max(0, merged.length - existing.length),
        autoSettlement,
        syncedAt: new Date().toISOString()
      });
    }

    res.setHeader?.("Allow", "GET, POST");
    return res.status(405).json({
      ok: false,
      error: "GETまたはPOSTを使用してください"
    });
  } catch (error) {
    const message = String(error?.message || error);
    const clientError = /JSON|purchases|購入明細|件まで/.test(message);
    return res.status(clientError ? 400 : 500).json({
      ok: false,
      error: message
    });
  }
}

module.exports = function purchasesHandler(req, res) {
  return handler(req, res);
};

module.exports._test = {
  MAX_BATCH_SIZE,
  getBearerToken,
  isAuthorized,
  getOrigin,
  triggerSettlement,
  parseBody,
  normalizeBatch,
  filterPurchases,
  handler
};
