'use strict';
// Offline production-path replay. Outcome data is not in the worker input.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),crypto=require('node:crypto');
const here=path.resolve(process.env.OPEN_PARTNER_WORKDIR||'.'),root=path.resolve(__dirname,'..'),mode=process.argv[2]||'baseline';
if(!['baseline','gate-only','prototype'].includes(mode))throw Error('Invalid replay mode');
const clone=x=>JSON.parse(JSON.stringify(x)),digest=x=>crypto.createHash('sha256').update(x).digest('hex');
global.window=global;global.document={addEventListener(){}};global.addEventListener=()=>{};
const originalLog=console.log;console.log=()=>{};
require(root+'/js/evaluated-scenario-candidates');
const coreFile=root+'/js/ai-core.js',original=fs.readFileSync(coreFile,'utf8');
let source=original;
const start=source.indexOf('function buildHoldPickupTheory('),end=source.indexOf('function buildRaceScenarios(',start);
if(start<0||end<start)throw Error('Cannot isolate role function');
const block=source.slice(start,end);
if(mode==='gate-only'){
 const pattern='if (isAttackSource || isBlocked || !isScenarioMatch)';
 if(block.split(pattern).length!==2)throw Error('Gate patch not unique');
 source=source.slice(0,start)+block.replace(pattern,'if (isAttackSource || isBlocked)')+source.slice(end);
}
if(mode==='prototype'){
 global.__openPartner=require(root+'/scripts/open-partner-candidates-shadow.cjs');
 const wrapper=`
 function buildHoldPickupTheory(entries,analyses,scenario,wallTheory,options={}) {
   const old=originalBuildHoldPickupTheory(entries,analyses,scenario,wallTheory,options);
   if(!old.isFormal)return old;
   const proposed=global.__openPartner.buildOpenPartnerCandidates({analyses,attackerBoatNo:old.attackerBoatNo,
     blockedBoats:old.roles.filter(r=>r.isBlocked).map(r=>r.boatNo),secondLimit:3,thirdLimit:4});
   if(!proposed.ready)return {...old,openPartnerUnavailable:proposed.reasonCodes};
   const makeRole=(candidate,role)=>candidate?{score:candidate.score,grade:holdPickupGrade(candidate.score),status:'検証候補',
     isFormal:true,isAdopted:true,isReference:false,components:{experimentalRoleScore:candidate.score},
     reason:'PR1087検証：保存済み個別評価の'+role+'順位（未採用）'}:null;
   const second=new Map(proposed.secondCandidates.map(r=>[r.boatNo,r])),third=new Map(proposed.thirdCandidates.map(r=>[r.boatNo,r]));
   const roles=old.roles.map(r=>({...r,hold:makeRole(second.get(r.boatNo),'2着')||{...r.hold,isAdopted:false,isReference:false},
     pickup:makeRole(third.get(r.boatNo),'3着')||{...r.pickup,isAdopted:false,isReference:false},
     hasIndependentDualEvidence:false}));
   const byNo=new Map(roles.map(r=>[r.boatNo,r]));
   const candidates=(rows,role)=>rows.map((r,i)=>({...r,course:byNo.get(r.boatNo).course,playerName:byNo.get(r.boatNo).playerName,
     ...byNo.get(r.boatNo)[role],rank:i+1,isEquivalentToPrevious:i>0&&Math.abs(r.score-rows[i-1].score)<=2}));
   return {...old,roles,secondCandidates:candidates(proposed.secondCandidates,'hold'),thirdCandidates:candidates(proposed.thirdCandidates,'pickup'),
     source:proposed.policy,referenceHold:[],referencePickup:[],thresholds:{...old.thresholds,adopted:null,qualification:'top-k-experimental'},openPartnerExperiment:true};
 }
`;
 source=source.slice(0,start)+block.replace('function buildHoldPickupTheory(','function originalBuildHoldPickupTheory(')+wrapper+source.slice(end);
}
const m=new Module(coreFile,module);m.filename=coreFile;m.paths=Module._nodeModulePaths(path.dirname(coreFile));require.cache[coreFile]=m;m._compile(source,coreFile);
require(root+'/js/history-insights');require(root+'/js/motor-maintenance-insights');require(root+'/js/local-water-v2-tiebreak');require(root+'/js/prediction');require(root+'/js/prediction-simple-evaluation');
const selector=require(root+'/js/three-course-escape-rescue-fixed5').install(require(root+'/js/practical-selection'));
const rows=JSON.parse(fs.readFileSync(here+'/pre-race-inputs.json')),out=[];
const exact=t=>/^[1-6]-[1-6]-[1-6]$/.test(t)&&new Set(t.split('-')).size===3;
for(const r of rows){
 try{
  const data=clone(r.input),before=JSON.stringify(data),p=global.createPrediction(data),s=selector.select(p);
  const saved=r.savedPractical.map(x=>String(x.ticket||x)),proposed=(s.tickets||[]).map(x=>String(x.ticket||x));
  const sc=p.aiCore?.raceScenarios?.mainScenario,head=Number(sc?.headBoatNo??sc?.attackerBoatNo??sc?.attacker);
  if(p.finalAi?.summary?.startsWith('AI Core統合エラー'))throw Error(p.finalAi.summary);
  const reasons=[];
  if(JSON.stringify(data)!==before)reasons.push('input-mutated');
  if(head!==Number(r.savedScenario.headBoatNo??r.savedScenario.attackerBoatNo??r.savedScenario.attacker)||sc?.type!==r.savedScenario.type)reasons.push('main-scenario-changed');
  if(!proposed.every(exact)||new Set(proposed).size!==proposed.length)reasons.push('invalid-tickets');
  if(proposed.length!==saved.length)reasons.push('ticket-count-changed');
  if(s.status!==r.savedSelectionStatus)reasons.push('purchase-status-changed');
  // Fixed before outcome join: do not discard races with budget violations.
  const effective=reasons.length?saved:proposed;
  out.push({raceKey:r.raceKey,date:r.date,selectedAt:r.selectedAt,deadlineAt:r.deadlineAt,saved,proposed,effective,
    baselineExactMatch:JSON.stringify(proposed)===JSON.stringify(saved),scopeGuardReasons:reasons,
    applied:JSON.stringify(effective)!==JSON.stringify(saved),mainScenario:sc?.type,head,selectionStatus:s.status,
    second:p.aiCore?.holdPickupTheory?.secondCandidates.map(x=>({boatNo:x.boatNo,score:x.score})),
    third:p.aiCore?.holdPickupTheory?.thirdCandidates.map(x=>({boatNo:x.boatNo,score:x.score}))});
 }catch(e){out.push({raceKey:r.raceKey,saved:r.savedPractical.map(x=>String(x.ticket||x)),effective:r.savedPractical.map(x=>String(x.ticket||x)),applied:false,error:e.stack});}
}
const report={mode,codeSha256:digest(source),originalCoreSha256:digest(original),selectionInputSha256:digest(fs.readFileSync(here+'/pre-race-inputs.json')),
 guard:'Retain baseline on count/scope/invalid-input failures; retain every race in denominator',productionChanged:false,rows:out};
fs.writeFileSync(here+'/replay-'+mode+'.json',JSON.stringify(report,null,2));
originalLog(JSON.stringify({mode,n:out.length,baselineMatches:out.filter(r=>r.baselineExactMatch).length,changed:out.filter(r=>r.applied).length,
 guards:out.filter(r=>r.scopeGuardReasons?.length).map(r=>({key:r.raceKey,reasons:r.scopeGuardReasons})),errors:out.filter(r=>r.error).map(r=>({key:r.raceKey,error:r.error})).slice(0,3)},null,2));
