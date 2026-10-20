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
const source=fs.readFileSync(path.join(ROOT,'js/practical-selection.js'),'utf8');
const fixtureSource=fs.readFileSync(path.join(__dirname,'test-practical-selection.js'),'utf8');
const first=fixtureSource.indexOf('const MAIN = ['),last=fixtureSource.indexOf('const standard =');
assert(first>=0&&last>first);
const builders=fixtureSource.slice(first,last);

function fixtureSetup({altScore=80,altTicket='4-2-3',strongScore=0,rankReplacement=false}={}) {
  return `${builders}
    const branches=[
      holdBranch({id:'hold:a',ticket:'1-4-2',partnerBoatNo:2,priorityScore:86}),
      holdBranch({id:'hold:b',ticket:'1-4-5',partnerBoatNo:5,priorityScore:85}),
      holdBranch({id:'hold:c',ticket:'1-4-6',partnerBoatNo:6,priorityScore:84}),
      alternateHeadBranch({id:'alt:four',ticket:${JSON.stringify(altTicket)},priorityScore:${altScore}})];
    ${rankReplacement?`const hole=canonicalBranch({id:'formation:hole:1-5-6:evaluation:ana:6:3',ticket:'1-5-6',group:'hole',roleBoatNo:6,position:3,role:'pickup',priorityScore:92}); branches.push(hole);`:''}
    const prediction=createFixture({flow:true,independent:branches});
    prediction.aiCore.courseMapping={formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}};
    ${rankReplacement?`prediction.aiCore.formations.evidence.branches.filter(b=>b.id.startsWith('cover:')).forEach(b=>b.priorityScore=90);`:''}
    ${strongScore?`const escape={type:'escape',score:${strongScore}};prediction.aiCore.raceScenarios={mainScenario:escape,scenarios:[escape,{type:'sashi',score:60}]};`:''}
    globalThis.fixture=prediction;`;
}
function select(inputSource,setup,options={}) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(inputSource,context);vm.runInContext(setup,context);context.options=clone(options);
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
function runFixture(config={}) {
  const setup=fixtureSetup(config),plainCurrent=describe(select(source,setup));
  const options={researchBaselineHeads:candidate.heads(plainCurrent.tickets)};
  const plainCandidate=describe(select(candidate.transformSelection(source),setup,options));
  const observedCurrent=describe(select(trace.transformObservedSelection(source,{mode:'current'}),setup,options));
  const observedCandidate=describe(select(trace.transformObservedSelection(source,{mode:'candidate'}),setup,options));
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

function sourceManifest() {
  const predictionSources=frozen.MODULES.map(name=>({path:'js/'+name+'.js',sha256:hash(fs.readFileSync(path.join(ROOT,'js',name+'.js')))}));
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
    const target=path.join(root,item.path);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(ROOT,item.path),target);
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
