'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compareHeadPriority:compare,VERSION,REQUIRED_METHOD,REQUIRED_EXECUTION_CODE_SHA256}=require('../scripts/promotion-head-priority-comparison.cjs');
const {resolveQueueRolePriorities}=require('../scripts/promotion-role-priority-diagnostic.cjs');
const clone=x=>structuredClone(x);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const original=['1-2-3','1-2-4','1-2-5','1-2-6','1-3-2','1-3-4','1-3-5','1-3-6','1-4-2','1-4-3'];
// Synthetic saved-observation contract fixtures only; no race regeneration,
// selector, result, payout or candidate discovery supplies these expectations.
function fixture({count=9,items=[['1-5-4',[77,95,92]],['3-5-4',[92,91,90]]],courses=[1,2,3,4,5,6]}={}) {
 const before=original.slice(0,count),observations=[],branches=[],queue=[],selected=before.slice();
 for(const [index,[ticket,priorities]] of items.entries()) {
  const boats=ticket.split('-').map(Number),ids=boats.map((_,i)=>'q'+index+'-p'+i),scenario='scenario:'+index;
  const coverage=boats.map((boatNo,i)=>({evaluationId:'evaluation:'+index+':'+i,boatNo,position:i+1,
    role:['head','hold','pickup'][i],branchId:ids[i]}));
  const priorityScore=Math.max(...priorities);
  observations.push({ticket,sourceCategory:'possibility',stage:'selection',valid:true,purchaseEligible:true,expansionEligible:false,
   inputBranchIds:ids.slice(),validBranchIds:ids.slice(),validPurchaseBranchIds:ids.slice(),validIndependentBranchIds:[],
   validScenarioIds:[scenario],priorityScore,coverage,physicalCoverage:coverage.map(c=>({...c}))});
  branches.push(...coverage.map((c,i)=>({id:ids[i],ticket,scenarioId:scenario,kind:'canonical-formation',source:'base-formation:cover',
    qualified:true,priorityScore:priorities[i],roles:[{evaluationId:c.evaluationId,boatNo:c.boatNo,role:c.role,eligiblePositions:[i+1]}]})));
  const row={queueIndex:index,candidateIndex:index,ticket,sourceCategory:'possibility',priorityScore,
   validationRef:{field:'candidateValidationEvidence.observations',index},selectedCountBefore:selected.length,
   remainingSlotsBefore:10-selected.length,courseEvaluated:false};
  if(selected.length===10) Object.assign(row,{disposition:'maximum-reached',reasonCode:'MAXIMUM_REACHED'});
  else {
   const course=courses[boats[0]-1],adopted=course===1||course===3;
   Object.assign(row,{courseEvaluated:true,headBoatNo:boats[0],courseMappingFormal:true,mappedCourse:course,
    courseOfResult:course,effectiveCourse:course,courseSource:'saved-course-lookup',
    disposition:adopted?'adopted':'course-excluded',reasonCode:adopted?'CANDIDATE_ONLY_PROMOTED':course===2?
      'SECOND_COURSE_HEAD_CANDIDATE_PROMOTION_PRUNED':'OUTER_HEAD_CANDIDATE_PROMOTION_PRUNED'});
   if(adopted)selected.push(ticket);
  }
  queue.push(row);
 }
 const execution={version:'candidate-promotion-execution-v1',status:'captured',purpose:'diagnostic-only',action:'KEEP_A',
  alternativeTickets:null,rankingProposed:false,resultUsedForGeneration:false,usableForPrediction:false,automaticApplication:false,
  executionCodeSha256:REQUIRED_EXECUTION_CODE_SHA256,maximumCount:10,candidateCount:items.length,
  before:{selectedTickets:before.slice(),usedTickets:before.slice(),remainingSlots:10-before.length},queue,
  afterPromotionTickets:selected.slice(),selectorFinalTickets:selected.slice(),observedFinalTickets:selected.slice(),transitions:[],postSelectorTransformations:[]};
 return {identity:{raceKey:'20300925-03-2',selectedAt:'2030-09-25T00:00:00.000Z',deadlineAt:'2030-09-25T00:10:00.000Z',
  method:REQUIRED_METHOD,predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false},
  sourceRef:{path:'data/note-drafts/20300925/synthetic-source.json',sha256:'a'.repeat(64)},execution,
  validation:{version:'candidate-validation-evidence-v1',status:'captured',resultUsedForGeneration:false,
   poolTickets:[...new Set([...selected,...items.map(([t])=>t)])],finalSelectedTickets:selected.slice(),observations,branches},
  officialCourses:courses.map((course,i)=>({boatNo:i+1,course,courseOfficial:true})),baselineA:selected.slice()};
}
function unknown(f) {const result=compare(f);assert.equal(result.status,'unknown');assert.deepEqual(result.B,result.A);
 assert.deepEqual(result.A,f.baselineA);assert.equal(result.changed,false);return result;}
