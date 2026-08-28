"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workflowDir = path.join(root, ".github", "workflows");
const readWorkflow = name =>
  fs.readFileSync(path.join(workflowDir, name), "utf8");
const triggerBlock = (workflow, startMarker, endMarker) => {
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `trigger範囲を特定できる: ${startMarker}`);
  return workflow.slice(start, end);
};

const centralName = "collect-results.yml";
const dedicatedName = "check-local-water-v2-post-adoption-monitor.yml";
const predictionCollectorName = "collect-predictions.yml";
const charterName = "charter-check.yml";
const racerHistoryName = "check-racer-skill-st-history.yml";
const central = readWorkflow(centralName);
const dedicated = readWorkflow(dedicatedName);
const predictionCollector = readWorkflow(predictionCollectorName);
const charter = readWorkflow(charterName);
const racerHistory = readWorkflow(racerHistoryName);
const monitorSource = fs.readFileSync(
  path.join(root, "scripts", "monitor-local-water-v2-post-adoption.js"),
  "utf8",
);
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";
const builderPath = "scripts/monitor-local-water-v2-post-adoption.js";
const builder = `node ${builderPath}`;
const boundedBuilder = `timeout 300s ${builder}`;
const fixture = "node scripts/test-local-water-v2-post-adoption-monitor.js";
const contract =
  "node scripts/test-local-water-v2-post-adoption-monitor-writer-contract.js";

for (const trackedPath of [
  ".github/workflows/check-local-water-v2-post-adoption-monitor.yml",
  "api/race.js",
  "api/_history.js",
  "api/_original-exhibition.js",
  "api/_parser.js",
  "js/ai-core.js",
  "js/boat-identity.js",
  "js/evaluated-scenario-candidates.js",
  "js/history-insights.js",
  "js/history-insights-base.js",
  "js/local-water-v2-tiebreak.js",
  "js/motor-maintenance-insights.js",
  "js/theory-input.js",
  "scripts/build-local-water-branch-report.js",
  "scripts/check-charter.js",
  "scripts/monitor-local-water-v2-post-adoption.js",
  "scripts/venue-race-history.js",
  "scripts/test-local-water-v2-post-adoption-monitor.js",
  "scripts/test-local-water-v2-post-adoption-monitor-writer-contract.js",
  "config/chappy-charter.json",
  "data/stats/venue-race-patterns.json",
  "data/stats/race-patterns.json",
  "data/stats/racer-venue-starts.json",
  "data/stats/racer-skill-patterns.json",
  "data/stats/course-structure-patterns.json",
  "data/stats/local-water-v2-post-adoption-input-cache.json",
]) {
  assert.ok(
    central.includes(`- "${trackedPath}"`),
    `中央writerを関連変更後に起動する: ${trackedPath}`,
  );
}

assert.match(central, /permissions:\s*\n\s*contents: write/);
assert.match(central, /group: chappy-main-data-writers/);
assert.match(central, /queue: max/);
assert.match(central, /cancel-in-progress: false/);
assert.match(central, /timeout-minutes: 30/);
assert.match(central, /node-version: "20"/);

const verifyStart = central.indexOf("- name: Verify result merge safety");
const collectStart = central.indexOf("- name: Collect official results");
const monitorStart = central.indexOf(
  "- name: Build Local Water V2 post-adoption monitor",
  collectStart,
);
const validateStart = central.indexOf(
  "- name: Validate result prediction artifacts",
  monitorStart,
);
const saveStart = central.indexOf(
  "- name: Save official results before calibration",
  validateStart,
);
const calibrationStart = central.indexOf(
  "- name: Build prediction calibration",
  saveStart,
);
assert.ok(
  verifyStart >= 0 &&
    collectStart > verifyStart &&
    monitorStart > collectStart &&
    validateStart > monitorStart &&
    saveStart > validateStart &&
    calibrationStart > saveStart,
  "中央結果収集の検証・生成・保存step順を特定できる",
);

const verification = central.slice(verifyStart, collectStart);
for (const command of [
  "node --check scripts/monitor-local-water-v2-post-adoption.js",
  fixture,
  contract,
]) {
  assert.ok(verification.includes(command), `中央事前検証が実行する: ${command}`);
}
assert.ok(
  !verification.split("\n").some(line => line.trim() === builder),
  "中央事前検証ではnetwork monitorを実行しない",
);

