// 日和学習パイプラインの総合ヘルススコア・到達率・前回比を表示する。
// 予想ロジック・印・配点・買い目・本番反映には接続しない。
(function(){
  "use strict";
  const STATUS_KEY="chappy_hiyori_operations_summary_v1";
  const HISTORY_KEY="chappy_hiyori_operations_summary_history_v1";
  const PIPELINE_KEY="chappy_hiyori_pipeline_diagnosis_v1";
  const HEALTH_KEY="chappy_hiyori_event_health_v1";
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function list(value){return Array.isArray(value)?value:[]}
  function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
  function calculate(){
    const pipeline=read(PIPELINE_KEY,{});
    const health=read(HEALTH_KEY,{issues:[],rows:[]});
    const modules=list(pipeline.modules);
    const events=list(pipeline.events);
    const activeModules=modules.filter(x=>x.state==="active").length;
    const loadedModules=modules.filter(x=>x.state!=="missing").length;
    const totalModules=modules.length||Number(pipeline.requiredCount||0)||15;
    const reachedEvents=events.filter(x=>Number(x.count||0)>0).length;
    const totalEvents=events.length||8;
    const errors=list(health.issues).filter(x=>x.level==="error").length;
    const warnings=list(health.issues).filter(x=>x.level==="warning").length;
    const connected=pipeline.connected===true;
    const safeLock=pipeline.globalProductionLock!==false&&pipeline.productionApplied!==true&&pipeline.appliedToPrediction!==true;
    const moduleScore=totalModules?Math.round((activeModules/totalModules)*35):0;
    const connectionScore=connected?15:Math.round((loadedModules/Math.max(totalModules,1))*15);
    const eventScore=totalEvents?Math.round((reachedEvents/totalEvents)*25):0;
    const safetyScore=safeLock?15:0;
    const qualityScore=clamp(10-errors*5-warnings*2,0,10);
    const score=clamp(moduleScore+connectionScore+eventScore+safetyScore+qualityScore,0,100);
    const reachRate=totalEvents?Math.round((reachedEvents/totalEvents)*100):0;
    const previous=list(read(HISTORY_KEY,[]))[0]||null;
    const delta=previous?score-Number(previous.score||0):0;
    const trend=!previous?"initial":delta>0?"improved":delta<0?"worsened":"unchanged";
    const firstStop=pipeline.firstBlockedModule?.label||pipeline.eventDiagnosis?.label||pipeline.firstBlockedStage?.label||null;
    const nextAction=errors>0?"重大異常の直前工程とイベント順序を確認":warnings>0?"注意項目の件数差・detail・鮮度を確認":firstStop?`${firstStop}の入力条件を確認`:"監視を継続";
    const state=errors>0?"要確認":warnings>0?"注意あり":score>=90?"良好":score>=70?"概ね正常":"進行中";
    return{checkedAt:new Date().toISOString(),score,reachRate,state,trend,delta,activeModules,totalModules,reachedEvents,totalEvents,errors,warnings,firstStop,nextAction,safeLock,connected,breakdown:{moduleScore,connectionScore,eventScore,safetyScore,qualityScore}};
  }
  function save(summary){
    localStorage.setItem(STATUS_KEY,JSON.stringify(summary));
    const history=list(read(HISTORY_KEY,[]));
    const previous=history[0];
    if(!previous||previous.score!==summary.score||previous.state!==summary.state||previous.firstStop!==summary.firstStop){
      localStorage.setItem(HISTORY_KEY,JSON.stringify([summary,...history].slice(0,50)));
    }
  }
  function meta(summary){
    if(summary.errors>0)return{bg:"#fef2f2",border:"#fca5a5",text:"#991b1b"};
    if(summary.warnings>0)return{bg:"#fffbeb",border:"#fcd34d",text:"#92400e"};
    return{bg:"#ecfdf5",border:"#86efac",text:"#166534"};
  }
  function trendLabel(summary){return summary.trend==="improved"?`改善 +${summary.delta}`:summary.trend==="worsened"?`悪化 ${summary.delta}`:summary.trend==="unchanged"?"変化なし":"初回診断"}
  function render(){
    const dashboard=document.getElementById("hiyoriOperationsDashboard");
    if(!dashboard)return null;
    let panel=document.getElementById("hiyoriOperationsSummary");
    if(!panel){panel=document.createElement("section");panel.id="hiyoriOperationsSummary";dashboard.prepend(panel)}
    const summary=calculate();save(summary);const m=meta(summary);
    panel.style.cssText=`margin-bottom:12px;padding:14px;border:1px solid ${m.border};border-radius:14px;background:${m.bg}`;
    panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><small style="font-weight:700;color:${m.text}">総合ヘルス</small><div style="display:flex;align-items:flex-end;gap:8px;margin-top:3px"><strong style="font-size:34px;line-height:1;color:${m.text}">${summary.score}</strong><span style="font-size:13px;color:#64748b">/100</span></div></div><div style="text-align:right"><b style="color:${m.text}">${summary.state}</b><small style="display:block;margin-top:4px;color:#64748b">${trendLabel(summary)}</small></div></div><div style="margin-top:12px"><div style="display:flex;justify-content:space-between;font-size:12px"><b>パイプライン到達率</b><span>${summary.reachRate}%（${summary.reachedEvents}/${summary.totalEvents}）</span></div><div style="height:10px;margin-top:6px;border-radius:999px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:${summary.reachRate}%;background:${m.text};transition:width .2s"></div></div></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px"><div style="padding:8px;border-radius:9px;background:rgba(255,255,255,.7)"><small>モジュール稼働</small><b style="display:block;margin-top:3px">${summary.activeModules}/${summary.totalModules}</b></div><div style="padding:8px;border-radius:9px;background:rgba(255,255,255,.7)"><small>重大／注意</small><b style="display:block;margin-top:3px">${summary.errors}／${summary.warnings}</b></div><div style="padding:8px;border-radius:9px;background:rgba(255,255,255,.7)"><small>安全ロック</small><b style="display:block;margin-top:3px">${summary.safeLock?"ON":"要確認"}</b></div></div><div style="margin-top:12px;padding:10px;border-radius:10px;background:rgba(255,255,255,.72);font-size:12px;line-height:1.7"><div><b>現在：</b>${summary.state}</div><div><b>停止候補：</b>${summary.firstStop||"なし"}</div><div><b>次の確認：</b>${summary.nextAction}</div></div><small style="display:block;margin-top:8px;color:#64748b">診断専用です。自動修復・自動承認・予想反映・本番反映は行いません。</small>`;
    window.dispatchEvent(new CustomEvent("chappy:hiyori-operations-summary-updated",{detail:summary}));
    return summary;
  }
  function install(){render();["chappy:hiyori-runtime-diagnostics","chappy:hiyori-event-health-updated","chappy:hiyori-event-monitor-updated","chappy:hiyori-runtime-ready"].forEach(name=>window.addEventListener(name,()=>setTimeout(render,0)));window.addEventListener("storage",event=>{if(event.key&&event.key.startsWith("chappy_hiyori_"))setTimeout(render,0)});setInterval(render,60000)}
  window.ChappyHiyoriOperationsSummary={calculate,render,status:()=>read(STATUS_KEY,null),history:()=>list(read(HISTORY_KEY,[]))};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();