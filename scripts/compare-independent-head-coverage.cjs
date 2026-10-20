'use strict';
// Offline, result-blind research. Never imported by browser/collector prediction code.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const frozen = require('./compare-escape-frozen.cjs');
const audit = require('./audit-escape-main.cjs');
const archive = require('./daily-prediction-source-archive');
const {decide} = require('./phase11-improvement-decision-gate.cjs');

const CANDIDATE_ID = 'qualified-unrepresented-head-one-swap-v1';
const DEFINED_AT = '2026-10-20T05:42:27.000Z';
const REQUIRED_CORE_VERSION = 'ai-core-v4.8.8-adjacent-start-rank';
const DEFAULT_SINCE = '20260922';
const MARKER = '    expansionCandidates.forEach(\n';
const INJECTION = `    // Offline research: change order only after the existing validator/sort.
    if (Array.isArray(options.researchBaselineHeads) && options.researchBaselineHeads.length &&
        options.researchBaselineHeads.every(head => Number.isInteger(head) && head >= 1 && head <= 6)) {
      const represented = new Set(options.researchBaselineHeads);
      const firstNewHead = expansionCandidates.findIndex(row => {
        const head = ticketBoats(row.ticket)[0], course = courseOf(validationContext, head);
        return !represented.has(head) && course >= 1 && course <= 6 &&
          row.evidenceQualified === true && row.purchaseEligible === true && row.expansionEligible === true &&
          row.priorityScore >= 65 && (![2,5,6].includes(course) || row.priorityScore >= 80) &&
          row.validIndependentBranchIds.some(id => {
            const branch = validationContext.branchesById.get(id);
            return branch?.ticket === row.ticket && branch.attackerBoatNo === head &&
              branch.phaseEvidence?.kind === 'alternate-head';
          });
      });
      if (firstNewHead > 0) expansionCandidates.unshift(expansionCandidates.splice(firstNewHead, 1)[0]);
    }

`;
const SOURCES = ['daily-primary','daily-verification','all-race-note'];
const PERIODS = ['discovery','post-definition-replay','unknown'];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const ticketHead = ticket => Number(String(ticket).split('-')[0]);
const heads = tickets => [...new Set(tickets.map(ticketHead))].sort((a,b)=>a-b);
const same = (left,right) => JSON.stringify([...left].sort())===JSON.stringify([...right].sort());
const count = (object,key) => {object[key]=(object[key]||0)+1;};
const periodOf = selectedAt => !Number.isFinite(Date.parse(selectedAt))?'unknown':Date.parse(selectedAt)<Date.parse(DEFINED_AT)?'discovery':'post-definition-replay';
const validTickets = tickets => Array.isArray(tickets)&&tickets.length>0&&tickets.length<=10&&
  new Set(tickets).size===tickets.length&&tickets.every(ticket=>typeof ticket==='string'&&/^[1-6]-[1-6]-[1-6]$/.test(ticket)&&new Set(ticket.split('-')).size===3);

function transformSelection(source) {
  if(source.split(MARKER).length!==2)throw Error('Independent head coverage selector source contract changed');
  return source.replace(MARKER,INJECTION+MARKER);
}

function declaredCoreVersion(root) {
  const source=fs.readFileSync(path.join(root,'js/ai-core.js'),'utf8');
  const matches=[...source.matchAll(/\bconst\s+CORE_VERSION\s*=\s*["']([^"']+)["']/g)];
  if(matches.length!==1||matches[0][1]!==REQUIRED_CORE_VERSION)throw Error('Candidate declared core version contract changed');
  return matches[0][1];
}

function rankAvailability(row) {
  const entries=row.conditions?.escapeEvaluationEvidence?.entries||[];
  const profiles=entries.map(entry=>entry?.officialStartRank);
  const statuses={};for(const profile of profiles)count(statuses,profile?String(profile.status||'status-missing'):'not-saved');
  return {boats:entries.length,savedProfiles:profiles.filter(Boolean).length,
    availableStatusProfiles:profiles.filter(profile=>profile?.status==='available').length,
    notSaved:profiles.filter(profile=>!profile).length,statuses,
    qualification:'Saved presence/status only; not a new score or source-validity decision.'};
}

