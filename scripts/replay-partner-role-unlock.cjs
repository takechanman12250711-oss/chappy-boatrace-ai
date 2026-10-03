"use strict";
// Read-only paired replay. Results are joined only AFTER the two worker processes finish.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const Module = require("node:module");
const { revise, instrument, VERSION } = require("./partner-role-unlock.cjs");
const policy = require("./partner-role-cohort.json");
const { buildReplayInput } = require("./partner-role-replay-input.cjs");
const ROOT = path.resolve(__dirname, "..");
const hash = value => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const clone = x => JSON.parse(JSON.stringify(x));
function exact(list) {
  if (!Array.isArray(list)) return [];
  const values = list.map(x => typeof x === "string" ? x : x?.ticket);
  return [...new Set(values.filter(x => typeof x === "string" && /^[1-6]-[1-6]-[1-6]$/.test(x) && new Set(x.split("-")).size === 3))];
}
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
function sameBudget(base,candidate) { return [...new Set([...candidate,...base])].slice(0,base.length); }

function worker(mode, sourceFile, outputFile) {
  const corePath = path.join(ROOT,"js/ai-core.js"), bytes = fs.readFileSync(corePath);
  const blob = crypto.createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (blob !== policy.coreBlob) throw Error("core-version-mismatch");
  global.window = global;
  global.document = { addEventListener() {} };
  global.addEventListener = () => {};
  global.fetch = () => { throw Error("Network disabled in historical replay"); };
  let roleCalls = 0;
  global.__partnerRoleRevise = (legacy,scenario) => { roleCalls++; return revise(legacy,scenario); };
  const originalExtension = Module._extensions[".js"];
  if (mode === "candidate") {
    Module._extensions[".js"] = function(mod,filename) {
      if (filename === corePath) return mod._compile(instrument(fs.readFileSync(filename,"utf8")),filename);
      return originalExtension(mod,filename);
    };
  }
  try { require(corePath); } finally { Module._extensions[".js"] = originalExtension; }
  require("../js/history-insights");
  require("../js/motor-maintenance-insights");
  require("../js/theory-input");
  require("../js/local-water-v2-tiebreak");
  require("../js/prediction");
  require("../js/prediction-simple-evaluation");
  const selector = require("../js/three-course-escape-rescue-fixed5").install(require("../js/practical-selection"));
  const tasks = JSON.parse(fs.readFileSync(sourceFile,"utf8")), rows=[];
  for (const task of tasks) {
    const before=roleCalls;
    try {
      const data = clone(task.data);
      const prediction = global.createPrediction(data);
      const selected = selector.select(prediction);
      const main = prediction?.aiCore?.raceScenarios?.mainScenario;
      const role = prediction?.aiCore?.holdPickupTheory || prediction?.holdPickupTheory;
      rows.push({ raceKey:task.raceKey, tickets:exact(selected?.tickets),
        status:selected?.status || null, head:Number(main?.headBoatNo || main?.attackerBoatNo || 0),
        scenario:main?.type || null, roleCalls:roleCalls-before,
        revision:role?.partnerRevision || null,
        secondCandidates:role?.secondCandidates?.map(r=>({boatNo:r.boatNo,score:r.score})),
        thirdCandidates:role?.thirdCandidates?.map(r=>({boatNo:r.boatNo,score:r.score})) });
    } catch(error) { rows.push({raceKey:task.raceKey,error:String(error.stack||error).slice(0,1400)}); }
  }
  if (hash(fs.readFileSync(corePath)) !== hash(bytes)) throw Error("production-source-mutated");
  fs.writeFileSync(outputFile,JSON.stringify({mode,coreBlob:blob,inputSha256:hash(fs.readFileSync(sourceFile)),rows},null,2)+"\n");
}

