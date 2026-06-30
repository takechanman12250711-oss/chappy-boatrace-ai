// script.js v15.0
// チャッピーボートレースAI：材料 → 展開 → 舟券 / 重複整理版

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生:"01", 戸田:"02", 江戸川:"03", 平和島:"04", 多摩川:"05", 浜名湖:"06",
  蒲郡:"07", 常滑:"08", 津:"09", 三国:"10", びわこ:"11", 住之江:"12",
  尼崎:"13", 鳴門:"14", 丸亀:"15", 児島:"16", 宮島:"17", 徳山:"18",
  下関:"19", 若松:"20", 芦屋:"21", 福岡:"22", 唐津:"23", 大村:"24"
};

let latestRaceData = null;
let latestOddsList = [];
let currentResultStatus = "";

document.addEventListener("DOMContentLoaded", () => {
  $("#fetchRaceBtn")?.addEventListener("click", runPrediction);

  $("#raceResultInput")?.addEventListener("input", () => {
    autoFillOdds();
    autoJudgeResult();
    updateAutoPayout();
  });

  $("#oddsInput")?.addEventListener("input", updateAutoPayout);
  $("#betAmountInput")?.addEventListener("input", updateAutoPayout);
  $("#saveResultBtn")?.addEventListener("click", saveSimpleResult);
  $("#undoResultBtn")?.addEventListener("click", undoLastResult);

  document.querySelector(".result-buttons")?.style.setProperty("display", "none");
  renderStatsArea();
});

async function runPrediction() {
  const place = val("#placeSelect");
  const rno = String(val("#raceSelect")).replace("R", "");
  const date = normalizeDate(val("#dateInput")) || todayYmd();
  const jcd = PLACE_CODES[place] || place;

  setStatus("取得中…");
  clearAreas();
  setHTML("#raceListArea", `<div class="loading">読み込み中…</div>`);

  try {
    const raceRes = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`);
    const data = await raceRes.json();

    const oddsData = await safeJson(`/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`, { ok:false, odds:[] });
    const missData = await safeJson(`/api/missing?jcd=${jcd}&rno=${rno}&date=${date}`, { ok:false, missing:[] });

    data.odds = oddsData?.ok ? oddsData.odds || [] : [];
    data.missing = missData?.ok ? missData.missing || [] : [];

    if (!data.ok || !Array.isArray(data.boats) || data.boats.length === 0) {
      showError(data.message || data.error || "出走表データが取得できません");
      setStatus("取得失敗");
      return;
    }

    renderAll(data);
    setStatus("取得成功");
  } catch (e) {
    showError("通信エラー：" + e.message);
    setStatus("通信エラー");
  }
}

async function safeJson(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

function renderAll(data) {
  latestRaceData = data;

  const boats = data.boats || [];
  const p = data.prediction || {};
  const venue = data.venue || {};
  const weather = data.weather || {};
  const odds = data.odds || [];
  const missing = data.missing || [];
  const analysis = analyzeRace(boats, p, venue);

  setHTML("#raceFlowArea", renderRaceFlow(analysis));
  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderMaterialPanel(venue, weather, boats, analysis));
  setHTML("#mainSheetArea", renderMainSheet(boats, p, analysis));
  setHTML("#formationArea", renderFormations(p, analysis));
  setHTML("#oddsArea", renderOdds(odds));
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p, analysis) + renderManshuOdds(odds));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather, analysis));

  renderStatsArea();
  setTimeout(autoFillOdds, 200);
}

/* 表示：出走表 */

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>平均ST</th><th>全国</th><th>当地</th><th>M2</th><th>役割</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${fmtNum(b.nationalWinRate)}</td>
              <td>${fmtNum(b.localWinRate)}</td>
              <td>${fmtPct(b.motor2Rate)}</td>
              <td>${roleName(b.boat)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* 表示：材料カード */

function renderMaterialPanel(venue, weather, boats, analysis) {
  return `
    <div class="summary-box">
      <h3>🌊 材料カード</h3>
      <p><b>${venue.name || "-"}</b>：${venue.courseBias || "-"}</p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候：${weather?.weather || "-"} / 風${weather?.windSpeed ?? "-"}m / 波${weather?.waveHeight ?? "-"}cm / 気温${weather?.temperature ?? "-"}℃</p>
    </div>

    <div class="sheet">
      <h3>🚤 展開分析</h3>
      <div class="race-line">
        <b>イン信頼度：${analysis.inTrust}点</b>
        <p>${inTrustText(analysis.inTrust)}</p>
      </div>
      <div class="race-line">
        <b>攻め艇：${analysis.attackBoat}号艇 ${analysis.attackName || ""}</b>
        <p>攻め期待：${analysis.attackScore}点</p>
      </div>
      <div class="race-line">
        <b>展開の流れ</b>
        <p>${analysis.shapeText}</p>
      </div>
    </div>

    <details>
      <summary>▶ モーター・展示詳細</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>全国勝率</th><th>当地勝率</th><th>M</th><th>M2</th><th>M3</th><th>展示</th><th>展示ST</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td>${b.boat}</td>
                <td>${fmtNum(b.nationalWinRate)}</td>
                <td>${fmtNum(b.localWinRate)}</td>
                <td>${b.motor ?? "-"}</td>
                <td>${fmtPct(b.motor2Rate)}</td>
                <td>${fmtPct(b.motor3Rate)}</td>
                <td>${fmtNum(b.exhibitionTime)}</td>
                <td>${fmtST(b.exhibitionST)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

/* 展開分析 */

function analyzeRace(boats, p, venue) {
  if (typeof chappyAnalyzeRaceEngine === "function") {
    const base = chappyAnalyzeRaceEngine(boats, p, venue);
    const theory = buildTheoryFlags(boats);
    return {
      ...base,
      theory,
      attackRanking: buildAttackRanking(boats),
      dynamic: buildDynamicRaceEngine(boats, base)
    };
  }

  return {
    inTrust: 60,
    attackBoat: 3,
    attackName: "",
    attackScore: 60,
    attackType: "まくり差し",
    sashiBoat: 5,
    nokoshiBoat: 4,
    attackRanking: buildAttackRanking(boats),
    dynamic: buildDynamicRaceEngine(boats, {
      inTrust: 60,
      attackBoat: 3,
      sashiBoat: 5,
      nokoshiBoat: 4
    }),
    shapeText: "3号艇攻め → 5号艇差し場 → 4号艇残し"
  };
}

function buildTheoryFlags(boats){
  const list = boats || [];

  const stList = list
    .filter(b => num(b.exhibitionST, 0) > 0)
    .map(b => ({ boat: b.boat, st: num(b.exhibitionST) }))
    .sort((a, b) => a.st - b.st);

  const exRank = [...list]
    .filter(b => num(b.exhibitionTime, 0) > 0)
    .sort((a, b) => num(a.exhibitionTime) - num(b.exhibitionTime));

  const lapRank = [...list]
    .filter(b => num(b.lapTime, 0) > 0)
    .sort((a, b) => num(a.lapTime) - num(b.lapTime));

  const slitAlert =
    stList.length >= 2 && Math.abs(stList[0].st - stList[1].st) >= 0.10;

  const doubleTime =
    exRank.length && lapRank.length &&
    Number(exRank[0].boat) === Number(lapRank[0].boat);

  const newSam =
    exRank.length && lapRank.length &&
    Number(exRank[0].boat) >= 4 &&
    Number(lapRank[0].boat) >= 4;

  const localPower = list.some(b => num(b.localWinRate, 0) >= 6.5);
  const motorGap = list.some(b => num(b.motor2Rate, 0) >= 45);

const taroScore =
  50 +
  (slitAlert ? 15 : 0) +
  (doubleTime ? 12 : 0) +
  (newSam ? 10 : 0) +
  (localPower ? 8 : 0) +
  (motorGap ? 6 : 0);

return {
  slitAlert,
  doubleTime,
  newSam,
  localPower,
  motorGap,
  taroScore: clamp(taroScore)
};
}

function scoreInTrust(b, venue) {
  let s = 55 + num(venue?.inPower, 0);
  if (!b) return clamp(s);

  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.14) s += 10;
  if (num(b.avgST, 0) >= 0.20) s -= 12;
  if (num(b.localWinRate, 0) >= 6) s += 8;
  if (num(b.nationalWinRate, 0) >= 6) s += 6;
  if (num(b.motor2Rate, 0) >= 40) s += 5;
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate, 0) < 25) s -= 5;

  return clamp(s);
}

