// Sprint4: 再訪時の即時表示と、操作直前の先読みを行う。
(function (root) {
  "use strict";
  if (root.ChappyAppRuntime) return;

  // 既存テストとの互換用。実配信ではindex.htmlのCHAPPY_APP_BUILDを使用する。
  const VERSION = "20260828-ui-audit-display1";
  const ACTIVE_VERSION = root.CHAPPY_APP_BUILD || VERSION;
  const HOME_CACHE_KEY="chappy-home-v2-cache",HOME_CACHE_TTL=300000,SCRIPT_LOAD_TIMEOUT_MS=15000,PRELOAD_LOOKAHEAD=2,HOME_RACE_SELECTOR="[data-place][data-race]";
  const loaded=new Map(),groupReady=new Map();
  const groups={race:["js/utils.js","js/storage.js","js/prediction-conditions.js","js/prediction-runtime-loader.js","js/script.js","js/hiyori-runtime-loader.js"],stats:["js/utils.js","js/storage.js","js/stats-runtime-loader.js"],autoSelection:["js/utils.js","js/storage.js","js/auto-selection.js"]};
  groups.race.splice(2,0,"js/outer-attack-ticket-shadow.js");

  function runtimeError(code,message){
    const error=new Error(`${message} [${code}]`);
    error.name="ChappyRuntimeError";
    error.code=code;
    return error;
  }

  function renderRuntimeError(error){
    const terminal=root.ChappyMobilePredictionStartupTerminal;
    if(typeof terminal?.renderStartupError==="function"){
      terminal.renderStartupError(error);
      return;
    }
    const message=error?.message||String(error||"読み込みに失敗しました");
    if(typeof root.ChappyHomeDashboardV2?.showPredictionError==="function"){
      root.ChappyHomeDashboardV2.showPredictionError(message);
    }
    const status=document.getElementById("statusArea")||document.getElementById("resultSyncStatus");
    if(status)status.textContent=`読み込みに失敗しました：${message}`;
  }

  function hydrateHomeCache(){try{const sessionValue=sessionStorage.getItem(HOME_CACHE_KEY);if(sessionValue)return;const localValue=localStorage.getItem(HOME_CACHE_KEY);if(!localValue)return;const parsed=JSON.parse(localValue);const savedAt=Number(parsed?.savedAt||0);if(!savedAt||Date.now()-savedAt>HOME_CACHE_TTL){localStorage.removeItem(HOME_CACHE_KEY);return;}sessionStorage.setItem(HOME_CACHE_KEY,localValue);}catch(_){}}
  function persistHomeCache(){try{const value=sessionStorage.getItem(HOME_CACHE_KEY);if(!value)return;const parsed=JSON.parse(value);if(!Number(parsed?.savedAt||0))return;localStorage.setItem(HOME_CACHE_KEY,value);}catch(_){}}
  hydrateHomeCache();root.addEventListener("pagehide",persistHomeCache,{passive:true});document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")persistHomeCache();},{passive:true});

  function loadScript(src){
    const clean=src.split("?")[0];
    if(loaded.has(clean))return loaded.get(clean);
    let existing=[...document.scripts].find(script=>script.src&&script.src.includes(clean));
    if(existing?.dataset.chappyLoadFailed==="true"){
      existing.remove?.();
      existing=null;
    }
    if(existing?.dataset.chappyLoaded==="true")return Promise.resolve(true);

    const promise=new Promise((resolve,reject)=>{
      const script=existing||document.createElement("script");
      let settled=false;
      const finish=callback=>value=>{
        if(settled)return;
        settled=true;
        root.clearTimeout(timer);
        callback(value);
      };
      const timer=root.setTimeout(()=>{
        if(settled)return;
        settled=true;
        loaded.delete(clean);
        script.dataset.chappyLoadFailed="true";
        script.remove?.();
        reject(runtimeError("APP_SCRIPT_TIMEOUT",`モジュールの読込が15秒を超えました: ${clean}`));
      },SCRIPT_LOAD_TIMEOUT_MS);
      script.async=false;
      script.dataset.chappyRuntimeModule=clean;
      script.addEventListener("load",finish(()=>{
        script.dataset.chappyLoaded="true";
        resolve(true);
      }),{once:true});
      script.addEventListener("error",finish(()=>{
        loaded.delete(clean);
        script.dataset.chappyLoadFailed="true";
        script.remove?.();
        reject(runtimeError("APP_SCRIPT_LOAD_FAILED",`モジュールを読み込めません: ${clean}`));
      }),{once:true});
      if(!existing){
        script.src=`${clean}?v=${ACTIVE_VERSION}`;
        document.head.appendChild(script);
      }
    });
    loaded.set(clean,promise);
    return promise;
  }

  function preloadGroup(group,startIndex=0,count=PRELOAD_LOOKAHEAD){
    if(typeof document.querySelectorAll!=="function")return;
    (groups[group]||[]).slice(startIndex,startIndex+Math.max(1,count)).forEach(src=>{
      const clean=src.split("?")[0];
      if([...document.scripts].some(script=>script.src&&script.src.includes(clean)))return;
      if([...document.querySelectorAll('link[rel="preload"][as="script"]')].some(link=>link.href&&link.href.includes(clean)))return;
      const link=document.createElement("link");
      link.rel="preload";
      link.as="script";
      link.href=`${clean}?v=${ACTIVE_VERSION}`;
      document.head.appendChild(link);
    });
  }

  function ensure(group){
    if(groupReady.has(group))return groupReady.get(group);
    const promise=(async()=>{
      const scripts=groups[group]||[];
      for(let index=0;index<scripts.length;index+=1){
        preloadGroup(group,index,PRELOAD_LOOKAHEAD);
        await loadScript(scripts[index]);
      }

      // 既存の初期化呼出しは維持し、その直後に必須機能を検証する。
      if(group==="race")root.ChappyRaceControls?.initialize?.();
      if(group==="race"&&typeof root.ChappyRaceControls?.initialize!=="function"){
        throw runtimeError("RACE_CONTROLS_MISSING","レース操作モジュールを準備できません");
      }
      if(group==="race"&&typeof root.ChappyRaceSelection?.select!=="function"){
        throw runtimeError("RACE_SELECTION_MISSING","レース選択モジュールを準備できません");
      }
      if(group==="stats"){
        if(typeof root.ChappyStatsRuntime?.ensureReady!=="function"){
          throw runtimeError("STATS_RUNTIME_MISSING","成績分析モジュールを準備できません");
        }
        await root.ChappyStatsRuntime.ensureReady();
      }
      return true;
    })().catch(error=>{
      groupReady.delete(group);
      throw error;
    });
    groupReady.set(group,promise);
    return promise;
  }

  function requiredGroup(target){if(!target)return"";if(target.matches(".bottom-nav-item"))return"";const view=target.dataset.view||"";if(view==="result"||target.getAttribute("href")==="#resultSection")return"stats";if(view==="race"||target.id==="fetchRaceBtn"||target.id==="reloadRaceBtn"||target.id==="refreshOddsBtn")return"race";return"";}
  function preloadGroupForTarget(target){if(target?.matches(HOME_RACE_SELECTOR))return"";return requiredGroup(target);}
  function replay(target){target.dataset.chappyRuntimeReady="true";target.click();delete target.dataset.chappyRuntimeReady;}

  document.addEventListener("pointerdown",event=>{
    const target=event.target.closest("button,a");
    const group=preloadGroupForTarget(target);
    if(group){
      preloadGroup(group,0,PRELOAD_LOOKAHEAD);
      void ensure(group).catch(()=>{});
    }
  },{capture:true,passive:true});

  document.addEventListener("click",event=>{
    const target=event.target.closest("button,a");
    if(!target||target.dataset.chappyRuntimeReady==="true")return;
    const group=requiredGroup(target);
    if(!group)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    ensure(group)
      .then(()=>replay(target))
      .catch(error=>{
        console.error("[app-runtime-loader]",error);
        renderRuntimeError(error);
      });
  },true);

  root.ChappyAppRuntime=Object.freeze({
    version:ACTIVE_VERSION,
    legacyVersion:VERSION,
    ensure,
    preloadGroup,
    groups,
    persistHomeCache
  });
})(window);
