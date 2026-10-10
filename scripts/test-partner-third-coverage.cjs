'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const guard=require('./partner-third-coverage.cjs');
const {summarize,build,replay}=require('./research-partner-third-coverage.cjs');
function fixture({third=true,complete=true,locked=true}={}) {
  const baseline=['1-2-3',...(locked?['1-2-6']:['1-2-4']),'4-1-3'];
  const pool=[...baseline,'1-2-5'];
  const decisions=pool.map(ticket=>({ticket,priorityScore:ticket==='1-2-5'?100:ticket==='1-2-3'?80:90,
    reasonCode:locked && ticket==='1-2-6'?'INDEPENDENT_SCENARIO':'CANDIDATE_ONLY_EVALUATION',branchIds:['saved'],
    physicalCoverage:[{boatNo:+ticket[0],position:1,role:'head'},{boatNo:+ticket[2],position:2,role:'hold'},
      ...((ticket==='1-2-3'?third:ticket==='1-2-5'?complete:true)?[{boatNo:+ticket[4],position:3,role:'pickup'}]:[])]}));
  return {baseline,pool,courses:{1:1,2:2,3:3,4:4,5:5,6:6},evidence:{status:'validated',stageHistory:{candidateDecisions:decisions}}};
}
test('third survives even when the same pair remains via a locked ticket',()=>{
  const row=fixture(),before=JSON.stringify(row),s=guard.select(row);
  assert.equal(s.pairGuardApplied,false);
  assert(!s.guarded.includes('1-2-3'));
  assert.deepEqual(s.protectedThirds,['1-2-3']);
  assert.deepEqual(s.thirdGuard,row.baseline);
  assert.equal(JSON.stringify(row),before);
});
test('single third-for-third swap is protected, without a coverage-count decrease',()=>{
  const row=fixture({locked:false}),s=guard.select(row);
  assert.equal(s.guarded.filter(t=>t.startsWith('1-2')).length,2);
  assert.deepEqual(s.thirdGuard,row.baseline);
});
test('allows an evidence upgrade when no removed third role was recorded',()=>{
  const row=fixture({third:false}),s=guard.select(row);
  assert.equal(s.thirdGuardApplied,false);
  assert.deepEqual(s.thirdGuard,s.guarded);
  assert(s.thirdGuard.includes('1-2-5'));
  assert(s.thirdGuard.includes('1-2-6'));
  assert.equal(s.thirdGuard[2],'4-1-3');
  assert.equal(s.thirdGuard.length,row.baseline.length);
});
test('incomplete added roles cannot justify replacement, irrespective of high score',()=>{
  const row=fixture({third:false,complete:false}),s=guard.select(row);
  assert.deepEqual(s.incompleteAdditions,['1-2-5']);
  assert.deepEqual(s.thirdGuard,row.baseline);
});
test('any saved third observation protects; incomplete duplicates cannot invent complete roles',()=>{
  const row=fixture({third:false});
  row.evidence.stageHistory.candidateDecisions.push({ticket:'1-2-3',branchIds:['other'],physicalCoverage:[{boatNo:3,position:3,role:'hold'}]});
  assert.deepEqual(guard.select(row).thirdGuard,row.baseline);
  const dup=fixture({third:false});
  const d=dup.evidence.stageHistory.candidateDecisions.at(-1);
  dup.evidence.stageHistory.candidateDecisions.push({...d,physicalCoverage:d.physicalCoverage.slice(0,2)});
  assert.deepEqual(guard.select(dup).thirdGuard,dup.baseline);
});
test('malformed evidence rejects, results and odds cannot affect selection',()=>{
  const row=fixture({third:false});
  assert.deepEqual(guard.select({...row,actual:'6-5-4',payout:99999,odds:{'1-2-5':999}}),guard.select(row));
  assert.equal(guard.select({...row,evidence:null}).reason,'selection-evidence-unavailable');
  assert.equal(guard.select({...row,courses:null}).reason,'invalid-saved-input');
  const conflict=fixture();conflict.evidence.stageHistory.candidateDecisions.push({...conflict.evidence.stageHistory.candidateDecisions[0],priorityScore:500});
  assert.equal(guard.select(conflict).reason,'conflicting-saved-priority');
});
test('all boat identities are symmetric, including non-boat-one course one',()=>{
  const row=fixture(),rename=t=>t.split('-').map(n=>n==='1'?'2':n==='2'?'1':n).join('-');
  row.baseline=row.baseline.map(rename);row.pool=row.pool.map(rename);row.courses={1:2,2:1,3:3,4:4,5:5,6:6};
  for(const d of row.evidence.stageHistory.candidateDecisions){d.ticket=rename(d.ticket);for(const c of d.physicalCoverage)c.boatNo=c.boatNo===1?2:c.boatNo===2?1:c.boatNo;}
  assert.deepEqual(guard.select(row).thirdGuard,row.baseline);
});
test('summary preserves losses, equal stakes, no invented zero-cohort rate',()=>{
  const rows=[{actual:'1-2-3',payout:1000,baseline:['1-2-3'],control:['1-2-4'],guarded:['1-2-4'],coverageFirst:['1-2-4'],thirdGuard:['1-2-3']}];
  const s=summarize(rows);assert.equal(s.baseline.hits,1);assert.equal(s.guarded.hits,0);assert.equal(s.thirdGuard.stake,100);
  assert.equal(summarize([]).thirdGuard.hitRate,null);
});
test('report refuses incomplete cohorts and forged seals rather than silently excluding them',()=>{
  assert.throws(()=>build('.', 'a'.repeat(40),()=>Buffer.from('{"version":"partner-forward-report-v2","sealed":99}')),/completed fixed/);
  assert.throws(()=>replay(require('node:path').resolve(__dirname,'..'),{snapshot:{}},Buffer.from('{}')),/invalid seal/);
});
test('replay validates a full bundle, SHA, method and exact frozen ticket order',()=>{
  const f=require('./partner-forward.cjs'),root=require('node:path').resolve(__dirname,'..'),p=f.protocol(root);
  const row=fixture(),raceKey='20301005-24-1',date='20301005',selectedAt='2030-10-05T01:00:00Z',deadlineAt='2030-10-05T01:10:00Z';
  const boats=[1,2,3,4,5,6];
  const record={raceKey,date,jcd:'24',raceNo:1,selectedAt,deadlineAt,publicationPolicy:'all-races-v1',
    reviewEvidence:{version:'race-review-evidence-v1',method:p.value.method.slice(7),predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false},
    exhibitionSnapshot:{version:'note-exhibition-v1',capturedAt:selectedAt,entries:boats.map(boat=>({boat,exhibition:{displayTime:6.8}})),startExhibition:boats.map(boat=>({boat,course:boat,st:0.1,mappingSource:'official-start-image'}))},
    prediction:{practicalTickets:row.baseline,candidate24Tickets:row.pool,officialResultUsedForPrediction:false,preRaceConditions:{boats:boats.map(boatNo=>({boatNo,course:boatNo,courseOfficial:true}))}}};
  record.practicalSelectionEvidence=require('./practical-selection-evidence').capture(record,row.baseline,{tickets:row.baseline,candidateDecisions:row.evidence.stageHistory.candidateDecisions});
  const bundle={version:'note-draft-bundle-v1',record,baselinePracticalTickets:row.baseline,generationAudit:{contentReady:true,raceKey,auditedAt:selectedAt}};
  const bytes=Buffer.from(f.json(bundle)),sourceSha256=f.hash(bytes),chosen=guard.select(row);
  const snapshot={version:'partner-forward-snapshot-v1',protocolHash:p.digest,selectorHash:p.value.selectorSha256,method:p.value.method,
    raceKey,date,selectedAt,deadlineAt,capturedAt:'2030-10-05T01:01:00Z',sourceSha256,sourcePath:`data/note-drafts/${date}/${raceKey}-${sourceSha256}.json`,
    runId:'123',runAttempt:'1',workflowHead:'a'.repeat(40),codeCommit:'b'.repeat(40),baseline:chosen.baseline,control:chosen.control,guarded:chosen.guarded};
  const receipt={version:'partner-forward-seal-v1',snapshot,snapshotHash:f.hash(f.json(snapshot)),artifact:{id:1,digest:'sha256:'+'c'.repeat(64),name:'partner-forward-123-1',runId:'123',workflowHead:snapshot.workflowHead,createdAt:'2030-10-05T01:02:00Z',confirmedAt:'2030-10-05T01:03:00Z'}};
  assert.deepEqual(replay(root,receipt,bytes).thirdGuard,row.baseline);
  assert.throws(()=>replay(root,receipt,Buffer.concat([bytes,Buffer.from(' ')])),/source SHA/);
  const changed=structuredClone(receipt);changed.snapshot.control.reverse();changed.snapshotHash=f.hash(f.json(changed.snapshot));
  assert.throws(()=>replay(root,changed,bytes),/frozen control/);
  bundle.record.prediction.officialResultUsedForPrediction=true;
  const postResult=Buffer.from(f.json(bundle)),bad=structuredClone(receipt);
  bad.snapshot.sourceSha256=f.hash(postResult);bad.snapshot.sourcePath=`data/note-drafts/${date}/${raceKey}-${bad.snapshot.sourceSha256}.json`;bad.snapshotHash=f.hash(f.json(bad.snapshot));
  assert.throws(()=>replay(root,bad,postResult),/notPreRacePrediction/);
});
