'use strict';
const assert=require('node:assert/strict');
const api=require('../js/practical-selection');
const tags=require('../js/theory-tag-snapshot');
const approval=require('../config/wall-purchase-approval.json');
const p={race:{date:'20300914',stadiumName:'唐津',raceNo:1,raceInfo:{deadline:'16:00'}},
  aiCore:{wallTheory:{attackerNo:2,wallCandidateNo:1,state:'壁成立',score:75,grade:'A'}},
  confidence:70,mainSheet:{honmei:{boatNo:2,name:'テスト選手',score:70},
    evaluations:[1,2,3,4,5,6].map(boatNo=>({boatNo,name:'テスト選手',score:70})),
    tickets:[{ticket:'2-1-3',category:'本命'}]},
  raceFlow:{title:'2コース差し',summary:'2号艇の差し。'}};
assert.equal(api.WALL_PURCHASE_POLICY.id,approval.candidateId);
assert.equal(api.WALL_PURCHASE_POLICY.effectiveFrom,approval.effectiveFrom);
const original=JSON.stringify(p), d=api.purchaseDecision(p);
assert.equal(d.status,'skip');assert.equal(d.recommendedStakeYen,0);assert.deepEqual(d.recommendedTickets,[]);
for(const attacker of [1,2,3,4,5,6])for(const state of ['壁成立','互角','壁崩れ','不明']){
  const row=structuredClone(p);Object.assign(row.aiCore.wallTheory,{attackerNo:attacker,state});
  const formal=tags.wallEvidence(row);
  assert.equal(api.purchaseDecision(row).status==='skip',formal.formal&&state==='壁成立'&&attacker===2);
}
for(const change of [r=>r.aiCore.wallTheory.grade='',r=>delete r.aiCore.wallTheory.score,
  r=>r.aiCore.wallTheory.wallCandidateNo=0,r=>r.race.date='20260921',r=>delete r.race,
  r=>r.isRetrospective=true,r=>r.predictionMode='server_post_deadline',r=>r.officialResultUsedForPrediction=true]){
  const row=structuredClone(p);change(row);assert.equal(api.purchaseDecision(row).status,'unchanged');
}
const tickets=[{ticket:'2-1-3',category:'本命',odds:0}];
assert.deepEqual(api.createPurchaseSelection.call({select:()=>({tickets,purchaseDecision:d})},p),[]);
assert.deepEqual(api.createPurchaseSelection.call({select:()=>({tickets,purchaseDecision:{status:'unchanged'}})},p),tickets);
assert.equal(api.compactAudit({tickets,purchaseDecision:d}).purchaseDecision.status,'skip');
assert.equal(api.compactAudit({tickets}).purchaseDecision,undefined,'legacy audit is not backfilled');
global.ChappyPracticalSelection={...api,createPracticalSelection:()=>tickets};
const article=require('../js/note-generator').generateArticle(p,{publicationPolicy:'all-races-v1',practicalTickets:tickets});
assert.equal(article.ok,true);assert.match(article.freeText,/購入見送り/);assert.match(article.paidText,/購入推奨0点・0円/);
assert.deepEqual(article.practicalTickets,tickets);assert.equal(JSON.stringify(p),original);
const audit=require('./note-publication-audit').auditNotePublication({article,record:{
  date:'20300914',jcd:'23',place:'唐津',raceNo:1,raceKey:'20300914-23-1',
  selectedAt:'2030-09-14T06:00:00Z',deadlineAt:'2030-09-14T16:00:00+09:00',
  publicationPolicy:'all-races-v1',prediction:{...p,practicalTickets:tickets}
},baselinePracticalTickets:tickets,now:'2030-09-14T06:00:00Z'});
assert.equal(audit.contentReady,true,JSON.stringify(audit.issues));
const fs=require('node:fs'),vm=require('node:vm');let rendered='';
const area={querySelectorAll:()=>[],insertAdjacentHTML:(_at,html)=>{rendered+=html;}};
const browser={document:{getElementById:id=>id==='resultArea'?area:{},addEventListener:()=>{}},
  ChappyPracticalSelection:api,addEventListener:()=>{},setInterval:()=>1,clearInterval:()=>{}};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../js/final-practical-visible-panel.js'),'utf8'),{window:browser});
browser.ChappyPracticalVisiblePanel.render(p);
assert.match(rendered,/購入推奨0点・0円/);assert.match(rendered,/購入対象ではありません/);
const {buildActiveV2Comparison}=require('./collect-predictions');
const comparison=buildActiveV2Comparison('20300914',[{jcd:'23',raceNo:1},{jcd:'24',raceNo:1}],
  [{raceKey:'20300914-23-1',selection:{ready:true,score:90,status:'ready'},prediction:{practicalSelection:{purchaseDecision:d}}},
   {raceKey:'20300914-24-1',selection:{ready:true,score:70,status:'ready'}}]);
assert.equal(comparison[0].jcd,'24');assert.equal(comparison[1].selectionReady,false);
assert.equal(comparison[1].selectionStatus,'purchase-policy-skip');
console.log('owner-approved wall purchase policy: exact scope, zero recommendation, forecast preservation, note and auto-selection passed');
