// js/hiyori-runtime-loader.js
(function(){
  "use strict";
  const SCRIPT_ID="chappy-hiyori-runtime-loader";
  if(window.__CHAPPY_HIYORI_RUNTIME_LOADED__)return;
  window.__CHAPPY_HIYORI_RUNTIME_LOADED__=true;

  let corePromise=null,backgroundPromise=null,installPromise=null,compatibilityScheduled=false;
  const VERSION="20260825-mobile-startup-terminal1";
  const SCRIPT_LOAD_TIMEOUT_MS=12000,PRELOAD_LOOKAHEAD=2;
  const coreScripts=[
    "js/prediction-flow-priority.js",
    "js/prediction-st-exhibition-support.js",
    "js/prediction-venue-water-support.js",
    "js/prediction-skill-local-support.js",
    "js/prediction-motor-engine-support.js",
    "js/prediction-engine-integration.js",
    "js/prediction-simple-evaluation.js"
  ];
  const backgroundScripts=[
    "js/hiyori-event-monitor.js",
    "js/hiyori-learning-snapshot.js",
    "js/hiyori-learning-correlation.js",
    "js/hiyori-correlation-confidence.js",
    "js/hiyori-learning-adoption-candidates.js",
    "js/hiyori-adoption-proposals.js",
    "js/hiyori-proposal-approval.js"
  ];
  const scripts=[...coreScripts,...backgroundScripts];

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

  function scheduleCompatibilitySync(){
    if(compatibilityScheduled)return;
    compatibilityScheduled=true;
    const run=()=>{
      compatibilityScheduled=false;
      try{syncCompatibilityKeys()}catch(error){console.warn("[hiyori-runtime-loader] compatibility sync failed:",error?.message||error)}
    };
    if("requestIdleCallback" in window)window.requestIdleCallback(run,{timeout:8000});
    else window.setTimeout(run,2500);
  }

  function loadScript(src){
    return new Promise(resolve=>{
      const clean=src.split("?")[0];
      if([...document.scripts].some(script=>script.src&&script.src.includes(clean))){resolve();return}
      const script=document.createElement("script");
      script.src=`${clean}?v=${VERSION}`;
      script.async=false;
      script.dataset.chappyHiyoriModule=clean;
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;window.clearTimeout(timer);resolve()};
      const timer=window.setTimeout(()=>{console.warn("[hiyori-runtime-loader] load timeout:",src);script.remove();finish()},SCRIPT_LOAD_TIMEOUT_MS);
      script.onload=finish;
      script.onerror=()=>{console.warn("[hiyori-runtime-loader] load failed:",src);finish()};
      document.head.appendChild(script);
    });
  }

  function preloadScripts(list,startIndex=0,count=PRELOAD_LOOKAHEAD){
    if(typeof document.querySelectorAll!=="function")return;
    list.slice(startIndex,startIndex+Math.max(1,count)).forEach(src=>{
      const clean=src.split("?")[0];
      if([...document.scripts].some(script=>script.src&&script.src.includes(clean)))return;
      if([...document.querySelectorAll('link[rel="preload"][as="script"]')].some(link=>link.href&&link.href.includes(clean)))return;
      const link=document.createElement("link");
      link.rel="preload";
      link.as="script";
      link.href=`${clean}?v=${VERSION}`;
      document.head.appendChild(link);
    });
  }

  async function loadProgressively(list){
    for(let index=0;index<list.length;index+=1){
      preloadScripts(list,index,PRELOAD_LOOKAHEAD);
      await loadScript(list[index]);
    }
  }

  function installCore(){
    if(corePromise)return corePromise;
    corePromise=(async()=>{
      await window.ChappyPredictionRuntime?.ensureReady?.();
      await loadProgressively(coreScripts);
      scheduleCompatibilitySync();
      window.dispatchEvent(new CustomEvent("chappy:hiyori-core-ready",{detail:{connected:true,productionApplied:false,appliedToPrediction:false,globalProductionLock:true}}));
      return true;
    })();
    return corePromise;
  }

  function installBackground(){
    if(backgroundPromise)return backgroundPromise;
    backgroundPromise=(async()=>{
      await installCore();
      await loadProgressively(backgroundScripts);
      scheduleCompatibilitySync();
      window.dispatchEvent(new CustomEvent("chappy:hiyori-runtime-ready",{detail:{connected:true,productionApplied:false,appliedToPrediction:false,globalProductionLock:true,compactMode:true,lazyDiagnostics:true}}));
      return true;
    })();
    return backgroundPromise;
  }

  function install(){if(installPromise)return installPromise;installPromise=installBackground();return installPromise}

  function scheduleInstall(){
    const run=()=>install().catch(error=>console.warn("[hiyori-runtime-loader] install failed:",error));
    if("requestIdleCallback" in window)window.requestIdleCallback(run,{timeout:5000});
    else window.setTimeout(run,1500);
  }

  function ensureReady(){
    // 日和系は productionApplied:false / appliedToPrediction:false の補助系。
    // 初回AI予想と並行してcreatePredictionを差し替えない。
    // 補助一式は明示的なinstall()呼び出し時だけ準備する。
    scheduleCompatibilitySync();
    return Promise.resolve(true);
  }

  ["chappy:hiyori-snapshot-created","chappy:hiyori-learning-adoption-updated","chappy:hiyori-adoption-proposals-updated","chappy:hiyori-production-checklist-updated"].forEach(name=>window.addEventListener(name,scheduleCompatibilitySync));
  window.addEventListener("storage",event=>{if(event.key&&event.key.startsWith("chappy_hiyori_"))scheduleCompatibilitySync()});

  window.ChappyHiyoriRuntimeLoader={
    id:SCRIPT_ID,
    install,
    ensureReady,
    syncCompatibilityKeys,
    scheduleCompatibilitySync,
    scripts:scripts.slice(),
    coreScripts:coreScripts.slice(),
    backgroundScripts:backgroundScripts.slice(),
    compactMode:true,
    predictionBlocking:false
  };
})();
