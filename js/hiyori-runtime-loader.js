// js/hiyori-runtime-loader.js
// 通常予想に必要な日和学習処理だけを起動時に接続する。
// 重い運用診断・レポート・自己テストはコンパクト画面から必要時だけ読み込む。
// 予想ロジック・印・配点・買い目には直接書き込まない。
(function(){
  "use strict";
  const SCRIPT_ID="chappy-hiyori-runtime-loader";
  if(window.__CHAPPY_HIYORI_RUNTIME_LOADED__)return;
  window.__CHAPPY_HIYORI_RUNTIME_LOADED__=true;

  const scripts=[
    "js/prediction-flow-priority.js",
    "js/prediction-st-exhibition-support.js",
    "js/prediction-venue-water-support.js",
    "js/prediction-skill-local-support.js",
    "js/prediction-motor-engine-support.js",
    "js/prediction-engine-integration.js",
    "js/prediction-simple-evaluation.js",
    "js/hiyori-event-monitor.js",
    "js/hiyori-learning-snapshot.js",
    "js/hiyori-learning-correlation.js",
    "js/hiyori-correlation-confidence.js",
    "js/hiyori-learning-adoption-candidates.js",
    "js/hiyori-adoption-proposals.js",
    "js/hiyori-proposal-approval.js",
    "js/hiyori-compact-dashboard.js?v=20260725-compact3"
  ];

  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function write(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
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
  function loadScript(src){return new Promise(resolve=>{
    const clean=src.split("?")[0];
    if([...document.scripts].some(script=>script.src&&script.src.includes(clean))){resolve();return}
    const script=document.createElement("script");
    script.src=src;script.async=false;script.dataset.chappyHiyoriModule=clean;
    script.onload=resolve;
    script.onerror=()=>{console.warn("[hiyori-runtime-loader] load failed:",src);resolve()};
    document.head.appendChild(script);
  })}
  async function install(){
    syncCompatibilityKeys();
    for(const src of scripts){await loadScript(src);syncCompatibilityKeys()}
    window.dispatchEvent(new CustomEvent("chappy:hiyori-runtime-ready",{detail:{connected:true,productionApplied:false,appliedToPrediction:false,globalProductionLock:true,compactMode:true,lazyDiagnostics:true}}));
    window.ChappyHiyoriCompactDashboard?.render?.();
  }
  ["chappy:hiyori-snapshot-created","chappy:hiyori-learning-adoption-updated","chappy:hiyori-adoption-proposals-updated","chappy:hiyori-production-checklist-updated"].forEach(name=>window.addEventListener(name,syncCompatibilityKeys));
  window.addEventListener("storage",event=>{if(event.key&&event.key.startsWith("chappy_hiyori_"))syncCompatibilityKeys()});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
  window.ChappyHiyoriRuntimeLoader={id:SCRIPT_ID,install,syncCompatibilityKeys,scripts:scripts.slice(),compactMode:true};
})();