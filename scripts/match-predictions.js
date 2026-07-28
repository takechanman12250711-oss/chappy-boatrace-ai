// scripts/match-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const verification = require("../js/prediction-verification");
const {
  buildVerificationCohortKey,
  preferSnapshot
} = require("../js/shadow-selection-v2");

const AUTOMATIC_SELECTION_SCORE = 70;
const VERIFICATION_MIN_SCORE = 60;

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

function officialResultState(result) {
  const detail =
    verification.verifyPrediction(
      {},
      result || {}
    );

  return {
    resultTicket:
      detail.resultTicket,
    winningMethod:
      detail.winningMethod,
    payout:
      Number(
        result?.trifecta?.payout || 0
      ),
    popularity:
      Number(
        result?.trifecta?.popularity || 0
      ),
    finishers:
      Array.isArray(result?.finishers)
        ? result.finishers
        : [],
    starts:
      Array.isArray(result?.starts)
        ? result.starts
        : []
  };
}

function storedResultState(result) {
  return {
    resultTicket:
      normalizeTicket(
        result?.resultTicket
      ),
    winningMethod:
      String(
        result?.winningMethod || ""
      ),
    payout:
      Number(result?.payout || 0),
    popularity:
      Number(
        result?.popularity || 0
      ),
    finishers:
      Array.isArray(result?.finishers)
        ? result.finishers
        : [],
    starts:
      Array.isArray(result?.starts)
        ? result.starts
        : []
  };
}

function isSameOfficialResult(
  stored,
  official
) {
  return (
    stored?.settled === true &&
    JSON.stringify(
      storedResultState(stored)
    ) ===
      JSON.stringify(
        officialResultState(official)
      )
  );
}

function shadowV2ScoreBand(record) {
  if (
    record?.calibrationEligible !== true ||
    record?.officialResultUsedForEvaluation === true
  ) {
    return "ineligible";
  }

  const rawScore =
    record?.evaluation?.totalScore;
  if (
    rawScore === null ||
    rawScore === undefined ||
    rawScore === ""
  ) {
    return "ineligible";
  }
  const score = Number(rawScore);
  if (!Number.isFinite(score)) {
    return "ineligible";
  }
  if (score >= AUTOMATIC_SELECTION_SCORE) {
    return "70_plus";
  }
  if (score >= VERIFICATION_MIN_SCORE) {
    return "60_69";
  }
  return "under_60";
}

function shadowV2VerificationTier(record) {
  const scoreBand =
    shadowV2ScoreBand(record);
  if (scoreBand === "70_plus") {
    return "high_confidence";
  }
  if (scoreBand === "60_69") {
    return "verification";
  }
  if (scoreBand === "under_60") {
    return "reference";
  }
  return "ineligible";
}

function shadowV2PredictionPayload(record) {
  const reference =
    record?.predictionReference || {};
  const marks =
    reference?.marks || {};

  return {
    raceFlow: {
      ...(reference?.raceFlow || {}),
      scenario:
        record?.evaluation?.scenario?.label
          ? {
              title:
                record.evaluation
                  .scenario.label
            }
          : null
    },
    mainSheet: {
      honmei: marks.honmei || null,
      taikou: marks.taikou || null,
      ana: marks.ana || null,
      osae: marks.osae || null
    },
    practicalTickets:
      Array.isArray(
        reference?.practicalTickets
      )
        ? reference.practicalTickets
        : [],
    preRaceConditions:
      record?.snapshot || null
  };
}

function settleShadowV2Prediction(
  record,
  result
) {
  const scoreBand =
    shadowV2ScoreBand(record);
  const verificationTier =
    shadowV2VerificationTier(record);
  const classified = {
    ...record,
    verificationCohortKey:
      buildVerificationCohortKey(record),
    scoreBand,
    verificationTier,
    verificationEligible:
      scoreBand === "70_plus" ||
      scoreBand === "60_69"
  };

  if (
    scoreBand === "ineligible" ||
    !result?.resultAvailable
  ) {
    return classified;
  }

  if (
    isSameOfficialResult(
      classified?.verificationResult,
      result
    )
  ) {
    return classified;
  }

  return {
    ...classified,
    verificationResult:
      settlePrediction(
      {
        prediction:
          shadowV2PredictionPayload(
            classified
          )
      },
      result
    )
  };
}

