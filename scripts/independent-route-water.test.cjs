'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const candidate=require('./independent-autonomous-candidate.cjs'),context=require('./independent-judgment-context.cjs');
const flow=require('./independent-flow-roles-v1.cjs'),support=require('./independent-partner-context-v1.cjs');
const old=require('./independent-partner-selector-v1.cjs'),selector=require('./independent-partner-selector-v2.cjs');
const water=require('./independent-route-water-v1.cjs'),report=require('./independent-route-water-report.cjs');
const clock=Date.parse('2030-10-06T01:00:00Z');
function fixture(jcd='14'){
  const target={jcd,raceNo:5,deadlineAt:'2030-10-06T01:20:00Z'};
  const data={ok:true,source:'boatrace-official',date:'20301006',stadiumCode:jcd,raceNo:5,fetchedAt:new Date(clock-1000).toISOString(),
    entryUrl:`https://www.boatrace.jp/owpc/pc/race/racelist?jcd=${jcd}&rno=5&hd=20301006`,
    beforeInfoUrl:`https://www.boatrace.jp/owpc/pc/race/beforeinfo?jcd=${jcd}&rno=5&hd=20301006`,
    entries:[1,2,3,4,5,6].map(boat=>({boat,registerNo:String(5100+boat),avgSt:.15,className:'B1',exhibition:{displayTime:6.7+boat/100},
      officialStartRank:{version:'official-course-start-rank-v1',status:'available',source:'boatrace-official-course',registerNo:String(5100+boat),
        sourceUrl:`https://www.boatrace.jp/owpc/pc/data/racersearch/course?toban=${5100+boat}`,sourceSha256:'a'.repeat(64),
        fetchedAt:new Date(clock-2000).toISOString(),population:'general-only-unconfirmed',referenceOnly:true,byCourse:{1:3,2:3,3:3,4:3,5:3,6:3}}})),
    startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:.1+boat/100,marker:'',mappingSource:'official-start-image'}))};
  const history={schemaVersion:1,source:'boatrace-official',generatedAt:'2030-10-05T01:00:00Z',firstDate:'20271006',lastDate:'20301005',
    analysisWindow:{latestDate:'20301005'},thresholds:{minimumSamples:12},racers:{}};
  for(const e of data.entries){const byCourse=Object.fromEntries([1,2,3,4,5,6].map(course=>[course,{course,starts:30,wins:5,top3:18,
    winningMethods:[{key:'差し',count:2,rate:40},{key:'逃げ',count:3,rate:60}]}]));
    history.racers[e.registerNo]={registerNo:e.registerNo,windows:{recent1Year:{byCourse:structuredClone(byCourse)},previous2Years:{byCourse:structuredClone(byCourse)}}};}
  return {data,target,source:{sha256:candidate.hash(JSON.stringify(history)),data:history}};
}
function ready(){const x=fixture();x.data.entries.forEach(e=>{e.local2Rate=30;e.local3Rate=50;});x.data.weather={windSpeed:3,waveHeight:2,windDirection:'横風'};return x;}
function run(x){const input=candidate.officialInput(x.data,x.target,clock),c=context.capture(x.data,input),f=flow.judge(input,c),s=support.capture(x.data,input,c,x.source),w=water.judge(input,c,f);
  return {input,context:c,flow:f,support:s,water:w,baseline:old.judge(input,c,f,s),result:selector.judge(input,c,f,s,w)};}
