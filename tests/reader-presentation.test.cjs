"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fixture=require("../scripts/fixtures/reader-presentation.json");
const reader=require("../js/forecast-reader-contract"),boundary=require("../js/main-cover-display-boundary");
const preview=require("../scripts/note-reader-preview.cjs");
const clone=()=>structuredClone(fixture.bundle.record.prediction);
test("saved Omura snapshot has exactly the same article and app tickets, counts and reason",()=>{
  const b=structuredClone(fixture.bundle),before=JSON.stringify(b);
  const note=preview.build(b,{sourceSha256:fixture.sourceSha256}),app=reader.fromPrediction(b.record.prediction);
  assert.equal(app.status,"selected");
  assert.deepEqual(app.groups,note.groups);assert.deepEqual(app.centralTickets,note.centralTickets);
  assert.equal(app.primaryCount,37);assert.equal(app.allCount,41);
  assert.deepEqual(app.groups.map(g=>g.tickets.length),[7,13,17,4]);
  assert.equal(app.explanation.text,preview.explanation(b).text);
  assert.equal(JSON.stringify(b),before);
});
test("display boundary retains full source pools and independent selected tickets before normal-count clipping",()=>{
  const p=clone(),before=JSON.stringify(p);
  p.practicalSelection={tickets:p.practicalTickets,expansionSummary:{normalCount:3}};
  const out=boundary.prepare(p,null,reader),again=boundary.prepare(out,null,reader);
  assert.deepEqual(out.readerPresentation.centralTickets,p.practicalTickets.map(r=>r.ticket));
  assert.equal(out.readerPresentation.primaryCount,37);
  assert.deepEqual(out.mainSheet,p.mainSheet);assert.deepEqual(again.readerPresentation,out.readerPresentation);
  const extra={ticket:"6-5-4",category:"独立展開",candidateKind:"independent-scenario",scenarioClassificationReason:"別頭の独立展開"};
  p.practicalTickets.push(extra);
  assert.ok(boundary.prepare(p,null,reader).readerPresentation.centralTickets.includes(extra.ticket));
  delete p.practicalSelection;
  p.practicalTickets.pop();assert.equal(JSON.stringify(p),before);
});
test("selector is resolved once and its full confirmed selection reaches the card",()=>{
  const p=clone();delete p.practicalTickets;let calls=0;
  const select=()=>{calls++;return {tickets:[{ticket:"1-2-3"}],expansionSummary:{normalCount:0}};};
  const out=boundary.prepare(p,{select},reader);
  assert.equal(calls,1);assert.equal(out.readerPresentation.status,"selected");
  assert.deepEqual(out.readerPresentation.centralTickets,["1-2-3"]);
  boundary.prepare(out,{select},reader);assert.equal(calls,1);
});
test("skip, empty, missing selection and contradictory copies never acquire a main recommendation",()=>{
  const p=clone();
  for(const [selection,status] of [[{tickets:p.practicalTickets,purchaseDecision:{status:"skip",reason:"壁艇条件"}},"skipped"],[{tickets:[]},"empty"]]){
    const out=reader.fromPrediction(p,selection);assert.equal(out.status,status);assert.deepEqual(out.groups,[]);assert.equal(out.primaryCount,0);
  }
  delete p.practicalTickets;assert.equal(reader.fromPrediction(p).status,"unavailable");
  const c=clone();c.practicalSelection={tickets:[{ticket:"1-2-3"}]};
  assert.equal(reader.fromPrediction(c).status,"unavailable");
});
test("missing or invalid pools and unclassified independent selections fail closed without guessing",()=>{
  for(const alter of [p=>delete p.mainSheet.flowTickets,p=>p.manshuSheet.tickets.push("1-1-3"),
    p=>p.practicalTickets.push({ticket:"6-5-4"}),p=>p.manshuForecastLedger={forecasts:[{}]}]){
    const p=clone();alter(p);const out=reader.fromPrediction(p);
    assert.equal(out.status,"unavailable");assert.deepEqual(out.groups,[]);
  }
});
test("odds and official results cannot alter source groups or counts",()=>{
  const p=clone(),a=reader.fromPrediction(p);
  p.oddsByTicket={"1-2-3":101,"1-4-3":99};p.result="6-5-4";p.payout=100000;
  const b=reader.fromPrediction(p);assert.deepEqual(a,b);
});
