'use strict';
const fs=require('node:fs');
const {createHash,randomUUID}=require('node:crypto');
const {client,REPO}=require('./note-marketing-store');
const {loadConfig,jstDate,hash,publishedIndexBody,validUrl,recentDates}=require('./note-marketing-content');
const {journal,pairedItems}=require('./send-note-social.cjs');
const {distributionDrafts}=require('./note-marketing-reports');
const {hitText,publicRecapCopy,VERSION:PUBLIC_VERSION}=require('./note-public-results');
const allPublished=config=>config.resultReports?.scope==='published-main-sections-v1';
const {announcementCopy,recapCopy,weight,timeOf}=require('./note-marketing-social');
const digest=s=>createHash('sha256').update(s).digest('hex');
const literal=JSON.stringify;
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const failedCreateReason=(error,fallback)=>error?.bufferSendBlocked===true?'buffer_pre_send_validation_failed_claim_retained':fallback;
const fields='id text channelId status externalLink assets { id mimeType source type ... on ImageAsset { image { width height altText } } }';
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
function validateAssets(assets) {
  if(!Array.isArray(assets)||assets.length>1||assets.some(a=>!a?.image||
    !/^https:\/\/raw\.githubusercontent\.com\/takechanman12250711-oss\/chappy-boatrace-ai\/[a-f0-9]{40}\/result-card\.png$/.test(a.image.url||'')||(a.image.metadata!==undefined&&(typeof a.image.metadata.altText!=='string'||a.image.metadata.altText.length>1000))))throw Error('buffer_asset_invalid');
}
function assetInput(assets) {
  validateAssets(assets);
  return '['+assets.map(a=>'{image:{url:'+literal(a.image.url)+(a.image.metadata?',metadata:{altText:'+literal(a.image.metadata.altText)+'}':'')+'}}').join(',')+']';
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
  },async create(text,channelId,assets=[]) {
    validateAssets(assets);
    const d=await query('mutation{createPost(input:{text:'+literal(text)+',channelId:'+literal(channelId)+',schedulingType:automatic,mode:shareNow,assets:'+assetInput(assets)+',needsApproval:false,saveToDraft:false}){... on PostActionSuccess{post{'+fields+'}} ... on MutationError{message}}}');
    if(!d.createPost?.post?.id)throw Error('buffer_post_not_accepted');return d.createPost.post;
  },async post(id) {return (await query('{post(input:{id:'+literal(id)+'}){'+fields+'}}')).post;},
  async metrics(id) {return (await query('{post(input:{id:'+literal(id)+'}){'+fields+' metrics{type name value unit} metricsUpdatedAt}}')).post;}};
}
function observed(post,receipt,now=Date.now()) {
  if(!post||post.id!==receipt.postId||post.channelId!==receipt.channelId||digest(post.text||'')!==receipt.textSha256) return {status:'review_required',reason:'post_identity_or_text_mismatch'};
  if(post.status==='sent') {
    if(!/^https:\/\/(?:www\.)?(?:x|twitter)\.com\/chappy_boat_ai\/status\/\d+(?:\?.*)?$/i.test(post.externalLink||''))return {status:'review_required',reason:'published_url_missing_or_mismatched'};
    if(receipt.imageUrl) {
      const assets=post.assets;
      if(!Array.isArray(assets)||assets.length!==1||assets[0].source!==receipt.imageUrl||
         assets[0].mimeType!=='image/png'||assets[0].type!=='image'||assets[0].image?.width!==1200||assets[0].image?.height!==675) {
        return {status:'review_required',reason:'published_image_missing_or_mismatched',textSentVerified:true,
          url:post.externalLink,sentObservedAt:new Date(now).toISOString(),publicPageIndependentlyVerified:false};
      }
    }
    return {status:'buffer_confirmed_sent',...(receipt.imageUrl?{imageSourceVerified:true}:{}),url:post.externalLink,sentObservedAt:new Date(now).toISOString(),publicPageIndependentlyVerified:false};
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
    try{result=observed(await delivery.post(receipt.postId),receipt,now);}catch{result={status:'accepted_pending',reason:'verification_unavailable'};}
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
  return announcementCopy(rows,marketing.index.url,now);
}
function announcementDue(rows,last,now) {
  if(now-last<5*60000)return false;
  if(now-last>=3600000)return true;
  // Do not wait an hour when that would leave at most two minutes to read.
  return rows.some(r=>Date.parse(r.deadlineAt)<=last+3600000+120000);
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
  if(refs.length>=8)return {status:'interval_or_daily_limit'};
  let rows=announcementRows(state,config,now,seen);
  if(!rows.length)return {status:'no_new_articles'};
  if(!announcementDue(rows,last,now))return {status:'interval_or_daily_limit'};
  const channelId=await delivery.channel();now=clock();
  if(jstDate(now)!==date)throw Error('buffer_date_changed');
  rows=announcementRows(state,config,now,seen);
  if(!rows.length)return {status:'deadlines_passed'};
  if(!announcementDue(rows,last,now))return {status:'interval_or_daily_limit'};
  const text=announcementText(rows,marketing,now);
  if(weight(text)>280)throw Error('buffer_announcement_too_long');
  const publicationKeys=rows.map(r=>r.publicationKey).sort();
  if(new Set(publicationKeys).size!==rows.length)throw Error('buffer_announcement_duplicate');
  const publicationKey='announcement:'+date+':'+digest(JSON.stringify(publicationKeys));
  const suffix=date+'/'+digest(publicationKey);
  const receipt={date,publicationKey,publicationKeys,at:now,channelId,textSha256:digest(text),
    sources:rows.map(r=>({publicationKey:r.publicationKey,sourceSha256:r.sourceSha256,url:r.url})),provider:'buffer-free-announcement'};
  // Revalidate before consuming a permanent slot, and again at the create boundary.
  await delivery.beforeClaim?.(text,channelId,[],()=>{
    if(rows.some(row=>Date.parse(row.deadlineAt)<=clock()+120000))throw Error('buffer_announcement_deadline_passed');
  });
  // One atomic batch claim before HTTP; no per-row partial reservation problem.
  await log.put('note-buffer-announcement/'+suffix,receipt);
  let post;
  try {post=await delivery.create(text,channelId);} catch(error) {
    const reason=failedCreateReason(error,'create_failed_or_unknown_do_not_resend');
    await log.put('note-buffer-announcement-review/'+suffix,{...receipt,status:'review_required',reason});
    return {status:'review_required',reason,articles:rows.length};
  }
  const accepted={...receipt,postId:post.id,bufferAcceptedAt:new Date(clock()).toISOString()};
  await log.put('note-buffer-accepted/'+suffix,accepted);
  const result=observed(post,accepted,clock());
  if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...accepted,...result});
  return {...result,postId:post.id,articles:rows.length};
}

