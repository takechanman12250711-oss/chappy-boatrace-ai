"use strict";

const assert = require("node:assert/strict");
const {
  buildImprovementSuggestions
} = require("../js/improvement-suggestions");

const insufficient = buildImprovementSuggestions({
  settledCount: 2,
  practicalCount: 2,
  venueGroups: [{ label: "常滑", practicalCount: 2, practicalHits: 0 }]
});

assert.equal(insufficient.sampleReady, false);
assert.equal(insufficient.suggestions.length, 0);
assert.equal(insufficient.axisStatus.venue, "蓄積中 2/30R");

const result = buildImprovementSuggestions({
  settledCount: 30,
  practicalCount: 30,
  sampleLabel: "シャドーを含む検証買い目",
  venueGroups: [
    { label: "常滑", practicalCount: 12, practicalHits: 2 },
    { label: "大村", practicalCount: 12, practicalHits: 10 }
  ],
  scenarioGroups: [
    { label: "2差し本線", practicalCount: 12, practicalHits: 2 }
  ],
  missTypeSummary: [
    { label: "的中", count: 6, percentage: 20 },
    { label: "相手抜け", count: 15, percentage: 50 },
    { label: "頭外れ", count: 6, percentage: 20 },
    { label: "完全抜け", count: 3, percentage: 10 }
  ]
});

assert.equal(result.sampleReady, true);
assert.equal(result.suggestions.length, 3);
assert.ok(result.suggestions.some(item => item.category === "場別" && item.target === "常滑"));
assert.ok(result.suggestions.some(item => item.category === "展開別" && item.target === "2差し本線"));
assert.ok(result.suggestions.some(item => item.category === "外れ方別" && item.target === "相手抜け"));
assert.ok(result.suggestions.every(item => item.approvalRequired === true));
assert.ok(result.suggestions.every(item => item.what && item.why && item.how && item.impact));
assert.ok(
  result.suggestions.every(item =>
    item.evidence.startsWith("シャドーを含む検証買い目")
  ),
  "シャドー検証を実戦成績と誤表示しない"
);
assert.ok(!result.suggestions.some(item => item.target === "大村"));

console.log("改善候補生成テスト: 合格");
