'use strict';
// Run fitting, predictions, then result joins in that order. No production writes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const modelApi=require('./partner-calibration.cjs'), previous=require('./scenario-partner-pairs-shadow.cjs');
const contract=require('./analysis-input-contract');
const protocol=require('./open-partner-rank-protocol.json');
const history=path.resolve(process.argv[2]||''), evidence=path.resolve(process.argv[3]||''), out=path.resolve(process.argv[4]||'');
if(!fs.existsSync(path.join(history,'history-inputs.json'))||!fs.existsSync(path.join(evidence,'stored-inputs.json.gz')))throw Error('required-source-inputs-missing');
fs.mkdirSync(out,{recursive:true});
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')), sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const write=(name,x)=>fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2));
const sourceFiles=['partner-calibration.cjs','replay-partner-calibration.cjs','open-partner-rank-protocol.json'];
const provenance={protocol,sourceSha256:Object.fromEntries(sourceFiles.map(f=>[f,sha(fs.readFileSync(path.join(__dirname,f)))])),history:read(path.join(history,'history-manifest.json')),researchOnly:true,productionChanged:false};
write('protocol-and-sources.json',provenance);
const historyInputs=read(path.join(history,'history-inputs.json'));
const training=historyInputs.filter(r=>r.date>='20260901'&&r.date<='20260917');
// Discard validation labels before calling any fitting function.
const trainLabels=read(path.join(history,'history-results.json')).filter(r=>r.date>='20260901'&&r.date<='20260917');
const model=modelApi.fitModel(training,trainLabels);
write('model.json',model);
const validation=historyInputs.filter(r=>r.date>='20260918'&&r.date<='20260923');
const original=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(evidence,'stored-inputs.json.gz'))));
const previousRows=read(path.join(evidence,'scenario-pairs/predictions.json')).rows;
const previousMap=new Map(previousRows.map(r=>[r.raceKey,r]));
const diagnostic=original.records.map(r=>{
 const b=r.prediction.practicalSelection.frameRiseFallReplayBasis,s=b.raceScenarios.mainScenario;
 const p={raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,head:Number(s.headBoatNo??s.attackerBoatNo??s.attacker),scenarioType:s.type,
  outcomes:s.outcome.boats.map(x=>({boatNo:x.boatNo,secondScore:x.secondScore,thirdScore:x.thirdScore})),courseByBoat:b.courseMapping.byBoat,courseFormal:b.courseMapping.formal===true,
  base:r.prediction.practicalTickets.map(x=>String(x.ticket||x)),sourceVersion:b.aiCoreVersion};
 const prev=previousMap.get(r.raceKey);if(!prev||JSON.stringify(prev.base)!==JSON.stringify(p.base)||prev.mainHead!==p.head||prev.scenarioType!==p.scenarioType)throw Error('diagnostic-baseline-mismatch');
 const normalize=a=>a.map(x=>[x.boatNo,x.secondScore,x.thirdScore]).sort((a,b)=>a[0]-b[0]);
 if(JSON.stringify(normalize(p.outcomes))!==JSON.stringify(normalize(prev.rankingInputs)))throw Error('diagnostic-positional-input-mismatch');
 return p;
});
const all=[...validation,...diagnostic];
if(new Set(all.map(r=>r.raceKey)).size!==all.length||all.some(r=>model.trainingRaceIds.includes(r.raceKey)))throw Error('training-evaluation-overlap');
write('evaluation-inputs.json',all);
const predictions=all.map(r=>{
 if(!Number.isFinite(Date.parse(r.selectedAt))||Date.parse(r.selectedAt)>=Date.parse(r.deadlineAt))throw Error('evaluation-timestamp-invalid');
 let result,prior,unavailable=null;
 try{result=modelApi.selectPartners(r,model);prior=previous.selectMainPartners({baseTickets:r.base,mainHead:r.head,outcomes:r.outcomes});}
 catch(e){result={tickets:r.base,rankedPairs:[],added:[],removed:[]};prior={tickets:r.base};unavailable=e.message;}
 if(result.tickets.length!==r.base.length)throw Error('count-changed');
 for(let i=0;i<r.base.length;i++)if(Number(r.base[i][0])!==r.head&&r.base[i]!==result.tickets[i])throw Error('alternative-slot-changed');
 const counts=a=>[1,2,3,4,5,6].map(b=>a.filter(t=>Number(t[0])===b).length);
 if(JSON.stringify(counts(r.base))!==JSON.stringify(counts(result.tickets)))throw Error('head-quota-changed');
 return {...r,oldSum:prior.tickets,candidate:result.tickets,rankedPairs:result.rankedPairs,unavailable,added:result.added,removed:result.removed};
});
// Prediction records are persisted before evaluation-period labels are read/joined.
write('predictions.json',{modelSha256:sha(fs.readFileSync(path.join(out,'model.json'))),rows:predictions});
const labels=new Map(read(path.join(history,'history-results.json')).filter(r=>r.date>='20260918').map(r=>[r.raceKey,r]));
const official=read(path.join(evidence,'official-results.json'));
for(const [date,doc] of Object.entries(official))for(const r of doc.races||[]){
 if(!contract.isOfficialResultSource(r)||r.resultAvailable!==true)continue;
 const actual=contract.actualTicket(r),payout=r?.trifecta?.payout;
 labels.set(contract.raceKey(r,date),{raceKey:contract.raceKey(r,date),date,actual,payout,
  unavailable:r.void?'void':!actual?'invalid-result':!Number.isSafeInteger(payout)||payout<0?'invalid-payout':null,
  refund:Boolean(r.refund||r.refunded||r.refunds?.length||r.starts?.some(s=>s.falseStart||s.lateStart))});
}
const scored=[],excluded=[];
for(const r of predictions){const y=labels.get(r.raceKey);if(!y||y.unavailable||y.refund){excluded.push({raceKey:r.raceKey,date:r.date,reason:!y?'missing-result':y.unavailable||(y.refund?'refund':null)});continue;}scored.push({...r,actual:y.actual,payout:y.payout});}
function metrics(rows,key){let hits=0,payout=0,cost=0,gains=0,losses=0,changed=0;const details=[];
 for(const r of rows){const baseline=r.base.includes(r.actual),win=r[key].includes(r.actual);hits+=+win;payout+=win?r.payout:0;cost+=r[key].length*100;changed+=+r.base.some(t=>!r[key].includes(t));
 if(win!==baseline){gains+=+win;losses+=+baseline;details.push({raceKey:r.raceKey,actual:r.actual,payout:r.payout,type:win?'gain':'loss',head:r.head,scenarioType:r.scenarioType,added:r[key].filter(t=>!r.base.includes(t)),removed:r.base.filter(t=>!r[key].includes(t))});}}
 return {races:rows.length,hits,hitRate:rows.length?100*hits/rows.length:0,gains,losses,netHits:gains-losses,changed,cost,payout,profit:payout-cost,returnRate:cost?100*payout/cost:0,details};}
