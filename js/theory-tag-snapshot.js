"use strict";

function normalizeTicket(value) {
  const boats = String(value || "").match(/[1-6]/g) || [];
  return boats.length >= 3 ? boats.slice(0, 3).join("-") : "";
}

function normalizeCategory(value) {
  const text = String(value || "");
  if (/本線|本命|中心/.test(text)) return "本線";
  if (/押さえ|安全/.test(text)) return "押さえ";
  if (/流し/.test(text)) return "流し";
  if (/独立展開|展開追加/.test(text)) return "独立展開";
  if (/万舟|穴|高配当/.test(text)) return "万舟・穴";
  return "その他";
}

function validCourse(value) {
  const course = Number(value);
  return Number.isInteger(course) && course >= 1 && course <= 6;
}

function branchMap(prediction) {
  const branches = prediction?.aiCore?.formations?.evidence?.branches || prediction?.formations?.evidence?.branches || [];
  return new Map((Array.isArray(branches) ? branches : []).map(branch => [String(branch?.id || ""), branch]).filter(([id]) => id));
}

function branchUsesCourseEvidence(branch) {
  if (!branch || branch.kind !== "independent-scenario") return false;
  const phase = branch.phaseEvidence || {};
  const checks = Array.isArray(branch.evidenceChecks) ? branch.evidenceChecks : [];
  const explicitCheck = checks.some(check => {
    const key = String(check?.key || "").toLowerCase();
    const source = String(check?.source || "").toLowerCase();
    const role = String(check?.role || "").toLowerCase();
    return role === "course" || key.includes("course") || source.includes("coursebyboat");
  });
  if (explicitCheck) return true;
  if (phase.kind === "alternate-head" && validCourse(phase?.attack?.course)) return true;
  if (phase.kind === "hold-continuation") {
    if (validCourse(phase?.target?.course)) return true;
    if (String(phase?.partner?.type || "") === "inside") return true;
  }
  return false;
}

function courseClaimForTicket(prediction, evidenceRow) {
  const ids = Array.isArray(evidenceRow?.branchIds) ? evidenceRow.branchIds : [];
  if (!ids.length) return null;
  const branches = branchMap(prediction);
  if (!ids.map(id => branches.get(String(id))).some(branchUsesCourseEvidence)) return null;
  return { theoryKey: "course", label: "コース理論", theoryVersion: "structured-course-validation-v1", formal: true, source: "structured-course-validation" };
}

function supportStatements(support) {
  const confirms = Array.isArray(support?.confirms) ? support.confirms : Array.isArray(support?.confirmations) ? support.confirmations : [];
  const alerts = Array.isArray(support?.alerts) ? support.alerts : Array.isArray(support?.cautions) ? support.cautions : [];
  return [...confirms, ...alerts].map(String);
}

function supportAttackBoatNo(prediction, support) {
  return Number(support?.attackBoatNo || support?.centerBoatNo || prediction?.flowPriority?.attackBoatNo || prediction?.flowPriority?.attackBoat || 0);
}

function optionalNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stSlitEvidence(prediction) {
  const support = prediction?.flowSupport || prediction?.stExhibitionSupport || {};
  const attackBoatNo = supportAttackBoatNo(prediction, support);
  const stCoverage = Number(support?.dataCoverage?.st || 0);
  const stRank = Number(support?.attackSTRank || 0);
  const statements = supportStatements(support);
  const explicit = statements.some(text => /ST|スリット/.test(text));
  return { formal: attackBoatNo >= 1 && attackBoatNo <= 6 && stCoverage >= 4 && stRank >= 1 && stRank <= 6 && explicit, attackBoatNo, stCoverage, stRank, statements };
}

function stSlitClaimForTicket(prediction, ticket) {
  const evidence = stSlitEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.attackBoatNo)) return null;
  return { theoryKey: "stSlit", label: "ST・スリット理論", theoryVersion: "flow-support-st-slit-v1", formal: true, source: "flow-support-st-slit" };
}

function exhibitionFootEvidence(prediction) {
  const support = prediction?.flowSupport || prediction?.stExhibitionSupport || {};
  const attackBoatNo = supportAttackBoatNo(prediction, support);
  const exhibitionCoverage = Number(support?.dataCoverage?.exhibition || 0);
  const exhibitionRank = Number(support?.attackExhibitionRank || 0);
  const statements = supportStatements(support);
  const explicit = statements.some(text => /展示|足|気配/.test(text));
  return { formal: attackBoatNo >= 1 && attackBoatNo <= 6 && exhibitionCoverage >= 4 && exhibitionRank >= 1 && exhibitionRank <= 6 && explicit, attackBoatNo, exhibitionCoverage, exhibitionRank, statements };
}

