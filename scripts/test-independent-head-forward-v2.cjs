'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const frozen=require('./compare-escape-frozen.cjs');
const candidate=require('./compare-independent-head-coverage.cjs');
const trace=require('./trace-independent-head-coverage.cjs');
const forward=require('./independent-head-forward-v2.cjs');
const ROOT=path.resolve(__dirname,'..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
const IDENTITY={codeCommit:'a'.repeat(40),workflowHead:'b'.repeat(40),runId:'123',runAttempt:'1'};
const DEFINED_AT='2030-10-20T00:00:00.000Z';
const SELECTED_AT='2030-10-20T00:01:00.000Z';
const DEADLINE_AT='2030-10-20T00:20:00.000Z';
const NOW=Date.parse('2030-10-20T00:02:00.000Z');
const code=fs.readFileSync(path.join(ROOT,'js/practical-selection.js'),'utf8');
const fixtureSource=fs.readFileSync(path.join(__dirname,'test-practical-selection.js'),'utf8');
const first=fixtureSource.indexOf('const MAIN = ['),last=fixtureSource.indexOf('const standard =');
assert(first>=0&&last>first);
function setup({noTarget=false}={}) {
  return `${fixtureSource.slice(first,last)}
    const branches=[
      holdBranch({id:'hold:a',ticket:'1-4-2',partnerBoatNo:2,priorityScore:86}),
      holdBranch({id:'hold:b',ticket:'1-4-5',partnerBoatNo:5,priorityScore:85}),
      holdBranch({id:'hold:c',ticket:'1-4-6',partnerBoatNo:6,priorityScore:84}),
      alternateHeadBranch({id:'alt:new',ticket:'${noTarget?'5-2-3':'4-2-3'}',priorityScore:${noTarget?79:80}})];
    const prediction=createFixture({flow:true,independent:branches});
    prediction.aiCore.courseMapping={formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}};
    globalThis.fixture=prediction;`;
}
function select(source,options,fixtureSetup) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(source,context);
  for(const name of ['three-course-escape-rescue-fixed5','four-kado-escape-rescue-fixed5'])
    vm.runInContext(fs.readFileSync(path.join(ROOT,'js',name+'.js'),'utf8'),context);
  vm.runInContext(fixtureSetup,context);context.options=clone(options);
  return JSON.parse(vm.runInContext('JSON.stringify(ChappyPracticalSelection.select(fixture,options))',context));
}
function describe(selection) {
  return {head:1,coreVersion:candidate.REQUIRED_CORE_VERSION,tickets:selection.tickets.map(row=>row.ticket),
    mainTickets:selection.tickets.filter(row=>row.category==='本線'||row.displayCategory==='本命').map(row=>row.ticket),
    scenarios:[],insideSkill:null,selectionRows:selection.tickets,candidateDecisions:selection.candidateDecisions,
    expansionSummary:selection.expansionSummary,selectionBranches:selection.evidence.branches.map(branch=>({id:branch.id,
      ticket:branch.ticket,kind:branch.kind,source:branch.source,attackerBoatNo:branch.attackerBoatNo,phaseKind:branch.phaseEvidence?.kind})),
    courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}}};
}
const cached=new Map();
function resultsFor({noTarget=false}={}) {
  const cacheKey=String(noTarget);
  if(!cached.has(cacheKey)) {
    const fixtureSetup=setup({noTarget}),plainCurrent=describe(select(code,{},fixtureSetup));
    const options={researchBaselineHeads:candidate.heads(plainCurrent.tickets)};
    cached.set(cacheKey,{plainCurrent,
      plainCandidate:describe(select(candidate.transformSelection(code),options,fixtureSetup)),
      observedCurrent:describe(select(trace.transformObservedSelection(code,{mode:'current'}),options,fixtureSetup)),
      observedCandidate:describe(select(trace.transformObservedSelection(code,{mode:'candidate'}),options,fixtureSetup))});
  }
  return clone(cached.get(cacheKey));
}
function fixture(config={}) {
  const results=resultsFor(config),sourceFetchedAt='2030-10-20T00:00:30.000Z';
  const savedRecord={raceKey:'20301020-01-1',date:'20301020',jcd:'01',raceNo:1,selectedAt:SELECTED_AT,deadlineAt:DEADLINE_AT,
    prediction:{practicalTickets:[...results.plainCurrent.tickets],
      verificationEvidence:{sourceCommit:'c'.repeat(40),marks:{honmei:{boatNo:results.plainCurrent.head}}},
      preRaceConditions:{sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt,
        dataAvailability:{officialCourses:6,exhibitionST:6,exhibitionTime:6},
        escapeEvaluationEvidence:{version:'escape-evaluation-evidence-v1',historyStatus:'captured',resultUsedForGeneration:false,
          aiCoreVersion:candidate.REQUIRED_CORE_VERSION,sourceFetchedAt,entries:Array.from({length:6},()=>({})),
          beforeInfo:Array.from({length:6},()=>({})),startExhibition:Array.from({length:6},()=>({})),raceScenarios:{scenarios:[]}}}}};
  const sourcePointer={path:'data/predictions/20301020.json',sha256:'d'.repeat(64),array:'predictions',index:0,recordJsonSha256:hash(JSON.stringify(savedRecord))};
  const seen=[];
  const run=Object.fromEntries(Object.entries(results).map(([mode,result])=>[mode,(row,options)=>{
    seen.push({mode,row:clone(row),options:clone(options||{})});return clone(result);
  }]));
  return {savedRecord,sourcePointer,results,seen,run,source:'daily-primary',identity:clone(IDENTITY),
    protocol:forward.defineProtocol(ROOT,{definedAt:DEFINED_AT}),now:()=>NOW};
}
const ticketsOf=value=>Array.isArray(value)?value:value?.tickets;
function assertRejected(result,reason) {
  assert.notEqual(result.status,'generated');assert.equal(result.snapshot,null);
  assert.match(result.reason,reason);
}

