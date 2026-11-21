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

test("approved wall purchase skip is retained when only saved tickets exist",()=>{
  const p=clone();p.race={deadlineAt:"2026-11-16T20:07:00+09:00"};
  p.wallTheory={state:"壁成立",attackerNo:2,wallCandidateNo:3,score:80,grade:"A"};
  const selector=require("../js/practical-selection"),before=JSON.stringify(p);
  assert.equal(selector.purchaseDecision(p).status,"skip");
  const out=boundary.prepare(p,selector,reader);
  assert.equal(out.readerPresentation.status,"skipped");
  assert.equal(reader.fromPrediction(out).status,"skipped");
  assert.deepEqual(out.practicalSelection.tickets,p.practicalTickets);
  assert.equal(JSON.stringify(p),before);
});
test("unavailable purchase-policy computation cannot fall through to a buy recommendation",()=>{
  const p=clone(),selector={purchaseDecision(){throw Error("policy unavailable");}};
  const out=boundary.prepare(p,selector,reader);
  assert.equal(reader.fromPrediction(out).status,"unavailable");
  assert.deepEqual(out.mainSheet,p.mainSheet);
});

test("a skipped forecast selection remains skipped rather than empty or selected",()=>{
 const p=clone(); const out=reader.fromPrediction(p,{status:"skipped",reason:"展開未成立",tickets:[]});
 assert.equal(out.status,"skipped");assert.equal(out.reason,"展開未成立");assert.deepEqual(out.groups,[]);
});

test('app boundary injects the existing projector into a display copy without selecting or mutating the raw forecast',()=>{
 const p=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').livePrediction),facts=require('../scripts/fixtures/reader-explanation-derived.json').prediction;
 p.race=structuredClone(facts.race);p.aiCore=structuredClone(facts.aiCore);p.predictionMode='retrospective_reference';
 const before=JSON.stringify(p),selection=p.practicalSelection,capture=require('../js/prediction-conditions').capture;
 const selector={select(){throw Error('must not select');},purchaseDecision(){throw Error('must not replace the existing decision');}};
 const out=boundary.prepare(p,selector,reader,capture);
 assert.notEqual(out,p);assert.equal(out.practicalSelection,selection);assert.equal(out.mainSheet,p.mainSheet);
 assert.equal(out.readerPresentation.status,'selected');assert.equal(out.readerPresentation.centralTickets.length,9);
 assert.equal(out.readerPresentation.explanation.verified,true);assert.match(out.readerPresentation.explanation.text,/平均STは0.12、展示STはF0.02/);
 assert.equal(out.predictionMode,'retrospective_reference');assert.deepEqual(Object.keys(out.preRaceConditions),['boats']);
 assert.equal(JSON.stringify(p),before);
 const again=boundary.prepare(out,selector,reader,capture);assert.deepEqual(again.readerPresentation,out.readerPresentation);assert.equal(JSON.stringify(p),before);
 p.race.entries[3].avgST='.99';
 const uncertain=boundary.prepare(p,selector,reader,capture);
 assert.equal(uncertain.readerPresentation.status,'selected');assert.equal(uncertain.readerPresentation.explanation.verified,false);
 assert.deepEqual(uncertain.readerPresentation.centralTickets,out.readerPresentation.centralTickets);
});

test('selection and purchase decision see the exact raw input before any display projection',()=>{
 const p=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').livePrediction),facts=require('../scripts/fixtures/reader-explanation-derived.json').prediction;
 p.race=structuredClone(facts.race);p.aiCore=structuredClone(facts.aiCore);
 const selected=p.practicalSelection;delete p.practicalSelection;delete p.practicalTickets;delete selected.purchaseDecision;
 const before=JSON.stringify(p),order=[],capture=require('../js/prediction-conditions').capture;
 function rawOnly(value){
  assert.equal(value,p);assert.equal(Object.hasOwn(value,'preRaceConditions'),false);
  assert.equal(Object.hasOwn(value.verificationEvidence.mainScenario,'attackerCourse'),false);
  assert.equal(Object.hasOwn(value,'readerExplanationUnavailable'),false);
 }
 const selector={
  select(value){rawOnly(value);order.push('select');return selected;},
  purchaseDecision(value){rawOnly(value);order.push('purchase');return {status:'unchanged'};}
 };
 const out=boundary.prepare(p,selector,reader,(race,input)=>{
  assert.deepEqual(order,['select','purchase']);order.push('capture');return capture(race,input);
 });
 assert.deepEqual(order,['select','purchase','capture']);
 assert.equal(out.readerPresentation.status,'selected');assert.equal(out.readerPresentation.explanation.verified,true);
 assert.equal(JSON.stringify(p),before);assert.equal(Object.hasOwn(selected,'purchaseDecision'),false);
});
test('shared reader fallback does not feed display facts back into the legacy boundary',()=>{
 const p=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').livePrediction),facts=require('../scripts/fixtures/reader-explanation-derived.json').prediction;
 p.race=structuredClone(facts.race);p.aiCore=structuredClone(facts.aiCore);
 const before=JSON.stringify(p),out=boundary.prepare(p,{select(){throw Error('stored selection must be reused');}},
  {...reader,fromPrediction(){return null;}},require('../js/prediction-conditions').capture);
 assert.equal(Object.hasOwn(out,'preRaceConditions'),false);
 assert.equal(Object.hasOwn(out.verificationEvidence.mainScenario,'attackerCourse'),false);
 assert.equal(JSON.stringify(p),before);
});

test('invalid raw scalar suppresses explanation while keeping all nine tickets and the original purchase decision',()=>{
 for(const flat of [false,true]){
  const p=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').livePrediction),facts=require('../scripts/fixtures/reader-explanation-derived.json').prediction;
  p.race=structuredClone(flat?facts.race.raw:facts.race);p.aiCore=structuredClone(facts.aiCore);
  if(flat)p.race.entries[3].avgSt=false;
  else{p.race.entries[3].avgST=' ';p.race.raw.entries[3].avgSt=' ';}
  const before=JSON.stringify(p),decision=p.practicalSelection.purchaseDecision;
  const out=boundary.prepare(p,{select(){throw Error('no reselect');},purchaseDecision(){throw Error('existing decision retained');}},reader,require('../js/prediction-conditions').capture);
  assert.equal(out.readerPresentation.status,'selected');assert.equal(out.readerPresentation.explanation.verified,false);
  assert.equal(out.practicalSelection.purchaseDecision,decision);
  assert.deepEqual(out.readerPresentation.centralTickets,p.practicalSelection.tickets.map(row=>row.ticket));assert.equal(out.readerPresentation.centralTickets.length,9);
  assert.equal(JSON.stringify(p),before);
 }
});
