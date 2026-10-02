"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ARCHIVE_SCHEMA_VERSION = 1;
const GIT_BLOB_LIMIT_BYTES =
  100 * 1024 * 1024;
const DEFAULT_RAW_SAVE_LIMIT_BYTES =
  99 * 1024 * 1024;
const ARCHIVE_DIRECTORY =
  "source-archives";

function getArgument(
  name,
  argv = process.argv.slice(2)
) {
  const prefix = `--${name}=`;
  const argument = argv.find(value =>
    String(value || "").startsWith(prefix)
  );
  return argument
    ? String(argument).slice(prefix.length).trim()
    : "";
}

function hasFlag(
  name,
  argv = process.argv.slice(2)
) {
  return argv.includes(`--${name}`);
}

function getJstDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(now)
    .replaceAll("-", "");
}

function normalizeDate(value) {
  const date = String(value || "")
    .trim()
    .replaceAll("-", "")
    .replaceAll("/", "");
  if (!/^\d{8}$/.test(date)) {
    throw new Error(
      `日付はYYYYMMDD形式で指定してください：${value}`
    );
  }
  return date;
}

function resolveTargetDate({
  argv = process.argv.slice(2),
  env = process.env,
  now = new Date()
} = {}) {
  return normalizeDate(
    getArgument("date", argv) ||
    env.PREDICT_DATE ||
    env.COLLECT_DATE ||
    getJstDate(now)
  );
}

function predictionDirectory(rootDirectory) {
  return path.join(
    rootDirectory,
    "data",
    "predictions"
  );
}

function sourcePathFor(
  rootDirectory,
  date
) {
  return path.join(
    predictionDirectory(rootDirectory),
    `${normalizeDate(date)}.json`
  );
}

function archiveDirectoryFor(rootDirectory) {
  return path.join(
    predictionDirectory(rootDirectory),
    ARCHIVE_DIRECTORY
  );
}

function archivePathFor(
  rootDirectory,
  date
) {
  return path.join(
    archiveDirectoryFor(rootDirectory),
    `${normalizeDate(date)}.json.gz`
  );
}

function metadataPathFor(
  rootDirectory,
  date
) {
  return path.join(
    archiveDirectoryFor(rootDirectory),
    `${normalizeDate(date)}.meta.json`
  );
}

