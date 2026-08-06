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
  return Number(support?.attackBoatNo || prediction?.flowPriority?.attackBoatNo || prediction?.flowPriority?.attackBoat || 0);
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

function theoryClaimsFrom(prediction, practicalTickets) {
  const evidence = prediction?.practicalSelection?.verificationEvidence || prediction?.verificationEvidence || {};
  const evidenceByTicket = new Map((Array.isArray(evidence?.tickets) ? evidence.tickets : []).map(row => [normalizeTicket(row?.ticket), row]));
  return (Array.isArray(practicalTickets) ? practicalTickets : []).map(item => {
    const row = typeof item === "string" ? { ticket: item } : (item || {});
    const ticket = normalizeTicket(row.ticket || row.line || row.formation);
    const evidenceRow = evidenceByTicket.get(ticket) || {};
    const baseClaims = Array.isArray(evidenceRow.theoryClaims) ? evidenceRow.theoryClaims : (Array.isArray(row.theoryClaims) ? row.theoryClaims : []);
    const courseClaim = courseClaimForTicket(prediction, evidenceRow);
    const stSlitClaim = stSlitClaimForTicket(prediction, ticket);
    const exhibitionFootClaim = exhibitionFootClaimForTicket(prediction, ticket);
    const claims = [...baseClaims, ...(courseClaim ? [courseClaim] : []), ...(stSlitClaim ? [stSlitClaim] : []), ...(exhibitionFootClaim ? [exhibitionFootClaim] : [])]
      .filter((claim, index, all) => {
        const key = String(claim?.theoryKey || claim?.key || "").trim();
        return key && all.findIndex(other => String(other?.theoryKey || other?.key || "").trim() === key) === index;
      });
    return { ticket, category: normalizeCategory(row.category || row.role || evidenceRow.category || (Array.isArray(evidenceRow.categories) ? evidenceRow.categories[0] : "")), claims };
  }).filter(row => row.ticket && row.claims.length);
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
  return { schemaVersion: 1, status: theories.length ? "tracked" : "no-formal-theory-claims", theoryCount: theories.length, ticketCount: tickets.length, theories, usableForPrediction: false, automaticApplication: false };
}

module.exports = { build, theoryClaimsFrom, branchUsesCourseEvidence, courseClaimForTicket, stSlitEvidence, stSlitClaimForTicket, exhibitionFootEvidence, exhibitionFootClaimForTicket };
