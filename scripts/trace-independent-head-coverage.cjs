'use strict';
// A read-only sidecar for the already frozen candidate. Never loads results or
// chooses a replacement source record, and never changes production modules.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const frozen = require('./compare-escape-frozen.cjs');
const candidate = require('./compare-independent-head-coverage.cjs');

const TRACE_FIELD = '__offlineHeadCoverageTrace';
const REFERENCE_FINGERPRINT = 'c607ba387e1222048ec816cb6099a2e1f192df2c6226e4e9d7e3634175c49b8f';
const COMPARISON_FILES = ['compare-escape-frozen.cjs','analysis-input-contract.js','audit-escape-main.cjs','daily-prediction-source-archive.js','phase11-improvement-decision-gate.cjs'];
const STAGES = ['before-expansion','after-expansion','after-promotion','after-strong-trim','after-two-course-trim','after-rank-gate','after-role-replacement','final'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const count = (object,key) => {object[key]=(object[key]||0)+1;};
const compact = result => ({head:result.head,tickets:[...result.tickets],mainTickets:[...(result.mainTickets||[])],scenarios:clone(result.scenarios),coreVersion:result.coreVersion});

function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw Error('Trace selector source contract changed: '+marker.trim().slice(0,70));
  return source.replace(marker,replacement);
}

// Insert only local, primitive snapshots. The selector never reads these values.
// The candidate's own injection and its predicates are still supplied unchanged
// by its original module; only its local firstNewHead value is observed.
const INIT = `    const __hct = {version:1,normalCount:normalTicketCount,actualFirstNewHead:null,stages:[]};
    const __hctHeadsValid = Array.isArray(options.researchBaselineHeads) && options.researchBaselineHeads.length > 0 &&
      options.researchBaselineHeads.every(head => Number.isInteger(head) && head >= 1 && head <= 6);
    const __hctRepresented = new Set(__hctHeadsValid ? options.researchBaselineHeads : []);
    const __hctReason = row => {
      const head = ticketBoats(row.ticket)[0], course = courseOf(validationContext, head);
      if (!__hctHeadsValid) return 'INVALID_BASELINE_HEAD_OPTIONS';
      if (__hctRepresented.has(head)) return 'BASELINE_HEAD_ALREADY_REPRESENTED';
      if (!(course >= 1 && course <= 6)) return 'COURSE_UNAVAILABLE';
      if (row.evidenceQualified !== true) return 'EVIDENCE_NOT_QUALIFIED';
      if (row.purchaseEligible !== true) return 'PURCHASE_NOT_ELIGIBLE';
      if (row.expansionEligible !== true) return 'EXPANSION_NOT_ELIGIBLE';
      if (!(row.priorityScore >= 65)) return 'BELOW_EXISTING_65_FLOOR';
      if ([2,5,6].includes(course) && !(row.priorityScore >= 80)) return 'BELOW_EXISTING_COURSE_80_FLOOR';
      if (!row.validIndependentBranchIds.some(id => {
        const branch = validationContext.branchesById.get(id);
        return branch?.ticket === row.ticket && branch.attackerBoatNo === head && branch.phaseEvidence?.kind === 'alternate-head';
      })) return 'MATCHING_ALTERNATE_HEAD_BRANCH_UNAVAILABLE';
      return 'QUALIFIED_UNREPRESENTED_HEAD';
    };
    const __hctCompact = row => ({ticket:row.ticket,head:ticketBoats(row.ticket)[0],
      course:courseOf(validationContext,ticketBoats(row.ticket)[0]) || null,
      score:Number.isFinite(row.priorityScore)?row.priorityScore:null,tier:String(row.selectionTier||'')});
    const __hctReasons = rows => {
      const counts = {};
      rows.forEach(row => { const reason=__hctReason(row); counts[reason]=(counts[reason]||0)+1; });
      return counts;
    };
    const __hctCapture = (name, rows=selected) => {
      const target=__hct.target?.ticket || null;
      __hct.stages.push({name,selected:rows.map(__hctCompact),targetSelected:!!target && rows.some(row=>row.ticket===target),
        targetReasons:[...new Set(candidateDecisions.filter(row=>row.ticket===target).map(row=>row.reasonCode))]});
    };
`;

