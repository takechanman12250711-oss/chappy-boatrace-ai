"use strict";
const fs=require("node:fs");const path=require("node:path");const phase7=require("../js/theory-evidence-coverage-phase7");
const root=path.resolve(__dirname,"..");const statsDir=path.join(root,"data","stats");
function load(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,"utf8"));}catch(e){if(e?.code==="ENOENT")return fallback;throw e;}}
function main(){const perf=load(path.join(statsDir,"theory-performance-report.json"),{});const report={generatedAt:new Date().toISOString(),source:"theory-performance-report.json",...phase7.build(perf)};fs.mkdirSync(statsDir,{recursive:true});fs.writeFileSync(path.join(statsDir,"theory-evidence-coverage-phase7.json"),JSON.stringify(report,null,2)+"\n");console.log(`Phase7理論証拠監査：${report.theoryCount}理論／証拠不足${report.missingEvidenceCount}／次 ${report.nextTheoryToInstrument||"なし"}`);}
if(require.main===module)main();module.exports={main};
