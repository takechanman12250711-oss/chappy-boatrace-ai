'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {officialInput,select}=require('./independent-autonomous-candidate.cjs');
const context=require('./independent-judgment-context.cjs'),flow=require('./independent-flow-roles-v1.cjs');
const {build}=require('./independent-flow-study-report.cjs');
const clock=Date.parse('2030-10-06T01:00:00Z'),target={jcd:'14',raceNo:5,deadlineAt:'2030-10-06T01:20:00Z'};
function fixture(){
  const data={ok:true,source:'boatrace-official',date:'20301006',stadiumCode:'14',raceNo:5,fetchedAt:new Date(clock-1000).toISOString(),
    entryUrl:'https://www.boatrace.jp/owpc/pc/race/racelist?jcd=14&rno=5&hd=20301006',
    beforeInfoUrl:'https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=14&rno=5&hd=20301006',
    entries:[1,2,3,4,5,6].map(boat=>({boat,registerNo:String(5100+boat),avgSt:.15,className:'B1',
      exhibition:{displayTime:6.7+boat/100},officialStartRank:{version:'official-course-start-rank-v1',status:'available',
        source:'boatrace-official-course',registerNo:String(5100+boat),sourceUrl:`https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${5100+boat}`,
        sourceSha256:'a'.repeat(64),fetchedAt:new Date(clock-2000).toISOString(),population:'general-only-unconfirmed',referenceOnly:true,
        byCourse:{1:3,2:3,3:3,4:3,5:3,6:3}}})),
    startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:.1+boat/100,marker:'',mappingSource:'official-start-image'}))};
  return data;
}
function run(data){const input=officialInput(data,target,clock),c=context.capture(data,input);return {input,context:c,result:flow.judge(input,c)};}
function attack(data,boat){data.startExhibition[boat-1].st=.05;data.entries[boat-1].exhibition.displayTime=data.entries[boat-2].exhibition.displayTime-.1;
  data.entries[boat-1].officialStartRank.byCourse[boat]=2.5;}