test('protocol requires a caller definition time and freezes a distinct v2 source fingerprint',()=>{
  assert.match(forward.CANDIDATE_ID,/v2-options-forwarded$/);
  assert.throws(()=>forward.defineProtocol(ROOT,{}),/defined|time|protocol/i);
  assert.throws(()=>forward.defineProtocol(ROOT,{definedAt:'not-a-time'}),/defined|time|protocol/i);
  const a=forward.defineProtocol(ROOT,{definedAt:DEFINED_AT}),b=forward.defineProtocol(ROOT,{definedAt:'2030-10-20T00:00:01.000Z'});
  assert.match(a.fingerprint,/^[a-f0-9]{64}$/);assert.notEqual(a.fingerprint,b.fingerprint);
  assert.notEqual(a.fingerprint,trace.REFERENCE_FINGERPRINT);
  const manifest=JSON.stringify(forward.freezeSourceManifest(ROOT));
  for(const source of ['js/ai-core.js','js/practical-selection.js','js/frame-rise-fall-replay-preload.js',
    'scripts/compare-independent-head-coverage.cjs','scripts/trace-independent-head-coverage.cjs','scripts/independent-head-forward-v2.cjs'])
    assert(manifest.includes(source),source);
});

test('one frozen input reproduces A and generates a guarded equal-budget B without reading saved source files or outcomes',async()=>{
  const input=fixture(),before=JSON.stringify({record:input.savedRecord,pointer:input.sourcePointer});
  const readFile=fs.readFileSync,fetcher=globalThis.fetch,loader=frozen.loadFrozenInputs;
  const reads=[];let result;
  try {
    fs.readFileSync=function(file,...args) {
      const name=String(file);reads.push(name);
      assert(!name.startsWith(path.join(ROOT,'data')+path.sep),'no historical/source/result file reader');
      return readFile.call(this,file,...args);
    };
    globalThis.fetch=()=>{throw Error('network access is forbidden in the prototype fixture');};
    frozen.loadFrozenInputs=()=>{throw Error('historical/cohort loader must not run');};
    result=await forward.generate(ROOT,input);
  } finally {fs.readFileSync=readFile;globalThis.fetch=fetcher;frozen.loadFrozenInputs=loader;}
  assert.equal(result.status,'generated');
  assert(reads.length>0);assert(reads.every(name=>name.includes(path.sep+'js'+path.sep)||name.includes(path.sep+'scripts'+path.sep)));
  const snapshot=result.snapshot;
  assert.deepEqual(ticketsOf(snapshot.baseline),input.results.plainCurrent.tickets);
  assert.deepEqual(ticketsOf(snapshot.candidate),input.results.plainCandidate.tickets);
  assert.equal(ticketsOf(snapshot.baseline).length,ticketsOf(snapshot.candidate).length);
  assert.equal(snapshot.guard.changed,true);assert.equal(snapshot.guard.reason,'ONE_QUALIFIED_NEW_HEAD_SWAP');
  assert.equal(snapshot.usableForPrediction,false);assert.equal(snapshot.automaticApplication,false);
  assert.equal(snapshot.formalForwardEvidence,false);assert.deepEqual(snapshot.artifact,{status:'unsealed'});
  assert.equal(snapshot.clocks.callerClockVerified,false);
  assert.deepEqual(snapshot.source.sourcePointer,input.sourcePointer);
  assert.equal(snapshot.source.recordHashVerified,true);assert.equal(snapshot.source.fileHashVerified,false);
  assert.equal(JSON.stringify({record:input.savedRecord,pointer:input.sourcePointer}),before);
  assert.equal(input.seen.length,4);
  for(const call of input.seen) {
    assert(!Object.hasOwn(call.row,'result'));assert(!Object.hasOwn(call.row,'actual'));assert(!Object.hasOwn(call.row,'payout'));
    if(call.mode!=='plainCurrent')assert.deepEqual(call.options.researchBaselineHeads,[1,2]);
  }
  // The declared source does not exist: only the supplied record hash can be
  // verified here. A local generation is not an artifact receipt.
  assert.equal(fs.existsSync(path.join(ROOT,input.sourcePointer.path)),false);
  const encoded=JSON.stringify(snapshot);
  assert(encoded.includes(input.sourcePointer.recordJsonSha256));
  assert(!/"fileHashVerified":true/.test(encoded));
  assert(/unsealed|unverified|prototype/i.test(encoded));
});

