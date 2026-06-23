(() => {
  "use strict";

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
    "20":{wind:"追い風",water:"普通",entry:"normal",engine:"normal",memo:"若松：当地巧者・道中拾い注意"},
    "24":{wind:"無風",water:"普通",entry:"normal",engine:"new",memo:"大村：イン有利。新エンジン期は選手技量・今節ST重視"}
  };

  function setOptions(){
    $("place").innerHTML = Object.entries(PLACES).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");
    $("race").innerHTML = Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}R</option>`).join("");
    $("wind").innerHTML = OPTIONS.wind.map(x=>`<option>${x}</option>`).join("");
    $("water").innerHTML = OPTIONS.water.map(x=>`<option>${x}</option>`).join("");
    $("entry").innerHTML = OPTIONS.entry.map(([v,t])=>`<option value="${v}">${t}</option>`).join("");
    $("engine").innerHTML = OPTIONS.engine.map(([v,t])=>`<option value="${v}">${t}</option>`).join("");
    $("place").value = "24";
    $("race").value = "1";
  }

  function venueData(){
    return VENUE[$("place").value] || {
      wind:"無風", water:"普通", entry:"normal", engine:"normal",
      memo:`${PLACES[$("place").value]}：標準補正`
    };
  }

  function applyVenue(){
    const v = venueData();
    $("wind").value = v.wind;
    $("water").value = v.water;
    $("entry").value = v.entry;
    $("engine").value = v.engine;
    $("autoVenue").textContent =
`場補正：${PLACES[$("place").value]}
風：${v.wind} / 水面：${v.water} / 進入：${v.entry} / エンジン：${v.engine}
${v.memo}`;
  }

  function racerName(i){
    const text = $("paste").value || "";
    const lines = text.split(/\n/);
    for (const line of lines) {
      const m = line.match(new RegExp(`^\\s*${i}\\s+([一-龥ぁ-んァ-ンー]{2,10})`));
      if (m) return m[1];
    }
    return `選手${i}`;
  }

  function racer(i){
    return `${i}号艇 ${racerName(i)}`;
  }

  function parseOdds(){
    return ($("oddsInput").value || "")
      .split(/[,\s、]+/)
      .map(Number)
      .filter(n => !Number.isNaN(n) && n > 0);
  }

  function parseMissing(){
    const raw = $("missingInput").value.trim();
    if(!raw) return [];
    return raw.match(/[1-6]-[1-6]-[1-6]/g) || [];
  }

  function expectedRank(odds, score){
    if(odds >= 80 && score >= 80) return "S";
    if(odds >= 50 && score >= 70) return "A";
    if(odds >= 30 && score >= 60) return "B";
    return "C";
  }

  function validBet(bet){
    const p = bet.split("-");
    return p.length === 3 && new Set(p).size === 3;
  }

  function autoManshuBase(){
    const nums = ["1","2","3","4","5","6"];
    const bets = [];

    for(const a of nums){
      for(const b of nums){
        for(const c of nums){
          if(a === b || a === c || b === c) continue;

          let score = 40;
          if(a === "5") score += 26;
          if(a === "6") score += 22;
          if(a === "4") score += 18;
          if(a === "3") score += 10;
          if(a === "1") score -= 18;
          if(a === "2") score -= 8;

          if(["4","5","6"].includes(b)) score += 10;
          if(["4","5","6"].includes(c)) score += 8;

          if($("engine").value === "new" && ["3","5","6"].includes(a)) score += 8;
          if($("wind").value === "強風" || $("water").value === "荒れ") score += 8;
          if($("entry").value !== "normal" && ["4","5","6"].includes(a)) score += 6;

          bets.push({ bet:`${a}-${b}-${c}`, score });
        }
      }
    }

    return bets
      .sort((x,y)=>y.score-x.score)
      .map(x=>x.bet);
  }

  function generateManshu(){
    const input = parseMissing().filter(validBet);
    const odds = parseOdds();
    const base = input.length ? input : autoManshuBase();

    return base.slice(0,8).map((bet,idx)=>{
      const head = bet.split("-")[0];
      const od = odds[idx] || Math.round(45 + idx * 11 + (head === "5" ? 35 : head === "6" ? 42 : head === "4" ? 25 : 0));

      let score = 60;
      if(head === "5") score += 22;
      if(head === "6") score += 18;
      if(head === "4") score += 16;
      if(bet.includes("-5-") || bet.endsWith("-5")) score += 6;
      if(bet.includes("-6-") || bet.endsWith("-6")) score += 5;

      return { bet, odds: od, score, rank: expectedRank(od, score) };
    }).sort((a,b)=>{
      const r = {S:4,A:3,B:2,C:1};
      return r[b.rank] - r[a.rank] || b.score - a.score || b.odds - a.odds;
    });
  }

  function renderEntryList(){
    $("entryList").textContent =
`1号艇 ${racerName(1)}
2号艇 ${racerName(2)}
3号艇 ${racerName(3)}
4号艇 ${racerName(4)}
5号艇 ${racerName(5)}
6号艇 ${racerName(6)}

※出走表を貼ると選手名を反映。未入力なら仮名表示。`;
  }

  function analyze(){
    const placeName = PLACES[$("place").value];
    const race = $("race").value + "R";
    const engine = $("engine").value;
    const manshu = generateManshu();

    $("status").textContent = `${placeName}${race} 解析OK`;

    renderEntryList();

    $("flowEngine").textContent =
`1逃げ　　　　 62%
3まくり　　　 18%
3まくり差し　 12%
5一撃　　　　  8%`;

    $("flowReason").textContent =
`・${racer(1)}はイン有利を受ける本線
・${racer(3)}が攻め役になりやすい
・${racer(4)}は3が攻めると攻め場が狭い
・${racer(5)}は差し場が開けば万舟候補
・${engine === "new" ? "新エンジン期なのでモーター数字より選手技量・今節STを上に置く" : "通常エンジンなので展示・モーターも標準評価"}`;

    $("mainSheet").textContent =
`◎ ${racer(1)}
スコア：92点
⬆️ イン有利 +12
⬆️ 展開本線 +10
⬆️ ST安定 +8
⬇️ 3の攻め受け -4
一言：逃げ本線。3の攻めを受けても残す形。

○ ${racer(3)}
スコア：84点
⬆️ 攻め役 +10
⬆️ センター展開 +7
⬇️ まくり切り条件あり -5
一言：展開を作る艇。1着より2・3着絡みも重要。

▲ ${racer(5)}
スコア：78点
⬆️ 展開差し場 +9
⬆️ 万舟妙味 +10
⬇️ 外枠 -6
一言：3・4が動けば差し場を拾う穴。

△ ${racer(2)}
スコア：72点
⬆️ 2コース差し +8
⬇️ 差し届かず残り型 -5
一言：2差しは切らない。頭より2着残り重視。`;

    $("formation").textContent =
`【本線】
1-3-245
1-2-345

【押さえ】
1-35-全

【流し】
1-45-456

※高指数艇とフォーメーション安全カバーは分けて評価。`;

    $("pinkSheet").textContent =
`◎ ${racer(5)}
万舟指数：86点

【万舟候補 自動生成】
${manshu.map(x=>`${x.bet}　オッズ${x.odds}倍　期待値${x.rank}`).join("\n")}

※出てない目TOP30が入力されていればそこから優先。
※未入力なら展開・外枠期待度から自動生成。
※同じ艇番が重なる買い目は除外。`;

    $("alerts").textContent =
`スリットアラート
→ ${racer(3)} 注意

ダブルタイム理論
→ 展示1位＋一周1位が外枠なら連絡み注意

新サムアラート
→ プラス評価のみ採用`;

    $("missingList").textContent =
      parseMissing().filter(validBet).length
        ? parseMissing().filter(validBet).join("\n")
        : autoManshuBase().slice(0,30).join("\n");

    $("comment").textContent =
`最終コメント：
本線は1残り。展開を作るのは3号艇。
万舟は出てない目TOP30があれば優先、未入力なら展開から自動生成。
2コース差しと4コース残しは切らない。`;
  }

  function sample(){
    $("paste").value = "1 山田太郎\n2 佐藤次郎\n3 鈴木一郎\n4 田中三郎\n5 高橋四郎\n6 伊藤五郎";
    $("missingInput").value = "6-1-5\n5-6-1\n4-5-1\n6-5-1\n5-1-6";
    $("oddsInput").value = "156,188,96,210,142";
    analyze();
  }

  function clearAll(){
    ["paste","missingInput","oddsInput"].forEach(id => $(id).value = "");
    ["entryList","flowEngine","flowReason","mainSheet","formation","pinkSheet","alerts","missingList","comment"]
      .forEach(id => $(id).textContent = "未解析");
    $("status").textContent = "場とレースを選んでください";
  }

  function init(){
    setOptions();
    applyVenue();
    $("place").addEventListener("change", applyVenue);
    $("analyzeBtn").addEventListener("click", analyze);
    $("sampleBtn").addEventListener("click", sample);
    $("clearBtn").addEventListener("click", clearAll);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
