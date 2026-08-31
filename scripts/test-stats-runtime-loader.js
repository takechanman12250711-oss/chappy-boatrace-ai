"use strict";

const assert =
  require("node:assert/strict");
const path =
  require("node:path");

const appended = [];
const dispatched = [];
const windowListeners =
  new Map();
const documentListeners =
  new Map();
const anchorListeners =
  new Map();
let failFirstLoad = true;
let failOptionalOnce = true;
const resultSection = {
  hidden: true
};

function createScript() {
  const listeners =
    new Map();
  const script = {
    src: "",
    async: true,
    dataset: {},
    addEventListener(
      name,
      listener
    ) {
      listeners.set(
        name,
        listener
      );
    },
    remove() {
      const index =
        appended.indexOf(script);
      if (index >= 0) {
        appended.splice(index, 1);
      }
    },
    emit(name) {
      listeners.get(name)?.();
    }
  };
  return script;
}

global.window = global;
global.CustomEvent = class {
  constructor(type, options = {}) {
    this.type = type;
    this.detail =
      options.detail;
  }
};
global.dispatchEvent = event => {
  dispatched.push(event.type);
};
global.addEventListener = (
  name,
  listener
) => {
  windowListeners.set(
    name,
    listener
  );
};
global.location = {
  hash: ""
};
global.document = {
  readyState: "loading",
  get scripts() {
    return appended;
  },
  head: {
    appendChild(script) {
      appended.push(script);
      queueMicrotask(() => {
        if (failFirstLoad) {
          failFirstLoad = false;
          script.emit("error");
        } else if (
          failOptionalOnce &&
          script.src.includes("js/reference-tag-report.js")
        ) {
          failOptionalOnce = false;
          script.emit("error");
        } else {
          script.emit("load");
        }
      });
    }
  },
  createElement(tagName) {
    assert.equal(
      tagName,
      "script"
    );
    return createScript();
  },
  addEventListener(
    name,
    listener
  ) {
    documentListeners.set(
      name,
      listener
    );
  },
  getElementById(id) {
    return id === "resultSection"
      ? resultSection
      : null;
  },
  querySelector(selector) {
    return selector ===
      'a[href="#resultSection"]'
      ? {
          addEventListener(
            name,
            listener
          ) {
            anchorListeners.set(
              name,
              listener
            );
          }
        }
      : null;
  }
};

require(
  path.join(
    __dirname,
    "..",
    "js",
    "stats-runtime-loader.js"
  )
);

async function main() {
  assert.equal(
    appended.length,
    0,
    "DOMContentLoaded前は結果分析モジュールを読まない"
  );
  documentListeners
    .get("DOMContentLoaded")
    ?.();
  assert.equal(
    appended.length,
    0,
    "結果画面を開くまでは結果分析モジュールを読まない"
  );
  resultSection.hidden = false;
  anchorListeners
    .get("click")
    ?.();
  await new Promise(resolve =>
    setTimeout(resolve, 0)
  );
  assert.equal(
    appended.length,
    0,
    "クリック読込が失敗してもscript要素を残さない"
  );

  await window
    .ChappyStatsRuntime
    .ensureReady();

  const loaded =
    appended.map(script =>
      script.dataset
        .chappyStatsModule
    );
  assert.deepEqual(
    loaded,
    [
      "js/boat-identity.js",
      "js/collection-health.js",
      "js/prediction-verification.js",
      "js/prediction-index-loader.js",
      "js/auto-stats.js",
      "js/verification-readiness.js",
      "js/improvement-suggestions.js",
      "js/stats.js",
      "js/result-ui-phase5.js"
    ],
    "一時失敗後も依存順どおり再読込する"
  );
  assert.ok(
    loaded.indexOf(
      "js/prediction-index-loader.js"
    ) <
      loaded.indexOf(
        "js/stats.js"
      ),
    "分割index loaderをstatsより先に読み込む"
  );
  assert.ok(
    loaded.indexOf(
      "js/verification-readiness.js"
    ) <
      loaded.indexOf(
        "js/stats.js"
      )
  );
  assert.equal(
    loaded.includes("js/theory-improvement-dashboard.js"),
    false,
    "成績分析を開いただけで運用診断7ファイルを取得しない"
  );
  assert.ok(
    loaded.indexOf(
      "js/improvement-suggestions.js"
    ) <
      loaded.indexOf(
        "js/stats.js"
      )
  );

  const expectedOptionalScripts = [
    "js/reference-tag-report.js",
    "js/outer-attack-ticket-shadow.js",
    "js/outer-attack-ticket-settlement.js",
    "js/outer-attack-ticket-decision-gate.js"
  ];
  assert.deepEqual(
    window.ChappyStatsRuntime.optionalScripts,
    expectedOptionalScripts,
    "公式参考分析と外攻めA/B判定は結果本体を止めない任意モジュールとして扱う"
  );
  assert.deepEqual(
    dispatched,
    [
      "chappy:stats-runtime-ready",
      "chappy:stats-requested"
    ]
  );

  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(
    appended.some(script =>
      expectedOptionalScripts.includes(
        script.dataset.chappyStatsModule
      )
    ),
    false,
    "先頭の任意モジュールが一時失敗した時は後続を半端に読み込まない"
  );

  await window.ChappyStatsRuntime.ensureReady();
  await new Promise(resolve => setTimeout(resolve, 0));
  const optionalLoaded = appended
    .map(script => script.dataset.chappyStatsModule)
    .filter(name => expectedOptionalScripts.includes(name));
  assert.deepEqual(
    optionalLoaded,
    expectedOptionalScripts,
    "任意モジュールだけを次回要求時に固定順で再試行する"
  );

  const count =
    appended.length;
  await window
    .ChappyStatsRuntime
    .ensureReady();
  assert.equal(
    appended.length,
    count,
    "成功後は二重読込しない"
  );

  resultSection.hidden = true;
  const eventsBeforeHiddenEnsure = dispatched.length;
  await window.ChappyStatsRuntime.ensureReady();
  assert.equal(
    dispatched.length,
    eventsBeforeHiddenEnsure,
    "結果画面を離れた後は重い集計開始イベントを出さない"
  );
  resultSection.hidden = false;
  await window.ChappyStatsRuntime.ensureReady();
  assert.equal(
    dispatched.at(-1),
    "chappy:stats-requested",
    "結果画面を開き直した時にだけ集計を開始する"
  );

  location.hash =
    "#resultSection";
  windowListeners
    .get("hashchange")
    ?.();
  await window
    .ChappyStatsRuntime
    .ensureReady();
  assert.equal(
    appended.length,
    count,
    "結果画面への直接hash移動でも既存モジュールを再利用する"
  );

  console.log(
    "結果分析遅延ローダー再試行テスト: 合格"
  );
}

main().catch(error => {
  console.error(
    error?.stack ||
    error
  );
  process.exitCode = 1;
});
