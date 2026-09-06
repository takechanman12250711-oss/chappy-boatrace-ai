(function(root){
"use strict";
if(!root||!root.document)return;
const BUILD="20260906-final-display-owner3";
const WRAPPED="__chappyFinalDisplayOwnerV2Wrapped";
let latestPrediction=null,missingScheduled=false;
const text=v=>String(v??"").trim();
const rows=v=>Array.isArray(v)?v:(v?[v]:[]);
const esc=v=>text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
function exactTicket(v){const raw=text(v).replace(/\s+/g,"").replace(/→/g,"-");const m=raw.match(/^[1-6]-[1-6]-[1-6]$/);if(!m)return"";return new Set(m[0].split("-")).size===3?m[0]:"";}
function ticketText(row){if(typeof row==="string")return row;if(!row||typeof row!=="object")return"";return text(row.ticket||row.line||row.notation||row.flowNotation||row.flowFormation||row.formation?.notation||row.formation);}
// Pure display helpers migrated from final-ticket-reason-fix; no second renderer.
function courseOf(prediction,boatNo){const n=Number(boatNo),byBoat=prediction?.indexes?.byBoat||{},candidate=Number(byBoat?.[n]?.course??n);return Number.isInteger(candidate)&&candidate>=1&&candidate<=6?candidate:n;}
function headAction(course){return ["1着展開","イン先マイ","2コース差し","3コース攻め","4カド攻め","5コースまくり差し","6コース最内差し"][course]||"1着展開";}
function secondAction(course){return ["2着残し","イン残し","差し残り","センター残り","カド残り","展開拾い","道中拾い"][course]||"2着残し";}
function thirdAction(course){return ["3着拾い","インの3着残り","差し残りの3着","センターの3着","カドの3着","外の3着拾い","最内の3着拾い"][course]||"3着拾い";}
function reasonFor(ticket,prediction){const exact=exactTicket(ticket);if(!exact)return"";const[a,b,c]=exact.split("-").map(Number);return`${a}号艇の${headAction(courseOf(prediction,a))}を軸に、${b}号艇の${secondAction(courseOf(prediction,b))}を2着、${c}号艇の${thirdAction(courseOf(prediction,c))}を3着で評価。`;}
function decorateList(list,prediction){if(!Array.isArray(list))return list;return list.map(row=>{if(!row||typeof row!=="object")return row;const reason=reasonFor(ticketText(row),prediction);return reason?{...row,reason,scenarioSummary:reason}:row;});}
function numericOdds(v){if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(/倍/g,"").trim());return Number.isFinite(n)&&n>0?n:null;}
function expandNotation(v){const p=text(v).replace(/\s+/g,"").split("-");if(p.length!==3)return[];const g=x=>[...new Set(String(x).replace(/全/g,"123456").split(""))].filter(y=>/^[1-6]$/.test(y));const out=[];g(p[0]).forEach(a=>g(p[1]).forEach(b=>g(p[2]).forEach(c=>{if(new Set([a,b,c]).size===3)out.push(`${a}-${b}-${c}`);})));return[...new Set(out)];}
function buildFlowFormations(list){const groups=new Map();rows(list).forEach(row=>{const t=exactTicket(ticketText(row));if(!t)return;const[a,b,c]=t.split("-");const k=`${a}-${b}`;if(!groups.has(k))groups.set(k,{a,b,thirds:new Set(),tickets:[]});const g=groups.get(k);g.thirds.add(c);if(!g.tickets.includes(t))g.tickets.push(t);});return[...groups.values()].filter(g=>g.tickets.length>=2).map(g=>{const thirds=[...g.thirds].sort((a,b)=>Number(a)-Number(b));return{notation:`${g.a}-${g.b}-${thirds.join("")}`,pointCount:g.tickets.length,expandedTickets:[...g.tickets]};});}
function rawFlowTickets(pred){return rows(pred?.mainSheet?.flowTickets||pred?.ticketSheets?.flow||pred?.formation?.nagashi||pred?.formation?.flow).map(ticketText).map(exactTicket).filter(Boolean);}
function practicalResult(pred){const direct=pred?.practicalSelection||pred?.practicalResult||pred?.practical;if(direct)return direct;try{if(typeof root.ChappyPracticalSelection?.select==="function")return root.ChappyPracticalSelection.select(pred);}catch(_e){}return null;}
function formalFlowTickets(pred){const universe=new Set(rawFlowTickets(pred));if(!universe.size)return[];const result=practicalResult(pred);const selected=rows(Array.isArray(result)?result:result?.tickets).map(ticketText).map(exactTicket).filter(Boolean);return[...new Set(selected.filter(t=>universe.has(t)))];}
function formalFlowFormations(pred){const selected=formalFlowTickets(pred);return selected.length>=2?buildFlowFormations(selected):[];}
function fallbackFlowFormations(pred){const existing=rows(pred?.mainSheet?.flowFormations||pred?.formation?.flowFormations).filter(Boolean);if(existing.length)return existing;return buildFlowFormations(rawFlowTickets(pred));}
/* Approved display contract: full formation display is independent from practical purchase tickets.
   Do not shrink 12-345-全(24) / 4-23-全(8) to the formal exact purchase subset. */
function authoritativeFlowFormations(pred){return fallbackFlowFormations(pred);}
function fallbackOddsMap(pred){const map=new Map(),seen=new WeakSet();const record=(t,v)=>{const k=exactTicket(t),o=numericOdds(v);if(k&&o&&!map.has(k))map.set(k,o);};const walk=(v,d=0)=>{if(d>8||v==null)return;if(Array.isArray(v)){v.forEach(x=>walk(x,d+1));return;}if(typeof v!=="object"||seen.has(v))return;seen.add(v);record(ticketText(v),v.odds??v.currentOdds??v.finalOdds??v.value??v.oddsText);Object.entries(v).forEach(([k,c])=>{if(/^[1-6]-[1-6]-[1-6]$/.test(k))record(k,typeof c==="object"&&c?c.odds??c.currentOdds??c.finalOdds??c.value??c.oddsText:c);walk(c,d+1);});};walk(pred);return map;}
function buildOddsMap(pred){try{if(typeof root.ChappyFinalMobileUi?.buildOddsMap==="function")return root.ChappyFinalMobileUi.buildOddsMap(pred);}catch(_e){}return fallbackOddsMap(pred);}
function buildManshuFormations(pred){const oddsMap=buildOddsMap(pred),seen=new Set(),candidates=[];const push=t=>{const e=exactTicket(t),o=e?numericOdds(oddsMap.get(e)):null;if(!e||!o||o<100||seen.has(e))return;seen.add(e);candidates.push({ticket:e,odds:o});};rows(pred?.manshuSheet?.tickets||pred?.ticketSheets?.hole).forEach(r=>{const n=ticketText(r),e=exactTicket(n);if(e)push(e);else expandNotation(n).forEach(push);});rows(pred?.lightManshuTicketBoard?.lines).forEach(r=>expandNotation(ticketText(r)).forEach(push));const groups=new Map();candidates.forEach(r=>{const[a,b,c]=r.ticket.split("-"),k=`${a}-${b}`;if(!groups.has(k))groups.set(k,{a,b,thirds:new Set(),tickets:[],odds:[]});const g=groups.get(k);g.thirds.add(c);g.tickets.push(r.ticket);g.odds.push(r.odds);});return[...groups.values()].filter(g=>g.tickets.length>=2).map(g=>{const thirds=[...g.thirds].sort((a,b)=>Number(a)-Number(b));return{notation:`${g.a}-${g.b}-${thirds.join("")}`,pointCount:g.tickets.length,expandedTickets:[...g.tickets],minOdds:Math.min(...g.odds),maxOdds:Math.max(...g.odds)};}).sort((a,b)=>b.minOdds-a.minOdds).slice(0,6);}
function practicalRows(pred){const result=practicalResult(pred)||{},source=Array.isArray(result)?result:(result.tickets||pred?.practicalTickets||[]),seen=new Set();return rows(source).map(r=>{const notation=ticketText(r);if(!notation||seen.has(notation))return null;seen.add(notation);const units=Number(r?.unitsPerTicket??r?.units??r?.betUnits??r?.allocation?.units??0),direct=Number(r?.amountYen??r?.amount??r?.betAmount??r?.purchaseAmount??r?.allocation?.amountYen??0),amount=Number.isFinite(direct)&&direct>0?direct:(Number.isFinite(units)&&units>0?units*100:null);return{notation,amount:Number.isFinite(amount)?amount:null};}).filter(Boolean);}
function prepare(pred){
  if(!pred||typeof pred!=="object")return pred;
  const next={...pred},formations=authoritativeFlowFormations(pred);
  if(pred.mainSheet)next.mainSheet={...pred.mainSheet,tickets:decorateList(pred.mainSheet.tickets,pred),coverTickets:decorateList(pred.mainSheet.coverTickets,pred),flowTickets:decorateList(pred.mainSheet.flowTickets,pred),flowFormations:formations};
  if(pred.manshuSheet)next.manshuSheet={...pred.manshuSheet,tickets:decorateList(pred.manshuSheet.tickets,pred)};
  if(pred.ticketSheets){next.ticketSheets={...pred.ticketSheets};["main","cover","flow","hole","all"].forEach(key=>{if(key in pred.ticketSheets)next.ticketSheets[key]=decorateList(pred.ticketSheets[key],pred);});}
  if(Array.isArray(pred.aiTicketList))next.aiTicketList=decorateList(pred.aiTicketList,pred);
  next.formation={...(pred.formation||{}),flowFormations:formations};
  next.manshuFormations=buildManshuFormations(next);
  next.finalPurchaseRows=practicalRows(next);
  return next;
}
function formationRows(pred){return authoritativeFlowFormations(pred).map(r=>({notation:ticketText(r),pointCount:Number(r?.pointCount)||expandNotation(ticketText(r)).length||1,expandedTickets:rows(r?.expandedTickets)})).filter(r=>r.notation);}
function ensureFormationGroup(pred){
  const box=root.document.querySelector("#resultArea .chappy-final-buy-summary");
  if(!box)return;
  const list=formationRows(pred),existing=box.querySelector(".chappy-final-buy-group.is-flow");
  if(!list.length){existing?.remove();return;}
  // The base renderer already includes odds, reasons and accordion state.
  // Do not replace correct full-formation markup with a count-only fragment.
  if(existing&&typeof existing.querySelectorAll==="function"){
    const rendered=[...existing.querySelectorAll(".chappy-final-buy-line")];
    if(rendered.length===list.length&&rendered.every((node,index)=>
      text(node.querySelector(".chappy-final-buy-formation")?.textContent)===list[index].notation&&
      text(node.querySelector(".chappy-final-buy-count")?.textContent)===`${list[index].pointCount}点`
    ))return;
  }
  const oddsMap=buildOddsMap(pred);
  const originals=authoritativeFlowFormations(pred);
  const html=`<details class="chappy-final-buy-group is-flow"${existing?.open?" open":""}><summary><span class="chappy-final-buy-label">フォーメーション</span><span class="chappy-final-buy-meta">${list.length}組</span></summary><div class="chappy-final-buy-lines">${list.map((r,index)=>{
    const values=expandNotation(r.notation).map(ticket=>numericOdds(oddsMap.get(ticket))).filter(Boolean);
    const odds=values.length?Math.min(...values):null;
    const original=originals[index],reason=text(original?.reason||original?.scenarioSummary||original?.comment);
    return`<article class="chappy-final-buy-line"><div class="chappy-final-buy-mainline"><strong class="chappy-final-buy-formation">${esc(r.notation)}</strong><div class="chappy-final-buy-side"><span class="chappy-final-buy-odds${odds?"":" is-missing"}">${odds?`${odds.toFixed(1)}倍`:"オッズ未取得"}</span><span class="chappy-final-buy-count">${r.pointCount}点</span></div></div>${reason?`<p class="chappy-final-buy-reason">${esc(reason)}</p>`:""}</article>`;
  }).join("")}</div></details>`;
  if(existing)existing.outerHTML=html;else box.insertAdjacentHTML("beforeend",html);
}
function manshuHtml(pred){const groups=pred?.manshuFormations||buildManshuFormations(pred);if(!groups.length)return`<div class="chappy-true-manshu-empty">100倍以上だけで組める複数点フォーメーションはありません。単券1点は万舟欄に表示しません。</div>`;return`<div class="chappy-true-manshu-board chappy-manshu-formation-board"><div class="chappy-true-manshu-head"><strong>万舟フォーメーション ${groups.length}組</strong><span>全構成点100倍以上</span></div><div class="chappy-manshu-formation-grid">${groups.map(g=>`<article class="chappy-manshu-formation-row"><div class="chappy-manshu-formation-main"><strong>${esc(g.notation)}</strong><span class="chappy-manshu-formation-meta">${g.pointCount}点<br>${g.minOdds===g.maxOdds?g.minOdds.toFixed(1):`${g.minOdds.toFixed(1)}〜${g.maxOdds.toFixed(1)}`}倍</span></div></article>`).join("")}</div></div>`;}
function rewriteManshu(pred){const section=root.document.querySelector("#resultArea .v3-manshu-newspaper");if(!section)return;const body=section.querySelector(".v3-section-body")||section;body.innerHTML=manshuHtml(pred);}
function rewritePractical(pred){const section=root.document.querySelector("#resultArea .v3-practical-section"),body=section?.querySelector(".v3-section-body");if(!body)return;const list=pred?.finalPurchaseRows||practicalRows(pred);body.innerHTML=list.length?`<div class="chappy-final-purchase"><div class="chappy-final-purchase-list">${list.map(r=>`<article class="chappy-final-purchase-row"><strong>${esc(r.notation)}</strong><span>${r.amount?`${Math.round(r.amount).toLocaleString("ja-JP")}円`:"最終購入"}</span></article>`).join("")}</div></div>`:`<div class="chappy-final-purchase-empty">最終購入なし（見送り）</div>`;}
function compactSection(section){if(!section||section.dataset.finalOwnerCollapsed==="1")return;const head=section.querySelector(":scope > .v3-section-head"),body=section.querySelector(":scope > .v3-section-body"),title=text(head?.textContent);if(!body||!/公式履歴|出てない目|TOP30|展開|理論|分析|最終コメント/.test(title))return;section.dataset.finalOwnerCollapsed="1";section.classList.add("chappy-structure11-secondary");const d=root.document.createElement("details"),s=root.document.createElement("summary");d.className="chappy-ui10-details";s.textContent="詳細を見る";d.appendChild(s);while(body.firstChild)d.appendChild(body.firstChild);body.appendChild(d);}
function applyLayout(){const area=root.document.getElementById("resultArea");if(!area)return;root.document.body?.classList.add("chappy-compact-ui10","chappy-mobile-structure11");area.querySelector(".v3-entry-section")?.classList.add("chappy-ui10-entry-compact");area.querySelector(".v3-boat-evaluation")?.classList.add("chappy-ui10-eval-compact");area.querySelector(".v3-practical-section")?.classList.add("chappy-ui10-practical-compact");area.querySelectorAll(".v3-section").forEach(compactSection);}
function decorateMissingOdds(pred){const area=root.document.getElementById("resultArea");if(!area||!pred)return;const map=buildOddsMap(pred);area.querySelectorAll(".v3-missing-numbers .v3-formation-row").forEach(row=>{const ticket=exactTicket(row.querySelector(".v3-formation-ticket")?.textContent);if(!ticket)return;const odds=map.get(ticket)||null,tags=row.querySelector(".v3-formation-tags")||row;let badge=row.querySelector(".chappy-missing-odds");if(!badge){badge=root.document.createElement("span");tags.appendChild(badge);}badge.className=`chappy-missing-odds${odds?"":" is-missing"}`;badge.textContent=odds?`${Number(odds).toFixed(1)}倍`:"オッズ未取得";badge.dataset.ticket=ticket;});}
function applyFinal(pred){if(!pred)return;ensureFormationGroup(pred);rewriteManshu(pred);rewritePractical(pred);applyLayout();decorateMissingOdds(pred);}
function scheduleMissing(){if(missingScheduled)return;missingScheduled=true;root.requestAnimationFrame(()=>{missingScheduled=false;applyLayout();decorateMissingOdds(latestPrediction);});}
const Observer=root.MutationObserver||function(){this.observe=function(){};};const observer=new Observer(ms=>{if(!latestPrediction)return;const changed=ms.some(m=>[...(m.addedNodes||[])].some(n=>n?.nodeType===1&&(n.matches?.(".v3-missing-numbers,.v3-missing-numbers *")||n.querySelector?.(".v3-missing-numbers"))));if(changed)scheduleMissing();});observer.observe(root.document.documentElement,{childList:true,subtree:true});
function wrap(){const fn=root.renderAll;if(typeof fn!=="function"||fn[WRAPPED])return false;
// The base mobile wrapper installs on its own timer. Wait for it so that it
// receives the prepared display copy rather than repainting the raw input.
if(root.ChappyFinalMobileUi&&!fn.__chappyFinalMobileUiWrapped)return false;
function wrapped(pred){const prepared=prepare(pred);latestPrediction=prepared;const value=fn.call(this,prepared);root.setTimeout(()=>{if(latestPrediction===prepared)applyFinal(prepared);},20);return value;}wrapped[WRAPPED]=true;wrapped.__original=fn;root.renderAll=wrapped;return true;}
let attempts=0;const timer=root.setInterval(()=>{attempts++;if(wrap()||attempts>240)root.clearInterval(timer);},50);
root.ChappyFinalDisplayOwner=Object.freeze({build:BUILD,exactTicket,reasonFor,expandNotation,rawFlowTickets,formalFlowTickets,formalFlowFormations,authoritativeFlowFormations,buildFlowFormations,buildOddsMap,buildManshuFormations,practicalRows,prepare,formationRows,ensureFormationGroup,applyFinal,decorateMissingOdds});
})(typeof window!=="undefined"?window:null);
