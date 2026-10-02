#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { buildSelectionReport, classify } = require("./select-reference-tag-candidates");

assert.equal(classify({ samples: 565, targetSamples: 565, winnerRate: 44.2, top3Rate: 77.5 }).selection, "shadow-ab-candidate");
assert.equal(classify({ samples: 378, targetSamples: 378, winnerRate: 34.7, top3Rate: 65.1 }).selection, "shadow-ab-candidate");
assert.equal(classify({ samples: 638, targetSamples: 638, winnerRate: 21.9, top3Rate: 57.7 }).selection, "secondary-hold");
assert.equal(classify({ samples: 149, targetSamples: 0 }).selection, "condition-adjustment-candidate");
assert.equal(classify({ samples: 99, targetSamples: 0 }).selection, "hold");

const report = buildSelectionReport({
  matchedRaceCount: 650,
  dataSource: "boatrace-official",
  compatibilityProfile: "hiyori-compatible",
  tags: [
    { key: "local", label: "当地実績上位艇", samples: 565, targetSamples: 565, winnerRate: 44.2, top3Rate: 77.5, ticketHitRate: 17.2 },
    { key: "exhibition", label: "展示タイム上位艇", samples: 378, targetSamples: 378, winnerRate: 34.7, top3Rate: 65.1, ticketHitRate: 19.3 },
    { key: "start", label: "ST上位艇", samples: 638, targetSamples: 638, winnerRate: 21.9, top3Rate: 57.7, ticketHitRate: 18.3 },
    { key: "wind", label: "強風注意", samples: 149, targetSamples: 0, ticketHitRate: 18.1 },
    { key: "wave", label: "波高注意", samples: 117, targetSamples: 0, ticketHitRate: 13.7 }
  ]
});

assert.deepEqual(report.shadowAbCandidates, ["local", "exhibition"]);
assert.deepEqual(report.conditionAdjustmentCandidates, ["wind", "wave"]);
assert.deepEqual(report.holdCandidates, ["start"]);
assert.equal(report.productionApplication, false);
assert.equal(report.causalClaim, false);

console.log("reference-tag selection tests passed");
