"use strict";
const path=require("node:path");
const build=require("./build-improvement-review");
const review=require("../js/improvement-review");
const calibration=require("../js/prediction-calibration");
const practicalSelection=require("../js/practical-selection");
const charter=require("../config/chappy-charter.json");

const root=path.resolve(__dirname,"..");
const dir=path.join(root,"data","predictions");
const timestamp=value=>Date.parse(value?.capturedAt||value?.selectedAt||"")||0;
const collected=build.collectPredictionRecords(dir);
const latestSelectorSnapshot=collected.shadowSnapshots
 .filter(snapshot=>String(snapshot?.cohortKey||""))
 .sort((a,b)=>timestamp(b)-timestamp(a))[0]||null;
const activePredictionGenerationKey=calibration.generationKey(calibration.normalizeGeneration(calibration.DEFAULT_GENERATION));
const activeSelectorCohortKey=String(latestSelectorSnapshot?.cohortKey||"");
const activeTheorySetFingerprint=String(practicalSelection.THEORY_SET_FINGERPRINT||"");
const activeSelectionThreshold=Number(charter?.shadowSelectionV2?.selectionThreshold);
const activeGenerationKey=review.reviewGenerationKey(activePredictionGenerationKey,activeSelectorCohortKey,activeTheorySetFingerprint,activeSelectionThreshold);
const active=review.collectSamples(collected.records,{
 activeGeneration:calibration.DEFAULT_GENERATION,
 activeSelectorCohortKey,
 activeTheorySetFingerprint,
 activeSelectionThreshold
});

const counts={
 records:collected.records.length,
 settled:0,
 attachedShadowV2:0,
 currentSelectorCohort:0,
 currentSelectorCohortSettled:0,
 currentSelectorCohortReady:0,
 eligibleBeforeActiveGenerationFilter:0,
 activeGenerationEligibleBeforeDedupe:0,
 activeSelected:active.samples.length,
 activeShadow:active.shadowSamples.length
};
const currentCohortAssessmentReasons={};
const generationBreakdown={};
const mismatchDimensions={predictionGeneration:0,selectorCohort:0,theorySet:0,selectionThreshold:0};
const examples={};
const addExample=(key,raceKey)=>{if(!raceKey)return;(examples[key]??=[]);if(examples[key].length<3&&!examples[key].includes(raceKey))examples[key].push(raceKey);};
const settledOf=record=>Boolean(record?.result?.settled===true||record?.officialResult?.settled===true);

for(const record of collected.records){
 const raceKey=String(record?.raceKey||"");
 const settled=settledOf(record);
 if(settled)counts.settled++;
 if(record?.shadowV2)counts.attachedShadowV2++;
 const currentCohort=String(record?.shadowV2?.cohortKey||"")===activeSelectorCohortKey&&Boolean(activeSelectorCohortKey);
 if(currentCohort){
  counts.currentSelectorCohort++;
  if(settled)counts.currentSelectorCohortSettled++;
  if(record?.shadowV2?.complete===true&&record?.shadowV2?.calibrationEligible===true&&String(record?.shadowV2?.status||"").trim().toLowerCase()==="ready")counts.currentSelectorCohortReady++;
 }
 const assessment=review.assessReviewRecord(record);
 if(currentCohort){
  const reason=assessment.eligible?"eligibleBeforeActiveGenerationFilter":String(assessment.reason||"unknown");
  currentCohortAssessmentReasons[reason]=(currentCohortAssessmentReasons[reason]||0)+1;
  if(!assessment.eligible)addExample(`currentCohort:${reason}`,raceKey);
 }
 if(!assessment.eligible)continue;
 counts.eligibleBeforeActiveGenerationFilter++;
 const sample=assessment.sample;
 const key=String(sample?.generationKey||"UNKNOWN");
 generationBreakdown[key]=(generationBreakdown[key]||0)+1;
 const predictionMatch=String(sample?.predictionGenerationKey||"")===activePredictionGenerationKey;
 const selectorMatch=String(sample?.selectorCohortKey||"")===activeSelectorCohortKey;
 const theoryMatch=String(sample?.theorySetFingerprint||"")===activeTheorySetFingerprint;
 const thresholdMatch=Number(sample?.selectionThreshold)===activeSelectionThreshold;
 if(!predictionMatch)mismatchDimensions.predictionGeneration++;
 if(!selectorMatch)mismatchDimensions.selectorCohort++;
 if(!theoryMatch)mismatchDimensions.theorySet++;
 if(!thresholdMatch)mismatchDimensions.selectionThreshold++;
 if(predictionMatch&&selectorMatch&&theoryMatch&&thresholdMatch)counts.activeGenerationEligibleBeforeDedupe++;
 else addExample("nonActiveGeneration",raceKey);
}

const out={
 schemaVersion:2,
 generatedAt:new Date().toISOString(),
 productionChanged:false,
 active:{
  predictionGenerationKey:activePredictionGenerationKey,
  selectorCohortKey:activeSelectorCohortKey,
  theorySetFingerprint:activeTheorySetFingerprint,
  selectionThreshold:Number.isFinite(activeSelectionThreshold)?activeSelectionThreshold:null,
  generationKey:activeGenerationKey
 },
 counts,
 currentCohortAssessmentReasons,
 mismatchDimensions,
 generationBreakdown,
 review:{
  exclusions:active.exclusions,
  selectedCount:active.samples.length,
  shadowCount:active.shadowSamples.length
 },
 examples
};
process.stdout.write(JSON.stringify(out,null,2)+"\n");
