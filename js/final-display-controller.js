(function(root){
  "use strict";
  if(!root||!root.document)return;

  const BUILD="20260905-final-display-owner1";
  const WRAPPED="__chappyFinalDisplayOwnerWrapped";
  let latestPrediction=null;
  let missingScheduled=false;

  const text=value=>String(value??"").trim();
  const rows=value=>Array.isArray(value)?value:(value?[value]:[]);
  const esc=value=>text(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);

  function exactTicket(value){
    const raw=text(value).replace(/\s+/g,"").replace(/→/g,"-");
    const match=raw.match(/[1-6]-[1-6]-[1-6]/);
    if(!match)return"";
    const parts=match[0].split("-");
    return new Set(parts).size===3?match[0]:"";
  }

  function ticketText(row){
    if(typeof row==="string")return row;
    if(!row||typeof row!=="object")return"";
    return text(row.ticket||row.line||row.notation||row.flowNotation||row.flowFormation||row.formation?.notation||row.formation);
  }

  function numericOdds(value){
    if(value===null||value===undefined||value==="")return null;
    const n=Number(String(value).replace(/倍/g,"").trim());
    return Number.isFinite(n)&&n>0?n:null;
  }

  function expandNotation(value){
    const raw=text(value).replace(/\s+/g,"");
    const parts=raw.split("-");
    if(parts.length!==3)return[];
    const group=v=>[...new Set(String(v).replace(/全/g,"123456").split(""))].filter(x=>/^[1-6]$/.test(x));
    const out=[];
    group(parts[0]).forEach(a=>group(parts[1]).forEach(b=>group(parts[2]).forEach(c=>{
      if(new Set([a,b,c]).size===3)out.push(`${a}-${b}-${c}`);
    })));
    return[...new Set(out)];
  }

  function courseOf(prediction,boatNo){
    const n=Number(boatNo);
    const direct=Number(prediction?.indexes?.byBoat?.[n]?.course);
    if(Number.isInteger(direct)&&direct>=1&&direct<=6)return direct;
    const core=root.ChappyAICore;
    const source=prediction?.preRaceConditions||prediction?.race?.raw||prediction?.race||prediction;
    try{
      if(typeof core?.getRaceEntries==="function"&&typeof core?.buildOfficialCourseMapping==="function"){
        const mapping=core.buildOfficialCourseMapping(core.getRaceEntries(source).map((entry,index)=>({...entry,boat:Number(entry?.boat??entry?.boatNo??index+1)})));
        const mapped=Number(mapping?.courseOfBoat?.(n));
        if(mapping?.formal===true&&Number.isInteger(mapped)&&mapped>=1&&mapped<=6)return mapped;
      }
    }catch(_error){}
    return n;
  }

  function headAction(course){return({1:"イン先マイ",2:"2コース差し",3:"3コース攻め",4:"4カド攻め",5:"5コースまくり差し",6:"6コース最内差し"})[course]||"1着展開";}
  function secondAction(course){return({1:"イン残し",2:"差し残り",3:"センター残り",4:"カド残り",5:"展開拾い",6:"道中拾い"})[course]||"2着残し";}
  function thirdAction(course){return({1:"インの3着残り",2:"差し残りの3着",3:"センターの3着",4:"カドの3着",5:"外の3着拾い",6:"最内の3着拾い"})[course]||"3着拾い";}

  function reasonFor(ticket,prediction){
    const exact=exactTicket(ticket);
    if(!exact)return"";
    const[a,b,c]=exact.split("-").map(Number);
    return `${a}号艇の${headAction(courseOf(prediction,a))}を軸に、${b}号艇の${secondAction(courseOf(prediction,b))}を2着、${c}号艇の${thirdAction(courseOf(prediction,c))}を3着で評価。`;
  }

  function decorateList(list,prediction){
    if(!Array.isArray(list))return list;
    return list.map(row=>{
      if(!row||typeof row!=="object")return row;
      const reason=reasonFor(ticketText(row),prediction);
      return reason?{...row,reason,scenarioSummary:reason}:row;
    });
  }

  function buildFlowFormations(list,prediction){
    const groups=new Map();
    rows(list).forEach(row=>{
      const ticket=exactTicket(ticketText(row));
      if(!ticket)return;
      const[a,b,c]=ticket.split("-");
      const key=`${a}-${b}`;
      if(!groups.has(key))groups.set(key,{a,b,thirds:new Set(),tickets:[]});
      const group=groups.get(key);
      group.thirds.add(c);
      if(!group.tickets.includes(ticket))group.tickets.push(ticket);
    });
    return[...groups.values()].filter(group=>group.tickets.length>=2).map(group=>{
      const thirds=[...group.thirds].sort((a,b)=>Number(a)-Number(b));
      return{
        notation:`${group.a}-${group.b}-${thirds.join("")}`,
        pointCount:group.tickets.length,
        expandedTickets:[...group.tickets],
        reason:`${group.a}号艇の${headAction(courseOf(prediction,group.a))}を軸に、${group.b}号艇を2着固定、3着${thirds.join("・")}号艇へ展開。`
      };
    });
  }

  function fallbackOddsMap(prediction){
    const map=new Map();
    const seen=new WeakSet();
    const record=(ticket,value)=>{const key=exactTicket(ticket);const odds=numericOdds(value);if(key&&odds&&!map.has(key))map.set(key,odds);};
    const walk=(value,depth=0)=>{
      if(depth>8||value===null||value===undefined)return;
      if(Array.isArray(value)){value.forEach(item=>walk(item,depth+1));return;}
      if(typeof value!=="object"||seen.has(value))return;
      seen.add(value);
      record(ticketText(value),value.odds??value.currentOdds??value.finalOdds??value.value??value.oddsText);
      Object.entries(value).forEach(([key,child])=>{
        if(/^[1-6]-[1-6]-[1-6]$/.test(key))record(key,typeof child==="object"&&child?child.odds??child.currentOdds??child.finalOdds??child.value??child.oddsText:child);
        walk(child,depth+1);
      });
    };
    walk(prediction);
    return map;
  }

  function buildOddsMap(prediction){
    try{if(typeof root.ChappyFinalMobileUi?.buildOddsMap==="function")return root.ChappyFinalMobileUi.buildOddsMap(prediction);}catch(_error){}
    return fallbackOddsMap(prediction);
  }

  function buildManshuFormations(prediction){
    const oddsMap=buildOddsMap(prediction);
    const candidates=[];
    const seen=new Set();
    const push=ticket=>{
      const exact=exactTicket(ticket);
      const odds=exact?numericOdds(oddsMap.get(exact)):null;
      if(!exact||!odds||odds<100||seen.has(exact))return;
      seen.add(exact);candidates.push({ticket:exact,odds});
    };
    rows(prediction?.manshuSheet?.tickets||prediction?.ticketSheets?.hole).forEach(row=>{
      const notation=ticketText(row);const exact=exactTicket(notation);if(exact)push(exact);else expandNotation(notation).forEach(push);
    });
    rows(prediction?.lightManshuTicketBoard?.lines).forEach(line=>expandNotation(ticketText(line)).forEach(push));
    const groups=new Map();
    candidates.forEach(row=>{
      const[a,b,c]=row.ticket.split("-");const key=`${a}-${b}`;
      if(!groups.has(key))groups.set(key,{a,b,thirds:new Set(),tickets:[],odds:[]});
      const group=groups.get(key);group.thirds.add(c);group.tickets.push(row.ticket);group.odds.push(row.odds);
    });
    return[...groups.values()].filter(group=>group.tickets.length>=2).map(group=>{
      const thirds=[...group.thirds].sort((a,b)=>Number(a)-Number(b));
      return{notation:`${group.a}-${group.b}-${thirds.join("")}`,pointCount:group.tickets.length,expandedTickets:[...group.tickets],minOdds:Math.min(...group.odds),maxOdds:Math.max(...group.odds)};
    }).sort((a,b)=>b.minOdds-a.minOdds).slice(0,6);
  }

  function practicalRows(prediction){
    const result=prediction?.practicalSelection||prediction?.practicalResult||prediction?.practical||{};
    const source=Array.isArray(result)?result:(result?.tickets||prediction?.practicalTickets||[]);
    const seen=new Set();
    return rows(source).map(row=>{
      const notation=ticketText(row);if(!notation||seen.has(notation))return null;seen.add(notation);
      const units=Number(row?.unitsPerTicket??row?.units??row?.betUnits??row?.allocation?.units??0);
      const direct=Number(row?.amountYen??row?.amount??row?.betAmount??row?.purchaseAmount??row?.allocation?.amountYen??0);
      const amount=Number.isFinite(direct)&&direct>0?direct:(Number.isFinite(units)&&units>0?units*100:null);
      return{notation,amount:Number.isFinite(amount)?amount:null};
    }).filter(Boolean);
  }

  function prepare(prediction){
    if(!prediction||typeof prediction!=="object")return prediction;
    const next={...prediction};
    const rawFlow=prediction.mainSheet?.flowTickets||prediction.ticketSheets?.flow||prediction.formation?.nagashi||prediction.formation?.flow||[];
    const flowFormations=Array.isArray(prediction.mainSheet?.flowFormations)&&prediction.mainSheet.flowFormations.length?prediction.mainSheet.flowFormations:buildFlowFormations(rawFlow,prediction);
    if(prediction.mainSheet)next.mainSheet={...prediction.mainSheet,tickets:decorateList(prediction.mainSheet.tickets,prediction),coverTickets:decorateList(prediction.mainSheet.coverTickets,prediction),flowTickets:decorateList(prediction.mainSheet.flowTickets,prediction),flowFormations};
    if(prediction.manshuSheet)next.manshuSheet={...prediction.manshuSheet,tickets:decorateList(prediction.manshuSheet.tickets,prediction)};
    if(prediction.ticketSheets)next.ticketSheets={...prediction.ticketSheets,main:decorateList(prediction.ticketSheets.main,prediction),cover:decorateList(prediction.ticketSheets.cover,prediction),flow:decorateList(prediction.ticketSheets.flow,prediction),hole:decorateList(prediction.ticketSheets.hole,prediction),all:decorateList(prediction.ticketSheets.all,prediction)};
    next.formation={...(prediction.formation||{}),flowFormations:Array.isArray(prediction.formation?.flowFormations)&&prediction.formation.flowFormations.length?prediction.formation.flowFormations:flowFormations};
    next.aiTicketList=decorateList(prediction.aiTicketList,prediction);
    next.manshuFormations=buildManshuFormations(next);
    next.finalPurchaseRows=practicalRows(next);
    return next;
  }

  function manshuHtml(prediction){
    const groups=prediction?.manshuFormations||buildManshuFormations(prediction);
    if(!groups.length)return `<div class="chappy-true-manshu-empty">100倍以上だけで組める複数点フォーメーションはありません。単券1点は万舟欄に表示しません。</div>`;
    return `<div class="chappy-true-manshu-board chappy-manshu-formation-board"><div class="chappy-true-manshu-head"><strong>万舟フォーメーション ${groups.length}組</strong><span>全構成点100倍以上</span></div><p class="chappy-unified-note">実際に100倍以上を確認できた買い目だけをまとめています。</p><div class="chappy-manshu-formation-grid">${groups.map(group=>{const odds=group.minOdds===group.maxOdds?`${group.minOdds.toFixed(1)}倍`:`${group.minOdds.toFixed(1)}〜${group.maxOdds.toFixed(1)}倍`;return `<article class="chappy-manshu-formation-row"><div class="chappy-manshu-formation-main"><strong>${esc(group.notation)}</strong><span class="chappy-manshu-formation-meta">${group.pointCount}点<br>${odds}</span></div></article>`;}).join("")}</div></div>`;
  }

  function rewriteManshu(prediction){
    const section=root.document.querySelector("#resultArea .v3-manshu-newspaper");
    if(!section)return;
    const body=section.querySelector(".v3-section-body")||section;
    body.innerHTML=manshuHtml(prediction);
  }

  function rewritePractical(prediction){
    const section=root.document.querySelector("#resultArea .v3-practical-section");
    if(!section)return;
    const body=section.querySelector(".v3-section-body");
    if(!body)return;
    const list=prediction?.finalPurchaseRows||practicalRows(prediction);
    body.innerHTML=list.length?`<div class="chappy-final-purchase"><p class="chappy-unified-note">本命・押さえ等の説明は繰り返さず、最終的に購入する買い目だけを表示します。</p><div class="chappy-final-purchase-list">${list.map(row=>`<article class="chappy-final-purchase-row"><strong>${esc(row.notation)}</strong><span>${row.amount?`${Math.round(row.amount).toLocaleString("ja-JP")}円`:"最終購入"}</span></article>`).join("")}</div></div>`:`<div class="chappy-final-purchase-empty">最終購入なし（見送り）</div>`;
  }

  function compactSection(section){
    if(!section||section.dataset.finalOwnerCollapsed==="1")return;
    const head=section.querySelector(":scope > .v3-section-head");
    const body=section.querySelector(":scope > .v3-section-body");
    const title=text(head?.textContent);
    if(!body||!/公式履歴|出てない目|TOP30|展開|理論|分析|最終コメント/.test(title))return;
    section.dataset.finalOwnerCollapsed="1";
    section.classList.add("chappy-structure11-secondary");
    const details=root.document.createElement("details");details.className="chappy-ui10-details";
    const summary=root.document.createElement("summary");summary.textContent="詳細を見る";details.appendChild(summary);
    while(body.firstChild)details.appendChild(body.firstChild);body.appendChild(details);
  }

  function applyLayout(){
    const area=root.document.getElementById("resultArea");if(!area)return;
    root.document.body?.classList.add("chappy-compact-ui10","chappy-mobile-structure11");
    area.querySelector(".v3-entry-section")?.classList.add("chappy-ui10-entry-compact");
    area.querySelector(".v3-boat-evaluation")?.classList.add("chappy-ui10-eval-compact");
    area.querySelector(".v3-practical-section")?.classList.add("chappy-ui10-practical-compact");
    area.querySelectorAll(".v3-section").forEach(compactSection);
  }

  function decorateMissingOdds(prediction){
    const area=root.document.getElementById("resultArea");if(!area||!prediction)return;
    const map=buildOddsMap(prediction);
    area.querySelectorAll(".v3-missing-numbers .v3-formation-row").forEach(row=>{
      const ticket=exactTicket(row.querySelector(".v3-formation-ticket")?.textContent);if(!ticket)return;
      const odds=map.get(ticket)||null;const tags=row.querySelector(".v3-formation-tags")||row;
      let badge=row.querySelector(".chappy-missing-odds");if(!badge){badge=root.document.createElement("span");tags.appendChild(badge);}
      badge.className=`chappy-missing-odds${odds?"":" is-missing"}`;badge.textContent=odds?`${Number(odds).toFixed(1)}倍`:"オッズ未取得";badge.dataset.ticket=ticket;
    });
  }

  function applyFinal(prediction){
    if(!prediction)return;
    rewriteManshu(prediction);
    rewritePractical(prediction);
    applyLayout();
    decorateMissingOdds(prediction);
  }

  function scheduleMissing(){
    if(missingScheduled)return;missingScheduled=true;
    root.requestAnimationFrame(()=>{missingScheduled=false;applyLayout();decorateMissingOdds(latestPrediction);});
  }

  const observer=new MutationObserver(mutations=>{
    if(!latestPrediction)return;
    const changed=mutations.some(m=>[...m.addedNodes].some(node=>node?.nodeType===1&&(node.matches?.(".v3-missing-numbers,.v3-missing-numbers *")||node.querySelector?.(".v3-missing-numbers"))));
    if(changed)scheduleMissing();
  });
  observer.observe(root.document.documentElement,{childList:true,subtree:true});

  function wrap(){
    const fn=root.renderAll;if(typeof fn!=="function"||fn[WRAPPED])return false;
    function wrapped(prediction){
      const prepared=prepare(prediction);latestPrediction=prepared;
      const value=fn.call(this,prepared);
      root.setTimeout(()=>applyFinal(prepared),20);
      return value;
    }
    wrapped[WRAPPED]=true;wrapped.__original=fn;root.renderAll=wrapped;return true;
  }

  let attempts=0;const timer=root.setInterval(()=>{attempts+=1;if(wrap()||attempts>240)root.clearInterval(timer);},50);
  root.ChappyFinalDisplayController=Object.freeze({build:BUILD,exactTicket,reasonFor,buildFlowFormations,buildManshuFormations,practicalRows,prepare,applyFinal,decorateMissingOdds});
})(typeof window!=="undefined"?window:null);
