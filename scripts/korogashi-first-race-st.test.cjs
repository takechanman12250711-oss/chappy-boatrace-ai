'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const report=require('./build-korogashi-first-race-st.cjs');
const input=require('./analysis-input-contract');
const clone=value=>JSON.parse(JSON.stringify(value));
const period={from:'20261117',to:'20261118'};
const iso=(date,hour,minute=0)=>`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+09:00`;
const generation=(logic='fixture-logic')=>({logicFingerprint:logic,confidenceDefinitionVersion:'confidence-v1',ticketPolicyVersion:'tickets-v1'});
function prediction({date='20261117',rno=1,hour=10,formal=true,attacker=3,logic='fixture-logic',tickets=['1-2-3','1-3-2'],kind='primary-prediction'}={}) {
  const record={date,jcd:'15',raceNo:rno,raceKey:`${date}-15-${rno}`,selectedAt:iso(date,hour-1),deadlineAt:iso(date,hour),
    __analysisInputKind:kind,officialResultUsedForPrediction:false,officialResultUsedForEvaluation:false,
    prediction:{preRaceConditions:{schemaVersion:4,source:'boatrace-official',sourceTiming:'pre_deadline',
      officialResultUsed:false,sourceFetchedAt:iso(date,hour-1)},practicalTickets:tickets,
      practicalSelection:{tickets:clone(tickets),purchaseDecision:{status:'unchanged'}},
      verificationEvidence:{generation:generation(logic),roles:{attackerBoatNo:attacker},
        stSlit:{roles:[{boatNo:attacker,isFormal:formal,score:1},{boatNo:6,isFormal:false,score:99}]}}}};
  return record;
}
function official(record,{combination='1-2-3',payout=1200,...more}={}) {
  return {date:record.date,jcd:record.jcd,raceNo:record.raceNo,raceKey:record.raceKey,__analysisInputKind:'official-result',
    source:'boatrace-official',resultAvailable:true,status:'finished',void:false,checkedAt:iso(record.date,22),
    trifecta:{combination,payout},finishers:combination.split('-').map((boat,index)=>({boat:Number(boat),rank:index+1})),...more};
}
const fixedIds=b=>b.selectionRows.map(row=>({raceKey:row.raceKey,baseline:row.baseline,candidate:row.candidate,generationKey:row.generationKey}));
function proxyIds(b){return b.generations.map(group=>({generationKey:group.generationKey,rows:group.dailyFirstProxy.rows.map(({date,baselineKey,candidateKey})=>({date,baselineKey,candidateKey}))}));}
function row(record){return {...record,__analysisRaceKey:record.raceKey};}

test('strict attacker-matching formal flag is the single B predicate, with complete original tickets retained',()=>{
  const p=prediction();assert.equal(report.classify(p).baseline,true);assert.equal(report.classify(p).candidate,true);
  for(const value of [false,'true',1,undefined,null]) {
    const changed=clone(p);changed.prediction.verificationEvidence.stSlit.roles[0].isFormal=value;
    changed.prediction.verificationEvidence.stSlit.roles[1].isFormal=true;
    changed.prediction.verificationEvidence.stSlit.roles[0].appliedToScore=true;
    changed.prediction.verificationEvidence.stSlit.roles[0].status='advantage';
    assert.equal(report.classify(changed).baseline,true);
    assert.equal(report.classify(changed).candidate,false,`unrelated formal role and ${String(value)} cannot qualify the attacker`);
  }
  const original=JSON.stringify(p);report.build([p,official(p)],period);assert.equal(JSON.stringify(p),original);
});

test('raw original ticket limits and format do not silently shrink to a passing cohort',()=>{
  const seven=['1-2-3','1-2-4','1-2-5','1-2-6','1-3-2','1-3-4','1-3-5'];
  assert.equal(report.classify(prediction({tickets:seven})).baseline,true);
  for(const tickets of [[],[...seven,'1-3-6'],[...seven,'invalid'],[...seven,seven[0]],['1-1-2'],['1-2-3','bad']])
    assert.equal(report.classify(prediction({tickets})).baseline,false,`invalid original ${JSON.stringify(tickets)}`);
  const skipped=prediction();skipped.prediction.practicalSelection.purchaseDecision.status='skip';
  assert.equal(report.classify(skipped).baseline,false);
});

test('projection retains envelope-only pre-race contracts and all relevant rejection flags',()=>{
  const p=prediction();p.preRaceConditions=p.prediction.preRaceConditions;delete p.prediction.preRaceConditions;
  assert.equal(input.preDeadlineReason(p),'');assert.equal(input.preDeadlineReason(report.compact(p)),'');
  assert.deepEqual(report.classify(report.compact(p)),report.classify(p));
  for(const [location,field,value] of [['root','officialResultUsedForPrediction',true],['root','isRetrospective',true],
    ['prediction','officialResultUsedForEvaluation',true],['prediction','predictionMode','retrospective']]) {
    const changed=clone(p);(location==='root'?changed:changed.prediction)[field]=value;
    assert.equal(input.preDeadlineReason(report.compact(changed)),input.preDeadlineReason(changed));
    assert.notEqual(input.preDeadlineReason(changed),'');
  }
});

