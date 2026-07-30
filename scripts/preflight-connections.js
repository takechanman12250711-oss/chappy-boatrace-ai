"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

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

function normalizeRepository(value) {
  return String(value || "")
    .trim()
    .replace(/^git@github\.com:/, "")
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/^ssh:\/\/git@github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/^\/+|\/+$/g, "");
}

function readOriginRepository() {
  try {
    const origin = execFileSync(
      "git",
      ["config", "--get", "remote.origin.url"],
      {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      }
    );
    return normalizeRepository(origin);
  } catch {
    return "";
  }
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
  const ciRepository = normalizeRepository(
    process.env.GITHUB_REPOSITORY || ""
  );
  const originRepository = readOriginRepository();
  const actualRepository = ciRepository || originRepository;
  const expectedRepository = normalizeRepository(EXPECTED_REPOSITORY);

  return {
    ok: Boolean(actualRepository) && actualRepository === expectedRepository,
    label: "git-context",
    detail: !actualRepository
      ? "GitHub Actionsまたはremote.origin.urlを確認できない"
      : actualRepository !== expectedRepository
        ? `対象外リポジトリ: ${actualRepository}`
        : ciRepository
          ? `GitHub Actions: ${actualRepository}`
          : `remote.origin: ${actualRepository}`
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
  normalizeRepository,
  readOriginRepository,
  checkRepositoryShape,
  checkOperationsDocument,
  checkGitMetadata,
  run
};
