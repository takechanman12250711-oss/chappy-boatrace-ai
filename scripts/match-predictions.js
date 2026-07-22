// scripts/match-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const verification = require("../js/prediction-verification");

function getArgument(name) {
  const prefix = `--${name}=`;
  const argument = process.argv.find(value => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length).trim() : "";
}

function getJstDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo"
  })
    .format(new Date())
    .replaceAll("-", "");
}

function getTargetDate() {
  const rawDate = getArgument("date") || process.env.COLLECT_DATE || getJstDate();
  const date = rawDate.replaceAll("-", "").replaceAll("/", "");

  if (!/^\d{8}$/.test(date)) {
    throw new Error(`日付はYYYYMMDD形式で指定してください：${rawDate}`);
  }

  return date;
}

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function classifyMiss(tickets, resultTicket) {
  if (tickets.includes(resultTicket)) return "的中";

  const result = resultTicket.split("-");
  const normalized = tickets.map(ticket => ticket.split("-"));

  if (!normalized.some(ticket => ticket[0] === result[0])) {
    return "頭外れ";
  }

  const sameBoats = normalized.some(ticket =>
    [...ticket].sort().join("") === [...result].sort().join("")
  );
  if (sameBoats) return "着順違い";

  const resultOpponents = new Set(result.slice(1));
  const hasOneOpponent = normalized.some(ticket =>
    ticket[0] === result[0] &&
    ticket.slice(1).some(boat => resultOpponents.has(boat))
  );

  return hasOneOpponent ? "相手抜け" : "完全抜け";
}

function getHonmeiBoat(prediction) {
  const direct = Number(prediction?.prediction?.mainSheet?.honmei?.boatNo || 0);
  if (direct >= 1 && direct <= 6) return String(direct);

  const mainTicket = (prediction?.prediction?.practicalTickets || []).find(
    item => /中心|本線|本命/.test(String(item?.category || item?.role || ""))
  );
  return normalizeTicket(mainTicket?.ticket).split("-")[0] || "";
}

function settlePrediction(prediction, result) {
  const detail = verification.verifyPrediction(
    prediction?.prediction || {},
    result || {}
  );
  const resultTicket = detail.resultTicket;
  const practicalTickets = detail.practicalTickets;
  const honmeiBoat = getHonmeiBoat(prediction);

  return {
    ...detail,
    settled: Boolean(result?.resultAvailable && resultTicket),
    settledAt: new Date().toISOString(),
    payout: Number(result?.trifecta?.payout || 0),
    popularity: Number(result?.trifecta?.popularity || 0),
    finishers: Array.isArray(result?.finishers) ? result.finishers : [],
    starts: Array.isArray(result?.starts) ? result.starts : [],
    honmeiBoat,
    honmeiFirst: Boolean(honmeiBoat && resultTicket.split("-")[0] === honmeiBoat),
    verification: detail
  };
}

function buildSummary(predictions) {
  const settled = predictions.filter(item => item?.result?.settled);
  const hits = settled.filter(item => item.result.practicalHit);
  const honmeiFirst = settled.filter(item => item.result.honmeiFirst);
  const verificationSummary = verification.buildSummary(
    settled.map(item => item.result?.verification || item.result)
  );

  return {
    schemaVersion: 3,
    predictionCount: predictions.length,
    settledCount: settled.length,
    practicalHits: hits.length,
    practicalHitRate: settled.length
      ? Math.round(hits.length / settled.length * 1000) / 10
      : 0,
    honmeiFirstCount: honmeiFirst.length,
    honmeiFirstRate: settled.length
      ? Math.round(honmeiFirst.length / settled.length * 1000) / 10
      : 0,
    scenarioComparableCount: verificationSummary.scenarioComparableCount,
    scenarioHits: verificationSummary.scenarioHits,
    scenarioMatchRate: verificationSummary.scenarioMatchRate,
    simulatedStake: verificationSummary.totalStake,
    simulatedReturn: verificationSummary.totalReturn,
    simulatedProfit: verificationSummary.simulatedProfit,
    simulatedRecoveryRate: verificationSummary.simulatedRecoveryRate,
    categorySummary: verificationSummary.categorySummary,
    markSummary: verificationSummary.markSummary,
    priorityStageSummary: verificationSummary.priorityStageSummary
  };
}

function matchPredictions(predictionData, resultData) {
  const resultMap = new Map(
    (resultData?.races || []).map(result => [
      `${resultData.date}-${String(result.jcd || "").padStart(2, "0")}-${Number(result.raceNo || 0)}`,
      result
    ])
  );

  const predictions = (predictionData?.predictions || []).map(prediction => {
    const result = resultMap.get(prediction.raceKey);
    if (!result?.resultAvailable) return prediction;

    return {
      ...prediction,
      result: settlePrediction(prediction, result)
    };
  });

  return {
    ...predictionData,
    predictions,
    resultSummary: buildSummary(predictions),
    resultsMatchedAt: new Date().toISOString()
  };
}

function main() {
  const date = getTargetDate();
  const predictionPath = path.join(
    process.cwd(), "data", "predictions", `${date}.json`
  );
  const resultPath = path.join(
    process.cwd(), "data", "results", `${date}.json`
  );

  if (!fs.existsSync(predictionPath)) {
    console.log(`${date}の自動予想はありません`);
    return;
  }
  if (!fs.existsSync(resultPath)) {
    console.log(`${date}の公式結果はまだありません`);
    return;
  }

  const predictionData = JSON.parse(fs.readFileSync(predictionPath, "utf8"));
  const resultData = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const matched = matchPredictions(predictionData, resultData);

  fs.writeFileSync(
    predictionPath,
    JSON.stringify(matched, null, 2) + "\n",
    "utf8"
  );

  console.log(
    `結果照合完了：${matched.resultSummary.settledCount}/${matched.resultSummary.predictionCount}R、` +
    `的中${matched.resultSummary.practicalHits}R`
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  }
}

module.exports = {
  normalizeTicket,
  classifyMiss,
  settlePrediction,
  buildSummary,
  matchPredictions
};
