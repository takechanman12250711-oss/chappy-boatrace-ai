(function(root,factory){"use strict";const api=factory();root.ChappyEscapeRolePartnerShadow=api;if(typeof module!=="undefined"&&module.exports)module.exports=api;})(typeof window!=="undefined"?window:globalThis,function(){"use strict";
const VERSION="1.0.0";
function arr(v){return Array.isArray(v)?v:[]}
function ticket(v){const t=String(v?.ticket??v??"");return /^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split("-")).size===3?t:""}
function score(v){const n=Number(v?.priorityScore);return Number.isFinite(n)?n:0}
function roles(row,t){const boats=t.split("-").map(Number),rs=arr(row?.roleLabels).filter(r=>r?.structured===true);return {head:rs.some(r=>Number(r.position)===1&&Number(r.boatNo)===boats[0]&&["head","attack"].includes(String(r.role))),second:rs.some(r=>Number(r.position)===2&&Number(r.boatNo)===boats[1]&&["hold","pickup","attack"].includes(String(r.role))),third:rs.some(r=>Number(r.position)===3&&Number(r.boatNo)===boats[2]&&["hold","pickup"].includes(String(r.role))) }}
function build(selection={}){
 const selected=arr(selection.tickets),base=selected.map(ticket); if(!base.length||base.some(t=>!t))return {version:VERSION,eligible:false,reason:"INVALID_BASE",baseTickets:base,shadowTickets:base};
 const head1=base.filter(t=>t.startsWith("1-")); if(!head1.length)return {version:VERSION,eligible:false,reason:"NO_HEAD1",baseTickets:base,shadowTickets:base};
 const candidates=arr(selection.candidateOutcomes).map(row=>({row,t:ticket(row),s:score(row)})).filter(x=>x.t&&x.t.startsWith("1-")&&!base.includes(x.t)).filter(x=>{const r=roles(x.row,x.t);return r.head&&r.second&&r.third}).sort((a,b)=>b.s-a.s||a.t.localeCompare(b.t));
 const replaceable=selected.map((row,i)=>({row,i,t:ticket(row),s:score(row)})).filter(x=>x.t.startsWith("1-")&&!["本線","流し"].includes(String(x.row?.category||""))).sort((a,b)=>a.s-b.s||a.t.localeCompare(b.t));
 const best=candidates[0],weak=replaceable[0]; if(!best||!weak||best.s<=weak.s)return {version:VERSION,eligible:false,reason:"NO_STRONGER_ROLE_GROUNDED_PARTNER",baseTickets:base,shadowTickets:base};
 const shadow=[...base];shadow[weak.i]=best.t;return {version:VERSION,eligible:true,reason:"ROLE_GROUNDED_PARTNER_REPLACEMENT",baseTickets:base,shadowTickets:shadow,replacement:{addedTicket:best.t,addedPriorityScore:best.s,removedTicket:weak.t,removedPriorityScore:weak.s,selectedIndex:weak.i},automaticApplication:false,usableForPrediction:false,affectsPrediction:false,affectsTickets:false};
}
return Object.freeze({VERSION,build});});
