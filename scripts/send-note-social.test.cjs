'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {run,transport,journal,authorization,blockers}=require('./send-note-social.cjs');
const {distributionDrafts}=require('./note-marketing-reports');
const {hash,indexBody}=require('./note-marketing-content');
const marketing=require('../config/note-marketing.json');
const now=Date.parse('2026-09-29T21:00:00+09:00');
const config={version:'note-social-config-v1',mode:'paired-hit',enabled:true,activatedAt:'2026-09-29T00:00:00+09:00',
  lineBasicId:'@009mdbvr',xUserId:'123',xUsername:'chappy_test',xApiCostApproved:true,monthlyMaxPairs:10};
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',
  X_API_KEY:'test',X_API_SECRET:'test',X_ACCESS_TOKEN:'test',X_ACCESS_TOKEN_SECRET:'test',LINE_CHANNEL_ACCESS_TOKEN:'test'};
function fixture() {
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
test('disabled, absent credentials and unapproved cost make zero calls including paid GETs',async()=>{
  for(const [key,value] of [['enabled',false],['xApiCostApproved',false],['xUserId',''],['monthlyMaxPairs',0],['activatedAt',null]]) {
    const f=fixture();f.config[key]=value;
    const r=await run(f);assert.equal(r.status,'awaiting_connection');assert.deepEqual(f.events,[]);
  }
  const f=fixture();f.env={...env,X_API_SECRET:''};assert.equal((await run(f)).status,'awaiting_connection');assert.deepEqual(f.events,[]);
  assert(blockers(require('../config/note-social.json'),{},now).includes('delivery_not_enabled'));
});
test('both sends start after shared preflight and durable claim, without awaiting the other send',async()=>{
  const f=fixture();let release;
  f.delivery.sendX=()=>{f.events.push('x');return new Promise(resolve=>{release=()=>resolve({status:'verified'});});};
  f.delivery.sendLine=async()=>{f.events.push('line');assert(release);release();return {status:'accepted'};};
  const r=await run(f);assert.equal(r.results[0].status,'both_accepted');
  assert.deepEqual(f.events,['claim','preflight','x','line','record']);
  const before=f.events.length;
  assert.equal((await run(f)).results[0].status,'previous_attempt_no_resend');assert.equal(f.events.length,before);
});
test('changed text or evidence cannot resend the same publication; unknown result remains claimed',async()=>{
  const f=fixture();f.delivery.sendX=async()=>{throw Error('network');};
  assert.equal((await run(f)).status,'review_required');assert.equal(f.records[0].x.status,'unknown');
  f.state.rows[0].settlement.evidenceId='c'.repeat(64);
  f.state.distribution=distributionDrafts(f.state.rows,marketing,'20260929');
  assert.equal((await run(f)).results[0].status,'previous_attempt_no_resend');assert.equal(f.records.length,1);
});
test('receipt persistence failure cannot permit a second send',async()=>{
  const f=fixture();f.receipts.record=async()=>{throw Error('save failed');};
  await assert.rejects(run(f),/save failed/);
  assert.equal((await run(f)).results[0].status,'previous_attempt_no_resend');assert.equal(f.events.filter(e=>e==='x').length,1);
});
test('failed preflight, failed reservation, wrong branch, midnight or full budget sends neither',async()=>{
  for(const mode of ['preflight','claim','branch','midnight','budget']) {
    const f=fixture();
    if(mode==='preflight')f.delivery.preflight=async()=>{throw Error('preflight');};
    if(mode==='claim')f.receipts.reserve=async()=>{throw Error('claim unknown');};
    if(mode==='branch')f.env={...env,GITHUB_REF:'refs/heads/feature'};
    if(mode==='midnight')f.clock=()=>now+86400000;
    if(mode==='budget')f.receipts.count=async()=>10;
    if(mode==='budget')assert.equal((await run(f)).status,'monthly_limit_reached');
    else if(mode==='preflight') {
      assert.equal((await run(f)).status,'review_required');
      assert.equal((await run(f)).results[0].status,'previous_attempt_no_resend');
    } else await assert.rejects(run(f));
    assert(!f.events.includes('x'));assert(!f.events.includes('line'));
  }
});
test('mismatched media, stale public index, misses, duplicates and pre-activation races never send',async()=>{
  for(const mode of ['text','index','miss','duplicate','activation']) {
    const f=fixture();
    if(mode==='text')f.state.distribution.line.items[0].text+='changed';
    if(mode==='index')f.state.articles.index.hash='old';
    if(mode==='miss')f.state.rows[0].settlement.status='miss';
    if(mode==='duplicate')f.state.rows.push(f.state.rows[0]);
    if(mode==='activation')f.config.activatedAt='2026-09-29T20:00:00+09:00';
    if(mode==='activation')assert.equal((await run(f)).status,'no_new_hits');else await assert.rejects(run(f));
    assert(!f.events.includes('x'));assert(!f.events.includes('line'));
  }
});
const response=(data,status=200,headers={})=>({ok:status<300,status,json:async()=>data,headers:{get:k=>headers[k]}});
test('transport checks fixed accounts and quota; preserves accepted X URL if readback fails',async()=>{
  const calls=[];
  const request=async(url,opts)=>{
    calls.push({url,opts});assert.equal(opts.redirect,'error');
    if(url.endsWith('/info'))return response({basicId:'@009mdbvr'});
    if(url.endsWith('/quota'))return response({type:'limited',value:200});
    if(url.endsWith('/consumption'))return response({totalUsage:1});
    if(url.endsWith('/users/me'))return response({data:{id:'123',username:'chappy_test'}});
    if(url.endsWith('/tweets'))return response({data:{id:'456'}},201);
    if(url.includes('/tweets/456'))return response({},503);
    if(url.endsWith('/broadcast'))return response({},200,{'x-line-request-id':'12345678-1234-1234-1234-123456789abc'});
    throw Error('unexpected');
  };
  const t=transport(env,config,request);await t.preflight();assert(calls.every(c=>c.opts.method==='GET'));
  assert.deepEqual(await t.sendX('report'),{status:'accepted_unverified',id:'456',url:'https://x.com/chappy_test/status/456'});
  const line=await t.sendLine('report','retry');assert.equal(line.deviceDeliveryConfirmed,false);
  const sent=calls.find(c=>c.url.endsWith('/broadcast'));assert.equal(sent.opts.headers['X-Line-Retry-Key'],'retry');
  assert(!JSON.parse(sent.opts.body).to); // official account broadcast, not owner's private test destination
  const wrong=transport(env,{...config,xUserId:'999'},request);await assert.rejects(wrong.preflight(),/x_account_mismatch/);
  const noBudget=transport(env,config,async(url,opts)=>url.endsWith('/consumption')?response({totalUsage:200}):request(url,opts));
  await assert.rejects(noBudget.preflight(),/line_free_budget/);
});
test('X readback verifies owner and expands shortened links without guessing delivery',async()=>{
  const t=transport(env,config,async(url)=>url.endsWith('/tweets')?response({data:{id:'456'}},201):response({data:{id:'456',author_id:'123',text:'hit https://t.co/a',entities:{urls:[{url:'https://t.co/a',expanded_url:'https://note.com/a'}]}}}));
  assert.equal((await t.sendX('hit https://note.com/a')).status,'verified');
  assert.equal((await t.sendX('different')).status,'accepted_unverified');
});
test('OAuth encodes query once, is deterministic with fixed nonce, changes when signed URL changes',()=>{
  const known=authorization('GET','http://photos.example.net/photos?file=vacation.jpg&size=original',{
    X_API_KEY:'dpf43f3p2l4k3l03',X_API_SECRET:'kd94hf93k423kf44',X_ACCESS_TOKEN:'nnch734d00sl2jdk',X_ACCESS_TOKEN_SECRET:'pfkkdhi9sl3r4s00'
  },'kllo9940pd9333jh',1191242096);
  assert(known.includes('oauth_signature="tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D"')); // OAuth 1.0 published GET example
  const first=authorization('GET','https://api.x.com/2/tweets/123?tweet.fields=author_id,entities',env,'fixed',1);
  assert.equal(first,authorization('GET','https://api.x.com/2/tweets/123?tweet.fields=author_id,entities',env,'fixed',1));
  assert.notEqual(first,authorization('GET','https://api.x.com/2/tweets/123',env,'fixed',1));
  assert.match(first,/oauth_signature="[^"]+"/);assert.match(first,/oauth_timestamp="1"/);
});
test('journal atomically claims, records separately and never deletes permanent reservation',async()=>{
  const calls=[],store={revision:'a'.repeat(40),api:async(route,method,body)=>{
    calls.push({route,method,body});
    if(route.includes('/git/matching-refs/'))return [{ref:'refs/tags/note-social-claim/20260929/'+'a'.repeat(64)}];
    if(route.includes('/git/ref/tags/'))return null;
    if(route==='/git/trees')return {sha:'b'.repeat(40)};
    if(route==='/git/commits')return {sha:'c'.repeat(40)};
    if(route==='/git/refs')return {object:{sha:body.sha}};
    throw Error(route);
  }};
  const j=journal(store),pair={date:'20260929',publicationKey:'20260929-13-4:normal'};
  assert.equal(await j.exists(pair),false);assert.equal(await j.count('202609'),1);
  await j.reserve(pair);await j.record(pair,{status:'review_required'});
  const refs=calls.filter(c=>c.route==='/git/refs');assert.equal(refs.length,2);
  assert.match(refs[0].body.ref,/note-social-claim/);assert.match(refs[1].body.ref,/note-social-receipt/);
  assert(calls.every(c=>c.method!=='PATCH'&&c.method!=='DELETE'));
});
