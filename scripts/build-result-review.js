"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const PREDICTION_DIR = path.join(ROOT, "data", "predictions");

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function classifyMiss(tickets, resultTicket) {
  if (tickets.includes(resultTicket)) return "的中";
  const result = resultTicket.split("-");
  const rows = tickets.map(ticket => ticket.split("-"));
  if (!rows.some(ticket => ticket[0] === result[0])) return "頭外れ";
  if (rows.some(ticket => [...ticket].sort().join("") === [...result].sort().join(""))) return "着順違い";
  const opponents = new Set(result.slice(1));
  return rows.some(ticket => ticket[0] === result[0] && ticket.slice(1).some(boat => opponents.has(boat)))
    ? "相手抜け"
    : "完全抜け";
}

function markBoat(prediction, key) {
  const no = Number(prediction?.mainSheet?.[key]?.boatNo || 0);
  return no >= 1 && no <= 6 ? String(no) : "";
}

function buildReview(record) {
  const prediction = record?.prediction || {};
  const result = record?.result || {};
  const resultTicket = normalizeTicket(result.resultTicket);
  const practicalTickets = (prediction.practicalTickets || [])
    .map(item => normalizeTicket(item?.ticket || item))
    .filter(Boolean);
  if (!result.settled || !resultTicket) return null;

  const missType = classifyMiss(practicalTickets, resultTicket);
  const firstBoat = resultTicket.split("-")[0];
  const marks = {
    honmei: markBoat(prediction, "honmei"),
    taikou: markBoat(prediction, "taikou"),
    ana: markBoat(prediction, "ana"),
    osae: markBoat(prediction, "osae")
  };
  const scenarioMatch = Boolean(
    result?.verification?.structuredScenarioMatch ??
    result?.verification?.scenarioMatch ??
    result?.structuredScenarioMatch ??
    result?.scenarioMatch
  );
  const practicalHit = Boolean(result.practicalHit);
  const strengths = [];
  const weaknesses = [];
  const causeCodes = [];

  if (practicalHit) {
    strengths.push("実戦厳選買い目が公式結果を捉えた");
    causeCodes.push("ticket.hit");
  } else {
    weaknesses.push(`実戦厳選は${missType}`);
    causeCodes.push(`ticket.${missType}`);
  }

  if (marks.honmei && marks.honmei === firstBoat) {
    strengths.push("◎本命艇が1着");
    causeCodes.push("mark.honmei.first");
  } else if (marks.honmei) {
    weaknesses.push(`◎${marks.honmei}号艇が1着を外した`);
    causeCodes.push("mark.honmei.miss");
  }

  if (scenarioMatch) {
    strengths.push("中心展開の読みが結果と一致");
    causeCodes.push("scenario.hit");
  } else {
    weaknesses.push("中心展開と実際の決まり手・着順が不一致");
    causeCodes.push("scenario.miss");
  }

  const resultBoats = resultTicket.split("-");
  const markedOpponents = unique([marks.taikou, marks.ana, marks.osae]);
  const opponentHits = markedOpponents.filter(boat => resultBoats.slice(1).includes(boat));
  if (opponentHits.length) {
    strengths.push(`相手印から${opponentHits.join("・")}号艇を拾えていた`);
    causeCodes.push("mark.opponent.supported");
  } else if (markedOpponents.length) {
    weaknesses.push("○▲△が2・3着に入らなかった");
    causeCodes.push("mark.opponent.miss");
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    resultTicket,
    practicalHit,
    missType,
    scenarioMatch,
    strengths: unique(strengths),
    weaknesses: unique(weaknesses),
    causeCodes: unique(causeCodes),
    summary: practicalHit
      ? `的中。${strengths.join("。")}。`
      : `不的中（${missType}）。${weaknesses.join("。")}。`
  };
}

function updateFile(filePath) {
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  let changed = false;
  const apply = rows => {
    if (!Array.isArray(rows)) return;
    rows.forEach(record => {
      const review = buildReview(record);
      if (!review) return;
      const before = JSON.stringify(record?.result?.review || null);
      const after = JSON.stringify(review);
      if (before !== after) {
        record.result.review = review;
        changed = true;
      }
    });
  };
  apply(data.predictions);
  apply(data.verificationPredictions);
  if (changed) fs.writeFileSync(filePath, `${JSON.stringify(data)}\n`);
  return changed;
}

function main() {
  if (!fs.existsSync(PREDICTION_DIR)) return;
  const files = fs.readdirSync(PREDICTION_DIR)
    .filter(name => /^\d{8}\.json$/.test(name))
    .map(name => path.join(PREDICTION_DIR, name));
  let changed = 0;
  files.forEach(file => {
    if (updateFile(file)) changed += 1;
  });
  console.log(`結果照合AIレビュー更新: ${changed}ファイル`);
}

if (require.main === module) main();

module.exports = { normalizeTicket, classifyMiss, buildReview, updateFile };
