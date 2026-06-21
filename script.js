const API="https://chappy-boatrace-api.takechanman12250711.workers.dev/";

const placeName={"01":"桐生","02":"戸田","03":"江戸川","04":"平和島","05":"多摩川","06":"浜名湖","07":"蒲郡","08":"常滑","09":"津","10":"三国","11":"びわこ","12":"住之江","13":"尼崎","14":"鳴門","15":"丸亀","16":"児島","17":"宮島","18":"徳山","19":"下関","20":"若松","21":"芦屋","22":"福岡","23":"唐津","24":"大村"};
const order=["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24"];
let selectedPlace="24", selectedRace="1";

const venueDB={
"01":{type:"標準",memo:"桐生：内寄り。ナイターは展示気配とST重視",in:5,center:2,out:1,rough:1,night:2,wind:2,tide:0,water:"淡水/ナイター",engine:"通常"},
"02":{type:"波乱",memo:"戸田：狭水面。センター攻め・4残し・波乱",in:2,center:5,out:4,rough:5,night:0,wind:3,tide:0,water:"淡水/狭水面",engine:"通常"},
"03":{type:"超波乱",memo:"江戸川：波風・当地巧者・外枠波乱。道中重視",in:0,center:4,out:6,rough:7,night:0,wind:7,tide:2,water:"河川/難水面",engine:"通常"},
"04":{type:"波乱",memo:"平和島：イン絶対ではない。2差し・4残し",in:2,center:5,out:3,rough:4,night:0,wind:4,tide:2,water:"海水",engine:"通常"},
"05":{type:"標準",memo:"多摩川：静水面寄り。展示・一周・技量",in:4,center:3,out:2,rough:2,night:0,wind:2,tide:0,water:"淡水",engine:"通常"},
"06":{type:"標準",memo:"浜名湖：広水面。外の伸びとまくり差し",in:3,center:4,out:3,rough:3,night:0,wind:4,tide:1,water:"汽水/広水面",engine:"通常"},
"07":{type:"ナイター",memo:"蒲郡：ナイター。展示気配・回り足",in:5,center:3,out:2,rough:2,night:3,wind:2,tide:1,water:"汽水/ナイター",engine:"通常"},
"08":{type:"標準",memo:"常滑：イン寄りだが3攻め注意",in:5,center:3,out:2,rough:2,night:0,wind:3,tide:1,water:"海水",engine:"通常"},
"09":{type:"風注意",memo:"津：風向きで差し/まくり差し変化",in:3,center:4,out:3,rough:3,night:0,wind:4,tide:0,water:"淡水",engine:"通常"},
"10":{type:"イン",memo:"三国：モーニングはイン寄り。ST重視",in:6,center:2,out:1,rough:1,night:0,wind:2,tide:0,water:"淡水/モーニング",engine:"通常"},
"11":{type:"風注意",memo:"びわこ：風とうねり注意。道中足",in:3,center:3,out:3,rough:3,night:0,wind:5,tide:0,water:"淡水",engine:"通常"},
"12":{type:"イン",memo:"住之江：イン強め。2差し・3攻め両立",in:7,center:2,out:1,rough:1,night:3,wind:1,tide:0,water:"淡水/ナイター",engine:"通常"},
"13":{type:"標準",memo:"尼崎：センター攻め残り注意",in:4,center:4,out:2,rough:2,night:0,wind:2,tide:0,water:"淡水",engine:"通常"},
"14":{type:"潮風",memo:"鳴門：潮・風で波乱。外差し注意",in:3,center:4,out:3,rough:4,night:0,wind:4,tide:5,water:"海水/潮",engine:"通常"},
"15":{type:"ナイター",memo:"丸亀：ナイター。イン＋展示上位",in:6,center:3,out:2,rough:2,night:3,wind:2,tide:2,water:"海水/ナイター",engine:"通常"},
"16":{type:"潮",memo:"児島：潮汐影響。地元/当地重視",in:4,center:3,out:3,rough:3,night:0,wind:3,tide:4,water:"海水/潮",engine:"通常"},
"17":{type:"潮",memo:"宮島：潮汐大。時間帯・当地巧者",in:4,center:3,out:3,rough:4,night:0,wind:3,tide:6,water:"海水/潮",engine:"通常"},
"18":{type:"イン",memo:"徳山：イン強め。2差し・3攻め・4残し",in:7,center:2,out:1,rough:1,night:0,wind:2,tide:2,water:"海水/モーニング",engine:"通常"},
"19":{type:"ナイター",memo:"下関：ナイター。展示と当地",in:5,center:3,out:2,rough:2,night:3,wind:3,tide:2,water:"海水/ナイター",engine:"通常"},
"20":{type:"海水ナイター",memo:"若松：海水ナイター。6号艇道中・当地補正",in:4,center:3,out:4,rough:4,night:4,wind:4,tide:3,water:"海水/ナイター",engine:"通常"},
"21":{type:"イン",memo:"芦屋：モーニング。イン寄り",in:7,center:2,out:1,rough:1,night:0,wind:2,tide:0,water:"淡水/モーニング",engine:"通常"},
"22":{type:"波乱",memo:"福岡：河口。2M波乱・外枠/道中艇",in:2,center:4,out:5,rough:5,night:0,wind:5,tide:5,water:"汽水/河口",engine:"通常"},
"23":{type:"イン",memo:"唐津：イン寄り。地元補正",in:6,center:2,out:1,rough:1,night:0,wind:2,tide:1,water:"淡水/モーニング",engine:"通常"},
"24":{type:"イン",memo:"大村：イン有利。ただし新エンジン期はモーター過信禁止。2差し・3攻め・4残し",in:8,center:3,out:1,rough:1,night:3,wind:2,tide:2,water:"海水/ナイター",engine:"新エンジン注意"}
};

