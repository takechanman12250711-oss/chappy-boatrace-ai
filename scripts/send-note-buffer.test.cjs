'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {run,transport,ledger,observed,reconcile}=require('./send-note-buffer.cjs');
const {distributionDrafts}=require('./note-marketing-reports');
const {hash,indexBody}=require('./note-marketing-content');
const marketing=require('../config/note-marketing.json');
const now=Date.parse('2026-09-29T21:00:00+09:00');
const config={mode:'buffer-free-line-menu',enabled:true,activatedAt:'2026-09-29T00:00:00+09:00',xUsername:'chappy_boat_ai',xApiCostApproved:false};
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',BUFFER_API_KEY:'test'};
function sourceFixture() {
  const row={raceKey:'20260929-13-4',publicationKey:'20260929-13-4:normal',articleSeries:'normal',place:'尼崎',raceNo:4,ticketCount:2,
    deadlineAt:'2026-09-29T11:52:00+09:00',publishedAt:'2026-09-29T11:40:00+09:00',sourceSha256:'a'.repeat(64),
    url:'https://note.com/great_robin3243/n/nabcdef',resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20260929&jcd=13&rno=4',
    settlement:{status:'hit',evidenceId:'b'.repeat(64),combination:'1-2-3',payoutPer100Yen:1230}};
  const state={date:'20260929',verifiedDate:'20260929',rows:[row],articles:{index:{hash:hash(indexBody([row],marketing,now))}},distribution:distributionDrafts([row],marketing,'20260929')};
  const events=[],claims=new Set(),records=[];
  const receipts={exists:async p=>claims.has(p.publicationKey),count:async()=>claims.size,
    reserve:async p=>{assert(!claims.has(p.publicationKey));claims.add(p.publicationKey);events.push('claim');},
    record:async(p,r)=>{records.push(r);events.push('record');}};
  const delivery={preflight:async()=>events.push('preflight'),sendX:async()=>{events.push('x');return {status:'verified'};},
    sendLine:async()=>{events.push('line');return {status:'accepted'};}};
  const store={load:async()=>({state}),settle:async()=>state};
  return {env,config:{...config},now,clock:()=>now,marketing,store,delivery,receipts,state,events,claims,records};
}

