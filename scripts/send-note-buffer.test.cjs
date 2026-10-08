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
  const store={load:async()=>({state,head:'d'.repeat(40)}),settle:async state=>state};
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
test('concurrent note UI update defers before claiming without overwriting state; a later run reloads it',async()=>{
 const {publishedIndexBody}=require('./note-marketing-content');
 const f=fixture(),loadedHashes=[];let remoteState=structuredClone(f.state),head='d'.repeat(40),saves=0;
 remoteState.articles.index.verifiedAt=new Date(now-60000).toISOString();
 const oldHash=remoteState.articles.index.hash,newerState=structuredClone(remoteState);
 newerState.korogashiIndex={version:'note-korogashi-index-v1',text:'登録したコースの最新経過\nモデル配分です。'};
 newerState.articles.index.hash=hash(publishedIndexBody(newerState,marketing,now));
 newerState.articles.index.verifiedAt=new Date(now).toISOString();
 assert.notEqual(newerState.articles.index.hash,oldHash);
 f.store={load:async()=>{loadedHashes.push(remoteState.articles.index.hash);return {state:structuredClone(remoteState),head};},
  settle:async state=>state,save:async()=>{saves++;throw Error('Buffer must not save the marketing snapshot');}};
 const channel=f.delivery.channel;
 f.delivery.channel=async()=>{remoteState=structuredClone(newerState);head='e'.repeat(40);return channel();};
 await assert.rejects(run(f),/buffer_marketing_snapshot_changed/);
 assert.deepEqual(remoteState,newerState);assert.equal(saves,0);
 assert(!f.events.includes('claim'));assert(!f.events.includes('create'));
 assert.equal((await run(f)).results[0].status,'accepted_pending');
 const accepted=[...f.saved.entries()].find(([key])=>key.startsWith('note-buffer-accepted/'))[1];
 assert.equal(accepted.noteVerifiedAt,newerState.articles.index.verifiedAt);
 assert.equal((await run(f)).started,0);
 assert.equal(loadedHashes[0],oldHash);assert(loadedHashes.slice(1).every(value=>value===newerState.articles.index.hash));
 assert.deepEqual(remoteState,newerState);assert.equal(saves,0);
 assert.equal(f.events.filter(event=>event==='create').length,1);
});
test('newer hold, removed row, changed source/evidence/outcome or failed read consumes no hit claim and sends nothing',async()=>{
 for(const mode of ['head','pending','review','miss','removed','source','evidence','hash','read','official','officialEvidence','settle']){
  const f=fixture();let changed=false,remoteState=structuredClone(f.state);
  f.store={load:async()=>{
    if(changed&&mode==='read')throw Error('offline');
    return {head:changed&&mode==='head'?'e'.repeat(40):'d'.repeat(40),state:structuredClone(remoteState)};
  },settle:async state=>{
    if(changed&&mode==='settle')throw Error('official lookup unavailable');
    if(changed&&mode==='official')state.rows[0].settlement={status:'review'};
    if(changed&&mode==='officialEvidence')state.rows[0].settlement.evidenceId='c'.repeat(64);
    return state;
  },save:async()=>{throw Error('must not save');}};
  f.delivery.channel=async()=>{
    changed=true;
    if(mode==='pending')remoteState.pendingUpdates={index:{targetHash:'f'.repeat(64)}};
    if(['review','miss'].includes(mode))remoteState.rows[0].settlement.status=mode;
    if(mode==='removed')remoteState.rows=[];
    if(mode==='source')remoteState.rows[0].sourceSha256='c'.repeat(64);
    if(mode==='evidence')remoteState.rows[0].settlement.evidenceId='c'.repeat(64);
    if(mode==='hash')remoteState.articles.index.hash='c'.repeat(64);
    return 'channel';
  };
  await assert.rejects(run(f),/buffer_(marketing_|public_index_)/,mode);
  assert(!f.events.includes('claim'),mode);assert(!f.events.includes('create'),mode);
  assert.equal(f.records.length,0,mode);
 }
});
test('a state change during fresh settlement is caught before reserving a claim',async()=>{
 const f=fixture();let settlements=0,head='d'.repeat(40);
 f.store={load:async()=>({head,state:structuredClone(f.state)}),settle:async state=>{if(++settlements===2)head='e'.repeat(40);return state;}};
 await assert.rejects(run(f),/snapshot_changed/);assert(!f.events.includes('claim'));assert(!f.events.includes('create'));
});
test('invalidation after a hit claim creates no post, keeps its claim and records a known pre-send block',async()=>{
 for(const mode of ['changed','read']){
  const f=fixture();let reserved=false;
  f.store={load:async()=>{
    if(reserved&&mode==='read')throw Error('offline');
    return {head:reserved?'e'.repeat(40):'d'.repeat(40),state:structuredClone(f.state)};
  },settle:async state=>state};
  const reserve=f.claims.reserve;f.claims.reserve=async pair=>{await reserve(pair);reserved=true;};
  const result=await run(f);assert.equal(result.status,'review_required');
  assert.equal(f.events.filter(event=>event==='claim').length,1);assert(!f.events.includes('create'));
  assert.equal(f.records[0].reason,'buffer_pre_send_validation_failed_claim_retained');
  assert(await f.claims.exists({publicationKey:f.state.rows[0].publicationKey}));
  reserved=false;assert.equal((await run(f)).started,0);assert(!f.events.includes('create'));
 }
});
test('missing immutable head and an already-pending index never consume a publication claim',async()=>{
 for(const mode of ['head','pending']){
  const f=fixture();if(mode==='pending')f.state.pendingUpdates={index:{targetHash:'a'.repeat(64)}};
  if(mode==='head')f.store.load=async()=>({state:f.state,head:null});
  await assert.rejects(run(f),/buffer_marketing_(snapshot_missing|update_pending)/);
  assert(!f.events.includes('claim'));assert(!f.events.includes('create'));
 }
});
test('canonical state comparison ignores object key order while retaining original verification time',async()=>{
 const f=fixture();f.state.articles.index.verifiedAt=new Date(now-60000).toISOString();
 const reverse=value=>Array.isArray(value)?value.map(reverse):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reverse(item)])):value;
 let reads=0;f.store.load=async()=>({head:'d'.repeat(40),state:++reads===1?structuredClone(f.state):reverse(f.state)});
 assert.equal((await run(f)).results[0].status,'accepted_pending');
 const accepted=[...f.saved.entries()].find(([key])=>key.startsWith('note-buffer-accepted/'))[1];
 assert.equal(accepted.noteVerifiedAt,f.state.articles.index.verifiedAt);
});
test('changed image delivery bytes after claiming cannot reach Buffer even when source state is unchanged',async()=>{
 const f=fixture(),url='https://raw.githubusercontent.com/takechanman12250711-oss/chappy-boatrace-ai/'+ 'a'.repeat(40)+'/result-card.png';
 const media={url,imageSha256:'a'.repeat(64),assetCommit:'a'.repeat(40),assets:[{image:{url}}]};
 f.config.resultReports={images:true};f.renderCard=async()=>({});f.publishCard=async()=>media;
 const reserve=f.claims.reserve;f.claims.reserve=async pair=>{await reserve(pair);media.assets[0].image.url=url.replace('a'.repeat(40),'b'.repeat(40));};
 const result=await run(f);assert.equal(result.status,'review_required');
 assert.equal(result.reason,'buffer_pre_send_validation_failed_claim_retained');
 assert(f.events.includes('claim'));assert(!f.events.includes('create'));
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
test('announcements and recaps check remote validity before and after their permanent batch claim',async()=>{
 for(const kind of ['announcement','recap'])for(const phase of ['before','after']){
  const f=kind==='announcement'?announcementFixture():fixture();let head='d'.repeat(40);
  if(kind==='recap'){
   f.now=Date.parse('2026-09-29T22:45:00+09:00');f.clock=()=>f.now;
   f.config.recap={enabled:true,activatedAt:'2026-09-29T00:00:00+09:00'};
   f.state.rows[0].settlement.status='miss';
  }
  f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
  f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,f.now));
  f.store={load:async()=>({head,state:structuredClone(f.state)}),settle:async state=>state,
   save:async()=>{throw Error('must not save');}};
  f.delivery.channel=async()=>{if(phase==='before')head='e'.repeat(40);return 'channel';};
  const prefix='note-buffer-'+kind+'/',put=f.log.put;
  f.log.put=async(key,value)=>{await put(key,value);if(phase==='after'&&key.startsWith(prefix))head='e'.repeat(40);};
  if(phase==='before')await assert.rejects(run(f),/snapshot_changed/);
  else {
   const result=await run(f);assert.equal(result.status,'review_required');
   const review=[...f.saved.entries()].find(([key])=>key.startsWith('note-buffer-'+kind+'-review/'))[1];
   assert.equal(review.reason,'buffer_pre_send_validation_failed_claim_retained');
  }
  assert.equal([...f.saved.keys()].filter(key=>key.startsWith(prefix)).length,phase==='after'?1:0);
  assert(!f.events.includes('create'));assert(!f.events.includes('claim'));
  if(phase==='after'){head='d'.repeat(40);await run(f);assert(!f.events.includes('create'));}
 }
});
test('announcement freshness reads crossing the 120-second cutoff do not consume a slot',async()=>{
 const f=announcementFixture();let clock=now,loads=0;
 f.state.rows.forEach(row=>row.deadlineAt=new Date(now+180000).toISOString());
 f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,now));f.clock=()=>clock;
 f.store={load:async()=>{if(++loads===3)clock=now+61000;return {head:'d'.repeat(40),state:structuredClone(f.state)};},settle:async state=>state};
 await assert.rejects(run(f),/announcement_deadline_passed/);
 assert.equal(f.saved.size,0);assert(!f.events.includes('create'));
});
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
 assert(text.includes('AI展開｜尼崎4R｜🕒 22:00締切'));assert(text.includes('本命｜尼崎4R｜🕒 22:00締切'));assert(text.includes(marketing.index.url));assert(!text.includes('的中'));
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
 assert(text.includes('尼崎4R｜🕒 22:00締切'));assert(text.includes('選べます。200円。'));assert(text.includes(r.url));assert(text.includes('1号艇の先行'));assert(weight(text)<=280);
 const long=Array.from({length:30},(_,i)=>({...r,raceNo:i%12+1,publicationKey:r.publicationKey+i}));
 assert(weight(announcementCopy(long,marketing.index.url,now))<=280);
 r.socialContext.preview='買い目は1-2-3です。';assert(!announcementCopy([r],marketing.index.url,now).includes('1-2-3'));
});
test('announcement grouping preserves series and prices across mixed and omitted articles',()=>{
 const f=announcementFixture(),r={...f.state.rows[0],price:200};
 const other={...f.state.rows[1],price:200};
 const mixed=announcementCopy([r,other],marketing.index.url,now);
 assert(mixed.startsWith('🚤 9/29 予想記事\n'));
 assert(mixed.includes('AI展開｜尼崎4R｜🕒 22:00締切'));assert(mixed.includes('本命｜尼崎4R｜🕒 22:00締切'));
 assert(mixed.includes('各200円。'));assert(weight(mixed)<=280);
 const batch=Array.from({length:8},(_,i)=>({...r,raceNo:i+1,publicationKey:r.publicationKey+i}));
 for(const price of [300,undefined]){
   batch[7].price=price;
   const text=announcementCopy(batch,marketing.index.url,now);
   assert(text.startsWith('🚤 9/29 AI展開予想\n'));assert(!text.includes('各200円'));
   assert(text.includes('尼崎1R｜🕒 22:00締切｜200円'));assert(text.includes('価格は各記事で確認。'));
   assert(text.includes('記事は一覧へ'));assert(text.includes(marketing.index.url));assert(weight(text)<=280);
 }
});
test('recap includes misses and unresolved separately, only source-backed comparison',()=>{
 const f=fixture(),r=f.state.rows[0];
 const miss={...r,articleSeries:'escape',publicationKey:r.raceKey+':escape',settlement:{...r.settlement,status:'miss'},socialContext:{version:'source-context-v1',sourceSha256:r.sourceSha256,firstBoats:['1']}};
 const text=recapCopy([r,miss,{...r,articleSeries:'manshu',publicationKey:r.raceKey+':manshu',settlement:{status:'review'}}],marketing.index.url,now);
 assert(text.includes('AI展開：🎯 的中 1件'));assert(text.includes('本命：❌ 不的中 1件'));assert(text.includes('万舟：🔎 照合確認中 1件'));assert(!text.includes('0的中'));assert(!text.includes('0不的中'));assert(text.includes('1着は想定内、組み合わせが不的中'));assert(weight(text)<=280);
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

const {hitItems,recoverRecap,validateAssets}=require('./send-note-buffer.cjs');
function nextDayFixture() {
 const f=fixture();f.now=Date.parse('2026-09-30T00:05:00+09:00');f.clock=()=>f.now;
 f.config.resultReports={previousDay:true,images:false};
 f.state.date=f.state.verifiedDate='20260930';f.state.articles.index.verifiedAt=new Date(f.now).toISOString();
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,f.now));
 f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260930');return f;
}
test('previous-day unclaimed hit is clearly dated and retains race-day permanent claim',async()=>{
 const f=nextDayFixture();let text,claim;
 const reserve=f.claims.reserve;f.claims.reserve=async p=>{claim=p;await reserve(p);};
 f.delivery.create=async t=>{text=t;f.events.push('create');return {id:'late',text:t,channelId:'channel',status:'scheduled'};};
 const result=await run(f);assert.equal(result.started,1);assert(text.startsWith('前日分 9/29'));
 assert.equal(claim.date,'20260929');assert.equal(claim.deliveryDate,'20260930');
 assert([...f.saved.keys()].some(k=>k.startsWith('note-buffer-accepted/20260930/')));
 await run(f);assert.equal(f.events.filter(e=>e==='create').length,1);
 const g=nextDayFixture();await g.claims.reserve({publicationKey:g.state.rows[0].publicationKey,date:'20260929'});
 assert.equal((await run(g)).started,0);assert(!g.events.includes('create'));
});
test('previous-day timeout stays permanently claimed and two-day-old hits never qualify',async()=>{
 const f=nextDayFixture();let calls=0;f.delivery.create=async()=>{calls++;throw Error('unknown');};
 assert.equal((await run(f)).status,'review_required');await run(f);assert.equal(calls,1);
 const g=nextDayFixture();g.now+=86400000;g.state.date=g.state.verifiedDate='20261001';
 g.state.distribution=distributionDrafts(g.state.rows,marketing,'20261001');g.state.articles.index.hash=hash(indexBody(g.state.rows,marketing,g.now));
 assert.equal(hitItems(g.state,g.config,marketing,g.now).length,0);
});
test('late recovery recap reports every status, counts articles vs unique races, and sends once',async()=>{
 const f=nextDayFixture();f.config.recap={enabled:true,activatedAt:config.activatedAt};
 const r=f.state.rows[0];f.state.rows.push({...r,articleSeries:'escape',publicationKey:r.raceKey+':escape',settlement:{status:'miss'}},
   {...r,articleSeries:'manshu',publicationKey:r.raceKey+':manshu',settlement:{status:'void'}});
 let text;f.delivery.create=async t=>{text=t;return {id:'recap',channelId:'channel',text:t,status:'scheduled'};};
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'accepted_pending');
 assert(text.startsWith('📊 前日分 9/29'));assert(text.includes('3記事・1レース'));
 assert(text.includes('❌ 不的中 1件'));assert(text.includes('➖ 不成立 1件'));assert(weight(text)<=280);
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'earlier_send_unconfirmed_no_resend');
});
test('late supplement requires confirmed earlier send and newly resolved evidence; never retries an unknown recap',async()=>{
 const f=nextDayFixture();f.config.recap={enabled:true,activatedAt:config.activatedAt};
 const row=f.state.rows[0],source={publicationKey:row.publicationKey,sourceSha256:row.sourceSha256,status:'pending'};
 await f.log.put('note-buffer-recap/20260929',{date:'20260929',sources:[source]});
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'earlier_send_unconfirmed_no_resend');
 assert.deepEqual(f.events,[]);
 await f.log.put('note-buffer-final/20260929/'+createHash('sha256').update('recap:20260929').digest('hex'),{status:'buffer_confirmed_sent'});
 let text;f.delivery.create=async t=>{text=t;return {id:'supplement',channelId:'channel',text:t,status:'scheduled'};};
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'accepted_pending');
 assert(text.includes('前日分 9/29'));assert(text.includes('結果追記'));
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'already_attempted');
});
test('zero results, pending and review remain honest in both current and recovered summaries',async()=>{
 const f=nextDayFixture();f.config.recap={enabled:true,activatedAt:config.activatedAt};f.state.rows=[];
 assert.equal((await recoverRecap(f.state,f.config,marketing,f.log,f.delivery,f.clock)).status,'no_articles');assert.deepEqual(f.events,[]);
 const g=nextDayFixture(),r=g.state.rows[0];
 const text=recapCopy([{...r,settlement:{status:'pending'}},{...r,articleSeries:'escape',publicationKey:r.raceKey+':escape',settlement:{status:'review'}}],marketing.index.url,g.now,{date:'20260929',late:true});
 assert(text.includes('AI展開：⏳ 結果待ち 1件'));assert(text.includes('本命：🔎 照合確認中 1件'));assert(!text.includes('的中'));assert(!text.includes('不成立'));assert(text.includes('2記事・1レース'));
});
test('all-miss and all-pending recaps retain denominators without empty status padding',()=>{
 const f=fixture(),r=f.state.rows[0];
 for(const [status,label] of [['miss','❌ 不的中'],['pending','⏳ 結果待ち']]) {
  const rows=['normal','escape','manshu'].map(articleSeries=>({...r,articleSeries,publicationKey:r.raceKey+':'+articleSeries,settlement:{status}}));
  const before=JSON.stringify(rows);
  for(const options of [{},{date:'20260929',late:true},{date:'20260929',late:true,supplement:true}]) {
   const text=recapCopy(rows,marketing.index.url,now,options);
   assert(text.startsWith('📊 '));assert(text.includes('9/29'));assert(text.includes('3記事・1レース'));
   for(const series of ['AI展開','本命','万舟'])assert(text.includes(`${series}：${label} 1件`));
   assert(!text.includes('🎯 的中'));assert(!text.includes('0的中'));assert(!text.includes('0不的中'));
   assert(!text.includes('🔎 照合確認中'));assert(!text.includes('➖ 不成立'));
   assert(text.includes('21:00時点'));assert(text.endsWith(marketing.index.url));assert(weight(text)<=280);
  }
  assert.equal(JSON.stringify(rows),before);
 }
});
test('legacy recap overflow retains all five status totals and sends series detail to the free index',()=>{
 const f=fixture(),r=f.state.rows[0],labels={hit:'🎯 的中',miss:'❌ 不的中',pending:'⏳ 結果待ち',void:'➖ 不成立',review:'🔎 照合確認中'};
 const rows=['normal','escape','manshu'].flatMap(articleSeries=>Object.keys(labels).map((status,i)=>({...r,
  articleSeries,raceKey:`20260929-13-${i+1}`,raceNo:i+1,publicationKey:`20260929-13-${i+1}:${articleSeries}`,settlement:{status}})));
 const before=JSON.stringify(rows);
 for(const options of [{},{date:'20260929',late:true},{date:'20260929',late:true,supplement:true}]) {
  const text=recapCopy(rows,marketing.index.url,now,options);
  assert(text.startsWith('📊 '));assert(text.includes('9/29'));assert(text.includes('15記事・5レース'));
  for(const label of Object.values(labels))assert(text.includes(`${label} 3件`));
  assert(text.includes('種類別の内訳は無料一覧へ'));assert(text.includes('公開時の中心買い目で判定。'));
  assert(text.includes('21:00時点'));assert(text.endsWith(marketing.index.url));assert(weight(text)<=280);
 }
 assert.equal(JSON.stringify(rows),before);
});
test('JST date boundaries and non-Japanese daylight-saving changes do not mislabel reports',()=>{
 for(const instant of ['2026-11-01T14:59:59Z','2026-11-01T15:00:00Z','2026-03-08T14:59:59Z','2026-03-08T15:00:00Z']) {
   const ms=Date.parse(instant),day=require('./note-marketing-content').jstDate(ms);
   assert.equal(day,instant.includes('15:00')?(instant.startsWith('2026-11')?'20261102':'20260309'):(instant.startsWith('2026-11')?'20261101':'20260308'));
 }
 const f=nextDayFixture();let time=f.now;f.clock=()=>time;f.delivery.channel=async()=>{time+=86400000;return 'channel';};
 return assert.rejects(run(f),/buffer_date_changed/);
});
test('images are prepared and anonymously verified before claim; failed media never creates a post',async()=>{
 const f=fixture();f.config.resultReports={images:true};
 const url='https://raw.githubusercontent.com/takechanman12250711-oss/chappy-boatrace-ai/'+ 'a'.repeat(40)+'/result-card.png';
 f.renderCard=async()=>{f.events.push('render');return {png:Buffer.from('test')};};
 f.publishCard=async()=>{f.events.push('verify-image');return {url,imageSha256:'a'.repeat(64),assetCommit:'a'.repeat(40),assets:[{image:{url}}]};};
 f.delivery.create=async(text,channel,assets)=>{assert.equal(assets[0].image.url,url);assert(f.events.indexOf('verify-image')<f.events.indexOf('claim'));return {id:'media',text,channelId:channel,status:'scheduled'};};
 await run(f);const accepted=[...f.saved.values()].find(v=>v.postId);assert.equal(accepted.imageUrl,url);assert.equal(accepted.bufferAcceptedAt,new Date(now).toISOString());
 const g=fixture();g.config.resultReports={images:true};g.renderCard=f.renderCard;g.publishCard=async()=>{throw Error('public image unavailable');};
 await assert.rejects(run(g),/public image/);assert(!g.events.includes('claim'));assert(!g.events.includes('create'));
 for(const url of ['https://private.example/secret','https://raw.githubusercontent.com/other/repo/'+ 'a'.repeat(40)+'/result-card.png'])assert.throws(()=>validateAssets([{image:{url}}]),/asset_invalid/);
});
test('source, note verification, Buffer acceptance, and sent observation timestamps remain distinct',async()=>{
 const f=fixture();const r=f.state.rows[0];r.resultObservation={firstResultSeenAt:'2026-09-29T12:00:00+09:00',officialSourceCheckedAt:'2026-09-29T11:59:00+09:00',noteVerifiedAt:'2026-09-29T12:01:00+09:00'};
 f.delivery.create=async text=>({id:'sent',text,channelId:'channel',status:'sent',externalLink:'https://x.com/chappy_boat_ai/status/1234'});
 await run(f);const final=[...f.saved.values()].find(v=>v.status==='buffer_confirmed_sent');
 assert.equal(final.firstResultSeenAt,r.resultObservation.firstResultSeenAt);assert.equal(final.noteVerifiedAt,r.resultObservation.noteVerifiedAt);
 assert.equal(final.bufferAcceptedAt,new Date(now).toISOString());assert.equal(final.sentObservedAt,new Date(now).toISOString());assert(!Object.hasOwn(final,'officialConfirmedAt'));
});
test('midnight with all hits already claimed still blocks recap until the new-day index is verified',async()=>{
 const f=fixture();f.config.resultReports={previousDay:true};f.config.recap={enabled:true,activatedAt:config.activatedAt};
 await f.claims.reserve({publicationKey:f.state.rows[0].publicationKey,date:'20260929'});
 f.clock=()=>Date.parse('2026-09-30T00:01:00+09:00');
 await assert.rejects(run(f),/buffer_date_changed/);assert(!f.events.includes('create'));
});
test('image send verification pins real image source, size and MIME independently of text sent status',()=>{
 const text='verified report',url='https://raw.githubusercontent.com/takechanman12250711-oss/chappy-boatrace-ai/'+ 'a'.repeat(40)+'/result-card.png';
 const receipt={postId:'p',channelId:'c',textSha256:createHash('sha256').update(text).digest('hex'),imageUrl:url};
 const asset={source:url,mimeType:'image/png',type:'image',image:{width:1200,height:675}};
 const post={id:'p',channelId:'c',text,status:'sent',externalLink:'https://x.com/chappy_boat_ai/status/123',assets:[asset]};
 assert.equal(observed(post,receipt,now).imageSourceVerified,true);
 for(const change of [{assets:[]},{assets:[{...asset,source:'https://wrong.example/a.png'}]},{assets:[{...asset,image:{width:1,height:1}}]}]){
  const actual=observed({...post,...change},receipt,now);assert.equal(actual.status,'review_required');assert.equal(actual.textSentVerified,true);
 }
});
function publicFixture() {
 const f=fixture(),row=f.state.rows[0];
 f.config.resultReports={scope:'published-main-sections-v1',previousDay:true,images:false};
 row.settlement={...row.settlement,status:'miss'};
 row.publishedSettlement={status:'hit',method:'published-main-sections-v1',combination:'1-2-3',payoutPer100Yen:1230,
  resultUrl:row.resultUrl,matchedSections:['相手を広げるなら'],publishedTicketCount:8,sectionsSha256:'c'.repeat(64),evidenceId:'d'.repeat(64)};
 f.state.publishedRaceResults=require('./note-public-results').raceReports([row],new Map([[row.publicationKey,['1-2-3','2-1-3']]]));
 f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,now));return f;
}
test('real read-only settlement rebuilds source provenance consistently across advancing preflight clocks',async()=>{
 const {client,REPO}=require('./note-marketing-store'),{initialState,publishedIndexBody}=require('./note-marketing-content');
 const {LEGACY_READABLE}=require('./note-published-ticket-sections'),{markResultsVerified}=require('./note-marketing-reports');
 const f=fixture(),bundle=require('./note-independent-monitor-fixture').fixture();
 bundle.version='note-draft-bundle-v1';delete bundle.monitor;delete bundle.record.source;
 bundle.record.prediction.mainSheet={tickets:['1-2-3','1-3-2'],coverTickets:['2-1-3'],flowTickets:['3-1-2']};
 bundle.record.prediction.manshuSheet={tickets:['4-1-2']};
 bundle.article.format='formation-v4';bundle.article.paidText='🔥 実戦厳選\n1-2-34\n計 2点';
 const bytes=JSON.stringify(bundle),sourceSha256=createHash('sha256').update(bytes).digest('hex');
 const deadline=Date.parse(bundle.record.deadlineAt),time=deadline+3600000;let clock=time;
 const row={raceKey:bundle.record.raceKey,publicationKey:bundle.record.raceKey+':normal',articleSeries:'normal',
  place:bundle.record.place,raceNo:bundle.record.raceNo,ticketCount:2,sourceSha256,deadlineAt:bundle.record.deadlineAt,
  publishedAt:new Date(deadline-180000).toISOString(),url:'https://note.com/great_robin3243/n/nabcdef',
  resultUrl:'https://www.boatrace.jp/owpc/pc/race/raceresult?hd=20260928&jcd=15&rno=6',
  publicationEvidence:{version:'note-publication-evidence-v1',receiptCommitSha:'a'.repeat(40),publisherCommitSha:'b'.repeat(40),sourceSha256,...LEGACY_READABLE}};
 const official={ok:true,source:'boatrace-official',date:'20260928',jcd:'15',raceNo:6,checkedAt:new Date(deadline+1800000).toISOString(),
  resultAvailable:true,status:'finished',resultUrl:row.resultUrl,trifecta:{combination:'4-1-2',payout:2000},finishers:[4,1,2].map((boat,i)=>({rank:i+1,boat}))};
 const reader=client({GITHUB_REPOSITORY:REPO,NOTE_CLAIM_TOKEN:'test-only',NOTE_CLAIM_SHA:'d'.repeat(40)},async(url,options)=>{
  assert.equal(options.method,'GET');assert(new URL(url).searchParams.get('ref')==='main');
  const content=url.includes('/contents/data/results/')?JSON.stringify({source:'boatrace-official',date:'20260928',races:[official]}):url.includes('/contents/data/note-drafts/')?bytes:null;
  assert.notEqual(content,null);return {ok:true,json:async()=>({encoding:'base64',content:Buffer.from(content).toString('base64')})};
 });
 f.now=time;f.clock=()=>++clock;f.config.activatedAt='2026-09-28T00:00:00+09:00';
 f.config.resultReports={scope:'published-main-sections-v1',images:false};
 const pending={...initialState(marketing),date:'20260928',verifiedDate:'20260928',
  rows:[{...row,settlement:{status:'pending'},publishedSettlement:{status:'pending'}}]};
 pending.articles.index={hash:hash(publishedIndexBody(pending,marketing,time)),verifiedAt:new Date(time-60000).toISOString()};
 const pendingBefore=JSON.stringify(pending);
 f.store={load:async()=>({head:'c'.repeat(40),state:pending}),settle:reader.settle,
  save:async()=>{throw Error('must not save');}};
 // Fresh official evidence can change the settled copy, but cannot turn the old
 // pending public index into verified authority or mutate the loaded raw state.
 await assert.rejects(run(f),/buffer_public_index_not_verified/);
 assert.equal(JSON.stringify(pending),pendingBefore);assert.equal(pending.rows[0].settlement.status,'pending');
 assert(!f.events.includes('claim'));assert(!f.events.includes('create'));
 const settled=await reader.settle(pending,marketing,time);
 assert.equal(settled.rows[0].settlement.status,'miss');assert.equal(settled.rows[0].publishedSettlement.status,'hit');
 assert.equal(JSON.stringify(pending),pendingBefore);
 settled.rows=markResultsVerified(settled.rows,time);settled.publishedRaceResults.forEach(report=>report.noteVerifiedAt=new Date(time).toISOString());
 settled.verifiedDate=settled.date;settled.articles.index={hash:hash(publishedIndexBody(settled,marketing,time)),verifiedAt:new Date(time).toISOString()};
 const persisted=JSON.parse(JSON.stringify(settled)),before=JSON.stringify(persisted);
 f.store={load:async()=>({head:'d'.repeat(40),state:structuredClone(persisted)}),settle:reader.settle,
  save:async()=>{throw Error('must not save');}};
 const result=await run(f);assert.equal(result.started,1);assert.equal(result.results[0].status,'accepted_pending');
 assert.equal(JSON.stringify(persisted),before);
 const accepted=[...f.saved.entries()].find(([key])=>key.startsWith('note-buffer-accepted/'))[1];
 assert.equal(accepted.noteVerifiedAt,new Date(time).toISOString());
});
test('new public-union scope sends an additional-section hit once without overwriting center miss',async()=>{
 const f=publicFixture();let text;
 f.delivery.create=async t=>{text=t;f.events.push('create');return {id:'union',text:t,channelId:'channel',status:'scheduled'};};
 assert.equal((await run(f)).started,1);assert(text.includes('相手を広げるなら'));assert(text.includes('掲載全券2点'));
 assert.equal(f.state.rows[0].settlement.status,'miss');await run(f);assert.equal(f.events.filter(e=>e==='create').length,1);
 const receipt=[...f.saved.values()].find(v=>v.postId);assert.equal(receipt.publicationKey,'20260929-13-4:published-main');assert.equal(receipt.method,'published-main-sections-v1');
});
test('new race-level reports honor old article-level permanent claims including unknown outcomes',async()=>{
 const f=publicFixture();await f.claims.reserve({date:'20260929',publicationKey:f.state.rows[0].publicationKey});
 assert.equal((await run(f)).started,0);assert(!f.events.includes('create'));
});
test('multiple public article kinds yield one race report with every actual matching section',async()=>{
 const f=publicFixture(),first=f.state.rows[0],second={...first,articleSeries:'escape',publicationKey:first.raceKey+':escape',url:first.url+'a'};
 second.publishedSettlement={...first.publishedSettlement,matchedSections:['中心の買い目']};f.state.rows.push(second);
 f.state.publishedRaceResults=require('./note-public-results').raceReports(f.state.rows,new Map(f.state.rows.map(r=>[r.publicationKey,['1-2-3','2-1-3']])));
 f.state.articles.index.hash=hash(indexBody(f.state.rows,marketing,now));let text;
 f.delivery.create=async t=>{text=t;f.events.push('create');return {id:'combined',text:t,channelId:'channel',status:'scheduled'};};
 assert.equal((await run(f)).started,1);
 if(text.includes('的中した掲載欄は画像・無料一覧へ')) {
  assert(text.includes('AI展開／独立本命'));assert(text.includes(marketing.index.url));
 } else {
  assert(text.includes('独立本命予想「中心の買い目」'));assert(text.includes('AI展開予想「相手を広げるなら」'));
 }
 assert(weight(text)<=280);
 assert.equal(f.events.filter(e=>e==='create').length,1);
});
test('public recap shares race deduplication and links to center metrics in the note appendix',async()=>{
 const f=publicFixture();f.config.recap={enabled:true,activatedAt:config.activatedAt};f.now=Date.parse('2026-09-29T22:45:00+09:00');f.clock=()=>f.now;
 let texts=[];f.delivery.create=async text=>{texts.push(text);return {id:'p'+texts.length,text,channelId:'channel',status:'scheduled'};};
 const r=await run(f);assert.equal(r.recap.status,'accepted_pending');const text=texts.find(t=>t.includes('結果まとめ'));
 assert(text.includes('1記事・1レース'));assert(text.includes('🎯 的中 1R'));assert(!text.includes('❌ 不的中'));assert(!text.includes('0的中'));assert(text.includes('種類別・中心のみの従来成績も無料一覧に掲載。'));assert(text.includes(marketing.index.url));assert(text.includes('参考は別集計'));
});

test('new display text and image rendering cannot revive prior race or article claims',async()=>{
 for(const type of ['race','article']) {
  const f=publicFixture();f.config.resultReports.images=true;
  const publicationKey=type==='race'?f.state.publishedRaceResults[0].publicationKey:f.state.rows[0].publicationKey;
  await f.claims.reserve({date:'20260929',publicationKey,evidenceId:'old-evidence',textSha256:'old-text-hash'});
  f.renderCard=async()=>{throw Error('old_claim_must_skip_new_renderer');};
  f.publishCard=async()=>{throw Error('old_claim_must_skip_image_upload');};
  assert.equal((await run(f)).started,0);assert(!f.events.includes('create'));assert(!f.events.includes('channel'));
 }
});
