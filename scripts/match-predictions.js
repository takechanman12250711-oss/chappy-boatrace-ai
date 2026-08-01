// scripts/match-predictions.js
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const verification = require("../js/prediction-verification");
const boatIdentity = require(
  "../js/boat-identity"
);
const scenarioLikelihoodV5Verification = require(
  "../js/scenario-likelihood-v5-verification"
);
const scenarioLikelihoodV5AbVerification = require(
  "../js/scenario-likelihood-v5-ab-verification"
);

function boatIdentityInspection(record) {
  return boatIdentity.inspectPrediction(
    record
  );
}

function isBoatIdentityQuarantined(record) {
  const inspection =
    boatIdentityInspection(record);
  return (
    inspection.checked === true &&
    inspection.valid === false
  );
}

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

function supportIdentityOfRecord(
  record,
  baseIdentity = null
) {
  const evidence =
    record?.prediction
      ?.verificationEvidence ||
    record?.verificationEvidence ||
    {};
  const generation =
    evidence?.generation || {};
  const reference =
    record?.shadowV2Reference || {};
  const source =
    baseIdentity &&
    typeof baseIdentity === "object"
      ? baseIdentity
      : {};

  return {
    ...source,
    roleSchemaVersion:
      Number(
        source.roleSchemaVersion ??
        evidence.roleSchemaVersion ??
        0
      ),
    theorySchemaVersion:
      Number(
        source.theorySchemaVersion ??
        evidence.theorySchemaVersion ??
        0
      ),
    theorySetFingerprint:
      String(
        source.theorySetFingerprint ||
        evidence
          .theorySetFingerprint ||
        ""
      ),
    generation: {
      logicFingerprint:
        String(
          source
            ?.generation
            ?.logicFingerprint ||
          generation
            ?.logicFingerprint ||
          ""
        ),
      confidenceDefinitionVersion:
        String(
          source
            ?.generation
            ?.confidenceDefinitionVersion ||
          generation
            ?.confidenceDefinitionVersion ||
          ""
        ),
      ticketPolicyVersion:
        String(
          source
            ?.generation
            ?.ticketPolicyVersion ||
          generation
            ?.ticketPolicyVersion ||
          ""
        )
    },
    evaluator:
      String(
        record?.selection?.evaluator ||
        source.evaluator ||
        ""
      ),
    evaluatorVersion:
      String(
        reference.evaluatorVersion ||
        source.evaluatorVersion ||
        ""
      ),
    selectorCohortKey:
      String(
        reference.cohortKey ||
        source.selectorCohortKey ||
        ""
      ),
    logicFingerprint:
      String(
        reference.logicFingerprint ||
        source.logicFingerprint ||
        ""
      ),
    theoryInputVersion:
      String(
        reference.theoryInputVersion ||
        source.theoryInputVersion ||
        ""
      )
  };
}

function verificationInputFingerprint(
  record
) {
  const payload = {
    selection:
      record?.selection || null,
    shadowV2Reference:
      record
        ?.shadowV2Reference ||
      null,
    prediction:
      record?.prediction || null
  };

  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(payload)
    )
    .digest("hex")
    .slice(0, 32);
}

function settlePrediction(prediction, result) {
  const verified =
    verification.verifyPrediction(
    prediction?.prediction || {},
    result || {}
  );
  const detail = {
    ...verified,
    supportIdentity:
      supportIdentityOfRecord(
        prediction,
        verified
          ?.supportIdentity
      ),
    verificationInputFingerprint:
      verificationInputFingerprint(
        prediction
      )
  };
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
    scenarioLikelihoodV5Verification:
      scenarioLikelihoodV5Verification.verify(
        prediction?.scenarioLikelihoodV5,
        result
      ),
    scenarioLikelihoodV5AbVerification:
      scenarioLikelihoodV5AbVerification.verify(
        prediction?.scenarioLikelihoodV5Ab,
        result
      ),
    verification: detail
  };
}

