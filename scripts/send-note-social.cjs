'use strict';
const fs = require('node:fs');
const { createHash, createHmac, randomBytes, randomUUID } = require('node:crypto');
const { client, REPO } = require('./note-marketing-store');
const { loadConfig, jstDate, hash, publishedIndexBody } = require('./note-marketing-content');
const { check, EXPECTED_BASIC_ID } = require('./check-line-connection.cjs');
const digest = text => createHash('sha256').update(text).digest('hex');
const enc = s => encodeURIComponent(s).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
const SECRET_NAMES = ['X_API_KEY','X_API_SECRET','X_ACCESS_TOKEN','X_ACCESS_TOKEN_SECRET','LINE_CHANNEL_ACCESS_TOKEN'];

function blockers(config, env, now) {
  if (config.version !== 'note-social-config-v1' || config.mode !== 'paired-hit' || config.lineBasicId !== EXPECTED_BASIC_ID) throw Error('social_config_invalid');
  const reasons = [];
  if (config.enabled !== true) reasons.push('delivery_not_enabled');
  if (config.xApiCostApproved !== true) reasons.push('x_cost_not_approved');
  if (!/^[1-9]\d{0,24}$/.test(config.xUserId) || !/^[A-Za-z0-9_]{1,15}$/.test(config.xUsername)) reasons.push('x_account_not_configured');
  if (!Number.isInteger(config.monthlyMaxPairs) || config.monthlyMaxPairs < 1 || config.monthlyMaxPairs > 200) reasons.push('monthly_limit_not_configured');
  const start = Date.parse(config.activatedAt);
  if (!Number.isFinite(start) || start > now) reasons.push('activation_time_not_configured');
  for (const name of SECRET_NAMES) if (!env[name] || /\s/.test(env[name])) reasons.push(name.toLowerCase() + '_missing');
  return reasons;
}

// JSON body fields are not OAuth signature parameters. Only OAuth and query
// parameters are signed. User access tokens are scoped to the pinned owner.
function authorization(method, url, env, nonce = randomBytes(18).toString('hex'), timestamp = Math.floor(Date.now()/1000)) {
  const u = new URL(url);
  const oauth = { oauth_consumer_key: env.X_API_KEY, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp), oauth_token: env.X_ACCESS_TOKEN, oauth_version: '1.0' };
  const parameters = [...Object.entries(oauth), ...u.searchParams].map(([k,v])=>[enc(k),enc(v)])
    .sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0).map(p=>p.join('=')).join('&');
  const base = [method.toUpperCase(), u.origin+u.pathname, parameters].map(enc).join('&');
  oauth.oauth_signature = createHmac('sha1', enc(env.X_API_SECRET)+'&'+enc(env.X_ACCESS_TOKEN_SECRET)).update(base).digest('base64');
  return 'OAuth '+Object.entries(oauth).sort().map(([k,v])=>enc(k)+'="'+enc(v)+'"').join(', ');
}
function transport(env, config, request = fetch) {
  async function x(path, method='GET', body) {
    const url = 'https://api.x.com/2/'+path;
    const response = await request(url, { method, redirect:'error', signal:AbortSignal.timeout(20000),
      headers:{ Authorization:authorization(method,url,env), 'Content-Type':'application/json' },
      ...(body ? {body:JSON.stringify(body)} : {}) });
    if (!response.ok) throw Error('x_http_'+response.status);
    return response.json();
  }
  async function preflight() {
    // No paid X call can be reached before blockers() checks explicit consent.
    const results = await Promise.allSettled([
      check({token:env.LINE_CHANNEL_ACCESS_TOKEN,fetchImpl:request}), x('users/me')
    ]);
    if (results.some(r=>r.status!=='fulfilled')) throw Error('social_connection_check_failed');
    const [line,user] = results.map(r=>r.value);
    if (line.quotaType !== 'limited' || line.quotaLimit < 1 || line.quotaLimit > 200 || line.approximateUsage >= line.quotaLimit) throw Error('line_free_budget_unavailable');
    if (user.data?.id !== config.xUserId || user.data?.username?.toLowerCase() !== config.xUsername.toLowerCase()) throw Error('x_account_mismatch');
  }
  async function sendX(text) {
    let post;
    try { post = await x('tweets','POST',{text}); }
    catch { return {status:'unknown',reason:'x_send_failed_or_unknown_do_not_resend'}; }
    if (!/^[1-9]\d{0,24}$/.test(post.data?.id || '')) return {status:'unknown',reason:'x_receipt_missing_do_not_resend'};
    const id=post.data.id, url=`https://x.com/${config.xUsername}/status/${id}`;
    try {
      const observed=await x(`tweets/${id}?tweet.fields=author_id,entities`);
      let actual=observed.data?.text;
      for (const link of observed.data?.entities?.urls || []) actual=actual?.split(link.url).join(link.expanded_url);
      if (observed.data?.id !== id || observed.data?.author_id !== config.xUserId || actual !== text) throw Error('mismatch');
      return {status:'verified',id,url};
    } catch { return {status:'accepted_unverified',id,url}; }
  }
  async function sendLine(text, retryKey) {
    try {
      const response=await request('https://api.line.me/v2/bot/message/broadcast', {
        method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
        headers:{Authorization:'Bearer '+env.LINE_CHANNEL_ACCESS_TOKEN,'Content-Type':'application/json','X-Line-Retry-Key':retryKey},
        body:JSON.stringify({messages:[{type:'text',text}]}) });
      if (![200,409].includes(response.status)) throw Error('not_accepted');
      const requestId=response.headers.get(response.status===409?'x-line-accepted-request-id':'x-line-request-id');
      if (!/^[a-f0-9-]{36}$/i.test(requestId || '')) throw Error('receipt_missing');
      return {status:'accepted',requestId,deviceDeliveryConfirmed:false};
    } catch { return {status:'unknown',reason:'line_send_failed_or_unknown_do_not_resend'}; }
  }
  return {preflight,sendX,sendLine};
}

