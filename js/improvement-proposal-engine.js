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

function build(records) {
  const aggregated = collect(records);
  const ready = aggregated.settledCount >= MIN_RACES;
  const proposals = ready
    ? aggregated.counts
      .map(row => {
        const definition = EFFECT_MAP[row.code];
        const rate = aggregated.settledCount ? Math.round(row.count / aggregated.settledCount * 1000) / 10 : 0;
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
      })
      .sort((a, b) => b.sampleCount - a.sampleCount || a.code.localeCompare(b.code))
    : [];

  return {
    schemaVersion: 1,
    engineVersion: "improvement-proposal-phase3-20260806",
    status: ready ? "proposal-candidates-ready" : "collecting-data",
    minimumRaceCount: MIN_RACES,
    settledRaceCount: aggregated.settledCount,
    remainingRaceCount: Math.max(0, MIN_RACES - aggregated.settledCount),
    proposals,
    proposalCount: proposals.length,
    proposalOnly: true,
    humanApprovalRequired: true,
    usableForPrediction: false,
    automaticApplication: false,
    uiVisible: false
  };
}

module.exports = { MIN_RACES, EFFECT_MAP, collect, build };
