"use strict";

const DEFAULT_KEY = "chappy:purchases:v1";

function getConfig(env = process.env) {
  const url = String(
    env.UPSTASH_REDIS_REST_URL ||
    env.KV_REST_API_URL ||
    ""
  ).replace(/\/$/, "");
  const token = String(
    env.UPSTASH_REDIS_REST_TOKEN ||
    env.KV_REST_API_TOKEN ||
    ""
  );

  return {
    url,
    token,
    key: String(env.CHAPPY_PURCHASE_STORE_KEY || DEFAULT_KEY),
    configured: Boolean(url && token)
  };
}

async function command(config, parts, fetchImpl = fetch) {
  if (!config?.configured) {
    throw new Error("購入同期の保存先が未設定です");
  }

  const encoded = parts.map((part) =>
    encodeURIComponent(String(part))
  );
  const response = await fetchImpl(
    `${config.url}/${encoded.join("/")}`,
    {
      headers: {
        Authorization: `Bearer ${config.token}`
      }
    }
  );

  if (!response.ok) {
    throw new Error(`購入データ保存失敗: ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`購入データ保存失敗: ${payload.error}`);
  }
  return payload?.result;
}

async function loadPurchases(options = {}) {
  const config = options.config || getConfig(options.env);
  const raw = await command(config, ["get", config.key], options.fetchImpl);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error("保存済み購入データの形式が不正です");
  }
}

async function savePurchases(purchases, options = {}) {
  const config = options.config || getConfig(options.env);
  const source = Array.isArray(purchases) ? purchases : [];
  await command(
    config,
    ["set", config.key, JSON.stringify(source)],
    options.fetchImpl
  );
  return source;
}

module.exports = {
  DEFAULT_KEY,
  getConfig,
  command,
  loadPurchases,
  savePurchases
};
