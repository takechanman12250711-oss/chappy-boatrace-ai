"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {VERSION,diagnosePromotionRolePriorities:diagnose}=require("../scripts/promotion-role-priority-diagnostic.cjs");
const clone=value=>structuredClone(value);
function fixture(third=92){
 const parts=[1,5,4],roleNames=["head","hold","pickup"],priorities=[77,95,third],branchIds=["b1","b2","b3"];
 const claims=parts.map((boatNo,i)=>({evaluationId:"e"+(i+1),boatNo,position:i+1,role:roleNames[i],branchId:branchIds[i]}));
 const row={ticket:"1-5-4",candidatePromotion:true,category:"候補補完",selectionTier:"候補補完",sourceCategory:"flow",
  evidenceQualified:true,branchIds:[...branchIds],validBranchIds:[...branchIds],validPurchaseBranchIds:[...branchIds],
  validIndependentBranchIds:[],validScenarioIds:["canonical:1"],priorityScore:95,purchaseEligible:true,expansionEligible:false,
  coverage:clone(claims),physicalCoverage:claims.map(claim=>({...claim,score:40}))};
 const observation={ticket:row.ticket,sourceCategory:row.sourceCategory,stage:"selection",valid:true,
  // Invalid input IDs need not equal the post-validation branch IDs.
  inputBranchIds:["unqualified",...branchIds],purchaseEligible:true,expansionEligible:false,
  validBranchIds:[...branchIds],validPurchaseBranchIds:[...branchIds],validIndependentBranchIds:[],
  validScenarioIds:["canonical:1"],priorityScore:95,coverage:clone(row.coverage),physicalCoverage:clone(row.physicalCoverage)};
 const branches=parts.map((boatNo,i)=>({id:branchIds[i],ticket:row.ticket,scenarioId:"canonical:1",
  kind:"canonical-formation",source:"base-formation:flow",qualified:true,priorityScore:priorities[i],
  roles:[{evaluationId:"e"+(i+1),boatNo,role:roleNames[i],eligiblePositions:[i+1],score:99}]}));
 branches.push({id:"unqualified",qualified:false,priorityScore:100});
 const finalTickets=["1-2-3",row.ticket];
 return {identity:{raceKey:"20300925-03-2",selectedAt:"2030-09-25T00:00:00.000Z",
   deadlineAt:"2030-09-25T00:10:00.000Z",method:"b".repeat(64),predictionMode:"server_pre_deadline",officialResultUsedForPrediction:false},
  finalTickets,selectionTickets:[...finalTickets],selectionStatus:"selected",promotedRows:[row],
  validationSnapshot:{version:"candidate-validation-evidence-v1",status:"captured",resultUsedForGeneration:false,
   poolTickets:[...finalTickets],finalSelectedTickets:[...finalTickets],observations:[observation],branches}};
}
const first=input=>diagnose(input).rows[0];
function freeze(value){if(value&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
test("saved 77/95/92 and 77/95/83 branches bind position 2 as the maximum without proposing a ranking",()=>{
 for(const third of [92,83]){
  const f=fixture(third),before=clone(f),out=diagnose(f),row=out.rows[0];
  assert.equal(out.version,VERSION);assert.equal(out.purpose,"diagnostic-only");assert.equal(out.action,"KEEP_A");
  assert.equal(out.alternativeTickets,null);assert.equal(out.rankingProposed,false);assert.equal(out.resultUsedForGeneration,false);
  assert.equal(out.usableForPrediction,false);assert.equal(out.automaticApplication,false);assert.equal(out.productionChanged,false);
  assert.equal(row.status,"bound");assert.equal(row.recordedPriority,95);assert.equal(row.observationRef.index,0);
  assert.deepEqual(Object.values(row.positions).map(p=>p.priority),[77,95,third]);
  assert.deepEqual(row.positions.second,{boatNo:5,role:"hold",evaluationId:"e2",branchId:"b2",priority:95});
  assert.deepEqual(row.maximum,{priority:95,positions:[2],positionKeys:["second"]});
  assert.equal(row.recordedPriorityMatchesPositionMaximum,true);assert.deepEqual(f,before);
 }
});
test("binding ignores property insertion order and display category but preserves projected array order",()=>{
 const f=fixture(),row=f.promotedRows[0],obs=f.validationSnapshot.observations[0];
 row.category="表示用の別名";row.displayCategory="新本命";
 row.coverage=row.coverage.map(c=>Object.fromEntries(Object.entries(c).reverse()));
 row.physicalCoverage=row.physicalCoverage.map(c=>Object.fromEntries(Object.entries(c).reverse()));
 assert.equal(first(f).status,"bound");
 row.coverage.reverse();assert.equal(first(f).status,"unknown");
 row.coverage.reverse();obs.validBranchIds.reverse();assert.equal(first(f).status,"unknown");
});
test("recorded priority is retained separately when it differs from the positional maximum",()=>{
 const f=fixture();f.promotedRows[0].priorityScore=77;f.validationSnapshot.observations[0].priorityScore=77;
 const row=first(f);assert.equal(row.status,"bound");assert.equal(row.recordedPriority,77);
 assert.equal(row.maximum.priority,95);assert.equal(row.recordedPriorityMatchesPositionMaximum,false);
 // role.score and physicalCoverage.score are not substituted for branch priority.
 assert.equal(row.positions.first.priority,77);assert.notEqual(row.positions.first.priority,99);
});
test("duplicate matching observations, including different invalid input IDs, remain ambiguous",()=>{
 for(const change of [obs=>clone(obs),obs=>({...clone(obs),inputBranchIds:["different-invalid",...obs.validBranchIds]})]){
  const f=fixture();f.validationSnapshot.observations.push(change(f.validationSnapshot.observations[0]));
  assert.equal(first(f).status,"unknown");assert.equal(first(f).reason,"OBSERVATION_NOT_UNIQUE");
 }
 const f=fixture();f.validationSnapshot.observations[0].stage="pool-audit";
 assert.equal(first(f).status,"unknown");assert.equal(first(f).observationRef,null);
});
test("invalid promotion paths and missing projection fields cannot be made bound by a flag alone",()=>{
 for(const mutate of [f=>f.validationSnapshot.observations[0].valid=false,f=>f.promotedRows[0].evidenceQualified=false,
  f=>delete f.promotedRows[0].physicalCoverage,f=>delete f.promotedRows[0].validIndependentBranchIds,
  f=>f.validationSnapshot.observations[0].purchaseEligible=false,f=>delete f.validationSnapshot.observations[0].coverage]){
  const f=fixture();mutate(f);assert.equal(first(f).status,"unknown");
 }
});
test("different source/scenario/kind or duplicate branch references are not combined",()=>{
 for(const mutate of [f=>f.validationSnapshot.branches[1].source="base-formation:cover",
  f=>f.validationSnapshot.branches[1].scenarioId="canonical:3",
  f=>f.validationSnapshot.branches[1].kind="independent-scenario",
  f=>f.validationSnapshot.branches.push(clone(f.validationSnapshot.branches[1])),
  f=>f.validationSnapshot.branches[1].qualified=false,
  f=>f.validationSnapshot.observations[0].validScenarioIds.push("canonical:3")]){
  const f=fixture();mutate(f);assert.equal(first(f).status,"unknown");
 }
});
test("multi-role branches, role/evaluation conflicts and missing positions stay unknown",()=>{
 for(const mutate of [f=>f.validationSnapshot.branches[0].roles.push(clone(f.validationSnapshot.branches[1].roles[0])),
  f=>f.validationSnapshot.branches[0].roles[0].eligiblePositions=[1,2],
  f=>f.validationSnapshot.branches[1].roles[0].evaluationId="another-evaluation",
  f=>f.validationSnapshot.branches[1].roles[0].role="pickup",
  f=>f.validationSnapshot.branches[2].roles[0].boatNo=6,
  f=>f.validationSnapshot.branches[2].roles[0].eligiblePositions=[]]){
  const f=fixture();mutate(f);assert.equal(first(f).status,"unknown");
 }
});
test("missing, string, null, infinite and NaN priority values are never replaced with zero or role scores",()=>{
 for(const value of [undefined,null,"95",Infinity,NaN]){
  const f=fixture();f.validationSnapshot.branches[1].priorityScore=value;
  const row=first(f);assert.equal(row.status,"unknown");assert.equal(row.positions,null);assert.equal(row.maximum,null);
 }
 const f=fixture();delete f.promotedRows[0].priorityScore;
 assert.equal(first(f).recordedPriority,null);assert.equal(first(f).status,"unknown");
});
test("another observation cannot fill a missing third-position branch",()=>{
 const f=fixture(),row=f.promotedRows[0],obs=f.validationSnapshot.observations[0],other=clone(obs);
 row.branchIds=row.validBranchIds=row.validPurchaseBranchIds=["b1","b2"];
 obs.validBranchIds=obs.validPurchaseBranchIds=["b1","b2"];
 row.coverage=row.coverage.slice(0,2);obs.coverage=clone(row.coverage);
 row.physicalCoverage=row.physicalCoverage.slice(0,2);obs.physicalCoverage=clone(row.physicalCoverage);
 other.coverage=other.coverage.slice(2);other.validBranchIds=other.validPurchaseBranchIds=["b3"];
 f.validationSnapshot.observations.push(other);
 assert.equal(first(f).status,"unknown");assert.equal(first(f).reason,"POSITION_ROLE_UNAVAILABLE");
});
test("final A, raw selection and validation must have identical original order",()=>{
 for(const mutate of [f=>f.selectionTickets.reverse(),f=>f.validationSnapshot.finalSelectedTickets.reverse(),
  f=>f.finalTickets.push("1-4-5"),f=>f.selectionStatus="skipped",f=>f.promotedRows.push(clone(f.promotedRows[0])),
  f=>f.promotedRows[0].ticket="6-5-4"]){
  const f=fixture();mutate(f);assert.equal(first(f).status,"unknown");
 }
});
test("invalid or rescue-before snapshots are not unwrapped into a final binding",()=>{
 for(const mutate of [f=>{f.validationSnapshot={status:"invalid-or-unavailable",diagnostic:{originalGeneratorSnapshot:f.validationSnapshot}};},
  f=>{f.validationSnapshot.status="capture-error";},
  f=>{f.validationSnapshot.finalSelectedTickets=["1-2-3","1-3-4"];},
  f=>{f.validationSnapshot.diagnostic={originalGeneratorSnapshot:clone(f.validationSnapshot)};} ]){
  const f=fixture();mutate(f);assert.equal(first(f).status,"unknown");
 }
});
test("unknown identities and post-result modes cannot produce a bound diagnostic",()=>{
 for(const change of [{method:undefined},{raceKey:"20300925-25-2"},{selectedAt:"unknown"},{selectedAt:"2030-09-25T00:11:00Z"},
  {predictionMode:"retrospective"},{predictionMode:undefined},{officialResultUsedForPrediction:true},
  {officialResultUsedForPrediction:undefined}]){
  const f=fixture();Object.assign(f.identity,change);assert.equal(first(f).status,"unknown");assert.equal(first(f).reason,"IDENTITY_UNAVAILABLE");
 }
});
test("nonpromotion rows and missing inputs are explicit unknown; known empty promotions are not applicable",()=>{
 for(const mutate of [f=>f.promotedRows[0].candidatePromotion=false,f=>f.promotedRows[0].selectionTier="展開追加"]){
  const f=fixture();mutate(f);assert.equal(first(f).reason,"NOT_FINAL_PROMOTION");
 }
 const f=fixture();f.promotedRows=[];assert.equal(diagnose(f).status,"not-applicable");
 assert.equal(diagnose({}).status,"unknown");assert.equal(diagnose(null).status,"unknown");
});
test("frozen inputs are not changed and result/odds fields never influence the diagnosis",()=>{
 const f=fixture(),before=clone(f),expected=diagnose(f);assert.deepEqual(diagnose(freeze(f)),expected);assert.deepEqual(f,before);
 const g=fixture();g.actual="6-5-4";g.payout=100000;g.oddsByTicket={"1-5-4":99999};
 g.promotedRows[0].odds=99999;g.validationSnapshot.observations[0].result="1-5-4";
 Object.defineProperty(g,"officialResult",{get(){throw Error("result must not be read");}});
 assert.deepEqual(diagnose(g),expected);
});
test("equal position maxima are reported together, never resolved into an invented winner",()=>{
 const row=first(fixture(95));assert.equal(row.status,"bound");
 assert.deepEqual(row.maximum,{priority:95,positions:[2,3],positionKeys:["second","third"]});
});

test("actual four-field physical claims bind without synthesizing missing score or branchId",()=>{
 const f=fixture();
 for(const rows of [f.promotedRows[0].physicalCoverage,f.validationSnapshot.observations[0].physicalCoverage]){
  for(const claim of rows){delete claim.score;delete claim.branchId;}
 }
 const before=clone(f),row=first(f);
 assert.equal(row.status,"bound");assert.equal(row.positions.second.priority,95);
 assert.deepEqual(f,before);assert.ok(!Object.hasOwn(f.promotedRows[0].physicalCoverage[1],"score"));
});
test("contradictory physical roles or valid-path flags remain unknown even when raw and observation agree",()=>{
 for(const alter of [
  (row,obs)=>{row.physicalCoverage[1].evaluationId=obs.physicalCoverage[1].evaluationId="other";},
  (row,obs)=>{row.physicalCoverage[1].role=obs.physicalCoverage[1].role="pickup";},
  (row,obs)=>{row.physicalCoverage[1].branchId=obs.physicalCoverage[1].branchId="b3";},
  (row,obs)=>{row.purchaseEligible=obs.purchaseEligible=false;},
  (row,obs)=>{row.expansionEligible=obs.expansionEligible=true;},
  (row,obs)=>{row.validIndependentBranchIds=obs.validIndependentBranchIds=["b1"];}
 ]){
  const f=fixture();alter(f.promotedRows[0],f.validationSnapshot.observations[0]);
  assert.equal(first(f).status,"unknown");
 }
 const f=fixture();f.promotedRows[0].sourceCategory="longshot";f.validationSnapshot.observations[0].sourceCategory="longshot";
 for(const branch of f.validationSnapshot.branches.filter(b=>b.qualified))branch.source="base-formation:hole";
 assert.equal(first(f).status,"unknown");
 f.promotedRows[0].sourceCategory="hole";f.validationSnapshot.observations[0].sourceCategory="hole";
 assert.equal(first(f).status,"bound");
});
