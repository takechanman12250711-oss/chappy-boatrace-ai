"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  COLLECTIONS,
  MAX_SHARD_BYTES,
  activeShardPaths,
  buildArtifacts,
  generationIdFor,
  reconstructIndex,
  sha256,
  splitCollection,
  writePredictionIndexShards
} = require(
  "./build-prediction-index-shards"
);
const {
  writePredictionIndex
} = require(
  "./build-prediction-index"
);
const {
  compactPredictionIndexFile
} = require(
  "./compact-prediction-index"
);

const frozenLegacyPath = path.join(
  __dirname,
  "..",
  "data",
  "predictions",
  "index.json"
);
assert.throws(
  () => writePredictionIndex(
    path.dirname(frozenLegacyPath),
    frozenLegacyPath
  ),
  /fallback用に凍結/,
  "require経由でもlegacy indexを更新しない"
);
assert.throws(
  () => compactPredictionIndexFile(
    frozenLegacyPath
  ),
  /fallback用に凍結/,
  "require経由でもlegacy indexを圧縮しない"
);

function verificationRecord(index) {
  const raceNo = index % 12 + 1;
  return {
    raceKey:
      `20260808-12-${raceNo}-${index}`,
    date: "20260808",
    jcd: "12",
    place: "住之江",
    raceNo,
    selectedAt:
      `2026-08-08T${String(
        index % 24
      ).padStart(2, "0")}:00:00Z`,
    selection: {
      evaluator:
        "shadow-selection-v2",
      score: 70 + index % 10,
      threshold: 70,
      ready: true,
      qualified: true,
      selected: false,
      status: "ready"
    },
    prediction: {
      raceFlow: {
        title: "1号艇逃げ",
        summary:
          "分割境界を検証する説明"
      },
      practicalTickets: [{
        ticket: "1-2-3",
        category: "本線"
      }]
    }
  };
}

const sourceIndex = {
  schemaVersion: 4,
  generatedAt:
    "2026-08-08T00:00:00Z",
  sourceFileCount: 1,
  sourceRecordCounts: {
    runs: 1,
    predictions: 1,
    verificationPredictions: 80,
    shadowV2Predictions: 1
  },
  quarantinedRecordCounts: {
    predictions: 0,
    verificationPredictions: 0,
    shadowV2Predictions: 0
  },
  retentionLimits: {
    runs: 100,
    predictions: 100,
    verificationPredictions: 300,
    shadowV2Predictions: 600
  },
  runs: [{
    runKey: "run-1",
    checkedAt:
      "2026-08-08T00:00:00Z",
    selected: true
  }],
  predictions: [
    verificationRecord(999)
  ],
  verificationPredictions:
    Array.from(
      { length: 80 },
      (_, index) =>
        verificationRecord(index)
    ),
  shadowV2Predictions: [{
    recordKey: "shadow-1",
    raceKey: "20260808-12-1",
    capturedAt:
      "2026-08-08T00:00:00Z"
  }]
};

const smallShards = splitCollection(
  "verificationPredictions",
  sourceIndex.verificationPredictions,
  {
    targetBytes: 5_000,
    maxBytes: 8_000
  }
);
assert.ok(
  smallShards.length > 1,
  "検証履歴をbyte境界で分割する"
);
let expectedOffset = 0;
smallShards.forEach(
  (item, order) => {
    assert.equal(
      item.descriptor.order,
      order
    );
    assert.equal(
      item.descriptor.offset,
      expectedOffset
    );
    assert.ok(
      item.descriptor.bytes < 8_000
    );
    expectedOffset +=
      item.descriptor.count;
  }
);
assert.equal(expectedOffset, 80);
assert.throws(
  () => splitCollection(
    "verificationPredictions",
    [{ oversized: "x".repeat(2_000) }],
    {
      targetBytes: 500,
      maxBytes: 1_000
    }
  ),
  /1件がshard上限/,
  "単一レコードが絶対上限を超えたら停止する"
);

const artifacts = buildArtifacts(
  sourceIndex,
  {
    targetBytes: 5_000,
    maxBytes: 8_000
  }
);
assert.deepEqual(
  Object.keys(
    artifacts.manifest.collections
  ),
  COLLECTIONS
);
assert.equal(
  artifacts.manifest.collections
    .verificationPredictions.count,
  80
);
assert.ok(
  artifacts.shards.every(
    item =>
      item.descriptor.bytes <
        8_000 &&
      item.descriptor.shardId ===
        sha256(item.content)
  )
);
assert.match(
  artifacts.manifest.generationId,
  /^[a-f0-9]{64}$/
);
assert.equal(
  generationIdFor({
    ...sourceIndex,
    generatedAt:
      "2099-01-01T00:00:00Z"
  }),
  generationIdFor(sourceIndex),
  "生成時刻だけでは世代を変えない"
);

const changedPredictionSource =
  JSON.parse(
    JSON.stringify(sourceIndex)
  );
changedPredictionSource.predictions[0]
  .prediction.practicalTickets[0]
  .category = "押さえ";
const changedPredictionArtifacts =
  buildArtifacts(
    changedPredictionSource,
    {
      targetBytes: 5_000,
      maxBytes: 8_000
    }
  );
assert.notEqual(
  changedPredictionArtifacts.manifest
    .generationId,
  artifacts.manifest.generationId
);
COLLECTIONS.filter(
  collection =>
    collection !== "predictions"
).forEach(collection => {
  assert.deepEqual(
    changedPredictionArtifacts.manifest
      .collections[collection].shards
      .map(item => item.path),
    artifacts.manifest.collections[
      collection
    ].shards.map(item => item.path),
    `${collection}が不変ならshardを再利用する`
  );
});

const directory = fs.mkdtempSync(
  path.join(
    os.tmpdir(),
    "chappy-index-shards-"
  )
);