const POOL = `    __hct.pool = {candidateCount:candidates.length,rawCount:rawExpansionCandidates.length,
      sortedCount:expansionCandidates.length,allCandidateReasons:__hctReasons(candidates.map(item=>item.row)),
      rawReasons:__hctReasons(rawExpansionCandidates),sortedReasons:__hctReasons(expansionCandidates),
      exclusions:[...expansionExclusionByTicket.values()].reduce((counts,item)=>{
        counts[item.reasonCode]=(counts[item.reasonCode]||0)+1;return counts;
      },{})};
    __hct.sortedPoolBefore = expansionCandidates.map(row=>({...__hctCompact(row),qualification:__hctReason(row)}));
    __hct.observedFirstNewHead = expansionCandidates.findIndex(row=>__hctReason(row)==='QUALIFIED_UNREPRESENTED_HEAD');
    __hct.target = __hct.observedFirstNewHead < 0 ? null : __hctCompact(expansionCandidates[__hct.observedFirstNewHead]);
    __hctCapture('before-expansion');
`;

function transformObservedSelection(source,{mode='current'}={}) {
  if (!['current','candidate'].includes(mode)) throw Error('Unknown trace selector mode');
  if (source.includes(TRACE_FIELD) || source.includes('const __hct =')) throw Error('Trace source already instrumented');
  if (mode==='candidate') source=candidate.transformSelection(source);
  const initMarker='    const rawExpansionCandidates =\n';
  source=replaceOnce(source,initMarker,INIT+initMarker);
  if (mode==='candidate') {
    source=replaceOnce(source,candidate.INJECTION,POOL+candidate.INJECTION);
    const firstMarker='      if (firstNewHead > 0) expansionCandidates.unshift(expansionCandidates.splice(firstNewHead, 1)[0]);';
    source=replaceOnce(source,firstMarker,'      __hct.actualFirstNewHead = firstNewHead;\n'+firstMarker);
  } else source=replaceOnce(source,candidate.MARKER,POOL+candidate.MARKER);
  source=replaceOnce(source,candidate.MARKER,'    __hct.sortedPoolAfter = expansionCandidates.map(row=>row.ticket);\n'+candidate.MARKER);
  const stages=[
    ['    const candidateOnlyPromotionPool =\n','after-expansion'],
    ['    const strongEscapeTrim =\n','after-promotion'],
    ['    const weakTwoHeadTrimmedTickets =\n','after-strong-trim'],
    ['    candidates.forEach(\n','after-two-course-trim'],
    ['    const escapeRolePartnerReplacement = (() => {\n','after-rank-gate'],
    ['    const selectedExpansionBoundary =\n','after-role-replacement']
  ];
  for (const [marker,name] of stages) source=replaceOnce(source,marker,`    __hctCapture('${name}');\n`+marker);
  source=replaceOnce(source,'      expansionSummary,\n',`      expansionSummary: {...expansionSummary, ${TRACE_FIELD}: (() => {
        __hctCapture('final',finalizedTickets); return __hct;
      })()},\n`);
  return source;
}

function stripTrace(result) {
  const value=clone(result);
  if (value.expansionSummary && Object.hasOwn(value.expansionSummary,TRACE_FIELD)) delete value.expansionSummary[TRACE_FIELD];
  return value;
}

