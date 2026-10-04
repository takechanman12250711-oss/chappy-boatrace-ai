'use strict';
const fs=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {client,REPO}=require('./note-marketing-store');
const {loadConfig,jstDate,hash,indexBody,validUrl}=require('./note-marketing-content');
const {journal,pairedItems}=require('./send-note-social.cjs');
const digest=s=>createHash('sha256').update(s).digest('hex');
const literal=JSON.stringify;
const fields='id text channelId status externalLink';
function blockers(c,env,now) {
  if(c.mode!=='buffer-free-line-menu'||c.xUsername!=='chappy_boat_ai'||c.xApiCostApproved!==false) throw Error('free_config_invalid');
  const reasons=[];
  if(c.enabled!==true) reasons.push('buffer_not_enabled');
  if(!env.BUFFER_API_KEY||/\s/.test(env.BUFFER_API_KEY)) reasons.push('buffer_api_key_missing');
  if(!Number.isFinite(Date.parse(c.activatedAt))||Date.parse(c.activatedAt)>now) reasons.push('activation_time_missing');
  return reasons;
}
function ledger(store) {
  async function refs(prefix) {const r=await store.api('/git/matching-refs/tags/'+prefix);if(!Array.isArray(r))throw Error('invalid_refs');return r;}
  async function put(name,value) {
    const tree=await store.api('/git/trees','POST',{tree:[{path:'receipt.json',mode:'100644',type:'blob',content:JSON.stringify(value)+'\n'}]});
    const commit=await store.api('/git/commits','POST',{message:'Record free Buffer distribution',tree:tree.sha,parents:[store.revision]});
    const r=await store.api('/git/refs','POST',{ref:'refs/tags/'+name,sha:commit.sha});
    if(r.object?.sha!==commit.sha)throw Error('buffer_record_unverified');
  }
  async function get(name) {
    const r=await store.api('/contents/receipt.json?ref='+encodeURIComponent('refs/tags/'+name),'GET',null,true);
    if(!r)return null;
    if(r.encoding!=='base64')throw Error('receipt_encoding_invalid');
    return JSON.parse(Buffer.from(r.content,'base64').toString('utf8'));
  }
  return {put,get,refs,async budget(now) {
    // Reserve every request durably before HTTP, including failed reads. Rolling
    // 24h <= 80 implies <= 2480 in any rolling 30d, below Free's 3000 limit.
    const dates=[jstDate(now),jstDate(now-86400000)];let count=0;
    for(const date of dates)for(const r of await refs('note-buffer-api/'+date+'/')) {
      const timestamp=Number(r.ref.split('/').at(-1).split('-')[0]);
      if(!Number.isFinite(timestamp))throw Error('budget_record_invalid');
      if(timestamp>=now-86400000)count++;
    }
    if(count>=80)throw Error('buffer_free_budget_reached');
    await put('note-buffer-api/'+jstDate(now)+'/'+now+'-'+randomUUID(),{at:new Date(now).toISOString()});
  }};
}
function transport(env,c,log,request=fetch,clock=Date.now) {
  async function query(query) {
    await log.budget(clock());
    const r=await request('https://api.buffer.com',{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+env.BUFFER_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query})});
    if(!r.ok)throw Error('buffer_http_'+r.status);
    const body=await r.json();if(body.errors?.length||!body.data)throw Error('buffer_graphql_failed');return body.data;
  }
  return {async channel() {
    const orgs=(await query('{account{organizations{id}}}')).account?.organizations;
    if(!Array.isArray(orgs)||orgs.length!==1)throw Error('buffer_one_organization_required');
    const channels=(await query('{channels(input:{organizationId:'+literal(orgs[0].id)+'}){id name service externalLink isDisconnected isLocked isQueuePaused}}')).channels;
    const matches=(channels||[]).filter(x=>x.service==='twitter'&&x.name.replace(/^@/,'').toLowerCase()===c.xUsername);
    if(matches.length!==1)throw Error('buffer_x_account_mismatch');
    const x=matches[0];
    if(x.isDisconnected||x.isLocked||x.isQueuePaused||!/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/chappy_boat_ai\/?$/i.test(x.externalLink||''))throw Error('buffer_channel_unavailable');
    return x.id;
  },async create(text,channelId) {
    const d=await query('mutation{createPost(input:{text:'+literal(text)+',channelId:'+literal(channelId)+',schedulingType:automatic,mode:shareNow,assets:[],needsApproval:false,saveToDraft:false}){... on PostActionSuccess{post{'+fields+'}} ... on MutationError{message}}}');
    if(!d.createPost?.post?.id)throw Error('buffer_post_not_accepted');return d.createPost.post;
  },async post(id) {return (await query('{post(input:{id:'+literal(id)+'}){'+fields+'}}')).post;}};
}
function observed(post,receipt) {
  if(!post||post.id!==receipt.postId||post.channelId!==receipt.channelId||digest(post.text||'')!==receipt.textSha256) return {status:'review_required',reason:'post_identity_or_text_mismatch'};
  if(post.status==='sent') {
    if(!/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/chappy_boat_ai\/status\/\d+(?:\?.*)?$/i.test(post.externalLink||''))return {status:'review_required',reason:'published_url_missing_or_mismatched'};
    return {status:'buffer_confirmed_sent',url:post.externalLink,publicPageIndependentlyVerified:false};
  }
  if(['error','failed'].includes(post.status))return {status:'review_required',reason:'buffer_publish_failed'};
  return {status:'accepted_pending',bufferStatus:post.status};
}
async function reconcile(log,delivery,now) {
  const results=[];
  // Only bounded recent pending receipts; unknown create outcomes are never
  // recreated. Immutable final receipts remain separate from acceptance.
  for(const date of [jstDate(now-86400000),jstDate(now)])for(const ref of await log.refs('note-buffer-accepted/'+date+'/')) {
    const name=ref.ref.replace('refs/tags/',''),suffix=name.replace('note-buffer-accepted/','');
    if(await log.get('note-buffer-final/'+suffix))continue;
    const receipt=await log.get(name), polls=await log.refs('note-buffer-poll/'+suffix+'/');
    if(polls.length>=6) {results.push({status:'review_required',postId:receipt.postId,reason:'verification_attempts_exhausted'});continue;}
    const last=Math.max(0,...polls.map(r=>Number(r.ref.split('/').at(-1))));
    if(now-last<1800000)continue;
    await log.put('note-buffer-poll/'+suffix+'/'+now,{at:now});
    let result;
    try{result=observed(await delivery.post(receipt.postId),receipt);}catch{result={status:'accepted_pending',reason:'verification_unavailable'};}
    if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...receipt,...result});
    results.push({postId:receipt.postId,...result});
  }
  return results;
}

