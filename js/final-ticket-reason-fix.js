(function(root){
  "use strict";
  if(!root)return;

  const FLAG="__chappyTicketSpecificReasonWrapped";
  const STYLE_ID="chappy-unified-purchase-style";

  function exactTicket(value){
    const text=String(value||"").replace(/\s+/g,"").trim();
    return /^[1-6]-[1-6]-[1-6]$/.test(text)&&new Set(text.split("-")).size===3?text:"";
  }

  function ticketText(row){
    if(typeof row==="string")return row;
    if(!row||typeof row!=="object")return "";
    return String(row.ticket||row.line||row.notation||row.formation?.notation||row.formation||"").trim();
  }

  function numericOdds(value){
    if(value===null||value===undefined||value==="")return null;
    const n=Number(String(value).replace(/倍/g,"").trim());
    return Number.isFinite(n)&&n>0?n:null;
  }

  function courseOf(prediction,boatNo){
    const n=Number(boatNo);
    const byBoat=prediction?.indexes?.byBoat||{};
    const candidate=Number(byBoat?.[n]?.course??n);
    return Number.isInteger(candidate)&&candidate>=1&&candidate<=6?candidate:n;
  }

  function headAction(course){
    if(course===1)return "イン先マイ";
    if(course===2)return "2コース差し";
    if(course===3)return "3コース攻め";
    if(course===4)return "4カド攻め";
    if(course===5)return "5コースまくり差し";
    if(course===6)return "6コース最内差し";
    return "1着展開";
  }

  function secondAction(course){
    if(course===1)return "イン残し";
    if(course===2)return "差し残り";
    if(course===3)return "センター残り";
    if(course===4)return "カド残り";
    if(course===5)return "展開拾い";
    if(course===6)return "道中拾い";
    return "2着残し";
  }

  function thirdAction(course){
    if(course===1)return "インの3着残り";
    if(course===2)return "差し残りの3着";
    if(course===3)return "センターの3着";
    if(course===4)return "カドの3着";
    if(course===5)return "外の3着拾い";
    if(course===6)return "最内の3着拾い";
    return "3着拾い";
  }

  function reasonFor(ticket,prediction){
    const exact=exactTicket(ticket);
    if(!exact)return "";
    const [a,b,c]=exact.split("-").map(Number);
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
    if(!Array.isArray(list))return [];
    const groups=new Map();
    list.forEach(row=>{
      const exact=exactTicket(ticketText(row));
      if(!exact)return;
      const [a,b,c]=exact.split("-");
      const key=`${a}-${b}`;
      if(!groups.has(key))groups.set(key,{a,b,thirds:[],tickets:[]});
      const group=groups.get(key);
      if(!group.thirds.includes(c))group.thirds.push(c);
      if(!group.tickets.includes(exact))group.tickets.push(exact);
    });
    return [...groups.values()].map(group=>{
      group.thirds.sort((a,b)=>Number(a)-Number(b));
      const notation=`${group.a}-${group.b}-${group.thirds.join("")}`;
      const reasons=group.tickets.map(ticket=>reasonFor(ticket,prediction)).filter(Boolean);
      return {
        notation,
        pointCount:group.tickets.length,
        expandedTickets:[...group.tickets],
        reason:reasons.length===1?reasons[0]:`${group.a}号艇の${headAction(courseOf(prediction,group.a))}を軸に、${group.b}号艇を2着固定、3着${group.thirds.join("・")}号艇へ展開。`
      };
    });
  }

  function expandNotation(value){
    const raw=String(value||"").replace(/\s+/g,"").trim();
    const parts=raw.split("-");
    if(parts.length!==3)return [];
    const group=value=>[...new Set(String(value).replace(/全/g,"123456").split(""))].filter(v=>/^[1-6]$/.test(v));
    const first=group(parts[0]);
    const second=group(parts[1]);
    const third=group(parts[2]);
    const out=[];
    first.forEach(a=>second.forEach(b=>third.forEach(c=>{
      if(new Set([a,b,c]).size===3)out.push(`${a}-${b}-${c}`);
    })));
    return [...new Set(out)];
  }

  function buildOddsMap(prediction){
    if(root.ChappyFinalMobileUi?.buildOddsMap){
      try{return root.ChappyFinalMobileUi.buildOddsMap(prediction);}catch(_error){}
    }
    const map=new Map();
    const seen=new WeakSet();
    const record=(ticket,value)=>{
      const exact=exactTicket(ticket);
      const odds=numericOdds(value);
      if(exact&&odds&&!map.has(exact))map.set(exact,odds);
    };
    const walk=(value,depth=0)=>{
      if(depth>7||value===null||value===undefined)return;
      if(Array.isArray(value)){value.forEach(item=>walk(item,depth+1));return;}
      if(typeof value!=="object")return;
      if(seen.has(value))return;
      seen.add(value);
      record(ticketText(value),value.odds??value.currentOdds??value.finalOdds??value.value??value.oddsText);
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

  function collectTrueManshuTickets(prediction){
    const oddsMap=buildOddsMap(prediction);
    const candidates=[];
    const seen=new Set();
    const push=ticket=>{
      const exact=exactTicket(ticket);
      const odds=exact?numericOdds(oddsMap.get(exact)):null;
      if(!exact||!odds||odds<100||seen.has(exact))return;
      seen.add(exact);
      candidates.push({ticket:exact,odds});
    };
    const visit=row=>{
      const notation=ticketText(row);
      const exact=exactTicket(notation);
      if(exact){push(exact);return;}
      expandNotation(notation).forEach(push);
    };
    const hole=prediction?.manshuSheet?.tickets||prediction?.ticketSheets?.hole||[];
    (Array.isArray(hole)?hole:[]).forEach(visit);
    const light=prediction?.lightManshuTicketBoard?.lines||[];
    (Array.isArray(light)?light:[]).forEach(visit);
    return candidates.sort((a,b)=>b.odds-a.odds);
  }

  function buildManshuFormations(prediction){
    const rows=collectTrueManshuTickets(prediction);
    const groups=new Map();
    rows.forEach(row=>{
      const [a,b,c]=row.ticket.split("-");
      const key=`${a}-${b}`;
      if(!groups.has(key))groups.set(key,{a,b,thirds:[],tickets:[],odds:[]});
      const group=groups.get(key);
      if(!group.thirds.includes(c))group.thirds.push(c);
      if(!group.tickets.includes(row.ticket))group.tickets.push(row.ticket);
      group.odds.push(row.odds);
    });
    return [...groups.values()]
      .filter(group=>group.tickets.length>=2)
      .map(group=>{
        group.thirds.sort((a,b)=>Number(a)-Number(b));
        return {
          notation:`${group.a}-${group.b}-${group.thirds.join("")}`,
          pointCount:group.tickets.length,
          expandedTickets:[...group.tickets],
          minOdds:Math.min(...group.odds),
          maxOdds:Math.max(...group.odds)
        };
      })
      .sort((a,b)=>b.minOdds-a.minOdds)
      .slice(0,6);
  }

  function practicalRows(prediction){
    const result=prediction?.practicalSelection||prediction?.practicalResult||prediction?.practical||{};
    const source=Array.isArray(result)?result:(result?.tickets||prediction?.practicalTickets||[]);
    if(!Array.isArray(source))return [];
    const seen=new Set();
    const rows=[];
    source.forEach(row=>{
      const notation=ticketText(row);
      if(!notation||seen.has(notation))return;
      seen.add(notation);
      const units=Number(row?.unitsPerTicket??row?.units??row?.betUnits??row?.allocation?.units??0);
      const direct=Number(row?.amountYen??row?.amount??row?.betAmount??row?.purchaseAmount??row?.allocation?.amountYen??0);
      const amount=Number.isFinite(direct)&&direct>0?direct:(Number.isFinite(units)&&units>0?units*100:null);
      rows.push({notation,amount:Number.isFinite(amount)?amount:null});
    });
    return rows;
  }

  function prepare(prediction){
    if(!prediction||typeof prediction!=="object")return prediction;
    const next={...prediction};
    const rawFlow=prediction.mainSheet?.flowTickets||prediction.ticketSheets?.flow||prediction.formation?.nagashi||prediction.formation?.flow||[];
    const fallbackFormations=buildFlowFormations(Array.isArray(rawFlow)?rawFlow:[],prediction);
    if(prediction.mainSheet){
      next.mainSheet={...prediction.mainSheet,
        tickets:decorateList(prediction.mainSheet.tickets,prediction),
        coverTickets:decorateList(prediction.mainSheet.coverTickets,prediction),
        flowTickets:decorateList(prediction.mainSheet.flowTickets,prediction),
        flowFormations:Array.isArray(prediction.mainSheet.flowFormations)&&prediction.mainSheet.flowFormations.length?prediction.mainSheet.flowFormations:fallbackFormations
      };
    }
    if(prediction.manshuSheet){
      next.manshuSheet={...prediction.manshuSheet,tickets:decorateList(prediction.manshuSheet.tickets,prediction)};
    }
    if(prediction.ticketSheets){
      next.ticketSheets={...prediction.ticketSheets,
        main:decorateList(prediction.ticketSheets.main,prediction),
        cover:decorateList(prediction.ticketSheets.cover,prediction),
        flow:decorateList(prediction.ticketSheets.flow,prediction),
        hole:decorateList(prediction.ticketSheets.hole,prediction),
        all:decorateList(prediction.ticketSheets.all,prediction)
      };
    }
    next.formation={...(prediction.formation||{}),flowFormations:Array.isArray(prediction.formation?.flowFormations)&&prediction.formation.flowFormations.length?prediction.formation.flowFormations:fallbackFormations};
    next.aiTicketList=decorateList(prediction.aiTicketList,prediction);
    next.manshuFormations=buildManshuFormations(next);
    next.finalPurchaseRows=practicalRows(next);
    return next;
  }

  function escapeHtml(value){
    return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  }

  function ensureStyle(){
    const doc=root.document;
    if(!doc||doc.getElementById(STYLE_ID))return;
    const style=doc.createElement("style");
    style.id=STYLE_ID;
    style.textContent=`
      .chappy-manshu-formation-grid,.chappy-final-purchase-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
      .chappy-manshu-formation-row,.chappy-final-purchase-row{border:1px solid rgba(15,23,42,.12);border-radius:10px;padding:8px 9px;background:#fff;min-width:0}
      .chappy-manshu-formation-main,.chappy-final-purchase-main{display:flex;align-items:center;justify-content:space-between;gap:8px}
      .chappy-manshu-formation-main strong,.chappy-final-purchase-main strong{font-size:15px;white-space:nowrap}
      .chappy-manshu-formation-meta,.chappy-final-purchase-meta{font-size:11px;line-height:1.35;color:#475569;text-align:right}
      .chappy-unified-note{margin:5px 0 8px;font-size:11px;line-height:1.45;color:#64748b}
      .chappy-final-purchase-empty{padding:9px;border-radius:10px;background:#f8fafc;font-size:12px;color:#64748b}
      @media(max-width:360px){.chappy-manshu-formation-grid,.chappy-final-purchase-list{grid-template-columns:1fr}}
    `;
    doc.head?.appendChild(style);
  }

  function manshuHtml(prediction){
    const groups=buildManshuFormations(prediction);
    if(!groups.length){
      return `<div class="chappy-true-manshu-empty">100倍以上だけで組める複数点フォーメーションはありません。単券1点は万舟欄に表示しません。</div>`;
    }
    return `<div class="chappy-true-manshu-board chappy-manshu-formation-board">
      <div class="chappy-true-manshu-head"><strong>万舟フォーメーション ${groups.length}組</strong><span>全構成点100倍以上</span></div>
      <p class="chappy-unified-note">実際に100倍以上を確認できた買い目だけをまとめています。</p>
      <div class="chappy-manshu-formation-grid">${groups.map(group=>{
        const odds=group.minOdds===group.maxOdds?`${group.minOdds.toFixed(1)}倍`:`${group.minOdds.toFixed(1)}〜${group.maxOdds.toFixed(1)}倍`;
        return `<article class="chappy-manshu-formation-row"><div class="chappy-manshu-formation-main"><strong>${escapeHtml(group.notation)}</strong><span class="chappy-manshu-formation-meta">${group.pointCount}点<br>${odds}</span></div></article>`;
      }).join("")}</div>
    </div>`;
  }

  function rewriteManshu(prediction){
    const doc=root.document;
    if(!doc)return;
    const current=doc.querySelector(".chappy-true-manshu-board,.chappy-true-manshu-empty");
    if(!current)return;
    current.outerHTML=manshuHtml(prediction);
  }

  function rewritePractical(prediction){
    const doc=root.document;
    if(!doc)return;
    const section=doc.querySelector(".v3-practical-section");
    if(!section)return;
    const body=section.querySelector(".v3-section-body");
    if(!body)return;
    const rows=practicalRows(prediction);
    body.innerHTML=rows.length
      ? `<div class="chappy-final-purchase"><p class="chappy-unified-note">本命・押さえ等の説明は繰り返さず、最終的に購入する買い目だけを表示します。</p><div class="chappy-final-purchase-list">${rows.map(row=>`<article class="chappy-final-purchase-row"><div class="chappy-final-purchase-main"><strong>${escapeHtml(row.notation)}</strong><span class="chappy-final-purchase-meta">${row.amount?`${Math.round(row.amount).toLocaleString("ja-JP")}円`:"最終購入"}</span></div></article>`).join("")}</div></div>`
      : `<div class="chappy-final-purchase-empty">最終購入なし（見送り）</div>`;
  }

  function postProcess(prediction){
    ensureStyle();
    rewriteManshu(prediction);
    rewritePractical(prediction);
  }

  function install(target){
    if(!target||target[FLAG])return false;
    ["renderAll","renderPrediction"].forEach(name=>{
      const original=target[name];
      if(typeof original!=="function")return;
      target[name]=function(prediction,...args){
        const prepared=prepare(prediction);
        const result=original.call(this,prepared,...args);
        try{postProcess(prepared);}catch(error){console.warn("Chappy unified display error",error);}
        if(typeof target.setTimeout==="function")target.setTimeout(()=>{try{postProcess(prepared);}catch(_error){}},0);
        return result;
      };
    });
    target[FLAG]=true;
    return true;
  }

  const api=Object.freeze({
    exactTicket,courseOf,reasonFor,buildFlowFormations,expandNotation,buildOddsMap,
    collectTrueManshuTickets,buildManshuFormations,practicalRows,prepare,manshuHtml,postProcess,install
  });
  root.ChappyTicketSpecificReason=api;
  install(root);
})(typeof window!=="undefined"?window:globalThis);
