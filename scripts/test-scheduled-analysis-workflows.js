"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const theoryPerformance = require("../js/theory-performance-report");
const learningPipeline = require("./build-learning-analysis-pipeline");

const root = path.resolve(__dirname, "..");

function readWorkflow(fileName) {
  return fs.readFileSync(
    path.join(root, ".github", "workflows", fileName),
    "utf8"
  );
}

function indentation(line) {
  return line.length - line.trimStart().length;
}

function stepRunLines(workflow, stepName) {
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex(
    line => line.trim() === `- name: ${stepName}`
  );
  assert.ok(start >= 0, `${stepName} step がありません`);

  const stepIndent = indentation(lines[start]);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      line.trim().startsWith("- ") &&
      indentation(line) === stepIndent
    ) {
      end = index;
      break;
    }
  }

  const step = lines.slice(start, end);
  const runIndex = step.findIndex(line => line.trim() === "run: |");
  assert.ok(runIndex >= 0, `${stepName} step にrun blockがありません`);
  const runIndent = indentation(step[runIndex]);

  return step
    .slice(runIndex + 1)
    .filter(line => line.trim() && indentation(line) > runIndent)
    .map(line => line.trim());
}

function commandArguments(lines, scriptPath) {
  const prefix = `node ${scriptPath}`;
  const command = lines.find(
    line => line === prefix || line.startsWith(`${prefix} `)
  );
  assert.ok(command, `${scriptPath} の実行コマンドがありません`);
  return {
    command,
    arguments: command.slice(prefix.length).trim().split(/\s+/).filter(Boolean)
  };
}