function init(){
 document.getElementById("placeGrid").innerHTML=order.map(c=>`<button class="placeBtn" id="p${c}" onclick="setPlace('${c}')">${placeName[c]}</button>`).join("");
 document.getElementById("raceGrid").innerHTML=Array.from({length:12},(_,i)=>`<button class="raceBtn" id="r${i+1}" onclick="setRace('${i+1}')">${i+1}R</button>`).join("");
 active();
}
function setPlace(c){selectedPlace=c;active();document.getElementById("status").textContent=`${placeName[c]}を選択。取得ボタンで解析。`;}
function setRace(r){selectedRace=r;active();document.getElementById("status").textContent=`${r}Rを選択。取得ボタンで解析。`;}
function active(){order.forEach(c=>document.getElementById("p"+c)?.classList.toggle("active",c===selectedPlace));for(let i=1;i<=12;i++)document.getElementById("r"+i)?.classList.toggle("active",String(i)===String(selectedRace));}
function jumpTo(id){document.getElementById(id+"Card")?.scrollIntoView({behavior:"smooth"});}

async function loadRace(){
 const url=API+"?source=both&place="+selectedPlace+"&race="+selectedRace;
 document.getElementById("status").textContent="取得中...";
 try{
  const res=await fetch(url);
  const data=await res.json();
  const officialHtml=data.officialHtml||data.official?.html||data.official?.preview||"";
  const hiyoriHtml=data.hiyoriHtml||data.hiyori?.[0]?.html||data.hiyori?.[0]?.preview||"";
  document.getElementById("status").textContent=`✅取得成功
場：${placeName[selectedPlace]} ${selectedRace}R
公式HTML：${data.officialLength||data.official?.length||officialHtml.length}
日和HTML：${data.hiyoriLength||data.hiyori?.[0]?.length||hiyoriHtml.length}
場補正：${venueDB[selectedPlace].memo}`;
  const racers=parseRace(officialHtml,hiyoriHtml,selectedPlace);
  analyze(racers,selectedPlace,selectedRace);
 }catch(e){document.getElementById("status").textContent="取得失敗："+e;}
}