function fixture(){const f=sourceFixture(),saved=new Map();f.claims=f.receipts;f.log={put:async(k,v)=>saved.set(k,v),get:async k=>saved.get(k)||null,refs:async p=>[...saved.keys()].filter(k=>k.startsWith(p)).map(k=>({ref:'refs/tags/'+k})),budget:async()=>{}};
f.delivery={channel:async()=>{f.events.push('channel');return 'channel';},create:async text=>{f.events.push('create');return {id:'post',channelId:'channel',text,status:'scheduled'};},post:async()=>{throw Error('not yet');}};f.saved=saved;return f;}
test('disabled or missing Buffer key has zero calls; default is disconnected',async()=>{
 for(const c of [{...config,enabled:false},{...config,activatedAt:null}]){const f=fixture();f.config=c;assert.equal((await run(f)).status,'awaiting_buffer_connection');assert.deepEqual(f.events,[]);}
 const f=fixture();f.env={...env,BUFFER_API_KEY:''};assert.equal((await run(f)).status,'awaiting_buffer_connection');
 assert.equal((await run({env:{},now})).status,'awaiting_buffer_connection');
});
test('Buffer acceptance is pending and permanent claim prevents duplicates even after response loss',async()=>{
 const f=fixture();const r=await run(f);assert.equal(r.results[0].status,'accepted_pending');assert.deepEqual(f.events,['channel','claim','create','record']);
 await run(f);assert.equal(f.events.filter(x=>x==='create').length,1);
 const unknown=fixture();unknown.delivery.create=async()=>{unknown.events.push('create');throw Error('timeout');};assert.equal((await run(unknown)).status,'review_required');await run(unknown);assert.equal(unknown.events.filter(x=>x==='create').length,1);
});
test('fresh evidence, public index and activation remain required',async()=>{
 for(const mode of ['index','miss','activation','branch']){const f=fixture();if(mode==='index')f.state.articles.index.hash='old';if(mode==='miss')f.state.rows[0].settlement.status='miss';if(mode==='activation')f.config.activatedAt='2026-09-29T20:00:00+09:00';if(mode==='branch')f.env={...env,GITHUB_REF:'refs/heads/other'};if(mode==='activation')assert.equal((await run(f)).status,'no_new_hits');else await assert.rejects(run(f));assert(!f.events.includes('create'));}
});
test('course suffix uses the exact verified index snapshot without disabling normal Buffer reporting',async()=>{
 const {publishedIndexBody}=require('./note-marketing-content');
 const f=fixture();f.state.korogashiIndex={version:'note-korogashi-index-v1',text:'登録したコースの経過\nモデル配分です。'};
 f.state.articles.index.hash=hash(publishedIndexBody(f.state,marketing,now));
 assert.equal((await run(f)).results[0].status,'accepted_pending');
 const bad=fixture();bad.state.korogashiIndex={...f.state.korogashiIndex};
 await assert.rejects(run(bad),/public_index_not_verified/);assert(!bad.events.includes('create'));
});
test('sent requires exact text, channel, ID and real owner status URL; queue is not sent',()=>{
 const r={postId:'p',channelId:'c',textSha256:createHash('sha256').update('hit').digest('hex')};const p={id:'p',channelId:'c',text:'hit',status:'sent',externalLink:'https://x.com/chappy_boat_ai/status/123'};
 assert.equal(observed(p,r).status,'buffer_confirmed_sent');assert.equal(observed({...p,status:'scheduled'},r).status,'accepted_pending');
 for(const change of [{text:'other'},{channelId:'other'},{externalLink:'https://x.com/other/status/123'}])assert.equal(observed({...p,...change},r).status,'review_required');
});
test('transport only calls Buffer, pins X, reserves budget before each request and uses immediate mode',async()=>{
 const calls=[],log={budget:async()=>calls.push('budget')};const t=transport(env,config,log,async(url,opts)=>{
 assert.equal(url,'https://api.buffer.com');assert.equal(calls.at(-1),'budget');calls.push(JSON.parse(opts.body).query);const q=calls.at(-1);let data;
 if(q.includes('organizations'))data={account:{organizations:[{id:'org'}]}};
 else if(q.includes('channels('))data={channels:[{id:'c',name:'chappy_boat_ai',service:'twitter',externalLink:'https://x.com/chappy_boat_ai',isDisconnected:false,isLocked:false,isQueuePaused:false}]};
 else {assert(q.includes('mode:shareNow'));data={createPost:{post:{id:'p'}}};}
 return {ok:true,json:async()=>({data})};});assert.equal(await t.channel(),'c');await t.create('hit','c');assert.equal(calls.filter(x=>x==='budget').length,3);
});
test('80 rolling daily requests stop before HTTP, and failed reservation is not bypassed',async()=>{
 const store={api:async route=>route.includes('/20260929/')?Array.from({length:80},(_,i)=>({ref:'refs/tags/note-buffer-api/20260929/'+(now-i)+'-id'})):[]};
 await assert.rejects(ledger(store).budget(now),/budget_reached/);
 let calls=0;const t=transport(env,config,{budget:async()=>{throw Error('budget');}},async()=>calls++);await assert.rejects(t.channel());assert.equal(calls,0);
});
test('pending reconciliation writes final receipt and never creates again',async()=>{
 const f=fixture();await run(f);const receipt=[...f.saved.values()].find(x=>x.postId);f.delivery.post=async()=>({id:receipt.postId,channelId:receipt.channelId,text:f.state.distribution.x.items[0].text,status:'sent',externalLink:'https://x.com/chappy_boat_ai/status/123'});
 const r=await reconcile(f.log,f.delivery,now+1800000);assert.equal(r[0].status,'buffer_confirmed_sent');assert([...f.saved.keys()].some(k=>k.startsWith('note-buffer-final/')));assert.equal((await reconcile(f.log,f.delivery,now+3600000)).length,0);
});