function main(outDir) {
  fs.mkdirSync(outDir,{recursive:true});
  const input = require("./analysis-input-contract");
  const source = require("./eight-ticket-promotion-report-source.cjs");
  const ledger = require("./build-continuous-performance-ledger.cjs");
  const evaluator = require("./final-ticket-candidate-evaluator.cjs");
  const hitReport = require("./build-hit-first-practical-report.cjs");
  const keySet=new Set(policy.raceKeys), days=[...new Set([...policy.raceKeys.map(x=>x.slice(0,8)),...policy.confirmationDates])].sort();
  const records=new Map(), sources=[],sourceErrors=[];
  for (const date of days) {
    try { const day=source.readDay(ROOT,date);
      for (const r of input.mergePredictionSources(day.data.predictions,day.data.verificationPredictions)) records.set(input.raceKey(r),r);
      sources.push({date,source:day.source,updatedAt:day.data.updatedAt});
    } catch(error) { sourceErrors.push({date,error:String(error.message)}); }
  }
  const wanted=[...records.entries()].filter(([k])=>keySet.has(k)||policy.confirmationDates.includes(k.slice(0,8))).sort(([a],[b])=>a.localeCompare(b));
  const projection=policy.raceKeys.map(raceKey=>{const r=records.get(raceKey);return {raceKey,selectedAt:r?.selectedAt||r?.capturedAt||"",base:ledger.practicalTickets(r?.prediction||r)};});
  const projectionSha256=hash(projection), frozenSourceMatches=projectionSha256===policy.frozenProjectionSha256;
  const tasks=[], rejected=[];
  for(const [raceKey,r] of wanted) {
    const timingError=input.preDeadlineReason(r);
    if(timingError){rejected.push({raceKey,reason:timingError});continue;}
    const p=r.prediction||r, s=p.preRaceConditions||r.preRaceConditions;
    if(!Array.isArray(s?.boats)||s.boats.length!==6){rejected.push({raceKey,reason:"missing-six-boat-pre-race-input"});continue;}
    const saved=exact(ledger.practicalTickets(p));
    if(!saved.length||saved.length>10){rejected.push({raceKey,reason:"no-valid-saved-practical-tickets"});continue;}
    // Read the native entry/history snapshot saved BEFORE the race. Never later data.
    let data;
    try { data=buildReplayInput(r); }
    catch (error) { rejected.push({raceKey,reason:error.message}); continue; }
    tasks.push({raceKey,data});
  }
  const inputFile=path.join(outDir,"worker-inputs.json");
  fs.writeFileSync(inputFile,JSON.stringify(tasks));
  const outputs={};
  for(const mode of ["baseline","candidate"]){
    const file=path.join(outDir,`${mode}.json`);
    const child=spawnSync(process.execPath,[__filename,"--worker",mode,inputFile,file],{cwd:ROOT,encoding:"utf8",timeout:420000,maxBuffer:8*1024*1024});
    fs.writeFileSync(path.join(outDir,`${mode}.log`),(child.stdout||"")+(child.stderr||""));
    if(child.error||child.status!==0) throw Error(`${mode}-worker-failed: ${child.error?.message||child.status}`);
    outputs[mode]=JSON.parse(fs.readFileSync(file,"utf8"));
  }
  const official=input.collectOfficialResults(path.join(ROOT,"data/results"),new Set(wanted.map(([k])=>k)));
  const byMode=Object.fromEntries(Object.entries(outputs).map(([mode,out])=>[mode,new Map(out.rows.map(r=>[r.raceKey,r]))]));
  const strict=[],recalculated=[],mismatches=[],failures=[];
  for(const task of tasks){
    const key=task.raceKey,r=records.get(key),a=byMode.baseline.get(key),b=byMode.candidate.get(key),o=official.get(key);
    const saved=exact(ledger.practicalTickets(r.prediction||r));
    const common={raceKey:key,group:keySet.has(key)?"frozen100":"additional-20260927",saved,selectedAt:r.selectedAt||r.capturedAt};
    if(a?.error||b?.error){failures.push({...common,reason:"replay-error",baselineError:a?.error,candidateError:b?.error});continue;}
    if(!a?.tickets?.length||a.tickets.length>10||!b?.tickets?.length||b.tickets.length>10){failures.push({...common,reason:"invalid-replayed-ticket-count",baseline:a?.tickets,candidate:b?.tickets});continue;}
    if(a.head!==b.head||a.scenario!==b.scenario){failures.push({...common,reason:"unexpected-main-scenario-change"});continue;}
    const originalMatches=same(a.tickets,saved);
    if(!originalMatches)mismatches.push({...common,replayed:a.tickets,head:a.head,scenario:a.scenario});
    const actual=o?input.actualTicket(o):"",payout=o?evaluator.payout(o):null;
    if(!actual||!Number.isSafeInteger(payout)||payout<=0){failures.push({...common,reason:"missing-official-settlement"});continue;}
    const candidate=sameBudget(a.tickets,b.tickets);
    const row={...common,base:a.tickets,candidate,rawCandidate:b.tickets,actual,payout,
      originalMatches,mainHead:a.head,mainScenario:a.scenario,revision:b.revision,
      roleCalls:b.roleCalls,baselineSecond:a.secondCandidates,candidateSecond:b.secondCandidates,
      baselineThird:a.thirdCandidates,candidateThird:b.thirdCandidates,
      budgetFallbackTickets:candidate.filter(t=>!b.tickets.includes(t)),rawCountDifference:b.tickets.length-a.tickets.length};
    recalculated.push(row);
    if(originalMatches && (common.group!=="frozen100"||frozenSourceMatches)) strict.push(row);
  }
  function comparisons(rows){const out={all:hitReport.compare(rows)};for(const group of ["frozen100","additional-20260927"])out[group]=hitReport.compare(rows.filter(r=>r.group===group));return out;}
  const report={version:VERSION,generatedAt:new Date().toISOString(),productionChanged:false,automaticApplication:false,adoptionStatus:"NOT_APPROVED",
    policy,policySha256:hash(policy),candidateSourceSha256:hash(fs.readFileSync(path.join(__dirname,"partner-role-unlock.cjs"))),
    sources,sourceErrors,projectionSha256,frozenSourceMatches,taskCount:tasks.length,rejected,
    strictSavedReplay:comparisons(strict),sameInputRecalculation:comparisons(recalculated),
    strictRows:strict,recalculatedRows:recalculated,mismatches,failures,
    scopeNotes:["No Mika ticket template, no change to main-scenario/head calculation.",
      "Saved native entries/history are restored from preRaceConditions.escapeEvaluationEvidence; compact boats alone are insufficient.",
      "Saved-input baseline must reproduce saved ticket order before strict comparison.",
      "Recalculation-only comparison is diagnostic and cannot replace saved performance.",
      "Additional 20260927 observations are not certified pristine holdout data.",
      "Different raw ticket counts are budget-matched by a pre-fixed candidate-first/saved-order rule.",
      "No statistical or future hit-rate guarantee; no production adoption."]};
  fs.writeFileSync(path.join(outDir,"partner-role-report.json"),JSON.stringify(report,null,2)+"\n");
  // Avoid distributing full prediction source records; output contains selected evidence only.
  fs.unlinkSync(inputFile);
  console.log(JSON.stringify({taskCount:tasks.length,frozenSourceMatches,strictSavedReplay:report.strictSavedReplay,sameInputRecalculation:report.sameInputRecalculation,mismatches:mismatches.length,failures:failures.length},null,2));
}
if(require.main===module){if(process.argv[2]==="--worker")worker(process.argv[3],process.argv[4],process.argv[5]);else main(path.resolve(process.argv[2]||path.join(ROOT,"artifacts/partner-role-unlock")));}
module.exports={sameBudget};
