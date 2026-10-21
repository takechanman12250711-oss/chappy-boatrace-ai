'use strict';
// Unsealed, single-input prototype. No CLI, file data reader, outcome join,
// collection, network, publication or production connection is provided here.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {isDeepStrictEqual} = require('node:util');
const frozen = require('./compare-escape-frozen.cjs');
const candidate = require('./compare-independent-head-coverage.cjs');
const observer = require('./trace-independent-head-coverage.cjs');

const CANDIDATE_ID = 'qualified-unrepresented-head-one-swap-v2-options-forwarded';
const V1_SCRIPT_SHA256 = '27e8905be6185f3d5854a35c0706c2886e4b86642c4501ffc8686e0d4e01f546';
const FLAGS = Object.freeze({productionChanged:false,usableForPrediction:false,automaticApplication:false,
  formalForwardEvidence:false,candidateSavedBeforeDeadline:false,adoptionGate:null});
const EXTRA_SOURCES = ['js/frame-rise-fall-replay-preload.js','js/manshu-forecast-ledger.js',
  'scripts/compare-independent-head-coverage.cjs','scripts/compare-escape-frozen.cjs',
  'scripts/analysis-input-contract.js','scripts/audit-escape-main.cjs','scripts/daily-prediction-source-archive.js',
  'scripts/phase11-improvement-decision-gate.cjs','scripts/frozen-comparison-fairness.cjs',
  'scripts/trace-independent-head-coverage.cjs','scripts/independent-head-forward-v2.cjs'];
const SOURCE_PATHS = Object.freeze([...frozen.MODULES.map(name=>'js/'+name+'.js'),...EXTRA_SOURCES]);
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fail = reason => {throw Error(reason);};
const compact = result => ({head:result.head,tickets:[...result.tickets],mainTickets:[...(result.mainTickets||[])],
  scenarios:clone(result.scenarios),coreVersion:result.coreVersion});
