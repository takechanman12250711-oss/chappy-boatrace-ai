(function(root){
  "use strict";

  if(!root||!root.document)return;
  const HOOK="__chappyTicketOddsVisibilityWrapped";
  let lastPrediction=null;

  function text(value){return String(value??"").trim();}
  function arrayify(value){return !value?[]:Array.isArray(value)?value:[value];}
  function numericOdds(value){
    if(value===null||value===undefined||value==="")return null;
    const n=Number(String(value).replace(/倍/g,"").trim());
    return Number.isFinite(n)&&n>0?n:null;
  }
  function exactTicket(value){
    const raw=text(value).replace(/\s+/g,"");
    const parts=raw.split("-");
    if(parts.length!==3||parts.some(part=>!/^[1-6]$/.test(part))||new Set(parts).size!==3)return "";
    return raw;
  }
  function notationOf(row){
    if(!row)return "";
    if(typeof row==="string")return text(row);
    return text(row.notation||row.formation?.notation||row.formation||row.ticket||row.line);
  }
  function expandNotation(value){
    const raw=text(value).replace(/\s+/g,"");
    const exact=exactTicket(raw);
    if(exact)return [exact];
    const groups=raw.split("-");
    if(groups.length!==3)return [];
    const normalize=part=>[...new Set(part.replace(/全/g,"123456").split(""))];
    const [first,second,third]=groups.map(normalize);
    if([first,second,third].some(group=>group.some(v=>!/^[1-6]$/.test(v))))return [];
    const out=[];
    first.forEach(a=>second.forEach(b=>third.forEach(c=>{
      if(new Set([a,b,c]).size===3)out.push(`${a}-${b}-${c}`);
    })));
    return [...new Set(out)];
  }
  function buildOddsMap(prediction){
    const map=new Map();
    const seen=new WeakSet();
    const record=(ticket,value)=>{
      const key=exactTicket(ticket);
      const odds=numericOdds(value);
      if(key&&odds&&!map.has(key))map.set(key,odds);
    };
    const walk=(value,depth=0)=>{
      if(depth>7||value===null||value===undefined)return;
      if(Array.isArray(value)){value.forEach(item=>walk(item,depth+1));return;}
      if(typeof value!=="object")return;
      if(seen.has(value))return;
      seen.add(value);
      record(notationOf(value),value.odds??value.currentOdds??value.finalOdds??value.oddsText);
      Object.entries(value).forEach(([key,child])=>{
        if(/^[1-6]-[1-6]-[1-6]$/.test(key)){
          if(typeof child==="object"&&child)record(key,child.odds??child.currentOdds??child.finalOdds??child.value??child.oddsText);
          else record(key,child);
        }
        walk(child,depth+1);
      });
    };
    [prediction?.mainSheet,prediction?.manshuSheet,prediction?.ticketSheets,prediction?.aiTicketList,prediction?.practicalSelection,prediction?.practicalTickets,prediction?.odds,prediction?.oddsByTicket,prediction?.trifectaOdds,prediction?.combinedOdds,prediction?.lightManshuTicketBoard].forEach(walk);
    return map;
  }
  function escapeHtml(value){
    return text(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;");
  }
  function manshuSources(prediction){
    const rows=[];
    arrayify(prediction?.manshuSheet?.tickets||prediction?.ticketSheets?.hole).forEach(row=>{
      const notation=notationOf(row);
      if(notation)rows.push({notation,reason:text(row?.reason||row?.scenarioSummary||row?.comment)});
    });
    arrayify(prediction?.lightManshuTicketBoard?.lines).forEach(line=>{
      const notation=notationOf(line);
      if(notation)rows.push({notation,reason:text(line?.reason||line?.scenarioSummary)});
    });
    const seen=new Set();
    return rows.filter(row=>{
      const key=row.notation.replace(/\s+/g,"");
      if(!key||seen.has(key))return false;
      seen.add(key);
      return true;
    });
  }
  function renderManshu(prediction,rootNode){
    const section=rootNode.querySelector(".v3-manshu-newspaper");
    if(!section)return;
    const body=section.querySelector(".v3-section-body")||section;
    const sources=manshuSources(prediction);
    if(!sources.length){
      body.innerHTML='<div class="chappy-true-manshu-empty">展開から選ばれた万舟候補はありません。</div>';
      return;
    }
    const oddsMap=buildOddsMap(prediction);
    body.innerHTML=`<div class="chappy-scenario-manshu-board v3-light-manshu-ticket-board">
      <div class="chappy-scenario-manshu-head"><strong>展開から選んだ万舟候補</strong><span>構成買い目のオッズを全表示</span></div>
      ${sources.map(source=>{
        const tickets=expandNotation(source.notation);
        const rows=tickets.length?tickets:[exactTicket(source.notation)].filter(Boolean);
        return `<article class="chappy-scenario-manshu-group v3-light-manshu-ticket-line">
          <div class="chappy-scenario-manshu-title"><strong>${escapeHtml(source.notation)}</strong><span>${rows.length||1}点</span></div>
          <div class="chappy-scenario-manshu-odds">${rows.map(ticket=>{
            const odds=oddsMap.get(ticket);
            return `<span><b>${escapeHtml(ticket)}</b><em>${odds?`${odds.toFixed(1)}倍`:"オッズ未取得"}</em></span>`;
          }).join("")}</div>
          ${source.reason?`<p>${escapeHtml(source.reason)}</p>`:""}
        </article>`;
      }).join("")}
    </div>`;
  }
  function ticketFromNode(row){
    const explicit=text(row.getAttribute("data-flow-notation"));
    if(explicit)return explicit;
    const ticketNode=row.querySelector(".v3-formation-ticket");
    const rank=text(ticketNode?.querySelector(".v3-missing-rank")?.textContent);
    const raw=text(ticketNode?.textContent).replace(rank,"").replace(/^\d+位/,"");
    const digits=raw.match(/[1-6]/g)||[];
    if(digits.length===3&&new Set(digits).size===3)return digits.join("-");
    return raw.replace(/→/g,"-").replace(/\s+/g,"");
  }
  function compactMissingDays(row){
    row.querySelectorAll(".v3-tag-manshu").forEach(tag=>{
      const original=text(tag.textContent);
      let compact=original.replace(/^(\d+)日以上未出$/,"$1日+").replace(/^(\d+)日未出$/,"$1日");
      if(compact!==original){tag.title=original;tag.textContent=compact;tag.classList.add("chappy-missing-days-compact");}
    });
  }
  function renderMissingOdds(prediction,rootNode){
    const oddsMap=buildOddsMap(prediction);
    rootNode.querySelectorAll(".v3-missing-numbers .v3-formation-row").forEach(row=>{
      compactMissingDays(row);
      row.querySelectorAll(".chappy-missing-odds,.chappy-missing-all-odds").forEach(node=>node.remove());
      const notation=ticketFromNode(row);
      const tickets=expandNotation(notation);
      const list=tickets.length?tickets:[exactTicket(notation)].filter(Boolean);
      if(!list.length)return;
      const box=root.document.createElement("div");
      box.className="chappy-missing-all-odds";
      list.forEach(ticket=>{
        const item=root.document.createElement("span");
        const odds=oddsMap.get(ticket);
        item.className="chappy-missing-odds-value";
        item.innerHTML=`<em>${odds?`${odds.toFixed(1)}倍`:"オッズ未取得"}</em>`;
        box.appendChild(item);
      });
      row.appendChild(box);
    });
  }
  function ensureStyles(){
    if(root.document.getElementById("chappy-ticket-odds-visibility-style"))return;
    const style=root.document.createElement("style");
    style.id="chappy-ticket-odds-visibility-style";
    style.textContent=`
      .chappy-scenario-manshu-board{display:grid;gap:10px}.chappy-scenario-manshu-head{display:flex;justify-content:space-between;gap:10px;align-items:end}.chappy-scenario-manshu-head span{font-size:11px;opacity:.72}.chappy-scenario-manshu-group{border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px}.chappy-scenario-manshu-title{display:flex;justify-content:space-between;gap:10px;align-items:center}.chappy-scenario-manshu-title>strong{font-size:17px}.chappy-scenario-manshu-title>span{font-size:11px;opacity:.7}.chappy-scenario-manshu-odds{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:8px}.chappy-scenario-manshu-odds>span{display:flex;justify-content:space-between;gap:6px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.055);font-size:11px}.chappy-scenario-manshu-odds b{font-weight:800}.chappy-scenario-manshu-odds em,.chappy-missing-all-odds em{font-style:normal;white-space:nowrap}.chappy-scenario-manshu-group p{margin:8px 0 0;font-size:12px;line-height:1.55;opacity:.86}.chappy-missing-days-compact{padding-left:6px!important;padding-right:6px!important;white-space:nowrap}.chappy-missing-all-odds{display:flex;align-items:center;width:100%;grid-column:1/-1;margin-top:4px}.chappy-missing-all-odds>span{display:inline-flex;align-items:center;min-height:25px;padding:4px 8px;border-radius:8px;background:rgba(255,255,255,.055);color:#d8e8f3;font-size:11px;font-weight:800}
    `;
    root.document.head.appendChild(style);
  }
  function enhance(prediction){
    if(!prediction||typeof prediction!=="object")return;
    lastPrediction=prediction;
    ensureStyles();
    const resultArea=root.document.getElementById("resultArea");
    if(!resultArea)return;
    renderManshu(prediction,resultArea);
    renderMissingOdds(prediction,resultArea);
  }
  function wrapCurrent(){
    const fn=root.renderAll;
    if(typeof fn!=="function"||fn[HOOK])return false;
    function wrapped(prediction){
      const value=fn.apply(this,arguments);
      lastPrediction=prediction;
      root.setTimeout(()=>enhance(prediction),40);
      root.setTimeout(()=>enhance(prediction),450);
      return value;
    }
    wrapped[HOOK]=true;
    wrapped.__original=fn;
    root.renderAll=wrapped;
    return true;
  }
  function install(){
    ensureStyles();
    wrapCurrent();
    let tries=0;
    const timer=root.setInterval(()=>{
      wrapCurrent();
      tries+=1;
      if(tries>=150)root.clearInterval(timer);
    },100);
    root.addEventListener("chappy:prediction-runtime-ready",()=>{
      // The prediction renderer is lazy-loaded after the page has been open.
      // Rebind here even when the startup polling window has already ended.
      wrapCurrent();
    });
    root.document.addEventListener("visibilitychange",()=>{
      if(root.document.visibilityState==="visible"){wrapCurrent();if(lastPrediction)enhance(lastPrediction);}
    });
  }
  root.ChappyTicketOddsVisibility=Object.freeze({enhance,buildOddsMap,manshuSources,expandNotation,ticketFromNode});
  install();
})(typeof window!=="undefined"?window:null);