const {announce,announcementText}=require('./send-note-buffer.cjs');
function announcementFixture(){
 const f=fixture();f.config.announcements={enabled:true,activatedAt:'2026-09-29T19:00:00+09:00'};
 const r=f.state.rows[0];r.publishedAt='2026-09-29T20:30:00+09:00';r.deadlineAt='2026-09-29T22:00:00+09:00';r.settlement={status:'pending'};
 f.state.rows.push({...r,publicationKey:r.raceKey+':escape',articleSeries:'escape',url:r.url+'a'});
 return f;
}
test('run connects announcements only after verifying the current public index',async()=>{
 const f=announcementFixture();f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
 await assert.rejects(run(f),/public_index_not_verified/);assert.deepEqual(f.events,[]);
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,now));
 const result=await run(f);assert.equal(result.announcement.articles,2);assert.equal(result.results[0].kind,'announcement');assert.equal(result.started,0);
});
test('announcements batch series, link only verified index and do not repeat covered articles',async()=>{
 const f=announcementFixture();let text;
 f.delivery.create=async t=>{text=t;assert([...f.saved.keys()].some(k=>k.startsWith('note-buffer-announcement/')));return {id:'a',text:t,channelId:'channel',status:'scheduled'};};
 let r=await announce(f.state,f.config,f.marketing,f.log,f.delivery,f.clock);assert.equal(r.articles,2);assert.equal(r.status,'accepted_pending');
 assert(text.includes('AI展開｜尼崎4R｜22:00締切'));assert(text.includes('本命｜尼崎4R｜22:00締切'));assert(text.includes(marketing.index.url));assert(!text.includes('的中'));
 assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,()=>now+3600000)).status,'no_new_articles');
});

