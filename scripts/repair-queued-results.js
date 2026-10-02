"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  isCompleteResultFile,
  refreshOfficialResultFile
} = require("./repair-recent-results");

const QUEUE_VERSION = "result-repair-queue-v1";
const HARD_MAX_ENTRIES = 5;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateQueue(queue) {
  if (queue?.version !== QUEUE_VERSION) {
    throw new Error(`結果修復キューのversionが不正です：${queue?.version || "missing"}`);
  }

  const configuredMax = Number(queue?.maxEntries);
  if (!Number.isInteger(configuredMax) || configuredMax < 1 || configuredMax > HARD_MAX_ENTRIES) {
    throw new Error(`結果修復キューのmaxEntriesは1〜${HARD_MAX_ENTRIES}で指定してください`);
  }

  const entries = Array.isArray(queue?.entries) ? queue.entries : [];
  if (entries.length > configuredMax) {
    throw new Error(`結果修復キューが上限${configuredMax}件を超えています`);
  }

  const seen = new Set();
  return entries.map((entry, index) => {
    const date = String(entry?.date || "");
    if (!/^\d{8}$/.test(date)) {
      throw new Error(`結果修復キュー${index + 1}件目の日付が不正です：${date}`);
    }
    if (seen.has(date)) {
      throw new Error(`結果修復キューの日付が重複しています：${date}`);
    }
    seen.add(date);
    return {
      date,
      enabled: entry?.enabled === true,
      reason: String(entry?.reason || "").trim()
    };
  });
}

function assertRepairableResultFile(resultPath, date) {
  if (!fs.existsSync(resultPath)) {
    throw new Error(`${date}：既存結果ファイルがないため限定修復を開始しません`);
  }

  const result = readJson(resultPath);
  if (result?.source !== "boatrace-official" || String(result?.date || "") !== date) {
    throw new Error(`${date}：既存結果ファイルの入力契約が不正です`);
  }
  if (Number(result?.raceCount || 0) < 1) {
    throw new Error(`${date}：既存結果ファイルのレース件数が不正です`);
  }
  if (Number(result?.pendingRaces || 0) < 1 && Number(result?.failedRaces || 0) < 1) {
    throw new Error(`${date}：未確定・失敗レースがない不完全ファイルは自動修復しません`);
  }
}

function repairQueuedResults(root = process.cwd(), options = {}) {
  const configPath = options.configPath || path.join(root, "config", "result-repair-queue.json");
  const entries = validateQueue(readJson(configPath));
  const resultsDirectory = path.join(root, "data", "results");
  const repaired = [];
  const skippedComplete = [];

  for (const entry of entries) {
    if (!entry.enabled) continue;
    const resultPath = path.join(resultsDirectory, `${entry.date}.json`);

    if (isCompleteResultFile(resultPath, entry.date)) {
      skippedComplete.push(entry.date);
      continue;
    }

    assertRepairableResultFile(resultPath, entry.date);
    refreshOfficialResultFile(resultPath, entry.date, options.runner);

    if (!isCompleteResultFile(resultPath, entry.date)) {
      throw new Error(`${entry.date}：限定再取得後も公式結果が未完成です`);
    }
    repaired.push(entry.date);
  }

  console.log(JSON.stringify({
    queueVersion: QUEUE_VERSION,
    configured: entries.length,
    repaired,
    skippedComplete
  }));
  return { repaired, skippedComplete };
}

if (require.main === module) {
  try {
    repairQueuedResults();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  HARD_MAX_ENTRIES,
  QUEUE_VERSION,
  assertRepairableResultFile,
  repairQueuedResults,
  validateQueue
};
