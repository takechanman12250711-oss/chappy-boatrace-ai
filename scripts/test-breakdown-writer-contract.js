"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");

const central = fs.readFileSync(".github/workflows/collect-results.yml", "utf8");
const restore = "node scripts/restore-daily-prediction-source.js --all";
const repair = "node scripts/repair-recent-results.js";
const learning = "node scripts/build-learning-analysis-pipeline.js";
const collectStep = central.slice(
  central.indexOf("- name: Collect official results"),
  central.indexOf("- name: Validate result prediction artifacts"),
);
const builders = [
  "node scripts/build-exhibition-rank3plus-breakdown.js",
  "node scripts/build-wall-boat-branch-profit-report.js",
  "node scripts/build-wall-established-breakdown.js",
];
const dedicated = [
  ".github/workflows/check-exhibition-rank3plus-breakdown.yml",
  ".github/workflows/check-wall-boat-branch-profit.yml",
  ".github/workflows/check-wall-established-breakdown.yml",
];

assert.ok(collectStep.includes(restore), "中央writerが圧縮正本を復元する");
assert.ok(collectStep.includes(repair), "中央writerが最新の公式結果を修復する");
for (const builder of builders) {
  assert.ok(collectStep.includes(builder), `中央writerが${builder}を構築する`);
  assert.ok(
    collectStep.indexOf(repair) < collectStep.indexOf(builder),
    `${builder}は公式結果修復後に構築する`,
  );
  assert.ok(
    collectStep.indexOf(builder) < collectStep.indexOf(learning),
    `${builder}は学習派生連鎖より前に構築する`,
  );
}
assert.ok(
  collectStep.indexOf("node scripts/build-exhibition-foot-branch-report.js") <
    collectStep.indexOf(builders[0]),
  "展示3着以上内訳は展示・足親レポートの後に構築する",
);
assert.ok(
  collectStep.indexOf(builders[1]) < collectStep.indexOf(builders[2]),
  "壁成立内訳は壁艇prospective親レポートの後に構築する",
);
assert.ok(
  central.includes(
    "git add data/results data/stats data/analysis/reference-tag-effectiveness.json",
  ),
  "中央writerが観測レポートを公式結果と同じcommitへ保存する",
);

for (const path of dedicated) {
  const workflow = fs.readFileSync(path, "utf8");
  assert.ok(workflow.includes("contents: read"), `${path}はread-onlyにする`);
  assert.ok(
    workflow.includes("group: ${{ github.workflow }}"),
    `${path}は中央writer queueを占有しない`,
  );
  assert.ok(workflow.includes(restore), `${path}は正本を復元して診断する`);
  assert.ok(!workflow.includes("git push"), `${path}はmainへpushしない`);
  assert.ok(!workflow.includes("git commit"), `${path}はcommitを作らない`);
  assert.ok(
    !workflow.includes("prepare-daily-prediction-git-save"),
    `${path}は保存準備で予想原本を変更しない`,
  );
}

const rank3plus = require("./build-exhibition-rank3plus-breakdown");
const predictionRows = [];
const resultRows = [];
for (let i = 1; i <= 12; i += 1) {
  const prediction = {
    date: "20261002",
    jcd: "05",
    raceNo: i,
    unusedPayload: { rows: Array(100).fill("discard") },
    prediction: {
      practicalTickets: ["1-2-3"],
      unusedPayload: { rows: Array(100).fill("discard") },
      verificationEvidence: {
        exhibitionFoot: {
          formal: true,
          attackBoatNo: i % 2 ? 3 : 4,
          exhibitionRank: i % 2 ? 3 : 4,
          exhibitionCoverage: 6,
          statements: [i % 2 ? "3号艇は展示下位で足に不安" : "4号艇は展示上位で気配良好"],
          confirm: i % 2 === 0,
          alert: i % 2 === 1,
        },
      },
    },
  };
  predictionRows.push(prediction);
  resultRows.push({
    date: prediction.date,
    jcd: prediction.jcd,
    raceNo: prediction.raceNo,
    resultAvailable: true,
    status: "finished",
    trifecta: {
      combination: i % 2 ? "2-1-3" : "1-2-3",
      payout: 900,
    },
    unusedPayload: { rows: Array(100).fill("discard") },
  });
}
const fullPredictionDoc = { predictions: predictionRows, verificationPredictions: [] };
const fullResultDoc = { races: resultRows };
const compactPredictionDoc = rank3plus.compactPredictionDoc(fullPredictionDoc);
const compactResultDoc = rank3plus.compactResultDoc(fullResultDoc);
assert.equal(compactPredictionDoc.predictions[0].unusedPayload, undefined);
assert.equal(compactPredictionDoc.predictions[0].prediction.unusedPayload, undefined);
assert.equal(compactResultDoc.races[0].unusedPayload, undefined);
const fullReport = rank3plus.build([fullPredictionDoc], [fullResultDoc]);
const compactReport = rank3plus.build([compactPredictionDoc], [compactResultDoc]);
assert.deepEqual(compactReport.summary, fullReport.summary);
assert.deepEqual(compactReport.dimensions, fullReport.dimensions);
assert.deepEqual(compactReport.rankings, fullReport.rankings);
assert.deepEqual(
  compactReport.weakestEligibleBranches,
  fullReport.weakestEligibleBranches,
);

console.log("breakdown writer contract: ok");
