"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const preflight = require("./preflight-connections");

const root = path.resolve(__dirname, "..");
const operationsPath = path.join(root, "docs", "OPERATIONS.md");
const operations = fs.readFileSync(operationsPath, "utf8");

assert.equal(
  preflight.checkRepositoryShape().ok,
  true,
  "必要なリポジトリ構成を確認できる"
);
assert.equal(
  preflight.checkOperationsDocument().ok,
  true,
  "運用手順に正本・本番・マージ方針がある"
);
assert.equal(
  preflight.normalizeRepository(
    "git@github.com:takechanman12250711-oss/chappy-boatrace-ai.git"
  ),
  "takechanman12250711-oss/chappy-boatrace-ai",
  "SSH形式のremoteを正規化できる"
);
assert.equal(
  preflight.normalizeRepository(
    "https://github.com/takechanman12250711-oss/chappy-boatrace-ai.git"
  ),
  "takechanman12250711-oss/chappy-boatrace-ai",
  "HTTPS形式のremoteを正規化できる"
);
assert.match(
  operations,
  /GitHub `main`/,
  "mainを正本として明記する"
);
assert.match(
  operations,
  /GitHub Pages/,
  "フロント本番をGitHub Pagesとして明記する"
);
assert.match(
  operations,
  /データ取得API：Vercel/,
  "APIをVercelとして明記する"
);
assert.match(
  operations,
  /承認後にDraft解除し、squashマージ/,
  "承認後のマージ手順を固定する"
);
assert.ok(
  !operations.includes("Vercelをフロント本番正本として扱う"),
  "古いVercelフロントを正本に戻さない"
);

console.log("connection preflight regression: passed");
