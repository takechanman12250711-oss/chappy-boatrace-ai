// 通常利用向けの分析・公式比較・日和コンパクト表示。
// 予想ロジック・印・配点・買い目には接続しない。
(function(){
  "use strict";
  const ROOT_ID="hiyoriCompactDashboard";
  const HIDDEN_CLASS="chappy-compact-hidden-legacy";
  const OPEN_CLASS="chappy-compact-open-legacy";
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
  const AUXILIARY_ROOT_IDS=[
    "referenceTagReportArea",
    "frameRiseSinkReport",
    "venueFrameStatusHistory",
    "venueFrameOperationsDashboard",
    "venueFrameDataHealth",
    "venueFrameDataQuarantine",
    "venueFrameRecoveryCandidates",
    "venueFrameManualRestore",
    "venueFrameRecoveryAuditReport"
  ];
  const openKinds=new Set();
  let detailLoading=false;
  let detailLoaded=false;
  let observer=null;

  function read(key,fallback){try{return JSON.parse(localStorage.getItem(key)||"null")??fallback}catch(_){return fallback}}
  function count(value){if(Array.isArray(value))return value.length;if(Array.isArray(value?.items))return value.items.length;if(Array.isArray(value?.rows))return value.rows.length;if(Array.isArray(value?.proposals))return value.proposals.length;return value?1:0}
  function findMount(){return document.getElementById("resultSection")||document.querySelector("main")||document.body}
  function loadScript(src){return new Promise(resolve=>{if([...document.scripts].some(s=>s.src&&s.src.includes(src))){resolve();return}const s=document.createElement("script");s.src=src;s.async=false;s.onload=resolve;s.onerror=resolve;document.head.appendChild(s)})}

  function markLegacyPanels(){
    const resultSection=document.getElementById("resultSection");
    const hiyoriRoots=[...document.querySelectorAll(
      'section[id^="hiyori"],article[id^="hiyori"],div[id^="hiyori"]'
    )].filter(el=>
      el.id!==ROOT_ID &&
      resultSection?.contains(el) &&
      !el.parentElement?.closest(
        'section[id^="hiyori"],article[id^="hiyori"],div[id^="hiyori"]'
      )
    );
    hiyoriRoots.forEach(el=>{
      el.dataset.compactKind="hiyori";
      el.classList.add(HIDDEN_CLASS);
    });
    AUXILIARY_ROOT_IDS.forEach(id=>{
      const el=document.getElementById(id);
      if(!el||!resultSection?.contains(el))return;
      el.dataset.compactKind="auxiliary";
      el.classList.add(HIDDEN_CLASS);
    });
    applyOpenState();
  }

  function applyOpenState(){
    document.querySelectorAll("[data-compact-kind]").forEach(el=>{
      const opened=openKinds.has(el.dataset.compactKind);
      el.classList.toggle(HIDDEN_CLASS,!opened);
      el.classList.toggle(OPEN_CLASS,opened);
      if(opened)el.hidden=false;
    });
  }

  function startLegacyObserver(){
    if(observer)return;
    markLegacyPanels();
    observer=new MutationObserver(()=>requestAnimationFrame(markLegacyPanels));
    observer.observe(document.body,{childList:true,subtree:true});
  }

  async function ensureHiyoriDetails(button){
    if(detailLoaded)return true;
    if(detailLoading)return false;
    detailLoading=true;
    button.disabled=true;
    button.textContent="日和データを読み込み中…";
    for(const src of DETAIL_SCRIPTS)await loadScript(src);
    detailLoaded=true;
    detailLoading=false;
    button.disabled=false;
    markLegacyPanels();
    return true;
  }

  function status(){
    const correlation=read("chappy_hiyori_correlation_confidence_v1",read("chappy_hiyori_learning_correlation_v1",null));
    const candidates=read("chappy_hiyori_learning_adoption_candidates_v1",read("chappy_hiyori_adoption_candidates_v1",[]));
    const proposals=read("chappy_hiyori_adoption_proposals_v1",read("chappy_hiyori_change_proposals_v1",[]));
    const approval=read("chappy_hiyori_proposal_approval_v1",null);
    const correlationScore=Number(correlation?.score??correlation?.confidence??correlation?.correlationScore);
    const sampleCount=Number(correlation?.sampleCount??correlation?.samples??0);
    const proposalCount=count(proposals),candidateCount=count(candidates);
    const approved=approval?.status==="approved"||approval?.approved===true;
    return{
      auxiliaryLabel:"枠・場データ",
      auxiliarySub:"枠の浮沈・場別傾向・収集データの状態",
      hiyoriLabel:approved?"補助評価：承認済み":proposalCount?`補助評価：提案 ${proposalCount}件`:candidateCount?`補助評価：候補 ${candidateCount}件`:"補助評価：待機中",
      hiyoriSub:Number.isFinite(correlationScore)?`相関 ${Math.round(correlationScore)}点・サンプル ${sampleCount}件`:"相関・候補・提案・検証データ"
    };
  }

  function card(kind,icon,title,value,sub){
    const opened=openKinds.has(kind);
    return `<section class="hiyori-compact-card" data-card-kind="${kind}"><div class="hiyori-compact-row"><div class="hiyori-compact-icon">${icon}</div><div class="hiyori-compact-copy"><strong>${title}</strong><b>${value}</b><small>${sub}</small></div></div><button type="button" class="hiyori-card-toggle" data-kind="${kind}" aria-expanded="${opened}">${opened?"▲ 閉じる":"▼ 詳細を見る"}</button></section>`;
  }

  async function toggleKind(kind,button){
    const opening=!openKinds.has(kind);
    if(opening&&kind==="hiyori"){
      const loaded=await ensureHiyoriDetails(button);
      if(!loaded)return;
    }
    if(opening)openKinds.add(kind);else openKinds.delete(kind);
    markLegacyPanels();
    render();
    if(opening){
      const first=document.querySelector(`[data-compact-kind="${kind}"]`);
      if(first)setTimeout(()=>first.scrollIntoView({behavior:"smooth",block:"start"}),50);
    }
  }

  function render(){
    let root=document.getElementById(ROOT_ID);
    if(!root){root=document.createElement("section");root.id=ROOT_ID;root.className="hiyori-compact-dashboard";findMount()?.append(root)}
    const s=status();
    root.innerHTML=`<div class="hiyori-compact-head"><div><small>補助分析</small><h3>必要な時だけ詳細表示</h3></div><span>軽量表示</span></div><div class="hiyori-compact-grid">${card("auxiliary","🧭","枠・場の補助データ",s.auxiliaryLabel,s.auxiliarySub)}${card("hiyori","🌤","ボートレース日和",s.hiyoriLabel,s.hiyoriSub)}</div><p class="hiyori-compact-note">結果分析ダッシュボード以外の補助パネルは、ここから必要な種類だけ開けます。</p>`;
    root.querySelectorAll(".hiyori-card-toggle").forEach(button=>button.addEventListener("click",()=>toggleKind(button.dataset.kind,button)));
    markLegacyPanels();
  }

  function install(){
    const style=document.createElement("style");style.id="hiyoriCompactDashboardStyle";style.textContent=`
      .${HIDDEN_CLASS}{display:none!important}
      .${OPEN_CLASS}{display:block!important}
      .hiyori-compact-dashboard{margin-top:16px;padding:14px;border:1px solid #dbe6f3;border-radius:16px;background:#fff;content-visibility:auto;contain-intrinsic-size:430px}
      .hiyori-compact-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}.hiyori-compact-head small{color:#64748b;font-weight:700}.hiyori-compact-head h3{margin:2px 0 0;font-size:18px}.hiyori-compact-head span{font-size:11px;padding:4px 8px;border-radius:999px;background:#ecfdf5;color:#166534;font-weight:700}
      .hiyori-compact-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.hiyori-compact-card{min-width:0;padding:12px;border:1px solid #e2e8f0;border-radius:13px;background:#f8fafc}.hiyori-compact-row{display:flex;gap:9px;align-items:flex-start}.hiyori-compact-icon{font-size:20px;line-height:1}.hiyori-compact-copy{min-width:0}.hiyori-compact-copy strong,.hiyori-compact-copy b,.hiyori-compact-copy small{display:block}.hiyori-compact-copy strong{font-size:12px;color:#475569}.hiyori-compact-copy b{margin-top:4px;font-size:14px}.hiyori-compact-copy small{margin-top:4px;color:#64748b;line-height:1.4}
      .hiyori-card-toggle{width:100%;margin-top:10px;padding:9px 10px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-weight:700;cursor:pointer}.hiyori-card-toggle:disabled{opacity:.6}.hiyori-compact-note{margin:9px 2px 0;font-size:11px;color:#64748b;line-height:1.5}
      [data-compact-kind].${OPEN_CLASS}{scroll-margin-top:12px}
      @media(max-width:720px){.hiyori-compact-grid{grid-template-columns:1fr}.hiyori-compact-card{padding:11px}.hiyori-compact-dashboard{padding:12px}}
    `;if(!document.getElementById(style.id))document.head.appendChild(style);
    startLegacyObserver();
    render();
    ["chappy:prediction-ready","chappy:race-result-ready","chappy:hiyori-learning-correlation-updated","chappy:hiyori-correlation-confidence-updated","chappy:hiyori-learning-adoption-updated","chappy:hiyori-adoption-proposals-updated"].forEach(name=>window.addEventListener(name,()=>requestAnimationFrame(render)));
  }

  window.ChappyHiyoriCompactDashboard={render,status,toggleKind,markLegacyPanels};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
})();
