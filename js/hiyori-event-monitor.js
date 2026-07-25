// 日和学習パイプラインのイベント発火状況を記録する。予想ロジックには接続しない。
(function(){
  "use strict";
  const STORAGE_KEY="chappy_hiyori_event_monitor_v1";
  const EVENTS=[
    {name:"chappy:race-data-ready",label:"レースデータ準備"},
    {name:"chappy:race-result-ready",label:"結果データ準備"},
    {name:"chappy:hiyori-learning-snapshot-saved",label:"学習スナップショット保存"},
    {name:"chappy:hiyori-learning-result-matched",label:"学習結果照合"},
    {name:"chappy:hiyori-learning-correlation-updated",label:"相関分析更新"},
    {name:"chappy:hiyori-correlation-confidence-updated",label:"相関信頼度更新"},
    {name:"chappy:hiyori-learning-adoption-updated",label:"採用候補更新"},
    {name:"chappy:hiyori-adoption-proposals-updated",label:"変更提案更新"},
    {name:"chappy:hiyori-runtime-ready",label:"日和ランタイム準備"},
    {name:"chappy:hiyori-runtime-diagnostics",label:"ランタイム診断"}
  ];
  function read(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"null")||{startedAt:new Date().toISOString(),events:{}}}catch(_){return{startedAt:new Date().toISOString(),events:{}}}}
  function safeDetail(detail){
    if(detail==null)return{present:false,type:"none",keys:[]};
    const type=Array.isArray(detail)?"array":typeof detail;
    const keys=detail&&typeof detail==="object"&&!Array.isArray(detail)?Object.keys(detail).slice(0,20):[];
    return{present:true,type,keys};
  }
  function record(name,label,event){
    const state=read();
    const previous=state.events[name]||{count:0};
    state.events[name]={name,label,count:Number(previous.count||0)+1,lastFiredAt:new Date().toISOString(),detail:safeDetail(event?.detail)};
    state.updatedAt=new Date().toISOString();
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-event-monitor-updated",{detail:state}));
    return state.events[name];
  }
  function status(){const state=read();return{...state,definitions:EVENTS.map(x=>({...x}))}}
  function install(){EVENTS.forEach(item=>window.addEventListener(item.name,event=>record(item.name,item.label,event)));}
  window.ChappyHiyoriEventMonitor={status,record,events:()=>EVENTS.map(x=>({...x}))};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();