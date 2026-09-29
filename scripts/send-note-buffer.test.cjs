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
