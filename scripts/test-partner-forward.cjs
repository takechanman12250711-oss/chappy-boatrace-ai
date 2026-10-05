'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const f=require('./partner-forward.cjs');
const p=f.protocol(path.resolve(__dirname,'..'));
function snapshot(){return {version:'partner-forward-snapshot-v1',protocolHash:p.digest,selectorHash:p.value.selectorSha256,method:p.value.method,
 raceKey:'20301005-24-1',date:'20301005',selectedAt:'2030-10-05T01:00:00Z',capturedAt:'2030-10-05T01:01:00Z',deadlineAt:'2030-10-05T01:10:00Z',
 sourcePath:'data/note-drafts/20301005/20301005-24-1-'+ 'a'.repeat(64)+'.json',sourceSha256:'a'.repeat(64),runId:'123',runAttempt:'1',workflowHead:'b'.repeat(40),codeCommit:'c'.repeat(40),
 baseline:['1-2-3','1-3-4'],control:['1-2-3','1-4-5'],guarded:['1-2-3','1-3-4']};}
function receipt(){const s=snapshot();return {version:'partner-forward-seal-v1',snapshotHash:f.hash(f.json(s)),snapshot:s,artifact:{id:456,digest:'sha256:'+'d'.repeat(64),runId:s.runId,workflowHead:s.workflowHead,name:'partner-forward-123-1',createdAt:'2030-10-05T01:02:00Z',confirmedAt:'2030-10-05T01:03:00Z'}};}
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'partner-forward-'));fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'scripts'));for(const file of ['config/partner-forward.json','scripts/research-escape-partners.cjs'])fs.copyFileSync(path.resolve(__dirname,'..',file),path.join(root,file));return root;}
function persist(root,r){const b=f.json(r),file=path.join(root,'data/partner-forward',r.snapshot.date,`${r.snapshot.raceKey}-${f.hash(b)}.json`);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,b);return file;}
test('seal rejects wrong identity, head budget, stale clocks and changed protocol',()=>{
 assert.equal(f.validSeal(receipt(),p),true);
 const sameSecond=receipt();sameSecond.snapshot.capturedAt='2030-10-05T01:02:00.500Z';sameSecond.snapshotHash=f.hash(f.json(sameSecond.snapshot));assert.equal(f.validSeal(sameSecond,p),true,'artifact created_at has only second precision');
 for(const change of [r=>r.snapshot.control.push('2-1-3'),r=>r.snapshot.control[0]='2-1-3',r=>r.snapshot.guarded[1]='1-2-3',r=>r.snapshot.method='other',r=>r.snapshot.sourceSha256='x',r=>r.snapshot.capturedAt=r.snapshot.deadlineAt,r=>r.artifact.confirmedAt=r.snapshot.deadlineAt,r=>r.artifact.runId='999',r=>r.artifact.workflowHead='d'.repeat(40),r=>r.artifact.createdAt='2030-10-05T00:00:00Z',r=>r.snapshot.protocolHash='e'.repeat(64)]){
 const r=receipt();change(r);r.snapshotHash=f.hash(f.json(r.snapshot));assert.equal(f.validSeal(r,p),false);
 }
});
test('remote metadata is checked and late artifact never becomes forward evidence',async()=>{
 const root=fixture(),out=path.join(root,'staging');fs.mkdirSync(out);const s=snapshot(),raw=f.json(s);fs.writeFileSync(path.join(out,f.hash(raw)+'.json'),raw);
 const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:s.workflowHead,PARTNER_ARTIFACT_ID:'456',PARTNER_ARTIFACT_DIGEST:'d'.repeat(64),GH_TOKEN:'test-only'};
 const metadata={id:456,digest:'sha256:'+'d'.repeat(64),name:'partner-forward-123-1',created_at:'2030-10-05T01:02:00Z',expired:false,workflow_run:{id:123,head_sha:s.workflowHead}};
 const response=(date,a=metadata)=>async()=>({ok:true,headers:{get:()=>date},json:async()=>a});
 try{
 assert.deepEqual(await f.seal(root,out,env,response('Sat, 05 Oct 2030 01:03:00 GMT')),{saved:1,late:0});
 assert.equal(f.cohort(root,p).rows.length,1);
 assert.deepEqual(await f.seal(root,out,env,response('Sat, 05 Oct 2030 01:09:59 GMT')),{saved:0,late:1},'upper bound of HTTP second must precede deadline');
 await assert.rejects(f.seal(root,out,env,response('invalid')),/artifact_identity/);
 await assert.rejects(f.seal(root,out,env,response('Sat, 05 Oct 2030 01:03:00 GMT',{...metadata,digest:'sha256:'+'e'.repeat(64)})),/artifact_identity/);
 await assert.rejects(f.seal(root,out,{...env,GITHUB_REF:'refs/pull/1/merge'},response('Sat, 05 Oct 2030 01:03:00 GMT')),/context/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('first remote seal wins and pending races remain in fixed cohort',()=>{
 const root=fixture();try{const first=receipt(),later=receipt();later.artifact.confirmedAt='2030-10-05T01:04:00Z';persist(root,later);persist(root,first);
 const c=f.cohort(root,p);assert.equal(c.rows.length,1);assert.equal(c.rows[0].artifact.confirmedAt,first.artifact.confirmedAt);
 const report=f.report(root);assert.equal(report.sealed,1);assert.equal(report.pending.length,1);assert.equal(report.stats.baseline.hitRate,null);assert.equal(report.productionChanged,false);assert.equal(report.checkpointReached,false);
 const file=persist(root,first);fs.appendFileSync(file,' ');assert.ok(Object.keys(f.cohort(root,p).rejected).length);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('frozen selector fails closed instead of silently generating a new experiment',()=>{
 const root=fixture();try{fs.appendFileSync(path.join(root,'scripts/research-escape-partners.cjs'),'\n');assert.throws(()=>f.protocol(root),/selector_changed/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('settlement reports gains and losses without generating new tickets',()=>{
 const root=fixture();try{
 const r=receipt();persist(root,r);fs.mkdirSync(path.join(root,'data/results'),{recursive:true});
 fs.writeFileSync(path.join(root,'data/results/20301005.json'),JSON.stringify({races:[{date:'20301005',jcd:'24',raceNo:1,source:'boatrace-official',resultAvailable:true,status:'finished',trifecta:{combination:'1-4-5',payout:2000}}]}));
 const before=JSON.stringify(f.cohort(root,p).rows);const d=f.report(root);
 assert.equal(d.stats.control.hits,1);assert.equal(d.stats.baseline.hits,0);assert.equal(d.stats.control.stake,d.stats.baseline.stake);
 assert.equal(d.comparisons.priorityVsSaved.gainedHits,1);assert.equal(d.comparisons.guardedVsPriority.lostHits,1);
 assert.equal(JSON.stringify(f.cohort(root,p).rows),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('capture validates a real bundle contract before deadline and never uses result files',()=>{
 const root=fixture(),git=args=>require('node:child_process').execFileSync('git',args,{cwd:root,stdio:'pipe'});
 try{
 git(['init']);git(['-c','user.name=test','-c','user.email=test@example.com','commit','--allow-empty','-m','fixture']);
 const s=snapshot(),boats=[1,2,3,4,5,6],review={version:'race-review-evidence-v1',method:s.method.slice(7),predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false};
 const record={raceKey:s.raceKey,date:s.date,jcd:'24',raceNo:1,selectedAt:s.selectedAt,deadlineAt:s.deadlineAt,publicationPolicy:'all-races-v1',reviewEvidence:review,
 exhibitionSnapshot:{version:'note-exhibition-v1',capturedAt:s.selectedAt,entries:boats.map(boat=>({boat,exhibition:{displayTime:6.8}})),startExhibition:boats.map(boat=>({boat,course:boat,st:0.1,mappingSource:'official-start-image'}))},
 prediction:{practicalTickets:s.baseline,candidate24Tickets:[...s.baseline,'1-4-5'],officialResultUsedForPrediction:false,preRaceConditions:{boats:boats.map(boatNo=>({boatNo,course:boatNo,courseOfficial:true}))}}};
 record.practicalSelectionEvidence=require('./practical-selection-evidence').capture(record,s.baseline,{tickets:s.baseline,candidateDecisions:record.prediction.candidate24Tickets.map(ticket=>({ticket,priorityScore:ticket==='1-4-5'?90:80,reasonCode:'CANDIDATE_ONLY_EVALUATION',branchIds:['branch'],physicalCoverage:[{boatNo:1,position:1,role:'head'},{boatNo:Number(ticket[2]),position:2,role:'hold'}]}))});
 const bundle={version:'note-draft-bundle-v1',record,baselinePracticalTickets:s.baseline,generationAudit:{contentReady:true,raceKey:s.raceKey,auditedAt:s.selectedAt}};
 const raw=f.json(bundle),source=path.join(root,'data/note-drafts',s.date,`${s.raceKey}-${f.hash(raw)}.json`);fs.mkdirSync(path.dirname(source),{recursive:true});fs.writeFileSync(source,raw);
 const env={GITHUB_REPOSITORY:'takechanman12250711-oss/chappy-boatrace-ai',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ID:s.runId,GITHUB_RUN_ATTEMPT:s.runAttempt,GITHUB_SHA:s.workflowHead};
 const out=path.join(root,'before');assert.equal(f.capture(root,out,env,Date.parse(s.capturedAt)).captured,1);
 const captured=JSON.parse(fs.readFileSync(path.join(out,fs.readdirSync(out)[0]),'utf8'));assert.deepEqual(captured.baseline,s.baseline);assert.equal(captured.control.includes('1-4-5'),true);assert.equal(fs.readFileSync(source,'utf8'),raw);
 assert.equal(f.capture(root,path.join(root,'after'),env,Date.parse(s.deadlineAt)).captured,0);
 assert.throws(()=>f.capture(root,path.join(root,'pr'),{...env,GITHUB_REF:'refs/pull/1/merge'}),/context/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('fixed checkpoint selects exactly the first 100 distinct remote confirmations',()=>{
 const root=fixture();try{for(let i=0;i<101;i++){const r=receipt(),s=r.snapshot;s.raceKey=`20301005-${String(Math.floor(i/12)+1).padStart(2,'0')}-${i%12+1}`;s.sourcePath=`data/note-drafts/${s.date}/${s.raceKey}-${s.sourceSha256}.json`;r.snapshotHash=f.hash(f.json(s));r.artifact.confirmedAt=new Date(Date.parse('2030-10-05T01:03:00Z')+i*1000).toISOString();persist(root,r);}
 const c=f.cohort(root,p);assert.equal(c.rows.length,100);assert.equal(c.rows[0].snapshot.raceKey,'20301005-01-1');assert.equal(c.rows.at(-1).snapshot.raceKey,'20301005-09-4');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
