'use strict';
// Retrospective, fixed-count research. The v1 candidate remains independently defined.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const previous = require('./compare-alternate-escape-partners.cjs');

const CANDIDATE_ID = 'selected-escape-partner-order-v2';
const DEFINED_AT = '2026-10-19T02:17:17.000Z';
const HELPER_MODULE = 'research-selected-escape-partners';
const SOURCES = ['daily-primary','daily-verification','all-race-note'];
const PERIODS = ['discovery','post-definition-replay','unknown'];
const TRANSFORMER = `function(prediction,data,baselineSelection){
  const formation=ChappyAICore.buildFormations(prediction.aiCore.analyses,
    prediction.aiCore.raceScenarios,ChappyAICore.getRaceEntries(data),data,{researchAlternateEscapePartnerRoles:true});
  return ChappyResearchSelectedEscapePartners.select(prediction,baselineSelection,formation);
}`;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const same = (left,right) => JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
const periodOf = selectedAt => !Number.isFinite(Date.parse(selectedAt))?'unknown':Date.parse(selectedAt)<Date.parse(DEFINED_AT)?PERIODS[0]:PERIODS[1];
const headOf = ticket => Number(String(ticket).split('-')[0]);
const headCounts = tickets => Object.fromEntries(Array.from({length:6},(_,index)=>[index+1,tickets.filter(ticket=>headOf(ticket)===index+1).length]));

function invariantReason(current,candidate) {
  if(JSON.stringify(headCounts(current.tickets))!==JSON.stringify(headCounts(candidate.tickets)))return 'candidate-head-ticket-counts-changed';
  if(!Array.isArray(current.flowTickets)||!Array.isArray(candidate.flowTickets)||!same(current.flowTickets,candidate.flowTickets))return 'candidate-flow-tickets-changed';
  if(!Array.isArray(current.ticketRows)||!Array.isArray(candidate.ticketRows))return 'candidate-selection-details-unavailable';
  const protectedRow=row=>[row.category,row.displayCategory,row.sourceCategory,...(Array.isArray(row.categories)?row.categories:[])].some(value=>['本線','本命','流し','main','flow','nagashi'].includes(value));
  const currentProtected=current.ticketRows.filter(protectedRow);
  const candidateProtected=candidate.ticketRows.filter(protectedRow);
  const describe=row=>JSON.stringify({ticket:row.ticket,category:row.category||'',displayCategory:row.displayCategory||'',sourceCategory:row.sourceCategory||'',categories:[...(Array.isArray(row.categories)?row.categories:[])].sort()});
  if(!same(currentProtected.map(describe),candidateProtected.map(describe)))return 'candidate-protected-ticket-rows-changed';
  const changed=!same(current.tickets,candidate.tickets);
  if(!changed)return '';
  const targetHead=Number(candidate.researchSelection?.targetHead);
  if(!Number.isInteger(targetHead)||targetHead<1||targetHead>6||!current.tickets.some(ticket=>headOf(ticket)===targetHead))return 'candidate-target-head-not-selected';
  if(Number(current.insideSkill?.boatNo)!==targetHead)return 'candidate-target-not-actual-inside-head';
  if(!same(current.tickets.filter(ticket=>headOf(ticket)!==targetHead),candidate.tickets.filter(ticket=>headOf(ticket)!==targetHead)))return 'candidate-nontarget-head-tickets-changed';
  if(candidate.researchSelection?.changed!==true)return 'candidate-change-diagnostics-mismatch';
  return '';
}

function summarize(rows) {
  const selectionReasons={};
  for(const row of rows){const reason=row.candidate.researchSelection?.reasonCode||'DIAGNOSTIC_UNAVAILABLE';selectionReasons[reason]=(selectionReasons[reason]||0)+1;}
  return {...previous.summarize(rows),selectionReasons};
}

