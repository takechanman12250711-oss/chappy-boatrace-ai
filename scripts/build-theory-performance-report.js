"use strict";

const fs = require("node:fs");
const path = require("node:path");
const report = require("../js/theory-performance-report");
const evaluator = require("../js/theory-evaluation-engine");
const verification = require("../js/prediction-verification");
const inputContract = require("./analysis-input-contract");
const zeroDiagnostics = require("./theory-zero-evidence-diagnostics");
const venueProfile = require("../js/venue-theory-profile");
const venueScenarioCandidates = require("../js/venue-scenario-improvement-candidates");
const venueThreeAttackDiagnosis = require("../js/venue-three-attack-race-diagnosis");

const root = path.resolve(__dirname, "..");
const out = path.join(root, "data", "stats", "theory-performance-report.json");
const venueProfileOut = path.join(root, "data", "stats", "venue-theory-profile.json");
const venueScenarioCandidateOut = path.join(root, "data", "stats", "venue-scenario-improvement-candidates.json");
const venueThreeAttackDiagnosisOut = path.join(root, "data", "stats", "venue-three-attack-race-diagnosis.json");
const twoCourseSashiEvidencePath = path.join(root, "data", "stats", "race-flow-2course-sashi-skip-ab-report.json");
const ANALYSIS_INPUT_CONTRACT =
  "official-pre-deadline-cohort-v1";