function sha256(buffer) {
  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

function atomicWrite(
  filePath,
  content
) {
  fs.mkdirSync(
    path.dirname(filePath),
    { recursive: true }
  );
  const temporaryPath =
    `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    content
  );
  fs.renameSync(
    temporaryPath,
    filePath
  );
}

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

function parsePredictionJson(
  raw,
  filePath
) {
  let parsed;
  try {
    parsed = JSON.parse(
      raw.toString("utf8")
    );
  } catch (error) {
    throw new Error(
      `日次予想原本JSONが不正です：${filePath}：${error?.message || error}`
    );
  }
  return parsed;
}

function metadataFor({
  date,
  raw,
  archive,
  parsed,
  generatedAt = new Date().toISOString()
}) {
  return {
    schemaVersion:
      ARCHIVE_SCHEMA_VERSION,
    format: "gzip-json",
    date,
    sourceFile: `${date}.json`,
    archiveFile: `${date}.json.gz`,
    sourceBytes: raw.length,
    archiveBytes: archive.length,
    sourceSha256: sha256(raw),
    archiveSha256: sha256(archive),
    sourceUpdatedAt:
      String(parsed?.updatedAt || ""),
    generatedAt
  };
}

function validateMetadata(
  metadata,
  date
) {
  if (
    Number(metadata?.schemaVersion) !==
      ARCHIVE_SCHEMA_VERSION ||
    metadata?.format !== "gzip-json" ||
    normalizeDate(metadata?.date) !==
      normalizeDate(date) ||
    !/^[a-f0-9]{64}$/.test(
      String(metadata?.sourceSha256 || "")
    ) ||
    !/^[a-f0-9]{64}$/.test(
      String(metadata?.archiveSha256 || "")
    ) ||
    !Number.isInteger(
      Number(metadata?.sourceBytes)
    ) ||
    Number(metadata?.sourceBytes) < 1 ||
    !Number.isInteger(
      Number(metadata?.archiveBytes)
    ) ||
    Number(metadata?.archiveBytes) < 1
  ) {
    throw new Error(
      `日次予想原本archive metadataが不正です：${date}`
    );
  }
  return metadata;
}

function archivePredictionSource({
  rootDirectory = process.cwd(),
  date,
  rawSaveLimitBytes =
    DEFAULT_RAW_SAVE_LIMIT_BYTES,
  generatedAt = new Date().toISOString()
} = {}) {
  const targetDate = normalizeDate(date);
  const sourcePath = sourcePathFor(
    rootDirectory,
    targetDate
  );
  const archivePath = archivePathFor(
    rootDirectory,
    targetDate
  );
  const metadataPath = metadataPathFor(
    rootDirectory,
    targetDate
  );

  if (!fs.existsSync(sourcePath)) {
    return {
      date: targetDate,
      status: "source-missing",
      sourcePath,
      archivePath,
      metadataPath,
      sourceBytes: 0,
      archiveBytes: 0
    };
  }

  const raw = fs.readFileSync(sourcePath);
  const parsed = parsePredictionJson(
    raw,
    sourcePath
  );
  if (
    raw.length < Number(rawSaveLimitBytes)
  ) {
    const removedArchive =
      removeIfExists(archivePath);
    const removedMetadata =
      removeIfExists(metadataPath);
    return {
      date: targetDate,
      status: "raw-git-safe",
      sourcePath,
      archivePath,
      metadataPath,
      sourceBytes: raw.length,
      archiveBytes: 0,
      removedArchive,
      removedMetadata
    };
  }

  const sourceFingerprint = sha256(raw);
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

  const archive = zlib.gzipSync(
    raw,
    {
      level: zlib.constants.Z_BEST_COMPRESSION
    }
  );
  if (
    archive.length >=
      GIT_BLOB_LIMIT_BYTES
  ) {
    throw new Error(
      `圧縮後の日次予想原本もGitHub上限を超えています：${targetDate}・${archive.length} bytes`
    );
  }
  const metadata = metadataFor({
    date: targetDate,
    raw,
    archive,
    parsed,
    generatedAt
  });
  atomicWrite(
    archivePath,
    archive
  );
  atomicWrite(
    metadataPath,
    Buffer.from(
      `${JSON.stringify(metadata)}\n`,
      "utf8"
    )
  );

  return {
    date: targetDate,
    status: "archived",
    reused: false,
    sourcePath,
    archivePath,
    metadataPath,
    sourceBytes: raw.length,
    archiveBytes: archive.length,
    metadata
  };
}

function restorePredictionSource({
  rootDirectory = process.cwd(),
  date
} = {}) {
  const targetDate = normalizeDate(date);
  const sourcePath = sourcePathFor(
    rootDirectory,
    targetDate
  );
  const archivePath = archivePathFor(
    rootDirectory,
    targetDate
  );
  const metadataPath = metadataPathFor(
    rootDirectory,
    targetDate
  );

  if (
    !fs.existsSync(archivePath) &&
    !fs.existsSync(metadataPath)
  ) {
    return {
      date: targetDate,
      status: "archive-missing",
      sourcePath,
      archivePath,
      metadataPath
    };
  }
  if (
    !fs.existsSync(archivePath) ||
    !fs.existsSync(metadataPath)
  ) {
    throw new Error(
      `日次予想原本archiveの構成ファイルが不足しています：${targetDate}`
    );
  }

  const metadata = validateMetadata(
    JSON.parse(
      fs.readFileSync(
        metadataPath,
        "utf8"
      )
    ),
    targetDate
  );
  const archive = fs.readFileSync(
    archivePath
  );
  if (
    archive.length !==
      Number(metadata.archiveBytes) ||
    sha256(archive) !==
      metadata.archiveSha256
  ) {
    throw new Error(
      `日次予想原本archiveのfingerprintが不一致です：${targetDate}`
    );
  }

  const raw = zlib.gunzipSync(archive);
  if (
    raw.length !==
      Number(metadata.sourceBytes) ||
    sha256(raw) !==
      metadata.sourceSha256
  ) {
    throw new Error(
      `復元した日次予想原本のfingerprintが不一致です：${targetDate}`
    );
  }
  parsePredictionJson(
    raw,
    sourcePath
  );
  atomicWrite(
    sourcePath,
    raw
  );

  return {
    date: targetDate,
    status: "restored",
    sourcePath,
    archivePath,
    metadataPath,
    sourceBytes: raw.length,
    archiveBytes: archive.length,
    metadata
  };
}

function predictionSourceDates(
  rootDirectory = process.cwd()
) {
  const directory = predictionDirectory(
    rootDirectory
  );
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory)
    .filter(name => /^\d{8}\.json$/.test(name))
    .map(name => name.slice(0, 8))
    .sort();
}

function archivedSourceDates(
  rootDirectory = process.cwd()
) {
  const directory = archiveDirectoryFor(
    rootDirectory
  );
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory)
    .filter(name => /^\d{8}\.meta\.json$/.test(name))
    .map(name => name.slice(0, 8))
    .sort();
}

module.exports = {
  ARCHIVE_SCHEMA_VERSION,
  GIT_BLOB_LIMIT_BYTES,
  DEFAULT_RAW_SAVE_LIMIT_BYTES,
  ARCHIVE_DIRECTORY,
  getArgument,
  hasFlag,
  getJstDate,
  normalizeDate,
  resolveTargetDate,
  predictionDirectory,
  sourcePathFor,
  archiveDirectoryFor,
  archivePathFor,
  metadataPathFor,
  sha256,
  atomicWrite,
  parsePredictionJson,
  metadataFor,
  validateMetadata,
  archivePredictionSource,
  restorePredictionSource,
  predictionSourceDates,
  archivedSourceDates
};
