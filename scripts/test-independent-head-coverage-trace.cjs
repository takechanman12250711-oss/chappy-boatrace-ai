'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const candidate = require('./compare-independent-head-coverage.cjs');
const trace = require('./trace-independent-head-coverage.cjs');
const ROOT=path.resolve(__dirname,'..');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
// These bytes belong to the frozen v1 trial, not the current production API.
// Undo only the later options forwarder and require the complete original hash.
const FROZEN_WRAPPERS = {
  'js/three-course-escape-rescue-fixed5.js':'bc0f0934c5661b618bcb27911afaf6fea49b4b18c73dbbec649cd908a5cdf284',
  'js/four-kado-escape-rescue-fixed5.js':'a92e4f3b5b407654cbf3e56e1d0d09561a9c1d59b30896e70d5d4fd7a66a0374'
};
const ORIGINAL_FORWARDER='      select(prediction){\n        return apply(prediction,originalSelect(prediction));';
const OPTIONS_FORWARDER='      select(prediction, options){\n        return apply(prediction,originalSelect(prediction, options));';
function frozenWrapperBytes(file,bytes) {
  const expected=FROZEN_WRAPPERS[file];
  if(hash(bytes)===expected) return bytes;
  const source=bytes.toString('utf8');
  if(source.split(OPTIONS_FORWARDER).length!==2) throw Error('Frozen v1 wrapper snapshot changed: '+file);
  const original=Buffer.from(source.replace(OPTIONS_FORWARDER,ORIGINAL_FORWARDER));
  if(hash(original)!==expected) throw Error('Frozen v1 wrapper snapshot changed: '+file);
  return original;
}
function frozenSourceBytes(file) {
  const bytes=fs.readFileSync(path.join(ROOT,file));
  return Object.hasOwn(FROZEN_WRAPPERS,file)?frozenWrapperBytes(file,bytes):bytes;
}
const source=fs.readFileSync(path.join(ROOT,'js/practical-selection.js'),'utf8');
const fixtureSource=fs.readFileSync(path.join(__dirname,'test-practical-selection.js'),'utf8');
const first=fixtureSource.indexOf('const MAIN = ['),last=fixtureSource.indexOf('const standard =');
assert(first>=0&&last>first);
const builders=fixtureSource.slice(first,last);

function fixtureSetup({altScore=80,altTicket='4-2-3',strongScore=0,rankReplacement=false,rescueLabel=''}={}) {
  return `${builders}
    const branches=[
      holdBranch({id:'hold:a',ticket:'1-4-2',partnerBoatNo:2,priorityScore:86}),
      holdBranch({id:'hold:b',ticket:'1-4-5',partnerBoatNo:5,priorityScore:85}),
      holdBranch({id:'hold:c',ticket:'1-4-6',partnerBoatNo:6,priorityScore:84}),
      alternateHeadBranch({id:'alt:four',ticket:${JSON.stringify(altTicket)},priorityScore:${altScore}})];
    ${rankReplacement?`const hole=canonicalBranch({id:'formation:hole:1-5-6:evaluation:ana:6:3',ticket:'1-5-6',group:'hole',roleBoatNo:6,position:3,role:'pickup',priorityScore:92}); branches.push(hole);`:''}
    const prediction=createFixture({flow:true,independent:branches});
    ${rescueLabel?`prediction.raceFlow.title=${JSON.stringify(rescueLabel)};`:''}
    prediction.aiCore.courseMapping={formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}};
    ${rankReplacement?`prediction.aiCore.formations.evidence.branches.filter(b=>b.id.startsWith('cover:')).forEach(b=>b.priorityScore=90);`:''}
    ${strongScore?`const escape={type:'escape',score:${strongScore}};prediction.aiCore.raceScenarios={mainScenario:escape,scenarios:[escape,{type:'sashi',score:60}]};`:''}
    globalThis.fixture=prediction;`;
}
function select(inputSource,setup,options={}, {wrappers=false}={}) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(inputSource,context);
  if(wrappers) for(const name of ['three-course-escape-rescue-fixed5','four-kado-escape-rescue-fixed5'])
    vm.runInContext(frozenSourceBytes('js/'+name+'.js').toString('utf8'),context);
  vm.runInContext(setup,context);context.options=clone(options);
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
function runFixture({wrappers=false,...config}={}) {
  const setup=fixtureSetup(config),plainCurrent=describe(select(source,setup,{}, {wrappers}));
  const options={researchBaselineHeads:candidate.heads(plainCurrent.tickets)};
  const plainCandidate=describe(select(candidate.transformSelection(source),setup,options,{wrappers}));
  const observedCurrent=describe(select(trace.transformObservedSelection(source,{mode:'current'}),setup,options,{wrappers}));
  const observedCandidate=describe(select(trace.transformObservedSelection(source,{mode:'candidate'}),setup,options,{wrappers}));
  return {plainCurrent,plainCandidate,observedCurrent,observedCandidate};
}
const traceOf=value=>value.expansionSummary[trace.TRACE_FIELD];
const compact=result=>({head:result.head,tickets:result.tickets,mainTickets:result.mainTickets,scenarios:result.scenarios,coreVersion:result.coreVersion});

