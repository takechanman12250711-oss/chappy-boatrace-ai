// 日和運用診断の状態を手動保存・確認する。予想ロジックには接続しない。
(function(){
  "use strict";
  const SNAPSHOT_KEY="chappy_hiyori_operations_snapshots_v1";
  const SUMMARY_KEY="chappy_hiyori_operations_summary_v1";
  const DIAGNOSIS_KEY="chappy_hiyori_pipeline_diagnosis_v1";
  const EVENT_HEALTH_KEY="chappy_hiyori_event_health_v1";
  const RUNTIME_KEY="chappy_hiyori_runtime_diagnostics_v1";
  const MAX_SNAPSHOTS=30;

  function read(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}
  }
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function list(value){return Array.isArray(value)?value:[]}

  function build(){
    const summary=read(SUMMARY_KEY,null);
    const diagnosis=read(DIAGNOSIS_KEY,null);
    const eventHealth=read(EVENT_HEALTH_KEY,null);
    const runtime=read(RUNTIME_KEY,null);
    const createdAt=new Date().toISOString();
    return{
      id:`ops-${Date.now()}`,
      createdAt,
      score:Number(summary?.score??0),
      progress:Number(summary?.progress??0),
      comparison:summary?.comparison||"unknown",
      summary:{
        status:summary?.status||"未診断",
        headline:summary?.headline||"診断サマリーなし",
        nextAction:summary?.nextAction||"運用診断を実行",
        safeLock:summary?.safeLock!==false
      },
      pipeline:{
        firstBlockedStage:diagnosis?.firstBlockedStage||null,
        firstBlockedModule:diagnosis?.firstBlockedModule||null,
        eventDiagnosis:diagnosis?.eventDiagnosis||null,
        rows:list(diagnosis?.rows).map(row=>({label:row.label,count:row.count,exists:row.exists,activeKey:row.activeKey})),
        modules:list(diagnosis?.modules).map(row=>({name:row.name,label:row.label,state:row.state,globalName:row.globalName}))
      },
      eventHealth:{
        healthy:eventHealth?.healthy===true,
        latestEvent:eventHealth?.latestEvent||null,
        firstMissing:eventHealth?.firstMissing||null,
        issues:list(eventHealth?.issues).map(issue=>({level:issue.level,type:issue.type,label:issue.label,message:issue.message,action:issue.action||null}))
      },
      runtime:{
        connected:runtime?.connected===true,
        loadedCount:Number(runtime?.loadedCount||0),
        requiredCount:Number(runtime?.requiredCount||0),
        productionApplied:runtime?.productionApplied===true,
        appliedToPrediction:runtime?.appliedToPrediction===true,
        globalProductionLock:runtime?.globalProductionLock!==false,
        missing:list(runtime?.missing)
      },
      safety:{
        productionApplied:false,
        appliedToPrediction:false,
        globalProductionLock:true,
        readOnly:true
      }
    };
  }

  function save(){
    const snapshot=build();
    const history=list(read(SNAPSHOT_KEY,[]));
    write(SNAPSHOT_KEY,[snapshot,...history].slice(0,MAX_SNAPSHOTS));
    window.dispatchEvent(new CustomEvent("chappy:hiyori-operations-snapshot-saved",{detail:snapshot}));
    render();
    return snapshot;
  }

  function remove(id){
    const history=list(read(SNAPSHOT_KEY,[])).filter(item=>item?.id!==id);
    write(SNAPSHOT_KEY,history);
    render();
    return history;
  }

  function root(){
    const dashboard=document.getElementById("hiyoriOperationsDashboard");
    if(!dashboard)return null;
    let holder=document.getElementById("hiyoriOperationsSnapshotPanel");
    if(holder)return holder;
    holder=document.createElement("section");
    holder.id="hiyoriOperationsSnapshotPanel";
    holder.style.cssText="margin-top:12px;padding:12px;border:1px solid #dbe6f3;border-radius:12px;background:#fff";
    dashboard.appendChild(holder);
    return holder;
  }

  function render(){
    const holder=root();if(!holder)return null;
    const history=list(read(SNAPSHOT_KEY,[]));
    holder.innerHTML=`<details open><summary style="font-weight:700;cursor:pointer">運用スナップショット　保存 ${history.length}件</summary><div style="margin-top:9px"><button type="button" data-save-ops-snapshot style="width:100%;padding:10px 12px;border:0;border-radius:10px;background:#0f766e;color:#fff;font-weight:700">現在の診断状態を保存</button><small style="display:block;margin-top:6px;color:#64748b">保存対象は診断結果のみです。予想データ・買い目・本番設定は変更しません。</small>${history.length?`<div style="display:grid;gap:7px;margin-top:10px">${history.slice(0,8).map(item=>`<div style="padding:9px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc"><div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:12px">${item.score}点 ／ 到達 ${item.progress}%</b><button type="button" data-remove-ops-snapshot="${item.id}" style="border:0;background:transparent;color:#b91c1c;font-size:11px">削除</button></div><small style="display:block;margin-top:3px;color:#64748b">${fmt(item.createdAt)}</small><span style="display:block;margin-top:4px;font-size:11px">${item.summary?.headline||"診断サマリーなし"}</span><small style="display:block;margin-top:3px;color:#475569">次の確認：${item.summary?.nextAction||"-"}</small></div>`).join("")}</div>`:`<small style="display:block;margin-top:9px;color:#64748b">保存済みスナップショットはありません。</small>`}</div></details>`;
    holder.querySelector("[data-save-ops-snapshot]")?.addEventListener("click",save);
    holder.querySelectorAll("[data-remove-ops-snapshot]").forEach(button=>button.addEventListener("click",()=>remove(button.dataset.removeOpsSnapshot)));
    return history;
  }

  function install(){render();window.addEventListener("chappy:hiyori-runtime-ready",render);window.addEventListener("chappy:hiyori-runtime-diagnostics",render);window.addEventListener("chappy:hiyori-event-health-updated",render)}
  window.ChappyHiyoriOperationsSnapshot={build,save,remove,render,list:()=>list(read(SNAPSHOT_KEY,[]))};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