function journal(store) {
  const tag = pair => `note-social-claim/${pair.date}/${digest(pair.publicationKey)}`;
  async function writeTag(name, value) {
    const tree=await store.api('/git/trees','POST',{tree:[{path:'receipt.json',mode:'100644',type:'blob',content:JSON.stringify(value,null,2)+'\n'}]});
    const commit=await store.api('/git/commits','POST',{message:'Record paired social distribution',tree:tree.sha,parents:[store.revision]});
    const ref=await store.api('/git/refs','POST',{ref:'refs/tags/'+name,sha:commit.sha});
    if(ref.object?.sha!==commit.sha) throw Error('social_record_unverified');
  }
  return {
    async exists(pair) {return !!await store.api('/git/ref/tags/'+tag(pair),'GET',null,true);},
    async count(month) {
      const refs=await store.api('/git/matching-refs/tags/note-social-claim/'+month);
      if(!Array.isArray(refs) || refs.some(r=>!new RegExp('^refs/tags/note-social-claim/'+month+'[0-9]{2}/[a-f0-9]{64}$').test(r.ref))) throw Error('social_claims_invalid');
      return refs.length;
    },
    async reserve(pair) {await writeTag(tag(pair),pair);},
    async record(pair,result) {await writeTag(tag(pair).replace('note-social-claim/','note-social-receipt/'),{...pair,...result});}
  };
}

function pairedItems(state, config, now) {
  const drafts=state.distribution, date=jstDate(now);
  if(state.date!==date || drafts?.date!==date || drafts.version!=='note-distribution-drafts-v2' || drafts.mode!=='paired-hit') throw Error('social_drafts_stale');
  const x=drafts.x?.items, line=drafts.line?.items;
  if(!Array.isArray(x)||!Array.isArray(line)||x.length!==line.length) throw Error('social_pair_mismatch');
  const pairs=x.map((item,i)=>{
    const other=line[i], rows=state.rows.filter(r=>r.publicationKey===item.publicationKey), row=rows[0];
    const weight=typeof item.text==='string' ? [...item.text.replace(/https:\/\/\S+/g,'x'.repeat(23))].reduce((n,c)=>n+(c.codePointAt(0)>127?2:1),0):Infinity;
    if(rows.length!==1 || row.settlement?.status!=='hit' || !/^[a-f0-9]{64}$/.test(row.settlement.evidenceId || '') ||
       item.id!=='x:'+row.settlement.evidenceId || other.id!=='line:'+row.settlement.evidenceId ||
       other.publicationKey!==item.publicationKey || other.text!==item.text || !weight || weight>280 ||
       row.raceKey.slice(0,8)!==date) throw Error('social_pair_unverified');
    return {row,item};
  }).filter(({row})=>Date.parse(row.deadlineAt)>=Date.parse(config.activatedAt));
  if(new Set(pairs.map(p=>p.row.publicationKey)).size!==pairs.length) throw Error('social_duplicate_publication');
  return pairs;
}

