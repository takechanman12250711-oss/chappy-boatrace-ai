"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),dir=path.join(root,"data","predictions");
const daily=/^\d{8}\.json$/;
const counts={records:0,settled:0,shadowMissing:0,referenceMissing:0,referenceRecordKeyNotFound:0,referenceCapturedAtMismatch:0,referenceCohortMismatch:0,referenceEvaluatorMismatch:0,selectionScoreMismatch:0,completeFalse:0,calibrationEligibleFalse:0,statusNotReady:0,ready:0};
const examples={}; const add=(k,v)=>{(examples[k]??=[]);if(examples[k].length<3)examples[k].push(v)};
const score=s=>Number(s?.evaluation?.totalScore);
for(const file of fs.existsSync(dir)?fs.readdirSync(dir).filter(x=>daily.test(x)).sort():[]){
 const doc=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8")); const shadows=Array.isArray(doc.shadowV2Predictions)?doc.shadowV2Predictions:[];
 const byKey=new Map(shadows.map(s=>[String(s?.recordKey||""),s]));
 for(const r of [...(Array.isArray(doc.predictions)?doc.predictions:[]),...(Array.isArray(doc.verificationPredictions)?doc.verificationPredictions:[])]){
  counts.records++; if(r?.result?.settled!==true)continue; counts.settled++;
  const rk=String(r?.raceKey||""); const ref=r?.shadowV2Reference||null; let s=r?.shadowV2||null;
  if(!s&&!ref){counts.referenceMissing++;add("referenceMissing",rk);continue}
  if(!s&&ref){
   s=byKey.get(String(ref.recordKey||""))||null;
   if(!s){counts.referenceRecordKeyNotFound++;add("referenceRecordKeyNotFound",rk);continue}
   if(ref.capturedAt&&String(s.capturedAt||"")!==String(ref.capturedAt)){counts.referenceCapturedAtMismatch++;add("referenceCapturedAtMismatch",rk);continue}
   if(ref.cohortKey&&String(s.cohortKey||"")!==String(ref.cohortKey)){counts.referenceCohortMismatch++;add("referenceCohortMismatch",rk);continue}
   if(ref.evaluatorVersion&&String(s.evaluatorVersion||"")!==String(ref.evaluatorVersion)){counts.referenceEvaluatorMismatch++;add("referenceEvaluatorMismatch",rk);continue}
   const a=Number(r?.selection?.score),b=score(s); if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>=1e-6){counts.selectionScoreMismatch++;add("selectionScoreMismatch",rk);continue}
  }
  if(!s){counts.shadowMissing++;add("shadowMissing",rk);continue}
  if(s.complete!==true){counts.completeFalse++;add("completeFalse",rk);continue}
  if(s.calibrationEligible!==true){counts.calibrationEligibleFalse++;add("calibrationEligibleFalse",rk);continue}
  if(String(s.status||"").trim().toLowerCase()!=="ready"){counts.statusNotReady++;add("statusNotReady",rk);continue}
  counts.ready++;
 }
}
const out={schemaVersion:1,generatedAt:new Date().toISOString(),productionChanged:false,counts,examples};
process.stdout.write(JSON.stringify(out,null,2)+"\n");
