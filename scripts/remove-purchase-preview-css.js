"use strict";

const fs = require("fs");
const path = require("path");
const file = path.resolve(__dirname, "..", "style.css");
let css = fs.readFileSync(file, "utf8");

css = css.replace(
  "結果分析・スクショ入力 スマホ横ズレ修正",
  "結果分析 スマホ横ズレ修正"
);

css = css.replace(/,\n\s*#purchaseScreenshotPreview\s*\{/g, " {");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.v3-note\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.v3-table-wrap\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.table\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.table th,\n\s*#purchaseScreenshotPreview\s+\.table td\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.table th:nth-child\(1\),\n\s*#purchaseScreenshotPreview\s+\.table td:nth-child\(1\)\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.table th:nth-child\(2\),\n\s*#purchaseScreenshotPreview\s+\.table td:nth-child\(2\)\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+\.table th:nth-child\(3\),\n\s*#purchaseScreenshotPreview\s+\.table td:nth-child\(3\)\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+input,\n\s*#purchaseScreenshotPreview\s+button\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+input\s*\{[\s\S]*?\n\s*\}/g, "");
css = css.replace(/\n\s*#purchaseScreenshotPreview\s+button\s*\{[\s\S]*?\n\s*\}/g, "");

if (css.includes("purchaseScreenshotPreview")) {
  throw new Error("purchaseScreenshotPreview CSSが残っています");
}

fs.writeFileSync(file, css, "utf8");
console.log("旧購入スクショ専用CSSを削除しました");
