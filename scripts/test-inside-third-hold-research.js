'use strict';
const assert=require('node:assert/strict');
const {replacement,metrics}=require('./research-inside-third-hold');
const protocol=require('../config/inside-third-hold-research-v1.json');
const record={practicalPriorityShadow:{sourceSelectionFingerprint:protocol.sourceSelectionFingerprint},prediction:{
 raceFlow:{title:'3コース攻め'},practicalTickets:['3-1-5','3-1-6','1-2-4'].map(ticket=>({ticket,category:'本線'})),
 practicalSelection:{frameRiseFallReplayBasis:{source:'pre-deadline-production-prediction',analyses:[1,2,3,4,5,6].map(boatNo=>({boatNo,roleScores:{hold:boatNo===4?80:60}}))},
 targetDecisions:[{candidateDecisions:[{ticket:'3-1-4',roleLabels:[{boatNo:3,position:1,role:'head',structured:true},{boatNo:1,position:2,role:'hold',structured:true},{boatNo:4,position:3,role:'hold',structured:true}]}]}]}}};
const original=JSON.stringify(record),r=replacement(record);
assert.deepEqual(r.candidate,['3-1-5','3-1-4','1-2-4']);
assert.equal(JSON.stringify(record),original);
const altered=structuredClone(record);altered.result={ticket:'6-5-4',payout:999999};
altered.prediction.practicalTickets.forEach(t=>{t.odds=99999;});
assert.deepEqual(replacement(altered),r,'results and odds cannot alter candidate selection');
for(const change of [
 x=>x.prediction.raceFlow.title='4カド攻め警戒',
 x=>x.prediction.practicalTickets[1].category='フォーメーション',
 x=>x.prediction.practicalSelection.targetDecisions[0].candidateDecisions[0].roleLabels[2].structured=false,
 x=>x.prediction.practicalSelection.frameRiseFallReplayBasis.analyses[3].roleScores.hold=50,
 x=>x.practicalPriorityShadow.sourceSelectionFingerprint='old'
]){const x=structuredClone(record);change(x);assert.equal(replacement(x),null);}
const m=metrics([{a:['3-1-6'],b:['3-1-4'],actual:'3-1-4',payout:2000,changed:true},
 {a:['3-1-6'],b:['3-1-4'],actual:'3-1-6',payout:1500,changed:true}]);
assert.equal(m.hitDelta,0);assert.equal(m.returnDelta,500);assert.equal(m.returnDeltaWithoutLargestGain,-1500);
console.log('Inside-third-hold fixed research tests passed');
