'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const candidate=require('./independent-autonomous-candidate.cjs'),context=require('./independent-judgment-context.cjs');
const flow=require('./independent-flow-roles-v1.cjs'),support=require('./independent-partner-context-v1.cjs'),selector=require('./independent-partner-selector-v1.cjs');
const report=require('./independent-partner-study-report.cjs');
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
function run(x){const input=candidate.officialInput(x.data,x.target,clock),c=context.capture(x.data,input),f=flow.judge(input,c),s=support.capture(x.data,input,c,x.source);
  return {input,context:c,flow:f,support:s,result:selector.judge(input,c,f,s)};}
function comparison(x,a,b,position=2){return x.result.comparisons.find(c=>c.a===a&&c.b===b&&c.position===position);}
test('supported flow generates the entire pool first and keeps both unresolved finishing orders',()=>{
  const x=run(fixture()),r=x.result;assert.equal(r.status,'selected');assert.equal(r.pool.length,20);
  assert.deepEqual(r.tickets,['1-2-3','1-3-2']);assert.equal(r.roles.length,6);assert(r.roles.every(r=>r.conditional&&r.turnOpeningObserved===false));
  assert.equal(r.selectionImplemented,true);assert.equal(r.fullJudgmentImplemented,false);assert.equal(r.usableForPrediction,false);
  assert(r.pool.filter(p=>!r.tickets.includes(p.ticket)).every(p=>p.dominatedBy.length));
  assert.equal(selector.validate(r,x.input,x.context,x.flow,x.support),true);
});
test('source file is hashed once and history is projected by registration and actual course',t=>{
  const x=fixture(),root=fs.mkdtempSync(path.join(os.tmpdir(),'partner-source-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data/stats'),{recursive:true});const raw=JSON.stringify(x.source.data)+'\n';fs.writeFileSync(path.join(root,support.SOURCE),raw);
  x.source=support.load(root);assert.equal(x.source.sha256,candidate.hash(raw));
  const permutation={1:4,2:5,3:1,4:6,5:3,6:2};
  x.data.entries.forEach(e=>e.boat=permutation[e.boat]);x.data.startExhibition.forEach(e=>e.boat=permutation[e.boat]);
  const r=run(x);assert.equal(r.result.head,4);assert.deepEqual(r.result.tickets,['4-5-1','4-1-5']);
  assert.equal(r.support.rows.find(r=>r.boat===4).recent.course,1);assert.equal(r.support.history.sha256,candidate.hash(raw));
  x.data.entries.reverse();x.data.startExhibition.reverse();assert.deepEqual(run(x).result,r.result);
});
test('missing, same-day and future history cannot become selection evidence',()=>{
  const mutations=[x=>x.source=null,x=>x.source.data.generatedAt='2030-10-06T02:00:00Z',x=>x.source.data.lastDate='20301006',
    x=>x.source.data.analysisWindow.latestDate='20301006',x=>x.source.data.source='unverified',x=>x.source.sha256='bad',
    x=>x.source.data.racers['5103'].registerNo='9999',x=>x.source.data.racers['5103'].windows.recent1Year.byCourse[3].starts=11,
    x=>x.data.entries[2].registerNo=null];
  for(const mutate of mutations){const x=fixture();mutate(x);const r=run(x);assert.equal(r.result.reason,'course-history-insufficient');assert.deepEqual(r.result.tickets,[]);}
});
test('history minimum is inherited and both windows are required; malformed counts are unknown',()=>{
  const x=fixture(),c=x.source.data.racers['5103'].windows.recent1Year.byCourse[3];c.starts=12;c.top3=10;
  assert.equal(run(x).result.status,'selected');c.starts=11;assert.equal(run(x).result.status,'skipped');
  c.starts=12;c.top3=13;assert.equal(run(x).support.rows[2].recent,null);
  delete x.source.data.racers['5104'].windows.previous2Years;assert.equal(run(x).support.rows[3].previous,null);
});
test('duplicate official registration cannot pass six-boat identity',()=>{
  const x=fixture();x.data.entries[1].registerNo=x.data.entries[0].registerNo;
  assert.equal(run(x).result.reason,'racer-identity-not-unique');
});
test('lower-stage skill cannot reverse start evidence and conflicts stop later tie-breaks',()=>{
  const x=fixture();x.source.data.racers['5104'].windows.recent1Year.byCourse[4].top3=30;
  x.source.data.racers['5104'].windows.previous2Years.byCourse[4].top3=30;
  let c=comparison(run(x),3,4);assert.equal(c.outcome,-1);assert.equal(c.decidingStage,'start');
  x.data.entries[3].officialStartRank.byCourse[4]=2;c=comparison(run(x),3,4);
  assert.equal(c.outcome,null);assert.equal(c.evaluated.length,1);
});
test('confirmed upper-stage ties reach course-specific skill, with contrary windows left unordered',()=>{
  const x=fixture();x.data.startExhibition[3].st=x.data.startExhibition[2].st;x.data.entries[3].exhibition.displayTime=x.data.entries[2].exhibition.displayTime;
  const racer=x.source.data.racers['5104'];racer.windows.recent1Year.byCourse[4].top3=23;racer.windows.previous2Years.byCourse[4].top3=23;
  let c=comparison(run(x),3,4);assert.equal(c.decidingStage,'skill');assert.equal(c.outcome,1);
  racer.windows.previous2Years.byCourse[4].top3=10;c=comparison(run(x),3,4);assert.equal(c.outcome,null);
  racer.windows.recent1Year.byCourse[4].top3=18;racer.windows.previous2Years.byCourse[4].top3=18;
  assert.equal(comparison(run(x),3,4).outcome,0,'different course numbers alone do not manufacture an ordering');
});
test('valid official lap evidence participates in exhibition, but does not prove a turn opening',()=>{
  const x=fixture('06'),url='https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php?day=20301006&race=5&kind=2';
  x.data.originalExhibition={status:'available',rowCount:6,sourceUrl:url};
  x.data.entries.forEach(e=>Object.assign(e.exhibition,{lapTime:36+e.boat/100,lapTimeSourceUrl:url}));
  x.data.startExhibition[3].st=x.data.startExhibition[2].st;x.data.entries[3].exhibition.lapTime=35;
  let r=run(x);assert.equal(r.support.lap.status,'available');assert.equal(comparison(r,3,4).decidingStage,'exhibition');
  assert.equal(comparison(r,3,4).outcome,null);assert.equal(r.support.lap.actualTurnOpeningObserved,false);
  x.data.entries[2].exhibition.lapTimeSourceUrl='https://example.invalid';r=run(x);
  assert.equal(r.support.lap.status,'unavailable');assert(r.support.rows.every(r=>r.lapTime===null));
});
test('all unresolved frontier tickets survive a seven-ticket skip; pressured inside boats remain candidates',()=>{
  const x=fixture();x.data.startExhibition.forEach(s=>s.st=.15);x.data.entries.forEach(e=>e.exhibition.displayTime=6.8);
  x.data.startExhibition[5].st=.05;x.data.entries[5].exhibition.displayTime=6.6;x.data.entries[5].officialStartRank.byCourse[6]=2;
  const r=run(x).result;assert.equal(r.head,6);assert.equal(r.pool.length,20);assert(r.roles.slice(0,5).every(r=>r.role==='inside-recovery'));
  assert.equal(r.reason,'ticket-frontier-exceeds-limit');assert.deepEqual(r.tickets,[]);assert(r.pool.every(p=>p.dominatedBy.length===0));
});
test('unresolved flow, F/L or missing rank never gets a fallback ticket',()=>{
  const x=fixture();x.data.startExhibition[5].marker='F';assert.equal(run(x).result.reason,'main-scenario-unresolved');
  x.data.startExhibition[5].marker='';x.data.entries[5].officialStartRank.byCourse[6]=null;
  assert.equal(run(x).result.reason,'course-start-rank-missing');
});
test('normal AI, odds and outcomes never enter inputs; motor, grade and local numbers do not reverse roles',()=>{
  const x=fixture(),before=run(x);Object.assign(x.data,{prediction:{tickets:['6-5-4']},result:{actual:'6-5-4'},odds:{x:999},historyContext:{head:6}});
  assert.deepEqual(run(x).result,before.result);
  x.data.entries.forEach(e=>Object.assign(e,{motor2Rate:99,localWinRate:9.9,nationalWinRate:9.9,className:'A1'}));
  assert.deepEqual(run(x).result.tickets,before.result.tickets);
  const after=run(x);after.support.rows[1].recent.top3=29;assert.throws(()=>selector.judge(after.input,after.context,after.flow,after.support),/partner_context/);
});
test('comparison citations resolve exact sealed facts and hashes; output tampering is rejected',()=>{
  const x=run(fixture());
  for(const c of x.result.comparisons)for(const s of c.evaluated)for(const ref of s.evidence){
    let v=(ref.source==='input'?x.input.rows:ref.source==='context'?x.context.officialEntries:x.support.rows).find(r=>r.boat===ref.boat);
    for(const k of ref.field.split('.'))v=v?.[k];assert.deepEqual(ref.value,v??null);
    assert.equal(ref.sourceHash,ref.source==='input'?x.flow.inputHash:ref.source==='context'?x.flow.contextHash:x.support.supportHash);
  }
  x.result.tickets=['6-5-4'];assert.throws(()=>selector.validate(x.result,x.input,x.context,x.flow,x.support),/replay/);
});
test('ticket report keeps all candidates and pairs only equal counts from the same sealed input',()=>{
  const x=run(fixture()),snapshot={input:x.input,selectedAt:new Date(clock).toISOString(),candidate:candidate.select(x.input),partnerStudy:{judgment:x.result}};
  const receipt={snapshot,snapshotHash:'b'.repeat(64),artifact:{confirmedAt:new Date(clock+2000).toISOString()}},cohort={rows:[receipt],rejected:{}},p={value:{},hash:'c'.repeat(64)},key=x.input.raceKey;
  let r=report.build(cohort,p,new Map(),new Set(),x=>x);assert.equal(r.pending.length,1);assert.equal(r.allCandidate.hitRate,null);
  const results=new Map([[key,{actual:'1-2-3',payout:1200}]]);r=report.build(cohort,p,results,new Set(),x=>x);
  assert.equal(r.allCandidate.hits,1);assert.equal(r.allCandidate.stake,200);assert.equal(r.allCandidate.returned,1200);assert.equal(r.paired.count,1);
  snapshot.candidate.tickets.push('1-2-4');r=report.build(cohort,p,results,new Set(),x=>x);
  assert.equal(r.paired.count,0);assert.equal(r.paired.notComparable['ticket-count-mismatch'],1);assert.equal(r.allCandidate.races,1);
  assert.equal(r.actualPurchase,false);assert.equal(r.usableForPrediction,false);
  r=report.build(cohort,p,results,new Set([key]),x=>x);assert.equal(r.excluded[0].reason,'conflicting_official_results');assert.equal(r.allCandidate.races,0);
  r=report.build(cohort,p,new Map([[key,{excluded:'refund-or-void'}]]),new Set(),x=>x);assert.equal(r.excluded[0].reason,'refund-or-void');
});
