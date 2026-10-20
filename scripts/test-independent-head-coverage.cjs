'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const frozen = require('./compare-escape-frozen.cjs');
const candidate = require('./compare-independent-head-coverage.cjs');

const row=(ticket,tier='',priorityScore=90)=>({ticket,category:tier?'独立展開':'本線',selectionTier:tier,
  priorityScore,purchaseEligible:true,expansionEligible:true,evidenceQualified:true,
  validIndependentBranchIds:tier?[ticket]:[]});
function result(replacement=false){
  const selectionRows=[row('1-2-3'),row('1-2-4'),row('1-3-2'),row('2-1-3'),row('2-1-4'),
    row('1-4-2','展開追加',86),row('1-4-5','展開追加',85),row(replacement?'4-2-3':'1-4-6','展開追加',replacement?80:84)];
  return {head:1,coreVersion:candidate.REQUIRED_CORE_VERSION,tickets:selectionRows.map(row=>row.ticket),selectionRows,
    mainTickets:selectionRows.slice(0,3).map(row=>row.ticket),scenarios:[{type:'escape',score:79}],
    expansionSummary:{normalCount:5},candidateDecisions:replacement?[]:[{ticket:'4-2-3',selected:false,reasonCode:'MAXIMUM_REACHED',branchIds:['4-2-3'],priorityScore:80}],courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}},
    selectionBranches:selectionRows.filter(row=>row.selectionTier).map(row=>({id:row.ticket,ticket:row.ticket,kind:'independent-scenario',
      phaseKind:row.ticket==='4-2-3'?'alternate-head':'hold-continuation',attackerBoatNo:row.ticket==='4-2-3'?4:1,
      source:row.ticket==='4-2-3'?'race-flow-attack-scenario':'race-flow-phase-continuation'}))};
}

test('a qualified one-for-one new head accepts a priority decrease and preserves all old heads',()=>{
  const baseline=result(),attempt=result(true),before=JSON.stringify({baseline,attempt});
  const accepted=candidate.guardCandidate(baseline,attempt);
  assert.equal(accepted.changed,true);assert.equal(accepted.swap.priorityDelta,-4);
  assert.equal(accepted.swap.priorityDecreased,true);assert.deepEqual(accepted.swap.oldHeads,[1,2]);
  assert.deepEqual(accepted.swap.newHeads,[1,2,4]);assert.equal(accepted.candidate.tickets.length,baseline.tickets.length);
  assert.equal(JSON.stringify({baseline,attempt}),before);
});

test('failed budget/normal/qualification/course/strong-escape guards retain the whole baseline',()=>{
  const cases=[
    ['TICKET_BUDGET_CHANGED',attempt=>{attempt.tickets.pop();attempt.selectionRows.pop();}],
    ['NORMAL_FLOW_OR_PROMOTION_ROWS_CHANGED',attempt=>{attempt.selectionRows[0].comment='changed';}],
    ['ADDED_HEAD_NOT_VALIDATED',attempt=>{attempt.selectionRows.at(-1).expansionEligible=false;}],
    ['ADDED_HEAD_BELOW_EXISTING_COURSE_FLOOR',attempt=>{attempt.courseMapping.byBoat[4]=2;attempt.selectionRows.at(-1).priorityScore=79;}],
    ['STRONG_ESCAPE_LIMIT_VIOLATED',attempt=>{attempt.expansionSummary.strongEscapeTrim={eligible:true,maximumAlternateHeadCount:0};}]
  ];
  for(const [reason,change]of cases){const baseline=result(),attempt=result(true);change(attempt);const guarded=candidate.guardCandidate(baseline,attempt);
    assert.equal(guarded.reason,reason);assert.equal(guarded.changed,false);assert.equal(guarded.candidate,baseline);}
  const baseline=result(),attempt=result(true);baseline.selectionBranches.at(-1).phaseKind='alternate-head';
  assert.equal(candidate.guardCandidate(baseline,attempt).reason,'DONOR_NOT_VALIDATED_HOLD_CONTINUATION');
  const missingReason=result();missingReason.candidateDecisions=[];
  assert.equal(candidate.guardCandidate(missingReason,result(true)).reason,'BASELINE_EXCLUSION_REASON_UNAVAILABLE');
});