test('the default four isolated VMs reproduce and observe one complete synthetic six-boat frozen input',async()=>{
  const input=fixture();delete input.run;
  const conditions=input.savedRecord.prediction.preRaceConditions,evidence=conditions.escapeEvaluationEvidence;
  conditions.schemaVersion=4;conditions.source='boatrace-official';conditions.newEngineMode=false;
  conditions.weather={windSpeed:2,waveHeight:2,windDirection:'向かい風'};
  evidence.entries=Array.from({length:6},(_,index)=>({boat:index+1,registerNo:String(5000+index),racerName:'synthetic-'+(index+1),
    className:index===0?'A1':'B1',avgSt:index===0?0.12:0.18+index*0.01,nationalWinRate:index===0?7.5:4.8-index*0.1,
    national2Rate:index===0?55:30,national3Rate:index===0?70:45,localWinRate:index===0?7:4.7,localStarts:30,
    motor2Rate:index===0?45:33,motor3Rate:50,boat2Rate:35,currentRace:{stList:[index===0?0.05:0.13+index*0.02]},
    exhibition:{displayTime:6.72+index*0.03}}));
  evidence.beforeInfo=evidence.entries.map(entry=>({boat:entry.boat,exhibition:{displayTime:entry.exhibition.displayTime}}));
  evidence.startExhibition=evidence.entries.map((entry,index)=>({boat:entry.boat,course:entry.boat,
    st:index===0?0.05:0.13+index*0.02,isOfficialCourse:true,mappingSource:'official-start-image'}));
  evidence.historyContext={racers:[]};evidence.raceInfo={deadline:'09:20'};evidence.datasetVersion='synthetic-v1';
  const seed=frozen.snapshot(input.savedRecord,input.source,{requiredCoreVersion:candidate.REQUIRED_CORE_VERSION});
  assert(seed.row);
  const generatedA=frozen.runner(ROOT,'current',{freezeClock:true,includeSelectionEvidence:true})(seed.row);
  assert(generatedA.tickets.length>=5&&generatedA.tickets.length<=10);
  input.savedRecord.prediction.practicalTickets=[...generatedA.tickets];
  input.savedRecord.prediction.verificationEvidence.marks.honmei.boatNo=generatedA.head;
  evidence.raceScenarios={scenarios:clone(generatedA.scenarios)};
  input.sourcePointer.recordJsonSha256=hash(JSON.stringify(input.savedRecord));
  const readFile=fs.readFileSync,fetcher=globalThis.fetch,loader=frozen.loadFrozenInputs;
  let result;
  try {
    fs.readFileSync=function(file,...args) {
      assert(!String(file).startsWith(path.join(ROOT,'data')+path.sep),'no real data read for the synthetic default path');
      return readFile.call(this,file,...args);
    };
    globalThis.fetch=()=>{throw Error('default synthetic fixture must not fetch');};
    frozen.loadFrozenInputs=()=>{throw Error('default synthetic fixture must not load a historical cohort');};
    result=await forward.generate(ROOT,input);
  } finally {fs.readFileSync=readFile;globalThis.fetch=fetcher;frozen.loadFrozenInputs=loader;}
  assert.equal(result.status,'generated',result.reason);
  assert.equal(result.snapshot.runnerMode,'isolated-frozen-vm');
  assert.deepEqual(result.snapshot.baseline.tickets,generatedA.tickets);
  assert.deepEqual(result.snapshot.baseline.scenarios,generatedA.scenarios);
  assert.equal(result.snapshot.baseline.head,generatedA.head);
  assert.equal(result.snapshot.baseline.tickets.length,result.snapshot.candidate.tickets.length);
  assert.equal(result.snapshot.observations.baselineFullParity,true);
  assert.equal(result.snapshot.observations.candidateFullParity,true);
  assert.equal(result.snapshot.observations.candidateOptionsState,'valid');
  assert.equal(result.snapshot.observations.candidateInjectionEntered,true);
  assert.equal(result.snapshot.formalForwardEvidence,false);assert.equal(result.snapshot.artifact.status,'unsealed');
});