function branchOf(result,row,kind) {
  const ids=Array.isArray(row?.validIndependentBranchIds)?row.validIndependentBranchIds:[];
  return (result.selectionBranches||[]).find(branch=>ids.includes(branch.id)&&branch.ticket===row.ticket&&
    branch.kind==='independent-scenario'&&branch.phaseKind===kind&&
    (kind==='hold-continuation'?branch.source==='race-flow-phase-continuation':
      ['race-flow-attack-scenario','preserved-alternate-attack-scenario'].includes(branch.source)&&Number(branch.attackerBoatNo)===ticketHead(row.ticket)))||null;
}

// All-or-nothing postcondition. No rebuilding, trimming, filling, or result input.
function guardCandidate(current,attempt) {
  const unchanged=reason=>({changed:false,reason,current,candidate:current});
  if(!validTickets(current?.tickets)||!validTickets(attempt?.tickets))return unchanged('INVALID_FINAL_TICKETS');
  if(current.coreVersion!==REQUIRED_CORE_VERSION||attempt.coreVersion!==REQUIRED_CORE_VERSION)return unchanged('CORE_VERSION_MISMATCH');
  if(same(current.tickets,attempt.tickets))return unchanged('NO_FINAL_TICKET_CHANGE');
  if(current.tickets.length!==attempt.tickets.length)return unchanged('TICKET_BUDGET_CHANGED');
  if(Number(current.head)!==Number(attempt.head)||JSON.stringify(current.scenarios)!==JSON.stringify(attempt.scenarios))return unchanged('MAIN_PREDICTION_CHANGED');
  const oldRows=current.selectionRows,newRows=attempt.selectionRows;
  if(!Array.isArray(oldRows)||!Array.isArray(newRows)||!same(oldRows.map(row=>row.ticket),current.tickets)||!same(newRows.map(row=>row.ticket),attempt.tickets))return unchanged('FINAL_SELECTION_ROWS_UNAVAILABLE');
  const removed=current.tickets.filter(ticket=>!attempt.tickets.includes(ticket));
  const added=attempt.tickets.filter(ticket=>!current.tickets.includes(ticket));
  if(removed.length!==1||added.length!==1)return unchanged('NOT_EXACTLY_ONE_SWAP');
  const donor=oldRows.find(row=>row.ticket===removed[0]),replacement=newRows.find(row=>row.ticket===added[0]);
  if(donor.selectionTier!=='展開追加'||replacement.selectionTier!=='展開追加')return unchanged('NON_EXPANSION_SWAP');
  const protectedRow=row=>[row.category,row.displayCategory,row.sourceCategory,...(Array.isArray(row.categories)?row.categories:[])].some(value=>['本線','本命','流し','main','flow','nagashi'].includes(value));
  if(protectedRow(donor)||protectedRow(replacement))return unchanged('PROTECTED_CATEGORY_SWAP');
  if(!branchOf(current,donor,'hold-continuation')||donor.purchaseEligible!==true||donor.expansionEligible!==true||donor.evidenceQualified!==true)return unchanged('DONOR_NOT_VALIDATED_HOLD_CONTINUATION');
  const alternateBranch=branchOf(attempt,replacement,'alternate-head');
  if(!alternateBranch||replacement.purchaseEligible!==true||replacement.expansionEligible!==true||replacement.evidenceQualified!==true||!Number.isFinite(replacement.priorityScore)||replacement.priorityScore<65)return unchanged('ADDED_HEAD_NOT_VALIDATED');
  const baselineExclusion=(current.candidateDecisions||[]).find(decision=>decision.ticket===replacement.ticket&&decision.selected===false&&
    ['MAXIMUM_REACHED','LOWER_PRIORITY_INDEPENDENT_BRANCH'].includes(decision.reasonCode)&&
    Array.isArray(decision.branchIds)&&decision.branchIds.includes(alternateBranch.id));
  if(!baselineExclusion)return unchanged('BASELINE_EXCLUSION_REASON_UNAVAILABLE');
  const donorHead=ticketHead(donor.ticket),newHead=ticketHead(replacement.ticket),oldHeads=heads(current.tickets),newHeads=heads(attempt.tickets);
  if(current.tickets.filter(ticket=>ticketHead(ticket)===donorHead).length<2)return unchanged('DONOR_WAS_LAST_OLD_HEAD_TICKET');
  if(oldHeads.includes(newHead)||newHeads.length!==oldHeads.length+1||oldHeads.some(head=>!newHeads.includes(head)))return unchanged('HEAD_COVERAGE_NOT_STRICTLY_EXPANDED');
  const course=Number(attempt.courseMapping?.byBoat?.[newHead]);
  if(attempt.courseMapping?.formal!==true||!Number.isInteger(course)||course<1||course>6)return unchanged('ADDED_HEAD_COURSE_UNAVAILABLE');
  if([2,5,6].includes(course)&&replacement.priorityScore<80)return unchanged('ADDED_HEAD_BELOW_EXISTING_COURSE_FLOOR');
  const normalCount=current.expansionSummary?.normalCount;
  if(!Number.isInteger(normalCount)||normalCount<5||normalCount>7||attempt.expansionSummary?.normalCount!==normalCount)return unchanged('NORMAL_ALLOCATION_CHANGED');
  const normalRows=rows=>rows.filter(row=>row.selectionTier!=='展開追加');
  if(JSON.stringify(normalRows(oldRows))!==JSON.stringify(normalRows(newRows)))return unchanged('NORMAL_FLOW_OR_PROMOTION_ROWS_CHANGED');
  if(oldRows.some(row=>row.ticket!==donor.ticket&&JSON.stringify(row)!==JSON.stringify(newRows.find(next=>next.ticket===row.ticket))))return unchanged('RETAINED_TICKET_ROW_CHANGED');
  const strong=attempt.expansionSummary?.strongEscapeTrim;
  if(strong?.eligible===true){
    const alternativeCount=attempt.tickets.filter(ticket=>Number(attempt.courseMapping?.byBoat?.[ticketHead(ticket)])!==1).length;
    if(!Number.isInteger(strong.maximumAlternateHeadCount)||alternativeCount>strong.maximumAlternateHeadCount)return unchanged('STRONG_ESCAPE_LIMIT_VIOLATED');
  }
  const donorPriority=Number.isFinite(donor.priorityScore)?donor.priorityScore:null;
  const priorityDelta=donorPriority===null?null:replacement.priorityScore-donorPriority;
  return {changed:true,reason:'ONE_QUALIFIED_NEW_HEAD_SWAP',current,candidate:attempt,
    swap:{removed:donor.ticket,added:replacement.ticket,removedHead:donorHead,addedHead:newHead,
      removedBranch:branchOf(current,donor,'hold-continuation'),addedBranch:alternateBranch,
      oldHeads,newHeads,donorPriority,candidatePriority:replacement.priorityScore,priorityDelta,
      priorityDecreased:priorityDelta===null?null:priorityDelta<0,headCourse:course,
      retainedTicketCount:current.tickets.length-1,normalCount,
      baselineExclusion:{reasonCode:baselineExclusion.reasonCode,branchId:alternateBranch.id,
        priorityScore:Number.isFinite(baselineExclusion.priorityScore)?baselineExclusion.priorityScore:null},
      addedQualification:{purchaseEligible:replacement.purchaseEligible,expansionEligible:replacement.expansionEligible,evidenceQualified:replacement.evidenceQualified},
      strongEscapeLimit:strong?.eligible===true?strong.maximumAlternateHeadCount:null}};
}

