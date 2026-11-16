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
 b.record.prediction.manshuForecastLedger={forecasts:[{formation:{expandedTickets:["1-2-3"]}}]};
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
  delete p.manshuForecastLedger;
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

test("reference surplus or missing source on either side stops without changing the immutable input",()=>{
 const variants=[
  b=>b.record.prediction.manshuForecastLedger.forecasts.push({formation:{expandedTickets:["6-5-4"]}}),
  b=>b.article.paidText+="\n6-5-4",
  b=>b.article.paidText=b.article.paidText.replace("\n4-1-2",""),
  b=>b.record.prediction.manshuForecastLedger.forecasts[0].formation.expandedTickets.shift()
 ];
 for(const change of variants){
  const b=copy();change(b);const before=JSON.stringify(b);
  assert.equal(reader.fromPrediction(b.record.prediction).status,"selected");
  assert.throws(()=>moduleReader.sourceModel(b),/reader_app_presentation_mismatch/);
  assert.equal(JSON.stringify(b),before);
 }
});
test("overlap metadata disagreement stops even when every displayed group and total is identical",()=>{
 const b=copy();b.article.paidText+="\n1-2-3";
 const before=JSON.stringify(b),app=reader.fromPrediction(b.record.prediction);
 assert.equal(app.referenceOriginalCount,4);assert.equal(app.referenceOverlapCount,0);
 assert.equal(app.primaryCount,37);assert.equal(app.allCount,41);
 assert.throws(()=>moduleReader.sourceModel(b),/reader_app_presentation_mismatch/);
 assert.equal(JSON.stringify(b),before);
});
test("family disagreement stops even when its ticket union and all counts remain the same",()=>{
 const b=copy(),before=JSON.stringify(b),original=reader.fromPrediction;
 reader.fromPrediction=p=>{
  const app=original(p),groups=structuredClone(app.groups);
  const hole=groups.find(g=>g.label===reader.HOLE),additional=groups.find(g=>g.label===reader.ADDITIONAL);
  additional.tickets.push(hole.tickets.shift());
  return {...app,groups};
 };
 try{assert.throws(()=>moduleReader.sourceModel(b),/reader_app_presentation_mismatch/);}
 finally{reader.fromPrediction=original;}
 assert.equal(JSON.stringify(b),before);
});

test('missing saved purchase policy uses the same approved wall skip without selecting or mutating source',()=>{
 const b=copy(),p=b.record.prediction;p.race={deadlineAt:'2026-11-16T20:07:00+09:00'};
 p.wallTheory={state:'壁成立',attackerNo:2,wallCandidateNo:3,score:80,grade:'A'};
 delete p.practicalSelection?.purchaseDecision;delete b.article.purchaseDecision;
 const selector=require('../js/practical-selection'),boundary=require('../js/main-cover-display-boundary');
 const previous=globalThis.ChappyPracticalSelection,canary={select(){throw Error('must not reselect saved tickets');}};
 globalThis.ChappyPracticalSelection=canary;const before=JSON.stringify(b);
 try{
  assert.equal(boundary.prepare(p,selector,reader).readerPresentation.status,'skipped');
  assert.throws(()=>moduleReader.sourceModel(b),/reader_purchase_skipped/);
  assert.equal(globalThis.ChappyPracticalSelection,canary);assert.equal(JSON.stringify(b),before);
 }finally{globalThis.ChappyPracticalSelection=previous;}
});
test('missing policy computation failures and unknown policy states stop note main recommendations',()=>{
 const selector=require('../js/practical-selection'),original=selector.purchaseDecision;
 for(const resolve of [()=>{throw Error('unavailable');},()=>null,()=>({status:'unknown'})]){
  const b=copy();delete b.record.prediction.practicalSelection?.purchaseDecision;const before=JSON.stringify(b);
  selector.purchaseDecision=resolve;
  try{assert.throws(()=>moduleReader.sourceModel(b),/reader_app_selection_unavailable/);assert.equal(JSON.stringify(b),before);}
  finally{selector.purchaseDecision=original;}
 }
});

