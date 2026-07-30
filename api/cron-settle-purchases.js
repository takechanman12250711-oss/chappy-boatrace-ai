"use strict";

const settlePurchases = require("./settle-purchases");

function isCronAuthorized(req, env = process.env) {
  const expected = String(env.CRON_SECRET || "");
  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || "");
  return Boolean(expected) && authorization === `Bearer ${expected}`;
}

module.exports = async function cronSettlePurchases(req, res) {
  res.setHeader?.("Cache-Control", "no-store");
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ ok: false, error: "定期照合の認証に失敗しました" });
  }

  const forwardedReq = {
    ...req,
    method: "POST",
    headers: {
      ...req.headers,
      authorization: `Bearer ${String(process.env.CHAPPY_PURCHASE_SYNC_TOKEN || "")}`
    }
  };

  return settlePurchases(forwardedReq, res);
};

module.exports._test = { isCronAuthorized };
