'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const contract=require('../js/forecast-reader-contract');
const source=fs.readFileSync(require.resolve('../js/forecast-reader-contract'),'utf8');
const context={window:{}};vm.runInNewContext(source,context);const browser=context.window.ChappyForecastReaderContract;
const input=()=>({centralTickets:['1-2-3','1-2-4'],additionalTickets:['1-2-3','1-2-5','2-1-3'],holeTickets:['2-1-3','5-1-2'],referenceTickets:['1-2-3','4-1-2']});
const prediction=()=>({mainSheet:{honmei:{boatNo:1},tickets:['1-2-3','1-2-4']},verificationEvidence:{mainScenario:{headBoatNo:1,attackerBoatNo:1,attackerCourse:1,type:'escape',label:'1号艇逃げ'}},preRaceConditions:{boats:[{boatNo:1,course:1,courseOfficial:true,avgST:.14,exhibitionST:.14,exhibitionStartMarker:"",exhibitionTime:6.9},{boatNo:2,course:2,courseOfficial:true,exhibitionST:.06,exhibitionStartMarker:""}]}});
test('browser and note use identical grouping and explanation bytes',()=>{
  assert.equal(JSON.stringify(browser.groupTickets(input())),JSON.stringify(contract.groupTickets(input())));
  assert.equal(browser.explanation(prediction()).text,contract.explanation(prediction()).text);
});
test('each ticket appears once; source reference accounting and order are retained',()=>{
  const data=input(),before=JSON.stringify(data),r=contract.groupTickets(data);
  assert.deepEqual(r.groups.map(g=>g.tickets),[['1-2-3','1-2-4'],['1-2-5','2-1-3'],['5-1-2'],['4-1-2']]);
  assert.equal(r.primaryCount,5);assert.equal(r.allCount,6);assert.equal(r.referenceOriginalCount,2);assert.equal(r.referenceOverlapCount,1);
  assert.equal(JSON.stringify(data),before);
});
test('invalid, missing, empty or duplicate main selection cannot promote extra candidates',()=>{
  for(const centralTickets of [undefined,[],['1-1-2'],['1-2-3','1-2-3']]){
    assert.throws(()=>contract.groupTickets({...input(),centralTickets}),/invalid|missing/);
  }
});
test('missing values stay missing and unofficial neighbors are not asserted',()=>{
  const p=prediction();p.preRaceConditions.boats[0].avgST=null;p.preRaceConditions.boats[1].courseOfficial=false;
  const r=contract.explanation(p);assert.doesNotMatch(r.text,/平均ST|隣の|0.00/);assert.match(r.text,/展示STは0.14/);
});
test('contradictory, mixed or unknown formal heads cannot produce a confirmed explanation',()=>{
  for(const change of [p=>p.verificationEvidence.mainScenario.headBoatNo=2,p=>p.mainSheet.tickets.push('2-1-3'),p=>p.verificationEvidence.mainScenario.type='unknown']){
    const p=prediction();change(p);assert.equal(contract.explanation(p).verified,false);
  }
});
test('duplicate identities suppress ambiguous facts and result/odds are never read',()=>{
  const p=prediction();p.preRaceConditions.boats.push({...p.preRaceConditions.boats[0],avgST:.01});
  Object.defineProperty(p,'result',{get(){throw Error('result leakage');}});
  Object.defineProperty(p,'odds',{get(){throw Error('odds leakage');}});
  assert.equal(contract.explanation(p).verified,false);
});