async function recapDay(state,config,marketing,log,delivery,clock,date,{late=false,supplement=false}={}) {
  const now=clock();
  if(state.date!==jstDate(now)||state.verifiedDate!==jstDate(now))throw Error('buffer_date_changed');
  const activation=Date.parse(config.recap.activatedAt);
  // Do not revive dates before the already-authorized recap activation.
  if (date<jstDate(activation)) return {status:'before_activation'};
  const rows=state.rows.filter(r=>r.raceKey.startsWith(date+'-'));
  if(!rows.length)return {status:'no_articles'};
  if(rows.some(r=>!Number.isFinite(Date.parse(r.deadlineAt))||Date.parse(r.deadlineAt)>now-1800000))return {status:'races_not_finished'};
  if(!validUrl(marketing.index.url))throw Error('buffer_recap_index_invalid');
  const name=(supplement?'note-buffer-recap-late/':'note-buffer-recap/')+date;
  if(await log.get(name))return {status:'already_attempted'};
  const text=(allPublished(config)?publicRecapCopy(rows,state.publishedRaceResults||[],marketing.index.url,now,{date,late,supplement}):recapCopy(rows,marketing.index.url,now,{date,late,supplement})),channelId=await delivery.channel();
  if(!text)throw Error('buffer_public_result_recap_missing');
  if(jstDate(clock())!==jstDate(now))throw Error('buffer_date_changed');
  const publicationKey=(supplement?'recap-late:':'recap:')+date;
  // Tag by delivery day so a late accepted post remains in reconciliation's
  // two-day window. The public report and permanent claim retain the race day.
  const suffix=jstDate(now)+'/'+digest(publicationKey);
  const receipt={date,deliveryDate:jstDate(now),publicationKey,at:now,channelId,textSha256:digest(text),provider:'buffer-free-recap',
    sources:rows.map(r=>({publicationKey:r.publicationKey,sourceSha256:r.sourceSha256,status:(allPublished(config)?r.publishedSettlement:r.settlement)?.status||'pending',evidenceId:(allPublished(config)?r.publishedSettlement:r.settlement)?.evidenceId||null})),
    noteVerifiedAt:state.articles.index.verifiedAt||null};
  await delivery.beforeClaim?.(text,channelId);
  await log.put(name,receipt);
  let post;try{post=await delivery.create(text,channelId);}catch(error){
    const reason=failedCreateReason(error,'create_failed_or_unknown_do_not_resend');
    await log.put(name.replace('recap/','recap-review/').replace('recap-late/','recap-late-review/'),{...receipt,status:'review_required',reason});
    return {status:'review_required',reason};
  }
  const accepted={...receipt,postId:post.id,bufferAcceptedAt:new Date(clock()).toISOString()};await log.put('note-buffer-accepted/'+suffix,accepted);
  const result=observed(post,accepted,clock());
  if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...accepted,...result});
  return {...result,postId:post.id,date,supplement};
}
async function recap(state,config,marketing,log,delivery,clock) {
  if(config.recap?.enabled!==true)return {status:'disabled'};
  const now=clock(),activation=Date.parse(config.recap.activatedAt);
  if(!Number.isFinite(activation)||now<activation)throw Error('buffer_recap_activation_invalid');
  if(timeOf(now)<'22:30')return {status:'before_recap_window'};
  return recapDay(state,config,marketing,log,delivery,clock,jstDate(now));
}
async function recoverRecap(state,config,marketing,log,delivery,clock) {
  if(config.recap?.enabled!==true||config.resultReports?.previousDay!==true)return {status:'disabled'};
  const now=clock(),date=jstDate(now-86400000),activation=Date.parse(config.recap.activatedAt);
  if(!Number.isFinite(activation)||now<activation)throw Error('buffer_recap_activation_invalid');
  const earlier=await log.get('note-buffer-recap/'+date);
  if(!earlier)return recapDay(state,config,marketing,log,delivery,clock,date,{late:true});
  // A supplementary report is a new, explicitly-labelled result update, not
  // a retry. Unknown or failed previous sends never trigger another recap.
  const delivered=await log.get('note-buffer-final/'+(earlier.deliveryDate||date)+'/'+digest('recap:'+date));
  if(delivered?.status!=='buffer_confirmed_sent')return {status:'earlier_send_unconfirmed_no_resend'};
  const rows=state.rows.filter(r=>r.raceKey.startsWith(date+'-'));
  if(rows.some(r=>(allPublished(config)?r.publishedSettlement:r.settlement)?.status==='pending'))return {status:'results_still_pending'};
  const changed=rows.some(r=>earlier.sources?.some(source=>source.publicationKey===r.publicationKey&&
    source.sourceSha256===r.sourceSha256&&['pending','review'].includes(source.status)&&['hit','miss','void'].includes((allPublished(config)?r.publishedSettlement:r.settlement)?.status)));
  if(!changed)return {status:'no_late_results'};
  return recapDay(state,config,marketing,log,delivery,clock,date,{late:true,supplement:true});
}