function buildAttackRanking(boats) {
  return boats
    .filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5)
    .map(b => ({
      boat: b.boat,
      name: b.name,
      score: calcBoatScore(b)
    }))
    .sort((a, b) => b.score - a.score);
}

function buildDynamicRaceEngine(boats, analysis) {
  const list = boats || [];
  const theory = latestRaceData?.prediction?.theory || latestRaceData?.theory || {};

  const exhibitionRank = [...list]
    .filter(b => num(b.exhibitionTime, 0) > 0)
    .sort((a, b) => num(a.exhibitionTime) - num(b.exhibitionTime));

  const lapRank = [...list]
    .filter(b => num(b.lapTime, 0) > 0)
    .sort((a, b) => num(a.lapTime) - num(b.lapTime));

  const rankPoint = (rank, boatNo, points) => {
    const idx = rank.findIndex(x => Number(x.boat) === Number(boatNo));
    return idx >= 0 && idx < points.length ? points[idx] : 0;
  };

  return list.map(b => {
    const no = Number(b.boat);
    let attack = 40;
    let sashi = 40;
    let nokoshi = 40;
    let tenkai = 40;
    let manshu = 35;
    const isAttack = no === Number(analysis.attackBoat);
    const isSashi = no === Number(analysis.sashiBoat);
    const isNokoshi = no === Number(analysis.nokoshiBoat);
    const isOutside = no >= 5;

    if (no === 1) nokoshi += analysis.inTrust >= 70 ? 25 : 10;
    if (no === 2) sashi += 18;
    if (no === 3) attack += 20;
    if (no === 4) attack += 16;
    if (no === 5) sashi += 16;
    if (no === 6) tenkai += 18;

    if (isAttack) attack += 20;
    if (isSashi) sashi += 20;
    if (isNokoshi) nokoshi += 18;
    if (isAttack) {
  tenkai += 15;
  manshu += 10;
}

if (isSashi) {
  tenkai += 12;
}

if (isNokoshi) {
  manshu += 8;
}

if (isOutside && isAttack) {
  manshu += 12;
}

    if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) {
      attack += 10;
      tenkai += 6;
    }

    if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) {
      attack += 8;
      tenkai += 5;
    }

    const exPoint = rankPoint(exhibitionRank, no, [12, 9, 6]);
    attack += exPoint;
    sashi += Math.round(exPoint / 2);

    const lapPoint = rankPoint(lapRank, no, [15, 10, 7]);
    nokoshi += lapPoint;
    tenkai += Math.round(lapPoint / 2);
    if (exPoint >= 12) {
  attack += 8;
  tenkai += 8;
  manshu += 5;
}

if (exPoint >= 9 && isSashi) {
  sashi += 8;
  tenkai += 5;
}

if (exPoint >= 9 && isAttack) {
  attack += 10;
}

    if (lapPoint >= 15) {
  nokoshi += 12;
  tenkai += 10;

  if (isAttack) attack += 8;
  if (isSashi) sashi += 8;
}

if (exPoint === 12 && lapPoint === 15) {
  attack += 12;
  sashi += 10;
  manshu += 10;
}

    if (num(b.localWinRate, 0) >= 6) {
      tenkai += 10;
      nokoshi += 6;
    }

    if (num(b.motor2Rate, 0) >= 40) {
      attack += 6;
      sashi += 6;
    }

    if (analysis.inTrust < 60 && no >= 4) {
  manshu += 18;
  tenkai += 10;
}

if (analysis.inTrust < 50 && isOutside) {
  manshu += 15;
  attack += 5;
}

if (analysis.attackScore >= 75 && isAttack) {
  attack += 12;
  tenkai += 8;
}

if (analysis.attackScore >= 75 && isOutside) {
  manshu += 10;
}

    if (no >= 5) manshu += 10;

    return {
      theory,
      boat: no,
      name: b.name || "",
      attack: clamp(attack),
      sashi: clamp(sashi),
      nokoshi: clamp(nokoshi),
      tenkai: clamp(tenkai),
      manshu: clamp(manshu)
    };
  });
}

