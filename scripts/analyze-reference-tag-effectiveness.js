#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUTS = [
  "data/predictions",
  "data/results",
  "data/history",
  "public/data"
];

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
  if (Array.isArray(value)) return value.flatMap(item => flattenRecords(item, file));
  if (!value || typeof value !== "object") return [];

  const likelyLists = ["records", "predictions", "results", "races", "items", "data"];
  for (const key of likelyLists) {
    if (Array.isArray(value[key])) return value[key].flatMap(item => flattenRecords(item, file));
  }
  return [{ ...value, __file: file }];
}

function raceKey(record) {
  const race = record.race || {};
  const date = record.date || race.date || record.raceDate || record.targetDate || "";
  const place = record.place || race.place || record.venue || record.venueName || record.jcd || "";
  const raceNo = record.raceNo || race.raceNo || race.rno || record.rno || "";
  return [date, place, raceNo].map(String).join("|");
}

function normalizeTicket(value) {
  if (Array.isArray(value)) return value.map(String).join("-");
  return String(value || "").replace(/[^1-6]/g, "").split("").join("-");
}

function actualTicket(record) {
  const result = record.result || record.officialResult || record.raceResult || {};
  const candidates = [
    result.trifecta,
    result.ticket,
    result.result,
    record.actualTicket,
    record.winningTicket,
    record.trifecta
  ];
  for (const value of candidates) {
    const normalized = normalizeTicket(value);
    if (/^[1-6]-[1-6]-[1-6]$/.test(normalized)) return normalized;
  }
  const order = result.order || result.finishOrder || record.finishOrder;
  return Array.isArray(order) && order.length >= 3 ? order.slice(0, 3).map(Number).join("-") : "";
}

function extractTags(record) {
  const sources = [
    record.referenceTags,
    record.tags,
    record.prediction?.referenceTags,
    record.prediction?.tags,
    record.analysis?.referenceTags
  ];
  const raw = sources.find(Array.isArray) || [];
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

function analyze(records) {
  const matched = records.filter(record => actualTicket(record));
  const stats = new Map();

  for (const record of matched) {
    const actual = actualTicket(record);
    const winner = Number(actual.split("-")[0]);
    const podium = actual.split("-").map(Number);
    const tickets = predictedTickets(record);
    const ticketHit = tickets.includes(actual);

    for (const tag of extractTags(record)) {
      if (!stats.has(tag.key)) {
        stats.set(tag.key, {
          key: tag.key,
          label: tag.label,
          samples: 0,
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
      if (boat && winner === boat) item.winnerHits += 1;
      if (boat && podium.includes(boat)) item.top3Hits += 1;
      if (ticketHit) item.ticketHits += 1;
    }
  }

  const tags = Array.from(stats.values()).map(item => ({
    ...item,
    winnerRate: item.samples ? Number((item.winnerHits / item.samples * 100).toFixed(1)) : 0,
    top3Rate: item.samples ? Number((item.top3Hits / item.samples * 100).toFixed(1)) : 0,
    ticketHitRate: item.samples ? Number((item.ticketHits / item.samples * 100).toFixed(1)) : 0,
    averageStrength: item.samples ? Number((item.strengthTotal / item.samples).toFixed(2)) : 0,
    status: item.samples < 20 ? "データ不足" : item.top3Hits / item.samples >= 0.55 ? "参考度高" : item.top3Hits / item.samples >= 0.35 ? "参考" : "要検証"
  })).sort((a, b) => b.samples - a.samples || b.top3Rate - a.top3Rate);

  return {
    generatedAt: new Date().toISOString(),
    matchedRaceCount: matched.length,
    tagCount: tags.length,
    note: "参考タグの検証用集計。予想ロジック・印・買い目には自動反映しない。",
    tags
  };
}

function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const output = outputIndex >= 0 ? args[outputIndex + 1] : "data/analysis/reference-tag-effectiveness.json";
  const inputArgs = args.filter((arg, index) => arg !== "--output" && index !== outputIndex + 1);
  const inputs = inputArgs.length ? inputArgs : DEFAULT_INPUTS;
  const records = inputs.flatMap(input => readJsonFiles(input).flatMap(item => flattenRecords(item.value, item.file)));
  const report = analyze(records);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`reference-tag analysis: ${report.matchedRaceCount} races / ${report.tagCount} tags -> ${output}`);
}

if (require.main === module) main();
module.exports = { analyze, actualTicket, extractTags, predictedTickets, raceKey };