const collectStep = central.slice(collectStart, monitorStart);
const monitorStep = central.slice(monitorStart, validateStart);
const restoreIndex = collectStep.indexOf(restore);
const repairIndex = collectStep.indexOf(repair);
assert.ok(
  restoreIndex >= 0 && repairIndex > restoreIndex,
  "中央収集はLocal/Water V2診断前に正本復元・結果修復する",
);
assert.ok(
  !collectStep.includes(builderPath),
  "重要な公式結果収集stepへ外部network monitorを混在させない",
);
assert.ok(
  monitorStep.includes("continue-on-error: true") &&
    monitorStep.includes(boundedBuilder),
  "Local/Water V2診断は5分上限かつ公式結果保存を妨げない独立stepで実行する",
);

const validateStep = central.slice(validateStart, saveStart);
const saveStep = central.slice(saveStart, calibrationStart);
assert.ok(validateStep.includes("node scripts/prepare-daily-prediction-git-save.js --all"));
assert.match(saveStep, /git add data\/results data\/stats/);
assert.ok(
  saveStep.indexOf("node scripts/prepare-daily-prediction-git-save.js --all") <
    saveStep.indexOf("git add data/results data/stats"),
  "中央writerはGit-safe復元後に成果物をstageする",
);
for (const command of [
  'git commit -m "Collect official race results"',
  "git pull --rebase origin main",
  "git push origin main",
]) {
  assert.ok(saveStep.includes(command), `中央writerが実行する: ${command}`);
}
assert.ok(
  saveStep.indexOf("git add data/results data/stats") <
    saveStep.indexOf('git commit -m "Collect official race results"') &&
    saveStep.indexOf('git commit -m "Collect official race results"') <
      saveStep.indexOf("git pull --rebase origin main") &&
    saveStep.indexOf("git pull --rebase origin main") <
      saveStep.indexOf("git push origin main"),
  "中央writerはstage・commit・rebase・pushの固定順で保存する",
);