function judgeAttackType(boat, boats, venue, b1){

    const b = boatByNo(boats, boat);

    if(!b){
        return "攻め";
    }

    const st = Number(b.avgST || 0.18);
    const inTrust = scoreInTrust(b1, venue);

    if(boat===2){
        return "差し";
    }

    if(boat===3){

        if(st<=0.14 && inTrust<75){
            return "まくり";
        }

        return "まくり差し";
    }

    if(boat===4){

        if(st<=0.14){
            return "まくり差し";
        }

        return "差し";
    }

    if(boat>=5){
        return "展開待ち";
    }

    return "逃げ";
}

function pickAttackBoat(boats, forced) {
  if (forced) {
    const b = boatByNo(boats, forced);
    return { boat:Number(forced), name:b?.name || "", score:75 };
  }

  let best = null;
  let bestScore = -999;

  boats.filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5).forEach(b => {
    let s = 45;
    const no = Number(b.boat);

    if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.14) s += 12;
    if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) s += 10;
    if (num(b.motor2Rate, 0) >= 40) s += 8;
    if (num(b.localWinRate, 0) >= 6) s += 8;
    if (no === 3) s += 8;
    if (no === 4) s += 6;

    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  });

  return {
    boat: Number(best?.boat || 3),
    name: best?.name || "",
    score: clamp(bestScore)
  };
}

/* 青シート */

function renderMainSheet(boats, p, analysis) {
  const marks = p.marks || {};
  const picks = [
    ["◎", "本命", marks.honmei],
    ["○", "対抗", marks.taikou],
    ["▲", "穴", marks.ana],
    ["△", "押さえ", marks.osae || marks.osaE]
  ];

  return `
    <div class="sheet compact-sheet">
      ${picks.map(([mark, label, m]) => {
        if (!m) return "";

        const b = boatByNo(boats, m.boat) || m;
        const score = b.totalScore ?? m.totalScore ?? calcBoatScore(b);
        const buffs = buildBuffs(b);
        const debuffs = buildDebuffs(b);
        const reason = buildPickReason(b, label, analysis);

        return `
          <div class="race-line main-card">
            <b>${mark} ${label}：${b.boat || m.boat}号艇 ${b.name || ""}</b>
            <p><b>総合：</b>${score}点</p>
            <p><b>理由：</b>${reason}</p>
            <p>⬆️ ${buffs.length ? buffs.join(" / ") : "大きな加点なし"}</p>
            <p>⬇️ ${debuffs.length ? debuffs.join(" / ") : "大きな減点なし"}</p>
          </div>
        `;
      }).join("") || `<div class="summary-box">本命データなし</div>`}
    </div>
  `;
}

function buildPickReason(b, label, analysis) {
  const no = Number(b.boat);
  const attack = Number(analysis?.attackBoat);
  const sashi = Number(analysis?.sashiBoat);
  const nokoshi = Number(analysis?.nokoshiBoat);

  if (label === "本命") {
    return "展開の中心。材料とイン信頼度を見て軸候補。";
  }

  if (no === attack) {
    return `${no}号艇が攻め役。展開を作る可能性が高い。`;
  }

  if (no === sashi) {
    return `${no}号艇は差し場候補。攻めが入った時に浮上。`;
  }

  if (no === nokoshi) {
    return `${no}号艇は残し候補。2・3着で重要。`;
  }

  if (label === "穴") {
    return "展開が崩れた時の高配当候補。";
  }

  return "本線の取りこぼしを拾う押さえ候補。";
}

/* フォーメーション */

