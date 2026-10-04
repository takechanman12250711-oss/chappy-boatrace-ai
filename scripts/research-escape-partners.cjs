'use strict';
// Retrospective research only. No imports from the production prediction path.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const input = require('./analysis-input-contract');
const VERSION = 'escape-partner-history-research-v1';
const MIN_HISTORY = 30; // Existing venue-history reliability floor, not an adoption gate.
const hash = raw => crypto.createHash('sha256').update(raw).digest('hex');
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
const validTicket = t => typeof t === 'string' && /^[1-6]-[1-6]-[1-6]$/.test(t) && new Set(t.split('-')).size === 3;
const same = (a,b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function courseMap(boats, official = false) {
  if (!Array.isArray(boats) || boats.length !== 6) return null;
  const map = {};
  for (const b of boats) {
    const no = Number(official ? b.boatNo : b.boat), course = Number(b.course);
    if (!Number.isInteger(no) || no < 1 || no > 6 || !Number.isInteger(course) || course < 1 || course > 6 ||
        (official && b.courseOfficial !== true) || map[no]) return null;
    map[no] = course;
  }
  return new Set(Object.values(map)).size === 6 ? map : null;
}
function historicalRace(r) {
  const key = input.raceKey(r), actual = input.actualTicket(r);
  if (!key || !input.isOfficialResultSource(r) || r.resultAvailable !== true || !validTicket(actual) ||
      input.winningMethod(r) !== '逃げ' || r.void || r.status === 'void' || r.refund || r.refunded || r.refunds?.length ||
      r.starts?.some(s=>s.falseStart || s.lateStart)) return null;
  const courses = courseMap(r.starts);
  const finishers = r.finishers;
  if (!courses || !Array.isArray(finishers) || finishers.length !== 6 ||
      new Set(finishers.map(f=>Number(f.boat))).size !== 6 || new Set(finishers.map(f=>Number(f.rank))).size !== 6 ||
      finishers.some(f=>!courses[Number(f.boat)] || !Number.isInteger(Number(f.rank)) || Number(f.rank)<1 || Number(f.rank)>6)) return null;
  const ordered = [...finishers].sort((a,b)=>Number(a.rank)-Number(b.rank)).slice(0,3).map(f=>Number(f.boat)).join('-');
  if (ordered !== actual || courses[Number(actual[0])] !== 1) return null;
  return { raceKey:key, date:key.slice(0,8), jcd:key.slice(9,11), second:courses[Number(actual[2])], third:courses[Number(actual[4])] };
}
function emptyProfile() { return { samples:0, second:{}, third:{}, pairs:{}, from:null, through:null }; }
function addHistory(p, r) {
  p.samples++; inc(p.second,r.second); inc(p.third,r.third); inc(p.pairs,`${r.second}-${r.third}`);
  p.from = p.from && p.from < r.date ? p.from : r.date;
  p.through = p.through && p.through > r.date ? p.through : r.date;
}
function historyBefore(rows, date, jcd) {
  const p = emptyProfile(), seen = new Set();
  for (const r of rows) if (r.date < date && r.jcd === jcd && !seen.has(r.raceKey)) { seen.add(r.raceKey); addHistory(p,r); }
  return p;
}
function rankedCandidates(row) {
  const e = row.evidence;
  if (e?.status !== 'validated') return { reason:'selection-evidence-unavailable' };
  const pool = row.pool, decisions = e.stageHistory.candidateDecisions;
  const candidates = new Map(), independent = new Set();
  for (const d of decisions) {
    const t = d.ticket;
    if (d.reasonCode === 'INDEPENDENT_SCENARIO' && row.baseline.includes(t)) independent.add(t);
    if (!pool.includes(t) || !validTicket(t) || !Number.isFinite(d.priorityScore) || !d.branchIds?.length ||
        !['ALREADY_SELECTED','INDEPENDENT_SCENARIO','CANDIDATE_ONLY_EVALUATION','LOWER_PRIORITY_SAME_ATTACKER','STRONG_ESCAPE_ALTERNATE_TRIMMED'].includes(d.reasonCode)) continue;
    const roles = {1:['head','attack'],2:['hold','pickup','attack'],3:['hold','pickup']};
    const grounded = (d.physicalCoverage || []).filter(c=>Number(c.boatNo) === Number(t[(Number(c.position)-1)*2]) &&
      roles[Number(c.position)]?.includes(c.role));
    if (!grounded.some(c=>Number(c.position)===1) || !grounded.some(c=>Number(c.position)>1)) continue;
    const old = candidates.get(t);
    if (old && old.priorityScore !== d.priorityScore) return { reason:'conflicting-saved-priority' };
    candidates.set(t,{ticket:t,priorityScore:d.priorityScore});
  }
  return { candidates, independent };
}
function preservePairCoverage(baseline, proposed) {
  const pairs=tickets=>new Set(tickets.map(t=>t.slice(0,3)));
  const proposedPairs=pairs(proposed);
  const removedPairs=[...pairs(baseline)].filter(pair=>!proposedPairs.has(pair));
  return {guarded:[...(removedPairs.length?baseline:proposed)],pairGuardApplied:removedPairs.length>0,removedPairs};
}
function select(row, profile) {
  if (!row.courses || row.baseline.length < 1 || row.baseline.length > 10 || !row.baseline.every(validTicket) ||
      new Set(row.baseline).size !== row.baseline.length) return { reason:'invalid-saved-input' };
  const evaluated = rankedCandidates(row);
  if (evaluated.reason) return evaluated;
  const {candidates,independent} = evaluated;
  const isInside = t => row.courses[Number(t[0])] === 1;
  // Unscored and independent saved tickets stay fixed. Change only existing
  // course-one-head partner slots; never add a new head or increase the count.
  const mutable = row.baseline.filter(t=>isInside(t) && candidates.has(t) && !independent.has(t));
  const locked = row.baseline.filter(t=>!mutable.includes(t));
  if (!mutable.length) return { reason:'no-mutable-course-one-slot' };
  const available = [...candidates.values()].filter(c=>isInside(c.ticket) && !locked.includes(c.ticket));
  const baselineOrder = t => row.baseline.includes(t) ? row.baseline.indexOf(t) : row.baseline.length+row.pool.indexOf(t);
  const priority = (a,b) => b.priorityScore-a.priorityScore;
  const stable = (a,b) => baselineOrder(a.ticket)-baselineOrder(b.ticket) || a.ticket.localeCompare(b.ticket);
  const control = [...available].sort((a,b)=>priority(a,b)||stable(a,b)).slice(0,mutable.length).map(c=>c.ticket);
  const frequency = t => profile.pairs[`${row.courses[Number(t[2])]}-${row.courses[Number(t[4])]}`] || 0;
  const candidate = [...available].sort((a,b)=>priority(a,b)||
    (profile.samples >= MIN_HISTORY ? frequency(b.ticket)-frequency(a.ticket) : 0)||stable(a,b))
    .slice(0,mutable.length).map(c=>c.ticket);
  if (control.length !== mutable.length || candidate.length !== mutable.length) return { reason:'insufficient-grounded-pool' };
  const restore = replacement => { let i=0; return row.baseline.map(t=>mutable.includes(t) ? replacement[i++] : t); };
  return { baseline:[...row.baseline], control:restore(control), candidate:restore(candidate), mutableSlots:mutable.length,
    ...preservePairCoverage(row.baseline,restore(control)),
    locked, historyApplied:profile.samples>=MIN_HISTORY, historyChangedControl:!same(control,candidate),
    candidateChangedBaseline:!same(row.baseline,restore(candidate)) };
}
function missStage(tickets, actual) {
  if (tickets.includes(actual)) return 'hit';
  if (!tickets.some(t=>t[0]===actual[0])) return 'head-missing';
  if (!tickets.some(t=>t.slice(0,3)===actual.slice(0,3))) return 'second-missing';
  return 'third-missing';
}
function compareSelections(rows, before, after) {
  const stagesBefore={}, stagesAfter={}, gained=[], lost=[];
  for (const row of rows) {
    const from=missStage(row[before],row.actual), to=missStage(row[after],row.actual);
    inc(stagesBefore,from); inc(stagesAfter,to);
    if ((from==='hit') === (to==='hit')) continue;
    const detail={raceKey:row.raceKey,actual:row.actual,beforeStage:from,afterStage:to,
      removed:row[before].filter(t=>!row[after].includes(t)),added:row[after].filter(t=>!row[before].includes(t))};
    (to==='hit'?gained:lost).push(detail);
  }
  return {races:rows.length,gainedHits:gained.length,lostHits:lost.length,netHits:gained.length-lost.length,
    stagesBefore,stagesAfter,gained,lost};
}
function summarize(rows) {
  const n = rows.length, stats = {};
  for (const key of ['baseline','control','candidate','guarded']) {
    const hits = rows.filter(r=>r[key].includes(r.actual)), stake = rows.reduce((s,r)=>s+r[key].length*100,0);
    const returned = hits.reduce((s,r)=>s+r.payout,0);
    stats[key] = { races:n,hits:hits.length,stake,returned,hitRate:n?hits.length/n*100:null,recoveryRate:stake?returned/stake*100:null };
  }
  const change = against => {
    const gained = rows.filter(r=>r.candidate.includes(r.actual) && !r[against].includes(r.actual)).map(r=>r.raceKey);
    const lost = rows.filter(r=>!r.candidate.includes(r.actual) && r[against].includes(r.actual)).map(r=>r.raceKey);
    return { gainedHits:gained.length,lostHits:lost.length,netHits:gained.length-lost.length,gained,lost };
  };
  return { ...stats,changedRaces:rows.filter(r=>r.candidateChangedBaseline).length,
    pairGuardAppliedRaces:rows.filter(r=>r.pairGuardApplied).length,
    historyChangedControl:rows.filter(r=>r.historyChangedControl).length, versusBaseline:change('baseline'), versusPriorityControl:change('control'),
    selectionComparisons:{
      priorityVsSaved:compareSelections(rows,'baseline','control'),
      historyVsPriority:compareSelections(rows,'control','candidate'),
      guardedVsSaved:compareSelections(rows,'baseline','guarded'),
      guardedVsPriority:compareSelections(rows,'control','guarded')
    } };
}
function build(selected, historical, results, diagnostics = {}, generatedAt = new Date().toISOString()) {
  const {resultOf} = require('./audit-escape-main.cjs');
  const rows=[], pending=[], excluded={};
  for (const row of selected) {
    const profile=historyBefore(historical,row.date,row.jcd), selection=select(row,profile);
    if (selection.reason) { inc(excluded,selection.reason); continue; }
    const result=resultOf(results.get(row.raceKey));
    const base={raceKey:row.raceKey,date:row.date,jcd:row.jcd,method:row.method,sourcePath:row.sourcePath,sourceSha256:row.sourceSha256,
      selectedAt:row.selectedAt,history:profile,historySha256:hash(JSON.stringify(profile)),...selection};
    if (!result) { pending.push(base); continue; }
    if (result.excluded) { inc(excluded,result.excluded); continue; }
    rows.push({...base,...result});
  }
  const groups = key => Object.fromEntries([...new Set(rows.map(r=>r[key]))].sort().map(k=>[k,summarize(rows.filter(r=>r[key]===k))]));
  return {version:VERSION,generatedAt,sourceCommit:process.env.GITHUB_SHA||'',productionChanged:false,automaticProductionChange:false,usableForPrediction:false,
    experiment:'retrospective-discovery',decisionGate:{status:'INSUFFICIENT_EVIDENCE',reason:'No preregistered adoption gate or untouched forward cohort'},
    pairGuardExperiment:{id:'saved-first-second-coverage-guard-v1',
      rule:'Keep the complete saved selection if priority-only reselection removes any saved first-second pair; otherwise use that reselection.',
      resultUsedForSelection:false,productionChanged:false,untouchedHoldout:false,
      limitation:'Designed after inspecting prior losses. This is a new exploratory variant, not independent validation or an approved production rule.'},
    contract:{historyCutoff:'strictly earlier race dates; no same-day or future outcomes',asOfAvailabilityProven:false,
      historyBasis:'official escape wins by actual course one, six complete finishers and starts, no refunds',minimumVenueSamples:MIN_HISTORY,
      selection:'saved grounded candidate pool; preserve head allocation, independent tickets and total point count; saved priority first, venue escape pair frequency only breaks equal priority',
      control:'same reselection without venue history; preserve saved order on equal priorities',stake:'hypothetical 100 yen per ticket, not actual purchases',
      limitation:'Earlier-date historical results were assembled retrospectively, not captured inside the original forecast. No claim of Biyori data import or forward validation.'},
    diagnostics:{...diagnostics,selectedRaces:selected.length,historicalEscapeRaces:historical.length,excluded,pending:pending.length},
    total:summarize(rows),historyChangedSubset:summarize(rows.filter(r=>r.historyChangedControl)),byMethod:groups('method'),
    byVenue:Array.from({length:24},(_,i)=>{const jcd=String(i+1).padStart(2,'0');return {jcd,...summarize(rows.filter(r=>r.jcd===jcd))};}),rows,pending};
}
function main(root=process.cwd()) {
  const {assess}=require('./build-race-review-progress');
  const {chooseOfficialResult}=require('./audit-escape-main.cjs');
  const diagnostics={excludedSources:{},inputFiles:[]}, selected=new Map(), historical=[], results=new Map();
  const read=file=>{const raw=fs.readFileSync(path.join(root,file));diagnostics.inputFiles.push({path:file,sha256:hash(raw)});return JSON.parse(raw);};
  const draft=path.join(root,'data/note-drafts');
  for (const date of fs.readdirSync(draft).filter(x=>/^\d{8}$/.test(x)).sort()) {
    for (const filename of fs.readdirSync(path.join(draft,date)).filter(x=>x.endsWith('.json')).sort()) {
      const sourcePath=`data/note-drafts/${date}/${filename}`, raw=fs.readFileSync(path.join(root,sourcePath)), sha=hash(raw), b=JSON.parse(raw);
      if (b.version!=='note-draft-bundle-v1' || b.record?.source==='independent-watch') {inc(diagnostics.excludedSources,'non-normal');continue;}
      const a=assess(b);
      if (a.reason) {inc(diagnostics.excludedSources,a.reason);continue;}
      if (filename!==`${b.record.raceKey}-${sha}.json`) {inc(diagnostics.excludedSources,'source-hash-mismatch');continue;}
      const r=b.record, courses=courseMap(r.prediction.preRaceConditions?.boats,true);
      const compact={raceKey:r.raceKey,date:r.date,jcd:r.jcd,method:a.method,selectedAt:r.selectedAt,sourcePath,sourceSha256:sha,
        baseline:a.row.prediction.practicalTickets,pool:a.row.prediction.candidate24Tickets,evidence:a.row.practicalSelectionEvidence,courses};
      const old=selected.get(r.raceKey);
      if (!old || a.saved>Date.parse(old.selectedAt) || (a.saved===Date.parse(old.selectedAt) && sha<old.sourceSha256)) selected.set(r.raceKey,compact);
    }
  }
  if (!selected.size) throw new Error('No eligible immutable normal bundles; research input unavailable');
  const lastDate=[...selected.values()].map(r=>r.date).sort().at(-1);
  const directory=path.join(root,'data/results');
  for (const filename of fs.readdirSync(directory).filter(x=>/^\d{8}\.json$/.test(x) && x.slice(0,8)<=lastDate).sort()) {
    const data=read(`data/results/${filename}`);
    if (!Array.isArray(data.races)) throw new Error(`Invalid official daily file: ${filename}`);
    for (const r of data.races) {
      if (input.raceKey(r)?.slice(0,8)!==filename.slice(0,8)) {inc(diagnostics.excludedSources,'result-date-mismatch');continue;}
      const h=historicalRace(r); if(h)historical.push(h);
      const key=input.raceKey(r); if(selected.has(key)) results.set(key,chooseOfficialResult(results.get(key),r));
    }
  }
  const ledger='data/stats/race-review-results.json';
  if (fs.existsSync(path.join(root,ledger))) for(const r of Object.values(read(ledger).races||{})) {
    const key=input.raceKey(r); if(selected.has(key)) results.set(key,chooseOfficialResult(results.get(key),r));
  }
  const report=build([...selected.values()].sort((a,b)=>a.raceKey.localeCompare(b.raceKey)),historical,results,diagnostics);
  const out=path.join(root,'data/stats/escape-partner-history-research.json');
  fs.mkdirSync(path.dirname(out),{recursive:true}); const tmp=out+'.tmp'; fs.writeFileSync(tmp,JSON.stringify(report)+'\n');fs.renameSync(tmp,out);
  console.log(JSON.stringify({version:VERSION,total:report.total,historyChangedSubset:report.historyChangedSubset,diagnostics:{...report.diagnostics,inputFiles:report.diagnostics.inputFiles.length}}));
  return report;
}
if(require.main===module)main();
module.exports={VERSION,courseMap,historicalRace,historyBefore,rankedCandidates,preservePairCoverage,select,missStage,compareSelections,summarize,build,main};