function section(rows){return Object.fromEntries(['base','oldSum','candidate'].map(k=>[k,metrics(rows,k)]));}
const validationRows=scored.filter(r=>r.date<='20260923'),diagnosticRows=scored.filter(r=>r.date>='20260924');
const report={version:modelApi.VERSION,productionChanged:false,automaticAdoption:false,trainingRaces:model.trainingRaceCount,trainingScoreCoefficients:model.weights.slice(0,2),
 exportedHistory:historyInputs.length,historyMissingDates:provenance.history.missingDates||provenance.history.errors,historySkipped:provenance.history.skips,
 evaluationRows:predictions.length,unavailable:predictions.filter(r=>r.unavailable).map(r=>({raceKey:r.raceKey,reason:r.unavailable})),excluded,
 validation:section(validationRows),diagnostic:section(diagnosticRows),byScenario:Object.fromEntries(modelApi.SCENARIOS.map(s=>[s,{validation:section(validationRows.filter(r=>r.scenarioType===s)),diagnostic:section(diagnosticRows.filter(r=>r.scenarioType===s))}])),
 byCourseReadiness:Object.fromEntries([true,false].map(f=>[f?'formal':'provisional',{validation:section(validationRows.filter(r=>r.courseFormal===f)),diagnostic:section(diagnosticRows.filter(r=>r.courseFormal===f))}])),
 limitation:'Validation is later than the fitting period but September dates appeared in earlier research. Not prospective untouched evidence. Diagnostic 144R were already repeatedly inspected. Historical fitting uses recorded pre-race score snapshots, not full raw replay of all older races.'};
write('comparison.json',report);write('scored-rows.json',scored);
console.log(JSON.stringify({trainingRaces:report.trainingRaces,scoreCoefficients:report.trainingScoreCoefficients,evaluationRows:report.evaluationRows,unavailable:report.unavailable.length,excluded:excluded.length,
 validation:Object.fromEntries(Object.entries(report.validation).map(([k,v])=>[k,{races:v.races,hits:v.hits,gains:v.gains,losses:v.losses,net:v.netHits}])),
 diagnostic:Object.fromEntries(Object.entries(report.diagnostic).map(([k,v])=>[k,{races:v.races,hits:v.hits,gains:v.gains,losses:v.losses,net:v.netHits}]))},null,2));
