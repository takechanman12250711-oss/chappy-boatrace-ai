'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {select}=require('../scripts/escape-partner-incremental.cjs');
function fixture(){return {main:4,formal:true,exhibition:true,boats:[{boatNo:1,course:1}],base:['4-1-5','1-2-3','1-2-4'],
  baseRows:[{ticket:'4-1-5',category:'本線'},{ticket:'1-2-3',category:'押さえ'},{ticket:'1-2-4',category:'押さえ'}],
  pool:['4-1-5','1-2-3','1-2-4','1-5-4'].map(ticket=>({ticket,evidenceQualified:true,priorityScore:90,candidateKind:'canonical-formation',branchIds:['saved:'+ticket],purchaseEligible:false}))};}
test('single second-slot swap preserves heads, third slots, old pair coverage and budget',()=>{
 const x=fixture(),before=structuredClone(x),r=select(x);assert.equal(r.changed,true);assert.deepEqual(r.tickets,['4-1-5','1-2-3','1-5-4']);
 assert.deepEqual(r.tickets.map(t=>[t[0],t[4]]),x.base.map(t=>[t[0],t[4]]));assert.equal(r.tickets.length,x.base.length);
 for(const t of x.base)assert.ok(r.tickets.some(n=>n.slice(0,3)===t.slice(0,3)));assert.deepEqual(x,before);
 assert.equal(r.change.savedPurchaseEligible,false,'research evidence is not purchase approval');
});
test('priority protection is a distinct component, not outcome-conditioned',()=>{
 const x=fixture();x.pool.at(-1).priorityScore=80;assert.equal(select(x).changed,true);assert.equal(select(x,{preservePriority:true}).changed,false);
});
test('main one, missing official input, ungrounded candidate and protected category remain unchanged',()=>{
 for(const change of [x=>x.main=1,x=>x.formal=false,x=>x.exhibition=false,x=>x.pool.at(-1).evidenceQualified=false,x=>x.baseRows[2].category='流し']){
  const x=fixture();change(x);assert.equal(select(x).changed,false);
 }
});
test('cannot remove the only old second or manufacture a new third',()=>{
 const x=fixture();x.base[1]='1-3-2';assert.equal(select(x).changed,false);
 const y=fixture();y.pool.at(-1).ticket='1-5-6';assert.equal(select(y).changed,false);
});
test('duplicate pool rejects ambiguity and invalid baseline throws',()=>{
 const x=fixture();x.pool.push(x.pool[0]);assert.equal(select(x).reason,'invalid-or-duplicate-pool');
 assert.throws(()=>select({...fixture(),base:['1-1-2']}),/invalid-baseline/);
});
