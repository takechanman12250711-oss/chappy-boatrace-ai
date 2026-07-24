#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUTS = ["data/predictions", "data/results", "data/history", "public/data"];

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
  if (Array.isArray(value)) return value.flatMap(item => flattenRecords(item, file));
  if (!value || typeof value !== "object") return [];
  for (const key of ["records", "predictions", "results", "races", "items", "data"]) {
    if (Array.isArray(value[key])) return value[key].flatMap(item => flattenRecords(item, file));
  }
  return [{ ...value, __file: file }];
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boatNo(entry, index) {
  return Number(entry?.boatNo || entry?.no || entry?.waku || entry?.course || index + 1);
}

function entriesOf(record) {
  const prediction = record.prediction || record;
  const race = prediction.race || {};
  const entries = prediction.entries || prediction.entry || race.entries || race.entry || [];
  return Array.isArray(entries) ? entries : [];
}

function finishOrder(record) {
  const result = record.result || record.officialResult || record.raceResult || {};
  const order = result.order || result.finishOrder || record.finishOrder;
  if (Array.isArray(order) && order.length >= 3) return order.slice(0, 3).map(Number);
  const ticket = result.trifecta || result.ticket || record.actualTicket || record.winningTicket || record.trifecta;
  const digits = String(ticket || "").match(/[1-6]/g) || [];
  return digits.length >= 3 ? digits.slice(0, 3).map(Number) : [];
}

function sourceText(record) {
  const prediction = record.prediction || record;
  return JSON.stringify({
    source: prediction.externalData?.source,
    hiyori: prediction.hiyori,
    dataSource: prediction.dataSource,
    combinedOdds: prediction.combinedOdds,
    entries: prediction.entries || prediction.race?.entries
  });
}

function hasHiyori(record) {
  return /日和|hiyori/i.test(sourceText(record));
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

function analyze(records) {
  const rows = records.filter(record => hasHiyori(record) && finishOrder(record).length >= 3);
  const stats = Object.fromEntries(METRICS.map(metric => [metric.key, {
    key: metric.key,
    label: metric.label,
    samples: 0,
    winnerHits: 0,
    top3Hits: 0
  }]));

  for (const record of rows) {
    const order = finishOrder(record);
    const entries = entriesOf(record);
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
    generatedAt: new Date().toISOString(),
    matchedRaceCount: rows.length,
    note: "ボートレース日和由来データと公式結果の比較集計。予想ロジックには自動反映しない。",
    metrics
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : "data/analysis/hiyori-official-comparison.json";
  const inputs = args.filter((arg, index) => arg !== "--output" && index !== outputIndex + 1);
  const targets = inputs.length ? inputs : DEFAULT_INPUTS;
  const records = targets.flatMap(input => readJsonFiles(input).flatMap(item => flattenRecords(item.value, item.file)));
  const report = analyze(records);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`hiyori comparison: ${report.matchedRaceCount} races -> ${output}`);
}

if (require.main === module) main();
module.exports = { analyze, bestBoat, finishOrder, hasHiyori };
