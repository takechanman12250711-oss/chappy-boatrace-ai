'use strict';
const fs=require('node:fs');
const k=require('./note-korogashi-lifecycle.cjs');
const {client,REPO}=require('./note-marketing-store');
const {loadConfig,jstDate}=require('./note-marketing-content');
const {repository}=require('./note-korogashi-store.cjs');
function context(env) {
  if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main')throw Error('korogashi_main_context_required');
  return {runId:String(env.GITHUB_RUN_ID),runAttempt:String(env.GITHUB_RUN_ATTEMPT),headSha:env.GITHUB_SHA};
}
function withDispatch(config,env,now) {
  const rows=k.requests(config), firstPublicationKey=String(env.KOROGASHI_FIRST_PUBLICATION_KEY||'').trim();
  if(!firstPublicationKey)return config;
  if(env.GITHUB_EVENT_NAME!=='workflow_dispatch')throw Error('korogashi_dispatch_required');
  const date=firstPublicationKey.slice(0,8);
  if(date!==jstDate(now))throw Error('korogashi_dispatch_current_date_required');
  const targets=String(env.KOROGASHI_TARGETS||'100000,200000,300000').split(',').map(s=>s.trim());
  if(targets.length>10||targets.some(s=>!/^\d+$/.test(s))||new Set(targets).size!==targets.length)throw Error('korogashi_dispatch_targets_invalid');
  for(const target of targets) {
    const r=k.request({id:`course-${firstPublicationKey.replace(':','-')}-${target}`,date,firstPublicationKey,
      targetYen:Number(target),maxLegs:Number(env.KOROGASHI_MAX_LEGS||3),selectionPolicy:k.POLICY});
    const old=rows.find(x=>x.id===r.id);
    if(old&&k.json(old)!==k.json(r))throw Error('korogashi_request_changed');
    if(!old)rows.push(r);
  }
  return {...config,requests:rows};
}
async function artifact(env,fetcher=fetch) {
  context(env);
  if(!/^\d+$/.test(env.KOROGASHI_ARTIFACT_ID||''))throw Error('korogashi_artifact_id_invalid');
  const response=await fetcher(`https://api.github.com/repos/${REPO}/actions/artifacts/${env.KOROGASHI_ARTIFACT_ID}`,{
    redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${env.NOTE_CLAIM_TOKEN}`,Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error('korogashi_artifact_lookup_failed');
  const data=await response.json(), confirmed=Date.parse(response.headers.get('date'))+1000;
  const digest='sha256:'+String(env.KOROGASHI_ARTIFACT_DIGEST||'').replace(/^sha256:/,'');
  if(!Number.isFinite(confirmed)||data.expired||data.id!==Number(env.KOROGASHI_ARTIFACT_ID)||data.digest!==digest||
    data.name!==`note-korogashi-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`||
    String(data.workflow_run?.id)!==String(env.GITHUB_RUN_ID)||data.workflow_run?.head_sha!==env.GITHUB_SHA)throw Error('korogashi_artifact_identity_invalid');
  return {id:data.id,name:data.name,digest:data.digest,createdAt:data.created_at,confirmedAt:new Date(confirmed).toISOString(),
    runId:String(env.GITHUB_RUN_ID),headSha:env.GITHUB_SHA};
}
async function run(mode,file,{env=process.env,clock=Date.now,store=client(env),fetcher=fetch,config}={}) {
  const ctx=context(env), repo=repository(store), before=await repo.load();
  if(mode==='prepare') {
    config=withDispatch(config||JSON.parse(fs.readFileSync('config/note-korogashi.json','utf8')),env,clock());
    if(!config.requests.length&&!Object.keys(before.state.plans).length) {
      if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,'count=0\n');
      return {status:'no_requested_courses',count:0};
    }
    const marketingConfig=loadConfig(), loaded=await store.load(marketingConfig);
    const marketing=await store.collect(loaded.state,clock());
    const out=await k.prepare(before.state,config,{rows:marketing.rows,source:repo.source,result:repo.officialLoader(marketing),now:clock(),context:ctx});
    await repo.save(before,out.state);
    if(out.staged.length)fs.writeFileSync(file,k.json({version:'note-korogashi-stage-v1',snapshots:out.staged})+'\n',{flag:'wx'});
    if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`count=${out.staged.length}\n`);
    return {status:'prepared',count:out.staged.length,skipped:out.skipped};
  }
  if(mode==='confirm') {
    const staged=JSON.parse(fs.readFileSync(file,'utf8'));
    if(staged.version!=='note-korogashi-stage-v1'||!Array.isArray(staged.snapshots))throw Error('korogashi_stage_file_invalid');
    const seal=await artifact(env,fetcher);
    // HTTP Date is only second precision; its upper bound is conservative.
    const next=k.confirm(before.state,staged.snapshots,seal,Math.max(clock(),Date.parse(seal.confirmedAt)));
    await repo.save(before,next);
    return {status:'confirmed',count:staged.snapshots.length};
  }
  throw Error('korogashi_mode_invalid');
}
if(require.main===module)run(process.argv[2],process.argv[3]).then(r=>console.log('NOTE_KOROGASHI='+JSON.stringify(r)))
  .catch(e=>{console.error('NOTE_KOROGASHI_FAILED='+e.message);process.exitCode=1;});
module.exports={context,withDispatch,artifact,run};
