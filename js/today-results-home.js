(function(root){
  "use strict";
  if(root.ChappyTodayResultsHome)return;
  const LOAD_TIMEOUT_MS=15000;
  let loadPromise=null;

  function load(){
    if(root.ChappyRaceFlowResultPanel)return Promise.resolve(root.ChappyRaceFlowResultPanel);
    if(loadPromise)return loadPromise;
    loadPromise=new Promise((resolve,reject)=>{
      let settled=false;
      let timer=0;
      let existing=document.querySelector('script[data-race-flow-result]');
      if(existing?.dataset.raceFlowState==="error"||existing?.dataset.raceFlowState==="loaded"){
        existing.remove();
        existing=null;
      }
      const script=existing||document.createElement("script");
      const fail=message=>{
        if(settled)return;
        settled=true;
        if(timer)root.clearTimeout(timer);
        script.dataset.raceFlowState="error";
        script.remove();
        reject(new Error(message));
      };
      const finish=()=>{
        if(settled)return;
        if(!root.ChappyRaceFlowResultPanel){
          fail("結果照合モジュールを初期化できませんでした");
          return;
        }
        settled=true;
        if(timer)root.clearTimeout(timer);
        script.dataset.raceFlowState="loaded";
        resolve(root.ChappyRaceFlowResultPanel);
      };
      script.addEventListener("load",finish,{once:true});
      script.addEventListener("error",()=>fail("結果照合モジュールを読み込めませんでした"),{once:true});
      if(!existing){
        script.src="js/race-flow-result-panel.js?v=20260828-ui-audit-display1";
        script.async=true;
        script.dataset.raceFlowResult="true";
        script.dataset.raceFlowState="loading";
        document.head.appendChild(script);
      }
      timer=root.setTimeout(
        ()=>fail("結果照合モジュールの読み込みが15秒を超えました"),
        LOAD_TIMEOUT_MS
      );
    }).catch(error=>{loadPromise=null;throw error});
    return loadPromise;
  }

  root.ChappyTodayResultsHome=Object.freeze({load});
})(window);
