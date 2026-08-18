"use strict";

const MIN_RACES = 100;

const EFFECT_MAP = Object.freeze({
  "flow-reading-miss": { theory: "展開理論", action: "展開成立条件と崩れ条件の再検証", metric: "展開一致率" },
  "start-adjustment-insufficient": { theory: "ST・スリット理論", action: "ST差とスリット隊形の補正条件を再検証", metric: "1着・攻め艇一致率" },
  "exhibition-evaluation-insufficient": { theory: "展示・足理論", action: "展示順位と足評価の採用条件を再検証", metric: "展示評価関与時の回収率" },
  "wall-boat-evaluation-insufficient": { theory: "壁艇理論", action: "壁成立・不成立条件を再検証", metric: "壁艇関与時の展開一致率" },
  "local-water-adjustment-insufficient": { theory: "当地・水面理論", action: "場・風・波・潮の補正条件を再検証", metric: "場別回収率" },
  "ticket-coverage-insufficient": { theory: "買い目構成", action: "展開内の残し・拾い不足を再検証", metric: "実戦厳選的中率" },
  "ticket-spread-too-wide": { theory: "買い目構成", action: "不的中時の点数拡張条件を再検証", metric: "回収率" }
});

// これらは不的中後の状態から付く結果記述であり、単独では根本原因を証明しない。
// 件数は診断値として保持するが、根本原因の改善優先順位には混ぜない。
const OUTCOME_DIAGNOSTIC_CODES = Object.freeze(new Set([
  "ticket-coverage-insufficient",
  "ticket-spread-too-wide"
]));

function collect(records) {
  const settled = (Array.isArray(records) ? records : []).filter(record => record?.result?.settled === true);
  const counts = new Map();
  settled.forEach(record => {
    const analysis = record?.result?.missCauseAnalysis;
    if (!analysis || analysis.practicalHit === true) return;
    (Array.isArray(analysis.candidates) ? analysis.candidates : []).forEach(candidate => {
      const code = String(candidate?.code || "").trim();
      if (!code || !EFFECT_MAP[code]) return;
      const row = counts.get(code) || { code, label: String(candidate?.label || code), count: 0, high: 0, medium: 0, low: 0 };
      row.count += 1;
      if (["high", "medium", "low"].includes(candidate?.confidence)) row[candidate.confidence] += 1;
      counts.set(code, row);
    });
  });
  return { settledCount: settled.length, counts: [...counts.values()] };
}

function toReportRow(row, settledCount) {
  const definition = EFFECT_MAP[row.code];
  const rate = settledCount ? Math.round(row.count / settledCount * 1000) / 10 : 0;
  return {
    code: row.code,
    label: row.label,
    theory: definition.theory,
    sampleCount: row.count,
    occurrenceRate: rate,
    priority: row.high > 0 || rate >= 20 ? "high" : rate >= 10 ? "medium" : "low",
    improvementCandidate: definition.action,
    expectedEffect: `${definition.metric}の改善余地を検証`,
    confidenceBreakdown: { high: row.high, medium: row.medium, low: row.low }
  };
}

function diagnosticReason(code) {
  if (code === "ticket-spread-too-wide") {
    return "8点以上で不的中という結果条件から付くため、回収率・比較検証なしに根本原因と断定しない";
  }
  return "不的中結果から付く結果記述のため、件数だけで改善優先順位にしない";
}

function build(records) {
  const aggregated = collect(records);
  const ready = aggregated.settledCount >= MIN_RACES;
  const rows = ready
    ? aggregated.counts.map(row => toReportRow(row, aggregated.settledCount))
    : [];
  const outcomeDiagnostics = rows
    .filter(row => OUTCOME_DIAGNOSTIC_CODES.has(row.code))
    .map(row => ({
      ...row,
      diagnosticOnly: true,
      rootCauseCandidate: false,
      reason: diagnosticReason(row.code)
    }))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.code.localeCompare(b.code));
  const proposals = rows
    .filter(row => !OUTCOME_DIAGNOSTIC_CODES.has(row.code))
    .sort((a, b) => b.sampleCount - a.sampleCount || a.code.localeCompare(b.code));

  return {
    schemaVersion: 2,
    engineVersion: "improvement-proposal-phase3-20260818-root-cause-priority",
    status: ready ? "proposal-candidates-ready" : "collecting-data",
    minimumRaceCount: MIN_RACES,
    settledRaceCount: aggregated.settledCount,
    remainingRaceCount: Math.max(0, MIN_RACES - aggregated.settledCount),
    proposals,
    proposalCount: proposals.length,
    outcomeDiagnostics,
    outcomeDiagnosticCount: outcomeDiagnostics.length,
    proposalOnly: true,
    humanApprovalRequired: true,
    usableForPrediction: false,
    automaticApplication: false,
    uiVisible: false
  };
}

module.exports = { MIN_RACES, EFFECT_MAP, OUTCOME_DIAGNOSTIC_CODES, collect, toReportRow, diagnosticReason, build };
