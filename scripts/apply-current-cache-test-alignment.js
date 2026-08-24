"use strict";

const fs = require("node:fs");

function replaceOne(
  text,
  before,
  after,
  label
) {
  const count = text.split(before).length - 1;

  if (count === 1) {
    return text.replace(before, after);
  }
  if (count === 0 && text.includes(after)) {
    return text;
  }

  throw new Error(
    `${label}: expected old marker once or already-patched marker, got old=${count}`
  );
}

function replaceOneOf(
  text,
  befores,
  after,
  label
) {
  const matches = befores.filter(before =>
    text.includes(before)
  );

  if (matches.length === 1) {
    return text.replace(matches[0], after);
  }
  if (
    matches.length === 0 &&
    text.includes(after)
  ) {
    return text;
  }

  throw new Error(
    `${label}: expected exactly one supported old marker or current marker, got matches=${matches.length}`
  );
}

function generationBlock(version) {
  return `assert.equal(
  html.includes(
    "js/app-runtime-loader.js?v=20260816-static-race1"
  ) &&
    html.includes(
      "js/prediction-runtime-loader.js?v=${version}"
    ) &&
    html.includes(
      "js/hiyori-runtime-loader.js?v=20260816-nonblocking-core2"
    ) &&
    appRuntime.includes(
      'const VERSION = "20260815-odds-immediate1"'
    ) &&
    predictionRuntime.includes(
      'const VERSION = "${version}"'
    ) &&
    hiyoriLoader.includes(
      'const VERSION="20260816-nonblocking-core2"'
    ),
  true,
  "現在の親ローダー・予想・日和補助のキャッシュ世代を配信する"
);`;
}

function patchLoad(text) {
  let out = String(text);

  out = replaceOne(
    out,
    '"js/app-runtime-loader.js?v=20260810-official-reference1"',
    '"js/app-runtime-loader.js?v=20260816-static-race1"',
    "app runtime asset"
  );
  out = replaceOne(
    out,
    '"js/home-dashboard-v2.js?v=20260803-ui-fix2"',
    '"js/home-dashboard-v2.js?v=20260816-static-race1"',
    "home asset"
  );
  out = replaceOne(
    out,
    '\'const VERSION = "20260810-official-reference1"\'',
    '\'const VERSION = "20260815-odds-immediate1"\'',
    "app runtime internal version"
  );

  const desiredGeneration = generationBlock(
    "20260823-local-water-v2-gap3-v1"
  );
  const supportedGenerations = [
    generationBlock(
      "20260816-runtime-deadline1"
    ),
    generationBlock(
      "20260820-third-six-fixed5"
    ),
    generationBlock(
      "20260823-three-course-134-v1"
    ),
    `assert.equal(
  html.includes(
    "js/app-runtime-loader.js?v=20260813-course-failclosed1"
  ) &&
    appRuntime.includes(
      'const VERSION = "20260813-course-failclosed1"'
    ) &&
    predictionRuntime.includes(
      'const VERSION = "20260813-course-failclosed1"'
    ) &&
    hiyoriLoader.includes(
      'const VERSION="20260813-course-failclosed1"'
    ),
  true,
  "実コース対応を親ローダーから予想・日和補助層まで同じキャッシュ世代で配信する"
);`
  ];

  out = replaceOneOf(
    out,
    supportedGenerations,
    desiredGeneration,
    "runtime generation block"
  );

  out = replaceOneOf(
    out,
    [
      '\'const VERSION = "20260809-grounded-flow2"\'',
      '\'const VERSION = "20260816-runtime-deadline1"\'',
      '\'const VERSION = "20260820-third-six-fixed5"\'',
      '\'const VERSION = "20260823-three-course-134-v1"\''
    ],
    '\'const VERSION = "20260823-local-water-v2-gap3-v1"\'',
    "prediction runtime version"
  );

  out = replaceOne(
    out,
    `  appRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000") &&
    predictionRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000") &&
    statsRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000") &&
    hiyoriLoader.includes("SCRIPT_LOAD_TIMEOUT_MS=15000"),`,
    `  appRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS=15000") &&
    predictionRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 12000") &&
    statsRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000") &&
    hiyoriLoader.includes("SCRIPT_LOAD_TIMEOUT_MS=12000"),`,
    "runtime timeout block"
  );

  out = replaceOne(
    out,
    `assert.equal(
  hiyoriLoader.includes("ensureReady:installCore"),
  true,
  "予想開始時は必須モジュールだけ待つ"
);`,
    `assert.equal(
  hiyoriLoader.includes("function ensureReady()") &&
    hiyoriLoader.includes("scheduleInstall();") &&
    hiyoriLoader.includes("return Promise.resolve(true)"),
  true,
  "日和補助は初回予想を待たせずアイドル準備へ回す"
);`,
    "hiyori nonblocking readiness"
  );

  return out;
}

function patchStats(text) {
  return replaceOne(
    String(text),
    "/style\\.css\\?v=20260803-flow-missing30/",
    "/style\\.css\\?v=20260806-results-ui-phase4-1/",
    "result css asset"
  );
}

function main() {
  const load =
    "scripts/test-load-performance.js";
  const stats =
    "scripts/test-auto-stats.js";

  fs.writeFileSync(
    load,
    patchLoad(
      fs.readFileSync(load, "utf8")
    ),
    "utf8"
  );
  fs.writeFileSync(
    stats,
    patchStats(
      fs.readFileSync(stats, "utf8")
    ),
    "utf8"
  );

  console.log(
    "current cache test expectations aligned"
  );
}

if (require.main === module) {
  main();
}

module.exports = {
  patchLoad,
  patchStats,
  generationBlock
};
