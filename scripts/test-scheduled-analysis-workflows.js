"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const theoryPerformance = require("../js/theory-performance-report");

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
  "scripts/test-theory-improvement-approval-gate.js"
].forEach(scriptPath => {
  const command = `node ${scriptPath}`;
  assert.equal(
    learningVerificationLines.filter(line => line === command).length,
    1,
    `${scriptPath}を定期学習検査で1回だけ実行する`
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
assert.ok(
  phase6Workflow.includes('- "js/theory-performance-report.js"'),
  "理論別成績のversion更新でもworkflow契約テストを起動する"
);

console.log("scheduled analysis workflow regressions: passed");
