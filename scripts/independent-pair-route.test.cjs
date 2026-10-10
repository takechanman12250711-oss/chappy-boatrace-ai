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

const diagnostic=require('./independent-pair-route-diagnostic-v1.cjs');
const diagReport=require('./independent-pair-route-report.cjs');
const args=r=>[r.input,r.context,r.flow,r.support,r.water,r.result];
const diagnose=r=>diagnostic.judge(...args(r));
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
test('all 20 ordered pairs reference the same source without changing tickets or declaring compatibility',()=>{
  const r=run(ready()),before=structuredClone(r);freeze(r);const d=diagnose(r);
  assert.equal(d.status,'available');assert.equal(d.pairs.length,20);assert.equal(new Set(d.pairs.map(p=>p.pairKey)).size,20);
  assert.equal(diagnostic.validate(d,...args(r)),true);assert.deepEqual(r,before);
  assert.deepEqual(d.sourceTickets,r.result.tickets);assert.equal(d.selectionHash,candidate.hash(JSON.stringify(r.result)+'\n'));
  for(const p of d.pairs){assert.notEqual(p.second,p.third);assert.notEqual(p.head,p.second);assert.notEqual(p.head,p.third);
    assert(d.pairs.some(q=>q.second===p.third&&q.third===p.second));
    assert.equal(p.compatibility,'unknown');assert.equal(p.actualTurnObserved,false);
    assert.equal(p.selectedBySource,r.result.tickets.includes(p.head+'-'+p.second+'-'+p.third));
    assert.equal(p.secondRouteRef.value.boat,p.second);assert.equal(p.secondRouteRef.value.course,p.secondCourse);
    assert.equal(p.thirdRoleRef.value.boat,p.third);assert.equal(p.selectionPoolMembership,'evaluated');}
  const p=d.pairs.find(p=>p.second===3&&p.third===4);
  assert.equal(p.relations.sameZone.value,true);assert.equal(p.relations.secondListsThirdAsCompetition.value,true);
  assert.equal(p.compatibility,'unknown');assert.equal(d.pairs.filter(p=>p.relations.sameZone.value).length,12);
  for(const [k,v] of Object.entries(diagnostic.SAFETY))assert.equal(d[k],v);
  const {diagnosticHash,...body}=d;assert.equal(diagnosticHash,candidate.hash(JSON.stringify(body)+'\n'));
});
test('every nested reference resolves exact source hash, pointer and value',()=>{
  const r=run(ready()),d=diagnose(r),sources={input:r.input,context:r.context,flow:r.flow,support:r.support,routeWater:r.water,selection:r.result};
  const hashes={input:d.inputHash,context:d.contextHash,flow:d.flowHash,support:d.supportHash,routeWater:d.routeWaterHash,selection:d.selectionHash};
  let count=0;function walk(v){if(!v||typeof v!=='object')return;
    if(v.pointer!==undefined){let value=sources[v.source];for(const k of v.pointer.slice(1).split('/'))value=value[k];
      assert.equal(v.sourceHash,hashes[v.source]);assert.deepEqual(v.value,value);count++;return;}
    Object.values(v).forEach(walk);}
  walk(d);assert(count>500);
  const changed=structuredClone(d);changed.pairs[0].secondRoute.path='invented';
  const {diagnosticHash,...body}=changed;changed.diagnosticHash=candidate.hash(JSON.stringify(body)+'\n');
  assert.throws(()=>diagnostic.validate(changed,...args(r)),/diagnostic_replay/);
});
test('makuri, moved boat numbers and reordered source arrays retain actual courses and pressure direction',()=>{
  const x=ready();x.data.startExhibition.forEach(s=>s.st=.15);x.data.entries.forEach(e=>e.exhibition.displayTime=6.8);
  x.data.startExhibition[3].st=.05;x.data.entries[3].exhibition.displayTime=6.6;x.data.entries[3].officialStartRank.byCourse[4]=2;
  let d=diagnose(run(x));assert.equal(d.head,4);assert.equal(d.pairs.length,20);
  let p=d.pairs.find(p=>p.second===1&&p.third===2);assert.deepEqual(p.relations.sharedPressureSources.value,[4]);
  assert.equal(p.relations.secondUnderPressureFromThird.value,false);assert.deepEqual(p.secondRoute.pressureFrom,[4]);
  assert.equal(d.pairs.find(p=>p.second===5).secondRoute.followsAttacker,4);
  const permutation={1:5,2:4,3:6,4:2,5:1,6:3};
  x.data.entries.forEach(e=>e.boat=permutation[e.boat]);x.data.startExhibition.forEach(e=>e.boat=permutation[e.boat]);
  d=diagnose(run(x));assert.equal(d.head,2);p=d.pairs.find(p=>p.second===1&&p.third===5);
  assert.equal(p.secondCourse,5);assert.equal(p.secondRoute.followsAttacker,2);assert.equal(p.thirdCourse,1);
  x.data.entries.reverse();x.data.startExhibition.reverse();assert.deepEqual(diagnose(run(x)),d);
});
test('early history skips have 20 diagnostic pairs but no invented pool or purchase eligibility',()=>{
  const x=ready();x.source=null;const r=run(x),d=diagnose(r);
  assert.equal(r.result.reason,'course-history-insufficient');assert.equal(r.result.pool.length,0);
  assert.equal(d.pairs.length,20);assert(d.pairs.every(p=>p.selectionPoolMembership==='not-evaluated'&&p.selectionPoolRef===null&&!p.selectedBySource));
  assert.deepEqual(d.sourceTickets,[]);assert.equal(d.status,'available');
});
test('unresolved scenario is unavailable, while late frontier skip retains evaluated pair refs',()=>{
  const x=ready();x.data.startExhibition[0].marker='F';let d=diagnose(run(x));
  assert.equal(d.status,'unavailable');assert.equal(d.expectedPairCount,null);assert.equal(d.scenarioId,null);
  assert.equal(d.head,null);assert.deepEqual(d.pairs,[]);assert.equal(d.reason,'main-scenario-unresolved');
  x.data.startExhibition.forEach(s=>{s.marker='';s.st=.1;});x.data.entries.forEach(e=>e.exhibition.displayTime=6.8);
  x.data.startExhibition[5].st=.01;x.data.entries[5].exhibition.displayTime=6.6;x.data.entries[5].officialStartRank.byCourse[6]=2;
  d=diagnose(run(x));assert.equal(d.sourceSelectionReason,'ticket-frontier-exceeds-limit');
  assert.equal(d.pairs.length,20);assert(d.pairs.every(p=>p.selectionPoolRef&&!p.selectedBySource));
});
test('invalid upstream hashes, scenarios, identities and missing source fields fail closed',()=>{
  const r=run(ready());
  for(const change of [r=>r.water.scenarioId='other',r=>r.water.routes[0].boat=2,r=>delete r.water.routes[1].pressureFrom,
    r=>r.result.inputHash='a'.repeat(64),r=>r.result.pool.pop(),r=>r.result.tickets=['6-5-4'],r=>r.flow.decision.actor=6]){
    const bad=structuredClone(r);change(bad);assert.throws(()=>diagnose(bad));}
  const bad=diagnose(r);bad.pairs[0].secondRouteRef.pointer='/routes/5';
  assert.throws(()=>diagnostic.validate(bad,...args(r)),/diagnostic_replay/);
});
test('report separates race/pair units, skips, unavailable and invalid without inventing performance',()=>{
  const a=ready(),b=ready(),c=ready();b.source=null;c.data.startExhibition[0].marker='F';
  const rows=[a,b,c].map((x,i)=>{const r=run(x);return {snapshot:{selectedAt:'2030-10-06T01:00:00Z',pairRouteDiagnosticStudy:{protocolHash:'fixed',diagnostic:diagnose(r)}},
    snapshotHash:String(i),artifact:{id:i+1,confirmedAt:'2030-10-06T01:00:01Z'}};});
  let q=diagReport.build({rows,rejected:{}},{value:{},hash:'fixed'});
  assert.deepEqual(q.raceCounts,{sealed:3,available:2,unavailable:1});assert.equal(q.pairCounts.total,40);
  assert.equal(q.pairCounts.poolEvaluated,20);assert.equal(q.pairCounts.poolNotEvaluated,20);
  assert.equal(q.pairCounts.sameZone.true,24);assert.equal(q.pairCounts.sameZone.false,16);
  assert.equal(q.sourceSelectionSkips['course-history-insufficient'],1);assert.equal(q.unavailableReasons['main-scenario-unresolved'],1);
  assert(!('performance' in q));assert(!('hitRate' in q));assert.equal(q.source.complete,true);
  q=diagReport.build({rows:[],rejected:{pair_route_diagnostic_replay_mismatch:1}},{value:{},hash:'fixed'});
  assert.equal(q.status,'incomplete');assert.equal(q.invalidRecords,1);assert.equal(q.source.complete,false);
  q=diagReport.build({rows:[],rejected:{}},{value:{},hash:'fixed'});assert.equal(q.status,'not-yet-collected');
});
