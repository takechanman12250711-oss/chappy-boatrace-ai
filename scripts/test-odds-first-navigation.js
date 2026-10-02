"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../js/odds-first-navigation.js");

const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "odds-first-navigation.js"),
  "utf8"
);

const button = {
  dataset: {
    place: "下関",
    race: "11"
  },
  disabled: false
};
const status = {
  textContent: "オッズ待機中",
  dataset: {}
};
let raceRequests = 0;
let oddsRequests = 0;
let downstreamOddsRequests = 0;
let resultPanelLoads = 0;
let clearedOddsCaches = 0;

const root = {
  URL,
  Response,
  location: {
    href: "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/"
  },
  ChappyHomeDashboardV2: {
    getDate: () => "20260815",
    getSchedule: () => [{ place: "下関", jcd: "19" }]
  },
  ChappyAPI: {
    prefetchRace: async params => {
      raceRequests += 1;
      return { ok: true, entries: [], ...params };
    }
  },
  ChappyOddsFetchCache: {
    fetchData: async params => {
      oddsRequests += 1;
      return {
        ok: true,
        available: true,
        count: 120,
        byTicket: {
          "1-2-3": 4.2,
          "1-2-4": 6.8
        },
        ...params
      };
    },
    clear() {
      clearedOddsCaches += 1;
    }
  },
  ChappyTodayResultsHome: {
    load: async () => {
      resultPanelLoads += 1;
      return {};
    }
  },
  document: {
    addEventListener() {},
    getElementById(id) {
      return id === "predictionOddsStatus" ? status : null;
    }
  },
  addEventListener() {},
  dispatchEvent() {},
  fetch: async () => {
    downstreamOddsRequests += 1;
    return new Response(JSON.stringify({
      ok: true,
      available: false,
      count: 0,
      byTicket: {}
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  },
  setTimeout() {
    return 1;
  },
  clearTimeout() {},
  CustomEvent: class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }
};

(async () => {
  assert.deepEqual(
    api.resolveParams(root, button),
    {
      place: "下関",
      jcd: "19",
      rno: 11,
      date: "20260815",
      key: "20260815:19:11"
    },
    "ホームボタンからAPI取得条件を確定する"
  );
  assert.equal(
    api.positiveOddsCount({
      byTicket: {
        "1-2-3": 4.2,
        "1-2-4": 0,
        "1-2-5": null
      }
    }),
    1,
    "有効なオッズだけを数える"
  );
  assert.equal(
    api.usableOddsData({
      ok: true,
      available: true,
      byTicket: { "1-2-3": 4.2 }
    }),
    true,
    "正の公式オッズを引き渡し可能と判定する"
  );

  const runtime = api.install(root);
  const request = runtime.startPrefetch(button);
  assert.ok(request, "レース選択時に先行取得を開始する");

  const bridgedResponsePromise = root.fetch(
    "https://chappy-boatrace-api.vercel.app/api/odds?jcd=19&rno=11&date=20260815"
  );
  await Promise.all([request.racePromise, request.oddsPromise]);
  const bridgedResponse = await bridgedResponsePromise;
  const bridgedData = await bridgedResponse.json();

  assert.equal(raceRequests, 1, "重い予想JSより先にレースAPIを開始する");
  assert.equal(oddsRequests, 1, "重い予想JSより先にオッズAPIを開始する");
  assert.equal(downstreamOddsRequests, 0, "通常予想のオッズ通信は先行取得済み応答を再利用する");
  assert.equal(bridgedData.count, 120, "通常予想へ公式120通りをそのまま引き渡す");
  assert.equal(
    bridgedResponse.headers.get("x-chappy-odds-prefetch"),
    "hit",
    "先行取得済み応答であることを識別できる"
  );
  assert.match(status.textContent, /オッズ120通り取得済み/);
  assert.equal(status.dataset.state, "loading");
  assert.equal(runtime.isNavigationPending(), true);
  assert.equal(runtime.getPrefetchedOdds()?.count, 120);
  assert.equal((await runtime.waitForActiveOdds(2500))?.count, 120);

  runtime.startPrefetch(button);
  assert.equal(oddsRequests, 1, "pointerdownとclickの二重イベントでも1通信にまとめる");

  const deferredResult = await root.ChappyTodayResultsHome.load();
  assert.equal(deferredResult, null, "予想表示前は結果パネルの追加読込を始めない");
  assert.equal(resultPanelLoads, 0);

  assert.equal(runtime.clearPrefetch("20260815:19:11"), true);
  assert.equal(clearedOddsCaches, 1, "明示更新時は短期オッズキャッシュも破棄する");
  const networkResponse = await root.fetch(
    "https://chappy-boatrace-api.vercel.app/api/odds?jcd=19&rno=11&date=20260815"
  );
  assert.equal((await networkResponse.json()).count, 0);
  assert.equal(downstreamOddsRequests, 1, "明示更新後は公式APIへ再取得する");

  assert.match(source, /ChappyAPI\?\.prefetchRace/);
  assert.match(source, /ChappyOddsFetchCache\?\.fetchData/);
  assert.match(source, /__chappyOddsFirstBridge/);
  assert.match(source, /waitForActiveOdds/);
  assert.match(source, /PREFETCH_RETENTION_MS = 120000/);
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /deferredResultPanel/);

  console.log("ホーム選択直後のオッズ先行取得・通常予想引き渡しテスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
