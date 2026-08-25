"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BUILD = "20260825-progressive-screen1";

function full(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(full(relativePath), "utf8");
}

function write(relativePath, content) {
  fs.mkdirSync(path.dirname(full(relativePath)), { recursive: true });
  fs.writeFileSync(full(relativePath), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one target, found ${count}`);
  }
  return source.replace(before, after);
}

function replaceBetween(source, start, end, replacement, label) {
  if (source.includes(replacement)) return source;
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`${label}: start target not found`);
  const endIndex = source.indexOf(end, startIndex);
  if (endIndex < 0) throw new Error(`${label}: end target not found`);
  return source.slice(0, startIndex) + replacement + source.slice(endIndex + end.length);
}

function patchHomeDashboard() {
  const file = "js/home-dashboard-v2.js";
  let source = read(file);

  if (!source.includes("E-RACE-SELECTION-RUNTIME")) {
    const pattern = /      const fetchButton = document\.getElementById\("fetchRaceBtn"\);\n      if \(!fetchButton \|\| typeof root\.ChappyRaceSelection\?\.select !== "function"\) return;/;
    const replacement = `      const fetchButton = document.getElementById("fetchRaceBtn");
      if (!fetchButton) {
        const error = new Error(
          "E-PREDICTION-BUTTON: AI予想ボタンを準備できませんでした。アプリを再読み込みしてください。"
        );
        error.code = "E-PREDICTION-BUTTON";
        throw error;
      }
      if (typeof root.ChappyRaceSelection?.select !== "function") {
        const error = new Error(
          "E-RACE-SELECTION-RUNTIME: レース選択機能を準備できませんでした。アプリを再読み込みしてください。"
        );
        error.code = "E-RACE-SELECTION-RUNTIME";
        throw error;
      }`;
    const matches = source.match(pattern);
    if (!matches || matches.length !== 1) {
      throw new Error("home dashboard silent return target not found");
    }
    source = source.replace(pattern, replacement);
  }

  write(file, source);
}

function progressiveHelpers() {
  return `  function previewEscape(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[char]
    );
  }

  function previewValue(value, suffix = "") {
    if (value === null || value === undefined || value === "") {
      return "-";
    }
    return previewEscape(String(value)) + suffix;
  }

  function renderRaceDataPreview(raceData, params = {}) {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea) return false;

    const entries = Array.isArray(raceData?.entries)
      ? raceData.entries.slice(0, 6)
      : [];
    const rows = entries.map((entry, index) => {
      const boatNo = Number(
        entry?.boatNo ?? entry?.boat ?? entry?.waku ?? index + 1
      ) || index + 1;
      const racerName =
        entry?.racerName || entry?.name || entry?.playerName || "-";
      const className =
        entry?.className || entry?.class || entry?.grade || "-";
      const avgST =
        entry?.avgST ?? entry?.avgSt ?? entry?.averageST ?? entry?.st;
      const national =
        entry?.nationalWinRate ?? entry?.national?.winRate;
      const local =
        entry?.localWinRate ?? entry?.local?.winRate;
      const motor =
        entry?.motor2Rate ?? entry?.motor?.secondRate ?? entry?.motor?.quinellaRate;

      return \`<article class="dashboard-card prediction-entry-preview" data-boat="\${boatNo}">
        <h3>\${boatNo}号艇　\${previewEscape(racerName)}</h3>
        <p>\${previewEscape(className)} ／ 平均ST \${previewValue(avgST)}</p>
        <p>全国 \${previewValue(national)}　当地 \${previewValue(local)}　M \${previewValue(motor, "%")}</p>
      </article>\`;
    }).join("");

    resultArea.dataset.raceLoading = "ai";
    resultArea.dataset.progressivePreview = "true";
    resultArea.innerHTML = \`
      <section class="prediction-progressive-preview" aria-live="polite">
        <div class="dashboard-section-head">
          <div>
            <p class="section-eyebrow">RACE ENTRY</p>
            <h2>🚤 \${previewEscape(params.place || "")} \${previewEscape(params.rno || params.raceNo || "")}R</h2>
          </div>
          <span class="section-status-badge" data-state="loading">AI解析中</span>
        </div>
        <div class="status dashboard-status">
          出走表を取得しました。AI予想・印・買い目を計算しています。
          <small>build \${previewEscape(window.__CHAPPY_APP_BUILD__ || "${BUILD}")}</small>
        </div>
        <div class="result-dashboard-grid">
          \${rows || '<article class="dashboard-card"><p>出走表の詳細を確認中です。</p></article>'}
        </div>
      </section>
    \`;

    updateStatus(
      \`\${params.place || ""} \${params.rno || params.raceNo || ""}Rの出走表を表示しました。AI予想を計算中...\`
    );
    updatePredictionOddsStatus("AI解析中", "loading");
    window.dispatchEvent(new CustomEvent(
      "chappy:prediction-preview-rendered",
      {
        detail: {
          place: params.place,
          jcd: params.jcd,
          raceNo: params.rno || params.raceNo,
          date: params.date,
          entries: entries.length,
          build: window.__CHAPPY_APP_BUILD__ || "${BUILD}"
        }
      }
    ));
    return true;
  }

  function yieldPredictionPreviewFrame() {
    return new Promise(resolve => {
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      } else {
        window.setTimeout(resolve, 0);
      }
    });
  }

`;
}

function patchScript() {
  const file = "js/script.js";
  let source = read(file);

  if (!source.includes("function renderRaceDataPreview")) {
    source = replaceOnce(
      source,
      "    async function fetchAndRenderRace() {",
      progressiveHelpers() + "    async function fetchAndRenderRace() {",
      "progressive preview helper insertion"
    );
  }

  if (!source.includes("renderRaceDataPreview(fetchedData, params);")) {
    const start = `      const predictionRuntime =
        window.ChappyPredictionRuntime
          ?.ensureReady?.();`;
    const end = `      const data =
        await prepareRaceDataForTheories(
          fetchedData,
          params
        );`;
    const replacement = `      const fetchedData =
        await raceDataPromise;

      if (!isCurrentRequest()) {
        return false;
      }

      renderRaceDataPreview(fetchedData, params);
      await yieldPredictionPreviewFrame();

      const predictionRuntime =
        window.ChappyPredictionRuntime
          ?.ensureReady?.();
      const hiyoriRuntime =
        window.ChappyHiyoriRuntimeLoader
          ?.ensureReady?.()
          .catch(error => {
            console.warn(
              "⚠️ 予想補助モジュールを準備できませんでした",
              error?.message || error
            );
          });

      await Promise.all([
        predictionRuntime,
        hiyoriRuntime
      ]);

      if (!isCurrentRequest()) {
        return false;
      }

      const data =
        await prepareRaceDataForTheories(
          fetchedData,
          params
        );`;
    source = replaceBetween(
      source,
      start,
      end,
      replacement,
      "race first progressive pipeline"
    );
  }

  if (!source.includes("E-PREDICTION-TERMINAL")) {
    const verifyMarker = "  async function verifyLiveDeadline(\n";
    const verifyIndex = source.indexOf(verifyMarker);
    if (verifyIndex < 0) {
      throw new Error("verifyLiveDeadline marker not found");
    }
    const beforeVerify = source.slice(0, verifyIndex);
    const tail = `      return false;
    }
  }

`;
    const tailIndex = beforeVerify.lastIndexOf(tail);
    if (tailIndex < 0) {
      throw new Error("fetchAndRenderRace catch tail not found");
    }
    const replacement = `      return false;
    } finally {
      if (isCurrentRequest()) {
        const resultArea = document.getElementById("resultArea");
        const loadingState = resultArea?.dataset?.raceLoading || "";
        if (loadingState === "true" || loadingState === "ai") {
          const message =
            "E-PREDICTION-TERMINAL: AI予想の表示処理が完了しませんでした。アプリを再読み込みしてレースを選び直してください。";
          if (typeof window.ChappyHomeDashboardV2?.showPredictionError === "function") {
            window.ChappyHomeDashboardV2.showPredictionError(message);
          } else if (resultArea) {
            resultArea.dataset.raceLoading = "error";
            resultArea.innerHTML =
              '<div class="prediction-loading-state is-error" role="alert">' +
              '<strong>AI予想を表示できませんでした</strong>' +
              '<small>' + previewEscape(message) + '</small>' +
              '</div>';
          }
          updateStatus("エラー");
          updatePredictionOddsStatus("取得失敗", "error");
          showError(message);
        }
      }
    }
  }

`;
    source = source.slice(0, tailIndex) + replacement + source.slice(tailIndex + tail.length);
  }

  write(file, source);
}

function patchRuntimeAndIndex() {
  const appFile = "js/app-runtime-loader.js";
  let app = read(appFile);
  app = app.replace(
    /const VERSION\s*=\s*"[^"]+";/,
    `const VERSION="${BUILD}";`
  );
  if (!app.includes(`const VERSION="${BUILD}";`)) {
    throw new Error("app runtime version update failed");
  }
  write(appFile, app);

  const indexFile = "index.html";
  let html = read(indexFile);
  html = replaceOnce(
    html,
    '<script>window.addEventListener("error"',
    `<script>window.__CHAPPY_APP_BUILD__="${BUILD}";window.addEventListener("error"`,
    "app build marker"
  );
  html = html.split(
    "js/app-runtime-loader.js?v=20260816-static-race1"
  ).join(
    `js/app-runtime-loader.js?v=${BUILD}`
  );
  html = html.split(
    "js/home-dashboard-v2.js?v=20260816-static-race1"
  ).join(
    `js/home-dashboard-v2.js?v=${BUILD}`
  );
  if (
    !html.includes(`js/app-runtime-loader.js?v=${BUILD}`) ||
    !html.includes(`js/home-dashboard-v2.js?v=${BUILD}`)
  ) {
    throw new Error("index runtime generation update failed");
  }
  write(indexFile, html);

  const roots = [
    path.join(ROOT, "scripts"),
    path.join(ROOT, ".github", "workflows")
  ];
  const replacements = [
    [
      "js/app-runtime-loader.js?v=20260816-static-race1",
      `js/app-runtime-loader.js?v=${BUILD}`
    ],
    [
      "js/home-dashboard-v2.js?v=20260816-static-race1",
      `js/home-dashboard-v2.js?v=${BUILD}`
    ]
  ];

  roots.forEach(rootPath => {
    if (!fs.existsSync(rootPath)) return;
    fs.readdirSync(rootPath, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .forEach(entry => {
        const filePath = path.join(rootPath, entry.name);
        let content = fs.readFileSync(filePath, "utf8");
        const original = content;
        replacements.forEach(([before, after]) => {
          content = content.split(before).join(after);
        });
        if (content !== original) fs.writeFileSync(filePath, content, "utf8");
      });
  });
}

function writeRegressionTest() {
  write("scripts/test-progressive-prediction-screen.js", `"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const BUILD = "${BUILD}";
const read = file => fs.readFileSync(path.join(ROOT, file), "utf8");

const home = read("js/home-dashboard-v2.js");
const script = read("js/script.js");
const appRuntime = read("js/app-runtime-loader.js");
const html = read("index.html");

assert.doesNotMatch(
  home,
  /if \(!fetchButton \|\| typeof root\.ChappyRaceSelection\?\.select !== "function"\) return;/,
  "レース選択機能が無い時に無言終了しない"
);
assert.match(home, /E-PREDICTION-BUTTON/);
assert.match(home, /E-RACE-SELECTION-RUNTIME/);

const previewCall = script.indexOf(
  "renderRaceDataPreview(fetchedData, params);"
);
const runtimeStart = script.indexOf(
  "const predictionRuntime =",
  previewCall
);
assert.ok(previewCall > 0, "出走表プレビューを実行する");
assert.ok(
  runtimeStart > previewCall,
  "出走表を表示してから重い予想ランタイムを待つ"
);
assert.match(script, /resultArea\.dataset\.raceLoading = "ai"/);
assert.match(script, /chappy:prediction-preview-rendered/);
assert.match(script, /finally \{[\s\S]*E-PREDICTION-TERMINAL/);

assert.match(appRuntime, new RegExp(
  'const VERSION=\\"' + BUILD + '\\";'
));
assert.match(html, new RegExp(
  'window\\.__CHAPPY_APP_BUILD__=\\"' + BUILD + '\\"'
));
assert.match(html, new RegExp(
  'js/app-runtime-loader\\.js\\?v=' + BUILD
));
assert.match(html, new RegExp(
  'js/home-dashboard-v2\\.js\\?v=' + BUILD
));

console.log("progressive prediction screen contract passed");
`);
}

function writeCheckWorkflow() {
  write(".github/workflows/check-progressive-prediction-screen.yml", `name: Check progressive prediction screen

on:
  pull_request:
    paths:
      - "index.html"
      - "js/app-runtime-loader.js"
      - "js/home-dashboard-v2.js"
      - "js/script.js"
      - "scripts/test-progressive-prediction-screen.js"
      - ".github/workflows/check-progressive-prediction-screen.yml"
  push:
    branches:
      - main
    paths:
      - "index.html"
      - "js/app-runtime-loader.js"
      - "js/home-dashboard-v2.js"
      - "js/script.js"
      - "scripts/test-progressive-prediction-screen.js"

permissions:
  contents: read

jobs:
  contract:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Check progressive display contracts
        run: |
          node --check js/app-runtime-loader.js
          node --check js/home-dashboard-v2.js
          node --check js/script.js
          node --check scripts/test-progressive-prediction-screen.js
          node scripts/test-progressive-prediction-screen.js
      - name: Run related regressions
        run: |
          node scripts/test-home-dashboard-v2-phase2.js
          node scripts/test-prediction-loading-terminal-state.js
          node scripts/test-startup-critical-path.js
          node scripts/test-prediction-runtime-loader.js
          node scripts/check-charter.js
`);
}

function removeTemporaryFiles() {
  [
    "scripts/apply-progressive-prediction-screen.js",
    ".github/workflows/apply-progressive-prediction-screen.yml"
  ].forEach(relativePath => {
    const filePath = full(relativePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

function main() {
  patchHomeDashboard();
  patchScript();
  patchRuntimeAndIndex();
  writeRegressionTest();
  writeCheckWorkflow();
  removeTemporaryFiles();
  console.log(`progressive prediction screen patch applied: ${BUILD}`);
}

main();