test('missing input, source pointers and identity cannot produce an anonymous replacement capture',async()=>{
  const input=fixture();
  for(const change of [value=>{delete value.savedRecord;},value=>{delete value.sourcePointer;},value=>{delete value.identity;},
    value=>{value.sourcePointer.path='../outside.json';},value=>{value.identity.runId='not-a-run';}]) {
    const value={...input,savedRecord:clone(input.savedRecord),sourcePointer:clone(input.sourcePointer),identity:clone(input.identity)};
    change(value);const result=await forward.generate(ROOT,value);
    assert.notEqual(result.status,'generated');assert.equal(result.snapshot,null);assert.equal(typeof result.reason,'string');
  }
  const changedProtocol={...input.protocol,definedAt:'2030-10-20T00:00:00.001Z'};
  assertRejected(await forward.generate(ROOT,{...input,protocol:changedProtocol}),/protocol|fingerprint/i);
});

test('null, array and malformed records and contradictory daily/note pointers remain rejected attempts',async()=>{
  for(const savedRecord of [null,[],{prediction:null}]) {
    const input=fixture();input.savedRecord=savedRecord;input.sourcePointer.recordJsonSha256=hash(JSON.stringify(savedRecord));
    assertRejected(await forward.generate(ROOT,input),/record|snapshot|frozen/i);
    assert.equal(input.seen.length,0);
  }
  const daily=fixture();daily.sourcePointer.path='data/predictions/20301019.json';
  assertRejected(await forward.generate(ROOT,daily),/pointer|identity/i);assert.equal(daily.seen.length,0);
  const note=fixture();note.source='all-race-note';
  note.sourcePointer={path:'data/note-drafts/20301020/20301020-01-1-'+ 'd'.repeat(64)+'.json',
    sha256:'d'.repeat(64),recordPath:'record',recordJsonSha256:note.sourcePointer.recordJsonSha256};
  const valid=await forward.generate(ROOT,note);assert.equal(valid.status,'generated');
  assert.equal(valid.snapshot.source.fileHashVerified,false);
  for(const sourcePath of ['data/note-drafts/20301019/20301020-01-1-'+ 'd'.repeat(64)+'.json',
    'data/note-drafts/20301020/20301020-01-2-'+ 'd'.repeat(64)+'.json',
    'data/note-drafts/20301020/20301020-01-1-'+ 'e'.repeat(64)+'.json']) {
    assertRejected(await forward.generate(ROOT,{...note,sourcePointer:{...note.sourcePointer,path:sourcePath}}),/pointer|identity/i);
  }
});

test('a valid executed injection with no target is distinct from options that never reached the selector',async()=>{
  const noTarget=fixture({noTarget:true}),generated=await forward.generate(ROOT,noTarget);
  assert.equal(generated.status,'generated');assert.equal(generated.snapshot.guard.changed,false);
  assert.equal(generated.snapshot.guard.reason,'NO_FINAL_TICKET_CHANGE');
  assert.deepEqual(ticketsOf(generated.snapshot.candidate),ticketsOf(generated.snapshot.baseline));
  const missing=fixture();
  const observed=clone(missing.results.observedCandidate.expansionSummary[trace.TRACE_FIELD]);
  Object.assign(observed,{baselineHeadOptionsState:'missing',baselineHeadOptionsValid:false,baselineHeadOptions:null,
    injectionEntered:false,actualFirstNewHead:null,observedFirstNewHead:-1});
  missing.run.observedCandidate=()=>({...clone(missing.results.plainCandidate),expansionSummary:{...clone(missing.results.plainCandidate.expansionSummary),[trace.TRACE_FIELD]:observed}});
  assertRejected(await forward.generate(ROOT,missing),/option|injection|reach/i);
});

