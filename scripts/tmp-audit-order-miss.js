"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dir = path.join(root, "data", "predictions");

function rowsOf(data) {
  return [
    ...(Array.isArray(data?.predictions) ? data.predictions : []),
    ...(Array.isArray(data?.verificationPredictions) ? data.verificationPredictions : [])
  ];
}

function ticketParts(value) {
  const m = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return m.length >= 3 ? m.slice(0, 3).map(Number) : null;
}

function practicalTickets(record) {
  return (Array.isArray(record?.prediction?.practicalTickets) ? record.prediction.practicalTickets : [])
    .map(ticketParts)
    .filter(Boolean);
}

function resultOrder(record) {
  const result = record?.result || {};
  const values = [
    result?.order,
    result?.finishOrder,
    result?.resultOrder,
    result?.trifecta,
    result?.combination,
    result?.review?.resultOrder,
    result?.review?.order,
    result?.review?.trifecta
  ];
  for (const value of values) {
    if (Array.isArray(value) && value.length >= 3) {
      const nums = value.slice(0, 3).map(Number);
      if (nums.every(n => n >= 1 && n <= 6)) return nums;
    }
    const parts = ticketParts(value);
    if (parts) return parts;
  }
  return null;
}

function raceFlow(record) {
  return record?.prediction?.raceFlow || {};
}

function mainScenario(record) {
  const flow = raceFlow(record);
  const summary = String(flow?.summary || "");
  const title = String(flow?.scenario?.title || "");
  const text = `${summary} ${title}`;
  if (/最有力展開は1号艇逃げ|1号艇逃げ本線/.test(text)) return "escape";
  if (/最有力展開は2コース差し|2コース差し本線/.test(text)) return "sashi";
  if (/最有力展開は3コース攻め|3コース攻め本線/.test(text)) return "threeAttack";
  if (/最有力展開は4カド|4カド本線|最有力展開は4コース攻め/.test(text)) return "fourAttack";
  return "unknown";
}

function numericBoatRows(value) {
  return (Array.isArray(value) ? value : [])
    .map(row => Number(row?.boatNo ?? row?.boat ?? row))
    .filter(n => n >= 1 && n <= 6);
}

function scenarioCandidates(record) {
  const flow = raceFlow(record);
  const scenario = flow?.scenario || {};
  const outcome = scenario?.outcome || {};
  return {
    first: numericBoatRows(outcome?.firstCandidates || flow?.firstCandidates),
    second: numericBoatRows(outcome?.secondCandidates || flow?.secondCandidates),
    third: numericBoatRows(outcome?.thirdCandidates || flow?.thirdCandidates)
  };
}

const c = {
  settled: 0,
  orderMiss: 0,
  resultOrderFound: 0,
  sameHead: 0,
  differentHead: 0,
  exactReverseTicketPresent: 0,
  scenario: {},
  byActualHead: {},
  candidateCoverage: {
    actualSecondInSecond: 0,
    actualSecondInThird: 0,
    actualThirdInThird: 0,
    actualThirdInSecond: 0,
    bothCorrectPosition: 0,
    bothCrossPosition: 0
  },
  examples: []
};

for (const name of fs.readdirSync(dir).filter(n => /^\d{8}\.json$/.test(n))) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  for (const record of rowsOf(data)) {
    if (record?.result?.settled !== true) continue;
    c.settled += 1;
    if (String(record?.result?.review?.missType || "") !== "着順違い") continue;
    c.orderMiss += 1;

    const actual = resultOrder(record);
    if (!actual) {
      if (c.examples.length < 5) {
        c.examples.push({
          raceKey: record?.raceKey || "",
          reason: "no-result-order",
          resultKeys: Object.keys(record?.result || {}),
          reviewKeys: Object.keys(record?.result?.review || {})
        });
      }
      continue;
    }
    c.resultOrderFound += 1;

    const tickets = practicalTickets(record);
    const headSet = new Set(tickets.map(t => t[0]));
    if (headSet.has(actual[0])) c.sameHead += 1;
    else c.differentHead += 1;

    if (tickets.some(t => t[0] === actual[0] && t[1] === actual[2] && t[2] === actual[1])) {
      c.exactReverseTicketPresent += 1;
    }

    const candidates = scenarioCandidates(record);
    const s2s = candidates.second.includes(actual[1]);
    const s2t = candidates.third.includes(actual[1]);
    const s3t = candidates.third.includes(actual[2]);
    const s3s = candidates.second.includes(actual[2]);
    if (s2s) c.candidateCoverage.actualSecondInSecond += 1;
    if (s2t) c.candidateCoverage.actualSecondInThird += 1;
    if (s3t) c.candidateCoverage.actualThirdInThird += 1;
    if (s3s) c.candidateCoverage.actualThirdInSecond += 1;
    if (s2s && s3t) c.candidateCoverage.bothCorrectPosition += 1;
    if (s2t && s3s) c.candidateCoverage.bothCrossPosition += 1;

    const scenario = mainScenario(record);
    c.scenario[scenario] = (c.scenario[scenario] || 0) + 1;
    c.byActualHead[String(actual[0])] = (c.byActualHead[String(actual[0])] || 0) + 1;

    if (c.examples.length < 12) {
      c.examples.push({
        raceKey: record?.raceKey || "",
        scenario,
        actual,
        tickets,
        candidates,
        summary: raceFlow(record)?.summary || ""
      });
    }
  }
}

console.log(JSON.stringify(c, null, 2));