function renderFormations(p, analysis) {
  const dynamic = analysis?.dynamic || [];

  const topAttack = [...dynamic].sort((a, b) => b.attack - a.attack)[0];
  const topSashi = [...dynamic].sort((a, b) => b.sashi - a.sashi)[0];
  const topNokoshi = [...dynamic].sort((a, b) => b.nokoshi - a.nokoshi)[0];
  const topManshu = [...dynamic].sort((a, b) => b.manshu - a.manshu)[0];

  const a = Number(topAttack?.boat || analysis?.attackBoat || 3);
  const s = Number(topSashi?.boat || analysis?.sashiBoat || 2);
  const n = Number(topNokoshi?.boat || analysis?.nokoshiBoat || 4);
  const m = Number(topManshu?.boat || 6);
  const trust = Number(analysis?.inTrust || 60);
  const type = analysis?.attackType || "まくり差し";
  const prob = analysis?.probability || {};
  const highMakuri = Number(prob.makuri || 0) >= 25;
  const highSashi = Number(prob.sashi || 0) >= 25;
  const highUpset = Number(prob.upset || 0) >= 25;

  let main = [];
  let safe = [];
  let hole = [];
  let manshu = [];

  if (type === "差し") {
    main = makeTickets([1, 2], [2, 1, a], [a, n, s, 5, 6]);
    safe = makeTickets([1], [a, n, s], [2, a, n, s, 5, 6]);
    hole = makeTickets([2, a], [1, s, n], [1, a, n, s, 5, 6]);
  } else if (type === "まくり") {
    main = makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]);
    safe = makeTickets([1], [a, 2, s], [2, a, n, s, 5, 6]);
    hole = makeTickets([a, s, n], [1, 2], [1, 2, s, n, m, 6]);
  } else if (type === "まくり差し") {
    main = makeTickets([1], [a, s, 2], [2, a, s, n, 5, 6]);
    safe = makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]);
    hole = makeTickets([s, n, a], [a, 1], [1, 2, s, n, m, 6]);
  } else {
    main = trust >= 70
      ? makeTickets([1], [2, a], [a, n, s, 5, 6])
      : makeTickets([1, a], [a, s, n], [1, 2, a, n, s, m, 6]);

    safe = makeTickets([1, 2], [s, n, a], [1, 2, a, n, s, 5, 6]);
    hole = makeTickets([a, n], [1, s], [1, 2, n, s, m, 6]);
  }
if (highMakuri) {
  main.push(...makeTickets([a, 1], [1, s, n], [1, 2, s, n, 5, 6]));
  hole.push(...makeTickets([a, s], [1, n], [1, 2, n, m, 6]));
}

if (highSashi) {
  safe.push(...makeTickets([1, 2, s], [s, 1, a], [1, 2, a, n, 5, 6]));
}

if (highUpset) {
  manshu.push(...makeTickets([m, a, s], [a, 1, n], [1, 2, s, n, m, 6]));
}
  manshu.push(
  ...makeTickets([m, s, n, a], [a, 1, s], [1, 2, 3, 4, 5, 6])
);

  main = compactTicketList(main, 4);
  safe = compactTicketList(removeDuplicateForms(safe, main), 5);
  hole = compactTicketList(removeDuplicateForms(hole, [...main, ...safe]), 5);
  manshu = compactTicketList(removeDuplicateForms(manshu, [...main, ...safe, ...hole]), 6);

  return `
    <div class="sheet">
      <h3>🧾 舟券フォーメーション</h3>

      <p class="aiReason">
${buildFormationReason(type, trust, prob, analysis)}
</p>

      <h4 class="form-main">本線</h4>
      ${ticketsWithOdds(main)}

      <h4 class="form-safe">押さえ</h4>
      ${ticketsWithOdds(safe)}

      <h4 class="form-hole">穴</h4>
      ${ticketsWithOdds(hole)}

      <h4 class="form-manshu">万舟</h4>
      ${ticketsWithOdds(manshu)}
    </div>
  `;
}

function makeTickets(firstList, secondList, thirdList) {
  const out = [];

  uniqueNums(firstList).forEach(first => {
    uniqueNums(secondList).forEach(second => {
      uniqueNums(thirdList).forEach(third => {
        if (first === second) return;
        if (first === third) return;
        if (second === third) return;

        out.push(`${first}-${second}-${third}`);
      });
    });
  });

  return [...new Set(out)];
}
function buildFormationReason(type, trust, prob, analysis) {

  const txt = [];
  
  const theory = analysis?.theory || {};
  const taroScore = Number(theory.taroScore || 0);
const taroRank =
  taroScore >= 95 ? "S評価 ★★★★★" :
  taroScore >= 85 ? "A評価 ★★★★☆" :
  taroScore >= 75 ? "B評価 ★★★☆☆" :
  taroScore >= 65 ? "C評価 ★★☆☆☆" :
  "D評価 ★☆☆☆☆";

if (taroScore > 0) {
  txt.push(`🚤 舟券太郎指数 ${taroScore}点 ${taroRank}`);
}

  txt.push(`展開予測：${type}`);
  
if (theory.slitAlert) {
  txt.push(`🚨 スリットアラート発動`);
}

if (theory.doubleTime) {
  txt.push(`⏱ ダブルタイム発動`);
}

if (theory.newSam) {
  txt.push(`⭐ 新サム理論発動`);
}

if (theory.localPower) {
  txt.push(`🏠 当地実績上位`);
}

if (theory.motorGap) {
  txt.push(`🔧 モーター格差あり`);
}
if (analysis?.attackBoat) {
  txt.push(`⚔️ 攻め役：${analysis.attackBoat}号艇`);
}

if (analysis?.sashiBoat) {
  txt.push(`🎯 差し候補：${analysis.sashiBoat}号艇`);
}

if (analysis?.nokoshiBoat) {
  txt.push(`🛟 残り目：${analysis.nokoshiBoat}号艇`);
}

const manshuBoat =
  analysis?.dynamic
    ?.slice()
    .sort((a, b) => Number(b.manshu || 0) - Number(a.manshu || 0))[0];

if (manshuBoat?.boat) {
  txt.push(`💣 万舟注意：${manshuBoat.boat}号艇（万舟指数 ${manshuBoat.manshu}）`);
}

  if (trust >= 80){
    txt.push("イン信頼度が高く逃げ中心。");
  }else if(trust >= 60){
    txt.push("インは残るが差し・まくり警戒。");
  }else{
    txt.push("イン不安で波乱期待。");
  }

  if(Number(prob?.makuri || 0) >= 25){
    txt.push("まくり率高め。");
  }

  if(Number(prob?.sashi || 0) >= 25){
    txt.push("差しが決まりやすい。");
  }

  if(Number(prob?.upset || 0) >= 20){
    txt.push("万舟警戒レース。");
  }

  if(analysis?.attackBoat){
    txt.push(`${analysis.attackBoat}号艇が攻め役。`);
  }

  if(analysis?.sashiBoat){
    txt.push(`${analysis.sashiBoat}号艇が差し候補。`);
  }

  if(analysis?.nokoshiBoat){
    txt.push(`${analysis.nokoshiBoat}号艇残り注意。`);
  }

  return "🧠 " + txt.join(" ");
}
function uniqueNums(list) {
  return [...new Set(
    (list || [])
      .map(x => Number(x))
      .filter(x => Number.isFinite(x) && x >= 1 && x <= 6)
  )];
}

