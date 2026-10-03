'use strict';
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict');global.window=global;
require('../js/boat-identity');require('../js/ai-core');require('../js/prediction');const selector=require('../js/practical-selection');
const note=require('../js/note-generator');const capture=require('./practical-selection-evidence').capture;
const seen=new Set(), groups={}, all=[];let surfaceChecks=0;
const ticket=v=>String(v?.ticket||v||'');
for(const name of fs.readdirSync('data/predictions').filter(x=>/^\d{8}\.json$/.test(x)&&x.slice(0,8)<='20260812').sort()){
 const date=name.slice(0,8),data=JSON.parse(fs.readFileSync(path.join('data/predictions',name)));
 for(const race of [...(data.predictions||[]),...(data.verificationPredictions||[])]){
  if(race.result?.settled!==true)continue;const key=race.raceKey||`${date}-${race.jcd}-${race.raceNo}`;if(seen.has(key))continue;seen.add(key);
  const c=race.prediction?.preRaceConditions||race.preRaceConditions, actual=ticket(race.result.resultTicket||race.result.review?.resultTicket);
  if(!c||!Array.isArray(c.boats)||c.boats.length<5||!actual)continue;
  const p=global.createPrediction({...c,entries:c.boats,boats:c.boats,jcd:race.jcd,stadiumCode:race.jcd,venueCode:race.jcd,placeName:race.place,venueName:race.place,raceNo:race.raceNo,rno:race.raceNo,weather:c.weather||{}});
  const before=selector.select(p,{escapeRolePartner:false}),after=selector.select(p,{escapeRolePartner:"replay"});
  const a=before.tickets.map(ticket),b=after.tickets.map(ticket), rep=after.expansionSummary?.escapeRolePartnerReplacement;
  const pay=Number(race.result.payout||race.result.officialPayoutPer100||race.result.review?.payout||0);
  assert.equal(a.length,b.length);assert.equal(new Set(b).size,b.length);
  for(const t of before.tickets.filter(t=>['本線','流し'].includes(t.category)||['1-2-3','1-2-4'].includes(t.ticket)))assert.ok(b.includes(t.ticket),`protected ${key} ${t.ticket}`);
  assert.deepEqual(a.filter(t=>!t.startsWith('1-')),b.filter(t=>!t.startsWith('1-')));
  if(rep){
   if(surfaceChecks<5){
   const livePrediction={...p,deadlineAt:new Date(Date.now()+86400000).toISOString()};
   assert.deepEqual(selector.select(livePrediction).tickets.map(ticket),b);
   assert.deepEqual(note.createPracticalSelection(livePrediction).map(ticket),b);
   const ev=capture({raceKey:key,selectedAt:'2026-10-03T10:11:01Z',deadlineAt:livePrediction.deadlineAt},after.tickets,after);
   assert.equal(ev.status,'captured');assert.deepEqual(ev.practicalTickets,b);
   surfaceChecks++;
   }
   assert.ok(after.verificationEvidence.generation.ticketPolicyVersion.endsWith('|escape-role-partner-v1.3'));
   for(const t of [rep.addedTicket,rep.removedTicket]){
    const decision=after.candidateOutcomes.find(d=>d.ticket===t);assert.equal(decision?.selected,b.includes(t),`disposition ${key} ${t}`);
   }
   assert.deepEqual(after.verificationEvidence.tickets.map(t=>t.ticket).sort(),[...b].sort());
  }
  const cohort=date<'20260807'?'pre':date<='20260810'?'mid':date==='20260811'?'d0811':'d0812';
  (groups[cohort]??=[]).push({raceKey:key,date,actual,payout:pay,a,b,rep,ah:a.includes(actual),bh:b.includes(actual)});all.push(groups[cohort].at(-1));if(all.length%200===0)console.log('paired rows',all.length);
 }
}
function sum(rows){const a=rows.filter(x=>x.ah),b=rows.filter(x=>x.bh);return{races:rows.length,baseHits:a.length,afterHits:b.length,gains:rows.filter(x=>!x.ah&&x.bh).length,losses:rows.filter(x=>x.ah&&!x.bh).length,changes:rows.filter(x=>x.rep).length,stake:rows.reduce((s,r)=>s+r.a.length*100,0),baseReturn:a.reduce((s,r)=>s+r.payout,0),afterReturn:b.reduce((s,r)=>s+r.payout,0)}}
const report={sourceCommit:process.env.GITHUB_SHA||'',surfaceChecks,mode:'retrospective paired replay; not prospective or actual purchases',summary:sum(all),groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,sum(v)])),byVenue:Array.from({length:24},(_,i)=>{const jcd=String(i+1).padStart(2,'0');return {jcd,...sum(all.filter(x=>x.raceKey.slice(9,11)===jcd))}}),changes:all.filter(x=>x.rep)};
const out=process.env.ESCAPE_PARTNER_REPORT||'tmp-integration/escape-partner-paired.json';fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report.summary));console.log(JSON.stringify(report.groups));
assert.equal(all.length,979,'fixed historical regression population changed');
assert.deepEqual(report.summary,{races:979,baseHits:300,afterHits:312,gains:17,losses:5,changes:239,stake:829300,baseReturn:604390,afterReturn:618940});
assert.equal(surfaceChecks,5);assert.equal(report.byVenue.filter(v=>v.races>0).length,24);
console.log('paired replay + app/note/evidence consistency: PASS');
