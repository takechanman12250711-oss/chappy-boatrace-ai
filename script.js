const PLACES={"01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖","07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江","13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山","19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"};
const VENUE={
"01":{in:68,diff:45,attack3:50,keep4:46,out5:34,out6:30,rough:25,memo:"桐生：ナイター寄り。展示・ST・回り足重視。"},
"02":{in:52,diff:46,attack3:68,keep4:70,out5:61,out6:48,rough:66,memo:"戸田：狭水面。センター攻めと4残し。波乱強め。"},
"03":{in:35,diff:42,attack3:65,keep4:72,out5:76,out6:69,rough:80,memo:"江戸川：難水面。当地巧者・外枠・道中重視。"},
"04":{in:50,diff:48,attack3:66,keep4:62,out5:54,out6:42,rough:58,memo:"平和島：イン絶対ではない。センター攻め・4残し。"},
"05":{in:64,diff:46,attack3:55,keep4:52,out5:42,out6:35,rough:34,memo:"多摩川：静水面寄り。技量・展示・一周重視。"},
"06":{in:56,diff:45,attack3:60,keep4:58,out5:54,out6:42,rough:44,memo:"浜名湖：広水面。外の伸び・まくり差し注意。"},
"07":{in:70,diff:47,attack3:56,keep4:52,out5:42,out6:34,rough:30,memo:"蒲郡：ナイター。展示気配と回り足。"},
"08":{in:70,diff:47,attack3:56,keep4:52,out5:40,out6:32,rough:30,memo:"常滑：イン寄り。3攻め残し注意。"},
"09":{in:58,diff:45,attack3:62,keep4:58,out5:50,out6:40,rough:46,memo:"津：風で差し/まくり差し変化。"},
"10":{in:78,diff:44,attack3:50,keep4:45,out5:32,out6:28,rough:24,memo:"三国：モーニングはイン寄り。ST重視。"},
"11":{in:58,diff:45,attack3:56,keep4:54,out5:46,out6:38,rough:45,memo:"びわこ：風とうねり。道中足。"},
"12":{in:82,diff:50,attack3:52,keep4:45,out5:30,out6:25,rough:20,memo:"住之江：イン強め。2差しと3攻め両立。"},
"13":{in:62,diff:46,attack3:60,keep4:56,out5:45,out6:35,rough:35,memo:"尼崎：センター攻め残り注意。"},
"14":{in:56,diff:43,attack3:60,keep4:58,out5:52,out6:42,rough:52,memo:"鳴門：潮・風で波乱。外差し注意。"},
"15":{in:78,diff:46,attack3:60,keep4:57,out5:45,out6:35,rough:28,memo:"丸亀：ナイター。イン＋展示上位。3攻め、4残しは切らない。"},
"16":{in:62,diff:44,attack3:56,keep4:54,out5:48,out6:38,rough:42,memo:"児島：潮汐影響。地元/当地重視。"},
"17":{in:62,diff:42,attack3:58,keep4:59,out5:52,out6:42,rough:50,memo:"宮島：潮汐大。潮・風・当地巧者を重視。"},
"18":{in:82,diff:48,attack3:52,keep4:48,out5:34,out6:28,rough:22,memo:"徳山：イン強め。2差し・3攻め・4残し。"},
"19":{in:68,diff:46,attack3:56,keep4:52,out5:42,out6:34,rough:32,memo:"下関：ナイター。展示と当地。"},
"20":{in:68,diff:48,attack3:63,keep4:61,out5:58,out6:66,rough:46,memo:"若松：海水ナイター。地元・当地・道中を上げる。"},
"21":{in:82,diff:44,attack3:50,keep4:45,out5:32,out6:26,rough:20,memo:"芦屋：モーニング。イン寄り。"},
"22":{in:48,diff:45,attack3:62,keep4:64,out5:68,out6:55,rough:65,memo:"福岡：河口。2M波乱、外枠、道中艇注意。"},
"23":{in:78,diff:44,attack3:50,keep4:45,out5:34,out6:28,rough:22,memo:"唐津：イン寄り。地元補正。"},
"24":{in:92,diff:38,attack3:74,keep4:67,out5:45,out6:32,rough:18,memo:"大村：イン強め。新エンジン期はモーター過信せず、2差し残り・3攻め・4残しを必ず見る。"}};
function V(p){return VENUE[p]}
function init(){place.innerHTML=Object.entries(PLACES).map(([k,n])=>`<option value="${k}" ${k==="24"?"selected":""}>${n}</option>`).join("");race.innerHTML=Array.from({length:12},(_,i)=>`<option>${i+1}R</option>`).join("");sample()}
function sample(){paste.value=`平均ST
今期 0.15 0.16 0.16 0.16 0.17 0.15
今節 0.10 0.23 0.12 0.19 0.15 0.18
展示 6.90 6.92 6.88 6.85 6.91 6.93
一周 37.5 37.7 37.4 37.3 37.6 37.8
全国 6.0 5.7 5.9 6.4 6.7 6.1
当地 5.8 5.4 5.9 6.1 6.0 5.9
地元 5.7 5.4 6.0 6.4 6.2 6.8
モーター 35 34 38 42 40 39`;analyze()}
function nums(t,k,dec=true){let i=t.indexOf(k);if(i<0)return[];return (t.slice(i,i+180).match(dec?/\d+\.\d+/g:/\d+/g)||[]).map(Number).slice(0,6)}
function clamp(n){return Math.round(Math.max(1,Math.min(99,n)))}
function analyze(){let t=paste.value,p=place.value,w=wind.value,wa=water.value,en=entry.value,eg=engine.value;let d={avg:nums(t,"平均ST"),now:nums(t,"今節"),tenji:nums(t,"展示"),lap:nums(t,"一周"),nat:nums(t,"全国"),loc:nums(t,"当地"),home:nums(t,"地元"),motor:nums(t,"モーター",false)};let fb={avg:[.15,.16,.16,.16,.17,.15],now:[.14,.16,.16,.16,.17,.15],tenji:[6.90,6.92,6.88,6.85,6.91,6.93],lap:[37.5,37.7,37.4,37.3,37.6,37.8],nat:[6,5.7,5.9,6.4,6.7,6.1],loc:[5.8,5.4,5.9,6,6,5.9],home:[5.7,5.4,6,6.4,6.2,6.8],motor:[35,34,38,42,40,39]};let r=[1,2,3,4,5,6].map((b,i)=>makeR(b,i,d,fb,p,w,wa,en,eg));render(r,p,w,wa,en,eg)}
function courseValue(b,vv){return[0,vv.in/8,vv.diff/8,vv.attack3/8,vv.keep4/8,vv.out5/8,vv.out6/8][b]}
function makeR(b,i,d,fb,p,w,wa,en,eg){let vv=V(p),r={boat:b,avg:d.avg[i]||fb.avg[i],now:d.now[i]||fb.now[i],tenji:d.tenji[i]||fb.tenji[i],lap:d.lap[i]||fb.lap[i],nat:d.nat[i]||fb.nat[i],loc:d.loc[i]||fb.loc[i],home:d.home[i]||fb.home[i],motor:d.motor[i]||fb.motor[i]};let course=courseValue(b,vv);let base=50+(r.nat-5.5)*8+(r.loc-5.5)*7+(r.home-5.5)*5+(0.18-r.avg)*95+(0.18-r.now)*85+(6.95-r.tenji)*25+(37.8-r.lap)*5+(r.motor-35)*.18+course;
if(w==="強風"||wa==="荒れ"||wa==="うねり"){if(b>=4)base+=6;if(b===1)base-=5}
if(wa==="潮あり"){base+=(r.loc-5.5)*3}
if(en==="move"){if(b>=4)base+=4;if(b===1)base-=3}
if(en==="deep"){if(b===1)base-=6;if(b>=3)base+=4}
if(eg==="new"){base-=Math.max(0,r.motor-40)*.25;base+=(0.18-r.now)*35}
r.akkun=clamp(base);r.attack=clamp(r.akkun+(b===3?7:0)+(b===4?4:0)+(r.now<=.13?5:0));r.flow=clamp(r.akkun+course/2);r.manshu=clamp(38+(b>=4?22:0)+(r.now<=.14?9:0)+(r.tenji<=6.88?9:0)+(r.loc>=6?5:0)+vv.rough/4-(b===1?18:0));r.winRate=clamp(r.akkun*0.72 + (b===1&&vv.in>=75?12:0));r.manshuPct=clamp(r.manshu*0.8);return r}
function role(b){return["","イン逃げ/残し","2コース差し・残し","3コース攻め","4コース残し/まくり差し","展開拾い穴","道中拾い/3着穴"][b]}
function buffs(x,p,eg){let a=[];if(x.now<=.14)a.push("⬆️今節ST +12");if(x.tenji<=6.88)a.push("⬆️展示 +8");if(x.lap<=37.35)a.push("⬆️一周 +8");if(x.loc>=6)a.push("⬆️当地勝率 +6");if(x.home>=6)a.push("⬆️地元/相性 +5");if(x.motor>=40 && eg!=="new")a.push("⬆️モーター +2");if(x.motor>=40 && eg==="new")a.push("⬇️新エンジン期：モーター過信なし");if(x.now>=.18)a.push("⬇️今節ST遅め -6");return a.join("\n")}
function missingList(){return["1-4-5","1-5-4","2-1-4","2-1-5","3-1-4","3-1-5","3-4-1","3-5-1","4-1-3","4-1-5","4-3-1","4-5-1","5-1-3","5-1-4","5-3-1","5-4-1","6-1-3","6-1-4","1-6-4","1-5-6","2-4-1","2-5-1","3-4-5","3-5-4","4-2-1","5-2-1","6-2-1","4-6-1","5-6-1","6-5-1"]}
function oddsCalc(){let a=oddsInput.value.split(/[,\s、]+/).map(parseFloat).filter(x=>x>0);if(!a.length)return"未入力";return (1/a.reduce((s,x)=>s+1/x,0)).toFixed(1)+"倍"}
function render(r,p,w,wa,en,eg){let rank=[...r].sort((a,b)=>b.akkun-a.akkun),flowR=[...r].sort((a,b)=>b.flow-a.flow),man=[...r].sort((a,b)=>b.manshu-a.manshu),vv=V(p);status.textContent=`反映OK：${PLACES[p]} / 風:${w} / 水面:${wa} / 進入:${en} / エンジン:${eg}`;
racers.innerHTML=r.map(x=>`<div class="racer"><b>🚤${x.boat}号艇</b><div class="score">あっくん指数 ${x.akkun}点</div><span class="badge">🔥攻め ${x.attack}</span><span class="badge">🌊展開 ${x.flow}</span><span class="badge">💣万舟 ${x.manshu}</span><span class="badge">🎯本命率 ${x.winRate}%</span><p>平均ST ${x.avg} / 今節ST ${x.now} / 展示 ${x.tenji} / 一周 ${x.lap} / 全国 ${x.nat} / 当地 ${x.loc} / 地元 ${x.home} / M ${x.motor}%</p><pre>${buffs(x,p,eg)}</pre><p>${role(x.boat)}</p></div>`).join("");
blue.textContent=`◎本命：${flowR[0].boat}号艇 ${flowR[0].akkun}点
${buffs(flowR[0],p,eg)}
特徴：${role(flowR[0].boat)}
本命率：${flowR[0].winRate}%

○対抗：${flowR[1].boat}号艇 ${flowR[1].akkun}点
▲穴：${flowR[2].boat}号艇 ${flowR[2].akkun}点
△押さえ：${flowR.slice(3).map(x=>x.boat+"号艇").join(" / ")}

本線：
${flowR[0].boat}-${flowR[1].boat}-${flowR[2].boat}
${flowR[0].boat}-${flowR[2].boat}-${flowR[1].boat}
1-2-34
1-3-245
1-4-23

一言：
艇番固定優遇なし。展開・場・水面・ST・展示・当地で根拠がある艇だけ評価。`;
pink.textContent=`万舟軸：
${man.slice(0,4).map(x=>`${x.boat}号艇 万舟${x.manshu}点 / 期待${x.manshuPct}%`).join("\n")}

4号艇期待度：${r[3].manshu}点 / ${r[3].manshuPct}%
5号艇期待度：${r[4].manshu}点 / ${r[4].manshuPct}%
6号艇期待度：${r[5].manshu}点 / ${r[5].manshuPct}%

万舟候補：
4-1-235
5-1-234
6-1-234
1-4-56
1-5-46
2-1-456
3-45-全

出てない目TOP30：
${missingInput.value||missingList().join(" / ")}

合成オッズ：${oddsCalc()}`;
ticket.textContent=`🎯本線
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
展開軸：${flowR.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}
万舟軸：${man.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}`;
let fastest=[...r].sort((a,b)=>a.now-b.now)[0],ten=[...r].sort((a,b)=>a.tenji-b.tenji)[0],la=[...r].sort((a,b)=>a.lap-b.lap)[0],sam=[...r].sort((a,b)=>(a.tenji+a.lap)-(b.tenji+b.lap));let slit=[];for(let i=0;i<5;i++){let diff=Math.abs(r[i].now-r[i+1].now);if(diff>=.10)slit.push(`${r[i].boat}-${r[i+1].boat}間 ST差${diff.toFixed(2)} 発動`)}
theory.textContent=`🔥スリットアラート：
${slit.length?slit.join("\n"):"ST差0.10以上なし"}
ST最速 ${fastest.boat}号艇 今節ST${fastest.now}

⏱ダブルタイム：
展示1位 ${ten.boat}号艇 展示${ten.tenji}
一周1位 ${la.boat}号艇 一周${la.lap}
${ten.boat===la.boat?"同一艇で強アラート":"別艇。展示型と道中型を分ける"}

🌊新サムアラート：
${sam.slice(0,3).map((x,i)=>`${i+1}位 ${x.boat}号艇 合計${(x.tenji+x.lap).toFixed(2)}`).join("\n")}

固定：
舟券太郎理論は5号艇限定ではなく全艇対象。
艇番固定優遇なし。状況と展開が揃った艇だけ加点。`;
flow.textContent=`1逃げ：${vv.in}%
2差し：${vv.diff}%
3攻め：${vv.attack3}%
4残し：${vv.keep4}%
5期待：${vv.out5}%
6期待：${vv.out6}%

展開を作る艇：3・4
展開を拾う艇：4・5・6
進入変化：${en}
水面：${wa}`;
missingAuto.textContent=(missingInput.value||missingList().join("\n"));
venue.textContent=`${PLACES[p]}補正
${vv.memo}

イン信頼度 ${vv.in}
2差し期待度 ${vv.diff}
3攻め期待度 ${vv.attack3}
4残し期待度 ${vv.keep4}
5コース期待度 ${vv.out5}
6コース期待度 ${vv.out6}
波乱度 ${vv.rough}

風：${w}
水面：${wa}
進入：${en}
エンジン：${eg}`;
alerts.textContent=`警戒：
・2差し残し
・3コース攻め
・4コース残し
・外枠3着
・当地勝率補正
・地元/相性補正
・モーター過信禁止
・艇番固定バイアス禁止`;
comment.textContent=`あっくん向け最終コメント：
本命は${flowR[0].boat}号艇中心。
ただし指数だけで切らず、1-2差し、1-3攻め、1-4残しを必ずカバー。
万舟は${man[0].boat}号艇を軸候補に、外枠だけでなく内側絡みも見る。
特定艇の優遇は固定ではなく、場・展開・水面・ST・展示・当地が揃った時だけ。`;}
init();