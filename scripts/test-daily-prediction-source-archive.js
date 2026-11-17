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

// Rebuild the artifact from canonical archives without expanded source writes.
// Only tiny synthetic dates are used; requiring the artifact gate must not run
// the repository's full-data CLI.
const reportBuilder = require("./build-practical-priority-shadow-report");
const reportApi = require("../js/practical-priority-shadow-report");
const priorityApi = require("../js/practical-priority-shadow");
const artifactGate = require("./test-practical-priority-shadow-artifact");
const artifactRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "chappy-read-only-priority-artifact-")
);
try {
  const predictionDirectory = archiveApi.predictionDirectory(artifactRoot);
  const resultDirectory = path.join(artifactRoot, "data", "results");
  const reportPath = path.join(
    artifactRoot, "data", "stats", "practical-priority-shadow-report.json"
  );
  fs.mkdirSync(predictionDirectory, { recursive: true });
  fs.mkdirSync(resultDirectory, { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const dates = ["20260812", "20260815", "20260816", "20260817"];
  assert.ok(dates[0] < reportApi.CONTRACT_START_DATE);
  const generatedAt = "2026-08-18T01:02:03.000Z";
  const row = (date, raceNo) => {
    const day = date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6);
    return {
      raceKey: date + "-01-" + raceNo,
      date,
      deadlineAt: day + "T12:00:00.000Z",
      selectedAt: day + "T11:00:00.000Z",
      practicalPriorityShadow: {
        eligible: true,
        logicFingerprint: priorityApi.LOGIC_FINGERPRINT,
        cohortContractFingerprint: reportApi.CONTRACT_FINGERPRINT,
        sourceSelectionFingerprint: reportApi.REGISTERED_CONTRACT.sourceSelectionFingerprint,
        capturedAt: day + "T11:00:00.000Z",
        sourceCommit: "a".repeat(40),
        baseTickets: ["1-2-3"],
        shadowTickets: ["1-3-2"],
        replacement: {
          addedTicket: "1-3-2", removedTicket: "1-2-3",
          addedPriorityScore: 80, removedPriorityScore: 70
        }
      }
    };
  };
  const payload = (date, raceNo = 1) => ({
    date, predictions: [row(date, raceNo)], verificationPredictions: []
  });
  const raw = value => JSON.stringify(value) + "\n";
  const rawSources = new Map();
  for (const date of dates) {
    const data = payload(date);
    if (date === dates[1]) {
      // A selected record still wins over a verification record with the same
      // race key; a distinct verification record remains in the cohort.
      data.verificationPredictions = [
        { ...row(date, 1), practicalPriorityShadow: { eligible: false } },
        row(date, 2)
      ];
    }
    rawSources.set(date, raw(data));
    fs.writeFileSync(archiveApi.sourcePathFor(artifactRoot, date), rawSources.get(date));
    if (date !== dates[3]) {
      archiveApi.archivePredictionSource({
        rootDirectory: artifactRoot, date, rawSaveLimitBytes: 1,
        generatedAt
      });
    }
  }
  fs.writeFileSync(path.join(resultDirectory, dates[1] + ".json"), raw({
    date: dates[1],
    races: [{
      date: dates[1], jcd: "01", raceNo: 1,
      resultAvailable: true, status: "finished",
      trifecta: { combination: "1-2-3", payout: 1230 }
    }, {
      date: dates[1], jcd: "01", raceNo: 2, void: true
    }]
  }));

  // Build the same expected report using the previous restore-all -> raw
  // builder path, then recreate stale/absent expanded raws before the new gate.
  restorePredictionSources({ rootDirectory: artifactRoot, all: true });
  const expected = {
    generatedAt,
    ...reportApi.build(reportBuilder.predictionRows({
      predictionDirectory, resultDirectory
    }))
  };
  assert.equal(expected.cohortCount, 4);
  assert.equal(expected.metrics.baseReturn, 1230);
  assert.equal(expected.metrics.voidCount, 1);
  fs.writeFileSync(reportPath, raw(expected));
  const staleRaw = raw(payload(dates[1], 9));
  fs.writeFileSync(archiveApi.sourcePathFor(artifactRoot, dates[1]), staleRaw);
  fs.unlinkSync(archiveApi.sourcePathFor(artifactRoot, dates[2]));

  const snapshot = (rootDirectory = artifactRoot) => {
    const files = {};
    const visit = directory => {
      for (const name of fs.readdirSync(directory).sort()) {
        const file = path.join(directory, name);
        if (fs.statSync(file).isDirectory()) visit(file);
        else files[path.relative(rootDirectory, file)] =
          fs.readFileSync(file).toString("base64");
      }
    };
    visit(rootDirectory);
    return files;
  };
  const readOnly = (operation, rootDirectory = artifactRoot) => {
    const before = snapshot(rootDirectory);
    const originalWrite = fs.writeFileSync;
    const originalRename = fs.renameSync;
    let writes = 0;
    const rejectWrite = () => {
      writes += 1;
      throw new Error("artifact gate must not write prediction sources");
    };
    fs.writeFileSync = rejectWrite;
    fs.renameSync = rejectWrite;
    try { return operation(); }
    finally {
      fs.writeFileSync = originalWrite;
      fs.renameSync = originalRename;
      assert.equal(writes, 0, "artifact gate never writes even temporary sources");
      assert.deepEqual(snapshot(rootDirectory), before, "all input/report bytes are unchanged");
    }
  };

  const archiveReads = [];
  const parsedCounts = new Map();
  const originalParse = JSON.parse;
  JSON.parse = function(value, ...rest) {
    const text = String(value);
    if ([...rawSources.values()].includes(text)) {
      parsedCounts.set(text, (parsedCounts.get(text) || 0) + 1);
    }
    return originalParse.call(this, value, ...rest);
  };
  let rebuilt;
  try {
    rebuilt = readOnly(() => artifactGate.verifyArtifact({
      rootDirectory: artifactRoot,
      readArchive(options) {
        archiveReads.push(options.date);
        return archiveApi.readPredictionSourceArchive(options);
      }
    }));
  } finally { JSON.parse = originalParse; }
  assert.deepEqual(rebuilt, expected);
  assert.equal(rebuilt.generatedAt, generatedAt);
  assert.deepEqual(archiveReads, dates.slice(0, 3), "all archives, including pre-contract, read once");
  for (const date of dates) {
    assert.equal(parsedCounts.get(rawSources.get(date)), 1, "parse each canonical date only once: " + date);
  }
  assert.equal(fs.readFileSync(archiveApi.sourcePathFor(artifactRoot, dates[1]), "utf8"), staleRaw);
  assert.equal(fs.existsSync(archiveApi.sourcePathFor(artifactRoot, dates[2])), false);

  const badDate = dates[1];
  const archivePath = archiveApi.archivePathFor(artifactRoot, badDate);
  const metadataPath = archiveApi.metadataPathFor(artifactRoot, badDate);
  const validArchive = fs.readFileSync(archivePath);
  const validMetadata = fs.readFileSync(metadataPath);
  const expectGateFailure = expression => assert.throws(
    () => readOnly(() => artifactGate.verifyArtifact({ rootDirectory: artifactRoot })),
    expression
  );

  // The read helper and old restore keep their precise output separation.
  const source = readOnly(() => archiveApi.readPredictionSourceArchive({
    rootDirectory: artifactRoot, date: badDate
  }));
  assert.equal(source.status, "archive-read");
  assert.equal(source.raw.toString("utf8"), rawSources.get(badDate));
  const restored = archiveApi.restorePredictionSource({
    rootDirectory: artifactRoot, date: badDate
  });
  assert.equal(restored.status, "restored");
  assert.equal(Object.hasOwn(restored, "raw"), false);
  assert.equal(Object.hasOwn(restored, "parsed"), false);
  fs.writeFileSync(archiveApi.sourcePathFor(artifactRoot, badDate), staleRaw);

  const corrupted = Buffer.from(validArchive);
  corrupted[corrupted.length - 1] ^= 0xff;
  fs.writeFileSync(archivePath, corrupted);
  expectGateFailure(/fingerprint/); // valid expanded raw must never be a fallback
  fs.writeFileSync(archivePath, validArchive);

  const metadata = JSON.parse(validMetadata.toString("utf8"));
  fs.writeFileSync(metadataPath, raw({ ...metadata, schemaVersion: 2 }));
  expectGateFailure(/metadata/);
  fs.writeFileSync(metadataPath, raw({ ...metadata, sourceSha256: "0".repeat(64) }));
  expectGateFailure(/fingerprint/);
  fs.writeFileSync(metadataPath, validMetadata);

  const olderPath = archiveApi.archivePathFor(artifactRoot, dates[0]);
  const olderArchive = fs.readFileSync(olderPath);
  fs.writeFileSync(olderPath, Buffer.from("broken pre-contract archive"));
  expectGateFailure(/fingerprint/);
  fs.writeFileSync(olderPath, olderArchive);

  fs.unlinkSync(archivePath);
  expectGateFailure(/構成ファイル/);
  fs.writeFileSync(archivePath, validArchive);

  const invalidRaw = Buffer.from("not valid JSON\n");
  const invalidArchive = zlib.gzipSync(invalidRaw);
  fs.writeFileSync(archivePath, invalidArchive);
  fs.writeFileSync(metadataPath, raw(archiveApi.metadataFor({
    date: badDate, raw: invalidRaw, archive: invalidArchive, parsed: {}, generatedAt
  })));
  expectGateFailure(/JSONが不正/);
  fs.writeFileSync(archivePath, validArchive);
  fs.writeFileSync(metadataPath, validMetadata);

  const rawOnlyPath = archiveApi.sourcePathFor(artifactRoot, dates[3]);
  fs.writeFileSync(rawOnlyPath, "broken raw-only JSON");
  expectGateFailure(/JSON|Unexpected token/);
  fs.writeFileSync(rawOnlyPath, rawSources.get(dates[3]));

  fs.writeFileSync(reportPath, raw({
    ...expected, metrics: { ...expected.metrics, baseReturn: 999999 }
  }));
  expectGateFailure(/保存済み順位候補/);
  fs.writeFileSync(reportPath, raw(expected));

  const noArchiveRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "chappy-artifact-no-archive-")
  );
  try {
    fs.mkdirSync(path.join(noArchiveRoot, "data", "stats"), { recursive: true });
    fs.mkdirSync(archiveApi.predictionDirectory(noArchiveRoot), { recursive: true });
    fs.writeFileSync(path.join(noArchiveRoot, "data", "stats", path.basename(reportPath)), raw(expected));
    assert.throws(() => readOnly(
      () => artifactGate.verifyArtifact({ rootDirectory: noArchiveRoot }),
      noArchiveRoot
    ), /archive原本が必要/);
  } finally { fs.rmSync(noArchiveRoot, { recursive: true, force: true }); }

  console.log("read-only priority artifact fixtures: passed");
} finally {
  fs.rmSync(artifactRoot, { recursive: true, force: true });
}

