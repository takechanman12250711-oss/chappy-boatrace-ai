"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const moduleReader=require("../scripts/note-reader-presentation.cjs"),reader=require("../js/forecast-reader-contract");
const f=require("../scripts/fixtures/reader-presentation.json");
const {readableArticle}=require("../scripts/note-readable-article");
const {fixture}=require("../scripts/note-independent-monitor-fixture");
const copy=()=>structuredClone(f.bundle);
test("proposed production article and app use exactly the same immutable snapshot",()=>{
 const b=copy(),before=JSON.stringify(b),app=reader.fromPrediction(b.record.prediction);
 const a=moduleReader.article(b.article,b),parsed=moduleReader.parsePaidText(a.paidText);
 const canonical=groups=>groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()}));
 assert.deepEqual(canonical(parsed.sections),canonical(app.groups));assert.deepEqual([...parsed.modelTickets].sort(),[...app.centralTickets].sort());
 assert.deepEqual(moduleReader.sourceModel(b).centralTickets,app.centralTickets);
 assert.equal(parsed.model.primaryCount,37);assert.equal(parsed.model.allCount,41);
 assert.match(a.freeText,new RegExp(app.explanation.text.split("\n")[0]));
 assert.equal((a.fullText.match(/🎯 本命\n\n/g)||[]).length,1);
 assert.doesNotMatch(a.fullText,/⭐ 中心の買い目|🌊 流し|いちばん自信|有料/);
 assert.equal(JSON.stringify(b),before);
 assert.equal(a.presentationVersion,"readable-v10");
});
test("new grammar round trips source groups and identifies the main as counted once",()=>{
 const b=copy(),text=moduleReader.paidTextFromSource(b),model=moduleReader.sourceModel(b);
 assert.deepEqual(moduleReader.parsePaidText(text).sections.map(g=>({label:g.label,tickets:[...g.tickets].sort()})),model.groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()})));
 const p=moduleReader.modelProof(text,f.sourceSha256);
 assert.equal(p.ticketCount,7);assert.equal(p.includedInPublishedResult,true);assert.equal(p.label,reader.MAIN);
});
test("reference ledger counts survive complete overlap with main without reprinting",()=>{
 const b=copy();
 b.article.paidText=b.article.paidText.split("本命とは別会計")[0]+"本命とは別会計の参考予想\n1-2-3";
 const model=moduleReader.sourceModel(b),text=moduleReader.paidTextFromSource(b);
 assert.equal(model.referenceOverlapCount,1);assert.equal(model.groups.some(g=>g.label===reader.REFERENCE),false);
 assert.equal(moduleReader.parsePaidText(text).model.referenceOriginalCount,1);
 assert.match(moduleReader.article(b.article,b).freeText,/元の台帳で1点/);
});
test("duplicate tickets, changed counts, missing main, unreviewed text and malformed formations fail closed",()=>{
 const b=copy(),text=moduleReader.paidTextFromSource(b);
 for(const bad of [text.replace("公開予想：37点","公開予想：36点"),
  text.replace("7点\n\n追加候補","8点\n\n追加候補"),
  text.replace("🎯 本命","追加候補"),text+"\n後付け",text.replace("1 →","1・1 →")])
  assert.throws(()=>moduleReader.parsePaidText(bad));
 assert.throws(()=>moduleReader.modelProof(text,"bad"),/source_hash/);
});
test("saved skip decisions and warnings cannot become a normal main recommendation",()=>{
 for(const change of [b=>b.article.purchaseDecision={status:"skip"},
  b=>b.record.prediction.practicalSelection={purchaseDecision:{status:"skip"}},
  b=>b.article.freeText="【購入見送り】\n比較用候補です。"]){
  const b=copy();change(b);assert.throws(()=>moduleReader.article(b.article,b),/purchase_skipped/);
 }
});
test("independent monitor articles retain all v9 bytes and their original separate model proof",()=>{
 for(const kind of ["escape","manshu"]){
  const b=fixture();b.monitor.kind=kind;const before=JSON.stringify(b);
  const legacy=readableArticle(b.article,b,{presentationVersion:"readable-v9"});
  const a=moduleReader.article(b.article,b,{legacyReader:(a,b)=>readableArticle(a,b,{presentationVersion:"readable-v9"})});
  assert.deepEqual(a,{...legacy,presentationVersion:"readable-v10"});
  assert.deepEqual(moduleReader.parsePaidText(a.paidText).modelTickets,b.baselinePracticalTickets.map(r=>r.ticket));
  assert.equal(moduleReader.modelProof(a.paidText,"a".repeat(64)).includedInPublishedResult,false);
  assert.equal(JSON.stringify(b),before);
 }
});
test("stale ranking prose and result fields never select a new main or explanation",()=>{
 const b=copy(),base=moduleReader.article(b.article,b);
 b.article.rangeSummary="本命は5号艇。";b.record.prediction.actual="6-5-4";b.record.prediction.payout=90000;
 const a=moduleReader.article(b.article,b);assert.equal(a.paidText,base.paidText);assert.equal(a.freeText,base.freeText);
});