test('full records and compact records have identical A/B and daily first selections',()=>{
  const a=prediction({rno:1,formal:false}),b=prediction({rno:2,hour:11}),c=prediction({date:'20261118'});
  const records=[a,b,c,official(a),official(b),official(c)],before=JSON.stringify(records);
  const full=report.build(records,period),compact=report.build(records.map(r=>r.__analysisInputKind==='official-result'?clone(r):report.compact(r)),period);
  assert.deepEqual(fixedIds(compact),fixedIds(full));assert.deepEqual(proxyIds(compact),proxyIds(full));
  assert.deepEqual(compact.pooled,full.pooled);assert.equal(JSON.stringify(records),before);
});

test('canonical primary priority and latest saved capture are independent of winning outcome',()=>{
  const primary=prediction(),verification=prediction({formal:false,kind:'verification-prediction'});
  const late=prediction({formal:false});late.selectedAt=iso(late.date,9,5);late.prediction.preRaceConditions.sourceFetchedAt=late.selectedAt;
  assert.equal(report.canonical([verification,primary])[0].prediction.verificationEvidence.stSlit.roles[0].isFormal,true);
  assert.equal(report.canonical([primary,late])[0].selectedAt,late.selectedAt);
  assert.equal(report.canonical([late,primary])[0].selectedAt,late.selectedAt);
});

test('earliest missing result stays selected instead of falling through to a later winner',()=>{
  const first=prediction({rno:1}),later=prediction({rno:2,hour:11});
  const built=report.build([later,official(later),first],period),proxy=built.pooled.dailyFirstProxy.rows[0];
  assert.equal(proxy.baselineKey,first.raceKey);assert.equal(proxy.candidateKey,first.raceKey);
  assert.equal(proxy.baseline.status,'result-unknown');assert.equal(proxy.candidate.status,'result-unknown');
  assert.equal(proxy.profitDifferenceYen,null);assert.equal(built.pooled.dailyFirstProxy.pairedSettledDays,0);
  assert.equal(built.pooled.dailyFirstProxy.incompleteSelectedDays,1);
  assert.equal(built.pooled.baseline.selected,2);assert.equal(built.pooled.baseline.settled,1);
});

test('selection IDs and first IDs do not change when results disappear, winners change, or input order changes',()=>{
  const a=prediction({rno:1,formal:false}),b=prediction({rno:2,hour:11}),c=prediction({date:'20261118',rno:3,hour:12});
  const predictions=[a,b,c],normal=report.build([...predictions,...predictions.map(p=>official(p))],period);
  const altered=report.build([...predictions.slice().reverse(),...predictions.map(p=>official(p,{combination:'6-5-4',payout:99000})).reverse()],period);
  const missing=report.build(predictions,period);
  const ids=b=>fixedIds(b).sort((l,r)=>l.raceKey.localeCompare(r.raceKey));
  assert.deepEqual(ids(altered),ids(normal));assert.deepEqual(ids(missing),ids(normal));
  assert.deepEqual(proxyIds(altered),proxyIds(normal));assert.deepEqual(proxyIds(missing),proxyIds(normal));
});

test('each generation and each day chooses its own deadline-ordered first before the result join',()=>{
  const a=prediction({rno:1,logic:'generation-a'}),b=prediction({rno:2,hour:11,logic:'generation-b'}),
    c=prediction({date:'20261118',rno:3,hour:12,logic:'generation-a'});
  const built=report.build([b,c,a,official(b),official(c)],period);
  assert.equal(built.generations.length,2);
  const ga=built.generations.find(g=>g.generationKey.includes('generation-a'));
  const gb=built.generations.find(g=>g.generationKey.includes('generation-b'));
  assert.equal(ga.dailyFirstProxy.rows[0].baselineKey,a.raceKey);assert.equal(ga.dailyFirstProxy.rows[0].baseline.status,'result-unknown');
  assert.equal(gb.dailyFirstProxy.rows[0].baselineKey,b.raceKey);
  assert.equal(ga.dailyFirstProxy.rows[1].baselineKey,c.raceKey);
  assert(built.review.blockers.includes('multiple-or-unknown-generations'));
});

test('equal deadlines use raceKey ordering and no-candidate days are explicitly present',()=>{
  const a=prediction({rno:1}),b=prediction({rno:2,formal:false});
  const built=report.build([b,a,official(a),official(b)],period),first=built.pooled.dailyFirstProxy.rows;
  assert.equal(first[0].baselineKey,a.raceKey);assert.equal(first[0].candidateKey,a.raceKey);
  assert.equal(first[1].baselineKey,null);assert.equal(first[1].candidateKey,null);
  assert.equal(built.pooled.dailyFirstProxy.noCandidateSelectionDays,1);
});

