'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const c=require('./compare-escape-frozen.cjs'), audit=require('./audit-escape-main.cjs');
const pending={source:'boatrace-official',resultAvailable:false};
const settled={...pending,resultAvailable:true,trifecta:{combination:'1-2-3',payout:980}};
assert.equal(c.chooseResult(pending,settled),settled);
assert.equal(c.chooseResult(settled,pending),settled);
assert.equal(c.chooseResult(pending,{...settled,source:'unofficial'}),pending);
assert.equal(c.chooseResult({...pending,status:'void'},settled).status,'void');
assert.equal(c.chooseResult({...settled,trifecta:{combination:'1-2-3'}},settled),settled);
assert.equal(audit.resultOf(c.chooseResult(pending,{...settled,refund:true})).excluded,'refund-or-void');
assert.equal(c.totals([],'current').hitRate,null);
const row={current:{tickets:['1-2-3','4-1-2']},previous:{tickets:['1-2-3','4-1-2']},candidate:{tickets:['4-1-2','1-3-2']},result:audit.resultOf(settled)};
assert.deepEqual(c.totals([row],'current'),{races:1,hits:1,stake:200,returned:980,hitRate:100,recoveryRate:490});
assert.equal(c.totals([row],'candidate').returned,0);
assert.equal(c.totals([{...row,result:{excluded:'refund-or-void'}}],'current').races,0);
const replay={head:1,tickets:['1-2-3'],scenarios:[{type:'escape',score:80}]};
const saved={savedHead:1,savedTickets:['1-2-3'],savedScenarios:[{type:'escape',score:80}]};
assert.equal(c.checkReplay(saved,replay),'');
assert.equal(c.checkReplay(saved,{...replay,head:4}),'baseline-head-mismatch');
assert.equal(c.checkReplay(saved,{...replay,tickets:['1-3-2']}),'baseline-tickets-mismatch');
assert.equal(c.checkReplay(saved,{...replay,scenarios:[{type:'escape',score:81}]}),'baseline-scenarios-mismatch');
const e={version:'escape-evaluation-evidence-v1',historyStatus:'captured',resultUsedForGeneration:false,sourceFetchedAt:'2026-09-22T01:00:00Z',aiCoreVersion:'ai-core-v4.8.6-escape-skill-role',entries:Array(6).fill({}),beforeInfo:Array(6).fill({}),startExhibition:Array(6).fill({}),raceScenarios:{scenarios:[]}};
const record={raceKey:'20260922-06-12',date:'20260922',jcd:'06',raceNo:12,selectedAt:'2026-09-22T01:01:00Z',deadlineAt:'2026-09-22T01:20:00Z',prediction:{practicalTickets:['1-2-3'],mainSheet:{honmei:{boatNo:1}},preRaceConditions:{schemaVersion:4,sourceTiming:'pre_deadline',officialResultUsed:false,source:'boatrace-official',sourceFetchedAt:e.sourceFetchedAt,escapeEvaluationEvidence:e}}};
record.prediction.preRaceConditions.dataAvailability={officialCourses:6,exhibitionST:6,exhibitionTime:6};
const before=JSON.stringify(record),s=c.snapshot(record,'test');assert(s.row);s.row.conditions.escapeEvaluationEvidence.entries[0].test=true;assert.equal(JSON.stringify(record),before);
const incomplete=structuredClone(record);incomplete.prediction.preRaceConditions.dataAvailability.exhibitionST=5;
assert.equal(c.snapshot(incomplete,'test').reason,'official-exhibition-incomplete');
assert.equal(c.snapshot({...record,selectedAt:record.deadlineAt},'test').reason,'captured-at-or-after-deadline');
assert.equal(c.snapshot({prediction:{}},'test').reason,'frozen-history-unavailable');
const modern=structuredClone(record);
modern.prediction.preRaceConditions.escapeEvaluationEvidence.aiCoreVersion='ai-core-fixture-current';
modern.prediction.preRaceConditions.escapeEvaluationEvidence.historyContext={racers:[]};
modern.prediction.preRaceConditions.escapeEvaluationEvidence.raceInfo={deadline:'10:20'};
modern.prediction.preRaceConditions.weather={};
modern.prediction.preRaceConditions.escapeEvaluationEvidence.entries[0].officialStartRank={status:'available',byCourse:{1:2.5}};
assert.equal(c.snapshot(modern,'test').reason,'different-core-generation');
assert(c.snapshot(modern,'test',{requiredCoreVersion:'ai-core-fixture-current'}).row);
assert.equal(c.snapshot(record,'test',{requiredCoreVersion:'ai-core-fixture-current'}).reason,'different-core-generation');
assert.equal(c.snapshot(record,'test',{requiredCoreVersion:''}).reason,'different-core-generation');
assert.deepEqual(c.snapshot(modern,'test',{requiredCoreVersion:'ai-core-fixture-current'}).row.conditions.escapeEvaluationEvidence.entries[0].officialStartRank,{status:'available',byCourse:{1:2.5}});
assert.throws(()=>c.transformCore('unrelated','four-inner-guard'));
assert.throws(()=>c.transformCore('unrelated','previous-role'));
// Existing three-course thresholds only; actual-course boat variables, no boat1 hardcoding.
const mini='let fourAttackScore=80; const fourNo=5,oneNo=2; const hasComparison=()=>true; const relationEdge=()=>EDGE; const frameMovementAdjustment=()=>0;\n  fourAttackScore += frameMovementAdjustment(fourNo);\nreturn fourAttackScore;';
for(const [edge,expected] of [[-10,66],[-6,71],[-5,80],[10,80]])assert.equal(Function(c.transformCore(mini.replace('EDGE',String(edge)),'four-inner-guard'))(),expected);
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'js/ai-core.js'),'utf8');
c.runner(root,'current');c.runner(root,'previous-role');c.runner(root,'four-inner-guard');
assert.equal(fs.readFileSync(path.join(root,'js/ai-core.js'),'utf8'),source);
assert.equal(c.meaningful({generatedAt:'before',sourceCommit:'a',resultAttempts:[],rows:[1]}),c.meaningful({generatedAt:'after',sourceCommit:'b',resultAttempts:[2],rows:[1]}));
assert.notEqual(c.meaningful({rows:[1]}),c.meaningful({rows:[2]}));
async function extendedTests() {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'chappy-frozen-replay-api-'));
  try {
    fs.mkdirSync(path.join(temp,'js'));
    for(const name of c.MODULES)fs.writeFileSync(path.join(temp,'js',name+'.js'),'');
    fs.writeFileSync(path.join(temp,'js/theory-input.js'),'globalThis.ChappyTheoryInput={VERSION:"fixture-input"};');
    fs.writeFileSync(path.join(temp,'js/boat-identity.js'),'globalThis.ChappyBoatIdentity={inspectEntries(){return {fixture:true};}};');
    fs.writeFileSync(path.join(temp,'js/ai-core.js'),'globalThis.ChappyAICoreVersion="ai-core-fixture-current";');
    fs.writeFileSync(path.join(temp,'js/prediction.js'),`function createPrediction(data) {
      return { mainSheet:{honmei:{boatNo:1}},aiCore:{raceScenarios:{scenarios:[]},racerSkillTheory:{ranking:[]},courseMapping:{byBoatNo:{1:1}}},data };
    }`);
    const selectionSource=`globalThis.ChappyPracticalSelection={select(p,options){
      return { tickets:[{ticket:"1-2-3",selectionTier:"fixture",label:"original-label",option:options.label,
        clock:Date.now(),clockIso:new Date().toISOString(),originalMetric:p.data.originalExhibition?.marker,
        savedRank:p.data.entries[0]?.officialStartRank?.byCourse?.[1]}],candidateDecisions:[{ticket:"1-2-3"}],expansionSummary:{fixture:true},
        evidence:{branches:[{id:"b1",ticket:"1-2-3",kind:"independent",source:"fixture",attackerBoatNo:1,phaseEvidence:{kind:"alternate-head"},privateUnneededField:"not projected"}]}};
    }};`;
    fs.writeFileSync(path.join(temp,'js/practical-selection.js'),selectionSource);
    const frozen=c.snapshot(modern,'test',{requiredCoreVersion:'ai-core-fixture-current'}).row;
    frozen.conditions.escapeEvaluationEvidence.originalExhibition={marker:'preserved-source'};
    const options={label:'passed-through'};
    const run=c.runner(temp,'current',{freezeClock:true,includeSelectionEvidence:true,
      transformSelection:text=>text.replace('original-label','transformed-label')});
    const replayed=run(frozen,options);
    assert.equal(replayed.coreVersion,'ai-core-fixture-current');
    assert.equal(replayed.selectionRows[0].clock,Date.parse(frozen.selectedAt));
    assert.equal(replayed.selectionRows[0].clockIso,new Date(frozen.selectedAt).toISOString());
    assert.equal(replayed.selectionRows[0].label,'transformed-label');
    assert.equal(replayed.selectionRows[0].option,'passed-through');
    assert.equal(replayed.selectionRows[0].originalMetric,'preserved-source');
    assert.equal(replayed.selectionRows[0].savedRank,2.5);
    assert.deepEqual(replayed.selectionBranches,[{id:'b1',ticket:'1-2-3',kind:'independent',source:'fixture',attackerBoatNo:1,phaseKind:'alternate-head'}]);
    assert.deepEqual(replayed.courseMapping,{byBoatNo:{1:1}});
    assert.deepEqual(options,{label:'passed-through'});
    assert.equal(fs.readFileSync(path.join(temp,'js/practical-selection.js'),'utf8'),selectionSource);
    assert.throws(()=>run({...frozen,selectedAt:frozen.deadlineAt}),/Invalid frozen replay clock/);
    assert.throws(()=>run({...frozen,deadlineAt:''}),/Invalid frozen replay clock/);
    assert.equal(c.runner(temp,'current')(frozen).selectionRows,undefined);
    fs.mkdirSync(path.join(temp,'data/predictions'),{recursive:true});
    fs.mkdirSync(path.join(temp,'data/results'),{recursive:true});
    const legacy=structuredClone(record);legacy.raceKey='20260922-06-11';legacy.raceNo=11;
    const predictionsFile=path.join(temp,'data/predictions/20260922.json');
    const savedInput=JSON.stringify({date:'20260922',predictions:[modern,legacy],verificationPredictions:[]});
    fs.writeFileSync(predictionsFile,savedInput);
    fs.writeFileSync(path.join(temp,'data/results/20260922.json'),JSON.stringify({races:[{...settled,date:'20260922',jcd:'06',raceNo:12}]}));
    const loaded=await c.loadFrozenInputs(temp,'20260922',{requiredCoreVersion:'ai-core-fixture-current',refreshResults:false,
      fetchResult(){throw Error('network must not be called');}});
    assert.equal(loaded.chosen.size,1);
    const pointer=loaded.chosen.get('20260922-06-12').sourcePointer;
    assert.equal(pointer.path,'data/predictions/20260922.json');
    assert.equal(pointer.array,'predictions');
    assert.equal(pointer.index,0);
    assert.equal(pointer.sha256,loaded.files[0].sha256);
    assert.equal(pointer.recordJsonSha256,require('node:crypto').createHash('sha256').update(JSON.stringify(modern)).digest('hex'));
    assert.equal(loaded.exclusions['different-core-generation'],1);
    assert.equal(loaded.files.length,2);
    assert.equal(loaded.resultAttempts.length,0);
    assert.equal(audit.resultOf(loaded.results.get('20260922-06-12')).actual,'1-2-3');
    assert.equal(fs.readFileSync(predictionsFile,'utf8'),savedInput);
  } finally { fs.rmSync(temp,{recursive:true,force:true}); }
  console.log('Frozen escape comparison: timing, generation isolation, saved inputs, baseline equality, immutable sources, refunds, official fallback and isolated runners passed');
}
extendedTests().catch(error=>{console.error(error);process.exitCode=1;});
