// scripts/connect-venue-frame-recovery-audit-report.js
// index.html に復旧監査レポートを安全に接続する。
const fs = require("fs");
const path = require("path");

const file = path.resolve(process.cwd(), "index.html");
let html = fs.readFileSync(file, "utf8");
const src = "js/venue-frame-recovery-audit-report.js";

if (!html.includes(src)) {
  const tag = `  <script src="${src}"></script>\n`;
  if (html.includes("</body>")) html = html.replace("</body>", `${tag}</body>`);
  else html += `\n${tag}`;
  fs.writeFileSync(file, html, "utf8");
  console.log(`Connected ${src}`);
} else {
  console.log(`${src} is already connected`);
}