test('observer refuses missing, repeated or previously instrumented source markers',()=>{
  for(const mode of ['current','candidate']) {
    assert.throws(()=>trace.transformObservedSelection('no marker',{mode}),/source contract changed/);
    assert.throws(()=>trace.transformObservedSelection(source.replace(candidate.MARKER,candidate.MARKER+candidate.MARKER),{mode}),/source contract changed/);
    assert.throws(()=>trace.transformObservedSelection(source.replace('    const strongEscapeTrim =\n','    const strongEscapeTrim_CHANGED =\n'),{mode}),/source contract changed/);
    const observed=trace.transformObservedSelection(source,{mode});
    assert.throws(()=>trace.transformObservedSelection(observed,{mode}),/already instrumented/);
  }
  assert.throws(()=>trace.transformObservedSelection(source,{mode:'new-candidate'}),/Unknown/);
});

test('both real selector modes preserve full output and observe the actual moved target',()=>{
  const result=runFixture(),current=traceOf(result.observedCurrent),attempt=traceOf(result.observedCandidate);
  assert.deepEqual(trace.stripTrace(result.observedCurrent),result.plainCurrent);
  assert.deepEqual(trace.stripTrace(result.observedCandidate),result.plainCandidate);
  assert.deepEqual(attempt.stages.map(stage=>stage.name),trace.STAGES);
  assert.equal(attempt.observedFirstNewHead,3);assert.equal(attempt.actualFirstNewHead,3);
  assert.equal(attempt.target.ticket,'4-2-3');assert.equal(attempt.sortedPoolAfter[0],'4-2-3');
  assert.equal(current.stages.at(-1).targetSelected,false);assert.equal(attempt.stages.at(-1).targetSelected,true);
  assert.equal(candidate.guardCandidate(result.plainCurrent,result.plainCandidate).changed,true);
  // Stored observations contain primitive copies, not references into mutable rows.
  const before=clone(attempt);result.observedCandidate.selectionRows.at(-1).priorityScore=-99;
  assert.deepEqual(attempt,before);
});

test('no qualified target, already-first target and later strong trim remain distinguishable',()=>{
  const none=runFixture({altTicket:'5-2-3',altScore:79});
  const noneTrace=traceOf(none.observedCandidate);
  assert.equal(noneTrace.target,null);assert.equal(noneTrace.actualFirstNewHead,-1);
  assert.equal(noneTrace.pool.exclusions.WEAK_OUTER_HEAD_INDEPENDENT,1);
  assert.deepEqual(trace.stripTrace(none.observedCandidate),none.plainCandidate);
  const trimmed=runFixture({altScore:90,strongScore:80}),observed=traceOf(trimmed.observedCandidate);
  assert.equal(observed.actualFirstNewHead,0);
  assert.equal(observed.stages.find(stage=>stage.name==='after-expansion').targetSelected,true);
  assert.equal(observed.stages.find(stage=>stage.name==='after-strong-trim').targetSelected,false);
  assert(observed.stages.at(-1).targetReasons.includes('STRONG_ESCAPE_ALTERNATE_TRIMMED'));
  assert.deepEqual(trimmed.plainCurrent,trimmed.plainCandidate);
});