test('reference footer distinguishes original ledger count from displayed additions',()=>{
  const model=contract.groupTickets(input());
  assert.equal(contract.referenceSummary(model),'参考予想は元の台帳で2点（上記と重複1点、追加表示1点）。別集計です。');
  const allOverlap=contract.groupTickets({...input(),referenceTickets:['1-2-3']});
  assert.equal(allOverlap.groups.some(g=>g.label===contract.REFERENCE),false);
  assert.match(contract.referenceSummary(allOverlap),/追加表示0点/);
});
test('scenario course and actual boat mapping agree, including a changed entry order',()=>{
  const p=prediction();p.mainSheet={honmei:{boatNo:3},tickets:['3-1-2']};
  p.verificationEvidence.mainScenario={headBoatNo:3,attackerBoatNo:3,attackerCourse:2,type:'sashi',label:'2コース差し'};
  p.preRaceConditions.boats=[{boatNo:3,course:2,courseOfficial:true},{boatNo:2,course:3,courseOfficial:true}];
  assert.equal(contract.explanation(p).verified,true);
  p.preRaceConditions.boats[0].course=3;
  assert.equal(contract.explanation(p).verified,false);
});
test('missing, contradictory or duplicate official courses prevent verified scenario prose',()=>{
  for(const change of [p=>delete p.verificationEvidence.mainScenario.attackerCourse,p=>p.verificationEvidence.mainScenario.attackerCourse=4,p=>p.preRaceConditions.boats[0].courseOfficial=false,p=>p.preRaceConditions.boats.push({boatNo:6,course:1,courseOfficial:true})]){
    const p=prediction();change(p);assert.equal(contract.explanation(p).verified,false);
  }
});

test('exhibition F/L marks survive formatting in both shared runtimes',()=>{
 const p=prediction();p.preRaceConditions.boats[0].exhibitionST=.02;p.preRaceConditions.boats[0].exhibitionStartMarker='F';
 p.preRaceConditions.boats[1].exhibitionST=.99;p.preRaceConditions.boats[1].exhibitionStartMarker='L';
 const r=contract.explanation(p);assert.match(r.text,/展示STはF0.02/);assert.match(r.text,/隣の2号艇の展示STはL0.99/);
 assert.doesNotMatch(r.text,/展示STは0.02|展示STは0.99/);
 assert.equal(browser.explanation(p).text,r.text);
});
test('missing, conflicting or unknown exhibition flags cannot be shown as clean positive ST',()=>{
 for(const change of [b=>delete b.exhibitionStartMarker,b=>b.exhibitionStartMarker='X',
  b=>b.exhibitionStartMarker=null,b=>b.startExhibition={st:.14,marker:'F'},b=>b.startExhibition={st:.06,marker:''}]){
  const p=prediction();change(p.preRaceConditions.boats[0]);
  const r=contract.explanation(p);assert.doesNotMatch(r.text,/展示ST|隣の/);assert.match(r.text,/平均STは0.14/);
 }
});
test('nested saved markers and missing numeric ST remain factual without inventing zero',()=>{
 assert.equal(contract.exhibitionStText({exhibitionST:.02,startExhibition:{st:.02,marker:'F'}}),'F0.02');
 assert.equal(contract.exhibitionStText({exhibitionST:-.02,exhibitionStartMarker:'F'}),'F0.02');
 assert.equal(contract.exhibitionStText({exhibitionST:-.02,exhibitionStartMarker:''}),null);
 assert.equal(contract.exhibitionStText({exhibitionST:null,exhibitionStartMarker:'L'}),'L（数値未取得）');
 assert.equal(contract.exhibitionStText({exhibitionST:null,exhibitionStartMarker:''}),null);
 assert.equal(contract.exhibitionStText({exhibitionST:'F0.02',exhibitionStartMarker:'F'}),null);
});

