'use strict';
// Bounded, read-only reuse of an already verified frozen report and its exact sources.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const source=require('./eight-ticket-promotion-report-source.cjs');
const input=require('./analysis-input-contract');
const stats=require('./build-hit-first-practical-report.cjs');
const {VERSION,select}=require('./escape-partner-incremental.cjs');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const pair=(ts,actual)=>ts.some(t=>t.slice(0,3)===actual.slice(0,3));
function preRace(record,baseline){
  const p=record.prediction||record,c=p.preRaceConditions||{},boats=c.boats||[];
  return {base:[...baseline],baseRows:p.practicalTickets,pool:p.evaluatedScenarioCandidates?.candidatePool,
    targetDecisions:p.practicalSelection?.targetDecisions||[],
    main:Number(p.mainSheet?.honmei?.boatNo),boats,
    formal:boats.length===6 && new Set(boats.map(b=>b.boatNo)).size===6 && new Set(boats.map(b=>b.course)).size===6 &&
      boats.every(b=>b.courseOfficial===true&&Number.isInteger(b.course)&&b.course>=1&&b.course<=6),
    exhibition:boats.length===6&&boats.every(b=>Number.isFinite(b.exhibitionTime)&&Number.isFinite(b.exhibitionST)),
    weather:c.weather||{}};
}
function targetDecisionEvidence(targetDecisions,ticket){
 const roles=[],relations=new Set(),reasonCodes=new Set();
 for(const target of Array.isArray(targetDecisions)?targetDecisions:[]){
  for(const candidate of Array.isArray(target?.candidateDecisions)?target.candidateDecisions:[]){
   if(candidate?.ticket!==ticket)continue;
   if(candidate.relation)relations.add(String(candidate.relation));
   if(candidate.reasonCode)reasonCodes.add(String(candidate.reasonCode));
   for(const role of Array.isArray(candidate.roleLabels)?candidate.roleLabels:[]){
    const value={boatNo:Number(role?.boatNo),position:Number(role?.position),role:String(role?.role||''),structured:role?.structured===true};
    if(!Number.isInteger(value.boatNo)||!Number.isInteger(value.position))continue;
    if(!roles.some(r=>JSON.stringify(r)===JSON.stringify(value)))roles.push(value);
   }
  }
 }
 const boats=String(ticket||'').split('-').map(Number);
 const structuredPositions=[1,2,3].filter(position=>roles.some(role=>role.structured&&role.position===position&&role.boatNo===boats[position-1]));
 return {captured:roles.length>0||relations.size>0||reasonCodes.size>0,relations:[...relations].sort(),
  reasonCodes:[...reasonCodes].sort(),roles:roles.sort((a,b)=>a.position-b.position||a.boatNo-b.boatNo||a.role.localeCompare(b.role)),
  structuredPositions,completePartnerRoles:structuredPositions.includes(2)&&structuredPositions.includes(3)};
}
function strictHigherOnly(base,priorityProtected){
 const change=priorityProtected?.change;
 return priorityProtected?.changed===true&&Number(change?.toPriority)>Number(change?.fromPriority)
  ? priorityProtected:{tickets:[...base],changed:false,reason:'equal-priority-not-promoted'};
}
function metrics(rows,variant){
  const evaluated=rows.map(r=>({...r,candidate:r[variant].tickets}));
  return {...stats.compare(evaluated),secondPair:{
    before:rows.filter(r=>pair(r.base,r.actual)).length,after:rows.filter(r=>pair(r[variant].tickets,r.actual)).length,
    gained:rows.filter(r=>!pair(r.base,r.actual)&&pair(r[variant].tickets,r.actual)).map(r=>r.raceKey),
    lost:rows.filter(r=>pair(r.base,r.actual)&&!pair(r[variant].tickets,r.actual)).map(r=>r.raceKey)},
    hitGains:rows.filter(r=>!r.base.includes(r.actual)&&r[variant].tickets.includes(r.actual)).map(r=>r.raceKey),
    hitLosses:rows.filter(r=>r.base.includes(r.actual)&&!r[variant].tickets.includes(r.actual)).map(r=>r.raceKey)};
}
function groups(rows,key){
 const out={};for(const r of rows){const k=String(key(r));(out[k]||=[]).push(r);}
 return Object.fromEntries(Object.entries(out).sort(([a],[b])=>a.localeCompare(b)).map(([k,rs])=>[k,{races:rs.length,unrestricted:metrics(rs,'unrestricted'),priorityProtected:metrics(rs,'priorityProtected')}]));
}
function build(root,reference){
 assert.equal(reference.version,'hit-first-practical-v1');
 assert.equal(reference.productionChanged,false);assert.equal(reference.automaticApplication,false);
 const details=reference.details,seen=new Set();assert.ok(Array.isArray(details));
 const rows=[];const sources=[];
 for(const date of [...new Set(details.map(r=>r.raceKey.slice(0,8)))].sort()){
  const wanted=details.filter(r=>r.raceKey.startsWith(date)),day=source.readFrozenDay(root,date,wanted);
  assert.deepEqual(day.sources,reference.source.sources.filter(s=>s.date===date),'frozen source mismatch');sources.push(...day.sources);
  for(const r of wanted){
   assert.ok(!seen.has(r.raceKey));seen.add(r.raceKey);
   const capture=day.captures.get(r.raceKey);assert.ok(capture&&!capture.conflict,'conflicting/missing capture');
   assert.deepEqual(capture.evidence,reference.source.captureEvidence.find(x=>x.raceKey===r.raceKey)?.matches);
   assert.ok(!input.preDeadlineReason(capture.record),'invalid pre-deadline evidence');
   const p=capture.record.prediction||capture.record;
   assert.deepEqual(stats.tickets(p.practicalTickets||p.practicalSelection?.tickets),r.base);
   const evidence=preRace(capture.record,r.base);
   // Construct both candidates before attaching outcome data to the evaluation row.
   const unrestricted=select(evidence),priorityProtected=select(evidence,{preservePriority:true});
   const strictHigherPriority=strictHigherOnly(r.base,priorityProtected);
   const actualSecond=Number(r.actual[2]),secondBoat=evidence.boats.find(b=>b.boatNo===actualSecond);
   rows.push({...r,main:evidence.main,formal:evidence.formal,exhibition:evidence.exhibition,
    weather:evidence.weather,actualSecondRegisterNo:secondBoat?.registerNo||null,
    actualSecondPreRaceCourse:evidence.formal?secondBoat?.course:null,
    actualCandidate:(evidence.pool||[]).find(t=>t.ticket===r.actual)||null,
    actualTargetDecisionEvidence:targetDecisionEvidence(evidence.targetDecisions,r.actual),
    unrestricted,priorityProtected,strictHigherPriority,
    priorityProtectedAddedTargetDecisionEvidence:priorityProtected.changed
      ?targetDecisionEvidence(evidence.targetDecisions,priorityProtected.change.added):null});
  }
 }
 assert.deepEqual(stats.summary(rows),reference.baseline.verified,'saved accounting mismatch');
 const formal=rows.filter(r=>r.formal&&r.exhibition);
 const missing=rows.filter(r=>r.actual[0]==='1'&&r.missType==='pairMissing');
 const pairGainRows=formal.filter(r=>!pair(r.base,r.actual)&&pair(r.priorityProtected.tickets,r.actual));
 const priorityChanges=formal.filter(r=>r.priorityProtected.changed);
 return {version:VERSION,reportExtensionVersion:'escape-partner-third-evidence-diagnostic-v1',
  generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,
  adoptionStatus:'NOT_APPROVED',evaluationType:'KNOWN_PERIOD_COMPONENT_DIAGNOSIS',
  source:{referenceHash:hash(JSON.stringify(reference)),referenceGeneratedAt:reference.generatedAt,sources,
   originalExpectedRaces:reference.source.expectedRaces,verifiedRaces:rows.length,excluded:reference.source.failures,
   originalSourceComplete:reference.source.complete,verifiedSubsetOnly:true},
  finding:{oneWinPairMissing:missing.length,officialExhibitionPairMissing:missing.filter(r=>r.formal&&r.exhibition).length,
   officialPairMissingMainHeads:missing.filter(r=>r.formal&&r.exhibition).map(r=>({raceKey:r.raceKey,main:r.main})),
   officialExhibitionRaces:formal.length,provisionalRaces:rows.length-formal.length},
  all:{unrestricted:metrics(rows,'unrestricted'),priorityProtected:metrics(rows,'priorityProtected'),
   strictHigherPriority:metrics(rows,'strictHigherPriority')},
  officialExhibition:{unrestricted:metrics(formal,'unrestricted'),priorityProtected:metrics(formal,'priorityProtected'),
   strictHigherPriority:metrics(formal,'strictHigherPriority')},
  thirdEvidenceDiagnosis:{diagnosticOnly:true,knownPeriodPosthoc:true,usableForPrediction:false,
   priorityProtectedChanges:priorityChanges.length,
   scoreRelation:{higher:priorityChanges.filter(r=>r.priorityProtected.change.toPriority>r.priorityProtected.change.fromPriority).length,
    equal:priorityChanges.filter(r=>r.priorityProtected.change.toPriority===r.priorityProtected.change.fromPriority).length,
    lower:priorityChanges.filter(r=>r.priorityProtected.change.toPriority<r.priorityProtected.change.fromPriority).length},
   pairGainRaces:pairGainRows.length,
   pairGainsAllEqualPriority:pairGainRows.every(r=>r.priorityProtected.change.toPriority===r.priorityProtected.change.fromPriority),
   chosenThirdMismatch:pairGainRows.filter(r=>r.priorityProtected.change.added[4]!==r.actual[4]).length,
   actualPoolEvidenceQualified:pairGainRows.filter(r=>r.actualCandidate?.evidenceQualified===true).length,
   actualTargetDecisionCaptured:pairGainRows.filter(r=>r.actualTargetDecisionEvidence.captured).length,
   actualCompletePartnerRoles:pairGainRows.filter(r=>r.actualTargetDecisionEvidence.completePartnerRoles).length,
   rows:pairGainRows.map(r=>({raceKey:r.raceKey,actual:r.actual,removed:r.priorityProtected.change.removed,
    added:r.priorityProtected.change.added,fromPriority:r.priorityProtected.change.fromPriority,
    toPriority:r.priorityProtected.change.toPriority,actualCandidateKind:r.actualCandidate?.candidateKind||null,
    actualPoolEvidenceQualified:r.actualCandidate?.evidenceQualified===true,
    actualPoolBranchIds:Array.isArray(r.actualCandidate?.branchIds)?r.actualCandidate.branchIds:[],
    actualTargetDecisionEvidence:r.actualTargetDecisionEvidence,
    addedTargetDecisionEvidence:r.priorityProtectedAddedTargetDecisionEvidence}))},
  // Diagnostic groups, not selection rules. Missing conditions remain explicit.
  byDate:groups(formal,r=>r.raceKey.slice(0,8)),byVenue:groups(formal,r=>r.raceKey.slice(9,11)),
  byWeather:groups(formal,r=>JSON.stringify([r.weather.windDirection||null,r.weather.windSpeed??null,r.weather.waveHeight??null])),
  bySecondPreRaceCourse:groups(formal,r=>r.actualSecondPreRaceCourse??'unknown'),
  bySecondRacer:groups(formal,r=>r.actualSecondRegisterNo??'unknown'),
  rows};
}
if(require.main===module){
 const [root,referencePath,destination]=process.argv.slice(2);if(!root||!referencePath||!destination)throw Error('usage: node report root frozen-report output');
 const reference=JSON.parse(fs.readFileSync(referencePath,'utf8')),report=build(root,reference);
 report.selectorSha256=hash(fs.readFileSync(path.join(__dirname,'escape-partner-incremental.cjs')));
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({finding:report.finding,official:report.officialExhibition}));
}
module.exports={preRace,targetDecisionEvidence,strictHigherOnly,metrics,groups,build};
