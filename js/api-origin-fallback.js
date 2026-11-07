// 2026-11-07: the Vercel API (chappy-boatrace-api.vercel.app) is paused after
// its free memory quota ran out, so the app could not load race data. The same
// public routes now also run on Cloudflare Workers. Requests for those routes
// go to Cloudflare first and fall back to Vercel when Cloudflare cannot
// answer. Purchases and other routes keep using Vercel unchanged.
(function (root) {
  "use strict";
  const VERCEL = "https://chappy-boatrace-api.vercel.app";
  const CLOUDFLARE = "https://chappy-boatrace-read-api.takechanman12250711.workers.dev";
  const ROUTES = ["/api/schedule", "/api/race", "/api/odds", "/api/result"];
  const original = typeof root.fetch === "function" ? root.fetch.bind(root) : null;
  if (!original || root.ChappyApiOrigin) return;

  function cloudflareUrl(input) {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (typeof raw !== "string" || !raw.startsWith(VERCEL + "/")) return null;
    const url = new URL(raw);
    if (!ROUTES.includes(url.pathname.replace(/\/+$/, ""))) return null;
    return CLOUDFLARE + url.pathname + url.search;
  }

  // A response worth showing: anything except a server or platform error.
  const usable = response => response && response.status < 500 && response.status !== 429 && response.status !== 402;

  async function fetchWithFallback(input, init) {
    const target = cloudflareUrl(input);
    if (!target) return original(input, init);
    const options = input instanceof Request ? { method: input.method, headers: input.headers, signal: input.signal, ...(init || {}) } : init;
    let first;
    try {
      first = await original(target, options);
      if (usable(first)) return first;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
    try {
      const second = await original(input, init);
      if (usable(second) || !first) return second;
    } catch (error) {
      if (!first) throw error;
    }
    return first;
  }

  root.fetch = fetchWithFallback;
  root.ChappyApiOrigin = Object.freeze({ VERCEL, CLOUDFLARE, ROUTES, cloudflareUrl });
})(typeof window !== "undefined" ? window : globalThis);
