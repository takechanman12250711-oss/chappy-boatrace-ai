"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const {
  MAX_SHARD_BYTES,
  currentShardDescriptors,
  reconstructIndex,
  retainedShardDescriptors,
  sha256
} = require(
  "./build-prediction-index-shards"
);
const {
  buildPredictionIndex
} = require(
  "./build-prediction-index"
);
const {
  compactIndex
} = require(
  "./compact-prediction-index"
);
const archiveApi = require(
  "./daily-prediction-source-archive"
);
const restoreApi = require(
  "./restore-daily-prediction-source"
);

const root = path.resolve(__dirname, "..");
const read = file =>
  fs.readFileSync(path.join(root, file), "utf8");

function buildArchiveBackedCurrentIndex() {
  const predictionDirectory =
    archiveApi.predictionDirectory(root);
  const backupDirectory = fs.mkdtempSync(
    path.join(
      predictionDirectory,
      ".load-performance-source-"
    )
  );
  const snapshots =
    archiveApi
      .archivedSourceDates(root)
      .map(date => {
        const sourcePath =
          archiveApi.sourcePathFor(root, date);
        const backupPath = path.join(
          backupDirectory,
          date + ".json"
        );
        const existed = fs.existsSync(sourcePath);

        if (existed) {
          try {
            fs.linkSync(sourcePath, backupPath);
          } catch {
            fs.copyFileSync(sourcePath, backupPath);
          }
        }

        return {
          sourcePath,
          backupPath,
          existed
        };
      });

  try {
    const restored =
      restoreApi.restorePredictionSources({
        rootDirectory: root,
        all: true
      });

    assert.ok(
      restored.length > 0,
      "分割index照合にはarchive原本が必要"
    );
    assert.ok(
      restored.every(
        result => result.status === "restored"
      ),
      "archive済み日次予想原本をすべて復元する"
    );

    return compactIndex(
      buildPredictionIndex(predictionDirectory)
    );
  } finally {
    snapshots.forEach(snapshot => {
      fs.rmSync(
        snapshot.sourcePath,
        { force: true }
      );

      if (snapshot.existed) {
        fs.renameSync(
          snapshot.backupPath,
          snapshot.sourcePath
        );
      }
    });
    fs.rmSync(
      backupDirectory,
      {
        recursive: true,
        force: true
      }
    );
  }
}

const html = read("index.html");
const script = read("js/script.js");
const appRuntime = read("js/app-runtime-loader.js");
const stats = read("js/stats.js");
const statsRuntime = read(
  "js/stats-runtime-loader.js"
);
const referenceTagReport = read(
  "js/reference-tag-report.js"
);
const autoSelection = read("js/auto-selection.js");
const api = read("js/api.js");
const raceApi = read("api/race.js");
const oddsApi = read("api/odds.js");
const scheduleApi = read("api/schedule.js");
const hiyoriLoader = read("js/hiyori-runtime-loader.js");
const todayResultsHome = read("js/today-results-home.js");
const render = read("js/render.js");
const predictionRuntime = read(
  "js/prediction-runtime-loader.js"
);
const calibrationModulePath = path.join(
  root,
  "js",
  "prediction-calibration.js"
);
const calibrationDataPath = path.join(
  root,
  "data",
  "predictions",
  "calibration.json"
);
const predictionIndexPath =
  path.join(
    root,
    "data",
    "predictions",
    "index.json"
  );
const predictionIndexManifestPath =
  path.join(
    root,
    "data",
    "predictions",
    "index-manifest.json"
  );
const improvementReviewPath =
  path.join(
    root,
    "data",
    "predictions",
    "improvement-review.json"
  );
const calibrationModule =
  fs.readFileSync(
    calibrationModulePath
  );

