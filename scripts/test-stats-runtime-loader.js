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
  getElementById() {
    return null;
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
      "js/collection-health.js",
      "js/prediction-verification.js",
      "js/auto-stats.js",
      "js/verification-readiness.js",
      "js/improvement-suggestions.js",
      "js/stats.js"
    ],
    "一時失敗後も依存順どおり再読込する"
  );
  assert.ok(
    loaded.indexOf(
      "js/verification-readiness.js"
    ) <
      loaded.indexOf(
        "js/stats.js"
      )
  );
  assert.ok(
    loaded.indexOf(
      "js/improvement-suggestions.js"
    ) <
      loaded.indexOf(
        "js/stats.js"
      )
  );
  assert.deepEqual(
    dispatched,
    [
      "chappy:stats-requested",
      "chappy:stats-runtime-ready"
    ]
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
