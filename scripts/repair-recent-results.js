// scripts/repair-recent-results.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RECENT_DAY_COUNT = 3;

function readArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));

  return String(
    argument?.slice(prefix.length) ||
    process.env.COLLECT_DATE ||
    ""
  ).trim();
}

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(new Date())
    .replaceAll("-", "");
}

function normalizeDateKey(value) {
  const date = String(value || getJstDate())
    .replaceAll("-", "")
    .replaceAll("/", "");

  if (!/^\d{8}$/.test(date)) {
    throw new Error(`日付はYYYYMMDD形式で指定してください：${value}`);
  }

  const parsed = new Date(Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)) - 1,
    Number(date.slice(6, 8))
  ));

  if (formatDateKey(parsed) !== date) {
    throw new Error(`正しい日付を指定してください：${value}`);
  }

  return date;
}

function formatDateKey(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("");
}

function getRecentDateKeys(anchorDate, count = RECENT_DAY_COUNT) {
  const anchor = normalizeDateKey(anchorDate);
  const date = new Date(Date.UTC(
    Number(anchor.slice(0, 4)),
    Number(anchor.slice(4, 6)) - 1,
    Number(anchor.slice(6, 8))
  ));
  const dates = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const target = new Date(date.getTime());
    target.setUTCDate(target.getUTCDate() - offset);
    dates.push(formatDateKey(target));
  }

  return dates;
}

function isCompleteResultFile(filePath, date) {
  if (!fs.existsSync(filePath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const raceCount = Number(data?.raceCount || 0);
    const completedRaces = Number(data?.completedRaces || 0);

    return (
      data?.source === "boatrace-official" &&
      String(data?.date || "") === date &&
      raceCount > 0 &&
      data?.complete === true &&
      completedRaces === raceCount &&
      Number(data?.pendingRaces || 0) === 0 &&
      Number(data?.failedRaces || 0) === 0
    );
  } catch (error) {
    console.warn(
      `既存ファイルを再取得します：${date} (${error?.message || error})`
    );
    return false;
  }
}

function hasUnsettledPredictions(predictionPath) {
  if (!fs.existsSync(predictionPath)) return false;

  try {
    const data = JSON.parse(fs.readFileSync(predictionPath, "utf8"));
    const predictions = [
      ...(Array.isArray(data?.predictions) ? data.predictions : []),
      ...(Array.isArray(data?.verificationPredictions)
        ? data.verificationPredictions
        : [])
    ];

    return predictions.some(prediction => !prediction?.result?.settled);
  } catch (error) {
    console.warn(
      `予想ファイルを確認できません：${predictionPath} (${error?.message || error})`
    );
    return false;
  }
}

function runNodeScript(scriptName, args = []) {
  const scriptPath = path.join(process.cwd(), "scripts", scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${scriptName}が終了コード${result.status}で失敗しました`);
  }
}

function main() {
  const anchorDate = normalizeDateKey(readArgument("date"));
  const dates = getRecentDateKeys(anchorDate);
  const resultsDirectory = path.join(process.cwd(), "data", "results");
  const predictionsDirectory = path.join(process.cwd(), "data", "predictions");
  const repairedDates = [];
  const matchedDates = [];

  console.log(`直近${dates.length}日間の公式結果を確認します：${dates.join(", ")}`);

  for (const date of dates) {
    const resultPath = path.join(resultsDirectory, `${date}.json`);
    const predictionPath = path.join(predictionsDirectory, `${date}.json`);

    if (isCompleteResultFile(resultPath, date)) {
      console.log(`${date}：公式結果は完成済みです`);
    } else {
      console.log(`${date}：未完成のため公式結果を再取得します`);
      runNodeScript("collect-results.js", [`--date=${date}`]);
      repairedDates.push(date);
    }

    if (
      isCompleteResultFile(resultPath, date) &&
      hasUnsettledPredictions(predictionPath)
    ) {
      console.log(`${date}：未照合の事前予想を公式結果と照合します`);
      runNodeScript("match-predictions.js", [`--date=${date}`]);
      matchedDates.push(date);
    }
  }

  if (!repairedDates.length && !matchedDates.length) {
    console.log("直近3日間の公式結果・予想照合はすべて完成済みです");
    return;
  }

  runNodeScript("build-prediction-index.js");
  runNodeScript("build-prediction-calibration.js");
  runNodeScript("build-race-stats.js");

  if (repairedDates.length) {
    console.log(`公式結果の自動復旧完了：${repairedDates.join(", ")}`);
  }
  if (matchedDates.length) {
    console.log(`事前予想の自動照合完了：${matchedDates.join(", ")}`);
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  normalizeDateKey,
  formatDateKey,
  getRecentDateKeys,
  isCompleteResultFile,
  hasUnsettledPredictions
};
