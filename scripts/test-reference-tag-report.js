"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const reportUi = require("../js/reference-tag-report");
const source = fs.readFileSync(
  path.join(__dirname, "..", "js", "reference-tag-report.js"),
  "utf8"
);

const report = {
  schemaVersion: 3,
  dataSource: "boatrace-official",
  compatibilityProfile: "hiyori-compatible",
  directHiyoriDataUsed: false,
  settledRaceCount: 696,
  matchedRaceCount: 650,
  sourceBreakdown: {
    legacyUnlabeledRaceCount: 696,
    acceptedLegacyUnlabeledRaceCount: 640
  },
  tags: [
    {
      key: "start",
      label: "ST上位艇",
      samples: 638,
      winnerRate: 21.9,
      top3Rate: 57.7,
      ticketHitRate: 18.3,
      status: "参考度高"
    },
    {
      key: "wind",
      label: "強風注意",
      samples: 149,
      ticketHitRate: 18.1,
      status: "参考条件"
    }
  ]
};

assert.equal(reportUi.REPORT_URL, "data/analysis/reference-tag-effectiveness.json");
assert.equal(reportUi.REPORT_LOAD_TIMEOUT_MS, 15000);
assert.equal(reportUi.isOfficialCompatible(report), true);
assert.equal(reportUi.normalizeRows(report).length, 2);

const html = reportUi.renderHtml(report);
assert.match(html, /公式データ参考分析/);
assert.match(html, /BOAT RACE公式 696Rを照合/);
assert.match(html, /日和準拠形式で650R分析/);
assert.match(html, /ST上位艇/);
assert.match(html, /強風注意/);
assert.match(html, /旧保存分640Rは公式API収集経路を根拠/);
assert.match(html, /予想・印・買い目へ自動反映しません/);
assert.equal(html.includes("<table"), false, "理論ごとの余計な表を追加しない");
assert.equal(html.includes("日和データ・公式結果比較"), false);

const oldArtifactHtml = reportUi.renderHtml({
  ...report,
  sourceBreakdown: { legacyUnlabeledRaceCount: 696 }
});
assert.match(
  oldArtifactHtml,
  /旧保存分696Rは公式API収集経路を根拠/,
  "旧artifactでは従来フィールドへフォールバックする"
);

const loadingHtml = reportUi.renderHtml(report, { loading: true });
assert.match(loadingHtml, /aria-busy="true"/);
assert.match(loadingHtml, /role="status" aria-live="polite"/);

const errorHtml = reportUi.renderHtml(null, { error: "temporary failure" });
assert.match(errorHtml, /data-reference-tag-retry/);
assert.match(errorHtml, />再読み込み</);
assert.match(errorHtml, /role="alert" aria-live="assertive"/);

assert.equal(typeof reportUi.isResultActive, "function");
assert.equal(typeof reportUi.ensureMounted, "function");
assert.match(source, /new root\.MutationObserver/);
assert.match(source, /ensureMounted\(\)/);
assert.match(source, /mounted\.contains\(document\.activeElement\)/);
assert.match(source, /summary\?\.focus\(\{ preventScroll: true \}\)/);
assert.match(source, /querySelector\("\[data-reference-tag-retry\]"\).*addEventListener\("click"/s);
assert.match(
  source,
  /root\.addEventListener\("chappy:view-changed"[\s\S]*requestWhenActive\(\);\n  }/,
  "イベント後に遅れて読み込まれても現在の結果画面で取得を開始する"
);

const directHiyori = {
  ...report,
  dataSource: "ボートレース日和",
  directHiyoriDataUsed: true
};
assert.equal(reportUi.isOfficialCompatible(directHiyori), false);
assert.equal(reportUi.normalizeRows(directHiyori).length, 0);
assert.match(reportUi.renderHtml(directHiyori), /確認できませんでした/);

async function testRetryAfterTemporaryFailure() {
  const previousDocument = global.document;
  const previousFetch = global.fetch;
  const previousAddEventListener = global.addEventListener;
  const previousSetTimeout = global.setTimeout;
  const previousClearTimeout = global.clearTimeout;
  const resultSection = { hidden: true };
  const listeners = new Map();
  const styles = new Map();
  let timeoutCallback = null;
  let requestSignal = null;
  let calls = 0;
  global.fetch = async (url, options = {}) => {
    calls += 1;
    requestSignal = options.signal || null;
    if (calls === 1) return new Promise(() => {});
    return {
      ok: true,
      json: async () => report
    };
  };
  global.setTimeout = (callback, delay) => {
    assert.equal(delay, reportUi.REPORT_LOAD_TIMEOUT_MS);
    timeoutCallback = callback;
    return 1;
  };
  global.clearTimeout = () => {};
  global.document = {
    getElementById(id) {
      if (id === "resultSection") return resultSection;
      return styles.get(id) || null;
    },
    createElement(tagName) {
      assert.equal(tagName, "style");
      return { id: "", textContent: "" };
    },
    head: {
      appendChild(element) {
        styles.set(element.id, element);
      }
    },
    querySelector() {
      return null;
    }
  };
  global.addEventListener = (name, listener) => {
    listeners.set(name, listener);
  };

  try {
    reportUi.install();
    assert.equal(reportUi.isResultActive(), false);
    listeners.get("chappy:stats-runtime-ready")?.();
    assert.strictEqual(calls, 0, "結果画面が非表示なら取得を開始しない");

    resultSection.hidden = false;
    listeners.get("chappy:stats-runtime-ready")?.();
    assert.equal(reportUi.isResultActive(), true);
    assert.strictEqual(calls, 1, "遅れて読み込まれても表示中なら取得を開始する");
    const stalledLoad = reportUi.load();
    assert.equal(typeof timeoutCallback, "function");
    timeoutCallback();
    assert.strictEqual(await stalledLoad, null);
    assert.equal(requestSignal?.aborted, true, "応答停止時は15秒で取得を中断する");
    assert.deepStrictEqual(await reportUi.load(), report);
    assert.strictEqual(calls, 2, "タイムアウト後は同一セッションで再試行する");

    resultSection.hidden = true;
    assert.strictEqual(await reportUi.load(), null);
    assert.strictEqual(calls, 2, "取得済みでも非表示中に再取得しない");
  } finally {
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
    if (previousFetch === undefined) delete global.fetch;
    else global.fetch = previousFetch;
    if (previousAddEventListener === undefined) delete global.addEventListener;
    else global.addEventListener = previousAddEventListener;
    global.setTimeout = previousSetTimeout;
    global.clearTimeout = previousClearTimeout;
  }
}

testRetryAfterTemporaryFailure()
  .then(() => console.log("公式データ参考分析UIテスト: 合格"))
  .catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
