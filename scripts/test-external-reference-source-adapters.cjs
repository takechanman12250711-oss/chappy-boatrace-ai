'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {hiyoriDailySignals,macourWakamatsuSignals,macourWakamatsuRaceSignal,brPublicCapability,captureFromSignal}=require('./external-reference-source-adapters.cjs');
const {validateCapture}=require('./external-reference-three-source.cjs');

test('Hiyori extracts only race-identifiable public daily signals',()=>{
 const html='<h2>逃げ70%以上/逃し50%以上</h2> 上野真之介 びわこ 5R 1 12:43 <h2>まくり率25%以上のレース</h2> 品田直樹 三国 9R 3 25.0% 12:14';
 const rows=hiyoriDailySignals(html,'20300930');
 assert.deepEqual(rows.map(x=>x.raceKey),['20300930-11-5','20300930-10-9']);
 assert.equal(rows[1].features.makuriRate,25);
});
test('Macour Wakamatsu extracts explicit race preview signals without copying prose',()=>{
 const html='<p>準優１０Ｒは新田雄が優位。４枠の高田はカドから攻め、スタート展示に注目したい。</p>';
 const rows=macourWakamatsuSignals(html,'20300930');
 assert.equal(rows[0].raceKey,'20300930-20-10');
 assert.equal(rows[0].features.frame,4);
 assert.deepEqual(rows[0].features.tags.sort(),['attack','kado','start_exhibition_attention']);
 assert.equal(JSON.stringify(rows).includes('高田'),false);
});
test('Macour public race page maps explicit boat commentary to comparison roles',()=>{
 const row=macourWakamatsuRaceSignal('①新開が速攻決める。②仲谷がシャープな差しで迫る。③枝尾が外を握って。④瓜生のカギはスタート。','20300930',12);
 assert.equal(row.raceKey,'20300930-20-12'); assert.equal(row.features.boat,1);
 assert.ok(row.features.mentions.find(x=>x.boat===2).tags.includes('sashi'));
 assert.ok(row.features.mentions.find(x=>x.boat===4).tags.includes('start_attention'));
});
test('BR public page is methodology-only unless race-level indices are public',()=>{
 const v=brPublicCapability('B:実力 E:モーター S:スタート A:成績 G:コース K:コメント L:地元 W:環境');
 assert.equal(v.methodologyAvailable,true); assert.equal(v.raceLevelPublic,false);
 assert.match(v.reason,/sold_on_note_or_regimag/);
});
test('signals become locked comparison captures',()=>{
 const c=captureFromSignal('hiyori',{raceKey:'20300930-24-1',features:{signal:'makuri25'}},{
  capturedAt:'2030-09-30T10:00:00+09:00',sourceUrl:'https://www.kyoteibiyori.com/blog/203009300001',rawBytes:Buffer.from('fixture')});
 assert.equal(validateCapture(c).usableForPrediction,false);
});
