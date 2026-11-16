"use strict";
// Read saved values only. This does not validate candidates again, select a
// different ticket, infer promotion time, or treat branch priority as a probability.
const VERSION = "promotion-role-priority-diagnostic-v1";
const CLAIM_KEYS = ["evaluationId", "boatNo", "position", "role", "branchId"];
const PHYSICAL_KEYS = [...CLAIM_KEYS.slice(0, 4), "score", "branchId"];
const LIST_KEYS = ["validPurchaseBranchIds", "validIndependentBranchIds", "validScenarioIds"];
const POSITION_KEYS = ["first", "second", "third"];
const text = value => typeof value === "string" && value.length > 0;
const finite = value => typeof value === "number" && Number.isFinite(value);
const ticket = value => typeof value === "string" && /^[1-6]-[1-6]-[1-6]$/.test(value) && new Set(value.split("-")).size === 3;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ids = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const tickets = value => Array.isArray(value) && value.length > 0 && value.length <= 10 && value.every(ticket) && new Set(value).size === value.length;
function projection(rows, keys) {
  if (!Array.isArray(rows)) return null;
  return rows.map(row => row && typeof row === "object" && !Array.isArray(row)
    ? Object.fromEntries(keys.filter(key => row[key] !== undefined).map(key => [key, row[key]])) : null);
}
function identityKnown(identity) {
  const clock = value => typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
  return identity && /^\d{8}-(?:0[1-9]|1\d|2[0-4])-(?:[1-9]|1[0-2])$/.test(identity.raceKey || "") &&
    /^[a-f0-9]{64}$/.test(identity.method || "") && clock(identity.selectedAt) && clock(identity.deadlineAt) &&
    Date.parse(identity.selectedAt) < Date.parse(identity.deadlineAt) &&
    ["predeadline", "server_pre_deadline"].includes(identity.predictionMode) && identity.officialResultUsedForPrediction === false;
}
function unknown(row, reason, observationRef = null) {
  return {ticket: typeof row?.ticket === "string" ? row.ticket : null,
    sourceCategory: typeof row?.sourceCategory === "string" ? row.sourceCategory : null,
    recordedPriority: finite(row?.priorityScore) ? row.priorityScore : null,
    status: "unknown", reason, observationRef, positions: null, maximum: null,
    recordedPriorityMatchesPositionMaximum: null};
}
function observationMatches(row, observation) {
  if (!observation || observation.stage !== "selection" || observation.valid !== true ||
      observation.ticket !== row.ticket || observation.sourceCategory !== row.sourceCategory ||
      !ids(observation.validBranchIds) || !equal(row.branchIds, observation.validBranchIds) ||
      !equal(row.validBranchIds, observation.validBranchIds) ||
      !finite(observation.priorityScore) || observation.priorityScore !== row.priorityScore ||
      !["purchaseEligible", "expansionEligible"].every(key => typeof row[key] === "boolean" && row[key] === observation[key]) ||
      !LIST_KEYS.every(key => ids(row[key]) && ids(observation[key]) && equal(row[key], observation[key]))) return false;
  for (const [key, keys] of [["coverage", CLAIM_KEYS], ["physicalCoverage", PHYSICAL_KEYS]]) {
    const raw = projection(row[key], keys), saved = projection(observation[key], keys);
    if (raw === null || saved === null || raw.some(v => v === null) || saved.some(v => v === null) || !equal(raw, saved)) return false;
  }
  return true;
}
function positionalValues(row, observation, branches, observationRef) {
  const fail = reason => unknown(row, reason, observationRef);
  const purchaseIds = observation.validPurchaseBranchIds;
  if (!purchaseIds.length || !purchaseIds.every(id => observation.validBranchIds.includes(id)) ||
      !observation.validIndependentBranchIds.every(id => purchaseIds.includes(id)) || !Array.isArray(branches))
    return fail("PURCHASE_BRANCH_REFERENCES_UNAVAILABLE");
  const coverage = observation.coverage, physical = observation.physicalCoverage, boats = row.ticket.split("-").map(Number);
  const validClaim = claim => claim && text(claim.evaluationId) && text(claim.role) &&
    Number.isInteger(claim.position) && claim.position >= 1 && claim.position <= 3 &&
    Number.isInteger(claim.boatNo) && boats[claim.position - 1] === claim.boatNo;
  if (!coverage.length || !coverage.every(claim => validClaim(claim) && text(claim.branchId)) || !physical.length ||
      !physical.every(claim => validClaim(claim) &&
        (!Object.hasOwn(claim, "branchId") || text(claim.branchId)) &&
        (!Object.hasOwn(claim, "score") || finite(claim.score))))
    return fail("POSITION_COVERAGE_UNAVAILABLE");
  if (coverage.some(claim => !purchaseIds.includes(claim.branchId))) return fail("COVERAGE_BRANCH_CONFLICT");
  // Generated physical claims normally omit score and branchId. Do not fill
  // either field; their four stored role fields must still bind uniquely to
  // this observation's coverage. An explicit branchId must agree if present.
  const samePhysicalClaim = (claim, physicalClaim) =>
    ["evaluationId", "boatNo", "position", "role"].every(key => claim[key] === physicalClaim[key]) &&
    (!Object.hasOwn(physicalClaim, "branchId") || claim.branchId === physicalClaim.branchId);
  if (!physical.every(p => coverage.filter(c => samePhysicalClaim(c, p)).length === 1) ||
      !coverage.every(c => physical.filter(p => samePhysicalClaim(c, p)).length === 1))
    return fail("PHYSICAL_COVERAGE_CONFLICT");
  const resolved = [];
  for (const id of purchaseIds) {
    const matches = branches.filter(branch => branch?.id === id);
    if (matches.length !== 1) return fail("BRANCH_REFERENCE_NOT_UNIQUE");
    const branch = matches[0];
    if (branch.qualified !== true || branch.ticket !== row.ticket || !finite(branch.priorityScore) ||
        !text(branch.scenarioId) || !text(branch.source) ||
        !["canonical-formation", "independent-scenario", "role-evidence-candidate"].includes(branch.kind))
      return fail("BRANCH_VALUE_UNAVAILABLE");
    if (branch.kind === "canonical-formation" &&
        (!/^base-formation:(?:main|cover|flow|hole)$/.test(branch.source) ||
         (row.sourceCategory !== "possibility" && branch.source !== "base-formation:" + row.sourceCategory)))
      return fail("BRANCH_SOURCE_CONFLICT");
    if (!Array.isArray(branch.roles) || branch.roles.length !== 1) return fail("BRANCH_ROLE_NOT_SEPARABLE");
    const role = branch.roles[0], claims = coverage.filter(claim => claim.branchId === id);
    if (!role || !text(role.evaluationId) || !text(role.role) || !Array.isArray(role.eligiblePositions) ||
        role.eligiblePositions.length !== 1 || !Number.isInteger(role.eligiblePositions[0]) ||
        role.eligiblePositions[0] < 1 || role.eligiblePositions[0] > 3 ||
        !Number.isInteger(role.boatNo) || row.ticket.split("-").map(Number)[role.eligiblePositions[0] - 1] !== role.boatNo ||
        claims.length !== 1 || claims[0].evaluationId !== role.evaluationId || claims[0].role !== role.role ||
        claims[0].boatNo !== role.boatNo || claims[0].position !== role.eligiblePositions[0])
      return fail("BRANCH_POSITION_CONFLICT");
    resolved.push({branch, role, position: role.eligiblePositions[0]});
  }
  const contexts = new Set(resolved.map(({branch}) => JSON.stringify([branch.scenarioId, branch.source, branch.kind])));
  if (contexts.size !== 1 || observation.validScenarioIds.length !== 1 ||
      observation.validScenarioIds[0] !== resolved[0].branch.scenarioId)
    return fail("BRANCH_CONTEXT_NOT_UNIQUE");
  const positions = {};
  for (let position = 1; position <= 3; position++) {
    const matches = resolved.filter(item => item.position === position);
    if (matches.length !== 1) return fail(matches.length ? "POSITION_ROLE_NOT_UNIQUE" : "POSITION_ROLE_UNAVAILABLE");
    const {branch, role} = matches[0];
    positions[POSITION_KEYS[position - 1]] = {boatNo: role.boatNo, role: role.role,
      evaluationId: role.evaluationId, branchId: branch.id, priority: branch.priorityScore};
  }
  const maximumPriority = Math.max(...POSITION_KEYS.map(key => positions[key].priority));
  const maxima = [1, 2, 3].filter(position => positions[POSITION_KEYS[position - 1]].priority === maximumPriority);
  return {...unknown(row, "SINGLE_SAVED_OBSERVATION_MATCH", observationRef), status: "bound",
    scenarioId: resolved[0].branch.scenarioId, branchSource: resolved[0].branch.source, branchKind: resolved[0].branch.kind,
    positions, maximum: {priority: maximumPriority, positions: maxima, positionKeys: maxima.map(position => POSITION_KEYS[position - 1])},
    recordedPriorityMatchesPositionMaximum: row.priorityScore === maximumPriority};
}
function diagnosePromotionRolePriorities(input) {
  const {identity, finalTickets, selectionTickets, selectionStatus, promotedRows, validationSnapshot} = input || {};
  const result = {version: VERSION, purpose: "diagnostic-only", action: "KEEP_A", alternativeTickets: null,
    rankingProposed: false, resultUsedForGeneration: false, usableForPrediction: false, automaticApplication: false,
    productionChanged: false, status: "unknown", reason: "", rows: [],
    interpretation: "A bound row matches one saved observation projection. It does not identify a consumed observation or prove promotion time. Saved branch priority is neither a probability nor role.score."};
  if (!Array.isArray(promotedRows)) return {...result, reason: "PROMOTED_ROWS_UNAVAILABLE"};
  const fail = reason => ({...result, reason, rows: promotedRows.map(row => unknown(row, reason))});
  if (!identityKnown(identity)) return fail("IDENTITY_UNAVAILABLE");
  if (selectionStatus !== "selected" || !tickets(finalTickets) || !tickets(selectionTickets) || !equal(finalTickets, selectionTickets))
    return fail("FINAL_SELECTION_ORDER_MISMATCH");
  const snapshot = validationSnapshot;
  if (!snapshot || snapshot.version !== "candidate-validation-evidence-v1" || snapshot.status !== "captured" ||
      snapshot.resultUsedForGeneration !== false || Object.hasOwn(snapshot, "diagnostic"))
    return fail("FINAL_VALIDATION_UNAVAILABLE");
  if (!tickets(snapshot.finalSelectedTickets) || !equal(finalTickets, snapshot.finalSelectedTickets))
    return fail("FINAL_VALIDATION_ORDER_MISMATCH");
  if (!Array.isArray(snapshot.observations)) return fail("VALIDATION_OBSERVATIONS_UNAVAILABLE");
  const indexes = promotedRows.map(row => finalTickets.indexOf(row?.ticket));
  if (indexes.some((index, i) => index < 0 || (i > 0 && index <= indexes[i - 1]))) return fail("PROMOTION_ROW_ORDER_MISMATCH");
  const rows = promotedRows.map(row => {
    if (row?.candidatePromotion !== true || row?.selectionTier !== "候補補完") return unknown(row, "NOT_FINAL_PROMOTION");
    if (!ticket(row.ticket) || !text(row.sourceCategory) || row.evidenceQualified !== true ||
        !finite(row.priorityScore) || !ids(row.branchIds) || !ids(row.validBranchIds))
      return unknown(row, "QUALIFIED_PROMOTION_FIELDS_UNAVAILABLE");
    if (row.purchaseEligible !== true || row.expansionEligible !== false ||
        !ids(row.validIndependentBranchIds) || row.validIndependentBranchIds.length !== 0)
      return unknown(row, "PROMOTION_PATH_FLAGS_CONFLICT");
    const observations = snapshot.observations.map((observation, index) => ({observation, index}))
      .filter(({observation}) => observationMatches(row, observation));
    if (observations.length !== 1) return unknown(row, observations.length ? "OBSERVATION_NOT_UNIQUE" : "OBSERVATION_UNAVAILABLE");
    const {observation, index} = observations[0], ref = {index, stage: observation.stage,
      ticket: observation.ticket, sourceCategory: observation.sourceCategory};
    return positionalValues(row, observation, snapshot.branches, ref);
  });
  const bound = rows.filter(row => row.status === "bound").length;
  return {...result, status: !rows.length ? "not-applicable" : bound === rows.length ? "bound" : bound ? "partial" : "unknown",
    reason: rows.length ? "" : "NO_FINAL_PROMOTION_ROWS", rows};
}
// Unlike the selected-only diagnostic, this resolves the actual selector-time
// consumed observation reference, without inventing a final promotion row.
function resolveQueueRolePriorities(row, snapshot) {
  const fail=reason=>unknown(row,reason);
  try {
    if(!row||!ticket(row.ticket)||!text(row.sourceCategory)||!finite(row.priorityScore)) return fail("QUEUE_ROW_UNAVAILABLE");
    if(!snapshot||snapshot.version!=="candidate-validation-evidence-v1"||snapshot.status!=="captured"||
        snapshot.resultUsedForGeneration!==false||Object.hasOwn(snapshot,"diagnostic")||!Array.isArray(snapshot.observations))
      return fail("QUEUE_VALIDATION_UNAVAILABLE");
    const ref=row.validationRef;
    if(ref?.field!=="candidateValidationEvidence.observations"||!Number.isInteger(ref.index)||ref.index<0||ref.index>=snapshot.observations.length)
      return fail("CONSUMED_OBSERVATION_REFERENCE_INVALID");
    const observation=snapshot.observations[ref.index];
    if(!observation||observation.stage!=="selection"||observation.valid!==true||observation.ticket!==row.ticket||
        observation.sourceCategory!==row.sourceCategory||!finite(observation.priorityScore)||observation.priorityScore!==row.priorityScore||
        observation.purchaseEligible!==true||observation.expansionEligible!==false||
        !ids(observation.validBranchIds)||!LIST_KEYS.every(key=>ids(observation[key]))||observation.validIndependentBranchIds.length!==0||
        !Array.isArray(observation.coverage)||!Array.isArray(observation.physicalCoverage))
      return fail("CONSUMED_OBSERVATION_UNAVAILABLE");
    return positionalValues(row,observation,snapshot.branches,{field:ref.field,index:ref.index,stage:observation.stage,
      ticket:observation.ticket,sourceCategory:observation.sourceCategory});
  } catch (_) { return fail("QUEUE_ROLE_VALUES_UNAVAILABLE"); }
}
module.exports = {VERSION, diagnosePromotionRolePriorities, resolveQueueRolePriorities};
