"use strict";

const assert = require("node:assert/strict");
const moduleApi = require("../js/odds-fetch-cache.js");

function allOdds() {
  const byTicket = {};
  let index = 1;
  for (let first = 1; first <= 6; first += 1) {
    for (let second = 1; second <= 6; second += 1) {
      if (second === first) continue;
      for (let third = 1; third <= 6; third += 1) {
        if (third === first || third === second) continue;
        byTicket[`${first}-${second}-${third}`] = 1 + index / 10;
        index += 1;
      }
    }
  }
  return byTicket;
}

function testRoot(fetchImpl) {
  return {
    URL,
    Response,
    AbortController,
    DOMException,
    location: { href: "https://example.test/app/" },
    setTimeout,
    clearTimeout,
    fetch: fetchImpl,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    dispatchEvent() {}
  };
}

(async () => {
  const params = { jcd: "19", rno: 8, date: "20260815" };
  const payload = {
    ok: true,
    available: true,
    count: 120,
    byTicket: allOdds()
  };
  assert.equal(Object.keys(payload.byTicket).length, 120);
  assert.deepEqual(moduleApi.normalizeParams({ stadiumCode: 19, raceNo: "8", hd: "2026-08-15" }), params);
  assert.equal(moduleApi.keyOf(params), "20260815:19:8");
  assert.equal(moduleApi.positiveOddsCount(payload.byTicket), 120);

  let networkRequests = 0;
  const nativeFetch = async () => {
    networkRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 15));
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  const root = testRoot(nativeFetch);
  const cache = moduleApi.create({ root, fetchImpl: nativeFetch, cacheTtlMs: 5000 });

  const responses = await Promise.all([
    cache.fetchResponse(params),
    cache.fetchResponse(params),
    cache.fetchResponse(params),
    cache.fetchResponse(params)
  ]);
  const bodies = await Promise.all(responses.map(response => response.json()));
  assert.equal(networkRequests, 1, "同一レースの同時オッズ取得を1通信へまとめる");
  assert.ok(bodies.every(body => body.count === 120));
  assert.equal(cache.getStats().dedupedRequests, 3);

  const cached = await cache.fetchData(params);
  assert.equal(networkRequests, 1, "取得済みオッズを短時間再利用する");
  assert.equal(cached.count, 120);
  assert.ok(cache.getStats().cacheHits >= 1);

  let retryRequests = 0;
  const retryFetch = async () => {
    retryRequests += 1;
    const body = retryRequests === 1
      ? { ok: true, available: false, count: 0, byTicket: {} }
      : payload;
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const retryCache = moduleApi.create({
    root: testRoot(retryFetch),
    fetchImpl: retryFetch,
    cacheTtlMs: 5000
  });
  assert.equal(await retryCache.fetchData(params), null);
  assert.equal((await retryCache.fetchData(params)).count, 120);
  assert.equal(retryRequests, 2, "空・失敗応答を固定キャッシュせず次回再取得する");

  let patchedRequests = 0;
  const patchedRoot = testRoot(async () => {
    patchedRequests += 1;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response(JSON.stringify(payload), { status: 200 });
  });
  const patched = moduleApi.create({
    root: patchedRoot,
    fetchImpl: patchedRoot.fetch.bind(patchedRoot),
    cacheTtlMs: 5000
  });
  assert.equal(patched.install(), true);
  const url = moduleApi.urlFor(params);
  const [first, second] = await Promise.all([
    patchedRoot.fetch(url),
    patchedRoot.fetch(url)
  ]);
  assert.equal((await first.json()).count, 120);
  assert.equal((await second.json()).count, 120);
  assert.equal(patchedRequests, 1, "既存のfetch経路も同じ共有通信へ接続する");

  console.log("オッズ単一リクエスト共有テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