function requireVerifiedIndex(state,marketing,now) {
  if(state.date!==jstDate(now)||state.verifiedDate!==jstDate(now))throw Error('buffer_date_changed');
  if(state.articles.index.hash!==hash(publishedIndexBody(state,marketing,now)))throw Error('buffer_public_index_not_verified');
}
function hitItems(state,config,marketing,now) {
  if(allPublished(config)) {
    const dates=config.resultReports?.previousDay===true?recentDates(now):[jstDate(now)];
    return (state.publishedRaceResults||[]).filter(r=>r.version===PUBLIC_VERSION&&dates.includes(r.raceKey.slice(0,8))&&
      r.status==='hit'&&Date.parse(r.deadlineAt)>=Date.parse(config.activatedAt)).map(row=>({row,
        item:{publicationKey:row.publicationKey,text:hitText(row,marketing.index.url,row.raceKey.slice(0,8)!==jstDate(now))}}));
  }
  const current=pairedItems(state,config,now);
  if(config.resultReports?.previousDay!==true)return current;
  const previousNow=now-86400000, date=jstDate(previousNow);
  // Only the old draft validator uses the corresponding date. Original and
  // official-result evidence were re-settled at the actual current time.
  const previous={...state,date,distribution:distributionDrafts(state.rows,marketing,date,{previousDay:true})};
  return [...current,...pairedItems(previous,config,previousNow)];
}