// The load-performance gate uses the same index projection and compaction as
// the former restore-all -> raw reader path, with tiny synthetic inputs only.
const indexBuilder = require("./build-prediction-index");
const { compactIndex } = require("./compact-prediction-index");
const indexRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-read-only-source-index-"));
try {
  const directory = archiveApi.predictionDirectory(indexRoot);
  fs.mkdirSync(directory, { recursive: true });
  const dates = ["20260812", "20260815", "20260816", "20260817"];
  const encode = value => JSON.stringify(value) + "\n";
  const stamp = (date, number = 0) => new Date(Date.UTC(
    Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1,
    Number(date.slice(6)), 1, 0, number
  )).toISOString();
  const quarantineBoats = ["濱本優一", "末永祐輝", "島田一生", "竹内来", "梶原正", "加藤政彦"]
    .map((racerName, index) => ({ boatNo: index + 1, racerName }));
  const payload = (date, overflow = false) => {
    const count = limit => overflow ? limit + 2 : 1;
    const data = {
      date,
      runs: Array.from({ length: count(indexBuilder.RUN_LIMIT) }, (_, i) => ({
        runKey: `fixture-run-${date}-${i}`, checkedAt: stamp(date, i), selected: false
      })),
      predictions: Array.from({ length: count(indexBuilder.PREDICTION_LIMIT) }, (_, i) => ({
        raceKey: `fixture-selected-${date}-${i}`, selectedAt: stamp(date, i)
      })),
      verificationPredictions: Array.from({ length: count(indexBuilder.VERIFICATION_LIMIT) }, (_, i) => ({
        raceKey: `fixture-verification-${date}-${i}`, selectedAt: stamp(date, i)
      })),
      shadowV2Predictions: Array.from({ length: count(indexBuilder.SHADOW_V2_LIMIT) }, (_, i) => ({
        recordKey: `fixture-shadow-${date}-${i}`, raceKey: `fixture-shadow-${date}-${i}`,
        capturedAt: stamp(date, i)
      }))
    };
    if (overflow) {
      const raceKey = `${date}-23-2`;
      const invalid = {
        raceKey, selectedAt: stamp(date, 2000),
        prediction: {
          preRaceConditions: { boats: quarantineBoats },
          mainSheet: { taikou: { boatNo: 1, name: "梶原正" } }
        }
      };
      data.predictions.push(invalid);
      data.verificationPredictions.push(invalid);
      data.shadowV2Predictions.push({
        raceKey, capturedAt: stamp(date, 2000), snapshot: { boats: quarantineBoats },
        predictionReference: { marks: { taikou: { boatNo: 1, name: "梶原正" } } }
      });
      data.runs.push({ checkedAt: stamp(date, 2000), best: { raceKey } });
    }
    return data;
  };
  const sources = new Map();
  for (const date of dates) {
    sources.set(date, encode(payload(date, date === dates[1])));
    fs.writeFileSync(archiveApi.sourcePathFor(indexRoot, date), sources.get(date));
    if (date !== dates[3]) archiveApi.archivePredictionSource({
      rootDirectory: indexRoot, date, rawSaveLimitBytes: 1,
      generatedAt: "2026-08-18T00:00:00.000Z"
    });
  }
  restorePredictionSources({ rootDirectory: indexRoot, all: true });
  const normalize = index => ({ ...index, generatedAt: "" });
  const expected = normalize(indexBuilder.buildPredictionIndex(directory));
  const expectedCompact = normalize(compactIndex(JSON.parse(JSON.stringify(expected))));
  assert.equal(expected.sourceFileCount, 4);
  assert.deepEqual(expected.quarantinedRecordCounts, {
    predictions: 1, verificationPredictions: 1, shadowV2Predictions: 1
  });
  for (const [key, limit] of Object.entries(expected.retentionLimits)) {
    assert.equal(expected.sourceRecordCounts[key], limit + 5, "counts precede retention: " + key);
    assert.equal(expected[key].length, limit, "retained nonempty collection limit: " + key);
  }
  const staleRaw = encode(payload(dates[1]));
  fs.writeFileSync(archiveApi.sourcePathFor(indexRoot, dates[1]), staleRaw);
  fs.unlinkSync(archiveApi.sourcePathFor(indexRoot, dates[2]));
  const snapshot = rootDirectory => {
    const entries = {};
    const visit = current => {
      for (const name of fs.readdirSync(current).sort()) {
        const file = path.join(current, name);
        if (fs.statSync(file).isDirectory()) {
          entries[path.relative(rootDirectory, file) + "/"] = "directory";
          visit(file);
        } else entries[path.relative(rootDirectory, file)] = fs.readFileSync(file).toString("base64");
      }
    };
    visit(rootDirectory);
    return entries;
  };
  const readOnly = (operation, rootDirectory = indexRoot) => {
    const before = snapshot(rootDirectory);
    const methods = ["writeFileSync", "renameSync", "mkdirSync", "mkdtempSync", "linkSync", "copyFileSync", "rmSync", "unlinkSync"];
    const original = Object.fromEntries(methods.map(name => [name, fs[name]]));
    let writes = 0;
    for (const name of methods) fs[name] = () => {
      writes += 1;
      throw new Error("read-only index must not write input files");
    };
    try { return operation(); }
    finally {
      for (const name of methods) fs[name] = original[name];
      assert.equal(writes, 0, "no source/temp/directory mutations");
      assert.deepEqual(snapshot(rootDirectory), before, "all source/archive/meta bytes remain unchanged");
    }
  };
  const reads = [], parsed = new Map(), parse = JSON.parse;
  JSON.parse = function(value, ...args) {
    const text = String(value);
    if ([...sources.values()].includes(text)) parsed.set(text, (parsed.get(text) || 0) + 1);
    return parse.call(this, value, ...args);
  };
  let rebuilt;
  try {
    rebuilt = readOnly(() => indexBuilder.buildArchiveBackedPredictionIndex({
      rootDirectory: indexRoot,
      readArchive(options) { reads.push(options.date); return archiveApi.readPredictionSourceArchive(options); }
    }));
  } finally { JSON.parse = parse; }
  assert.deepEqual(normalize(rebuilt), expected, "entire pre-compaction index matches former restored raw inputs");
  assert.deepEqual(normalize(compactIndex(rebuilt)), expectedCompact, "entire compact index matches the existing load-performance gate");
  assert.deepEqual(reads, dates.slice(0, 3), "all archives are validated exactly once, oldest included");
  for (const date of dates) assert.equal(parsed.get(sources.get(date)), 1, "canonical JSON parsed once: " + date);
  assert.equal(fs.readFileSync(archiveApi.sourcePathFor(indexRoot, dates[1]), "utf8"), staleRaw);
  assert.equal(fs.existsSync(archiveApi.sourcePathFor(indexRoot, dates[2])), false);

  const badDate = dates[1], archivePath = archiveApi.archivePathFor(indexRoot, badDate);
  const metadataPath = archiveApi.metadataPathFor(indexRoot, badDate);
  const goodArchive = fs.readFileSync(archivePath), goodMetadata = fs.readFileSync(metadataPath);
  const fail = expression => assert.throws(() => readOnly(
    () => indexBuilder.buildArchiveBackedPredictionIndex({ rootDirectory: indexRoot })
  ), expression);
  const corrupted = Buffer.from(goodArchive); corrupted[corrupted.length - 1] ^= 0xff;
  fs.writeFileSync(archivePath, corrupted); fail(/fingerprint/);
  fs.writeFileSync(archivePath, goodArchive);
  const metadata = JSON.parse(goodMetadata.toString("utf8"));
  fs.writeFileSync(metadataPath, encode({ ...metadata, schemaVersion: 2 })); fail(/metadata/);
  fs.writeFileSync(metadataPath, encode({ ...metadata, sourceSha256: "0".repeat(64) })); fail(/fingerprint/);
  fs.writeFileSync(metadataPath, goodMetadata);
  const oldPath = archiveApi.archivePathFor(indexRoot, dates[0]), oldArchive = fs.readFileSync(oldPath);
  fs.writeFileSync(oldPath, "broken earliest archive"); fail(/fingerprint/);
  fs.writeFileSync(oldPath, oldArchive);
  fs.unlinkSync(archivePath); fail(/構成ファイル/); fs.writeFileSync(archivePath, goodArchive);
  const invalid = Buffer.from("invalid canonical JSON\n"), invalidArchive = zlib.gzipSync(invalid);
  fs.writeFileSync(archivePath, invalidArchive);
  fs.writeFileSync(metadataPath, encode(archiveApi.metadataFor({
    date: badDate, raw: invalid, archive: invalidArchive, parsed: {}, generatedAt: "2026-08-18T00:00:00.000Z"
  })));
  fail(/JSONが不正/);
  fs.writeFileSync(archivePath, goodArchive); fs.writeFileSync(metadataPath, goodMetadata);
  const rawPath = archiveApi.sourcePathFor(indexRoot, dates[3]);
  fs.writeFileSync(rawPath, "invalid raw-only JSON"); fail(/JSON|Unexpected token/);
  fs.writeFileSync(rawPath, sources.get(dates[3]));
  const noArchiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "chappy-index-no-archive-"));
  try {
    fs.mkdirSync(archiveApi.predictionDirectory(noArchiveRoot), { recursive: true });
    fs.writeFileSync(archiveApi.sourcePathFor(noArchiveRoot, dates[3]), sources.get(dates[3]));
    assert.throws(() => readOnly(() => indexBuilder.buildArchiveBackedPredictionIndex({
      rootDirectory: noArchiveRoot
    }), noArchiveRoot), /archive原本が必要/);
  } finally { fs.rmSync(noArchiveRoot, { recursive: true, force: true }); }
  console.log("read-only load-performance index fixtures: passed (4 dates, 4 retained arrays, 8 negative gates)");
} finally { fs.rmSync(indexRoot, { recursive: true, force: true }); }

console.log(
  "日次予想原本archive・Git保存テスト: 合格"
);
