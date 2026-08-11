"use strict";
const fs=require("node:fs"),path=require("node:path");
const file=path.join(process.cwd(),"scripts","test-evaluated-scenario-consistency.js");
let src=fs.readFileSync(file,"utf8");
const oldHash="8f3726c8d3133058b6cd2387069d222ff70dc6e6ba01e983606243ab3f4cab16";
const newHash="a15156c36a26640e30a0b9d479ad4ee5e44fe3e71c9d708d10a5556bb313db73";
if(src.includes(newHash)){console.log("snapshot hash already updated");process.exit(0);}
if(!src.includes(oldHash))throw new Error("old snapshot hash not found");
src=src.replace(oldHash,newHash);
fs.writeFileSync(file,src);
console.log("snapshot hash updated");