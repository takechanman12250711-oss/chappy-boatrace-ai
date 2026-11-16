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
