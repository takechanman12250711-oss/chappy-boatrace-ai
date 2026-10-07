'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs');
const k=require('./note-korogashi-lifecycle.cjs');
const {receiptRow}=require('./note-marketing-content');
const {fixture:original}=require('./note-independent-monitor-fixture');
const clone=x=>JSON.parse(JSON.stringify(x));
const time=hour=>Date.parse(`2026-09-28T${hour}:00:00+09:00`);
const ctx={runId:'123',runAttempt:'1',headSha:'a'.repeat(40)};
function fixture(rno=6,hour=16,payout=1001) {
  const b=original(), now=time(hour), key=`20260928-15-${rno}`;
  b.record.raceKey=key;b.record.raceNo=rno;b.monitor.raceKey=key;
  b.record.selectedAt=b.capturedAt=b.monitor.confirmedAt=new Date(now-180000).toISOString();
  b.record.exhibitionSnapshot.capturedAt=new Date(now-240000).toISOString();
  b.record.deadlineAt=new Date(now+600000).toISOString();
  const bytes=JSON.stringify(b), receipt={version:'note-publication-receipt-v1',price:200,raceKey:key,articleSeries:'escape',
    sourceSha256:k.hash(bytes),url:`https://note.com/great_robin3243/n/nabc${rno}`,
    publishedAt:new Date(now-120000).toISOString(),verifiedAt:new Date(now-60000).toISOString()};
  const presentation=require('./note-korogashi-presentation.cjs');
  receipt.publishedDisplayProof=require('./note-published-ticket-sections').sectionProof(
    presentation.paidTextFromSource(b,'escape'),presentation.PRESENTATION_VERSION,{sourceSha256:receipt.sourceSha256});
  const row=receiptRow(receipt,bytes,now);
  const result={ok:true,source:'boatrace-official',date:'20260928',jcd:'15',raceNo:rno,resultUrl:row.resultUrl,
    checkedAt:new Date(now+1200000).toISOString(),resultAvailable:true,status:'finished',void:false,
    trifecta:{combination:'1-2-3',payout},finishers:[{rank:1,boat:1},{rank:2,boat:2},{rank:3,boat:3}],starts:[]};
  return {b,bytes,receipt,row,result,now};
}
const config=(more={})=>({version:'note-korogashi-requests-v1',requests:[{id:'test-100k',date:'20260928',firstPublicationKey:'20260928-15-6:escape',targetYen:100000,maxLegs:3,selectionPolicy:k.POLICY,...more}]});
function options(fixtures,now=fixtures[0].now,more={}) {
  return {rows:fixtures.map(f=>f.row),source:async row=>{const f=fixtures.find(f=>f.row.raceKey===row.raceKey);return {bytes:f.bytes,receipt:f.receipt};},
    result:async key=>fixtures.find(f=>f.row.raceKey===key)?.result||null,now,context:ctx,...more};
}
function seal(staged,now) {return {id:44,digest:'sha256:'+'c'.repeat(64),name:`note-korogashi-${ctx.runId}-${ctx.runAttempt}`,
  runId:ctx.runId,headSha:ctx.headSha,createdAt:new Date(now).toISOString(),confirmedAt:new Date(now+1000).toISOString()};}