test('a target can be qualified, moved, selected then rank-replaced despite unchanged final ticket set',()=>{
  const result=runFixture({rankReplacement:true}),observed=traceOf(result.observedCandidate);
  assert.equal(observed.actualFirstNewHead,3);
  assert.equal(observed.stages.find(stage=>stage.name==='after-expansion').targetSelected,true);
  assert.equal(observed.stages.find(stage=>stage.name==='after-rank-gate').targetSelected,false);
  assert(observed.stages.at(-1).targetReasons.includes('PRIORITY_GATE_REPLACED'));
  assert.deepEqual([...result.plainCurrent.tickets].sort(),[...result.plainCandidate.tickets].sort());
  assert.equal(candidate.guardCandidate(result.plainCurrent,result.plainCandidate).reason,'NO_FINAL_TICKET_CHANGE');
  assert.deepEqual(trace.stripTrace(result.observedCurrent),result.plainCurrent);
  assert.deepEqual(trace.stripTrace(result.observedCandidate),result.plainCandidate);
});

test('missing, empty and invalid inner options are inactive injection states, separate from a valid no-target pool',()=>{
  const setup=fixtureSetup(),observed=trace.transformObservedSelection(source,{mode:'candidate'});
  for(const [options,state] of [[{},'missing'],[{researchBaselineHeads:[]},'empty'],[{researchBaselineHeads:[0]},'invalid'],[{researchBaselineHeads:'1,2'},'invalid']]) {
    const result=describe(select(observed,setup,options)),captured=traceOf(result);
    assert.equal(captured.baselineHeadOptionsState,state);assert.equal(captured.baselineHeadOptionsValid,false);
    assert.equal(captured.injectionEntered,false);assert.equal(captured.actualFirstNewHead,null);assert.equal(captured.observedFirstNewHead,-1);
    assert.deepEqual(trace.stripTrace(result),describe(select(candidate.transformSelection(source),setup,options)));
  }
  const noTarget=traceOf(runFixture({altTicket:'5-2-3',altScore:79}).observedCandidate);
  assert.equal(noTarget.baselineHeadOptionsState,'valid');assert.equal(noTarget.injectionEntered,true);assert.equal(noTarget.actualFirstNewHead,-1);
});

test('the original rescue wrappers discard supplied options, leaving the original candidate inactive with exact parity',async()=>{
  const fixture=makeEnvironment({wrappers:true});
  try {
    assert.deepEqual(fixture.results.plainCandidate,fixture.results.plainCurrent);
    const observed=traceOf(fixture.results.observedCandidate);
    assert.equal(observed.baselineHeadOptionsState,'missing');assert.equal(observed.baselineHeadOptions,null);
    assert.equal(observed.actualFirstNewHead,null);assert.equal(observed.injectionEntered,false);
    assert.deepEqual(trace.stripTrace(fixture.results.observedCurrent),fixture.results.plainCurrent);
    assert.deepEqual(trace.stripTrace(fixture.results.observedCandidate),fixture.results.plainCandidate);
    const guarded=candidate.guardCandidate(fixture.results.plainCurrent,fixture.results.plainCandidate);
    assert.equal(guarded.changed,false);assert.equal(guarded.reason,'NO_FINAL_TICKET_CHANGE');
    const report=await trace.build(fixture.root,{referenceReport:fixture.reference,run:fixture.run});
    assert.equal(report.summary.traced,2);assert.equal(report.summary.candidateInjectionEntered,0);
    assert.equal(report.summary.classifications.CANDIDATE_OPTIONS_NOT_RECEIVED_BY_SELECTOR,2);
    assert.deepEqual(report.summary.candidateSelectorOptions,{missing:2,empty:0,invalid:0,valid:0});
    assert(report.rows.every(row=>row.requestedBaselineHeads.length>0));
    assert(!Object.hasOwn(report.summary.classifications,'NO_QUALIFIED_UNREPRESENTED_HEAD_IN_SORTED_POOL'));
  } finally {fixture.cleanup();}
});