function buildSummary(predictions) {
  const source =
    Array.isArray(predictions)
      ? predictions
      : [];
  const quarantined = source.filter(
    isBoatIdentityQuarantined
  );
  const eligible = source.filter(
    item =>
      !isBoatIdentityQuarantined(item)
  );
  const settled = eligible.filter(item => item?.result?.settled);
  const hits = settled.filter(item => item.result.practicalHit);
  const honmeiFirst = settled.filter(item => item.result.honmeiFirst);
  const verificationSummary = verification.buildSummary(
    settled.map(item => item.result?.verification || item.result)
  );
  const scenarioLikelihoodV5Summary =
    scenarioLikelihoodV5Verification.buildSummary(
      settled.map(item =>
        item?.result?.scenarioLikelihoodV5Verification
      )
    );
  const scenarioLikelihoodV5AbSummary =
    scenarioLikelihoodV5AbVerification.buildSummary(
      settled.map(item => ({
        ...(item?.result?.scenarioLikelihoodV5AbVerification || {}),
        jcd: item?.jcd
      }))
    );

  return {
    schemaVersion: 3,
    predictionCount: eligible.length,
    sourcePredictionCount: source.length,
    quarantinedCount:
      quarantined.length,
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
    structuredScenarioComparableCount:
      verificationSummary.structuredScenarioComparableCount,
    structuredScenarioHits:
      verificationSummary.structuredScenarioHits,
    structuredScenarioMatchRate:
      verificationSummary.structuredScenarioMatchRate,
    simulatedStake: verificationSummary.totalStake,
    simulatedReturn: verificationSummary.totalReturn,
    simulatedProfit: verificationSummary.simulatedProfit,
    simulatedRecoveryRate: verificationSummary.simulatedRecoveryRate,
    categorySummary: verificationSummary.categorySummary,
    ticketCategorySummary:
      verificationSummary.ticketCategorySummary,
    roleSummary: verificationSummary.roleSummary,
    rolePerformanceSummary:
      verificationSummary.rolePerformanceSummary,
    theoryPerformanceSummary:
      verificationSummary.theoryPerformanceSummary,
    markSummary: verificationSummary.markSummary,
    priorityStageSummary: verificationSummary.priorityStageSummary,
    scenarioLikelihoodV5Summary,
    scenarioLikelihoodV5AbSummary
  };
}

function selectionGenerationKey(
  item
) {
  const identity =
    supportIdentityOfRecord(item);
  const generation =
    identity.generation || {};
  const values = [
    generation
      .logicFingerprint,
    generation
      .confidenceDefinitionVersion,
    generation
      .ticketPolicyVersion,
    identity.roleSchemaVersion >= 1
      ? identity.roleSchemaVersion
      : "",
    identity.theorySchemaVersion >= 1
      ? identity.theorySchemaVersion
      : "",
    identity
      .theorySetFingerprint,
    identity.evaluator,
    identity.evaluatorVersion,
    identity.selectorCohortKey,
    identity.logicFingerprint,
    identity.theoryInputVersion,
    Number.isFinite(
      Number(
        item
          ?.selection
          ?.threshold
      )
    )
      ? Number(
          item
            .selection
            .threshold
        )
      : ""
  ].map(value =>
    String(value || "")
  );

  return values.every(Boolean)
    ? JSON.stringify(values)
    : "";
}

function isCurrentV2Selection(
  item
) {
  return (
    item?.selection?.evaluator ===
      "shadow-selection-v2"
  );
}

function buildSelectionCohorts(
  verificationPredictions
) {
  const source = (
    Array.isArray(
      verificationPredictions
    )
      ? verificationPredictions
      : []
  ).filter(
    item =>
      !isBoatIdentityQuarantined(item)
  );
  const v2Rows =
    source.filter(
      isCurrentV2Selection
    );
  const hasGeneration =
    item =>
      Boolean(
        selectionGenerationKey(
          item
        )
      );
  const activeGenerationKey =
    v2Rows
      .map(item => ({
        item,
        key:
          selectionGenerationKey(
            item
          )
      }))
      .filter(row =>
        row.key
      )
      .sort((a, b) =>
        String(
          b.item?.selectedAt ||
          ""
        ).localeCompare(
          String(
            a.item?.selectedAt ||
            ""
          )
        )
      )[0]?.key ||
    "";
  const activeV2 =
    v2Rows.filter(item =>
      activeGenerationKey &&
      hasGeneration(item) &&
      selectionGenerationKey(
        item
      ) === activeGenerationKey
    );
  const ready =
    activeV2.filter(
      item =>
        item?.selection?.ready ===
          true &&
        item?.selection?.status ===
          "ready" &&
        Number.isFinite(
          Number(
            item?.selection?.score
          )
        )
    );

  return {
    activeGenerationKey,
    score70Plus:
      ready.filter(
        item =>
          Number(
            item.selection.score
          ) >= 70
      ),
    score60To69:
      ready.filter(item => {
        const score =
          Number(
            item.selection.score
          );
        return (
          score >= 60 &&
          score < 70
        );
      }),
    readyBelow60:
      ready.filter(
        item =>
          Number(
            item.selection.score
          ) < 60
      ),
    notReady:
      activeV2.filter(
        item =>
          !ready.includes(item)
      ),
    legacy:
      source.filter(
        item =>
          !isCurrentV2Selection(
            item
          )
      ),
    missingGeneration:
      v2Rows.filter(
        item =>
          !hasGeneration(item)
      ),
    otherGeneration:
      v2Rows.filter(
        item =>
          hasGeneration(item) &&
          (
            !activeGenerationKey ||
            selectionGenerationKey(
              item
            ) !==
              activeGenerationKey
          )
      )
  };
}

