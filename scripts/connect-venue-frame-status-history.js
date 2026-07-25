// scripts/connect-venue-frame-status-history.js
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const file = path.join(process.cwd(), "index.html");
const src = '<script src="js/venue-frame-status-history.js?v=20260725-1"></script>';
let html = fs.readFileSync(file, "utf8");
if (!html.includes(src)) {
  const anchor = '<script src="js/venue-frame-comment-audit.js?v=20260725-1"></script>';
  if (html.includes(anchor)) html = html.replace(anchor, `${anchor}\n  ${src}`);
  else html = html.replace("</body>", `  ${src}\n</body>`);
  fs.writeFileSync(file, html, "utf8");
  console.log("Connected venue frame status history");
} else {
  console.log("Already connected");
}
