"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const {
  execFileSync
} = require("node:child_process");
const archiveApi = require(
  "./daily-prediction-source-archive"
);
const {
  restorePredictionSources
} = require(
  "./restore-daily-prediction-source"
);
const {
  preparePredictionGitSave,
  rawSaveLimitFromEnv
} = require(
  "./prepare-daily-prediction-git-save"
);

function git(rootDirectory, args) {
  return execFileSync(
    "git",
    args,
    {
      cwd: rootDirectory,
      encoding: "utf8"
    }
  );
}

assert.equal(
  archiveApi.getJstDate(
    new Date("2026-08-14T15:30:00.000Z")
  ),
  "20260815"
);
assert.equal(
  archiveApi.resolveTargetDate({
    argv: [],
    env: { COLLECT_DATE: "2026/08/16" },
    now: new Date("2026-08-14T15:30:00.000Z")
  }),
  "20260816"
);
assert.equal(
  rawSaveLimitFromEnv({
    DAILY_PREDICTION_RAW_SAVE_LIMIT_BYTES:
      "2048"
  }),
  2048
);
assert.throws(
  () => rawSaveLimitFromEnv({
    DAILY_PREDICTION_RAW_SAVE_LIMIT_BYTES:
      String(
        archiveApi.GIT_BLOB_LIMIT_BYTES
      )
  }),
  /Git保存上限/
);

const temporaryRoot = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "chappy-daily-source-archive-"
  )
);

try {
  const predictionDirectory = path.join(
    temporaryRoot,
    "data",
    "predictions"
  );
  const summaryDirectory = path.join(
    predictionDirectory,
    "summaries"
  );
  fs.mkdirSync(
    summaryDirectory,
    { recursive: true }
  );

  git(temporaryRoot, ["init", "-b", "main"]);
  git(temporaryRoot, [
    "config",
    "user.name",
    "archive-test"
  ]);
  git(temporaryRoot, [
    "config",
    "user.email",
    "archive-test@example.com"
  ]);

  const date = "20260815";
  const sourcePath =
    archiveApi.sourcePathFor(
      temporaryRoot,
      date
    );
  const basePayload = {
    schemaVersion: 3,
    date,
    updatedAt:
      "2026-08-15T08:00:00.000Z",
    runs: [],
    predictions: [],
    verificationPredictions: [],
    shadowV2Predictions: []
  };
  const baseRaw =
    `${JSON.stringify(basePayload)}\n`;
  fs.writeFileSync(
    sourcePath,
    baseRaw,
    "utf8"
  );
  git(temporaryRoot, ["add", "."]);
  git(temporaryRoot, [
    "commit",
    "-m",
    "base prediction source"
  ]);

  const latestPayload = {
    ...basePayload,
    updatedAt:
      "2026-08-15T08:30:00.000Z",
    runs: [{
      runKey: "latest-run",
      checkedAt:
        "2026-08-15T08:30:00.000Z",
      threshold: 70,
      collectionHealth: {
        v2: {
          evaluatedCount: 6,
          readyCount: 1,
          qualifiedCount: 1,
          notReadyCount: 5,
          readinessRate: 16.7,
          missingReasons: [{
            code: "data.exhibitionST",
            label: "6艇の展示ST",
            count: 5
          }]
        }
      }
    }],
    verificationPredictions: [{
      raceKey: "20260815-12-7",
      completeEvidence:
        "展開・コース・ST・展示・残し拾い・当地水面・技量・モーター".repeat(
          500
        )
    }]
  };
  const latestRaw =
    `${JSON.stringify(latestPayload)}\n`;
  assert.ok(
    Buffer.byteLength(latestRaw) > 1024,
    "テスト原本を強制archive閾値より大きくする"
  );
  fs.writeFileSync(
    sourcePath,
    latestRaw,
    "utf8"
  );
  const summaryPath = path.join(
    summaryDirectory,
    `${date}.json`
  );
  fs.writeFileSync(
    summaryPath,
    `${JSON.stringify({
      schemaVersion: 1,
      date,
      runs: [latestPayload.runs[0]],
      predictions: []
    })}\n`,
    "utf8"
  );

  const prepared =
    preparePredictionGitSave({
      rootDirectory: temporaryRoot,
      date,
      rawSaveLimitBytes: 1024,
      argv: [],
      env: {}
    });
  assert.equal(
    prepared.archivedCount,
    1
  );
  assert.equal(
    prepared.rawGitSafeCount,
    0
  );

  const archivePath =
    archiveApi.archivePathFor(
      temporaryRoot,
      date
    );
  const metadataPath =
    archiveApi.metadataPathFor(
      temporaryRoot,
      date
    );
  assert.ok(fs.existsSync(archivePath));
  assert.ok(fs.existsSync(metadataPath));

  const metadata = JSON.parse(
    fs.readFileSync(
      metadataPath,
      "utf8"
    )
  );
  assert.equal(
    metadata.sourceBytes,
    Buffer.byteLength(latestRaw)
  );
  assert.equal(
    metadata.sourceSha256,
    archiveApi.sha256(
      Buffer.from(latestRaw)
    )
  );
  assert.equal(
    zlib.gunzipSync(
      fs.readFileSync(archivePath)
    ).toString("utf8"),
    latestRaw,
    "圧縮正本から全JSON証拠を欠落なく復元できる"
  );

  const staged = git(
    temporaryRoot,
    [
      "diff",
      "--cached",
      "--name-only"
    ]
  ).trim().split("\n").filter(Boolean);
  assert.ok(
    staged.includes(
      `data/predictions/source-archives/${date}.json.gz`
    )
  );
  assert.ok(
    staged.includes(
      `data/predictions/source-archives/${date}.meta.json`
    )
  );
  assert.ok(
    staged.includes(
      `data/predictions/summaries/${date}.json`
    ),
    "最新collectionHealth.v2要約をstagingする"
  );
  assert.ok(
    !staged.includes(
      `data/predictions/${date}.json`
    ),
    "GitHub上限を超える生JSONはcommit対象から外す"
  );
  assert.equal(
    fs.readFileSync(
      sourcePath,
      "utf8"
    ),
    baseRaw,
    "commit前に追跡済み生JSONをHEAD版へ戻して作業ツリーを清潔にする"
  );

  const restored =
    restorePredictionSources({
      rootDirectory: temporaryRoot,
      date,
      argv: [],
      env: {}
    });
  assert.equal(
    restored[0].status,
    "restored"
  );
  assert.equal(
    fs.readFileSync(
      sourcePath,
      "utf8"
    ),
    latestRaw,
    "次回収集前に圧縮正本から最新日次原本を完全復元する"
  );

  const archiveBeforeCorruption =
    fs.readFileSync(archivePath);
  const corrupted = Buffer.from(
    archiveBeforeCorruption
  );
  corrupted[
    corrupted.length - 1
  ] ^= 0xff;
  fs.writeFileSync(
    archivePath,
    corrupted
  );
  assert.throws(
    () => archiveApi.restorePredictionSource({
      rootDirectory: temporaryRoot,
      date
    }),
    /fingerprint/
  );
  fs.writeFileSync(
    archivePath,
    archiveBeforeCorruption
  );

  const safeDate = "20260816";
  const safeSourcePath =
    archiveApi.sourcePathFor(
      temporaryRoot,
      safeDate
    );
  fs.writeFileSync(
    safeSourcePath,
    `${JSON.stringify({
      schemaVersion: 3,
      date: safeDate,
      runs: []
    })}\n`,
    "utf8"
  );
  const staleArchivePath =
    archiveApi.archivePathFor(
      temporaryRoot,
      safeDate
    );
  const staleMetadataPath =
    archiveApi.metadataPathFor(
      temporaryRoot,
      safeDate
    );
  fs.mkdirSync(
    path.dirname(staleArchivePath),
    { recursive: true }
  );
  fs.writeFileSync(
    staleArchivePath,
    "stale",
    "utf8"
  );
  fs.writeFileSync(
    staleMetadataPath,
    "{}\n",
    "utf8"
  );
  const safeResult =
    archiveApi.archivePredictionSource({
      rootDirectory: temporaryRoot,
      date: safeDate,
      rawSaveLimitBytes: 1024
    });
  assert.equal(
    safeResult.status,
    "raw-git-safe"
  );
  assert.equal(
    fs.existsSync(staleArchivePath),
    false,
    "生JSONを通常保存できる場合は古い圧縮正本を残さない"
  );
  assert.equal(
    fs.existsSync(staleMetadataPath),
    false
  );
} finally {
  fs.rmSync(
    temporaryRoot,
    {
      recursive: true,
      force: true
    }
  );
}