assert.ok(
  calibrationModule.length <
    35000,
  "校正モジュールのrawサイズを35KB未満にする"
);
assert.ok(
  zlib.gzipSync(
    calibrationModule,
    { level: 9 }
  ).length < 8000,
  "校正モジュールのgzip配信量を8KB未満にする"
);
assert.ok(
  fs.statSync(calibrationDataPath).size <
    10000,
  "画面が読む校正JSONを10KB未満にする"
);
assert.equal(
  html.includes(
    'src="js/prediction-calibration.js'
  ),
  false,
  "校正モジュールとJSONを初期表示で取得しない"
);
assert.equal(
  predictionRuntime.includes(
    '"js/prediction-calibration.js"'
  ),
  true,
  "校正モジュールは予想開始時だけ遅延読込する"
);

[
  "venue-frame-reference.js",
  "venue-frame-reference-highlights.js",
  "venue-frame-reference-summary.js",
  "venue-frame-flow-comment.js",
  "reference-tag-report.js",
  "frame-rise-sink-report.js",
  "hiyori-operations-compact.js"
].forEach(file => {
  assert.equal(
    html.includes(file),
    false,
    `${file} を初期表示で読み込まない`
  );
});

assert.equal(
  statsRuntime.includes('"js/reference-tag-report.js"'),
  true,
  "公式参考分析は結果画面を開いた時だけ遅延読込する"
);
assert.equal(
  referenceTagReport.includes("hiyori-official-comparison.json"),
  false,
  "削除した日和直接比較レポートを画面から取得しない"
);

