// js/hiyori-runtime-loader.js
// 日和学習・検証・承認系モジュールを既存アプリへ接続する。
// 予想ロジック・印・配点・買い目には直接書き込まない。
(function(){
  "use strict";
  const SCRIPT_ID="chappy-hiyori-runtime-loader";
  if(window.__CHAPPY_HIYORI_RUNTIME_LOADED__)return;
  window.__CHAPPY_HIYORI_RUNTIME_LOADED__=true;
  const scripts=[
    "js/prediction-flow-priority.js",
    "js/prediction-simple-evaluation.js",
    "js/hiyori-event-monitor.js",
    "js/hiyori-learning-snapshot.js",
    "js/hiyori-learning-correlation.js",
    "js/hiyori-correlation-confidence.js",
    "js/hiyori-learning-adoption-candidates.js",
    "js/hiyori-adoption-proposals.js",
    "js/hiyori-proposal-approval.js",
    "js/hiyori-shadow-validation-loader.js",
    "js/hiyori-shadow-performance-loader.js",
    "js/hiyori-production-readiness-loader.js",
    "js/hiyori-final-approval-package-loader.js",
    "js/hiyori-production-rollback.js",
    "js/hiyori-production-rollback-panel.js",
    "js/hiyori-production-checklist.js",
    "js/hiyori-production-simulator.js",
    "js/hiyori-final-presentation.js",
    "js/hiyori-final-approval-ui.js",
    "js/hiyori-runtime-diagnostics.js",
    "js/hiyori-operations-dashboard.js",
    "js/hiyori-event-health.js",
    "js/hiyori-operations-summary.js",
    "js/hiyori-operations-snapshot.js",
    "js/hiyori-operations-snapshot-compare.js",
    "js/hiyori-operations-report.js",
    "js/hiyori-operations-self-test.js"
  ];
  const styles=["css/hiyori-production-rollback.css","css/hiyori-final-approval.css"];
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function syncCompatibilityKeys(){
    const productionSnapshots=read("chappy_hiyori_production_snapshots_v1",[]);
    if(Array.isArray(productionSnapshots))write("chappy_hiyori_rollback_snapshots_v1",productionSnapshots);
    const productionChecklist=read("chappy_hiyori_production_checklist_v1",[]);
    if(Array.isArray(productionChecklist))write("chappy_hiyori_final_checklist_v1",productionChecklist.map(row=>({...row,allPassed:row.readyForPresentation===true,status:row.readyForPresentation===true?"passed":"blocked"})));
    const adoptionProposals=read("chappy_hiyori_adoption_proposals_v1",null);
    const changeProposals=read("chappy_hiyori_change_proposals_v1",null);
    if(adoptionProposals&&!changeProposals){
      const proposals=Array.isArray(adoptionProposals)?adoptionProposals:Array.isArray(adoptionProposals.proposals)?adoptionProposals.proposals:[];
      write("chappy_hiyori_change_proposals_v1",{createdAt:adoptionProposals.createdAt||new Date().toISOString(),source:"chappy_hiyori_adoption_proposals_v1",proposals});
    }
  }
  function ensureStyle(href){if([...document.styleSheets].some(sheet=>sheet.href&&sheet.href.includes(href)))return;const link=document.createElement("link");link.rel="stylesheet";link.href=href;link.dataset.chappyHiyoriStyle=href;document.head.appendChild(link)}
  function loadScript(src){return new Promise(resolve=>{if([...document.scripts].some(script=>script.src&&script.src.includes(src))){resolve();return}const script=document.createElement("script");script.src=src;script.async=false;script.dataset.chappyHiyoriModule=src;script.onload=resolve;script.onerror=()=>{console.warn("[hiyori-runtime-loader] load failed:",src);resolve()};document.head.appendChild(script)})}
  async function install(){
    syncCompatibilityKeys();styles.forEach(ensureStyle);
    for(const src of scripts){await loadScript(src);syncCompatibilityKeys()}
    window.dispatchEvent(new CustomEvent("chappy:hiyori-runtime-ready",{detail:{connected:true,productionApplied:false,appliedToPrediction:false,globalProductionLock:true}}));
    window.ChappyPredictionFlowPriority?.install?.();
    window.ChappyPredictionSimpleEvaluation?.install?.();
    window.ChappyHiyoriRuntimeDiagnostics?.run?.();
    window.ChappyHiyoriOperationsDashboard?.render?.();
    window.ChappyHiyoriEventHealth?.render?.();
    window.ChappyHiyoriOperationsSummary?.render?.();
    window.ChappyHiyoriOperationsSnapshot?.render?.();
    window.ChappyHiyoriOperationsSnapshotCompare?.render?.();
    window.ChappyHiyoriOperationsReport?.render?.();
    window.ChappyHiyoriOperationsSelfTest?.render?.();
  }
  ["chappy:hiyori-snapshot-created","chappy:hiyori-learning-adoption-updated","chappy:hiyori-adoption-proposals-updated","chappy:hiyori-production-checklist-updated"].forEach(name=>window.addEventListener(name,syncCompatibilityKeys));
  window.addEventListener("storage",event=>{if(event.key&&event.key.startsWith("chappy_hiyori_"))syncCompatibilityKeys()});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  window.ChappyHiyoriRuntimeLoader={id:SCRIPT_ID,install,syncCompatibilityKeys,scripts:scripts.slice()};
})();