function verifiedDelivery(delivery,store,loaded,state,config,marketing,clock) {
  // Bind the exact immutable state commit, source/evidence and generated hit text.
  // Even harmless new entries defer this run; a later run can load the new index.
  requireVerifiedIndex(state,marketing,clock());
  const rawDigest=digest(canonical(loaded.state));
  const evidenceDigest=digest(canonical(state));
  const itemDigests=value=>digest(canonical(hitItems(value,config,marketing,clock())));
  const expectedItems=itemDigests(state);
  if(!/^[a-f0-9]{40}$/.test(loaded.head||''))throw Error('buffer_marketing_snapshot_missing');
  async function current() {
    let latest;try{latest=await store.load(marketing);}catch{throw Error('buffer_marketing_snapshot_unavailable');}
    if(latest.head!==loaded.head)throw Error('buffer_marketing_snapshot_changed');
    if(Object.keys(latest.state.pendingUpdates||{}).length)throw Error('buffer_marketing_update_pending');
    if(digest(canonical(latest.state))!==rawDigest)throw Error('buffer_marketing_snapshot_changed');
    return latest;
  }
  async function verify() {
    const latest=await current();let fresh;
    try{fresh=await store.settle(structuredClone(latest.state),marketing,clock());}
    catch{throw Error('buffer_marketing_evidence_unavailable');}
    requireVerifiedIndex(fresh,marketing,clock());
    if(digest(canonical(fresh))!==evidenceDigest||itemDigests(fresh)!==expectedItems)throw Error('buffer_marketing_evidence_changed');
    // Settlement reads can take time. Recheck the state head after those reads.
    await current();
    requireVerifiedIndex(state,marketing,clock());
  }
  const create=delivery.create.bind(delivery);let planned;
  const itemDigest=(text,channelId,assets=[])=>digest(canonical({text,channelId,assets}));
  return {...delivery,async beforeClaim(text,channelId,assets=[],checkTime=()=>{}) {
    planned=null;
    await verify();checkTime();
    planned={digest:itemDigest(text,channelId,assets),checkTime};
  },async create(text,channelId,assets=[]) {
    const plan=planned;planned=null;
    try {
      if(!plan||plan.digest!==itemDigest(text,channelId,assets))throw Error('buffer_unverified_delivery_item');
      await verify();plan.checkTime();
    }catch(error){error.bufferSendBlocked=true;throw error;}
    // A changed index after this last read is still a narrow TOCTOU boundary.
    // Unpersisted manual holds cannot be inferred from marketing state.
    return create(text,channelId,assets);
  }};
}