function exhibitionFootClaimForTicket(prediction, ticket) {
  const evidence = exhibitionFootEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.attackBoatNo)) return null;
  return { theoryKey: "exhibitionFoot", label: "展示・足理論", theoryVersion: "flow-support-exhibition-foot-v1", formal: true, source: "flow-support-exhibition-foot" };
}

function localWaterEvidence(prediction) {
  const support = prediction?.venueWaterSupport || {};
  const venue = String(support?.venue || "").trim();
  const wind = optionalNumber(support?.wind);
  const wave = optionalNumber(support?.wave);
  const tide = String(support?.tide || "").trim();
  const statements = supportStatements(support);
  const hasMeasuredCondition = wind !== null || wave !== null || Boolean(tide);
  const hasSpecificVenueRule = statements.some(text => !/水面特性を補助評価/.test(text) && /イン|差し|潮|風|波|水面|ナイター|展示|乗り心地/.test(text));
  return { formal: Boolean(venue) && statements.length > 0 && (hasMeasuredCondition || hasSpecificVenueRule), venue, wind, wave, tide, statements };
}

function localWaterClaimForTicket(prediction, ticket) {
  const evidence = localWaterEvidence(prediction);
  if (!evidence.formal || !normalizeTicket(ticket)) return null;
  return { theoryKey: "localWater", label: "当地・水面理論", theoryVersion: "venue-water-support-v1", formal: true, source: "venue-water-support" };
}

function skillEvidence(prediction) {
  const support = prediction?.skillLocalSupport || {};
  const attackBoatNo = supportAttackBoatNo(prediction, support);
  const target = (Array.isArray(support?.boats) ? support.boats : []).find(row => Number(row?.boatNo) === attackBoatNo) || null;
  const statements = supportStatements(support).filter(text => !/当地/.test(text));
  const explicit = statements.some(text => /A1級|A2級|B2級|技量|全国勝率|平均ST|1着率/.test(text));
  const hasSkillData = Boolean(target && (target.grade || target.nationalWinRate !== null || target.avgST !== null || target.firstRate !== null));
  return { formal: attackBoatNo >= 1 && attackBoatNo <= 6 && hasSkillData && explicit, attackBoatNo, target, statements };
}

function skillClaimForTicket(prediction, ticket) {
  const evidence = skillEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.attackBoatNo)) return null;
  return { theoryKey: "skill", label: "技量理論", theoryVersion: "skill-local-support-v1", formal: true, source: "skill-local-support" };
}

function motorEvidence(prediction) {
  const support = prediction?.motorEngineSupport || {};
  const centerBoatNo = supportAttackBoatNo(prediction, support);
  const rate = Number(support?.centerMotorRate);
  const statements = supportStatements(support);
  const explicit = statements.some(text => /モーター実績(上位|下位)/.test(text));
  const normalMode = support?.newEngineMode === false || String(support?.mode || "") === "normal";
  return { formal: centerBoatNo >= 1 && centerBoatNo <= 6 && normalMode && Number.isFinite(rate) && explicit, centerBoatNo, centerMotorRate: Number.isFinite(rate) ? rate : null, mode: String(support?.mode || ""), statements };
}

function motorClaimForTicket(prediction, ticket) {
  const evidence = motorEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.centerBoatNo)) return null;
  return { theoryKey: "motor", label: "モーター理論", theoryVersion: "motor-engine-support-v1", formal: true, source: "motor-engine-support" };
}

function wallEvidence(prediction) {
  const storedEvidence = prediction?.practicalSelection?.verificationEvidence || prediction?.verificationEvidence || {};
  const wall = prediction?.aiCore?.wallTheory || prediction?.wallTheory || prediction?.raceScenarios?.wallTheory || storedEvidence?.wallTheory || {};
  const attackerNo = Number(wall?.attackerNo || prediction?.aiCore?.raceScenarios?.attacker || 0);
  const wallCandidateNo = Number(wall?.wallCandidateNo || 0);
  const wallBoat = Number(wall?.wallBoat || 0);
  const state = String(wall?.state || "").trim();
  const score = Number(wall?.score);
  const grade = String(wall?.grade || "").trim();
  const formalState = /^(壁成立|互角|壁崩れ)$/.test(state);
  const hasStructure = attackerNo >= 1 && attackerNo <= 6 && wallCandidateNo >= 1 && wallCandidateNo <= 6 && Number.isFinite(score) && Boolean(grade);
  return { formal: formalState && hasStructure, attackerNo, wallCandidateNo, wallBoat: wallBoat >= 1 && wallBoat <= 6 ? wallBoat : null, state, score: Number.isFinite(score) ? score : null, grade };
}