test('source transform is unique, result-blind, and uses the existing selector validator and every trim',()=>{
  const root=path.resolve(__dirname,'..'),production=fs.readFileSync(path.join(root,'js/practical-selection.js'),'utf8');
  assert.throws(()=>candidate.transformSelection('no marker'),/source contract changed/);
  assert.throws(()=>candidate.transformSelection(candidate.MARKER+candidate.MARKER),/source contract changed/);
  assert.equal(/result|payout|odds/i.test(candidate.INJECTION),false);
  // Reuse the established synthetic branch builders, without running their test body.
  const fixtureSource=fs.readFileSync(path.join(__dirname,'test-practical-selection.js'),'utf8');
  const first=fixtureSource.indexOf('const MAIN = ['),last=fixtureSource.indexOf('const standard =');
  assert(first>=0&&last>first);
  const setup=`${fixtureSource.slice(first,last)}
    const branches=[
      holdBranch({id:'hold:a',ticket:'1-4-2',partnerBoatNo:2,priorityScore:86}),
      holdBranch({id:'hold:b',ticket:'1-4-5',partnerBoatNo:5,priorityScore:85}),
      holdBranch({id:'hold:c',ticket:'1-4-6',partnerBoatNo:6,priorityScore:84}),
      alternateHeadBranch({id:'alt:four',ticket:'4-2-3',priorityScore:80})];
    const prediction=createFixture({flow:true,independent:branches});
    prediction.aiCore.courseMapping={formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}};
    globalThis.fixture=prediction;`;
  function select(source,options){const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
    vm.runInContext(source,context);vm.runInContext(setup,context);context.options=options;
    return JSON.parse(vm.runInContext('JSON.stringify(ChappyPracticalSelection.select(fixture,options))',context));}
  const baseline=select(production,{}),transformed=candidate.transformSelection(production);
  const noOptions=select(transformed,{});assert.deepEqual(noOptions,baseline);
  assert.equal(baseline.tickets.length,10);
  assert.equal(baseline.tickets.some(row=>row.ticket==='4-2-3'),false);
  const attempt=select(transformed,{researchBaselineHeads:candidate.heads(baseline.tickets.map(row=>row.ticket))});
  assert.equal(attempt.tickets.length,10);assert.equal(attempt.tickets.some(row=>row.ticket==='4-2-3'),true);
  assert.equal(attempt.tickets.some(row=>row.ticket==='1-4-6'),false);
  const describe=selection=>({head:1,coreVersion:candidate.REQUIRED_CORE_VERSION,tickets:selection.tickets.map(row=>row.ticket),
    selectionRows:selection.tickets,mainTickets:selection.tickets.filter(row=>row.category==='本線').map(row=>row.ticket),scenarios:[],
    courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}},expansionSummary:selection.expansionSummary,candidateDecisions:selection.candidateDecisions,
    selectionBranches:selection.evidence.branches.map(branch=>({...branch,phaseKind:branch.phaseEvidence?.kind}))});
  const compared=candidate.guardCandidate(describe(baseline),describe(attempt));
  assert.equal(compared.changed,true);assert.equal(compared.swap.priorityDelta,-4);
});