function tie(x,a=3,b=4){x.data.startExhibition[b-1].st=x.data.startExhibition[a-1].st;x.data.entries[b-1].exhibition.displayTime=x.data.entries[a-1].exhibition.displayTime;}
function pair(x,a=3,b=4,position=2){return x.result.comparisons.find(c=>c.a===a&&c.b===b&&c.position===position);}
test('routes describe conditional entry relationships and potential competition, never observed openings',()=>{
  const r=run(ready());assert.equal(r.water.routes.length,6);assert.equal(r.water.routes[1].path,'inside-follow');
  assert.deepEqual(r.water.routes[1].potentialCompetition,[1]);assert.equal(r.water.routes[2].adjacentInside,2);
  assert(r.water.routes.every(x=>x.actualTurnObserved===false&&x.unobserved.includes('turn-opening')));
  assert.deepEqual(r.result.tickets,r.baseline.tickets);assert.equal(r.result.routeWaterHash,r.water.evidenceHash);
  assert.equal(water.validate(r.water,r.input,r.context,r.flow),true);
});
test('makuri pressure preserves inside recovery and follows the actual adjacent outside course',()=>{
  const x=ready();x.data.startExhibition.forEach(s=>s.st=.15);x.data.entries.forEach(e=>e.exhibition.displayTime=6.8);
  x.data.startExhibition[3].st=.05;x.data.entries[3].exhibition.displayTime=6.6;x.data.entries[3].officialStartRank.byCourse[4]=2;
  let r=run(x);assert.equal(r.result.head,4);assert.equal(r.water.routes[4].path,'follow-attacker');assert.equal(r.water.routes[4].followsAttacker,4);
  assert(r.water.routes.slice(0,3).every(r=>r.path==='inside-recovery'&&r.pressureFrom[0]===4));
  assert(r.result.pool.some(p=>p.second===1));
  const permutation={1:5,2:4,3:6,4:2,5:1,6:3};
  x.data.entries.forEach(e=>e.boat=permutation[e.boat]);x.data.startExhibition.forEach(e=>e.boat=permutation[e.boat]);r=run(x);
  const pickup=r.water.routes.find(r=>r.boat===1);assert.equal(pickup.course,5);assert.equal(pickup.followsAttacker,2);
  x.data.entries.reverse();x.data.startExhibition.reverse();assert.deepEqual(run(x),r);
});
test('local references can break only confirmed upper-stage ties, before skill',()=>{
  const x=ready();tie(x);x.data.entries[3].local2Rate=40;x.data.entries[3].local3Rate=60;
  let r=run(x);assert.equal(pair(r).decidingStage,'localWater');assert.equal(pair(r).outcome,1);
  const h=x.source.data.racers['5103'];h.windows.recent1Year.byCourse[3].top3=30;h.windows.previous2Years.byCourse[3].top3=30;
  r=run(x);assert.equal(pair(r).decidingStage,'localWater');assert.equal(pair(r).outcome,1);
  x.data.entries[3].local2Rate=30;x.data.entries[3].local3Rate=50;r=run(x);
  assert.equal(pair(r).decidingStage,'skill');assert.equal(pair(r).outcome,-1);
});
test('start, exhibition and role decisions are never overturned by superior local numbers',()=>{
  const x=ready();x.data.entries[3].local2Rate=99;x.data.entries[3].local3Rate=99;
  assert.equal(pair(run(x)).decidingStage,'start');tie(x);x.data.entries[3].exhibition.displayTime=6.9;
  assert.equal(pair(run(x)).decidingStage,'exhibition');
  const y=ready();tie(y,2,3);y.data.entries[2].local2Rate=99;y.data.entries[2].local3Rate=99;
  assert.equal(pair(run(y),2,3).decidingStage,'remainPickup');assert.equal(pair(run(y),2,3).outcome,-1);
});
test('conflicting local evidence and unknown or all-zero histories stop lower-stage comparisons',()=>{
  const x=ready();tie(x);x.data.entries[3].local2Rate=40;x.data.entries[3].local3Rate=40;
  let r=run(x);assert.equal(pair(r).outcome,null);assert.equal(pair(r).decidingStage,'localWater');
  for(const rates of [[null,50],[0,0],[90,20]]){[x.data.entries[3].local2Rate,x.data.entries[3].local3Rate]=rates;
    r=run(x);assert.equal(r.water.local[3].status,'unknown');assert.equal(pair(r).outcome,null);
    assert(!pair(r).evaluated.some(s=>s.stage==='skill'));}
});
test('weather and tide are sealed shared facts, not fabricated boat adaptation scores',()=>{
  const x=ready(),before=run(x);assert.equal(before.water.water.status,'available');assert.equal(before.water.water.tide.status,'unknown');
  x.data.weather={windSpeed:0,waveHeight:0,windDirection:'無風',tideLevel:0,tideFlow:'干潮',liveTideAvailable:true};
  let r=run(x);assert.equal(r.water.water.direction,'calm');assert.equal(r.water.water.tide.level,0);assert.equal(r.water.water.tide.status,'available');
  assert.deepEqual(r.result.tickets,before.result.tickets);assert.equal(r.water.water.adaptationOrderingImplemented,false);
  x.data.weather={windSpeed:null,waveHeight:null,windDirection:'北西',tideLevel:12,liveTideAvailable:false};r=run(x);
  assert.equal(r.water.water.status,'incomplete');assert.equal(r.water.water.tide.level,null);assert.equal(r.water.water.direction,'unknown');
  assert.equal(r.water.local[0].sampleCount,null);assert.equal(r.water.local[0].period,null);
});
test('source citations replay exact facts and reject invented routes, rates and boat identities',()=>{
  const r=run(ready());for(const ref of [...r.water.routes.flatMap(x=>x.evidence),...r.water.local.flatMap(x=>x.evidence),...r.water.water.evidence]){
    let v=ref.boat===null?r.context:(ref.source==='input'?r.input.rows:r.context.officialEntries).find(x=>x.boat===ref.boat);
    for(const k of ref.field.split('.'))v=v?.[k];assert.deepEqual(ref.value,v??null);
    assert.equal(ref.sourceHash,ref.source==='input'?r.flow.inputHash:r.context.contextHash);
  }
  for(const mutate of [w=>w.routes[0].actualTurnObserved=true,w=>w.local[0].top2Rate=99,w=>w.routes[2].adjacentInside=6]){
    const w=structuredClone(r.water);mutate(w);assert.throws(()=>selector.judge(r.input,r.context,r.flow,r.support,w),/route_water_replay/);}
});
test('unresolved primary routes and over-limit frontiers stay skipped without numeric fallback',()=>{
  const x=ready();x.data.startExhibition[0].marker='F';let r=run(x);
  assert.equal(r.result.status,'skipped');assert(r.water.routes.every(r=>r.status==='unknown'&&r.path==='unresolved'));
  x.data.startExhibition.forEach(s=>{s.marker='';s.st=.1;});x.data.entries.forEach(e=>e.exhibition.displayTime=6.8);
  x.data.startExhibition[5].st=.01;x.data.entries[5].exhibition.displayTime=6.6;x.data.entries[5].officialStartRank.byCourse[6]=2;
  r=run(x);assert.equal(r.result.reason,'ticket-frontier-exceeds-limit');assert.equal(r.result.pool.length,20);assert.deepEqual(r.result.tickets,[]);
});
test('normal AI, odds, outcomes and higher engine or national figures cannot enter the new judgment',()=>{
  const x=ready(),before=run(x);Object.assign(x.data,{result:{actual:'6-5-4'},prediction:{tickets:['6-5-4']},odds:{x:999},localWaterTheoryV2:{score:100}});
  assert.deepEqual(run(x),before);x.data.entries.forEach(e=>{e.motor2Rate=99;e.nationalWinRate=9.9;});
  assert.deepEqual(run(x).result.tickets,before.result.tickets);
});
test('new report compares v2 to v1 on the same snapshot and equal count while preserving exclusions',()=>{
  const x=run(ready()),s={input:x.input,selectedAt:new Date(clock).toISOString(),candidate:{status:'selected',tickets:['6-5-4','6-4-5']},
    partnerStudy:{judgment:x.baseline},routeWaterStudy:{context:x.water,judgment:x.result}};
  const c={rows:[{snapshot:s,snapshotHash:'a'.repeat(64),artifact:{confirmedAt:new Date(clock+1000).toISOString()}}],rejected:{}},p={value:{},hash:'b'.repeat(64)},key=x.input.raceKey;
  const results=new Map([[key,{actual:'1-2-3',payout:1200}]]);let r=report.build(c,p,results,new Set(),x=>x);
  assert.equal(r.paired.baseline.hits,1);assert.equal(r.paired.net,0);assert.equal(r.allCandidate.stake,200);assert.equal(r.coverage.races,1);
  s.partnerStudy.judgment={status:'selected',tickets:['1-2-4','1-4-2']};r=report.build(c,p,results,new Set(),x=>x);
  assert.equal(r.paired.gained,1);assert.equal(r.paired.lost,0);
  s.partnerStudy.judgment.tickets=['1-2-3'];r=report.build(c,p,results,new Set(),x=>x);assert.equal(r.paired.notComparable['ticket-count-mismatch'],1);
  r=report.build(c,p,new Map(),new Set(),x=>x);assert.equal(r.pending.length,1);assert.equal(r.allCandidate.hitRate,null);
  r=report.build(c,p,results,new Set([key]),x=>x);assert.equal(r.excluded.length,1);assert.equal(r.allCandidate.races,0);
  r=report.build(c,p,new Map([[key,{excluded:'refund-or-void'}]]),new Set(),x=>x);assert.equal(r.excluded.length,1);
  assert.equal(r.actualPurchase,false);assert.equal(r.actualTurnObserved,false);assert.equal(r.usableForPrediction,false);
});