function matchPredictions(predictionData, resultData) {
  const resultMap = new Map(
    (resultData?.races || []).map(result => [
      `${resultData.date}-${String(result.jcd || "").padStart(2, "0")}-${Number(result.raceNo || 0)}`,
      result
    ])
  );

  let changed = false;
  const settleList = source => (Array.isArray(source) ? source : []).map(prediction => {
    if (
      isBoatIdentityQuarantined(
        prediction
      )
    ) {
      return prediction;
    }
    const result = resultMap.get(prediction.raceKey);
    if (!result?.resultAvailable) return prediction;
    const officialTicket =
      normalizeTicket(
        result?.trifecta
          ?.combination
      );
    const existing =
      prediction?.result;
    const existingTicket =
      normalizeTicket(
        existing?.resultTicket
      );
    const officialPayout =
      Number(
        result?.trifecta
          ?.payout || 0
      );
    const officialPopularity =
      Number(
        result?.trifecta
          ?.popularity || 0
      );
    const officialMethod =
      String(
        result
          ?.winningMethod || ""
      );
    const officialFinishers =
      Array.isArray(
        result?.finishers
      )
        ? result.finishers
        : [];
    const officialStarts =
      Array.isArray(
        result?.starts
      )
        ? result.starts
        : [];
    const currentFingerprint =
      verificationInputFingerprint(
        prediction
      );
    const existingFingerprint =
      String(
        existing
          ?.verification
          ?.verificationInputFingerprint ||
        existing
          ?.verificationInputFingerprint ||
        ""
      );

    if (
      existing?.settled === true &&
      officialTicket &&
      existingTicket ===
        officialTicket &&
      Number(
        existing?.payout || 0
      ) === officialPayout &&
      Number(
        existing?.popularity || 0
      ) === officialPopularity &&
      String(
        existing
          ?.winningMethod || ""
      ) === officialMethod &&
      JSON.stringify(
        Array.isArray(
          existing?.finishers
        )
          ? existing.finishers
          : []
      ) ===
        JSON.stringify(
          officialFinishers
        ) &&
      JSON.stringify(
        Array.isArray(
          existing?.starts
        )
          ? existing.starts
          : []
      ) ===
        JSON.stringify(
          officialStarts
        ) &&
      existingFingerprint ===
        currentFingerprint
    ) {
      return prediction;
    }

    changed = true;
    return {
      ...prediction,
      result: settlePrediction(prediction, result)
    };
  });
  const predictions = settleList(predictionData?.predictions);
  const verificationPredictions = settleList(
    predictionData?.verificationPredictions
  );
  const selectionCohorts =
    buildSelectionCohorts(
      verificationPredictions
    );
  const under70 = [
    ...selectionCohorts
      .score60To69,
    ...selectionCohorts
      .readyBelow60
  ];

  return {
    ...predictionData,
    predictions,
    verificationPredictions,
    resultSummary: buildSummary(predictions),
    verificationResultSummary: {
      all: buildSummary(verificationPredictions),
      activeGenerationKey:
        selectionCohorts
          .activeGenerationKey,
      score70Plus:
        buildSummary(
          selectionCohorts
            .score70Plus
        ),
      score60To69:
        buildSummary(
          selectionCohorts
            .score60To69
        ),
      readyBelow60:
        buildSummary(
          selectionCohorts
            .readyBelow60
        ),
      notReady:
        buildSummary(
          selectionCohorts
            .notReady
        ),
      legacy:
        buildSummary(
          selectionCohorts
            .legacy
        ),
      missingGeneration:
        buildSummary(
          selectionCohorts
            .missingGeneration
        ),
      otherGeneration:
        buildSummary(
          selectionCohorts
            .otherGeneration
        ),
      under70:
        buildSummary(under70)
    },
    resultsMatchedAt:
      changed
        ? new Date().toISOString()
        : predictionData
            ?.resultsMatchedAt ||
          new Date().toISOString()
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
  boatIdentityInspection,
  isBoatIdentityQuarantined,
  supportIdentityOfRecord,
  verificationInputFingerprint,
  selectionGenerationKey,
  buildSelectionCohorts,
  matchPredictions
};
