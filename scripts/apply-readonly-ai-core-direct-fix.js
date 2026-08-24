"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OLD_VERSION = "20260824-readonly-core-fix1";
const NEW_VERSION = "20260824-readonly-core-fix2";

function absolute(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.mkdirSync(path.dirname(absolute(relativePath)), {
    recursive: true
  });
  fs.writeFileSync(absolute(relativePath), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(
      `${label}: expected one target, found ${count}`
    );
  }
  return source.replace(before, after);
}

function replaceInstallBlock(
  source,
  marker,
  apiMarker,
  replacement,
  label
) {
  if (source.includes(replacement)) return source;

  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`${label}: marker not found`);
  }

  const start = source.lastIndexOf(
    "  function install(core) {",
    markerIndex
  );
  const end = source.indexOf(apiMarker, markerIndex);

  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`${label}: install block not found`);
  }

  return (
    source.slice(0, start) +
    replacement +
    source.slice(end)
  );
}

const cloneHelpers = `  function cloneCoreForInstall(core) {
    const prototype =
      Object.getPrototypeOf(core) ||
      Object.prototype;
    const clone = Object.create(prototype);
    const descriptors =
      Object.getOwnPropertyDescriptors(core);

    Object.entries(descriptors)
      .forEach(([key, descriptor]) => {
        const nextDescriptor = {
          ...descriptor,
          configurable: true
        };

        if (
          Object.prototype.hasOwnProperty.call(
            nextDescriptor,
            "value"
          )
        ) {
          nextDescriptor.writable = true;
        }

        Object.defineProperty(
          clone,
          key,
          nextDescriptor
        );
      });

    return clone;
  }

  function preserveCoreObjectState(source, target) {
    if (Object.isFrozen(source)) {
      return Object.freeze(target);
    }
    if (Object.isSealed(source)) {
      return Object.seal(target);
    }
    if (!Object.isExtensible(source)) {
      return Object.preventExtensions(target);
    }
    return target;
  }

`;

const localInstall = cloneHelpers + `  function install(core) {
    if (
      !core ||
      typeof core !== "object" ||
      core.__localWaterTheoryV2Installed
    ) {
      return core;
    }

    const originalBuild =
      typeof core.buildPredictionData === "function"
        ? core.buildPredictionData.bind(core)
        : null;
    const originalBoatAnalyses =
      typeof core.buildBoatAnalyses === "function"
        ? core.buildBoatAnalyses.bind(core)
        : null;
    const target = cloneCoreForInstall(core);

    if (originalBuild) {
      target.buildPredictionData = function (data) {
        const enhanced = enhanceData(data, target);
        const result = originalBuild(enhanced.data);

        if (result && typeof result === "object") {
          result.localWaterTheoryV2 = enhanced.theory;
        }
        return result;
      };
      target.analyze = target.buildPredictionData;
    }

    if (originalBoatAnalyses) {
      target.buildBoatAnalyses = function (data) {
        const enhanced = enhanceData(data, target);
        const result = originalBoatAnalyses(enhanced.data);

        if (Array.isArray(result)) {
          Object.defineProperty(
            result,
            "localWaterTheoryV2",
            {
              value: enhanced.theory,
              enumerable: false,
              configurable: true
            }
          );
        }
        return result;
      };
    }

    Object.defineProperty(
      target,
      "__localWaterTheoryV2Installed",
      {
        value: true,
        enumerable: false,
        configurable: false
      }
    );

    return preserveCoreObjectState(core, target);
  }

`;

let history = read("js/history-insights-base.js");
history = replaceInstallBlock(
  history,
  "__localWaterTheoryV2Installed",
  "  const api = Object.freeze({",
  localInstall,
  "local water installer"
);
write("js/history-insights-base.js", history);