const compactResult=result=>({head:result.head,tickets:[...result.tickets],mainTickets:[...(result.mainTickets||[])],scenarios:clone(result.scenarios),coreVersion:result.coreVersion});
function summarize(rows) {
  const evaluated=rows.filter(row=>row.result&&!row.result.excluded);
  const gained=evaluated.filter(row=>!row.current.tickets.includes(row.result.actual)&&row.candidate.tickets.includes(row.result.actual));
  const lost=evaluated.filter(row=>row.current.tickets.includes(row.result.actual)&&!row.candidate.tickets.includes(row.result.actual));
  const current=frozen.totals(rows,'current'),candidate=frozen.totals(rows,'candidate'),reasons={};
  for(const row of rows)count(reasons,row.changeReason);
  return {replayed:rows.length,settled:evaluated.length,pending:rows.filter(row=>!row.result).length,
    excludedResults:rows.filter(row=>row.result?.excluded).length,changed:rows.filter(row=>row.changed).length,
    unchanged:rows.filter(row=>!row.changed).length,changeReasons:reasons,current,candidate,
    gainedHits:gained.length,lostHits:lost.length,netHitChange:gained.length-lost.length,
    gainedRaceKeys:gained.map(row=>row.key),lostRaceKeys:lost.map(row=>row.key),
    recoveryRateDelta:current.recoveryRate===null||candidate.recoveryRate===null?null:candidate.recoveryRate-current.recoveryRate,
    equalTicketBudget:rows.every(row=>row.current.tickets.length===row.candidate.tickets.length),
    priorityDecreaseSwaps:rows.filter(row=>row.swap?.priorityDecreased===true).length};
}