function wallClaimForTicket(prediction, ticket) {
  const evidence = wallEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.attackerNo)) return null;
  return { theoryKey: "wallBoat", label: "壁艇理論", theoryVersion: "ai-core-wall-theory-v1", formal: true, source: "ai-core-wall-theory-v1" };
}

function appliedFrameRiseSinkSupport(prediction) {
  const analysisRuntime = prediction?.aiCore?.analysisRaceScenarios || {};
  const canonicalRuntime = prediction?.aiCore?.raceScenarios || prediction?.raceScenarios || {};
  const stored = prediction?.practicalSelection?.verificationEvidence || prediction?.verificationEvidence || {};
  const runtime = Array.isArray(analysisRuntime?.scenarios) && analysisRuntime.scenarios.length
    ? analysisRuntime
    : canonicalRuntime;
  const scenarios = Array.isArray(runtime?.scenarios) && runtime.scenarios.length
    ? runtime.scenarios
    : (Array.isArray(stored?.scenarios) ? stored.scenarios : []);
  const mainScenario = runtime?.mainScenario || stored?.mainScenario || null;
  const frameMovement = Array.isArray(runtime?.frameMovement) && runtime.frameMovement.length
    ? runtime.frameMovement
    : Array.isArray(runtime?.evidence?.frameMovement) && runtime.evidence.frameMovement.length
      ? runtime.evidence.frameMovement
      : (Array.isArray(stored?.frameMovement) ? stored.frameMovement : []);

  const mainType = String(mainScenario?.type || "").trim();
  /*
    枠補正は既にAIコアの展開点へ反映済みである。ここでは予想を
    再計算せず、最終主展開へ実際に加えた値だけを保存証拠へ写す。
    代替展開は買い目枝との対応を証明できないため流用しない。
  */
  const main = scenarios.find(scenario => String(scenario?.type || "").trim() === mainType) || mainScenario;
  const frameNo = Number(
    main?.attackerBoatNo ??
    main?.headBoatNo ??
    main?.attacker
  );
  const frame = frameMovement.find(row => Number(row?.boatNo) === frameNo) || null;
  if (!main || !frame) return null;

  const scenarioAdjustment = Number(main?.frameMovementAdjustment);
  const scoreAdjustment = Number(frame?.scoreAdjustment);
  const label = String(frame?.label || "").trim();
  const type = label === "浮上" ? "rise" : label === "沈下" ? "sink" : "";
  const rate = type === "rise" ? optionalNumber(frame?.riseRate) : type === "sink" ? optionalNumber(frame?.sinkRate) : null;
  const samples = optionalNumber(frame?.samples);
  const consistentAdjustment = Number.isFinite(scoreAdjustment) && scoreAdjustment !== 0 && scenarioAdjustment === scoreAdjustment;
  const applied = frameNo >= 1 && frameNo <= 6 && frame?.appliedToScore === true && consistentAdjustment;

  return {
    // productionで適用中のAIコア規則だけを読むため、新しい予想承認ではない。
    approved: true,
    applied,
    frameNo,
    type,
    samples,
    rate,
    source: "ai-core-frame-movement-v1",
    scenarioType: String(main?.type || ""),
    scoreAdjustment: Number.isFinite(scoreAdjustment) ? scoreAdjustment : null,
    movementDelta: optionalNumber(frame?.movementDelta)
  };
}

function frameRiseSinkEvidence(prediction) {
  const directSupport = prediction?.frameRiseSinkSupport && typeof prediction.frameRiseSinkSupport === "object"
    ? prediction.frameRiseSinkSupport
    : null;
  const runtimeSupport = appliedFrameRiseSinkSupport(prediction);
  const support = directSupport || runtimeSupport || {};
  const rawFrameMovement = prediction?.aiCore?.analysisRaceScenarios?.frameMovement || prediction?.aiCore?.raceScenarios?.frameMovement || prediction?.aiCore?.raceScenarios?.evidence?.frameMovement || prediction?.raceScenarios?.frameMovement || prediction?.raceScenarios?.evidence?.frameMovement || prediction?.practicalSelection?.verificationEvidence?.frameMovement || prediction?.verificationEvidence?.frameMovement;
  const supportPresent = Boolean(directSupport || runtimeSupport || (Array.isArray(rawFrameMovement) && rawFrameMovement.length));
  const applied = support?.applied === true;
  const approved = support?.approved === true;
  const frameNo = Number(support?.frameNo);
  const type = String(support?.type || "").trim();
  const samples = optionalNumber(support?.samples);
  const rate = optionalNumber(support?.rate);
  const source = String(support?.source || "").trim();
  const scenarioType = String(support?.scenarioType || "").trim();
  const scoreAdjustment = optionalNumber(support?.scoreAdjustment);
  const movementDelta = optionalNumber(support?.movementDelta);
  const validType = /^(rise|sink)$/.test(type);
  const enoughSamples = Number.isFinite(samples) && samples >= 10;
  const validRate = Number.isFinite(rate) && rate >= 0 && rate <= 100;
  return { formal: applied && approved && frameNo >= 1 && frameNo <= 6 && validType && enoughSamples && validRate && Boolean(source), supportPresent, applied, approved, frameNo, type, samples: Number.isFinite(samples) ? samples : null, rate: Number.isFinite(rate) ? rate : null, source, scenarioType, scoreAdjustment, movementDelta };
}