test("saved independent-scenario selections remain in main without losing their source union",()=>{
 const b=copy(),row={ticket:"6-5-4",category:"独立展開",candidateKind:"independent-scenario",scenarioClassificationReason:"別頭の独立展開"};
 for(const rows of [b.baselinePracticalTickets,b.article.practicalTickets,b.record.prediction.practicalTickets])rows.push({...row});
 const reference=b.article.paidText.split("本命とは別会計")[1];
 b.article.paidText="🔥 実戦厳選\n\n"+b.baselinePracticalTickets.map(r=>r.ticket).join("\n")+"\n\n計 8点\n\n本命とは別会計"+reference;
 const app=reader.fromPrediction(b.record.prediction),model=moduleReader.sourceModel(b);
 assert.deepEqual(model.groups,app.groups);assert.equal(model.primaryCount,38);
 assert.ok(moduleReader.parsePaidText(moduleReader.paidTextFromSource(b)).modelTickets.includes("6-5-4"));
});

test("formation regrouping round trips varied saved orders without changing source sets",()=>{
 let seed=20261116;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const all=[];for(let a=1;a<=6;a++)for(let b=1;b<=6;b++)for(let c=1;c<=6;c++)if(new Set([a,b,c]).size===3)all.push(a+"-"+b+"-"+c);
 for(let trial=0;trial<40;trial++){
  const pool=[...all];for(let i=pool.length-1;i>0;i--){const j=next()%(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
  const b=copy(),p=b.record.prediction,rows=pool.slice(0,32).map(ticket=>({ticket}));
  p.mainSheet.tickets=rows.slice(0,8);p.mainSheet.coverTickets=rows.slice(8,16);p.mainSheet.flowTickets=rows.slice(16,24);p.manshuSheet.tickets=rows.slice(24);
  b.baselinePracticalTickets=rows.slice(0,7);b.article.practicalTickets=rows.slice(0,7);p.practicalTickets=rows.slice(0,7);
  b.article.paidText="🔥 実戦厳選\n\n"+rows.slice(0,7).map(r=>r.ticket).join("\n")+"\n\n計 7点";
  const parsed=moduleReader.parsePaidText(moduleReader.paidTextFromSource(b));
  assert.deepEqual([...parsed.model.allTickets].sort(),rows.map(r=>r.ticket).sort());
 }
});

test("note and app share the same stop condition for contradictory, empty or unavailable stored selection",()=>{
 for(const selection of [{tickets:[{ticket:"1-2-3"}]},{tickets:[]},{purchaseDecision:{status:"unavailable"}}]){
  const b=copy();b.record.prediction.practicalSelection=selection;
  assert.notEqual(reader.fromPrediction(b.record.prediction).status,"selected");
  assert.throws(()=>moduleReader.article(b.article,b),/app_selection_unavailable/);
 }
});
