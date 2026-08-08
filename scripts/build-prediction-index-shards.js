"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  buildPredictionIndex
} = require("./build-prediction-index");
const {
  compactIndex
} = require("./compact-prediction-index");

const MANIFEST_SCHEMA_VERSION = 1;
const SHARD_SCHEMA_VERSION = 1;
const TARGET_SHARD_BYTES = 900_000;
const MAX_SHARD_BYTES = 1_250_000;
const MANIFEST_FILENAME =
  "index-manifest.json";
const SHARD_DIRECTORY =
  "index-shards";
const COLLECTIONS = [
  "runs",
  "predictions",
  "verificationPredictions",
  "shadowV2Predictions"
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function jsonBytes(value) {
  return Buffer.byteLength(
    JSON.stringify(value),
    "utf8"
  );
}

function generationSource(index) {
  return {
    ...index,
    generatedAt: ""
  };
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function generationIdFor(index) {
  return sha256(
    JSON.stringify(
      generationSource(index)
    )
  );
}

function recordKey(record) {
  return String(
    record?.runKey ||
    record?.recordKey ||
    record?.raceKey ||
    ""
  );
}

function assertShardLimits(
  targetBytes,
  maxBytes
) {
  if (
    !Number.isInteger(targetBytes) ||
    !Number.isInteger(maxBytes) ||
    targetBytes < 1 ||
    maxBytes < targetBytes
  ) {
    throw new TypeError(
      "予想index shardの容量上限が不正です"
    );
  }
}

function shardPayload(
  collection,
  offset,
  records
) {
  return {
    schemaVersion:
      SHARD_SCHEMA_VERSION,
    collection,
    offset,
    count: records.length,
    records
  };
}

function splitCollection(
  collection,
  records,
  options = {}
) {
  const targetBytes = Number(
    options.targetBytes ||
    TARGET_SHARD_BYTES
  );
  const maxBytes = Number(
    options.maxBytes ||
    MAX_SHARD_BYTES
  );
  assertShardLimits(
    targetBytes,
    maxBytes
  );

  const source = Array.isArray(records)
    ? records
    : [];
  const groups = [];
  let current = [];
  let offset = 0;

  source.forEach(record => {
    const single = shardPayload(
      collection,
      offset + current.length,
      [record]
    );
    if (
      jsonBytes(single) + 1 >
      maxBytes
    ) {
      throw new Error(
        `${collection}の1件がshard上限を超えています`
      );
    }

    const candidate = shardPayload(
      collection,
      offset,
      [...current, record]
    );
    if (
      current.length &&
      jsonBytes(candidate) + 1 >
        targetBytes
    ) {
      groups.push({
        offset,
        records: current
      });
      offset += current.length;
      current = [record];
      return;
    }
    current.push(record);
  });

  if (current.length) {
    groups.push({
      offset,
      records: current
    });
  }

  return groups.map(
    (group, order) => {
      const payload = shardPayload(
        collection,
        group.offset,
        group.records
      );
      const content =
        JSON.stringify(payload) + "\n";
      const shardId = sha256(content);
      const bytes = Buffer.byteLength(
        content,
        "utf8"
      );
      if (bytes >= maxBytes) {
        throw new Error(
          `${collection} shardが絶対上限を超えています (${bytes} bytes)`
        );
      }
      const filename =
        `${shardId}-` +
        `${collection}-` +
        `${String(order).padStart(3, "0")}.json`;
      return {
        descriptor: {
          path:
            `${SHARD_DIRECTORY}/${filename}`,
          order,
          offset: group.offset,
          count:
            group.records.length,
          bytes,
          firstKey:
            recordKey(group.records[0]),
          lastKey:
            recordKey(
              group.records[
                group.records.length - 1
              ]
            ),
          shardId
        },
        payload,
        content
      };
    }
  );
}

function buildArtifacts(
  sourceIndex,
  options = {}
) {
  const index = compactIndex(
    cloneJson(sourceIndex)
  );
  const generationId =
    generationIdFor(index);
  const collectionManifest = {};
  const shards = [];

  COLLECTIONS.forEach(collection => {
    const records = Array.isArray(
      index[collection]
    )
      ? index[collection]
      : [];
    const collectionShards =
      splitCollection(
        collection,
        records,
        options
      );
    shards.push(...collectionShards);
    collectionManifest[collection] = {
      count: records.length,
      shards:
        collectionShards.map(
          item => item.descriptor
        )
    };
  });

  const manifest = {
    format:
      "chappy-prediction-index-manifest",
    manifestSchemaVersion:
      MANIFEST_SCHEMA_VERSION,
    indexSchemaVersion:
      Number(index.schemaVersion || 0),
    generationId,
    generatedAt:
      String(index.generatedAt || ""),
    sourceFileCount:
      Number(index.sourceFileCount || 0),
    sourceRecordCounts:
      index.sourceRecordCounts || {},
    quarantinedRecordCounts:
      index.quarantinedRecordCounts || {},
    retentionLimits:
      index.retentionLimits || {},
    targetShardBytes: Number(
      options.targetBytes ||
      TARGET_SHARD_BYTES
    ),
    maxShardBytes: Number(
      options.maxBytes ||
      MAX_SHARD_BYTES
    ),
    collections:
      collectionManifest
  };

  return {
    index,
    manifest,
    shards
  };
}

function resolveInside(
  rootDirectory,
  relativePath
) {
  const root = path.resolve(rootDirectory);
  const resolved = path.resolve(
    root,
    String(relativePath || "")
  );
  if (
    resolved !== root &&
    !resolved.startsWith(
      root + path.sep
    )
  ) {
    throw new Error(
      "予想index shardのパスが不正です"
    );
  }
  return resolved;
}

function atomicWrite(filePath, content) {
  fs.mkdirSync(
    path.dirname(filePath),
    { recursive: true }
  );
  const temporaryPath =
    `${filePath}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    content,
    "utf8"
  );
  fs.renameSync(
    temporaryPath,
    filePath
  );
}

function readManifest(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}

function currentShardDescriptors(
  manifest
) {
  return COLLECTIONS.flatMap(
    collection => {
      const shards =
        manifest?.collections?.[
          collection
        ]?.shards;
      return Array.isArray(shards)
        ? shards
        : [];
    }
  );
}

function retainedShardDescriptors(
  manifest
) {
  const shards =
    manifest?.previousGeneration
      ?.shards;
  return Array.isArray(shards)
    ? shards
    : [];
}

function activeShardPaths(manifest) {
  return [
    ...currentShardDescriptors(
      manifest
    ),
    ...retainedShardDescriptors(
      manifest
    )
  ].map(descriptor =>
    descriptor?.path
  );
}

function cleanupShardDirectory(
  predictionDirectory,
  activePaths
) {
  const keepNames = new Set(
    (Array.isArray(activePaths)
      ? activePaths
      : []
    ).map(value =>
      path.basename(String(value || ""))
    )
  );
  const shardDirectory = path.join(
    predictionDirectory,
    SHARD_DIRECTORY
  );
  if (!fs.existsSync(shardDirectory)) {
    return;
  }
  fs.readdirSync(shardDirectory)
    .filter(name =>
      name.endsWith(".json") &&
      !keepNames.has(name)
    )
    .forEach(name => {
      fs.unlinkSync(
        path.join(
          shardDirectory,
          name
        )
      );
    });
}

function validateManifest(manifest) {
  if (
    manifest?.format !==
      "chappy-prediction-index-manifest" ||
    Number(
      manifest.manifestSchemaVersion
    ) !== MANIFEST_SCHEMA_VERSION ||
    !/^[a-f0-9]{64}$/.test(
      String(manifest.generationId || "")
    )
  ) {
    throw new Error(
      "予想index manifestが不正です"
    );
  }
  const previous =
    manifest.previousGeneration;
  if (previous != null) {
    if (
      !/^[a-f0-9]{64}$/.test(
        String(
          previous.generationId || ""
        )
      ) ||
      previous.generationId ===
        manifest.generationId ||
      !Array.isArray(previous.shards) ||
      previous.shards.some(
        descriptor =>
          !/^index-shards\/[a-zA-Z0-9._-]+\.json$/.test(
            String(
              descriptor?.path || ""
            )
          ) ||
          !/^[a-f0-9]{64}$/.test(
            String(
              descriptor?.shardId || ""
            )
          ) ||
          !Number.isInteger(
            Number(descriptor?.bytes)
          ) ||
          Number(descriptor?.bytes) < 1
      )
    ) {
      throw new Error(
        "予想indexの直前世代情報が不正です"
      );
    }
  }
  return manifest;
}

function reconstructIndex(
  manifestPath
) {
  const manifest = validateManifest(
    readManifest(manifestPath)
  );
  const rootDirectory =
    path.dirname(manifestPath);
  const collections = {};

  COLLECTIONS.forEach(collection => {
    const collectionInfo =
      manifest.collections?.[collection];
    const descriptors = Array.isArray(
      collectionInfo?.shards
    )
      ? collectionInfo.shards
      : [];
    const records = [];

    descriptors
      .slice()
      .sort(
        (a, b) =>
          Number(a?.order || 0) -
          Number(b?.order || 0)
      )
      .forEach((descriptor, order) => {
        const shardPath = resolveInside(
          rootDirectory,
          descriptor?.path
        );
        const raw = fs.readFileSync(
          shardPath,
          "utf8"
        );
        if (
          Buffer.byteLength(raw, "utf8") !==
            Number(descriptor?.bytes) ||
          !/^[a-f0-9]{64}$/.test(
            String(
              descriptor?.shardId || ""
            )
          ) ||
          sha256(raw) !==
            descriptor.shardId
        ) {
          throw new Error(
            `予想index shard fingerprintが不一致です: ${descriptor?.path || ""}`
          );
        }
        const payload = JSON.parse(raw);
        if (
          Number(payload?.schemaVersion) !==
            SHARD_SCHEMA_VERSION ||
          payload?.collection !==
            collection ||
          Number(payload?.offset) !==
            records.length ||
          Number(descriptor?.offset) !==
            records.length ||
          Number(payload?.count) !==
            payload?.records?.length ||
          Number(descriptor?.count) !==
            payload?.records?.length ||
          Number(descriptor?.order) !==
            order ||
          (
            payload.records.length > 0 &&
            (
              descriptor?.firstKey !==
                recordKey(
                  payload.records[0]
                ) ||
              descriptor?.lastKey !==
                recordKey(
                  payload.records[
                    payload.records.length - 1
                  ]
                )
            )
          )
        ) {
          throw new Error(
            `予想index shard構造が不一致です: ${descriptor?.path || ""}`
          );
        }
        records.push(...payload.records);
      });

    if (
      records.length !==
      Number(collectionInfo?.count || 0)
    ) {
      throw new Error(
        `${collection}の再構成件数が不一致です`
      );
    }
    collections[collection] = records;
  });

  const index = {
    schemaVersion:
      Number(
        manifest.indexSchemaVersion || 0
      ),
    generatedAt:
      String(manifest.generatedAt || ""),
    sourceFileCount:
      Number(
        manifest.sourceFileCount || 0
      ),
    sourceRecordCounts:
      manifest.sourceRecordCounts || {},
    quarantinedRecordCounts:
      manifest.quarantinedRecordCounts || {},
    retentionLimits:
      manifest.retentionLimits || {},
    ...collections
  };

  if (
    generationIdFor(index) !==
    manifest.generationId
  ) {
    throw new Error(
      "予想indexの再構成fingerprintが不一致です"
    );
  }
  return index;
}

function writePredictionIndexShards(
  predictionDirectory,
  options = {}
) {
  const manifestPath = path.join(
    predictionDirectory,
    options.manifestFilename ||
      MANIFEST_FILENAME
  );
  const sourceIndex =
    buildPredictionIndex(
      predictionDirectory
    );
  const artifacts = buildArtifacts(
    sourceIndex,
    options
  );
  let previousManifest = null;
  let previousManifestValid = false;
  let sameGenerationValid = false;
  if (fs.existsSync(manifestPath)) {
    try {
      previousManifest =
        validateManifest(
          readManifest(manifestPath)
        );
      reconstructIndex(manifestPath);
      previousManifestValid = true;
      if (
        previousManifest.generationId ===
        artifacts.manifest.generationId
      ) {
        sameGenerationValid =
          JSON.stringify(
            previousManifest.collections
          ) ===
          JSON.stringify(
            artifacts.manifest.collections
          );
      }
    } catch (_) {
      previousManifestValid = false;
      sameGenerationValid = false;
    }
  }

  if (
    previousManifest?.generationId ===
      artifacts.manifest.generationId &&
    sameGenerationValid
  ) {
    cleanupShardDirectory(
      predictionDirectory,
      activeShardPaths(
        previousManifest
      )
    );
    return {
      ...artifacts,
      manifest: previousManifest,
      manifestPath,
      changed: false
    };
  }

  if (
    previousManifestValid &&
    previousManifest.generationId !==
      artifacts.manifest.generationId
  ) {
    artifacts.manifest.previousGeneration = {
      generationId:
        previousManifest.generationId,
      shards:
        currentShardDescriptors(
          previousManifest
        ).map(descriptor => ({
          path: descriptor.path,
          bytes: descriptor.bytes,
          shardId: descriptor.shardId
        }))
    };
  }

  artifacts.shards.forEach(item => {
    const shardPath = resolveInside(
      predictionDirectory,
      item.descriptor.path
    );
    if (
      !fs.existsSync(shardPath) ||
      fs.readFileSync(
        shardPath,
        "utf8"
      ) !== item.content
    ) {
      atomicWrite(
        shardPath,
        item.content
      );
    }
  });

  atomicWrite(
    manifestPath,
    JSON.stringify(
      artifacts.manifest
    ) + "\n"
  );

  cleanupShardDirectory(
    predictionDirectory,
    activeShardPaths(
      artifacts.manifest
    )
  );

  return {
    ...artifacts,
    manifestPath,
    changed: true
  };
}

function main() {
  const predictionDirectory = path.join(
    process.cwd(),
    "data",
    "predictions"
  );
  const result =
    writePredictionIndexShards(
      predictionDirectory
    );
  const counts = result.manifest
    .collections;
  console.log(
    `自動予想index shard${result.changed ? "更新" : "変更なし"}：` +
    `採用${counts.predictions.count}件／` +
    `検証${counts.verificationPredictions.count}件／` +
    `V2シャドー${counts.shadowV2Predictions.count}件／` +
    `実行${counts.runs.count}件／` +
    `${result.shards.length} shard`
  );
}

if (require.main === module) main();

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  SHARD_SCHEMA_VERSION,
  TARGET_SHARD_BYTES,
  MAX_SHARD_BYTES,
  MANIFEST_FILENAME,
  SHARD_DIRECTORY,
  COLLECTIONS,
  generationIdFor,
  sha256,
  splitCollection,
  buildArtifacts,
  validateManifest,
  currentShardDescriptors,
  retainedShardDescriptors,
  activeShardPaths,
  cleanupShardDirectory,
  reconstructIndex,
  writePredictionIndexShards
};
