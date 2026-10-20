'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const candidate = require('./compare-independent-head-coverage.cjs');
const ROOT=path.resolve(__dirname,'..');
const NAMES=['three-course-escape-rescue-fixed5','four-kado-escape-rescue-fixed5'];
const OLD_METHOD='      select(prediction){\n        return apply(prediction,originalSelect(prediction));';
const NEW_METHOD='      select(prediction, options){\n        return apply(prediction,originalSelect(prediction, options));';
const clone=value=>JSON.parse(JSON.stringify(value));

function wrapperSource(name,{legacy=false}={}) {
  const source=fs.readFileSync(path.join(ROOT,'js',name+'.js'),'utf8');
  assert.equal(source.split(NEW_METHOD).length,2,'one forwarder per preserved wrapper');
  return legacy?source.replace(NEW_METHOD,OLD_METHOD):source;
}
function contextFor({legacy=false,names=NAMES}={}) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  for(const name of names) vm.runInContext(wrapperSource(name,{legacy}),context,{filename:name+'.js'});
  return context;
}
function selected(label,tickets) {
  return {status:'selected',reason:'fixture baseline',evidence:{raceFlow:{title:label}},
    tickets:tickets.map(ticket=>({ticket,category:'本線',selectionTier:'通常',priorityScore:80,
      branchIds:['branch:'+ticket],coverage:[{boatNo:1,position:1}],roleClaims:[{role:'attack',boatNo:Number(ticket[0])}]})),
    candidateDecisions:[{ticket:tickets.at(-1),selected:true,reasonCode:'ALREADY_SELECTED'}],
    excludedCandidates:[{ticket:'6-5-4',selected:false,reasonCode:'CANDIDATE_ONLY_EVALUATION'}],
    expansionSummary:{normalCount:tickets.length,addedCount:0,finalCount:tickets.length},
    verificationEvidence:{mainScenario:{label},generation:{ticketPolicyVersion:'fixture'},
      tickets:tickets.map(ticket=>({ticket,categories:['本線'],branchIds:['branch:'+ticket],
        roleClaims:[{role:'attack',boatNo:Number(ticket[0])}],theoryClaims:[{theoryKey:'flow'}]}))}};
}

function stubbedContext(output,{legacy=false,names=NAMES}={}) {
  const context=contextFor({legacy,names});
  context.output=clone(output);
  vm.runInContext(`
    globalThis.prediction={identity:'fixture'};
    globalThis.calls=[];
    let api={select(prediction,options){calls.push({prediction,options});return output;}};
    ${names.map(name=>`api=${name.startsWith('three')?'ChappyThreeCourseEscapeRescueFixed5':'ChappyFourKadoEscapeRescueFixed5'}.install(api);`).join('\n')}
    globalThis.api=api;
  `,context);
  return context;
}

test('default calls preserve the complete return before and after both wrappers across rescue and skip paths',()=>{
  const fixtures=[
    ['normal',selected('逃げ',['1-2-3','1-3-2','1-4-3'])],
    ['three-course rescue',selected('3コース攻め',['3-1-2','3-2-1','1-2-3'])],
    ['four-kado rescue',selected('4カド攻め',['4-1-2','4-2-1','1-3-2'])],
    ['existing three-course rescue',selected('3コース攻め',['3-1-2','1-3-4','1-2-3'])],
    ['existing four-kado rescue',selected('4カド攻め',['4-1-2','1-2-4','1-3-2'])],
    ['skip',{status:'skipped',reason:'structured evidence missing',tickets:[],candidateDecisions:[],expansionSummary:null}]
  ];
  for(const [label,output] of fixtures) for(const args of ['prediction','prediction,undefined','prediction,{}']) {
    const oldContext=stubbedContext(output,{legacy:true}),newContext=stubbedContext(output);
    const before=JSON.parse(vm.runInContext(`JSON.stringify(api.select(${args}))`,oldContext));
    const after=JSON.parse(vm.runInContext(`JSON.stringify(api.select(${args}))`,newContext));
    assert.deepEqual(after,before,label+' / '+args);
    assert.equal(newContext.calls.length,1);assert.equal(oldContext.calls.length,1);
    assert.equal(newContext.calls[0].prediction,newContext.prediction);
  }
});

