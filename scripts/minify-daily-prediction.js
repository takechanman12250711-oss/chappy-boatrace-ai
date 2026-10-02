"use strict";

const fs = require("node:fs");
const path = require("node:path");

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  }).format(new Date()).replaceAll("-", "");
}

function normalizeDate(value) {
  const date = String(value || "")
    .replaceAll("-", "")
    .replaceAll("/", "");
  if (!/^\d{8}$/.test(date)) {
    throw new Error(`日付はYYYYMMDD形式で指定してください：${value}`);
  }
  return date;
}

function minifyJsonFile(filePath) {
  const before = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(before);
  const after = JSON.stringify(parsed) + "\n";
  fs.writeFileSync(filePath, after, "utf8");
  return {
    beforeBytes: Buffer.byteLength(before, "utf8"),
    afterBytes: Buffer.byteLength(after, "utf8")
  };
}

function main() {
  const date = normalizeDate(
    process.env.PREDICT_DATE || process.argv[2] || getJstDate()
  );
  const filePath = path.join(
    process.cwd(),
    "data",
    "predictions",
    `${date}.json`
  );
  if (!fs.existsSync(filePath)) {
    console.log(`日次予想JSONのminify対象なし：${filePath}`);
    return;
  }
  const result = minifyJsonFile(filePath);
  const saved = result.beforeBytes - result.afterBytes;
  const ratio = result.beforeBytes
    ? Math.round(result.afterBytes / result.beforeBytes * 1000) / 10
    : 0;
  console.log(
    `日次予想JSON minify：${result.beforeBytes} → ${result.afterBytes} bytes` +
    `（削減${saved} bytes／${ratio}%）`
  );
}

if (require.main === module) main();

module.exports = {
  normalizeDate,
  minifyJsonFile
};
