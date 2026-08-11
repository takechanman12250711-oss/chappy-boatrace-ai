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
  const rows = Array.isArray(record?.result?.practicalTickets)
    ? record.result.practicalTickets
    : Array.isArray(record?.prediction?.practicalTickets)
      ? record.prediction.practicalTickets
      : [];
  return rows.map(ticketParts).filter(Boolean);
}

function resultOrder(record) {
  const result = record?.result || {};
  const values = [result?.resultTicket, result?.review?.resultTicket];
  for (const value of values) {
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
  const text = `${String(flow?.summary || "")} ${String(flow?.scenario?.title || "")}`;
  if (/最有力展開は1号艇逃げ|1号艇逃げ本線/.test(text)) return "escape";
  if (/最有力展開は2コース差し|2コース差し本線/.test(text)) return "sashi";
  if (/最有力展開は3コース攻め|3コース攻め本線/.test(text)) return "threeAttack";
  if (/最有力展開は4カド|4カド本線|最有力展開は4コース攻め/.test(text)) return "fourAttack";
  return "unknown";
}

function candidatesFromSummary(record, label) {
  const summary = String(raceFlow(record)?.summary || "");
  const match = summary.match(new RegExp(`${label}は([^。]+)`));
  if (!match) return [];
  return [...match[1].matchAll(/([1-6])号艇/g)].map(row => Number(row[1]));
}

function sameSet(a, b) {
  return [...a].sort().join("") === [...b].sort().join("");
}

function permutationPattern(ticket, actual) {
  if (!sameSet(ticket, actual)) return "";
  return ticket.map(boat => actual.indexOf(boat) + 1).join("");
}

const c = {
  settled: 0,
  orderMiss: 0,
  resultOrderFound: 0,
  sameHead: 0,
  differentHead: 0,
  exactReverseTicketPresent: 0,
  sameSetPermutationPresence: {},
  scenario: {},
  byActualHead: {},
  candidateCoverage: {
    actualSecondInSecond: 0,
    actualSecondInThird: 0,
    actualThirdInThird: 0,
    actualThirdInSecond: 0,
    bothCorrectPosition: 0,
    bothCrossPosition: 0,
    actualSecondRank1InSecond: 0,
    actualThirdRank1InThird: 0,
    crossRank1Both: 0
  },
  sameHeadRoleCoverage: {
    actualSecondUsedAsSecond: 0,
    actualSecondUsedAsThird: 0,
    actualThirdUsedAsThird: 0,
    actualThirdUsedAsSecond: 0,
    bothCorrectRolesSomewhere: 0,
    bothCrossRolesSomewhere: 0
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
    if (!actual) continue;
    c.resultOrderFound += 1;

    const tickets = practicalTickets(record);
    const sameHeadTickets = tickets.filter(t => t[0] === actual[0]);
    if (sameHeadTickets.length) c.sameHead += 1;
    else c.differentHead += 1;

    if (sameHeadTickets.some(t => t[1] === actual[2] && t[2] === actual[1])) {
      c.exactReverseTicketPresent += 1;
    }

    const patterns = new Set(
      tickets.map(t => permutationPattern(t, actual)).filter(Boolean)
    );
    patterns.forEach(pattern => {
      c.sameSetPermutationPresence[pattern] = (c.sameSetPermutationPresence[pattern] || 0) + 1;
    });

    const secondCandidates = candidatesFromSummary(record, "2着残し候補");
    const thirdCandidates = candidatesFromSummary(record, "3着拾い候補");
    const s2s = secondCandidates.includes(actual[1]);
    const s2t = thirdCandidates.includes(actual[1]);
    const s3t = thirdCandidates.includes(actual[2]);
    const s3s = secondCandidates.includes(actual[2]);
    if (s2s) c.candidateCoverage.actualSecondInSecond += 1;
    if (s2t) c.candidateCoverage.actualSecondInThird += 1;
    if (s3t) c.candidateCoverage.actualThirdInThird += 1;
    if (s3s) c.candidateCoverage.actualThirdInSecond += 1;
    if (s2s && s3t) c.candidateCoverage.bothCorrectPosition += 1;
    if (s2t && s3s) c.candidateCoverage.bothCrossPosition += 1;
    if (secondCandidates[0] === actual[1]) c.candidateCoverage.actualSecondRank1InSecond += 1;
    if (thirdCandidates[0] === actual[2]) c.candidateCoverage.actualThirdRank1InThird += 1;
    if (thirdCandidates[0] === actual[1] && secondCandidates[0] === actual[2]) c.candidateCoverage.crossRank1Both += 1;

    const secondUsedAsSecond = sameHeadTickets.some(t => t[1] === actual[1]);
    const secondUsedAsThird = sameHeadTickets.some(t => t[2] === actual[1]);
    const thirdUsedAsThird = sameHeadTickets.some(t => t[2] === actual[2]);
    const thirdUsedAsSecond = sameHeadTickets.some(t => t[1] === actual[2]);
    if (secondUsedAsSecond) c.sameHeadRoleCoverage.actualSecondUsedAsSecond += 1;
    if (secondUsedAsThird) c.sameHeadRoleCoverage.actualSecondUsedAsThird += 1;
    if (thirdUsedAsThird) c.sameHeadRoleCoverage.actualThirdUsedAsThird += 1;
    if (thirdUsedAsSecond) c.sameHeadRoleCoverage.actualThirdUsedAsSecond += 1;
    if (secondUsedAsSecond && thirdUsedAsThird) c.sameHeadRoleCoverage.bothCorrectRolesSomewhere += 1;
    if (secondUsedAsThird && thirdUsedAsSecond) c.sameHeadRoleCoverage.bothCrossRolesSomewhere += 1;

    const scenario = mainScenario(record);
    c.scenario[scenario] = (c.scenario[scenario] || 0) + 1;
    c.byActualHead[String(actual[0])] = (c.byActualHead[String(actual[0])] || 0) + 1;

    if (c.examples.length < 10) {
      c.examples.push({
        raceKey: record?.raceKey || "",
        scenario,
        actual,
        patterns: [...patterns],
        sameHeadTickets,
        secondCandidates,
        thirdCandidates,
        summary: raceFlow(record)?.summary || ""
      });
    }
  }
}

console.log(JSON.stringify(c, null, 2));