test('record hash, frozen-input availability and definition boundary reject this input instead of substituting another race',async()=>{
  const changed=fixture();changed.savedRecord.extra='changed original record';
  assertRejected(await forward.generate(ROOT,changed),/record.*hash|hash.*record/i);
  const missing=fixture();delete missing.savedRecord.prediction.preRaceConditions.escapeEvaluationEvidence;
  missing.sourcePointer.recordJsonSha256=hash(JSON.stringify(missing.savedRecord));
  assertRejected(await forward.generate(ROOT,missing),/frozen|snapshot|history/i);
  const older=fixture();older.protocol=forward.defineProtocol(ROOT,{definedAt:'2030-10-20T00:01:00.001Z'});
  assertRejected(await forward.generate(ROOT,older),/defin|period/i);
  const boundary=fixture();boundary.protocol=forward.defineProtocol(ROOT,{definedAt:SELECTED_AT});
  assert.equal((await forward.generate(ROOT,boundary)).status,'generated');
});

test('generation must finish before deadline and clocks cannot move backward',async()=>{
  const startsLate=fixture();startsLate.now=()=>Date.parse(DEADLINE_AT);
  assertRejected(await forward.generate(ROOT,startsLate),/deadline|late|clock/i);
  const endsLate=fixture();let ticks=0;endsLate.now=()=>ticks++===0?NOW:Date.parse(DEADLINE_AT);
  assertRejected(await forward.generate(ROOT,endsLate),/deadline|late|clock/i);
  const backward=fixture();let calls=0;backward.now=()=>calls++===0?NOW:NOW-1;
  assertRejected(await forward.generate(ROOT,backward),/clock|time/i);
});

test('ordered A reproduction and both complete output parity checks fail closed',async()=>{
  const reordered=fixture();reordered.savedRecord.prediction.practicalTickets.reverse();
  reordered.sourcePointer.recordJsonSha256=hash(JSON.stringify(reordered.savedRecord));
  assertRejected(await forward.generate(ROOT,reordered),/baseline|ordered|reproduc/i);
  for(const mode of ['observedCurrent','observedCandidate']) {
    const input=fixture();input.run[mode]=()=>({...clone(input.results[mode]),insideSkill:{observerChanged:true}});
    assertRejected(await forward.generate(ROOT,input),/parity/i);
  }
});

test('a guard-rejected attempt preserves the complete baseline and an execution failure yields no snapshot',async()=>{
  const input=fixture();
  const attempt=clone(input.results.plainCandidate);attempt.tickets.pop();attempt.selectionRows.pop();
  const observed=clone(input.results.observedCandidate);observed.tickets.pop();observed.selectionRows.pop();
  input.run.plainCandidate=()=>clone(attempt);input.run.observedCandidate=()=>clone(observed);
  const generated=await forward.generate(ROOT,input);
  assert.equal(generated.status,'generated');assert.equal(generated.snapshot.guard.changed,false);
  assert.equal(generated.snapshot.guard.reason,'TICKET_BUDGET_CHANGED');
  assert.deepEqual(ticketsOf(generated.snapshot.candidate),ticketsOf(generated.snapshot.baseline));
  assert.notEqual(ticketsOf(generated.snapshot.attempt).length,ticketsOf(generated.snapshot.baseline).length);
  const failed=fixture();failed.run.plainCandidate=()=>{throw Error('synthetic candidate failure');};
  assertRejected(await forward.generate(ROOT,failed),/candidate|execution|generation|runner/i);
});

test('source manifest changes invalidate the frozen protocol without loading any data directory',async()=>{
  const input=fixture(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-head-v2-code-'));
  const files=[...frozen.MODULES.map(name=>'js/'+name+'.js'),'js/frame-rise-fall-replay-preload.js','js/manshu-forecast-ledger.js',
    ...['compare-escape-frozen.cjs','analysis-input-contract.js','audit-escape-main.cjs','daily-prediction-source-archive.js',
      'phase11-improvement-decision-gate.cjs','frozen-comparison-fairness.cjs','compare-independent-head-coverage.cjs',
      'trace-independent-head-coverage.cjs','independent-head-forward-v2.cjs'].map(name=>'scripts/'+name)];
  try {
    for(const file of new Set(files)){const target=path.join(temp,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(ROOT,file),target);}
    const protocol=forward.defineProtocol(temp,{definedAt:DEFINED_AT});
    fs.appendFileSync(path.join(temp,'js/four-kado-escape-rescue-fixed5.js'),'\n// changed source');
    assertRejected(await forward.generate(temp,{...input,protocol}),/source|manifest|fingerprint/i);
    assert.equal(fs.existsSync(path.join(temp,'data')),false);
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
