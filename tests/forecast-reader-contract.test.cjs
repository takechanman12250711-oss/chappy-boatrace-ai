'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const contract=require('../js/forecast-reader-contract');
const source=fs.readFileSync(require.resolve('../js/forecast-reader-contract'),'utf8');
const context={window:{}};vm.runInNewContext(source,context);const browser=context.window.ChappyForecastReaderContract;
const input=()=>({centralTickets:['1-2-3','1-2-4'],additionalTickets:['1-2-3','1-2-5','2-1-3'],holeTickets:['2-1-3','5-1-2'],referenceTickets:['1-2-3','4-1-2']});
const prediction=()=>({mainSheet:{honmei:{boatNo:1},tickets:['1-2-3','1-2-4']},verificationEvidence:{mainScenario:{headBoatNo:1,attackerBoatNo:1,type:'escape',label:'1号艇逃げ'}},preRaceConditions:{boats:[{boatNo:1,course:1,courseOfficial:true,avgST:.14,exhibitionST:.14,exhibitionTime:6.9},{boatNo:2,course:2,courseOfficial:true,exhibitionST:.06}]}});
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
  assert.equal(contract.explanation(p).text,'中心となる展開は1号艇逃げ。');
});