test('escape uses actual inside course and preserves all conditional role alternatives',()=>{
  const d=fixture(),r=run(d).result;assert.equal(r.decision.actor,1);assert.equal(r.decision.scenarioId,'escape:1');
  assert.equal(r.scenarios.find(s=>s.id==='escape:1').roles.find(x=>x.boat===2).role,'inside-remain');
  assert.deepEqual(r.stages.map(s=>s.stage),flow.STAGES);assert.deepEqual(r.tickets,[]);assert.equal(r.selectionImplemented,false);
  const permute={1:4,2:2,3:3,4:1,5:6,6:5};
  d.entries.forEach(e=>e.boat=permute[e.boat]);d.startExhibition.forEach(e=>e.boat=permute[e.boat]);
  const changed=run(d).result;assert.equal(changed.decision.actor,4);assert.equal(changed.decision.scenarioId,'escape:4');
});
test('adjacent advantage alone cannot clear a faster inner wall',()=>{
  const d=fixture();attack(d,4);d.startExhibition[0].st=.04;
  const r=run(d).result,p=r.pressures.find(x=>x.boat===4),s=r.scenarios.find(x=>x.id==='makuri:4');
  assert.equal(p.signal,true);assert.equal(s.status,'blocked');assert.deepEqual(s.wallBoats,[1]);
  assert.equal(s.roles.find(x=>x.boat===1).role,'wall-remain');assert.notEqual(r.decision.actor,4);
});
test('supported outer route retains inside recovery and adjacent pickup as conditional roles',()=>{
  const d=fixture();attack(d,4);const r=run(d).result,s=r.scenarios.find(x=>x.id==='makuri:4');
  assert.equal(r.decision.scenarioId,'makuri:4');assert.equal(s.roles.find(x=>x.boat===1).role,'inside-recovery');
  assert.equal(s.roles.find(x=>x.boat===2).role,'pressured-inside');
  assert.deepEqual(s.roles.find(x=>x.boat===2).positions,[2,3]);
  assert.equal(s.roles.find(x=>x.boat===5).role,'pickup-outside-attacker');
  assert.equal(s.roles.find(x=>x.boat===5).status,'conditional');
  assert.equal(r.scenarios.find(x=>x.id==='makuri-sashi:5').leadAttacker,4);
});
test('two supported attackers stay unresolved instead of selecting by boat number or motor',()=>{
  const d=fixture();attack(d,3);attack(d,5);d.startExhibition[4].st=.04;
  const r=run(d).result;assert.equal(r.decision.actor,null);assert.equal(r.decision.reason,'competing-supported-scenarios');
});
test('rank and display boundaries preserve unknowns and do not promote strict general-race super',()=>{
  const d=fixture();attack(d,4);let r=run(d).result;
  assert.equal(r.pressures[2].displayGap,.1);assert.equal(r.pressures[2].rankGap,.5);assert.equal(r.pressures[2].signal,true);
  d.entries[3].officialStartRank.byCourse[4]=2.51;assert.equal(run(d).result.pressures[2].signal,false);
  d.entries[3].officialStartRank.byCourse[4]=null;r=run(d).result;assert.equal(r.pressures[2].signal,null);assert.equal(r.decision.actor,null);
  assert.equal(r.decision.reason,'incomplete-pressure-evidence');assert.equal(r.strictSuperConfirmed,false);
  d.entries[3].officialStartRank.byCourse[4]=2.5;d.entries[3].officialStartRank.fetchedAt='2030-10-05T17:00:00.000Z';
  assert.equal(run(d).result.pressures[2].signal,null,'same-day but stale source cannot support a flow decision');
});
test('F/L markers and unavailable turn openings never become supported tactical claims',()=>{
  const d=fixture();attack(d,4);d.startExhibition[5].marker='F';const r=run(d).result;
  assert.equal(r.decision.actor,null);assert.equal(r.decision.reason,'exhibition-start-marker');
  const clean=run(fixture()).result;
  assert(clean.scenarios.filter(s=>['sashi','makuri-sashi'].includes(s.type)).every(s=>s.status==='conditional'));
});
test('later numeric fields, normal AI, odds, outcomes and input ordering cannot change roles',()=>{
  const d=fixture();attack(d,4);const a=run(d),before=JSON.stringify(a.input);
  d.entries.forEach(e=>{e.motor2Rate=99;e.nationalWinRate=9.9;e.localWinRate=9.9;e.className='A1';e.score=999;});
  Object.assign(d,{prediction:{head:6,tickets:['6-5-4']},odds:{'6-5-4':999},result:{actual:'6-5-4'},historyContext:{head:6}});
  const b=run(d);assert.deepEqual(b.result.decision,a.result.decision);
  assert.deepEqual(b.result.scenarios.map(s=>[s.id,s.status,s.roles.map(r=>[r.boat,r.role,r.status])]),a.result.scenarios.map(s=>[s.id,s.status,s.roles.map(r=>[r.boat,r.role,r.status])]));
  d.entries.reverse();d.startExhibition.reverse();assert.deepEqual(run(d).result,b.result);
  assert.equal(JSON.stringify(a.input),before);assert.equal(flow.validate(a.result,a.input,a.context),true);
  a.result.scenarios[0].roles[0].role='invented';assert.throws(()=>flow.validate(a.result,a.input,a.context),/replay/);
});
test('every evidence reference resolves to the exact sealed value and source hash',()=>{
  const {input,context:c,result:r}=run(fixture());
  const refs=[...r.pressures.flatMap(p=>[...p.evidence,...p.walls.flatMap(w=>w.evidence)]),...r.scenarios.flatMap(s=>[...s.evidence,...s.roles.flatMap(x=>x.evidence)])];
  for(const ref of refs){let v=(ref.source==='input'?input.rows:c.officialEntries).find(x=>x.boat===ref.boat);
    for(const key of ref.field.split('.'))v=v?.[key];assert.deepEqual(ref.value,v??null);
    assert.equal(ref.sourceHash,ref.source==='input'?r.inputHash:r.contextHash);}
});
test('forward report separates missing/void/conflicting results and never claims ticket ROI or actual tactics',()=>{
  const x=run(fixture()),snapshot={input:x.input,selectedAt:new Date(clock).toISOString(),candidate:select(x.input),flowStudy:{judgment:x.result}};
  const receipt={snapshot,snapshotHash:'b'.repeat(64),artifact:{confirmedAt:new Date(clock+2000).toISOString()}},cohort={rows:[receipt],rejected:{}};
  const p={value:{method:flow.VERSION},hash:'c'.repeat(64)},key=x.input.raceKey;
  let r=build(cohort,p,new Map(),new Set(),x=>x);assert.equal(r.pending.length,1);assert.equal(r.headReference.matchRate,null);
  r=build(cohort,p,new Map([[key,{actual:'1-2-3'}]]),new Set(),x=>x);assert.equal(r.headReference.matches,1);assert.equal(r.sameInputHeadComparison.paired,1);
  assert.equal(r.roleObservations.second['inside-remain'],1);assert.equal(r.roleObservations.third.unresolved,1);
  assert.equal(r.ticketPerformanceAvailable,false);assert.equal(r.actualTacticsInferred,false);assert.equal(r.usableForPrediction,false);
  r=build(cohort,p,new Map([[key,{excluded:'refund-or-void'}]]),new Set(),x=>x);assert.equal(r.excluded.length,1);assert.equal(r.headReference.settled,0);
  r=build(cohort,p,new Map([[key,{actual:'1-2-3'}]]),new Set([key]),x=>x);assert.equal(r.excluded[0].reason,'conflicting_official_results');
});
