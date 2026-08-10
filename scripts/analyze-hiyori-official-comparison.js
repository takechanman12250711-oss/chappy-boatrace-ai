#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const inputContract = require("./analysis-input-contract");

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
  return fs.readdirSync(targetPath, { withFileTypes: true })
    .flatMap(entry => readJsonFiles(path.join(targetPath, entry.name)));
}

function flattenRecords(value, file) {
  return inputContract.flattenInputRecords(value, file);
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boatNo(entry, index) {
  return Number(entry?.boatNo || entry?.no || entry?.waku || entry?.course || index + 1);
}

function entriesOf(record, options = {}) {
  const entries = inputContract.referenceTagInput(record, options).entries;
  return Array.isArray(entries) ? entries : [];
}

function finishOrder(record) {
  return inputContract.finishOrder(record);
}

function hasHiyori(record, options = {}) {
  return inputContract.hasExplicitHiyoriSource(record, options);
}

function bestBoat(entries, keys, lowerIsBetter) {
  const candidates = entries.map((entry, index) => {
    let value = null;
    for (const key of keys) {
      const raw = key.split(".").reduce((current, part) => current?.[part], entry);
      value = num(raw);
      if (value !== null) break;
    }
    return { boat: boatNo(entry, index), value };
  }).filter(item => item.boat >= 1 && item.boat <= 6 && item.value !== null);

  if (candidates.length < 3) return null;
  candidates.sort((a, b) => lowerIsBetter ? a.value - b.value : b.value - a.value);
  return candidates[0];
}

const METRICS = [
  { key: "exhibition", label: "展示タイム", keys: ["exhibitionTime", "exTime", "exhibition.time", "displayTime"], lower: true },
  { key: "lap", label: "一周タイム", keys: ["lapTime", "lap", "turnTime", "exhibition.lapTime"], lower: true },
  { key: "start", label: "ST", keys: ["currentST", "exhibitionST", "st", "avgST", "avgSt", "averageST"], lower: true },
  { key: "local", label: "当地実績", keys: ["localWinRate", "localRate", "venueRate", "local.winRate", "local.rate"], lower: false }
];

function analyze(records, options = {}) {
  const strictFrozenInputs = options.strictFrozenInputs === true;
  const rows = records.filter(record =>
    hasHiyori(record, { strictFrozenInputs }) && finishOrder(record).length >= 3
  );
  const stats = Object.fromEntries(METRICS.map(metric => [metric.key, {
    key: metric.key,
    label: metric.label,
    samples: 0,
    winnerHits: 0,
    top3Hits: 0
  }]));

  for (const record of rows) {
    const order = finishOrder(record);
    const entries = entriesOf(record, { strictFrozenInputs });
    for (const metric of METRICS) {
      const best = bestBoat(entries, metric.keys, metric.lower);
      if (!best) continue;
      const item = stats[metric.key];
      item.samples += 1;
      if (order[0] === best.boat) item.winnerHits += 1;
      if (order.includes(best.boat)) item.top3Hits += 1;
    }
  }

  const metrics = Object.values(stats).map(item => ({
    ...item,
    winnerRate: item.samples ? Number((item.winnerHits / item.samples * 100).toFixed(1)) : 0,
    top3Rate: item.samples ? Number((item.top3Hits / item.samples * 100).toFixed(1)) : 0,
    status: item.samples < 20 ? "データ不足" : item.top3Hits / item.samples >= 0.55 ? "参考度高" : item.top3Hits / item.samples >= 0.35 ? "参考" : "要検証"
  }));

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    matchedRaceCount: rows.length,
    sourceStatus: rows.length ? "ready" : "source_data_unavailable",
    analysisMode: strictFrozenInputs
      ? "frozen-pre-deadline-inputs-only"
      : "provided-records",
    explicitHiyoriRaceCount: records.filter(record =>
      hasHiyori(record, { strictFrozenInputs })
    ).length,
    inputDiagnostics: options.inputDiagnostics || null,
    causalClaim: false,
    usableForPrediction: false,
    automaticApplication: false,
    note: rows.length
      ? strictFrozenInputs
        ? "明示的にボートレース日和由来と保存された締切前データを公式結果と比較。相関確認専用で、予想ロジックには自動反映しない。"
        : "入力レコード内で日和由来と明示されたデータを公式結果と比較。予想ロジックには自動反映しない。"
      : "公式結果と結合可能な予想はあるが、日和由来と確認できる保存データがないため未集計。公式データを日和データとして代用しない。",
    metrics
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : "data/analysis/hiyori-official-comparison.json";
  const inputs = args.filter((arg, index) => arg !== "--output" && index !== outputIndex + 1);
  let report;
  if (inputs.length) {
    const records = inputs.flatMap(input =>
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
  console.log(`hiyori comparison: ${report.matchedRaceCount} races -> ${output}`);
}

if (require.main === module) main();
module.exports = {
  analyze,
  bestBoat,
  entriesOf,
  finishOrder,
  flattenRecords,
  hasHiyori
};
