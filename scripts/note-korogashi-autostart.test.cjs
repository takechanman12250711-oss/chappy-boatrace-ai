'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const k=require('./note-korogashi-lifecycle.cjs');
const auto=require('./note-korogashi-autostart.cjs');
const {receiptRow}=require('./note-marketing-content');
const {fixture:original}=require('./note-independent-monitor-fixture');
const now=Date.parse('2026-09-28T16:00:00+09:00');
const ctx={runId:'123',runAttempt:'1',headSha:'a'.repeat(40)};
const config=()=>({version:'note-korogashi-requests-v1',requests:[],autoStart:{
  policy:auto.POLICY,enabled:true,articleSeries:'normal',maxCoursesPerDay:1,targetYen:100000,maxLegs:3}});
function fixture(rno=6,offset=600000) {
  const b=original(),key=`20260928-15-${rno}`;
  b.version='note-draft-bundle-v1';delete b.monitor;delete b.record.source;
  b.record.raceKey=key;b.record.raceNo=rno;
  b.record.selectedAt=b.capturedAt=new Date(now-180000).toISOString();
  b.record.exhibitionSnapshot.capturedAt=new Date(now-240000).toISOString();
  b.record.deadlineAt=new Date(now+offset).toISOString();
  b.record.prediction.mainSheet={tickets:['1-2-3','1-2-4'],coverTickets:[],flowTickets:[]};
  b.record.prediction.manshuSheet={tickets:[]};
  b.article.format='formation-v4';
  b.article.paidText='🔥 実戦厳選\n\n・1-2-3\n・1-2-4\n\n計 2点';
  const bytes=JSON.stringify(b),receipt={version:'note-publication-receipt-v1',price:200,raceKey:key,articleSeries:'normal',
    sourceSha256:k.hash(bytes),url:`https://note.com/great_robin3243/n/nabc${rno}`,
    publishedAt:new Date(now-120000).toISOString(),verifiedAt:new Date(now-60000).toISOString()};
  const presentation=require('./note-korogashi-presentation.cjs');
  receipt.publishedDisplayProof=require('./note-published-ticket-sections').sectionProof(
    presentation.paidTextFromSource(b,'normal'),presentation.PRESENTATION_VERSION,{sourceSha256:receipt.sourceSha256});
  return {bytes,receipt,row:receiptRow(receipt,bytes,now)};
}
const opts=(fixtures,at=now)=>({rows:fixtures.map(f=>f.row),now:at,source:async row=>{
  const f=fixtures.find(f=>f.row.raceKey===row.raceKey);return {bytes:f.bytes,receipt:f.receipt};}});
