"use strict";
const fs=require("node:fs");

function replaceOne(text,before,after,label){
  if(text.includes(after)) return text;
  const count=text.split(before).length-1;
  if(count!==1) throw new Error(`${label}: expected 1 marker, got ${count}`);
  return text.replace(before,after);
}
function patchLoad(text){
  let out=String(text);
  out=replaceOne(out,'"js/app-runtime-loader.js?v=20260810-official-reference1"','"js/app-runtime-loader.js?v=20260816-static-race1"','app runtime asset');
  out=replaceOne(out,'"js/home-dashboard-v2.js?v=20260803-ui-fix2"','"js/home-dashboard-v2.js?v=20260816-static-race1"','home asset');
  out=replaceOne(out,'\'const VERSION = "20260810-official-reference1"\'','\'const VERSION = "20260815-odds-immediate1"\'','app runtime internal version');
  return out;
}
function patchStats(text){
  return replaceOne(String(text),'/style\\.css\\?v=20260803-flow-missing30/','/style\\.css\\?v=20260806-results-ui-phase4-1/','result css asset');
}
function main(){
  const load='scripts/test-load-performance.js';
  const stats='scripts/test-auto-stats.js';
  fs.writeFileSync(load,patchLoad(fs.readFileSync(load,'utf8')),'utf8');
  fs.writeFileSync(stats,patchStats(fs.readFileSync(stats,'utf8')),'utf8');
  console.log('current cache test expectations aligned');
}
if(require.main===module) main();
module.exports={patchLoad,patchStats};