test('paired report joins results after selection and keeps candidate failures, pending, refund and source groups',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-head-coverage-'));
  try{
    fs.mkdirSync(path.join(root,'js'));
    fs.mkdirSync(path.join(root,'scripts'));
    for(const name of frozen.MODULES)fs.writeFileSync(path.join(root,'js',name+'.js'),name==='ai-core'?`const CORE_VERSION='${candidate.REQUIRED_CORE_VERSION}';`:'// fixture');
    for(const name of ['compare-escape-frozen.cjs','analysis-input-contract.js','audit-escape-main.cjs','daily-prediction-source-archive.js','phase11-improvement-decision-gate.cjs'])fs.writeFileSync(path.join(root,'scripts',name),'// helper fixture');
    const baseline=result(),saved=[1,2,3,4,5].map(raceNo=>({key:'20261019-01-'+raceNo,source:raceNo===1?'daily-primary':raceNo===2?'daily-verification':'all-race-note',
      selectedAt:'2026-10-19T00:01:00Z',deadlineAt:'2026-10-19T00:20:00Z',sourcePointer:{path:'fixture.json',sha256:'f'.repeat(64),index:raceNo-1},savedHead:baseline.head,savedTickets:baseline.tickets,savedScenarios:baseline.scenarios,
      conditions:{escapeEvaluationEvidence:{entries:Array.from({length:6},(_,index)=>({boat:index+1,...(index<2?{officialStartRank:{status:'available'}}:{})}))}}}));
    const official=(raceNo,ticket,payout,extra={})=>({date:'20261019',jcd:'01',raceNo,source:'boatrace-official',resultAvailable:true,trifecta:{combination:ticket,payout},...extra});
    const loaded={chosen:new Map(saved.map(row=>[row.key,row])),exclusions:{'incomplete-frozen-input':2},files:[],results:new Map([
      [saved[0].key,official(1,'4-2-3',2000)],[saved[1].key,official(2,'1-4-6',1000)],
      [saved[3].key,official(4,'4-2-3',2000,{refund:true})],[saved[4].key,official(5,'1-2-3',500)]])};
    let candidateCalls=0;
    const run={current:()=>result(),candidate:(source,options)=>{
      assert.deepEqual(Object.keys(options),['researchBaselineHeads']);assert.deepEqual(options.researchBaselineHeads,[1,2]);
      assert.equal(Object.hasOwn(source,'result'),false);candidateCalls++;
      if(source.key===saved[4].key)throw Error('fixture error');return result(true);
    }};
    const report=await candidate.build(root,{loaded,run,sourceCommit:'fixture-head'});
    assert.equal(candidateCalls,5);assert.equal(report.summary.replayed,5);assert.equal(report.summary.settled,3);
    assert.equal(report.summary.changed,4);assert.equal(report.changedSummary.settled,2);
    assert.equal(report.summary.gainedHits,1);assert.equal(report.summary.lostHits,1);assert.equal(report.summary.netHitChange,0);
    assert.equal(report.summary.current.stake,2400);assert.equal(report.summary.candidate.stake,2400);
    assert.equal(report.summary.current.returned,1500);assert.equal(report.summary.candidate.returned,2500);
    assert.equal(report.summary.pending,1);assert.equal(report.summary.excludedResults,1);
    assert.equal(report.summary.equalTicketBudget,true);assert.equal(report.bySource['daily-primary'].all.gainedHits,1);
    assert.equal(report.rows.at(-1).changeReason,'CANDIDATE_ERROR:fixture error');
    assert.deepEqual(report.rows.at(-1).candidate,report.rows.at(-1).current);
    assert.equal(report.savedRankAvailability.someProfilesNotSaved,5);assert.equal(report.rows[0].savedRankAvailability.notSaved,4);
    assert.equal(report.candidate.decisionGate.decision,'INSUFFICIENT_EVIDENCE');
    assert.equal(report.byPeriod['post-definition-replay'].all.current.hitRate,null);
    assert.equal(report.byVenue.length,24);assert.equal(report.productionChanged,false);
    assert.deepEqual(report.rows[0].sourcePointer,saved[0].sourcePointer);
    assert.equal(JSON.stringify(report.rows).includes('candidateDecisions'),false);
    assert.equal(JSON.stringify(report.rows).includes('selectionRows'),false);
    assert.equal(JSON.stringify(report.rows).includes('selectionBranches'),false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('zero samples retain null rates and do not claim an improvement',()=>{
  const summary=candidate.summarize([]);assert.equal(summary.current.hitRate,null);
  assert.equal(summary.candidate.recoveryRate,null);assert.equal(summary.recoveryRateDelta,null);
});
