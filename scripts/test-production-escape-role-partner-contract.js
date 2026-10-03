'use strict';
const assert=require('node:assert/strict');
const api=require('../js/practical-selection');
const plan=api.planEscapeRolePartnerReplacement;
function fixture(){
 const source={ticket:'1-4-6',priorityScore:90,category:'展開候補',validPurchaseBranchIds:['flow-a'],coverage:[
  {position:1,boatNo:1,role:'head',branchId:'flow-a'},
  {position:2,boatNo:4,role:'hold',branchId:'flow-a'},
  {position:3,boatNo:6,role:'pickup',branchId:'flow-a'}]};
 return {selected:[{ticket:'1-2-3',priorityScore:50,category:'押さえ'},
  {ticket:'1-2-4',priorityScore:50,category:'押さえ'},
  {ticket:'1-4-3',priorityScore:40,category:'本線'},
  {ticket:'1-3-4',priorityScore:40,category:'流し'},
  {ticket:'1-3-5',priorityScore:40,category:'流し'},
  {ticket:'1-2-5',priorityScore:70,category:'押さえ'}],
  candidates:[{row:source,validation:{valid:true,purchaseEligible:true}}],trim:{eligible:true,applied:true},
  context:{courseMappingFormal:true,courseByBoat:new Map([1,2,3,4,5,6].map(n=>[n,n])),primaryAttackerBoatNo:1,
   branchesById:new Map([['flow-a',{id:'flow-a',kind:'canonical-formation',qualified:true,ticket:'1-4-6',headBoatNo:1,attackerBoatNo:1,scenarioId:'canonical:1',source:'base-formation:flow'}]])}};
}
function run(f){return plan(f.selected,f.candidates,f.trim,f.context)}
let n=0;const test=(name,body)=>{body();n++;};
test('protect basic/main/flow and replace one slot',()=>{const f=fixture(),r=run(f);assert.equal(r.removedRow.ticket,'1-2-5');assert.equal(r.sourceRow.ticket,'1-4-6');assert.equal(r.selectedIndex,5)});
test('does not mutate input',()=>{const f=fixture(),s=JSON.stringify(f);run(f);assert.equal(JSON.stringify(f),s)});
test('no strong trim means no replacement',()=>{const f=fixture();f.trim.eligible=false;assert.equal(run(f),null)});
test('existing provisional course model is respected',()=>{const f=fixture();f.context.courseMappingFormal=false;assert.ok(run(f))});
test('boat one outside fails closed',()=>{const f=fixture();f.context.courseByBoat.set(1,2);f.context.courseByBoat.set(2,1);assert.equal(run(f),null)});
test('missing course for boat one fails closed',()=>{const f=fixture();f.context.courseByBoat.delete(1);f.context.evaluationsByBoat=new Map();assert.equal(run(f),null)});
test('two roles from different branches are not combined',()=>{const f=fixture();f.candidates[0].row.coverage[2].branchId='other';assert.equal(run(f),null)});
test('no third-place claim',()=>{const f=fixture();f.candidates[0].row.coverage.pop();assert.equal(run(f),null)});
test('role labels alone are not branch evidence',()=>{const f=fixture();f.candidates[0].row.roleLabels=f.candidates[0].row.coverage;f.candidates[0].row.coverage=[];assert.equal(run(f),null)});
test('wrong boat in role claim',()=>{const f=fixture();f.candidates[0].row.coverage[2].boatNo=5;assert.equal(run(f),null)});
test('unqualified branch',()=>{const f=fixture();f.context.branchesById.get('flow-a').qualified=false;assert.equal(run(f),null)});
test('invalid candidate',()=>{const f=fixture();f.candidates[0].validation.valid=false;assert.equal(run(f),null)});
test('candidate not purchase-eligible',()=>{const f=fixture();f.candidates[0].validation.purchaseEligible=false;assert.equal(run(f),null)});
test('equal priority does not replace',()=>{const f=fixture();f.candidates[0].row.priorityScore=70;assert.equal(run(f),null)});
test('lower priority does not replace',()=>{const f=fixture();f.candidates[0].row.priorityScore=60;assert.equal(run(f),null)});
test('string priority not silently interpreted',()=>{const f=fixture();f.candidates[0].row.priorityScore='99';assert.equal(run(f),null)});
test('missing category not erased to unlock base',()=>{const f=fixture();f.selected[5].category='';assert.equal(run(f),null)});
test('duplicate base rejected',()=>{const f=fixture();f.selected.push(f.selected[0]);assert.equal(run(f),null)});
test('already selected candidate not added twice',()=>{const f=fixture();f.selected[5].ticket='1-4-6';assert.equal(run(f),null)});
test('independent candidate does not replace canonical partner',()=>{const f=fixture();f.context.branchesById.get('flow-a').kind='independent-scenario';assert.equal(run(f),null)});
test('unrelated result/odds fields not consumed',()=>{const f=fixture();Object.defineProperty(f.candidates[0].row,'result',{get(){throw Error('result leakage')}});Object.defineProperty(f.candidates[0].row,'odds',{get(){throw Error('odds leakage')}});assert.ok(run(f))});
test('future live forecast can activate',()=>{assert.equal(api.escapeRolePartnerActive({deadlineAt:new Date(Date.now()+86400000).toISOString()}),true)});
test('historical forecast stays unchanged',()=>{assert.equal(api.escapeRolePartnerActive({deadlineAt:'2026-08-12T10:00:00Z'}),false)});
test('missing deadline fails closed',()=>{assert.equal(api.escapeRolePartnerActive({}),false)});
test('post-result forecast never activates',()=>{assert.equal(api.escapeRolePartnerActive({deadlineAt:new Date(Date.now()+86400000).toISOString(),officialResultUsedForPrediction:true}),false)});
test('replay must be requested explicitly',()=>{assert.equal(api.escapeRolePartnerActive({}, {escapeRolePartner:'replay'}),true)});
test('role-specific branches with same scenario are accepted',()=>{const f=fixture();const b={...f.context.branchesById.get('flow-a'),id:'flow-third'};f.context.branchesById.set(b.id,b);f.candidates[0].row.validPurchaseBranchIds.push(b.id);f.candidates[0].row.coverage[2].branchId=b.id;assert.ok(run(f));b.scenarioId='canonical:4';assert.equal(run(f),null)});
console.log(JSON.stringify({tests:n,passed:n,policy:api.ESCAPE_ROLE_PARTNER_POLICY.id}));
