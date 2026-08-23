"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const archiveApi = require(
  "./daily-prediction-source-archive"
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
