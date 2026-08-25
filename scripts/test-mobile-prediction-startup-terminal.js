"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const terminal = require(path.join(
  __dirname,
  "..",
  "js",
  "mobile-prediction-startup-terminal.js"
));

const ROOT = path.resolve(__dirname, "..");
const read = relativePath => fs.readFileSync(
  path.join(ROOT, relativePath),
  "utf8"
);

const BUILD = "20260825-display-layout1";
const html = read("index.html");
const appRuntimeSource = read("js/app-runtime-loader.js");
const apiSource = read("js/api.js");
const terminalSource = read("js/mobile-prediction-startup-terminal.js");
const homeSource = read("js/home-dashboard-v2.js");

assert.equal(terminal.build, BUILD);
assert.match(html, new RegExp(`CHAPPY_APP_BUILD="${BUILD}"`));
assert.ok(
  html.indexOf("ChappyHardRefresh=Object.freeze") <
    html.indexOf('src="js/result-void-compat.js'),
  "外部JSより前に更新処理を接続する"
);
assert.match(
  html,
  /document\.addEventListener\("click",[\s\S]*?#homeRefreshBtn[\s\S]*?,true\)/,
  "外部JSが停止しても更新ボタンを捕捉する"
);
assert.match(
  html,
  /location\.assign\(url\.toString\(\)\)/,
  "iPhoneで別URLへのアプリ再起動を行う"
);
assert.match(html, /label\.textContent="再起動中"/);
[
  "api.js",
  "prediction-runtime-loader.js",
  "live-race-selection-terminal-guard.js",
  "app-runtime-loader.js",
  "home-dashboard-v2.js"
].forEach(file => {
  const pattern = new RegExp(
    `${file.replaceAll(".", "\\.")}[^"]*${BUILD}`
  );
  assert.match(html, pattern, `${file}を同じ配信世代で取得する`);
});
assert.match(
  html,
  /hiyori-runtime-loader\.js\?v=20260825-mobile-startup-terminal4"/,
  "非同期の日和補助は既存の非blocking契約を維持する"
);
assert.match(
  html,
  new RegExp(`mobile-prediction-startup-terminal\\.js\\?v=${BUILD}`)
);
assert.ok(
  html.indexOf("app-runtime-loader.js") <
    html.indexOf("home-dashboard-v2.js") &&
  html.indexOf("home-dashboard-v2.js") <
    html.indexOf("mobile-prediction-startup-terminal.js"),
  "既存runtimeとhomeを生成した後に終端保証を接続する"
);

assert.match(appRuntimeSource, /const ACTIVE_VERSION = root\.CHAPPY_APP_BUILD \|\| VERSION/);
assert.match(apiSource, /function fetchRaceResponse\(url, controller\)/);
assert.match(apiSource, /return Promise\.race\(\[/);
assert.match(apiSource, /error\.code = "RACE_DATA_TIMEOUT"/);
assert.match(apiSource, /Object\.defineProperty\(window, "ChappyDirectFetch"/);
assert.match(appRuntimeSource, /RACE_CONTROLS_MISSING/);
assert.match(appRuntimeSource, /RACE_SELECTION_MISSING/);
assert.match(appRuntimeSource, /renderRuntimeError\(error\)/);
assert.match(terminalSource, /script\.src = `\$\{clean\}\?v=\$\{BUILD\}`/);
assert.match(terminalSource, /await loadScriptWithBuild\(root, src\)/);
assert.match(homeSource, /showPredictionLoading\(place, raceNo\)/);
assert.match(homeSource, /showPredictionError\(message\)/);

function storage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    has(key) {
      return map.has(key);
    }
  };
}

function verifyInlineHardRefresh() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const label = { textContent: "更新" };
  const button = {
    disabled: false,
    querySelector(selector) {
      return selector === "small" ? label : null;
    }
  };
  const status = { textContent: "待機中" };
  const assigned = [];
  const root = {
    location: {
      href: "https://example.test/chappy/?old=1",
      assign(url) {
        assigned.push(url);
        this.href = url;
      }
    },
    document: {
      getElementById(id) {
        if (id === "homeRefreshBtn") return button;
        if (id === "statusArea") return status;
        return null;
      },
      addEventListener(name, listener, capture) {
        documentListeners.set(`${name}:${capture === true}`, listener);
      }
    },
    sessionStorage: storage({ "chappy-home-v2-cache": "session" }),
    localStorage: storage({ "chappy-home-v2-cache": "local" }),
    setTimeout(callback) {
      callback();
      return 1;
    },
    addEventListener(name, listener) {
      windowListeners.set(name, listener);
    }
  };
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap, "先頭の更新bootstrapを取得できる");
  vm.runInNewContext(bootstrap, { window: root, URL, Date, console });

  assert.equal(root.ChappyHardRefresh.build, BUILD);
  const click = documentListeners.get("click:true");
  assert.equal(typeof click, "function");
  let prevented = false;
  let stopped = false;
  click({
    target: {
      closest(selector) {
        return selector === "#homeRefreshBtn" ? button : null;
      }
    },
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(button.disabled, true);
  assert.equal(label.textContent, "再起動中");
  assert.equal(status.textContent, "アプリを再起動しています…");
  assert.equal(root.sessionStorage.has(terminal.cacheKey), false);
  assert.equal(root.localStorage.has(terminal.cacheKey), false);
  assert.equal(assigned.length, 1);
  assert.match(assigned[0], new RegExp(`appBuild=${BUILD}`));
  assert.match(assigned[0], /reload=\d+/);
}

verifyInlineHardRefresh();

function createRoot({
  raceReady = false,
  predictionReady = false,
  predictionScripts = []
} = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const scripts = [];
  const preloads = [];
  const elements = {
    resultArea: {
      dataset: { raceLoading: "true" },
      innerHTML: "",
      textContent: ""
    },
    errorArea: {
      style: {},
      textContent: ""
    },
    statusArea: {
      textContent: ""
    },
    predictionOddsStatus: {
      dataset: {},
      textContent: ""
    },
    fetchRaceBtn: {
      id: "fetchRaceBtn"
    }
  };
  const replaced = [];
  const root = {
    URL,
    location: {
      href: "https://example.test/chappy/?old=1",
      replace(url) {
        replaced.push(url);
        this.href = url;
      }
    },
    document: {
      documentElement: { dataset: {} },
      scripts,
      head: {
        appendChild(element) {
          if (element.rel === "preload") {
            preloads.push(element);
            return element;
          }
          scripts.push(element);
          setImmediate(() => element.__listeners.get("load")?.());
          return element;
        }
      },
      createElement(tagName) {
        if (tagName === "link") {
          return {
            rel: "",
            as: "",
            href: ""
          };
        }
        assert.equal(tagName, "script");
        const listeners = new Map();
        return {
          async: true,
          dataset: {},
          src: "",
          __listeners: listeners,
          addEventListener(name, listener) {
            listeners.set(name, listener);
          },
          remove() {
            const index = scripts.indexOf(this);
            if (index >= 0) scripts.splice(index, 1);
          }
        };
      },
      querySelectorAll(selector) {
        assert.equal(selector, 'link[rel="preload"][as="script"]');
        return preloads;
      },
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener(name, listener, capture) {
        documentListeners.set(`${name}:${capture === true}`, listener);
      }
    },
    sessionStorage: storage({
      "chappy-home-v2-cache": "session"
    }),
    localStorage: storage({
      "chappy-home-v2-cache": "local"
    }),
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    addEventListener(name, listener) {
      windowListeners.set(name, listener);
    },
    dispatchEvent(event) {
      windowListeners.get(event.type)?.(event);
      return true;
    },
    ChappyHomeDashboardV2: {
      showPredictionError(message) {
        elements.resultArea.dataset.raceLoading = "error";
        elements.resultArea.textContent = message;
      }
    },
    ChappyAppRuntime: Object.freeze({
      version: "legacy-app",
      ensure: async () => true,
      groups: {}
    }),
    ChappyPredictionRuntime: Object.freeze({
      version: "legacy-prediction",
      ensureReady: async () => true,
      ensureOptionalReady: async () => true,
      scripts: predictionScripts.slice(),
      optionalScripts: []
    }),
    __documentListeners: documentListeners,
    __windowListeners: windowListeners,
    __elements: elements,
    __scripts: scripts,
    __preloads: preloads,
    __replaced: replaced
  };

  if (raceReady) {
    root.ChappyRaceControls = {
      initialize() {
        return true;
      }
    };
    root.ChappyRaceSelection = {
      select: async () => true
    };
  }

  if (predictionReady) {
    root.ChappyAICore = {};
    root.createPrediction = () => ({});
    root.renderAll = () => true;
  }

  return root;
}

(async () => {
  const missingRace = createRoot();
  const installedMissing = terminal.install(missingRace);
  assert.equal(installedMissing.installed, true);
  assert.equal(installedMissing.appRuntimeWrapped, true);
  assert.equal(installedMissing.predictionRuntimeWrapped, true);
  await assert.rejects(
    missingRace.ChappyAppRuntime.ensure("race"),
    /RACE_CONTROLS_MISSING/,
    "race runtime欠損を無言returnにしない"
  );
  assert.equal(
    missingRace.__elements.resultArea.dataset.raceLoading,
    "error",
    "race runtime欠損時にloadingを解除する"
  );
  assert.match(
    missingRace.__elements.errorArea.textContent,
    /RACE_CONTROLS_MISSING/
  );

  const missingPrediction = createRoot({ raceReady: true });
  terminal.install(missingPrediction);
  await assert.rejects(
    missingPrediction.ChappyPredictionRuntime.ensureReady(),
    /PREDICTION_RUNTIME_INCOMPLETE/,
    "必須予想関数が無い状態を成功扱いしない"
  );
  assert.equal(
    missingPrediction.__elements.resultArea.dataset.raceLoading,
    "error"
  );

  const ready = createRoot({
    raceReady: true,
    predictionReady: true
  });
  const installedReady = terminal.install(ready);
  assert.equal(await ready.ChappyAppRuntime.ensure("race"), true);
  assert.equal(await ready.ChappyPredictionRuntime.ensureReady(), true);
  assert.equal(ready.ChappyAppRuntime.version, BUILD);
  assert.equal(ready.ChappyPredictionRuntime.version, BUILD);
  assert.equal(ready.document.documentElement.dataset.chappyBuild, BUILD);

  const built = createRoot({
    raceReady: true,
    predictionReady: true,
    predictionScripts: ["js/ai-core.js"]
  });
  terminal.install(built);
  assert.equal(await built.ChappyPredictionRuntime.ensureReady(), true);
  assert.equal(built.__scripts.length, 1);
  assert.equal(built.__preloads.length, 1);
  assert.equal(built.__preloads[0].href, `js/ai-core.js?v=${BUILD}`);
  terminal.preloadScriptsWithBuild(built, ["js/ai-core.js"], 0);
  assert.equal(built.__preloads.length, 1, "同じ先読みを重複追加しない");
  assert.equal(built.__scripts[0].src, `js/ai-core.js?v=${BUILD}`);
  assert.equal(built.__scripts[0].dataset.chappyMobileBuild, BUILD);

  const click = ready.__documentListeners.get("click:true");
  assert.equal(typeof click, "function");
  const refreshTarget = {
    closest(selector) {
      return selector === "#homeRefreshBtn" ? this : null;
    }
  };
  let prevented = false;
  let stopped = false;
  click({
    target: refreshTarget,
    preventDefault() {
      prevented = true;
    },
    stopImmediatePropagation() {
      stopped = true;
    }
  });

  assert.equal(prevented, true);
  assert.equal(stopped, true);
  assert.equal(ready.sessionStorage.has(terminal.cacheKey), false);
  assert.equal(ready.localStorage.has(terminal.cacheKey), false);
  assert.equal(ready.__replaced.length, 1);
  assert.match(ready.__replaced[0], new RegExp(`appBuild=${BUILD}`));
  assert.match(ready.__replaced[0], /reload=\d+/);

  const apiWindow = {
    setTimeout(callback) {
      callback();
      return 1;
    },
    clearTimeout() {}
  };
  class TestAbortController {
    constructor() {
      this.signal = {};
    }
    abort() {}
  }
  vm.runInNewContext(apiSource, {
    window: apiWindow,
    fetch: () => new Promise(() => {}),
    AbortController: TestAbortController,
    Promise,
    Map,
    Error
  });
  await assert.rejects(
    apiWindow.ChappyAPI.fetchRace({
      date: "20260824",
      jcd: "07",
      rno: 12
    }),
    error => error?.code === "RACE_DATA_TIMEOUT",
    "WebKitでAbortが完了しなくてもレース取得を必ず終端する"
  );

  console.log("mobile prediction startup terminal: passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