async function registered(f=fixture(),c=config()) {
  const out=await k.prepare(k.initialState(),c,options([f]));
  return announced(k.confirm(out.state,out.staged,seal(out.staged,f.now),f.now+1000),f.now+2000);
}
const announced=(state,now)=>k.announce(state,{url:'https://note.com/great_robin3243/n/nabcdef',contentHash:'f'.repeat(64)},now);
test('a staged course is not public evidence; remote confirmation fixes all goal and funding terms',async()=>{
  const f=fixture(),before=JSON.stringify(f),out=await k.prepare(k.initialState(),config(),options([f]));
  assert.equal(out.staged.length,1);assert.equal(k.project(out.state.plans['test-100k']).status,'not_registered');
  assert.equal(k.publicText(out.state,f.now),'');
  const state=k.confirm(out.state,out.staged,seal(out.staged,f.now),f.now+1000), view=k.project(state.plans['test-100k']);
  assert.equal(view.status,'waiting_publication');assert.equal(view.initialYen,2000);assert.equal(view.balanceYen,null);
  assert.equal(view.legs[0].seal.id,44);assert.equal(JSON.stringify(f),before);
  await assert.rejects(k.prepare(state,config({targetYen:200000}),options([f])),/request_changed/);
});
test('official result must precede each next commitment; earliest same-series source is reused unchanged',async()=>{
  const first=fixture(), second=fixture(7,17), third=fixture(8,18);
  const state=await registered(first);
  const pending=await k.prepare(state,config(),options([first,second],time(16)+300000,{result:async()=>null}));
  assert.deepEqual(pending.state,state);assert.equal(pending.staged.length,0);
  const next=await k.prepare(state,config(),options([third,first,second],time(17)));
  assert.equal(next.staged[0].leg.raceKey,second.row.raceKey);
  assert.equal(next.staged[0].leg.openingYen,10010);
  assert.deepEqual(next.staged[0].leg.allocations.map(a=>a.stakeYen),[5000,5000]);
  assert.equal(next.staged[0].leg.remainderYen,10);
  assert.equal(next.state.plans['test-100k'].events[2].type,'settled');
  const confirmed=k.confirm(next.state,next.staged,seal(next.staged,time(17)),time(17)+1000);
  assert.equal(k.project(confirmed.plans['test-100k']).legs.length,2);
  assert.deepEqual(confirmed.plans['test-100k'].events[0],state.plans['test-100k'].events[0]);
});
test('target, loss, maximum and uncertain official results never open another leg',async()=>{
  for(const [mutate,expected] of [
    [f=>{f.result.trifecta.payout=10000;},'target_reached'],
    [f=>{f.result.trifecta.combination='3-2-1';f.result.finishers=[{rank:1,boat:3},{rank:2,boat:2},{rank:3,boat:1}];},'stopped_miss'],
    [f=>{f.result.void=true;f.result.status='void';},'stopped_void'],
    [f=>{f.result.refunds=[6];},'review_required'],
    [f=>{f.result.jcd='24';},'review_required']
  ]) {
    const f=fixture();mutate(f);const state=await registered(f);
    const out=await k.prepare(state,config(),options([f,fixture(7,17)],time(17)));
    assert.equal(k.project(out.state.plans['test-100k']).status,expected);assert.equal(out.staged.length,0);
  }
  const f=fixture(),g=fixture(7,17), c=config({maxLegs:2,targetYen:1000000});
  const a=await registered(f,c),b=await k.prepare(a,c,options([f,g],g.now));
  const sealed=announced(k.confirm(b.state,b.staged,seal(b.staged,g.now),g.now+1000),g.now+2000);
  const done=await k.prepare(sealed,c,options([f,g,fixture(8,18)],time(18)));
  assert.equal(k.project(done.state.plans['test-100k']).status,'stopped_max_legs');assert.equal(done.staged.length,0);
});
test('interrupted or late remote registration ends visibly without swapping races or counting a wager',async()=>{
  const f=fixture(),out=await k.prepare(k.initialState(),config(),options([f]));
  const interrupted=await k.prepare(out.state,config(),options([f],f.now+2000,{context:{...ctx,runId:'124'}}));
  assert.equal(k.project(interrupted.state.plans['test-100k']).status,'not_started');
  assert.equal(k.project(interrupted.state.plans['test-100k']).legs.length,0);
  const late=seal(out.staged,f.now);late.confirmedAt=new Date(f.now+480000).toISOString();
  const stopped=k.confirm(out.state,out.staged,late,f.now+480000);
  assert.equal(k.project(stopped.plans['test-100k']).status,'not_started');
  assert.throws(()=>k.confirm(out.state,out.staged,{...late,headSha:'d'.repeat(40)},f.now+480000),/artifact_context/);
});
test('old event edits, dropping a pending record and outcome rewriting are rejected',async()=>{
  const state=await registered(),mutated=clone(state);
  mutated.plans['test-100k'].events[0].data.leg.allocations[0].stakeYen=2000;
  assert.throws(()=>k.validateState(mutated),/event_hash/);
  const changed=clone(state);changed.plans['test-100k'].request.targetYen=200000;
  assert.throws(()=>k.assertAppendOnly(state,changed));
  const staged=await k.prepare(k.initialState(),config(),options([fixture()])), dropped=clone(staged.state);
  dropped.plans['test-100k'].pending=null;assert.throws(()=>k.assertAppendOnly(staged.state,dropped),/pending_dropped/);
});
test('no opportunity by day end is recorded; stale timestamps and unverified sources do not gain a leg',async()=>{
  const f=fixture(),state=await registered(f);
  const out=await k.prepare(state,config(),options([f],time(18)));
  assert.equal(k.project(out.state.plans['test-100k']).status,'waiting_next');
  const closed=await k.prepare(out.state,config(),options([f],time(18)+86400000));
  assert.equal(k.project(closed.state.plans['test-100k']).status,'stopped_no_suitable_race');
  const bad=fixture();bad.receipt.sourceSha256='d'.repeat(64);
  const rejected=await k.prepare(k.initialState(),config(),options([bad]));
  assert.equal(rejected.staged.length,0);assert.match(rejected.skipped[0].reason,/hash_mismatch/);
});
test('all requested targets retain their own history; public copy discloses correlation and no paid tickets',async()=>{
  const c=config();c.requests=[100000,200000,300000].map(targetYen=>({...c.requests[0],id:`target-${targetYen}`,targetYen}));
  const f=fixture(),out=await k.prepare(k.initialState(),c,options([f]));
  assert.equal(out.staged.length,3);
  const state=k.confirm(out.state,out.staged,seal(out.staged,f.now),f.now+1000),text=k.publicText(state,f.now+1000);
  for(const amount of ['100,000円','200,000円','300,000円'])assert(text.includes(amount));
  for(const phrase of ['モデル','結果も連動','記事代','全額再投入','数字が小さい順'])assert(text.includes(phrase));
  assert(!text.includes('1-2-3'));assert(!text.includes('1 → 2 → 3'));
  assert(text.includes(f.receipt.url));assert(text.indexOf('全額再投入')<text.indexOf(f.receipt.url));
});
test('sealing checks external artifact identity, digest, workflow and server time',async()=>{
  const {artifact}=require('./note-korogashi-run.cjs');
  const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:ctx.runId,
    GITHUB_RUN_ATTEMPT:ctx.runAttempt,GITHUB_SHA:ctx.headSha,KOROGASHI_ARTIFACT_ID:'44',KOROGASHI_ARTIFACT_DIGEST:'c'.repeat(64),NOTE_CLAIM_TOKEN:'unit-test-only'};
  const data={id:44,name:'note-korogashi-123-1',digest:'sha256:'+'c'.repeat(64),created_at:new Date(time(16)).toISOString(),expired:false,
    workflow_run:{id:123,head_sha:ctx.headSha}};
  const fetcher=value=>async()=>({ok:true,headers:{get:()=>new Date(time(16)).toUTCString()},json:async()=>value});
  assert.equal((await artifact(env,fetcher(data))).confirmedAt,new Date(time(16)+1000).toISOString());
  for(const change of [{id:45},{expired:true},{digest:'bad'},{name:'another'},{workflow_run:{id:124,head_sha:ctx.headSha}}])
    await assert.rejects(artifact(env,fetcher({...data,...change})),/artifact_identity/);
});
test('state writes are append-only compare-and-swap, never main or force push',async()=>{
  const {repository,BRANCH}=require('./note-korogashi-store.cjs'),calls=[];
  const store={revision:'a'.repeat(40),api:async(route,method,body)=>{
    calls.push({route,method,body});if(route.startsWith('/git/ref/heads/'))return null;
    if(route==='/git/trees')return {sha:'b'.repeat(40)};
    if(route==='/git/commits')return {sha:'c'.repeat(40)};
    return {object:{sha:'c'.repeat(40)}};
  }};
  const repo=repository(store),loaded=await repo.load(), next=await registered();await repo.save(loaded,next);
  assert.equal(calls.at(-1).body.ref,`refs/heads/${BRANCH}`);
  const before={state:k.initialState(),head:'e'.repeat(40)};await repo.save(before,next);
  assert.equal(calls.at(-1).body.force,false);assert.equal(calls.at(-1).route,`/git/refs/heads/${BRANCH}`);
  assert(!calls.some(c=>c.route.includes('heads/main')));
  const conflict=repository({...store,api:async(route,method,body)=>{if(method==='PATCH')throw Error('conflict');return store.api(route,method,body);}});
  await assert.rejects(conflict.save(before,next),/conflict/);
});
test('no requests means no phantom courses or publication and only one state lookup',async()=>{
  const {run}=require('./note-korogashi-run.cjs');let calls=0;
  const store={api:async()=>{calls++;return null;}};
  const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',
    GITHUB_RUN_ID:ctx.runId,GITHUB_RUN_ATTEMPT:ctx.runAttempt,GITHUB_SHA:ctx.headSha};
  const out=await run('prepare','unused',{env,store,config:{version:'note-korogashi-requests-v1',requests:[]}});
  assert.equal(out.count,0);assert.equal(calls,1);
});
test('existing scheduled note workflow captures and confirms before normal index update',()=>{
  const workflow=fs.readFileSync('.github/workflows/update-note-marketing.yml','utf8');
  assert.equal((workflow.match(/cron:/g)||[]).length,1);assert(workflow.includes("7,22,37,52 * * * *"));
  assert(workflow.includes('group: note-ui-transport'));assert(!workflow.includes('force: true'));
  assert(workflow.includes('actions: read'));assert(workflow.includes('            .github/workflows'));
  const prepare=workflow.indexOf('node scripts/note-korogashi-run.cjs prepare');
  const upload=workflow.indexOf('uses: actions/upload-artifact@v4');
  const confirm=workflow.indexOf('node scripts/note-korogashi-run.cjs confirm');
  const publish=workflow.indexOf('node scripts/update-note-marketing.js');
  assert(prepare<upload&&upload<confirm&&confirm<publish);
});
test('registration alone cannot settle or continue; missing or late public verification never earns a payout',async()=>{
  const f=fixture(),out=await k.prepare(k.initialState(),config(),options([f]));
  const sealed=k.confirm(out.state,out.staged,seal(out.staged,f.now),f.now+1000);
  const waiting=await k.prepare(sealed,config(),options([f],f.now+3000,{result:()=>{throw Error('must_not_read_result');}}));
  assert.deepEqual(waiting.state,sealed);assert(k.needsPublication(sealed));
  const live=announced(sealed,f.now+2000), view=k.project(live.plans['test-100k']);
  assert.equal(view.status,'waiting_result');assert.equal(view.legs[0].publication.verifiedAt,new Date(f.now+2000).toISOString());
  assert(!k.needsPublication(live));assert.throws(()=>announced(sealed,f.now),/time_invalid/);
  for(const late of [announced(sealed,f.now+480000),(await k.prepare(sealed,config(),options([f],time(17)))).state]) {
    const v=k.project(late.plans['test-100k']);
    assert.equal(v.status,'stopped_publication_late');assert.equal(v.balanceYen,2000);
    assert.equal(v.netBeforeFeesYen,0);assert.equal(v.legs[0].payoutYen,null);
    const next=await k.prepare(late,config(),options([f,fixture(7,17)],time(17)));
    assert.equal(next.staged.length,0);assert.match(k.publicText(next.state,time(17)),/実績に算入せず/);
  }
});
test('manual start supports multiple fixed targets and idempotency, never backdated or automatic starts',()=>{
  const {withDispatch}=require('./note-korogashi-run.cjs'),empty={version:'note-korogashi-requests-v1',requests:[]};
  const env={GITHUB_EVENT_NAME:'workflow_dispatch',KOROGASHI_FIRST_PUBLICATION_KEY:'20260928-15-6:escape',KOROGASHI_TARGETS:'100000,200000,300000',KOROGASHI_MAX_LEGS:'2'};
  const c=withDispatch(empty,env,time(16));assert.equal(c.requests.length,3);
  assert(c.requests.every(r=>r.maxLegs===2));assert.deepEqual(withDispatch(c,env,time(16)),c);
  assert.deepEqual(withDispatch(empty,{},time(16)),empty);
  assert.throws(()=>withDispatch(empty,{...env,GITHUB_EVENT_NAME:'schedule'},time(16)),/dispatch_required/);
  assert.throws(()=>withDispatch(empty,env,time(16)+86400000),/current_date/);
  assert.throws(()=>withDispatch(empty,{...env,KOROGASHI_TARGETS:'100000,100000'},time(16)),/targets_invalid/);
  assert.throws(()=>withDispatch(c,{...env,KOROGASHI_MAX_LEGS:'3'},time(16)),/request_changed/);
});
test('runner persists prepare, remote seal, public receipt and funded continuation across separate executions',async()=>{
  const {run}=require('./note-korogashi-run.cjs'),{repository}=require('./note-korogashi-store.cjs');
  const dir=fs.mkdtempSync(require('node:path').join(require('node:os').tmpdir(),'korogashi-integration-'));
  let head=null,tree=null,serial=0;const commits=new Map(),f=fixture(),g=fixture(7,17);
  const store={revision:ctx.headSha,api:async(route,method='GET',body)=>{
    if(route.startsWith('/git/ref/heads/'))return head?{object:{sha:head}}:null;
    if(route==='/git/trees'){tree=JSON.parse(body.tree[0].content);return {sha:'b'.repeat(40)};}
    if(route==='/git/commits'){const sha=(++serial).toString(16).padStart(40,'0');commits.set(sha,clone(tree));return {sha};}
    if(route==='/git/refs'||route.startsWith('/git/refs/heads/')){head=body.sha;return {object:{sha:head}};}
    throw Error('unexpected_api');
  },file:async(path,ref)=>{
    if(path==='state.json')return k.json(commits.get(ref));
    if(path==='receipt.json')return k.json(ref.endsWith(require('./note-github-ui-transport').draftClaimRef(g.row).split('/').at(-1))?g.receipt:f.receipt);
    if(path.startsWith('data/note-drafts/'))return path.includes('-7-')?g.bytes:f.bytes;
    if(path==='data/results/20260928.json')return k.json({source:'boatrace-official',date:'20260928',races:[f.result]});
    throw Error('unexpected_file');
  },load:async()=>({state:{rows:[f.row,g.row]}}),collect:async state=>state};
  const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:ctx.runId,
    GITHUB_RUN_ATTEMPT:ctx.runAttempt,GITHUB_SHA:ctx.headSha,KOROGASHI_ARTIFACT_ID:'44',KOROGASHI_ARTIFACT_DIGEST:'c'.repeat(64)};
  const stage=dir+'/stage.json',original=k.json([f,g]);
  try {
    assert.equal((await run('prepare',stage,{env,store,clock:()=>f.now,config:config()})).count,1);
    const saved=await repository(store).load();assert(saved.state.plans['test-100k'].pending);
    const fetcher=async()=>({ok:true,headers:{get:()=>new Date(f.now).toUTCString()},json:async()=>({
      id:44,name:'note-korogashi-123-1',digest:'sha256:'+'c'.repeat(64),created_at:new Date(f.now).toISOString(),
      workflow_run:{id:123,head_sha:ctx.headSha}})});
    await run('confirm',stage,{env,store,fetcher,clock:()=>f.now+1000});
    const repo=repository(store),loaded=await repo.load();
    assert.equal(k.project(loaded.state.plans['test-100k']).status,'waiting_publication');
    await repo.save(loaded,announced(loaded.state,f.now+2000));
    const next=await run('prepare',dir+'/next.json',{env:{...env,GITHUB_RUN_ID:'124'},store,clock:()=>g.now,config:config()});
    assert.equal(next.count,1);
    const last=await repository(store).load();
    assert.equal(last.state.plans['test-100k'].pending.leg.openingYen,10010);
    assert.equal(last.state.plans['test-100k'].pending.leg.raceKey,g.row.raceKey);
    assert.equal(k.json([f,g]),original);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('conflicting official caches are rejected instead of choosing the profitable result',async()=>{
  const f=fixture(),{repository}=require('./note-korogashi-store.cjs');
  const repo=repository({file:async()=>k.json({date:'20260928',source:'boatrace-official',races:[f.result]})});
  const changed=clone(f.result);changed.trifecta.payout+=100;
  await assert.rejects(repo.officialLoader({officialResults:{[f.row.raceKey]:changed}})(f.row.raceKey),/official_result_conflict/);
});

test('courses require an actual published subset proof, never a same-count category or absent proof',async()=>{
  const category=require('./note-category-article'),{sectionProof}=require('./note-published-ticket-sections');
  for(const mutation of [
    f=>{delete f.receipt.publishedDisplayProof;},
    f=>{f.receipt.publishedDisplayProof=sectionProof(category.paidTextFromSections(category.sourceSections(f.b,'escape')),'readable-v2');},
    f=>{f.receipt.publishedDisplayProof.modelSubset.ticketsSha256='e'.repeat(64);},
    f=>{f.receipt.publishedDisplayProof.modelSubset.sourceSha256='d'.repeat(64);},
    f=>{f.receipt.publishedDisplayProof.modelSubset.ticketCount+=1;}
  ]) {
    const f=fixture();mutation(f);
    const out=await k.prepare(k.initialState(),config(),options([f]));
    assert.equal(out.staged.length,0);assert.equal(out.state.plans['test-100k'].events.length,0);
    assert.match(out.skipped[0].reason,/model_selection|published_display_proof|published_renderer_evidence/);
  }
});

test('saved model evidence binds the exact allocations, and public instructions name only the paid subset',async()=>{
  const f=fixture(),state=await registered(f),plan=state.plans['test-100k'],view=k.project(plan);
  const selection=view.legs[0].modelSelectionEvidence;
  assert.equal(selection.sourceSha256,f.receipt.sourceSha256);
  assert.equal(selection.ticketsSha256,k.hash(view.legs[0].allocations.map(a=>a.ticket).sort()));
  assert.equal(selection.ticketCount,2);assert.equal(selection.presentationVersion,'readable-v3');
  const text=k.publicText(state,f.now+2000);
  assert(text.includes('「🔄 コロがし検証対象」欄だけ'));
  assert(text.includes('その他の掲載券・参考予想は対象外'));
  assert(!text.includes('1-2-3'));assert(!text.includes('1 → 2 → 3'));
  const changed=clone(state),event=changed.plans['test-100k'].events[0];
  event.data.leg.modelSelectionEvidence.ticketsSha256='e'.repeat(64);
  event.data.seal.snapshotHash=k.hash({request:changed.plans['test-100k'].request,previous:event.previous,leg:event.data.leg});
  const {hash,...body}=event;event.hash=k.hash(body);
  assert.throws(()=>k.validateState(changed),/registered_selection_unverified/);
});

test('the next leg rechecks display evidence and never silently follows an unmarked v2 article',async()=>{
  const first=fixture(),next=fixture(7,17),state=await registered(first);
  const category=require('./note-category-article'),{sectionProof}=require('./note-published-ticket-sections');
  next.receipt.publishedDisplayProof=sectionProof(category.paidTextFromSections(category.sourceSections(next.b,'escape')),'readable-v2');
  const out=await k.prepare(state,config(),options([first,next],next.now));
  assert.equal(out.staged.length,0);assert.equal(k.project(out.state.plans['test-100k']).status,'waiting_next');
  assert.match(out.skipped[0].reason,/model_selection_presentation_unsupported/);
  assert.equal(k.project(out.state.plans['test-100k']).legs.length,1);
});

test('settlement rejects a receipt whose subset proof changed after the saved registration',async()=>{
  const first=fixture(),state=await registered(first);
  first.receipt.publishedDisplayProof.modelSubset.ticketsSha256='e'.repeat(64);
  await assert.rejects(k.prepare(state,config(),options([first],time(17))),/published_display_proof_mismatch/);
  assert.equal(k.project(state.plans['test-100k']).status,'waiting_result');
});
