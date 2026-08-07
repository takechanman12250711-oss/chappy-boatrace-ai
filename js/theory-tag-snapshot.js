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
  const wind = Number(support?.wind);
  const wave = Number(support?.wave);
  const tide = String(support?.tide || "").trim();
  const statements = supportStatements(support);
  const hasMeasuredCondition = Number.isFinite(wind) || Number.isFinite(wave) || Boolean(tide);
  const hasSpecificVenueRule = statements.some(text => !/開催場の水面特性を補助評価/.test(text) && /イン|差し|潮|風|波|水面|ナイター|展示|乗り心地/.test(text));
  return { formal: Boolean(venue) && statements.length > 0 && (hasMeasuredCondition || hasSpecificVenueRule), venue, wind: Number.isFinite(wind) ? wind : null, wave: Number.isFinite(wave) ? wave : null, tide, statements };
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
  const wall = prediction?.aiCore?.wallTheory || prediction?.wallTheory || prediction?.raceScenarios?.wallTheory || {};
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

function frameRiseSinkEvidence(prediction) {
  const support = prediction?.frameRiseSinkSupport || {};
  const applied = support?.applied === true;
  const approved = support?.approved === true;
  const frameNo = Number(support?.frameNo);
  const type = String(support?.type || "").trim();
  const samples = Number(support?.samples);
  const rate = Number(support?.rate);
  const source = String(support?.source || "").trim();
  const validType = /^(rise|sink)$/.test(type);
  const enoughSamples = Number.isFinite(samples) && samples >= 10;
  const validRate = Number.isFinite(rate) && rate >= 0 && rate <= 100;
  return { formal: applied && approved && frameNo >= 1 && frameNo <= 6 && validType && enoughSamples && validRate && Boolean(source), applied, approved, frameNo, type, samples: Number.isFinite(samples) ? samples : null, rate: Number.isFinite(rate) ? rate : null, source };
}

function frameRiseSinkClaimForTicket(prediction, ticket) {
  const evidence = frameRiseSinkEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.frameNo)) return null;
  return { theoryKey: "frameRiseSink", label: "枠別浮沈率", theoryVersion: "approved-frame-rise-sink-v1", formal: true, source: evidence.source };
}

function doubleTimeEvidence(prediction) {
  const support = prediction?.doubleTimeSupport || prediction?.theorySupport?.doubleTime || {};
  const approved = support?.approved === true;
  const applied = support?.applied === true;
  const isDouble = support?.isDouble === true;
  const topBoat = Number(support?.topBoat || support?.topBoatNo);
  const confidence = Number(support?.confidence);
  const exhibitionGap = Number(support?.exhibitionGap);
  const lapGap = Number(support?.lapGap);
  const source = String(support?.source || "").trim();
  const validBoat = topBoat >= 1 && topBoat <= 6;
  const validConfidence = Number.isFinite(confidence) && confidence >= 70 && confidence <= 100;
  const validGaps = Number.isFinite(exhibitionGap) && exhibitionGap >= 0 && Number.isFinite(lapGap) && lapGap >= 0;
  return { formal: approved && applied && isDouble && validBoat && validConfidence && validGaps && Boolean(source), approved, applied, isDouble, topBoat: validBoat ? topBoat : null, confidence: validConfidence ? confidence : null, exhibitionGap: Number.isFinite(exhibitionGap) ? exhibitionGap : null, lapGap: Number.isFinite(lapGap) ? lapGap : null, source };
}

function doubleTimeClaimForTicket(prediction, ticket) {
  const evidence = doubleTimeEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.topBoat)) return null;
  return { theoryKey: "doubleTime", label: "ダブルタイム", theoryVersion: "approved-double-time-v1", formal: true, source: evidence.source };
}

function newEngineEvidence(prediction) {
  const support = prediction?.motorEngineSupport || {};
  const centerBoatNo = supportAttackBoatNo(prediction, support);
  const statements = supportStatements(support);
  const mode = String(support?.mode || "").trim();
  const weights = support?.weights || {};
  const newEngineMode = support?.newEngineMode === true && mode === "new-engine";
  const explicit = statements.some(text => /新エンジン期/.test(text)) && statements.some(text => /モーター実績の比重を下げ|展示・今節ST・技量を優先/.test(text));
  const weightShift = Number(weights?.st) === 0.22 && Number(weights?.exhibition) === 0.23 && Number(weights?.motor) === 0.05 && Number(weights?.local) === 0.14 && Number(weights?.skill) === 0.10 && Number(weights?.attack) === 0.14 && Number(weights?.raceFlow) === 0.08 && Number(weights?.turn) === 0.04;
  return { formal: newEngineMode && centerBoatNo >= 1 && centerBoatNo <= 6 && explicit && weightShift, newEngineMode, mode, centerBoatNo, weights, statements };
}