test('disabled/absent settings preserve legacy behavior; unsupported expansion fails closed',async()=>{
  const c=config();delete c.autoStart;
  assert.equal(auto.enabled(c),false);
  assert.equal((await auto.withAutoStart(c,k.initialState(),opts([]))).config,c);
  c.autoStart={...config().autoStart,enabled:false};assert.equal(auto.enabled(c),false);
  for(const mutation of [{articleSeries:'escape'},{targetYen:200000},{maxLegs:2},{maxCoursesPerDay:2},{policy:'unknown'},{enabled:'true'}]) {
    assert.throws(()=>auto.enabled({...config(),autoStart:{...config().autoStart,...mutation}}),/autostart_config_invalid/);
  }
});
test('earliest verified normal source wins; same-time ties are deterministic and inputs immutable',async()=>{
  const first=fixture(6),later=fixture(7,900000),tie=fixture(5),c=config(),state=k.initialState();
  const before=JSON.stringify([first,later,tie,c,state]);
  const out=await auto.withAutoStart(c,state,opts([later,first,tie]));
  assert.equal(out.status,'selected');assert.equal(out.publicationKey,tie.row.publicationKey);
  assert.deepEqual(out.config.requests,[{id:'daily-20260928-normal-100000',date:'20260928',firstPublicationKey:tie.row.publicationKey,targetYen:100000,maxLegs:3,selectionPolicy:k.POLICY}]);
  assert.equal(JSON.stringify([first,later,tie,c,state]),before);
  assert.deepEqual(await auto.withAutoStart(c,state,opts([tie,first,later])),out);
});
test('unverified source skipped without changing picks; no candidates stays unregistered',async()=>{
  const invalid=fixture(6),good=fixture(7,900000);invalid.receipt.publishedDisplayProof.modelSubset.sourceSha256='e'.repeat(64);
  const out=await auto.withAutoStart(config(),k.initialState(),opts([invalid,good]));
  assert.equal(out.publicationKey,good.row.publicationKey);assert.equal(out.skipped.length,1);
  const none=await auto.withAutoStart(config(),k.initialState(),opts([invalid]));
  assert.equal(none.status,'no_eligible_published_race');assert.equal(none.config.requests.length,0);
});
test('wrong dates, other series, invalid deadline and 120-second boundary never load a source',async()=>{
  const base=fixture(),rows=[
    {...base.row,raceKey:'20260927-15-6'}, {...base.row,raceKey:'20260929-15-6'},
    {...base.row,articleSeries:'escape'}, {...base.row,articleSeries:'manshu'},
    {...base.row,deadlineAt:'invalid'}, {...base.row,deadlineAt:new Date(now+120000).toISOString()},
    {...base.row,deadlineAt:new Date(now-1).toISOString()}];
  const out=await auto.withAutoStart(config(),k.initialState(),{rows,now,source:async()=>{throw Error('must_not_read');}});
  assert.equal(out.status,'no_eligible_published_race');assert.deepEqual(out.skipped,[]);
  assert.equal((await auto.withAutoStart(config(),k.initialState(),opts([base],Date.parse('2026-09-28T15:00:00Z')))).status,'no_eligible_published_race','JST next day excludes yesterday');
});
test('daily slot is consumed by explicit, pending, failed or finished plans; no same-day restart',async()=>{
  const f=fixture(),selected=await auto.withAutoStart(config(),k.initialState(),opts([f]));
  assert.equal((await auto.withAutoStart(selected.config,k.initialState(),opts([f]))).status,'daily_course_exists');
  const prepared=await k.prepare(k.initialState(),selected.config,{...opts([f]),context:ctx,result:async()=>null});
  assert.equal(prepared.staged.length,1);
  for(const state of [prepared.state,(await k.prepare(prepared.state,config(),{...opts([f]),context:{...ctx,runId:'124'},result:async()=>null})).state]) {
    assert.equal((await auto.withAutoStart(config(),state,opts([f]))).status,'daily_course_exists');
  }
  const seal={id:44,digest:'sha256:'+'c'.repeat(64),name:'note-korogashi-123-1',runId:'123',headSha:ctx.headSha,
    createdAt:new Date(now).toISOString(),confirmedAt:new Date(now+1000).toISOString()};
  const announced=k.announce(k.confirm(prepared.state,prepared.staged,seal,now+1000),
    {url:'https://note.com/great_robin3243/n/nabcdef',contentHash:'f'.repeat(64)},now+2000);
  const result={ok:true,source:'boatrace-official',date:'20260928',jcd:'15',raceNo:6,resultUrl:f.row.resultUrl,
    checkedAt:new Date(now+700000).toISOString(),resultAvailable:true,status:'finished',void:false,
    trifecta:{combination:'1-2-3',payout:10000},finishers:[{rank:1,boat:1},{rank:2,boat:2},{rank:3,boat:3}],starts:[]};
  const finished=await k.prepare(announced,config(),{...opts([f],now+800000),context:ctx,result:async()=>result});
  assert.equal(k.project(Object.values(finished.state.plans)[0]).status,'target_reached');
  assert.equal((await auto.withAutoStart(config(),finished.state,opts([fixture(7,2000000)],now+800000))).status,'daily_course_exists');
  assert.match(k.publicText(finished.state,now+800000),/モデル資金が目標に到達/);
  const old=structuredClone(selected.config.requests[0]);old.id='yesterday';old.date='20260927';old.firstPublicationKey='20260927-15-6:normal';
  assert.equal((await auto.withAutoStart({...config(),requests:[old]},k.initialState(),opts([f]))).status,'selected');
});
test('runner starts with empty requests and persists exactly one pending course, never publishing or querying a result',async()=>{
  const {run}=require('./note-korogashi-run.cjs');
  const f=fixture(),dir=fs.mkdtempSync('/tmp/korogashi-auto-');
  let head=null,tree=null,serial=0;const commits=new Map();
  const store={revision:ctx.headSha,api:async(route,method,body)=>{
    if(route.startsWith('/git/ref/heads/'))return head?{object:{sha:head}}:null;
    if(route==='/git/trees'){tree=JSON.parse(body.tree[0].content);return {sha:'b'.repeat(40)};}
    if(route==='/git/commits'){const sha=(++serial).toString(16).padStart(40,'0');commits.set(sha,structuredClone(tree));return {sha};}
    if(route==='/git/refs'||route.startsWith('/git/refs/heads/')){head=body.sha;return {object:{sha:head}};}
    throw Error('unexpected_api');
  },file:async(path,ref)=>{
    if(path==='state.json')return k.json(commits.get(ref));
    if(path==='receipt.json')return k.json(f.receipt);
    if(path.startsWith('data/note-drafts/'))return f.bytes;
    throw Error('unexpected_file');
  },load:async()=>({state:{rows:[f.row]}}),collect:async state=>state};
  const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',
    GITHUB_RUN_ID:ctx.runId,GITHUB_RUN_ATTEMPT:ctx.runAttempt,GITHUB_SHA:ctx.headSha};
  try {
    const out=await run('prepare',dir+'/first.json',{env,store,config:config(),clock:()=>now});
    assert.equal(out.count,1);assert.equal(out.autoStart.status,'selected');
    const state=commits.get(head),p=Object.values(state.plans)[0];
    assert.equal(Object.keys(state.plans).length,1);assert.equal(p.events.length,0);assert.equal(p.pending.leg.openingYen,2000);
    const repeated=await run('prepare',dir+'/second.json',{env,store,config:config(),clock:()=>now});
    assert.equal(repeated.count,1);assert.equal(repeated.autoStart.status,'daily_course_exists');
    assert.equal(k.json(commits.get(head)),k.json(state));
    const interrupted=await run('prepare',dir+'/third.json',{env:{...env,GITHUB_RUN_ID:'124'},store,config:config(),clock:()=>now+1000});
    assert.equal(interrupted.count,0);assert.equal(Object.keys(commits.get(head).plans).length,1);
    assert.equal(k.project(Object.values(commits.get(head).plans)[0]).status,'not_started');
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