function run(command, args, cwd) {
  return childProcess.execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runGit(cwd, ...args) {
  return run("git", args, cwd).trim();
}

function assertReportPersistenceBehavior(commitLines, reportPath, workflowFile) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "chappy-report-workflow-")
  );
  const remote = path.join(temporaryRoot, "remote.git");
  const checkout = path.join(temporaryRoot, "checkout");

  try {
    fs.mkdirSync(checkout);
    run("git", ["init", "--bare", remote], temporaryRoot);
    runGit(checkout, "init");
    runGit(checkout, "checkout", "-b", "main");
    runGit(checkout, "config", "user.name", "workflow-test");
    runGit(checkout, "config", "user.email", "workflow-test@example.invalid");
    fs.writeFileSync(path.join(checkout, "seed.txt"), "seed\n", "utf8");
    runGit(checkout, "add", "--", "seed.txt");
    runGit(checkout, "commit", "-m", "Seed test repository");
    runGit(checkout, "remote", "add", "origin", remote);
    runGit(checkout, "push", "-u", "origin", "main");

    const report = path.join(checkout, ...reportPath.split("/"));
    fs.mkdirSync(path.dirname(report), { recursive: true });
    const script = commitLines.join("\n");

    fs.writeFileSync(report, "new report\n", "utf8");
    run("bash", ["-e", "-c", script], checkout);
    assert.equal(
      runGit(checkout, "rev-list", "--count", "HEAD"),
      "2",
      `${workflowFile}で新規レポートをcommitする`
    );
    assert.equal(
      runGit(temporaryRoot, "--git-dir", remote, "show", `main:${reportPath}`),
      "new report",
      `${workflowFile}で新規レポートをpushする`
    );

    fs.writeFileSync(report, "updated report\n", "utf8");
    run("bash", ["-e", "-c", script], checkout);
    assert.equal(
      runGit(checkout, "rev-list", "--count", "HEAD"),
      "3",
      `${workflowFile}で更新レポートをcommitする`
    );
    assert.equal(
      runGit(temporaryRoot, "--git-dir", remote, "show", `main:${reportPath}`),
      "updated report",
      `${workflowFile}で更新レポートをpushする`
    );

    const unchangedOutput = run("bash", ["-e", "-c", script], checkout);
    assert.match(
      unchangedOutput,
      /No report changes/,
      `${workflowFile}で同一内容を変更なしと判定する`
    );
    assert.equal(
      runGit(checkout, "rev-list", "--count", "HEAD"),
      "3",
      `${workflowFile}で同一内容をcommitしない`
    );
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function assertGeneratedReportPersistence({
  workflowFile,
  buildCommand,
  reportPath
}) {
  const workflow = readWorkflow(workflowFile);
  assert.ok(
    workflow.includes(`run: ${buildCommand} --output ${reportPath}`),
    `${workflowFile}の生成先を${reportPath}に固定する`
  );

  const commitLines = stepRunLines(workflow, "Commit report when changed");
  const addCommand = `git add -- ${reportPath}`;
  const stagedDiffCommand =
    `if git diff --cached --quiet -- ${reportPath}; then`;
  const addIndex = commitLines.indexOf(addCommand);
  const diffIndex = commitLines.indexOf(stagedDiffCommand);
  const commitIndex = commitLines.findIndex(line => line.startsWith("git commit "));
  const pushIndex = commitLines.findIndex(line => line.startsWith("git push"));

  assert.ok(addIndex >= 0, `${workflowFile}で生成レポートをstageする`);
  assert.ok(
    diffIndex >= 0,
    `${workflowFile}で新規・更新レポートをstaged diffから判定する`
  );
  assert.ok(
    addIndex < diffIndex,
    `${workflowFile}で変更判定より先に生成レポートをstageする`
  );
  assert.ok(
    diffIndex < commitIndex,
    `${workflowFile}で変更判定後にレポートをcommitする`
  );
  assert.ok(
    commitIndex < pushIndex,
    `${workflowFile}でcommit後にレポートをpushする`
  );
  assert.equal(
    commitLines.filter(line => line === addCommand).length,
    1,
    `${workflowFile}で生成レポートを1回だけstageする`
  );
  assert.ok(
    !commitLines.includes(`if git diff --quiet -- ${reportPath}; then`),
    `${workflowFile}で未追跡ファイルを無視する旧判定を使わない`
  );
  assertReportPersistenceBehavior(commitLines, reportPath, workflowFile);
}

assertGeneratedReportPersistence({
  workflowFile: "analyze-reference-tags.yml",
  buildCommand: "node scripts/analyze-reference-tag-effectiveness.js",
  reportPath: "data/analysis/reference-tag-effectiveness.json"
});

[
  {
    workflowFile: "analyze-reference-tags.yml",
    analyzerTest: "node scripts/test-reference-tag-effectiveness.js"
  }
].forEach(({ workflowFile, analyzerTest }) => {
  const testLines = stepRunLines(readWorkflow(workflowFile), "Test analyzer");
  assert.equal(
    testLines.filter(line => line === analyzerTest).length,
    1,
    `${workflowFile}で${analyzerTest}を1回だけ実行する`
  );
  assert.equal(
    testLines.includes("node scripts/test-analysis-input-contract.js"),
    false,
    `${workflowFile}で保存済み成果物の整合検査を生成前に実行しない`
  );

  const workflow = readWorkflow(workflowFile);
  const buildIndex = workflow.indexOf("- name: Build effectiveness report");
  const verifyIndex = workflow.indexOf("- name: Verify built report");
  const commitIndex = workflow.indexOf("- name: Commit report when changed");
  const verifyLines = stepRunLines(workflow, "Verify built report");
  assert.ok(
    buildIndex < verifyIndex && verifyIndex < commitIndex,
    `${workflowFile}で生成後・保存前に成果物整合を確認する`
  );
  assert.deepStrictEqual(
    verifyLines,
    ["node scripts/test-analysis-input-contract.js"],
    `${workflowFile}で生成済み成果物を1回だけ検証する`
  );
});

const predictionGapWorkflow = readWorkflow("prediction-gap-report.yml");
const buildReportLines = stepRunLines(predictionGapWorkflow, "Build report");
const improvementReviewCommand = commandArguments(
  buildReportLines,
  "scripts/build-improvement-review.js"
);
const predictionGapCommand = commandArguments(
  buildReportLines,
  "scripts/build-prediction-gap-report.js"
);
const outputArgument = improvementReviewCommand.arguments.find(
  argument => argument.startsWith("--output=")
);

assert.ok(outputArgument, "improvement reviewの出力先が未指定です");
assert.equal(
  path.posix.normalize(outputArgument.slice("--output=".length)),
  "data/stats/improvement-review.json",
  "prediction gapが読むdata/statsへimprovement reviewを生成する"
);
assert.ok(
  buildReportLines.indexOf(improvementReviewCommand.command) <
    buildReportLines.indexOf(predictionGapCommand.command),
  "improvement review生成後にprediction gapを生成する"
);

const saveReportLines = stepRunLines(predictionGapWorkflow, "Save report");
const gitAdd = saveReportLines.find(line => line.startsWith("git add "));
assert.ok(gitAdd, "Save reportにgit addがありません");
assert.ok(
  gitAdd.split(/\s+/).slice(2).includes("data/stats/improvement-review.json"),
  "生成したimprovement reviewを保存対象に含める"
);

const learningPipelineWorkflow = readWorkflow(
  "build-learning-analysis-pipeline.yml"
);
const learningVerificationLines = stepRunLines(
  learningPipelineWorkflow,
  "Verify pipeline"
);
[
  "scripts/test-local-water-theory-tag.js",
  "scripts/test-theory-zero-evidence-diagnostics.js",
  "scripts/test-theory-improvement-approval-gate.js",
  "scripts/test-theory-candidate-branch-analysis-phase9.js"
].forEach(scriptPath => {
  const command = `node ${scriptPath}`;
  assert.equal(
    learningVerificationLines.filter(line => line === command).length,
    1,
    `${scriptPath}を定期学習検査で1回だけ実行する`
  );
});
assert.equal(
  learningVerificationLines.filter(
    line => line === "node scripts/test-reference-tag-effectiveness.js"
  ).length,
  1,
  "参照タグ分析の単体回帰を学習パイプライン生成前に1回実行する"
);
assert.equal(
  learningPipeline.steps.filter(
    file => file === "analyze-reference-tag-effectiveness.js"
  ).length,
  1,
  "参照タグ成果物を固定順パイプラインで1回だけ生成する"
);
assert.ok(
  learningPipeline.steps.indexOf("build-theory-performance-report.js") <
    learningPipeline.steps.indexOf("analyze-reference-tag-effectiveness.js") &&
    learningPipeline.steps.indexOf("analyze-reference-tag-effectiveness.js") <
    learningPipeline.steps.indexOf("build-theory-evidence-coverage-phase7.js"),
  "公式母集団の理論成績生成直後に参照タグ成果物を生成する"
);
assert.equal(
  learningPipeline.steps.filter(
    file => file === "build-theory-candidate-branch-analysis-phase9.js"
  ).length,
  1,
  "Phase9候補枝分析を固定順パイプラインで1回だけ生成する"
);
assert.ok(
  learningPipeline.steps.indexOf("build-theory-improvement-proposal-phase9.js") <
    learningPipeline.steps.indexOf("build-theory-candidate-branch-analysis-phase9.js") &&
    learningPipeline.steps.indexOf("build-theory-candidate-branch-analysis-phase9.js") <
    learningPipeline.steps.indexOf("build-theory-ab-phase10.js"),
  "Phase9提案後・Phase10承認ゲート前に候補枝分析を生成する"
);
const learningCohortVerificationLines = stepRunLines(
  learningPipelineWorkflow,
  "Verify official analysis cohorts"
);
assert.deepEqual(
  learningCohortVerificationLines,
  [
    "node scripts/test-improvement-proposal-input-contract.js",
    "node scripts/test-analysis-input-contract.js",
    "node scripts/test-theory-candidate-branch-analysis-phase9-artifact.js"
  ],
  "固定順生成後に改善提案と参照タグの公式母集団を検証する"
);
const learningBuildIndex = learningPipelineWorkflow.indexOf(
  "- name: Build in fixed order"
);
const learningCohortVerifyIndex = learningPipelineWorkflow.indexOf(
  "- name: Verify official analysis cohorts"
);
assert.ok(
  learningBuildIndex < learningCohortVerifyIndex,
  "read-only学習検証でも固定順生成後に公式母集団を検証する"
);
assert.ok(
  !learningPipelineWorkflow.includes("git push origin main"),
  "結果後の学習パイプライン検証はmainへ重複書き込みしない"
);
assert.ok(
  readWorkflow("collect-results.yml").includes(
    "git add data/results data/stats data/analysis/reference-tag-effectiveness.json"
  ),
  "中央結果writerが参照タグ成果物を同じcommitへstageする"
);

const referenceWorkflow = readWorkflow("analyze-reference-tags.yml");
const referenceRestoreIndex = referenceWorkflow.indexOf(
  "- name: Restore canonical prediction sources"
);
const referenceBuildIndex = referenceWorkflow.indexOf(
  "- name: Build effectiveness report"
);
const referenceVerifyIndex = referenceWorkflow.indexOf(
  "- name: Verify built report"
);
const referencePrepareIndex = referenceWorkflow.indexOf(
  "- name: Restore Git-safe prediction sources"
);
const referenceCommitStepIndex = referenceWorkflow.indexOf(
  "- name: Commit report when changed"
);
assert.ok(
  referenceRestoreIndex >= 0 &&
    referenceRestoreIndex < referenceBuildIndex &&
    referenceBuildIndex < referenceVerifyIndex &&
    referenceVerifyIndex < referencePrepareIndex &&
    referencePrepareIndex < referenceCommitStepIndex,
  "参照タグ定期writerは正本復元後に生成・検証し、Git-safeへ戻してから保存する"
);
assert.deepEqual(
  stepRunLines(referenceWorkflow, "Restore canonical prediction sources"),
  ["node scripts/restore-daily-prediction-source.js --all"],
  "参照タグ定期writerが全圧縮正本を復元する"
);
assert.deepEqual(
  stepRunLines(referenceWorkflow, "Restore Git-safe prediction sources"),
  ["node scripts/prepare-daily-prediction-git-save.js --all"],
  "参照タグ定期writerが復元した大容量正本をcommit対象から戻す"
);
assert.ok(
  referenceWorkflow.includes("group: chappy-main-data-writers") &&
    referenceWorkflow.includes("queue: max") &&
    referenceWorkflow.includes("cancel-in-progress: false"),
  "参照タグの定期writerをmain writer共有レーンで直列化する"
);
assert.match(
  referenceWorkflow,
  /uses: actions\/checkout@v4\s+with:\s+ref: main\s+fetch-depth: 0/,
  "参照タグの定期writerは最新mainを完全履歴でcheckoutする"
);
const referenceCommitLines = stepRunLines(
  referenceWorkflow,
  "Commit report when changed"
);
const referenceCommitIndex = referenceCommitLines.findIndex(line =>
  line.startsWith("git commit ")
);
const referencePullIndex = referenceCommitLines.indexOf(
  "git pull --rebase origin main"
);
const referencePushIndex = referenceCommitLines.indexOf("git push origin main");
assert.ok(
  referenceCommitIndex < referencePullIndex &&
    referencePullIndex < referencePushIndex,
  "参照タグの定期writerはcommit後に最新mainへrebaseして明示pushする"
);
const collectResultsWorkflow = readWorkflow("collect-results.yml");
[
  ".github/workflows/analyze-reference-tags.yml",
  ".github/workflows/build-learning-analysis-pipeline.yml",
  "scripts/analyze-reference-tag-effectiveness.js",
  "scripts/test-reference-tag-effectiveness.js",
  "scripts/test-analysis-input-contract.js",
  "scripts/build-learning-analysis-pipeline.js",
  "js/theory-candidate-branch-analysis-phase9.js",
  "scripts/build-theory-candidate-branch-analysis-phase9.js",
  "scripts/test-theory-candidate-branch-analysis-phase9.js",
  "scripts/test-theory-candidate-branch-analysis-phase9-artifact.js"
].forEach(workflowPath => {
  assert.ok(
    collectResultsWorkflow.includes(`- "${workflowPath}"`),
    `${workflowPath}の変更後に結果収集から学習パイプラインを起動する`
  );
});
const safetyGuard = stepRunLines(
  learningPipelineWorkflow,
  "Verify generated safety flags"
).join("\n");
const guardedVersions = [
  ...safetyGuard.matchAll(/perf\.version\s*!==\s*(['"])([^'"]+)\1/g)
].map(match => match[2]);
const generatedVersion = theoryPerformance.build([]).version;

assert.deepEqual(
  guardedVersions,
  [generatedVersion],
  "workflowの理論別成績version guardを生成コードと一致させる"
);

const phase6Workflow = readWorkflow("check-phase6-integration.yml");
[
  '.github/workflows/analyze-reference-tags.yml',
  '.github/workflows/collect-results.yml',
  'scripts/build-learning-analysis-pipeline.js',
  'scripts/analysis-input-contract.js',
  'scripts/test-analysis-input-contract.js'
].forEach(workflowPath => {
  assert.ok(
    phase6Workflow.includes(`- "${workflowPath}"`),
    `${workflowPath}の変更でもworkflow契約テストを起動する`
  );
});
assert.equal(
  phase6Workflow.includes("analyze-hiyori-official"),
  false,
  "削除した日和直接比較WorkflowをCIから参照しない"
);
assert.ok(
  phase6Workflow.includes('- "js/theory-performance-report.js"'),
  "理論別成績のversion更新でもworkflow契約テストを起動する"
);

console.log("scheduled analysis workflow regressions: passed");