async function build(root,{since=DEFAULT_SINCE,loaded,run,sourceCommit=process.env.GITHUB_SHA||''}={}) {
  const requiredCoreVersion=declaredCoreVersion(root);
  loaded ||= await frozen.loadFrozenInputs(root,since,{requiredCoreVersion,refreshResults:false});
  run ||= {current:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true}),
    candidate:frozen.runner(root,'current',{freezeClock:true,includeSelectionEvidence:true,transformSelection})};
  const rows=[],excludedRows=[],exclusions={...loaded.exclusions};let baselineReproduced=0;
  for(const row of [...loaded.chosen.values()].sort((left,right)=>left.key.localeCompare(right.key))){
    let current;
    try {
      current=run.current(row);
      const reason=current.coreVersion!==REQUIRED_CORE_VERSION?'baseline-runtime-core-version-mismatch':frozen.checkReplay(row,current);
      if(reason){count(exclusions,reason);excludedRows.push({key:row.key,source:row.source,sourcePointer:row.sourcePointer||null,selectedAt:row.selectedAt,period:periodOf(row.selectedAt),reason});continue;}
      baselineReproduced++;
    }catch(error){const reason='baseline-replay-error:'+String(error.message).slice(0,160);count(exclusions,reason);excludedRows.push({key:row.key,source:row.source,sourcePointer:row.sourcePointer||null,selectedAt:row.selectedAt,period:periodOf(row.selectedAt),reason});continue;}
    let attempt,comparison;
    try {
      // Only pre-result baseline head identities enter the research selector.
      attempt=run.candidate(row,{researchBaselineHeads:heads(current.tickets)});
      comparison=guardCandidate(current,attempt);
    }catch(error){comparison={changed:false,reason:'CANDIDATE_ERROR:'+String(error.message).slice(0,160),candidate:current};}
    const accepted=comparison.candidate;
    rows.push({key:row.key,source:row.source,sourceCommit:row.sourceCommit,
      sourcePointer:row.sourcePointer||null,selectedAt:row.selectedAt,deadlineAt:row.deadlineAt,
      period:periodOf(row.selectedAt),generation:current.coreVersion,current:compactResult(current),candidate:compactResult(accepted),
      savedRankAvailability:rankAvailability(row),
      changed:comparison.changed,changeReason:comparison.reason,...(comparison.swap?{swap:comparison.swap}:{}),
      attempt:attempt?{tickets:attempt.tickets,coreVersion:attempt.coreVersion,
        normalCount:attempt.expansionSummary?.normalCount??null,finalCount:attempt.tickets?.length??null,
        strongEscapeLimit:attempt.expansionSummary?.strongEscapeTrim?.eligible===true
          ?attempt.expansionSummary.strongEscapeTrim.maximumAlternateHeadCount:null}:null,
      // The outcome is joined only after the candidate has been fixed or rejected.
      result:audit.resultOf(loaded.results.get(row.key))});
  }
  const predictionSources=frozen.MODULES.map(name=>({path:'js/'+name+'.js',sha256:hash(fs.readFileSync(path.join(root,'js',name+'.js')))}));
  const scriptSha256=hash(fs.readFileSync(__filename)),selectorSha256=predictionSources.find(file=>file.path==='js/practical-selection.js').sha256;
  const comparisonSources=['compare-escape-frozen.cjs','analysis-input-contract.js','audit-escape-main.cjs','daily-prediction-source-archive.js','phase11-improvement-decision-gate.cjs']
    .map(name=>({path:'scripts/'+name,sha256:hash(fs.readFileSync(path.join(root,'scripts',name)))}));
  const changedRows=rows.filter(row=>row.changed);
  const grouped=selected=>({all:summarize(selected),changed:summarize(selected.filter(row=>row.changed))});
  return {version:'independent-head-coverage-comparison-v1',generatedAt:new Date().toISOString(),sourceCommit,since,
    productionChanged:false,automaticProductionChange:false,usableForPrediction:false,resultUsedForSelection:false,
    candidate:{id:CANDIDATE_ID,definedAt:DEFINED_AT,requiredCoreVersion:REQUIRED_CORE_VERSION,scriptSha256,selectorSha256,
      replaySourceSha256:comparisonSources.find(file=>file.path==='scripts/compare-escape-frozen.cjs').sha256,
      inputContractSha256:comparisonSources.find(file=>file.path==='scripts/analysis-input-contract.js').sha256,
      fingerprint:hash(JSON.stringify({id:CANDIDATE_ID,definedAt:DEFINED_AT,injection:INJECTION,scriptSha256,predictionSources,comparisonSources})),
      definition:'Move only the highest existing validated, course-floor-eligible unrepresented alternate head to the start of the already sorted expansion candidates. Run every existing trim. Accept only one equal-budget swap replacing a duplicate-head hold-continuation expansion when the baseline recorded the same added branch as excluded by MAXIMUM_REACHED or LOWER_PRIORITY_INDEPENDENT_BRANCH, preserving every normal/flow/promotion row and all old heads; otherwise keep the complete baseline. Report any priority decrease.',
      decisionGate:decide({}),formalForwardEvidence:false,candidateSavedBeforeDeadline:false,automaticApplication:false},
    contract:{sameRaceAndTicketCount:true,normalRowsUnchanged:true,existingHeadSetContained:true,newHeadsPerChangedRace:1,
      maximumSwapsPerRace:1,missingFrozenInputsFilled:false,selectionUsesResults:false,selectionUsesOdds:false,
      existingValidatorAndAllTrimsPreserved:true,clock:'VM Date fixed to saved selectedAt',hypotheticalStakePerTicketYen:100},
    inputFiles:loaded.files,predictionSources,comparisonSources,officialResultEvidence:[...loaded.results.values()].filter(result=>audit.resultOf(result)),
    resultAttempts:loaded.resultAttempts||[],savedRankAvailability:{
      eligibleFrozenRaces:loaded.chosen.size,
      allSixProfilesSaved:[...loaded.chosen.values()].filter(row=>rankAvailability(row).savedProfiles===6).length,
      someProfilesNotSaved:[...loaded.chosen.values()].filter(row=>rankAvailability(row).savedProfiles<6).length,
      allSixAvailableStatus:[...loaded.chosen.values()].filter(row=>rankAvailability(row).availableStatusProfiles===6).length,
      limitation:'Presence/status metadata only. Missing ranks stay missing; current values are never fetched.'},
    baselineReproduction:{eligibleFrozen:loaded.chosen.size,reproduced:baselineReproduced,
      rate:loaded.chosen.size?100*baselineReproduced/loaded.chosen.size:null},exclusions,excludedRows,
    summary:summarize(rows),changedSummary:summarize(changedRows),
    bySource:Object.fromEntries(SOURCES.map(source=>[source,grouped(rows.filter(row=>row.source===source))])),
    byGeneration:{[requiredCoreVersion]:grouped(rows)},
    byPeriod:Object.fromEntries(PERIODS.map(period=>[period,grouped(rows.filter(row=>row.period===period))])),
    byVenue:Array.from({length:24},(_,index)=>{const jcd=String(index+1).padStart(2,'0');return {jcd,...grouped(rows.filter(row=>row.key.split('-')[1]===jcd))};}),rows,
    limitation:'Historical replay and post-definition replay are discovery calculations, not candidates saved before the deadline or formal holdout evidence. Missing official inputs/history/ranks are never filled using current values. Equal 100 yen per ticket is hypothetical, not purchases. Pending and excluded results are separate; a zero denominator is null. Candidate errors and failed postconditions retain the whole baseline and remain in the paired cohort. No production adoption follows from this report.'};
}

if(require.main===module)build(process.cwd(),{since:process.argv[2]||DEFAULT_SINCE}).then(report=>{
  const output=path.join(process.cwd(),'data/stats/independent-head-coverage-comparison.json');
  archive.atomicWrite(output,JSON.stringify(report)+'\n');
  console.log(JSON.stringify({output,summary:report.summary}));
  if(report.baselineReproduction.eligibleFrozen>0&&report.baselineReproduction.reproduced===0)throw Error('All eligible frozen baselines failed reproduction');
}).catch(error=>{console.error(error);process.exitCode=1;});

module.exports={CANDIDATE_ID,DEFINED_AT,REQUIRED_CORE_VERSION,DEFAULT_SINCE,INJECTION,MARKER,transformSelection,declaredCoreVersion,rankAvailability,branchOf,guardCandidate,heads,summarize,build};
