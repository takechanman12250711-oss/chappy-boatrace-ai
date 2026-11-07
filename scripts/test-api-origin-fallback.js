"use strict";
// The app reads public race data from Cloudflare first and Vercel second.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("js/api-origin-fallback.js", "utf8");
const V = "https://chappy-boatrace-api.vercel.app", C = "https://chappy-boatrace-read-api.takechanman12250711.workers.dev";

function load(responder) {
  const calls = [];
  const window = { fetch: async (url, init) => { calls.push(String(url)); return responder(String(url), init); } };
  vm.runInNewContext(source, { window, URL, Request: globalThis.Request, globalThis: window });
  return { window, calls };
}
const res = status => ({ status, ok: status >= 200 && status < 300 });

(async () => {
  // Cloudflare answers: Vercel is not called.
  let t = load(() => res(200));
  assert.equal((await t.window.fetch(`${V}/api/schedule?date=20261107`)).status, 200);
  assert.deepEqual(t.calls, [`${C}/api/schedule?date=20261107`]);
  // Cloudflare fails (5xx / network): Vercel is tried.
  t = load(url => res(url.startsWith(C) ? 503 : 200));
  assert.equal((await t.window.fetch(`${V}/api/race?jcd=14&rno=4&date=20261107`)).status, 200);
  assert.deepEqual(t.calls, [`${C}/api/race?jcd=14&rno=4&date=20261107`, `${V}/api/race?jcd=14&rno=4&date=20261107`]);
  t = load(url => { if (url.startsWith(C)) throw new TypeError("network"); return res(200); });
  assert.equal((await t.window.fetch(`${V}/api/odds?jcd=1&rno=1&date=20261107`)).status, 200);
  // Both fail: the Cloudflare answer is returned, not an exception.
  t = load(() => res(503));
  assert.equal((await t.window.fetch(`${V}/api/result?jcd=1&rno=1&date=20261107`)).status, 503);
  // A client error from Cloudflare (bad query) is shown as is.
  t = load(() => res(400));
  assert.equal((await t.window.fetch(`${V}/api/race`)).status, 400);
  assert.equal(t.calls.length, 1);
  // Purchases and other routes and other hosts are untouched.
  for (const url of [`${V}/api/purchases`, `${V}/api/missing?date=1`, `${V}/api/settle-purchases`, "https://example.com/api/race"]) {
    t = load(() => res(200)); await t.window.fetch(url); assert.deepEqual(t.calls, [url]);
  }
  // A caller's abort is not turned into a second request.
  t = load(() => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
  await assert.rejects(t.window.fetch(`${V}/api/schedule?date=1`), /aborted/);
  assert.equal(t.calls.length, 1);
  // Loaded before the app scripts in index.html.
  const html = fs.readFileSync("index.html", "utf8");
  const shim = html.indexOf("js/api-origin-fallback.js"), firstAppScript = html.indexOf('<script src="js/', shim + 1);
  assert.ok(shim > 0 && (firstAppScript === -1 || shim < firstAppScript) && shim < html.indexOf("</head>"));
  console.log("api origin fallback tests passed");
})().catch(e => { console.error(e); process.exitCode = 1; });
