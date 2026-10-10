'use strict';
// Research-only inference and settlement. Never fit or modify production records.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const api=require('./partner-calibration.cjs'),contract=require('./analysis-input-contract');
const protocol=require('./partner-frozen-protocol.json');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const exact=t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
const clone=x=>JSON.parse(JSON.stringify(x));
function model(){
 const bytes=fs.readFileSync(path.join(__dirname,'partner-frozen-model.json'));
 if(sha(bytes)!==protocol.modelFileSha256)throw Error('frozen-model-hash-mismatch');
 if(sha(fs.readFileSync(path.join(__dirname,'partner-calibration.cjs')))!==protocol.inferenceCodeSha256)throw Error('frozen-inference-code-hash-mismatch');
 const m=JSON.parse(bytes);if(m.automaticAdoption!==false||m.validatedProbability!==false)throw Error('research-model-flags');return m;
}
function extract(r){
 const error=contract.preDeadlineReason(r);if(error)throw Error(error);
 if(contract.raceKey(r)!==r.raceKey||r.date!==protocol.cohortDate||!r.raceKey.startsWith(r.date+'-'))throw Error('wrong-cohort-or-id');
 const p=r.prediction||{},b=p.practicalSelection?.frameRiseFallReplayBasis,s=b?.raceScenarios?.mainScenario;
 if(b?.source!=='pre-deadline-production-prediction')throw Error('stored-basis-absent');
 const base=(p.practicalTickets||[]).map(t=>String(t.ticket||t));
 const input={head:Number(s?.headBoatNo??s?.attackerBoatNo??s?.attacker),scenarioType:s?.type,
  outcomes:(s?.outcome?.boats||[]).map(x=>({boatNo:x.boatNo,secondScore:x.secondScore,thirdScore:x.thirdScore})),
  courseByBoat:b.courseMapping?.byBoat,base};
 api.pairsFromInput(input);
 if(!base.length||base.length>10||!base.every(exact)||new Set(base).size!==base.length)throw Error('invalid-baseline');
 return {...input,courseFormal:b.courseMapping.formal===true,sourceVersion:b.aiCoreVersion};
}
function snapshot(r,m,capturedAt){
 if(!Number.isFinite(Date.parse(capturedAt)))throw Error('invalid-capture-time');
 const before=JSON.stringify(r);let input,result,reason=null;
 try{input=extract(r);result=api.selectPartners(input,m);}catch(e){reason=e.message;}
 const base=(r.prediction?.practicalTickets||[]).map(x=>String(x.ticket||x));
 if(!base.length||base.length>10||!base.every(exact)||new Set(base).size!==base.length)throw Error('unusable-baseline:'+r.raceKey);
 const tickets=reason?base:result.tickets;
 if(JSON.stringify(r)!==before)throw Error('input-mutated');
 const head=input?.head??null,counts=a=>[1,2,3,4,5,6].map(b=>a.filter(t=>Number(t[0])===b).length);
 if(JSON.stringify(counts(base))!==JSON.stringify(counts(tickets)))throw Error('budget-changed');
 for(let i=0;i<base.length;i++)if(Number(base[i][0])!==head&&base[i]!==tickets[i])throw Error('alternative-ticket-changed');
 const sourceValid=!contract.preDeadlineReason(r),deadline=Date.parse(r.deadlineAt);
 return {raceKey:r.raceKey,date:r.date,jcd:r.jcd,raceNo:r.raceNo,place:r.place,
  sourceSelectedAt:r.selectedAt,deadlineAt:r.deadlineAt,candidateGeneratedAt:capturedAt,sourcePreDeadline:sourceValid,
  timing:sourceValid&&Date.parse(capturedAt)<deadline?'pre-deadline-candidate-unsealed':'retrospective-replay',
  rankingInput:input||null,inputSha256:input?sha(JSON.stringify(input)):null,
  base,candidate:tickets,unavailable:reason,rankedPairs:result?.rankedPairs||[],
  added:tickets.filter(t=>!base.includes(t)),removed:base.filter(t=>!tickets.includes(t)),automaticAdoption:false};
}
function makeReplayInput(r){
 const p=r.prediction,c=p?.preRaceConditions,e=c?.escapeEvaluationEvidence;
 if(!Array.isArray(e?.entries)||e.entries.length!==6)throw Error('original-entries-absent');
 const input=Object.fromEntries(['entries','beforeInfo','startExhibition','raceInfo','historyContext','datasetVersion'].map(k=>[k,e[k]]));
 Object.assign(input,{date:r.date,jcd:r.jcd,raceNo:r.raceNo,deadlineAt:r.deadlineAt,stadiumCode:r.jcd,stadiumName:r.place,
 weather:c.weather,analysisProfile:c.analysisProfile,newEngineMode:c.newEngineMode,fetchedAt:c.sourceFetchedAt});
 return {raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,input,
 savedPractical:p.practicalTickets,savedScenario:p.verificationEvidence.mainScenario,savedSelectionStatus:p.practicalSelection.status};
}
function capture(root,out){
 const daily=require('./eight-ticket-promotion-report-source.cjs').readDay(root,protocol.cohortDate);
 const records=contract.mergePredictionSources(daily.data.predictions,daily.data.verificationPredictions);
 if(!records.length)throw Error('empty-source');
 const m=model(),capturedAt=new Date().toISOString(),rows=records.map(r=>snapshot(r,m,capturedAt));
 fs.mkdirSync(out,{recursive:true});
 const write=(n,x)=>fs.writeFileSync(path.join(out,n),JSON.stringify(x,null,2));
 // This complete candidate file is committed to an artifact before any result refresh.
 const doc={protocol,generatedAt:capturedAt,sourceUpdatedAt:daily.data.updatedAt,sourceKind:daily.source,
  sourceRecordsSha256:sha(JSON.stringify(records)),modelFileSha256:protocol.modelFileSha256,rows};
 write('snapshots.json',doc);
 write('stored-records.json',records);write('pre-race-inputs.json',records.map(makeReplayInput));
 fs.copyFileSync(path.join(__dirname,'partner-frozen-model.json'),path.join(out,'frozen-model.json'));
 write('capture-manifest.json',{snapshotSha256:sha(fs.readFileSync(path.join(out,'snapshots.json'))),
  sourceRecordsSha256:doc.sourceRecordsSha256,canonicalRaces:rows.length,
  sourcePreDeadline:rows.filter(r=>r.sourcePreDeadline).length,unavailable:rows.filter(r=>r.unavailable).map(r=>({raceKey:r.raceKey,reason:r.unavailable})),
  candidateBeforeDeadlineUnsealed:rows.filter(r=>r.timing==='pre-deadline-candidate-unsealed').length,productionChanged:false,retrained:false});
 return doc;
}
function metrics(rows,key){
 let hits=0,cost=0,payout=0,gains=0,losses=0;const changes=[];
 for(const r of rows){const old=r.base.includes(r.actual),win=r[key].includes(r.actual);hits+=+win;cost+=r[key].length*100;payout+=win?r.payout:0;
  if(old!==win){gains+=+win;losses+=+old;changes.push({raceKey:r.raceKey,actual:r.actual,payout:r.payout,type:win?'gain':'loss'});}}
 return {races:rows.length,hits,hitRate:rows.length?100*hits/rows.length:null,gains,losses,netHits:gains-losses,cost,payout,profit:payout-cost,returnRate:cost?100*payout/cost:null,changes};
}
function settle(doc,official,immutablePersistedAt=null){
 if(!Array.isArray(doc?.rows)||!Array.isArray(official))throw Error('invalid-settlement-input');
 if(new Set(doc.rows.map(r=>r.raceKey)).size!==doc.rows.length)throw Error('duplicate-snapshot');
 const byKey=new Map();for(const r of official){const k=contract.raceKey(r);if(!k)continue;if(byKey.has(k))throw Error('duplicate-official-result');byKey.set(k,r);}
 const scored=[],excluded=[];
 for(const r of doc.rows){const y=byKey.get(r.raceKey);let reason=null;
  const actual=contract.actualTicket(y),payout=y?.trifecta?.payout;
  if(!r.sourcePreDeadline)reason='invalid-source-timing';
  else if(!y||y.resultAvailable!==true)reason=y?.void?'void':'result-pending-or-unavailable';
  else if(!contract.isOfficialResultSource(y))reason='untrusted-result-source';
  else if(y.void||y.refund||y.refunded||y.refunds?.length||y.starts?.some(s=>s.falseStart||s.lateStart))reason='refund-or-void';
  else if(!exact(actual)||!Number.isSafeInteger(payout)||payout<0)reason='invalid-official-result';
  else {const finish=contract.orderFromFinishers(y.finishers);if(finish.length===3&&finish.join('-')!==actual)reason='official-finish-payout-conflict';}
  if(reason){excluded.push({raceKey:r.raceKey,reason});continue;}
  const seal=Date.parse(immutablePersistedAt),deadline=Date.parse(r.deadlineAt);
  const prospective=r.timing==='pre-deadline-candidate-unsealed'&&Number.isFinite(seal)&&seal>=Date.parse(r.candidateGeneratedAt)&&seal<deadline;
  scored.push({...r,actual,payout,prospective});
 }
 const section=rs=>({base:metrics(rs,'base'),candidate:metrics(rs,'candidate')});
 return {snapshotSha256:sha(JSON.stringify(doc)),modelFileSha256:doc.modelFileSha256,canonicalRaces:doc.rows.length,
  settledRaces:scored.length,excluded,all:section(scored),prospective:section(scored.filter(r=>r.prospective)),
  retrospective:section(scored.filter(r=>!r.prospective)),rows:scored,immutablePersistedAt,
  automaticAdoption:false,productionChanged:false,retrained:false,interpretation:'Additional-day evidence only; no automatic adoption or validated probability claim.'};
}
if(require.main===module){
 const [mode,root,out]=process.argv.slice(2);
 if(mode==='capture'){const d=capture(path.resolve(root),path.resolve(out));console.log(JSON.stringify({rows:d.rows.length,model:d.modelFileSha256}));}
 else if(mode==='settle'){
  const dir=path.resolve(root),doc=JSON.parse(fs.readFileSync(path.join(dir,'snapshots.json'))),file=path.resolve(out);
  const data=JSON.parse(fs.readFileSync(file)),report=settle(doc,data.races||data);
  fs.writeFileSync(path.join(dir,'comparison.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({n:report.settledRaces,base:report.all.base.hits,candidate:report.all.candidate.hits,excluded:report.excluded.length}));
 }else throw Error('usage: capture <root> <out> | settle <out> <official.json>');
}
module.exports={model,extract,snapshot,makeReplayInput,capture,settle,metrics};