function announcementRows(state,config,now,seen) {
  const activated=Date.parse(config.announcements?.activatedAt);
  if(!Number.isFinite(activated)||activated>now)throw Error('buffer_announcement_activation_invalid');
  return state.rows.filter(r=>r.raceKey.startsWith(jstDate(now)+'-') &&
    Date.parse(r.publishedAt)>=activated && Date.parse(r.publishedAt)<=now &&
    Date.parse(r.deadlineAt)>now+120000 && r.settlement?.status==='pending' &&
    validUrl(r.url) && /^[a-f0-9]{64}$/.test(r.sourceSha256||'') &&
    ['normal','escape','manshu'].includes(r.articleSeries) && !seen.has(r.publicationKey));
}
function announcementText(rows,marketing,now) {
  if(!validUrl(marketing.index.url))throw Error('buffer_announcement_index_invalid');
  const date=jstDate(now),time=new Date(now+9*3600000).toISOString().slice(11,16);
  const labels={normal:'通常',escape:'イン逃げ',manshu:'万舟'};
  const counts=Object.entries(labels).map(([key,label])=>`${label}${rows.filter(r=>r.articleSeries===key).length}件`).join('・');
  return `${Number(date.slice(4,6))}/${Number(date.slice(6,8))} ${time}更新（日本時間）\nnote予想記事を公開しました\n今回のご案内：${rows.length}記事\n${counts}\n価格・日付・締切は各記事をご確認ください。\n全記事・成績はこちら\n${marketing.index.url}`;
}
async function announce(state,config,marketing,log,delivery,clock) {
  if(config.announcements?.enabled!==true)return {status:'disabled'};
  let now=clock();const date=jstDate(now),seen=new Set();
  const refs=await log.refs('note-buffer-announcement/'+date+'/');let last=0;
  for(const ref of refs) {
    const record=await log.get(ref.ref.replace('refs/tags/',''));
    if(!record||!Array.isArray(record.publicationKeys)||!Number.isFinite(record.at))throw Error('buffer_announcement_record_invalid');
    record.publicationKeys.forEach(k=>seen.add(k));last=Math.max(last,record.at);
  }
  // Failed/unknown attempts also consume a slot and permanently cover their rows.
  if(refs.length>=8||now-last<3600000)return {status:'interval_or_daily_limit'};
  let rows=announcementRows(state,config,now,seen);
  if(!rows.length)return {status:'no_new_articles'};
  const channelId=await delivery.channel();now=clock();
  if(jstDate(now)!==date)throw Error('buffer_date_changed');
  rows=announcementRows(state,config,now,seen);
  if(!rows.length)return {status:'deadlines_passed'};
  const text=announcementText(rows,marketing,now);
  const publicationKeys=rows.map(r=>r.publicationKey).sort();
  if(new Set(publicationKeys).size!==rows.length)throw Error('buffer_announcement_duplicate');
  const publicationKey='announcement:'+date+':'+digest(JSON.stringify(publicationKeys));
  const suffix=date+'/'+digest(publicationKey);
  const receipt={date,publicationKey,publicationKeys,at:now,channelId,textSha256:digest(text),
    sources:rows.map(r=>({publicationKey:r.publicationKey,sourceSha256:r.sourceSha256,url:r.url})),provider:'buffer-free-announcement'};
  // One atomic batch claim before HTTP; no per-row partial reservation problem.
  await log.put('note-buffer-announcement/'+suffix,receipt);
  let post;
  try {post=await delivery.create(text,channelId);} catch {
    await log.put('note-buffer-announcement-review/'+suffix,{...receipt,status:'review_required',reason:'create_failed_or_unknown_do_not_resend'});
    return {status:'review_required',articles:rows.length};
  }
  const accepted={...receipt,postId:post.id};
  await log.put('note-buffer-accepted/'+suffix,accepted);
  const result=observed(post,accepted);
  if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...accepted,...result});
  return {...result,postId:post.id,articles:rows.length};
}