test('saved Toda case exhibition signs remain attached to the formal third-course head and its neighbor',()=>{
 // Minimal projection of source 0cff0b53175acfe1544d86d36817007dd8e97991d90b55de0fc6228288251a40.
 const p={mainSheet:{honmei:{boatNo:3},tickets:['3-1-5']},
  verificationEvidence:{mainScenario:{headBoatNo:3,attackerBoatNo:3,attackerCourse:3,type:'threeAttack',label:'3コース攻め'}},
  preRaceConditions:{boats:[{boatNo:3,course:3,courseOfficial:true,exhibitionST:.02,exhibitionStartMarker:'F'},
   {boatNo:4,course:4,courseOfficial:true,exhibitionST:.03,exhibitionStartMarker:'F'}]}};
 const r=contract.explanation(p);assert.equal(r.verified,true);
 assert.match(r.text,/3号艇の展示STはF0.02/);assert.match(r.text,/隣の4号艇の展示STはF0.03/);
 assert.equal(browser.explanation(p).text,r.text);
});

test('browser and Node reject unknown saved purchase decisions instead of inventing a main recommendation',()=>{
 const p=structuredClone(require('../scripts/fixtures/reader-presentation.json').bundle.record.prediction);
 for(const decision of [{status:'unknown'},{}, {status:'unavailable'}]){
  p.practicalSelection={tickets:structuredClone(p.practicalTickets),purchaseDecision:decision};
  const before=JSON.stringify(p),a=contract.fromPrediction(p),b=browser.fromPrediction(p);
  assert.equal(a.status,'unavailable');assert.equal(a.allCount,0);assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(p),before);
 }
});

