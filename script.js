const PLACES={"01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖","07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江","13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山","19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"};
const VENUE={"24":{in:9,center:4,out:2,rough:1,memo:"大村：イン有利。新エンジン期はモーター過信なし。2差し届きにくいが残しは切らない。3攻め・4残し。"},"20":{in:5,center:4,out:5,rough:4,memo:"若松：海水ナイター。当地・道中・6号艇の絡みを上げる。"},"15":{in:7,center:4,out:3,rough:2,memo:"丸亀：ナイター。イン＋展示上位。3攻め・4残しも見る。"},"17":{in:5,center:4,out:4,rough:4,memo:"宮島：潮汐大。潮・風・当地巧者を重視。"},"22":{in:3,center:5,out:6,rough:6,memo:"福岡：河口。2M波乱、外枠・道中艇注意。"},"03":{in:1,center:5,out:7,rough:8,memo:"江戸川：難水面。当地巧者・外枠・道中重視。"},"02":{in:3,center:6,out:5,rough:6,memo:"戸田：狭水面。センター攻め、4残し、波乱。"}};
function v(place){return VENUE[place]||{in:5,center:3,out:3,rough:3,memo:PLACES[place]+"：標準補正。ST・展示・当地を重視。"}}
function init(){const p=document.getElementById("place");p.innerHTML=Object.entries(PLACES).map(([k,n])=>`<option value="${k}" ${k==="24"?"selected":""}>${n}</option>`).join("");document.getElementById("race").innerHTML=Array.from({length:12},(_,i)=>`<option>${i+1}R</option>`).join("");sample();}
function sample(){document.getElementById("paste").value=`平均ST
今期 0.15 0.16 0.16 0.16 0.17 0.15
今節 0.10 0.23 0.12 0.19 0.15 0.18
展示 6.90 6.92 6.88 6.85 6.91 6.93
一周 37.5 37.7 37.4 37.3 37.6 37.8
全国 6.0 5.7 5.9 6.4 6.7 6.1
当地 5.8 5.4 5.9 6.1 6.0 5.9
モーター 35 34 38 42 40 39`;analyze();}
function nums(text,key,dec=true){const i=text.indexOf(key);if(i<0)return [];const s=text.slice(i,i+180);const re=dec?/\d+\.\d+/g:/\d+/g;return (s.match(re)||[]).map(Number).slice(0,6);}
function analyze(){const text=document.getElementById("paste").value,place=document.getElementById("place").value,wind=document.getElementById("wind").value,water=document.getElementById("water").value;let st=nums(text,"平均ST"),now=nums(text,"今節"),tenji=nums(text,"展示"),lap=nums(text,"一周"),nat=nums(text,"全国"),loc=nums(text,"当地"),motor=nums(text,"モーター",false);const fb={st:[.15,.16,.16,.16,.17,.15],now:[.14,.16,.16,.16,.17,.15],tenji:[6.90,6.92,6.88,6.85,6.91,6.93],lap:[37.5,37.7,37.4,37.3,37.6,37.8],nat:[6.0,5.7,5.9,6.4,6.7,6.1],loc:[5.8,5.4,5.9,6.1,6.0,5.9],motor:[35,34,38,42,40,39]};const r=[1,2,3,4,5,6].map((b,i)=>makeRacer(b,i,{st,now,tenji,lap,nat,loc,motor,fb},place,wind,water));render(r,place,wind,water);}
function makeRacer(b,i,d,place,wind,water){const vv=v(place);const r={boat:b,avg:d.st[i]||d.fb.st[i],now:d.now[i]||d.fb.now[i],tenji:d.tenji[i]||d.fb.tenji[i],lap:d.lap[i]||d.fb.lap[i],nat:d.nat[i]||d.fb.nat[i],loc:d.loc[i]||d.fb.loc[i],motor:d.motor[i]||d.fb.motor[i]};let s=50+(r.nat-5.5)*8+(r.loc-5.5)*6+(0.18-r.avg)*100+(0.18-r.now)*80+(6.95-r.tenji)*25+(37.8-r.lap)*5+(r.motor-35)*.25;if(b===1)s+=vv.in+10;if(b===2)s+=5;if(b===3)s+=vv.center+8;if(b===4)s+=vv.center+5;if(b>=5)s+=vv.out-2;if(wind==="強風"||water==="荒れ"){if(b>=4)s+=5;if(b===1)s-=4}r.score=Math.round(Math.max(1,Math.min(99,s)));r.attack=Math.round(r.score+(b===3?5:0)+(b===4?3:0));r.flow=Math.round(r.score+(b===1?vv.in:0)+(b>=4?vv.rough:0));r.manshu=Math.round(Math.max(1,Math.min(99,40+(b>=4?25:0)+(b>=5?10:0)+(r.now<=.14?8:0)+(r.tenji<=6.88?8:0)+vv.rough*2-(b===1?18:0))));return r;}
function role(b){return ["","イン逃げ/残し","2コース差し・残し","3コース攻め","4コース残し/まくり差し","展開拾い穴","道中拾い/3着穴"][b]}
function render(r,place,wind,water){const rank=[...r].sort((a,b)=>b.score-a.score),flow=[...r].sort((a,b)=>b.flow-a.flow),man=[...r].sort((a,b)=>b.manshu-a.manshu);document.getElementById("status").textContent=`反映OK：${PLACES[place]} / 風:${wind} / 水面:${water}`;document.getElementById("racers").innerHTML=r.map(x=>`<div class="racer"><b>🚤${x.boat}号艇</b><div class="score">${x.score}点</div><span class="badge">🔥攻め ${x.attack}</span><span class="badge">🌊展開 ${x.flow}</span><span class="badge">💣万舟 ${x.manshu}</span><p>平均ST ${x.avg} / 今節ST ${x.now} / 展示 ${x.tenji} / 一周 ${x.lap} / 全国 ${x.nat} / 当地 ${x.loc} / M ${x.motor}%</p><p>${role(x.boat)}</p></div>`).join("");document.getElementById("blue").textContent=`◎本命：${flow[0].boat}号艇 ${flow[0].score}点
○対抗：${flow[1].boat}号艇 ${flow[1].score}点
▲穴：${flow[2].boat}号艇 ${flow[2].score}点
△押さえ：${flow.slice(3).map(x=>x.boat+"号艇").join(" / ")}

本線：
${flow[0].boat}-${flow[1].boat}${flow[2].boat}-${flow.slice(1,5).map(x=>x.boat).join("")}

バフ：
・展開軸は${flow[0].boat}号艇
・2コース差し、3コース攻め、4コース残しは切らない
・高指数艇と安全カバーは分ける`;document.getElementById("pink").textContent=`万舟軸：
${man.slice(0,4).map(x=>`${x.boat}号艇 万舟${x.manshu}`).join("\n")}

外枠期待度：
4号艇 ${r[3].manshu}
5号艇 ${r[4].manshu}
6号艇 ${r[5].manshu}

万舟候補：
4-1-235
5-1-234
6-1-234
1-4-56
1-5-46
2-1-456
3-45-全`;document.getElementById("ticket").textContent=`本線：1-23-2345
攻め：1-3-245
差し：1-2-345
残し：1-4-23
流し：1-234-流し
穴流し：3-45-全 / 4-35-全 / 5-34-全

指数上位：${rank.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}
展開上位：${flow.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}
万舟上位：${man.slice(0,3).map(x=>x.boat+"号艇").join(" / ")}`;const fastest=[...r].sort((a,b)=>a.now-b.now)[0],ten=[...r].sort((a,b)=>a.tenji-b.tenji)[0],la=[...r].sort((a,b)=>a.lap-b.lap)[0],sam=[...r].sort((a,b)=>(a.tenji+a.lap)-(b.tenji+b.lap));document.getElementById("theory").textContent=`🔥スリットアラート：
ST最速 ${fastest.boat}号艇 今節ST${fastest.now}

⏱ダブルタイム：
展示1位 ${ten.boat}号艇 展示${ten.tenji}
一周1位 ${la.boat}号艇 一周${la.lap}

🌊新サムアラート：
${sam.slice(0,3).map((x,i)=>`${i+1}位 ${x.boat}号艇 合計${(x.tenji+x.lap).toFixed(2)}`).join("\n")}

固定ルール：
舟券太郎理論は5号艇限定ではなく全艇対象。
モーター過信なし。ST・展示・当地・展開を重視。`;const vv=v(place);document.getElementById("flow").textContent=`1逃げ：${50+vv.in*3}%
2差し：${15+Math.max(0,5-vv.in)}%
3攻め：${15+vv.center*2}%
4残し/まくり差し：${10+vv.center}%
5・6展開拾い：${8+vv.out*2}%

AIコメント：
${PLACES[place]}は${vv.memo}
展開を作る艇と拾う艇を分ける。`;document.getElementById("venue").textContent=`${PLACES[place]}補正
${vv.memo}

イン補正：+${vv.in}
センター補正：+${vv.center}
外枠補正：+${vv.out}
波乱補正：+${vv.rough}

風：${wind}
水面：${water}`;document.getElementById("alerts").textContent=`警戒：
・2差し残し
・3コース攻め
・4コース残し
・外枠3着
・当地勝率補正
・モーター過信禁止`;document.getElementById("comment").textContent=`最終コメント：
本命は${flow[0].boat}号艇中心。
ただし指数だけで切らず、1-2差し、1-3攻め、1-4残しは必ずカバー。
万舟は${man[0].boat}号艇を軸候補に、外枠だけでなく内側絡みも見る。`;}
init();
