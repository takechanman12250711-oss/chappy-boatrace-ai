'use strict';
// Research only. No browser/collector imports, input writes, result fetching, or adoption.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const audit = require('./audit-escape-main.cjs');
const input = require('./analysis-input-contract');

const CANDIDATE_ID = 'alternate-escape-partner-roles-v1';
const DEFINED_AT = '2026-10-19T01:55:00.000Z';
const DEFAULT_SINCE = '20261015';
const ACCEPTED_CORE_VERSIONS = ['ai-core-v4.8.6-escape-skill-role', 'ai-core-v4.8.8-adjacent-start-rank'];
const MERGE_OPTIONS = Object.freeze({researchAlternateEscapePartnerRoles:true});
const SELECTION_OPTIONS = Object.freeze({researchAlternateEscapePartnerRoles:true});
const SOURCES = ['daily-primary', 'daily-verification', 'all-race-note'];
const PERIODS = ['discovery', 'post-definition-replay'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const count = (object,key) => { object[key]=(object[key]||0)+1; };
const periodOf = row => Date.parse(row.selectedAt)<Date.parse(DEFINED_AT)?PERIODS[0]:PERIODS[1];

function validTickets(value) {
  return Array.isArray(value) && value.length>0 && value.length<=10
    && new Set(value).size===value.length
    && value.every(ticket=>typeof ticket==='string'&&input.normalizeTicket(ticket)===ticket);
}

function compareRow(row, current, candidate, result) {
  const baselineReason=frozen.checkReplay(row,current);
  if(baselineReason)return {reason:baselineReason,baselineReproduced:false};
  if(!validTickets(current.tickets)||!validTickets(candidate.tickets))return {reason:'invalid-compared-tickets',baselineReproduced:true};
  if(current.tickets.length!==candidate.tickets.length)return {reason:'candidate-ticket-count-mismatch',baselineReproduced:true};
  if(Number(current.head)!==Number(candidate.head))return {reason:'candidate-head-changed',baselineReproduced:true};
  if(!Array.isArray(current.mainTickets)||!Array.isArray(candidate.mainTickets)||!same(current.mainTickets,candidate.mainTickets))return {reason:'candidate-main-tickets-changed',baselineReproduced:true};
  const scenarios=values=>JSON.stringify([...values].sort((a,b)=>a.type.localeCompare(b.type)));
  if(scenarios(current.scenarios)!==scenarios(candidate.scenarios))return {reason:'candidate-scenarios-changed',baselineReproduced:true};
  return {baselineReproduced:true,row:{key:row.key,source:row.source,sourceCommit:row.sourceCommit,
    selectedAt:row.selectedAt,deadlineAt:row.deadlineAt,period:periodOf(row),
    current,candidate,result,changed:!same(current.tickets,candidate.tickets),
    addedTickets:candidate.tickets.filter(ticket=>!current.tickets.includes(ticket)),
    removedTickets:current.tickets.filter(ticket=>!candidate.tickets.includes(ticket))}};
}

function summarize(rows) {
  const settled=rows.filter(row=>row.result&&!row.result.excluded);
  const gained=settled.filter(row=>!row.current.tickets.includes(row.result.actual)&&row.candidate.tickets.includes(row.result.actual));
  const lost=settled.filter(row=>row.current.tickets.includes(row.result.actual)&&!row.candidate.tickets.includes(row.result.actual));
  const current=frozen.totals(rows,'current'),candidate=frozen.totals(rows,'candidate');
  return {replayed:rows.length,settled:settled.length,pending:rows.filter(row=>!row.result).length,
    excludedResults:rows.filter(row=>row.result?.excluded).length,
    changed:rows.filter(row=>row.changed).length,current,candidate,
    gainedHits:gained.length,lostHits:lost.length,netHitChange:gained.length-lost.length,
    gainedRaceKeys:gained.map(row=>row.key),lostRaceKeys:lost.map(row=>row.key),
    recoveryRateDelta:current.recoveryRate===null||candidate.recoveryRate===null?null:candidate.recoveryRate-current.recoveryRate};
}

async function build(root, {since=DEFAULT_SINCE,loaded,run,sourceCommit=process.env.COMPARISON_SOURCE_SHA||process.env.GITHUB_SHA||''}={}) {
  loaded ||= await frozen.loadFrozenInputs(root,since,{readOnlySources:true,refreshResults:false,acceptedCoreVersions:ACCEPTED_CORE_VERSIONS});
  run ||= {current:frozen.runner(root,'current'),candidate:frozen.runner(root,'current',{mergeOptions:MERGE_OPTIONS,selectionOptions:SELECTION_OPTIONS})};
  const exclusions={...loaded.exclusions},excludedRows=[],rows=[];
  let baselineReproduced=0,baselineAttempted=0;
  for(const row of [...loaded.chosen.values()].sort((a,b)=>a.key.localeCompare(b.key))){
    let reproduced=false;
    try {
      baselineAttempted++;
      const current=run.current(row),reason=frozen.checkReplay(row,current);
      if(reason){count(exclusions,reason);excludedRows.push({key:row.key,source:row.source,period:periodOf(row),reason});continue;}
      reproduced=true;baselineReproduced++;
      const candidate=run.candidate(row),comparison=compareRow(row,current,candidate,audit.resultOf(loaded.results.get(row.key)));
      if(comparison.reason){count(exclusions,comparison.reason);excludedRows.push({key:row.key,source:row.source,period:periodOf(row),reason:comparison.reason});continue;}
      rows.push(comparison.row);
    }catch(error){
      const reason=(reproduced?'candidate-replay-error:':'baseline-replay-error:')+String(error.message).slice(0,160);
      count(exclusions,reason);excludedRows.push({key:row.key,source:row.source,period:periodOf(row),reason});
    }
  }
  const predictionSources=frozen.MODULES.map(name=>({path:'js/'+name+'.js',sha256:hash(fs.readFileSync(path.join(root,'js',name+'.js')))}));
  const scriptSha256=hash(fs.readFileSync(__filename)),aiCoreSha256=predictionSources.find(file=>file.path==='js/ai-core.js').sha256;
  const grouped=selected=>({total:summarize(selected),bySource:Object.fromEntries(SOURCES.map(source=>[source,summarize(selected.filter(row=>row.source===source))]))});
  return {version:'alternate-escape-partner-comparison-v1',generatedAt:new Date().toISOString(),sourceCommit,since,
    productionChanged:false,automaticProductionChange:false,usableForPrediction:false,resultUsedForSelection:false,
    candidate:{id:CANDIDATE_ID,definedAt:DEFINED_AT,mergeOptions:MERGE_OPTIONS,selectionOptions:SELECTION_OPTIONS,aiCoreSha256,scriptSha256,
      fingerprint:hash(JSON.stringify({id:CANDIDATE_ID,definedAt:DEFINED_AT,mergeOptions:MERGE_OPTIONS,selectionOptions:SELECTION_OPTIONS,predictionSources,scriptSha256})),
      definition:'Re-evaluate partners for an alternative escape scenario using its own hold/pickup roles through research-only merge and selection options. Preserve the existing main head, main tickets, scenario scores and practical ticket count.',
      decision:'INSUFFICIENT_EVIDENCE',automaticApplication:false,formalGateRegistered:false},
    contract:{sameRaceAndTicketCount:true,mainTicketSetUnchanged:true,baselineHeadTicketsAndScenariosMustMatch:true,
      acceptedCoreVersions:ACCEPTED_CORE_VERSIONS,sourceInputsWritten:false,resultsFetched:false,
      candidateSavedBeforeDeadline:false,formalForwardEvidence:false,oddsUsedForSelection:false,resultsUsedForSelection:false},
    inputFiles:loaded.files,predictionSources,
    baselineReproduction:{eligibleFrozen:loaded.chosen.size,attempted:baselineAttempted,reproduced:baselineReproduced,
      rate:loaded.chosen.size?100*baselineReproduced/loaded.chosen.size:null},
    exclusions,excludedRows,summary:summarize(rows),bySource:grouped(rows).bySource,
    byPeriod:Object.fromEntries(PERIODS.map(period=>[period,grouped(rows.filter(row=>row.period===period))])),
    byVenue:Array.from({length:24},(_,index)=>{const jcd=String(index+1).padStart(2,'0');return {jcd,...grouped(rows.filter(row=>row.key.split('-')[1]===jcd))};}),
    officialResultEvidence:[...loaded.results.values()].filter(result=>audit.resultOf(result)),rows,
    limitation:'Saved pre-deadline official inputs only; no missing inputs are reconstructed. Historical and post-definition candidate replays are retrospective calculations, not a candidate saved before the deadline or formal forward/holdout evidence. Equal 100 yen per ticket is hypothetical, not user purchases. Refund/void and unknown payout are not losses. Discovery results do not authorize production adoption.'};
}

if(require.main===module)build(process.cwd(),{since:process.argv[2]||DEFAULT_SINCE}).then(report=>{
  const output=path.join(process.cwd(),'data/stats/alternate-escape-partner-comparison.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report)+'\n');
  console.log(JSON.stringify({output,summary:report.summary,baselineReproduction:report.baselineReproduction,exclusions:report.exclusions}));
  if(report.baselineReproduction.eligibleFrozen>0&&report.baselineReproduction.reproduced===0)throw Error('All eligible frozen baselines failed reproduction');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={CANDIDATE_ID,DEFINED_AT,DEFAULT_SINCE,ACCEPTED_CORE_VERSIONS,MERGE_OPTIONS,SELECTION_OPTIONS,validTickets,compareRow,summarize,build};
