"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");

function source(relativePath) {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8"
  );
}

function createContext() {
  const context = {
    console: {
      log() {},
      warn() {},
      error() {}
    },
    setTimeout,
    clearTimeout
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function run(context, relativePath) {
  vm.runInContext(
    source(relativePath),
    context,
    { filename: relativePath }
  );
}

function installCore(context) {
  run(context, "js/history-insights-base.js");
  run(context, "js/motor-maintenance-insights.js");

  context.__testCore = {
    buildPredictionData(data) {
      return {
        data,
        analyses: [],
        formations: {
          main: ["1-2-3", "1-3-2", "1-2-4"],
          safety: ["1-4-2", "1-2-5"]
        }
      };
    },
    buildBoatAnalyses() {
      return [];
    }
  };

  vm.runInContext(
    "ChappyAICore = __testCore;",
    context
  );

  assert.equal(
    context.ChappyAICore
      .__localWaterTheoryV2Installed,
    true,
    "当地・水面V2をAIコアへ接続する"
  );
  assert.equal(
    context.ChappyAICore
      .__motorMaintenanceTheoryV2Installed,
    true,
    "モーター・整備V2をAIコアへ接続する"
  );
}

const broken = createContext();
installCore(broken);
run(broken, "js/local-water-v2-tiebreak.js");
assert.throws(
  () => run(
    broken,
    "js/third-six-rescue-fixed5.js"
  ),
  /read only|readonly|Cannot assign/i,
  "旧接続方式ではfreeze済みAIコアの再代入を再現する"
);

const fixed = createContext();
installCore(fixed);
run(fixed, "js/ai-core-assignment-compat.js");

const descriptor = Object.getOwnPropertyDescriptor(
  fixed,
  "ChappyAICore"
);
assert.equal(
  fixed.ChappyAICoreAssignmentCompat.installed,
  true,
  "互換層をAIコア生成直後に有効化する"
);
assert.equal(
  descriptor.writable,
  true,
  "AIコア公開プロパティを安全な書換可能データプロパティへ切り替える"
);

assert.doesNotThrow(
  () => run(
    fixed,
    "js/local-water-v2-tiebreak.js"
  ),
  "当地・水面tie-breakの再接続で停止しない"
);
assert.doesNotThrow(
  () => run(
    fixed,
    "js/third-six-rescue-fixed5.js"
  ),
  "freeze済み固定5点ラッパーの公開で停止しない"
);
assert.equal(
  Object.isFrozen(fixed.ChappyAICore),
  true,
  "固定5点ラッパーのfreeze契約は維持する"
);

const runtime = source(
  "js/prediction-runtime-loader.js"
);
assert.equal(
  runtime.indexOf('"js/ai-core.js"') <
    runtime.indexOf(
      '"js/ai-core-assignment-compat.js"'
    ) &&
    runtime.indexOf(
      '"js/ai-core-assignment-compat.js"'
    ) <
    runtime.indexOf(
      '"js/local-water-v2-tiebreak.js"'
    ),
  true,
  "AIコア生成後・固定ラッパー適用前に互換層を読み込む"
);

console.log(
  "readonly AI core Safari stall regression: passed"
);