async function collectMetrics(config,log,delivery,now) {
  if(config.metrics?.enabled!==true)return {status:'disabled'};
  if(timeOf(now)<'22:30')return {status:'before_metrics_window'};
  const date=jstDate(now),claim='note-buffer-metrics-claim/'+date;
  if(await log.get(claim))return {status:'already_attempted'};
  const receipts=[];
  for(const d of [jstDate(now-86400000),date])for(const ref of await log.refs('note-buffer-final/'+d+'/')) {
    const r=await log.get(ref.ref.replace('refs/tags/',''));
    if(r?.status==='buffer_confirmed_sent'&&r.postId&&r.channelId)receipts.push(r);
  }
  if(!receipts.length)return {status:'no_verified_posts'};
  // Read at most six posts once per JST day, within the existing shared budget.
  // Experimental metrics never gate publishing or trigger strategy changes.
  await log.put(claim,{date,at:now});const items=[];
  for(const receipt of receipts.slice(0,6)) {
    let item={postId:receipt.postId,url:receipt.url,publicationKey:receipt.publicationKey,status:'unavailable',metrics:null};
    try {
      const p=await delivery.metrics(receipt.postId);
      if(observed(p,receipt).status!=='buffer_confirmed_sent')throw Error('metrics_identity_mismatch');
      const metrics=Array.isArray(p.metrics)?p.metrics.filter(m=>typeof m.type==='string'&&typeof m.name==='string'&&
        typeof m.value==='number'&&Number.isFinite(m.value)&&m.value>=0&&typeof m.unit==='string'):[];
      const updated=Date.parse(p.metricsUpdatedAt);
      if(metrics.length&&Number.isFinite(updated)&&updated<=now)item={...item,status:'observed',metrics,metricsUpdatedAt:p.metricsUpdatedAt};
    }catch{/* Unavailable is never represented as zero or retried in a loop. */}
    items.push(item);
  }
  const report={date,observedAt:new Date(now).toISOString(),experimental:true,purchaseAttribution:'not_connected',items};
  await log.put('note-buffer-metrics/'+date,report);
  return {status:'recorded',posts:items.length,available:items.filter(x=>x.status==='observed').length,purchaseAttribution:'not_connected'};
}

