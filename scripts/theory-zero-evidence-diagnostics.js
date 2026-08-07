"use strict";

const tags = require("../js/theory-tag-snapshot");

const TARGETS = [
  {
    theoryKey: "start",
    label: "ST・スリット理論",
    supportPresent: prediction => Boolean(prediction?.flowSupport || prediction?.stExhibitionSupport),
    evidence: tags.stSlitEvidence
  },
  {
    theoryKey: "skill",
    label: "技量理論",
    supportPresent: prediction => Boolean(prediction?.skillLocalSupport),
    evidence: tags.skillEvidence
  },
  {
    theoryKey: "frame-rise-fall",
    label: "枠別浮沈率",
    supportPresent: prediction => Boolean(prediction?.frameRiseSinkSupport),
    evidence: tags.frameRiseSinkEvidence
  },
  {
    theoryKey: "double-time",
    label: "ダブルタイム",
    supportPresent: prediction => Boolean(prediction?.doubleTimeSupport || prediction?.theorySupport?.doubleTime),
    evidence: tags.doubleTimeEvidence
  },
  {
    theoryKey: "new-engine",
    label: "新エンジン理論",
    supportPresent: prediction => Boolean(prediction?.motorEngineSupport),
    evidence: tags.newEngineEvidence
  }
];

function predictionOf(record) {
  return record?.prediction && typeof record.prediction === "object" ? record.prediction : (record || {});
}

function tagged(record, theoryKey) {
  const rows = Array.isArray(record?.theoryTagSnapshot?.theories) ? record.theoryTagSnapshot.theories : [];
  const patterns = {
    start: /stSlit|ST・スリット/i,
    skill: /skill|技量/i,
    "frame-rise-fall": /frameRiseSink|枠別浮沈/i,
    "double-time": /doubleTime|ダブルタイム/i,
    "new-engine": /newEngine|新エンジン/i
  };
  return rows.some(row => patterns[theoryKey]?.test([row?.theoryKey, row?.label, ...(row?.sources || [])].filter(Boolean).join(" ")));
}

function build(records) {
  const settled = (Array.isArray(records) ? records : []).filter(record => record?.result?.settled === true);
  return TARGETS.map(target => {
    let supportPresentCount = 0;
    let formalEvidenceCount = 0;
    let taggedCount = 0;
    let supportWithoutFormalCount = 0;
    settled.forEach(record => {
      const prediction = predictionOf(record);
      const present = target.supportPresent(prediction);
      const evidence = target.evidence(prediction) || {};
      if (present) supportPresentCount += 1;
      if (evidence.formal === true) formalEvidenceCount += 1;
      if (tagged(record, target.theoryKey)) taggedCount += 1;
      if (present && evidence.formal !== true) supportWithoutFormalCount += 1;
    });
    return {
      theoryKey: target.theoryKey,
      label: target.label,
      settledRaceCount: settled.length,
      supportPresentCount,
      formalEvidenceCount,
      taggedCount,
      supportWithoutFormalCount,
      diagnosis: supportPresentCount === 0
        ? "support-not-generated"
        : formalEvidenceCount === 0
          ? "support-present-but-formal-conditions-not-met"
          : taggedCount === 0
            ? "formal-evidence-present-but-tag-not-saved"
            : "tracking-active"
    };
  });
}

module.exports = { TARGETS, predictionOf, tagged, build };
