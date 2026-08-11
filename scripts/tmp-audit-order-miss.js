"use strict";
const fs=require("node:fs"),path=require("node:path");
const dir=path.join(process.cwd(),"data","predictions");
const rows=d=>[...(d.predictions||[]),...(d.verificationPredictions||[])];
const out={settledLatest:0,boatKeyShapes:{},fieldPresence:{},examples:[]};
const wanted=["boatNo","boat","name","playerName","class","grade","nationalWinRate","localWinRate","avgST","avgSt","motorRate","motor2Rate","exhibitionTime","exhibitionST","lapTime","turnTime","straightTime","course","entryCourse","prevCourse","localStarts","localPlaceRate","motorNo","motorNumber","weight"];
for(const f of fs.readdirSync(dir).filter(x=>/^202608(0[7-9]|10)\.json$/.test(x)).sort()){const d=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));for(const r of rows(d)){if(r?.result?.settled!==true)continue;out.settledLatest++;const snap=r?.prediction?.preRaceConditions||r?.preRaceConditions;const boats=Array.isArray(snap?.boats)?snap.boats:[];for(const b of boats){const keys=Object.keys(b||{}).sort();const sig=keys.join(",");out.boatKeyShapes[sig]=(out.boatKeyShapes[sig]||0)+1;for(const k of wanted){if(b?.[k]!==undefined&&b?.[k]!==null&&b?.[k]!=="")out.fieldPresence[k]=(out.fieldPresence[k]||0)+1;}}
if(out.examples.length<8&&boats.length){out.examples.push({raceKey:r?.raceKey||"",file:f,schemaVersion:snap?.schemaVersion||0,boat0:boats[0],weather:snap?.weather||{},dataAvailability:snap?.dataAvailability||{}});}}}
console.log(JSON.stringify(out,null,2));