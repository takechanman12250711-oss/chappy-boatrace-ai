"use strict";
const fs=require("node:fs");const path=require("node:path");const report=require("../js/theory-performance-report");
const root=path.resolve(__dirname,"..");const dir=path.join(root,"data","predictions");const out=path.join(root,"data","stats","theory-performance-report.json");
function load(p,f={}){try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch(e){if(e?.code==="ENOENT")return f;throw e;}}
function collect(){if(!fs.existsSync(dir))return[];const rows=[];fs.readdirSync(dir).filter(n=>/^\d{8}\.json$/.test(n)).sort().forEach(n=>{const d=load(path.join(dir,n),{});rows.push(...(Array.isArray(d.predictions)?d.predictions:[]),...(Array.isArray(d.verificationPredictions)?d.verificationPredictions:[]));});return rows;}
function main(){const built={generatedAt:new Date().toISOString(),source:"data/predictions/*.json",...report.build(collect())};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(built,null,2)+"\n");console.log(`理論別成績：${built.byTheory.length}理論／${built.sampleCount}件`);}
if(require.main===module)main();module.exports={collect};