function compactTicketList(list, limit = 6) {
  return [...new Set(list || [])].slice(0, limit);
}

function removeDuplicateForms(list, baseList) {
  const baseExpanded = new Set(
    compactForms(baseList)
      .flatMap(expandForm)
      .map(normalizeKey)
  );

  return compactForms(list).filter(form => {
    const expanded = expandForm(form).map(normalizeKey);
    return !expanded.every(x => baseExpanded.has(x));
  });
}

function ticketsWithOdds(list) {
  const arr = compactForms(list);

  if (!arr.length) {
    return `<div class="summary-box">候補なし</div>`;
  }

  return `
    <div class="ticket-list">
      ${arr.map(form => {
        const odds = compositeOddsForForm(form);
        return `
          <span class="ticket">
            ${form}${odds ? `　合成${odds}倍` : ""}
          </span>
        `;
      }).join("")}
    </div>
  `;
}

function compositeOddsForForm(form) {
  const keys = expandForm(form).map(normalizeKey);
  const oddsMap = new Map(
    latestOddsList.map(o => [
      normalizeKey(o.key || o.result || o.number),
      Number(o.odds)
    ])
  );

  const values = keys
    .map(k => oddsMap.get(k))
    .filter(v => Number.isFinite(v) && v > 0);

  if (!values.length) return "";

  const inverseSum = values.reduce((sum, o) => sum + 1 / o, 0);
  if (!inverseSum) return "";

  return (1 / inverseSum).toFixed(1);
}
/* オッズ */

function renderOdds(odds) {
  latestOddsList = Array.isArray(odds) ? odds : [];

  if (!latestOddsList.length) {
    return `<div class="summary-box">オッズ未取得</div>`;
  }

  return `
    <div class="sheet odds-card">
      <div class="odds-grid">
        ${latestOddsList.slice(0, 12).map((o, i) => `
          <div class="odds-pill">
            <b>${i + 1}. ${showKey(o.key || o.result || o.number)}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* ピンクシート */

function renderManshuSheet(boats, p, analysis) {
  const targets = pickManshuTargets(boats, analysis);
  const attack = analysis?.attackBoat || "-";
  const sashi = analysis?.sashiBoat || "-";
  const nokoshi = analysis?.nokoshiBoat || "-";
  const trust = analysis?.inTrust ?? 60;

  const conditions = [
    trust < 70 ? "1号艇の信頼度が高すぎない" : "1号艇が流れた時だけ波乱",
    `${attack}号艇が攻める展開`,
    `${sashi}号艇に差し場ができる`,
    `${nokoshi}号艇が残すと配当がズレる`
  ];

  return `
    <div class="sheet manshu-sheet">

      <div class="summary-box">
        <b>💣 万舟になる条件</b>
        ${conditions.map(x => `<p>・${x}</p>`).join("")}
      </div>

      <h4>注目艇</h4>
      ${targets.map(b => `
        <div class="race-line">
          <b>${b.boat}号艇 ${b.name || ""}</b>
          <p>万舟指数：${b.manshuScore}点</p>
          <p><b>材料：</b>${simpleReasons(b)}</p>
          <p>${manshuReason(b)}</p>
        </div>
      `).join("") || `<div class="summary-box">万舟候補なし</div>`}
    </div>
  `;
}

function pickManshuTargets(boats, analysis) {
  return boats
    .filter(b => Number(b.boat) >= 3)
    .map(b => ({ ...b, manshuScore: calcManshuScore(b, analysis) }))
    .sort((a, b) => b.manshuScore - a.manshuScore)
    .slice(0, 3);
}

function calcManshuScore(b, analysis) {
  let s = 40;
  const no = Number(b.boat);

  if (no === 4 && analysis.attackBoat === 3) s += 18;
  if (no === 5 && [3, 4].includes(analysis.attackBoat)) s += 22;
  if (no === 6 && analysis.inTrust < 65) s += 12;
  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) s += 8;
  if (num(b.localWinRate, 0) >= 6) s += 8;
  if (num(b.motor2Rate, 0) >= 40) s += 8;

  return clamp(s);
}

