"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const OUT=path.join(root,"data","stats","phase4-daily-cycle-gate.json");
function readText(p){return fs.readFileSync(path.join(root,p),"utf8");}
function exists(p){return fs.existsSync(path.join(root,p));}
function check(){
  const predict=readText(".github/workflows/collect-predictions.yml");
  const results=readText(".github/workflows/collect-results.yml");
  const collector=readText("scripts/collect-predictions.js");
  const stages={
    autoSelection:/selectedRaceKeyFor\(/.test(collector)&&/selection\.selected/.test(collector),
    prediction:/createPrediction\(/.test(collector),
    practicalTickets:/practicalTickets/.test(collector)&&/実戦厳選/.test(collector),
    noteDraft:/saveNote\(/.test(collector)&&/"data"\s*,\s*"notes"/.test(collector),
    scheduledPrediction:/schedule:/.test(predict)&&/collect-predictions\.js/.test(predict),
    officialResults:/collect-results\.js/.test(results)||/repair-recent-results\.js/.test(results),
    hitAndReview:/build-result-review\.js/.test(results),
    learning:/build-learning-pipeline-gate\.js/.test(results)&&/build-improvement-proposal-report\.js/.test(results),
    phase3Handoff:exists("scripts/build-phase3-learning-handoff.js")&&exists("data/stats/phase3-learning-handoff.json")
  };
  const missing=Object.entries(stages).filter(([,ok])=>!ok).map(([k])=>k);
  return{schemaVersion:1,generatedAt:new Date().toISOString(),phase:"phase4",implementationComplete:missing.length===0,productionChanged:false,stages,missing,nextStep:missing.length?"fix-missing-stage":"run-live-daily-cycle",policy:"既存の自動選定→予想→実戦厳選→note→公式結果→成績/分析→Phase3学習戻しを1日の実戦サイクルとして扱う。予想ロジック・買い目・UIは変更しない。"};
}
function main(){const r=check();fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(r,null,2)+"\n");if(!r.implementationComplete){console.error("Phase4 daily cycle wiring incomplete: "+r.missing.join(","));process.exitCode=1;}console.log(JSON.stringify(r,null,2));}
if(require.main===module)main();module.exports={check};