async function run({env=process.env,now=Date.now(),clock=Date.now,config=JSON.parse(fs.readFileSync('config/note-social.json','utf8')),marketing=loadConfig(),store,log,delivery,claims,renderCard,publishCard}={}) {
  const reasons=blockers(config,env,now);if(reasons.length)return {status:'awaiting_buffer_connection',reasons};
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main')throw Error('buffer_main_only');
  store ||= client(env);log ||= ledger(store);delivery ||= transport(env,config,log);claims ||= journal(store);
  const results=await reconcile(log,delivery,now);
  const loaded=await store.load(marketing),state=await store.settle(loaded.state,marketing,now);
  if(loaded.state.verifiedDate!==jstDate(now)||loaded.state.articles.index.hash!==hash(publishedIndexBody(state,marketing,now)))throw Error('buffer_public_index_not_verified');
  // UI updates now run independently. A captured index is not current authority:
  // reload immutable state/evidence before each claim and again before sending.
  delivery=verifiedDelivery(delivery,store,loaded,state,config,marketing,clock);
  // Time-sensitive announcements use the existing shared API budget first.
  requireVerifiedIndex(state,marketing,clock());
  const announcement=await announce(state,config,marketing,log,delivery,clock);
  if(announcement.status==='review_required'||announcement.postId)results.push({kind:'announcement',...announcement});
  // Existing paired draft validator is retained only as an evidence validator;
  // this sender has no LINE or direct paid X transport.
  const candidates=hitItems(state,config,marketing,now);let channelId,started=0;
  for(const {row,item} of candidates) {
    const resultSettlement=row.settlement||row;
    const pair={date:row.raceKey.slice(0,8),deliveryDate:jstDate(now),publicationKey:row.publicationKey,evidenceId:resultSettlement.evidenceId,textSha256:digest(item.text),sourceSha256:row.sourceSha256,provider:'buffer-free',attemptedAt:new Date(clock()).toISOString(),
      firstResultSeenAt:row.firstResultSeenAt||row.resultObservation?.firstResultSeenAt||null,officialSourceCheckedAt:row.resultObservation?.officialSourceCheckedAt||null,
      noteVerifiedAt:row.noteVerifiedAt||row.resultObservation?.noteVerifiedAt||state.articles.index.verifiedAt||null};
    if(await claims.exists(pair))continue;
    if(allPublished(config)) {
      // A race-level upgrade cannot bypass old article-level permanent claims.
      // A prior center report, including an unknown attempt, suppresses this
      // race's new alert rather than quietly recreating the same result.
      let previouslyAttempted=false;
      for(const source of row.sources)if(await claims.exists({date:pair.date,publicationKey:source.publicationKey})){previouslyAttempted=true;break;}
      if(previouslyAttempted)continue;
      pair.method='published-main-sections-v1';pair.sources=row.sources;pair.matchedSections=row.matchedSections;
    }
    if(started>=5)break;
    channelId ||= await delivery.channel();
    if(jstDate(clock())!==state.date)throw Error('buffer_date_changed');
    let media;
    if(config.resultReports?.images===true) {
      const render=renderCard||require('./note-result-card.cjs').renderCard;
      const publish=publishCard||require('./note-marketing-image').publishCard;
      const card=await render(row,{now:clock()});
      media=await publish(store,row,card,undefined,clock());
      validateAssets(media.assets);
      Object.assign(pair,{imageSha256:media.imageSha256,imageUrl:media.url,assetCommit:media.assetCommit});
    }
    // Rendering and anonymous media verification may cross midnight. Re-run
    // later with a newly verified index rather than publish a mislabeled card.
    if(jstDate(clock())!==state.date)throw Error('buffer_date_changed');
    requireVerifiedIndex(state,marketing,clock());
    await delivery.beforeClaim(item.text,channelId,media?.assets||[]);
    await claims.reserve(pair);started++;
    let post;
    try{post=await delivery.create(item.text,channelId,media?.assets||[]);}catch(error) {
      const reason=failedCreateReason(error,'buffer_create_failed_or_unknown_do_not_resend');
      await claims.record(pair,{status:'review_required',reason});
      return {status:'review_required',reason,results,started};
    }
    const receipt={...pair,postId:post.id,channelId,bufferAcceptedAt:new Date(clock()).toISOString()};
    const suffix=pair.deliveryDate+'/'+digest(pair.publicationKey);
    await log.put('note-buffer-accepted/'+suffix,receipt);
    await claims.record(pair,{status:'accepted_pending',postId:post.id,channelId});
    const result=observed(post,receipt,clock());
    if(result.status!=='accepted_pending')await log.put('note-buffer-final/'+suffix,{...receipt,...result});
    results.push({postId:post.id,...result});
  }
  if(state.date!==jstDate(clock())||state.verifiedDate!==jstDate(clock()))throw Error('buffer_date_changed');
  requireVerifiedIndex(state,marketing,clock());
  const review=await recap(state,config,marketing,log,delivery,clock);
  if(review.status==='review_required'||review.postId)results.push({kind:'recap',...review});
  requireVerifiedIndex(state,marketing,clock());
  const recovery=await recoverRecap(state,config,marketing,log,delivery,clock);
  if(recovery.status==='review_required'||recovery.postId)results.push({kind:'previous_day_recap',...recovery});
  let metrics;try{metrics=await collectMetrics(config,log,delivery,clock());}catch{metrics={status:'unavailable'};}
  return {announcement,recap:review,recovery,metrics,status:results.some(x=>x.status==='review_required')?'review_required':results.length?'processed':'no_new_hits',started,results};
}
if(require.main===module)run().then(result=>{const text=JSON.stringify(result);console.log('NOTE_BUFFER='+text);if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nBuffer Free X reports\n```json\n'+text+'\n```\n');if(result.status==='review_required')process.exitCode=1;}).catch(error=>{const reason=/^buffer_[a-z0-9_]+$/.test(error.message)?error.message:'verification_failed';console.error('NOTE_BUFFER_STOPPED='+reason+'; permanent_receipts_retained_no_auto_repost');process.exitCode=1;});
module.exports={hitItems,recoverRecap,validateAssets,assetInput,blockers,ledger,transport,observed,reconcile,announcementRows,announcementText,announce,recap,collectMetrics,run};
