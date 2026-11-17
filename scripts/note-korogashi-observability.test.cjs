'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs');
const k=require('./note-korogashi-lifecycle.cjs');
const {receiptRow}=require('./note-marketing-content');
const {fixture:original}=require('./note-independent-monitor-fixture');
const clone=x=>JSON.parse(JSON.stringify(x));
const time=hour=>Date.parse(`2026-09-28T${hour}:00:00+09:00`);
const ctx={runId:'123',runAttempt:'1',headSha:'a'.repeat(40)};
function fixture(rno=6,hour=16,payout=1001) {
  const b=original(), now=time(hour), key=`20260928-15-${rno}`;
  b.record.raceKey=key;b.record.raceNo=rno;b.monitor.raceKey=key;
  b.record.selectedAt=b.capturedAt=b.monitor.confirmedAt=new Date(now-180000).toISOString();
  b.record.exhibitionSnapshot.capturedAt=new Date(now-240000).toISOString();
  b.record.deadlineAt=new Date(now+600000).toISOString();
  const bytes=JSON.stringify(b), receipt={version:'note-publication-receipt-v1',price:200,raceKey:key,articleSeries:'escape',
    sourceSha256:k.hash(bytes),url:`https://note.com/great_robin3243/n/nabc${rno}`,
    publishedAt:new Date(now-120000).toISOString(),verifiedAt:new Date(now-60000).toISOString()};
  const presentation=require('./note-korogashi-presentation.cjs');
  receipt.publishedDisplayProof=require('./note-published-ticket-sections').sectionProof(
    presentation.paidTextFromSource(b,'escape'),presentation.PRESENTATION_VERSION,{sourceSha256:receipt.sourceSha256});
  const row=receiptRow(receipt,bytes,now);
  const result={ok:true,source:'boatrace-official',date:'20260928',jcd:'15',raceNo:rno,resultUrl:row.resultUrl,
    checkedAt:new Date(now+1200000).toISOString(),resultAvailable:true,status:'finished',void:false,
    trifecta:{combination:'1-2-3',payout},finishers:[{rank:1,boat:1},{rank:2,boat:2},{rank:3,boat:3}],starts:[]};
  return {b,bytes,receipt,row,result,now};
}
const config=(more={})=>({version:'note-korogashi-requests-v1',requests:[{id:'test-100k',date:'20260928',firstPublicationKey:'20260928-15-6:escape',targetYen:100000,maxLegs:3,selectionPolicy:k.POLICY,...more}]});
function options(fixtures,now=fixtures[0].now,more={}) {
  return {rows:fixtures.map(f=>f.row),source:async row=>{const f=fixtures.find(f=>f.row.raceKey===row.raceKey);return {bytes:f.bytes,receipt:f.receipt};},
    result:async key=>fixtures.find(f=>f.row.raceKey===key)?.result||null,now,context:ctx,...more};
}
function seal(staged,now) {return {id:44,digest:'sha256:'+'c'.repeat(64),name:`note-korogashi-${ctx.runId}-${ctx.runAttempt}`,
  runId:ctx.runId,headSha:ctx.headSha,createdAt:new Date(now).toISOString(),confirmedAt:new Date(now+1000).toISOString()};}
async function registered(f=fixture(),c=config()) {
  const out=await k.prepare(k.initialState(),c,options([f]));
  return announced(k.confirm(out.state,out.staged,seal(out.staged,f.now),f.now+1000),f.now+2000);
}
const announced=(state,now)=>k.announce(state,{url:'https://note.com/great_robin3243/n/nabcdef',contentHash:'f'.repeat(64)},now);

