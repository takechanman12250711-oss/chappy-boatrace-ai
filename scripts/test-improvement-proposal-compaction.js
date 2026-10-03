#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const improvement = require("./build-improvement-proposal-report");
const theoryPerformance = require("./build-theory-performance-report");

function predictionRecord(raceNo, ticket) {
  return {
    raceKey: `20261003-20-${raceNo}`,
    date: "20261003",
    jcd: "20",
    raceNo,
    place: "若松",
    marker: `race-${raceNo}`,
    selectedAt: "2026-10-03T05:00:00.000Z",
    deadlineAt: "2026-10-03T06:00:00.000Z",
    largeUnusedPayload: Array.from(
      { length: 1000 },
      (_, index) => ({ index, text: "unused-top-level" })
    ),
    theoryTagSnapshot: {
      theories: [{
        theoryKey: "wallBoat",
        label: "壁艇理論",
        tickets: [ticket]
      }]
    },
    prediction: {
      practicalTickets: [{
        ticket,
        category: "本線"
      }],
      mainSheet: {
        honmei: { boatNo: Number(ticket[0]) },
        taikou: { boatNo: Number(ticket[2]) },
        ana: { boatNo: 4 },
        osae: { boatNo: 5 }
      },
      predictedScenarioTitle: "1号艇逃げ",
      raceFlow: {
        title: "1号艇逃げ",
        scenario: { title: "1号艇逃げ" },
        largeUnusedPayload: new Array(1000).fill("unused-race-flow")
      },
      verificationEvidence: {
        roleSchemaVersion: 1,
        roleClaims: [{
          role: "hold",
          boatNo: 2,
          expectedPositions: [2, 3]
        }],
        mainScenario: {
          label: "1号艇逃げ",
          headBoatNo: 1,
          expectedWinningMethods: ["逃げ"]
        },
        tickets: [{ ticket, category: "本線" }]
      },
      preRaceConditions: {
        schemaVersion: 4,
        source: "boatrace-official",
        sourceTiming: "pre_deadline",
        sourceFetchedAt: "2026-10-03T05:00:00.000Z",
        officialResultUsed: false,
        dataAvailability: {
          wind: true,
          wave: true,
          tide: true
        },
        weather: {
          windSpeed: 3,
          waveHeight: 3,
          tideLevel: 50
        },
        boats: Array.from({ length: 6 }, (_, index) => ({
          boatNo: index + 1,
          className: index === 0 ? "A1" : "B1",
          nationalWinRate: 6 - index * 0.2,
          motor2Rate: 30 + index,
          exhibitionTime: 6.7 + index * 0.01,
          currentST: 0.1 + index * 0.01
        }))
      },
      internalEvaluation: {
        confidence: 72
      },
      largeUnusedPayload: Array.from(
        { length: 1000 },
        (_, index) => ({ index, text: "unused-prediction" })
      )
    }
  };
}

function officialResult(raceNo, ticket) {
  return {
    source: "boatrace-official",
    date: "20261003",
    jcd: "20",
    raceNo,
    resultAvailable: true,
    winningMethod: "逃げ",
    trifecta: {
      combination: ticket,
      payout: 1200
    }
  };
}

function semantic(record) {
  const review = record?.result?.review || {};
  return {
    raceKey: record.raceKey,
    marker: record.marker,
    result: {
      ...record.result,
      review: {
        ...review,
        generatedAt: ""
      }
    },
    theoryEvaluationSnapshot:
      record.theoryEvaluationSnapshot
  };
}

const compacted = improvement.compactPredictionRecord(
  predictionRecord(1, "1-2-3")
);
assert.equal(compacted.largeUnusedPayload, undefined);
assert.equal(
  compacted.prediction.largeUnusedPayload,
  undefined
);
assert.equal(
  compacted.prediction.raceFlow.largeUnusedPayload,
  undefined
);
assert.equal(
  compacted.prediction.preRaceConditions.boats.length,
  6
);
assert.equal(
  compacted.theoryTagSnapshot.theories[0].theoryKey,
  "wallBoat"
);

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "improvement-compaction-")
);
try {
  const predictionsDirectory = path.join(
    temporaryRoot,
    "data",
    "predictions"
  );
  const resultsDirectory = path.join(
    temporaryRoot,
    "data",
    "results"
  );
  fs.mkdirSync(predictionsDirectory, { recursive: true });
  fs.mkdirSync(resultsDirectory, { recursive: true });

  fs.writeFileSync(
    path.join(predictionsDirectory, "20261003.json"),
    JSON.stringify({
      predictions: [
        predictionRecord(1, "1-2-3"),
        predictionRecord(2, "2-1-3")
      ]
    })
  );
  fs.writeFileSync(
    path.join(resultsDirectory, "20261003.json"),
    JSON.stringify({
      races: [
        officialResult(1, "1-2-3"),
        officialResult(2, "2-3-1")
      ]
    })
  );

  const full = theoryPerformance.collect({
    root: temporaryRoot
  }).records.map(
    improvement.normalizeAnalysisRecord
  );
  const compact = improvement.collectAnalysis({
    root: temporaryRoot
  });

  assert.deepEqual(
    compact.diagnostics,
    theoryPerformance.collect({
      root: temporaryRoot
    }).diagnostics
  );
  assert.deepEqual(
    compact.records.map(semantic),
    full.map(semantic),
    "compaction must preserve improvement proposal analysis semantics"
  );
  assert.ok(
    compact.records.every(
      record =>
        record.largeUnusedPayload === undefined &&
        record.prediction.largeUnusedPayload === undefined
    ),
    "unused large prediction fields must be released before corpus retention"
  );
} finally {
  fs.rmSync(temporaryRoot, {
    recursive: true,
    force: true
  });
}

console.log("improvement proposal compaction: passed");
