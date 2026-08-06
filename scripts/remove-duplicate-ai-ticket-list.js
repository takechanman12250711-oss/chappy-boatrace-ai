"use strict";

const fs = require("node:fs");
const path = require("node:path");

const renderPath = path.resolve(__dirname, "..", "js", "render.js");
let render = fs.readFileSync(renderPath, "utf8");

const target = `      <!-- 7. AI買い目一覧 -->\n      \${renderTicketRanking(prediction)}\n\n`;

if (!render.includes(target)) {
  throw new Error("AI買い目一覧の描画呼び出しが見つかりません");
}

render = render.replace(target, "");

if (render.includes("${renderTicketRanking(prediction)}")) {
  throw new Error("AI買い目一覧の描画呼び出しが残っています");
}

fs.writeFileSync(renderPath, render);
console.log("AI買い目一覧の重複表示を削除しました");