const rescueFixture=require('../scripts/fixtures/reader-saved-rescues-derived.json');
function savedCase(offPool=false){
 const b=structuredClone(rescueFixture.savedBundle),p=b.record.prediction;
 // Contract variant only: exercise the saved-wrapper off-pool bridge while
 // the derived fixture itself retains the real original pool membership.
 if(offPool)for(const rows of [p.mainSheet.tickets,p.mainSheet.coverTickets,p.mainSheet.flowTickets,p.manshuSheet.tickets]){
  const index=rows.indexOf('1-3-4');if(index>=0)rows.splice(index,1);
 }
 return {b,p,selection:{tickets:p.practicalTickets,purchaseDecision:{status:'unchanged'}},
  options:{record:b.record,practicalSelectionEvidence:b.record.practicalSelectionEvidence,copies:[b.baselinePracticalTickets,b.article.practicalTickets]}};
}
test('derived rescue fixture binds the original source and the exact contract projection',()=>{
 const {createHash}=require('node:crypto');
 assert.equal(rescueFixture.origins.saved.sourceSha256,'0cff0b53175acfe1544d86d36817007dd8e97991d90b55de0fc6228288251a40');
 assert.equal(createHash('sha256').update(JSON.stringify({savedBundle:rescueFixture.savedBundle,livePrediction:rescueFixture.livePrediction})).digest('hex'),rescueFixture.projectionSha256);
});
test('raw 124 and saved 134 replacements have identical pure browser/Node display provenance',()=>{
 const saved=savedCase();
 for(const {p,selection,options} of [{p:structuredClone(rescueFixture.livePrediction)},saved,savedCase(true)]){
  const before=JSON.stringify(p),a=contract.fromPrediction(p,selection,options),b=browser.fromPrediction(p,selection,options);
  assert.equal(a.status,'selected');assert.equal(JSON.stringify(a),JSON.stringify(b));
  assert.equal(a.centralTickets.at(-1),selection?'1-3-4':'1-2-4');
  assert.equal(a.centralTickets.length,selection?10:9);
  const proof=contract.savedRescueProof({prediction:p,selection:selection||p.practicalSelection,finalRows:selection?.tickets||p.practicalSelection.tickets,...(options?{record:options.record,evidence:options.practicalSelectionEvidence,copies:options.copies}:{})});
  assert.equal(proof.purpose,'saved-replacement-display-provenance');
  assert.deepEqual(proof.after,a.centralTickets);assert.notEqual(proof.before.at(-1),proof.after.at(-1));
  proof.meta.version='output-only';proof.before.reverse();
  assert.equal(JSON.stringify(p),before,'returned provenance is detached from saved input');
 }
});
test('raw rescue guards reject missing, contradictory, unknown and non-single replacements in both runtimes',()=>{
 const key='fourKadoEscapeRescueFixed5';
 const changes=[
  p=>delete p.practicalSelection.candidateValidationEvidence,
  p=>delete p.practicalSelection.expansionSummary,
  p=>delete p.practicalSelection.tickets.at(-1)[key],
  p=>p.practicalSelection.expansionSummary[key].version='unknown',
  p=>p.practicalSelection.expansionSummary[key].targetLabel='3コース攻め',
  p=>p.practicalSelection.expansionSummary[key].ticket='6-5-4',
  p=>p.practicalSelection.expansionSummary[key].replacedTicket='6-5-4',
  p=>p.practicalSelection.expansionSummary[key].reason='changed',
  p=>p.practicalSelection.reason='changed',
  p=>p.practicalSelection.expansionSummary[key].index=0,
  p=>p.practicalSelection.expansionSummary[key].applied=false,
  p=>p.practicalSelection.tickets.at(-1)[key].version='unknown',
  p=>p.practicalSelection.tickets.at(-1).comment='changed',
  p=>p.practicalSelection.tickets.at(-1).category='別分類',
  p=>p.practicalSelection.tickets.at(-1).displayCategory='別分類',
  p=>p.practicalSelection.tickets.at(-1).selectionTier='候補補完',
  p=>p.practicalSelection.tickets.at(-1).evidenceQualified=false,
  p=>p.practicalSelection.tickets.at(-1).purchaseEligible=false,
  p=>p.practicalSelection.tickets.at(-1).expansionEligible=true,
  p=>p.practicalSelection.tickets.at(-1).priorityScore=90,
  p=>p.practicalSelection.tickets.at(-1).branchIds=['invented'],
  p=>p.practicalSelection.tickets.push({ticket:'2-1-5'}),
  p=>p.practicalSelection.tickets.reverse(),
  p=>{const rows=p.practicalSelection.tickets;[rows[0],rows[1]]=[rows[1],rows[0]];},
  p=>p.practicalSelection.candidateValidationEvidence.finalSelectedTickets.reverse(),
  p=>p.practicalSelection.candidateValidationEvidence.finalSelectedTickets[0]='1-2-4',
  p=>p.practicalSelection.candidateValidationEvidence.version='unknown',
  p=>p.practicalSelection.candidateValidationEvidence.status='invalid-or-unavailable',
  p=>p.practicalSelection.candidateValidationEvidence.resultUsedForGeneration=true,
  p=>p.practicalSelection.candidateValidationEvidence.observations=[],
  p=>p.practicalSelection.candidateValidationEvidence.diagnostic={},
  p=>p.practicalSelection.expansionSummary.threeCourseEscapeRescueFixed5={applied:true},
  p=>p.practicalSelection.tickets.at(-1).threeCourseEscapeRescueFixed5={applied:true},
  p=>p.verificationEvidence.mainScenario.label='3コース攻め',
  p=>{p.practicalTickets=structuredClone(p.practicalSelection.tickets);p.practicalTickets.at(-1)[key].index=0;}
 ];
 for(const change of changes){
  const p=structuredClone(rescueFixture.livePrediction);change(p);const before=JSON.stringify(p);
  const a=contract.fromPrediction(p),b=browser.fromPrediction(p);
  assert.equal(a.status,'unavailable',change.toString());assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(p),before);
 }
});
test('saved wrapper and source identity cannot be substituted, repaired or used as final qualification',()=>{
 const changes=[
  c=>c.options.practicalSelectionEvidence.raceKey='20261101-02-3',
  c=>c.options.practicalSelectionEvidence.selectedAt='2026-11-01T02:00:00Z',
  c=>c.options.practicalSelectionEvidence.selectionStatus='unknown',
  c=>c.options.practicalSelectionEvidence.reviewEvidence.method='a'.repeat(64),
  c=>c.options.practicalSelectionEvidence.reviewEvidence.officialResultUsedForPrediction=true,
  c=>c.options.record.reviewEvidence.predictionMode='after_deadline',
  c=>delete c.options.record.reviewEvidence,
  c=>c.options.practicalSelectionEvidence.productionChanged=true,
  c=>c.options.practicalSelectionEvidence.resultUsedForGeneration=true,
  c=>c.options.practicalSelectionEvidence.practicalTickets.reverse(),
  c=>c.options.record={...c.b.record,prediction:structuredClone(c.p)},
  c=>delete c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic,
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.purpose='final-qualification',
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.usableForPrediction=true,
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.resultUsedForGeneration=true,
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.version='unknown',
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.transformations.push({kind:'unknown'}),
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.transformations[0].kind='unknown',
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.observedFinalTickets.reverse(),
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.originalGeneratorSnapshot.status='invalid-or-unavailable',
  c=>c.options.practicalSelectionEvidence.candidateValidationEvidence.diagnostic.originalGeneratorSnapshot.diagnostic={},
  c=>c.b.baselinePracticalTickets.at(-1).threeCourseEscapeRescueFixed5.index=0,
  c=>c.b.article.practicalTickets.at(-1).threeCourseEscapeRescueFixed5.version='unknown'
 ];
 for(const change of changes){
  const c=savedCase(true);change(c);const before=JSON.stringify(c.b);
  const a=contract.fromPrediction(c.p,c.selection,c.options),b=browser.fromPrediction(c.p,c.selection,c.options);
  assert.equal(a.status,'unavailable',change.toString());assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(c.b),before);
 }
});
test('odds/result fields and added quote metadata never choose or requalify a saved replacement',()=>{
 const c=savedCase(true),base=contract.fromPrediction(c.p,c.selection,c.options);
 for(const rows of [c.p.practicalTickets,c.b.baselinePracticalTickets,c.b.article.practicalTickets]){
  rows.at(-1).threeCourseEscapeRescueFixed5.odds=9999;rows.at(-1).odds=1;
 }
 Object.defineProperty(c.p,'result',{get(){throw Error('result must not be used');}});
 Object.defineProperty(c.p,'odds',{get(){throw Error('odds must not be used');}});
 assert.deepEqual(contract.fromPrediction(c.p,c.selection,c.options),base);
 assert.equal(c.options.practicalSelectionEvidence.candidateValidationEvidence.status,'invalid-or-unavailable');
});