assert.match(dedicated, /permissions:\s*\n\s*contents: read/);
assert.match(dedicated, /timeout-minutes: 15/);
assert.match(dedicated, /node-version: 20/);
assert.match(
  dedicated,
  /group: \$\{\{ github\.event_name == 'pull_request'.*github\.event\.pull_request\.number.*github\.ref.*\}\}/,
);
assert.match(dedicated, /persist-credentials: false/);
for (const trackedPath of [
  "api/race.js",
  "api/_history.js",
  "api/_original-exhibition.js",
  "api/_parser.js",
  "js/ai-core.js",
  "js/boat-identity.js",
  "js/evaluated-scenario-candidates.js",
  "js/history-insights.js",
  "js/history-insights-base.js",
  "js/local-water-v2-tiebreak.js",
  "js/motor-maintenance-insights.js",
  "js/theory-input.js",
  "scripts/build-local-water-branch-report.js",
  "scripts/check-charter.js",
  "scripts/monitor-local-water-v2-post-adoption.js",
  "scripts/venue-race-history.js",
  "scripts/restore-daily-prediction-source.js",
  "scripts/test-local-water-v2-post-adoption-monitor.js",
  "scripts/test-local-water-v2-post-adoption-monitor-writer-contract.js",
  "data/predictions/*.json",
  "data/predictions/source-archives/**",
  "config/chappy-charter.json",
  "data/stats/venue-race-patterns.json",
  "data/stats/race-patterns.json",
  "data/stats/racer-venue-starts.json",
  "data/stats/racer-skill-patterns.json",
  "data/stats/course-structure-patterns.json",
  "data/stats/local-water-v2-post-adoption-input-cache.json",
  ".github/workflows/check-local-water-v2-post-adoption-monitor.yml",
  ".github/workflows/collect-results.yml",
]) {
  const eventPaths = triggerBlock(
    dedicated,
    "  pull_request:",
    "  workflow_dispatch:",
  );
  assert.ok(
    eventPaths.includes(`- "${trackedPath}"`),
    `専用workflowを関連変更後に起動する: ${trackedPath}`,
  );
}
assert.ok(
  !dedicated.includes("  push:"),
  "merge時に中央と専用diagnosticを二重実行しない",
);
assert.ok(
  dedicated.indexOf(restore) < dedicated.indexOf(fixture) &&
    dedicated.indexOf(fixture) < dedicated.indexOf(contract) &&
    dedicated.indexOf(contract) < dedicated.indexOf(boundedBuilder),
  "専用workflowは復元・fixture・契約後にread-only実データ診断する",
);
const checkpointRestore = dedicated.indexOf("uses: actions/cache/restore@v4");
const realDiagnostic = dedicated.indexOf("id: real-diagnostic");
const checkpointSave = dedicated.indexOf("uses: actions/cache/save@v4");
const completeGate = dedicated.indexOf("- name: Require complete real diagnostic");
assert.ok(
  checkpointRestore > dedicated.indexOf(restore) &&
    checkpointRestore < dedicated.indexOf(fixture) &&
    realDiagnostic > dedicated.indexOf(contract) &&
    checkpointSave > realDiagnostic &&
    completeGate > checkpointSave,
  "専用PR診断はpartial input cacheを復元し、保存後に全件完了を必須化する",
);
assert.ok(
  dedicated.includes("path: data/stats/local-water-v2-post-adoption-input-cache.json") &&
    dedicated.split("${{ github.run_id }}-${{ github.run_attempt }}").length - 1 === 2 &&
    dedicated.includes("github.run_attempt") &&
    dedicated.includes("hashFiles('api/race.js', 'api/_parser.js', 'api/_original-exhibition.js')") &&
    /id: real-diagnostic[\s\S]*?continue-on-error: true[\s\S]*?timeout 300s node scripts\/monitor-local-water-v2-post-adoption\.js/.test(
      dedicated,
    ) &&
    /if: always\(\) && steps\.real-diagnostic\.outcome != 'success'[\s\S]*?exit 1/.test(
      dedicated,
    ),
  "一時的な公式取得失敗は次attemptへ継続できるが最終PR判定ではfail-closedにする",
);
for (const forbidden of [
  "contents: write",
  "git add",
  "git commit",
  "git pull",
  "git push",
  "prepare-daily-prediction-git-save",
  "chappy-main-data-writers",
]) {
  assert.ok(
    !dedicated.includes(forbidden),
    `専用workflowはwriter操作を持たない: ${forbidden}`,
  );
}

const workflowFiles = fs
  .readdirSync(workflowDir)
  .filter(name => /\.ya?ml$/.test(name));
const liveBuilderLines = workflow =>
  workflow.split("\n").filter(line =>
    new RegExp(`\\bnode\\s+${builderPath.replaceAll("/", "\\/")}\\b`).test(line) &&
      !line.includes("node --check"),
  );
const builderOwners = workflowFiles.filter(name =>
  liveBuilderLines(readWorkflow(name)).length > 0,
);
assert.deepEqual(
  builderOwners.sort(),
  [centralName, dedicatedName].sort(),
  "monitor実行経路は中央writerとread-only診断だけ",
);
assert.equal(liveBuilderLines(central).length, 1, "中央のlive monitorは1回だけ");
assert.equal(
  liveBuilderLines(dedicated).length,
  1,
  "専用read-only live monitorは1回だけ",
);
for (const name of workflowFiles) {
  const workflow = readWorkflow(name);
  if (name !== centralName && liveBuilderLines(workflow).length) {
    for (const forbidden of [
      "contents: write",
      "git add",
      "git commit",
      "git pull",
      "git push",
      "chappy-main-data-writers",
    ]) {
      assert.ok(
        !workflow.includes(forbidden),
        `非中央monitor実行経路はwriter操作を持たない: ${name} / ${forbidden}`,
      );
    }
  }
  if (name === centralName) continue;
  assert.ok(
    !/git add[^\n]*local-water-v2-post-adoption-monitor\.json/.test(workflow),
    `専用成果物への独立writerを禁止する: ${name}`,
  );
  assert.ok(
    !workflow.includes("Refresh Local Water V2 post-adoption monitor"),
    `旧writer commitを禁止する: ${name}`,
  );
}

