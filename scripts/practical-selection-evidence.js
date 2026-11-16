'use strict';
// Snapshot existing decisions, never reconstruct them from a race result.
const value = t => typeof t === 'string' ? t : t?.ticket;
const list = a => Array.isArray(a) ? a : [];
const pick = (row, keys) => Object.fromEntries(keys.filter(k => row?.[k] !== undefined).map(k => [k, row[k]]));
const decisionKeys = ['ticket','selected','ticketSelected','relation','reasonCode','reason',
  'priorityScore','category','selectionTier','branchIds','requirementIds','coveredEvaluationIds',
  'candidateOnlyEvaluationIds','physicalCoverage','roleLabels','scenarioTitle','scenarioSummary'];

const validTickets = a => Array.isArray(a) && a.length > 0 && a.length <= 10 &&
  new Set(a).size === a.length && a.every(t => typeof t === 'string' &&
    /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3);
function sidecarMatches(validation, expected) {
  return validation?.status === 'captured' && validation.resultUsedForGeneration === false &&
    Array.isArray(validation.poolTickets) && validation.poolTickets.length <= 120 &&
    new Set(validation.poolTickets).size === validation.poolTickets.length &&
    validation.poolTickets.every(t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3) &&
    Array.isArray(validation.finalSelectedTickets) &&
    JSON.stringify([...validation.finalSelectedTickets].sort()) === JSON.stringify([...expected].sort()) &&
    expected.every(t => validation.poolTickets.includes(t)) && Array.isArray(validation.observations) &&
    validation.observations.every(row => row && validation.poolTickets.includes(row.ticket) &&
      ['selection','pool-audit'].includes(row.stage)) &&
    validation.poolTickets.every(t => validation.observations.some(row => row.ticket === t));
}
function projectValidation(validation) {
  return { ...pick(validation, ['version','status','resultUsedForGeneration','poolTickets','finalSelectedTickets']),
      branches:list(validation.branches).map(branch => ({
        ...pick(branch, ['id','ticket','scenarioId','kind','source','qualified','priorityScore']),
        roles:list(branch.roles).map(role => pick(role,['evaluationId','boatNo','role','eligiblePositions','score'])),
        evidenceChecks:list(branch.evidenceChecks).map(check => pick(check,
          ['key','matched','required','source','boatNo','role','score']))
      })),
      observations:list(validation.observations).map(row => ({
        ...pick(row, ['ticket','sourceCategory','stage','inputBranchIds','valid','purchaseEligible',
          'expansionEligible','validBranchIds','validPurchaseBranchIds','validIndependentBranchIds',
          'validScenarioIds','requirementIds','coveredEvaluationIds','coveredBoatNos','priorityScore',
          'invalidReasons','reasonCode','reason']),
        coverage:list(row.coverage).map(claim => pick(claim,
          ['evaluationId','boatNo','position','role','branchId'])),
        physicalCoverage:list(row.physicalCoverage).map(claim => pick(claim,
          ['evaluationId','boatNo','position','role','score','branchId']))
      })) };
}
const diagnosticVersion = 'candidate-validation-mismatch-diagnostic-v1';
const rescueKinds = [
  ['threeCourseEscapeRescueFixed5', '20260823-three-course-134-v1', '3コース攻め', '1-3-4'],
  ['fourKadoEscapeRescueFixed5', '20260823-four-kado-124-v1', '4カド攻め', '1-2-4']
];
// Only diagnose a known post-generator replacement. Never repair qualification,
// overwrite generator decisions, or reinterpret an old invalid snapshot.
function mismatchDiagnostic(validation, selection, selected) {
  try {
    if (validation?.version !== 'candidate-validation-evidence-v1') return null;
    const saved = validation?.status === 'invalid-or-unavailable' ? validation.diagnostic : null;
    const generator = saved ? saved.originalGeneratorSnapshot : validation;
    if (saved && (saved.version !== diagnosticVersion || saved.purpose !== 'diagnostic-only' ||
        saved.resultUsedForGeneration !== false || saved.usableForPrediction !== false ||
        saved.mismatchReason !== 'final-ticket-set-mismatch')) return null;
    // A bounded JSON tree, no recursive diagnostics, accessors, cycles, or proto keys.
    const seen = new Set();
    let nodes = 0, stringBytes = 0;
    function plainTree(x, depth = 0) {
      if (depth > 12 || ++nodes > 100000) return false;
      if (typeof x === 'string') {
        stringBytes += Buffer.byteLength(x);
        if (stringBytes > 1024 * 1024) return false;
      }
      if (x === null || ['string','boolean','number'].includes(typeof x)) return typeof x !== 'number' || Number.isFinite(x);
      if (typeof x !== 'object' || seen.has(x)) return false;
      if (!Array.isArray(x) && Object.getPrototypeOf(x) !== Object.prototype && Object.getPrototypeOf(x) !== null) return false;
      seen.add(x);
      if (Object.keys(x).length > 2048) return false;
      for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(x))) {
        if (['__proto__','prototype','constructor','diagnostic'].includes(key) || !Object.hasOwn(d, 'value') || !plainTree(d.value, depth + 1)) return false;
      }
      seen.delete(x);
      return true;
    }
    if (!plainTree(generator)) return null;
    if (!generator || generator.version !== 'candidate-validation-evidence-v1' ||
        Object.hasOwn(generator, 'diagnostic') || !validTickets(generator.finalSelectedTickets) ||
        !sidecarMatches(generator, generator.finalSelectedTickets)) return null;
    if (JSON.stringify([...generator.finalSelectedTickets].sort()) === JSON.stringify([...selected].sort())) return null;
    const encoded = JSON.stringify(generator);
    if (Buffer.byteLength(encoded) > 1024 * 1024) return null;
    const active = rescueKinds.filter(([key]) => selection.expansionSummary?.[key]?.applied === true);
    if (active.length !== 1) return null;
    const [key, version, targetLabel, ticket] = active[0], meta = selection.expansionSummary[key];
    const before = generator.finalSelectedTickets;
    const reason = `${targetLabel}時の検証済みイン逃げ救済として、点数を増やさず${meta.replacedTicket}を${ticket}へ1点置換。`;
    if (meta.version !== version || meta.targetLabel !== targetLabel || meta.ticket !== ticket ||
        meta.index !== before.length - 1 || before[meta.index] !== meta.replacedTicket ||
        before.includes(ticket) || meta.reason !== reason) return null;
    const after = before.slice(); after[meta.index] = ticket;
    if (JSON.stringify(after) !== JSON.stringify(selected)) return null;
    const transformations = [{kind:key, ...pick(meta, ['applied','version','targetLabel','ticket','replacedTicket','index','reason'])}];
    if (saved && (JSON.stringify(saved.observedFinalTickets) !== JSON.stringify(selected) ||
        JSON.stringify(saved.transformations) !== JSON.stringify(transformations))) return null;
    return {version:diagnosticVersion, purpose:'diagnostic-only', resultUsedForGeneration:false,
      usableForPrediction:false, mismatchReason:'final-ticket-set-mismatch',
      originalGeneratorSnapshot:projectValidation(generator), transformations,
      observedFinalTickets:selected.slice()};
  } catch { return null; }
}