const repositoryRoot = path.resolve(
  __dirname,
  ".."
);
const workflowFiles = [
  "collect-predictions.yml",
  "collect-frame-rise-fall-shadow-ab.yml",
  "collect-results.yml",
  "build-learning-analysis-pipeline.yml"
].map(name => ({
  name,
  source: fs.readFileSync(
    path.join(
      repositoryRoot,
      ".github",
      "workflows",
      name
    ),
    "utf8"
  )
}));

workflowFiles.forEach(({ name, source }) => {
  assert.ok(
    source.includes(
      "node scripts/restore-daily-prediction-source.js"
    ),
    `${name}は処理前に圧縮正本を復元する`
  );
  if (name !== "build-learning-analysis-pipeline.yml") {
    assert.ok(
      source.includes(
        "node scripts/prepare-daily-prediction-git-save.js"
      ),
      `${name}は保存前にGit上限対応を行う`
    );
  }
});
assert.ok(
  workflowFiles.find(item =>
    item.name === "collect-results.yml"
  ).source.includes(
    "node scripts/restore-daily-prediction-source.js --all"
  ),
  "結果収集は複数日の日次原本を復元する"
);
assert.ok(
  workflowFiles.find(item =>
    item.name === "build-learning-analysis-pipeline.yml"
  ).source.includes("git push origin main") === false,
  "結果後の学習集計はread-only検証として重複保存しない"
);

console.log(
  "日次予想原本archive・Git保存テスト: 合格"
);
