"use strict";

const fs = require("node:fs");
const path = require("node:path");
const base = require("./build-local-water-result-breakdown");
const cohort = require("./build-local-water-strong-condition-cohort");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "data", "stats", "local-water-outside-head-miss-structure.json");

function arr(v){ return Array.isArray(v) ? v : []; }
function key(r={}){ return `${r.date}-${String(r.jcd||"").padStart(2,"0")}-${Number(r.raceNo||0)}`; }
function load(dir){
  if(!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort()
    .map(n=>JSON.parse(fs.readFileSync(path.join(dir,n),"utf8")));
}
function predictionRows(docs){
  const map = new Map();
  for(const doc of docs) for(const name of ["predictions","verificationPredictions"]){
    for(const row of arr(doc[name])){
      const k = key(row);
      if(name === "predictions" || !map.has(k)) map.set(k,row);
    }
  }
  return [...map.values()];
}
function resultMap(docs){
  const map = new Map();
  for(const doc of docs) for(const race of arr(doc.races)){
    if(race?.resultAvailable === true && race?.status === "finished") map.set(key(race), race);
  }
  return map;
}
function summarize(rows){
  const out = {
    settledCount:0,
    actualOutsideHeadCount:0,
    actualOutsideHeadPredictedInsideCount:0,
    actualOutsideHeadPredictedOutsideWrongCount:0,
    actualOutsideHeadPredictedCorrectCount:0,
    predictedInsideCount:0,
    predictedOutsideCount:0,
    predictedHeadCounts:{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0},
    actualHeadCounts:{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0}
  };
  for(const row of rows){
    const actual = base.actualHead(row.result), predicted = base.predictedHead(row.record);
    if(!actual || !predicted) continue;
    out.settledCount++;
    out.actualHeadCounts[String(actual)]++;
    out.predictedHeadCounts[String(predicted)]++;
    if(predicted === 1) out.predictedInsideCount++; else out.predictedOutsideCount++;
    if(actual !== 1){
      out.actualOutsideHeadCount++;
      if(predicted === actual) out.actualOutsideHeadPredictedCorrectCount++;
      else if(predicted === 1) out.actualOutsideHeadPredictedInsideCount++;
      else out.actualOutsideHeadPredictedOutsideWrongCount++;
    }
  }
  const pct = (n,d) => d ? Math.round(n/d*1000)/10 : null;
  return {
    ...out,
    actualOutsideHeadRate:pct(out.actualOutsideHeadCount,out.settledCount),
    predictedInsideRate:pct(out.predictedInsideCount,out.settledCount),
    predictedOutsideRate:pct(out.predictedOutsideCount,out.settledCount),
    outsideHeadCorrectRate:pct(out.actualOutsideHeadPredictedCorrectCount,out.actualOutsideHeadCount),
    outsideHeadMissByInsideRate:pct(out.actualOutsideHeadPredictedInsideCount,out.actualOutsideHeadCount),
    outsideHeadMissByWrongOutsideRate:pct(out.actualOutsideHeadPredictedOutsideWrongCount,out.actualOutsideHeadCount)
  };
}
function decision(summaries){
  const calm = summaries.calm, strong = summaries.strong;
  if(!strong || strong.settledCount < 30) return {
    status:"continue-collecting-evidence",
    reason:"strong-condition sample is below 30 races"
  };
  const insideGap = Math.round(((strong.outsideHeadMissByInsideRate ?? 0) - (calm.outsideHeadMissByInsideRate ?? 0))*10)/10;
  const wrongOutsideGap = Math.round(((strong.outsideHeadMissByWrongOutsideRate ?? 0) - (calm.outsideHeadMissByWrongOutsideRate ?? 0))*10)/10;
  if(insideGap >= 10 && insideGap > wrongOutsideGap) return {
    status:"eligible-for-inside-resilience-shadow-ab-design",
    insideMissGapVsCalm:insideGap,
    wrongOutsideMissGapVsCalm:wrongOutsideGap
  };
  if(wrongOutsideGap >= 10 && wrongOutsideGap > insideGap) return {
    status:"eligible-for-outside-attacker-selection-shadow-ab-design",
    insideMissGapVsCalm:insideGap,
    wrongOutsideMissGapVsCalm:wrongOutsideGap
  };
  return {
    status:"no-shadow-ab-signal",
    insideMissGapVsCalm:insideGap,
    wrongOutsideMissGapVsCalm:wrongOutsideGap
  };
}
function build(predDocs,resultDocs){
  const results = resultMap(resultDocs);
  const rows = predictionRows(predDocs)
    .map(record=>({record,evidence:base.evidence(record),result:results.get(key(record))||null}))
    .filter(row=>row.evidence.formal && row.result && base.actualHead(row.result) && base.predictedHead(row.record));
  const groups = {calm:[],medium:[],strong:[]};
  for(const row of rows) groups[cohort.classify(row.evidence)].push(row);
  const summaries = Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,summarize(v)]));
  return {
    schemaVersion:2,
    version:"local-water-outside-head-miss-structure-v2",
    generatedAt:new Date().toISOString(),
    productionChanged:false,
    automaticApplication:false,
    usableForPrediction:false,
    methodology:"締切前保存済み正式証拠だけを使い、平穏/中条件/強条件ごとに、外頭発生時の外し方を『1号艇予測』『別の外艇予測』『外頭正解』へ分解する。強条件30R以上かつ平穏比+10pt以上の主要ミスだけを次のshadow A/B候補にする。",
    settledFormalEvidenceRaceCount:rows.length,
    summaries,
    nextStep:decision(summaries)
  };
}
function main(){
  const report = build(load(path.join(root,"data","predictions")), load(path.join(root,"data","results")));
  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT, JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
}
if(require.main===module) main();
module.exports={summarize,decision,build};