function deepFreeze(value) {
  if(value && typeof value==='object') {Object.values(value).forEach(deepFreeze);Object.freeze(value);}
  return value;
}
function definitionTime(value) {
  const match=typeof value==='string' && value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  if(!match) return NaN;
  const [year,month,day,hour,minute,second]=match.slice(1,7).map(Number);
  const leap=year%4===0&&(year%100!==0||year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  const zone=match[7]==='Z'?[0,0]:match[7].slice(1).split(':').map(Number);
  return month>=1&&month<=12&&day>=1&&day<=days[month-1]&&hour<=23&&minute<=59&&second<=59&&zone[0]<=23&&zone[1]<=59?Date.parse(value):NaN;
}

function freezeSourceManifest(root) {
  const sources=SOURCE_PATHS.map(relative=>({path:relative,sha256:hash(fs.readFileSync(path.join(root,relative)))}));
  if(sources.find(item=>item.path==='scripts/compare-independent-head-coverage.cjs').sha256!==V1_SCRIPT_SHA256)
    fail('ORIGINAL_CANDIDATE_CHANGED');
  candidate.declaredCoreVersion(root);
  return deepFreeze(sources);
}
function protocolIdentity(protocol) {
  return {version:protocol.version,candidateId:protocol.candidateId,definedAt:protocol.definedAt,
    requiredCoreVersion:protocol.requiredCoreVersion,v1CandidateId:protocol.v1CandidateId,
    v1CandidateScriptSha256:protocol.v1CandidateScriptSha256,injectionSha256:protocol.injectionSha256,
    sourceManifest:protocol.sourceManifest};
}
function defineProtocol(root,{definedAt}={}) {
  if(!Number.isFinite(definitionTime(definedAt))) fail('DEFINITION_TIMESTAMP_REQUIRED');
  const protocol={version:'independent-head-forward-v2-prototype-protocol-v1',candidateId:CANDIDATE_ID,definedAt,
    requiredCoreVersion:candidate.REQUIRED_CORE_VERSION,v1CandidateId:candidate.CANDIDATE_ID,
    v1CandidateScriptSha256:V1_SCRIPT_SHA256,injectionSha256:hash(candidate.INJECTION),
    sourceManifest:freezeSourceManifest(root),...FLAGS,callerDefinitionVerified:false};
  protocol.fingerprint=hash(JSON.stringify(protocolIdentity(protocol)));
  return deepFreeze(protocol);
}
function verifyProtocol(root,protocol) {
  if(protocol?.version!=='independent-head-forward-v2-prototype-protocol-v1' || protocol.candidateId!==CANDIDATE_ID ||
      !Number.isFinite(definitionTime(protocol.definedAt)) || protocol.requiredCoreVersion!==candidate.REQUIRED_CORE_VERSION ||
      protocol.v1CandidateId!==candidate.CANDIDATE_ID || protocol.v1CandidateScriptSha256!==V1_SCRIPT_SHA256 ||
      protocol.injectionSha256!==hash(candidate.INJECTION) || Object.entries(FLAGS).some(([key,value])=>protocol[key]!==value) ||
      protocol.callerDefinitionVerified!==false || !Array.isArray(protocol.sourceManifest) ||
      hash(JSON.stringify(protocolIdentity(protocol)))!==protocol.fingerprint) fail('INVALID_PROTOCOL');
  let sources;
  try {sources=freezeSourceManifest(root);}catch {fail('SOURCE_MANIFEST_CHANGED');}
  if(!isDeepStrictEqual(sources,protocol.sourceManifest)) fail('SOURCE_MANIFEST_CHANGED');
}
function validPointer(pointer,source) {
  if(!pointer || !/^[a-f0-9]{64}$/.test(pointer.sha256||'') || !/^[a-f0-9]{64}$/.test(pointer.recordJsonSha256||'')) return false;
  if(source==='all-race-note') return /^data\/note-drafts\/\d{8}\/\d{8}-\d{2}-\d{1,2}-[a-f0-9]{64}\.json$/.test(pointer.path||'') &&
    pointer.recordPath==='record' && pointer.array===undefined && pointer.index===undefined;
  return ['daily-primary','daily-verification'].includes(source) && /^data\/predictions\/\d{8}\.json$/.test(pointer.path||'') &&
    pointer.array===(source==='daily-primary'?'predictions':'verificationPredictions') &&
    Number.isInteger(pointer.index) && pointer.index>=0 && pointer.recordPath===undefined;
}
function validIdentity(identity) {
  return identity && ['codeCommit','workflowHead'].every(key=>/^[a-f0-9]{40}$/.test(identity[key]||'')) &&
    ['runId','runAttempt'].every(key=>/^[1-9]\d*$/.test(String(identity[key]||'')));
}
function defaultRunners(root) {
  const options={freezeClock:true,includeSelectionEvidence:true};
  return {plainCurrent:frozen.runner(root,'current',options),
    plainCandidate:frozen.runner(root,'current',{...options,transformSelection:candidate.transformSelection}),
    observedCurrent:frozen.runner(root,'current',{...options,transformSelection:source=>observer.transformObservedSelection(source,{mode:'current'})}),
    observedCandidate:frozen.runner(root,'current',{...options,transformSelection:source=>observer.transformObservedSelection(source,{mode:'candidate'})})};
}
function validateObservation(result,heads,mode) {
  const trace=result.expansionSummary?.[observer.TRACE_FIELD];
  if(!trace || !isDeepStrictEqual(trace.stages?.map(stage=>stage.name),observer.STAGES)) fail('OBSERVATION_INCOMPLETE');
  if(trace.baselineHeadOptionsState!=='valid' || trace.baselineHeadOptionsValid!==true || !isDeepStrictEqual(trace.baselineHeadOptions,heads))
    fail('CANDIDATE_OPTIONS_NOT_RECEIVED');
  if(mode==='candidate') {
    if(trace.injectionEntered!==true) fail('CANDIDATE_INJECTION_NOT_ENTERED');
    if(!Number.isInteger(trace.actualFirstNewHead) || trace.actualFirstNewHead < -1 || trace.actualFirstNewHead!==trace.observedFirstNewHead)
      fail('CANDIDATE_PREDICATE_MISMATCH');
  }
  return trace;
}

async function generate(root,{protocol,savedRecord,sourcePointer,source,identity,run,now=Date.now}={}) {
  // Every invocation returns one attempt. A caller must retain missing/failed
  // attempts; this prototype offers no cohort filtering or replacement picker.
  let pointerCopy=null,pointerReadable=true;
  try {pointerCopy=sourcePointer?clone(sourcePointer):null;}catch {pointerReadable=false;}
  const context={version:'independent-head-forward-v2-prototype-attempt-v1',candidateId:CANDIDATE_ID,
    protocolFingerprint:protocol?.fingerprint||null,sourcePointer:pointerCopy,
    ...FLAGS,artifact:{status:'unsealed'},snapshot:null};
  const rejected=(status,reason)=>({...context,status,reason});
  try {verifyProtocol(root,protocol);}catch(error){return rejected('failed',error.message);}
  if(!validIdentity(identity)) return rejected('failed','INVALID_RUN_IDENTITY');
  if(!pointerReadable || !validPointer(sourcePointer,source)) return rejected('failed','INVALID_SOURCE_POINTER');
  if(!savedRecord || typeof savedRecord!=='object' || Array.isArray(savedRecord)) return rejected('missing','SAVED_RECORD_UNAVAILABLE');
  let recordHash;
  try {recordHash=hash(JSON.stringify(savedRecord));}catch {return rejected('missing','SAVED_RECORD_UNAVAILABLE');}
  if(recordHash!==sourcePointer.recordJsonSha256) return rejected('failed','RECORD_HASH_MISMATCH');
  context.recordJsonSha256=recordHash;
  let snap;
  try {snap=frozen.snapshot(savedRecord,source,{requiredCoreVersion:protocol.requiredCoreVersion});}
  catch {return rejected('missing','SNAPSHOT_INVALID_RECORD');}
  if(snap.reason) return rejected('missing','SNAPSHOT_'+snap.reason);
  const row=snap.row;
  row.sourcePointer=clone(sourcePointer);
  const inputSha256=hash(JSON.stringify(row.conditions));
  if(sourcePointer.path!==(source==='all-race-note'?`data/note-drafts/${row.key.slice(0,8)}/${row.key}-${sourcePointer.sha256}.json`:`data/predictions/${row.key.slice(0,8)}.json`))
    return rejected('failed','SOURCE_POINTER_IDENTITY_MISMATCH');
  const selected=Date.parse(row.selectedAt),deadline=Date.parse(row.deadlineAt),defined=Date.parse(protocol.definedAt);
  if(selected<defined) return rejected('missing','CAPTURE_BEFORE_DEFINITION');
  let started;
  try {started=now();}catch {return rejected('missing','INVALID_GENERATION_CLOCK');}
  if(!Number.isFinite(started) || started<selected || started<defined) return rejected('missing','INVALID_GENERATION_CLOCK');
  if(started>=deadline) return rejected('missing','GENERATION_STARTED_AFTER_DEADLINE');
  context.raceKey=row.key;
  context.selectedAt=row.selectedAt;
  context.deadlineAt=row.deadlineAt;
  const injected=Boolean(run);
  try {run ||= defaultRunners(root);}catch {return rejected('failed','RUNNER_INITIALIZATION_FAILED');}
  if(!['plainCurrent','plainCandidate','observedCurrent','observedCandidate'].every(key=>typeof run[key]==='function'))
    return rejected('failed','INVALID_RUNNER_INTERFACE');
  let current,attempt,observedCurrent,observedCandidate;
  try {current=await run.plainCurrent(clone(row));}catch {return rejected('missing','BASELINE_REPLAY_ERROR');}
  let replayReason;
  try {replayReason=frozen.checkReplay(row,current);}catch {return rejected('missing','BASELINE_REPLAY_ERROR');}
  if(current.coreVersion!==protocol.requiredCoreVersion) return rejected('missing','BASELINE_CORE_VERSION_MISMATCH');
  if(replayReason) return rejected('missing','BASELINE_REPLAY_'+replayReason);
  if(Number(current.head)!==Number(row.savedHead) || !isDeepStrictEqual(current.tickets,row.savedTickets) || !isDeepStrictEqual(current.scenarios,row.savedScenarios))
    return rejected('missing','BASELINE_ORDERED_REPLAY_MISMATCH');
  const options={researchBaselineHeads:candidate.heads(current.tickets)};
  // Separate clones ensure one runner cannot change another runner's input.
  try {attempt=await run.plainCandidate(clone(row),clone(options));}catch {return rejected('missing','CANDIDATE_REPLAY_ERROR');}
  try {observedCurrent=await run.observedCurrent(clone(row),clone(options));observedCandidate=await run.observedCandidate(clone(row),clone(options));}
  catch {return rejected('failed','OBSERVER_EXECUTION_ERROR');}
  let baselineTrace,candidateTrace,guard;
  try {
    if(!isDeepStrictEqual(current,observer.stripTrace(observedCurrent))) fail('BASELINE_PARITY_MISMATCH');
    if(!isDeepStrictEqual(attempt,observer.stripTrace(observedCandidate))) fail('CANDIDATE_PARITY_MISMATCH');
    baselineTrace=validateObservation(observedCurrent,options.researchBaselineHeads,'current');
    candidateTrace=validateObservation(observedCandidate,options.researchBaselineHeads,'candidate');
    guard=candidate.guardCandidate(current,attempt);
    if(guard.candidate.tickets.length!==current.tickets.length || (!guard.changed && !isDeepStrictEqual(guard.candidate,current)))
      fail('FIXED_GUARD_INVARIANT_FAILED');
  }catch(error){return rejected('failed',error.message);}
  try {verifyProtocol(root,protocol);}catch(error){return rejected('failed',error.message);}
  let finished;
  try {finished=now();}catch {return rejected('missing','INVALID_GENERATION_CLOCK');}
  if(!Number.isFinite(finished) || finished<started) return rejected('missing','INVALID_GENERATION_CLOCK');
  if(finished>=deadline) return rejected('missing','GENERATION_FINISHED_AFTER_DEADLINE');
  const snapshot={version:'independent-head-forward-v2-prototype-snapshot-v1',candidateId:CANDIDATE_ID,
    protocolFingerprint:protocol.fingerprint,protocol:clone(protocol),...FLAGS,
    source:{kind:source,sourcePointer:clone(sourcePointer),recordJsonSha256:recordHash,inputSha256,recordHashVerified:true,
      fileHashVerified:false,fileHashEvidence:'caller-declared; source file bytes not read'},
    raceKey:row.key,baseline:compact(current),candidate:compact(guard.candidate),
    attempt:{tickets:[...attempt.tickets],coreVersion:attempt.coreVersion,normalCount:attempt.expansionSummary?.normalCount??null,
      finalCount:attempt.tickets.length,strongEscapeLimit:attempt.expansionSummary?.strongEscapeTrim?.eligible===true?
        attempt.expansionSummary.strongEscapeTrim.maximumAlternateHeadCount:null},
    guard:{changed:guard.changed,reason:guard.reason,...(guard.swap?{swap:clone(guard.swap)}:{})},
    observations:{baselineFullParity:true,candidateFullParity:true,baselineOptionsState:baselineTrace.baselineHeadOptionsState,
      candidateOptionsState:candidateTrace.baselineHeadOptionsState,candidateInjectionEntered:true,
      actualFirstNewHead:candidateTrace.actualFirstNewHead,requestedBaselineHeads:[...options.researchBaselineHeads]},
    clocks:{definedAt:protocol.definedAt,selectedAt:row.selectedAt,deadlineAt:row.deadlineAt,
      generationStartedAt:new Date(started).toISOString(),generationCompletedAt:new Date(finished).toISOString(),callerClockVerified:false},
    identity:Object.fromEntries(['codeCommit','workflowHead','runId','runAttempt'].map(key=>[key,identity[key]])),
    identityVerified:false,runnerMode:injected?'injected-test':'isolated-frozen-vm',
    artifact:{status:'unsealed'},limitation:'Unsealed prototype only. Caller-supplied definition, identity and clock are not remote registration evidence. Source file bytes and artifact/server timestamps are not verified. No live collection, v2 forward evidence, formal gate, results, scoring or production adoption is implemented.'};
  return {...context,status:'generated',reason:guard.reason,snapshot};
}

module.exports={CANDIDATE_ID,SOURCE_PATHS,freezeSourceManifest,defineProtocol,generate};