function frameRiseSinkClaimForTicket(prediction, ticket, evidenceRow = {}) {
  const evidence = frameRiseSinkEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (evidence.source === "ai-core-frame-movement-v1") {
    const roleClaims = Array.isArray(evidenceRow?.roleClaims) ? evidenceRow.roleClaims : [];
    const hasAttackHead = roleClaims.some(claim =>
      String(claim?.role || "") === "attack" &&
      Number(claim?.boatNo) === evidence.frameNo &&
      Array.isArray(claim?.expectedPositions) &&
      claim.expectedPositions.map(Number).includes(1)
    );
    if (boats[0] !== evidence.frameNo || !hasAttackHead) return null;
    return { theoryKey: "frameRiseSink", label: "枠別浮沈率", theoryVersion: "ai-core-frame-movement-v1", formal: true, source: evidence.source };
  }
  if (!boats.includes(evidence.frameNo)) return null;
  return { theoryKey: "frameRiseSink", label: "枠別浮沈率", theoryVersion: "approved-frame-rise-sink-v1", formal: true, source: evidence.source };
}

function appliedDoubleTimeSupport(prediction) {
  const performance =
    prediction?.aiCore?.exhibitionPerformanceTheory ||
    prediction?.exhibitionPerformanceTheory ||
    null;
  const calculated =
    prediction?.aiCore?.doubleTime ||
    prediction?.doubleTime ||
    null;
  if (!performance && !calculated) return null;

  const topBoat = Number(calculated?.topBoat);
  const role = (Array.isArray(performance?.roles) ? performance.roles : [])
    .find((item) => Number(item?.boatNo) === topBoat) || null;
  const lapSource = String(performance?.source?.lap || "").trim();
  const approvedLapSources = new Set([
    "BOATRACE浜名湖公式・独自計測一周"
  ]);
  const explicitLapSource = approvedLapSources.has(lapSource);
  const coherentApplication = Boolean(
    performance?.version === "exhibition-performance-v2" &&
    performance?.isFullMode === true &&
    performance?.isFormal === true &&
    performance?.appliedToScore === true &&
    Number(performance?.exhibitionCount) === 6 &&
    Number(performance?.lapCount) === 6 &&
    Number(performance?.doubleTimeBoat) === topBoat &&
    calculated?.isDouble === true &&
    role?.isDoubleTime === true &&
    role?.isFormal === true &&
    role?.appliedToScore === true &&
    Number(role?.components?.doubleTime) === 5 &&
    explicitLapSource
  );

  return {
    // 展示・足Ver2で既に配点済みの5点を記録する。予想へ再加点しない。
    approved: true,
    applied: coherentApplication,
    isDouble: calculated?.isDouble === true,
    topBoat,
    confidence: optionalNumber(calculated?.confidence),
    exhibitionGap: optionalNumber(calculated?.exhibitionGap),
    lapGap: optionalNumber(calculated?.lapGap),
    source: explicitLapSource
      ? `ai-core-exhibition-performance-v2:${lapSource}`
      : "",
    lapSource,
    exhibitionCount: optionalNumber(performance?.exhibitionCount),
    lapCount: optionalNumber(performance?.lapCount)
  };
}

