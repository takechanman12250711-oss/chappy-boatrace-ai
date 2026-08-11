"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(path.resolve(__dirname, ".."), "data", "predictions");
const scenarioHead = { escape: 1, sashi: 2, threeAttack: 3, fourAttack: 4 };

function rowsOf(data) {
  return [
    ...(Array.isArray(data?.predictions) ? data.predictions : []),
    ...(Array.isArray(data?.verificationPredictions) ? data.verificationPredictions : [])
  ];
}
function parts(v) {
  const m = String(v || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).map(Number) : null;
}
function scenarioOf(record) {
  const flow = record?.prediction?.raceFlow || {};
  const text = `${String(flow?.summary || "")} ${String(flow?.scenario?.title || "")}`;
  if (/最有力展開は1号艇逃げ|1号艇逃げ本線/.test(text)) return "escape";
  if (/最有力展開は2コース差し|2コース差し本線/.test(text)) return "sashi";
  if (/最有力展開は3コース攻め|3コース攻め本線/.test(text)) return "threeAttack";
  if (/最有力展開は4カド|4カド本線|最有力展開は4コース攻め/.test(text)) return "fourAttack";
  return "unknown";
}
function candidates(record, label) {
  const summary = String(record?.prediction?.raceFlow?.summary || "");
  const match = summary.match(new RegExp(`${label}は([^。]+)`));
  return match ? [...match[1].matchAll(/([1-6])号艇/g)].map(x => Number(x[1])) : [];
}
function keyOf(record, file) {
  return String(record?.raceKey || `${file}:${record?.jcd || ""}:${record?.raceNo || ""}`);
}
function bucket(obj, scenario, boat) {
  const key = `${scenario}:boat${boat}`;
  obj[key] = (obj[key] || 0) + 1;
}

const all = [];
for (const file of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    if (String(record?.result?.review?.missType || "") !== "着順違い") continue;
    all.push({ record, file });
  }
}

const seen = new Set();
const out = {
  rawOrderMiss: all.length,
  dedupedOrderMiss: 0,
  mainHeadCorrect: 0,
  actualSecondMissingSecondButInThird: 0,
  actualThirdMissingThirdButInSecond: 0,
  bothCrossOnly: 0,
  actualSecondCrossByScenarioBoat: {},
  actualThirdCrossByScenarioBoat: {},
  secondAbsentEverywhereByScenarioBoat: {},
  thirdAbsentEverywhereByScenarioBoat: {},
  examplesSecondCross: [],
  examplesThirdCross: []
};

for (const { record, file } of all) {
  const key = keyOf(record, file);
  if (seen.has(key)) continue;
  seen.add(key);
  out.dedupedOrderMiss += 1;

  const actual = parts(record?.result?.resultTicket);
  const scenario = scenarioOf(record);
  const head = scenarioHead[scenario];
  if (!actual || !head || actual[0] !== head) continue;
  out.mainHeadCorrect += 1;

  const seconds = candidates(record, "2着残し候補").filter(n => n !== head);
  const thirds = candidates(record, "3着拾い候補").filter(n => n !== head);
  const actualSecond = actual[1];
  const actualThird = actual[2];

  const secondInSecond = seconds.includes(actualSecond);
  const secondInThird = thirds.includes(actualSecond);
  const thirdInThird = thirds.includes(actualThird);
  const thirdInSecond = seconds.includes(actualThird);

  if (!secondInSecond && secondInThird) {
    out.actualSecondMissingSecondButInThird += 1;
    bucket(out.actualSecondCrossByScenarioBoat, scenario, actualSecond);
    if (out.examplesSecondCross.length < 12) out.examplesSecondCross.push({ key, scenario, actual, seconds, thirds });
  }
  if (!thirdInThird && thirdInSecond) {
    out.actualThirdMissingThirdButInSecond += 1;
    bucket(out.actualThirdCrossByScenarioBoat, scenario, actualThird);
    if (out.examplesThirdCross.length < 12) out.examplesThirdCross.push({ key, scenario, actual, seconds, thirds });
  }
  if (!secondInSecond && secondInThird && !thirdInThird && thirdInSecond) {
    out.bothCrossOnly += 1;
  }
  if (!secondInSecond && !secondInThird) bucket(out.secondAbsentEverywhereByScenarioBoat, scenario, actualSecond);
  if (!thirdInThird && !thirdInSecond) bucket(out.thirdAbsentEverywhereByScenarioBoat, scenario, actualThird);
}

console.log(JSON.stringify(out, null, 2));