function renderManshuOdds(odds) {
  const list = Array.isArray(odds)
    ? odds.filter(o => Number(o.odds) >= 100).slice(0, 10)
    : [];

  if (!list.length) return `<div class="summary-box">💣 万舟候補なし</div>`;

  return `
    <div class="sheet manshu-odds-card">
      <h3>💣 万舟候補TOP10</h3>
      <div class="odds-grid">
        ${list.map((o, i) => `
          <div class="odds-pill manshu-pill">
            <b>${i + 1}. ${showKey(o.key || o.result || o.number)}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMissingTop30(list) {
  if (!Array.isArray(list) || !list.length) {
    return `<div class="summary-box">出てない目TOP30取得中...</div>`;
  }

  return `
    <div class="sheet missing-card">
      <h3>📊 出てない目 TOP30</h3>
      <div class="odds-grid">
        ${list.slice(0, 30).map((x, i) => `
          <div class="odds-pill">
            <b>${x.rank || i + 1}. ${showKey(x.key || x.result || x.number)}</b>
            <span>${x.odds || "-"}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

/* 理論アラート */

function renderAlerts(p) {
  const raw = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  const seen = new Set();
  const list = raw.filter(a => {
    const key = `${a.boat || ""}-${a.type || ""}-${a.reason || ""}-${a.sum || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!list.length) {
    return `<div class="summary-box">🚨 理論アラートなし。基本展開を重視。</div>`;
  }

  return `
    <div class="sheet">
      <h3>🚨 舟券太郎 理論アラート</h3>
      ${list.map(a => `
        <div class="race-line">
          <b>${a.boat ? `${a.boat}号艇 ` : ""}${a.type || "アラート"}</b>
          <p>${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFinalComment(p, venue, weather, analysis) {
  return `
    <div class="summary-box">
      <h3>📝 最終コメント</h3>
      <p>${p.raceComment || "材料・展開・舟券を分けて判断する。"}</p>
      <p><b>展開：</b>${analysis.shapeText}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather?.weather || "-"} 風${weather?.windSpeed ?? "-"}m 波${weather?.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

/* 成績管理 */

function autoFillOdds() {
  const result = val("#raceResultInput");
  const oddsInput = $("#oddsInput");

  if (!oddsInput || !result) {
    updateAutoPayout();
    return;
  }

  const hit = findOddsByResult(result);
  if (hit?.odds) oddsInput.value = hit.odds;

  updateAutoPayout();
}

function autoJudgeResult() {
  const result = normalizeKey(val("#raceResultInput"));
  if (!result) return;

  const predictions = collectPredictionTickets();
  currentResultStatus = predictions.includes(result) ? "アタリ" : "ハズレ";

  setStatus(currentResultStatus === "アタリ" ? "⭕ アタリ自動判定" : "❌ ハズレ自動判定");
}

function collectPredictionTickets() {
  const p = latestRaceData?.prediction || {};
  return [
    p.mainFormation,
    p.safeFormation,
    p.holeFormation,
    p.manshuFormation,
    p.manshuTickets
  ]
    .filter(Array.isArray)
    .flatMap(list => normalizeFormList(list).flatMap(expandForm))
    .map(normalizeKey);
}

function saveSimpleResult() {
  const resultRaw = val("#raceResultInput");
  if (!resultRaw) {
    alert("レース結果を入力してね");
    return;
  }

  autoFillOdds();
  autoJudgeResult();

  const bet = Number($("#betAmountInput")?.value || 0);
  const odds = Number($("#oddsInput")?.value || 0);
  const payout = currentResultStatus === "アタリ" ? Math.floor(bet * odds) : 0;
  const history = JSON.parse(localStorage.getItem("chappyResultHistory") || "[]");

  history.push({
    place: val("#placeSelect"),
    result: normalizeKey(resultRaw),
    status: currentResultStatus,
    bet,
    odds,
    payout,
    savedAt: Date.now()
  });

  localStorage.setItem("chappyResultHistory", JSON.stringify(history));
  renderStatsArea();
  updateAutoPayout();
  alert("成績保存完了");
}

function undoLastResult() {
  const history = JSON.parse(localStorage.getItem("chappyResultHistory") || "[]");
  if (!history.length) {
    alert("取り消す成績がありません");
    return;
  }

  history.pop();
  localStorage.setItem("chappyResultHistory", JSON.stringify(history));
  renderStatsArea();
  alert("直前の成績を取り消しました");
}

function renderStatsArea() {
  const history = JSON.parse(localStorage.getItem("chappyResultHistory") || "[]");
  const predictions = history.length;
  const hits = history.filter(r => r.status === "アタリ").length;
  const bet = history.reduce((sum, r) => sum + Number(r.bet || 0), 0);
  const payout = history.reduce((sum, r) => sum + Number(r.payout || 0), 0);

  const hitRate = predictions ? ((hits / predictions) * 100).toFixed(1) : "0";
  const recoveryRate = bet ? ((payout / bet) * 100).toFixed(1) : "0";

  const area = $("#statsArea");
  if (!area) return;

  area.innerHTML = `
    <table class="table">
      <tr><td>予想数</td><td>${predictions}</td></tr>
      <tr><td>アタリ数</td><td>${hits}</td></tr>
      <tr><td>的中率</td><td>${hitRate}%</td></tr>
      <tr><td>購入金額</td><td>${bet.toLocaleString()}円</td></tr>
      <tr><td>払戻金額</td><td>${payout.toLocaleString()}円</td></tr>
      <tr><td>回収率</td><td>${recoveryRate}%</td></tr>
    </table>
  `;
}

function updateAutoPayout() {
  const bet = Number($("#betAmountInput")?.value || 0);
  const odds = Number($("#oddsInput")?.value || 0);
  const text = $("#autoPayoutText");
  const payout = Math.floor(bet * odds);
  if (text) text.textContent = `払戻金：${payout.toLocaleString()}円`;
}

/* 共通 */

function tickets(list) {
  const arr = compactForms(list);
  if (!arr.length) return `<div class="summary-box">候補なし</div>`;
  return `<div class="ticket-list">${arr.map(x => `<span class="ticket">${x}</span>`).join("")}</div>`;
}

function compactForms(list) {
  const arr = normalizeFormList(list);
  if (!arr.length) return [];

  return arr.filter((form, i) => {
    return !arr.some((other, j) => {
      if (i === j || form === other) return false;
      const small = expandForm(form);
      const big = expandForm(other);
      return big.length > small.length && small.every(x => big.includes(x));
    });
  });
}

function normalizeFormList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map(x => {
    const raw = typeof x === "string" ? x : (x.key || x.result || x.number || "");
    return String(raw).replaceAll("－", "-").replaceAll(" ", "").trim();
  }).filter(Boolean))];
}

function expandForm(raw) {
  const text = String(raw || "").replaceAll("－", "-").trim();
  const parts = text.split("-").filter(Boolean);
  if (parts.length !== 3) return [text];

  const out = [];
  [...parts[0]].forEach(a => {
    [...parts[1]].forEach(b => {
      [...parts[2]].forEach(c => {
        if (a !== b && b !== c && a !== c) out.push(`${a}-${b}-${c}`);
      });
    });
  });

  return [...new Set(out)];
}

function calcBoatScore(b) {
  let s = 50;

  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.14) s += 10;
  if (num(b.localWinRate, 0) >= 6) s += 8;
  if (num(b.nationalWinRate, 0) >= 6) s += 8;
  if (num(b.motor2Rate, 0) >= 40) s += 5;
  if (num(b.localWinRate, 0) >= 7) s += 4;
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.11) s += 5;
  if (num(b.avgST, 0) >= 0.20) s -= 6;
  if (window.currentVenue === "大村" && num(b.boat) === 3) s += 5;
  if (window.currentVenue === "大村" && num(b.boat) === 2) s -= 4;
  if (window.currentVenue === "多摩川" && num(b.boat) === 3) s += 3;
  if (window.currentVenue === "丸亀" && num(b.boat) === 1) s += 2;
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) s += 8;
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) s += 8;
  if (num(b.lapTime, 0) > 0 && num(b.lapTime) <= 37.00) s += 10;
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) >= 6.90) s -= 3;
  if (num(b.lapTime, 0) > 0 && num(b.lapTime) >= 37.20) s -= 3;
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate) <= 25) s -= 4;
  
  return clamp(s);
}

