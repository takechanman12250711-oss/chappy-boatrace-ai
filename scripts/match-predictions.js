// scripts/match-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
  const resultTicket = normalizeTicket(result?.trifecta?.combination);
  const practicalTickets = [
    ...new Set(
      (prediction?.prediction?.practicalTickets || [])
        .map(item => normalizeTicket(item?.ticket || item))
        .filter(Boolean)
    )
  ];
  const honmeiBoat = getHonmeiBoat(prediction);
  const hit = Boolean(resultTicket) && practicalTickets.includes(resultTicket);

  return {
    settled: Boolean(result?.resultAvailable && resultTicket),
    settledAt: new Date().toISOString(),
    resultTicket,
    winningMethod: result?.winningMethod || "",
    payout: Number(result?.trifecta?.payout || 0),
    popularity: Number(result?.trifecta?.popularity || 0),
    practicalTickets,
    practicalHit: hit,
    honmeiBoat,
    honmeiFirst: Boolean(honmeiBoat && resultTicket.split("-")[0] === honmeiBoat),
    missType: resultTicket
      ? classifyMiss(practicalTickets, resultTicket)
      : "結果待ち"
  };
}

function buildSummary(predictions) {
  const settled = predictions.filter(item => item?.result?.settled);
  const hits = settled.filter(item => item.result.practicalHit);
  const honmeiFirst = settled.filter(item => item.result.honmeiFirst);

  return {
    predictionCount: predictions.length,
    settledCount: settled.length,
    practicalHits: hits.length,
    practicalHitRate: settled.length
      ? Math.round(hits.length / settled.length * 1000) / 10
      : 0,
    honmeiFirstCount: honmeiFirst.length,
    honmeiFirstRate: settled.length
      ? Math.round(honmeiFirst.length / settled.length * 1000) / 10
      : 0
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
