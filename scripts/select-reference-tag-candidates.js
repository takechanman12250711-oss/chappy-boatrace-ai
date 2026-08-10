#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_INPUT = "data/analysis/reference-tag-effectiveness.json";
const DEFAULT_OUTPUT = "data/analysis/reference-tag-selection.json";

function classify(tag) {
  const samples = Number(tag?.samples || 0);
  const targetSamples = Number(tag?.targetSamples || 0);
  const winnerRate = Number(tag?.winnerRate || 0);
  const top3Rate = Number(tag?.top3Rate || 0);

  if (!targetSamples) {
    return {
      selection: samples >= 100 ? "condition-adjustment-candidate" : "hold",
      reason: samples >= 100
        ? "艇を直接選ぶ指標ではないため、展開・水面条件の補正候補としてのみ検証する"
        : "条件タグであり、かつ標本数が100未満のため追加蓄積を優先する"
    };
  }

  if (targetSamples >= 100 && top3Rate >= 65 && winnerRate >= 30) {
    return {
      selection: "shadow-ab-candidate",
      reason: "標本100以上・1着30%以上・3着内65%以上を満たすため、予想へ自動反映せず影A/Bで検証する"
    };
  }

  if (targetSamples >= 100 && top3Rate >= 55) {
    return {
      selection: "secondary-hold",
      reason: "3着内55%以上だが採用基準には届かないため、補助候補として継続観測する"
    };
  }

  return {
    selection: "hold",
    reason: targetSamples < 100
      ? "標本数が100未満のため追加蓄積を優先する"
      : "現時点の命中率が採用基準に届かないため予想には接続しない"
  };
}

function buildSelectionReport(report) {
  const tags = Array.isArray(report?.tags) ? report.tags : [];
  const selections = tags.map(tag => ({
    key: tag.key,
    label: tag.label,
    samples: Number(tag.samples || 0),
    targetSamples: Number(tag.targetSamples || 0),
    winnerRate: tag.winnerRate ?? null,
    top3Rate: tag.top3Rate ?? null,
    ticketHitRate: Number(tag.ticketHitRate || 0),
    ...classify(tag)
  }));

  return {
    schemaVersion: 1,
    generatedFrom: DEFAULT_INPUT,
    matchedRaceCount: Number(report?.matchedRaceCount || 0),
    dataSource: String(report?.dataSource || ""),
    compatibilityProfile: String(report?.compatibilityProfile || ""),
    causalClaim: false,
    productionApplication: false,
    thresholds: {
      shadowAbCandidate: {
        minTargetSamples: 100,
        minWinnerRate: 30,
        minTop3Rate: 65
      },
      secondaryHold: {
        minTargetSamples: 100,
        minTop3Rate: 55
      },
      conditionAdjustmentCandidate: {
        minSamples: 100,
        targetSamplesRequired: 0
      }
    },
    selections,
    shadowAbCandidates: selections.filter(item => item.selection === "shadow-ab-candidate").map(item => item.key),
    conditionAdjustmentCandidates: selections.filter(item => item.selection === "condition-adjustment-candidate").map(item => item.key),
    holdCandidates: selections.filter(item => ["secondary-hold", "hold"].includes(item.selection)).map(item => item.key),
    note: "相関集計から次の検証対象を選ぶためのゲート。因果効果や回収率改善を証明するものではなく、production予想には自動反映しない。"
  };
}

function main() {
  const input = process.argv[2] || DEFAULT_INPUT;
  const output = process.argv[3] || DEFAULT_OUTPUT;
  const report = JSON.parse(fs.readFileSync(input, "utf8"));
  const selection = buildSelectionReport(report);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  console.log(`reference-tag selection: ${selection.selections.length} tags -> ${output}`);
}

if (require.main === module) main();
module.exports = { buildSelectionReport, classify };
