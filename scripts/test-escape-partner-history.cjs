'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const r=require('./research-escape-partners.cjs');
const profile={samples:40,second:{3:30,2:10},third:{4:40},pairs:{'3-4':30,'2-4':10},from:'20260101',through:'20260927'};
function row() {
  const pool=['1-2-4','1-3-4','1-2-5','4-1-3'];
  return {raceKey:'20260928-24-8',date:'20260928',jcd:'24',method:'method:a',baseline:['1-2-4','1-2-5','4-1-3'],pool,
    courses:{1:1,2:2,3:3,4:4,5:5,6:6},evidence:{status:'validated',stageHistory:{candidateDecisions:pool.map(ticket=>({
      ticket,priorityScore:ticket==='1-2-5'?90:80,reasonCode:ticket==='1-2-5'?'INDEPENDENT_SCENARIO':'CANDIDATE_ONLY_EVALUATION',
      branchIds:['saved-branch'],physicalCoverage:[{boatNo:Number(ticket[0]),position:1,role:'head'},{boatNo:Number(ticket[2]),position:2,role:'hold'}]
    }))}}};
}
function official(actual='1-3-4') {
  const order=[...actual.split('-').map(Number),...[1,2,3,4,5,6].filter(n=>!actual.split('-').map(Number).includes(n))];
  return {date:'20260927',jcd:'24',raceNo:8,source:'boatrace-official',resultAvailable:true,status:'finished',winningMethod:'逃げ',
    trifecta:{combination:actual,payout:1500},starts:[1,2,3,4,5,6].map(n=>({boat:n,course:n,falseStart:false,lateStart:false})),
    finishers:order.map((boat,i)=>({boat,rank:i+1}))};
}
test('history uses complete official escape finishes and actual courses',()=>{
  assert.equal(r.historicalRace(official()).second,3);
  const moved=official('2-3-4'); moved.starts[0].course=2;moved.starts[1].course=1;
  assert.equal(r.historicalRace(moved).second,3,'course one may be boat two');
  for(const change of [x=>x.source='unofficial',x=>x.winningMethod='抜き',x=>x.void=true,x=>x.starts[0].falseStart=true,
    x=>x.starts[1].course=1,x=>x.finishers.pop(),x=>x.finishers[0].rank=2,x=>x.resultAvailable=false]) {
    const o=official(); change(o);assert.equal(r.historicalRace(o),null);
  }
});
test('date cutoff excludes same-day and future outcomes and deduplicates races',()=>{
  const old=r.historicalRace(official()), today={...old,raceKey:'20260928-24-8',date:'20260928'}, future={...old,raceKey:'20260929-24-8',date:'20260929'};
  assert.equal(r.historyBefore([old,old,today,future],'20260928','24').samples,1);
  assert.equal(r.historyBefore([old],'20260928','13').samples,0);
});
test('history only breaks a saved priority tie; preserves head counts and independent tickets',()=>{
  const input=row(), before=JSON.stringify(input), selected=r.select(input,profile);
  assert.deepEqual(selected.control,input.baseline);
  assert.deepEqual(selected.candidate,['1-3-4','1-2-5','4-1-3']);
  assert.equal(selected.historyChangedControl,true);
  assert.equal(JSON.stringify(input),before);
  const lower=row(); lower.evidence.stageHistory.candidateDecisions[1].priorityScore=79;
  assert.deepEqual(r.select(lower,profile).candidate,lower.baseline,'historical frequency cannot override higher scenario priority');
  assert.deepEqual(r.select(row(),{...profile,samples:29}).candidate,row().baseline,'thin history has no effect');
});
test('unscored or ungrounded partners cannot enter, conflicting evidence rejects',()=>{
  const ungrounded=row(); ungrounded.evidence.stageHistory.candidateDecisions[1].physicalCoverage[1].boatNo=6;
  assert.deepEqual(r.select(ungrounded,profile).candidate,ungrounded.baseline);
  const conflict=row(); conflict.evidence.stageHistory.candidateDecisions.push({...conflict.evidence.stageHistory.candidateDecisions[0],priorityScore:99});
  assert.equal(r.select(conflict,profile).reason,'conflicting-saved-priority');
  const missing=row();missing.evidence=null;assert.equal(r.select(missing,profile).reason,'selection-evidence-unavailable');
});
test('comparison retains lost hits, equal stakes, pending and method separation',()=>{
  const a={...row(),sourceSha256:'a',sourcePath:'original-a',selectedAt:'2026-09-28T11:00:00Z'};
  const b={...a,raceKey:'20260928-24-9',method:'method:b'}, c={...a,raceKey:'20260928-24-10'};
  const history=Array.from({length:40},(_,i)=>({...r.historicalRace(official()),raceKey:'historical-'+i}));
  const resultA={...official(),date:'20260928'},resultB={...official('1-2-4'),date:'20260928',raceNo:9};
  const report=r.build([a,b,c],history,new Map([[a.raceKey,resultA],[b.raceKey,resultB]]));
  assert.equal(report.total.versusBaseline.gainedHits,1);assert.equal(report.total.versusBaseline.lostHits,1);
  assert.equal(report.total.versusBaseline.netHits,0);
  assert.equal(report.total.baseline.stake,report.total.candidate.stake);
  assert.equal(report.pending.length,1);assert.equal(Object.keys(report.byMethod).length,2);
  assert.equal(report.byVenue.length,24);assert.equal(report.productionChanged,false);
  assert.equal(report.contract.asOfAvailabilityProven,false);
  assert.equal(report.decisionGate.status,'INSUFFICIENT_EVIDENCE');
  assert.equal(r.summarize([]).candidate.hitRate,null);
});
test('priority and history effects stay separate, with lost hits and exclusive miss stages',()=>{
  const rows=[
    {raceKey:'gain',actual:'1-4-2',payout:1000,baseline:['1-4-3'],control:['1-4-2'],candidate:['1-4-3']},
    {raceKey:'loss',actual:'1-2-3',payout:500,baseline:['1-2-3'],control:['1-3-2'],candidate:['1-2-3']},
    {raceKey:'head',actual:'2-1-3',payout:900,baseline:['1-2-3'],control:['1-3-2'],candidate:['1-2-3']}
  ];
  for (const row of rows) Object.assign(row,r.preservePairCoverage(row.baseline,row.control));
  const before=JSON.stringify(rows), report=r.summarize(rows), a=report.selectionComparisons.priorityVsSaved;
  assert.deepEqual([a.gainedHits,a.lostHits,a.netHits],[1,1,0]);
  assert.deepEqual(a.stagesBefore,{'third-missing':1,hit:1,'head-missing':1});
  assert.deepEqual(a.stagesAfter,{hit:1,'second-missing':1,'head-missing':1});
  assert.deepEqual(a.gained[0],{raceKey:'gain',actual:'1-4-2',beforeStage:'third-missing',afterStage:'hit',removed:['1-4-3'],added:['1-4-2']});
  assert.equal(a.lost[0].raceKey,'loss');
  const b=report.selectionComparisons.historyVsPriority;
  assert.equal(b.gained[0].raceKey,'loss'); assert.equal(b.lost[0].raceKey,'gain');
  assert.equal(report.baseline.stake,report.control.stake);
  assert.equal(report.control.stake,report.candidate.stake);
  assert.equal(JSON.stringify(rows),before);
  assert.equal(r.summarize([]).selectionComparisons.priorityVsSaved.races,0);
});
test('pair guard uses saved coverage only and does not hardcode boat one or look at outcomes',()=>{
  const saved=['2-4-1','2-3-5','6-1-2'];
  const removed=['2-4-1','2-5-3','6-1-2'];
  const before=JSON.stringify([saved,removed]);
  assert.deepEqual(r.preservePairCoverage(saved,removed),{guarded:saved,pairGuardApplied:true,removedPairs:['2-3']});
  const thirdChange=['2-4-5','2-3-1','6-1-2'];
  assert.deepEqual(r.preservePairCoverage(saved,thirdChange),{guarded:thirdChange,pairGuardApplied:false,removedPairs:[]});
  assert.equal(JSON.stringify([saved,removed]),before);
  const selected=r.select(row(),profile);
  assert.equal(selected.guarded.length,selected.baseline.length);
  assert.deepEqual(selected.guarded,selected.control);
});
test('guard reports both rescued and sacrificed hits instead of treating protected pairs as success',()=>{
  const saved=['2-3-4','2-4-5'], proposed=['2-4-1','2-4-5'];
  const rows=['2-3-4','2-4-1'].map((actual,i)=>({raceKey:String(i),actual,payout:1000,
    baseline:saved,control:proposed,candidate:proposed,...r.preservePairCoverage(saved,proposed)}));
  const report=r.summarize(rows);
  assert.equal(report.pairGuardAppliedRaces,2);
  assert.equal(report.selectionComparisons.guardedVsPriority.gainedHits,1);
  assert.equal(report.selectionComparisons.guardedVsPriority.lostHits,1);
  assert.equal(report.selectionComparisons.guardedVsPriority.netHits,0);
  assert.equal(report.baseline.stake,report.guarded.stake);
});