function doubleTimeEvidence(prediction) {
  const directSupport =
    prediction?.doubleTimeSupport &&
    typeof prediction.doubleTimeSupport === "object"
      ? prediction.doubleTimeSupport
      : prediction?.theorySupport?.doubleTime &&
          typeof prediction.theorySupport.doubleTime === "object"
        ? prediction.theorySupport.doubleTime
        : null;
  const runtimeSupport = appliedDoubleTimeSupport(prediction);
  const support = directSupport || runtimeSupport || {};
  const supportPresent = Boolean(directSupport || runtimeSupport);
  const approved = support?.approved === true;
  const applied = support?.applied === true;
  const isDouble = support?.isDouble === true;
  const topBoat = optionalNumber(support?.topBoat ?? support?.topBoatNo);
  const confidence = optionalNumber(support?.confidence);
  const exhibitionGap = optionalNumber(support?.exhibitionGap);
  const lapGap = optionalNumber(support?.lapGap);
  const source = String(support?.source || "").trim();
  const lapSource = String(support?.lapSource || "").trim();
  const exhibitionCount = optionalNumber(support?.exhibitionCount);
  const lapCount = optionalNumber(support?.lapCount);
  const validBoat = topBoat >= 1 && topBoat <= 6;
  const validConfidence = Number.isFinite(confidence) && confidence >= 70 && confidence <= 100;
  const validGaps = Number.isFinite(exhibitionGap) && exhibitionGap >= 0 && Number.isFinite(lapGap) && lapGap >= 0;
  return { formal: approved && applied && isDouble && validBoat && validConfidence && validGaps && Boolean(source), supportPresent, approved, applied, isDouble, topBoat: validBoat ? topBoat : null, confidence: validConfidence ? confidence : null, exhibitionGap: Number.isFinite(exhibitionGap) ? exhibitionGap : null, lapGap: Number.isFinite(lapGap) ? lapGap : null, source, lapSource, exhibitionCount, lapCount };
}

function doubleTimeClaimForTicket(prediction, ticket) {
  const evidence = doubleTimeEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.topBoat)) return null;
  return { theoryKey: "doubleTime", label: "ダブルタイム", theoryVersion: evidence.source.startsWith("ai-core-exhibition-performance-v2:") ? "ai-core-exhibition-performance-v2" : "approved-double-time-v1", formal: true, source: evidence.source };
}

const EFFECTIVE_SCORE_CONTRACT_VERSION = "ai-core-effective-score-contract-v1";
const EFFECTIVE_SCORE_SCOPE = "aiCore.analyses[].indexes.total";
const NEW_ENVIRONMENT_THEORY_SOURCE = "ai-core-new-environment-theory-v1";
const EXPECTED_FINAL_TOTAL_COEFFICIENTS = {
  raceFlow: 0.25,
  courseIndex: 0.24,
  roleAttack: 0.11,
  st: 0.10,
  exhibition: 0.09,
  roleHold: 0.08,
  rolePickup: 0.03,
  local: 0.05,
  turn: 0.025,
  national: 0.02,
  motor: 0.005
};
const EXPECTED_NEW_ENGINE_ADJUSTMENTS = {
  motorIndexDeviationFrom50Multiplier: 0.45,
  raceFlowStThresholdInclusive: 72,
  raceFlowStBonus: 3,
  raceFlowTurnThresholdInclusive: 72,
  raceFlowTurnBonus: 3
};

function exactNumericFields(actual, expected) {
  return Object.entries(expected).every(
    ([key, value]) => Number(actual?.[key]) === value
  );
}

function scoredAiCoreEvidence(prediction) {
  const analyses = prediction?.aiCore?.analyses;
  if (!Array.isArray(analyses)) {
    return { verified: false, boatCount: 0 };
  }
  const boatNumbers = analyses.map(
    row => Number(row?.boatNo ?? row?.number ?? row?.lane ?? row?.waku)
  );
  const verified =
    analyses.length === 6 &&
    new Set(boatNumbers).size === 6 &&
    boatNumbers.every(boatNo => boatNo >= 1 && boatNo <= 6) &&
    analyses.every(row => Number.isFinite(row?.indexes?.total));
  return { verified, boatCount: analyses.length };
}

function newEngineEvidence(prediction) {
  const support = prediction?.motorEngineSupport || {};
  const centerBoatNo = supportAttackBoatNo(prediction, support);
  const statements = supportStatements(support);
  const mode = String(support?.mode || "").trim();
  const scoreContract = support?.effectiveScoreContract || {};
  const finalTotalCoefficients = scoreContract?.finalTotalCoefficients || {};
  const newEngineAdjustments = scoreContract?.newEngineAdjustments || {};
  const canonicalTheory = prediction?.aiCore?.newEnvironmentTheory || {};
  const scoredAiCore = scoredAiCoreEvidence(prediction);
  const newEngineMode =
    support?.newEngineMode === true &&
    mode === "new-engine";
  const actualModeApplied =
    canonicalTheory?.isActive === true &&
    canonicalTheory?.source === NEW_ENVIRONMENT_THEORY_SOURCE;
  const explicit =
    statements.some(text => /新エンジン期/.test(text)) &&
    statements.some(
      text => /モーター実績の比重を下げ|展示・今節ST・技量を優先/.test(text)
    );
  const scoreContractMatches =
    scoreContract?.version === EFFECTIVE_SCORE_CONTRACT_VERSION &&
    scoreContract?.scope === EFFECTIVE_SCORE_SCOPE &&
    exactNumericFields(
      finalTotalCoefficients,
      EXPECTED_FINAL_TOTAL_COEFFICIENTS
    ) &&
    newEngineAdjustments?.applied === true &&
    newEngineAdjustments?.modeSource === NEW_ENVIRONMENT_THEORY_SOURCE &&
    exactNumericFields(
      newEngineAdjustments,
      EXPECTED_NEW_ENGINE_ADJUSTMENTS
    );
  const legacyWeightProfilePresent = Boolean(
    support?.weights &&
    typeof support.weights === "object"
  );
  return {
    formal:
      newEngineMode &&
      actualModeApplied &&
      scoredAiCore.verified &&
      centerBoatNo >= 1 &&
      centerBoatNo <= 6 &&
      explicit &&
      scoreContractMatches,
    newEngineMode,
    actualModeApplied,
    actualModeSource: String(canonicalTheory?.source || ""),
    scoredAiCoreVerified: scoredAiCore.verified,
    scoredBoatCount: scoredAiCore.boatCount,
    mode,
    centerBoatNo,
    scoreContract,
    scoreContractMatches,
    finalTotalCoefficients,
    newEngineAdjustments,
    legacyWeightProfilePresent,
    statements
  };
}