function verifyReferenceSources(root,referenceReport) {
  const ref=referenceReport;
  if (!ref || ref.version!=='independent-head-coverage-comparison-v1' || !Array.isArray(ref.rows) || !ref.rows.length ||
      ref.summary?.replayed!==ref.rows.length || ref.baselineReproduction?.reproduced!==ref.rows.length ||
      ref.candidate?.id!==candidate.CANDIDATE_ID || ref.candidate?.definedAt!==candidate.DEFINED_AT ||
      ref.candidate?.requiredCoreVersion!==candidate.REQUIRED_CORE_VERSION || ref.candidate?.fingerprint!==REFERENCE_FINGERPRINT)
    throw Error('Invalid fixed reference report contract');
  const expectedPrediction=frozen.MODULES.map(name=>'js/'+name+'.js');
  const expectedComparison=COMPARISON_FILES.map(name=>'scripts/'+name);
  const inspect=(entries,expected)=>{
    if (!Array.isArray(entries) || entries.length!==expected.length || entries.some((item,index)=>item.path!==expected[index] || !/^[a-f0-9]{64}$/.test(item.sha256)))
      throw Error('Reference source manifest contract changed');
    for(const item of entries) {
      const actual=hash(fs.readFileSync(path.join(root,item.path)));
      if(actual!==item.sha256) throw Error('Reference source hash mismatch: '+item.path);
    }
  };
  inspect(ref.predictionSources,expectedPrediction);inspect(ref.comparisonSources,expectedComparison);
  const scriptSha256=hash(fs.readFileSync(path.join(root,'scripts/compare-independent-head-coverage.cjs')));
  const fingerprint=hash(JSON.stringify({id:candidate.CANDIDATE_ID,definedAt:candidate.DEFINED_AT,injection:candidate.INJECTION,
    scriptSha256,predictionSources:ref.predictionSources,comparisonSources:ref.comparisonSources}));
  if(scriptSha256!==ref.candidate.scriptSha256 || ref.candidate.selectorSha256!==ref.predictionSources.find(item=>item.path==='js/practical-selection.js').sha256 ||
      ref.candidate.replaySourceSha256!==ref.comparisonSources.find(item=>item.path==='scripts/compare-escape-frozen.cjs').sha256 ||
      ref.candidate.inputContractSha256!==ref.comparisonSources.find(item=>item.path==='scripts/analysis-input-contract.js').sha256 ||
      fingerprint!==ref.candidate.fingerprint) throw Error('Frozen candidate fingerprint mismatch');
  candidate.declaredCoreVersion(root);
  const keys=new Set();
  for(const row of ref.rows) {
    if(!row || typeof row.key!=='string' || keys.has(row.key) || !row.current || !row.attempt) throw Error('Invalid reference row contract');
    keys.add(row.key);
  }
  return {fingerprint,scriptSha256,predictionSourceCount:expectedPrediction.length,comparisonSourceCount:expectedComparison.length};
}

function pointerPath(root,pointer) {
  if(!pointer || typeof pointer.path!=='string' || !/^[a-f0-9]{64}$/.test(pointer.sha256||'') || !/^[a-f0-9]{64}$/.test(pointer.recordJsonSha256||''))
    throw Error('invalid-source-pointer');
  const daily=/^data\/predictions\/\d{8}\.json$/.test(pointer.path);
  const note=/^data\/note-drafts\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(pointer.path);
  if(!(daily && ['predictions','verificationPredictions'].includes(pointer.array) && Number.isInteger(pointer.index) && pointer.index>=0 && pointer.recordPath===undefined) &&
      !(note && pointer.recordPath==='record' && pointer.array===undefined && pointer.index===undefined)) throw Error('invalid-source-pointer');
  const full=path.resolve(root,pointer.path),base=fs.realpathSync(root)+path.sep;
  if(!full.startsWith(path.resolve(root)+path.sep)) throw Error('invalid-source-pointer');
  if(fs.existsSync(full) && !fs.realpathSync(full).startsWith(base)) throw Error('source-pointer-outside-root');
  return full;
}

function resolveReferenceRow(root,referenceRow,loadedFile) {
  const pointer=referenceRow.sourcePointer;
  let full;
  try {full=pointerPath(root,pointer);} catch(error){return {reason:error.message};}
  let data,sha256;
  try {
    if(loadedFile) {data=loadedFile.data;sha256=loadedFile.sha256;}
    else {const bytes=fs.readFileSync(full);sha256=hash(bytes);data=JSON.parse(bytes);}
  } catch(error){return {reason:error.code==='ENOENT'?'source-file-missing':'source-file-unreadable'};}
  const record=pointer.recordPath==='record'?data?.record:data?.[pointer.array]?.[pointer.index];
  if(!record || typeof record!=='object' || Array.isArray(record)) return {reason:'source-record-missing'};
  if(hash(JSON.stringify(record))!==pointer.recordJsonSha256) return {reason:'source-record-hash-mismatch'};
  const snap=frozen.snapshot(record,referenceRow.source,{requiredCoreVersion:candidate.REQUIRED_CORE_VERSION});
  if(snap.reason) return {reason:'snapshot:'+snap.reason};
  const row=snap.row;
  if(row.key!==referenceRow.key || row.selectedAt!==referenceRow.selectedAt || row.deadlineAt!==referenceRow.deadlineAt || row.sourceCommit!==referenceRow.sourceCommit)
    return {reason:'source-record-identity-mismatch'};
  row.sourcePointer=clone(pointer);
  return {row,fileEvidence:{path:pointer.path,expectedSha256:pointer.sha256,actualSha256:sha256,
    fileHashMatched:sha256===pointer.sha256,recordHashMatched:true,
    ...(sha256!==pointer.sha256?{warning:'FILE_CHANGED_RECORD_IDENTICAL'}:{})}};
}

