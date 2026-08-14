"use strict";
const fs=require("node:fs");const path=require("node:path");const audit=require("../js/phase6-data-audit");const improvementInput=require("./build-improvement-proposal-report");
const root=path.resolve(__dirname,"..");const statsDir=path.join(root,"data","stats");
function load(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(e){if(e?.code==="ENOENT")return fallback;throw e;}}
function mergePredictionSources(data){
  const predictions=Array.isArray(data?.predictions)?data.predictions:[];
  const verification=Array.isArray(data?.verificationPredictions)?data.verificationPredictions:[];
  const primaryKeys=new Set(predictions.map(audit.recordKey).filter(Boolean));
  return [...predictions,...verification.filter(row=>{const key=audit.recordKey(row);return !key||!primaryKeys.has(key);})];
}
function collectAnalysis(options={}){return improvementInput.collectAnalysis(options);}
function collect(options={}){return collectAnalysis(options).records;}
function main(){const collected=collectAnalysis();const report=audit.build(collected.records,{improvement:load(path.join(statsDir,"improvement-proposal-phase3.json"),{}),adoption:load(path.join(statsDir,"theory-adoption-phase5.json"),{}),pipeline:load(path.join(statsDir,"learning-pipeline-gate-phase4.json"),{})});fs.mkdirSync(statsDir,{recursive:true});fs.writeFileSync(path.join(statsDir,"phase6-data-audit.json"),JSON.stringify({generatedAt:new Date().toISOString(),source:"data/predictions/YYYYMMDD.json + data/results/YYYYMMDD.json",analysisInputContract:improvementInput.ANALYSIS_INPUT_CONTRACT,deduplication:"predictions-preferred-over-verificationPredictions",analysisInputDiagnostics:collected.diagnostics,...report},null,2)+"\n");console.log(`Phase6監査：${report.status}／${report.settledRaceCount}R／問題${report.issueCount}件`);}
if(require.main===module)main();module.exports={mergePredictionSources,collectAnalysis,collect};
