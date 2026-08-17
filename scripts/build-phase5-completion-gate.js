"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const stats=path.join(root,"data","stats");
const OUT=path.join(stats,"phase5-completion-gate.json");
function exists(p){return fs.existsSync(path.join(root,p));}
function read(p,fallback={}){try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch(e){if(e?.code==="ENOENT")return fallback;throw e;}}
function build(){
  const adoption=read("data/stats/theory-adoption-phase5.json");
  const review=read("data/stats/theory-adoption-review-report.json");
  const approval=read("data/stats/theory-adoption-approval-status.json");
  const stages={
    evaluation:exists("js/theory-adoption-phase5.js")&&exists("scripts/build-theory-adoption-phase5.js")&&Number(adoption.theoryCount)>0,
    review:exists("data/stats/theory-adoption-review-report.json")&&typeof review.productionCandidate==="boolean",
    explicitApproval:exists("js/theory-adoption-approval.js")&&exists("scripts/build-theory-adoption-approval-status.js")&&exists("data/config/theory-adoption-approval.json")&&typeof approval.adoptionAllowed==="boolean",
    rollout:exists("js/theory-adoption-rollout.js")&&exists("data/config/theory-adoption-rollout.json"),
    monitor:exists("js/theory-adoption-monitor.js")&&exists("scripts/build-theory-adoption-monitor.js")
  };
  const missing=Object.entries(stages).filter(([,v])=>!v).map(([k])=>k);
  const implementationComplete=missing.length===0;
  const productionCandidateReady=review.productionCandidate===true;
  const humanApproved=approval.humanApproved===true;
  const adoptionAllowed=productionCandidateReady&&humanApproved&&approval.adoptionAllowed===true&&approval.fingerprintMatches===true;
  const failClosedOk=!productionCandidateReady ? approval.adoptionAllowed===false&&approval.automaticApplication===false&&approval.usableForPrediction===false : true;
  return{schemaVersion:1,generatedAt:new Date().toISOString(),phase:"phase5",implementationComplete,stages,missing,productionCandidateReady,humanApprovalRequired:true,humanApproved,adoptionAllowed,failClosedOk,productionChanged:false,automaticApplication:false,currentDecision:adoptionAllowed?"approved-for-staged-rollout":productionCandidateReady?"await-human-approval":"collect-evidence",nextStep:implementationComplete?(adoptionAllowed?"staged-rollout":productionCandidateReady?"await-human-approval":"collect-evidence"):"fix-missing-stage",summary:{theoryCount:Number(adoption.theoryCount||0),candidate:Number(adoption.summary?.candidate||0),hold:Number(adoption.summary?.hold||0),reject:Number(adoption.summary?.reject||0),comparableCount:Number(review.summary?.comparableCount||0),aWins:Number(review.summary?.aWins||0),bWins:Number(review.summary?.bWins||0)},policy:"Phase5は評価→候補→明示承認→段階rollout→監視を完成条件とする。候補未成立は実装未完了ではない。明示承認とfingerprint一致前は本番適用を禁止する。"};
}
function main(){const r=build();fs.mkdirSync(stats,{recursive:true});fs.writeFileSync(OUT,JSON.stringify(r,null,2)+"\n");console.log(JSON.stringify(r,null,2));if(!r.implementationComplete||!r.failClosedOk)process.exitCode=1;}
if(require.main===module)main();module.exports={build};
