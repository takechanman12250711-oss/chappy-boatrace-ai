// 日和学習パイプライン運用診断。予想ロジックには接続しない。
(function(){
  "use strict";
  const K=[
    ["学習候補","chappy_hiyori_adoption_candidates_v1"],
    ["変更提案","chappy_hiyori_proposals_v1"],
    ["シャドー検証","chappy_hiyori_shadow_validations_v1"],
    ["シャドー成績","chappy_hiyori_shadow_scorecards_v1"],
    ["最終判定","chappy_hiyori_production_gate_v1"],
    ["承認パッケージ","chappy_hiyori_final_approval_packages_v1"],
    ["最終チェック","chappy_hiyori_production_checklist_v1"],
    ["最終プレゼン","chappy_hiyori_final_presentations_v1"],
    ["最終承認","chappy_hiyori_final_approvals_v1"]
  ];
  function read(k,f){try{return JSON.parse(localStorage.getItem(k)||"null")??f}catch(_){return f}}
  function arr(v){return Array.isArray(v)?v:Array.isArray(v?.items)?v.items:[]}
  function root(){let e=document.getElementById("hiyoriOperationsDashboard");if(e)return e;e=document.createElement("section");e.id="hiyoriOperationsDashboard";e.style.cssText="margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff";(document.getElementById("statsArea")||document.getElementById("resultSection")||document.querySelector("main"))?.appendChild(e);return e}
  function render(){const e=root();if(!e)return;const d=read("chappy_hiyori_runtime_diagnostics_v1",{});const c=window.ChappyHiyoriProductionRollback?.currentConfig?.()||{};const rows=K.map(([label,key])=>({label,count:arr(read(key,[])).length}));const safe=d.connected===true&&c.productionApplied!==true&&c.appliedToPrediction!==true&&c.globalProductionLock!==false;e.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px"><div><small>HIYORI PIPELINE</small><h3 style="margin:4px 0">日和学習 運用診断</h3></div><strong>${safe?"安全稼働":"要確認"}</strong></div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:12px 0">${rows.map((r,i)=>`<div style="padding:9px;border:1px solid #e2e8f0;border-radius:10px;background:${r.count?"#f2fbf6":"#f8fafc"}"><small>${i+1}. ${r.label}</small><b style="display:block;margin-top:3px">${r.count}件</b></div>`).join("")}</div><p style="margin:0;font-size:11px;color:#64748b">接続:${d.connected===true?"正常":"未完了"} ／ 本番反映:${c.productionApplied===true?"あり":"なし"} ／ 予想反映:${c.appliedToPrediction===true?"あり":"なし"} ／ 安全ロック:${c.globalProductionLock!==false?"ON":"OFF"}</p>`;return{safe,rows}}
  function install(){render();window.addEventListener("storage",render);window.addEventListener("chappy:hiyori-runtime-diagnostics",render);window.addEventListener("chappy:hiyori-runtime-ready",render);setInterval(render,60000)}
  window.ChappyHiyoriOperationsDashboard={render};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