let promotionDiagnosticCodeSha256;
function promotionDiagnostic(record, expected, selection, validationSnapshot) {
  try {
    const diagnostic = require('./promotion-role-priority-diagnostic.cjs');
    if (!promotionDiagnosticCodeSha256) {
      const fs = require('node:fs'), {createHash} = require('node:crypto');
      const hash = createHash('sha256');
      for (const [name, file] of [
        ['scripts/practical-selection-evidence.js', __filename],
        ['scripts/promotion-role-priority-diagnostic.cjs', require.resolve('./promotion-role-priority-diagnostic.cjs')]
      ]) hash.update(name + '\0').update(fs.readFileSync(file)).update('\0');
      promotionDiagnosticCodeSha256 = hash.digest('hex');
    }
    const result = diagnostic.diagnosePromotionRolePriorities({
      identity: {raceKey:record.raceKey, selectedAt:record.selectedAt, deadlineAt:record.deadlineAt,
        method:record.reviewEvidence?.method, predictionMode:record.reviewEvidence?.predictionMode,
        officialResultUsedForPrediction:record.reviewEvidence?.officialResultUsedForPrediction},
      finalTickets:expected, selectionTickets:selection.tickets.map(value), selectionStatus:selection.status,
      promotedRows:list(selection.tickets).filter(row=>row?.candidatePromotion===true).map(row=>pick(row,[
        'ticket','candidatePromotion','selectionTier','sourceCategory','evidenceQualified','branchIds',
        'validBranchIds','validPurchaseBranchIds','validIndependentBranchIds','validScenarioIds',
        'priorityScore','coverage','physicalCoverage','purchaseEligible','expansionEligible'
      ])), validationSnapshot
    });
    if (!result || result.purpose !== 'diagnostic-only' || result.action !== 'KEEP_A' ||
        result.alternativeTickets !== null || result.rankingProposed !== false ||
        result.resultUsedForGeneration !== false || result.usableForPrediction !== false ||
        result.automaticApplication !== false) throw Error('diagnostic_contract_invalid');
    return JSON.parse(JSON.stringify({...result, diagnosticCodeSha256:promotionDiagnosticCodeSha256}));
  } catch (_) {
    // Diagnostics cannot block or change an otherwise valid stored A.
    return {version:'promotion-role-priority-diagnostic-v1', purpose:'diagnostic-only',
      status:'capture-error', reasonCode:'DIAGNOSTIC_UNAVAILABLE', action:'KEEP_A',
      alternativeTickets:null, rankingProposed:false, resultUsedForGeneration:false,
      usableForPrediction:false, automaticApplication:false, rows:[]};
  }
}