function newEngineClaimForTicket(prediction, ticket) {
  const evidence = newEngineEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.centerBoatNo)) return null;
  return {
    theoryKey: "newEngine",
    label: "新エンジン理論",
    theoryVersion:
      "motor-engine-new-engine-mode-v2-effective-score-contract",
    formal: true,
    source: "motor-engine-support:effective-score-contract"
  };
}

function theoryClaimsFrom(prediction, practicalTickets) {
  const evidence = prediction?.practicalSelection?.verificationEvidence || prediction?.verificationEvidence || {};
  const evidenceByTicket = new Map((Array.isArray(evidence?.tickets) ? evidence.tickets : []).map(row => [normalizeTicket(row?.ticket), row]));
  return (Array.isArray(practicalTickets) ? practicalTickets : []).map(item => {
    const row = typeof item === "string" ? { ticket: item } : (item || {});
    const ticket = normalizeTicket(row.ticket || row.line || row.formation);
    const evidenceRow = evidenceByTicket.get(ticket) || {};
    const baseClaims = Array.isArray(evidenceRow.theoryClaims) ? evidenceRow.theoryClaims : (Array.isArray(row.theoryClaims) ? row.theoryClaims : []);
    const extra = [
      courseClaimForTicket(prediction, evidenceRow),
      stSlitClaimForTicket(prediction, ticket),
      exhibitionFootClaimForTicket(prediction, ticket),
      localWaterClaimForTicket(prediction, ticket),
      skillClaimForTicket(prediction, ticket),
      motorClaimForTicket(prediction, ticket),
      wallClaimForTicket(prediction, ticket),
      frameRiseSinkClaimForTicket(prediction, ticket, evidenceRow),
      doubleTimeClaimForTicket(prediction, ticket),
      newEngineClaimForTicket(prediction, ticket)
    ].filter(Boolean);
    const claims = [...baseClaims, ...extra].filter((claim, index, all) => {
      const key = String(claim?.theoryKey || claim?.key || "").trim();
      return key && all.findIndex(other => String(other?.theoryKey || other?.key || "").trim() === key) === index;
    });
    return { ticket, category: normalizeCategory(row.category || row.role || evidenceRow.category || (Array.isArray(evidenceRow.categories) ? evidenceRow.categories[0] : "")), claims };
  }).filter(row => row.ticket && row.claims.length);
}

function missingReasonsForStart(prediction, evidence) {
  const support = prediction?.flowSupport || prediction?.stExhibitionSupport;
  if (!support) return ["support-missing"];
  const reasons = [];
  if (!(evidence.attackBoatNo >= 1 && evidence.attackBoatNo <= 6)) reasons.push("attack-boat-missing");
  if (!(evidence.stCoverage >= 4)) reasons.push("st-coverage-under-4");
  if (!(evidence.stRank >= 1 && evidence.stRank <= 6)) reasons.push("st-rank-missing");
  if (!evidence.statements.some(text => /ST|スリット/.test(text))) reasons.push("explicit-st-statement-missing");
  return reasons;
}

function missingReasonsForSkill(prediction, evidence) {
  const support = prediction?.skillLocalSupport;
  if (!support) return ["support-missing"];
  const reasons = [];
  if (!(evidence.attackBoatNo >= 1 && evidence.attackBoatNo <= 6)) reasons.push("attack-boat-missing");
  if (!evidence.target) reasons.push("attack-boat-skill-row-missing");
  const hasSkillData = Boolean(evidence.target && (evidence.target.grade || evidence.target.nationalWinRate !== null || evidence.target.avgST !== null || evidence.target.firstRate !== null));
  if (!hasSkillData) reasons.push("skill-data-missing");
  if (!evidence.statements.some(text => /A1級|A2級|B2級|技量|全国勝率|平均ST|1着率/.test(text))) reasons.push("explicit-skill-statement-missing");
  return reasons;
}

