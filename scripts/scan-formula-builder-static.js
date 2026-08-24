"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const ignored = new Set([".git", "node_modules", "artifacts"]);
const extensions = new Set([".js", ".mjs", ".cjs", ".html", ".json"]);
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(absolute);
      continue;
    }
    if (extensions.has(path.extname(entry.name))) files.push(absolute);
  }
}

walk(ROOT);

const exact = [];
const dynamic = [];
const line56Map = [];
const mapsNear56 = [];

for (const absolute of files) {
  const relative = path.relative(ROOT, absolute).replaceAll(path.sep, "/");
  let source = "";
  try {
    source = fs.readFileSync(absolute, "utf8");
  } catch (_) {
    continue;
  }

  const lines = source.split(/\r?\n/);
  const lower = source.toLowerCase();

  if (lower.includes("formula-builder") || lower.includes("formula builder")) {
    exact.push({
      file: relative,
      matches: lines
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(row => /formula[- ]builder/i.test(row.text))
        .slice(0, 30)
    });
  }

  if (/sourceURL|sourceMappingURL|new\s+Function|\beval\s*\(/.test(source)) {
    dynamic.push({
      file: relative,
      matches: lines
        .map((line, index) => ({ line: index + 1, text: line.trim() }))
        .filter(row => /sourceURL|sourceMappingURL|new\s+Function|\beval\s*\(/.test(row.text))
        .slice(0, 50)
    });
  }

  const target = lines[55] || "";
  if (/\.map\s*\(/.test(target)) {
    line56Map.push({
      file: relative,
      line56: target.trim(),
      context: lines.slice(49, 62).map((line, offset) => ({
        line: 50 + offset,
        text: line
      }))
    });
  }

  lines.forEach((line, index) => {
    if (!/\.map\s*\(/.test(line)) return;
    if (index < 45 || index > 65) return;
    mapsNear56.push({
      file: relative,
      line: index + 1,
      text: line.trim()
    });
  });
}

console.log("FORMULA_STATIC_SCAN_START");
console.log(JSON.stringify({
  fileCount: files.length,
  exact,
  dynamic,
  line56Map,
  mapsNear56
}, null, 2));
console.log("FORMULA_STATIC_SCAN_END");