function strip(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g,"\n").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\r/g,"\n").replace(/\n+/g,"\n").split("\n").map(x=>x.trim()).filter(Boolean);}
function numsNear(lines,key,range=170){const i=lines.findIndex(x=>x.includes(key));if(i<0)return [];return (lines.slice(i,i+range).join(" ").match(/\d+\.\d{2}/g)||[]).map(Number).slice(0,6);}
function namesFrom(lines){const bad=["出走表","全国","当地","勝率","モーター","ボート","展示","進入","選手","登録番号","支部","級別","平均ST","発売","締切","オッズ"];const arr=[];for(const x of lines){if(/^[一-龯ぁ-んァ-ンー]{2,9}$/.test(x)&&!bad.includes(x)&&!/発売|締切|オッズ|レース|一覧|予想|結果/.test(x))arr.push(x);}return [...new Set(arr)].slice(0,6);}
function gradesFrom(lines){return lines.filter(x=>/^(A1|A2|B1|B2)$/.test(x)).slice(0,6);}

function parseRace(officialHtml,hiyoriHtml,place){
 const o=strip(officialHtml), h=strip(hiyoriHtml);
 const names=namesFrom(o), grades=gradesFrom(o);
 const national=numsNear(o,"全国"), local=numsNear(o,"当地"), motor=numsNear(o,"モーター"), boatRate=numsNear(o,"ボート");
 const tenji=numsNear(h,"展示"), lap=numsNear(h,"一周"), st=numsNear(h,"ST");
 const fb=[
  {st:.15,tenji:6.90,lap:37.5,win:6.0,local:5.8,motor:35,boatRate:35},
  {st:.16,tenji:6.92,lap:37.7,win:5.7,local:5.4,motor:34,boatRate:34},
  {st:.15,tenji:6.88,lap:37.4,win:5.9,local:5.9,motor:38,boatRate:36},
  {st:.17,tenji:6.85,lap:37.3,win:6.4,local:6.1,motor:42,boatRate:38},
  {st:.14,tenji:6.91,lap:37.6,win:6.7,local:6.0,motor:40,boatRate:37},
  {st:.17,tenji:6.93,lap:37.8,win:6.1,local:5.9,motor:39,boatRate:36}
 ];
 return fb.map((f,i)=>{
  const r={boat:i+1,name:names[i]||`${i+1}号艇`,grade:grades[i]||"",national:Number(national[i]||f.win),local:Number(local[i]||f.local),motor:Number(motor[i]||f.motor),boatRate:Number(boatRate[i]||f.boatRate),tenji:Number(tenji[i]||f.tenji),lap:Number(lap[i]||f.lap),st:Number(st[i]||f.st)};
  r.indexScore=calcIndex(r,place);
  r.flowScore=calcFlow(r,place);
  r.manshuScore=calcManshu(r,place);
  r.buyScore=Math.round(r.indexScore*.50+r.flowScore*.35+r.manshuScore*.15);
  return r;
 });
}

