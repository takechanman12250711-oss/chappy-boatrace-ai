'use strict';
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const drop=JSON.parse(fs.readFileSync(path.join(ROOT,'data/stats/outer-attack-gate-dropoff-v1.json'),'utf8'));
const archive=JSON.parse(fs.readFileSync(path.join(ROOT,'data/stats/outer-attack-ticket-central-shadow-archive-v1.json'),'utf8'));
const settlements=JSON.parse(fs.readFileSync(path.join(ROOT,'data/stats/outer-attack-ticket-central-settlements-v1.json'),'utf8'));
const archivedByRace=new Map();
for(const e of Object.values(archive.snapshots||{})){if(!archivedByRace.has(e.sourceRaceKey))archivedByRace.set(e.sourceRaceKey,[]);archivedByRace.get(e.sourceRaceKey).push(e)}
const settled=new Set(Object.keys(settlements.settlements||{})), exclusions=settlements.exclusions||{};
function classifySnapshot(entry){
 const s=entry?.snapshot||{}, vars=s.variants||{}, reasons=[];
 for(const key of ['cover','flow','hole']){const v=vars[key]||{};reasons.push({variant:key,status:v.status||'missing',candidateCount:Number(v.candidateCount||0),sourceTicketPresent:!['no-source-ticket','missing'].includes(v.status),replacement:v.replacement||null})}
 return reasons;
}
function build(){
 const active=(drop.rows||[]).filter(r=>['active','ambiguous'].includes(r.gate));
 const rows=active.map(r=>{const a=archivedByRace.get(r.raceKey)||[],ex=exclusions[r.raceKey]||null;let stage='settled';
   if(!a.length)stage='archive-missed';else if(!settled.has(r.raceKey))stage=ex?.status||'archived-unsettled';
   return{raceKey:r.raceKey,selectedAt:r.selectedAt,signalGate:r.gate,stage,archiveCount:a.length,exclusionStatus:ex?.status||'',variantDiagnostics:a.map(classifySnapshot)};
 });
 const counts=rows.reduce((o,r)=>(o[r.stage]=(o[r.stage]||0)+1,o),{});
 const variantStatus={};for(const r of rows.filter(x=>x.stage==='not-comparable'))for(const snap of r.variantDiagnostics)for(const v of snap){const k=`${v.variant}:${v.status}`;variantStatus[k]=(variantStatus[k]||0)+1}
 return{schemaVersion:1,analysisId:'outer-attack-pipeline-loss-v1',generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,signalRaceCount:rows.length,stageCounts:counts,notComparableVariantStatus:variantStatus,rows};
}
function main(){const r=build(),out=path.join(ROOT,'data/stats/outer-attack-pipeline-loss-v1.json');fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({signalRaceCount:r.signalRaceCount,stageCounts:r.stageCounts,notComparableVariantStatus:r.notComparableVariantStatus}));return r}
if(require.main===module)main();module.exports={build,main,classifySnapshot};
