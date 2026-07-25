const fs = require("fs");
const path = require("path");

const indexPath = path.join(process.cwd(), "index.html");
const scriptTag = '<script src="js/venue-frame-data-quarantine.js"></script>';

if (!fs.existsSync(indexPath)) {
  throw new Error("index.html が見つかりません");
}

let html = fs.readFileSync(indexPath, "utf8");

if (html.includes(scriptTag)) {
  console.log("venue-frame-data-quarantine.js は接続済みです");
  process.exit(0);
}

const anchorCandidates = [
  '<script src="js/venue-frame-data-health.js"></script>',
  '<script src="js/venue-frame-operations-dashboard.js"></script>',
  "</body>"
];

let inserted = false;
for (const anchor of anchorCandidates) {
  if (!html.includes(anchor)) continue;
  if (anchor === "</body>") {
    html = html.replace(anchor, `  ${scriptTag}\n${anchor}`);
  } else {
    html = html.replace(anchor, `${anchor}\n  ${scriptTag}`);
  }
  inserted = true;
  break;
}

if (!inserted) {
  throw new Error("scriptタグの挿入位置が見つかりません");
}

fs.writeFileSync(indexPath, html, "utf8");
console.log("venue-frame-data-quarantine.js を index.html に接続しました");