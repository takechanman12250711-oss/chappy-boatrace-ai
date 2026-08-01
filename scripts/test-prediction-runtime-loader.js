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
  failCalibration = false
} = {}) {
  const dispatched = [];
  const appended = [];
  const document = {
    scripts: [],
    createElement() {
      const listeners =
        new Map();

      return {
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
        }
      };
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

  console.log(
    "予想ランタイム任意校正テスト: 合格"
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