function validateTrace(trace,mode) {
  if(!trace || !isDeepStrictEqual(trace.stages?.map(stage=>stage.name),STAGES) || !Array.isArray(trace.sortedPoolBefore) || !Array.isArray(trace.sortedPoolAfter))
    throw Error('Missing or incomplete selector trace: '+mode);
  if(mode==='candidate' && trace.actualFirstNewHead!==trace.observedFirstNewHead) throw Error('Observed candidate predicate disagrees with original firstNewHead');
}

function traceClassification(current,candidateTrace,guard) {
  if(candidateTrace.observedFirstNewHead<0) return 'NO_QUALIFIED_UNREPRESENTED_HEAD_IN_SORTED_POOL';
  const first=candidateTrace.stages.findIndex(stage=>stage.targetSelected);
  if(first<0) return candidateTrace.observedFirstNewHead===0?'TARGET_ALREADY_FIRST_BUT_NEVER_SELECTED':'TARGET_MOVED_BUT_NEVER_SELECTED';
  const dropped=candidateTrace.stages.slice(first+1).find(stage=>!stage.targetSelected);
  if(dropped) return 'TARGET_REMOVED_'+dropped.name.toUpperCase().replaceAll('-','_');
  if(candidateTrace.observedFirstNewHead===0) return 'QUALIFIED_TARGET_ALREADY_FIRST';
  if(!isDeepStrictEqual(current.stages.at(-1).selected.map(row=>row.ticket),candidateTrace.stages.at(-1).selected.map(row=>row.ticket)))
    return guard.changed?'FINAL_SWAP_ACCEPTED':'FINAL_DIFFERENCE_REJECTED_BY_FIXED_GUARD';
  return 'TARGET_MOVED_FINAL_ORDER_UNCHANGED';
}