function officialPayout(result = {}) {
  const value = Number(
    result?.trifecta?.payout ??
    result?.payout ??
    result?.payoutPer100 ??
    result?.officialPayoutPer100
  );
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/*
  Daily prediction documents contain browser/runtime snapshots that are not
  referenced by this report. Keeping every full row until the official-result
  join can exceed the Actions runner heap. Project each parsed daily row to the
  evidence used by the report before it is retained in the corpus.

  This is an input-memory optimization only. It must not regenerate a
  prediction or change tickets, theory evidence, marks, or scenario choices.
*/
function compactPredictionRecord(record = {}) {
  const prediction = record?.prediction || {};
  const practicalSelection = prediction?.practicalSelection || {};
  const aiCore = prediction?.aiCore || {};
  const raceFlow = prediction?.raceFlow || {};
  const compactBoat = row => ({
    boatNo: row?.boatNo,
    no: row?.no,
    boat: row?.boat,
    course: row?.course,
    courseOfficial: row?.courseOfficial,
    isOfficialCourse: row?.isOfficialCourse,
    courseMappingSource: row?.courseMappingSource,
    mappingSource: row?.mappingSource,
    exhibitionST: row?.exhibitionST,
    currentST: row?.currentST,
    avgST: row?.avgST,
    exhibitionTime: row?.exhibitionTime,
    className: row?.className,
    nationalWinRate: row?.nationalWinRate,
    motor2Rate: row?.motor2Rate
  });
  const compactConditions = conditions => {
    if (!conditions || typeof conditions !== "object") return conditions;
    return {
      schemaVersion: conditions.schemaVersion,
      source: conditions.source,
      dataSource: conditions.dataSource,
      sourceTiming: conditions.sourceTiming,
      sourceFetchedAt: conditions.sourceFetchedAt,
      officialResultUsed: conditions.officialResultUsed,
      newEngineMode: conditions.newEngineMode,
      dataAvailability: conditions.dataAvailability,
      weather: conditions.weather,
      boats: Array.isArray(conditions.boats)
        ? conditions.boats.map(compactBoat)
        : conditions.boats,
      entries: Array.isArray(conditions.entries)
        ? conditions.entries.map(compactBoat)
        : conditions.entries
    };
  };
  const compactRaceScenarios = value => {
    if (!value || typeof value !== "object") return value;
    return {
      attacker: value.attacker,
      mainScenario: value.mainScenario,
      subScenario: value.subScenario,
      scenarios: value.scenarios,
      frameMovement: value.frameMovement,
      evidence: value.evidence?.frameMovement
        ? { frameMovement: value.evidence.frameMovement }
        : undefined
    };
  };
  const compactAiCore = {
    marks: aiCore.marks,
    formations: aiCore.formations?.evidence?.branches
      ? {
          evidence: {
            branches: aiCore.formations.evidence.branches
          }
        }
      : undefined,
    stSlitTheory: aiCore.stSlitTheory,
    wallTheory: aiCore.wallTheory,
    raceScenarios: compactRaceScenarios(aiCore.raceScenarios),
    analysisRaceScenarios:
      compactRaceScenarios(aiCore.analysisRaceScenarios),
    exhibitionPerformanceTheory: aiCore.exhibitionPerformanceTheory,
    doubleTime: aiCore.doubleTime,
    newEnvironmentTheory: aiCore.newEnvironmentTheory,
    analyses: Array.isArray(aiCore.analyses)
      ? aiCore.analyses.map(row => ({
          boatNo: row?.boatNo,
          number: row?.number,
          lane: row?.lane,
          waku: row?.waku,
          indexes: row?.indexes
            ? { total: row.indexes.total }
            : undefined
        }))
      : undefined
  };

  return {
    raceKey: record.raceKey,
    date: record.date,
    raceDate: record.raceDate,
    targetDate: record.targetDate,
    jcd: record.jcd,
    placeCode: record.placeCode,
    raceNo: record.raceNo,
    rno: record.rno,
    race: record.race
      ? {
          date: record.race.date,
          jcd: record.race.jcd,
          placeCode: record.race.placeCode,
          raceNo: record.race.raceNo,
          rno: record.race.rno
        }
      : undefined,
    place: record.place,
    marker: record.marker,
    selectedAt: record.selectedAt,
    capturedAt: record.capturedAt,
    createdAt: record.createdAt,
    deadlineAt: record.deadlineAt,
    deadline: record.deadline,
    verificationMode: record.verificationMode,
    predictionMode: record.predictionMode,
    isRetrospective: record.isRetrospective,
    officialResultUsedForPrediction:
      record.officialResultUsedForPrediction,
    officialResultUsedForEvaluation:
      record.officialResultUsedForEvaluation,
    preRaceConditions:
      compactConditions(record.preRaceConditions),
    theoryTagSnapshot: record.theoryTagSnapshot,
    prediction: {
      practicalTickets: prediction.practicalTickets,
      practicalSelection: {
        tickets: practicalSelection.tickets,
        selectionScore: practicalSelection.selectionScore,
        score: practicalSelection.score,
        verificationEvidence:
          practicalSelection.verificationEvidence
      },
      verificationEvidence: prediction.verificationEvidence,
      mainSheet: prediction.mainSheet,
      preRaceConditions:
        compactConditions(prediction.preRaceConditions),
      predictedScenarioTitle:
        prediction.predictedScenarioTitle,
      raceFlow: {
        title: raceFlow.title,
        scenario: raceFlow?.scenario
          ? { title: raceFlow.scenario.title }
          : undefined
      },
      scenarioAiV6Shadow: prediction.scenarioAiV6Shadow,
      scenarios: prediction.scenarios,
      skipAiDisplay: prediction.skipAiDisplay,
      skipAiShadow: prediction.skipAiShadow,
      skipDecision: prediction.skipDecision,
      selectionScore: prediction.selectionScore,
      mainLineConfidence: prediction.mainLineConfidence,
      confidence: prediction.confidence,
      evidenceCompleteness: prediction.evidenceCompleteness,
      dataCompleteness: prediction.dataCompleteness,
      exhibition: prediction.exhibition,
      exhibitionData: prediction.exhibitionData,
      weather: prediction.weather,
      raceInfo: prediction.raceInfo?.weather
        ? { weather: prediction.raceInfo.weather }
        : undefined,
      internalEvaluation: prediction.internalEvaluation,
      evidence: prediction.evidence,
      marks: prediction.marks,
      inputSourceKind: prediction.inputSourceKind,
      flowSupport: prediction.flowSupport,
      stExhibitionSupport: prediction.stExhibitionSupport,
      skillLocalSupport: prediction.skillLocalSupport,
      frameRiseSinkSupport: prediction.frameRiseSinkSupport,
      doubleTimeSupport: prediction.doubleTimeSupport,
      theorySupport: prediction.theorySupport?.doubleTime
        ? { doubleTime: prediction.theorySupport.doubleTime }
        : undefined,
      motorEngineSupport: prediction.motorEngineSupport,
      venueWaterSupport: prediction.venueWaterSupport,
      wallTheory: prediction.wallTheory,
      raceScenarios:
        compactRaceScenarios(prediction.raceScenarios),
      exhibitionPerformanceTheory:
        prediction.exhibitionPerformanceTheory,
      doubleTime: prediction.doubleTime,
      flowPriority: prediction.flowPriority,
      formations: prediction.formations,
      aiCore: compactAiCore,
      predictionMode: prediction.predictionMode,
      isRetrospective: prediction.isRetrospective,
      officialResultUsedForPrediction:
        prediction.officialResultUsedForPrediction,
      officialResultUsedForEvaluation:
        prediction.officialResultUsedForEvaluation
    }
  };
}

function normalizeCohortRecord(record = {}) {
  const officialResult = record?.__officialResult || {};
  const prediction = record?.prediction || {};
  const resultTicket = inputContract.actualTicket(officialResult);
  if (!resultTicket) return null;

  const verified = verification.verifyPrediction(
    prediction,
    officialResult
  );
  const normalized = {
    ...record,
    result: {
      schemaVersion: 5,
      settled: true,
      resultAvailable: true,
      resultTicket,
      winningMethod: String(
        officialResult?.winningMethod || ""
      ),
      payout: officialPayout(officialResult),
      payoutPer100: officialPayout(officialResult),
      practicalHit: verified.practicalHit === true,
      verification: {
        ...verified
      },
      officialSource: String(
        officialResult?.source || ""
      )
    }
  };
  normalized.theoryEvaluationSnapshot =
    evaluator.build(normalized);
  return normalized;
}

function collect(options = {}) {
  const compact = Object.prototype.hasOwnProperty.call(
    options,
    "compactPredictionRecord"
  )
    ? options.compactPredictionRecord
    : compactPredictionRecord;
  const cohort = inputContract.buildDefaultCohort({
    root: options.root || root,
    predictionsDir: options.predictionsDir,
    resultsDir: options.resultsDir,
    compactPredictionRecord: compact
  });
  return {
    records: cohort.records
      .map(normalizeCohortRecord)
      .filter(Boolean),
    diagnostics: cohort.diagnostics
  };
}

function main() {
  const collected = collect();
  const records = collected.records;
  const built = {
    generatedAt: new Date().toISOString(),
    source: "data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",
    analysisInputContract:
      ANALYSIS_INPUT_CONTRACT,
    deduplication:
      "predictions-preferred-over-verificationPredictions",
    analysisInputDiagnostics:
      collected.diagnostics,
    ...report.build(records),
    zeroEvidenceDiagnostics: zeroDiagnostics.build(records)
  };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(built, null, 2) + "\n");
  const venueBuilt = venueProfile.build(built);
  fs.writeFileSync(venueProfileOut, JSON.stringify(venueBuilt, null, 2) + "\n");
  const twoCourseSashiSkip = fs.existsSync(twoCourseSashiEvidencePath)
    ? JSON.parse(fs.readFileSync(twoCourseSashiEvidencePath, "utf8"))
    : {};
  const candidateBuilt = venueScenarioCandidates.build(venueBuilt, {
    twoCourseSashiSkip
  });
  fs.writeFileSync(venueScenarioCandidateOut, JSON.stringify(candidateBuilt, null, 2) + "\n");
  const threeAttackBuilt = venueThreeAttackDiagnosis.build(records, {
    sourceGeneratedAt: built.generatedAt,
    analysisInputContract: ANALYSIS_INPUT_CONTRACT,
    diagnostics: collected.diagnostics
  });
  fs.writeFileSync(venueThreeAttackDiagnosisOut, JSON.stringify(threeAttackBuilt, null, 2) + "\n");
  console.log(`理論別成績：${built.byTheory.length}理論／${built.sampleCount}評価行`);
  console.log(`場別実戦傾向：${venueBuilt.venueCount}場／シナリオ ${venueBuilt.scenarioCoverage}`);
  console.log(`場×展開の改善候補：${candidateBuilt.discoveryCandidates.length}件／工程8へ直接移行 ${candidateBuilt.phase8HandoffSummary.eligibleForValidation}件`);
  console.log(`3コース攻めレース診断：${threeAttackBuilt.raceCount}件／重点3場`);
  console.log("0件理論診断詳細:");
  console.log(JSON.stringify(built.zeroEvidenceDiagnostics, null, 2));
}

if (require.main === module) main();
module.exports = {
  ANALYSIS_INPUT_CONTRACT,
  officialPayout,
  compactPredictionRecord,
  normalizeCohortRecord,
  collect,
  venueProfileOut,
  venueScenarioCandidateOut,
  venueThreeAttackDiagnosisOut,
  twoCourseSashiEvidencePath
};
