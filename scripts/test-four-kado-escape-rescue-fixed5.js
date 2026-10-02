"use strict";
const assert = require("node:assert/strict");
const rescue = require("../js/four-kado-escape-rescue-fixed5");

function selected(label,tickets){
  return {
    status:"selected",
    evidence:{raceFlow:{title:label}},
    tickets:tickets.map(ticket=>({ticket,category:"本線",branchIds:[`branch:${ticket}`],roleClaims:[{role:"attack",boatNo:Number(ticket[0])}]})),
    expansionSummary:{finalCount:tickets.length},
    verificationEvidence:{
      mainScenario:{label},
      tickets:tickets.map(ticket=>({ticket,categories:["本線"],branchIds:[`branch:${ticket}`],roleClaims:[{role:"attack",boatNo:Number(ticket[0])}],theoryClaims:[{theoryKey:"flow"}] }))
    }
  };
}

{
  const base = selected("4カド攻め",["4-1-2","4-2-1","1-4-2","1-2-3","4-1-3"]);
  const out = rescue.apply({},base);
  assert.equal(out.tickets.length,5,"点数は維持する");
  assert.deepEqual(out.tickets.map(x=>x.ticket),["4-1-2","4-2-1","1-4-2","1-2-3","1-2-4"]);
  assert.equal(out.expansionSummary.fourKadoEscapeRescueFixed5.replacedTicket,"4-1-3");
  assert.equal(out.tickets[4].category,"検証済み救済");
  assert.deepEqual(out.tickets[4].branchIds,[],"元券の枝根拠を救済券へ流用しない");
  assert.deepEqual(out.tickets[4].coverage,[],"元券の役割根拠を救済券へ流用しない");
  assert.equal(out.verificationEvidence.tickets[4].ticket,"1-2-4");
  assert.deepEqual(out.verificationEvidence.tickets[4].branchIds,[]);
  assert.deepEqual(out.verificationEvidence.tickets[4].roleClaims,[]);
  assert.deepEqual(out.verificationEvidence.tickets[4].theoryClaims,[]);
}

{
  const base = selected("4カド攻め",["4-1-2","1-2-4","1-4-2"]);
  const out = rescue.apply({},base);
  assert.deepEqual(out.tickets.map(x=>x.ticket),base.tickets.map(x=>x.ticket),"既存なら置換しない");
}

{
  const base = selected("4カド攻め警戒",["4-1-2","4-2-1","1-4-2"]);
  const out = rescue.apply({},base);
  assert.deepEqual(out.tickets.map(x=>x.ticket),base.tickets.map(x=>x.ticket),"警戒ラベルには適用しない");
}

{
  const base = selected("3コース攻め",["3-1-2","3-2-1","1-3-2"]);
  const out = rescue.apply({},base);
  assert.deepEqual(out.tickets.map(x=>x.ticket),base.tickets.map(x=>x.ticket),"対象展開以外は変更しない");
}

{
  const api = {select(){ return selected("4カド攻め",["4-1-2","4-2-1","1-4-2"]); },createPracticalSelection(){ throw new Error("original should not be called"); }};
  const wrapped = rescue.install(api);
  assert.equal(wrapped.__fourKadoEscapeRescueFixed5Installed,true);
  assert.deepEqual(wrapped.createPracticalSelection({}).map(x=>x.ticket),["4-1-2","4-2-1","1-2-4"]);
  assert.equal(rescue.install(wrapped),wrapped,"二重installしない");
}

console.log("four-kado escape rescue fixed5: passed");