function newEngineClaimForTicket(prediction, ticket) {
  const evidence = newEngineEvidence(prediction);
  if (!evidence.formal) return null;
  const boats = normalizeTicket(ticket).split("-").map(Number);
  if (!boats.includes(evidence.centerBoatNo)) return null;
  return { theoryKey: "newEngine", label: "新エンジン理論", theoryVersion: "motor-engine-new-engine-mode-v1", formal: true, source: "motor-engine-support" };
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
      frameRiseSinkClaimForTicket(prediction, ticket),
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
  if (!prediction?.frameRiseSinkSupport) return ["support-missing"];
  const reasons = [];
  if (!evidence.applied) reasons.push("not-applied");
  if (!evidence.approved) reasons.push("not-approved");
  if (!(evidence.frameNo >= 1 && evidence.frameNo <= 6)) reasons.push("frame-missing");
  if (!/^(rise|sink)$/.test(evidence.type)) reasons.push("type-missing");
  if (!(Number(evidence.samples) >= 10)) reasons.push("samples-under-10");
  if (!(Number.isFinite(Number(evidence.rate)) && Number(evidence.rate) >= 0 && Number(evidence.rate) <= 100)) reasons.push("rate-invalid");
  if (!evidence.source) reasons.push("source-missing");
  return reasons;
}

function missingReasonsForDouble(prediction, evidence) {
  if (!(prediction?.doubleTimeSupport || prediction?.theorySupport?.doubleTime)) return ["support-missing"];
  const reasons = [];
  if (!evidence.approved) reasons.push("not-approved");
  if (!evidence.applied) reasons.push("not-applied");
  if (!evidence.isDouble) reasons.push("double-condition-not-met");
  if (!evidence.topBoat) reasons.push("top-boat-missing");
  if (evidence.confidence === null) reasons.push("confidence-under-70-or-invalid");
  if (!(Number.isFinite(Number(evidence.exhibitionGap)) && Number(evidence.exhibitionGap) >= 0)) reasons.push("exhibition-gap-missing");
  if (!(Number.isFinite(Number(evidence.lapGap)) && Number(evidence.lapGap) >= 0)) reasons.push("lap-gap-missing");
  if (!evidence.source) reasons.push("source-missing");
  return reasons;
}

function missingReasonsForNewEngine(prediction, evidence) {
  if (!prediction?.motorEngineSupport) return ["support-missing"];
  const reasons = [];
  if (!evidence.newEngineMode) reasons.push("new-engine-mode-off");
  if (!(evidence.centerBoatNo >= 1 && evidence.centerBoatNo <= 6)) reasons.push("center-boat-missing");
  const explicit = evidence.statements.some(text => /新エンジン期/.test(text)) && evidence.statements.some(text => /モーター実績の比重を下げ|展示・今節ST・技量を優先/.test(text));
  if (!explicit) reasons.push("explicit-new-engine-statement-missing");
  const weights = evidence.weights || {};
  const weightShift = Number(weights?.st) === 0.22 && Number(weights?.exhibition) === 0.23 && Number(weights?.motor) === 0.05 && Number(weights?.local) === 0.14 && Number(weights?.skill) === 0.10 && Number(weights?.attack) === 0.14 && Number(weights?.raceFlow) === 0.08 && Number(weights?.turn) === 0.04;
  if (!weightShift) reasons.push("new-engine-weight-profile-mismatch");
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
    { theoryKey: "frame-rise-fall", label: "枠別浮沈率", supportPresent: Boolean(prediction?.frameRiseSinkSupport), formal: frame.formal === true, missingReasons: frame.formal ? [] : missingReasonsForFrame(prediction, frame), metrics: { frameNo: frame.frameNo || null, type: frame.type || "", samples: frame.samples, rate: frame.rate, approved: frame.approved, applied: frame.applied } },
    { theoryKey: "double-time", label: "ダブルタイム", supportPresent: Boolean(prediction?.doubleTimeSupport || prediction?.theorySupport?.doubleTime), formal: doubleTime.formal === true, missingReasons: doubleTime.formal ? [] : missingReasonsForDouble(prediction, doubleTime), metrics: { topBoat: doubleTime.topBoat, confidence: doubleTime.confidence, exhibitionGap: doubleTime.exhibitionGap, lapGap: doubleTime.lapGap, approved: doubleTime.approved, applied: doubleTime.applied, isDouble: doubleTime.isDouble } },
    { theoryKey: "new-engine", label: "新エンジン理論", supportPresent: Boolean(prediction?.motorEngineSupport), formal: newEngine.formal === true, missingReasons: newEngine.formal ? [] : missingReasonsForNewEngine(prediction, newEngine), metrics: { centerBoatNo: newEngine.centerBoatNo || null, mode: newEngine.mode || "", newEngineMode: newEngine.newEngineMode } }
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
  frameRiseSinkEvidence,
  frameRiseSinkClaimForTicket,
  doubleTimeEvidence,
  doubleTimeClaimForTicket,
  newEngineEvidence,
  newEngineClaimForTicket
};
