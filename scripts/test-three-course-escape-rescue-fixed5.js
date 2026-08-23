"use strict";
const assert = require("node:assert/strict");
const rescue = require("../js/three-course-escape-rescue-fixed5");

function selected(label,tickets){
  return {
    status:"selected",
    evidence:{raceFlow:{title:label}},
    tickets:tickets.map(ticket=>({ticket,category:"本線"})),
    expansionSummary:{finalCount:tickets.length},
    verificationEvidence:{
      mainScenario:{label},
      tickets:tickets.map(ticket=>({ticket}))
    }
  };
}

{
  const base = selected("3コース攻め",["3-1-2","3-2-1","1-3-2","1-2-3","3-1-4"]);
  const out = rescue.apply({},base);
  assert.equal(out.tickets.length,5,"点数は維持する");
  assert.deepEqual(out.tickets.map(x=>x.ticket),["3-1-2","3-2-1","1-3-2","1-2-3","1-3-4"]);
  assert.equal(out.expansionSummary.threeCourseEscapeRescueFixed5.replacedTicket,"3-1-4");
  assert.equal(out.verificationEvidence.tickets[4].ticket,"1-3-4");
}

{
  const base = selected("3コース攻め",["3-1-2","1-3-4","1-3-2"]);
  const out = rescue.apply({},base);
  assert.deepEqual(out.tickets.map(x=>x.ticket),base.tickets.map(x=>x.ticket),"既存なら置換しない");
}

{
  const base = selected("4カド攻め",["4-1-2","4-2-1","1-4-2"]);
  const out = rescue.apply({},base);
  assert.deepEqual(out.tickets.map(x=>x.ticket),base.tickets.map(x=>x.ticket),"対象展開以外は変更しない");
}

{
  const api = {
    select(){ return selected("3コース攻め",["3-1-2","3-2-1","1-2-3"]); },
    createPracticalSelection(){ throw new Error("original should not be called"); }
  };
  const wrapped = rescue.install(api);
  assert.equal(wrapped.__threeCourseEscapeRescueFixed5Installed,true);
  assert.deepEqual(wrapped.createPracticalSelection({}).map(x=>x.ticket),["3-1-2","3-2-1","1-3-4"]);
  assert.equal(rescue.install(wrapped),wrapped,"二重installしない");
}

console.log("three-course escape rescue fixed5: passed");
