'use strict';
// Bounded-memory regression using generated temporary sources only.
// The total unused prediction payload exceeds the child heap, while each
// source fits easily. All source files, snapshots and accounting still count.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const {buildProgress,prepareBundles}=require('./build-race-review-progress');
const {capture}=require('./practical-selection-evidence');
const {methodFingerprint}=require('./race-review-evidence');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'race-review-bounded-memory-'));
const modulePath=path.join(__dirname,'build-race-review-progress.js');
const hash=b=>createHash('sha256').update(b).digest('hex'),sources=[],SOURCE_COUNT=108,PADDING_BYTES=2*1024*1024;
function bundle(index) {
  const raceIndex=index%24,date=String(20300101+Math.floor(raceIndex/12)),raceNo=raceIndex%12+1;
  const day=date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8);
  const selectedAt=day+'T01:'+String(Math.floor(index/24)*5).padStart(2,'0')+':00.000Z',deadlineAt=day+'T02:00:00.000Z';
  const raceKey=date+'-01-'+raceNo,method=(raceIndex%3===0?'c':'a').repeat(64);
  const practical=index>=72&&raceIndex%2===0?['1-2-4']:['1-2-3'];
  const record={date,jcd:'01',raceNo,raceKey,selectedAt,deadlineAt,publicationPolicy:'all-races-v1',
    reviewEvidence:{version:'race-review-evidence-v1',method,predictionMode:'server_pre_deadline',officialResultUsedForPrediction:false},
    exhibitionSnapshot:{version:'note-exhibition-v1',capturedAt:selectedAt,
      entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.8}})),
      startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:0.1,mappingSource:'official-start-image'}))},
    prediction:{practicalTickets:practical,candidate24Tickets:['1-2-3','1-2-4'],
      practicalSelection:{candidateDecisions:[{ticket:'1-2-3',reasonCode:'SAVED_INPUT_REASON'}]}}};
  record.practicalSelectionEvidence=capture(record,practical,{tickets:practical,
    candidateDecisions:[null,{ticket:'6-5-4',selected:false,reasonCode:'OTHER_TICKET'},
      {ticket:'1-2-3',selected:false,reasonCode:'SAVED_INTERMEDIATE'},
      {ticket:'1-2-3',selected:true,reasonCode:'SAVED_DUPLICATE'}],
    excludedCandidates:[{ticket:'1-2-3',selected:false,reasonCode:'SAVED_EXCLUDED'}],
    targetDecisions:[{evaluationId:'evaluation:one',boatNo:1,reasonCode:'SAVED_TARGET',
      candidateDecisions:[{ticket:'1-2-3',selected:false,reasonCode:'SAVED_TARGET_STAGE'}]}]});
  return {version:'note-draft-bundle-v1',sourceCommit:'b'.repeat(40),record,
    baselinePracticalTickets:practical,generationAudit:{contentReady:index%9!==8,raceKey,auditedAt:selectedAt}};
}
try {
  let totalBytes=0;
  for(let index=0;index<SOURCE_COUNT;index++) {
    const b=bundle(index),dir=path.join(root,'data/note-drafts',b.record.date);
    fs.mkdirSync(dir,{recursive:true});
    const file=path.join(dir,String(index).padStart(4,'0')+'.json');
    b.record.prediction.unusedHugePrediction={padding:'x'.repeat(PADDING_BYTES)};
    const raw=JSON.stringify(b)+'\n';fs.writeFileSync(file,raw);
    sources.push({file,sha256:hash(raw),small:null});totalBytes+=Buffer.byteLength(raw);
    delete b.record.prediction.unusedHugePrediction;sources.at(-1).small=b;
  }
  assert.ok(totalBytes>3*64*1024*1024,'source payload is more than three child heaps');
  const ordered=sources.slice().sort((a,b)=>a.file.localeCompare(b.file)),small=ordered.map(s=>s.small);
  const selected=prepareBundles(small),results=[];
  for(const {row} of selected.selected.values()) {
    const raceNo=Number(row.raceKey.split('-')[2]),r={date:row.date,jcd:'01',raceNo,source:'boatrace-official',resultAvailable:true,
      trifecta:{combination:'1-2-3',payout:500+raceNo}};
    if(raceNo===4)r.trifecta.payout=null;
    if(raceNo===7)r.refund=true;
    if(raceNo===10)r.source='untrusted';
    results.push(r);
  }
  const resultDirectory=path.join(root,'data/results');fs.mkdirSync(resultDirectory,{recursive:true});
  for(const date of new Set(results.map(r=>r.date)))fs.writeFileSync(path.join(resultDirectory,date+'.json'),
    JSON.stringify({races:results.filter(r=>r.date===date)}));
  const statsDirectory=path.join(root,'data/stats');fs.mkdirSync(statsDirectory,{recursive:true});
  fs.writeFileSync(path.join(statsDirectory,'race-review-results.json'),JSON.stringify({races:{},attempts:{one:{status:'retry'},two:{status:'complete'}}}));
  const run=()=>execFileSync(process.execPath,['--max-old-space-size=64','-e',
    'require(process.argv[1]).main(process.argv[2]);',modulePath,root],{encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
  const stdout=run(),output=path.join(statsDirectory,'race-review-progress.json'),bytes=fs.readFileSync(output,'utf8'),actual=JSON.parse(bytes);
  const expected=buildProgress(small,results,{generatedAt:actual.generatedAt,activeMethod:methodFingerprint()});expected.resultFetchRetries=1;
  assert.equal(bytes,JSON.stringify(expected)+'\n','bounded main equals full in-memory API byte for byte');
  assert.equal(actual.captured,24,'all unique races survive');
  assert.deepEqual(actual.excluded,{auditUnconfirmed:12},'all invalid sources were assessed too');
  assert.equal(actual.captured+Object.values(actual.excluded).reduce((n,v)=>n+v,0),36);
  assert.equal(stdout.trim().split('\n').length,1,'child produces only the existing summary');
  for(const s of sources)assert.equal(hash(fs.readFileSync(s.file)),s.sha256,'source bytes and saved audit remain immutable');
  run();assert.equal(fs.readFileSync(output,'utf8'),bytes,'unchanged data preserves the original generatedAt and complete report');
  const histories=actual.cohorts.flatMap(c=>c.selectionLoss.rows).flatMap(r=>r.practicalSelectionEvidence?.actualDecisionHistory||[]);
  assert.ok(histories.some(h=>h.source==='candidateDecisions[2]'&&h.decision.reasonCode==='SAVED_INTERMEDIATE'),'original stage indexes/reasons survive');
  assert.ok(histories.some(h=>h.source==='targetDecisions[0].candidateDecisions[0]'&&h.target.evaluationId==='evaluation:one'),'target metadata survives');
  console.log(JSON.stringify({test:'race-review-bounded-memory',sources:SOURCE_COUNT,inputBytes:totalBytes,
    childHeapMiB:64,captured:actual.captured,excluded:actual.excluded,reportByteIdentical:true,sourceBytesUnchanged:true,generatedAtStable:true}));
} finally {fs.rmSync(root,{recursive:true,force:true});}
