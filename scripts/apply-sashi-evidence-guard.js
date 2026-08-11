"use strict";

const fs = require("node:fs");

function replaceOnce(text, oldText, newText, label) {
  const count = text.split(oldText).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 target, found ${count}`);
  return text.replace(oldText, newText);
}

const corePath = "js/ai-core.js";
let core = fs.readFileSync(corePath, "utf8");
const oldCore = `  if (hasComparison(2, 1)) {
    if (twoVsOne >= 8) {
  sashiScore += 8;
} else if (twoVsOne >= 4) {
  sashiScore += 4;
} else if (twoVsOne <= -8) {
  sashiScore -= 6;
}
  }

  sashiScore += frameMovementAdjustment(2);`;
const newCore = `  if (hasComparison(2, 1)) {
    if (twoVsOne >= 8) {
  sashiScore += 8;
} else if (twoVsOne >= 4) {
  sashiScore += 4;
} else if (twoVsOne <= -8) {
  sashiScore -= 6;
}
  } else {
    /*
      1号艇との平均ST比較がない時は、
      2号艇を差し頭として強く断定しない。
      2・3着の差し残り評価は buildOutcome 側で維持する。
    */
    sashiScore -= 15;
  }

  sashiScore += frameMovementAdjustment(2);`;
core = replaceOnce(core, oldCore, newCore, "ai-core sashi comparison guard");
fs.writeFileSync(corePath, core);

const testPath = "scripts/test-race-scenarios.js";
let test = fs.readFileSync(testPath, "utf8");
const marker = `console.log("展開シナリオエンジン専用テスト: 合格");`;
const insertion = `const noSashiComparisonData = {
  ...data,
  entries: data.entries.map((entry) => {
    if (![1, 2].includes(Number(entry.boat))) return { ...entry };
    const cloned = { ...entry };
    delete cloned.avgSt;
    delete cloned.avgST;
    delete cloned.averageSt;
    delete cloned.averageST;
    return cloned;
  })
};
const withSashiComparison = aiCore.buildRaceScenarios(analyses, data);
const withoutSashiComparison = aiCore.buildRaceScenarios(
  analyses,
  noSashiComparisonData
);
const withSashiScore = withSashiComparison.scenarios.find(
  scenario => scenario.type === "sashi"
).score;
const withoutSashiScore = withoutSashiComparison.scenarios.find(
  scenario => scenario.type === "sashi"
).score;
assert.ok(
  Math.abs(
    (withSashiScore - withoutSashiScore) - 15
  ) < 1e-9,
  "1・2号艇の平均ST比較が無い場合だけ2差し頭の成立度を15点抑える"
);
assert.ok(
  withoutSashiComparison.scenarios
    .find(scenario => scenario.type === "sashi")
    .outcome.secondCandidates
    .some(row => row.boatNo === 2),
  "比較根拠不足でも2号艇の2着差し残り候補は維持する"
);

${marker}`;
test = replaceOnce(test, marker, insertion, "race scenario regression insertion");
fs.writeFileSync(testPath, test);

console.log("sashi evidence guard patch applied");
