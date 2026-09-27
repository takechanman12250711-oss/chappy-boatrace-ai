'use strict';
// Read-only replay driver: outcome data never enters the worker input file.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const contract=require('./analysis-input-contract'),hit=require('./build-hit-first-practical-report.cjs');
const cohort=require('./open-partner-frozen-cohort.json');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputFile=path.resolve(process.argv[2]||''),dir=path.resolve(process.argv[3]||'/tmp/open-partner-evidence');
fs.mkdirSync(dir,{recursive:true});
let data,bytes;
if(fs.statSync(inputFile).isDirectory()){
 const loaded=require('./eight-ticket-promotion-report-source.cjs').load(inputFile,'20260924');
 if(loaded.diagnostics.errors.length)throw Error('Source integrity errors');
 const results={};for(const date of ['20260924','20260925','20260926','20260927']){const f=path.join(inputFile,'data/results',date+'.json');if(fs.existsSync(f))results[date]=JSON.parse(fs.readFileSync(f,'utf8'));}
 data={referenceCommit:'6fb160175071b3e354ac45073662362bf5b5e153',records:loaded.records.filter(r=>String(r.date)<='20260927'),results,diagnostics:loaded.diagnostics};
 bytes=Buffer.from(JSON.stringify(data));fs.writeFileSync(path.join(dir,'stored-inputs.json.gz'),zlib.gzipSync(bytes));
}else{bytes=zlib.gunzipSync(fs.readFileSync(inputFile));data=JSON.parse(bytes);}
const records=data.records;if(!Array.isArray(records)||!records.length)throw Error('No source records');
const inputs=records.map(r=>{
 const error=contract.preDeadlineReason(r);if(error)throw Error(r.raceKey+': '+error);
 const p=r.prediction,c=p.preRaceConditions,e=c.escapeEvaluationEvidence;
 if(!Array.isArray(e?.entries)||e.entries.length!==6)throw Error(r.raceKey+': full original entries absent');
 const input=Object.fromEntries(['entries','beforeInfo','startExhibition','raceInfo','historyContext','datasetVersion'].map(k=>[k,e[k]]));
 Object.assign(input,{date:r.date,jcd:r.jcd,raceNo:r.raceNo,deadlineAt:r.deadlineAt,stadiumCode:r.jcd,stadiumName:r.place,
   weather:c.weather,analysisProfile:c.analysisProfile,newEngineMode:c.newEngineMode,fetchedAt:c.sourceFetchedAt});
 return {raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,input,savedPractical:p.practicalTickets,
   savedScenario:p.verificationEvidence.mainScenario,savedSelectionStatus:p.practicalSelection.status};
});
fs.writeFileSync(path.join(dir,'pre-race-inputs.json'),JSON.stringify(inputs));
const policy={version:'open-partner-replay-scope-v1',referenceCommit:data.referenceCommit,sourceSha256:hash(bytes),
 selectionInputSha256:hash(fs.readFileSync(path.join(dir,'pre-race-inputs.json'))),conditions:['baseline','gate-only','prototype'],
 primary:'exact-trifecta-hit-net-gain',secondary:'equal-100-yen-return-separate',
 scopeGuard:'Retain baseline on proposed count/head/scenario/purchase-status mismatch; keep all races in denominator',
 noProductionWrites:true,automaticApplication:false,alreadyUsedResearchCohort:true};
