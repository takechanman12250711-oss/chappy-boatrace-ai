"use strict";

const fs = require("node:fs");
const path = require("node:path");
const report = require("../js/theory-performance-report");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");
const out = path.join(root, "data", "stats", "theory-performance-report.json");

function load(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

function recordKey(record) {
  return String(record?.raceKey || [record?.date, record?.jcd, record?.rno].filter(Boolean).join("-") || "");
}

function collect() {
  if (!fs.existsSync(dir)) return [];
  const primary = new Map();
  const verification = new Map();

  fs.readdirSync(dir).filter(name => /^\d{8}\.json$/.test(name)).sort().forEach(name => {
    const data = load(path.join(dir, name), {});
    (Array.isArray(data.predictions) ? data.predictions : []).forEach(record => {
      const key = recordKey(record);
      if (key) primary.set(key, record);
    });
    (Array.isArray(data.verificationPredictions) ? data.verificationPredictions : []).forEach(record => {
      const key = recordKey(record);
      if (key && !primary.has(key)) verification.set(key, record);
    });
  });

  for (const key of primary.keys()) verification.delete(key);
  return [...primary.values(), ...verification.values()];
}

function main() {
  const built = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/*.json",
    deduplication: "predictions-preferred-over-verificationPredictions",
    ...report.build(collect())
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(built, null, 2) + "\n");
  console.log(`理論別成績：${built.byTheory.length}理論／${built.sampleCount}評価行`);
}

if (require.main === module) main();
module.exports = { load, recordKey, collect };
