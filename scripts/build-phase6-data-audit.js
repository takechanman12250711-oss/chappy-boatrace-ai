"use strict";
const fs=require("node:fs");const path=require("node:path");const audit=require("../js/phase6-data-audit");
const root=path.resolve(__dirname,"..");const predictionsDir=path.join(root,"data","predictions");const statsDir=path.join(root,"data","stats");
function load(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(e){if(e?.code==="ENOENT")return fallback;throw e;}}
function mergePredictionSources(data){
  const predictions=Array.isArray(data?.predictions)?data.predictions:[];
  const verification=Array.isArray(data?.verificationPredictions)?data.verificationPredictions:[];
  const primaryKeys=new Set(predictions.map(audit.recordKey).filter(Boolean));
  return [...predictions,...verification.filter(row=>{const key=audit.recordKey(row);return !key||!primaryKeys.has(key);})];
}
function collect(){if(!fs.existsSync(predictionsDir))return[];const rows=[];fs.readdirSync(predictionsDir).filter(n=>/^\d{8}\.json$/.test(n)).sort().forEach(n=>{rows.push(...mergePredictionSources(load(path.join(predictionsDir,n),{})));});return rows;}
function main(){const report=audit.build(collect(),{improvement:load(path.join(statsDir,"improvement-proposal-phase3.json"),{}),adoption:load(path.join(statsDir,"theory-adoption-phase5.json"),{}),pipeline:load(path.join(statsDir,"learning-pipeline-gate-phase4.json"),{})});fs.mkdirSync(statsDir,{recursive:true});fs.writeFileSync(path.join(statsDir,"phase6-data-audit.json"),JSON.stringify({generatedAt:new Date().toISOString(),...report},null,2)+"\n");console.log(`Phase6監査：${report.status}／${report.settledRaceCount}R／問題${report.issueCount}件`);}
if(require.main===module)main();module.exports={mergePredictionSources,collect};
