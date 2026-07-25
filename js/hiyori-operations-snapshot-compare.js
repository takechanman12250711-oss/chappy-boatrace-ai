// 日和運用スナップショット同士を比較する。予想ロジックには接続しない。
(function(){
  "use strict";
  const SNAPSHOT_KEY="chappy_hiyori_operations_snapshots_v1";
  const COMPARE_KEY="chappy_hiyori_operations_snapshot_compare_v1";
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
  function list(value){return Array.isArray(value)?value:[]}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function mapBy(rows,key){return new Map(list(rows).map(row=>[row?.[key],row]))}
  function compare(newer,older){
    if(!newer||!older)return null;
    const changes=[];
    const scoreDelta=Number(newer.score||0)-Number(older.score||0);
    const progressDelta=Number(newer.progress||0)-Number(older.progress||0);
    if(scoreDelta!==0)changes.push({level:scoreDelta>0?"improved":"worsened",label:"総合スコア",message:`${older.score||0}点 → ${newer.score||0}点（${scoreDelta>0?"+":""}${scoreDelta}）`});
    if(progressDelta!==0)changes.push({level:progressDelta>0?"improved":"worsened",label:"到達率",message:`${older.progress||0}% → ${newer.progress||0}%（${progressDelta>0?"+":""}${progressDelta}%）`});
    const oldModules=mapBy(older.pipeline?.modules,"name"),newModules=mapBy(newer.pipeline?.modules,"name");
    newModules.forEach((row,name)=>{const old=oldModules.get(name);if(old&&old.state!==row.state){const improved=old.state!=="active"&&row.state==="active";changes.push({level:improved?"improved":"worsened",label:row.label||name,message:`${old.state} → ${row.state}`})}});
    const oldIssues=list(older.eventHealth?.issues),newIssues=list(newer.eventHealth?.issues);
    const sig=x=>`${x.level}|${x.type}|${x.label}|${x.message}`;
    const oldSet=new Set(oldIssues.map(sig)),newSet=new Set(newIssues.map(sig));
    oldIssues.filter(x=>!newSet.has(sig(x))).forEach(x=>changes.push({level:"improved",label:x.label||"イベント診断",message:`解消：${x.message}`}));
    newIssues.filter(x=>!oldSet.has(sig(x))).forEach(x=>changes.push({level:x.level==="error"?"worsened":"changed",label:x.label||"イベント診断",message:`新規：${x.message}`}));
    const result={checkedAt:new Date().toISOString(),newerId:newer.id,olderId:older.id,newerAt:newer.createdAt,olderAt:older.createdAt,scoreDelta,progressDelta,summary:scoreDelta>0||progressDelta>0?"improved":scoreDelta<0||progressDelta<0?"worsened":changes.some(x=>x.level==="worsened")?"worsened":changes.length?"changed":"unchanged",changes};
    write(COMPARE_KEY,result);return result;
  }
  function root(){const dashboard=document.getElementById("hiyoriOperationsDashboard");if(!dashboard)return null;let holder=document.getElementById("hiyoriOperationsSnapshotComparePanel");if(holder)return holder;holder=document.createElement("section");holder.id="hiyoriOperationsSnapshotComparePanel";holder.style.cssText="margin-top:12px;padding:12px;border:1px solid #dbe6f3;border-radius:12px;background:#fff";dashboard.appendChild(holder);return holder}
  function render(){
    const holder=root();if(!holder)return null;
    const snapshots=list(read(SNAPSHOT_KEY,[]));
    const result=snapshots.length>=2?compare(snapshots[0],snapshots[1]):null;
    const meta=result?.summary==="improved"?{label:"改善",bg:"#ecfdf5",border:"#86efac"}:result?.summary==="worsened"?{label:"悪化",bg:"#fef2f2",border:"#fca5a5"}:result?.summary==="changed"?{label:"変化あり",bg:"#fffbeb",border:"#fcd34d"}:{label:"変化なし",bg:"#f8fafc",border:"#e2e8f0"};
    holder.innerHTML=`<details open><summary style="font-weight:700;cursor:pointer">スナップショット比較</summary>${result?`<div style="margin-top:9px;padding:10px;border:1px solid ${meta.border};border-radius:10px;background:${meta.bg}"><div style="display:flex;justify-content:space-between;gap:8px"><b>${meta.label}</b><span style="font-size:11px">${fmt(result.olderAt)} → ${fmt(result.newerAt)}</span></div><div style="margin-top:5px;font-size:12px">スコア差：${result.scoreDelta>0?"+":""}${result.scoreDelta} ／ 到達率差：${result.progressDelta>0?"+":""}${result.progressDelta}%</div></div>${result.changes.length?`<div style="display:grid;gap:6px;margin-top:9px">${result.changes.map(x=>`<div style="padding:8px;border:1px solid ${x.level==="improved"?"#86efac":x.level==="worsened"?"#fca5a5":"#fcd34d"};border-radius:9px;background:${x.level==="improved"?"#ecfdf5":x.level==="worsened"?"#fef2f2":"#fffbeb"}"><b style="font-size:11px">${x.level==="improved"?"改善":x.level==="worsened"?"悪化":"変化"}：${x.label}</b><span style="display:block;margin-top:3px;font-size:11px;color:#64748b">${x.message}</span></div>`).join("")}</div>`:`<small style="display:block;margin-top:8px;color:#64748b">比較対象に変化はありません。</small>`}`:`<small style="display:block;margin-top:8px;color:#64748b">比較には2件以上の保存済みスナップショットが必要です。</small>`}<small style="display:block;margin-top:8px;color:#64748b">比較専用です。診断データ・予想・本番設定は変更しません。</small></details>`;
    return result;
  }
  function install(){render();window.addEventListener("chappy:hiyori-operations-snapshot-saved",render);window.addEventListener("storage",event=>{if(event.key===SNAPSHOT_KEY)render()})}
  window.ChappyHiyoriOperationsSnapshotCompare={compare,render,status:()=>read(COMPARE_KEY,null)};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
