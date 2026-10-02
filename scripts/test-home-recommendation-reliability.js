"use strict";

const assert = require("node:assert/strict");
const moduleApi = require("../js/home-recommendation-reliability.js");

const now = Date.parse("2026-08-15T18:00:00+09:00");
const schedule = [
  {
    jcd: "01",
    place: "桐生",
    races: [
      {
        raceNo: 9,
        deadlineAt: "2026-08-15T18:52:00+09:00",
        selectable: true,
        status: "before_deadline"
      }
    ]
  },
  {
    jcd: "12",
    place: "住之江",
    races: [
      {
        raceNo: 9,
        deadlineAt: "2026-08-15T18:58:00+09:00",
        selectable: true,
        status: "before_deadline"
      }
    ]
  },
  {
    jcd: "24",
    place: "大村",
    races: [
      {
        raceNo: 9,
        deadlineAt: "2026-08-15T17:59:00+09:00",
        selectable: false,
        status: "closed"
      }
    ]
  }
];

const summary = {
  updatedAt: "2026-08-15T09:47:08.910Z",
  runs: [
    {
      checkedAt: "2026-08-15T09:50:00.000Z",
      threshold: 60,
      compared: [
        {
          jcd: "01",
          place: "桐生",
          raceNo: 9,
          score: 0,
          selectionReady: false,
          selectionStatus: "incomplete",
          scenarioLabel: "4カド攻め"
        },
        {
          jcd: "12",
          place: "住之江",
          raceNo: 9,
          score: 79.8,
          selectionReady: true,
          selectionStatus: "ready",
          scenarioLabel: "2コース差し"
        }
      ]
    }
  ],
  predictions: [
    {
      jcd: "01",
      place: "桐生",
      raceNo: 9,
      deadlineAt: "2026-08-15T18:52:00+09:00",
      selectedAt: "2026-08-15T09:47:05.916Z",
      selection: {
        type: "8項目V2",
        scenarioLabel: "4カド攻め",
        score: 81.1,
        threshold: 60,
        ready: true,
        qualified: true,
        selected: true,
        status: "ready"
      }
    },
    {
      jcd: "24",
      place: "大村",
      raceNo: 9,
      deadlineAt: "2026-08-15T17:59:00+09:00",
      selectedAt: "2026-08-15T08:00:00.000Z",
      selection: {
        type: "8項目V2",
        scenarioLabel: "2コース差し",
        score: 90,
        threshold: 60,
        ready: true,
        qualified: true,
        selected: true,
        status: "ready"
      }
    }
  ]
};

const candidates = moduleApi.collectSummaryCandidates(summary);
assert.equal(candidates.length, 3, "runとselected predictionをレース単位で統合する");
const kiryu = candidates.find(item => item.place === "桐生");
assert.equal(kiryu.score, 81.1, "最新runが暫定でも直前の正式選定を復元する");
assert.equal(kiryu.selectionReady, true);
assert.equal(kiryu.recommendationSource, "selected-prediction");

const selected = moduleApi.selectSummaryRecommendations(summary, schedule, now);
assert.deepEqual(
  selected.map(item => item.place),
  ["桐生", "住之江"],
  "締切前の正式選定をスコア順で表示し、終了済みレースを除外する"
);
assert.equal(selected[0].decision.key, "upset", "4カド攻めを波乱候補として表示する");
assert.equal(selected[0].deadlineAt, "2026-08-15T18:52:00+09:00", "締切は公式scheduleを使う");

const thresholdSummary = {
  runs: [
    {
      checkedAt: "2026-08-15T09:00:00.000Z",
      threshold: 70,
      compared: [{
        jcd: "01",
        place: "桐生",
        raceNo: 9,
        score: 69.9,
        selectionReady: true,
        selectionStatus: "ready",
        scenarioLabel: "1号艇逃げ"
      }]
    }
  ]
};
assert.equal(
  moduleApi.selectSummaryRecommendations(thresholdSummary, schedule, now).length,
  0,
  "各runの元の基準値を維持する"
);

(async () => {
  let requestedUrl = "";
  let requestedOptions = null;
  const data = await moduleApi.fetchSummary({
    date: "20260815",
    now: () => 123456,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedOptions = options;
      return {
        ok: true,
        json: async () => ({ runs: [], predictions: [] })
      };
    }
  });
  assert.deepEqual(data, { runs: [], predictions: [] });
  assert.equal(requestedUrl, "data/predictions/summaries/20260815.json?t=123456");
  assert.equal(requestedOptions.cache, "no-store", "ブラウザとPagesの古い要約を再利用しない");
  console.log("本日のおすすめ表示信頼性テスト: 合格");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