test('historical in-pool rescue tickets keep their original acceptance when old proof was not captured',()=>{
 const c=savedCase(),before=contract.fromPrediction(c.p,c.selection,c.options);
 delete c.b.record.practicalSelectionEvidence;
 const after=contract.fromPrediction(c.p,c.selection);
 assert.equal(after.status,'selected');assert.deepEqual(after,before);
 assert.equal(browser.fromPrediction(c.p,c.selection).status,'selected');
});

test('off-pool independent-scenario copies retain the same saved family in both runtimes',()=>{
 for(const reason of ['別頭の独立展開','残し艇を使う押さえ展開']){
  const p=structuredClone(require('../scripts/fixtures/reader-presentation.json').bundle.record.prediction);
  const row={ticket:'6-5-4',category:'独立展開',displayCategory:'独立展開',candidateKind:'independent-scenario',scenarioClassificationReason:reason};
  p.practicalTickets.push({...row});
  const selection={tickets:structuredClone(p.practicalTickets),purchaseDecision:{status:'unchanged'}};
  const before=JSON.stringify(p);
  assert.equal(contract.fromPrediction(p,selection).status,'selected');
  assert.equal(browser.fromPrediction(p,selection).status,'selected');
  assert.equal(JSON.stringify(p),before);
  p.practicalTickets.at(-1).scenarioClassificationReason=reason==='別頭の独立展開'?'残し艇を使う押さえ展開':'別頭の独立展開';
  const changed=JSON.stringify(p),a=contract.fromPrediction(p,selection),b=browser.fromPrediction(p,selection);
  assert.equal(a.status,'unavailable');assert.equal(a.error,'reader_contract_center_copy_mismatch');
  assert.equal(JSON.stringify(a),JSON.stringify(b));assert.equal(JSON.stringify(p),changed);
 }
});

