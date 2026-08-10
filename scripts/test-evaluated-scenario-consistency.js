"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/ai-core");
const selector = require("../js/practical-selection");

const aiCore = global.ChappyAICore;
const root = path.resolve(__dirname, "..");
const predictionDir = path.join(root, "data", "predictions");

function listPredictionFiles() {
  return fs
    .readdirSync(predictionDir)
    .filter((name) => /^\d{8}\.json$/.test(name))
    .sort();
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boatNo(value) {
  return number(value?.boatNo ?? value?.number ?? value?.waku ?? value?.boat ?? value);
}

function normalizeTicket(value) {
  const boats = String(value?.ticket || value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function raceKeyOf(record) {
  return String(
    record?.raceKey ||
    record?.key ||
    record?.prediction?.raceKey ||
    [record?.date, record?.stadiumCode, record?.raceNo]
      .filter((value) => value !== undefined && value !== null && value !== "")
      .join("-")
  );
}

function predictionOf(record) {
  return record?.prediction && typeof record.prediction === "object"
    ? record.prediction
    : record || {};
}

function analysesOf(prediction) {
  return array(
    prediction?.aiCore?.analyses ||
    prediction?.analyses ||
    prediction?.boats ||
    prediction?.entries
  );
}

function scenariosOf(prediction) {
  return prediction?.aiCore?.raceScenarios || prediction?.raceScenarios || null;
}

function formationsOf(prediction) {
  return prediction?.aiCore?.formations || prediction?.formations || null;
}

function marksOf(prediction) {
  return prediction?.aiCore?.marks || prediction?.marks || null;
}

function practicalPayload(prediction, formations) {
  return {
    aiCore: {
      ...(prediction?.aiCore || {}),
      formations
    },
    marks: marksOf(prediction),
    raceScenarios: scenariosOf(prediction),
    analyses: analysesOf(prediction),
    mainSheet: {
      ...(prediction?.mainSheet || {}),
      tickets: formations?.main || [],
      coverTickets: formations?.safety || [],
      flowTickets: formations?.flow || []
    },
    manshuSheet: {
      ...(prediction?.manshuSheet || {}),
      tickets: formations?.longshot || []
    },
    raceFlow: prediction?.raceFlow || prediction?.aiCore?.raceFlow || null,
    evaluatedScenarioCandidates:
      prediction?.evaluatedScenarioCandidates ||
      prediction?.aiCore?.evaluatedScenarioCandidates ||
      [],
    candidateScenarioBranches:
      prediction?.candidateScenarioBranches ||
      prediction?.aiCore?.candidateScenarioBranches ||
      [],
    verificationEvidence:
      prediction?.verificationEvidence ||
      prediction?.practicalSelection?.verificationEvidence ||
      null
  };
}

function resultFormation(record, prediction) {
  const analyses = analysesOf(prediction);
  const scenarios = scenariosOf(prediction);

  if (analyses.length !== 6 || !scenarios?.mainScenario) {
    return formationsOf(prediction);
  }

  return aiCore.buildFormations(analyses, scenarios);
}

function selectedTicketsOf(practical) {
  return array(practical?.tickets)
    .map(normalizeTicket)
    .filter(Boolean);
}

function selectedExpandedRows(practical) {
  return array(practical?.tickets)
    .map((item) => {
      if (typeof item === "string") {
        return {
          ticket: normalizeTicket(item),
          coveredBoatNos: []
        };
      }
      return {
        ...item,
        ticket: normalizeTicket(item?.ticket || item),
        coveredBoatNos: array(item?.coveredBoatNos).map(Number).filter(Boolean)
      };
    })
    .filter((item) => item.ticket);
}

const counters = {
  races: 0,
  selected: 0,
  skipped: 0,
  expandedRaces: 0,
  expandedTickets: 0,
  maximum: 0,
  candidates: 0,
  physicalCandidates: 0,
  independentBranches: 0,
  candidateOnly: 0,
  ticketCountDistribution: {},
  selectedByBoat: {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0
  }
};
const selectedTicketRows = [];

listPredictionFiles().forEach((name) => {
  const data = JSON.parse(
    fs.readFileSync(path.join(predictionDir, name), "utf8")
  );

  const records = [
    ...array(data.predictions),
    ...array(data.verificationPredictions)
  ];

  records.forEach((record) => {
    const prediction = predictionOf(record);
    const analyses = analysesOf(prediction);
    const scenarios = scenariosOf(prediction);

    if (
      analyses.length !== 6 ||
      !scenarios?.mainScenario ||
      prediction?.evaluationState === "legacy"
    ) {
      return;
    }

    const raceKey = raceKeyOf(record);
    const formations = resultFormation(record, prediction);
    const practical = selector.select(
      practicalPayload(prediction, formations)
    );
    const tickets = selectedTicketsOf(practical);
    const expanded = selectedExpandedRows(practical);

    counters.races += 1;
    if (practical.status === "selected") {
      counters.selected += 1;
    } else {
      counters.skipped += 1;
    }
    counters.ticketCountDistribution[tickets.length] =
      (counters.ticketCountDistribution[tickets.length] || 0) + 1;
    if (tickets.length >= 8) {
      counters.expandedRaces += 1;
      counters.expandedTickets += tickets.length;
    }
    counters.maximum = Math.max(counters.maximum, tickets.length);
    counters.candidates += array(practical.candidateOutcomes).length;
    counters.physicalCandidates += array(practical.candidateOutcomes)
      .filter((candidate) => candidate?.candidateType === "physical").length;
    counters.independentBranches += array(practical.candidateOutcomes)
      .filter((candidate) => candidate?.candidateType === "independent-branch").length;
    counters.candidateOnly += array(practical.candidateOutcomes)
      .filter((candidate) => candidate?.selected !== true).length;

    selectedTicketRows.push({
      raceKey,
      status: practical.status,
      tickets
    });

    expanded.forEach((item) => {
      (item.coveredBoatNos || [])
        .forEach((number) => {
          counters.selectedByBoat[number] += 1;
        });
    });
    practical.excludedCandidates
      .forEach((candidate) => {
        assert.ok(
          String(candidate.reasonCode || "").trim() &&
          String(candidate.reason || "").trim(),
          `${raceKey}: 非採用候補へ構造化理由を残す`
        );
      });
    practical.candidateOutcomes
      .filter(
        outcome =>
          outcome.reasonCode ===
          "MAXIMUM_REACHED"
      )
      .forEach(() => {
        assert.equal(
          practical.tickets.length,
          10,
          `${raceKey}: 最大到達を理由にできるのは実際に10点の時だけ`
        );
      });
  });
});

assert.equal(
  counters.races,
  281,
  "保存済み281レースを全件再計算する"
);
const selectionHash =
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        selectedTicketRows
      )
    )
    .digest("hex");
assert.equal(
  selectionHash,
  "4f3e24813c9fd710042ce9c187da80b668d2b72571ba1bbbfdd0b78d4b6c9b3e",
  "正式主展開と根拠付き同一軸流し2券を含む281レースの買い目を固定する"
);

console.log("評価済み展開の全件整合テスト: 合格");
console.log(`- 再計算: ${counters.races}レース`);
console.log(
  `- 実戦選択: ${counters.selected} / 見送り: ${counters.skipped}`
);
console.log(
  `- 8〜10点へ拡張: ${counters.expandedRaces}レース・${counters.expandedTickets}点 / 最大: ${counters.maximum}`
);
console.log(
  `- 点数分布: ${JSON.stringify(counters.ticketCountDistribution)}`
);
console.log(
  `- 全候補: ${counters.candidates} / 評価印の物理候補: ${counters.physicalCandidates} / 独立枝候補: ${counters.independentBranches} / 購入非昇格: ${counters.candidateOnly}`
);
console.log(
  `- 独立枝採用（艇番別）: ${JSON.stringify(counters.selectedByBoat)}`
);
