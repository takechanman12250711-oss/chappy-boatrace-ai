'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { receiptRow, indexBody, initialState } = require('./note-marketing-content');
const { settlePublished, counts, distributionDrafts } = require('./note-marketing-reports');
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
    settlement:{...settlePublished(f.row,f.bytes,f.result,now),status}}));
  assert.deepEqual(counts(rows),{published:5,hit:1,miss:1,pending:1,void:1,review:1,settled:2});
  const body=indexBody(rows,config,now);
  assert(body.includes('公開5件｜判定済み2件中1件的中・1件不的中'));
  assert(body.includes('結果待ち1件・不成立1件・確認中1件'));
  for(const row of rows) assert(body.includes(row.url));
  const unresolved=indexBody([{...f.row,settlement:{status:'pending'}}],config,now);
  assert(!unresolved.includes('1-2-3')); assert(!unresolved.includes('1-3-2'));
});
test('social drafts are dated, bounded, stable, series-separated and never marked delivered', () => {
  const f=fixture(), rows=[{...f.row,settlement:settlePublished(f.row,f.bytes,f.result,now)}];
  const drafts=distributionDrafts(rows,config,'20260929');
  assert.equal(drafts.deliveryEnabled,false); assert.equal(drafts.x.status,'awaiting_connection');
  assert.equal(drafts.line.status,'awaiting_connection');
  assert.equal(drafts.x.items.length,1); assert(drafts.x.items[0].text.includes('9/29 通常予想'));
  assert(drafts.x.items[0].text.includes('公式払戻（100円あたり）1,230円'));
  assert(drafts.x.items[0].text.includes(f.row.url)); assert(drafts.x.items[0].text.includes(config.index.url));
  // Conservative upper bound: all non-ASCII codepoints count as two; each URL as 23.
  const weighted = [...drafts.x.items[0].text.replace(/https:\/\/\S+/g,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0);
  assert(weighted<=280,`X length ${weighted}`);
  assert.deepEqual(drafts,distributionDrafts(rows,config,'20260929'));
  assert.equal(distributionDrafts(rows,config,'20260930').x.items.length,0);
  const many=Array.from({length:144},(_,i)=>({...rows[0],publicationKey:`${i}:normal`}));
  const line=distributionDrafts(many,config,'20260929').line.items[0].text;
  assert(line.length<5000); assert(line.includes('直近3件')); assert(line.includes('公開144件'));
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
