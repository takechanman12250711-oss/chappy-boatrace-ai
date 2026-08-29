"use strict";
const fs=require("node:fs"); const path=require("node:path");
const root=path.resolve(__dirname,"..");
const IN=path.join(root,"data","stats","local-water-outside-head-miss-structure.json");
const OUT=path.join(root,"data","stats","outer-head-coverage-audit.json");
function build(report){
  const summaries=report?.summaries||{}; let settled=0, actual56=0, predicted56=0;
  for(const s of Object.values(summaries)){
    settled+=Number(s?.settledCount||0);
    actual56+=Number(s?.actualHeadCounts?.["5"]||0)+Number(s?.actualHeadCounts?.["6"]||0);
    predicted56+=Number(s?.predictedHeadCounts?.["5"]||0)+Number(s?.predictedHeadCounts?.["6"]||0);
  }
  const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
  return {schemaVersion:1,version:"outer-head-coverage-audit-v1",generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,usableForPrediction:false,settledCount:settled,actualHead56Count:actual56,actualHead56Rate:pct(actual56,settled),predictedHead56Count:predicted56,predictedHead56Rate:pct(predicted56,settled),coverageGapPt:settled?Math.round((pct(predicted56,settled)-pct(actual56,settled))*10)/10:null,nextStep:(settled>=100&&actual56/Math.max(1,settled)>=0.05&&predicted56===0)?"audit-where-5-6-head-candidates-drop":"no-structural-signal"};
}
function main(){const report=JSON.parse(fs.readFileSync(IN,"utf8")); const out=build(report); fs.writeFileSync(OUT,JSON.stringify(out,null,2)+"\n"); console.log(JSON.stringify(out,null,2));}
if(require.main===module)main(); module.exports={build};
