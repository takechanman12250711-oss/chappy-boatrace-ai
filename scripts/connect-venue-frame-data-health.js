// scripts/connect-venue-frame-data-health.js
// index.html にデータ健全性チェックを重複なく接続する。
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "index.html");
const src = "js/venue-frame-data-health.js";
const tag = `<script src="${src}"></script>`;

if (!fs.existsSync(file)) throw new Error("index.html が見つかりません。");
let html = fs.readFileSync(file, "utf8");
if (html.includes(src)) {
  console.log("Already connected:", src);
  process.exit(0);
}

if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `  ${tag}\n</body>`);
else html += `\n${tag}\n`;

fs.writeFileSync(file, html, "utf8");
console.log("Connected:", src);
