// 日和学習パイプライン運用診断。予想ロジックには接続しない。
(function(){
  "use strict";
  const K=[
    {label:"学習候補",keys:["chappy_hiyori_learning_adoption_candidates_v1","chappy_hiyori_adoption_candidates_v1"]},
    {label:"変更提案",keys:["chappy_hiyori_adoption_proposals_v1","chappy_hiyori_change_proposals_v1","chappy_hiyori_proposals_v1"]},
    {label:"シャドー検証",keys:["chappy_hiyori_shadow_validation_v1","chappy_hiyori_shadow_validations_v1"]},
    {label:"シャドー成績",keys:["chappy_hiyori_shadow_performance_grade_v1","chappy_hiyori_shadow_performance_v1","chappy_hiyori_shadow_scorecards_v1"]},
    {label:"最終判定",keys:["chappy_hiyori_production_readiness_v1","chappy_hiyori_production_gate_v1"]},
    {label:"承認パッケージ",keys:["chappy_hiyori_final_approval_package_v1","chappy_hiyori_final_approval_packages_v1"]},
    {label:"最終チェック",keys:["chappy_hiyori_production_checklist_v1","chappy_hiyori_final_checklist_v1"]},
    {label:"最終プレゼン",keys:["chappy_hiyori_final_presentation_v1","chappy_hiyori_final_presentations_v1"]},
    {label:"最終承認",keys:["chappy_hiyori_final_approval_v1","chappy_hiyori_final_approvals_v1"]}
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
  const REQUIREMENTS=[
    ["学習元データが保存済み","採用候補生成条件を満たす"],
    ["学習候補が1件以上","提案生成処理が実行済み"],
    ["変更提案が1件以上","シャドー検証対象として承認済み"],
    ["シャドー検証が1件以上","公式結果との照合が完了"],
    ["成績サンプルが必要数以上","悪化率・信頼度条件を満たす"],
    ["最終判定が通過","署名・整合性情報が生成済み"],
    ["承認パッケージが存在","復元スナップショットが存在"],
    ["全チェック項目が通過","署名が一致"],
    ["最終プレゼンが存在","明確な手動承認が未実行または実行済み"]
  ];
  const REPORT_KEY="chappy_hiyori_pipeline_diagnosis_v1";
  const HISTORY_KEY="chappy_hiyori_pipeline_recheck_history_v1";
  function read(k,f){try{return JSON.parse(localStorage.getItem(k)||"null")??f}catch(_){return f}}
  function list(v){if(Array.isArray(v))return v;for(const key of ["items","rows","proposals","packages","presentations","approvals","results"]){if(Array.isArray(v?.[key]))return v[key]}return v&&typeof v==="object"?[v]:[]}
  function root(){let e=document.getElementById("hiyoriOperationsDashboard");if(e)return e;e=document.createElement("section");e.id="hiyoriOperationsDashboard";e.style.cssText="margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff";(document.getElementById("statsArea")||document.getElementById("resultSection")||document.querySelector("main"))?.appendChild(e);return e}
  function resolveStage(stage){const found=stage.keys.filter(key=>localStorage.getItem(key)!==null);const activeKey=found[0]||stage.keys[0];const value=read(activeKey,null);return{label:stage.label,keys:stage.keys,activeKey,foundKeys:found,count:value===null?0:list(value).length,exists:found.length>0,mismatch:found.length>0&&activeKey!==stage.keys[0]}}
  function diagnose(rows){const firstZero=rows.findIndex((row,index)=>row.count===0&&(index===0||rows[index-1].count>0));if(firstZero<0)return{stage:null,label:"全工程にデータあり",reason:"最終承認状況を確認"};return{stage:firstZero+1,label:rows[firstZero].label,reason:REASONS[firstZero]}}
  function snapshot(){const d=read("chappy_hiyori_runtime_diagnostics_v1",{});const c=window.ChappyHiyoriProductionRollback?.currentConfig?.()||{};const rows=K.map(resolveStage);const stop=diagnose(rows);const safe=d.connected===true&&c.productionApplied!==true&&c.appliedToPrediction!==true&&c.globalProductionLock!==false;const mismatches=rows.filter(row=>row.mismatch||row.foundKeys.length>1).map(row=>({label:row.label,expected:row.keys[0],detected:row.foundKeys}));return{checkedAt:new Date().toISOString(),safe,connected:d.connected===true,productionApplied:c.productionApplied===true,appliedToPrediction:c.appliedToPrediction===true,globalProductionLock:c.globalProductionLock!==false,rows,mismatches,firstBlockedStage:stop}}
  function saveManual(report){const history=list(read(HISTORY_KEY,[]));const previous=history[0]||null;const entry={...report,id:`recheck-${Date.now()}`,manual:true,changed:Boolean(previous&&(previous.firstBlockedStage?.stage!==report.firstBlockedStage?.stage||JSON.stringify(previous.rows)!==JSON.stringify(report.rows)))};localStorage.setItem(HISTORY_KEY,JSON.stringify([entry,...history].slice(0,30)));return entry}
  function fmt(value){const d=new Date(value);return Number.isNaN(d.getTime())?"-":d.toLocaleString("ja-JP")}
  function detail(report){const stop=report.firstBlockedStage;if(!stop.stage)return{key:"-",exists:true,previous:"-",requirements:["全工程の保存データを確認","最終承認状態を確認"]};const row=report.rows[stop.stage-1];const prev=report.rows[stop.stage-2];return{key:row.activeKey,aliases:row.keys,exists:row.exists,previous:prev?`${prev.label} ${prev.count}件`:"開始工程",requirements:REQUIREMENTS[stop.stage-1]||[]}}
  function render(options={}){
    const e=root();if(!e)return;
    const report=snapshot();if(options.manual)saveManual(report);
    const stop=report.firstBlockedStage;const info=detail(report);const history=list(read(HISTORY_KEY,[]));
    e.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><small>HIYORI PIPELINE</small><h3 style="margin:4px 0">日和学習 運用診断</h3></div><strong>${report.safe?"安全稼働":"要確認"}</strong></div><div style="padding:10px 12px;margin:12px 0;border-radius:12px;background:${stop.stage?"#fff7ed":"#ecfdf5"}"><b>${stop.stage?`停止候補：STEP ${stop.stage} ${stop.label}`:stop.label}</b><small style="display:block;margin-top:4px;color:#64748b">${stop.reason}</small></div>${report.mismatches.length?`<details open style="margin-bottom:12px;padding:10px 12px;border:1px solid #f59e0b;border-radius:12px;background:#fffbeb"><summary style="font-weight:700;cursor:pointer">保存キー名称の不一致 ${report.mismatches.length}件</summary>${report.mismatches.map(x=>`<div style="margin-top:8px;font-size:11px"><b>${x.label}</b><div>基準：<code>${x.expected}</code></div><div>検出：${x.detected.map(k=>`<code>${k}</code>`).join(" / ")}</div></div>`).join("")}<small style="display:block;margin-top:8px;color:#64748b">診断側で互換読込します。元データの自動移動・削除は行いません。</small></details>`:""}<details open style="margin-bottom:12px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc"><summary style="font-weight:700;cursor:pointer">停止工程の詳細診断</summary><div style="margin-top:9px;font-size:12px;line-height:1.7"><div><b>使用キー：</b><code>${info.key}</code></div><div><b>互換候補：</b>${info.aliases.map(k=>`<code>${k}</code>`).join(" / ")}</div><div><b>キー存在：</b>${info.exists?"あり":"なし"}</div><div><b>直前工程：</b>${info.previous}</div><div style="margin-top:6px"><b>必要条件</b>${info.requirements.map(x=>`<div>・${x}</div>`).join("")}</div><div style="margin-top:6px;color:#64748b">この診断は確認専用です。保存データの修正・削除・本番反映は行いません。</div></div></details><button type="button" data-hiyori-recheck style="width:100%;padding:10px 12px;border:0;border-radius:10px;font-weight:700;background:#1f6feb;color:#fff">現在の保存データを再診断</button><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin:12px 0">${report.rows.map((r,i)=>`<div style="padding:9px;border:1px solid #e2e8f0;border-radius:10px;background:${r.count?"#f2fbf6":stop.stage===i+1?"#fff7ed":"#f8fafc"}"><small>${i+1}. ${r.label}</small><b style="display:block;margin-top:3px">${r.count}件</b><em style="display:block;margin-top:3px;font-size:10px;color:#64748b;font-style:normal">${r.exists?`使用:${r.activeKey}`:"保存キーなし"}</em></div>`).join("")}</div><p style="margin:0;font-size:11px;color:#64748b">接続:${report.connected?"正常":"未完了"} ／ 本番反映:${report.productionApplied?"あり":"なし"} ／ 予想反映:${report.appliedToPrediction?"あり":"なし"} ／ 安全ロック:${report.globalProductionLock?"ON":"OFF"}</p><div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0"><b style="font-size:13px">手動再診断履歴</b>${history.length?history.slice(0,5).map(row=>`<div style="margin-top:7px;padding:8px;border-radius:9px;background:#f8fafc;font-size:11px"><strong>${row.firstBlockedStage?.stage?`STEP ${row.firstBlockedStage.stage} ${row.firstBlockedStage.label}`:"全工程にデータあり"}</strong><span style="display:block;margin-top:3px;color:#64748b">${fmt(row.checkedAt)}${row.changed?" ／ 前回から変化あり":" ／ 変化なし"}</span></div>`).join(""):`<small style="display:block;margin-top:6px;color:#64748b">まだ手動再診断履歴はありません。</small>`}</div>`;
    e.querySelector("[data-hiyori-recheck]")?.addEventListener("click",()=>render({manual:true}));
    localStorage.setItem(REPORT_KEY,JSON.stringify({...report,detail:info}));return report;
  }
  function install(){render();window.addEventListener("storage",()=>render());window.addEventListener("chappy:hiyori-runtime-diagnostics",()=>render());window.addEventListener("chappy:hiyori-runtime-ready",()=>render());setInterval(()=>render(),60000)}
  window.ChappyHiyoriOperationsDashboard={render,diagnose,snapshot,recheck:()=>render({manual:true})};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();