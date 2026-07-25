// scripts/connect-venue-frame-manual-restore.js
// index.html に手動復帰承認スクリプトを安全に接続する。
const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "index.html");
const scriptPath = "js/venue-frame-manual-restore.js";
const tag = `<script src="${scriptPath}"></script>`;

if (!fs.existsSync(file)) {
  throw new Error("index.html が見つかりません");
}

let html = fs.readFileSync(file, "utf8");
if (html.includes(scriptPath)) {
  console.log("Already connected");
  process.exit(0);
}

if (html.includes("</body>")) {
  html = html.replace("</body>", `  ${tag}\n</body>`);
} else {
  html += `\n${tag}\n`;
}

fs.writeFileSync(file, html, "utf8");
console.log("Connected venue frame manual restore");