test('each wrapper and their chain forward the exact options reference without modifying it',()=>{
  for(const names of [[NAMES[0]],[NAMES[1]],NAMES]) for(const value of [false,'replay','opaque']) {
    const context=stubbedContext(selected('逃げ',['1-2-3','1-3-2']),{names});
    const sentinel=Object.freeze({keep:'same reference'});
    const options=Object.freeze({escapeRolePartner:value,researchBaselineHeads:Object.freeze([1,2]),sentinel});
    const before=JSON.stringify(options);context.options=options;
    vm.runInContext('api.select(prediction,options)',context);
    assert.equal(context.calls.length,1);
    assert.equal(context.calls[0].options,options);
    assert.equal(context.calls[0].options.sentinel,sentinel);
    assert.equal(JSON.stringify(options),before);
  }
});

const fixtureSource=fs.readFileSync(path.join(__dirname,'test-practical-selection.js'),'utf8');
const first=fixtureSource.indexOf('const MAIN = ['),last=fixtureSource.indexOf('const standard =');
assert(first>=0&&last>first);
const SETUP=fixtureSource.slice(first,last)+`
  const branches=[
    holdBranch({id:'hold:a',ticket:'1-4-2',partnerBoatNo:2,priorityScore:86}),
    holdBranch({id:'hold:b',ticket:'1-4-5',partnerBoatNo:5,priorityScore:85}),
    holdBranch({id:'hold:c',ticket:'1-4-6',partnerBoatNo:6,priorityScore:84}),
    alternateHeadBranch({id:'alt:four',ticket:'4-2-3',priorityScore:80})];
  const prediction=createFixture({flow:true,independent:branches});
  prediction.aiCore.courseMapping={formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}};
  globalThis.fixture=prediction;`;
function realSelector(source,{legacy=false,options={}}={}) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(source,context,{filename:'practical-selection.js'});
  for(const name of NAMES)vm.runInContext(wrapperSource(name,{legacy}),context,{filename:name+'.js'});
  vm.runInContext(SETUP,context);context.options=options;
  const selection=JSON.parse(vm.runInContext('JSON.stringify(ChappyPracticalSelection.select(fixture,options))',context));
  return {selection,firstNewHead:context.__testFirstNewHead};
}
function describe(selection) {
  return {head:1,coreVersion:candidate.REQUIRED_CORE_VERSION,tickets:selection.tickets.map(row=>row.ticket),
    mainTickets:selection.tickets.filter(row=>row.category==='本線').map(row=>row.ticket),scenarios:[],
    selectionRows:selection.tickets,expansionSummary:selection.expansionSummary,candidateDecisions:selection.candidateDecisions,
    courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}},
    selectionBranches:selection.evidence.branches.map(branch=>({...branch,phaseKind:branch.phaseEvidence?.kind}))};
}

test('default real selector output remains equal and research options reach the original injection through both wrappers',()=>{
  const source=fs.readFileSync(path.join(ROOT,'js/practical-selection.js'),'utf8');
  const current=realSelector(source).selection;
  assert.deepEqual(current,realSelector(source,{legacy:true}).selection);
  const options=Object.freeze({researchBaselineHeads:Object.freeze(candidate.heads(current.tickets.map(row=>row.ticket)))});
  const before=JSON.stringify(options);
  const attemptSource=candidate.transformSelection(source);
  const marker='      if (firstNewHead > 0) expansionCandidates.unshift(expansionCandidates.splice(firstNewHead, 1)[0]);';
  assert.equal(attemptSource.split(marker).length,2);
  const observedSource=attemptSource.replace(marker,'      globalThis.__testFirstNewHead = firstNewHead;\n'+marker);
  const legacy=realSelector(observedSource,{legacy:true,options});
  assert.equal(legacy.firstNewHead,undefined);assert.deepEqual(legacy.selection,current);
  const next=realSelector(observedSource,{options});
  assert.equal(next.firstNewHead,3);
  assert.deepEqual(next.selection,realSelector(attemptSource,{options}).selection);
  assert.equal(JSON.stringify(options),before);
  assert.equal(next.selection.tickets.length,current.tickets.length);
  const baseline=describe(current),attempt=describe(next.selection),guard=candidate.guardCandidate(baseline,attempt);
  assert.equal(guard.changed,true);assert.equal(guard.reason,'ONE_QUALIFIED_NEW_HEAD_SWAP');
  assert.equal(guard.swap.removed,'1-4-6');assert.equal(guard.swap.added,'4-2-3');
  assert.equal(guard.swap.priorityDelta,-4);
  assert.deepEqual(guard.swap.oldHeads,[1,2]);assert.deepEqual(guard.swap.newHeads,[1,2,4]);
  assert.deepEqual(attempt.selectionRows.filter(row=>row.selectionTier!=='展開追加'),baseline.selectionRows.filter(row=>row.selectionTier!=='展開追加'));
});
