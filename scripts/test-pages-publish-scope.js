#!/usr/bin/env node
"use strict";

// GitHub Pages（ブランチ公開・Jekyll）の公開対象を検査する。
// - 画面が読むファイルを除外していないこと
// - 大きな保存データを除外していること
// - 日付別の全予想原本を外しても、画面が先に読む summaries が全日付にあること
// - 公開対象の合計が上限（10GB）より十分小さいこと

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const LIMIT_BYTES = 10 * 1024 ** 3;
const SAFE_BYTES = 6 * 1024 ** 3;

function readExcludes() {
  const text = fs.readFileSync(path.join(ROOT, "_config.yml"), "utf8");
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => /^exclude:\s*$/.test(line));
  assert.ok(start >= 0, "_config.yml に exclude がありません");
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    const match = line.match(/^\s+-\s+(.+?)\s*$/);
    if (match) out.push(match[1].replace(/^"(.*)"$/, "$1"));
  }
  return out;
}

// Ruby File.fnmatch（フラグなし）相当: * と ? は "/" にも一致、[...] は文字集合。
function fnmatchToRegExp(pattern) {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") source += ".*";
    else if (ch === "?") source += ".";
    else if (ch === "[") {
      const end = pattern.indexOf("]", i + 1);
      assert.ok(end > i, `閉じていない [ : ${pattern}`);
      source += `[${pattern.slice(i + 1, end)}]`;
      i = end;
    } else source += ch.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}

// Jekyll 3.10 EntryFilter#glob_include? と同じ判定（fnmatch か前方一致）。
function makeExcluded(patterns) {
  const compiled = patterns.map(pattern => ({ pattern, re: fnmatchToRegExp(pattern) }));
  return rel => compiled.some(({ pattern, re }) => re.test(rel) || rel.startsWith(pattern));
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(ROOT, abs).split(path.sep).join("/");
    visit(rel, entry, abs);
  }
}

const excludes = readExcludes();
const excluded = makeExcluded(excludes);

assert.ok(!fs.existsSync(path.join(ROOT, ".nojekyll")),
  ".nojekyll があると exclude が効かず、全ファイルが公開されます");

// 画面（index.html / js）が読む場所は除外しない。
const required = [
  "index.html",
  "purchase-import.html",
  "style.css",
  "js/script.js",
  "js/auto-selection.js",
  "css",
  "assets",
  "config",
  "data/config",
  "data/analysis",
  "data/stats/candidate24-report.json",
  "data/stats/theory-performance-report.json",
  "data/predictions/index.json",
  "data/predictions/index-manifest.json",
  "data/predictions/index-shards",
  "data/predictions/summaries",
  "data/predictions/summaries/20261103.json",
  "data/predictions/calibration.json",
  "data/predictions/improvement-review.json",
  "data/note-drafts",
  "data/note-drafts/20261103/x.json"
];
for (const rel of required) assert.ok(!excluded(rel), `画面が使う ${rel} を除外しています`);

// 大きい保存データは除外する。
for (const rel of [
  "data/predictions/20261031.json",
  "data/predictions/20270101.json",
  "data/predictions/source-archives/a.json",
  "data/results/20261031.json",
  "data/outer-attack-sources/a.json",
  "docs/note-automation.md",
  "AGENTS.md",
  "scripts/x.js"
]) assert.ok(excluded(rel), `${rel} が公開対象に残っています`);

// 画面が実際に参照する data/ の場所が除外されていないか、js から拾って確認する。
const referenced = new Set();
for (const file of ["index.html", "purchase-import.html"]) {
  const text = fs.readFileSync(path.join(ROOT, file), "utf8");
  for (const m of text.matchAll(/["'`](?:\.\/)?((?:data|js|css|assets|config)\/[A-Za-z0-9_./-]+)/g)) referenced.add(m[1]);
}
walk(path.join(ROOT, "js"), (rel, entry, abs) => {
  if (!entry.isFile() || !rel.endsWith(".js")) return;
  const text = fs.readFileSync(abs, "utf8");
  for (const m of text.matchAll(/["'`](?:\.\/)?((?:data|css|assets|config)\/[A-Za-z0-9_./-]+)/g)) referenced.add(m[1]);
});
for (const rel of referenced) assert.ok(!excluded(rel), `画面の参照先 ${rel} を除外しています`);

// 日付別の全予想原本を外すので、全日付に summaries がある必要がある。
const predictionsDir = path.join(ROOT, "data/predictions");
if (fs.existsSync(predictionsDir)) {
  const dated = fs.readdirSync(predictionsDir).filter(name => /^\d{8}\.json$/.test(name));
  for (const name of dated) {
    assert.ok(excluded(`data/predictions/${name}`), `${name} が公開対象に残っています`);
    assert.ok(fs.existsSync(path.join(predictionsDir, "summaries", name)),
      `summaries/${name} がないため、画面がこの日の予想を読めなくなります`);
  }
}

// 手元に data/ がある場合は公開対象の合計サイズを確認する。
if (fs.existsSync(path.join(ROOT, "data/predictions"))) {
  let total = 0;
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    walk(dir, (rel, entry, abs) => {
      const name = entry.name;
      if (/^[._#~]/.test(name)) return; // Jekyll が既定で公開しないもの
      if (excluded(rel)) return;
      if (entry.isDirectory()) stack.push(abs);
      else if (entry.isFile()) total += fs.statSync(abs).size;
    });
  }
  const gb = (total / 1024 ** 3).toFixed(2);
  assert.ok(total < LIMIT_BYTES, `公開対象 ${gb}GB が上限10GBを超えています`);
  if (total > SAFE_BYTES) console.warn(`注意: 公開対象 ${gb}GB。6GBを超えたので除外の見直しが必要です`);
  console.log(`公開対象の合計: ${gb}GB`);
}

console.log(`ok pages publish scope (${excludes.length} excludes, ${referenced.size} referenced paths)`);