fs.writeFileSync(path.join(dir,'replay-policy.json'),JSON.stringify(policy,null,2));
const predictions={};
for(const mode of policy.conditions){
 const result=spawnSync(process.execPath,[path.join(__dirname,'replay-open-partner-worker.cjs'),mode],
   {env:{...process.env,OPEN_PARTNER_WORKDIR:dir},encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
 fs.writeFileSync(path.join(dir,'replay-'+mode+'.log'),(result.stdout||'')+(result.stderr||''));
 if(result.status!==0)throw Error(mode+' replay failed: '+result.stderr);
 predictions[mode]=JSON.parse(fs.readFileSync(path.join(dir,'replay-'+mode+'.json')));
}
const official=new Map();for(const [date,d]of Object.entries(data.results))for(const r of d.races||[]){
 if(contract.isOfficialResultSource(r)&&r.resultAvailable===true)official.set(contract.raceKey(r,date),r);
}
const side=Object.fromEntries(policy.conditions.map(m=>[m,new Map(predictions[m].rows.map(r=>[r.raceKey,r]))]));
const rows=[],excluded=[];
for(const b of predictions.baseline.rows){
 if(!b.baselineExactMatch||b.error||b.scopeGuardReasons.length)throw Error('Baseline mismatch: '+b.raceKey);
 const result=official.get(b.raceKey),actual=contract.actualTicket(result),payout=result?.trifecta?.payout;
 const reason=!result?'missing-official-result':result.void?'void':!actual?'invalid-result':!Number.isSafeInteger(payout)||payout<0?'invalid-payout':null;
 if(reason){excluded.push({raceKey:b.raceKey,reason});continue;}
 const refund=Boolean(result.refund||result.refunded||result.refunds?.length||result.starts?.some(s=>s.falseStart||s.lateStart));
 const row={raceKey:b.raceKey,date:b.date,place:result.place,actual,payout,refund,base:b.saved};
 for(const mode of ['gate-only','prototype']){const v=side[mode].get(b.raceKey);if(v.error)throw Error(mode+': '+v.error);row[mode]=v.effective;row[mode+'Guard']=v.scopeGuardReasons;}
 rows.push(row);
}
function group(a){return Object.fromEntries(['gate-only','prototype'].map(m=>[m,{...hit.compare(a.map(r=>({...r,candidate:r[m]}))),guarded:a.filter(r=>r[m+'Guard'].length).length,
 netDetails:a.filter(r=>r.base.includes(r.actual)!==r[m].includes(r.actual)).map(r=>({raceKey:r.raceKey,place:r.place,actual:r.actual,payout:r.payout,
 outcome:r[m].includes(r.actual)?'gain':'loss',removed:r.base.filter(t=>!r[m].includes(t)),added:r[m].filter(t=>!r.base.includes(t))}))}]))}
const keys=new Set(cohort.raceKeys),frozen=rows.filter(r=>keys.has(r.raceKey));
if(frozen.length!==100||hit.summary(frozen).hits!==cohort.expectedBaselineHits)throw Error('Frozen reference mismatch');
const report={policy,generatedAt:new Date().toISOString(),allReplayed:inputs.length,baselineExactMatches:predictions.baseline.rows.filter(r=>r.baselineExactMatch).length,
 productionChanged:false,adoptionStatus:'NOT_APPROVED',automaticApplication:false,excluded,refundRows:rows.filter(r=>r.refund).map(r=>r.raceKey),
 frozen100:group(frozen),allValid:group(rows),noRefunds:group(rows.filter(r=>!r.refund)),byDate:Object.fromEntries([...new Set(rows.map(r=>r.date))].map(d=>[d,group(rows.filter(r=>r.date===d))])),
 limitation:'frozen100/allValid legacy monetary totals ignore refunds and are not refund-adjusted settlement. Use noRefunds for monetary comparisons. Samples overlap and are not independent holdouts.',rows};
fs.writeFileSync(path.join(dir,'comparison-results.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(dir,'official-results.json'),JSON.stringify(data.results));
console.log(JSON.stringify({allReplayed:report.allReplayed,baselineExactMatches:report.baselineExactMatches,refundRaces:report.refundRows.length,
 frozen100:Object.fromEntries(Object.entries(report.frozen100).map(([k,v])=>[k,v.primary])),
 noRefunds:Object.fromEntries(Object.entries(report.noRefunds).map(([k,v])=>[k,{...v.primary,guarded:v.guarded}]))},null,2));
