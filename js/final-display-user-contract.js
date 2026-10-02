(function(root){
  "use strict";
  if(!root||!root.document)return;
  const BUILD="20260909-ticket-visibility-fallback1";

  function text(node){return String(node?.textContent||"").replace(/\s+/g," ").trim();}

  function renameFlow(summaryRoot){
    summaryRoot.querySelectorAll?.(".chappy-final-buy-group.is-flow .chappy-final-buy-label").forEach(node=>{
      if(text(node)!=="流し")node.textContent="流し";
    });
  }

  function renameManshu(area){
    const section=area.querySelector?.(".v3-manshu-newspaper");
    if(!section)return;
    section.querySelectorAll(".v3-section-head h2,.v3-section-head h3,.v3-paper-section-head h2,.v3-paper-section-head h3,summary>span:first-child").forEach(node=>{
      const label=text(node);
      if(label==="穴"||label==="▲ 穴"||label==="万舟・穴"||label==="穴候補")node.textContent="万舟";
    });
  }

  function hideDuplicateLegacyTickets(area){
    // The compact AI ticket card above is the approved presentation. The old
    // newspaper ticket accordion below duplicates the same main/cover/flow
    // rows and was the source of the large white/empty formation panel on iPhone.
    // Keep the source accordion visible when the compact card could not be built;
    // otherwise all main/cover/flow tickets disappear while only manshu remains.
    const compactTickets=area.querySelector?.(".chappy-final-buy-summary .chappy-final-buy-line");
    area.querySelectorAll?.(".v3-main-newspaper").forEach(section=>{
      section.hidden=Boolean(compactTickets);
      if(compactTickets){
        section.setAttribute("aria-hidden","true");
        section.dataset.userContractHidden="1";
      }else{
        section.removeAttribute?.("aria-hidden");
        delete section.dataset.userContractHidden;
      }
    });
  }

  function apply(){
    const area=root.document.getElementById("resultArea");
    if(!area)return;
    renameFlow(area);
    renameManshu(area);
    hideDuplicateLegacyTickets(area);
  }

  function installStyle(){
    if(root.document.getElementById("chappy-final-display-user-contract-style"))return;
    const style=root.document.createElement("style");
    style.id="chappy-final-display-user-contract-style";
    style.textContent=`
      .chappy-final-mobile-ui #resultArea .v3-main-newspaper[data-user-contract-hidden="1"]{display:none!important;}
      .chappy-final-mobile-ui #resultArea .chappy-final-buy-group.is-flow>summary::before{background:#9c72ff!important;}
    `;
    root.document.head.appendChild(style);
  }

  installStyle();
  apply();
  const Observer=root.MutationObserver||function(){this.observe=function(){};};
  const observer=new Observer(()=>apply());
  observer.observe(root.document.documentElement,{childList:true,subtree:true});
  root.addEventListener?.("DOMContentLoaded",apply,{once:true});
  root.ChappyFinalDisplayUserContract=Object.freeze({build:BUILD,apply});
})(typeof window!=="undefined"?window:null);