test('public final tickets and compact rescue metadata distinguish the wrapped return from the inner final stage',async()=>{
  const fixture=makeEnvironment({wrappers:true,rescueLabel:'3コース攻め'});
  try {
    const report=await trace.build(fixture.root,{referenceReport:fixture.reference,run:fixture.run});
    for(const row of report.rows) for(const mode of ['baseline','candidate']) {
      const captured=row[mode];
      assert(captured.publicFinalTickets.includes('1-3-4'));
      assert.equal(captured.stages.at(-1).selected.some(ticket=>ticket.ticket==='1-3-4'),false);
      assert.equal(captured.postSelectorRescues.length,1);
      assert.equal(captured.postSelectorRescues[0].id,'threeCourseEscapeRescueFixed5');
      assert.equal(captured.postSelectorRescues[0].ticket,'1-3-4');
      assert.equal(captured.postSelectorRescues[0].applied,true);
      assert(!captured.publicFinalTickets.includes(captured.postSelectorRescues[0].replacedTicket));
    }
  } finally {fixture.cleanup();}
});

function sourceManifest() {
  const predictionSources=frozen.MODULES.map(name=>({path:'js/'+name+'.js',sha256:hash(frozenSourceBytes('js/'+name+'.js'))}));
  const comparisonSources=['compare-escape-frozen.cjs','analysis-input-contract.js','audit-escape-main.cjs','daily-prediction-source-archive.js','phase11-improvement-decision-gate.cjs']
    .map(name=>({path:'scripts/'+name,sha256:hash(fs.readFileSync(path.join(ROOT,'scripts',name)))}));
  const scriptSha256=hash(fs.readFileSync(path.join(ROOT,'scripts/compare-independent-head-coverage.cjs')));
  return {predictionSources,comparisonSources,candidate:{id:candidate.CANDIDATE_ID,definedAt:candidate.DEFINED_AT,requiredCoreVersion:candidate.REQUIRED_CORE_VERSION,
    scriptSha256,selectorSha256:predictionSources.find(row=>row.path==='js/practical-selection.js').sha256,
    replaySourceSha256:comparisonSources[0].sha256,inputContractSha256:comparisonSources[1].sha256,fingerprint:trace.REFERENCE_FINGERPRINT}};
}
function makeEnvironment(config={rankReplacement:true}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-trace-')),results=runFixture(config);
  const sources=sourceManifest();
  for(const item of [...sources.predictionSources,...sources.comparisonSources,{path:'scripts/compare-independent-head-coverage.cjs'}]) {
    const target=path.join(root,item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,frozenSourceBytes(item.path));
  }
  const selectedAt='2026-10-19T00:01:00Z',deadlineAt='2026-10-19T00:20:00Z',sourceFetchedAt='2026-10-19T00:00:00Z';
  const makeRecord=raceNo=>({raceKey:'20261019-01-'+raceNo,selectedAt,deadlineAt,prediction:{
    practicalTickets:results.plainCurrent.tickets,verificationEvidence:{sourceCommit:'fixture-source',marks:{honmei:{boatNo:1}}},
    preRaceConditions:{sourceTiming:'pre_deadline',officialResultUsed:false,sourceFetchedAt,
      dataAvailability:{officialCourses:6,exhibitionST:6,exhibitionTime:6},
      escapeEvaluationEvidence:{version:'escape-evaluation-evidence-v1',historyStatus:'captured',resultUsedForGeneration:false,
        aiCoreVersion:candidate.REQUIRED_CORE_VERSION,sourceFetchedAt,entries:Array.from({length:6},()=>({})),beforeInfo:Array.from({length:6},()=>({})),
        startExhibition:Array.from({length:6},()=>({})),raceScenarios:{scenarios:[]}}}}});
  const records=[makeRecord(1),makeRecord(2)],file='data/predictions/20261019.json',data={predictions:records};
  fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(data));
  const fileHash=hash(fs.readFileSync(path.join(root,file))),guard=candidate.guardCandidate(results.plainCurrent,results.plainCandidate);
  const reference={version:'independent-head-coverage-comparison-v1',generatedAt:'2026-10-20T06:10:26.110Z',sourceCommit:'original-reference',...sources,
    summary:{replayed:2},baselineReproduction:{reproduced:2},rows:records.map((record,index)=>({key:record.raceKey,source:'daily-primary',sourceCommit:'fixture-source',
      selectedAt,deadlineAt,sourcePointer:{path:file,sha256:fileHash,array:'predictions',index,recordJsonSha256:hash(JSON.stringify(record))},
      current:compact(results.plainCurrent),candidate:compact(guard.candidate),changed:guard.changed,changeReason:guard.reason,
      attempt:{tickets:results.plainCandidate.tickets,coreVersion:candidate.REQUIRED_CORE_VERSION,normalCount:results.plainCandidate.expansionSummary.normalCount,
        finalCount:results.plainCandidate.tickets.length,strongEscapeLimit:results.plainCandidate.expansionSummary.strongEscapeTrim?.eligible?results.plainCandidate.expansionSummary.strongEscapeTrim.maximumAlternateHeadCount:null},
      result:{actual:'6-5-4',payout:99999}}))};
  const seen=[];
  const run=Object.fromEntries(Object.entries(results).map(([mode,result])=>[mode,(row,options)=>{seen.push({mode,row:clone(row),options:clone(options||{})});return clone(result);} ]));
  return {root,results,reference,run,seen,file,data,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}