let executionCodeSha256;
function capturePromotionExecution(selection,finalTickets,baselineTickets,validation,diagnostic) {
  try {
    if (!executionCodeSha256) {
      const fs=require('node:fs'), {createHash}=require('node:crypto'), hash=createHash('sha256');
      for (const name of ['js/practical-selection.js','scripts/practical-selection-evidence.js','scripts/candidate-promotion-execution-evidence.cjs'])
        hash.update(name+'\0').update(fs.readFileSync(require('node:path').join(__dirname,'..',name))).update('\0');
      executionCodeSha256=hash.digest('hex');
    }
    const result=JSON.parse(JSON.stringify(require('./candidate-promotion-execution-evidence.cjs').capturePromotionExecution({
      snapshot:selection.candidatePromotionExecution,
      validation:diagnostic?.originalGeneratorSnapshot || validation,
      finalTickets,baselineTickets,diagnostic,expansionSummary:selection.expansionSummary,
      candidateDecisions:selection.candidateDecisions})));
    if (!result || typeof result !== 'object' || Array.isArray(result) ||
        result.version !== 'candidate-promotion-execution-v1' || result.purpose !== 'diagnostic-only' ||
        result.action !== 'KEEP_A' || result.alternativeTickets !== null || result.rankingProposed !== false ||
        result.resultUsedForGeneration !== false || result.usableForPrediction !== false || result.automaticApplication !== false ||
        !['captured','unknown'].includes(result.status) ||
        (result.status === 'unknown' && (typeof result.reasonCode !== 'string' || !result.reasonCode)) ||
        (result.status === 'captured' && (result.maximumCount !== 10 || !Number.isInteger(result.candidateCount) ||
          !Array.isArray(result.before?.selectedTickets) || !Array.isArray(result.before?.usedTickets) ||
          !Number.isInteger(result.before?.remainingSlots) || !Array.isArray(result.queue) ||
          !Array.isArray(result.afterPromotionTickets) || !Array.isArray(result.selectorFinalTickets) ||
          !Array.isArray(result.transitions) || !Array.isArray(result.postSelectorTransformations) ||
          !Array.isArray(result.observedFinalTickets)))) throw Error('execution_contract_invalid');
    return {...result,executionCodeSha256};
  } catch (_) {
    return {version:'candidate-promotion-execution-v1',purpose:'diagnostic-only',status:'unknown',
      reasonCode:'EXECUTION_CAPTURE_UNAVAILABLE',action:'KEEP_A',alternativeTickets:null,rankingProposed:false,
      resultUsedForGeneration:false,usableForPrediction:false,automaticApplication:false};
  }
}

