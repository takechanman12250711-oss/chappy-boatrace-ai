"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {createHash}=require("node:crypto");
const current=require("../scripts/note-readable-article"),frozenV9=require("../scripts/note-recovery-readable-v9.cjs");
const model=require("../scripts/note-reader-presentation.cjs"),contract=require("../js/forecast-reader-contract");
const {publicationPayload,verifyPublicationSource,parsePublishedDisplayProof}=require("../scripts/note-publication-source");
const {fixture}=require("../scripts/note-independent-monitor-fixture");
const hash=value=>createHash("sha256").update(value).digest("hex");
function rootFor(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"chappy-reader-default-"));
 fs.mkdirSync(path.join(root,"config"),{recursive:true});
 fs.copyFileSync(path.join(__dirname,"../config/note-marketing.json"),path.join(root,"config/note-marketing.json"));
 t.after(()=>{
  const target=path.resolve(root),temp=path.resolve(os.tmpdir());
  if(!target.startsWith(temp+path.sep)||!path.basename(target).startsWith("chappy-reader-default-"))throw Error("unsafe fixture cleanup path");
  fs.rmSync(target,{recursive:true,force:true});
 });
 return root;
}
function store(root,bundle){
 const bytes=JSON.stringify(bundle),r=bundle.record;
 const name="data/note-drafts/"+r.date+"/"+r.raceKey+"-"+hash(bytes)+".json";
 fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),bytes);
 return {name,bytes};
}
function normal(){
 const prediction={date:"20300914",race:{date:"20300914",stadiumName:"唐津",raceNo:10,raceInfo:{deadline:"16:00"}},
  confidence:84,mainSheet:{honmei:{boatNo:1,name:"テスト選手",score:84},
   evaluations:[1,2,3,4,5,6].map(boatNo=>({boatNo,name:"テスト選手",score:84})),
   tickets:[{ticket:"1-2-3",odds:20},{ticket:"1-2-4",odds:25}],coverTickets:[{ticket:"1-3-2",odds:30}],flowTickets:[{ticket:"2-1-3",odds:50}]},
  manshuSheet:{tickets:[{ticket:"3-4-5",odds:120}]},candidate24Tickets:[{ticket:"6-5-4",odds:180}],
  practicalTickets:[{ticket:"1-2-3",odds:20,category:"本命"}],
  raceFlow:{title:"イン逃げ本線",summary:"1号艇の逃げを中心に考える。"}};
 const before=global.ChappyPracticalSelection;
 global.ChappyPracticalSelection={createPracticalSelection:p=>p.practicalTickets};
 let article;try{article=require("../js/note-generator").generateArticle(prediction);}
 finally{if(before===undefined)delete global.ChappyPracticalSelection;else global.ChappyPracticalSelection=before;}
 const selectedAt="2030-09-14T06:00:00.000Z";
 const bundle={version:"note-draft-bundle-v1",capturedAt:selectedAt,article,baselinePracticalTickets:structuredClone(prediction.practicalTickets),
  record:{date:"20300914",jcd:"23",place:"唐津",raceNo:10,raceKey:"20300914-23-10",
   deadlineAt:"2030-09-14T16:00:00+09:00",selectedAt,prediction},
  minLeadSeconds:120,maxPracticalTickets:10};
 bundle.record.exhibitionSnapshot=require("../scripts/note-exhibition").exhibitionSnapshot({
  entries:[1,2,3,4,5,6].map(boat=>({boat,exhibition:{displayTime:6.8}})),
  startExhibition:[1,2,3,4,5,6].map(boat=>({boat,course:boat,st:0.12,mappingSource:"official-start-image"}))
 },selectedAt);
 return bundle;
}
test("new default is v10 and uses the same saved main and complete groups as the app",()=>{
 const b=structuredClone(require("../scripts/fixtures/reader-presentation.json").bundle),before=JSON.stringify(b);
 const a=current.readableArticle(b.article,b),app=contract.fromPrediction(b.record.prediction);
 assert.equal(a.presentationVersion,"readable-v10");
 const parsed=model.parsePaidText(a.paidText),canonical=groups=>groups.map(g=>({label:g.label,tickets:[...g.tickets].sort()}));
 assert.deepEqual(canonical(parsed.sections),canonical(app.groups));assert.equal(parsed.model.primaryCount,37);
 assert.doesNotMatch(a.fullText,/⭐ 中心の買い目|🌊 流し|有料/);
 assert.equal(JSON.stringify(b),before);
});
test("explicit v9 is byte-identical to its frozen renderer",()=>{
 const b=normal(),before=JSON.stringify(b);
 assert.deepEqual(current.readableArticle(b.article,b,{presentationVersion:"readable-v9"}),frozenV9.readableArticle(b.article,b));
 assert.equal(JSON.stringify(b),before);
 assert.throws(()=>current.readableArticle(b.article,b,{presentationVersion:"unknown-v11"}),/unsupported/);
});
test("audited source and payload default to free v10 with a source-bound proof and no hidden internal candidate",t=>{
 const root=rootFor(t),b=normal(),before=JSON.stringify(b),saved=store(root,b),now=Date.parse(b.record.selectedAt);
 const p=publicationPayload(saved.name,root,now);
 assert.equal(p.presentationVersion,"readable-v10");assert.equal(p.price,0);assert.equal(p.canPublish,true);
 assert.equal(p.practicalTicketCount,1);assert.deepEqual(verifyPublicationSource(p,root,now),p);
 const proof=parsePublishedDisplayProof(p);
 assert.equal(proof.modelSubset.label,contract.MAIN);assert.equal(proof.modelSubset.includedInPublishedResult,true);
 assert.equal(proof.publishedTicketCount,5);assert.equal(proof.modelSubset.ticketCount,1);
 assert.ok(!current.ticketsIn(p.body).includes("6-5-4"));
 assert.ok(!p.body.includes(b.article.paywallMarker));assert.equal(JSON.stringify(b),before);
 assert.equal(fs.readFileSync(path.join(root,saved.name),"utf8"),saved.bytes);
});
test("explicit v9 source reconstruction retains its historical body while v10 becomes the current payload",t=>{
 const root=rootFor(t),b=normal(),saved=store(root,b),now=Date.parse(b.record.selectedAt);
 const old=publicationPayload(saved.name,root,now,{presentationVersion:"readable-v9"});
 const next=publicationPayload(saved.name,root,now);
 assert.equal(old.presentationVersion,"readable-v9");assert.equal(next.presentationVersion,"readable-v10");
 assert.equal(old.price,0);assert.equal(next.price,0);
 assert.equal(old.paidText,frozenV9.readableArticle(b.article,b).paidText);
 assert.equal(parsePublishedDisplayProof(old).modelSubset.includedInPublishedResult,false);
 assert.throws(()=>verifyPublicationSource(old,root,now),/handoff_mismatch/);
 assert.deepEqual(verifyPublicationSource(old,root,now,{presentationVersion:"readable-v9"}),old);
});
test("independent defaults retain v9 body and source checks without normal-prediction regeneration",t=>{
 const root=rootFor(t);
 for(const kind of ["escape","manshu"]){
  const b=fixture();b.monitor.kind=kind;
  if(kind==="manshu"){b.article.title=b.article.title.replace("イン逃げ","万舟");b.monitor.article=structuredClone(b.article);}
  const saved=store(root,b),now=Date.parse(b.record.deadlineAt)-300000;
  const old=publicationPayload(saved.name,root,now,{presentationVersion:"readable-v9"});
  const next=publicationPayload(saved.name,root,now);
  for(const field of ["title","freeText","paidText","body","price","practicalTicketCount"])assert.equal(next[field],old[field]);
  assert.equal(next.presentationVersion,"readable-v10");
  assert.deepEqual(parsePublishedDisplayProof(next),{...parsePublishedDisplayProof(old),presentationVersion:"readable-v10"});
 }
});
test("default source gate still blocks expired snapshots, altered handoffs, bytes and skipped purchase decisions",t=>{
 const root=rootFor(t),b=normal(),saved=store(root,b),now=Date.parse(b.record.selectedAt);
 const p=publicationPayload(saved.name,root,now);
 assert.throws(()=>publicationPayload(saved.name,root,Date.parse(b.record.deadlineAt)),/content_audit_blocked/);
 assert.throws(()=>verifyPublicationSource({...p,paidText:p.paidText+"\n改変"},root,now),/handoff_mismatch/);
 fs.writeFileSync(path.join(root,saved.name),saved.bytes+" ");
 assert.throws(()=>publicationPayload(saved.name,root,now),/source_hash_mismatch/);
 const skipped=normal();skipped.record.prediction.practicalSelection={tickets:skipped.record.prediction.practicalTickets,purchaseDecision:{status:"skip"}};
 const skipFile=store(root,skipped);
 assert.throws(()=>publicationPayload(skipFile.name,root,now),/reader_purchase_skipped/);
});
