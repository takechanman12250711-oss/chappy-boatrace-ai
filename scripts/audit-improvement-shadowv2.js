"use strict";
const path=require("node:path");
const builder=require("./build-improvement-review.js");
const review=require("../js/improvement-review");
const calibration=require("../js/prediction-calibration");
const practicalSelection=require("../js/practical-selection");
const charter=require("../config/chappy-charter.json");

const root=path.resolve(__dirname,"..");
const dir=path.join(root,"data","predictions");
const collected=builder.collectPredictionRecords(dir);
const ts=value=>Date.parse(value?.capturedAt||value?.selectedAt||"")||0;
const latestSelectorSnapshot=collected.shadowSnapshots
  .filter(snapshot=>String(snapshot?.cohortKey||""))
  .sort((a,b)=>ts(b)-ts(a))[0]||null;
const options={
  activeGeneration:calibration.DEFAULT_GENERATION,
  activeSelectorCohortKey:String(latestSelectorSnapshot?.cohortKey||""),
  activeTheorySetFingerprint:String(practicalSelection.THEORY_SET_FINGERPRINT||""),
  activeSelectionThreshold:Number(charter?.shadowSelectionV2?.selectionThreshold)
};
const official=review.collectSamples(collected.records,options);

function evidenceOf(record){
  const prediction=record?.prediction||{};
  return prediction.verificationEvidence||prediction.practicalSelection?.verificationEvidence||null;
}
function rawGenerationKey(record){
  const evidence=evidenceOf(record);
  const generation=calibration.normalizeGeneration?.(evidence?.generation)||{};
  const predictionGenerationKey=calibration.generationKey?.(generation)||"";
  const selectorCohortKey=String(record?.shadowV2?.cohortKey||record?.shadowV2Reference?.cohortKey||"");
  const theorySetFingerprint=String(evidence?.theorySetFingerprint||"");
  const threshold=Number(record?.selection?.threshold);
  return predictionGenerationKey&&selectorCohortKey&&theorySetFingerprint&&Number.isFinite(threshold)
    ? review.reviewGenerationKey(predictionGenerationKey,selectorCohortKey,theorySetFingerprint,threshold)
    : "";
}
function bump(map,key,record,assessment){
  if(!key)return;
  const row=map.get(key)||{count:0,settled:0,notSettled:0,selected:0,shadow:0,shadowAttached:0,shadowReady:0,eligibleBeforeActiveGate:0,reasons:{},latestAt:""};
  row.count++;
  const settled=record?.result?.settled===true;
  if(settled)row.settled++; else row.notSettled++;
  if(String(record?.verificationMode||"").toLowerCase()==="selected")row.selected++; else row.shadow++;
  if(record?.shadowV2)row.shadowAttached++;
  if(record?.shadowV2?.complete===true&&record?.shadowV2?.calibrationEligible===true&&String(record?.shadowV2?.status||"").toLowerCase()==="ready")row.shadowReady++;
  if(assessment?.eligible===true)row.eligibleBeforeActiveGate++;
  else if(assessment?.reason)row.reasons[assessment.reason]=(row.reasons[assessment.reason]||0)+1;
  const at=String(record?.selectedAt||record?.capturedAt||record?.deadlineAt||record?.result?.settledAt||"");
  if(Date.parse(at||"")>Date.parse(row.latestAt||""))row.latestAt=at;
  map.set(key,row);
}

const byKey=new Map();
for(const record of collected.records){
  const assessment=review.assessReviewRecord(record);
  bump(byKey,rawGenerationKey(record),record,assessment);
}
const activeRaw=byKey.get(official.activeGenerationKey)||{count:0,settled:0,notSettled:0,selected:0,shadow:0,shadowAttached:0,shadowReady:0,eligibleBeforeActiveGate:0,reasons:{},latestAt:""};
const structurallyEligibleByGeneration={};
for(const record of collected.records){
  const assessment=review.assessReviewRecord(record);
  if(!assessment.eligible)continue;
  const key=assessment.sample.generationKey;
  const row=structurallyEligibleByGeneration[key]||{count:0,selected:0,shadow:0};
  row.count++;
  if(assessment.sample.selected)row.selected++; else row.shadow++;
  structurallyEligibleByGeneration[key]=row;
}
const latestCohortSnapshots=collected.shadowSnapshots.filter(s=>String(s?.cohortKey||"")===official.activeSelectorCohortKey);
const out={
  schemaVersion:2,
  generatedAt:new Date().toISOString(),
  productionChanged:false,
  latestSelectorSnapshot:{
    recordKey:String(latestSelectorSnapshot?.recordKey||""),
    raceKey:String(latestSelectorSnapshot?.raceKey||""),
    capturedAt:String(latestSelectorSnapshot?.capturedAt||""),
    cohortKey:String(latestSelectorSnapshot?.cohortKey||""),
    evaluatorVersion:String(latestSelectorSnapshot?.evaluatorVersion||""),
    sameCohortSnapshotCount:latestCohortSnapshots.length
  },
  official:{
    sourceCount:official.sourceCount,
    activePredictionGenerationKey:official.activePredictionGenerationKey,
    activeSelectorCohortKey:official.activeSelectorCohortKey,
    activeTheorySetFingerprint:official.activeTheorySetFingerprint,
    activeSelectionThreshold:official.activeSelectionThreshold,
    activeGenerationKey:official.activeGenerationKey,
    selectedEligible:official.samples.length,
    shadowEligible:official.shadowSamples.length,
    exclusions:official.exclusions
  },
  activeRaw,
  structurallyEligibleByGeneration,
  topRawGenerationKeys:[...byKey.entries()].sort((a,b)=>b[1].count-a[1].count).slice(0,10).map(([key,value])=>({key,...value}))
};
process.stdout.write(JSON.stringify(out,null,2)+"\n");
