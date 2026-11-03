"use strict";
// js/ と css/ に、どこからも読み込まれない（参照されない）ファイルが増えていないかを検査する。
// 使われていないファイルが積み重なると、どれが本番で動いているか分かりにくくなるため。
// ファイル名（拡張子つき、または require 用の拡張子なし）が、data/ 以外のどこかに書かれていれば「参照あり」とみなす。
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const tracked = execFileSync("git", ["ls-files", "--", ".", ":!data"], { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })
  .split("\n")
  .filter(file => file && !file.startsWith("data/"));
const assets = tracked.filter(file => /^(js\/[^/]+\.js|css\/[^/]+\.css)$/.test(file));
const sources = tracked.filter(file => {
  try { return fs.statSync(path.join(ROOT, file)).size < 3 * 1024 * 1024; } catch (_) { return false; }
});
const texts = new Map(sources.map(file => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

const orphans = assets.filter(asset => {
  const base = path.basename(asset);
  const names = asset.endsWith(".js") ? [base, `${path.basename(asset, ".js")}"`, `${path.basename(asset, ".js")}'`] : [base];
  for (const [file, text] of texts) {
    if (file === asset) continue;
    if (names.some(name => text.includes(name))) return false;
  }
  return true;
});

if (orphans.length) {
  console.error("どこからも参照されていないファイルがあります。使わないなら削除し、使うなら読み込み元に追加してください:");
  for (const file of orphans) console.error(`  - ${file}`);
  process.exit(1);
}
console.log(`ok no orphan assets (${assets.length} files checked)`);