function buildBuffs(b) {
  const r = [];

  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15)
    r.push("平均ST◎");

  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12)
    r.push("展示ST◎");

  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75)
    r.push("展示タイム◎");

  if (num(b.lapTime, 0) > 0 && num(b.lapTime) <= 37.00)
    r.push("一周タイム◎");

  if (num(b.localWinRate, 0) >= 6)
    r.push("当地勝率◎");

  if (num(b.nationalWinRate, 0) >= 6)
    r.push("全国勝率◎");

  if (num(b.motor2Rate, 0) >= 40)
    r.push("モーター◎");

  return r;
}

function buildDebuffs(b) {
  const r = [];
  if (num(b.avgST, 0) >= 0.20) r.push("ST遅め");
  if (num(b.localWinRate, 0) > 0 && num(b.localWinRate) < 4) r.push("当地弱め");
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate) < 25) r.push("モーター弱め");
  return r;
}

function simpleReasons(b) {
  const r = [];
  if (num(b.nationalWinRate, 0) > 0) r.push(`全国${fmtNum(b.nationalWinRate)}`);
  if (num(b.localWinRate, 0) > 0) r.push(`当地${fmtNum(b.localWinRate)}`);
  if (num(b.avgST, 0) > 0) r.push(`平均ST${fmtST(b.avgST)}`);
  if (num(b.motor2Rate, 0) > 0) r.push(`M2 ${fmtPct(b.motor2Rate)}`);
  if (num(b.boat2Rate, 0) > 0) r.push(`B2 ${fmtPct(b.boat2Rate)}`);
  if (num(b.exhibitionTime, 0) > 0) r.push(`展示${fmtNum(b.exhibitionTime)}`);
  return r.join(" / ") || "データ不足";
}

function roleName(boat) {
  const n = Number(boat);
  if (n === 1) return "逃げ軸";
  if (n === 2) return "差し候補";
  if (n === 3) return "攻め候補";
  if (n === 4) return "カド攻め・残し";
  if (n === 5) return "差し場待ち";
  if (n === 6) return "展開待ち";
  return "-";
}

function roleComment(b) {
  const n = Number(b.boat);
  if (n === 1) return "イン先マイが軸。ST遅れは波乱。";
  if (n === 2) return "2コース差し候補。2着残りも重要。";
  if (n === 3) return "センター攻めの起点。まくり差し注意。";
  if (n === 4) return "4コース残しを切らない。";
  if (n === 5) return "内が競った時の差し場。";
  if (n === 6) return "展開待ち。当地・道中力があれば注意。";
  return "展開次第。";
}

function manshuReason(b) {
  const n = Number(b.boat);
  if (n === 3) return "3が攻めると人気筋が崩れる。";
  if (n === 4) return "4残しで本線からズレると高配当。";
  if (n === 5) return "差し場が開くと配当が跳ねる。";
  if (n === 6) return "展開待ちだが3着拾いで高配当。";
  return "展開ズレの候補。";
}

function inTrustText(score) {
  if (score >= 80) return "イン信頼強め。本線は内残り中心。";
  if (score >= 60) return "普通。攻め艇次第で穴も見る。";
  return "イン不安。外・差し場・万舟警戒。";
}

function findOddsByResult(result) {
  const key = normalizeKey(result);
  return latestOddsList.find(o => normalizeKey(o.key || o.result || o.number) === key);
}

function normalizeKey(v) {
  return String(v || "").replaceAll("-", "").replaceAll("－", "").replaceAll(" ", "").trim();
}

function showKey(v) {
  const s = normalizeKey(v);
  return s.length === 3 ? `${s[0]}-${s[1]}-${s[2]}` : String(v || "-");
}

function boatByNo(boats, no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || null;
}

function num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function fmtNum(v) {
  return Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "-";
}

function fmtPct(v) {
  return Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : "-";
}

function normalizeDate(v) {
  return String(v || "").replaceAll("-", "").replaceAll("/", "").trim();
}

