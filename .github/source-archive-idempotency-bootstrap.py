from pathlib import Path

archive_path = Path(
    "scripts/daily-prediction-source-archive.js"
)
source = archive_path.read_text(encoding="utf-8")

old_return = """  return {
    date: targetDate,
    status: "archived",
    sourcePath,"""
new_return = """  return {
    date: targetDate,
    status: "archived",
    reused: false,
    sourcePath,"""

if source.count(old_return) != 1:
    raise SystemExit(
        "archive return marker is not unique"
    )
source = source.replace(
    old_return,
    new_return,
    1,
)

compression_marker = (
    "  const archive = zlib.gzipSync(\n"
)
reuse_block = """  const sourceFingerprint = sha256(raw);
  if (
    fs.existsSync(archivePath) &&
    fs.existsSync(metadataPath)
  ) {
    try {
      const existingMetadata =
        validateMetadata(
          JSON.parse(
            fs.readFileSync(
              metadataPath,
              "utf8"
            )
          ),
          targetDate
        );
      const existingArchive =
        fs.readFileSync(archivePath);
      if (
        Number(existingMetadata.sourceBytes) ===
          raw.length &&
        existingMetadata.sourceSha256 ===
          sourceFingerprint &&
        Number(existingMetadata.archiveBytes) ===
          existingArchive.length &&
        existingMetadata.archiveSha256 ===
          sha256(existingArchive)
      ) {
        return {
          date: targetDate,
          status: "archived",
          reused: true,
          sourcePath,
          archivePath,
          metadataPath,
          sourceBytes: raw.length,
          archiveBytes:
            existingArchive.length,
          metadata: existingMetadata
        };
      }
    } catch {
      // The valid raw source can rebuild stale or broken archive files.
    }
  }

"""

if source.count(compression_marker) != 1:
    raise SystemExit(
        "compression marker is not unique"
    )
source = source.replace(
    compression_marker,
    reuse_block + compression_marker,
    1,
)
archive_path.write_text(
    source,
    encoding="utf-8",
)

test_path = Path(
    "scripts/"
    "test-daily-prediction-source-archive-idempotency.js"
)
test_path.write_text(
    r""""use strict";

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
""",
    encoding="utf-8",
)
