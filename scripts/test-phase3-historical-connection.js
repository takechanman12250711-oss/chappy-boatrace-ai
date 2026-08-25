"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const improvement = JSON.parse(
  fs.readFileSync("data/stats/improvement-proposal-phase3.json", "utf8"),
);
const handoff = JSON.parse(
  fs.readFileSync("data/stats/phase3-learning-handoff.json", "utf8"),
);
const sourceIds = (Array.isArray(improvement.proposals) ? improvement.proposals : [])
  .map((item) => item.code);
const handoffIds = (Array.isArray(handoff.historicalEvidence?.proposals)
  ? handoff.historicalEvidence.proposals
  : [])
  .map((item) => item.id);

assert.equal(
  handoff.historicalEvidence?.settledRaceCount,
  improvement.settledRaceCount,
  "Phase3引き渡しの照合済みレース数を最新改善提案と一致させる",
);
assert.equal(
  handoff.historicalEvidence?.proposalCount,
  improvement.proposalCount,
  "Phase3引き渡しの改善根拠数を最新改善提案と一致させる",
);
assert.deepEqual(
  handoffIds,
  sourceIds,
  "過去の改善根拠を同じ順序・同じIDでPhase3へ引き継ぐ",
);
assert.equal(handoff.productionChanged, false);
assert.equal(handoff.automaticApplication, false);
assert.equal(handoff.usableForPrediction, false);
console.log(
  `Phase3 historical connection: ${handoff.historicalEvidence.settledRaceCount}R / ${handoffIds.length} proposals`,
);
