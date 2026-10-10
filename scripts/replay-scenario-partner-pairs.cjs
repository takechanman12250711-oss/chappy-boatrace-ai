'use strict';
// Research-only, offline. Outcome join happens after all ticket generation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {VERSION,selectMainPartners}=require('./scenario-partner-pairs-shadow.cjs');
const root=path.resolve(__dirname,'..'), inputPath=path.resolve(process.argv[2]||''),outDir=path.resolve(process.argv[3]||'');
if(!fs.existsSync(inputPath))throw Error('input-file-required');
fs.mkdirSync(outDir,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const inputBytes=fs.readFileSync(inputPath),inputs=JSON.parse(inputBytes);
const sourceFiles=['js/ai-core.js','js/prediction.js','js/practical-selection.js','js/three-course-escape-rescue-fixed5.js','scripts/scenario-partner-pairs-shadow.cjs'];
const policy={version:VERSION,createdAt:new Date().toISOString(),inputSha256:sha(inputBytes),reference:'6fb160175071b3e354ac45073662362bf5b5e153',
 scope:'Change 2nd/3rd combinations for original main-head slots ONLY; all alternative-head slots retained exactly',
 candidates:'All 20 ordered distinct pairs of the other five boats, no role course whitelist and no modeled-blocked hard exclusion',
 ranking:'Existing mainScenario.outcome.boats secondScore + thirdScore; tie by min of two then numeric boat ids',
 noNewCoefficients:true,rankingIsNewHypothesis:true,scoresAreNotProbabilities:true,
 modeledBlockHandling:'Retain existing scenario score deductions and reason; do not interpret blockedBoats as physical impossibility',
 unchanged:'Upstream scenario choice, main head, per-head count, total count, other-head tickets, production code and saved results',
 fallback:'Keep baseline and record reason on invalid positional inputs; never drop such race from denominator',
 alreadyUsedResearchData:true,mainNeverModified:true,automaticAdoption:false,
 code:Object.fromEntries(sourceFiles.map(p=>[p,sha(fs.readFileSync(path.join(root,p)))]))};
// Written before AI replay and before official results are loaded by a separate process.
fs.writeFileSync(path.join(outDir,'policy.json'),JSON.stringify(policy,null,2));
global.window=global;global.document={addEventListener(){}};global.addEventListener=()=>{};
const originalLog=console.log;console.log=()=>{};
for(const p of ['evaluated-scenario-candidates','ai-core','history-insights','motor-maintenance-insights','local-water-v2-tiebreak','prediction','prediction-simple-evaluation'])require(root+'/js/'+p);
const selector=require(root+'/js/three-course-escape-rescue-fixed5').install(require(root+'/js/practical-selection'));
const rows=[];
for(const r of inputs){
 const data=JSON.parse(JSON.stringify(r.input)),before=JSON.stringify(data),p=global.createPrediction(data),s=selector.select(p);
 const saved=r.savedPractical.map(x=>String(x.ticket||x)),base=s.tickets.map(x=>String(x.ticket||x));
 if(p.finalAi?.summary?.startsWith('AI Core統合エラー'))throw Error(r.raceKey+': core integration failed');
 if(JSON.stringify(data)!==before)throw Error(r.raceKey+': mutated input');
 if(JSON.stringify(base)!==JSON.stringify(saved))throw Error(r.raceKey+': baseline-not-reproduced');
 const main=p.aiCore.raceScenarios.mainScenario,head=Number(main.headBoatNo??main.attackerBoatNo??main.attacker);
 if(head!==Number(r.savedScenario.headBoatNo??r.savedScenario.attackerBoatNo??r.savedScenario.attacker)||main.type!==r.savedScenario.type||s.status!==r.savedSelectionStatus)throw Error(r.raceKey+': scope mismatch');
 // Select only whitelisted pre-result scalar scores and reasons. No odds or results.
 const outcomes=(main.outcome?.boats||[]).map(x=>({boatNo:x.boatNo,secondScore:x.secondScore,thirdScore:x.thirdScore,reasons:x.reasons||[]}));
 let candidate,reason=null;
 try{candidate=selectMainPartners({baseTickets:base,mainHead:head,outcomes});}
 catch(e){candidate={tickets:base,rankedPairs:[],candidateCount:0,removed:[],added:[]};reason=e.message;}
 base.forEach((t,i)=>{if(t[0]!==String(head)&&candidate.tickets[i]!==t)throw Error('alternative-slot-mutated');});
 if(base.length!==candidate.tickets.length)throw Error('budget-mutated');
 rows.push({raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,mainHead:head,scenarioType:main.type,
 baselineExactMatch:true,selectionStatus:s.status,base,candidate:candidate.tickets,
 changed:base.some(t=>!candidate.tickets.includes(t)),unavailableReason:reason,eligiblePairs:candidate.candidateCount,
 removed:candidate.removed,added:candidate.added,rankingInputs:outcomes,pairs:candidate.rankedPairs});
}
const report={policy,productionChanged:false,adoptionStatus:'NOT_APPROVED',rows};
fs.writeFileSync(path.join(outDir,'predictions.json'),JSON.stringify(report,null,2));
originalLog(JSON.stringify({replayed:rows.length,baselineExact:rows.filter(r=>r.baselineExactMatch).length,changed:rows.filter(r=>r.changed).length,unavailable:rows.filter(r=>r.unavailableReason).map(r=>({raceKey:r.raceKey,reason:r.unavailableReason}))},null,2));