function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}
test('B1 swaps a second/third-position maximum for the higher saved head priority at identical point count',()=>{
 const f=fixture(),before=clone(f),out=compare(f);
 assert.equal(out.version,VERSION);assert.equal(out.status,'compared');assert.equal(out.changed,true);
 assert.deepEqual(out.A,f.baselineA);assert.equal(out.A.at(-1),'1-5-4');assert.equal(out.B.at(-1),'3-5-4');
 assert.equal(out.B.length,out.A.length);assert.deepEqual(out.B.slice(0,9),f.execution.before.selectedTickets);
 assert.deepEqual(out.roleRefs.map(r=>Object.values(r.positions).map(p=>p.priority)),[[77,95,92],[92,91,90]]);
 assert.equal(out.roleRefs[0].observationRef.index,0);assert.equal(out.roleRefs[1].observationRef.index,1);
 assert.equal(out.bCourseTrace[0].queueIndex,1);assert.equal(out.bCourseTrace[0].officialCourse,3);
 assert.equal(f.execution.queue[1].courseEvaluated,false);assert.equal(Object.hasOwn(f.execution.queue[1],'effectiveCourse'),false);
 assert.equal(out.productionAction,'KEEP_A');assert.equal(out.automaticAdoption,false);assert.equal(out.automaticApplication,false);
 assert.equal(out.usableForPrediction,false);assert.equal(out.sourceReferenceVerified,false);assert.equal(out.includedInDenominator,true);
 assert.deepEqual(f,before);
});
test('the existing max-any-role 90 gate remains, while valid head priorities below 90 are retained',()=>{
 const f=fixture({count:8}),out=compare(f);
 assert.equal(out.status,'compared');assert(out.B.includes('1-5-4'));assert.equal(out.roleRefs[0].positions.first.priority,77);
 assert.deepEqual(out.bCourseTrace.map(row=>row.originalMaxPriority),[92,95]);
 const bad=fixture();bad.execution.queue[0].priorityScore=89;bad.validation.observations[0].priorityScore=89;
 assert(unknown(bad).reasons.includes('ORIGINAL_MAX_PRIORITY_GATE_MISMATCH'));
});
test('equal head priorities retain the observed queueIndex order without ticket-based reranking',()=>{
 const f=fixture({items:[['3-5-4',[77,95,92]],['1-5-4',[77,91,90]]]}),out=compare(f);
 assert.equal(out.status,'compared');assert.equal(out.changed,false);assert.deepEqual(out.B,out.A);
 assert.deepEqual(out.bCourseTrace.map(row=>row.queueIndex),[0,1]);
});
test('A full-slot rows use independently saved official courses only in B trace, preserving A reasons',()=>{
 const f=fixture({items:[['1-5-4',[70,98,92]],['4-5-6',[97,96,95]],['3-5-4',[96,95,94]]]}),before=clone(f.execution.queue);
 const out=compare(f);assert.equal(out.status,'compared');assert.equal(out.B.at(-1),'3-5-4');
 assert.deepEqual(out.bCourseTrace.map(r=>[r.queueIndex,r.disposition]),[[1,'course-excluded'],[2,'adopted'],[0,'maximum-reached']]);
 assert.equal(out.bCourseTrace[0].officialCourse,4);assert.equal(out.bCourseTrace[1].officialCourse,3);
 assert.deepEqual(f.execution.queue,before);assert.equal(f.execution.queue[1].reasonCode,'MAXIMUM_REACHED');
});
test('course-excluded rows before adoption remain actual A exclusions and can move in B without changing gates',()=>{
 const f=fixture({items:[['2-5-4',[60,99,95]],['1-5-4',[70,98,95]],['3-5-4',[97,96,95]]]}),out=compare(f);
 assert.equal(out.status,'compared');assert.equal(out.B.at(-1),'3-5-4');assert.equal(out.A.at(-1),'1-5-4');
 assert.equal(f.execution.queue[0].disposition,'course-excluded');assert.equal(out.bCourseTrace.at(-1).disposition,'maximum-reached');
});
test('official map must be full, explicit, unique and agree with every A-evaluated formal course',()=>{
 for(const mutate of [f=>f.officialCourses.pop(),f=>f.officialCourses[0].courseOfficial=false,
  f=>f.officialCourses[0].courseOfficial=1,f=>f.officialCourses[0].course=true,f=>f.officialCourses[0].boatNo=false,
  f=>f.officialCourses[0].course=2,f=>f.officialCourses[0].boatNo=2,
  f=>{[f.officialCourses[0].course,f.officialCourses[1].course]=[2,1];},
  f=>{Object.assign(f.execution.queue[0],{courseMappingFormal:false,courseSource:'boat-number-fallback'});}]) {
   const f=fixture();mutate(f);unknown(f);
 }
});
test('all queue rows must uniquely bind three positions in the same stored source, kind and scenario',()=>{
 const mutations=[f=>f.validation.branches.push(clone(f.validation.branches[0])),f=>f.validation.branches[1].source='base-formation:flow',
  f=>f.validation.branches[1].scenarioId='another',f=>f.validation.branches[1].kind='independent-scenario',
  f=>f.validation.branches[1].roles.push(clone(f.validation.branches[1].roles[0])),f=>f.validation.branches[2].qualified=false,
  f=>delete f.validation.observations[1].coverage,f=>f.validation.observations[1].physicalCoverage[0].role='pickup',
  f=>f.validation.observations[1].validIndependentBranchIds=['q1-p0'],f=>f.validation.observations[1].valid=false,
  f=>f.execution.queue[1].validationRef.index=0,f=>f.execution.queue[1].validationRef.index=undefined,
  f=>f.validation.observations[1].stage='pool-audit'];
 for(const mutate of mutations){const f=fixture();mutate(f);unknown(f);}
});
test('missing, false, null, nonfinite or string priorities never coerce to zero; explicit numeric zero remains valid',()=>{
 for(const value of [undefined,null,false,true,' ', '77',NaN,Infinity]) {
  const f=fixture();f.validation.branches[0].priorityScore=value;unknown(f);
 }
 const f=fixture();f.validation.branches[0].priorityScore=0;assert.equal(compare(f).status,'compared');
});
test('recorded priority must equal the maximum of the three saved positions',()=>{
 const f=fixture();f.validation.branches[1].priorityScore=94;f.validation.branches[2].priorityScore=91;
 assert(unknown(f).reasons.includes('RECORDED_PRIORITY_MAXIMUM_MISMATCH'));
});
test('duplicate queue tickets and A replay deviations cannot yield a partial B',()=>{
 for(const mutate of [f=>f.execution.queue.reverse(),f=>f.execution.queue[0].remainingSlotsBefore=0,
  f=>f.execution.before.usedTickets.reverse(),f=>f.execution.queue[0].disposition='course-excluded',
  f=>f.execution.afterPromotionTickets.reverse(),f=>f.execution.selectorFinalTickets.reverse(),
  f=>f.execution.observedFinalTickets.reverse(),f=>f.validation.finalSelectedTickets.reverse(),
  f=>{f.execution.queue[1].ticket=f.execution.queue[0].ticket;},
  f=>{f.execution.queue[1].courseEvaluated=true;}]){const f=fixture();mutate(f);unknown(f);}
 const dup=fixture({items:[['2-5-4',[60,99,90]],['2-5-4',[59,98,90]],['1-5-4',[70,97,90]]]});
 assert(unknown(dup).reasons.includes('DUPLICATE_OR_USED_QUEUE_TICKET'));
});
test('post-promotion transformations are not applicable and remain in the denominator with B=A',()=>{
 for(const key of ['transitions','postSelectorTransformations']){const f=fixture();f.execution[key].push({kind:'saved-transform'});
  const out=compare(f);assert.equal(out.status,'not-applicable');assert.deepEqual(out.B,out.A);assert.equal(out.includedInDenominator,true);
  assert(out.reasons.includes('POST_PROMOTION_TRANSFORMATION'));}
});
test('empty queues and already full before selections are explicit non-applicable observations, never dropped',()=>{
 for(const f of [fixture({items:[]}),fixture({count:10})]){const out=compare(f);assert.equal(out.status,'not-applicable');
  assert.deepEqual(out.B,out.A);assert.equal(out.includedInDenominator,true);}
});
test('invalid baseline is ineligible with no fabricated A/B; other missing or wrong-cohort inputs retain valid A',()=>{
 for(const baselineA of [undefined,[],['1-1-2'],['1-2-3','1-2-3'],Array(11).fill('1-2-3')]){
  const f=fixture();f.baselineA=baselineA;const out=compare(f);assert.equal(out.status,'ineligible');assert.equal(out.A,null);assert.equal(out.B,null);
 }
 for(const mutate of [f=>f.identity.method='b'.repeat(64),f=>f.identity.officialResultUsedForPrediction=true,
  f=>f.identity.predictionMode='post_deadline',f=>f.identity.deadlineAt=f.identity.selectedAt,
  f=>f.execution.executionCodeSha256='c'.repeat(64),f=>f.sourceRef=null,f=>f.sourceRef.path='../outside',
  f=>f.sourceRef.sha256='',f=>f.execution.status='unknown',f=>delete f.execution.postSelectorTransformations]){
   const f=fixture();mutate(f);unknown(f);
 }
});
test('role resolver consumes queue.validationRef directly without selected-only promotion flags',()=>{
 const f=fixture();for(const row of f.execution.queue){assert.equal(Object.hasOwn(row,'candidatePromotion'),false);
  const out=resolveQueueRolePriorities(row,f.validation);assert.equal(out.status,'bound');
  assert.equal(out.observationRef.index,row.validationRef.index);}
});
test('frozen inputs stay unchanged and results, odds and role scores cannot influence B',()=>{
 const f=fixture(),plain=compare(f),before=clone(f);freeze(f);assert.deepEqual(compare(f),plain);assert.deepEqual(f,before);
 const copy=clone(before);copy.result={ticket:'6-5-4',payout:999999};copy.odds={};copy.sourceRef.verified=true;
 for(const row of copy.execution.queue)Object.defineProperty(row,'odds',{get(){throw Error('odds read');}});
 for(const branch of copy.validation.branches){branch.roles[0].score=999;Object.defineProperty(branch,'result',{get(){throw Error('outcome read');}});}
 assert.deepEqual(compare(copy),plain);
 const result=compare(before);result.A.reverse();result.roleRefs[0].positions.first.priority=999;
 assert.deepEqual(before,fixture());
});
