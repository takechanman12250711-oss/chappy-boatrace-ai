/* =========================================================
  分割された自動予想indexを検証して再構成する。
  読込失敗時は凍結済みlegacy indexへ全体fallbackする。
========================================================= */

(function (root, factory) {
  const api = factory(root);
  if (
    typeof module === "object" &&
    module.exports
  ) {
    module.exports = api;
  }
  if (root) {
    root.ChappyPredictionIndexLoader =
      api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function (root) {
    "use strict";

    const MANIFEST_SCHEMA_VERSION = 1;
    const SHARD_SCHEMA_VERSION = 1;
    const COLLECTIONS = [
      "runs",
      "predictions",
      "verificationPredictions",
      "shadowV2Predictions"
    ];

    function recordKey(record) {
      return String(
        record?.runKey ||
        record?.recordKey ||
        record?.raceKey ||
        ""
      );
    }

    function assertManifest(manifest) {
      if (
        manifest?.format !==
          "chappy-prediction-index-manifest" ||
        Number(
          manifest.manifestSchemaVersion
        ) !== MANIFEST_SCHEMA_VERSION ||
        !/^[a-f0-9]{64}$/.test(
          String(
            manifest.generationId || ""
          )
        )
      ) {
        throw new Error(
          "自動予想index manifestが不正です"
        );
      }
      return manifest;
    }

    function cleanManifestUrl(value) {
      return String(value || "")
        .split("#")[0]
        .split("?")[0];
    }

    function shardUrl(
      manifestUrl,
      relativePath,
      shardId
    ) {
      const relative = String(
        relativePath || ""
      );
      if (
        !/^index-shards\/[a-zA-Z0-9._-]+\.json$/.test(
          relative
        )
      ) {
        throw new Error(
          "自動予想index shardのパスが不正です"
        );
      }
      const clean = cleanManifestUrl(
        manifestUrl
      );
      const slash = clean.lastIndexOf("/");
      const base =
        slash >= 0
          ? clean.slice(0, slash + 1)
          : "";
      return (
        `${base}${relative}` +
        `?v=${encodeURIComponent(
          shardId
        )}`
      );
    }

    async function requestPayload(
      requestJson,
      url
    ) {
      const result = await requestJson(url);
      const response = result?.response;
      if (!response?.ok) {
        throw new Error(
          `HTTP ${response?.status || 0}: ${url}`
        );
      }
      return result?.payload;
    }

    function generationSource(index) {
      return {
        ...index,
        generatedAt: ""
      };
    }

    async function sha256Text(value) {
      const subtle = root?.crypto?.subtle;
      const Encoder = root?.TextEncoder;
      if (
        !subtle ||
        typeof Encoder !== "function"
      ) {
        return "";
      }
      const bytes = new Encoder().encode(
        String(value)
      );
      const digest = await subtle.digest(
        "SHA-256",
        bytes
      );
      return Array.from(
        new Uint8Array(digest)
      ).map(value =>
        value.toString(16).padStart(2, "0")
      ).join("");
    }

    async function generationIdFor(
      index
    ) {
      return sha256Text(
        JSON.stringify(
          generationSource(index)
        )
      );
    }

    async function shardIdFor(payload) {
      return sha256Text(
        JSON.stringify(payload) + "\n"
      );
    }

    function sortedDescriptors(
      manifest,
      collection
    ) {
      const info =
        manifest.collections?.[collection];
      if (
        !info ||
        !Number.isInteger(
          Number(info.count)
        ) ||
        !Array.isArray(info.shards)
      ) {
        throw new Error(
          `${collection}のmanifestが不正です`
        );
      }
      return info.shards
        .slice()
        .sort(
          (a, b) =>
            Number(a?.order || 0) -
            Number(b?.order || 0)
        );
    }

    function validateShard(
      manifest,
      collection,
      descriptor,
      order,
      expectedOffset,
      payload,
      calculatedShardId
    ) {
      const records = payload?.records;
      if (
        Number(payload?.schemaVersion) !==
          SHARD_SCHEMA_VERSION ||
        !/^[a-f0-9]{64}$/.test(
          String(
            descriptor?.shardId || ""
          )
        ) ||
        (
          calculatedShardId &&
          calculatedShardId !==
            descriptor.shardId
        ) ||
        payload?.collection !==
          collection ||
        Number(descriptor?.order) !==
          order ||
        Number(descriptor?.offset) !==
          expectedOffset ||
        Number(payload?.offset) !==
          expectedOffset ||
        !Array.isArray(records) ||
        Number(descriptor?.count) !==
          records.length ||
        Number(payload?.count) !==
          records.length ||
        (
          records.length > 0 &&
          (
            descriptor?.firstKey !==
              recordKey(records[0]) ||
            descriptor?.lastKey !==
              recordKey(
                records[
                  records.length - 1
                ]
              )
          )
        )
      ) {
        throw new Error(
          `自動予想index shardが不正です: ${descriptor?.path || ""}`
        );
      }
      return records;
    }

    async function reconstructFromManifest(
      manifest,
      manifestUrl,
      requestJson
    ) {
      assertManifest(manifest);
      const jobs = [];
      COLLECTIONS.forEach(collection => {
        sortedDescriptors(
          manifest,
          collection
        ).forEach(
          (descriptor, order) => {
            jobs.push({
              collection,
              descriptor,
              order,
              promise: requestPayload(
                requestJson,
                shardUrl(
                  manifestUrl,
                  descriptor?.path,
                  descriptor?.shardId
                )
              )
            });
          }
        );
      });

      const payloads = await Promise.all(
        jobs.map(job => job.promise)
      );
      const calculatedShardIds =
        await Promise.all(
          payloads.map(shardIdFor)
        );
      const collections = {};
      COLLECTIONS.forEach(collection => {
        const records = [];
        jobs.forEach((job, index) => {
          if (
            job.collection !== collection
          ) {
            return;
          }
          records.push(
            ...validateShard(
              manifest,
              collection,
              job.descriptor,
              job.order,
              records.length,
              payloads[index],
              calculatedShardIds[index]
            )
          );
        });
        if (
          records.length !==
          Number(
            manifest.collections
              ?.[collection]?.count || 0
          )
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
          manifest
            .quarantinedRecordCounts || {},
        retentionLimits:
          manifest.retentionLimits || {},
        ...collections
      };
      const calculatedGeneration =
        await generationIdFor(index);
      if (
        calculatedGeneration &&
        calculatedGeneration !==
          manifest.generationId
      ) {
        throw new Error(
          "自動予想indexのfingerprintが不一致です"
        );
      }
      return index;
    }

    async function loadPredictionIndex(
      options = {}
    ) {
      const requestJson =
        options.requestJson;
      const manifestUrl = String(
        options.manifestUrl ||
        "data/predictions/index-manifest.json"
      );
      const legacyUrl = String(
        options.legacyUrl ||
        "data/predictions/index.json"
      );
      if (
        typeof requestJson !== "function"
      ) {
        throw new TypeError(
          "requestJsonが必要です"
        );
      }

      let manifestError = null;
      try {
        const manifest =
          await requestPayload(
            requestJson,
            manifestUrl
          );
        const data =
          await reconstructFromManifest(
            manifest,
            manifestUrl,
            requestJson
          );
        return {
          data,
          source: "manifest",
          generationId:
            manifest.generationId,
          fallbackReason: ""
        };
      } catch (error) {
        manifestError = error;
      }

      try {
        const data = await requestPayload(
          requestJson,
          legacyUrl
        );
        return {
          data,
          source: "legacy",
          generationId: "",
          fallbackReason:
            String(
              manifestError?.message ||
              manifestError ||
              "manifest unavailable"
            )
        };
      } catch (legacyError) {
        const combined = new Error(
          "自動予想履歴のmanifestとlegacy indexを読み込めません"
        );
        combined.manifestError =
          manifestError;
        combined.legacyError =
          legacyError;
        throw combined;
      }
    }

    return Object.freeze({
      MANIFEST_SCHEMA_VERSION,
      SHARD_SCHEMA_VERSION,
      COLLECTIONS:
        COLLECTIONS.slice(),
      assertManifest,
      shardUrl,
      generationIdFor,
      shardIdFor,
      reconstructFromManifest,
      loadPredictionIndex
    });
  }
);