const motorInstall = cloneHelpers + `  function install(core) {
    if (
      !core ||
      typeof core !== "object" ||
      core.__motorMaintenanceTheoryV2Installed
    ) {
      return core;
    }

    const originalBuild =
      typeof core.buildPredictionData === "function"
        ? core.buildPredictionData.bind(core)
        : null;
    const originalBoatAnalyses =
      typeof core.buildBoatAnalyses === "function"
        ? core.buildBoatAnalyses.bind(core)
        : null;
    const target = cloneCoreForInstall(core);

    if (originalBuild) {
      target.buildPredictionData = function (data) {
        const enhanced = enhanceData(data, target);
        const result = originalBuild(enhanced.data);

        if (result && typeof result === "object") {
          result.motorMaintenanceTheoryV2 =
            enhanced.theory;
        }
        return result;
      };
      target.analyze = target.buildPredictionData;
    }

    if (originalBoatAnalyses) {
      target.buildBoatAnalyses = function (data) {
        const enhanced = enhanceData(data, target);
        const result = originalBoatAnalyses(
          enhanced.data
        );

        if (Array.isArray(result)) {
          Object.defineProperty(
            result,
            "motorMaintenanceTheoryV2",
            {
              value: enhanced.theory,
              enumerable: false,
              configurable: true
            }
          );
        }
        return result;
      };
    }

    Object.defineProperty(
      target,
      "__motorMaintenanceTheoryV2Installed",
      {
        value: true,
        enumerable: false,
        configurable: false
      }
    );

    return preserveCoreObjectState(core, target);
  }

`;

let motor = read("js/motor-maintenance-insights.js");
motor = replaceInstallBlock(
  motor,
  "__motorMaintenanceTheoryV2Installed",
  "    const api = Object.freeze({ version: VERSION, enhanceData, install });",
  motorInstall,
  "motor maintenance installer"
);
motor = replaceOnce(
  motor,
  `        get() {
          const current = previousGet ? previousGet() : storedCore;
          return current ? install(current) : current;
        },`,
  `        get() {
          return storedCore;
        },`,
  "stable motor core getter"
);
write("js/motor-maintenance-insights.js", motor);

const simpleVersionFiles = [
  "index.html",
  "js/prediction-runtime-loader.js",
  "js/ai-core-assignment-compat.js",
  "scripts/test-startup-critical-path.js",
  "scripts/test-prediction-loading-watchdog.js",
  "scripts/test-odds-lightweight-path.js",
  "scripts/test-ticket-accordion-render-path.js",
  "scripts/test-phase6-integration.js",
  "scripts/test-load-performance.js",
  "scripts/test-current-cache-test-alignment.js",
  "scripts/test-readonly-ai-core-assignment.js"
];

simpleVersionFiles.forEach(relativePath => {
  const source = read(relativePath);
  if (source.includes(NEW_VERSION)) return;
  if (!source.includes(OLD_VERSION)) {
    throw new Error(
      `${relativePath}: ${OLD_VERSION} not found`
    );
  }
  write(
    relativePath,
    source.split(OLD_VERSION).join(NEW_VERSION)
  );
});

let alignment = read(
  "scripts/apply-current-cache-test-alignment.js"
);
alignment = replaceOnce(
  alignment,
  `  const desiredGeneration = generationBlock(
    "${OLD_VERSION}"
  );`,
  `  const desiredGeneration = generationBlock(
    "${NEW_VERSION}"
  );`,
  "cache desired generation"
);
alignment = replaceOnce(
  alignment,
  `    generationBlock(
      "20260823-local-water-v2-gap3-v1"
    ),`,
  `    generationBlock(
      "20260823-local-water-v2-gap3-v1"
    ),
    generationBlock(
      "${OLD_VERSION}"
    ),`,
  "cache supported generation"
);
alignment = replaceOnce(
  alignment,
  `      '\\'const VERSION = "20260823-local-water-v2-gap3-v1"\\''
    ],`,
  `      '\\'const VERSION = "20260823-local-water-v2-gap3-v1"\\'',
      '\\'const VERSION = "${OLD_VERSION}"\\''
    ],`,
  "cache supported runtime"
);
alignment = replaceOnce(
  alignment,
  `    '\\'const VERSION = "${OLD_VERSION}"\\'',
    "prediction runtime version"`,
  `    '\\'const VERSION = "${NEW_VERSION}"\\'',
    "prediction runtime version"`,
  "cache output runtime"
);
write(
  "scripts/apply-current-cache-test-alignment.js",
  alignment
);

