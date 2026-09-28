'use strict';
// Read-only training/validation export. Prediction inputs and result labels stay separate.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const source=require('./eight-ticket-promotion-report-source.cjs'), contract=require('./analysis-input-contract');
const REF='c9ed6755b9de811a0bd5aa1ad00f5a7f6b42d4c2';
const root=path.resolve(process.argv[2]||''), out=path.resolve(process.argv[3]||'');
if(!fs.existsSync(path.join(root,'data/predictions')))throw Error('source-root-required');
fs.mkdirSync(out,{recursive:true});
const records=[],labels=[],skips=[],sources=[],errors=[];
const exact=t=>typeof t==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
const valid=n=>Number.isInteger(n)&&n>=1&&n<=6;
for(let day=1;day<=23;day++){
 const date='202609'+String(day).padStart(2,'0');
 let daily;
 try{daily=source.readDay(root,date);}catch(e){errors.push({date,reason:e.message});continue;}
 const canonical=contract.mergePredictionSources(daily.data.predictions,daily.data.verificationPredictions);
 sources.push({date,source:daily.source,updatedAt:daily.data.updatedAt,canonical:canonical.length});
 let official=[];const rp=path.join(root,'data/results',date+'.json');
 if(fs.existsSync(rp))official=JSON.parse(fs.readFileSync(rp,'utf8')).races||[];
 const byKey=new Map(official.filter(r=>contract.isOfficialResultSource(r)&&r.resultAvailable===true).map(r=>[contract.raceKey(r,date),r]));
 for(const r of canonical){
  try{
   const reason=contract.preDeadlineReason(r);if(reason)throw Error(reason);
   const p=r.prediction||{},basis=p.practicalSelection?.frameRiseFallReplayBasis;
   if(basis?.source!=='pre-deadline-production-prediction')throw Error('stored-replay-basis-absent');
   const main=basis.raceScenarios?.mainScenario, head=Number(main?.headBoatNo??main?.attackerBoatNo??main?.attacker);
   const scenarioType=main?.type;
   if(!valid(head)||!['escape','sashi','threeAttack','fourAttack'].includes(scenarioType))throw Error('invalid-scenario');
   const outcomes=(main.outcome?.boats||[]).map(b=>({boatNo:b.boatNo,secondScore:b.secondScore,thirdScore:b.thirdScore}));
   if(outcomes.length!==6||new Set(outcomes.map(b=>b.boatNo)).size!==6||outcomes.some(b=>!valid(b.boatNo)||['secondScore','thirdScore'].some(k=>typeof b[k]!=='number'||!Number.isFinite(b[k])||b[k]<0||b[k]>100)))throw Error('invalid-positional-snapshot');
   const mapping=basis.courseMapping?.byBoat;
   if(!mapping||[1,2,3,4,5,6].some(b=>!valid(mapping[b]))||new Set(Object.values(mapping)).size!==6)throw Error('stored-course-map-absent');
   const base=(p.practicalTickets||[]).map(t=>String(t.ticket||t));
   if(!base.length||base.length>10||!base.every(exact)||new Set(base).size!==base.length||!base.some(t=>Number(t[0])===head))throw Error('invalid-saved-practical-tickets');
   records.push({raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,head,scenarioType,outcomes,courseByBoat:mapping,courseFormal:basis.courseMapping.formal===true,base,sourceVersion:basis.aiCoreVersion});
   const result=byKey.get(r.raceKey),actual=contract.actualTicket(result),payout=result?.trifecta?.payout;
   const invalid=!result?'missing-official-result':result.void?'void':!actual?'invalid-actual':!Number.isSafeInteger(payout)||payout<0?'invalid-payout':null;
   const refund=Boolean(result?.refund||result?.refunded||result?.refunds?.length||result?.starts?.some(s=>s.falseStart||s.lateStart));
   labels.push({raceKey:r.raceKey,date:r.date,actual,payout,refund,unavailable:invalid,place:r.place});
  }catch(e){skips.push({raceKey:r.raceKey,date,reason:e.message});}
 }
}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputs=Buffer.from(JSON.stringify(records)),results=Buffer.from(JSON.stringify(labels));
fs.writeFileSync(path.join(out,'history-inputs.json'),inputs);fs.writeFileSync(path.join(out,'history-results.json'),results);
const report={reference:REF,firstDate:'20260901',lastDate:'20260923',recordCount:records.length,canonicalCount:sources.reduce((n,x)=>n+x.canonical,0),inputsSha256:sha(inputs),labelsSha256:sha(results),sources,skips,errors,productionChanged:false};
fs.writeFileSync(path.join(out,'history-manifest.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({exported:records.length,skips:skips.length,sourceErrors:errors},null,2));
if(errors.length)throw Error('source-coverage-or-integrity-errors');
