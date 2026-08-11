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

function parts(value) {
  const m = String(value || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).map(Number) : null;
}

function mainScenario(record) {
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
  return match ? [...match[1].matchAll(/([1-6])号艇/g)].map(row => Number(row[1])) : [];
}

function add(target, h, s, t, limit) {
  if (![h, s, t].every(n => n >= 1 && n <= 6)) return;
  if (new Set([h, s, t]).size !== 3) return;
  const key = `${h}-${s}-${t}`;
  if (!target.includes(key) && target.length < limit) target.push(key);
}

function oldMain(head, seconds, thirds, limit = 3) {
  const out = [];
  const validSeconds = seconds.filter(n => n !== head);
  const pairs = [];
  validSeconds.slice(0, 2).forEach((second, index) => {
    const validThirds = thirds.filter(n => n !== head && n !== second);
    validThirds.slice(0, index === 0 ? 2 : 1).forEach(third => pairs.push([second, third]));
  });
  pairs.forEach(([s, t]) => add(out, head, s, t, limit));
  return out;
}

function newMain(head, seconds, thirds, limit = 3) {
  const out = [];
  const validSeconds = seconds.filter(n => n !== head).slice(0, 3);
  const used = new Map();
  for (let round = 0; round < 2 && out.length < limit; round += 1) {
    for (const second of validSeconds) {
      const set = used.get(second) || new Set();
      const third = thirds.find(n => n !== head && n !== second && !set.has(n));
      if (!third) continue;
      add(out, head, second, third, limit);
      set.add(third);
      used.set(second, set);
      if (out.length >= limit) break;
    }
  }
  return out;
}

const out = {
  orderMiss: 0,
  comparableMainHead: 0,
  oldWouldHit: 0,
  newWouldHit: 0,
  rescuedBy300: 0,
  stillMissAfter300: 0,
  changedButStillMiss: 0,
  unchangedStillMiss: 0,
  byScenario: {},
  rescuedExamples: [],
  stillExamples: []
};

for (const name of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    if (String(record?.result?.review?.missType || "") !== "着順違い") continue;
    out.orderMiss += 1;
    const actual = parts(record?.result?.resultTicket);
    const scenario = mainScenario(record);
    const head = scenarioHead[scenario];
    if (!actual || !head || actual[0] !== head) continue;
    out.comparableMainHead += 1;

    const seconds = candidates(record, "2着残し候補");
    const thirds = candidates(record, "3着拾い候補");
    const oldTickets = oldMain(head, seconds, thirds);
    const newTickets = newMain(head, seconds, thirds);
    const actualTicket = actual.join("-");
    const oldHit = oldTickets.includes(actualTicket);
    const newHit = newTickets.includes(actualTicket);
    if (oldHit) out.oldWouldHit += 1;
    if (newHit) out.newWouldHit += 1;
    if (!oldHit && newHit) {
      out.rescuedBy300 += 1;
      if (out.rescuedExamples.length < 8) out.rescuedExamples.push({ raceKey: record?.raceKey || "", scenario, actualTicket, oldTickets, newTickets, seconds, thirds });
    }
    if (!newHit) {
      out.stillMissAfter300 += 1;
      if (JSON.stringify(oldTickets) !== JSON.stringify(newTickets)) out.changedButStillMiss += 1;
      else out.unchangedStillMiss += 1;
      if (out.stillExamples.length < 8) out.stillExamples.push({ raceKey: record?.raceKey || "", scenario, actualTicket, oldTickets, newTickets, seconds, thirds });
    }
    const row = out.byScenario[scenario] || { comparable: 0, rescued: 0, stillMiss: 0 };
    row.comparable += 1;
    if (!oldHit && newHit) row.rescued += 1;
    if (!newHit) row.stillMiss += 1;
    out.byScenario[scenario] = row;
  }
}

console.log(JSON.stringify(out, null, 2));
