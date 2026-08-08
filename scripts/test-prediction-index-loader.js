"use strict";

const assert = require("node:assert/strict");
const {
  buildArtifacts
} = require(
  "./build-prediction-index-shards"
);
const loader = require(
  "../js/prediction-index-loader"
);

const sourceIndex = {
  schemaVersion: 4,
  generatedAt:
    "2026-08-08T00:00:00Z",
  sourceFileCount: 1,
  sourceRecordCounts: {
    runs: 1,
    predictions: 1,
    verificationPredictions: 3,
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
  predictions: [{
    raceKey: "20260808-12-1",
    date: "20260808",
    jcd: "12",
    place: "住之江",
    raceNo: 1,
    selectedAt:
      "2026-08-08T00:00:00Z",
    prediction: {
      practicalTickets: [{
        ticket: "1-2-3",
        category: "本線"
      }]
    }
  }],
  verificationPredictions: [
    1,
    2,
    3
  ].map(raceNo => ({
    raceKey:
      `20260808-12-${raceNo}`,
    date: "20260808",
    jcd: "12",
    place: "住之江",
    raceNo,
    selectedAt:
      `2026-08-08T00:0${raceNo}:00Z`,
    prediction: {
      practicalTickets: [{
        ticket: "1-2-3",
        category: "本線"
      }]
    }
  })),
  shadowV2Predictions: [{
    recordKey: "shadow-1",
    raceKey: "20260808-12-1",
    capturedAt:
      "2026-08-08T00:00:00Z"
  }]
};

const artifacts = buildArtifacts(
  sourceIndex,
  {
    targetBytes: 700,
    maxBytes: 1_200
  }
);
const manifestUrl =
  "data/predictions/index-manifest.json";
const legacyUrl =
  "data/predictions/index.json";
const responses = new Map([
  [manifestUrl, artifacts.manifest],
  [legacyUrl, { legacy: true }]
]);
artifacts.shards.forEach(item => {
  responses.set(
    `data/predictions/${item.descriptor.path}`,
    item.payload
  );
});

function requestFrom(map) {
  return async url => {
    const clean = String(url).split("?")[0];
    if (!map.has(clean)) {
      return {
        response: {
          ok: false,
          status: 404
        },
        payload: null
      };
    }
    return {
      response: {
        ok: true,
        status: 200
      },
      payload:
        JSON.parse(
          JSON.stringify(map.get(clean))
        )
    };
  };
}

(async () => {
  const loaded =
    await loader.loadPredictionIndex({
      requestJson:
        requestFrom(responses),
      manifestUrl,
      legacyUrl
    });
  assert.equal(loaded.source, "manifest");
  assert.equal(
    loaded.generationId,
    artifacts.manifest.generationId
  );
  assert.deepEqual(
    loaded.data,
    artifacts.index,
    "全shardの検証後だけ元indexを再構成する"
  );

  const missingShard = new Map(responses);
  missingShard.delete(
    `data/predictions/${artifacts.shards[0].descriptor.path}`
  );
  const fallback =
    await loader.loadPredictionIndex({
      requestJson:
        requestFrom(missingShard),
      manifestUrl,
      legacyUrl
    });
  assert.equal(fallback.source, "legacy");
  assert.deepEqual(
    fallback.data,
    { legacy: true },
    "一部shardだけを表示せずlegacy全体へfallbackする"
  );
  assert.match(
    fallback.fallbackReason,
    /HTTP 404/
  );

  const invalidShard =
    new Map(responses);
  const descriptor =
    artifacts.shards[0].descriptor;
  invalidShard.set(
    `data/predictions/${descriptor.path}`,
    {
      ...artifacts.shards[0].payload,
      collection: "broken"
    }
  );
  const invalidFallback =
    await loader.loadPredictionIndex({
        requestJson:
          requestFrom(invalidShard),
      manifestUrl,
      legacyUrl
    });
  assert.equal(
    invalidFallback.source,
    "legacy",
    "shard fingerprint不一致でも部分表示しない"
  );

  const manifestMissing =
    new Map([
      [legacyUrl, { legacy: true }]
    ]);
  const oldDeployment =
    await loader.loadPredictionIndex({
      requestJson:
        requestFrom(manifestMissing),
      manifestUrl,
      legacyUrl
    });
  assert.equal(oldDeployment.source, "legacy");

  await assert.rejects(
    () => loader.loadPredictionIndex({
      requestJson:
        requestFrom(new Map()),
      manifestUrl,
      legacyUrl
    }),
    /manifestとlegacy index/,
    "新旧両方の失敗を正常扱いしない"
  );

  assert.throws(
    () => loader.shardUrl(
      manifestUrl,
      "../index.json",
      artifacts.manifest.generationId
    ),
    /パスが不正/,
    "manifestから予想data外を読まない"
  );

  console.log(
    "prediction index loader tests passed"
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