test('policy import restores absent, own-undefined and existing selector references on first and cached load',()=>{
 const {spawnSync}=require('node:child_process');
 const script=`const assert=require('node:assert/strict');
 const mode=process.argv[1],host=mode==='window'?{}:globalThis;
 if(mode==='window')globalThis.window=host;
 const canary={select(){throw Error('selection must not run');}};
 if(mode==='undefined')host.ChappyPracticalSelection=undefined;
 else if(mode==='existing'||mode==='window')host.ChappyPracticalSelection=canary;
 const had=Object.hasOwn(host,'ChappyPracticalSelection'),previous=host.ChappyPracticalSelection;
 const adapter=require('./scripts/note-reader-presentation.cjs'),bundle=structuredClone(require('./scripts/fixtures/reader-presentation.json').bundle);
 delete bundle.record.prediction.practicalSelection?.purchaseDecision;
 const before=JSON.stringify(bundle),core=require.resolve('./js/practical-selection');
 assert.equal(require.cache[core],undefined);
 for(let i=0;i<2;i++){
  assert.equal(adapter.sourceModel(bundle).centralTickets.length,7);
  assert.equal(Object.hasOwn(host,'ChappyPracticalSelection'),had);
  assert.equal(host.ChappyPracticalSelection,previous);
  assert.equal(JSON.stringify(bundle),before);
 }`;
 for(const mode of ['absent','undefined','existing','window']){
  const child=spawnSync(process.execPath,['-e',script,mode],{cwd:require('node:path').join(__dirname,'..'),encoding:'utf8'});
  assert.equal(child.status,0,mode+': '+child.stdout+child.stderr);
 }
});
test('an existing saved purchase decision is retained without recalculation',()=>{
 const b=copy(),p=b.record.prediction,selector=require('../js/practical-selection'),prior=selector.purchaseDecision;
 p.practicalSelection={tickets:structuredClone(p.practicalTickets),purchaseDecision:{status:'unchanged'}};
 const before=JSON.stringify(b);selector.purchaseDecision=()=>{throw Error('saved decision must not be recalculated');};
 try{assert.equal(moduleReader.sourceModel(b).centralTickets.length,7);assert.equal(JSON.stringify(b),before);}
 finally{selector.purchaseDecision=prior;}
});

test('an unknown saved purchase status stops both article and app without recalculation',()=>{
 const b=copy(),p=b.record.prediction;
 p.practicalSelection={tickets:structuredClone(p.practicalTickets),purchaseDecision:{status:'unknown'}};
 const selector=require('../js/practical-selection'),prior=selector.purchaseDecision,before=JSON.stringify(b);
 selector.purchaseDecision=()=>{throw Error('saved policy must not be recalculated');};
 try{assert.equal(reader.fromPrediction(p).status,'unavailable');assert.throws(()=>moduleReader.sourceModel(b),/reader_app_selection_unavailable/);assert.equal(JSON.stringify(b),before);}
 finally{selector.purchaseDecision=prior;}
});

