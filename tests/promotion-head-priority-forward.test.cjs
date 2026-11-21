'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const f=require('../scripts/promotion-head-priority-forward.cjs');
const repo=path.resolve(__dirname,'..'),start=Date.parse('2026-11-19T00:00:00+09:00'),end=Date.parse('2026-12-03T00:00:00+09:00');
const inside=start+10*3600000,head='b'.repeat(40);
const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',
 GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:head,GH_TOKEN:'fixture-token',
 PROMOTION_HEAD_ARTIFACT_ID:'456',PROMOTION_HEAD_ARTIFACT_DIGEST:'d'.repeat(64)};
const config=()=>({version:'promotion-head-priority-forward-v1',rule:'head-role-priority-desc-queue-index-v1',
 method:f.METHOD,executionCodeSha256:f.EXECUTION,comparisonCodeSha256:'',startAt:'2026-11-19T00:00:00+09:00',
 endAt:'2026-12-03T00:00:00+09:00',unitStakeYen:100,tieBreak:'queueIndex',
 denominator:'all-sealed-valid-A-including-unknown',variants:['A','B'],adoptionGate:null,usableForPrediction:false,automaticApplication:false});
function fixture(t) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'promotion-head-forward-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'scripts'));
 for(const file of f.CODE_PATHS)fs.copyFileSync(path.join(repo,file),path.join(root,file));
 const p=config();p.comparisonCodeSha256=f.codeHash(root);fs.writeFileSync(path.join(root,f.CONFIG),f.json(p));
 return root;
}
const iso=n=>new Date(n).toISOString();
const deps=(compare)=>({methodFingerprint:()=>f.METHOD,codeCommit:head,compare:compare||mockCompare});
function mockCompare(input,status='unknown',B=input.baselineA) {
 return {version:'promotion-head-priority-comparison-v1',variant:'B1-first-position-saved-priority',purpose:'shadow-comparison',
 status,reasons:status==='unknown'?['SAVED_ROLE_UNKNOWN']:[],A:input.baselineA,B:[...B],changed:JSON.stringify(input.baselineA)!==JSON.stringify(B),
 identity:input.identity,sourceRef:input.sourceRef,roleRefs:[],bCourseTrace:[],productionAction:'KEEP_A',automaticAdoption:false,automaticApplication:false,
 usableForPrediction:false,resultUsedForGeneration:false,productionChanged:false,sourceReferenceVerified:false,includedInDenominator:true};
}
function bundle({race=1,selected=inside-120000,A=['1-2-3','1-3-2']}={}) {
 const date='20261119',key=date+'-24-'+race,review={version:'race-review-evidence-v1',method:f.METHOD,predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false};
 const r={raceKey:key,date,jcd:'24',raceNo:race,publicationPolicy:'all-races-v1',selectedAt:iso(selected),deadlineAt:iso(inside+600000),reviewEvidence:review,
 exhibitionSnapshot:{version:'note-exhibition-v1',capturedAt:iso(selected),entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.8}})),
 startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:0.1,mappingSource:'official-start-image'}))},
 prediction:{practicalTickets:A,preRaceConditions:{boats:[1,2,3,4,5,6].map(boatNo=>({boatNo,course:boatNo,courseOfficial:true}))}}};
 r.practicalSelectionEvidence={version:'practical-selection-evidence-v1',status:'captured',selectionStatus:'selected',productionChanged:false,resultUsedForGeneration:false,
  raceKey:key,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,reviewEvidence:review,practicalTickets:[...A]};
 return {version:'note-draft-bundle-v1',sourceCommit:head,record:r,baselinePracticalTickets:[...A],generationAudit:{contentReady:true,raceKey:key,auditedAt:iso(selected+1000)}};
}
function saveSource(root,b) {
 const raw=f.json(b),sha=f.hash(raw),rel='data/note-drafts/'+b.record.date+'/'+b.record.raceKey+'-'+sha+'.json';
 fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),raw);return {path:rel,sha256:sha,raw};
}
function stage(root,name,time,options=deps()) {const out=path.join(root,name);return {out,result:f.capture(root,out,env,time,options)};}
function remote(out,created,confirmed,changes={}) {
 const manifest=f.stageManifest(out,f.protocol(path.dirname(out)),env);
 const a={id:456,digest:'sha256:'+'d'.repeat(64),name:'promotion-head-priority-123-1-'+manifest.sha256,expired:false,
  created_at:iso(created),workflow_run:{id:123,head_sha:head},...changes};
 return async(url,options)=>{assert.equal(url,'https://api.github.com/repos/'+env.GITHUB_REPOSITORY+'/actions/artifacts/456');assert.equal(options.method,undefined,'GET only');
  return {ok:true,headers:{get:n=>n==='date'?new Date(confirmed-1000).toUTCString():null},json:async()=>a};};
}
async function register(root) {
 const s=stage(root,'registration-stage',start-3600000);
 assert.equal(s.result.status,'registration-prepared');
 const r=await f.seal(root,s.out,env,remote(s.out,start-3599000,start-3598000));
 assert.equal(r.sealed,1);return f.registration(root,f.protocol(root)).first;
}
async function captureAndSeal(root,name,compare=mockCompare,time=inside) {
 const s=stage(root,name,time,deps(compare));const r=await f.seal(root,s.out,env,remote(s.out,time+1000,time+2000));return {...s,seal:r};
}
const official=(key,actual='1-2-3',payout=1000)=>({raceKey:key,source:'boatrace-official',resultAvailable:true,trifecta:{combination:actual,payout}});
test('frozen protocol includes all four runtime paths and rejects any code/config drift',t=>{
 const root=fixture(t);assert.equal(f.protocol(root).value.method,f.METHOD);
 for(const file of f.CODE_PATHS) {
  const abs=path.join(root,file),raw=fs.readFileSync(abs);fs.appendFileSync(abs,'\n// drift');
  assert.throws(()=>f.protocol(root),/code_changed/);fs.writeFileSync(abs,raw);
 }
 const file=path.join(root,f.CONFIG),p=JSON.parse(fs.readFileSync(file));p.adoptionGate={roi:1};fs.writeFileSync(file,f.json(p));
 assert.throws(()=>f.protocol(root),/protocol_invalid/);
});
test('prestart capture seals a protocol registration only, once, before the strict boundary',async t=>{
 const root=fixture(t),reg=await register(root);assert.equal(reg.receipt.snapshot.kind,'registration');
 assert.equal(f.sealed(root,f.protocol(root)).rows.length,0);
 const noUpload=stage(root,'second-reg',start-100000).result;assert.equal(noUpload.count,0);assert.equal(noUpload.manifestSha256,'');
 assert.equal(stage(root,'at-end',end).result.status,'period-ended');
 const other=fixture(t),s=stage(other,'late-reg',start-5000);
 const result=await f.seal(other,s.out,env,remote(s.out,start-4000,start));assert.equal(result.late,1);
 assert.equal(f.registration(other,f.protocol(other)).first,null);
 assert.equal(stage(other,'blocked',start).result.reason,'PRESTART_REGISTRATION_MISSING');
});
test('artifact metadata identity and conservative HTTP Date bound are mandatory',async t=>{
 const root=fixture(t),s=stage(root,'reg',start-10000);
 for(const change of [{id:999},{digest:'sha256:'+'e'.repeat(64)},{name:'wrong'},{expired:true},{workflow_run:{id:999,head_sha:head}},{workflow_run:{id:123,head_sha:'c'.repeat(40)}}])
  await assert.rejects(f.seal(root,s.out,env,remote(s.out,start-9000,start-8000,change)),/artifact_identity/);
 await assert.rejects(f.seal(root,s.out,{...env,GITHUB_REF:'refs/pull/1/merge'},remote(s.out,start-9000,start-8000)),/main_repository/);
 const noDate=async()=>({ok:true,headers:{get:()=>null},json:async()=>({})});
 await assert.rejects(f.seal(root,s.out,env,noDate),/artifact_identity/);
});
test('valid A unknown and not-applicable are sealed and retained without source mutations',async t=>{
 const root=fixture(t);await register(root);
 const a=saveSource(root,bundle()),b=saveSource(root,bundle({race:2}));
 const s=await captureAndSeal(root,'races',x=>mockCompare(x,x.identity.raceKey.endsWith('-1')?'unknown':'not-applicable'));
 assert.equal(s.result.count,2);assert.equal(s.seal.sealed,2);
 const rows=f.sealed(root,f.protocol(root)).rows;assert.equal(rows.length,2);
 for(const row of rows){assert.deepEqual(row.receipt.snapshot.A,row.receipt.snapshot.B);assert.equal(row.receipt.snapshot.comparison.sourceReferenceVerified,false);assert.equal(row.receipt.snapshot.sourceBytesVerified,true);}
 assert.equal(fs.readFileSync(path.join(root,a.path),'utf8'),a.raw);assert.equal(fs.readFileSync(path.join(root,b.path),'utf8'),b.raw);
});
test('direct raw source order, duplicate, identity, exhibition, audit and byte checks cannot be normalized away',t=>{
 const root=fixture(t),p=f.protocol(root);
 const changes=[
  b=>b.baselinePracticalTickets.reverse(),
  b=>b.record.prediction.practicalTickets.push(b.record.prediction.practicalTickets[0]),
  b=>b.record.practicalSelectionEvidence.practicalTickets.reverse(),
  b=>b.record.practicalSelectionEvidence.selectedAt=iso(inside),
  b=>b.record.reviewEvidence.method='a'.repeat(64),
  b=>b.record.exhibitionSnapshot.startExhibition[0].mappingSource='inferred',
  b=>b.generationAudit.auditedAt=b.record.deadlineAt,
  b=>b.record.prediction.officialResultUsedForPrediction=true,
  b=>b.record.selectedAt=iso(start-1),
  b=>b.record.practicalSelectionEvidence.status='baseline-mismatch'
 ];
 for(const change of changes){const b=bundle();change(b);const s=saveSource(root,b);assert.throws(()=>f.source(root,s.path,s.sha256,p,inside));}
 const s=saveSource(root,bundle());fs.appendFileSync(path.join(root,s.path),' ');
 assert.throws(()=>f.source(root,s.path,s.sha256,p,inside),/source_sha_mismatch/);
});
test('latest selectedAt and then sourceSHA within run; first remote-confirmed snapshot per race across runs',async t=>{
 const root=fixture(t);await register(root);
 const old=saveSource(root,bundle({selected:inside-180000})),latest=saveSource(root,bundle({selected:inside-120000}));
 const b=bundle({selected:inside-120000});b.record.fixtureOnly='tie';const tie=saveSource(root,b);
 const olderOffset=bundle({selected:inside-180000});olderOffset.record.selectedAt='2026-11-19T09:57:00+09:00';
 olderOffset.record.practicalSelectionEvidence.selectedAt=olderOffset.record.selectedAt;
 const offset=saveSource(root,olderOffset);
 const s=await captureAndSeal(root,'first');assert.equal(s.result.count,1);
 const selected=f.sealed(root,f.protocol(root)).rows[0].receipt.snapshot;
 assert.equal(selected.sourceSha256,[latest.sha256,tie.sha256].sort()[0]);assert.notEqual(selected.sourceSha256,old.sha256);assert.notEqual(selected.sourceSha256,offset.sha256,'compare actual instants, not timezone string ordering');
 const again=stage(root,'again',inside+3000);assert.equal(again.result.count,0);assert.equal(again.result.skips['already-sealed'],4);
 // A later immutable receipt for the same race may exist, but cannot replace the first seal.
 const p=f.protocol(root),first=f.sealed(root,p).rows[0].receipt,later=structuredClone(first);
 later.snapshot.capturedAt=iso(inside+3000);later.snapshotHash=f.hash(f.json(later.snapshot));
 later.commitment=f.commitment(f.canonicalManifest([{name:later.snapshotHash+'.json',sha256:later.snapshotHash}],p.digest,later.snapshot.runId,later.snapshot.runAttempt),later.snapshotHash);
 later.artifact.name='promotion-head-priority-123-1-'+later.commitment.manifestSha256;
 later.artifact.createdAt=iso(inside+4000);later.artifact.confirmedAt=iso(inside+5000);
 const raw=f.json(later),rel=f.BASE+'/'+later.snapshot.date+'/'+later.snapshot.raceKey+'-'+f.hash(raw)+'.json';
 f.writeOnce(path.join(root,rel),raw);
 assert.equal(f.sealed(root,p).rows[0].receipt.snapshot.capturedAt,selected.capturedAt);
});
test('seal rechecks immutable source bytes and rejects late or invalid variant snapshots',async t=>{
 const root=fixture(t);await register(root);const src=saveSource(root,bundle());
 const s=stage(root,'race',inside);
 fs.appendFileSync(path.join(root,src.path),' ');
 const rejected=await f.seal(root,s.out,env,remote(s.out,inside+1000,inside+2000));
 assert.equal(rejected.rejected.source_sha_mismatch,1);assert.equal(rejected.sealed,0);
 fs.writeFileSync(path.join(root,src.path),src.raw);
 const late=await f.seal(root,s.out,env,remote(s.out,inside+1000,inside+600000));assert.equal(late.late,1);
 const name=fs.readdirSync(s.out)[0],snap=JSON.parse(fs.readFileSync(path.join(s.out,name)));
 snap.B.push('2-1-3');assert.equal(f.validSnapshot(snap,f.protocol(root)),false);
});
test('period progress never joins results; ended reports retain unknowns, pending/refund and equal stakes',async t=>{
 const root=fixture(t);await register(root);
 for(const race of [1,2,3,4])saveSource(root,bundle({race}));
 await captureAndSeal(root,'race',x=>mockCompare(x,x.identity.raceKey.endsWith('-2')?'compared':'unknown',x.identity.raceKey.endsWith('-2')?['1-2-3','3-2-1']:x.baselineA));
 let calls=0;const resultsLoader=()=>{calls++;return new Map([
 ['20261119-24-1',official('20261119-24-1')],['20261119-24-2',official('20261119-24-2','3-2-1',2500)],
 ['20261119-24-3',{...official('20261119-24-3'),refund:true}]])};
 const progress=f.report(root,{now:end-1,resultsLoader});assert.equal(calls,0);assert.equal(progress.resultsJoined,false);assert.equal(progress.sealed,4);assert.equal(progress.coverage.allRunCaptureAndSealSkipTotals,null);
 const report=f.report(root,{now:end,resultsLoader});assert.equal(calls,1);assert.equal(report.sealed,4);assert.equal(report.settled,2);
 assert.equal(report.statusCounts.unknown,3);assert.equal(report.unknownReasons.SAVED_ROLE_UNKNOWN,3);assert.equal(report.pending.length,1);assert.equal(report.excluded.length,1);
 assert.equal(report.comparison.stats.A.stake,400);assert.equal(report.comparison.stats.B.stake,400);
 assert.equal(report.daily[0].sealed,4);assert.equal(report.daily[0].unknown,3);assert.equal(report.daily[0].pending,1);assert.equal(report.daily[0].excluded,1);
 assert.equal(report.comparison.returnDelta,2500);assert.equal(report.comparison.returnDeltaWithoutLargestGain,0);
 assert.deepEqual(report.comparison.addedHits,['20261119-24-2']);assert.equal(report.decisionGate.status,'INSUFFICIENT_EVIDENCE');
});
test('changed source or registration and foreign receipts cannot silently remain in a report cohort',async t=>{
 const root=fixture(t);const reg=await register(root),src=saveSource(root,bundle());await captureAndSeal(root,'race');
 fs.appendFileSync(path.join(root,src.path),' ');
 let rows=f.sealed(root,f.protocol(root));assert.equal(rows.rows.length,0);assert.equal(rows.rejected.source_sha_mismatch,1);
 fs.writeFileSync(path.join(root,src.path),src.raw);fs.rmSync(path.join(root,reg.path));
 rows=f.sealed(root,f.protocol(root));assert.equal(rows.rows.length,0);assert.equal(rows.rejected.registration_reference_invalid,1);
});
test('invalid comparator A/budget/ineligible cannot be sealed as success; source reasons remain visible',async t=>{
 const root=fixture(t);await register(root);saveSource(root,bundle());
 const bad=stage(root,'bad',inside,deps(x=>({...mockCompare(x),B:['1-2-3']})));
 assert.equal(bad.result.count,0);assert.equal(bad.result.skips.comparison_ineligible_or_invalid,1);
 const invalid=stage(root,'invalid',inside,deps(x=>({...mockCompare(x),status:'ineligible',A:null,B:null})));
 assert.equal(invalid.result.count,0);assert.equal(invalid.result.skips.comparison_ineligible_or_invalid,1);
 const late=stage(root,'late',inside+600000);assert.equal(late.result.count,0);assert.equal(late.result.skips.source_deadline_closed,1);
});

