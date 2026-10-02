"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const guard = require(path.join(
  __dirname,
  "..",
  "js",
  "live-race-selection-terminal-guard.js"
));

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    has(key) {
      return values.has(key);
    }
  };
}

function createDateInput() {
  const prototype = {};
  Object.defineProperty(prototype, "value", {
    configurable: true,
    enumerable: true,
    get() {
      return this.__value || "";
    },
    set(value) {
      this.__value = String(value ?? "");
    }
  });
  const input = Object.create(prototype);
  input.__value = "";
  input.max = "";
  return input;
}

function createRoot() {
  const listeners = new Map();
  const windowListeners = new Map();
  const elements = {
    raceModeSelect: {
      value: "live"
    },
    dateInput: createDateInput(),
    resultArea: {
      dataset: {},
      innerHTML: "",
      textContent: ""
    },
    predictionOddsStatus: {
      dataset: {},
      textContent: ""
    },
    statusArea: {
      textContent: ""
    }
  };

  const root = {
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      addEventListener(name, listener, capture) {
        listeners.set(`${name}:${capture === true}`, listener);
      }
    },
    sessionStorage: memoryStorage({
      "chappy-home-v2-cache": JSON.stringify({
        scheduleDate: "20260824",
        schedule: [{ place: "蒲郡" }],
        savedAt: Date.now()
      })
    }),
    localStorage: memoryStorage({
      "chappy-home-v2-cache": JSON.stringify({
        scheduleDate: "20260824",
        schedule: [{ place: "蒲郡" }],
        savedAt: Date.now()
      })
    }),
    setTimeout,
    clearTimeout,
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) {
        this.type = type;
        this.detail = options.detail;
      }
    },
    MutationObserver: class MutationObserver {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {}
    },
    addEventListener(name, listener) {
      windowListeners.set(name, listener);
    },
    dispatchEvent(event) {
      windowListeners.get(event.type)?.(event);
    },
    ChappyHomeDashboardV2: {
      getDate() {
        return "20260825";
      },
      showPredictionError(message) {
        elements.resultArea.dataset.raceLoading = "error";
        elements.resultArea.textContent = message;
        elements.predictionOddsStatus.textContent = "取得失敗";
        elements.predictionOddsStatus.dataset.state = "error";
      }
    },
    __listeners: listeners,
    __windowListeners: windowListeners,
    __elements: elements
  };

  return root;
}

async function main() {
  assert.equal(
    guard.version,
    "20260825-live-selection-terminal2"
  );
  assert.equal(
    guard.jstDate(new Date("2026-08-24T17:30:00.000Z")),
    "20260825",
    "UTCでは前日でもJST当日を返す"
  );
  assert.equal(
    guard.inputDate("2026/08/25"),
    "2026-08-25",
    "スラッシュ日付もinput形式へ正規化する"
  );

  const root = createRoot();
  const installed = guard.install(root, {
    watchdogMs: 25,
    nowProvider: () => new Date("2026-08-24T17:30:00.000Z")
  });

  assert.equal(installed.installed, true);
  assert.equal(installed.dateInputProtected, true);
  assert.equal(installed.staleCacheRemoved, 2);
  assert.equal(
    root.sessionStorage.has("chappy-home-v2-cache"),
    false,
    "前日のsessionキャッシュを削除する"
  );
  assert.equal(
    root.localStorage.has("chappy-home-v2-cache"),
    false,
    "前日のlocalキャッシュを削除する"
  );
  assert.equal(
    root.__elements.dateInput.value,
    "2026-08-25",
    "script.js読込前にJST当日を固定する"
  );
  assert.equal(root.__elements.dateInput.max, "2026-08-25");

  // lazy runtimeのsetDefaultDate(true)がUTC前日を書いても、その場でJST当日へ戻す。
  root.__elements.dateInput.value = "2026-08-24";
  assert.equal(
    root.__elements.dateInput.value,
    "2026-08-25",
    "liveモードでは端末ローカル前日を保持しない"
  );

  const click = root.__listeners.get("click:true");
  assert.equal(typeof click, "function", "capture click guardを登録する");

  const flowButton = {
    disabled: false,
    dataset: {
      flowPlace: "桐生",
      flowRace: "1",
      flowJcd: "01"
    },
    closest(selector) {
      return selector.includes("data-flow-place") ? this : null;
    }
  };

  root.__elements.resultArea.dataset.raceLoading = "true";
  click({ target: flowButton });

  assert.equal(root.__elements.dateInput.value, "2026-08-25");
  assert.deepEqual(
    {
      place: root.__CHAPPY_LIVE_RACE_SELECTION_INTENT__.place,
      raceNo: root.__CHAPPY_LIVE_RACE_SELECTION_INTENT__.raceNo,
      jcd: root.__CHAPPY_LIVE_RACE_SELECTION_INTENT__.jcd,
      date: root.__CHAPPY_LIVE_RACE_SELECTION_INTENT__.date
    },
    {
      place: "桐生",
      raceNo: 1,
      jcd: "01",
      date: "20260825"
    },
    "桐生1RへJST当日を引き渡す"
  );

  await new Promise(resolve => setTimeout(resolve, 60));

  assert.equal(
    root.__elements.resultArea.dataset.raceLoading,
    "error",
    "無限ローディングをエラー終端へ移す"
  );
  assert.match(
    root.__elements.resultArea.textContent,
    /読み込みが0秒を超えました/,
    "短縮したテストwatchdogの理由を表示する"
  );
  assert.equal(
    root.__elements.predictionOddsStatus.textContent,
    "取得失敗"
  );
  assert.match(
    root.__elements.statusArea.textContent,
    /読み込みを終了しました/
  );

  const reviewRoot = createRoot();
  reviewRoot.__elements.raceModeSelect.value = "review";
  reviewRoot.__elements.dateInput.value = "2026-08-20";
  const reviewInstalled = guard.install(reviewRoot, {
    nowProvider: () => new Date("2026-08-24T17:30:00.000Z")
  });
  assert.equal(reviewInstalled.dateInputProtected, true);
  assert.equal(
    reviewRoot.__elements.dateInput.value,
    "2026-08-20",
    "手動の振り返り日付は変更しない"
  );

  console.log("live race selection terminal guard contract passed");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