function venueBonus(place,r){const v=venueDB[place];let b=0;if(r.boat===1)b+=v.in;if(r.boat===3)b+=v.center;if(r.boat===4)b+=v.center+1;if(r.boat>=5)b+=v.out;if(place==="20"&&r.boat===6)b+=6;if(place==="03"&&r.boat>=4)b+=6;if(place==="22"&&r.boat>=4)b+=5;return b;}
function calcIndex(r,place){let s=50;s+=(r.national-5.5)*8;s+=(r.local-5.5)*6;s+=(0.18-r.st)*105;s+=(6.95-r.tenji)*22;s+=(37.8-r.lap)*4;s+=(r.motor-35)*.22;s+=(r.boatRate-35)*.08;s+=venueBonus(place,r);if(r.grade==="A1")s+=6;if(r.grade==="A2")s+=3;if(r.boat>=5)s-=2;if(venueDB[place].engine.includes("新"))s-=Math.max(0,(r.motor-40))*0.15;return Math.round(Math.max(1,Math.min(99,s)));}
function calcFlow(r,place){const v=venueDB[place];let s=50;if(r.boat===1)s+=18+v.in;if(r.boat===2)s+=13;if(r.boat===3)s+=14+v.center;if(r.boat===4)s+=11+v.center;if(r.boat===5)s+=8+v.out;if(r.boat===6)s+=6+v.out;s+=(0.18-r.st)*75;s+=(6.95-r.tenji)*14;s+=(r.local-5.5)*6;if(place==="24"&&r.boat===1)s+=7;if(place==="20"&&r.boat===6)s+=8;if(place==="03"&&r.boat>=4)s+=8;if(place==="22"&&r.boat>=4)s+=6;return Math.round(Math.max(1,Math.min(99,s)));}
function calcManshu(r,place){const v=venueDB[place];let s=40;if(r.boat>=4)s+=18;if(r.boat>=5)s+=10;if(r.st<=.14)s+=8;if(r.tenji<=6.88)s+=6;if(r.local>=6.0)s+=5;if(v.rough>=4)s+=8;if(v.tide>=4)s+=4;if(v.wind>=4)s+=4;if(r.boat===1)s-=18;return Math.round(Math.max(1,Math.min(99,s)));}
function role(r){return ["","イン逃げ/残し役","2コース差し役。指数低くても切らない","3コース攻め役。展開の起点","4コース残し/まくり差し役","展開拾い/まくり差し穴","道中拾い/3着候補"][r.boat];}
function buffs(r,place){let u=[],d=[];const v=venueDB[place];if(r.grade==="A1")u.push("⬆️級別A1 +6");if(r.grade==="A2")u.push("⬆️級別A2 +3");if(r.national>=6.5)u.push("⬆️全国勝率上位 +6");if(r.local>=6.0)u.push("⬆️当地勝率 +6");if(r.local<5)d.push("⬇️当地不安 -4");if(r.st<=.13)u.push("⬆️ST優秀 +5");if(r.st>=.18)d.push("⬇️ST遅め -4");if(r.tenji<=6.85)u.push("⬆️展示上位 +5");if(r.tenji>=6.95)d.push("⬇️展示弱め -3");if(r.lap<=37.35)u.push("⬆️一周上位 +5");if(r.motor>=40)u.push("⬆️モーター良 +2");if(v.tide>=4)u.push("⬆️潮補正あり");if(v.wind>=4)u.push("⬆️風/波乱補正あり");if(place==="20"&&r.boat===6)u.push("⬆️若松6道中補正");if(place==="03"&&r.boat>=4)u.push("⬆️江戸川外枠波乱");if(r.boat>=5)d.push("⬇️外枠補正 -2");if(v.engine.includes("新"))d.push("⬇️新エンジン期：モーター過信禁止");return u.concat(d);}
function odds(){const a=document.getElementById("odds").value.split(/[,\s、]+/).map(parseFloat).filter(x=>x>0);if(!a.length)return "未入力";return (1/a.reduce((s,x)=>s+1/x,0)).toFixed(1)+"倍";}