function clearAreas() {
  [
    '#raceFlowArea',
    "#raceListArea",
    "#engineArea",
    "#mainSheetArea",
    "#formationArea",
    "#manshuSheetArea",
    "#alertArea",
    "#finalCommentArea",
    "#oddsArea"
  ].forEach(id => setHTML(id, ""));
}

function showError(msg) {
  setHTML("#raceListArea", `<div class="error">⚠️ ${msg}</div>`);
}

function setHTML(id, html) {
  const el = document.querySelector(id);
  if (el) el.innerHTML = html;
}

function setStatus(text) {
  const el = $("#statusText");
  if (el) el.textContent = text;
}

function val(id) {
  return $(id)?.value?.trim() || "";
}

function $(id) {
  return document.querySelector(id);
}

function fmtST(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  if (n < 0) return `F${Math.abs(n).toFixed(2).slice(1)}`;
  return n.toFixed(2);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function renderRaceFlow(analysis) {
  const attack = analysis?.attackBoat || "-";
  const sashi = analysis?.sashiBoat || "-";
  const nokoshi = analysis?.nokoshiBoat || "-";
  const trust = analysis?.inTrust ?? 0;
  const shape = analysis?.shapeText || "-";
  const ranking = analysis?.attackRanking || [];
  const dynamic = analysis?.dynamic || [];
  const venueNote = analysis?.venueNote || "";

  const trustLabel =
    trust >= 80 ? "イン信頼高め" :
    trust >= 60 ? "標準・展開次第" :
    "イン不安・波乱警戒";

  const waveLevel =
    trust >= 80 ? "★★☆☆☆" :
    trust >= 60 ? "★★★☆☆" :
    "★★★★☆";

  const attackPattern =
    Number(attack) === 2 ? "2コース差し" :
    Number(attack) === 3 ? "3コース攻め・まくり差し" :
    Number(attack) === 4 ? "カド攻め・まくり差し" :
    Number(attack) === 5 ? "外差し・展開待ち" :
    "展開待ち";
    
    const attackComment = judgeAttackComment(
  analysis?.attackType || attackPattern,
  attack,
  sashi,
  nokoshi
);
function judgeAttackComment(type, attack, sashi, nokoshi) {
  if (type === "まくり") {
    return `${attack}号艇が全速で攻める展開。${nokoshi}号艇の残しと、${sashi}号艇の差し場を重視。`;
  }

  if (type === "まくり差し") {
    return `${attack}号艇がまくり差しで差し場を狙う展開。内残りと外の連動を両方見る。`;
  }

  if (type === "差し") {
    return `${attack}号艇の差し展開。イン残りを見ながら、2着・3着の残しを重視。`;
  }

  if (type === "展開待ち") {
    return `${attack}号艇は展開待ち。内が競った時の差し場・道中拾いを重視。`;
  }

  return `${attack}号艇が展開を作る想定。${sashi}号艇の差し場、${nokoshi}号艇の残しを確認。`;
}
  const flyCondition =
    trust >= 80
      ? "1号艇のST遅れ、またはセンター勢のトップスタート。"
      : trust >= 60
        ? "1号艇が少し流れる、3・4号艇が攻め切る、5号艇に差し場が開く。"
        : "インが凹む、センターが攻める、外が道中で拾う。";

  return `
    <div class="sheet flow-sheet">
      <div class="summary-box">
        <b>🌊 展開予想カード</b>
        <p><b>イン信頼度：</b>${trust}点 / ${trustLabel}</p>
        <p><b>波乱度：</b>${waveLevel}</p>
        <p><b>攻めパターン：</b>${analysis?.attackType || attackPattern}</p>
      </div>

<div class="race-line">
  <b>🥇 攻め指数ランキング</b>
  ${dynamic.slice()
    .sort((a,b)=>Number(b.attack||0)-Number(a.attack||0))
    .slice(0,4)
    .map((x,i)=>`
      <div class="attack-card">
        <b>${i+1}位 ${x.boat}号艇 ${x.name}</b>
        <div>⚔️攻め ${x.attack}</div>
        <progress max="100" value="${x.attack}"></progress>
        <div>🎯差し ${x.sashi}</div>
        <progress max="100" value="${x.sashi}"></progress>
        <div>🛟残り ${x.nokoshi}</div>
        <progress max="100" value="${x.nokoshi}"></progress>
        <div>💣万舟 ${x.manshu}</div>
        <progress max="100" value="${x.manshu}"></progress>
      </div>
    `).join("")}
</div>

      <div class="race-line">
        <b>🔥 攻め艇</b>
        <p>${attack}号艇：この艇が展開を作る中心。</p>
      </div>

      <div class="race-line">
        <b>🌊 差し場</b>
        <p>${sashi}号艇：攻めが入った時に差し場を拾う候補。</p>
      </div>

      <div class="race-line">
        <b>⚡ 残し艇</b>
        <p>${nokoshi}号艇：攻められても2・3着に残す候補。</p>
      </div>

      <div class="race-line">
        <b>⚠️ 軸が飛ぶ条件</b>
        <p>${flyCondition}</p>
      </div>

<div class="race-line">
  <b>📊 展開確率AI</b>

  <p>🚤 逃げ　${analysis.probability?.escape ?? "-"}%</p>
  <p>🌊 2差し　${analysis.probability?.sashi ?? "-"}%</p>
  <p>🔥 まくり　${analysis.probability?.makuri ?? "-"}%</p>
  <p>💥 まくり差し　${analysis.probability?.makuriSashi ?? "-"}%</p>
  <p>🌪 波乱　${analysis.probability?.upset ?? "-"}%</p>
</div>

      <div class="race-line">
        <b>🤖 AI展開コメント</b>
        <p>🏟️ 場特徴：${venueNote}</p>
        <p>${attackComment}</p>
        <p>${shape}</p>
      </div>
    </div>
  `;
}