function missingReasonsForFrame(prediction, evidence) {
  if (!evidence.supportPresent) return ["support-missing"];
  const reasons = [];
  if (!evidence.applied) reasons.push("not-applied");
  if (!evidence.approved) reasons.push("not-approved");
  if (!(evidence.frameNo >= 1 && evidence.frameNo <= 6)) reasons.push("frame-missing");
  if (!/^(rise|sink)$/.test(evidence.type)) reasons.push("type-missing");
  if (!(Number(evidence.samples) >= 10)) reasons.push("samples-under-10");
  if (!(evidence.rate !== null && Number.isFinite(evidence.rate) && evidence.rate >= 0 && evidence.rate <= 100)) reasons.push("rate-invalid");
  if (!evidence.source) reasons.push("source-missing");
  return reasons;
}

function missingReasonsForDouble(prediction, evidence) {
  if (!evidence.supportPresent) return ["support-missing"];
  const reasons = [];
  if (!evidence.approved) reasons.push("not-approved");
  if (!evidence.applied) reasons.push("not-applied");
  if (!evidence.isDouble) reasons.push("double-condition-not-met");
  if (!evidence.topBoat) reasons.push("top-boat-missing");
  if (evidence.confidence === null) reasons.push("confidence-under-70-or-invalid");
  if (!(evidence.exhibitionGap !== null && Number.isFinite(evidence.exhibitionGap) && evidence.exhibitionGap >= 0)) reasons.push("exhibition-gap-missing");
  if (!(evidence.lapGap !== null && Number.isFinite(evidence.lapGap) && evidence.lapGap >= 0)) reasons.push("lap-gap-missing");
  if (!evidence.source) reasons.push("source-missing");
  return reasons;
}

function missingReasonsForNewEngine(prediction, evidence) {
  if (!prediction?.motorEngineSupport) return ["support-missing"];
  const reasons = [];
  if (!evidence.newEngineMode) reasons.push("new-engine-mode-off");
  if (!evidence.actualModeApplied) {
    reasons.push("ai-core-new-engine-mode-not-applied");
  }
  if (!evidence.scoredAiCoreVerified) {
    reasons.push("ai-core-effective-score-result-missing");
  }
  if (!(evidence.centerBoatNo >= 1 && evidence.centerBoatNo <= 6)) {
    reasons.push("center-boat-missing");
  }
  const explicit =
    evidence.statements.some(text => /新エンジン期/.test(text)) &&
    evidence.statements.some(
      text => /モーター実績の比重を下げ|展示・今節ST・技量を優先/.test(text)
    );
  if (!explicit) {
    reasons.push("explicit-new-engine-statement-missing");
  }
  if (!evidence.scoreContractMatches) {
    reasons.push("effective-score-contract-missing");
  }
  if (evidence.legacyWeightProfilePresent) {
    reasons.push("legacy-weight-profile-not-formal");
  }
  return reasons;
}

