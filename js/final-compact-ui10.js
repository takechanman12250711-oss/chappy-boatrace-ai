(function(root){
  "use strict";
  if(!root||!root.document)return;
  const BUILD="20260904-final-mobile-ui10";
  const WRAPPED="__chappyCompactUi10Wrapped";

  function text(v){return String(v??"").trim();}
  function rows(v){return Array.isArray(v)?v:(v?[v]:[]);}
  function notationOf(row){
    if(!row)return "";
    if(typeof row==="string")return text(row);
    return text(row.notation||row.flowNotation||row.flowFormation||row.formation?.notation||row.formation||row.ticket||row.line);
  }
  function exactTicket(value){
    const raw=text(value).replace(/\s+/g,"");
    const p=raw.split("-");
    if(p.length!==3||p.some(x=>!/^[1-6]$/.test(x))||new Set(p).size!==3)return "";
    return raw;
  }
  function expand(notation){
    const raw=text(notation).replace(/\s+/g,"");
    const parts=raw.split("-");
    if(parts.length!==3)return [];
    const norm=s=>[...new Set(String(s).replace(/全/g,"123456").split(""))];
    const a=norm(parts[0]),b=norm(parts[1]),c=norm(parts[2]);
    if([a,b,c].some(g=>g.some(x=>!/^[1-6]$/.test(x))))return [];
    const out=[];
    a.forEach(x=>b.forEach(y=>c.forEach(z=>{if(new Set([x,y,z]).size===3)out.push(`${x}-${y}-${z}`);}))); 
    return [...new Set(out)];
  }
  function compactFromTickets(source){
    const tickets=rows(source).map(r=>exactTicket(notationOf(r))).filter(Boolean);
    const grouped=new Map();
    tickets.forEach(ticket=>{
      const [a,b,c]=ticket.split("-");
      const key=`${a}-${b}`;
      if(!grouped.has(key))grouped.set(key,new Set());
      grouped.get(key).add(c);
    });
    return [...grouped.entries()].map(([key,set])=>{
      const thirds=[...set].sort();
      if(thirds.length<2)return "";
      const notation=`${key}-${thirds.join("")}`;
      const expanded=expand(notation).sort();
      const originals=tickets.filter(t=>t.startsWith(`${key}-`)).sort();
      return expanded.length===originals.length&&expanded.every((t,i)=>t===originals[i])?notation:"";
    }).filter(Boolean);
  }
  function formationRows(prediction){
    const sources=[
      prediction?.mainSheet?.flowFormations,
      prediction?.aiCore?.mainSheet?.flowFormations,
      prediction?.formation?.flowFormations,
      prediction?.formations?.flowFormations,
      prediction?.ticketSheets?.flowFormations,
      prediction?.aiCore?.formation?.flowFormations
    ];
    let out=[];
    sources.forEach(source=>rows(source).forEach(row=>{const n=notationOf(row);if(n)out.push(n);}));
    if(!out.length){
      const flowTickets=prediction?.mainSheet?.flowTickets||prediction?.aiCore?.mainSheet?.flowTickets||prediction?.ticketSheets?.flow;
      out=compactFromTickets(flowTickets);
    }
    return [...new Set(out.map(v=>text(v).replace(/\s+/g,"")))];
  }
  function esc(v){return text(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);}
  function ensureFormationGroup(prediction,area){
    const summary=area.querySelector(".chappy-final-buy-summary");
    if(!summary)return false;
    const formations=formationRows(prediction);
    const existing=summary.querySelector(".chappy-final-buy-group.is-flow");
    if(!formations.length){if(existing)existing.remove();return false;}
    const html=`<details class="chappy-final-buy-group is-flow chappy-ui10-formation" open>
      <summary><span class="chappy-final-buy-label">フォーメーション</span><span class="chappy-final-buy-meta">${formations.length}組</span></summary>
      <div class="chappy-final-buy-lines">${formations.map(n=>`<article class="chappy-final-buy-line"><div class="chappy-final-buy-mainline"><strong class="chappy-final-buy-formation">${esc(n)}</strong><div class="chappy-final-buy-side"><span class="chappy-final-buy-count">${expand(n).length||1}点</span></div></div></article>`).join("")}</div>
    </details>`;
    if(existing)existing.outerHTML=html; else summary.insertAdjacentHTML("beforeend",html);
    return true;
  }
  function makeCompact(section){
    if(!section||section.dataset.compactUi10==="1")return;
    const head=section.querySelector(":scope > .v3-section-head");
    const body=section.querySelector(":scope > .v3-section-body");
    const title=text(head?.textContent);
    if(!body||!title)return;
    const collapse=/公式履歴|出てない目|TOP30|展開|理論|分析|最終コメント/.test(title);
    section.dataset.compactUi10="1";
    section.classList.add("chappy-ui10-section");
    if(!collapse)return;
    const details=root.document.createElement("details");
    details.className="chappy-ui10-details";
    const summary=root.document.createElement("summary");
    summary.textContent="詳細を見る";
    details.appendChild(summary);
    while(body.firstChild)details.appendChild(body.firstChild);
    body.appendChild(details);
  }
  function compactLayout(area){
    area.querySelectorAll(".v3-section").forEach(makeCompact);
    area.querySelector(".v3-entry-section")?.classList.add("chappy-ui10-entry-compact");
    area.querySelector(".v3-boat-evaluation")?.classList.add("chappy-ui10-eval-compact");
    area.querySelector(".v3-practical-selection")?.classList.add("chappy-ui10-practical-compact");
  }
  function enhance(prediction){
    const area=root.document.getElementById("resultArea");
    if(!area)return;
    root.document.body?.classList.add("chappy-compact-ui10");
    ensureFormationGroup(prediction,area);
    compactLayout(area);
  }
  function wrap(){
    const fn=root.renderAll;
    if(typeof fn!=="function"||fn[WRAPPED])return false;
    function wrapped(prediction){
      const value=fn.apply(this,arguments);
      root.setTimeout(()=>enhance(prediction),24);
      return value;
    }
    wrapped[WRAPPED]=true;
    wrapped.__original=fn;
    root.renderAll=wrapped;
    return true;
  }
  let tries=0;
  const timer=root.setInterval(()=>{tries++;if(wrap()||tries>240)root.clearInterval(timer);},250);
  root.ChappyCompactUi10=Object.freeze({build:BUILD,formationRows,compactFromTickets,enhance});
})(typeof window!=="undefined"?window:null);