function latestShadowV2CohortRecords(
  records
) {
  const candidates = (
    Array.isArray(records)
      ? records
      : []
  )
    .filter(record =>
      record?.calibrationEligible === true &&
      record
        ?.officialResultUsedForEvaluation !==
        true &&
      shadowV2ScoreBand(record) !==
        "ineligible"
    )
    .map(record => ({
      ...record,
      verificationCohortKey:
        buildVerificationCohortKey(record)
    }))
    .sort(
      (a, b) =>
        Date.parse(b?.capturedAt || "") -
        Date.parse(a?.capturedAt || "")
    );
  const latestCohortKey = String(
    candidates[0]
      ?.verificationCohortKey || ""
  );
  const uniqueByRace = new Map();

  candidates
    .filter(
      record =>
        record
          .verificationCohortKey ===
        latestCohortKey
    )
    .forEach(record => {
      const raceKey = String(
        record?.raceKey || ""
      );
      if (!raceKey) return;
      uniqueByRace.set(
        raceKey,
        preferSnapshot(
          uniqueByRace.get(raceKey),
          record
        )
      );
    });

  return Array.from(
    uniqueByRace.values()
  );
}

function buildShadowV2Summary(records) {
  return buildSummary(
    (Array.isArray(records) ? records : [])
      .map(record => ({
        ...record,
        result:
          record?.verificationResult ||
          null
      }))
  );
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

  const settleList = source => (Array.isArray(source) ? source : []).map(prediction => {
    const result = resultMap.get(prediction.raceKey);
    if (!result?.resultAvailable) return prediction;
    if (
      isSameOfficialResult(
        prediction?.result,
        result
      )
    ) {
      return prediction;
    }

    return {
      ...prediction,
      result: settlePrediction(prediction, result)
    };
  });
  const predictions = settleList(predictionData?.predictions);
  const verificationPredictions = settleList(
    predictionData?.verificationPredictions
  );
  const shadowV2Predictions = (
    Array.isArray(
      predictionData?.shadowV2Predictions
    )
      ? predictionData.shadowV2Predictions
      : []
  ).map(record => {
    const result = resultMap.get(
      record?.raceKey
    );
    return settleShadowV2Prediction(
      record,
      result
    );
  });
  const qualifiedVerification = verificationPredictions.filter(
    item => item?.scoreBand === "70_plus" || Number(item?.selection?.score || 0) >= AUTOMATIC_SELECTION_SCORE
  );
  const score60To69Verification = verificationPredictions.filter(item => {
    const score = Number(
      item?.selection?.score
    );
    return (
      item?.scoreBand === "60_69" ||
      (
        Number.isFinite(score) &&
        score >= VERIFICATION_MIN_SCORE &&
        score < AUTOMATIC_SELECTION_SCORE
      )
    );
  });
  const under60Verification = verificationPredictions.filter(item => {
    const rawScore =
      item?.selection?.score;
    const score =
      rawScore === null ||
      rawScore === undefined ||
      rawScore === ""
        ? Number.NaN
        : Number(rawScore);
    return (
      item?.scoreBand === "under_60" ||
      (
        Number.isFinite(score) &&
        score < VERIFICATION_MIN_SCORE
      )
    );
  });
  const shadowVerification = verificationPredictions.filter(
    item =>
      item?.scoreBand === "under_70" ||
      Number(item?.selection?.score || 0) <
        AUTOMATIC_SELECTION_SCORE
  );
  const latestShadowV2Cohort =
    latestShadowV2CohortRecords(
      shadowV2Predictions
    );
  const shadowV2Score70Plus =
    latestShadowV2Cohort.filter(
      item =>
        item?.scoreBand ===
        "70_plus"
    );
  const shadowV2Score60To69 =
    latestShadowV2Cohort.filter(
      item =>
        item?.scoreBand ===
        "60_69"
    );
  const shadowV2Under60 =
    latestShadowV2Cohort.filter(
      item =>
        item?.scoreBand ===
        "under_60"
  );

  return {
    ...predictionData,
    predictions,
    verificationPredictions,
    shadowV2Predictions,
    resultSummary: buildSummary(predictions),
    verificationResultSummary: {
      all: buildSummary(verificationPredictions),
      score70Plus: buildSummary(qualifiedVerification),
      score60To69:
        buildSummary(
          score60To69Verification
        ),
      under60:
        buildSummary(
          under60Verification
        ),
      under70: buildSummary(shadowVerification)
    },
    shadowV2VerificationSummary: {
      verificationCohortKey:
        String(
          latestShadowV2Cohort[0]
            ?.verificationCohortKey ||
          ""
        ),
      all60Plus: buildShadowV2Summary([
        ...shadowV2Score70Plus,
        ...shadowV2Score60To69
      ]),
      score70Plus:
        buildShadowV2Summary(
          shadowV2Score70Plus
        ),
      score60To69:
        buildShadowV2Summary(
          shadowV2Score60To69
        ),
      referenceUnder60:
        buildShadowV2Summary(
          shadowV2Under60
        )
    },
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
  officialResultState,
  storedResultState,
  isSameOfficialResult,
  shadowV2ScoreBand,
  shadowV2VerificationTier,
  shadowV2PredictionPayload,
  settleShadowV2Prediction,
  latestShadowV2CohortRecords,
  buildShadowV2Summary,
  buildSummary,
  matchPredictions
};
