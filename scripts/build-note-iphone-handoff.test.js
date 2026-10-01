"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {buildIphoneHandoff}=require("./build-note-iphone-handoff");
const input=path.join(process.cwd(),"data","note-publish","latest.json");
const output=path.join(process.cwd(),"data","note-publish","iphone.json");
test("iphone handoff skips expired first candidate and selects future current-day candidate",()=>{
 const oldIn=fs.existsSync(input)?fs.readFileSync(input):null, oldOut=fs.existsSync(output)?fs.readFileSync(output):null;
 try{
  fs.mkdirSync(path.dirname(input),{recursive:true});
  fs.writeFileSync(input,JSON.stringify({candidates:[
   {raceKey:"20301002-23-1",articleSeries:"normal",deadlineAt:"2030-10-02T10:00:00+09:00",title:"expired",fullText:"body",freeText:"free",paidText:"paid"},
   {raceKey:"20301002-23-2",articleSeries:"normal",deadlineAt:"2030-10-02T12:00:00+09:00",title:"future",fullText:"body",freeText:"free",paidText:"paid"}
  ]}));
  const r=buildIphoneHandoff({now:Date.parse("2030-10-02T11:00:00+09:00"),today:"2030-10-02"});
  assert.equal(r.raceKey,"20301002-23-2"); assert.equal(r.canPublish,true);
 }finally{
  if(oldIn)fs.writeFileSync(input,oldIn);else fs.rmSync(input,{force:true});
  if(oldOut)fs.writeFileSync(output,oldOut);else fs.rmSync(output,{force:true});
 }
});
