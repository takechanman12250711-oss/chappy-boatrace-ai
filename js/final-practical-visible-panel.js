(function(root){
  "use strict";
  if(!root||!root.document)return;
  const HOOK="__chappyPracticalVisiblePanelWrapped";
  let latestPrediction=null;
  const text=v=>String(v??"").trim();
  const esc=v=>text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
  function exactTicket(v){const raw=text(v).replace(/\s+/g,"").replace(/→/g,"-");const p=raw.split("-");return p.length===3&&p.every(x=>/^[1-6]$/.test(x))&&new Set(p).size===3?raw:"";}
  function ticketText(row){if(typeof row==="string")return row;if(!row||typeof row!=="object")return"";return text(row.ticket||row.line||row.notation||row.flowNotation||row.flowFormation||row.formation?.notation||row.formation);}
  function selectedRows(pred){
    try{
      const api=root.ChappyFinalDisplayOwner;
      if(typeof api?.practicalRows==="function")return api.practicalRows(pred).map(r=>({ticket:exactTicket(r.notation)})).filter(r=>r.ticket);
    }catch(_e){}
    const direct=pred?.practicalSelection||pred?.practicalResult||pred?.practical||{};
    const source=Array.isArray(direct)?direct:(direct.tickets||pred?.practicalTickets||[]);
    const seen=new Set();
    return (Array.isArray(source)?source:[]).map(row=>exactTicket(ticketText(row))).filter(ticket=>ticket&&!seen.has(ticket)&&seen.add(ticket)).map(ticket=>({ticket}));
  }
  function oddsMap(pred){
    try{if(typeof root.ChappyFinalMobileUi?.buildOddsMap==="function")return root.ChappyFinalMobileUi.buildOddsMap(pred);}catch(_e){}
    try{if(typeof root.ChappyFinalDisplayOwner?.buildOddsMap==="function")return root.ChappyFinalDisplayOwner.buildOddsMap(pred);}catch(_e){}
    return new Map();
  }
  function ensureStyle(){
    if(root.document.getElementById("chappy-practical-visible-panel-style"))return;
    const style=root.document.createElement("style");
    style.id="chappy-practical-visible-panel-style";
    style.textContent=`
      .chappy-practical-visible-panel{margin:10px 0;border:1px solid rgba(92,224,145,.38);border-radius:14px;background:#0c1c22;overflow:hidden}.chappy-practical-visible-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:rgba(72,190,122,.1)}.chappy-practical-visible-head strong{font-size:15px;color:#d8ffe5}.chappy-practical-visible-head span{font-size:11px;font-weight:900;color:#9df3bd}.chappy-practical-visible-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding:10px}.chappy-practical-visible-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 9px;border-radius:9px;background:#10252d;min-width:0}.chappy-practical-visible-row strong{font-size:15px;color:#fff;white-space:nowrap}.chappy-practical-visible-row span{font-size:11px;font-weight:900;color:#8fd3ff;white-space:nowrap}@media(max-width:360px){.chappy-practical-visible-list{grid-template-columns:1fr}}
    `;
    root.document.head.appendChild(style);
  }
  function render(pred){
    if(!pred||typeof pred!=="object")return;
    latestPrediction=pred;
    ensureStyle();
    const area=root.document.getElementById("resultArea");
    if(!area)return;
    area.querySelectorAll?.(".chappy-practical-visible-panel").forEach(node=>node.remove());
    const selected=selectedRows(pred);
    if(!selected.length)return;
    const map=oddsMap(pred);
    const html=`<section class="chappy-practical-visible-panel"><div class="chappy-practical-visible-head"><strong>実戦厳選</strong><span>${selected.length}点</span></div><div class="chappy-practical-visible-list">${selected.map(row=>{const odds=Number(map.get(row.ticket));return`<div class="chappy-practical-visible-row"><strong>${esc(row.ticket)}</strong><span>${Number.isFinite(odds)&&odds>0?`${odds.toFixed(1)}倍`:"オッズ未取得"}</span></div>`;}).join("")}</div></section>`;
    const anchor=area.querySelector?.(".chappy-final-buy-summary")||area.querySelector?.(".v3-boat-evaluation")||area.querySelector?.(".v3-main-newspaper");
    if(anchor)anchor.insertAdjacentHTML("afterend",html);else area.insertAdjacentHTML?.("afterbegin",html);
  }
  function wrap(){
    const fn=root.renderAll;
    if(typeof fn!=="function"||fn[HOOK])return false;
    function wrapped(pred){const value=fn.apply(this,arguments);latestPrediction=pred;root.setTimeout(()=>render(pred),80);root.setTimeout(()=>render(pred),500);return value;}
    wrapped[HOOK]=true;wrapped.__original=fn;root.renderAll=wrapped;return true;
  }
  ensureStyle();wrap();
  let tries=0;const timer=root.setInterval(()=>{wrap();tries++;if(tries>=160)root.clearInterval(timer);},100);
  root.document.addEventListener?.("visibilitychange",()=>{if(root.document.visibilityState==="visible"&&latestPrediction)render(latestPrediction);});
  root.ChappyPracticalVisiblePanel=Object.freeze({render,selectedRows});
})(typeof window!=="undefined"?window:null);
