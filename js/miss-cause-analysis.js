"use strict";

const THEORY_CAUSES = Object.freeze({
  "race-flow": { code: "flow-reading-miss", label: "展開読み違い" },
  start: { code: "start-adjustment-insufficient", label: "ST補正不足" },
  exhibition: { code: "exhibition-evaluation-insufficient", label: "展示評価不足" },
  "wall-boat": { code: "wall-boat-evaluation-insufficient", label: "壁艇理論不足" },
  "local-water": { code: "local-water-adjustment-insufficient", label: "当地補正不足" }
});

function normalizeTickets(value) {
  return (Array.isArray(value) ? value : [])
    .map(item => String(item?.ticket || item || "").match(/[1-6]/g) || [])
    .filter(parts => parts.length >= 3)
    .map(parts => parts.slice(0, 3).join("-"));
}

function addCandidate(rows, candidate) {
  if (!candidate?.code || rows.some(row => row.code === candidate.code)) return;
  rows.push(candidate);
}

function build(record) {
  const result = record?.result || {};
  const review = result?.review || {};
  const prediction = record?.prediction || {};
  const evaluations = record?.theoryEvaluationSnapshot?.evaluations || [];
  const practicalTickets = normalizeTickets(prediction?.practicalTickets);
  const settled = result?.settled === true;
  const hit = result?.practicalHit === true || review?.practicalHit === true;
  const candidates = [];

  if (!settled) {
    return {
      schemaVersion: 1,
      engineVersion: "miss-cause-analysis-phase2-20260806",
      status: "result-unavailable",
      candidates: [],
      usableForPrediction: false,
      automaticApplication: false,
      uiVisible: false
    };
  }

  if (!hit) {
    const missType = String(review?.missType || "");
    if (["頭外れ", "相手抜け", "完全抜け", "着順違い"].includes(missType)) {
      addCandidate(candidates, {
        code: "ticket-coverage-insufficient",
        label: "買い目不足",
        confidence: missType === "完全抜け" ? "high" : "medium",
        evidence: [`実戦厳選は${missType}`]
      });
    }
    if (practicalTickets.length >= 8) {
      addCandidate(candidates, {
        code: "ticket-spread-too-wide",
        label: "買い目広げ過ぎ",
        confidence: "low",
        evidence: [`実戦厳選${practicalTickets.length}点で不的中`]
      });
    }

    evaluations.forEach(row => {
      const definition = THEORY_CAUSES[row?.theoryKey];
      if (!definition || row?.status !== "evaluated" || row?.matched !== false) return;
      addCandidate(candidates, {
        ...definition,
        confidence: "medium",
        evidence: [
          `${row?.label || row?.theoryKey}が使用されたが公式結果を含まなかった`,
          ...(Array.isArray(row?.tickets) && row.tickets.length ? [`対象買い目: ${row.tickets.join(" / ")}`] : [])
        ]
      });
    });

    if (review?.scenarioMatch === false) {
      addCandidate(candidates, {
        code: "flow-reading-miss",
        label: "展開読み違い",
        confidence: "high",
        evidence: ["中心展開と実際の決まり手・着順が不一致"]
      });
    }
  }

  return {
    schemaVersion: 1,
    engineVersion: "miss-cause-analysis-phase2-20260806",
    status: hit ? "hit-no-miss-analysis" : candidates.length ? "candidates-recorded" : "insufficient-evidence",
    practicalHit: hit,
    practicalTicketCount: practicalTickets.length,
    candidates,
    causeCount: candidates.length,
    causalClaim: false,
    usableForPrediction: false,
    automaticApplication: false,
    uiVisible: false
  };
}

module.exports = { THEORY_CAUSES, normalizeTickets, build };
