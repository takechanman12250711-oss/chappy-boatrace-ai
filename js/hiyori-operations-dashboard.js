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
  const REASONS=[
    "学習元データまたは採用候補の生成条件を確認",
    "候補から変更提案を作る処理・閾値を確認",
    "提案の承認状態とシャドー検証起動を確認",
    "検証結果・公式結果の照合件数を確認",
    "信頼度・サンプル数・悪化率の条件を確認",
    "最終判定の状態と署名生成を確認",
    "復元スナップショットと各必須条件を確認",
    "チェックリスト保存キーと署名整合性を確認",
    "最終承認はあっくんの明確な操作待ち"
  ];
  const REPORT_KEY="chappy_hiyori_pipeline_diagnosis_v1";
  const HISTORY_KEY="chappy_hiyori_pipeline_recheck_history_v1";
  function read(k,f){try{return JSON.parse(localStorage.getItem(k)||"null")??f}catch(_){return f}}
  function arr(v){return Array.isArray(v)?v:Array.isArray(v?.items)?v.items:[]}
  function root(){let e=document.getElementById("hiyoriOperationsDashboard");if(e)return e;e=document.createElement("section");e.id="hiyoriOperationsDashboard";e.style.cssText="margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff";(document.getElementById("statsArea")||document.getElementById("resultSection")||document.querySelector("main"))?.appendChild(e);return e}
  function diagnose(rows){
    const firstZero=rows.findIndex((row,index)=>row.count===0&&(index===0||rows[index-1].count>0));
    if(firstZero<0)return{stage:null,label:"全工程にデータあり",reason:"最終承認状況を確認"};
    return{stage:firstZero+1,label:rows[firstZero].label,reason:REASONS[firstZero]};
  }
  function snapshot(){
    const d=read("chappy_hiyori_runtime_diagnostics_v1",{});
    const c=window.ChappyHiyoriProductionRollback?.currentConfig?.()||{};
    const rows=K.map(([label,key])=>({label,key,count:arr(read(key,[])).length}));
    const stop=diagnose(rows);
    const safe=d.connected===true&&c.productionApplied!==true&&c.appliedToPrediction!==true&&c.globalProductionLock!==false;
    return{checkedAt:new Date().toISOString(),safe,connected:d.connected===true,productionApplied:c.productionApplied===true,appliedToPrediction:c.appliedToPrediction===true,globalProductionLock:c.globalProductionLock!==false,rows,firstBlockedStage:stop};
  }
  function saveManual(report){
    const history=arr(read(HISTORY_KEY,[]));
    const previous=history[0]||null;
    const entry={...report,id:`recheck-${Date.now()}`,manual:true,changed:Boolean(previous&&(previous.firstBlockedStage?.stage!==report.firstBlockedStage?.stage||JSON.stringify(previous.rows)!==JSON.stringify(report.rows)))};
    localStorage.setItem(HISTORY_KEY,JSON.stringify([entry,...history].slice(0,30)));
    return entry;
  }
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function render(options={}){
    const e=root();if(!e)return;
    const report=snapshot();
    if(options.manual)saveManual(report);
    const stop=report.firstBlockedStage;
    const history=arr(read(HISTORY_KEY,[]));
    e.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><small>HIYORI PIPELINE</small><h3 style="margin:4px 0">日和学習 運用診断</h3></div><strong>${report.safe?"安全稼働":"要確認"}</strong></div><div style="padding:10px 12px;margin:12px 0;border-radius:12px;background:${stop.stage?"#fff7ed":"#ecfdf5"}"><b>${stop.stage?`停止候補：STEP ${stop.stage} ${stop.label}`:stop.label}</b><small style="display:block;margin-top:4px;color:#64748b">${stop.reason}</small></div><button type="button" data-hiyori-recheck style="width:100%;padding:10px 12px;border:0;border-radius:10px;font-weight:700;background:#1f6feb;color:#fff">現在の保存データを再診断</button><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:12px 0">${report.rows.map((r,i)=>`<div style="padding:9px;border:1px solid #e2e8f0;border-radius:10px;background:${r.count?"#f2fbf6":stop.stage===i+1?"#fff7ed":"#f8fafc"}"><small>${i+1}. ${r.label}</small><b style="display:block;margin-top:3px">${r.count}件</b></div>`).join("")}</div><p style="margin:0;font-size:11px;color:#64748b">接続:${report.connected?"正常":"未完了"} ／ 本番反映:${report.productionApplied?"あり":"なし"} ／ 予想反映:${report.appliedToPrediction?"あり":"なし"} ／ 安全ロック:${report.globalProductionLock?"ON":"OFF"}</p><div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0"><b style="font-size:13px">手動再診断履歴</b>${history.length?history.slice(0,5).map(row=>`<div style="margin-top:7px;padding:8px;border-radius:9px;background:#f8fafc;font-size:11px"><strong>${row.firstBlockedStage?.stage?`STEP ${row.firstBlockedStage.stage} ${row.firstBlockedStage.label}`:"全工程にデータあり"}</strong><span style="display:block;margin-top:3px;color:#64748b">${fmt(row.checkedAt)}${row.changed?" ／ 前回から変化あり":" ／ 変化なし"}</span></div>`).join(""):`<small style="display:block;margin-top:6px;color:#64748b">まだ手動再診断履歴はありません。</small>`}</div>`;
    e.querySelector("[data-hiyori-recheck]")?.addEventListener("click",()=>render({manual:true}));
    localStorage.setItem(REPORT_KEY,JSON.stringify(report));
    return report;
  }
  function install(){render();window.addEventListener("storage",()=>render());window.addEventListener("chappy:hiyori-runtime-diagnostics",()=>render());window.addEventListener("chappy:hiyori-runtime-ready",()=>render());setInterval(()=>render(),60000)}
  window.ChappyHiyoriOperationsDashboard={render,diagnose,snapshot,recheck:()=>render({manual:true})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();