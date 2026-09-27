"use strict";
// C: prospective research only. Never return purchase rows or change a selector.
const crypto = require("node:crypto"), fs = require("node:fs");
const input = require("./analysis-input-contract");
const POLICY = Object.freeze({
  id: "eight-ticket-exhibition-c-v1", firstCaptureDate: "20260926", ticketCount: 8,
  minimumScore: 90, sameScoreRequired: true, requireModernCandidatePool: true,
  requireCompleteOfficialExhibition: true, replacement: "last-promotion-only",
  sourceGeneration: "evaluated-scenarios-v1|internal-score-v1|practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5-coursefailclosed1",
  mode: "prospective-shadow-only", automaticApplication: false, usableForPrediction: false
});
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
// The fingerprint covers the implementation as well as the frozen conditions.
const FINGERPRINT = digest({ policy: POLICY, source: fs.readFileSync(__filename, "utf8") });
const arr = value => Array.isArray(value) ? value : [];
const ticket = row => typeof row === "string" ? row : row?.ticket;
const parts = t => String(t).split("-").map(Number);
const prefix = t => String(t).split("-").slice(0, 2).join("-");
const validTicket = t => typeof t === "string" && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(parts(t)).size === 3;
const pick = (o, names) => Object.fromEntries(names.map(k => [k, o?.[k] ?? null]));
function generation(p) {
  const g = p?.verificationEvidence?.generation || p?.practicalSelection?.verificationEvidence?.generation || {};
  return [g.logicFingerprint, g.confidenceDefinitionVersion, g.ticketPolicyVersion].map(x => String(x || "")).join("|");
}
function projection(p = {}) {
  // Deliberate whitelist: result, odds, payout, venue and racer identity are not selection inputs.
  return {
    status: p.practicalSelection?.status ?? null,
    tickets: arr(p.practicalTickets).map(r => ({ ...pick(r, ["category", "selectionTier", "priorityScore"]), ticket: ticket(r) ?? null })),
    strongEscapeTrimApplied: p.practicalSelection?.expansionSummary?.strongEscapeTrim?.applied === true,
    boats: arr(p.preRaceConditions?.boats).map(b => pick(b, ["boatNo", "course", "courseOfficial", "exhibitionST", "exhibitionTime"])),
    decisions: arr(p.practicalSelection?.targetDecisions).flatMap(t => arr(t?.candidateDecisions)).map(d => ({
      ...pick(d, ["ticket", "ticketSelected", "reasonCode", "relation", "priorityScore"]),
      roleLabels: arr(d.roleLabels).map(r => pick(r, ["boatNo", "position", "structured"]))
    })),
    pool: arr(p.evaluatedScenarioCandidates?.candidatePool).map(c => pick(c, ["ticket", "evidenceQualified", "priorityScore"]))
  };
}
function completeBoats(boats) {
  return boats.length === 6 && new Set(boats.map(b => b.boatNo)).size === 6 &&
    new Set(boats.map(b => b.course)).size === 6 && boats.every(b =>
      Number.isInteger(b.boatNo) && b.boatNo >= 1 && b.boatNo <= 6 &&
      Number.isInteger(b.course) && b.course >= 1 && b.course <= 6 && b.courseOfficial === true &&
      Number.isFinite(b.exhibitionST) && b.exhibitionST >= 0 && b.exhibitionST < 1 &&
      Number.isFinite(b.exhibitionTime) && b.exhibitionTime > 0);
}
function compare(p = {}) {
  const v = projection(p), base = v.tickets.map(r => r.ticket);
  const out = { base, proposal: [...base], applied: false, reason: "outside-eight-ticket-scope", replacement: null };
  if (base.length !== 8) return out;
  if (v.status !== "selected" || !base.every(validTicket) || new Set(base).size !== 8)
    return { ...out, reason: "invalid-selection" };
  if (!v.strongEscapeTrimApplied) return { ...out, reason: "no-strong-escape-trim" };
  const promoted = v.tickets.map((r, index) => ({ r, index })).filter(x =>
    x.r.category === "候補補完" && x.r.selectionTier === "候補補完");
  if (promoted.length < 2 || !promoted.every(x => prefix(x.r.ticket) === prefix(promoted[0].r.ticket)))
    return { ...out, reason: "no-concentrated-promotions" };
  const donor = promoted.at(-1), score = donor.r.priorityScore;
  if (!Number.isFinite(score) || score < POLICY.minimumScore || parts(donor.r.ticket)[0] !== 1)
    return { ...out, reason: "ineligible-promotion" };
  if (!completeBoats(v.boats)) return { ...out, reason: "exhibition-or-official-course-incomplete" };
  if (v.boats.find(b => b.boatNo === 1).course !== 1) return { ...out, reason: "head-not-official-inner-course" };
  if (!v.pool.length) return { ...out, reason: "candidate-pool-not-recorded" };
  const count = t => base.filter(b => prefix(b) === prefix(t)).length, byTicket = new Map();
  for (const d of v.decisions) {
    if (d.ticketSelected !== false || d.reasonCode !== "CANDIDATE_ONLY_EVALUATION" || d.relation !== "structured" ||
        d.priorityScore !== score || !validTicket(d.ticket) || base.includes(d.ticket) || parts(d.ticket)[0] !== 1) continue;
    const bp = parts(d.ticket);
    if (![1, 2, 3].every(pos => d.roleLabels.some(r => r.position === pos && r.boatNo === bp[pos - 1] && r.structured === true))) continue;
    if (prefix(d.ticket) === prefix(donor.r.ticket) || count(d.ticket) >= count(donor.r.ticket)) continue;
    const c = v.pool.find(r => r.ticket === d.ticket);
    if (!c || c.evidenceQualified !== true || c.priorityScore !== score) continue;
    byTicket.set(d.ticket, d);
  }
  const candidates = [...byTicket.values()].sort((a, b) => count(a.ticket) - count(b.ticket) || a.ticket.localeCompare(b.ticket));
  if (!candidates.length) return { ...out, reason: "no-qualified-alternative" };
  const chosen = candidates[0], proposal = [...base]; proposal[donor.index] = chosen.ticket;
  return { ...out, proposal, applied: true, reason: "eligible", replacement: {
    index: donor.index, removed: donor.r.ticket, added: chosen.ticket, priorityScore: score
  } };
}
function capture(record = {}, options = {}) {
  const p = record.prediction || {}, compared = compare(p), parent = record.practicalPriorityShadow || {};
  const out = { version: POLICY.id, logicFingerprint: FINGERPRINT,
    createdAt: options.now || new Date().toISOString(), applicationMode: POLICY.mode,
    automaticApplication: false, usableForPrediction: false, affectsTickets: false, affectsPrediction: false,
    raceKey: input.raceKey(record), capturedAt: record.selectedAt || "", deadlineAt: record.deadlineAt || "",
    sourceCommit: parent.sourceCommit || "", sourceGeneration: generation(p), inputDigest: digest(projection(p)),
    baseTickets: compared.base, shadowTickets: [...compared.base], eligible: false, status: "invalid-record", replacement: null };
  const reject = status => ({ ...out, status });
  if (!out.raceKey || out.raceKey.slice(0, 8) < POLICY.firstCaptureDate) return reject("before-study-or-invalid-key");
  const reason = input.preDeadlineReason(record); if (reason) return reject(reason);
  if (parent.capturedAt !== out.capturedAt || !/^[a-f0-9]{40}$/.test(out.sourceCommit)) return reject("source-identity-mismatch");
  if (out.sourceGeneration !== POLICY.sourceGeneration) return reject("source-generation-mismatch");
  const created = Date.parse(out.createdAt), captured = Date.parse(out.capturedAt), deadline = Date.parse(out.deadlineAt);
  if (!Number.isFinite(created) || created < captured || created >= deadline) return reject("not-created-pre-deadline");
  return { ...out, status: compared.reason, eligible: compared.applied,
    shadowTickets: compared.proposal, replacement: compared.replacement };
}
function attach(record, options) { return { ...record, eightTicketExhibitionShadow: capture(record, options) }; }
module.exports = { POLICY, FINGERPRINT, digest, validTicket, projection, completeBoats, compare, capture, attach };
