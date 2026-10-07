'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { receiptRow, indexBody, initialState } = require('./note-marketing-content');
const { settlePublished, counts, distributionDrafts, summaryLine, dailySummary, dailyPublishedSummary } = require('./note-marketing-reports');
const { client, REPO } = require('./note-marketing-store');
const config = require('../config/note-marketing.json');
const now = Date.parse('2026-09-29T14:00:00+09:00');
const hash = s => createHash('sha256').update(s).digest('hex');
function fixture(series = 'normal') {
  const tickets = ['1-2-3','1-3-2'];
  const bundle = { version: 'note-draft-bundle-v1', capturedAt:'2026-09-29T11:37:00+09:00', baselinePracticalTickets: tickets,
    record: { raceKey: '20260929-13-4', place: '尼崎', raceNo: 4, deadlineAt: '2026-09-29T11:52:00+09:00',
      prediction: { practicalTickets: tickets.map(ticket => ({ ticket })) } } };
  if (series !== 'normal') {
    bundle.version = 'independent-monitor-note-v1'; bundle.record.source = 'independent-watch';
    bundle.monitor = { origin:'independent-watch', kind:series, tickets };
    bundle.article = { practicalTickets:tickets };
  }
  const bytes = JSON.stringify(bundle);
  const receipt = { version:'note-publication-receipt-v1', price:300, raceKey:bundle.record.raceKey,
    sourceSha256:hash(bytes), url:'https://note.com/great_robin3243/n/nabcdef',
    publishedAt:'2026-09-29T11:38:00+09:00', verifiedAt:'2026-09-29T11:39:00+09:00' };
  const row = receiptRow(receipt, bytes, now);
  const result = { ok:true, source:'boatrace-official', date:'20260929', jcd:'13', raceNo:4,
    checkedAt:'2026-09-29T12:10:00+09:00', resultAvailable:true, status:'finished', void:false,
    resultUrl:row.resultUrl, trifecta:{ combination:'1-2-3', payout:1230 },
    finishers:[{rank:1,boat:1},{rank:2,boat:2},{rank:3,boat:3}], starts:[] };
  return { bundle, bytes, receipt, row, result };
}
test('only prepublished immutable practical tickets count, for each separate series', () => {
  for (const series of ['normal','escape','manshu']) {
    const f = fixture(series), before = JSON.stringify(f);
    const hit = settlePublished(f.row,f.bytes,f.result,now);
    assert.equal(hit.status,'hit'); assert.equal(hit.payoutPer100Yen,1230);
    assert.equal(JSON.stringify(f),before);
    assert.equal(settlePublished(f.row,f.bytes+' ',f.result,now).status,'review');
    assert.equal(settlePublished({...f.row,publishedAt:f.row.deadlineAt},f.bytes,f.result,now).status,'review');
    assert.equal(settlePublished({...f.row,articleSeries:series === 'normal' ? 'manshu' : 'normal'},f.bytes,f.result,now).status,'review');
    const changed = structuredClone(f.bundle); changed.baselinePracticalTickets.push('3-1-2');
    const bytes = JSON.stringify(changed);
    assert.equal(settlePublished({...f.row,sourceSha256:hash(bytes)},bytes,f.result,now).status,'review');
  }
});
test('a result found only in candidate24 or another prediction is a miss', () => {
  const f = fixture();
  f.bundle.record.prediction.candidate24Tickets = ['3-1-2'];
  const bytes = JSON.stringify(f.bundle), row = {...f.row,sourceSha256:hash(bytes)};
  const result = {...f.result, trifecta:{combination:'3-1-2',payout:3000},finishers:[{rank:1,boat:3},{rank:2,boat:1},{rank:3,boat:2}]};
  assert.equal(settlePublished(row,bytes,result,now).status,'miss');
});
test('unavailable, future, foreign, void, refund and ambiguous results never announce a hit', () => {
  const f = fixture();
  assert.equal(settlePublished(f.row,f.bytes,null,now).status,'pending');
  assert.equal(settlePublished(f.row,f.bytes,f.result,Date.parse(f.row.deadlineAt)-1000).status,'pending');
  assert.equal(settlePublished(f.row,f.bytes,{...f.result,void:true,status:'void'},now).status,'void');
  for (const change of [{date:'20260928'},{jcd:'24'},{raceNo:5},{source:'unofficial'},{resultUrl:'https://example.com'},
    {checkedAt:'2026-09-30T12:00:00+09:00'},{checkedAt:f.row.deadlineAt},{trifecta:{combination:'1-2-3',payout:0}},
    {finishers:[...f.result.finishers,{rank:3,boat:4}]},{starts:[{boat:6,falseStart:true}]},{refunds:[6]}]) {
    assert.equal(settlePublished(f.row,f.bytes,{...f.result,...change},now).status,'review',JSON.stringify(change));
  }
});
test('note retains misses and every unresolved category in the published denominator', () => {
  const f=fixture();
  const rows=['hit','miss','pending','void','review'].map((status,i)=>({...f.row,url:f.row.url+i,
    raceKey:`20260929-13-${i+1}`,publicationKey:`20260929-13-${i+1}:normal`,raceNo:i+1,
    settlement:{...settlePublished(f.row,f.bytes,f.result,now),status},
    publishedSettlement:{...settlePublished(f.row,f.bytes,f.result,now),status,publishedTicketCount:2,
      matchedSections:status==='hit'?['中心の買い目']:[]}}));
  assert.deepEqual(counts(rows),{published:5,hit:1,miss:1,pending:1,void:1,review:1,settled:2});
  const before=JSON.stringify(rows);
  const body=indexBody(rows,config,now);
  assert(body.startsWith('📅 2026年9月29日の予想・結果一覧'));
  assert(body.includes('公開5レース｜判定済み2R'));
  assert(body.includes('公開5件｜判定済み2件'));
  for(const [i,label] of ['🎯 的中','❌ 不的中','⏳ 結果待ち','➖ 不成立','🔎 照合確認中'].entries()) {
    assert(body.includes(`${label} 1R`));assert(body.includes(`${label} 1件`));
    assert(body.includes(`${label}｜尼崎${i+1}R`));
  }
  for(const row of rows) { assert(!body.includes(row.url)); assert(body.includes(row.resultUrl)); }
  assert(body.includes('締切済み｜購入リンクの掲載終了'));
  assert.equal(JSON.stringify(rows),before);
  const unresolved=indexBody([{...f.row,settlement:{status:'pending'}}],config,now);
  assert(!unresolved.includes('1-2-3')); assert(!unresolved.includes('1-3-2'));
});
test('zero result categories are omitted without hiding all misses or unresolved article counts',()=>{
  const f=fixture();
  for(const [status,label] of [['hit','🎯 的中'],['miss','❌ 不的中'],['pending','⏳ 結果待ち'],['void','➖ 不成立'],['review','🔎 照合確認中']]) {
    const rows=[1,2].map(raceNo=>({...f.row,raceKey:`20260929-13-${raceNo}`,raceNo,
      publicationKey:`20260929-13-${raceNo}:normal`,url:f.row.url+raceNo,
      settlement:{status},publishedSettlement:{status,publishedTicketCount:2}}));
    assert.equal(summaryLine(rows),`公開2件｜判定済み${['hit','miss'].includes(status)?2:0}件\n${label} 2件`);
    assert.equal(dailySummary(rows,'20260929'),`AI展開予想：${summaryLine(rows)}`);
    assert.equal(dailyPublishedSummary(rows,'20260929',{includeRaces:false}),`AI展開予想：2記事\n${label} 2件`);
    assert(!dailySummary(rows,'20260929').includes('イン逃げ'));
    assert(!dailySummary(rows,'20260929').includes('万舟'));
  }
  assert.equal(summaryLine([]),'公開なし');
  assert.equal(dailySummary([],'20260929'),'公開なし');
  assert.equal(dailyPublishedSummary([],'20260929',{includeRaces:false}),'公開なし');
});
test('each article shows one outcome and payout while center-only results remain in the appendix',()=>{
  const f=fixture(),center=settlePublished(f.row,f.bytes,f.result,now);
  const rows=[{...f.row,settlement:{...center,status:'miss'},publishedSettlement:{...center,status:'hit',
    publishedTicketCount:6,matchedSections:['相手を広げるなら']}}];
  const before=JSON.stringify(rows),body=indexBody(rows,config,now),[main,appendix]=body.split('📊 集計の詳細');
  assert(main.includes('🎯 的中｜尼崎4R\n📌 的中した予想：AI展開予想\n「相手を広げるなら」\n✅ 的中買い目 1-2-3\n💴 公式払戻（100円あたり）1,230円'));
  assert(main.includes('📌 掲載全券6点（重複なし・参考別集計）\n🕒 締切 11:52｜公開 11:38\n中心2点｜公開時価格 300円'));
  assert(main.includes('🏁 公式結果を確認\n'+rows[0].resultUrl));
  assert(!main.includes('押さえで的中'));
  assert.equal((body.match(/公式払戻（100円あたり）1,230円/g)||[]).length,1);
  assert(!main.includes('❌ 不的中'));assert(!main.includes('中心のみ'));
  assert(appendix.includes('中心のみの従来成績（記事別）\nAI展開予想：公開1件｜判定済み1件\n❌ 不的中 1件'));
  assert(appendix.includes('掲載全券・種類別\nAI展開予想：1記事\n🎯 的中 1件'));
  assert(!body.includes('0的中'));assert(!body.includes('0不的中'));
  assert(!body.includes(rows[0].url));assert(body.includes(rows[0].resultUrl));
  assert.equal(JSON.stringify(rows),before);
});
test('stale pre-race snapshots wait without weakening resolved-result identity checks', () => {
  const f=fixture(), stale={...f.result,checkedAt:f.bundle.capturedAt,resultAvailable:false,status:'not_finished',void:false,trifecta:null,finishers:[]};
  assert.deepEqual(settlePublished(f.row,f.bytes,stale,now),{status:'pending',reason:'official_result_stale'});
  for(const change of [{date:'20260928'},{resultUrl:'https://example.com'},{void:true},{status:'finished'},{trifecta:f.result.trifecta}]) {
    assert.equal(settlePublished(f.row,f.bytes,{...stale,...change},now).status,'review');
  }
});
test('published pending results refresh once, cache official evidence and respect retry cooldown', async () => {
  const f=fixture('escape'), stale={...f.result,checkedAt:f.bundle.capturedAt,resultAvailable:false,status:'not_finished',trifecta:null,finishers:[]};
  const store=client({GITHUB_REPOSITORY:REPO,NOTE_CLAIM_TOKEN:'test-only',NOTE_CLAIM_SHA:'f'.repeat(40)},async url=>{
    let content;
    if(url.includes('/contents/data/results/')) content=JSON.stringify({source:'boatrace-official',date:'20260929',races:[stale]});
    else if(url.includes('/contents/data/stats/')) content=JSON.stringify({version:'race-review-results-v1',races:{[f.row.raceKey]:stale}});
    else if(url.includes('/contents/data/note-drafts/')) content=f.bytes;
    else throw Error(url);
    return {ok:true,status:200,json:async()=>({encoding:'base64',content:Buffer.from(content).toString('base64')})};
  });
  const input={...initialState(config),date:'20260929',rows:[f.row]};let calls=0;
  const options={refresh:true,clock:()=>now+1000,fetchResult:async key=>{calls++;assert.equal(key,f.row.raceKey);return {...f.result,checkedAt:new Date(now+500).toISOString()};}};
  const output=await store.settle(input,config,now,options);
  assert.equal(output.rows[0].settlement.status,'hit');assert.equal(calls,1);assert(output.officialResults[f.row.raceKey]);
  assert.equal((await store.settle(output,config,now+2000,options)).rows[0].settlement.status,'hit');assert.equal(calls,1);
  const retryOptions={...options,fetchResult:async()=>{calls++;throw Error('unavailable');}};
  const failed=await store.settle(input,config,now,retryOptions);
  assert.equal(failed.rows[0].settlement.status,'pending');
  await store.settle(failed,config,now+60000,retryOptions);assert.equal(calls,2);
  await store.settle(failed,config,now+20*60000,retryOptions);assert.equal(calls,3);
  const wrong=await store.settle(input,config,now,{...options,fetchResult:async()=>({...f.result,jcd:'24'})});
  assert.equal(wrong.rows[0].settlement.status,'review');assert.deepEqual(wrong.officialResults,{});
  const corrupt=await store.settle({...input,rows:[{...f.row,sourceSha256:'a'.repeat(64)}]},config,now,retryOptions);
  assert.equal(corrupt.rows[0].settlement.status,'review');assert.equal(calls,3);
  assert.equal(input.officialResults,undefined);
});
test('social drafts are dated, bounded, stable, series-separated and never marked delivered', () => {
  const f=fixture(), rows=[{...f.row,settlement:settlePublished(f.row,f.bytes,f.result,now)}];
  const drafts=distributionDrafts(rows,config,'20260929');
  assert.equal(drafts.deliveryEnabled,false); assert.equal(drafts.x.status,'awaiting_connection');
  assert.equal(drafts.line.status,'awaiting_connection');
  assert.equal(drafts.x.items.length,1); assert(drafts.x.items[0].text.includes('9/29 AI展開予想'));
  assert(drafts.x.items[0].text.includes('公式払戻（100円あたり）1,230円'));
  assert(!drafts.x.items[0].text.includes(f.row.url)); assert(drafts.x.items[0].text.includes(f.row.resultUrl)); assert(drafts.x.items[0].text.includes(config.index.url));
  // Conservative upper bound: all non-ASCII codepoints count as two; each URL as 23.
  const weighted = [...drafts.x.items[0].text.replace(/https:\/\/\S+/g,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0);
  assert(weighted<=280,`X length ${weighted}`);
  assert.deepEqual(drafts,distributionDrafts(rows,config,'20260929'));
  assert.equal(distributionDrafts(rows,config,'20260930').x.items.length,0);
  const many=Array.from({length:144},(_,i)=>({...rows[0],publicationKey:`${i}:normal`}));
  const line=distributionDrafts(many,config,'20260929').line.items[0].text;
  assert(line.length<5000); assert.equal(line,drafts.x.items[0].text);
  assert.equal(distributionDrafts(many,config,'20260929').line.items.length,144);
  assert.equal(drafts.mode,'paired-hit');
  assert.equal(drafts.line.items[0].publicationKey,drafts.x.items[0].publicationKey);
  assert.equal(distributionDrafts([{...rows[0],settlement:{status:'miss'}}],config,'20260929').line.items.length,0);
});
test('store uses existing daily official data, including results absent from research ledger', async () => {
  const f=fixture(), calls=[];
  const store=client({GITHUB_REPOSITORY:REPO,NOTE_CLAIM_TOKEN:'test-only',NOTE_CLAIM_SHA:'f'.repeat(40)},async (url,opts)=>{
    calls.push({url,method:opts.method});
    let content;
    if(url.includes('/contents/data/results/20260929.json')) content=JSON.stringify({source:'boatrace-official',date:'20260929',races:[f.result]});
    else if(url.includes('/contents/data/note-drafts/')) content=f.bytes;
    else throw Error(url);
    return {ok:true,status:200,json:async()=>({encoding:'base64',content:Buffer.from(content).toString('base64')})};
  });
  const state={...initialState(config),date:'20260929',rows:[f.row]};
  const settled=await store.settle(state,config,now);
  assert.equal(settled.rows[0].settlement.status,'hit');
  assert.equal(settled.distribution.x.items.length,1);
  assert(calls.every(c=>c.method==='GET')); assert(!JSON.stringify(settled).includes('1-3-2'));
  assert.equal(state.rows[0].settlement,undefined);
});

test('five-minute eligibility changes only result-fetch start, keeping official/source validation and cooldown',async()=>{
 const f=fixture(),deadline=Date.parse(f.row.deadlineAt);
 const store=client({GITHUB_REPOSITORY:REPO,NOTE_CLAIM_TOKEN:'test-only',NOTE_CLAIM_SHA:'f'.repeat(40)},async url=>{
  let content;
  if(url.includes('/contents/data/results/'))content=JSON.stringify({source:'boatrace-official',date:'20260929',races:[]});
  else if(url.includes('/contents/data/stats/'))content=JSON.stringify({version:'race-review-results-v1',races:{}});
  else if(url.includes('/contents/data/note-drafts/'))content=f.bytes;
  else throw Error(url);
  return {ok:true,status:200,json:async()=>({encoding:'base64',content:Buffer.from(content).toString('base64')})};
 });
 const input={...initialState(config),date:'20260929',rows:[f.row]};let calls=0;
 const options=time=>({refresh:true,clock:()=>time,fetchResult:async()=>{calls++;return {...f.result,checkedAt:new Date(time).toISOString()};}});
 await store.settle(input,config,deadline+5*60000-1,options(deadline+5*60000-1));assert.equal(calls,0);
 const result=await store.settle(input,config,deadline+5*60000,options(deadline+5*60000));assert.equal(calls,1);assert.equal(result.rows[0].settlement.status,'hit');
});
test('first result-seen and note-verified timestamps are observations, preserved only for identical evidence',()=>{
 const {observeResult,markResultsVerified}=require('./note-marketing-reports'),f=fixture();
 const settlement=settlePublished(f.row,f.bytes,f.result,now),observation=observeResult(f.row,settlement,f.result,now);
 assert.equal(observation.firstResultSeenAt,new Date(now).toISOString());assert.equal(observation.officialSourceCheckedAt,f.result.checkedAt);assert.equal(observation.noteVerifiedAt,null);
 const row={...f.row,settlement,resultObservation:observation};
 const verified=markResultsVerified([row],now+1000)[0];assert.equal(verified.resultObservation.noteVerifiedAt,new Date(now+1000).toISOString());
 assert.deepEqual(observeResult(verified,settlement,f.result,now+2000),verified.resultObservation);
 assert.deepEqual(observeResult(verified,{status:'review'},f.result,now+2000),verified.resultObservation);
 const waiting={...verified,settlement:{status:'pending'},resultObservation:{...verified.resultObservation,noteVerifiedAt:null}};
 assert.equal(markResultsVerified([waiting],now+2000)[0].resultObservation.noteVerifiedAt,null);
 const changed=observeResult(verified,{...settlement,evidenceId:'f'.repeat(64)},f.result,now+2000);
 assert.equal(changed.noteVerifiedAt,null);assert.equal(changed.firstResultSeenAt,new Date(now+2000).toISOString());
});