assert.ok(
  /const OUT = path\.join\([\s\S]*?"data",\s*"stats",\s*"local-water-v2-post-adoption-monitor\.json"/.test(
    monitorSource,
  ),
  "monitor成果物はdata/stats配下の固定名を使う",
);
assert.ok(
  monitorSource.indexOf("const baseAiCore = global.ChappyAICore") <
    monitorSource.indexOf('require("../js/local-water-v2-tiebreak")'),
  "未適用base coreを本番wrapper読込前に保持する",
);
assert.ok(
  monitorSource.indexOf(
    "persistInputCacheProgress(activeInputCacheProgress, generatedAt)",
  ) <
      monitorSource.indexOf(
        "assertCompleteRun(failures, total.sourceRaces, source.length)",
      ) &&
    monitorSource.indexOf(
      "assertCompleteRun(failures, total.sourceRaces, source.length)",
    ) < monitorSource.indexOf("writeJsonAtomic(OUT, report)"),
  "部分cacheは再開用に保存するが不完全な評価reportは保存しない",
);
assert.ok(
  monitorSource.includes("const loadedCache = loadInputCache()") &&
    monitorSource.includes("sanitizeInputCache(loadedCache, source)") &&
    monitorSource.includes("const completed = await completeApi(race, cacheRows)") &&
    monitorSource.includes("inputFingerprint: INPUT_CACHE_FINGERPRINT"),
  "現在候補と一致する検証済み公式入力だけをrace単位cacheから再利用する",
);
assert.ok(
  monitorSource.includes("const trend = core.buildRaceTrendEvaluation(prepared)") &&
    monitorSource.includes("if (trend?.ready !== true)") &&
    monitorSource.includes("official production input is not ready"),
  "cache/live入力は本番と同じrace trend ready条件を満たす場合だけ受理する",
);
assert.ok(
  monitorSource.includes("let activeInputCacheProgress = null") &&
    monitorSource.includes("if (!progress?.dirty) return null") &&
    monitorSource.includes("persistInputCacheProgress();") &&
    /process\.once\(signal, \(\) => \{[\s\S]*?persistInputCacheProgress\(\);[\s\S]*?process\.exit\(exitCode\)/.test(
      monitorSource,
    ),
  "fingerprint更新後の長時間再取得は新規進捗時だけ保存し、SIGTERMでも次回再開する",
);
assert.ok(
  monitorSource.includes("fs.writeFileSync(temporary") &&
    monitorSource.includes("fs.renameSync(temporary, file)") &&
    !monitorSource.includes("fs.writeFileSync(OUT") &&
    !monitorSource.includes("fs.writeFileSync(INPUT_CACHE"),
  "reportとinput cacheは一時ファイルからatomic renameで保存する",
);
assert.ok(
  /const INPUT_CACHE = path\.join\([\s\S]*?"data",\s*"stats",\s*"local-water-v2-post-adoption-input-cache\.json"/.test(
    monitorSource,
  ),
  "公式入力cacheはdata/stats配下の固定名を使う",
);
assert.ok(
  !monitorSource.includes('require("./collect-predictions")') &&
    monitorSource.includes('require("./venue-race-history")'),
  "monitorは副作用の大きいcollector bootstrapを読まない",
);
assert.ok(
  !collectStep.includes("build-local-water-v2-post-adoption-monitor.js"),
  "別指標の298R legacy checkerを中央収集へ入れない",
);
assert.ok(
  predictionCollector.includes('- "scripts/venue-race-history.js"') &&
    predictionCollector.includes("node --check scripts/venue-race-history.js"),
  "予想collectorも共有venue history helper変更を検証する",
);
for (const [name, workflow] of [
  [charterName, charter],
  [racerHistoryName, racerHistory],
]) {
  assert.ok(
    workflow.split('- "scripts/venue-race-history.js"').length - 1 >= 2 &&
      workflow.includes("node --check scripts/venue-race-history.js"),
    `共有venue history helperをPR・mainで検証する: ${name}`,
  );
}

console.log("Local/Water V2 post-adoption monitor writer contract: passed");
