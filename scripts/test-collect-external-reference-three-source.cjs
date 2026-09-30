'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {collect}=require('./collect-external-reference-three-source.cjs');
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ext-collector-'));
test('collector saves only locally matched pre-deadline public race signals and keeps BR methodology separate',async()=>{
 const r=root(), date='20300930'; try{
  fs.mkdirSync(path.join(r,'data','predictions'),{recursive:true});
  fs.writeFileSync(path.join(r,'data','predictions',date+'.json'),JSON.stringify({races:[
   {raceKey:'20300930-11-5',deadlineAt:'2030-09-30T12:00:00+09:00'},
   {raceKey:'20300930-20-10',deadlineAt:'2030-09-30T20:00:00+09:00'}]}));
  const fetcher=async url=>({ok:true,arrayBuffer:async()=>Buffer.from(
   url.includes('kyoteibiyori')?'<h2>逃げ70%以上/逃し50%以上</h2> 上野真之介 びわこ 5R 1 12:43 <h2>まくり率25%以上のレース</h2>':
   url.includes('macour')?'<p>④高田がカドから攻め、スタートに注目。</p>':
   'B 実力 E モーター S スタート A 成績 G コース K コメント L 地元 W 環境')});
  const out=await collect({root:r,now:Date.parse('2030-09-30T10:00:00+09:00'),fetcher});
  assert.equal(out.captured.length,2); assert.deepEqual(out.captured.map(x=>x.source).sort(),['hiyori','macour']);
  assert.equal(out.capabilities.br.raceLevelPublic,false); assert.equal(out.capabilities.br.methodologyAvailable,true);
  assert.equal(out.usableForPrediction,false);
 }finally{fs.rmSync(r,{recursive:true,force:true});}
});
test('collector refuses signals after local deadline and never invents BR race data',async()=>{
 const r=root(); try{
  fs.mkdirSync(path.join(r,'data','predictions'),{recursive:true});
  fs.writeFileSync(path.join(r,'data','predictions','20300930.json'),JSON.stringify({raceKey:'20300930-11-5',deadlineAt:'2030-09-30T10:01:00+09:00'}));
  const fetcher=async url=>({ok:true,arrayBuffer:async()=>Buffer.from(url.includes('kyoteibiyori')?'<h2>逃げ70%以上/逃し50%以上</h2> X びわこ 5R 1 <h2>まくり率25%以上のレース</h2>':'B E S A G K L W')});
  const out=await collect({root:r,now:Date.parse('2030-09-30T10:00:00+09:00'),fetcher});
  assert.equal(out.captured.length,0); assert.ok(out.skipped.some(x=>x.reason==='outside_pre_result_window'));
  assert.equal(out.captured.some(x=>x.source==='br'),false);
 }finally{fs.rmSync(r,{recursive:true,force:true});}
});
