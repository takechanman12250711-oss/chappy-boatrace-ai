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
  cleanupRestoredPredictionSources,
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
  const restoreTemporaryName =
    `.${date}.json.restore-test`;
  fs.writeFileSync(
    path.join(
      predictionDirectory,
      restoreTemporaryName
    ),
    latestRaw,
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
  assert.ok(
    !staged.includes(
      `data/predictions/${restoreTemporaryName}`
    ),
    "原本復元の一時ファイルはcommit対象から外す"
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

  const cleanedTracked =
    cleanupRestoredPredictionSources({
      rootDirectory: temporaryRoot,
      date,
      argv: [],
      env: {}
    });
  assert.equal(
    cleanedTracked.cleanedCount,
    1
  );
  assert.equal(
    cleanedTracked.cleanupResults[0].status,
    "tracked-restored"
  );
  assert.equal(
    fs.readFileSync(
      sourcePath,
      "utf8"
    ),
    baseRaw,
    "診断用に復元した追跡済み原本は再圧縮せずGit正本へ戻す"
  );

  restorePredictionSources({
    rootDirectory: temporaryRoot,
    date,
    argv: [],
    env: {}
  });

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

  const untrackedDate = "20260817";
  const untrackedSourcePath =
    archiveApi.sourcePathFor(
      temporaryRoot,
      untrackedDate
    );
  fs.writeFileSync(
    untrackedSourcePath,
    `${JSON.stringify({
      date: untrackedDate,
      evidence: "untracked".repeat(2000)
    })}\n`,
    "utf8"
  );
  archiveApi.archivePredictionSource({
    rootDirectory: temporaryRoot,
    date: untrackedDate,
    rawSaveLimitBytes: 1024
  });
  const cleanedUntracked =
    cleanupRestoredPredictionSources({
      rootDirectory: temporaryRoot,
      date: untrackedDate,
      argv: [],
      env: {}
    });
  assert.equal(
    cleanedUntracked.cleanupResults[0].status,
    "untracked-removed"
  );
  assert.equal(
    fs.existsSync(untrackedSourcePath),
    false,
    "診断用に復元した未追跡原本は既存archiveを再生成せず除去する"
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

// Exercise staged/unstaged/absent raw sources together. Excluding expanded
// raws from add must keep the old reset/restore and archive-repair behavior.
const stagingRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "chappy-archive-staging-")
);
try {
  const sourcePath = date => archiveApi.sourcePathFor(stagingRoot, date);
  const small = date => `${JSON.stringify({ date, predictions: [] })}\n`;
  const large = date => `${JSON.stringify({
    date,
    predictions: [{ evidence: "preserve".repeat(2000) }]
  })}\n`;
  const write = (date, raw) => fs.writeFileSync(sourcePath(date), raw);
  fs.mkdirSync(path.dirname(sourcePath("20261001")), { recursive: true });
  git(stagingRoot, ["init", "-b", "main"]);
  const trackedDates = [
    "20261001", "20261002", "20261003", "20261006", "20261007", "20261009"
  ];
  trackedDates.forEach(date => write(date, small(date)));
  const indexPath = path.join(stagingRoot, "data/predictions/index.json");
  const hiddenPath = path.join(stagingRoot, "data/predictions/.hidden");
  fs.writeFileSync(indexPath, "frozen index\n");
  fs.writeFileSync(hiddenPath, "hidden file\n");
  git(stagingRoot, ["add", "."]);
  git(stagingRoot, [
    "-c", "user.name=archive-test", "-c", "user.email=archive@example.invalid",
    "commit", "-qm", "base sources"
  ]);
  const largeDates = [
    "20261001", "20261002", "20261003", "20261004", "20261005", "20261009"
  ];
  largeDates.forEach(date => write(date, large(date)));
  git(stagingRoot, ["add", "data/predictions/20261002.json", "data/predictions/20261005.json"]);
  git(stagingRoot, ["rm", "--cached", "-f", "data/predictions/20261003.json"]);
  fs.unlinkSync(sourcePath("20261006"));
  write("20261007", small("20261007").replace("[]", "[1]"));
  write("20261008", small("20261008"));
  archiveApi.archivePredictionSource({
    rootDirectory: stagingRoot, date: "20261009", rawSaveLimitBytes: 1024
  });
  fs.writeFileSync(archiveApi.archivePathFor(stagingRoot, "20261009"), "corrupt archive");
  fs.writeFileSync(indexPath, "must remain unstaged\n");
  fs.writeFileSync(hiddenPath, "must remain unstaged\n");
  const rawBlob = git(stagingRoot, [
    "hash-object", "data/predictions/20261001.json"
  ]).trim();

  const prepared = preparePredictionGitSave({
    rootDirectory: stagingRoot, all: true, rawSaveLimitBytes: 1024
  });
  assert.equal(prepared.archivedCount, 6);
  assert.equal(prepared.rawGitSafeCount, 2);
  assert.equal(prepared.missingCount, 1);
  for (const date of largeDates) {
    assert.equal(
      zlib.gunzipSync(fs.readFileSync(archiveApi.archivePathFor(stagingRoot, date))).toString("utf8"),
      large(date),
      `archive preserves every raw byte: ${date}`
    );
    if (trackedDates.includes(date)) {
      assert.equal(fs.readFileSync(sourcePath(date), "utf8"), small(date));
    } else {
      assert.equal(fs.existsSync(sourcePath(date)), false);
    }
  }
  assert.equal(prepared.archiveResults.find(result => result.date === "20261009").reused, false);
  const stagedPaths = git(stagingRoot, ["diff", "--cached", "--name-only"])
    .trim().split("\n").sort();
  assert.deepEqual(stagedPaths, [
    "data/predictions/20261006.json",
    "data/predictions/20261007.json",
    "data/predictions/20261008.json",
    ...largeDates.flatMap(date => [
      `data/predictions/source-archives/${date}.json.gz`,
      `data/predictions/source-archives/${date}.meta.json`
    ])
  ].sort());
  assert.equal(git(stagingRoot, ["show", ":data/predictions/index.json"]), "frozen index\n");
  assert.equal(git(stagingRoot, ["show", ":data/predictions/.hidden"]), "hidden file\n");
  assert.throws(
    () => execFileSync("git", ["cat-file", "-e", rawBlob], { cwd: stagingRoot, stdio: "pipe" }),
    "validated expanded raw must never be written as a temporary Git blob"
  );

  // A one-date save excludes only that successfully archived date. Other raw
  // paths retain the pre-existing broad-add behavior, even if they are large.
  write("20261010", large("20261010"));
  write("20261011", large("20261011"));
  preparePredictionGitSave({
    rootDirectory: stagingRoot, date: "20261010", rawSaveLimitBytes: 1024
  });
  assert.equal(fs.existsSync(sourcePath("20261010")), false);
  assert.equal(git(stagingRoot, ["show", ":data/predictions/20261011.json"]), large("20261011"));

  const indexBeforeInvalid = git(stagingRoot, ["ls-files", "-s"]);
  write("20261012", "invalid JSON");
  assert.throws(() => preparePredictionGitSave({
    rootDirectory: stagingRoot, date: "20261012", rawSaveLimitBytes: 1024
  }));
  assert.equal(git(stagingRoot, ["ls-files", "-s"]), indexBeforeInvalid);
} finally {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
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
