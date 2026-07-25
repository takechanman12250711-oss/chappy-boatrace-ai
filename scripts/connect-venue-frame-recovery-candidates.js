// scripts/connect-venue-frame-recovery-candidates.js
// index.html に復旧候補一覧スクリプトを安全に接続する。
const fs = require("fs");
const path = require("path");

const indexPath = path.join(process.cwd(), "index.html");
const scriptTag = '<script src="js/venue-frame-recovery-candidates.js"></script>';

if (!fs.existsSync(indexPath)) {
  throw new Error("index.html が見つかりません");
}

let html = fs.readFileSync(indexPath, "utf8");
if (html.includes(scriptTag)) {
  console.log("venue-frame-recovery-candidates.js は接続済みです");
  process.exit(0);
}

const anchor = '<script src="js/venue-frame-data-quarantine.js"></script>';
if (html.includes(anchor)) {
  html = html.replace(anchor, `${anchor}\n  ${scriptTag}`);
} else if (html.includes("</body>")) {
  html = html.replace("</body>", `  ${scriptTag}\n</body>`);
} else {
  throw new Error("スクリプト挿入位置が見つかりません");
}

fs.writeFileSync(indexPath, html, "utf8");
console.log("venue-frame-recovery-candidates.js を接続しました");
