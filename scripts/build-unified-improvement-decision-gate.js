"use strict";
const fs=require("node:fs"),path=require("node:path");
const phase8=require("./theory-validation-phase8-cycle.cjs");
const phase9=require("./phase9-live-improvement-cycle.cjs");
const root=path.resolve(__dirname,"..");
const stats=path.join(root,"data","stats"),OUT=path.join(stats,"unified-improvement-decision-gate.json");
const PHASE8_OUT=path.join(stats,"theory-validation-phase8-cycle.json");
const PHASE9_OUT=path.join(stats,"phase9-live-improvement-cycle.json");
const SOURCES=[
  ["frame-shadow-off","frame-rise-fall-shadow-result-report.json"],
  ["frame-negative-clip","frame-rise-fall-negative-clip-result-report.json"],
  ["four-attack-warning","race-flow-4kado-alert-skip-ab-report.json"],
  ["three-attack-warning","race-flow-3course-alert-skip-ab-report.json"],
  ["two-course-sashi","race-flow-2course-sashi-skip-ab-report.json"],
  ["outside-push","race-flow-outside-push-skip-ab-report.json"],
  ["inside-first-outside-warning","race-flow-in-first-outside-alert-skip-ab-report.json"],
  ["hold-third","remain-pickup-hold3-shadow-ab-report.json"]
];
function read(n){const p=path.join(stats,n);if(!fs.existsSync(p))return null;try{return JSON.parse(fs.readFileSync(p,"utf8"));}catch{return null;}}
function num(...v){for(const x of v){if(x===null||x===undefined||x==="")continue;const n=Number(x);if(Number.isFinite(n))return n;}return null;}
function terminalRejection(r){
  if(r?.status==="candidate-fails-futility")return r?.futility?.reason||"不可逆futility判定";
  if(r?.status==="candidate-fails-fixed-100")return "固定件数評価で不採用";
  return null;
}
function normalize(id,file,r){
  if(!r)return{id,file,status:"missing",decision:"blocked",reason:"実A/Bレポート参照失敗",automaticApplication:false,requiresUserApproval:true};
  const s=r.summary||r.comparison||r.result||r.metrics||{};
  const affected=num(r.affectedSettledCount,r.targetSettledCount,s.affectedSettledCount,s.targetSettledCount,r?.observation?.settledComparableCount,r?.cohort?.affectedSettledCount,r?.cohort?.targetSettledCount,r?.A?.affectedRaceCount,r?.a?.affectedRaceCount,0)||0;
  const min=num(r.minimumAffectedSettledCount,r.fixedComparableRaces,r?.protocol?.fixedComparableRaces,r?.interpretation?.minimumAffectedSettledCount,r?.interpretation?.minimumTargetSettledCount,r?.decisionRule?.minimumAffectedSettledCount,id==="frame-negative-clip"?100:30)||30;
  const aRec=num(s?.A?.recoveryRate,s?.a?.recoveryRate,r?.overall?.aRecoveryRate,r?.A?.recoveryRate,r?.a?.recoveryRate);
  const bRec=num(s?.B?.recoveryRate,s?.b?.recoveryRate,r?.overall?.bRecoveryRate,r?.B?.recoveryRate,r?.b?.recoveryRate);
  const aProfit=num(s?.A?.profit,s?.a?.profit,r?.overall?.aProfit,r?.A?.profit,r?.a?.profit);
  const bProfit=num(s?.B?.profit,s?.b?.profit,r?.overall?.bProfit,r?.B?.profit,r?.b?.profit);
  const productionChanged=r.productionChanged===true||r.productionAUnchanged===false;
  const rejection=terminalRejection(r);
  let decision="continue",reason=`${affected}/${min}R`;
  if(productionChanged){decision="blocked";reason="production A変更を検出";}
  else if(rejection){decision="reject";reason=rejection;}
  else if(affected>=min){
    if(bRec!=null&&aRec!=null&&bRec>aRec&&((bProfit==null||aProfit==null)||bProfit>aProfit)){decision="candidate";reason=`B回収率 ${bRec}% > A ${aRec}%`;}
    else if(bRec!=null&&aRec!=null&&bRec<=aRec){decision="reject";reason=`B回収率 ${bRec}% <= A ${aRec}%`;}
    else{decision="review";reason="必要件数到達・指標確認待ち";}
  }
  return{id,file,status:"available",affectedSettledCount:affected,minimumAffectedSettledCount:min,aRecoveryRate:aRec,bRecoveryRate:bRec,aProfit,bProfit,decision,reason,automaticApplication:false,requiresUserApproval:true};
}
function comparableReport(value){
  if(!value||typeof value!=="object")return value;
  return{...value,generatedAt:""};
}
function writeStableReport(filePath,report){
  let previous=null;
  if(fs.existsSync(filePath)){try{previous=JSON.parse(fs.readFileSync(filePath,"utf8"));}catch{previous=null;}}
  if(previous&&JSON.stringify(comparableReport(previous))===JSON.stringify(comparableReport(report)))return{changed:false,report:previous};
  fs.mkdirSync(path.dirname(filePath),{recursive:true});
  fs.writeFileSync(filePath,JSON.stringify(report,null,2)+"\n");
  return{changed:true,report};
}
function refreshLiveImprovementArtifacts(){
  const phase8Report=phase8.build();
  const phase9Report=phase9.build(phase9.load(),{phase8Report});
  if(phase8Report.phaseComplete!==true)throw new Error("phase8 live improvement cycle is incomplete");
  if(phase9Report.phaseComplete!==true)throw new Error("phase9 live improvement cycle is incomplete");
  const saved8=writeStableReport(PHASE8_OUT,phase8Report);
  const saved9=writeStableReport(PHASE9_OUT,phase9Report);
  return{
    productionChanged:false,
    phase8:{...phase8Report.summary,artifactChanged:saved8.changed,phaseComplete:true},
    phase9:{...phase9Report.summary,artifactChanged:saved9.changed,phaseComplete:true},
    audit:{duplicateRaceRecords:phase9Report.audit.duplicateRaceRecords,ambiguousMissReasons:phase9Report.audit.ambiguousMissReasons,rejectedCandidateRetest:phase9Report.audit.rejectedCandidateRetest,brokenHandoff:phase9Report.audit.brokenHandoff}
  };
}
function build(){const items=SOURCES.map(([id,f])=>normalize(id,f,read(f)));const counts=items.reduce((a,x)=>(a[x.decision]=(a[x.decision]||0)+1,a),{});return{schemaVersion:2,generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,requiresUserApproval:true,sourceCount:SOURCES.length,availableSourceCount:items.filter(x=>x.status==="available").length,allSourcesConnected:items.every(x=>x.status==="available"),policy:"必要件数到達後も自動本番反映しない。BがAの回収率と収支を改善した候補だけユーザー承認へ送る。",counts,items};}
function main(){const liveImprovement=refreshLiveImprovementArtifacts();const r={...build(),liveImprovement};fs.writeFileSync(OUT,JSON.stringify(r,null,2)+"\n");if(!r.allSourcesConnected){console.error("unified gate source connection incomplete");process.exitCode=1;}console.log(JSON.stringify(r,null,2));}
if(require.main===module)main();
module.exports={SOURCES,PHASE8_OUT,PHASE9_OUT,num,terminalRejection,normalize,comparableReport,writeStableReport,refreshLiveImprovementArtifacts,build};
