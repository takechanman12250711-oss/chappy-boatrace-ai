"use strict";
// Extract only saved ticket identities and saved categories; never rerun prediction.
function storedTicketCategories(prediction = {}) {
  const rows = [], seen = new Set();
  const expand = value => {
    const raw = String(value || "").replace(/\s/g,"").replace(/→/g,"-");
    const parts = raw.split("-").map(part=>part==="全"?"123456":part);
    if(parts.length!==3 || parts.some(part=>! /^[1-6]+$/.test(part))) return [];
    return [...parts[0]].flatMap(a=>[...parts[1]].flatMap(b=>[...parts[2]].filter(c=>new Set([a,b,c]).size===3).map(c=>a+"-"+b+"-"+c)));
  };
  const add = (source, role) => (Array.isArray(source)?source:[]).forEach(row=>{
    const value=typeof row==="string"?row:row?.ticket||row?.notation||row?.line||row?.formation?.notation||row?.formation||"";
    expand(value).forEach(ticket=>{
      if(seen.has(ticket))return;
      seen.add(ticket); rows.push({ticket,role,category:role});
    });
  });
  const main=prediction.mainSheet||{}, sheets=prediction.ticketSheets||{};
  add(main.tickets||sheets.main,"本命");
  add(main.coverTickets||sheets.cover,"押さえ");
  add(main.flowTickets||sheets.flow,"流し");
  add(main.flowFormations||prediction.formation?.flowFormations||prediction.formations?.flowFormations,"流し");
  add(prediction.manshuSheet?.tickets||sheets.hole,"万舟");
  (prediction.ticketRanks||[]).forEach(row=>add([row],String(row?.role||row?.category||"")));
  return rows;
}
module.exports={storedTicketCategories};
