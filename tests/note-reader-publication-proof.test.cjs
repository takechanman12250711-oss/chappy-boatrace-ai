"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{createHash}=require("node:crypto");
const sample=require("../scripts/fixtures/reader-presentation.json");
const reader=require("../scripts/note-reader-presentation.cjs");
const contract=require("../js/forecast-reader-contract");
const {fixture}=require("../scripts/note-independent-monitor-fixture");
const {sectionProof,publishedTicketSections,classifyPublishedTickets,verifiedModelSubset,extractPublishedTicketSections}=require("../scripts/note-published-ticket-sections");
const {winningProvenance,validateWinningProvenance}=require("../scripts/note-result-provenance");
const {priceForPresentation}=require("../scripts/note-pricing");
const hash=value=>createHash("sha256").update(value).digest("hex");
const clone=value=>structuredClone(value);
const VERSION="readable-v10";
function normal(){
 const b=clone(sample.bundle);
 b.capturedAt="2026-11-16T10:52:30.391Z";
 b.record.raceKey="20261116-24-11";b.record.selectedAt=b.capturedAt;
 return b;
}
function input(bundle=normal()){
 const bytes=JSON.stringify(bundle),deadline=Date.parse(bundle.record.deadlineAt),series=bundle.monitor?.kind||"normal";
 const row={raceKey:bundle.record.raceKey,publicationKey:bundle.record.raceKey+":"+series,articleSeries:series,
  sourceSha256:hash(bytes),place:bundle.record.place,raceNo:bundle.record.raceNo,deadlineAt:bundle.record.deadlineAt,
  publishedAt:new Date(deadline-180000).toISOString(),ticketCount:bundle.baselinePracticalTickets.length,
  price:0,url:"https://note.com/great_robin3243/n/nabc123"};
 const text=reader.paidTextFromSource(bundle,series);
 const proof=sectionProof(text,VERSION,{sourceSha256:row.sourceSha256});
 row.publicationEvidence={version:"note-publication-evidence-v1",receiptCommitSha:"a".repeat(40),publisherCommitSha:"b".repeat(40),
  sourceSha256:row.sourceSha256,presentationVersion:VERSION,publishedDisplayProof:proof};
 const receipt={version:"note-publication-receipt-v1",raceKey:row.raceKey,publicationKey:row.publicationKey,articleSeries:series,
  sourceSha256:row.sourceSha256,publishedAt:row.publishedAt,verifiedAt:new Date(Date.parse(row.publishedAt)+1000).toISOString(),
  url:row.url,price:row.price,publishedDisplayProof:clone(proof)};
 return {bundle,bytes,row,text,proof,receipt,now:deadline+60000,deadline};
}
test("v10 receipt reconstitutes exact 7/13/17/4 source groups and counts primary only once",()=>{
 const f=input(),before=JSON.stringify(f),s=publishedTicketSections(f.row,f.bytes,f.now);
 assert.equal(s.status,"verified");assert.equal(s.presentationVersion,VERSION);
 assert.deepEqual(s.sections.map(g=>g.tickets.length),[7,13,17]);
 assert.equal(s.publishedTicketCount,37);assert.equal(s.displayedPrimaryTicketCount,37);
 assert.equal(s.referenceTicketCount,4);assert.equal(s.referenceOriginalTicketCount,4);assert.equal(s.referenceOverlapTicketCount,0);
 assert.equal(new Set(s.unionTickets).size,37);
 assert.equal(f.proof.modelSubset.ticketCount,7);assert.equal(f.proof.modelSubset.includedInPublishedResult,true);
 assert.equal(f.proof.modelSubset.label,contract.MAIN);
 assert.equal(f.proof.sections.at(-1).includedInPublishedResult,false);
 assert.ok(!/[1-6]-[1-6]-[1-6]/.test(JSON.stringify(f.proof)));
 assert.equal(JSON.stringify(f),before);
});
test("reference-only tickets cannot win the published primary result",()=>{
 const f=input(),parsed=reader.parsePaidText(f.text),refs=parsed.model.groups.find(g=>g.label===contract.REFERENCE).tickets;
 for(const ticket of refs){
  const result=classifyPublishedTickets(f.row,f.bytes,ticket,f.now);
  assert.equal(result.status,"miss");assert.deepEqual(result.matchedSections,[]);
 }
 const main=classifyPublishedTickets(f.row,f.bytes,"1-2-3",f.now);
 assert.equal(main.status,"hit");assert.deepEqual(main.matchedSections,[contract.MAIN]);
});
test("complete reference overlap preserves original ledger count without inventing a displayed section",()=>{
 const b=normal();
 b.article.paidText=b.article.paidText.split("本命とは別会計")[0]+"本命とは別会計の参考予想\n1-2-3";
 b.record.prediction.manshuForecastLedger={forecasts:[{formation:{expandedTickets:["1-2-3"]}}]};
 const f=input(b),s=publishedTicketSections(f.row,f.bytes,f.now);
 assert.equal(s.status,"verified");assert.equal(s.publishedTicketCount,37);
 assert.equal(s.referenceTicketCount,0);assert.equal(s.referenceOriginalTicketCount,1);assert.equal(s.referenceOverlapTicketCount,1);
 assert.equal(f.proof.referenceOriginalTicketCount,1);assert.equal(f.proof.referenceOverlapTicketCount,1);
 assert.ok(!f.proof.sections.some(g=>g.label===contract.REFERENCE));
 assert.equal(classifyPublishedTickets(f.row,f.bytes,"1-2-3",f.now).status,"hit");
});
test("count, union, reference ledger, model subset and immutable source tampering fail closed",()=>{
 const f=input();
 for(const mutate of [
  p=>p.publishedTicketCount++,p=>p.sections[0].ticketCount++,p=>p.modelSubset.ticketCount++,
  p=>p.modelSubset.includedInPublishedResult=false,p=>p.referenceOriginalTicketCount++,
  p=>p.referenceOverlapTicketCount++,p=>p.sections.at(-1).includedInPublishedResult=true,
  p=>p.publishedTicketsSha256="c".repeat(64),p=>p.sourceSha256="c".repeat(64)
 ]){
  const row=clone(f.row);mutate(row.publicationEvidence.publishedDisplayProof);
  assert.equal(publishedTicketSections(row,f.bytes,f.now).status,"review");
 }
 assert.equal(publishedTicketSections(f.row,f.bytes+" ",f.now).reason,"source_hash_mismatch");
 const changed=clone(f.bundle);changed.record.prediction.mainSheet.tickets.pop();
 const bytes=JSON.stringify(changed),row=clone(f.row);row.sourceSha256=hash(bytes);row.publicationEvidence.sourceSha256=row.sourceSha256;
 assert.equal(publishedTicketSections(row,bytes,f.now).reason,"published_display_proof_mismatch");
});
test("malformed body counts and unknown versions cannot mint a receipt proof",()=>{
 const f=input();
 assert.throws(()=>sectionProof(f.text.replace("公開予想：37点","公開予想：38点"),VERSION,{sourceSha256:f.row.sourceSha256}),/count_invalid/);
 assert.throws(()=>sectionProof(f.text,"readable-v11",{sourceSha256:f.row.sourceSha256}),/unsupported/);
 assert.equal(extractPublishedTicketSections(f.text,{presentationVersion:"readable-v11"}).status,"review");
 assert.equal(priceForPresentation(VERSION),0);
});
test("v10 model subset binds actual saved selection and receipt while result lists stay closed before deadline",()=>{
 const f=input(),at=Date.parse(f.receipt.verifiedAt);
 const subset=verifiedModelSubset(f.row,f.bytes,f.receipt,at);
 assert.equal(subset.label,contract.MAIN);assert.equal(subset.ticketCount,7);
 assert.equal(subset.ticketsSha256,hash(JSON.stringify(f.bundle.baselinePracticalTickets.map(r=>r.ticket).sort())));
 for(const now of [at,f.deadline]){
  assert.deepEqual(publishedTicketSections(f.row,f.bytes,now),{status:"pending",reason:"official_result_pending"});
  assert.ok(!JSON.stringify(publishedTicketSections(f.row,f.bytes,now)).includes("1-2-3"));
 }
 const receipt=clone(f.receipt);receipt.publishedDisplayProof.modelSubset.ticketsSha256="e".repeat(64);
 assert.throws(()=>verifiedModelSubset(f.row,f.bytes,receipt,at),/proof_mismatch/);
});
test("new main display never changes the original source-category result provenance",()=>{
 const f=input(),section=publishedTicketSections(f.row,f.bytes,f.now),combination="1-2-5";
 const matchedSections=section.sections.filter(s=>s.tickets.includes(combination)).map(s=>s.label);
 assert.deepEqual(matchedSections,[contract.MAIN]);
 const settlement={status:"hit",method:"published-main-sections-v1",combination,payoutPer100Yen:1090,
  publishedTicketCount:section.publishedTicketCount,sectionsSha256:section.sectionsSha256,matchedSections};
 settlement.evidenceId=hash([settlement.method,f.row.publicationKey,f.row.sourceSha256,section.sectionsSha256,
  combination,settlement.payoutPer100Yen].join("|"));
 const proof=winningProvenance(f.row,f.bytes,settlement,section,f.now);
 assert.ok(proof);assert.deepEqual(proof.origins,[{categoryId:"flow",sourceField:"record.prediction.mainSheet.flowTickets"}]);
 const binding={publicationKey:f.row.publicationKey,raceKey:f.row.raceKey,articleSeries:f.row.articleSeries,
  sourceSha256:f.row.sourceSha256,status:"hit",combination,evidenceId:settlement.evidenceId,
  sectionsSha256:section.sectionsSha256,matchedSections};
 assert.deepEqual(validateWinningProvenance(proof,binding).map(o=>o.categoryId),["flow"]);
});
test("independent v10 kinds retain v9 category/reference bytes and the excluded separate model ledger",()=>{
 for(const kind of ["escape","manshu"]){
  const b=fixture();b.monitor.kind=kind;
  b.article.paidText+="\n\n参考\n・6-1-2";b.monitor.article=clone(b.article);
  const f=input(b),s=publishedTicketSections(f.row,f.bytes,f.now);
  assert.equal(s.status,"verified");assert.equal(s.publishedTicketCount,2);assert.equal(s.referenceTicketCount,1);
  assert.equal(s.referenceOriginalTicketCount,undefined);assert.equal(s.referenceOverlapTicketCount,undefined);
  assert.equal(f.proof.modelSubset.includedInPublishedResult,false);assert.equal(f.proof.modelSubset.label,reader.labelForSeries(kind));
  assert.equal(f.proof.referenceOriginalTicketCount,undefined);
  assert.deepEqual(f.proof,{...sectionProof(f.text,"readable-v9",{sourceSha256:f.row.sourceSha256}),presentationVersion:VERSION});
  const subset=verifiedModelSubset(f.row,f.bytes,f.receipt,Date.parse(f.receipt.verifiedAt));
  assert.equal(subset.ticketCount,2);assert.equal(subset.label,reader.labelForSeries(kind));
  assert.equal(classifyPublishedTickets(f.row,f.bytes,"6-1-2",f.now).status,"miss");
 }
});