async function build(root,{referenceReport,sourceCommit='',run,generatedAt=new Date().toISOString()}={}) {
  const sources=verifyReferenceSources(root,referenceReport);
  run ||= {
    plainCurrent:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true}),
    plainCandidate:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true,transformSelection:candidate.transformSelection}),
    observedCurrent:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true,transformSelection:source=>transformObservedSelection(source,{mode:'current'})}),
    observedCandidate:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true,transformSelection:source=>transformObservedSelection(source,{mode:'candidate'})})
  };
  if(!['plainCurrent','plainCandidate','observedCurrent','observedCandidate'].every(name=>typeof run[name]==='function')) throw Error('Invalid trace runner interface');
  const groups=new Map(),rows=[],files=[],reasons={},classifications={};
  referenceReport.rows.forEach((reference,index)=>{
    const key=reference.sourcePointer?.path || '(invalid-pointer)';
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push({reference,index});
  });
  const untraced=(reference,index,reason)=>{count(reasons,reason);rows.push({index,key:reference.key,source:reference.source,sourcePointer:clone(reference.sourcePointer||null),status:'untraced',reason});};
  for(const [file,group] of groups) {
    let loadedFile;
    try {
      const full=pointerPath(root,group[0].reference.sourcePointer),bytes=fs.readFileSync(full);
      loadedFile={sha256:hash(bytes),data:JSON.parse(bytes)};
    } catch(error) { /* Per-row resolution preserves missing records in the fixed denominator. */ }
    for(const {reference,index} of group) {
      const resolved=resolveReferenceRow(root,reference,loadedFile);
      if(resolved.reason) {untraced(reference,index,resolved.reason);continue;}
      const row=resolved.row;
      let current,attempt;
      try {current=run.plainCurrent(row);}
      catch(error){untraced(reference,index,'baseline-replay-error');continue;}
      const reproduction=current.coreVersion!==candidate.REQUIRED_CORE_VERSION?'baseline-core-version-mismatch':frozen.checkReplay(row,current);
      if(reproduction || !isDeepStrictEqual(compact(current),reference.current)) {
        untraced(reference,index,reproduction || 'reference-ordered-baseline-mismatch');continue;
      }
      const options={researchBaselineHeads:candidate.heads(current.tickets)};
      try {attempt=run.plainCandidate(row,options);}
      catch(error){untraced(reference,index,'candidate-replay-error');continue;}
      if(!isDeepStrictEqual(attempt.tickets,reference.attempt.tickets) || attempt.coreVersion!==reference.attempt.coreVersion ||
          attempt.expansionSummary?.normalCount!==reference.attempt.normalCount || attempt.tickets.length!==reference.attempt.finalCount ||
          (attempt.expansionSummary?.strongEscapeTrim?.eligible===true?attempt.expansionSummary.strongEscapeTrim.maximumAlternateHeadCount:null)!==reference.attempt.strongEscapeLimit) {
        untraced(reference,index,'reference-candidate-attempt-mismatch');continue;
      }
      // An instrumentation mismatch invalidates the entire diagnostic, including
      // rows already processed. Do not turn a broken observer into a no-op reason.
      const observedCurrent=run.observedCurrent(row,options),observedCandidate=run.observedCandidate(row,options);
      if(!isDeepStrictEqual(current,stripTrace(observedCurrent))) throw Error('Trace parity failed for baseline '+reference.key);
      if(!isDeepStrictEqual(attempt,stripTrace(observedCandidate))) throw Error('Trace parity failed for candidate '+reference.key);
      const baselineTrace=observedCurrent.expansionSummary?.[TRACE_FIELD],candidateTrace=observedCandidate.expansionSummary?.[TRACE_FIELD];
      validateTrace(baselineTrace,'current');validateTrace(candidateTrace,'candidate');
      const guard=candidate.guardCandidate(current,attempt);
      if(guard.changed!==reference.changed || guard.reason!==reference.changeReason || !isDeepStrictEqual(compact(guard.candidate),reference.candidate))
        throw Error('Fixed candidate guard differs from reference '+reference.key);
      const classification=traceClassification(baselineTrace,candidateTrace,guard);count(classifications,classification);
      rows.push({index,key:reference.key,source:reference.source,sourcePointer:clone(reference.sourcePointer),status:'traced',
        fileEvidence:resolved.fileEvidence,baselineParity:true,candidateParity:true,classification,
        fixedGuard:{changed:guard.changed,reason:guard.reason},baseline:baselineTrace,candidate:candidateTrace});
    }
    files.push({path:file,referenceRows:group.length,...(loadedFile?{actualSha256:loadedFile.sha256}:{})});
  }
  rows.sort((left,right)=>left.index-right.index);rows.forEach(row=>delete row.index);
  return {version:'independent-head-coverage-trace-v1',generatedAt,sourceCommit,
    productionChanged:false,automaticProductionChange:false,usableForPrediction:false,resultUsedForSelection:false,
    reference:{version:referenceReport.version,generatedAt:referenceReport.generatedAt,sourceCommit:referenceReport.sourceCommit,
      candidateId:candidate.CANDIDATE_ID,candidateFingerprint:sources.fingerprint,targetRows:referenceReport.rows.length},
    observer:{scriptSha256:hash(fs.readFileSync(__filename)),transportField:TRACE_FIELD,fullOutputParityRequired:true,
      predictionSourcesVerified:sources.predictionSourceCount,comparisonSourcesVerified:sources.comparisonSourceCount},
    summary:{referenceRows:referenceReport.rows.length,traced:rows.filter(row=>row.status==='traced').length,
      untraced:rows.filter(row=>row.status==='untraced').length,untracedReasons:reasons,classifications,
      filesChangedWithIdenticalRecord:rows.filter(row=>row.fileEvidence?.warning==='FILE_CHANGED_RECORD_IDENTICAL').length},
    files,rows,limitation:'Source-stage diagnosis of the fixed reference cohort only. No new candidate, performance estimate, outcome join, source substitution or production adoption. Missing or changed records remain untraced in the reference denominator. Entire diagnostic fails if either full replay output changes under observation.'};
}

module.exports={TRACE_FIELD,REFERENCE_FINGERPRINT,STAGES,transformObservedSelection,stripTrace,verifyReferenceSources,resolveReferenceRow,build};