const insights=require('./note-korogashi-observability.cjs');
const {courseIndexText}=require('./update-note-marketing.js');
test('all history summary separates not-started, publication failure and unknown official results',async()=>{
  const f=fixture(), staged=await k.prepare(k.initialState(),config(),options([f]));
  const registeredOnly=k.confirm(staged.state,staged.staged,seal(staged.staged,f.now),f.now+1000);
  const late=k.announce(registeredOnly,{url:'https://note.com/great_robin3243/n/nabcdef',contentHash:'f'.repeat(64)},f.now+500000);
  const awaiting=await registered(f);
  const s=insights.summarize(awaiting);
  assert.equal(s.requestedCount,1);assert.equal(s.startedCount,1);assert.equal(s.knownFinalCount,0);
  assert.equal(s.perCourse[0].finalBalanceYen,null);
  const failed=insights.summarize(late);
  assert.equal(failed.startedCount,0);assert.equal(failed.publishedLegCount,0);assert.equal(failed.knownFinalCount,0);
  assert.equal(failed.byStatus.stopped_publication_late,1);
  const noStart=await k.prepare(staged.state,config(),options([f],f.now+1000,{context:{...ctx,runId:'124'}}));
  assert.equal(insights.summarize(noStart.state).byStatus.not_started,1);
  assert.equal(insights.summarize(noStart.state).perCourse[0].initialYen,null);
  assert(insights.renderSummary(s).includes('モデル'));
  assert.equal(insights.renderSummary(insights.summarize(k.initialState())),'');
});
test('announced closed courses have exact final accounting; correlated targets remain labelled model variants',async()=>{
  const f=fixture();f.result.trifecta.combination='6-5-4';f.result.finishers=[{rank:1,boat:6},{rank:2,boat:5},{rank:3,boat:4}];
  const before=await registered(f), out=await k.prepare(before,config(),options([f],f.now+1200000));
  const raw=JSON.stringify(out.state), s=insights.summarize(out.state);
  assert.equal(s.knownFinalCount,1);assert.equal(s.perCourse[0].finalBalanceYen,0);
  assert.equal(s.knownFinalTotals.initialYen,2000);assert.equal(s.knownFinalTotals.netYen,-2000);
  assert.equal(s.settledLegCount,1);assert.equal(s.byStatus.stopped_miss,1);
  assert.equal(JSON.stringify(out.state),raw);
  // An arbitrary history edit is still rejected by the original hash chain.
  const bad=clone(out.state);bad.plans['test-100k'].events[0].data.leg.stakeYen=1;
  assert.throws(()=>insights.summarize(bad),/korogashi_/);
});
test('preview verifies current original, sorts by deadline, excludes used and other series, never returns picks or funds',async()=>{
  const first=fixture(), second=fixture(7,17), third=fixture(8,18), state=await registered(first);
  const now=time(17), raw=JSON.stringify({state,first,second,third}), opts=options([third,first,second],now);
  const p=await insights.preview(state,{rows:opts.rows,source:opts.source,now,clock:()=>now});
  assert.equal(p.plans.length,1);assert.equal(p.plans[0].candidates[0].publicationKey,second.row.publicationKey);
  assert(p.plans[0].candidates.every(x=>x.label==='予定・未登録'));
  assert(!JSON.stringify(p).includes('1-2-3'));assert(!JSON.stringify(p).includes('stakeYen'));
  assert.equal(JSON.stringify({state,first,second,third}),raw);
  const text=insights.renderPreview(p);assert(text.includes('未登録'));assert(text.includes('締切'));
  const expired=await insights.preview(state,{rows:opts.rows,source:opts.source,now:time(18)+600000,clock:()=>time(18)+600000});
  assert(expired.plans.every(x=>x.candidates.length===0));
});
test('registration-to-publication path performs no preview lookup, and snapshot never calls sources again',async()=>{
  const first=fixture(), staged=await k.prepare(k.initialState(),config(),options([first]));
  const state=k.confirm(staged.state,staged.staged,seal(staged.staged,first.now),first.now+1000);
  let calls=0;const source=async()=>{calls++;throw Error('must not happen');};
  const p=await insights.preview(state,{rows:[first.row],source,now:first.now+1000,clock:()=>first.now+1000});
  assert.equal(p.sourceChecks,0);
  const text=await courseIndexText(state,[first.row],source,first.now+1000,()=>first.now+1000);
  assert.equal(calls,0);assert(text.includes('掲載確認中'));
  const c=require('./note-marketing-content'), cfg=require('../config/note-marketing.json');
  const saved={rows:[],korogashiIndex:{version:'note-korogashi-index-v1',text}};
  c.publishedIndexBody(saved,cfg,first.now+1000);assert.equal(calls,0);
});
test('source failures and newly expired candidates cannot turn preview into publication or leak diagnostics',async()=>{
  const first=fixture(), second=fixture(7,17), state=await registered(first), now=time(17);
  const p=await insights.preview(state,{rows:[second.row],source:async()=>{throw Error('private-token-do-not-show');},now,clock:()=>now});
  assert(p.plans.every(x=>x.candidates.length===0));assert(!insights.renderPreview(p).includes('private-token'));
  let tick=now;const opt=options([second],now);
  const expired=await insights.preview(state,{rows:[second.row],source:async row=>{tick=Date.parse(row.deadlineAt);return opt.source(row);},now,clock:()=>tick});
  assert(expired.plans.every(x=>x.candidates.length===0));
});

