"use strict";
const fs = require("fs");
const path = "js/stats.js";
let text = fs.readFileSync(path, "utf8");

function removeBlockByHeading(source, heading) {
  const headingIndex = source.indexOf(`<h3>${heading}</h3>`);
  if (headingIndex < 0) return source;

  const start = source.lastIndexOf('<div class="v3-final-block">', headingIndex);
  if (start < 0) throw new Error(`開始位置を特定できません: ${heading}`);

  const token = /<div\b[^>]*>|<\/div>/g;
  token.lastIndex = start;
  let depth = 0;
  let match;
  while ((match = token.exec(source))) {
    if (match[0].startsWith("</div")) depth -= 1;
    else depth += 1;

    if (depth === 0) {
      let end = token.lastIndex;
      while (end < source.length && /[\r\n ]/.test(source[end])) end += 1;
      return source.slice(0, start) + source.slice(end);
    }
  }

  throw new Error(`終了位置を特定できません: ${heading}`);
}

const headings = [
  "収集監視対象",
  "事前予想保存率",
  "未保存",
  "自動復旧",
  "公式結果待ち",
  "場別の自動収集状況",
  "事前データ不足の内訳",
  "検証データの蓄積段階"
];

for (const heading of headings) {
  text = removeBlockByHeading(text, heading);
}

for (const heading of headings) {
  if (text.includes(`<h3>${heading}</h3>`)) {
    throw new Error(`削除に失敗しました: ${heading}`);
  }
}

fs.writeFileSync(path, text);
console.log("result monitoring UI removed");