const explanationFixture=require('../scripts/fixtures/reader-explanation-derived.json');
const captureConditions=require('../js/prediction-conditions').capture;
const rawExplanation=()=>structuredClone(explanationFixture.prediction);
test('raw official explanation view matches compact capture in Node and browser without timing claims',()=>{
 const {createHash}=require('node:crypto'),p=rawExplanation(),before=JSON.stringify(p),globalRef=globalThis.ChappyPredictionConditions;
 assert.equal(createHash('sha256').update(JSON.stringify(p)).digest('hex'),explanationFixture.projectionSha256);
 const view=contract.explanationView(p,captureConditions),browserView=browser.explanationView(p,captureConditions),e=contract.explanation(view);
 assert.equal(e.verified,true);assert.match(e.text,/平均STは0.12、展示STはF0.02、展示タイムは6.76秒/);assert.match(e.text,/隣の5号艇の展示STは0.01/);
 assert.equal(JSON.stringify(e),JSON.stringify(browser.explanation(browserView)));
 assert.deepEqual(Object.keys(view.preRaceConditions),['boats']);
 for(const key of ['sourceTiming','officialResultUsed','sourceFetchedAt','schemaVersion','escapeEvaluationEvidence'])assert.equal(Object.hasOwn(view.preRaceConditions,key),false);
 const compact=structuredClone(p);delete compact.race;
 compact.preRaceConditions=captureConditions(p.race.raw,p);
 compact.verificationEvidence.mainScenario.attackerCourse=p.aiCore.raceScenarios.mainScenario.attackerCourse;
 assert.equal(contract.explanation(compact).text,e.text);
 assert.equal(contract.explanationView(compact,captureConditions),compact);
 assert.equal(contract.explanationView(view,captureConditions),view);
 assert.equal(Object.hasOwn(p.verificationEvidence.mainScenario,'attackerCourse'),false);
 view.preRaceConditions.boats[3].avgST=.99;view.verificationEvidence.mainScenario.attackerCourse=1;
 assert.equal(JSON.stringify(p),before);assert.equal(globalThis.ChappyPredictionConditions,globalRef);
});
test('raw/normalized identity, official mapping, averages, exhibition and scenario contradictions stay neutral',()=>{
 const changes=[
  p=>p.race.raw.raceNo=11,
  p=>p.race.raw.date='20260825',
  p=>p.race.raw.stadiumCode='01',
  p=>p.race.raw.entries.pop(),
  p=>p.race.entries[0].boatNo=2,
  p=>p.race.raw.startExhibition[3].boat=5,
  p=>p.race.raw.startExhibition[3].course=5,
  p=>p.race.startExhibition[3].isOfficialCourse=false,
  p=>delete p.race.raw.startExhibition[3].isOfficialCourse,
  p=>p.race.raw.entries[3].avgSt=.13,
  p=>p.race.entries[3].avgST='.13',
  p=>p.race.raw.entries[3].exhibitionTime=7.3,
  p=>p.race.entries[3].exhibitionST='.05',
  p=>p.race.startExhibition[3].st='.12',
  p=>p.race.startExhibition[3].marker='',
  p=>{delete p.race.startExhibition[3].marker;delete p.race.raw.startExhibition[3].marker;},
  p=>{p.race.startExhibition[3].marker='X';p.race.raw.startExhibition[3].marker='X';},
  p=>{p.race.startExhibition[3].st=null;p.race.raw.startExhibition[3].st=null;},
  p=>p.race.raw.entries[3].boatNo=true,
  p=>delete p.aiCore.raceScenarios.mainScenario.attackerCourse,
  p=>{delete p.aiCore.raceScenarios.mainScenario.attackerCourse;p.aiCore.raceScenarios.mainScenario.attacker=4;},
  p=>p.aiCore.raceScenarios.mainScenario.type='threeAttack',
  p=>p.aiCore.raceScenarios.mainScenario.label='3コース攻め',
  p=>p.aiCore.raceScenarios.mainScenario.headBoatNo=3,
  p=>p.aiCore.raceScenarios.mainScenario.attackerCourse=3
 ];
 for(const change of changes){
  const p=rawExplanation();change(p);const before=JSON.stringify(p),a=contract.explanationView(p,captureConditions),b=browser.explanationView(p,captureConditions);
  assert.equal(contract.explanation(a).verified,false,change.toString());
  assert.equal(browser.explanation(b).text,contract.explanation(a).text);
  assert.equal(JSON.stringify(p),before);
 }
 for(const projector of [undefined,()=>{throw Error('capture unavailable');},()=>({boats:[]})]){
  const p=rawExplanation();assert.equal(contract.explanation(contract.explanationView(p,projector)).verified,false);
 }
});
test('existing snapshot/scenario null, undefined and contradictory facts are never overwritten',()=>{
 for(const value of [null,undefined,{}, {boats:[]}]){
  const p=rawExplanation();p.preRaceConditions=value;
  const view=contract.explanationView(p,captureConditions);
  assert.equal(Object.hasOwn(view,'preRaceConditions'),true);assert.equal(view.preRaceConditions,value);
  assert.equal(contract.explanation(view).verified,false);
 }
 for(const value of [null,undefined,3]){
  const p=rawExplanation();p.verificationEvidence.mainScenario.attackerCourse=value;
  const view=contract.explanationView(p,captureConditions);
  assert.equal(view.verificationEvidence.mainScenario.attackerCourse,value);
  assert.equal(Object.hasOwn(view.verificationEvidence.mainScenario,'attackerCourse'),true);
  assert.equal(contract.explanation(view).verified,false);
 }
 for(const change of [b=>b.course=3,b=>b.courseOfficial=false,b=>b.exhibitionST=.12,b=>b.avgST=.2,b=>b.startExhibition.marker='L']){
  const p=rawExplanation();p.preRaceConditions=captureConditions(p.race.raw,p);change(p.preRaceConditions.boats[3]);
  const existing=p.preRaceConditions,before=JSON.stringify(p),view=contract.explanationView(p,captureConditions);
  assert.equal(view.preRaceConditions,existing);assert.equal(contract.explanation(view).verified,false);
  assert.equal(JSON.stringify(p),before);
 }
});
test('display projection separates average ST from F/L and never reads result or odds',()=>{
 const p=rawExplanation();p.race.raw.startExhibition[4].marker='L';p.race.raw.startExhibition[4].st=.99;
 p.race.startExhibition[4].marker='L';p.race.startExhibition[4].st='.99';
 Object.defineProperty(p,'result',{get(){throw Error('result access');}});
 Object.defineProperty(p,'odds',{get(){throw Error('odds access');}});
 const e=contract.explanation(contract.explanationView(p,captureConditions));
 assert.equal(e.verified,true);assert.match(e.text,/平均STは0.12、展示STはF0.02/);assert.match(e.text,/隣の5号艇の展示STはL0.99/);
 assert.doesNotMatch(e.text,/平均STは0.02|展示STは0.02/);
});