test('fixed source manifests and original candidate fingerprint fail closed on changed source or metadata',()=>{
  const fixture=makeEnvironment();
  try {
    assert.equal(trace.verifyReferenceSources(fixture.root,fixture.reference).fingerprint,trace.REFERENCE_FINGERPRINT);
    const changed=clone(fixture.reference);changed.candidate.fingerprint='a'.repeat(64);
    assert.throws(()=>trace.verifyReferenceSources(fixture.root,changed),/reference report contract/);
    const reordered=clone(fixture.reference);reordered.predictionSources.reverse();
    assert.throws(()=>trace.verifyReferenceSources(fixture.root,reordered),/source manifest/);
    fs.appendFileSync(path.join(fixture.root,'js/practical-selection.js'),'\n// changed');
    assert.throws(()=>trace.verifyReferenceSources(fixture.root,fixture.reference),/source hash mismatch/);
  } finally {fixture.cleanup();}
});

test('the old wrapper snapshot rejects unrelated changes and current production wrappers cannot enter the fixed v1 trial',()=>{
  const fixture=makeEnvironment();
  try {
    assert.throws(()=>trace.verifyReferenceSources(ROOT,fixture.reference),
      /Reference source hash mismatch: js\/three-course-escape-rescue-fixed5\.js/);
    for(const [file,expected] of Object.entries(FROZEN_WRAPPERS)) {
      const current=fs.readFileSync(path.join(ROOT,file)),original=frozenSourceBytes(file);
      assert.notEqual(hash(current),expected);assert.equal(hash(original),expected);
      assert.equal(hash(frozenWrapperBytes(file,original)),expected);
      assert.throws(()=>frozenWrapperBytes(file,Buffer.concat([current,Buffer.from('\n// unrelated change')])),/Frozen v1 wrapper snapshot changed/);
      const target=path.join(fixture.root,file);
      fs.writeFileSync(target,current);
      try {
        assert.throws(()=>trace.verifyReferenceSources(fixture.root,fixture.reference),
          error=>error.message==='Reference source hash mismatch: '+file);
      } finally {fs.writeFileSync(target,original);}
    }
    assert.equal(trace.verifyReferenceSources(fixture.root,fixture.reference).fingerprint,trace.REFERENCE_FINGERPRINT);
  } finally {fixture.cleanup();}
});

test('build traces only exact reference rows, observes both modes, and excludes outcomes from replay and report',async()=>{
  const fixture=makeEnvironment();
  try {
    const report=await trace.build(fixture.root,{referenceReport:fixture.reference,run:fixture.run,generatedAt:'fixed'});
    assert.equal(report.summary.referenceRows,2);assert.equal(report.summary.traced,2);assert.equal(report.summary.untraced,0);
    assert.equal(report.summary.classifications.TARGET_REMOVED_AFTER_RANK_GATE,2);
    assert(report.rows.every(row=>row.baselineParity&&row.candidateParity&&row.fileEvidence.fileHashMatched));
    assert.equal(fixture.seen.length,8);
    assert(fixture.seen.every(call=>!Object.hasOwn(call.row,'result')&&!Object.hasOwn(call.row,'actual')&&!Object.hasOwn(call.row,'payout')));
    assert.equal(/actual|payout|hitRate|recoveryRate/.test(JSON.stringify(report).replaceAll('actualSha256','').replaceAll('actualFirstNewHead','')),false);
    const modified=clone(fixture.reference);modified.rows.forEach(row=>{row.result={actual:'1-2-3',payout:1};});
    const second=await trace.build(fixture.root,{referenceReport:modified,run:fixture.run,generatedAt:'fixed'});
    assert.deepEqual(second,report);
  } finally {fixture.cleanup();}
});

