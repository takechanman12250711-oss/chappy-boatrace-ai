"use strict";

const assert =
  require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "js",
    "prediction-runtime-loader.js"
  ),
  "utf8"
);

function createRuntime({
  failCalibration = false,
  failFirstCore = false
} = {}) {
  const dispatched = [];
  const appended = [];
  let coreFailuresRemaining = failFirstCore ? 1 : 0;
  const document = {
    scripts: [],
    createElement() {
      const listeners =
        new Map();

      const script = {
        dataset: {},
        src: "",
        async: true,
        addEventListener(
          name,
          listener
        ) {
          listeners.set(
            name,
            listener
          );
        },
        dispatch(name) {
          listeners
            .get(name)?.();
        },
        remove() {
          const index = document.scripts.indexOf(script);
          if (index >= 0) document.scripts.splice(index, 1);
        }
      };
      return script;
    },
    head: {
      appendChild(script) {
        document
          .scripts
          .push(script);
        appended.push(
          script.src
        );

        setImmediate(() => {
          if (
            coreFailuresRemaining > 0 &&
            script.src.includes("boat-identity.js")
          ) {
            coreFailuresRemaining -= 1;
            script.dispatch("error");
            return;
          }
          if (
            failCalibration &&
            script.src.includes(
              "prediction-calibration.js"
            )
          ) {
            script.dispatch(
              "error"
            );
            return;
          }
          script.dispatch("load");
        });
      }
    }
  };
  const window = {
    setTimeout,
    clearTimeout,
    dispatchEvent(event) {
      dispatched.push(
        event.type
      );
      return true;
    }
  };
  const context = {
    window,
    document,
    CustomEvent: class {
      constructor(type, options) {
        this.type = type;
        this.detail =
          options?.detail;
      }
    },
    Error,
    Object,
    Promise,
    String,
    setTimeout,
    clearTimeout,
    setImmediate
  };

  vm.runInNewContext(
    source,
    context,
    {
      filename:
        "prediction-runtime-loader.js"
    }
  );

  return {
    runtime:
      window
        .ChappyPredictionRuntime,
    dispatched,
    appended
  };
}

(async () => {
  const failedOptional =
    createRuntime({
      failCalibration: true
    });
  assert.ok(
    failedOptional.runtime.scripts
      .indexOf("js/boat-identity.js") <
      failedOptional.runtime.scripts
        .indexOf("js/theory-input.js"),
    "艇番整合性を共通入力より先に読み込む"
  );
  assert.ok(
    failedOptional.runtime.scripts
      .indexOf("js/boat-identity.js") <
      failedOptional.runtime.scripts
        .indexOf("js/prediction.js"),
    "艇番整合性を予想本体より先に読み込む"
  );
  assert.ok(
    failedOptional.runtime.scripts
      .indexOf("js/render.js") <
      failedOptional.runtime.scripts
        .indexOf("js/main-cover-display-boundary.js"),
    "描画本体を公開してから通常最大7点の表示境界を外側へ接続する"
  );
  const ready =
    await failedOptional
      .runtime
      .ensureReady();

  assert.equal(
    ready,
    true,
    "校正JSが失敗しても必須予想ランタイムは起動する"
  );
  assert.ok(
    failedOptional
      .dispatched
      .includes(
        "chappy:prediction-runtime-ready"
      )
  );
  assert.equal(
    await failedOptional
      .runtime
      .ensureOptionalReady(),
    false,
    "任意校正モジュールの失敗を予想起動とは分離する"
  );
  assert.ok(
    failedOptional
      .dispatched
      .includes(
        "chappy:prediction-runtime-optional-unavailable"
      )
  );
  assert.ok(
    failedOptional
      .appended
      .some(src =>
        src.includes(
          "js/render.js"
        )
      ),
    "校正より先に必須描画まで読み込む"
  );
  assert.ok(
    failedOptional.appended.includes(
      "js/ai-core.js?v=20260903-light-manshu-board1"
    ),
    "別枠舟券更新済みai-coreを専用キャッシュ世代で読み込む"
  );
  assert.ok(
    failedOptional.appended.includes(
      "js/render.js?v=20260903-light-manshu-board1"
    ),
    "別枠舟券更新済みrenderを専用キャッシュ世代で読み込む"
  );
  assert.ok(
    failedOptional.appended.includes(
      "js/boat-identity.js?v=20260828-ui-audit-display1"
    ),
    "未変更モジュールの既存キャッシュ世代を維持する"
  );

  const availableOptional =
    createRuntime();

  assert.equal(
    await availableOptional
      .runtime
      .ensureReady(),
    true
  );
  assert.equal(
    await availableOptional
      .runtime
      .ensureOptionalReady(),
    true,
    "校正JSONの後続取得成否を待たず任意JSだけを読み込める"
  );
  assert.ok(
    availableOptional
      .dispatched
      .includes(
        "chappy:prediction-runtime-optional-ready"
      )
  );

  const retryableCore = createRuntime({
    failFirstCore: true
  });
  await assert.rejects(
    retryableCore.runtime.ensureReady(),
    /予想モジュールを読み込めません/,
    "一時的な必須モジュール失敗を呼び出し元へ返す"
  );
  assert.equal(
    await retryableCore.runtime.ensureReady(),
    true,
    "失敗したscriptを除去し、次の操作で予想モジュールを再読込する"
  );
  assert.equal(
    retryableCore.appended.filter(src =>
      src.includes("boat-identity.js")
    ).length,
    2,
    "失敗した先頭モジュールを実際に再要求する"
  );

  console.log(
    "予想ランタイム任意校正テスト: 合格"
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
