#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const referenceTags = require("../js/reference-tags.js");
const inputContract = require("./analysis-input-contract");

const AGGREGATE_LABELS = {
  exhibition: "展示タイム上位艇",
  lap: "一周タイム上位艇",
  start: "ST上位艇",
  local: "当地実績上位艇",
  wind: "強風注意",
  wave: "波高注意",
  "new-engine": "新エンジン期",
  "new-fuel": "新燃料使用期",
  "combined-odds": "合成オッズ取得済み",
  "hiyori-source": "日和データあり"
};

function readJsonFiles(targetPath) {
  if (!fs.existsSync(targetPath)) return [];
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    if (!targetPath.endsWith(".json")) return [];
    try {
      return [{ file: targetPath, value: JSON.parse(fs.readFileSync(targetPath, "utf8")) }];
    } catch (error) {
      console.warn(`[skip] ${targetPath}: ${error.message}`);
      return [];
    }
  }
  return fs.readdirSync(targetPath, { withFileTypes: true }).flatMap(entry =>
    readJsonFiles(path.join(targetPath, entry.name))
  );
}

function flattenRecords(value, file) {
  return inputContract.flattenInputRecords(value, file);
}

function raceKey(record) {
  return inputContract.raceKey(record);
}

function normalizeTicket(value) {
  return inputContract.normalizeTicket(value);
}

function actualTicket(record) {
  return inputContract.actualTicket(record);
}

function extractTags(record, options = {}) {
  let raw = [];
  if (options.strictFrozenInputs !== true) {
    const sources = [
      record.referenceTags,
      record.tags,
      record.prediction?.referenceTags,
      record.prediction?.tags,
      record.analysis?.referenceTags
    ];
    raw = sources.find(Array.isArray) || [];
  }

  if (!raw.length && referenceTags && typeof referenceTags.build === "function") {
    try {
      raw = referenceTags.build(inputContract.referenceTagInput(record, options));
    } catch (error) {
      console.warn(`[tag-skip] ${record.__file || raceKey(record)}: ${error.message}`);
      raw = [];
    }
  }

  return raw.map(item => {
    if (typeof item === "string") return { key: item, label: item, strength: 1 };
    return {
      key: item.key || item.id || item.label || "unknown",
      label: item.label || item.key || item.id || "unknown",
      strength: Number(item.strength || item.level || 1)
    };
  });
}

function predictedTickets(record) {
  const prediction = record.prediction || record;
  const lists = [
    prediction.practicalTickets,
    prediction.practicalSelection?.tickets,
    prediction.practicalSelection,
    prediction.tickets,
    prediction.ticketRanking,
    prediction.bets,
    prediction.mainTickets,
    prediction.recommendedTickets
  ].filter(Array.isArray);

  return lists.flat().map(item => normalizeTicket(
    typeof item === "string" ? item : item.ticket || item.combination || item.bet
  )).filter(Boolean);
}

function topBoatFromTag(tag) {
  const match = String(tag.label || "").match(/([1-6])号艇/);
  return match ? Number(match[1]) : null;
}

function analyze(records, options = {}) {
  const strictFrozenInputs = options.strictFrozenInputs === true;
  const settled = records.filter(record => actualTicket(record));
  const matched = settled
    .map(record => ({
      record,
      tags: extractTags(record, { strictFrozenInputs })
    }))
    .filter(item => item.tags.length);
  const stats = new Map();

  for (const { record, tags } of matched) {
    const actual = actualTicket(record);
    const winner = Number(actual.split("-")[0]);
    const podium = actual.split("-").map(Number);
    const tickets = predictedTickets(record);
    const ticketHit = tickets.includes(actual);

    for (const tag of tags) {
      if (!stats.has(tag.key)) {
        stats.set(tag.key, {
          key: tag.key,
          label: AGGREGATE_LABELS[tag.key] || tag.label,
          samples: 0,
          targetSamples: 0,
          winnerHits: 0,
          top3Hits: 0,
          ticketHits: 0,
          strengthTotal: 0
        });
      }
      const item = stats.get(tag.key);
      const boat = topBoatFromTag(tag);
      item.samples += 1;
      item.strengthTotal += tag.strength;
      if (boat) {
        item.targetSamples += 1;
        if (winner === boat) item.winnerHits += 1;
        if (podium.includes(boat)) item.top3Hits += 1;
      }
      if (ticketHit) item.ticketHits += 1;
    }
  }

  const tags = Array.from(stats.values()).map(item => {
    const targetRates = item.targetSamples
      ? {
          winnerRate: Number((item.winnerHits / item.targetSamples * 100).toFixed(1)),
          top3Rate: Number((item.top3Hits / item.targetSamples * 100).toFixed(1))
        }
      : {};
    const status = item.targetSamples
      ? item.targetSamples < 20
        ? "データ不足"
        : item.top3Hits / item.targetSamples >= 0.55
          ? "参考度高"
          : item.top3Hits / item.targetSamples >= 0.35
            ? "参考"
            : "要検証"
      : item.samples < 20
        ? "データ不足"
        : "参考条件";
    return {
      ...item,
      ...targetRates,
      ticketHitRate: item.samples
        ? Number((item.ticketHits / item.samples * 100).toFixed(1))
        : 0,
      averageStrength: item.samples
        ? Number((item.strengthTotal / item.samples).toFixed(2))
        : 0,
      status
    };
  }).sort((left, right) =>
    right.samples - left.samples ||
    Number(right.top3Rate || 0) - Number(left.top3Rate || 0)
  );

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    matchedRaceCount: matched.length,
    settledRaceCount: settled.length,
    taggedRaceCount: matched.length,
    untaggedRaceCount: settled.length - matched.length,
    tagCount: tags.length,
    sourceStatus: matched.length ? "ready" : "no_tagged_races",
    cohort: "predictions-preferred-over-verificationPredictions",
    analysisMode: strictFrozenInputs
      ? "reconstructed-from-frozen-pre-deadline-inputs"
      : "provided-or-reconstructed-records",
    inputDiagnostics: options.inputDiagnostics || null,
    causalClaim: false,
    usableForPrediction: false,
    automaticApplication: false,
    note: strictFrozenInputs
      ? "締切前に固定保存された入力だけから現在の参考タグ定義を再構築し、公式結果と照合した相関集計。因果関係の証明ではなく、予想ロジック・印・買い目には自動反映しない。"
      : "入力レコードの参考タグを公式結果と照合した相関集計。因果関係の証明ではなく、予想ロジック・印・買い目には自動反映しない。",
    tags
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : "data/analysis/reference-tag-effectiveness.json";
  const inputArgs = args.filter((arg, index) => arg !== "--output" && index !== outputIndex + 1);
  let report;
  if (inputArgs.length) {
    const records = inputArgs.flatMap(input =>
      readJsonFiles(input).flatMap(item => flattenRecords(item.value, item.file))
    );
    const cohort = inputContract.buildCohortFromRecords(records);
    report = analyze(cohort.records, {
      inputDiagnostics: cohort.diagnostics,
      strictFrozenInputs: true
    });
  } else {
    const cohort = inputContract.buildDefaultCohort();
    report = analyze(cohort.records, {
      inputDiagnostics: cohort.diagnostics,
      strictFrozenInputs: true
    });
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`reference-tag analysis: ${report.matchedRaceCount} races / ${report.tagCount} tags -> ${output}`);
}

if (require.main === module) main();
module.exports = {
  analyze,
  actualTicket,
  extractTags,
  flattenRecords,
  predictedTickets,
  raceKey
};