function capture(record, baseline, selection) {
  const evidence = { version:'practical-selection-evidence-v1', raceKey:record.raceKey,
    selectedAt:record.selectedAt, deadlineAt:record.deadlineAt,
    reviewEvidence:record.reviewEvidence, productionChanged:false, resultUsedForGeneration:false };
  const finish = payload => JSON.parse(JSON.stringify({...evidence,...payload}));
  if (!selection || !Array.isArray(selection.tickets)) return finish({status:'selection-unavailable'});
  const selected = selection.tickets.map(value), expected = list(baseline).map(value);
  const valid = a => a.length > 0 && a.length <= 10 && new Set(a).size === a.length &&
    a.every(t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3);
  if (!valid(selected) || !valid(expected) || JSON.stringify([...selected].sort()) !== JSON.stringify([...expected].sort()))
    return finish({status:'baseline-mismatch'});
  const candidateDecisions = list(selection.candidateDecisions).map(row => pick(row, decisionKeys));
  // Additive v1 sidecar. Old snapshots remain readable and are not backfilled.
  // Missing evidence/fields stay missing; stage observations are not final votes.
  const validation = selection.candidateValidationEvidence;
  const matches = validation?.version === 'candidate-validation-evidence-v1' && sidecarMatches(validation, expected);
  const diagnostic = !matches && validation ? mismatchDiagnostic(validation, selection, selected) : null;
  const candidateValidationEvidence = matches ? projectValidation(validation)
    : validation ? {version:'candidate-validation-evidence-v1', status:'invalid-or-unavailable',
      ...(diagnostic ? {diagnostic} : {})} : undefined;
  // Preserve guard-only presence before the legacy projection drops it.
  // A diagnostic-marked generator snapshot is never final-A evidence.
  const promotionValidationSnapshot = validation && Object.hasOwn(validation, 'diagnostic')
    ? {...candidateValidationEvidence, diagnostic:null} : candidateValidationEvidence;
  const excludedCandidates = list(selection.excludedCandidates).map(row => pick(row, decisionKeys));
  const targetDecisions = list(selection.targetDecisions).map(row => ({
    ...pick(row,['evaluationId','boatNo','selected','selectedTickets','adoptionSupported','supportedSelectedTickets',
      'candidateCount','selectedCandidateCount','excludedCandidateCount','hiddenCandidateCount',
      'bestCandidateTicket','bestCandidateScore','selectionBoundary','comparisonTicket','comparisonScore','scoreGap','reasonCode','reason']),
    candidateDecisions:list(row.candidateDecisions).map(d => pick(d, decisionKeys))
  }));
  return finish({status:'captured',selectionStatus:selection.status,selectionReason:selection.reason,
    practicalTickets:expected,candidateDecisions,excludedCandidates,targetDecisions,
    promotionRolePriorityDiagnostic:promotionDiagnostic(record,expected,selection,promotionValidationSnapshot),
    ...(Object.hasOwn(selection,'candidatePromotionExecution') ? {candidatePromotionExecutionEvidence:
      capturePromotionExecution(selection,selected,expected,candidateValidationEvidence,diagnostic)} : {}),
    ...(candidateValidationEvidence ? {candidateValidationEvidence} : {}),
    generation:selection.verificationEvidence?.generation || null,
    decisionCount:candidateDecisions.length + excludedCandidates.length + targetDecisions.reduce((n,r)=>n+r.candidateDecisions.length,0)});
}
module.exports = { capture };