test('real pure comparator is wired to direct saved evidence; missing queue remains sealed unknown',async t=>{
 const root=fixture(t);await register(root);saveSource(root,bundle());
 const compare=require('../scripts/promotion-head-priority-comparison.cjs').compareHeadPriority;
 const run=await captureAndSeal(root,'pure-integration',compare);
 assert.equal(run.result.count,1);assert.equal(run.seal.sealed,1);
 const c=f.sealed(root,f.protocol(root)).rows[0].receipt.snapshot.comparison;
 assert.equal(c.status,'unknown');assert.deepEqual(c.reasons,['EXECUTION_CODE_UNAVAILABLE']);assert.deepEqual(c.A,c.B);
});
test('sourceReference and comparison identity are independently bound to the sealed source',async t=>{
 const root=fixture(t);await register(root);saveSource(root,bundle());
 for(const [label,change] of [
  ['reference',c=>{c.sourceRef={...c.sourceRef,sha256:'e'.repeat(64)};}],
  ['identity',c=>{c.identity={...c.identity,raceKey:'20261119-24-2'};}],
  ['variant',c=>{c.variant='other';}]
 ]) {
  const s=stage(root,label,inside,deps(input=>{const c=mockCompare(input);change(c);return c;}));
  assert.equal(s.result.count,0);assert.equal(Object.values(s.result.skips).reduce((n,x)=>n+x,0),1);
 }
});