test('numeric scalar guards reject whitespace, booleans and non-finite facts before capture in both input schemas',()=>{
 const invalid=[' ','\t\n',false,true,'bad','Infinity',Infinity,NaN,{},[]];
 for(const flat of [false,true])for(const value of invalid){
  for(const field of ['average','exhibition','start']){
   const p=rawExplanation();if(flat)p.race=structuredClone(p.race.raw);
   const raw=p.race.raw||p.race;
   if(field==='average'){raw.entries[3].avgSt=value;if(!flat)p.race.entries[3].avgST=value;}
   if(field==='exhibition'){raw.entries[3].exhibitionTime=value;if(!flat)p.race.entries[3].exhibitionTime=value;}
   if(field==='start'){raw.startExhibition[3].st=value;if(!flat)p.race.startExhibition[3].st=value;}
   const before=JSON.stringify(p);let calls=0;
   const projector=(...args)=>{calls++;return captureConditions(...args);};
   const a=contract.explanationView(p,projector),b=browser.explanationView(p,projector);
   assert.equal(contract.explanation(a).verified,false,field+' / '+flat+' / '+String(value));
   assert.equal(browser.explanation(b).verified,false);assert.equal(calls,0,'invalid scalar never reaches capture');
   assert.equal(JSON.stringify(p),before);assert.doesNotMatch(contract.explanation(a).text,/0\.00/);
  }
 }
 for(const value of [' ',false,Infinity]){
  const p=rawExplanation();p.race.raw.beforeInfo[3].exhibitionTime=value;
  assert.equal(contract.explanation(contract.explanationView(p,captureConditions)).verified,false);
 }
});
test('explicit zero and ordinary numeric strings remain saved facts rather than missing-value defaults',()=>{
 for(const flat of [false,true])for(const value of [0,'0','0.12','.12','+0.12',' 0.12 ']){
  const p=rawExplanation();if(flat)p.race=structuredClone(p.race.raw);
  const raw=p.race.raw||p.race;raw.entries[3].avgSt=value;
  if(!flat)p.race.entries[3].avgST=value;
  const before=JSON.stringify(p),view=contract.explanationView(p,captureConditions),expected=Number(value).toFixed(2);
  assert.equal(contract.explanation(view).verified,true);
  assert.match(contract.explanation(view).text,new RegExp('平均STは'+expected.replace('.','\\.')));
  assert.equal(browser.explanation(browser.explanationView(p,captureConditions)).text,contract.explanation(view).text);
  assert.equal(JSON.stringify(p),before);
 }
});