function analyze(racers,place,race){
 const idx=[...racers].sort((a,b)=>b.indexScore-a.indexScore), fl=[...racers].sort((a,b)=>b.flowScore-a.flowScore), buy=[...racers].sort((a,b)=>b.buyScore-a.buyScore), man=[...racers].sort((a,b)=>b.manshuScore-a.manshuScore);
 const fastest=[...racers].sort((a,b)=>a.st-b.st)[0], tenji=[...racers].sort((a,b)=>a.tenji-b.tenji)[0], lap=[...racers].sort((a,b)=>a.lap-b.lap)[0], sam=[...racers].sort((a,b)=>(a.tenji+a.lap)-(b.tenji+b.lap));
 renderBoats(racers,place);renderBlue(idx,fl,buy);renderPink(racers,man);renderTheory(racers,fastest,tenji,lap,sam,place);renderFormation(idx,fl,buy,man,place);renderFlow(racers,place);renderVenue(place);renderAlerts(racers,place,tenji,lap);renderAI(idx,fl,man,place);renderWhy(place);
}
function renderBoats(racers,place){document.getElementById("boats").innerHTML=racers.map(r=>`<div class="boat"><h3>🚤${r.boat}号艇 ${r.name} ${r.grade}</h3><div class="score">指数${r.indexScore} / 展開${r.flowScore} / 万舟${r.manshuScore} / 買い${r.buyScore}</div><span class="badge">🔥攻め ${r.indexScore-3}</span><span class="badge">🌊展開 ${r.flowScore}</span><span class="badge">💣万舟 ${r.manshuScore}</span><span class="badge">🏠当地 ${Math.round(50+(r.local-5.5)*12)}</span><p>ST ${r.st} / 展示 ${r.tenji} / 一周 ${r.lap} / 全国 ${r.national} / 当地 ${r.local} / M ${r.motor}%</p><pre>${buffs(r,place).join("\n")||"大きな補正なし"}</pre><p><b>一言：</b>${role(r)}</p></div>`).join("");}
function renderBlue(idx,fl,buy){document.getElementById("blue").textContent=`【指数ランキング】※指数＝買い目ではない
${idx.map(r=>`${r.boat}号艇 ${r.name} 指数${r.indexScore}`).join("\n")}

【展開ランキング】
${fl.map(r=>`${r.boat}号艇 ${r.name} 展開${r.flowScore}`).join("\n")}

【買い総合】
${buy.map(r=>`${r.boat}号艇 ${r.name} 買い${r.buyScore}`).join("\n")}

◎本命：${fl[0].boat}号艇 ${fl[0].name}
○対抗：${fl[1].boat}号艇 ${fl[1].name}
▲穴：${fl[2].boat}号艇 ${fl[2].name}
△押さえ：${fl.slice(3).map(x=>x.boat+"号艇").join(" / ")}

🎯本線
${fl[0].boat}-${fl[1].boat}${fl[2].boat}-${fl.slice(1,5).map(x=>x.boat).join("")}

🚤展開本線
1-3-245
1-2-345

🛟安全押さえ
1-2-34
1-3-24
1-4-23

🌊流し
1-234-流し
1-45-2456`; }
function renderPink(racers,man){document.getElementById("pink").textContent=`💣万舟ランキング
${man.map(x=>`${x.boat}号艇 ${x.name} 万舟${x.manshuScore}`).join("\n")}

4号艇期待度：${racers[3].manshuScore}
5号艇期待度：${racers[4].manshuScore}
6号艇期待度：${racers[5].manshuScore}

外枠万舟
4-1-235
5-1-234
6-1-234

内側絡み万舟
1-4-56
1-5-46
2-1-456
3-1-456

展開崩れ
3-45-全
4-35-全
5-34-全

出てない目TOP30メモ：
${document.getElementById("missing").value.trim()||"未入力"}

合成オッズ：${odds()}`;}
function renderTheory(racers,fastest,tenji,lap,sam,place){let alerts=[];for(let i=0;i<5;i++){let diff=Math.abs(racers[i].st-racers[i+1].st);if(diff>=.10)alerts.push(`${racers[i].boat}-${racers[i+1].boat}間 ST差${diff.toFixed(2)} 発動`);}document.getElementById("theory").textContent=`🔥スリットアラート
${alerts.length?alerts.join("\n"):"0.10以上差はなし"}
ST最速：${fastest.boat}号艇 ST${fastest.st}

⏱ダブルタイム
展示1位：${tenji.boat}号艇 展示${tenji.tenji}
一周1位：${lap.boat}号艇 一周${lap.lap}
${tenji.boat===lap.boat?"同一艇で強アラート":"別艇。展示型と道中型を分ける"}

🌊新サム
${sam.slice(0,3).map((r,i)=>`${i+1}位 ${r.boat}号艇 展示＋一周 ${(r.tenji+r.lap).toFixed(2)}`).join("\n")}

🚨万舟警報
${venueDB[place].rough>=4?"波乱場補正あり。外枠・3着穴を強めに見る。":"標準/イン寄り。穴は3着絡み中心。"}

舟券太郎理論は5号艇限定ではなく全艇対象。`;}
function renderFormation(idx,fl,buy,man,place){document.getElementById("formation").textContent=`本線：1-23-2345
攻め：1-3-245
差し：1-2-345
残し：1-4-23
流し：1-234-流し
穴流し：3-45-全 / 4-35-全 / 5-34-全

高指数艇：${idx.slice(0,3).map(r=>r.boat+"号艇").join(" / ")}
展開軸：${fl.slice(0,3).map(r=>r.boat+"号艇").join(" / ")}
買い総合：${buy.slice(0,3).map(r=>r.boat+"号艇").join(" / ")}
万舟軸：${man.slice(0,3).map(r=>r.boat+"号艇").join(" / ")}

※指数上位と安全フォーメーションは分ける。`;}
function renderFlow(racers,place){const v=venueDB[place];let one=50+v.in*3,two=12+Math.max(0,8-v.in),three=12+v.center*2,four=8+v.center,outside=5+v.out*2;document.getElementById("flow").textContent=`1逃げ：${one}%
2差し：${two}%
3まくり/攻め：${three}%
4まくり差し/残し：${four}%
5・6展開拾い：${outside}%

展開メモ：
1が強い場でも2差しは残す。
3が攻める時は4残し。
外枠は指数が低くても万舟・3着で評価。`;}
function renderVenue(place){const v=venueDB[place];document.getElementById("venue").textContent=`${placeName[place]}補正
水面：${v.water}
タイプ：${v.type}
エンジン：${v.engine}

⬆️イン補正：+${v.in}
⬆️センター攻め補正：+${v.center}
⬆️外枠期待：+${v.out}
⬆️波乱度：+${v.rough}
⬆️ナイター補正：+${v.night}
⬆️風補正：+${v.wind}
⬆️潮補正：+${v.tide}

説明：
${v.memo}`;}
function renderAlerts(racers,place,tenji,lap){const v=venueDB[place];let arr=[];if(v.engine.includes("新"))arr.push("新エンジン補正：モーター数字を下げて、ST・展示・技量を優先");if(v.wind>=4)arr.push("風補正：外枠・センター攻め・道中波乱を上げる");if(v.tide>=4)arr.push("潮補正：当地巧者と展示/一周を上げる");if(tenji.boat===lap.boat)arr.push("ダブルタイム強アラート：展示1位と一周1位が同一");if(racers.some(r=>r.boat>=4&&r.manshuScore>=70))arr.push("万舟警報：外枠期待度70以上あり");document.getElementById("alerts").textContent=arr.length?arr.join("\n"):"強アラートなし";}
function renderAI(idx,fl,man,place){document.getElementById("aiComment").textContent=`AI展開コメント：
${placeName[place]}は「${venueDB[place].memo}」。
指数トップは${idx[0].boat}号艇、展開トップは${fl[0].boat}号艇。
ただし買い目は指数だけでは決めない。

本命は展開軸${fl[0].boat}号艇から。
2コース差し、3コース攻め、4コース残しを必ずカバー。
万舟は${man[0].boat}号艇を中心に、外枠だけでなく内側絡みも見る。`;}
function renderWhy(place){document.getElementById("why").textContent=`なぜそうなる？
・指数は選手技量、全国/当地、ST、展示、一周、モーターを数値化。
・買い目は指数だけでなく、コースと展開を優先。
・2コース差しは展開上の保険として残す。
・3コース攻めがある時は4コース残しを残す。
・外枠は指数が低くても、万舟・3着・展開拾いで評価。
・${placeName[place]}は「${venueDB[place].memo}」なので場補正を加えている。
・モーターと展示だけで買わず、当地勝率・ST・道中足を混ぜている。`;}
init();