const {sourceContext,safePreview,announcementCopy,recapCopy,weight}=require('./note-marketing-social');
const {recap,collectMetrics}=require('./send-note-buffer.cjs');
test('preview uses immutable before-deadline evidence and excludes paid ticket sentences',()=>{
 const b=require('./note-independent-monitor-fixture').fixture();
 b.article.paidText='【狙いの根拠】\n1号艇の平均ST.15。\n【想定展開】\n狙う券は１－２－３。1号艇の先行が焦点です。\n\n買い目\n1-2-34\n計 2点';
 assert.equal(safePreview('【狙いの根拠】\n1号艇の先行が焦点です。'),'1号艇の先行が焦点です。');
 const bytes=JSON.stringify(b),row={raceKey:b.record.raceKey,deadlineAt:b.record.deadlineAt,publishedAt:'2026-09-28T17:00:00+09:00',sourceSha256:createHash('sha256').update(bytes).digest('hex')};
 const context=sourceContext(row,bytes);assert.equal(context.preview,'1号艇の先行が焦点です。');assert.deepEqual(context.firstBoats,['1']);
 assert.equal(sourceContext(row,bytes+' '),null);
 assert.equal(sourceContext({...row,publishedAt:'2026-09-28T15:00:00+09:00'},bytes),null);
});
test('announcements include actual race, deadline, price and safe free insight within X length',()=>{
 const f=announcementFixture(),r=f.state.rows[0];r.price=200;
 r.socialContext={version:'source-context-v1',sourceSha256:r.sourceSha256,preview:'1号艇の先行が焦点です。'};
 const text=announcementCopy([r],marketing.index.url,now);
 assert(text.includes('尼崎4R｜22:00締切'));assert(text.includes('選べます。200円。'));assert(text.includes(r.url));assert(text.includes('1号艇の先行'));assert(weight(text)<=280);
 const long=Array.from({length:30},(_,i)=>({...r,raceNo:i%12+1,publicationKey:r.publicationKey+i}));
 assert(weight(announcementCopy(long,marketing.index.url,now))<=280);
 r.socialContext.preview='買い目は1-2-3です。';assert(!announcementCopy([r],marketing.index.url,now).includes('1-2-3'));
});
test('announcement grouping preserves series and prices across mixed and omitted articles',()=>{
 const f=announcementFixture(),r={...f.state.rows[0],price:200};
 const other={...f.state.rows[1],price:200};
 const mixed=announcementCopy([r,other],marketing.index.url,now);
 assert(mixed.startsWith('9/29 予想記事\n'));
 assert(mixed.includes('AI展開｜尼崎4R｜22:00締切'));assert(mixed.includes('本命｜尼崎4R｜22:00締切'));
 assert(mixed.includes('各200円。'));assert(weight(mixed)<=280);
 const batch=Array.from({length:8},(_,i)=>({...r,raceNo:i+1,publicationKey:r.publicationKey+i}));
 for(const price of [300,undefined]){
   batch[7].price=price;
   const text=announcementCopy(batch,marketing.index.url,now);
   assert(text.startsWith('9/29 AI展開予想\n'));assert(!text.includes('各200円'));
   assert(text.includes('尼崎1R｜22:00締切｜200円'));assert(text.includes('価格は各記事で確認。'));
   assert(text.includes('記事は一覧へ'));assert(text.includes(marketing.index.url));assert(weight(text)<=280);
 }
});
test('recap includes misses and unresolved separately, only source-backed comparison',()=>{
 const f=fixture(),r=f.state.rows[0];
 const miss={...r,articleSeries:'escape',publicationKey:r.raceKey+':escape',settlement:{...r.settlement,status:'miss'},socialContext:{version:'source-context-v1',sourceSha256:r.sourceSha256,firstBoats:['1']}};
 const text=recapCopy([r,miss,{...r,articleSeries:'manshu',publicationKey:r.raceKey+':manshu',settlement:{status:'review'}}],marketing.index.url,now);
 assert(text.includes('AI展開：1的中／0不的中'));assert(text.includes('本命：0的中／1不的中'));assert(text.includes('確認中1'));assert(text.includes('1着は想定内、組み合わせが不的中'));assert(weight(text)<=280);
});
test('night recap waits for the window and deadlines, and unknown creation is never resent',async()=>{
 const f=fixture();f.config.recap={enabled:true,activatedAt:'2026-09-29T00:00:00+09:00'};
 assert.equal((await recap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'before_recap_window');
 f.clock=()=>Date.parse('2026-09-29T22:45:00+09:00');
 const original=f.state.rows[0].deadlineAt;f.state.rows[0].deadlineAt='2026-09-29T22:20:00+09:00';
 assert.equal((await recap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'races_not_finished');f.state.rows[0].deadlineAt=original;
 let calls=0;f.delivery.create=async()=>{calls++;throw Error('lost response');};
 assert.equal((await recap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'review_required');
 assert.equal((await recap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'already_attempted');assert.equal(calls,1);
});
test('night recap shares verified-index gate and accepted-post reconciliation',async()=>{
 const f=fixture();f.config.recap={enabled:true,activatedAt:'2026-09-29T00:00:00+09:00'};
 f.now=Date.parse('2026-09-29T22:45:00+09:00');f.clock=()=>f.now;
 f.state.articles.index.hash='stale';await assert.rejects(run(f),/public_index_not_verified/);assert.deepEqual(f.events,[]);
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,f.now));
 const result=await run(f);assert.equal(result.recap.status,'accepted_pending');
 assert([...f.saved.values()].some(x=>x.provider==='buffer-free-recap'&&x.postId));
});
test('experimental metrics distinguish missing from zero, pin identity, and run at most once daily',async()=>{
 const f=fixture(),late=Date.parse('2026-09-29T22:45:00+09:00');f.config.metrics={enabled:true};
 const text='original',base={status:'buffer_confirmed_sent',postId:'p',channelId:'c',textSha256:createHash('sha256').update(text).digest('hex'),url:'https://x.com/chappy_boat_ai/status/1'};
 await f.log.put('note-buffer-final/20260929/a',base);
 f.delivery.metrics=async()=>({id:'p',channelId:'c',text,status:'sent',externalLink:base.url,metrics:[{type:'impressions',name:'Impressions',value:0,unit:'count'}],metricsUpdatedAt:new Date(late-1000).toISOString()});
 assert.equal((await collectMetrics(f.config,f.log,f.delivery,late)).available,1);
 const saved=await f.log.get('note-buffer-metrics/20260929');assert.equal(saved.items[0].metrics[0].value,0);assert.equal(saved.purchaseAttribution,'not_connected');
 assert.equal((await collectMetrics(f.config,f.log,f.delivery,late)).status,'already_attempted');
 const g=fixture();g.config.metrics={enabled:true};await g.log.put('note-buffer-final/20260929/a',base);
 g.delivery.metrics=async()=>({id:'wrong',channelId:'c',text,status:'sent',externalLink:base.url,metrics:[]});
 assert.equal((await collectMetrics(g.config,g.log,g.delivery,late)).available,0);assert.equal((await g.log.get('note-buffer-metrics/20260929')).items[0].metrics,null);
});
test('announcements exclude old, future, expired, review and wrong-day articles without Buffer calls',async()=>{
 for(const change of [{publishedAt:'2026-09-29T18:00:00+09:00'},{publishedAt:'2026-09-29T23:00:00+09:00'},{deadlineAt:'2026-09-29T21:01:00+09:00'},{settlement:{status:'review'}},{raceKey:'20260928-13-4'},{url:'https://example.com'}]){
 const f=announcementFixture();f.state.rows=[{...f.state.rows[0],...change}];assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,f.clock)).status,'no_new_articles');assert.deepEqual(f.events,[]);
 }
});
test('announcement timeout, changed batches, hourly spacing and daily cap preserve permanent claims',async()=>{
 const f=announcementFixture();let calls=0;f.delivery.create=async()=>{calls++;throw Error('timeout');};
 assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,f.clock)).status,'review_required');
 f.state.rows.push({...f.state.rows[0],publicationKey:'20260929-13-5:normal',raceKey:'20260929-13-5',deadlineAt:'2026-09-29T23:59:00+09:00'});
 assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,f.clock)).status,'interval_or_daily_limit');
 assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,()=>now+3600000)).articles,1);assert.equal(calls,2);
 const g=announcementFixture();for(let i=0;i<8;i++)await g.log.put('note-buffer-announcement/20260929/'+i,{at:now-7200000,publicationKeys:[]});
 assert.equal((await announce(g.state,g.config,g.marketing,g.log,g.delivery,g.clock)).status,'interval_or_daily_limit');assert.deepEqual(g.events,[]);
});
test('announcement rechecks deadline after channel lookup and uses existing reconciliation',async()=>{
 const f=announcementFixture();let clock=now;f.delivery.channel=async()=>{clock=now+3600000;return 'channel';};
 assert.equal((await announce(f.state,f.config,f.marketing,f.log,f.delivery,()=>clock)).status,'deadlines_passed');assert.equal(f.saved.size,0);
 const g=announcementFixture();await announce(g.state,g.config,g.marketing,g.log,g.delivery,g.clock);
 const receipt=[...g.saved.values()].find(x=>x.postId);g.delivery.post=async()=>({id:receipt.postId,channelId:receipt.channelId,text:announcementText(g.state.rows,marketing,now),status:'sent',externalLink:'https://x.com/chappy_boat_ai/status/234'});
 assert.equal((await reconcile(g.log,g.delivery,now+1800000))[0].status,'buffer_confirmed_sent');
});
test('urgent announcements advance the hourly window, but keep five-minute spacing and permanent claims',async()=>{
 const f=announcementFixture();
 await f.log.put('note-buffer-announcement/20260929/earlier',{at:now-4*60000,publicationKeys:[]});
 f.state.rows=[{...f.state.rows[0],deadlineAt:'2026-09-29T21:07:00+09:00'}];
 assert.equal((await announce(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'interval_or_daily_limit');
 assert.deepEqual(f.events,[]);
 const r=await announce(f.state,f.config,marketing,f.log,f.delivery,()=>now+60000);
 assert.equal(r.status,'accepted_pending');assert.equal(r.articles,1);
 assert.equal((await announce(f.state,f.config,marketing,f.log,f.delivery,()=>now+2*60000)).status,'no_new_articles');
 assert.equal(f.events.filter(e=>e==='create').length,1);
 const g=announcementFixture();
 await g.log.put('note-buffer-announcement/20260929/earlier',{at:now-10*60000,publicationKeys:[]});
 assert.equal((await announce(g.state,g.config,marketing,g.log,g.delivery,g.clock)).status,'interval_or_daily_limit');
 assert.deepEqual(g.events,[]);
});
test('urgent eligibility is checked again after channel lookup, without claiming expired rows',async()=>{
 const f=announcementFixture();let clock=now;
 await f.log.put('note-buffer-announcement/20260929/earlier',{at:now-10*60000,publicationKeys:[]});
 f.state.rows[0].deadlineAt='2026-09-29T21:03:00+09:00';
 f.delivery.channel=async()=>{clock=now+2*60000;return 'channel';};
 assert.equal((await announce(f.state,f.config,marketing,f.log,f.delivery,()=>clock)).status,'interval_or_daily_limit');
 assert.equal(f.saved.size,1);assert(!f.events.includes('create'));
});
test('verified live announcements are sent before hit reports',async()=>{
 const f=announcementFixture(),hit=sourceFixture().state.rows[0];
 f.state.rows.push({...hit,publicationKey:hit.raceKey+':manshu',articleSeries:'manshu',url:hit.url+'b'});
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,now));
 f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
 const sent=[];f.delivery.create=async text=>{sent.push(text);return {id:'p'+sent.length,text,channelId:'channel',status:'scheduled'};};
 await run(f);assert.equal(sent.length,2);assert(!sent[0].includes('的中'));assert(sent[1].includes('的中'));
});
