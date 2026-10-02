"use strict";

const fs = require("node:fs");
const path = require("node:path");
const builder = require("./build-frame-rise-fall-shadow-snapshots");

const root = path.resolve(__dirname, "..");
const archiveFile = path.join(root, "data", "stats", "frame-rise-fall-shadow-snapshot-archive.json");

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(new Date()).replaceAll("-", "");
}

function compactDocument(data = {}, archive = builder.emptyArchive()) {
  const rows = Array.isArray(data.verificationPredictions) ? data.verificationPredictions : [];
  let compactedCount = 0;
  let verifiedCompactCount = 0;
  const verificationPredictions = rows.map(record => {
    const inline = record?.frameRiseFallShadowAb;
    if (!inline || typeof inline !== "object" || inline.status !== "shadow-ready") return record;

    const key = String(inline.immutableArchiveKey || builder.snapshotArchiveKey(record, inline) || "");
    const archived = key && archive?.snapshots?.[key];
    if (!archived) {
      throw new Error(`枠別浮沈Shadowの完全証拠archiveが見つかりません: ${key || record?.raceKey || "unknown"}`);
    }

    if (builder.isCompactInlineSnapshot(inline)) {
      verifiedCompactCount += 1;
      return record;
    }

    compactedCount += 1;
    return {
      ...record,
      frameRiseFallShadowAb: builder.compactInlineSnapshot(record, archived)
    };
  });

  return {
    data: { ...data, verificationPredictions },
    compactedCount,
    verifiedCompactCount
  };
}

function main() {
  const date = String(process.env.PREDICT_DATE || process.argv[2] || getJstDate()).replaceAll("-", "");
  if (!/^\d{8}$/.test(date)) throw new Error(`日付形式異常: ${date}`);
  const file = path.join(root, "data", "predictions", `${date}.json`);
  if (!fs.existsSync(file)) return console.log(`枠別浮沈Shadow inline圧縮対象なし: ${file}`);

  const data = builder.load(file, {});
  const archive = builder.load(archiveFile, builder.emptyArchive());
  const beforeBytes = fs.statSync(file).size;
  const result = compactDocument(data, archive);
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(result.data) + "\n", "utf8");
  fs.renameSync(temp, file);
  const afterBytes = fs.statSync(file).size;
  console.log(
    `枠別浮沈Shadow inline圧縮: ${result.compactedCount}件変換` +
    `／既圧縮${result.verifiedCompactCount}件確認` +
    `／${beforeBytes} → ${afterBytes} bytes`
  );
}

if (require.main === module) main();
module.exports = { compactDocument, main };
