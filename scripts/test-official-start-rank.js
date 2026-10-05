"use strict";
const assert = require("node:assert/strict");
const { parseOfficialStartRank, attachOfficialStartRanks } = require("../api/_official-start-rank");
const { parseOfficialRaceHtml } = require("../api/_parser");
const raceApi = require("../api/race");
global.window = global;
global.addEventListener = () => {};
global.document = { addEventListener() {} };
require("../js/utils");
require("../js/ai-core");
require("../js/prediction-st-exhibition-support");
const conditions = require("../js/prediction-conditions");
const core = global.ChappyAICore;
const now = Date.parse("2030-10-05T22:00:00Z");
function html(id, values = [3.5, 3.0, 2.5, 4, 3.5, 3]) {
  return `<dl><dt>登録番号</dt><dd>${id}</dd></dl>` +
    `<table><tr><th colspan="2">コース別平均スタートタイミング</th></tr><tr><th>1</th><td>0.11</td></tr></table>` +
    `<table><tr><th colspan="2">コース別スタート順</th></tr>${values.map((v,i) =>
      `<tr><th class="is-boatColor${i+1}">${i+1}</th><td><div><span style="width:60%"></span><span>${v === "-" ? "-" : Number(v).toFixed(2)}</span></div></td></tr>`
    ).join("")}</table>`;
}
const profile = (id, values) => parseOfficialStartRank(html(id, values), { registerNo: id, fetchedAt: new Date(now).toISOString() });
const inputs = () => ({ entries: Array.from({ length: 6 }, (_, i) => ({ boat: i+1, boatNo: i+1,
  registerNo: String(4101+i), exhibition: { displayTime: i === 1 ? 6.70 : 6.80 }, exhibitionTime: i === 1 ? 6.70 : 6.80, avgSt: 0.12,
  startExhibition: { boat: i+1, course: i+1, isOfficialCourse: true }
})), startExhibition: Array.from({ length: 6 }, (_, i) => ({ boat: i+1, course: i+1, isOfficialCourse: true })) });
async function main() {
  assert.deepEqual(profile("4101").byCourse, { 1:3.5, 2:3, 3:2.5, 4:4, 5:3.5, 6:3 });
  assert.equal(profile("4101", ["-", 3, 3, 3, 3, 3]).byCourse[1], null);
  assert.equal(parseOfficialStartRank(html("4102"), { registerNo:"4101", fetchedAt:new Date(now).toISOString() }).status,"identity-mismatch");
  for (const bad of [html("4101").replace("3.50", "0.15"), html("4101").replace("3.50", "空欄"),
    html("4101", [3,3,3,3,3]), html("4101").replace('class="is-boatColor6">6','class="is-boatColor6">5')]) {
    assert.notEqual(parseOfficialStartRank(bad, { registerNo:"4101", fetchedAt:new Date(now).toISOString() }).status,"available");
  }
  let requests = 0;
  const fetcher = async url => { requests++; const id = new URL(url).searchParams.get("toban"); return {ok:true,text:async()=>html(id)}; };
  const raw=inputs(), original=JSON.stringify(raw);
  const [a,b] = await Promise.all([attachOfficialStartRanks(raw,{date:"20301006",now,fetcher}),attachOfficialStartRanks(raw,{date:"20301006",now,fetcher})]);
  assert.equal(requests,6,"同時収集でも選手ごとに1回だけ取得");
  assert.equal(a.officialStartRankCollection.available,6);
  a.entries[0].officialStartRank.byCourse[1]=1;
  assert.equal(b.entries[0].officialStartRank.byCourse[1],3.5,"キャッシュ・返却値を共有して変更しない");
  assert.equal(JSON.stringify(raw),original);
  for (const [data,date,status] of [[raw,"20301005","race-date-not-current"],[{...raw,startExhibition:[]},"20301006","awaiting-official-exhibition"]]) {
    assert.equal((await attachOfficialStartRanks(data,{date,now,fetcher})).officialStartRankCollection.status,status);
  }
  assert.equal(requests,6,"過去・展示前は現在の順位を取得しない");
  const duplicate=inputs();duplicate.startExhibition[5].course=5;
  assert.equal((await attachOfficialStartRanks(duplicate,{date:"20301006",now,fetcher})).officialStartRankCollection.status,"awaiting-official-exhibition");
  const slow=inputs(); slow.entries.forEach((e,i)=>e.registerNo=String(4201+i));
  const start=Date.now();
  const timed=await attachOfficialStartRanks(slow,{date:"20301006",now,timeoutMs:20,fetcher:async()=>({ok:true,text:()=>new Promise(()=>{})})});
  assert.equal(timed.officialStartRankCollection.available,0);
  assert(timed.entries.every(e=>e.officialStartRank.status==="timeout"));
  assert(Date.now()-start<1000,"本文が応答しなくても6艇を並行タイムアウトで終える");
  const current=inputs(); current.entries.forEach((e,i)=>e.officialStartRank=profile(e.registerNo));
  const evidence = core.buildAdjacentExhibitionEvidence(core.getRaceEntries ? core.getRaceEntries(current) : current.entries);
  const ref=evidence.rows[1].startRankReference;
  assert.equal(ref.gapRanks,0.5); assert.equal(ref.combinedAlert,true);
  assert.equal(evidence.rows[1].superAlert,null,"近似成立を一般戦限定スーパーへ昇格しない");
  assert.equal(evidence.rows[0].startRankReference.combinedAlert,null);
  const less=structuredClone(current); less.entries[1].officialStartRank.byCourse[2]=3.01;
  assert.equal(core.buildAdjacentExhibitionEvidence(less.entries).rows[1].startRankReference.combinedAlert,false);
  const reordered=structuredClone(current);
  reordered.entries[1].startExhibition.course=3; reordered.entries[2].startExhibition.course=2;
  reordered.entries[1].officialStartRank.byCourse[3]=2;
  reordered.entries[2].officialStartRank.byCourse[2]=3;
  const moved=core.buildAdjacentExhibitionEvidence(reordered.entries).rows[1];
  assert.equal(moved.insideBoatNo,3); assert.equal(moved.startRankReference.gapRanks,1);
  for(const mutate of [x=>delete x.entries[0].officialStartRank,x=>x.entries[0].officialStartRank.registerNo="9999",
    x=>x.entries[0].officialStartRank.byCourse[1]=null,x=>x.entries[0].officialStartRank.source="guessed"]){
    const bad=structuredClone(current);mutate(bad);
    assert.equal(core.buildAdjacentExhibitionEvidence(bad.entries).rows[1].startRankReference.combinedAlert,null);
  }
  const without=inputs();
  const originalCore=core.buildPredictionData(without), withCore=core.buildPredictionData(current);
  assert.deepEqual(withCore.analyses.map(x=>x.indexes),originalCore.analyses.map(x=>x.indexes),"参考順位から独立加点・重複加点しない");
  assert.deepEqual(withCore.raceScenarios.scenarios.map(x=>[x.type,x.score]),originalCore.raceScenarios.scenarios.map(x=>[x.type,x.score]));
  assert(withCore.comments.some(x=>x.includes("展示0.10秒・順位0.5位の近似条件")));
  const saved=conditions.capture(current,{aiCore:withCore});
  assert.deepEqual(saved.adjacentExhibitionEvidence.rows[1].startRankReference,ref);
  assert.equal(saved.boats[1].officialStartRank.byCourse[2],3);
  saved.boats[1].officialStartRank.byCourse[2]=1;
  assert.equal(current.entries[1].officialStartRank.byCourse[2],3);
  const support=global.ChappyPredictionSTExhibitionSupport.build({aiCore:withCore,flowPriority:{attackBoatNo:2}},current);
  assert.match(support.comment,/近似条件が成立/);
  const weak=core.buildPredictionData(less);
  assert.match(global.ChappyPredictionSTExhibitionSupport.build({aiCore:weak,flowPriority:{attackBoatNo:2}},less).alerts.join(" "),/裏付けを過信しない/);
  // Full API wiring: entry HTML -> identities -> official profiles -> response -> core -> frozen evidence.
  const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("-","");
  const entryHtml=["枠 ボートレーサー 全国 当地 モーター ボート",...Array.from({length:6},(_,i)=>
    `${i+1} ${4301+i} / A1 山田 太郎 福岡/福岡 41歳/55.0kg F0 L0 0.15 6.57 45.0 63.0 6.81 47.0 65.0 12 35.0 55.0 24 38.0 58.0`),"モーター・ボート変更時"].join(" ");
  const beforeHtml=["枠 写真 ボートレーサー",...Array.from({length:6},(_,i)=>`${i+1} 山田 太郎 52.0kg ${i===1?'6.70':'6.80'} 0.0`),"部品交換凡例 スタート展示",...Array.from({length:6},(_,i)=>`<div>${i+1}<img src='/static_extra/pc/images/img_boat2_${i+1}.png'>.12</div>`),"水面気象情報"].join(" ");
  assert.equal(parseOfficialRaceHtml(entryHtml,beforeHtml).entries.length,6);
  const oldFetch=global.fetch; let payload;
  global.fetch=async url=>({ok:true,text:async()=>url.includes('racelist?')?entryHtml:url.includes('beforeinfo?')?beforeHtml:html(new URL(url).searchParams.get('toban'))});
  try { await raceApi({query:{jcd:"12",rno:1,date}},{setHeader(){},status(){return this;},json(v){payload=v;return v;}}); }
  finally { global.fetch=oldFetch; }
  assert.equal(payload.ok,true); assert.equal(payload.officialStartRankCollection.available,6);
  assert.equal(core.buildPredictionData(payload).exhibitionPerformanceTheory.adjacentExhibition.rows[1].startRankReference.combinedAlert,true);
  console.log("公式ST順位: 取得・識別・欠測・時間上限・過去補完禁止・進入・境界・説明・保存・API接続 合格");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
