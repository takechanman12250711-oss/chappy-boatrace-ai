(function(root){
  "use strict";
  if(!root||!root.document)return;

  const BUILD="20260905-missing-odds-refresh1";
  const WRAPPED="__chappyMissingOddsRefreshWrapped";
  let latestPrediction=null;
  let scheduled=false;

  function text(value){return String(value??"").trim();}
  function normalizeExactTicket(value){
    const raw=text(value).replace(/^\d+位/,"").replace(/\s+/g,"").replace(/→/g,"-");
    const match=raw.match(/[1-6]-[1-6]-[1-6]/);
    if(!match)return"";
    const ticket=match[0];
    return new Set(ticket.split("-")).size===3?ticket:"";
  }
  function numericOdds(value){
    if(value===null||value===undefined||value==="")return null;
    const n=Number(String(value).replace(/倍/g,"").trim());
    return Number.isFinite(n)&&n>0?n:null;
  }
  function fallbackOddsMap(prediction){
    const map=new Map();
    const seen=new WeakSet();
    const record=(ticket,value)=>{
      const key=normalizeExactTicket(ticket);
      const odds=numericOdds(value);
      if(key&&odds&&!map.has(key))map.set(key,odds);
    };
    const walk=(value,depth=0)=>{
      if(depth>8||value===null||value===undefined)return;
      if(Array.isArray(value)){value.forEach(item=>walk(item,depth+1));return;}
      if(typeof value!=="object")return;
      if(seen.has(value))return;
      seen.add(value);
      const ticket=value.ticket||value.line||value.notation||value.formation?.notation||value.formation;
      record(ticket,value.odds??value.currentOdds??value.finalOdds??value.value??value.oddsText);
      Object.entries(value).forEach(([key,child])=>{
        if(/^[1-6]-[1-6]-[1-6]$/.test(key)){
          record(key,typeof child==="object"&&child?child.odds??child.currentOdds??child.finalOdds??child.value??child.oddsText:child);
        }
        walk(child,depth+1);
      });
    };
    walk(prediction);
    return map;
  }
  function oddsMap(prediction){
    try{
      const api=root.ChappyFinalMobileUi;
      if(api&&typeof api.buildOddsMap==="function")return api.buildOddsMap(prediction);
    }catch(_error){}
    return fallbackOddsMap(prediction);
  }
  function decorate(prediction){
    const area=root.document.getElementById("resultArea");
    if(!area||!prediction)return;
    const map=oddsMap(prediction);
    area.querySelectorAll(".v3-missing-numbers .v3-formation-row").forEach(row=>{
      const ticketNode=row.querySelector(".v3-formation-ticket");
      const ticket=normalizeExactTicket(ticketNode?.textContent);
      if(!ticket)return;
      const odds=map.get(ticket)||null;
      const tags=row.querySelector(".v3-formation-tags")||row;
      let badge=row.querySelector(".chappy-missing-odds");
      if(!badge){
        badge=root.document.createElement("span");
        badge.className="chappy-missing-odds";
        tags.appendChild(badge);
      }
      const wantedClass=`chappy-missing-odds${odds?"":" is-missing"}`;
      const wantedText=odds?`${Number(odds).toFixed(1)}倍`:"オッズ未取得";
      if(badge.className!==wantedClass)badge.className=wantedClass;
      if(badge.textContent!==wantedText)badge.textContent=wantedText;
      badge.dataset.ticket=ticket;
    });
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    root.requestAnimationFrame(()=>{
      scheduled=false;
      decorate(latestPrediction);
    });
  }
  function wrap(){
    const fn=root.renderAll;
    if(typeof fn!=="function"||fn[WRAPPED])return false;
    function wrapped(prediction){
      latestPrediction=prediction||latestPrediction;
      const value=fn.apply(this,arguments);
      root.setTimeout(schedule,0);
      return value;
    }
    wrapped[WRAPPED]=true;
    wrapped.__original=fn;
    root.renderAll=wrapped;
    return true;
  }

  const observer=new MutationObserver(mutations=>{
    if(!latestPrediction)return;
    const changed=mutations.some(mutation=>[...mutation.addedNodes].some(node=>{
      if(node?.nodeType!==1)return false;
      return node.matches?.(".v3-missing-numbers,.v3-missing-numbers *")||node.querySelector?.(".v3-missing-numbers");
    }));
    if(changed)schedule();
  });
  observer.observe(root.document.documentElement,{childList:true,subtree:true});

  let attempts=0;
  const timer=root.setInterval(()=>{
    attempts+=1;
    if(wrap()||attempts>240)root.clearInterval(timer);
  },50);

  root.ChappyMissingOddsRefresh=Object.freeze({build:BUILD,decorate,normalizeExactTicket});
})(typeof window!=="undefined"?window:null);
