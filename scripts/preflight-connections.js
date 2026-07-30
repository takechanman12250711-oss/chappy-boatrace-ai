"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const REQUIRED_PATHS = [
  "index.html",
  "js",
  "api",
  ".github/workflows",
  "docs/OPERATIONS.md"
];

const EXPECTED_REPOSITORY =
  process.env.CHAPPY_REPOSITORY ||
  "takechanman12250711-oss/chappy-boatrace-ai";
const EXPECTED_PAGES_URL =
  process.env.CHAPPY_PAGES_URL ||
  "https://takechanman12250711-oss.github.io/chappy-boatrace-ai/";

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function checkRepositoryShape() {
  const missing = REQUIRED_PATHS.filter((item) => !exists(item));
  return {
    ok: missing.length === 0,
    label: "repository-shape",
    detail: missing.length
      ? `不足: ${missing.join(", ")}`
      : "必要な構成を確認"
  };
}

function checkOperationsDocument() {
  if (!exists("docs/OPERATIONS.md")) {
    return {
      ok: false,
      label: "operations-document",
      detail: "docs/OPERATIONS.md がない"
    };
  }

  const text = readText("docs/OPERATIONS.md");
  const required = [
    EXPECTED_REPOSITORY,
    EXPECTED_PAGES_URL,
    "GitHub Pages",
    "Vercel",
    "squashマージ"
  ];
  const missing = required.filter((value) => !text.includes(value));

  return {
    ok: missing.length === 0,
    label: "operations-document",
    detail: missing.length
      ? `記載不足: ${missing.join(", ")}`
      : "正本・本番構成・マージ手順を確認"
  };
}

function checkGitMetadata() {
  const gitDir = path.join(ROOT, ".git");
  const hasGit = fs.existsSync(gitDir);
  const ciRepository = String(process.env.GITHUB_REPOSITORY || "");
  const repositoryMatches =
    !ciRepository || ciRepository === EXPECTED_REPOSITORY;

  return {
    ok: (hasGit || Boolean(ciRepository)) && repositoryMatches,
    label: "git-context",
    detail: !repositoryMatches
      ? `対象外リポジトリ: ${ciRepository}`
      : hasGit
        ? "ローカルGit作業ツリーを確認"
        : ciRepository
          ? `GitHub Actions: ${ciRepository}`
          : "Git情報を確認できない"
  };
}

function run() {
  const checks = [
    checkRepositoryShape(),
    checkOperationsDocument(),
    checkGitMetadata()
  ];
  const failed = checks.filter((check) => !check.ok);

  checks.forEach((check) => {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.label}: ${check.detail}`);
  });

  if (failed.length) {
    console.error(`preflight failed: ${failed.length} check(s)`);
    process.exitCode = 1;
    return { ok: false, checks };
  }

  console.log("preflight passed");
  return { ok: true, checks };
}

if (require.main === module) {
  run();
}

module.exports = {
  checkRepositoryShape,
  checkOperationsDocument,
  checkGitMetadata,
  run
};
