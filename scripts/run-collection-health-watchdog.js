"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildReport } = require("../js/collection-health");
const watchdog = require("./collection-health-watchdog");

function jstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  }).format(new Date()).replaceAll("-", "");
}

function main() {
  const date = String(process.env.PREDICT_DATE || jstDate()).replace(/[-/]/g, "");
  const file = path.join(process.cwd(), "data", "predictions", `${date}.json`);

  if (!fs.existsSync(file)) {
    console.log(`監視対象なし: ${file}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const report = buildReport(data);
  const result = watchdog.evaluate(report);

  console.log(JSON.stringify({ date, report, watchdog: result }, null, 2));

  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## 自動収集監視\n\n- 日付: ${date}\n- 状態: ${result.severity}\n- ${result.summary}\n- 監視対象: ${report.monitoredCount}\n- 保存済み: ${report.savedCount}\n- 未収集: ${report.missingCount}\n\n`
    );
  }

  if (result.shouldNotify) {
    console.error(`::error title=自動収集異常::${result.summary}`);
    process.exitCode = 2;
  }
}

main();
