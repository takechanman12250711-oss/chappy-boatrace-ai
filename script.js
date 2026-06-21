(() => {
"use strict";
const API = "/api/race";
const $ = (id) => document.getElementById(id);

const PLACES = {
 "01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖",
 "07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江",
 "13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山",
 "19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"
};

const OPTIONS = {
 wind:["無風","追い風","向かい風","横風","強風"],
 water:["普通","荒れ","うねり","潮あり"],
 entry:[["normal","枠なり想定"],["move","前付け/進入変化あり"],["deep","深イン想定"]],
 engine:[["normal","通常"],["new","新エンジン/新燃料期"]]
};

const VENUE = {
 "01":{in:68,diff:45,attack3:50,keep4:46,out5:34,out6:30,rough:25,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"桐生：ナイター寄り。展示・ST・回り足重視。"},
 "02":{in:52,diff:46,attack3:68,keep4:70,out5:61,out6:48,rough:66,wind:"横風",water:"普通",entry:"normal",engine:"normal",memo:"戸田：狭水面。センター攻めと4残し。波乱強め。"},
 "03":{in:35,diff:42,attack3:65,keep4:72,out5:76,out6:69,rough:80,wind:"強風",water:"荒れ",entry:"normal",engine:"normal",memo:"江戸川：難水面。当地巧者・外枠・道中重視。"},
 "04":{in:50,diff:48,attack3:66,keep4:62,out5:54,out6:42,rough:58,wind:"横風",water:"普通",entry:"normal",engine:"normal",memo:"平和島：イン絶対ではない。センター攻め・4残し。"},
 "05":{in:64,diff:46,attack3:55,keep4:52,out5:42,out6:35,rough:34,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"多摩川：静水面寄り。技量・展示・一周重視。"},
 "06":{in:56,diff:45,attack3:60,keep4:58,out5:54,out6:42,rough:44,wind:"横風",water:"普通",entry:"normal",engine:"normal",memo:"浜名湖：広水面。外の伸び・まくり差し注意。"},
 "07":{in:70,diff:47,attack3:56,keep4:52,out5:42,out6:34,rough:30,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"蒲郡：ナイター。展示気配と回り足。"},
 "08":{in:70,diff:47,attack3:56,keep4:52,out5:40,out6:32,rough:30,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"常滑：イン寄り。3攻め残し注意。"},
 "09":{in:58,diff:45,attack3:62,keep4:58,out5:50,out6:40,rough:46,wind:"横風",water:"普通",entry:"normal",engine:"normal",memo:"津：風で差し/まくり差し変化。"},
 "10":{in:78,diff:44,attack3:50,keep4:45,out5:32,out6:28,rough:24,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"三国：モーニングはイン寄り。ST重視。"},
 "11":{in:58,diff:45,attack3:56,keep4:54,out5:46,out6:38,rough:45,wind:"横風",water:"うねり",entry:"normal",engine:"normal",memo:"びわこ：風とうねり。道中足。"},
 "12":{in:82,diff:50,attack3:52,keep4:45,out5:30,out6:25,rough:20,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"住之江：イン強め。2差しと3攻め両立。"},
 "13":{in:62,diff:46,attack3:60,keep4:56,out5:45,out6:35,rough:35,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"尼崎：センター攻め残り注意。"},
 "14":{in:56,diff:43,attack3:60,keep4:58,out5:52,out6:42,rough:52,wind:"横風",water:"潮あり",entry:"normal",engine:"normal",memo:"鳴門：潮・風で波乱。外差し注意。"},
 "15":{in:78,diff:46,attack3:60,keep4:57,out5:45,out6:35,rough:28,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"丸亀：ナイター。イン＋展示上位。3攻め、4残しは切らない。"},
 "16":{in:62,diff:44,attack3:56,keep4:54,out5:48,out6:38,rough:42,wind:"無風",water:"潮あり",entry:"normal",engine:"normal",memo:"児島：潮汐影響。地元/当地重視。"},
 "17":{in:62,diff:42,attack3:58,keep4:59,out5:52,out6:42,rough:50,wind:"横風",water:"潮あり",entry:"normal",engine:"normal",memo:"宮島：潮汐大。潮・風・当地巧者を重視。"},
 "18":{in:82,diff:48,attack3:52,keep4:48,out5:34,out6:28,rough:22,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"徳山：イン強め。2差し・3攻め・4残し。"},
 "19":{in:68,diff:46,attack3:56,keep4:52,out5:42,out6:34,rough:32,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"下関：ナイター。展示と当地。"},
 "20":{in:68,diff:48,attack3:63,keep4:61,out5:58,out6:66,rough:46,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"若松：海水ナイター。地元・当地・道中を上げる。"},
 "21":{in:82,diff:44,attack3:50,keep4:45,out5:32,out6:26,rough:20,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"芦屋：モーニング。イン寄り。"},
 "22":{in:48,diff:45,attack3:62,keep4:64,out5:68,out6:55,rough:65,wind:"横風",water:"潮あり",entry:"normal",engine:"normal",memo:"福岡：河口。2M波乱、外枠、道中艇注意。"},
 "23":{in:78,diff:44,attack3:50,keep4:45,out5:34,out6:28,rough:22,wind:"無風",water:"普通",entry:"normal",engine:"normal",memo:"唐津：イン寄り。地元補正。"},
 "24":{in:92,diff:38,attack3:74,keep4:67,out5:45,out6:32,rough:18,wind:"無風",water:"普通",entry:"normal",engine:"new",memo:"大村：イン強め。新エンジン期はモーター過信せず、2差し残り・3攻め・4残しを必ず見る。"}
};

const DEFAULTS = {
 avg:[.15,.16,.16,.16,.17,.15], now:[.14,.16,.16,.16,.17,.15],
 tenji:[6.90,6.92,6.88,6.85,6.91,6.93], lap:[37.5,37.7,37.4,37.3,37.6,37.8],
 nat:[6,5.7,5.9,6.4,6.7,6.1], loc:[5.8,5.4,5.9,6,6,5.9],
 home:[5.7,5.4,6,6.4,6.2,6.8], motor:[35,34,38,42,40,39]
};

function clamp(n){return Math.round(Math.max(1,Math.min(99,n)));}
function nums(text,key,dec=true){const i=text.indexOf(key);if(i<0)return[];const re=dec?/\\d+\\.\\d+/g:/\\d+/g;return (text.slice(i,i+220).match(re)||[]).map(Number).slice(0,6);}
function V(p){return VENUE[p]||VENUE["24"];}
function courseValue(b,v){return [0,v.in/8,v.diff/8,v.attack3/8,v.keep4/8,v.out5/8,v.out6/8][b]||0;}
function setSelectOptions(){
 $("place").innerHTML=Object.entries(PLACES).map(([k,n])=>`<option value="${k}">${n}</option>`).join("");
 $("race").innerHTML=Array.from({length:12},(_,i)=>`<option>${i+1}R</option>`).join("");
 $("wind").innerHTML=OPTIONS.wind.map(x=>`<option>${x}</option>`).join("");
 $("water").innerHTML=OPTIONS.water.map(x=>`<option>${x}</option>`).join("");
 $("entry").innerHTML=OPTIONS.entry.map(([v,t])=>`<option value="${v}">${t}</option>`).join("");
 $("engine").innerHTML=OPTIONS.engine.map(([v,t])=>`<option value="${v}">${t}</option>`).join("");
 $("place").value="24";
}
function applyVenue(){
 const p=$("place").value, v=V(p);
 $("wind").value=v.wind; $("water").value=v.water; $("entry").value=v.entry; $("engine").value=v.engine;
 $("autoVenue").textContent=`自動反映：${PLACES[p]}
風：${v.wind} / 水面：${v.water} / 進入：${v.entry} / エンジン：${v.engine}
${v.memo}

※ここは固定DB。実戦では貼り付けデータを優先して展開60%で再計算。`;
 analyze(false);
}
function sample(){
 $("paste").value=`平均ST
今期 0.15 0.16 0.16 0.16 0.17 0.15
今節 0.10 0.23 0.12 0.19 0.15 0.18
展示 6.90 6.92 6.88 6.85 6.91 6.93
一周 37.5 37.7 37.4 37.3 37.6 37.8
全国 6.0 5.7 5.9 6.4 6.7 6.1
当地 5.8 5.4 5.9 6.1 6.0 5.9
地元 5.7 5.4 6.0 6.4 6.2 6.8
モーター 35 34 38 42 40 39`;
 analyze();
}
function makeRacer(b,i,d,p,w,wa,en,eg){
 const v=V(p); const r={boat:b,avg:d.avg[i]??DEFAULTS.avg[i],now:d.now[i]??DEFAULTS.now[i],tenji:d.tenji[i]??DEFAULTS.tenji[i],lap:d.lap[i]??DEFAULTS.lap[i],nat:d.nat[i]??DEFAULTS.nat[i],loc:d.loc[i]??DEFAULTS.loc[i],home:d.home[i]??DEFAULTS.home[i],motor:d.motor[i]??DEFAULTS.motor[i]};
 const course=courseValue(b,v);
 let dataScore=50+(r.nat-5.5)*8+(r.loc-5.5)*7+(r.home-5.5)*5+(0.18-r.avg)*95+(0.18-r.now)*85+(6.95-r.tenji)*25+(37.8-r.lap)*5+(r.motor-35)*0.18;
 let flowScore=50+course*4+(b===1?v.in/5:0)+(b===2?v.diff/7:0)+(b===3?v.attack3/6:0)+(b===4?v.keep4/6:0)+(b===5?v.out5/6:0)+(b===6?v.out6/6:0);
 if(["強風","荒れ","うねり"].includes(w)||["荒れ","うねり"].includes(wa)){if(b>=4)flowScore+=8;if(b===1)flowScore-=8;}
 if(wa==="潮あり"){dataScore+=(r.loc-5.5)*4;}
 if(en==="move"){if(b>=4)flowScore+=7;if(b===1)flowScore-=5;}
 if(en==="deep"){if(b===1)flowScore-=9;if(b>=3)flowScore+=7;}
 if(eg==="new"){dataScore-=Math.max(0,r.motor-40)*0.3;dataScore+=(0.18-r.now)*45;}
 r.dataScore=clamp(dataScore); r.flowCore=clamp(flowScore);
 r.akkun=clamp(dataScore*0.40+flowScore*0.60);
 r.attack=clamp(r.akkun+(b===3?7:0)+(b===4?4:0)+(r.now<=.13?5:0));
 r.flow=clamp(r.akkun+course/2);
 r.manshu=clamp(38+(b>=4?22:0)+(r.now<=.14?9:0)+(r.tenji<=6.88?9:0)+(r.loc>=6?5:0)+v.rough/4-(b===1?18:0));
 r.winRate=clamp(r.akkun*.72+(b===1&&v.in>=75?12:0));
 r.manshuPct=clamp(r.manshu*.8);
 return r;
}
function role(b){return["","イン逃げ/残し","2コース差し・残し","3コース攻め","4コース残し/まくり差し","展開拾い穴","道中拾い/3着穴"][b];}
function buffs(r,eg){const a=[];if(r.now<=.14)a.push("⬆️今節ST +12");if(r.tenji<=6.88)a.push("⬆️展示 +8");if(r.lap<=37.35)a.push("⬆️一周 +8");if(r.loc>=6)a.push("⬆️当地勝率 +6");if(r.home>=6)a.push("⬆️地元/相性 +5");if(r.motor>=40&&eg!=="new")a.push("⬆️モーター +2");if(r.motor>=40&&eg==="new")a.push("⬇️新エンジン期：モーター過信なし");if(r.now>=.18)a.push("⬇️今節ST遅め -6");return a.length?a.join("\\n"):"大きな補正なし";}
function missingList(){return["1-4-5","1-5-4","2-1-4","2-1-5","3-1-4","3-1-5","3-4-1","3-5-1","4-1-3","4-1-5","4-3-1","4-5-1","5-1-3","5-1-4","5-3-1","5-4-1","6-1-3","6-1-4","1-6-4","1-5-6","2-4-1","2-5-1","3-4-5","3-5-4","4-2-1","5-2-1","6-2-1","4-6-1","5-6-1","6-5-1"];}
function oddsCalc(){const a=$("oddsInput").value.trim().split(/[,\\s、]+/).map(parseFloat).filter(x=>x>0);return a.length?(1/a.reduce((s,x)=>s+1/x,0)).toFixed(1)+"倍":"未入力";}
function analyze(showStatus=true){
 const text=$("paste").value,p=$("place").value,w=$("wind").value,wa=$("water").value,en=$("entry").value,eg=$("engine").value;
 const d={avg:nums(text,"平均ST"),now:nums(text,"今節"),tenji:nums(text,"展示"),lap:nums(text,"一周"),nat:nums(text,"全国"),loc:nums(text,"当地"),home:nums(text,"地元"),motor:nums(text,"モーター",false)};
 const racers=[1,2,3,4,5,6].map((b,i)=>makeRacer(b,i,d,p,w,wa,en,eg));
 render(racers,p,w,wa,en,eg,showStatus);
}
function render(racers,p,w,wa,en,eg,showStatus){
 const v=V(p), rank=[...racers].sort((a,b)=>b.akkun-a.akkun), flowRank=[...racers].sort((a,b)=>b.flow-a.flow), manshu=[...racers].sort((a,b)=>b.manshu-a.manshu);
 if(showStatus)$("status").textContent=`反映OK：${PLACES[p]} / 風:${w} / 水面:${wa} / 進入:${en} / エンジン:${eg}`;
 $("racers").innerHTML=racers.map(r=>`<div class="racer"><b>🚤${r.boat}号艇</b><div class="score">あっくん指数 ${r.akkun}点</div><span class="badge">📊データ ${r.dataScore}</span><span class="badge">🧭展開 ${r.flowCore}</span><span class="badge">🔥攻め ${r.attack}</span><span class="badge">💣万舟 ${r.manshu}</span><p>平均ST ${r.avg} / 今節ST ${r.now} / 展示 ${r.tenji} / 一周 ${r.lap} / 全国 ${r.nat} / 当地 ${r.loc} / 地元 ${r.home} / M ${r.motor}%</p><pre>${buffs(r,eg)}</pre><p>${role(r.boat)}</p></div>`).join("");
 $("blue").textContent=`◎本命：${flowRank[0].boat}号艇 ${flowRank[0].akkun}点
${buffs(flowRank[0],eg)}
特徴：${role(flowRank[0].boat)}
本命率：${flowRank[0].winRate}%

○対抗：${flowRank[1].boat}号艇 ${flowRank[1].akkun}点
▲穴：${flowRank[2].boat}号艇 ${flowRank[2].akkun}点
△押さえ：${flowRank.slice(3).map(x=>x.boat+"号艇").join(" / ")}

本線：
${flowRank[0].boat}-${flowRank[1].boat}-${flowRank[2].boat}
${flowRank[0].boat}-${flowRank[2].boat}-${flowRank[1].boat}
1-2-34
1-3-245
1-4-23

一言：
指数40%・展開60%。艇番固定優遇なし。`;
 $("pink").textContent=`万舟軸：
${manshu.slice(0,4).map(x=>`${x.boat}号艇 万舟${x.manshu}点 / 期待${x.manshuPct}%`).join("\\n")}

4号艇期待度：${racers[3].manshu}点 / ${racers[3].manshuPct}%
5号艇期待度：${racers[4].manshu}点 / ${racers[4].manshuPct}%
6号艇期待度：${racers[5].manshu}点 / ${racers[5].manshuPct}%

万舟候補：
4-1-235
5-1-234
6-1-234
1-4-56
1-5-46
2-1-456
3-45-全

出てない目TOP30：
${$("missingInput").value.trim()||missingList().join(" / ")}

合成オッズ：${oddsCalc()}`;
 $("ticket").textContent=`🎯本線
1-23-2345
1-3-245

🛟押さえ
1-2-34
1-3-24
1-4-23

🌊流し
1-234-流し
1-45-2456

💣万舟
3-45-全
4-35-全
5-34-全
2-1-456

高指数：${rank.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}
展開軸：${flowRank.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}
万舟軸：${manshu.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}`;
 const fastest=[...racers].sort((a,b)=>a.now-b.now)[0], ten=[...racers].sort((a,b)=>a.tenji-b.tenji)[0], lap=[...racers].sort((a,b)=>a.lap-b.lap)[0], sam=[...racers].sort((a,b)=>(a.tenji+a.lap)-(b.tenji+b.lap));
 const slit=[];for(let i=0;i<5;i++){const diff=Math.abs(racers[i].now-racers[i+1].now);if(diff>=.10)slit.push(`${racers[i].boat}-${racers[i+1].boat}間 ST差${diff.toFixed(2)} 発動`);}
 $("theory").textContent=`🔥スリットアラート：
${slit.length?slit.join("\\n"):"ST差0.10以上なし"}
ST最速 ${fastest.boat}号艇 今節ST${fastest.now}

⏱ダブルタイム：
展示1位 ${ten.boat}号艇 展示${ten.tenji}
一周1位 ${lap.boat}号艇 一周${lap.lap}
${ten.boat===lap.boat?"同一艇で強アラート":"別艇。展示型と道中型を分ける"}

🌊新サムアラート：
${sam.slice(0,3).map((x,i)=>`${i+1}位 ${x.boat}号艇 合計${(x.tenji+x.lap).toFixed(2)}`).join("\\n")}

固定：
舟券太郎理論は5号艇限定ではなく全艇対象。
艇番固定優遇なし。状況と展開が揃った艇だけ加点。`;
 $("flow").textContent=`1逃げ：${v.in}%
2差し：${v.diff}%
3攻め：${v.attack3}%
4残し：${v.keep4}%
5期待：${v.out5}%
6期待：${v.out6}%

展開比重：60%
データ比重：40%
進入変化：${en}
水面：${wa}`;
 $("missingAuto").textContent=$("missingInput").value.trim()||missingList().join("\\n");
 $("venue").textContent=`${PLACES[p]}補正
${v.memo}

イン信頼度 ${v.in}
2差し期待度 ${v.diff}
3攻め期待度 ${v.attack3}
4残し期待度 ${v.keep4}
5コース期待度 ${v.out5}
6コース期待度 ${v.out6}
波乱度 ${v.rough}

風：${w}
水面：${wa}
進入：${en}
エンジン：${eg}`;
 $("alerts").textContent=`警戒：
・2差し残し
・3コース攻め
・4コース残し
・外枠3着
・当地勝率補正
・地元/相性補正
・モーター過信禁止
・艇番固定バイアス禁止`;
 $("comment").textContent=`あっくん向け最終コメント：
本命は${flowRank[0].boat}号艇中心。
ただし指数だけで切らず、1-2差し、1-3攻め、1-4残しを必ずカバー。
万舟は${manshu[0].boat}号艇を軸候補に、外枠だけでなく内側絡みも見る。
場を変えると風・水面・進入・エンジン傾向は自動反映。最後は貼り付けデータで再評価。`;
}
function init(){
 setSelectOptions();
 $("place").addEventListener("change", applyVenue);
 $("sampleBtn").addEventListener("click", sample);
 $("analyzeBtn").addEventListener("click", const place = $("place").value;
const race = $("race").value.replace("R", "");
const date = ymdJST();

const raceRes = await fetch(`/api/race?place=${place}&race=${race}&date=${date}&t=${Date.now()}`);
const raceData = await raceRes.json();

const hiyoriRes = await fetch(`/api/hiyori?place=${place}&race=${race}&date=${date}&t=${Date.now()}`);
const hiyoriData = await hiyoriRes.json();

  console.log({ raceData, hiyoriData });

  const s = hiyoriData.sections || {};

  $("paste").value =
`【日和 基本情報】
${s.basic || ""}

【日和 枠別情報】
${s.course || ""}

【日和 モーター情報】
${s.motor || ""}

【日和 今節成績】
${s.current || ""}

【日和 直前情報】
${s.before || ""}

【日和 オッズ検索】
${s.oddsSearch || ""}

【日和 オッズ一覧】
${s.oddsList || ""}

【日和 結果】
${s.result || ""}

【日和 出目ランク】
${s.kimariRank || ""}`;

  analyze(true);
});
 applyVenue();
 sample();
}
document.addEventListener("DOMContentLoaded", init);
})();