test('settled stake and payout use 100 yen per unchanged original ticket',()=>{
  const p=prediction(),hit=report.settlement(row(p),new Map([[p.raceKey,official(p,{payout:1200})]]));
  assert.equal(hit.status,'settled');assert.equal(hit.ticketCount,2);assert.equal(hit.stakeYen,200);assert.equal(hit.returnYen,1200);
  const miss=report.settlement(row(p),new Map([[p.raceKey,official(p,{combination:'6-5-4',payout:1200})]]));
  assert.equal(miss.hit,false);assert.equal(miss.returnYen,0);assert.equal(miss.stakeYen,200);
  const s=report.summary([hit,miss]);assert.equal(s.stakeYen,400);assert.equal(s.returnYen,1200);assert.equal(s.roi,300);
  assert.equal(s.profitYen,800);assert.equal(s.hitRate,50);
});

test('special result evidence stays excluded even without a winning combination',()=>{
  const p=prediction();
  for(const change of [{status:'void',void:true,trifecta:null,finishers:[]},{status:'void'},
    {refunds:[2],trifecta:null,finishers:[]},{deadHeat:true},{refund:true},{refunded:true},
    {starts:[{boat:2,marker:'F'}]},{starts:[{boat:2,marker:'L'}]},
    {starts:[{boat:2,falseStart:true}]},{starts:[{boat:2,lateStart:true}]}]) {
    const result=official(p,change);
    assert.equal(report.settlement(row(p),new Map([[p.raceKey,result]])).status,'special-result-excluded');
  }
});

test('pending, noninteger and coercible-invalid payouts cannot become a settled result',()=>{
  const p=prediction();
  const cases=[official(p,{status:'pending'}),...[-1,0,1.5,true,Infinity].map(payout=>official(p,{payout}))];
  for(const result of cases)assert.notEqual(report.settlement(row(p),new Map([[p.raceKey,result]])).status,'settled');
});

test('finished result with contradictory winning ticket and finishers is not settled',()=>{
  const p=prediction(),result=official(p,{finishers:[{rank:1,boat:6},{rank:2,boat:5},{rank:3,boat:4}]});
  assert.notEqual(report.settlement(row(p),new Map([[p.raceKey,result]])).status,'settled');
});

test('unknowns do not acquire zero-loss totals, and frozen protocol keeps research separate from production',()=>{
  const empty=report.summary([]),unknown=report.summary([{status:'result-unknown'}]);
  assert.equal(empty.roi,null);assert.equal(empty.hitRate,null);assert.equal(empty.totalProfitYen,null);
  assert.equal(unknown.totalProfitYen,null);assert.equal(unknown.roi,null);assert.equal(unknown.settled,0);
  assert.equal(report.protocol.explored.to,'20261116');assert.equal(report.protocol.validation.from,'20261117');
  assert.equal(report.protocol.validation.to,'20261118');
  assert.equal(report.protocol.productionChanged,false);assert.equal(report.protocol.automaticApplication,false);
  assert.equal(report.protocol.usableForPrediction,false);
  const dates=report.datesBetween('20261116','20261118');assert.deepEqual(dates,['20261116','20261117','20261118']);
  const p=prediction(),built=report.build([p,official(p)],period);
  assert.equal(built.review.productionAdoptionAllowed,false);
  assert(built.review.blockers.some(b=>b.endsWith('below-minimum')));
});


test('conflicting formal role is diagnosed without changing the frozen some-true candidate definition',()=>{
  const p=prediction();p.prediction.verificationEvidence.stSlit.roles.push({boatNo:3,isFormal:false});
  const c=report.classify(p);assert.equal(c.baseline,true);assert.equal(c.candidate,true);assert.equal(c.stConflicting,true);
  const b=report.build([p,official(p)],period);assert.equal(b.pooled.stConflicting,1);
  assert(b.review.blockers.includes('st-role-conflicting'));assert.equal(b.review.productionAdoptionAllowed,false);
});

test('missing attacker/ST evidence and missing generation remain explicit research blockers',()=>{
  const p=prediction();delete p.prediction.verificationEvidence.roles.attackerBoatNo;
  delete p.prediction.verificationEvidence.generation.ticketPolicyVersion;
  const c=report.classify(p);assert.equal(c.baseline,true);assert.equal(c.candidate,false);assert.equal(c.stEvidence,'unknown');
  const built=report.build([p,official(p)],period);assert.equal(built.pooled.stEvidence.unknown,1);
  assert(built.review.blockers.includes('st-selection-unknown'));assert(built.review.blockers.includes('multiple-or-unknown-generations'));
});
