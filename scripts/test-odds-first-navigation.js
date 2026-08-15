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
let resultPanelLoads = 0;

const root = {
  ChappyHomeDashboardV2: {
    getDate: () => "20260815",
    getSchedule: () => [{ place: "下関", jcd: "19" }]
  },
  ChappyAPI: {
    prefetchRace: async params => {
      raceRequests += 1;
      return { ok: true, ...params };
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

  const runtime = api.install(root);
  const request = runtime.startPrefetch(button);
  assert.ok(request, "レース選択時に先行取得を開始する");
  await Promise.all([request.racePromise, request.oddsPromise]);

  assert.equal(raceRequests, 1, "重い予想JSより先にレースAPIを開始する");
  assert.equal(oddsRequests, 1, "重い予想JSより先にオッズAPIを開始する");
  assert.match(status.textContent, /オッズ120通り先行取得済み/);
  assert.equal(status.dataset.state, "loading");
  assert.equal(runtime.isNavigationPending(), true);

  const deferredResult = await root.ChappyTodayResultsHome.load();
  assert.equal(deferredResult, null, "予想表示前は結果パネルの追加読込を始めない");
  assert.equal(resultPanelLoads, 0);

  assert.match(source, /ChappyAPI\?\.prefetchRace/);
  assert.match(source, /ChappyOddsFetchCache\?\.fetchData/);
  assert.match(source, /requestIdleCallback/);
  assert.match(source, /deferredResultPanel/);

  console.log("ホーム選択直後のオッズ先行取得テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
