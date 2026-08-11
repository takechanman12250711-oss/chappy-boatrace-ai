"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(path.resolve(__dirname, ".."), "data", "predictions");

function parse(summary, label) {
  const match = String(summary || "").match(new RegExp(`${label}は([^。]+)`));
  return match ? [...match[1].matchAll(/([1-6])号艇/g)].map(x => Number(x[1])) : [];
}
function mainHead(summary) {
  const text = String(summary || "");
  if (text.includes("最有力展開は1号艇逃げ")) return 1;
  if (text.includes("最有力展開は2コース差し")) return 2;
  if (text.includes("最有力展開は3コース攻め")) return 3;
  if (text.includes("最有力展開は4カド攻め")) return 4;
  return 0;
}

const byDate = {};
for (const file of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n)).sort()) {
  const date = file.slice(0, 8);
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const rows = Array.isArray(data?.verificationPredictions) ? data.verificationPredictions : [];
  const bucket = byDate[date] || { settled: 0, scenarioParsed: 0, headInSecond: 0, headInThird: 0, neither: 0, orderMiss: 0, orderMissHeadLeak: 0 };
  for (const record of rows) {
    if (record?.result?.settled !== true) continue;
    bucket.settled += 1;
    const summary = record?.prediction?.raceFlow?.summary || "";
    const head = mainHead(summary);
    if (!head) continue;
    bucket.scenarioParsed += 1;
    const second = parse(summary, "2着残し候補");
    const third = parse(summary, "3着拾い候補");
    const leak2 = second.includes(head);
    const leak3 = third.includes(head);
    if (leak2) bucket.headInSecond += 1;
    if (leak3) bucket.headInThird += 1;
    if (!leak2 && !leak3) bucket.neither += 1;
    if (String(record?.result?.review?.missType || "") === "着順違い") {
      bucket.orderMiss += 1;
      if (leak2 || leak3) bucket.orderMissHeadLeak += 1;
    }
  }
  byDate[date] = bucket;
}
console.log(JSON.stringify(byDate, null, 2));
