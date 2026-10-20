'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const candidate = require('./compare-independent-head-coverage.cjs');
const ROOT=path.resolve(__dirname,'..');
const NAMES=['three-course-escape-rescue-fixed5','four-kado-escape-rescue-fixed5'];
const OLD_METHOD='      select(prediction){\n        return apply(prediction,originalSelect(prediction));';
const NEW_METHOD='      select(prediction, options){\n        return apply(prediction,originalSelect(prediction, options));';
const OLD_PRELOAD='  wrapped.select = function selectWithFrameReplayBasis(prediction) {\n    const selection = originalSelect(prediction);';
const NEW_PRELOAD='  wrapped.select = function selectWithFrameReplayBasis(prediction, options) {\n    const selection = originalSelect(prediction, options);';
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
function withPreload(context,target,{legacy=false}={}) {
  const processLoad=Module._load;
  let source=fs.readFileSync(path.join(ROOT,'js/frame-rise-fall-replay-preload.js'),'utf8');
  assert.equal(source.split(NEW_PRELOAD).length,2,'one options forwarder in the preload');
  if(legacy) source=source.replace(NEW_PRELOAD,OLD_PRELOAD);
  const imports=[],loads=[];
  const moduleLoader={_load(request){loads.push(request);return context.preloadInput;}};
  const originalLoad=moduleLoader._load;
  context.preloadExports={exports:{}};
  context.preloadRequire=request=>{
    imports.push(request);
    if(request==='node:module') return moduleLoader;
    if(request==='./manshu-forecast-ledger') return {};
    throw Error('Unexpected preload import: '+request);
  };
  vm.runInContext(`(function(require,module,exports,global){\n${source}\n})(preloadRequire,preloadExports,preloadExports.exports,globalThis);`,context);
  assert.deepEqual(imports,['./manshu-forecast-ledger','node:module']);
  assert.notEqual(moduleLoader._load,originalLoad);
  vm.runInContext(`globalThis.preloadInput=${target};globalThis.ChappyPracticalSelection=preloadInput;`,context);
  const input=context.preloadInput;
  assert.equal(typeof input.compactAudit,'function','exercise the real compactAudit wrapping gate');
  const wrapped=moduleLoader._load('../js/practical-selection',null,false);
  assert.deepEqual(loads,['../js/practical-selection']);
  assert.notEqual(wrapped,input);assert.notEqual(wrapped.select,input.select);assert.notEqual(wrapped.compactAudit,input.compactAudit);
  assert.equal(wrapped[Symbol.for('chappy.frameRiseFallReplayWrapped')],true);
  assert.equal(context.ChappyPracticalSelection,wrapped);
  context.preloadOutput=wrapped;vm.runInContext(`${target}=preloadOutput;`,context);
  assert.equal(Module._load,processLoad,'the VM preload must not patch the process loader');
  return context;
}
function predictionWithBasis() {
  return {identity:'fixture',aiCore:{version:'fixture-core',analyses:Array.from({length:6},(_,i)=>({boatNo:i+1})),
    raceScenarios:{mainScenario:{type:'escape',score:70},scenarios:[{type:'escape',score:70}]},
    courseMapping:{formal:true,byBoat:{1:1,2:2,3:3,4:4,5:5,6:6}}},raceFlow:{title:'1逃げ'}};
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

function stubbedContext(output,{legacy=false,names=NAMES,preload=false,basis=false}={}) {
  const context=contextFor({legacy,names});
  context.output=clone(output);
  context.prediction=basis?predictionWithBasis():{identity:'fixture'};
  vm.runInContext(`
    globalThis.calls=[];
    globalThis.api={select(prediction,options){calls.push({prediction,options});return output;},
      compactAudit(selection){return {status:selection.status,tickets:selection.tickets.map(row=>row.ticket)};}};
    ${names.map(name=>`api=${name.startsWith('three')?'ChappyThreeCourseEscapeRescueFixed5':'ChappyFourKadoEscapeRescueFixed5'}.install(api);`).join('\n')}
  `,context);
  if(preload) withPreload(context,'api',{legacy});
  return context;
}

test('default calls preserve full selection and audit outputs through rescue wrappers and the preload with or without saved basis',()=>{
  const fixtures=[
    ['normal',selected('逃げ',['1-2-3','1-3-2','1-4-3'])],
    ['three-course rescue',selected('3コース攻め',['3-1-2','3-2-1','1-2-3'])],
    ['four-kado rescue',selected('4カド攻め',['4-1-2','4-2-1','1-3-2'])],
    ['existing three-course rescue',selected('3コース攻め',['3-1-2','1-3-4','1-2-3'])],
    ['existing four-kado rescue',selected('4カド攻め',['4-1-2','1-2-4','1-3-2'])],
    ['skip',{status:'skipped',reason:'structured evidence missing',tickets:[],candidateDecisions:[],expansionSummary:null}]
  ];
  for(const [label,output] of fixtures) for(const args of ['prediction','prediction,undefined','prediction,{}'])
      for(const config of [{},{preload:true},{preload:true,basis:true}]) {
    const oldContext=stubbedContext(output,{...config,legacy:true}),newContext=stubbedContext(output,config);
    const before=JSON.parse(vm.runInContext(`globalThis.selection=api.select(${args});JSON.stringify(selection)`,oldContext));
    const after=JSON.parse(vm.runInContext(`globalThis.selection=api.select(${args});JSON.stringify(selection)`,newContext));
    assert.deepEqual(after,before,label+' / '+args);
    const beforeAudit=JSON.parse(vm.runInContext('JSON.stringify(api.compactAudit(selection))',oldContext));
    const afterAudit=JSON.parse(vm.runInContext('JSON.stringify(api.compactAudit(selection))',newContext));
    assert.deepEqual(afterAudit,beforeAudit,label+' / compactAudit / '+args);
    assert.equal(Boolean(after.frameRiseFallReplayBasis),config.basis===true);
    if(config.basis) {
      assert.equal(after.frameRiseFallReplayBasis.analyses.length,6);
      assert.deepEqual(afterAudit.frameRiseFallReplayBasis,after.frameRiseFallReplayBasis);
      assert.equal(vm.runInContext('api.compactAudit(selection).frameRiseFallReplayBasis===selection.frameRiseFallReplayBasis',newContext),false);
    }
    assert.equal(newContext.calls.length,1);assert.equal(oldContext.calls.length,1);
    assert.equal(newContext.calls[0].prediction,newContext.prediction);
  }
});

test('each rescue wrapper, the preload, and their full chain forward the same options reference without modifying it',()=>{
  const configs=[...[[NAMES[0]],[NAMES[1]],NAMES].map(names=>({names})),
    ...[[],[NAMES[0]],[NAMES[1]],NAMES].map(names=>({names,preload:true,basis:true}))];
  for(const config of configs) for(const value of [false,'replay','opaque']) {
    const context=stubbedContext(selected('逃げ',['1-2-3','1-3-2']),config);
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
function realSelector(source,{legacy=false,options={},preload=false}={}) {
  const context={console};context.window=context;context.globalThis=context;vm.createContext(context);
  vm.runInContext(source,context,{filename:'practical-selection.js'});
  for(const name of NAMES)vm.runInContext(wrapperSource(name,{legacy}),context,{filename:name+'.js'});
  if(preload) withPreload(context,'ChappyPracticalSelection',{legacy});
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

test('default real selector output remains equal and research options reach the original injection through all three wrappers',()=>{
  const source=fs.readFileSync(path.join(ROOT,'js/practical-selection.js'),'utf8');
  for(const preload of [false,true]) {
    const current=realSelector(source,{preload}).selection;
    assert.deepEqual(current,realSelector(source,{legacy:true,preload}).selection);
    const options=Object.freeze({researchBaselineHeads:Object.freeze(candidate.heads(current.tickets.map(row=>row.ticket)))});
    const before=JSON.stringify(options);
    const attemptSource=candidate.transformSelection(source);
    const marker='      if (firstNewHead > 0) expansionCandidates.unshift(expansionCandidates.splice(firstNewHead, 1)[0]);';
    assert.equal(attemptSource.split(marker).length,2);
    const observedSource=attemptSource.replace(marker,'      globalThis.__testFirstNewHead = firstNewHead;\n'+marker);
    const legacy=realSelector(observedSource,{legacy:true,options,preload});
    assert.equal(legacy.firstNewHead,undefined);assert.deepEqual(legacy.selection,current);
    const next=realSelector(observedSource,{options,preload});
    assert.equal(next.firstNewHead,3);
    assert.deepEqual(next.selection,realSelector(attemptSource,{options,preload}).selection);
    assert.equal(JSON.stringify(options),before);
    assert.equal(next.selection.tickets.length,current.tickets.length);
    const baseline=describe(current),attempt=describe(next.selection),guard=candidate.guardCandidate(baseline,attempt);
    assert.equal(guard.changed,true);assert.equal(guard.reason,'ONE_QUALIFIED_NEW_HEAD_SWAP');
    assert.equal(guard.swap.removed,'1-4-6');assert.equal(guard.swap.added,'4-2-3');
    assert.equal(guard.swap.priorityDelta,-4);
    assert.deepEqual(guard.swap.oldHeads,[1,2]);assert.deepEqual(guard.swap.newHeads,[1,2,4]);
    assert.deepEqual(attempt.selectionRows.filter(row=>row.selectionTier!=='展開追加'),baseline.selectionRows.filter(row=>row.selectionTier!=='展開追加'));
  }
});