try {
  const daily = {
    date: "20260808",
    runs: sourceIndex.runs,
    predictions:
      sourceIndex.predictions,
    verificationPredictions:
      sourceIndex
        .verificationPredictions,
    shadowV2Predictions:
      sourceIndex
        .shadowV2Predictions
  };
  fs.writeFileSync(
    path.join(
      directory,
      "20260808.json"
    ),
    JSON.stringify(daily),
    "utf8"
  );
  const legacyPath = path.join(
    directory,
    "index.json"
  );
  fs.writeFileSync(
    legacyPath,
    "LEGACY-FROZEN\n",
    "utf8"
  );

  const first =
    writePredictionIndexShards(
      directory,
      {
        targetBytes: 5_000,
        maxBytes: 8_000
      }
    );
  assert.equal(first.changed, true);
  assert.equal(
    fs.readFileSync(
      legacyPath,
      "utf8"
    ),
    "LEGACY-FROZEN\n",
    "旧indexは更新せずfallbackとして凍結する"
  );
  const reconstructed =
    reconstructIndex(
      first.manifestPath
    );
  assert.deepEqual(
    reconstructed,
    first.index,
    "manifestと全shardから圧縮indexを完全再構成する"
  );

  const manifestBefore =
    fs.readFileSync(
      first.manifestPath,
      "utf8"
    );
  const tamperedManifest =
    JSON.parse(manifestBefore);
  tamperedManifest.collections.runs
    .shards[0].firstKey = "broken";
  fs.writeFileSync(
    first.manifestPath,
    JSON.stringify(tamperedManifest) +
      "\n",
    "utf8"
  );
  assert.throws(
    () => reconstructIndex(
      first.manifestPath
    ),
    /shard構造が不一致/,
    "manifestの境界key破損をcommit前に検出する"
  );
  fs.writeFileSync(
    first.manifestPath,
    manifestBefore,
    "utf8"
  );
  const orphanPath = path.join(
    directory,
    "index-shards",
    "orphan.json"
  );
  fs.writeFileSync(
    orphanPath,
    "{}\n",
    "utf8"
  );
  const second =
    writePredictionIndexShards(
      directory,
      {
        targetBytes: 5_000,
        maxBytes: 8_000
      }
    );
  assert.equal(
    second.changed,
    false,
    "入力が同じなら世代ファイルを書き換えない"
  );
  assert.equal(
    fs.readFileSync(
      first.manifestPath,
      "utf8"
    ),
    manifestBefore
  );
  assert.equal(
    fs.existsSync(orphanPath),
    false,
    "同一世代でもmanifest未参照shardを残さない"
  );

  daily.verificationPredictions.push(
    verificationRecord(1000)
  );
  fs.writeFileSync(
    path.join(
      directory,
      "20260808.json"
    ),
    JSON.stringify(daily),
    "utf8"
  );
  const third =
    writePredictionIndexShards(
      directory,
      {
        targetBytes: 5_000,
        maxBytes: 8_000
      }
    );
  assert.equal(third.changed, true);
  assert.notEqual(
    third.manifest.generationId,
    first.manifest.generationId
  );
  assert.deepEqual(
    reconstructIndex(
      third.manifestPath
    ),
    third.index
  );
  assert.equal(
    third.manifest.previousGeneration
      .generationId,
    first.manifest.generationId,
    "直前manifestで取得済みのshardを1世代保持する"
  );
  third.manifest.previousGeneration
    .shards.forEach(descriptor => {
      assert.equal(
        fs.existsSync(
          path.join(
            directory,
            descriptor.path
          )
        ),
        true,
        `${descriptor.path} を直前世代用に保持する`
      );
    });
  const expectedShardNames =
    new Set(
      activeShardPaths(
        third.manifest
      ).map(value =>
        path.basename(value)
      )
    );
  assert.deepEqual(
    fs.readdirSync(
      path.join(
        directory,
        "index-shards"
      )
    ).sort(),
    [...expectedShardNames].sort(),
    "現世代＋直前世代以外のshardを残さない"
  );

  const thirdManifestBefore =
    fs.readFileSync(
      third.manifestPath,
      "utf8"
    );
  const fourth =
    writePredictionIndexShards(
      directory,
      {
        targetBytes: 5_000,
        maxBytes: 8_000
      }
    );
  assert.equal(fourth.changed, false);
  assert.equal(
    fs.readFileSync(
      third.manifestPath,
      "utf8"
    ),
    thirdManifestBefore,
    "同一世代の再実行でも直前世代情報を維持する"
  );

  daily.verificationPredictions.push(
    verificationRecord(1001)
  );
  fs.writeFileSync(
    path.join(
      directory,
      "20260808.json"
    ),
    JSON.stringify(daily),
    "utf8"
  );
  const fifth =
    writePredictionIndexShards(
      directory,
      {
        targetBytes: 5_000,
        maxBytes: 8_000
      }
    );
  assert.equal(fifth.changed, true);
  assert.equal(
    fifth.manifest.previousGeneration
      .generationId,
    third.manifest.generationId,
    "新世代では保持対象を直前1世代へ進める"
  );
  const rotatedShardNames =
    new Set(
      activeShardPaths(
        fifth.manifest
      ).map(value =>
        path.basename(value)
      )
    );
  assert.deepEqual(
    fs.readdirSync(
      path.join(
        directory,
        "index-shards"
      )
    ).sort(),
    [...rotatedShardNames].sort(),
    "2世代前の固有shardを残さない"
  );
} finally {
  fs.rmSync(
    directory,
    { recursive: true, force: true }
  );
}

assert.ok(
  MAX_SHARD_BYTES > 900_000
);
console.log(
  "prediction index shard tests passed"
);
