'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const benchmark=require('../scripts/build-fixed-head-baseline.cjs');
const preview=require('../scripts/note-reader-preview.cjs');
const {fixture}=require('../scripts/note-independent-monitor-fixture');
const sha='a'.repeat(64);
const row=(overrides={})=>({raceKey:'20261115-24-1',selectedAt:'2026-11-15T09:00:00Z',
  generation:'g1',source:'daily-primary',head:2,selected:['2-1-3','2-1-4'],
  actual:'1-2-4',payout:1000,practicalHit:false,...overrides});
const audit=rows=>({version:'escape-main-audit-v1',analysisInputContract:'official-pre-deadline-cohort-v1',total:{races:rows.length},rows});
function bundle(){
  const b=fixture(); b.version='note-draft-bundle-v1';delete b.monitor;delete b.record.source;
  b.article.format='formation-v4';
  b.record.prediction.mainSheet={honmei:{boatNo:1},tickets:['1-2-3','1-2-4'],
    coverTickets:['2-1-3'],flowTickets:['1-2-3','1-2-4','1-2-5']};
  b.record.prediction.manshuSheet={tickets:['5-1-2']};
  b.record.prediction.verificationEvidence={mainScenario:{type:'escape',label:'1号艇逃げ',headBoatNo:1,attackerBoatNo:1}};
  b.article.paidText='🔥 実戦厳選\n\n・1-2-34\n\n計 2点\n\n本命とは別会計の参考予想\n1 → 2 → 3\n4 → 1 → 2';
  return b;
}
test('fixed benchmark uses the same stake and cannot inspect the winning ticket',()=>{
  const a=benchmark.evaluate(row()),b=benchmark.evaluate(row({actual:'2-1-3',practicalHit:true}));
  assert.equal(a.stakeYen,200);assert.equal(a.ticketCount,2);assert.equal(b.stakeYen,200);
  assert.equal(a.fixedReturnYen,1000);assert.equal(a.currentReturnYen,0);
  assert.equal(b.currentReturnYen,1000);assert.equal(b.fixedReturnYen,0);
  assert.deepEqual(benchmark.FIXED_ORDER.slice(0,2),['1-2-3','1-2-4']);
  assert.equal(benchmark.FIXED_ORDER.length,20);assert.equal(new Set(benchmark.FIXED_ORDER).size,20);
});
test('paired summary exposes gained and lost hits, generations and negative ROI',()=>{
  const r=benchmark.build(audit([row(),row({raceKey:'20261115-24-2',generation:'g2',actual:'2-1-3',practicalHit:true})]),{sourceSha256:sha});
  assert.equal(r.total.stakeYen,400);assert.equal(r.total.paired.currentOnlyHits,1);assert.equal(r.total.paired.fixedOnlyHits,1);
  assert.equal(r.byGeneration.g1.races,1);assert.equal(r.byGeneration.g2.races,1);
  assert.equal(r.productionChanged,false);assert.equal(r.usableForPrediction,false);
  assert.equal(benchmark.summarize([]).current.roi,null);
  assert.equal(benchmark.summarize([benchmark.evaluate(row())]).current.profitYen,-200);
});
test('missing payouts, invalid captures, duplicate races and inconsistent prior hits fail closed',()=>{
  for(const bad of [row({payout:null}),row({payout:0}),row({selectedAt:'bad'}),row({practicalHit:true}),row({selected:['1-1-2']}),row({selected:['1-2-3','1-2-3']})])
    assert.throws(()=>benchmark.build(audit([bad]),{sourceSha256:sha}),/invalid/);
  assert.throws(()=>benchmark.build(audit([row(),row()]),{sourceSha256:sha}),/duplicate_race/);
});
test('preview shows one main selection and no flow/center appendix or duplicate ticket',()=>{
  const b=bundle(),before=JSON.stringify(b),r=preview.build(b,{sourceSha256:sha});
  assert.deepEqual(r.centralTickets,['1-2-3','1-2-4']);
  assert.deepEqual(r.groups.map(g=>[g.label,g.tickets.length]),[['🎯 本命',2],['追加候補',2],['穴候補（配当未確認）',1],['参考予想（別集計）',1]]);
  assert.equal(r.primaryCount,5);assert.equal(r.referenceOriginalCount,2);assert.equal(r.referenceOverlapCount,1);
  const shown=r.groups.flatMap(g=>g.tickets);assert.equal(new Set(shown).size,shown.length);
  assert.doesNotMatch(r.text,/🌊 流し|⭐ 中心の買い目|いちばん自信/);
  assert.equal(JSON.stringify(b),before);assert.equal(r.publishable,false);assert.equal(r.previewOnly,true);
});
test('saved structured scenario works without accepting unrelated stale prose',()=>{
  const b=bundle();b.article.allRangeGroups=[{key:'main',reason:'本命は5号艇。'}];
  assert.equal(preview.build(b,{sourceSha256:sha}).explanationVerified,true);
  assert.doesNotMatch(preview.build(b,{sourceSha256:sha}).text,/本命は5号艇/);
  b.record.prediction.verificationEvidence.mainScenario.headBoatNo=5;
  assert.equal(preview.build(b,{sourceSha256:sha}).explanationVerified,false);
});
test('preview refuses swapped baseline copies, unknown scenarios and missing source identity',()=>{
  const b=bundle();b.article.practicalTickets=[{ticket:'2-1-3'}];
  assert.throws(()=>preview.build(b,{sourceSha256:sha}),/mismatch/);
  assert.throws(()=>preview.build(bundle()),/source_hash/);
  const c=bundle();c.record.prediction.verificationEvidence.mainScenario.type='unknown';
  assert.equal(preview.build(c,{sourceSha256:sha}).explanationVerified,false);
});