async function build(root,{since=previous.DEFAULT_SINCE,loaded,run,sourceCommit=process.env.COMPARISON_SOURCE_SHA||process.env.GITHUB_SHA||''}={}) {
  loaded ||= await frozen.loadFrozenInputs(root,since,{readOnlySources:true,refreshResults:false,acceptedCoreVersions:previous.ACCEPTED_CORE_VERSIONS});
  run ||= {current:frozen.runner(root,'current',{includeSelectionDetails:true}),
    candidate:frozen.runner(root,'current',{additionalModules:[HELPER_MODULE],selectionTransformer:TRANSFORMER,includeSelectionDetails:true})};
  // Reuse v1's strict saved-baseline checks and official settlement without changing v1.
  const report=await previous.build(root,{since,loaded,run,sourceCommit});
  const exclusions={...report.exclusions},excludedRows=report.excludedRows.map(row=>({...row,selectedAt:loaded.chosen.get(row.key)?.selectedAt||null,period:periodOf(loaded.chosen.get(row.key)?.selectedAt)}));
  const rows=[];
  for(const row of report.rows){
    row.period=periodOf(row.selectedAt);
    const reason=invariantReason(row.current,row.candidate);
    if(reason){exclusions[reason]=(exclusions[reason]||0)+1;excludedRows.push({key:row.key,source:row.source,selectedAt:row.selectedAt,period:row.period,reason});}
    else rows.push(row);
  }
  const predictionSources=[...report.predictionSources,{path:'js/'+HELPER_MODULE+'.js',sha256:hash(fs.readFileSync(path.join(root,'js',HELPER_MODULE+'.js')))}];
  const scriptSha256=hash(fs.readFileSync(__filename));
  const comparisonSources=['scripts/compare-escape-frozen.cjs','scripts/compare-alternate-escape-partners.cjs'].map(file=>({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
  const grouped=selected=>({total:summarize(selected),bySource:Object.fromEntries(SOURCES.map(source=>[source,summarize(selected.filter(row=>row.source===source))]))});
  return {...report,version:'selected-escape-partner-comparison-v2',
    candidate:{id:CANDIDATE_ID,definedAt:DEFINED_AT,scriptSha256,
      helperSha256:predictionSources.at(-1).sha256,aiCoreSha256:predictionSources.find(file=>file.path==='js/ai-core.js').sha256,
      fingerprint:hash(JSON.stringify({id:CANDIDATE_ID,definedAt:DEFINED_AT,transformer:TRANSFORMER,predictionSources,comparisonSources,scriptSha256})),
      definition:'For an actual inside-course head already selected in the normal practical selection, replace only non-main/non-flow tickets using the existing alternate escape formation safety order. Reuse baseline captured canonical qualification evidence for that selected head; introduce no new head qualification, physical promotion, scoring formula or threshold search. Stakes are hypothetical 100 yen per ticket.',
      decision:'INSUFFICIENT_EVIDENCE',formalGateRegistered:false,automaticApplication:false},
    contract:{...report.contract,headTicketCountsUnchanged:true,nonTargetHeadTicketSetsUnchanged:true,
      mainAndFlowTicketRowsUnchanged:true,targetMustBeAlreadySelectedActualInsideHead:true,
      baselineSelectionUsesResearchOption:false,candidateReusesExistingSafetyOrder:true,newHeadQualificationAllowed:false},
    predictionSources,comparisonSources,exclusions,excludedRows,summary:summarize(rows),bySource:grouped(rows).bySource,
    byPeriod:Object.fromEntries(PERIODS.map(period=>[period,grouped(rows.filter(row=>row.period===period))])),
    byVenue:Array.from({length:24},(_,index)=>{const jcd=String(index+1).padStart(2,'0');return {jcd,...grouped(rows.filter(row=>row.key.split('-')[1]===jcd))};}),rows,
    limitation:'A separate v2 research definition. The v1 definition and comparison remain unchanged. Historical inputs and outcomes were already inspected, so this is discovery; post-definition replay is not a candidate saved before the deadline or formal forward/holdout evidence. Only existing safety order is reused. Equal 100 yen per ticket is hypothetical. Missing evidence, unknown payouts, refunds and zero sample sizes do not establish improvement or authorize production adoption.'};
}

if(require.main===module)build(process.cwd(),{since:process.argv[2]||previous.DEFAULT_SINCE}).then(report=>{
  const output=path.join(process.cwd(),'data/stats/selected-escape-partner-comparison.json');
  fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report)+'\n');
  console.log(JSON.stringify({output,summary:report.summary,baselineReproduction:report.baselineReproduction,exclusions:report.exclusions}));
  if(report.baselineReproduction.eligibleFrozen>0&&report.baselineReproduction.reproduced===0)throw Error('All eligible frozen baselines failed reproduction');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={CANDIDATE_ID,DEFINED_AT,HELPER_MODULE,TRANSFORMER,headCounts,invariantReason,summarize,build};