test('saved Toda 134 uses the same provenance and full groups in note v10 while v9 stays unchanged',()=>{
 const b=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').savedBundle),before=JSON.stringify(b),p=b.record.prediction;
 const app=reader.fromPrediction(p,{tickets:p.practicalTickets,purchaseDecision:{status:'unchanged'}},
  {record:b.record,practicalSelectionEvidence:b.record.practicalSelectionEvidence,copies:[b.baselinePracticalTickets,b.article.practicalTickets]});
 const model=moduleReader.sourceModel(b),paid=moduleReader.paidTextFromSource(b),parsed=moduleReader.parsePaidText(paid);
 assert.equal(app.status,'selected');assert.deepEqual(model.groups,app.groups);
 assert.deepEqual(model.centralTickets,b.baselinePracticalTickets.map(r=>r.ticket));
 assert.ok(model.centralTickets.includes('1-3-4'));assert.ok(model.allTickets.includes('3-1-2'),'replaced saved pool ticket stays an additional candidate');
 assert.equal(parsed.modelTickets.length,10);assert.ok(parsed.modelTickets.includes('1-3-4'));
 assert.deepEqual(require('../scripts/note-scenario-presentation.cjs').sourceSubset(b),model.centralTickets,'the unchanged v9 rules still read this in-pool historical 134');
 assert.equal(JSON.stringify(b),before);
});
test('v10 rescue requires every saved copy, record identity and original practical body to agree',()=>{
 const original=require('../scripts/fixtures/reader-saved-rescues-derived.json').savedBundle;
 for(const change of [
  b=>b.baselinePracticalTickets.reverse(),
  b=>b.article.practicalTickets.reverse(),
  b=>b.record.prediction.practicalTickets.at(-1).threeCourseEscapeRescueFixed5.version='unknown',
  b=>b.baselinePracticalTickets.at(-1).comment='changed',
  b=>delete b.article.practicalTickets.at(-1).threeCourseEscapeRescueFixed5,
  b=>b.record.practicalSelectionEvidence.raceKey='20261101-02-3',
  b=>delete b.record.practicalSelectionEvidence,
  b=>b.article.paidText=b.article.paidText.replace('計 10点','計 9点')
 ]){
  const b=structuredClone(original);
  // Explicit off-pool contract variant, not a replacement for the source original.
  for(const rows of [b.record.prediction.mainSheet.tickets,b.record.prediction.mainSheet.coverTickets,b.record.prediction.mainSheet.flowTickets,b.record.prediction.manshuSheet.tickets]){
   const index=rows.indexOf('1-3-4');if(index>=0)rows.splice(index,1);
  }
  change(b);const before=JSON.stringify(b);
  assert.throws(()=>moduleReader.sourceModel(b));assert.equal(JSON.stringify(b),before);
 }
});

test('in-pool historical 134 remains readable without later rescue evidence, while off-pool needs it',()=>{
 const b=structuredClone(require('../scripts/fixtures/reader-saved-rescues-derived.json').savedBundle);
 const base=moduleReader.sourceModel(b);delete b.record.practicalSelectionEvidence;
 assert.deepEqual(moduleReader.sourceModel(b),base);
 for(const rows of [b.record.prediction.mainSheet.tickets,b.record.prediction.mainSheet.coverTickets,b.record.prediction.mainSheet.flowTickets,b.record.prediction.manshuSheet.tickets]){
  const index=rows.indexOf('1-3-4');if(index>=0)rows.splice(index,1);
 }
 assert.throws(()=>moduleReader.sourceModel(b),/reader_app_selection_unavailable/);
});

test('independent off-pool family must agree across baseline, article and prediction copies',()=>{
 function independent(){
  const b=copy(),row={ticket:'6-5-4',category:'独立展開',candidateKind:'independent-scenario',scenarioClassificationReason:'別頭の独立展開'};
  for(const rows of [b.baselinePracticalTickets,b.article.practicalTickets,b.record.prediction.practicalTickets])rows.push({...row});
  const reference=b.article.paidText.split('本命とは別会計')[1];
  b.article.paidText='🔥 実戦厳選\n\n'+b.baselinePracticalTickets.map(r=>r.ticket).join('\n')+'\n\n計 8点\n\n本命とは別会計'+reference;
  return b;
 }
 const valid=independent(),before=JSON.stringify(valid);
 assert.equal(moduleReader.sourceModel(valid).centralTickets.length,8);assert.equal(JSON.stringify(valid),before);
 for(const key of ['baseline','article','prediction']){
  const b=independent(),rows=key==='baseline'?b.baselinePracticalTickets:key==='article'?b.article.practicalTickets:b.record.prediction.practicalTickets;
  rows.at(-1).scenarioClassificationReason='残し艇を使う押さえ展開';
  const changed=JSON.stringify(b);
  assert.throws(()=>moduleReader.sourceModel(b),/reader_center_copy_invalid|reader_app_selection_unavailable/);
  assert.equal(JSON.stringify(b),changed);
 }
});
