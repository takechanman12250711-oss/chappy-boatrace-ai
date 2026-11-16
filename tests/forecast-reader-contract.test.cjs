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