const loadVenueChoicesBody = script.slice(
  script.indexOf("async function loadVenueChoices"),
  script.indexOf("function updateRaceInfo")
);
assert.equal(
  loadVenueChoicesBody.includes("selectBestLiveRace("),
  false,
  "初期表示で全場のレースAPIを走査しない"
);
assert.equal(
  loadVenueChoicesBody.includes("loadStoredLiveSelection("),
  true,
  "軽量な保存済み選定結果を使う"
);
assert.equal(
  script.includes(
    "await Promise.all(["
  ),
  true,
  "レースAPI取得と予想エンジン読込を並行する"
);
assert.equal(
  script.includes("__CHAPPY_PREDICTION_VIEW_GUARD__") &&
    script.includes('event?.detail?.view !== "prediction"'),
  true,
  "別タブへ移動した古い予想を裏で計算・描画しない"
);
assert.equal(
  script.includes("prefetchRace?.({"),
  true,
  "選択中の1レースだけを裏で先読みする"
);
assert.equal(
  api.includes("RACE_CACHE_MS = 15000"),
  true,
  "先読み結果を短時間だけ再利用する"
);
assert.equal(
  api.includes("RACE_REQUEST_TIMEOUT_MS = 30000"),
  true,
  "レースAPIが固まっても予想画面を無期限待機させない"
);
assert.equal(
  raceApi.includes("OFFICIAL_REQUEST_TIMEOUT_MS = 15000") &&
    raceApi.includes("Promise.allSettled") &&
    raceApi.includes('beforeResult.status === "fulfilled"') &&
    raceApi.includes('beforeRes.text()') &&
    raceApi.includes('"private, no-store, max-age=0"'),
  true,
  "API側も公式出走表を15秒で打ち切り、任意の直前情報失敗で全体を止めず劣化応答を共有しない"
);
assert.equal(
  script.includes("const closedByTime = Number.isFinite(deadlineMs)") &&
    script.includes('mode === "live"') &&
    script.includes("closedNow"),
  true,
  "長期キャッシュした12R時刻も現在時刻で締切前・終了を再判定する"
);
assert.equal(
  oddsApi.includes("OFFICIAL_REQUEST_TIMEOUT_MS = 15000") &&
    oddsApi.includes("s-maxage=10, stale-while-revalidate=20"),
  true,
  "公式オッズを無期限待機せず短時間CDNキャッシュで共有する"
);
assert.equal(
  scheduleApi.includes("s-maxage=300, stale-while-revalidate=3600") &&
    scheduleApi.includes("s-maxage=60, stale-while-revalidate=300") &&
    scheduleApi.includes("selectedVenue.scheduleAvailable && !selectedVenue.error") &&
    scheduleApi.includes('"private, no-store, max-age=0"'),
  true,
  "変更頻度に合わせて12R時刻と開催概要のCDNキャッシュを分け、劣化した12R応答は共有しない"
);
assert.equal(
  autoSelection.includes("SUMMARY_ROOT"),
  true,
  "自動選定は軽量要約を優先する"
);
const loadDateDataBody = autoSelection.slice(
  autoSelection.indexOf("function loadDateData"),
  autoSelection.indexOf("function ticketLabel")
);
assert.equal(
  loadDateDataBody.includes("Date.now()"),
  false,
  "初期表示の予想取得でキャッシュを毎回破棄しない"
);
assert.equal(
  stats.includes("function setupLazyStats()"),
  true,
  "結果データは遅延読み込みにする"
);
[
  "js/collection-health.js",
  "js/prediction-verification.js",
  "js/prediction-index-loader.js",
  "js/auto-stats.js",
  "js/verification-readiness.js",
  "js/improvement-suggestions.js",
  "js/stats.js"
].forEach(file => {
  assert.equal(
    html.includes(
      `src="${file}`
    ),
    false,
    `${file} は初期表示で直接読み込まない`
  );
  assert.equal(
    statsRuntime.includes(
      `"${file}"`
    ),
    true,
    `${file} は結果画面用ローダーへ登録する`
  );
});
[
  "js/verification-readiness.js",
  "js/improvement-suggestions.js"
].forEach(file => {
  assert.ok(
    statsRuntime.indexOf(`"${file}"`) <
      statsRuntime.indexOf('"js/stats.js"'),
    `${file} は参照元のstats.jsより先に読み込む`
  );
});
assert.equal(
  appRuntime.includes(
    "js/stats-runtime-loader.js"
  ),
  true,
  "結果画面の軽量ローダーだけを初期読込する"
);
assert.equal(
  /DOMContentLoaded[^\n]*load/.test(todayResultsHome),
  false,
  "結果照合モジュールはホーム表示だけで自動起動しない"
);
assert.equal(
  todayResultsHome.includes("function load()"),
  true,
  "会場展開・レース選択時の結果照合遅延読込は維持する"
);
assert.equal(
  todayResultsHome.includes("script.remove()"),
  true,
  "結果照合の遅延読込に失敗したscriptを除去して再試行可能にする"
);
assert.equal(
  todayResultsHome.includes("return loadPromise"),
  true,
  "結果照合の遅延読込完了を会場展開・予想選択から待てるようにする"
);
assert.equal(
  todayResultsHome.includes("LOAD_TIMEOUT_MS=15000"),
  true,
  "結果照合モジュールの遅延読込を15秒で打ち切る"
);
[
  "style.css?v=20260806-results-ui-phase4-1",
  "css/home-dashboard-v2.css?v=20260803-entry-odds1",
  "js/app-runtime-loader.js?v=20260816-static-race1",
  "js/home-dashboard-v2.js?v=20260816-static-race1"
].forEach(asset => {
  assert.equal(
    html.includes(asset),
    true,
    `${asset} の更新版を既存端末へ配信する`
  );
});
assert.equal(
  appRuntime.includes(
    'const VERSION = "20260815-odds-immediate1"'
  ),
  true,
  "変更した通常画面モジュールのキャッシュ世代を更新する"
);
assert.equal(
  html.includes(
    "js/app-runtime-loader.js?v=20260816-static-race1"
  ) &&
    html.includes(
      "js/prediction-runtime-loader.js?v=20260824-readonly-core-fix1"
    ) &&
    html.includes(
      "js/hiyori-runtime-loader.js?v=20260825-mobile-startup-terminal4"
    ) &&
    appRuntime.includes(
      'const VERSION = "20260815-odds-immediate1"'
    ) &&
    predictionRuntime.includes(
      'const VERSION = "20260824-readonly-core-fix1"'
    ) &&
    hiyoriLoader.includes(
      'const VERSION="20260825-mobile-startup-terminal4"'
    ),
  true,
  "現在の親ローダー・予想・日和補助のキャッシュ世代を配信する"
);
assert.equal(
  script.includes("function initializeRaceControls()") &&
    script.includes("document.readyState") &&
    script.includes('window.addEventListener(\n      "DOMContentLoaded",') &&
    script.includes("initializeRaceControls();") &&
    script.includes("chappyRaceControlBound"),
  true,
  "遅延読込したレース操作をDOMContentLoaded後でも一度だけ初期化する"
);
assert.equal(
  appRuntime.includes("root.ChappyRaceControls") &&
    appRuntime.includes("?.initialize?.()") &&
    !appRuntime.includes('dispatchEvent(new Event("DOMContentLoaded"))'),
  true,
  "レース読込時に全画面のDOMContentLoadedを再送せず専用初期化を呼ぶ"
);
assert.equal(
  script.includes("function setupNoteAssistant()") &&
    script.includes("chappyNoteControlBound") &&
    script.includes("setupNoteAssistant();") &&
    !script.includes(
      'document.addEventListener(\n    "DOMContentLoaded",\n    setupNoteAssistant'
    ),
  true,
  "遅延読込したnote操作もDOMContentLoaded後に重複なく初期化する"
);
assert.equal(
  predictionRuntime.includes(
    'const VERSION = "20260824-readonly-core-fix1"'
  ),
  true,
  "全文表示を含む予想モジュールのキャッシュ世代を更新する"
);
assert.equal(
  appRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS=15000") &&
    predictionRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 12000") &&
    statsRuntime.includes("SCRIPT_LOAD_TIMEOUT_MS = 15000") &&
    hiyoriLoader.includes("SCRIPT_LOAD_TIMEOUT_MS=12000"),
  true,
  "モジュール読込が止まってもタブと予想を無期限待機させない"
);
assert.equal(
  statsRuntime.includes(
    '"20260810-official-reference1"'
  ),
  true,
  "結果分析モジュールのキャッシュ世代を更新する"
);
assert.equal(
  statsRuntime.includes(
    'a[href="#resultSection"]'
  ),
  true,
  "成績タブの操作で結果分析を読み込む"
);
assert.equal(
  statsRuntime.includes(
    "IntersectionObserver"
  ),
  false,
  "初期画面内に結果欄があっても統計を先読みしない"
);
assert.equal(
  statsRuntime.includes("js/theory-improvement-dashboard.js"),
  false,
  "成績分析の通常表示から運用診断7通信を外す"
);
assert.equal(
  stats.includes("OFFICIAL_SYNC_MAX_TARGETS = 5") &&
    stats.includes("if (!section || section.hidden) return Promise.resolve(false)"),
  true,
  "成績分析を閉じた後は公式結果照合を止め、1回最大5レースに制限する"
);
assert.equal(
  stats.includes("STATS_REQUEST_TIMEOUT_MS = 30000") &&
    stats.includes("officialSyncAbortController?.abort()"),
  true,
  "成績通信に上限を設け、タブを離れたら進行中通信を中止する"
);
assert.equal(
  stats.includes("date === today") &&
    stats.includes("deadlineMs > Date.now()"),
  true,
  "当日の終了前・終了時刻不明レースを結果照合しない"
);
assert.equal(
  script.includes("deadlineAt: String("),
  true,
  "保存予想へ締切時刻を残して終了後だけ照合できるようにする"
);
assert.equal(
  stats.includes("成績の要点"),
  true
);
assert.equal(
  stats.includes("直近の結果"),
  true
);
assert.equal(
  hiyoriLoader.includes("function ensureReady()") &&
    !hiyoriLoader.match(/function ensureReady\(\)\{[\s\S]*?scheduleInstall\(\);[\s\S]*?return Promise\.resolve\(true\)/) &&
    hiyoriLoader.includes("return Promise.resolve(true)"),
  true,
  "日和補助は初回予想と並行して予想関数を差し替えない"
);
assert.equal(
  appRuntime.includes(
    "js/prediction-runtime-loader.js"
  ),
  true,
  "予想エンジンの遅延ローダーを読み込む"
);
[
  "js/ai-core.js",
  "js/prediction.js",
  "js/render.js",
  "js/race-history.js"
].forEach(file => {
  assert.equal(
    html.includes(`src="${file}`),
    false,
    `${file} は予想開始まで直接読み込まない`
  );
  assert.equal(
    predictionRuntime.includes(`"${file}"`),
    true,
    `${file} を遅延ローダーへ登録する`
  );
});
assert.equal(
  hiyoriLoader.includes(
    'window.addEventListener("load",scheduleInstall'
  ),
  false,
  "裏側の学習診断を初期表示直後に起動しない"
);
assert.equal(
  hiyoriLoader.includes(
    'window.addEventListener("chappy:prediction-rendered",scheduleInstall'
  ),
  false,
  "予想表示後も学習診断を自動起動しない"
);
assert.equal(
  predictionRuntime.includes("void ensureOptionalReady()"),
  false,
  "予想表示後に任意校正を自動起動しない"
);
assert.equal(
  predictionRuntime.includes(
    '"js/history-insights-base.js"'
  ),
  true,
  "履歴本体を遅延ローダーから直接読み込む"
);
assert.equal(
  predictionRuntime.includes(
    '"js/motor-maintenance-insights.js"'
  ),
  true,
  "モーター理論を遅延ローダーから直接読み込む"
);
assert.equal(
  predictionRuntime.includes(
    '"js/history-insights.js"'
  ),
  false,
  "document.writeを使う互換ローダーは遅延読込しない"
);
[
  'renderNewspaperSheet(prediction, "main")',
  'renderNewspaperSheet(prediction, "manshu")',
  "renderPracticalSelection(prediction)",
  "renderTicketRanking(prediction)"
].forEach(sectionCall => {
  assert.equal(
    render.includes(sectionCall),
    true,
    `${sectionCall} を予想画面に残す`
  );
});

const statsUi = stats.slice(
  stats.indexOf('U.setHtml("statsArea", `'),
  stats.indexOf("function initStatsEvents()")
);
[
  "成績の要点",
  "直近の結果",
  "厳選的中率",
  "回収率",
  "検証収支",
  "100R精度検証",
  "data-stats-load-state"
].forEach(label => {
  assert.equal(
    statsUi.includes(label),
    true,
    `${label} を結果画面に表示する`
  );
});
[
  "自動履歴を取得できません",
  "正式100Rへ入らない主因",
  "除外の代表例",
  "直近収集のV2判定可能",
  "未完成の主因"
].forEach(label => {
  assert.equal(
    stats.includes(label),
    true,
    `${label} を100R蓄積診断に表示する`
  );
});
[
  "完全データ500Rの進捗",
  "点数帯別",
  "改善候補",
  "場別比較",
  "品質診断",
  "復旧診断",
  "展開一致率",
  "シャドー"
].forEach(label => {
  assert.equal(
    statsUi.includes(label),
    false,
    `${label} をユーザー向け結果画面に表示しない`
  );
});
assert.equal(
  (statsUi.match(/renderMetricCard\(\{/g) || []).length,
  5,
  "結果画面の主要指標は5項目で表示する"
);
assert.equal(
  stats.includes(
    "realSettledRows.slice(0, 5)"
  ),
  true,
  "直近結果はシャドーを除いた最大5Rにする"
);
assert.equal(
  stats.includes(
    "A.buildResultHeadline(\n          userVerificationSummary"
  ),
  true,
  "ユーザー向けKPIへシャドー集計を混ぜない"
);

const predictionIndex =
  fs.readFileSync(
    predictionIndexPath
  );
assert.ok(
  predictionIndex.length <
    3000000,
  `凍結legacy indexは3MB未満 (${predictionIndex.length} bytes)`
);
assert.ok(
  zlib.gzipSync(
    predictionIndex,
    { level: 9 }
  ).length <
    300000,
  "集約indexのgzip配信量を300KB未満にする"
);
const manifestBuffer =
  fs.readFileSync(
    predictionIndexManifestPath
  );
const manifest = JSON.parse(
  manifestBuffer.toString("utf8")
);
assert.equal(
  manifest.format,
  "chappy-prediction-index-manifest"
);
assert.ok(
  manifestBuffer.length < 20_000,
  `予想index manifestは20KB未満 (${manifestBuffer.length} bytes)`
);
const descriptors =
  currentShardDescriptors(manifest);
const retainedDescriptors =
  retainedShardDescriptors(manifest);
const artifactDescriptors = [
  ...descriptors,
  ...retainedDescriptors
].filter(
  (descriptor, index, all) =>
    all.findIndex(item =>
      item.path === descriptor.path
    ) === index
);
assert.ok(
  descriptors.length >= 4,
  "4配列を独立shardとして配信する"
);
const artifactBuffers =
  new Map();
artifactDescriptors.forEach(
  descriptor => {
    const shardPath = path.join(
      root,
      "data",
      "predictions",
      descriptor.path
    );
    const buffer = fs.readFileSync(
      shardPath
    );
    assert.equal(
      buffer.length,
      descriptor.bytes,
      `${descriptor.path} のmanifest容量と実体を一致させる`
    );
    assert.ok(
      buffer.length < MAX_SHARD_BYTES,
      `${descriptor.path} は1.25MB未満 (${buffer.length} bytes)`
    );
    assert.equal(
      sha256(buffer.toString("utf8")),
      descriptor.shardId,
      `${descriptor.path} のcontent hashを一致させる`
    );
    artifactBuffers.set(
      descriptor.path,
      buffer
    );
  }
);
const expectedShardNames =
  artifactDescriptors
    .map(descriptor =>
      path.basename(descriptor.path)
    )
    .sort();
const actualShardNames =
  fs.readdirSync(
    path.join(
      root,
      "data",
      "predictions",
      "index-shards"
    )
  ).filter(name =>
    name.endsWith(".json")
  ).sort();
assert.deepEqual(
  actualShardNames,
  expectedShardNames,
  "manifestの現世代＋直前世代以外のshardを配信しない"
);
const shardBuffers = descriptors.map(
  descriptor =>
    artifactBuffers.get(
      descriptor.path
    )
);
const aggregateGzipBytes = [
  manifestBuffer,
  ...shardBuffers
].reduce(
  (sum, buffer) =>
    sum + zlib.gzipSync(
      buffer,
      { level: 9 }
    ).length,
  0
);
assert.ok(
  aggregateGzipBytes < 300_000,
  `manifest＋全shardのgzip配信量を300KB未満にする (${aggregateGzipBytes} bytes)`
);
const reconstructedIndex =
  reconstructIndex(
    predictionIndexManifestPath
  );
const expectedCurrentIndex =
  buildArchiveBackedCurrentIndex();
assert.deepEqual(
  {
    ...reconstructedIndex,
    generatedAt: ""
  },
  {
    ...expectedCurrentIndex,
    generatedAt: ""
  },
  "分割indexを日次正本の現在値と同一内容で再構成する"
);
assert.equal(
  reconstructedIndex
    .verificationPredictions.length,
  300,
  "検証母数300件を維持する"
);
assert.ok(
  reconstructedIndex
    .shadowV2Predictions.length >=
    300,
  "V2の500R進捗用履歴を維持する"
);
assert.ok(
  fs.statSync(
    improvementReviewPath
  ).size < 20000,
  "100R精度検証JSONを20KB未満にする"
);

const summaryDirectory = path.join(
  root,
  "data",
  "predictions",
  "summaries"
);
for (const name of fs.readdirSync(summaryDirectory)) {
  if (!/^\d{8}\.json$/.test(name)) continue;
  const bytes = fs.statSync(
    path.join(summaryDirectory, name)
  ).size;
  assert.ok(
    bytes < 20000,
    `${name} は20KB未満 (${bytes} bytes)`
  );
}

class FakeControl {
  constructor() {
    this.dataset = {};
    this.listeners = new Map();
    this.value = "";
    this.hidden = false;
    this.disabled = false;
    this.textContent = "";
  }

  addEventListener(type, listener) {
    const listeners =
      this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  click() {
    for (const listener of
      this.listeners.get("click") || []) {
      listener.call(this, {
        currentTarget: this,
        target: this
      });
    }
  }

  listenerCount(type) {
    return (
      this.listeners.get(type) || []
    ).length;
  }
}

const controlIds = [
  "fetchRaceBtn",
  "reloadRaceBtn",
  "refreshOddsBtn",
  "raceModeSelect",
  "dateInput",
  "homeDashboardV2",
  "noteAssistantSection",
  "noteGenerateBtn",
  "noteCopyTitleBtn",
  "noteCopyFullBtn",
  "noteStatusBadge",
  "noteTitlePreview",
  "noteArticlePreview"
];
const controls = Object.fromEntries(
  controlIds.map(id => [
    id,
    new FakeControl()
  ])
);
controls.noteAssistantSection.hidden = true;
controls.noteGenerateBtn.disabled = true;
controls.noteCopyTitleBtn.disabled = true;
controls.noteCopyFullBtn.disabled = true;
let noteGeneratorCalls = 0;
const lateWindow = {
  addEventListener() {},
  renderAll(prediction) {
    return prediction;
  },
  ChappyNoteGenerator: {
    generateArticle() {
      noteGeneratorCalls += 1;
      return {
        ok: true,
        title: "テスト記事",
        fullText: "テスト本文",
        practicalTickets: ["1-2-3"]
      };
    }
  }
};
const lateDocument = {
  readyState: "complete",
  getElementById(id) {
    return controls[id] || null;
  },
  querySelector() {
    return null;
  }
};
const lateContext = {
  window: lateWindow,
  document: lateDocument,
  localStorage: {
    getItem() {
      return null;
    },
    setItem() {}
  },
  console: {
    log() {},
    error() {}
  },
  navigator: {},
  setTimeout,
  clearTimeout
};
vm.runInNewContext(script, lateContext);
vm.runInNewContext(script, lateContext);
lateWindow.ChappyRaceControls.initialize();
lateWindow.ChappyRaceControls.initialize();

[
  ["fetchRaceBtn", "click"],
  ["reloadRaceBtn", "click"],
  ["refreshOddsBtn", "click"],
  ["raceModeSelect", "change"],
  ["noteGenerateBtn", "click"],
  ["noteCopyTitleBtn", "click"],
  ["noteCopyFullBtn", "click"]
].forEach(([id, type]) => {
  assert.equal(
    controls[id].listenerCount(type),
    1,
    `${id} は遅延・二重読込後も一度だけ接続する`
  );
});
assert.match(
  controls.dateInput.value,
  /^\d{4}-\d{2}-\d{2}$/,
  "DOMContentLoaded後の遅延読込でも日付を初期化する"
);
lateWindow.renderAll({ ok: true });
assert.equal(
  controls.noteAssistantSection.hidden,
  false,
  "遅延読込後もnote操作を予想に接続する"
);
controls.noteGenerateBtn.click();
assert.equal(
  noteGeneratorCalls,
  1,
  "note生成クリックを重複実行しない"
);
assert.equal(
  controls.noteTitlePreview.value,
  "テスト記事",
  "遅延読込後もnote記事を生成できる"
);

console.log("初期表示パフォーマンス回帰テスト: 合格");
