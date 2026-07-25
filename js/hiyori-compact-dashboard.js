// 通常利用向けの日和・比較コンパクト表示。
// 予想ロジック・印・配点・買い目には接続しない。
(function(){
  "use strict";
  const ROOT_ID="hiyoriCompactDashboard";
  const HIDDEN_CLASS="chappy-compact-hidden-legacy";
  const DETAIL_SCRIPTS=[
    "js/hiyori-shadow-validation-loader.js",
    "js/hiyori-shadow-performance-loader.js",
    "js/hiyori-production-readiness-loader.js",
    "js/hiyori-final-approval-package-loader.js",
    "js/hiyori-production-rollback.js",
    "js/hiyori-production-rollback-panel.js",
    "js/hiyori-production-checklist.js",
    "js/hiyori-production-simulator.js",
    "js/hiyori-final-presentation.js",
    "js/hiyori-final-approval-ui.js",
    "js/hiyori-runtime-diagnostics.js",
    "js/hiyori-operations-dashboard.js",
    "js/hiyori-event-health.js",
    "js/hiyori-operations-summary.js",
    "js/hiyori-operations-snapshot.js",
    "js/hiyori-operations-snapshot-compare.js",
    "js/hiyori-operations-report.js",
    "js/hiyori-operations-self-test.js"
  ];
  let detailLoading=false;
  let detailLoaded=false;
  let observer=null;
  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function count(value){if(Array.isArray(value))return value.length;if(Array.isArray(value?.items))return value.items.length;if(Array.isArray(value?.rows))return value.rows.length;if(Array.isArray(value?.proposals))return value.proposals.length;return value?1:0}
  function findMount(){return document.getElementById("statsArea")||document.getElementById("resultSection")||document.querySelector("main")||document.body}
  function loadScript(src){return new Promise(resolve=>{if([...document.scripts].some(s=>s.src&&s.src.includes(src))){resolve();return}const s=document.createElement("script");s.src=src;s.async=false;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s)})}
  function normalizeText(value){return String(value||"").replace(/\s+/g," ").trim()}
  function legacyTargetFromHeading(heading){
    if(!heading||heading.closest(`#${ROOT_ID}`))return null;
    const text=normalizeText(heading.textContent);
    const matched=/予想と公式|公式.*比較|ボートレース日和|日和.*分析|日和.*比較|日和.*学習/.test(text);
    if(!matched)return null;
    let target=heading.closest("section,article,details");
    if(!target){
      let node=heading.parentElement;
      while(node&&node.parentElement&&node.parentElement!==document.body){
        if(node.parentElement.id==="statsArea"||node.parentElement.id==="resultSection"||node.parentElement.tagName==="MAIN"){target=node;break}
        node=node.parentElement;
      }
    }
    if(!target||target.id===ROOT_ID||target.contains(document.getElementById(ROOT_ID)))return null;
    return target;
  }
  function suppressLegacyPanels(){
    const directIds=[
      "hiyoriOperationsDashboard",
      "hiyoriLearningPanel",
      "hiyoriAnalysisPanel",
      "hiyoriComparisonPanel",
      "predictionOfficialComparison",
      "predictionOfficialCompare",
      "officialPredictionComparison"
    ];
    directIds.forEach(id=>{const el=document.getElementById(id);if(el&&el.id!==ROOT_ID)el.classList.add(HIDDEN_CLASS)});
    document.querySelectorAll("h2,h3,h4,.section-title,.panel-title,.card-title,strong").forEach(heading=>{
      const target=legacyTargetFromHeading(heading);
      if(target)target.classList.add(HIDDEN_CLASS);
    });
  }
  function startLegacyObserver(){
    if(observer)return;
    suppressLegacyPanels();
    observer=new MutationObserver(()=>requestAnimationFrame(suppressLegacyPanels));
    observer.observe(document.body,{childList:true,subtree:true});
  }
  function revealDiagnostics(){
    document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach(el=>{
      if(el.id==="hiyoriOperationsDashboard"||/hiyori/i.test(el.id||""))el.classList.remove(HIDDEN_CLASS);
    });
  }
  async function loadDetails(button){
    if(detailLoading)return;
    const existing=document.getElementById("hiyoriOperationsDashboard");
    if(detailLoaded&&existing){existing.hidden=!existing.hidden;button.textContent=existing.hidden?"開発・診断を開く":"開発・診断を閉じる";return}
    detailLoading=true;button.disabled=true;button.textContent="診断を読み込み中…";
    for(const src of DETAIL_SCRIPTS)await loadScript(src);
    detailLoaded=true;detailLoading=false;button.disabled=false;button.textContent="開発・診断を閉じる";
    revealDiagnostics();
    const panel=document.getElementById("hiyoriOperationsDashboard");if(panel)panel.hidden=false;
  }
  function status(){
    const correlation=read("chappy_hiyori_correlation_confidence_v1",read("chappy_hiyori_learning_correlation_v1",null));
    const candidates=read("chappy_hiyori_learning_adoption_candidates_v1",read("chappy_hiyori_adoption_candidates_v1",[]));
    const proposals=read("chappy_hiyori_adoption_proposals_v1",read("chappy_hiyori_change_proposals_v1",[]));
    const approval=read("chappy_hiyori_proposal_approval_v1",null);
    const raceResult=read("chappy_last_result_comparison_v1",read("chappy_official_result_comparison_v1",null));
    const prediction=window.__CHAPPY_LAST_PREDICTION__||read("chappy_last_prediction_v1",null);
    const correlationScore=Number(correlation?.score??correlation?.confidence??correlation?.correlationScore);
    const sampleCount=Number(correlation?.sampleCount??correlation?.samples??0);
    const proposalCount=count(proposals),candidateCount=count(candidates);
    const approved=approval?.status==="approved"||approval?.approved===true;
    const hiyoriLabel=approved?"補助評価：承認済み":proposalCount?`補助評価：提案 ${proposalCount}件`:candidateCount?`補助評価：候補 ${candidateCount}件`:"補助評価：待機中";
    const hiyoriSub=Number.isFinite(correlationScore)?`相関 ${Math.round(correlationScore)}点・サンプル ${sampleCount}件`:"予想への自動反映なし";
    const predictionLabel=prediction?"予想生成済み":"予想待ち";
    const predictionSub=prediction?.mainScenario?`本線：${prediction.mainScenario}`:"展開・買い目の要点を表示";
    const officialLabel=raceResult?"公式結果と照合済み":"公式結果待ち";
    const officialSub=raceResult?.summary||raceResult?.status||"結果確定後に比較";
    return{predictionLabel,predictionSub,officialLabel,officialSub,hiyoriLabel,hiyoriSub};
  }
  function card(icon,title,value,sub){return `<section class="hiyori-compact-card"><div class="hiyori-compact-icon">${icon}</div><div class="hiyori-compact-copy"><strong>${title}</strong><b>${value}</b><small>${sub}</small></div></section>`}
  function render(){
    let root=document.getElementById(ROOT_ID);
    if(!root){root=document.createElement("section");root.id=ROOT_ID;root.className="hiyori-compact-dashboard";findMount()?.appendChild(root)}
    const s=status();
    root.innerHTML=`<div class="hiyori-compact-head"><div><small>分析・比較</small><h3>必要な要点だけ表示</h3></div><span>軽量表示</span></div><div class="hiyori-compact-grid">${card("🤖","AI予想",s.predictionLabel,s.predictionSub)}${card("🏁","公式との比較",s.officialLabel,s.officialSub)}${card("🌤","ボートレース日和",s.hiyoriLabel,s.hiyoriSub)}</div><button type="button" class="hiyori-detail-button">開発・診断を開く</button><p class="hiyori-compact-note">詳細診断はボタンを押した時だけ読み込みます。予想ロジック・買い目は変更しません。</p>`;
    root.querySelector(".hiyori-detail-button")?.addEventListener("click",e=>loadDetails(e.currentTarget));
    suppressLegacyPanels();
  }
  function install(){
    const style=document.createElement("style");style.id="hiyoriCompactDashboardStyle";style.textContent=`
      .${HIDDEN_CLASS}{display:none!important}
      #hiyoriOperationsDashboard[hidden]{display:none!important}
      .hiyori-compact-dashboard{margin-top:16px;padding:14px;border:1px solid #dbe6f3;border-radius:16px;background:#fff;content-visibility:auto;contain-intrinsic-size:420px}
      .hiyori-compact-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.hiyori-compact-head small{color:#64748b;font-weight:700}.hiyori-compact-head h3{margin:2px 0 0;font-size:18px}.hiyori-compact-head span{font-size:11px;padding:4px 8px;border-radius:999px;background:#ecfdf5;color:#166534;font-weight:700}
      .hiyori-compact-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.hiyori-compact-card{min-width:0;padding:12px;border:1px solid #e2e8f0;border-radius:13px;background:#f8fafc;display:flex;gap:9px;align-items:flex-start}.hiyori-compact-icon{font-size:20px;line-height:1}.hiyori-compact-copy{min-width:0}.hiyori-compact-copy strong,.hiyori-compact-copy b,.hiyori-compact-copy small{display:block}.hiyori-compact-copy strong{font-size:12px;color:#475569}.hiyori-compact-copy b{margin-top:4px;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hiyori-compact-copy small{margin-top:4px;color:#64748b;line-height:1.4}
      .hiyori-detail-button{width:100%;margin-top:10px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:11px;background:#fff;font-weight:700;cursor:pointer}.hiyori-detail-button:disabled{opacity:.6}.hiyori-compact-note{margin:8px 2px 0;font-size:11px;color:#64748b;line-height:1.5}
      @media(max-width:720px){.hiyori-compact-grid{grid-template-columns:1fr}.hiyori-compact-card{padding:11px}.hiyori-compact-dashboard{padding:12px}}
    `;if(!document.getElementById(style.id))document.head.appendChild(style);
    startLegacyObserver();
    render();
    ["chappy:prediction-ready","chappy:race-result-ready","chappy:hiyori-learning-correlation-updated","chappy:hiyori-correlation-confidence-updated","chappy:hiyori-learning-adoption-updated","chappy:hiyori-adoption-proposals-updated"].forEach(name=>window.addEventListener(name,()=>requestAnimationFrame(render)));
  }
  window.ChappyHiyoriCompactDashboard={render,loadDetails,status,suppressLegacyPanels};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();