const directTest = `"use strict";

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

const context = createContext();
run(context, "js/history-insights-base.js");
run(context, "js/motor-maintenance-insights.js");

context.__baseCore = {
  getVenueFeature() {
    return {
      inPower: 70,
      sashi: 63,
      makuri: 68,
      makuriSashi: 66,
      kado: 70,
      outside: 55,
      roughWater: 65
    };
  },
  isNewEngineMode() {
    return false;
  },
  buildPredictionData(data) {
    return {
      receivedData: data,
      analyses: [],
      formations: {
        main: [
          "1-2-3",
          "1-3-2",
          "1-2-4"
        ],
        safety: [
          "1-4-2",
          "1-2-5"
        ]
      }
    };
  },
  buildBoatAnalyses() {
    return [];
  },
  buildFormations() {
    return {
      main: [
        "1-2-3",
        "1-3-2",
        "1-2-4"
      ],
      safety: [
        "1-4-2",
        "1-2-5"
      ]
    };
  }
};

assert.doesNotThrow(
  () => vm.runInContext(
    "ChappyAICore = __baseCore;",
    context
  ),
  "AIコア初回接続で停止しない"
);
assert.equal(
  context.ChappyAICore
    .__localWaterTheoryV2Installed,
  true,
  "当地・水面V2を接続する"
);
assert.equal(
  context.ChappyAICore
    .__motorMaintenanceTheoryV2Installed,
  true,
  "モーターV2を接続する"
);

assert.doesNotThrow(
  () => run(
    context,
    "js/local-water-v2-tiebreak.js"
  ),
  "Local/Water tie-break再公開で停止しない"
);
assert.doesNotThrow(
  () => run(
    context,
    "js/third-six-rescue-fixed5.js"
  ),
  "freeze済み固定5点AIコア再公開で停止しない"
);
assert.equal(
  Object.isFrozen(context.ChappyAICore),
  true,
  "固定5点ラッパーのfreeze契約を維持する"
);
assert.equal(
  context.ChappyAICore
    .__localWaterTheoryV2Installed,
  true,
  "freeze後も当地・水面V2接続を保持する"
);
assert.equal(
  context.ChappyAICore
    .__motorMaintenanceTheoryV2Installed,
  true,
  "freeze後もモーターV2接続を保持する"
);

const entries = Array.from(
  { length: 6 },
  (_, index) => ({
    boatNo: index + 1,
    course: index + 1,
    localWinRate: 5.5,
    local2Rate: 35,
    local3Rate: 55,
    localStarts: 30,
    motorRate: 35,
    motor3Rate: 50,
    boatRate: 35
  })
);

assert.doesNotThrow(
  () => context.ChappyAICore
    .buildPredictionData({
      stadiumCode: "07",
      stadiumName: "蒲郡",
      waterType: "海水",
      entries,
      boats: entries,
      weather: {
        windSpeed: 1,
        windDirection: "弱風",
        waveHeight: 1,
        tideLevel: 100,
        tideFlow: "上げ"
      }
    }),
  "振り返り予想の実行までreadonly例外を出さない"
);

const historySource = source(
  "js/history-insights-base.js"
);
const motorSource = source(
  "js/motor-maintenance-insights.js"
);
assert.equal(
  historySource.includes(
    "cloneCoreForInstall"
  ) &&
    historySource.includes(
      "preserveCoreObjectState"
    ) &&
    motorSource.includes(
      "cloneCoreForInstall"
    ) &&
    motorSource.includes(
      "return storedCore;"
    ),
  true,
  "本番の両installerをreadonly安全方式へ固定する"
);

console.log(
  "direct readonly AI core installer regression: passed"
);
`;
write(
  "scripts/test-readonly-ai-core-direct.js",
  directTest
);

let checkWorkflow = read(
  ".github/workflows/check-readonly-ai-core-assignment.yml"
);
checkWorkflow = replaceOnce(
  checkWorkflow,
  `      - "scripts/test-readonly-ai-core-assignment.js"
`,
  `      - "scripts/test-readonly-ai-core-assignment.js"
      - "scripts/test-readonly-ai-core-direct.js"
`,
  "readonly workflow path"
);
checkWorkflow = replaceOnce(
  checkWorkflow,
  `          node --check scripts/test-readonly-ai-core-assignment.js
          node scripts/test-readonly-ai-core-assignment.js
`,
  `          node --check scripts/test-readonly-ai-core-assignment.js
          node --check scripts/test-readonly-ai-core-direct.js
          node scripts/test-readonly-ai-core-assignment.js
          node scripts/test-readonly-ai-core-direct.js
`,
  "readonly workflow direct test"
);
write(
  ".github/workflows/check-readonly-ai-core-assignment.yml",
  checkWorkflow
);

[
  "scripts/apply-readonly-ai-core-direct-fix.js",
  ".github/workflows/apply-readonly-ai-core-direct-fix.yml"
].forEach(relativePath => {
  fs.rmSync(absolute(relativePath), {
    force: true
  });
});

console.log(
  "direct readonly AI core production fix applied"
);
