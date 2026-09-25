"use strict";
// Research-only sidecar. Never return purchase rows or wrap the production selector.
const crypto = require("node:crypto");
const POLICY = Object.freeze({ id: "eight-ticket-promotion-preserve-a-v1", ticketCount: 8,
  firstCaptureDate: "20260925", rescueVersion: "20260823-three-course-134-v1",
  minimumPromotionScore: 90, mode: "prospective-shadow-only",
  automaticApplication: false, usableForPrediction: false });
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const FINGERPRINT = hash(POLICY);
function ticketOf(row) { return typeof row === "string" ? row : row?.ticket; }
function validTicket(t) { return typeof t === "string" && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split("-")).size === 3; }
function build(selection = {}, options = {}) {
  const selected = Array.isArray(selection?.tickets) ? selection.tickets : [];
  const baseTickets = selected.map(ticketOf);
  const generation = selection?.verificationEvidence?.generation || {};
  const sourceGeneration = [generation.logicFingerprint, generation.confidenceDefinitionVersion,
    generation.ticketPolicyVersion].map(x => String(x || "")).join("|");
  const out = { version: POLICY.id, logicFingerprint: FINGERPRINT,
    createdAt: options.now || new Date().toISOString(), applicationMode: POLICY.mode,
    automaticApplication: false, usableForPrediction: false, affectsTickets: false, affectsPrediction: false,
    status: "outside-eight-ticket-scope", eligible: false, sourceGeneration,
    baseTickets, shadowTickets: [...baseTickets], baseTicketDigest: hash(baseTickets), replacement: null };
  if (baseTickets.length !== POLICY.ticketCount) return out;
  if (selection.status !== "selected" || baseTickets.some(t => !validTicket(t)) ||
      new Set(baseTickets).size !== POLICY.ticketCount) return { ...out, status: "invalid-selection" };
  const expansion = selection.expansionSummary || {};
  const rescue = expansion.threeCourseEscapeRescueFixed5;
  const promotions = Array.isArray(expansion.candidatePromotionTickets) ? expansion.candidatePromotionTickets : [];
  if (!rescue || rescue.applied !== true) return { ...out, status: "no-rescue-collision" };
  if (rescue.version !== POLICY.rescueVersion || rescue.targetLabel !== "3コース攻め" ||
      !Number.isInteger(rescue.index) || rescue.index < 0 || rescue.index >= baseTickets.length ||
      !validTicket(rescue.ticket) || !validTicket(rescue.replacedTicket) ||
      baseTickets[rescue.index] !== rescue.ticket || selected[rescue.index]?.category !== "検証済み救済")
    return { ...out, status: "invalid-rescue-evidence" };
  const matches = promotions.filter(p => p?.ticket === rescue.replacedTicket);
  if (matches.length !== 1) return { ...out, status: "no-unique-promoted-source" };
  const promoted = matches[0];
  if (typeof promoted.priorityScore !== "number" || !Number.isFinite(promoted.priorityScore) ||
      promoted.priorityScore < POLICY.minimumPromotionScore || promoted.priorityScore > 100 || baseTickets.includes(promoted.ticket))
    return { ...out, status: "promotion-not-eligible" };
  const shadowTickets = [...baseTickets]; shadowTickets[rescue.index] = promoted.ticket;
  return { ...out, status: "eligible", eligible: true, shadowTickets,
    replacement: { index: rescue.index, removed: rescue.ticket, restored: promoted.ticket,
      promotionScore: promoted.priorityScore, rescueVersion: rescue.version } };
}
function unavailable() { return { version: POLICY.id, logicFingerprint: FINGERPRINT, status: "unavailable",
  eligible: false, applicationMode: POLICY.mode, automaticApplication: false,
  usableForPrediction: false, affectsTickets: false, affectsPrediction: false }; }
module.exports = { POLICY, FINGERPRINT, hash, ticketOf, validTicket, build, unavailable };