function buildEvidenceDiagnostics(prediction) {
  const start = stSlitEvidence(prediction);
  const skill = skillEvidence(prediction);
  const frame = frameRiseSinkEvidence(prediction);
  const doubleTime = doubleTimeEvidence(prediction);
  const newEngine = newEngineEvidence(prediction);
  const rows = [
    { theoryKey: "start", label: "ST・スリット理論", supportPresent: Boolean(prediction?.flowSupport || prediction?.stExhibitionSupport), formal: start.formal === true, missingReasons: start.formal ? [] : missingReasonsForStart(prediction, start), metrics: { attackBoatNo: start.attackBoatNo || null, coverage: start.stCoverage || 0, rank: start.stRank || null } },
    { theoryKey: "skill", label: "技量理論", supportPresent: Boolean(prediction?.skillLocalSupport), formal: skill.formal === true, missingReasons: skill.formal ? [] : missingReasonsForSkill(prediction, skill), metrics: { attackBoatNo: skill.attackBoatNo || null, targetPresent: Boolean(skill.target) } },
    { theoryKey: "frame-rise-fall", label: "枠別浮沈率", supportPresent: frame.supportPresent === true, formal: frame.formal === true, missingReasons: frame.formal ? [] : missingReasonsForFrame(prediction, frame), metrics: { frameNo: frame.frameNo || null, type: frame.type || "", samples: frame.samples, rate: frame.rate, scenarioType: frame.scenarioType || "", scoreAdjustment: frame.scoreAdjustment, movementDelta: frame.movementDelta, approved: frame.approved, applied: frame.applied } },
    { theoryKey: "double-time", label: "ダブルタイム", supportPresent: doubleTime.supportPresent === true, formal: doubleTime.formal === true, missingReasons: doubleTime.formal ? [] : missingReasonsForDouble(prediction, doubleTime), metrics: { topBoat: doubleTime.topBoat, confidence: doubleTime.confidence, exhibitionGap: doubleTime.exhibitionGap, lapGap: doubleTime.lapGap, exhibitionCount: doubleTime.exhibitionCount, lapCount: doubleTime.lapCount, lapSource: doubleTime.lapSource, approved: doubleTime.approved, applied: doubleTime.applied, isDouble: doubleTime.isDouble } },
    {
      theoryKey: "new-engine",
      label: "新エンジン理論",
      supportPresent: Boolean(prediction?.motorEngineSupport),
      formal: newEngine.formal === true,
      missingReasons:
        newEngine.formal
          ? []
          : missingReasonsForNewEngine(prediction, newEngine),
      metrics: {
        centerBoatNo: newEngine.centerBoatNo || null,
        mode: newEngine.mode || "",
        newEngineMode: newEngine.newEngineMode,
        actualModeApplied: newEngine.actualModeApplied,
        actualModeSource: newEngine.actualModeSource,
        scoredAiCoreVerified: newEngine.scoredAiCoreVerified,
        scoredBoatCount: newEngine.scoredBoatCount,
        scoreContractVersion:
          String(newEngine.scoreContract?.version || ""),
        scoreScope:
          String(newEngine.scoreContract?.scope || ""),
        scoreContractMatches: newEngine.scoreContractMatches,
        finalTotalCoefficients:
          newEngine.finalTotalCoefficients,
        newEngineAdjustments:
          newEngine.newEngineAdjustments
      }
    }
  ];
  return { schemaVersion: 1, rows, usableForPrediction: false, automaticApplication: false };
}

function build(prediction, practicalTickets) {
  const tickets = theoryClaimsFrom(prediction, practicalTickets);
  const groups = new Map();
  tickets.forEach(row => {
    const seen = new Set();
    row.claims.forEach(claim => {
      const key = String(claim?.theoryKey || claim?.key || "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      const group = groups.get(key) || { theoryKey: key, label: String(claim?.label || claim?.theoryLabel || key).trim(), version: String(claim?.theoryVersion || claim?.version || "").trim(), formal: claim?.formal === true, sources: new Set(), ticketCount: 0, mainTicketCount: 0, categories: new Set(), tickets: [] };
      const source = String(claim?.source || "").trim();
      if (source) group.sources.add(source);
      group.ticketCount += 1;
      if (row.category === "本線") group.mainTicketCount += 1;
      group.categories.add(row.category);
      group.tickets.push(row.ticket);
      groups.set(key, group);
    });
  });
  const theories = [...groups.values()].map(group => ({ theoryKey: group.theoryKey, label: group.label, version: group.version, formal: group.formal, sources: [...group.sources].sort(), ticketCount: group.ticketCount, mainTicketCount: group.mainTicketCount, categories: [...group.categories], tickets: [...new Set(group.tickets)] })).sort((a, b) => b.mainTicketCount - a.mainTicketCount || b.ticketCount - a.ticketCount || a.theoryKey.localeCompare(b.theoryKey));
  return {
    schemaVersion: 1,
    status: theories.length ? "tracked" : "no-formal-theory-claims",
    theoryCount: theories.length,
    ticketCount: tickets.length,
    theories,
    evidenceDiagnostics: buildEvidenceDiagnostics(prediction),
    usableForPrediction: false,
    automaticApplication: false
  };
}

module.exports = {
  build,
  buildEvidenceDiagnostics,
  theoryClaimsFrom,
  branchUsesCourseEvidence,
  courseClaimForTicket,
  stSlitEvidence,
  stSlitClaimForTicket,
  exhibitionFootEvidence,
  exhibitionFootClaimForTicket,
  localWaterEvidence,
  localWaterClaimForTicket,
  skillEvidence,
  skillClaimForTicket,
  motorEvidence,
  motorClaimForTicket,
  wallEvidence,
  wallClaimForTicket,
  appliedFrameRiseSinkSupport,
  frameRiseSinkEvidence,
  frameRiseSinkClaimForTicket,
  appliedDoubleTimeSupport,
  doubleTimeEvidence,
  doubleTimeClaimForTicket,
  newEngineEvidence,
  newEngineClaimForTicket
};