test('file-only changes are explicit warnings while changed or absent original records remain in denominator',async()=>{
  const fixture=makeEnvironment();
  try {
    fixture.data.extra='unrelated append';fs.writeFileSync(path.join(fixture.root,fixture.file),JSON.stringify(fixture.data));
    const intact=await trace.build(fixture.root,{referenceReport:fixture.reference,run:fixture.run});
    assert.equal(intact.summary.filesChangedWithIdenticalRecord,2);
    assert(intact.rows.every(row=>row.fileEvidence.warning==='FILE_CHANGED_RECORD_IDENTICAL'&&row.fileEvidence.fileHashMatched===false));
    fixture.data.predictions[0].prediction.preRaceConditions.extra='changed original';fixture.data.predictions.pop();
    fs.writeFileSync(path.join(fixture.root,fixture.file),JSON.stringify(fixture.data));
    const damaged=await trace.build(fixture.root,{referenceReport:fixture.reference,run:fixture.run});
    assert.equal(damaged.summary.referenceRows,2);assert.equal(damaged.summary.traced,0);assert.equal(damaged.summary.untraced,2);
    assert.deepEqual(damaged.summary.untracedReasons,{'source-record-hash-mismatch':1,'source-record-missing':1});
    assert.deepEqual(damaged.summary.classifications,{});
  } finally {fixture.cleanup();}
});

test('ordered reference replay mismatch stays untraced; any full-output observer change aborts the whole build',async()=>{
  const fixture=makeEnvironment();
  try {
    const reordered=clone(fixture.reference);reordered.rows[0].current.tickets.reverse();
    const report=await trace.build(fixture.root,{referenceReport:reordered,run:fixture.run});
    assert.equal(report.summary.referenceRows,2);assert.equal(report.summary.traced,1);
    assert.equal(report.rows[0].reason,'reference-ordered-baseline-mismatch');
    for(const mode of ['observedCurrent','observedCandidate']) {
      const run={...fixture.run,[mode]:()=>({...clone(fixture.results[mode]),insideSkill:{changed:true}})};
      await assert.rejects(trace.build(fixture.root,{referenceReport:fixture.reference,run}),/Trace parity failed/);
    }
    const missing={...fixture.run,observedCurrent:()=>clone(fixture.results.plainCurrent)};
    await assert.rejects(trace.build(fixture.root,{referenceReport:fixture.reference,run:missing}),/Missing or incomplete selector trace/);
  } finally {fixture.cleanup();}
});

test('pointer resolution supports exact note records and refuses traversal, wrong source timing and record substitution',()=>{
  const fixture=makeEnvironment();
  try {
    const ref=clone(fixture.reference.rows[0]),record=fixture.data.predictions[0];
    const notePath='data/note-drafts/20261019/20261019-01-1-'+ 'a'.repeat(64)+'.json';
    fs.mkdirSync(path.dirname(path.join(fixture.root,notePath)),{recursive:true});fs.writeFileSync(path.join(fixture.root,notePath),JSON.stringify({record}));
    ref.source='all-race-note';ref.sourcePointer={path:notePath,sha256:hash(fs.readFileSync(path.join(fixture.root,notePath))),recordPath:'record',recordJsonSha256:hash(JSON.stringify(record))};
    assert.equal(trace.resolveReferenceRow(fixture.root,ref).row.key,ref.key);
    const traversal=clone(ref);traversal.sourcePointer.path='../outside.json';
    assert.equal(trace.resolveReferenceRow(fixture.root,traversal).reason,'invalid-source-pointer');
    record.prediction.preRaceConditions.sourceTiming='post_deadline';
    fs.writeFileSync(path.join(fixture.root,notePath),JSON.stringify({record}));ref.sourcePointer.recordJsonSha256=hash(JSON.stringify(record));
    assert.equal(trace.resolveReferenceRow(fixture.root,ref).reason,'snapshot:source-timing-not-pre-deadline');
  } finally {fixture.cleanup();}
});