test('each normalized start must pass the same typed validation before comparing it with valid raw data',()=>{
 for(const value of [false,' ','\t',null,undefined,true,'bad',Infinity]){
  const p=rawExplanation();p.race.raw.startExhibition[3].st=0;p.race.startExhibition[3].st=value;
  const before=JSON.stringify(p);let calls=0;
  const projector=(...args)=>{calls++;return captureConditions(...args);};
  assert.equal(contract.explanation(contract.explanationView(p,projector)).verified,false);
  assert.equal(browser.explanation(browser.explanationView(p,projector)).verified,false);
  assert.equal(calls,0,'one invalid normalized scalar never reaches capture');assert.equal(JSON.stringify(p),before);
 }
 // The raw mapping remains a valid permutation. Only the normalized course
 // is a boolean that Number() would otherwise equate to raw course 1.
 const p=rawExplanation();p.race.raw.startExhibition[3].course=1;p.race.raw.startExhibition[0].course=4;
 p.race.startExhibition[3].course=true;p.race.startExhibition[0].course=4;
 const before=JSON.stringify(p);let calls=0;
 const projector=(...args)=>{calls++;return captureConditions(...args);};
 assert.equal(contract.explanation(contract.explanationView(p,projector)).verified,false);
 assert.equal(browser.explanation(browser.explanationView(p,projector)).verified,false);
 assert.equal(calls,0);assert.equal(JSON.stringify(p),before);
 const valid=rawExplanation();valid.race.raw.startExhibition[3].st=0;valid.race.startExhibition[3].st='0';
 assert.equal(contract.explanation(contract.explanationView(valid,captureConditions)).verified,true);
 assert.match(contract.explanation(contract.explanationView(valid,captureConditions)).text,/展示STはF0.00/);
});