test('registration and race remote commitments reject upload-after replacement, extra, missing, renamed and byte-edited snapshots',async t=>{
 for(const kind of ['registration','race']) {
  const root=fixture(t);if(kind==='race'){await register(root);saveSource(root,bundle());saveSource(root,bundle({race:2}));}
  const time=kind==='registration'?start-10000:inside,original=stage(root,'original-'+kind,time);
  const metadata=remote(original.out,time+1000,time+2000);
  const names=fs.readdirSync(original.out),originalBytes=names.map(name=>({name,bytes:fs.readFileSync(path.join(original.out,name))}));
  for(const mutation of ['replace','add','delete','rename','bytes']) {
   const out=path.join(root,'attack-'+mutation);fs.mkdirSync(out);
   for(const file of originalBytes)fs.writeFileSync(path.join(out,file.name),file.bytes);
   const first=originalBytes[0],parsed=JSON.parse(first.bytes);
   if(mutation==='delete')fs.rmSync(path.join(out,first.name));
   if(mutation==='rename')fs.renameSync(path.join(out,first.name),path.join(out,'e'.repeat(64)+'.json'));
   if(mutation==='replace'||mutation==='add') {
    if(kind==='race') {
     parsed.B=['3-2-1','3-1-2'];parsed.comparison.B=parsed.B;
     parsed.comparison.status='compared';parsed.comparison.changed=true;parsed.comparison.reasons=[];
    }else parsed.codeCommit='c'.repeat(40);
    const raw=f.json(parsed);
    if(mutation==='replace')fs.rmSync(path.join(out,first.name));
    fs.writeFileSync(path.join(out,f.hash(raw)+'.json'),raw);
   }
   if(mutation==='bytes') {
    const raw=Buffer.concat([first.bytes,Buffer.from('\n')]);fs.rmSync(path.join(out,first.name));
    fs.writeFileSync(path.join(out,f.hash(raw)+'.json'),raw);
   }
   await assert.rejects(f.seal(root,out,env,metadata),/manifest|artifact_identity/,kind+': '+mutation);
  }
  await assert.rejects(f.seal(root,original.out,env,remote(original.out,time+1000,time+2000,
   {name:'promotion-head-priority-123-1-'+'f'.repeat(64)})),/artifact_identity/);
 }
});
test('complete canonical manifest, snapshot membership and immutable remote name survive receipt/report validation',async t=>{
 const root=fixture(t),reg=await register(root);saveSource(root,bundle());saveSource(root,bundle({race:2}));
 await captureAndSeal(root,'race-manifest');
 const p=f.protocol(root),rows=f.sealed(root,p).rows;assert.equal(rows.length,2);
 for(const original of [reg.receipt,rows[0].receipt]) {
  assert.equal(f.validSeal(original,p),true);
  assert.equal(original.commitment.archiveContentsVerified,false);
  assert.equal(original.commitment.evidence,'immutable-artifact-name-hash-commitment');
  for(const change of [
   r=>r.commitment.manifest.entries.push({...r.commitment.manifest.entries[0]}),
   r=>r.commitment.manifest.entries.reverse(),
   r=>r.commitment.manifest.domain='different-domain',
   r=>r.commitment.manifest.protocolHash='a'.repeat(64),
   r=>r.commitment.manifest.runId='999',
   r=>r.commitment.manifest.entries[0].name='e'.repeat(64)+'.json',
   r=>r.commitment.snapshotName='e'.repeat(64)+'.json',
   r=>r.commitment.manifestSha256='e'.repeat(64),
   r=>r.artifact.name='promotion-head-priority-123-1-'+'e'.repeat(64)
  ]) {
   const r=structuredClone(original);change(r);
   // A one-element reverse is the unchanged registration manifest, not a mutation.
   if(JSON.stringify(r)===JSON.stringify(original))continue;
   assert.equal(f.validSeal(r,p),false);
  }
 }
 const original=rows[0].receipt,subset=structuredClone(original);
 const own=subset.commitment.manifest.entries.find(e=>e.sha256===subset.snapshotHash);
 subset.commitment=f.commitment(f.canonicalManifest([own],p.digest,subset.snapshot.runId,subset.snapshot.runAttempt),subset.snapshotHash);
 assert.equal(f.validSeal(subset,p),false,'a locally rehashed subset cannot match the observed immutable remote name');
 const foreign=structuredClone(reg.receipt),foreignHash='e'.repeat(64);
 foreign.commitment=f.commitment(f.canonicalManifest([{name:foreignHash+'.json',sha256:foreignHash}],p.digest,foreign.snapshot.runId,foreign.snapshot.runAttempt),foreign.snapshotHash);
 foreign.artifact.name='promotion-head-priority-123-1-'+foreign.commitment.manifestSha256;
 assert.equal(f.validSeal(foreign,p),false,'membership cannot be fabricated even with a self-consistent manifest hash');
 const bytes=f.json(subset),badPath=f.BASE+'/'+subset.snapshot.date+'/'+subset.snapshot.raceKey+'-'+f.hash(bytes)+'.json';
 f.writeOnce(path.join(root,badPath),bytes);
 assert.equal(f.sealed(root,p).rejected.race_receipt_invalid,1);
 assert.equal(f.report(root,{now:inside}).remoteEvidence.archiveContentsVerified,false);
});
test('capture publishes the full manifest SHA and only count-positive directories can be uploaded',t=>{
 const root=fixture(t),outputFile=path.join(root,'github-output'),out=path.join(root,'registration-output');
 const result=f.capture(root,out,{...env,GITHUB_OUTPUT:outputFile},start-10000,deps());
 const m=f.stageManifest(out,f.protocol(root),env);
 assert.equal(result.manifestSha256,m.sha256);assert.equal(m.manifest.entries.length,result.count);
 assert.match(fs.readFileSync(outputFile,'utf8'),new RegExp('manifest-sha256='+m.sha256));
 const empty=stage(root,'blocked-no-manifest',start);assert.equal(empty.result.count,0);assert.equal(empty.result.manifestSha256,'');
});