async function run({env=process.env,now=Date.now(),clock=Date.now,config=JSON.parse(fs.readFileSync('config/note-social.json','utf8')),marketing=loadConfig(),store,log,delivery,claims}={}) {
  const reasons=blockers(config,env,now);if(reasons.length)return {status:'awaiting_buffer_connection',reasons};
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main')throw Error('buffer_main_only');
  store ||= client(env);log ||= ledger(store);delivery ||= transport(env,config,log);claims ||= journal(store);
  const results=await reconcile(log,delivery,now);
  const loaded=await store.load(marketing),state=await store.settle(loaded.state,marketing,now);
  if(loaded.state.verifiedDate!==jstDate(now)||loaded.state.articles.index.hash!==hash(indexBody(state.rows,marketing,now)))throw Error('buffer_public_index_not_verified');
  // Existing paired draft validator is retained only as an evidence validator;
  // this sender has no LINE or direct paid X transport.
  const candidates=pairedItems(state,config,now);let channelId,started=0;
  for(const {row,item} of candidates) {
    const pair={date:state.date,publicationKey:row.publicationKey,evidenceId:row.settlement.evidenceId,textSha256:digest(item.text),sourceSha256:row.sourceSha256,provider:'buffer-free',attemptedAt:new Date(now).toISOString()};
    if(await claims.exists(pair))continue;
    if(started>=5)break;
    channelId ||= await delivery.channel();
    if(jstDate(clock())!==pair.date)throw Error('buffer_date_changed');
    await claims.reserve(pair);started++;
    let post;
    try{post=await delivery.create(item.text,channelId);}catch {
      await claims.record(pair,{status:'review_required',reason:'buffer_create_failed_or_unknown_do_not_resend'});
      return {status:'review_required',results,started};
    }
    const receipt={...pair,postId:post.id,channelId};
    const suffix=pair.date+'/'+digest(pair.publicationKey);
    await log.put('note-buffer-accepted/'+suffix,receipt);
    await claims.record(pair,{status:'accepted_pending',postId:post.id,channelId});
    const result=observed(post,receipt);
    if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...receipt,...result});
    results.push({postId:post.id,...result});
  }
  const announcement=await announce(state,config,marketing,log,delivery,clock);
  if(announcement.status==='review_required'||announcement.postId)results.push({kind:'announcement',...announcement});
  return {announcement,status:results.some(x=>x.status==='review_required')?'review_required':results.length?'processed':'no_new_hits',started,results};
}
if(require.main===module)run().then(result=>{const text=JSON.stringify(result);console.log('NOTE_BUFFER='+text);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nBuffer Free X reports\n```json\n'+text+'\n```\n');if(result.status==='review_required')process.exitCode=1;}).catch(()=>{console.error('NOTE_BUFFER_STOPPED=check_free_budget_and_permanent_receipts_no_auto_repost');process.exitCode=1;});
module.exports={blockers,ledger,transport,observed,reconcile,announcementRows,announcementText,announce,run};
