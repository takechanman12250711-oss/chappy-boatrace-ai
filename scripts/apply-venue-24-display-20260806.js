"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const statsPath = path.join(root, "js", "stats.js");
const appRuntimePath = path.join(root, "js", "app-runtime-loader.js");
const statsRuntimePath = path.join(root, "js", "stats-runtime-loader.js");
const indexPath = path.join(root, "index.html");
const testPath = path.join(root, "scripts", "test-load-performance.js");

let stats = fs.readFileSync(statsPath, "utf8");
let appRuntime = fs.readFileSync(appRuntimePath, "utf8");
let statsRuntime = fs.readFileSync(statsRuntimePath, "utf8");
let index = fs.readFileSync(indexPath, "utf8");
let test = fs.readFileSync(testPath, "utf8");

const marker = "venue-24-display-20260806";
if (!stats.includes(marker)) {
  const oldBlock = `  const venueGroups =\n    buildGroups(\n      settledRows,\n      item =>\n        item.place ||\n        \`場コード\${item.jcd}\`\n    );`;
  const newBlock = `  const VENUE_NAMES = [\n    "桐生", "戸田", "江戸川", "平和島", "多摩川", "浜名湖",\n    "蒲郡", "常滑", "津", "三国", "びわこ", "住之江",\n    "尼崎", "鳴門", "丸亀", "児島", "宮島", "徳山",\n    "下関", "若松", "芦屋", "福岡", "唐津", "大村"\n  ];\n  const venueGroupMap = new Map(\n    buildGroups(\n      settledRows,\n      item =>\n        item.place ||\n        \`場コード\${item.jcd}\`\n    ).map(row => [row.label, row])\n  );\n  const venueGroups = VENUE_NAMES.map(label =>\n    venueGroupMap.get(label) || {\n      label,\n      count: 0,\n      honmeiHits: 0,\n      practicalCount: 0,\n      practicalHits: 0,\n      scenarioComparable: 0,\n      scenarioHits: 0\n    }\n  );\n  const RESULTS_VENUE_VERSION = "${marker}";`;
  if (!stats.includes(oldBlock)) throw new Error("venueGroups block not found");
  stats = stats.replace(oldBlock, newBlock);

  const oldMeta = `                \${row.count}R・厳選\${rate(row.practicalHits, row.practicalCount)}%`;
  const newMeta = `                \${row.count > 0\n                  ? \`\${row.count}R・厳選\${rate(row.practicalHits, row.practicalCount)}%\`\n                  : "0R・データなし"}`;
  if (!stats.includes(oldMeta)) throw new Error("venue meta block not found");
  stats = stats.replace(oldMeta, newMeta);
}

appRuntime = appRuntime.replace(
  /const VERSION = "[^"]+";/,
  'const VERSION = "20260806-venue24-1";'
);
statsRuntime = statsRuntime.replace(
  /const VERSION = "[^"]+";/,
  'const VERSION = "20260806-venue24-1";'
);
index = index
  .replace(/style\.css\?v=[^"]+/, "style.css?v=20260806-venue24-1")
  .replace(/js\/app-runtime-loader\.js\?v=[^"]+/, "js/app-runtime-loader.js?v=20260806-venue24-1");

test = test
  .replace('"style.css?v=20260803-flow-missing30"', '"style.css?v=20260806-venue24-1"')
  .replace('"js/app-runtime-loader.js?v=20260803-flow-missing30"', '"js/app-runtime-loader.js?v=20260806-venue24-1"')
  .replace(
    /appRuntime\.includes\(\n\s*'const VERSION = "[^"]+"'\n\s*\)/,
    `appRuntime.includes(\n    'const VERSION = "20260806-venue24-1"'\n  )`
  )
  .replace(
    /statsRuntime\.includes\(\n\s*'"[^"]+"'\n\s*\)/,
    `statsRuntime.includes(\n    '"20260806-venue24-1"'\n  )`
  );

if (!stats.includes(marker)) throw new Error("venue24 marker missing");
if (!stats.includes('"蒲郡"')) throw new Error("蒲郡 missing");
if (!stats.includes('"0R・データなし"')) throw new Error("zero state missing");
if (!appRuntime.includes('"20260806-venue24-1"')) throw new Error("app runtime version missing");
if (!statsRuntime.includes('"20260806-venue24-1"')) throw new Error("stats runtime version missing");
if (!test.includes('"style.css?v=20260806-venue24-1"')) throw new Error("style test version missing");
if (!test.includes('"js/app-runtime-loader.js?v=20260806-venue24-1"')) throw new Error("app asset test version missing");

fs.writeFileSync(statsPath, stats);
fs.writeFileSync(appRuntimePath, appRuntime);
fs.writeFileSync(statsRuntimePath, statsRuntime);
fs.writeFileSync(indexPath, index);
fs.writeFileSync(testPath, test);
console.log("24 venue display applied");
