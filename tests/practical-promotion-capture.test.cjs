'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {capture}=require('../scripts/practical-selection-evidence');
const diagnostic=require('../scripts/promotion-role-priority-diagnostic.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
 const ticket='1-2-5',ids=['p125-head','p125-hold','p125-pickup'];
 const roles=[{evaluationId:'head-1',boatNo:1,role:'alternate-head',position:1,priority:77,score:69},
  {evaluationId:'hold-2',boatNo:2,role:'hold',position:2,priority:95,score:80},
  {evaluationId:'pickup-5',boatNo:5,role:'pickup',position:3,priority:92,score:71}];
 const coverage=roles.map((r,i)=>({evaluationId:r.evaluationId,boatNo:r.boatNo,position:r.position,role:r.role,branchId:ids[i]}));
 const physicalCoverage=coverage.map((r,i)=>({...r,score:roles[i].score}));
 const observation={ticket,sourceCategory:'cover',stage:'selection',inputBranchIds:[...ids,'unknown-input'],
  valid:true,purchaseEligible:true,expansionEligible:false,validBranchIds:ids,
  validPurchaseBranchIds:ids,validIndependentBranchIds:[],validScenarioIds:['formal-3'],
  priorityScore:95,coverage,physicalCoverage};
 const promoted={ticket,candidatePromotion:true,selectionTier:'候補補完',category:'候補補完',sourceCategory:'cover',
  evidenceQualified:true,branchIds:ids,validBranchIds:ids,validPurchaseBranchIds:ids,
  validIndependentBranchIds:[],validScenarioIds:['formal-3'],priorityScore:95,coverage,physicalCoverage,
  purchaseEligible:true,expansionEligible:false};
 const branches=roles.map((r,i)=>({id:ids[i],ticket,scenarioId:'formal-3',source:'base-formation:cover',
  kind:'canonical-formation',qualified:true,priorityScore:r.priority,
  roles:[{evaluationId:r.evaluationId,boatNo:r.boatNo,role:r.role,eligiblePositions:[r.position],score:r.score}],
  evidenceChecks:[{key:'saved-role',matched:true,required:true,source:'official',boatNo:r.boatNo,role:r.role,score:r.score}]}));
 const baseline=[{ticket:'3-1-5'},promoted];
 const selection={status:'selected',tickets:clone(baseline),candidateValidationEvidence:{
  version:'candidate-validation-evidence-v1',status:'captured',resultUsedForGeneration:false,
  poolTickets:['3-1-5',ticket],finalSelectedTickets:['3-1-5',ticket],branches,
  observations:[{ticket:'3-1-5',stage:'pool-audit'},observation]}};
 const record={raceKey:'20300914-23-1',selectedAt:'2030-09-14T06:00:00Z',deadlineAt:'2030-09-14T07:00:00Z',
  reviewEvidence:{version:'race-review-evidence-v1',method:'a'.repeat(64),predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false}};
 return {record,baseline,selection};
}
test('ordinary capture preserves A while recording the unique saved priority source for all three positions',()=>{
 const f=fixture(),before=JSON.stringify(f),had=Object.hasOwn(globalThis,'ChappyPracticalSelection'),previous=globalThis.ChappyPracticalSelection;
 globalThis.ChappyPracticalSelection={select(){throw Error('capture must not reselect');}};
 let saved;try{saved=capture(f.record,f.baseline,f.selection);}finally{if(had)globalThis.ChappyPracticalSelection=previous;else delete globalThis.ChappyPracticalSelection;}
 const d=saved.promotionRolePriorityDiagnostic;
 assert.equal(saved.status,'captured');assert.deepEqual(saved.practicalTickets,['3-1-5','1-2-5']);
 assert.equal(d.action,'KEEP_A');assert.equal(d.alternativeTickets,null);assert.equal(d.rankingProposed,false);
 assert.equal(d.usableForPrediction,false);assert.equal(d.automaticApplication,false);assert.match(d.diagnosticCodeSha256,/^[a-f0-9]{64}$/);
 assert.equal(d.rows.length,1);assert.equal(d.rows[0].status,'bound');
 assert.deepEqual(['first','second','third'].map(key=>d.rows[0].positions[key].priority),[77,95,92]);
 assert.deepEqual(d.rows[0].maximum.positions,[2]);assert.equal(JSON.stringify(f),before);
 saved.promotionRolePriorityDiagnostic.rows[0].positions.first.priority=999;
 assert.equal(f.selection.tickets[1].priorityScore,95);assert.equal(JSON.stringify(f),before);
});
test('legacy set equality never promotes reversed or invalid-stage validation into a complete diagnostic',()=>{
 for(const mutate of [f=>f.selection.tickets.reverse(),f=>{f.selection.candidateValidationEvidence.status='invalid-or-unavailable';}]){
  const f=fixture();mutate(f);const before=JSON.stringify(f),saved=capture(f.record,f.baseline,f.selection),d=saved.promotionRolePriorityDiagnostic;
  assert.equal(saved.status,'captured');assert.deepEqual(saved.practicalTickets,['3-1-5','1-2-5']);
  assert.equal(d.action,'KEEP_A');assert.equal(d.alternativeTickets,null);assert.equal(d.rows.length,1);assert(d.rows.every(row=>row.status==='unknown'));
  assert.notEqual(d.status,'capture-error');assert.equal(JSON.stringify(f),before);
 }
});
test('diagnostic failures, wrong-purpose returns and cycles cannot block or change legacy capture',()=>{
 const original=diagnostic.diagnosePromotionRolePriorities;
 const flags={version:'promotion-role-priority-diagnostic-v1',purpose:'diagnostic-only',action:'KEEP_A',alternativeTickets:null,
  rankingProposed:false,resultUsedForGeneration:false,usableForPrediction:false,automaticApplication:false,rows:[]};
 for(const replacement of [()=>{throw Error('probe');},()=>({...flags,alternativeTickets:['6-5-4']}),()=>{const x={...flags};x.cycle=x;return x;}]){
  const f=fixture(),before=JSON.stringify(f);diagnostic.diagnosePromotionRolePriorities=replacement;
  try{const saved=capture(f.record,f.baseline,f.selection);assert.equal(saved.status,'captured');
   assert.deepEqual(saved.practicalTickets,['3-1-5','1-2-5']);assert.equal(saved.promotionRolePriorityDiagnostic.status,'capture-error');
   assert.equal(saved.promotionRolePriorityDiagnostic.action,'KEEP_A');assert.equal(saved.promotionRolePriorityDiagnostic.alternativeTickets,null);
   assert.equal(JSON.stringify(f),before);
  }finally{diagnostic.diagnosePromotionRolePriorities=original;}
 }
});

test('legacy projection cannot erase a generator diagnostic marker and create a final-A binding',()=>{
 const f=fixture();f.selection.candidateValidationEvidence.diagnostic={originalGeneratorSnapshot:{status:'captured'}};
 const before=JSON.stringify(f),saved=capture(f.record,f.baseline,f.selection),d=saved.promotionRolePriorityDiagnostic;
 assert.equal(saved.status,'captured');assert.deepEqual(saved.practicalTickets,['3-1-5','1-2-5']);
 assert.equal(saved.candidateValidationEvidence.status,'captured');
 assert.equal(Object.hasOwn(saved.candidateValidationEvidence,'diagnostic'),false,'legacy projection stays unchanged');
 assert.equal(d.status,'unknown');assert.equal(d.rows.length,1);assert.equal(d.rows[0].reason,'FINAL_VALIDATION_UNAVAILABLE');
 assert.equal(d.action,'KEEP_A');assert.equal(d.alternativeTickets,null);assert.equal(JSON.stringify(f),before);
});
