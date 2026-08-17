"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),cp=require("node:child_process");
const target=path.resolve(__dirname,"collect-predictions.js");
const original=fs.readFileSync(target,"utf8");
try{
  cp.execFileSync(process.execPath,[path.resolve(__dirname,"apply-local-water-evidence-storage.js")],{stdio:"inherit"});
  const patched=fs.readFileSync(target,"utf8");
  assert.match(patched,/localWater: \(\(\) => \{/);
  assert.match(patched,/prediction\?\.venueWaterSupport/);
  assert.match(patched,/providedEvidence\.localWater/);
  cp.execFileSync(process.execPath,["--check",target],{stdio:"inherit"});
  console.log("local water evidence storage test: ok");
}finally{fs.writeFileSync(target,original);}