async function run({env=process.env,now=Date.now(),clock=Date.now,config=JSON.parse(fs.readFileSync('config/note-social.json','utf8')),
  marketing=loadConfig(),store,delivery,receipts}={}) {
  const reasons=blockers(config,env,now);
  if(reasons.length) return {status:'awaiting_connection',reasons,pairsStarted:0,automaticDistributionEnabled:false};
  if(env.GITHUB_REPOSITORY!==REPO || env.GITHUB_REF!=='refs/heads/main') throw Error('social_main_only');
  store ||= client(env); delivery ||= transport(env,config); receipts ||= journal(store);
  const loaded=await store.load(marketing);
  // Recheck immutable originals and existing official results; never trust a
  // persisted draft's hit flag. Require its all-results note page to be current.
  const state=await store.settle(loaded.state,marketing,now);
  if(loaded.state.verifiedDate!==jstDate(now) || loaded.state.articles.index.hash!==hash(publishedIndexBody(state,marketing,now))) throw Error('social_public_index_not_verified');
  const items=pairedItems(state,config,now), results=[];
  for(const {row,item} of items) {
    const pair={version:'note-social-pair-v1',date:state.date,publicationKey:row.publicationKey,evidenceId:row.settlement.evidenceId,
      textSha256:digest(item.text),sourceSha256:row.sourceSha256,xUserId:config.xUserId,lineBasicId:config.lineBasicId,
      retryKey:randomUUID(),attemptedAt:new Date().toISOString()};
    if(await receipts.exists(pair)) {results.push({publicationKey:pair.publicationKey,status:'previous_attempt_no_resend'});continue;}
    if(await receipts.count(pair.date.slice(0,6))>=config.monthlyMaxPairs) return {status:'monthly_limit_reached',results};
    // Reserve before even paid authentication reads. A failed preflight must not
    // consume X credits on every scheduled retry. Both preflights still finish
    // before either send, and the reservation survives every failure.
    if(jstDate(clock())!==pair.date) throw Error('social_date_changed');
    await receipts.reserve(pair);
    try { await delivery.preflight(); }
    catch {
      const result={publicationKey:pair.publicationKey,status:'review_required',reason:'preflight_failed_no_messages_sent'};
      await receipts.record(pair,result); results.push(result);
      return {status:'review_required',results};
    }
    if(jstDate(clock())!==pair.date) throw Error('social_date_changed_after_claim');
    const sent=await Promise.allSettled([delivery.sendX(item.text),delivery.sendLine(item.text,pair.retryKey)]);
    const [x,line]=sent.map(r=>r.status==='fulfilled'?r.value:{status:'unknown'});
    const result={publicationKey:pair.publicationKey,status:x.status==='verified'&&line.status==='accepted'?'both_accepted':'review_required',x,line};
    await receipts.record(pair,result);
    results.push(result);
    if(result.status!=='both_accepted') return {status:'review_required',results};
  }
  return {status:results.length?'processed':'no_new_hits',results};
}
if(require.main===module) run().then(result=>{
  const text=JSON.stringify(result); console.log('NOTE_SOCIAL='+text);
  if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'\nX + LINE paired hit distribution\n\n```json\n'+text+'\n```\n');
  if(result.status==='review_required') process.exitCode=1;
}).catch(()=>{console.error('NOTE_SOCIAL_FAILED=stopped_before_retry_check_claims_and_receipts');process.exitCode=1;});
module.exports={blockers,authorization,transport,journal,pairedItems,run};
