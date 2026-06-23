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

  function racerName(i){
    const text = $("paste").value || "";
    const re = new RegExp(`${i}[\\s\\S]{0,40}?([一-龥ぁ-んァ-ンー]{2,8})`);
    const m = text.match(re);
    return m ? m[1] : `選手${i}`;
  }

  function racer(i){
    return `${i}号艇 ${racerName(i)}`;
  }

  function venueData(){
    return VENUE[$("place").value] || {
      wind:"無風",water:"普通",entry:"normal",engine:"normal",
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

  function generateManshu(){
    const missing = parseMissing();
    const odds = parseOdds();

    const base = missing.length ? missing : [
      "5-1-4","5-1-6","4-5-1","6-1-5","4-1-5","5-4-1"
    ];

    const outerPower = {
      "4":78,
      "5":86,
      "6":72
    };

    return base.slice(0,6).map((bet,idx)=>{
      const head = bet[0];
      const od = odds[idx] || (head === "5" ? 118 : head === "6" ? 142 : 96);
      const score = outerPower[head] || 64;
      return {
        bet,
        odds: od,
        score,
        rank: expectedRank(od, score)
      };
    }).sort((a,b)=>{
      const rankScore = {S:4,A:3,B:2,C:1};
      return rankScore[b.rank] - rankScore[a.rank] || b.odds - a.odds;
    });
  }

  function analyze(){
    const placeName = PLACES[$("place").value];
    const race = $("race").value + "R";
    const engine = $("engine").value;
    const manshu = generateManshu();

    $("status").textContent = `${placeName}${race} 解析OK`;

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
※合成オッズ欄が入力されていれば順番に反映。`;

    $("alerts").textContent =
`スリットアラート
→ ${racer(3)} 注意

ダブルタイム理論
→ 展示1位＋一周1位が外枠なら連絡み注意

新サムアラート
→ プラス評価のみ採用`;

    $("missingList").textContent =
      parseMissing().length ? parseMissing().join("\n") : "未入力：自動候補を使用";

    $("comment").textContent =
`最終コメント：
本線は1残り。展開を作るのは3号艇。
万舟は入力された出てない目TOP30とオッズから自動生成。
2コース差しと4コース残しは切らない。`;
  }

  function sample(){
    $("paste").value = "1 山田太郎\n2 佐藤次郎\n3 鈴木一郎\n4 田中三郎\n5 高橋四郎\n6 伊藤五郎";
    $("missingInput").value = "5-1-4\n5-1-6\n4-5-1\n6-1-5\n4-1-5";
    $("oddsInput").value = "118,142,96,156,84";
    analyze();
  }

  function clearAll(){
    ["paste","missingInput","oddsInput"].forEach(id => $(id).value = "");
    ["flowEngine","flowReason","mainSheet","formation","pinkSheet","alerts","missingList","comment"].forEach(id => $(id).textContent = "未解析");
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