test('correlated target requests and older dates remain explicit in whole-history counts',async()=>{
  const f=fixture(), c=config();c.requests.push({...c.requests[0],id:'test-200k',targetYen:200000});
  const staged=await k.prepare(k.initialState(),c,options([f]));
  const state=announced(k.confirm(staged.state,staged.staged,seal(staged.staged,f.now),f.now+1000),f.now+2000);
  const summary=insights.summarize(state);
  assert.equal(summary.requestedCount,2);assert.equal(summary.startedCount,2);
  assert.equal(summary.correlatedGroupCount,1);assert.equal(summary.distinctStartedFirstRaceCount,1);
  assert.equal(summary.knownFinalCount,0);
  assert.equal(k.publicText(state,f.now+3*86400000),'');
  assert(insights.renderSummary(summary).includes('2件'));
});
test('preview caps source reads, bounds a slow lookup and omits all unverified candidates',async()=>{
  const f=fixture(), state=await registered(f), now=time(17), rows=Array.from({length:6},(_,i)=>fixture(i+7,17+i));
  let reads=0;
  const limited=await insights.preview(state,{rows:rows.map(f=>f.row),source:async()=>{reads++;throw Error('not verified');},now,clock:()=>now});
  assert.equal(reads,3);assert.equal(limited.sourceChecks,3);assert.equal(limited.status,'bounded');
  const began=Date.now();
  const slow=await insights.preview(state,{rows:rows.map(f=>f.row),source:()=>new Promise(()=>{}),now,clock:()=>now});
  assert(Date.now()-began<4500);assert.equal(slow.sourceChecks,1);assert.equal(slow.plans[0].candidates.length,0);assert.equal(slow.status,'bounded');
});

test('time-window display stays stable until candidates change, without posting countdown-only updates',async()=>{
  const first=fixture(), second=fixture(7,17), state=await registered(first), now=time(17), opts=options([second],now);
  const firstPreview=await insights.preview(state,{rows:opts.rows,source:opts.source,now,clock:()=>now});
  const later=await insights.preview(state,{rows:opts.rows,source:opts.source,now:now+60000,clock:()=>now+60000});
  assert.equal(insights.renderPreview(firstPreview),insights.renderPreview(later));
  assert.notEqual(firstPreview.checkedAt,later.checkedAt);
  assert(insights.renderPreview(firstPreview).includes('候補判定は'));
  const report=insights.summarize(state);
  assert.equal(report.observedRegistrationToPublicationCount,1);
  assert.equal(report.observedRegistrationToPublicationMaxMs,1000);
  assert.equal(report.observedResultToNextRegistrationMaxMs,null);
});

test('different article series sharing the first race are correlated rather than independent samples',()=>{
  const state=k.initialState();
  for(const [id,series] of [['normal-course','normal'],['escape-course','escape']]) {
    const r=k.request({...config().requests[0],id,firstPublicationKey:'20260928-15-6:'+series});
    state.plans[id]={request:r,events:[],pending:null};
  }
  const report=insights.summarize(state);
  assert.equal(report.requestedCount,2);assert.equal(report.distinctFirstRaceCount,1);
  assert.equal(report.correlatedGroupCount,1);assert.equal(report.startedCount,0);
});
