'use strict';
// Offline comparisons only: never imported by the browser or prediction collector.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const input = require('./analysis-input-contract');
const archive = require('./daily-prediction-source-archive');
const audit = require('./audit-escape-main.cjs');
const { decide } = require('./phase11-improvement-decision-gate.cjs');
const DEFINED_AT = '2026-09-22T10:32:00.000Z';
const MODULES = ['boat-identity','history-insights-base','motor-maintenance-insights','theory-input','evaluated-scenario-candidates','ai-core','ai-core-assignment-compat','local-water-v2-tiebreak','third-six-rescue-fixed5','escape-outer-second-rescue-fixed5','third-place-rescue-14-fixed5','third-place-rescue-12-4-fixed5','pair-31-rescue-fixed5','pair-32-rescue-fixed5','prediction','racer-skill-core-integration','main-cover-classification-fix','practical-selection','three-course-escape-rescue-fixed5','four-kado-escape-rescue-fixed5','prediction-flow-priority','prediction-st-exhibition-support','prediction-venue-water-support','prediction-skill-local-support','prediction-motor-engine-support','prediction-engine-integration','prediction-simple-evaluation'];
const GUARD_MARKER = '  fourAttackScore += frameMovementAdjustment(fourNo);';
const GUARD = `  // Diagnostic candidate: reuse only the existing three-attack inner-start penalties.
  if (hasComparison(fourNo, oneNo)) {
    const fourVsOne = relationEdge(fourNo, oneNo);
    if (fourVsOne <= -10) fourAttackScore -= 14;
    else if (fourVsOne <= -6) fourAttackScore -= 9;
  }
`;
const clone = x => JSON.parse(JSON.stringify(x));
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const count = (o,k) => { o[k] = (o[k] || 0) + 1; };
const tickets = rows => Array.isArray(rows) ? [...new Set(rows.map(input.normalizeTicket).filter(Boolean))] : [];
function transformCore(source, mode) {
  if (mode === 'current') return source;
  const marker = 'Number(actualCourse) === 1 || type === "escape"';
  if (mode === 'previous-role') {
    if (source.split(marker).length !== 2) throw Error('Escape role source contract changed');
    return source.replace(marker, 'type === "escape"');
  }
  if (mode !== 'four-inner-guard' || source.split(GUARD_MARKER).length !== 2) throw Error('Candidate source contract changed');
  return source.replace(GUARD_MARKER, GUARD + GUARD_MARKER);
}
function runner(root, mode) {
  const context = { console: { log(){}, warn(){}, error(){} }, document: { addEventListener(){} }, addEventListener(){} };
  context.window = context; context.global = context;
  vm.createContext(context);
  for (const name of MODULES) {
    const file = path.join(root,'js',name+'.js');
    let source = fs.readFileSync(file,'utf8');
    if (name === 'ai-core') source = transformCore(source,mode);
    vm.runInContext(source,context,{filename:file,timeout:10000});
  }
  return row => {
    const e = row.conditions.escapeEvaluationEvidence, [date,jcd,rno] = row.key.split('-');
    const data = {ok:true,source:row.conditions.source,stadiumCode:jcd,raceNo:Number(rno),date,
      fetchedAt:e.sourceFetchedAt,datasetVersion:e.datasetVersion,entries:clone(e.entries),
      beforeInfo:clone(e.beforeInfo),startExhibition:clone(e.startExhibition),historyContext:clone(e.historyContext),
      raceInfo:clone(e.raceInfo),weather:clone(row.conditions.weather),beforeInfoAvailable:e.beforeInfo.length===6,
      newEngineMode:row.conditions.newEngineMode === true};
    data.theoryInput = {version:context.ChappyTheoryInput.VERSION,normalized:true,prepared:true,
      boatIdentity:context.ChappyBoatIdentity.inspectEntries(data.entries,{allowBoatNoFallback:false})};
    context.replayData = data;
    const result = vm.runInContext(`(() => {
      const p = createPrediction(replayData), selection = ChappyPracticalSelection.select(p);
      return {head:p.mainSheet.honmei?.boatNo,tickets:selection.tickets.map(t=>t.ticket),
        mainTickets:selection.tickets.filter(t=>t.category==='本線'||t.displayCategory==='本命').map(t=>t.ticket),
        scenarios:p.aiCore.raceScenarios.scenarios.map(s=>({type:s.type,score:s.score})),
        insideSkill:p.aiCore.racerSkillTheory.ranking.filter(s=>s.course===1).map(s=>({boatNo:s.boatNo,score:s.score,methodFit:s.components?.methodFit,role:s.role}))[0]||null};
    })()`,context,{timeout:10000});
    delete context.replayData;
    return clone(result);
  };
}
function snapshot(record, source) {
  const p = record.prediction || {}, c = p.preRaceConditions, e = c?.escapeEvaluationEvidence;
  if (!e || e.version !== 'escape-evaluation-evidence-v1' || e.historyStatus !== 'captured') return {reason:'frozen-history-unavailable'};
  if (input.preDeadlineReason(record)) return {reason:input.preDeadlineReason(record)};
  if (e.resultUsedForGeneration !== false || e.sourceFetchedAt !== c.sourceFetchedAt) return {reason:'invalid-frozen-timing'};
  if (![e.entries,e.beforeInfo,e.startExhibition].every(a=>Array.isArray(a)&&a.length===6)) return {reason:'incomplete-frozen-input'};
  if (!['officialCourses','exhibitionST','exhibitionTime'].every(k=>c.dataAvailability?.[k]===6)) return {reason:'official-exhibition-incomplete'};
  if (e.aiCoreVersion !== 'ai-core-v4.8.6-escape-skill-role') return {reason:'different-core-generation'};
  const selected = tickets(p.practicalTickets || p.practicalSelection?.tickets);
  if (!selected.length || selected.length > 10) return {reason:'invalid-practical-tickets'};
  const key = input.raceKey(record); if (!key) return {reason:'invalid-race-identity'};
  return {row:{key,source,selectedAt:record.selectedAt||record.capturedAt||record.createdAt,deadlineAt:record.deadlineAt||record.deadline,conditions:clone(c),
    savedHead:p.verificationEvidence?.marks?.honmei?.boatNo ?? p.mainSheet?.honmei?.boatNo,
    savedTickets:selected,savedScenarios:e.raceScenarios?.scenarios?.map(s=>({type:s.type,score:s.score}))||[],
    sourceCommit:p.verificationEvidence?.sourceCommit||''}};
}
function chooseResult(existing, incoming) {
  return audit.chooseOfficialResult(existing, incoming);
}
function checkReplay(row, current) {
  if (Number(row.savedHead) !== Number(current.head)) return 'baseline-head-mismatch';
  if (!same(row.savedTickets,current.tickets)) return 'baseline-tickets-mismatch';
  const scores = a => JSON.stringify([...a].sort((x,y)=>x.type.localeCompare(y.type)));
  if (scores(row.savedScenarios)!==scores(current.scenarios)) return 'baseline-scenarios-mismatch';
  return '';
}
function totals(rows, mode) {
  const evaluated = rows.filter(r=>r.result && !r.result.excluded);
  const stake = evaluated.reduce((n,r)=>n+r[mode].tickets.length*100,0);
  const hits = evaluated.filter(r=>r[mode].tickets.includes(r.result.actual));
  const returned = hits.reduce((n,r)=>n+r.result.payout,0);
  return {races:evaluated.length,hits:hits.length,stake,returned,hitRate:evaluated.length?100*hits.length/evaluated.length:null,recoveryRate:stake?100*returned/stake:null};
}
async function build(root, since='20260922', {refreshResults=false, fetchResult, maxRequests=24, now=Date.now()}={}) {
  if (!/^\d{8}$/.test(since)) throw Error('Invalid since date');
  const chosen = new Map(), exclusions = {}, files = [];
  function add(record, source) {
    const s=snapshot(record,source); if(s.reason){count(exclusions,s.reason);return;}
    const old=chosen.get(s.row.key);
    if(!old||Date.parse(s.row.selectedAt)>Date.parse(old.selectedAt))chosen.set(s.row.key,s.row);
  }
  function read(file) {const raw=fs.readFileSync(file);files.push({path:path.relative(root,file),sha256:crypto.createHash('sha256').update(raw).digest('hex')});return JSON.parse(raw);}
  const dates=[...new Set([...archive.predictionSourceDates(root),...archive.archivedSourceDates(root)])].filter(d=>d>=since).sort();
  for(const date of dates){
    archive.restorePredictionSource({rootDirectory:root,date});
    const d=read(path.join(root,'data/predictions',date+'.json'));
    const primary=new Set((d.predictions||[]).map(input.raceKey));
    for(const r of input.mergePredictionSources(d.predictions||[],d.verificationPredictions||[]))add(r,primary.has(input.raceKey(r))?'daily-primary':'daily-verification');
  }
  const notes=path.join(root,'data/note-drafts');
  if(fs.existsSync(notes)){
    const {assess}=require('./build-race-review-progress');
    for(const date of fs.readdirSync(notes).filter(d=>/^\d{8}$/.test(d)&&d>=since).sort())for(const file of fs.readdirSync(path.join(notes,date)).filter(f=>f.endsWith('.json')).sort()){
      const b=read(path.join(notes,date,file)),a=assess(b);if(a.reason){count(exclusions,'note:'+a.reason);continue;}add(b.record,'all-race-note');
    }
  }
  const results=new Map();
  for(const date of new Set([...chosen.keys()].map(k=>k.slice(0,8)))){
    const file=path.join(root,'data/results',date+'.json');if(!fs.existsSync(file))continue;
    for(const r of read(file).races||[]){const key=input.raceKey(r,date);if(chosen.has(key))results.set(key,chooseResult(results.get(key),r));}
  }
  const ledger=path.join(root,'data/stats/race-review-results.json');
  if(fs.existsSync(ledger))for(const r of Object.values(read(ledger).races||{})){const key=input.raceKey(r);if(chosen.has(key))results.set(key,chooseResult(results.get(key),r));}
  const previousReport=path.join(root,'data/stats/escape-frozen-comparison.json');
  if(fs.existsSync(previousReport))for(const r of JSON.parse(fs.readFileSync(previousReport,'utf8')).officialResultEvidence||[]){const key=input.raceKey(r);if(chosen.has(key))results.set(key,chooseResult(results.get(key),r));}
  const resultAttempts=[];
  if(refreshResults){
    fetchResult ||= ({date,jcd,rno}) => require('./collect-results').callApi(require('../api/result'),{date,jcd,rno:String(rno)});
    const pending=[...chosen.values()].filter(r=>!audit.resultOf(results.get(r.key))&&Date.parse(r.deadlineAt)+15*60000<=now).sort((a,b)=>a.key.localeCompare(b.key)).slice(0,Math.min(24,Math.max(0,maxRequests)));
    let cursor=0;
    await Promise.all(Array.from({length:Math.min(3,pending.length)},async()=>{while(cursor<pending.length){
      const row=pending[cursor++],[date,jcd,rno]=row.key.split('-');
      try{const r=await fetchResult({date,jcd,rno:Number(rno)});
        if(r?.ok!==true||input.raceKey(r)!==row.key||!input.isOfficialResultSource(r))throw Error('official-result-identity-mismatch');
        results.set(row.key,chooseResult(results.get(row.key),r));resultAttempts.push({key:row.key,status:audit.resultOf(r)?'resolved':'pending',checkedAt:new Date(now).toISOString()});
      }catch(error){resultAttempts.push({key:row.key,status:'retry',error:String(error.message).slice(0,160)});}
    }}));
  }
  const run={current:runner(root,'current'),previous:runner(root,'previous-role'),candidate:runner(root,'four-inner-guard')},rows=[];
  for(const row of [...chosen.values()].sort((a,b)=>a.key.localeCompare(b.key))){
    try{
      const current=run.current(row),reason=checkReplay(row,current);
      if(reason){count(exclusions,reason);continue;}
      const previous=run.previous(row),candidate=run.candidate(row);
      if(![current,previous,candidate].every(p=>p.tickets.length>0&&p.tickets.length<=10))throw Error('Invalid compared tickets');
      rows.push({key:row.key,source:row.source,sourceCommit:row.sourceCommit,selectedAt:row.selectedAt,
        period:Date.parse(row.selectedAt)>Date.parse(DEFINED_AT)?'post-definition':'discovery',
        current,previous,candidate,result:audit.resultOf(results.get(row.key)),
        roleFixChangedTickets:!same(current.tickets,previous.tickets),candidateChangedTickets:!same(current.tickets,candidate.tickets),candidateChangedHead:current.head!==candidate.head});
    }catch(error){count(exclusions,'replay-error:'+error.message);}
  }
  const summarize=rs=>({current:totals(rs,'current'),previous:totals(rs,'previous'),candidate:totals(rs,'candidate'),
    replayed:rs.length,pending:rs.filter(r=>!r.result).length,excludedResults:rs.filter(r=>r.result?.excluded).length,
    candidateChangedHead:rs.filter(r=>r.candidateChangedHead).length,candidateChangedTickets:rs.filter(r=>r.candidateChangedTickets).length,
    roleFixChangedTickets:rs.filter(r=>r.roleFixChangedTickets).length});
  return {version:'escape-frozen-comparison-v1',generatedAt:new Date().toISOString(),sourceCommit:process.env.GITHUB_SHA||'',since,
    productionChanged:false,automaticProductionChange:false,usableForPrediction:false,
    candidate:{id:'four-inner-start-guard-v1',definedAt:DEFINED_AT,fingerprint:crypto.createHash('sha256').update(GUARD).digest('hex'),
      definition:'Existing three-attack penalties (-14 at <=-10, -9 at <=-6) applied to four versus actual inside course ST index; no new threshold search.',
      adoptionGate:decide({}),note:'Not PR-690: no ranking weight change or boat1 score suppression. Diagnostic only; no formal gate registered.'},
    inputFiles:files,predictionSources:MODULES.map(n=>({path:'js/'+n+'.js',sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'js',n+'.js'))).digest('hex')})),
    officialResultEvidence:[...results.values()].filter(r=>audit.resultOf(r)),resultAttempts,
    eligibleFrozen:chosen.size,exclusions,summary:summarize(rows),
    byPeriod:Object.fromEntries(['discovery','post-definition'].map(p=>[p,summarize(rows.filter(r=>r.period===p))])),
    byVenue:Array.from({length:24},(_,i)=>({jcd:String(i+1).padStart(2,'0'),...summarize(rows.filter(r=>r.key.split('-')[1]===String(i+1).padStart(2,'0')))})),rows,
    limitation:'Only exact baseline head/ticket/scenario reproductions. Official settled, positive payouts; refund/void excluded. Equal 100 yen per ticket, not user purchases. Post-definition replay is not a saved live candidate or approved holdout. No performance or adoption claim from discovery data.'};
}
function meaningful(report){const {generatedAt,sourceCommit,resultAttempts,...rest}=report;return JSON.stringify(rest);}
function saveReport(file,report){
  if(fs.existsSync(file)&&meaningful(JSON.parse(fs.readFileSync(file,'utf8')))===meaningful(report))return false;
  archive.atomicWrite(file,JSON.stringify(report)+'\n');return true;
}
if(require.main===module)build(process.cwd(),process.argv[2]||'20260922',{refreshResults:true}).then(report=>{const changed=saveReport(path.join(process.cwd(),'data/stats/escape-frozen-comparison.json'),report);console.log(JSON.stringify({summary:report.summary,eligibleFrozen:report.eligibleFrozen,exclusions:report.exclusions,gate:report.candidate.adoptionGate,changed}));if(report.eligibleFrozen>0&&report.summary.replayed===0)throw Error('All eligible frozen baselines failed reproduction');}).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={DEFINED_AT,MODULES,GUARD,transformCore,runner,snapshot,chooseResult,checkReplay,totals,build,meaningful,saveReport};
