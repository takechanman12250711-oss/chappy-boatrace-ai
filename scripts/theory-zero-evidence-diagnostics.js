"use strict";

const tags = require("../js/theory-tag-snapshot");
const evaluator = require("../js/theory-evaluation-engine");

const TARGETS = [
  { theoryKey: "start", label: "ST・スリット理論", supportPresent: prediction => Boolean(prediction?.flowSupport || prediction?.stExhibitionSupport), evidence: tags.stSlitEvidence, rawPattern: /stSlit|ST・スリット/i },
  { theoryKey: "skill", label: "技量理論", supportPresent: prediction => Boolean(prediction?.skillLocalSupport), evidence: tags.skillEvidence, rawPattern: /skill|技量/i },
  { theoryKey: "frame-rise-fall", label: "枠別浮沈率", supportPresent: prediction => Boolean(prediction?.frameRiseSinkSupport), evidence: tags.frameRiseSinkEvidence, rawPattern: /frameRiseSink|枠別浮沈/i },
  { theoryKey: "double-time", label: "ダブルタイム", supportPresent: prediction => Boolean(prediction?.doubleTimeSupport || prediction?.theorySupport?.doubleTime), evidence: tags.doubleTimeEvidence, rawPattern: /doubleTime|ダブルタイム/i },
  { theoryKey: "new-engine", label: "新エンジン理論", supportPresent: prediction => Boolean(prediction?.motorEngineSupport), evidence: tags.newEngineEvidence, rawPattern: /newEngine|新エンジン/i }
];

function predictionOf(record) { return record?.prediction && typeof record.prediction === "object" ? record.prediction : (record || {}); }
function sourceRows(record) { return Array.isArray(record?.theoryTagSnapshot?.theories) ? record.theoryTagSnapshot.theories : []; }
function diagnosticRows(record) { return Array.isArray(record?.theoryTagSnapshot?.evidenceDiagnostics?.rows) ? record.theoryTagSnapshot.evidenceDiagnostics.rows : []; }
function generationDiagnostic(record, theoryKey) { return diagnosticRows(record).find(row => row?.theoryKey === theoryKey) || null; }
function catalogTagged(record, theoryKey) { return sourceRows(record).some(row => evaluator.catalogTheoryFor(row)?.key === theoryKey); }
function rawPatternMatched(record, pattern) { return sourceRows(record).some(row => pattern.test([row?.theoryKey, row?.label, ...(row?.sources || [])].filter(Boolean).join(" "))); }
function evaluationRow(record, theoryKey, fresh = false) {
  const snapshot = fresh ? evaluator.build(record) : record?.theoryEvaluationSnapshot;
  const rows = Array.isArray(snapshot?.evaluations) ? snapshot.evaluations : [];
  return rows.find(row => row?.theoryKey === theoryKey) || null;
}
function addReason(summary, reason) {
  const key = String(reason || "").trim();
  if (!key) return;
  summary.set(key, Number(summary.get(key) || 0) + 1);
}
function build(records) {
  const settled = (Array.isArray(records) ? records : []).filter(record => record?.result?.settled === true);
  return TARGETS.map(target => {
    let supportPresentCount = 0, formalEvidenceCount = 0, catalogTaggedCount = 0, rawPatternMatchedCount = 0, supportWithoutFormalCount = 0;
    let storedEvaluationUsedCount = 0, freshEvaluationUsedCount = 0, storedEvaluatedCount = 0, freshEvaluatedCount = 0, freshInsufficientEvidenceCount = 0;
    let generationDiagnosticCount = 0;
    const missingReasonSummary = new Map();
    settled.forEach(record => {
      const prediction = predictionOf(record);
      const generated = generationDiagnostic(record, target.theoryKey);
      const present = generated ? generated.supportPresent === true : target.supportPresent(prediction);
      const evidence = generated ? { formal: generated.formal === true } : (target.evidence(prediction) || {});
      const stored = evaluationRow(record, target.theoryKey, false);
      const fresh = evaluationRow(record, target.theoryKey, true);
      if (generated) {
        generationDiagnosticCount += 1;
        (Array.isArray(generated.missingReasons) ? generated.missingReasons : []).forEach(reason => addReason(missingReasonSummary, reason));
      }
      if (present) supportPresentCount += 1;
      if (evidence.formal === true) formalEvidenceCount += 1;
      if (catalogTagged(record, target.theoryKey)) catalogTaggedCount += 1;
      if (rawPatternMatched(record, target.rawPattern)) rawPatternMatchedCount += 1;
      if (present && evidence.formal !== true) supportWithoutFormalCount += 1;
      if (stored?.used === true) storedEvaluationUsedCount += 1;
      if (fresh?.used === true) freshEvaluationUsedCount += 1;
      if (stored?.status === "evaluated") storedEvaluatedCount += 1;
      if (fresh?.status === "evaluated") freshEvaluatedCount += 1;
      if (fresh?.status === "insufficient-evidence") freshInsufficientEvidenceCount += 1;
    });
    const diagnosis = generationDiagnosticCount === 0 && supportPresentCount === 0 && catalogTaggedCount === 0
      ? "awaiting-generation-diagnostics"
      : supportPresentCount === 0 && catalogTaggedCount === 0
        ? "support-not-generated"
        : catalogTaggedCount > 0 && freshEvaluationUsedCount > storedEvaluationUsedCount
          ? "stored-evaluation-stale"
          : catalogTaggedCount > 0 && freshInsufficientEvidenceCount > 0 && freshEvaluatedCount === 0
            ? "tagged-but-no-ticket-evidence"
            : supportPresentCount > 0 && formalEvidenceCount === 0
              ? "support-present-but-formal-conditions-not-met"
              : formalEvidenceCount > 0 && catalogTaggedCount === 0
                ? "formal-evidence-present-but-tag-not-saved"
                : "tracking-active";
    return {
      theoryKey: target.theoryKey,
      label: target.label,
      settledRaceCount: settled.length,
      generationDiagnosticCount,
      supportPresentCount,
      formalEvidenceCount,
      catalogTaggedCount,
      rawPatternMatchedCount,
      supportWithoutFormalCount,
      storedEvaluationUsedCount,
      freshEvaluationUsedCount,
      storedEvaluatedCount,
      freshEvaluatedCount,
      freshInsufficientEvidenceCount,
      staleEvaluationCount: Math.max(0, freshEvaluationUsedCount - storedEvaluationUsedCount),
      missingReasonSummary: [...missingReasonSummary.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
      diagnosis
    };
  });
}
module.exports = { TARGETS, predictionOf, sourceRows, diagnosticRows, generationDiagnostic, catalogTagged, rawPatternMatched, evaluationRow, build };
