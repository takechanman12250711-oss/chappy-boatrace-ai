"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");
const archiveApi = require(
  "./daily-prediction-source-archive"
);
const restoreApi = require(
  "./restore-daily-prediction-source"
);
const prepareApi = require(
  "./prepare-daily-prediction-git-save"
);

const root = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "chappy-archive-idempotency-"
  )
);

try {
  const date = "20260823";
  const sourcePath =
    archiveApi.sourcePathFor(root, date);
  fs.mkdirSync(
    path.dirname(sourcePath),
    { recursive: true }
  );

  const firstPayload = {
    schemaVersion: 3,
    date,
    updatedAt:
      "2026-08-23T08:00:00.000Z",
    evidence: "展開".repeat(3000)
  };
  const firstRaw =
    `${JSON.stringify(firstPayload)}\n`;
  fs.writeFileSync(
    sourcePath,
    firstRaw,
    "utf8"
  );

  const first =
    archiveApi.archivePredictionSource({
      rootDirectory: root,
      date,
      rawSaveLimitBytes: 1024,
      generatedAt:
        "2026-08-23T08:01:00.000Z"
    });
  assert.equal(first.status, "archived");
  assert.equal(first.reused, false);

  const archivePath =
    archiveApi.archivePathFor(
      root,
      date
    );
  const metadataPath =
    archiveApi.metadataPathFor(
      root,
      date
    );
  const firstArchive =
    fs.readFileSync(archivePath);
  const firstMetadata =
    fs.readFileSync(
      metadataPath,
      "utf8"
    );

  const second =
    archiveApi.archivePredictionSource({
      rootDirectory: root,
      date,
      rawSaveLimitBytes: 1024,
      generatedAt:
        "2099-01-01T00:00:00.000Z"
    });
  assert.equal(second.status, "archived");
  assert.equal(second.reused, true);
  assert.deepEqual(
    fs.readFileSync(archivePath),
    firstArchive
  );
  assert.equal(
    fs.readFileSync(
      metadataPath,
      "utf8"
    ),
    firstMetadata,
    "same source must not rewrite generatedAt"
  );

  const changedPayload = {
    ...firstPayload,
    updatedAt:
      "2026-08-23T08:30:00.000Z",
    extra: "残し・拾い"
  };
  const changedRaw =
    `${JSON.stringify(changedPayload)}\n`;
  fs.writeFileSync(
    sourcePath,
    changedRaw,
    "utf8"
  );
  const changed =
    archiveApi.archivePredictionSource({
      rootDirectory: root,
      date,
      rawSaveLimitBytes: 1024,
      generatedAt:
        "2026-08-23T08:31:00.000Z"
    });
  assert.equal(changed.reused, false);
  assert.equal(
    zlib.gunzipSync(
      fs.readFileSync(archivePath)
    ).toString("utf8"),
    changedRaw
  );
  const changedMetadata = JSON.parse(
    fs.readFileSync(
      metadataPath,
      "utf8"
    )
  );
  assert.equal(
    changedMetadata.generatedAt,
    "2026-08-23T08:31:00.000Z"
  );

  fs.writeFileSync(
    archivePath,
    Buffer.from("broken archive")
  );
  const repaired =
    archiveApi.archivePredictionSource({
      rootDirectory: root,
      date,
      rawSaveLimitBytes: 1024,
      generatedAt:
        "2026-08-23T08:32:00.000Z"
    });
  assert.equal(repaired.reused, false);
  assert.equal(
    zlib.gunzipSync(
      fs.readFileSync(archivePath)
    ).toString("utf8"),
    changedRaw,
    "broken archive must be rebuilt"
  );

  // A real, small Git repository exercises the prepared-stage contract.
  // No production prediction files or full-history checks are used.
  const preparedRoot = path.join(root, "prepared");
  fs.mkdirSync(preparedRoot);
  const fixtureGit = args => execFileSync(
    "git", args,
    {
      cwd: preparedRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  fixtureGit(["init", "--quiet"]);
  const trackedSource = archiveApi.sourcePathFor(
    preparedRoot, date
  );
  fs.mkdirSync(path.dirname(trackedSource), { recursive: true });
  const oldTrackedRaw = JSON.stringify({ date, evidence: "旧原本" });
  fs.writeFileSync(trackedSource, oldTrackedRaw);
  fixtureGit(["add", "data/predictions"]);
  fixtureGit([
    "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "commit", "--quiet", "-m", "fixture baseline"
  ]);

  fs.writeFileSync(trackedSource, changedRaw);
  const newArchivedDate = "20260824";
  const newArchivedSource = archiveApi.sourcePathFor(
    preparedRoot, newArchivedDate
  );
  fs.writeFileSync(newArchivedSource, JSON.stringify({
    ...firstPayload, date: newArchivedDate
  }));
  const currentSource = archiveApi.sourcePathFor(
    preparedRoot, "20260825"
  );
  fs.writeFileSync(currentSource, JSON.stringify({ date: "20260825" }));
  const shardPath = path.join(
    preparedRoot, "data/predictions/index-shards/fixture.json"
  );
  fs.mkdirSync(path.dirname(shardPath), { recursive: true });
  fs.writeFileSync(shardPath, JSON.stringify({ fixture: true }));

  const prepared = prepareApi.preparePredictionGitSave({
    rootDirectory: preparedRoot,
    all: true,
    rawSaveLimitBytes: 1024
  });
  assert.equal(prepared.archivedCount, 2);
  assert.equal(prepared.rawGitSafeCount, 1);
  const preparedIndex = fixtureGit(["ls-files", "--stage", "-z"]);
  assert.notEqual(fixtureGit(["diff", "--cached", "--name-only"]), "");
  const preparedArchivePath = archiveApi.archivePathFor(preparedRoot, date);
  const preparedArchive = fs.readFileSync(preparedArchivePath);
  const preparedMetadataPath = archiveApi.metadataPathFor(preparedRoot, date);
  const preparedMetadata = fs.readFileSync(preparedMetadataPath);
  const verifyPrepared = () => prepareApi.verifyPreparedPredictionGitSave({
    rootDirectory: preparedRoot
  });
  assert.doesNotThrow(verifyPrepared, "staged prediction changes are allowed");

  const restored = restoreApi.restorePredictionSources({
    rootDirectory: preparedRoot,
    all: true
  });
  assert.equal(restored.length, 2);
  assert.ok(restored.every(result => result.status === "restored"));
  assert.throws(verifyPrepared, /未stage/, "expanded raw cannot silently replace prepared bytes");
  prepareApi.cleanupRestoredPredictionSources({
    rootDirectory: preparedRoot,
    all: true
  });
  assert.doesNotThrow(verifyPrepared);
  assert.equal(fs.readFileSync(trackedSource, "utf8"), oldTrackedRaw);
  assert.equal(fs.existsSync(newArchivedSource), false);
  assert.deepEqual(fs.readFileSync(preparedArchivePath), preparedArchive);
  assert.deepEqual(fs.readFileSync(preparedMetadataPath), preparedMetadata);
  assert.equal(fixtureGit(["ls-files", "--stage", "-z"]), preparedIndex);

  const readOnlyPaths = [
    trackedSource, currentSource, shardPath,
    preparedArchivePath, preparedMetadataPath,
    path.join(preparedRoot, ".git/index")
  ];
  const readOnlyBytes = readOnlyPaths.map(filePath => fs.readFileSync(filePath));
  const verifyOutput = execFileSync(process.execPath, [
    path.join(__dirname, "prepare-daily-prediction-git-save.js"),
    "--verify-prepared"
  ], { cwd: preparedRoot, encoding: "utf8" });
  assert.match(verifyOutput, /Git stage/);
  assert.equal(fixtureGit(["ls-files", "--stage", "-z"]), preparedIndex);
  assert.deepEqual(fs.readFileSync(preparedArchivePath), preparedArchive);
  assert.deepEqual(fs.readFileSync(preparedMetadataPath), preparedMetadata);
  readOnlyPaths.forEach((filePath, index) => {
    assert.deepEqual(
      fs.readFileSync(filePath), readOnlyBytes[index],
      "verify mode must not write the raw source, artifacts, or Git index"
    );
  });

  for (const trackedPath of [trackedSource, currentSource, shardPath, preparedMetadataPath]) {
    const original = fs.readFileSync(trackedPath);
    fs.appendFileSync(trackedPath, "\nchanged");
    assert.throws(verifyPrepared, /未stage/, "tracked edits must stop before commit");
    fs.writeFileSync(trackedPath, original);
    fs.unlinkSync(trackedPath);
    assert.throws(verifyPrepared, /未stage/, "tracked deletions must stop before commit");
    fs.writeFileSync(trackedPath, original);
  }
  for (const relativePath of [
    "data/predictions/20260826.json",
    "data/predictions/index-shards/new\nuntracked.json"
  ]) {
    const addedPath = path.join(preparedRoot, relativePath);
    fs.writeFileSync(addedPath, "{}");
    assert.throws(verifyPrepared, /未stage新規/, "untracked raw and shard additions must stop");
    fs.unlinkSync(addedPath);
  }
  assert.doesNotThrow(verifyPrepared);
  assert.equal(fixtureGit(["ls-files", "--stage", "-z"]), preparedIndex);
  const nonRepository = path.join(root, "not-a-repository");
  fs.mkdirSync(nonRepository);
  assert.throws(() => prepareApi.verifyPreparedPredictionGitSave({
    rootDirectory: nonRepository
  }), /照合できません/, "Git failures must stop rather than report clean");
} finally {
  fs.rmSync(
    root,
    {
      recursive: true,
      force: true
    }
  );
}

console.log(
  "daily prediction source archive idempotency: ok"
);
