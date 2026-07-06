// script.js v15.1 stable
// 基本形安定版：出走表 → 展開 → 青シート → フォーメーション → 万舟 → 成績管理

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
function buildSimulation(analysis, mode) {
  const attack = analysis.attackBoat;
  const sashi = analysis.sashiBoat;
  const nokoshi = analysis.nokoshiBoat;

  if (mode === "main") {
    return `① ${attack}号艇が攻める<br>↓<br>② ${sashi}号艇に差し場<br>↓<br>③ ${nokoshi}号艇が残す<br><br><b>本命展開</b>`;
  }

  if (mode === "sub") {
    return `① ${attack}号艇が攻める<br>↓<br>② 外差し<br>↓<br>③ 展開突き<br><br><b>対抗展開</b>`;
  }

  return `① ${attack}号艇が攻める<br>↓<br>② 内が競る<br>↓<br>③ 外が拾う<br><br><b>万舟展開</b>`;
}
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
  window.currentVenue = place;
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

    data.odds = oddsData?.ok
     ? (oddsData.odds || oddsData.list || oddsData.data || oddsData.results || [])
     : [];

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
window.runPrediction = runPrediction;
async function safeJson(url, fallback) {
  try {
    const res = await fetch(url);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}
window.runPrediction = runPrediction;
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
  setHTML(
  "#formationArea",
  typeof window.renderFormations === "function"
    ? window.renderFormations(p, analysis)
    : `<div class="sheet error">⚠ prediction.js が読み込めていません</div>`
);
  setHTML("#oddsArea", renderOdds(odds));
  console.log("odds count", latestOddsList.length, latestOddsList.slice(0, 3));
  setHTML(
  "#manshuSheetArea",
  renderManshuSheet(boats, p, analysis)
  + renderMissingTop30(missing, odds)
  + renderManshuOdds(odds)
);
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather, analysis));

  renderStatsArea();
  setTimeout(autoFillOdds, 200);
}

/* 展開分析 */

function analyzeRace(boats, p, venue) {
  if (typeof chappyAnalyzeRaceEngine === "function") {
    const base = chappyAnalyzeRaceEngine(boats, p, venue);
    const theory = buildTheoryFlags(boats);

    base.sashiBoat = pickSashiBoat(boats, base.attackBoat);
    base.nokoshiBoat = pickNokoshiBoat(boats, base.attackBoat);
    const attack = pickAttackBoat(boats);
    const sashi = pickSashiBoat(boats, attack.boat);
    const nokoshi = pickNokoshiBoat(boats, attack.boat);
    const attackType = judgeAttackType(attack.boat, boats, venue, boatByNo(boats, 1));
    return {
  ...base,
  theory,
  chappyIndex: buildChappyAIIndex(boats, {
    attackBoat: base.attackBoat,
    sashiBoat: base.sashiBoat,
    nokoshiBoat: base.nokoshiBoat
  }),
    tenkaiRate: buildTenkaiRate(boats, {
    attackBoat: base.attackBoat,
    sashiBoat: base.sashiBoat,
    nokoshiBoat: base.nokoshiBoat
  }),

  expectedValue: buildExpectedValue(
    buildChappyAIIndex(boats, {
    attackBoat: base.attackBoat,
    sashiBoat: base.sashiBoat,
    nokoshiBoat: base.nokoshiBoat
  }),
  latestOddsList
 ),
  attackRanking: buildAttackRanking(boats),
  dynamic: buildDynamicRaceEngine(boats, base)
 };
   }
    const attack = pickAttackBoat(boats);
    let sashi = pickSashiBoat(boats, attack);
    let nokoshi = pickNokoshiBoat(boats, attack);
    const attackType = judgeAttackType(attack.boat, boats, venue, boatByNo(boats, 1));
    // 2コース差し補正：2号艇は差し場候補として必ず残す
    if (boats.some(b => Number(b.boat) === 2)) {
    if (sashi !== 2 && Number(attack.boat) !== 2) {
    sashi = 2;
    }
   }
  // 4コース残し補正：4号艇は攻められても2・3着候補として残す
    if (boats.some(b => Number(b.boat) === 4)) {
    if (nokoshi !== 4 && Number(attack.boat) !== 4) {
    nokoshi = 4;
    }
   }
    const raceShape = buildRaceShape(
    attack.boat,
    sashi,
    nokoshi,
    attackType
  );
  return {
    // 展開AI本体：attack / sashi / nokoshi の最終決定地点
    inTrust: 60,
    attackBoat: attack.boat,
    attackName: attack.name,
    attackScore: attack.score,
    attackType: attackType,
    sashiBoat: sashi,
    nokoshiBoat: nokoshi,
    chappyIndex: buildChappyAIIndex(boats,{
    attackBoat: attack.boat,
    sashiBoat: sashi,
    nokoshiBoat: nokoshi
    }),
    tenkaiRate: buildTenkaiRate(boats, {
  attackBoat: attack.boat,
  sashiBoat: sashi,
  nokoshiBoat: nokoshi
}),

expectedValue: buildExpectedValue(
  buildChappyAIIndex(boats, {
    attackBoat: attack.boat,
    sashiBoat: sashi,
    nokoshiBoat: nokoshi
  }),
  latestOddsList
),
    attackRanking: buildAttackRanking(boats),
    dynamic: buildDynamicRaceEngine(boats, {
      inTrust: 60,
      attackBoat: attack.boat,
      sashiBoat: sashi,
      nokoshiBoat: nokoshi
    }),
    shapeText: raceShape,
  };
}
function venueAdjust(venueName, boatNo, role) {
  let s = 0;
  const v = String(venueName || window.currentVenue || "");

  const add = (name, roleName, boats, point) => {
    if (v.includes(name) && role === roleName && boats.includes(Number(boatNo))) s += point;
  };

  add("大村", "attack", [3], 6);
  add("大村", "sashi", [2], -3);
  add("大村", "motor", [1,2,3,4,5,6], -3);

  add("若松", "outside", [5,6], 4);
  add("若松", "nokoshi", [6], 4);

  add("丸亀", "nokoshi", [1], 4);
  add("多摩川", "attack", [3], 3);
  add("戸田", "sashi", [2,4], 4);
  add("江戸川", "outside", [4,5,6], 5);
  add("平和島", "attack", [3,4], 3);
  add("宮島", "sashi", [2,5], 3);
  add("福岡", "manshu", [4,5,6], 5);

  // 宮島：イン有利だが3コース攻めも有効
  add("宮島", "attack", [3], 2);

  // 丸亀：イン残りを少し評価
  add("丸亀", "nokoshi", [1], 2);

  // 多摩川：差しが届く条件を少し評価
  add("多摩川", "sashi", [2], 2);

  return s;
  }
  function buildRaceShape(attack, sashi, nokoshi, type) {
   return `${attack}号艇${type} → ${sashi}号艇差し場 → ${nokoshi}号艇残し`;
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

function buildExpectedValue(aiRank, oddsList) {
  const oddsMap = new Map();

  (oddsList || []).forEach(o => {
    const key = normalizeKey(o.key || o.result || o.number);
    const first = Number(key[0]);
    const odds = Number(o.odds);
    if (first && odds > 0) {
      const current = oddsMap.get(first) || [];
      current.push(odds);
      oddsMap.set(first, current);
    }
  });

  return (aiRank || []).map(x => {
    const arr = oddsMap.get(Number(x.boat)) || [];
    const avgOdds = arr.length
      ? arr.reduce((a, b) => a + b, 0) / arr.length
      : 10;

    const probability = Number(x.score) / 100;
    const ev = +(probability * avgOdds).toFixed(2);

    return {
      boat: x.boat,
      name: x.name,
      score: x.score,
      odds: avgOdds.toFixed(1),
      ev
    };
  }).sort((a, b) => b.ev - a.ev);
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
    return { boat: Number(forced), name: b?.name || "", score: 75 };
  }

  let best = null;
  let bestScore = -999;

  boats
    .filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5)
    .forEach(b => {
      const no = Number(b.boat);
      let s = 45;

      s += venueAdjust(window.currentVenue, no, "attack");

      if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.10) s += 10;
      else if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.13) s += 6;

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

function pickSashiBoat(boats, attackBoat) {
  let best = null;
  let bestScore = -999;

  boats
    .filter(b => Number(b.boat) !== Number(attackBoat))
    .forEach(b => {
      const no = Number(b.boat);
      let s = 40;
      s += venueAdjust(window.currentVenue, no, "sashi");
      if (no === 2) s += 14;
      if (no === 5) s += 12;
      if (no === 4) s += 8;
      if (no === 6) s += 6;

      if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) s += 8;
      if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) s += 8;
      if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) s += 6;
      if (num(b.localWinRate, 0) >= 6) s += 6;
      if (num(b.motor2Rate, 0) >= 40) s += 5;

      if (no === 1 && Number(attackBoat) >= 3) s += 8;

      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    });

  return Number(best?.boat || 2);
}

function pickNokoshiBoat(boats, attackBoat) {
  let best = null;
  let bestScore = -999;

  boats
    .filter(b => Number(b.boat) !== Number(attackBoat))
    .forEach(b => {
      const no = Number(b.boat);
      let s = 40;
      s += venueAdjust(window.currentVenue, no, "nokoshi");
      if (no === 1) s += 16;
      if (no === 4) s += 10;
      if (no === 2) s += 8;
      if (no === 6) s += 8;

      if (num(b.lapTime, 0) > 0 && num(b.lapTime) <= 37.00) s += 12;
      if (num(b.localWinRate, 0) >= 6.5) s += 10;
      if (num(b.nationalWinRate, 0) >= 6) s += 6;
      if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.16) s += 5;

      if (no === 1 && Number(attackBoat) >= 3) s += 8;

      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    });

  return Number(best?.boat || 1);
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

function uniqueNums(list) {
  return [...new Set(
    (list || [])
      .map(x => Number(x))
      .filter(x => Number.isFinite(x) && x >= 1 && x <= 6)
  )];
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

      <h4>💣 万舟注目艇</h4>
      ${targets.map(b => `
        <div class="race-line">
          <b>${b.boat}号艇 ${b.name || ""}</b>
          <p><b>万舟指数：</b>${b.manshuScore}点</p>
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

function calcBoatScore(b) {
  let s = 50;

  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.14) s += 10;
  if (num(b.localWinRate, 0) >= 7) s += 8;
  else if (num(b.localWinRate, 0) >= 6) s += 4;
  if (num(b.nationalWinRate, 0) >= 6) s += 8;
  if (num(b.motor2Rate, 0) >= 40) s += 5;
  if (num(b.avgST, 0) >= 0.20) s -= 6;
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) s += 8;
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) s += 8;
  if (num(b.lapTime, 0) > 0 && num(b.lapTime) <= 37.00) s += 10;
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) >= 6.90) s -= 3;
  if (num(b.lapTime, 0) > 0 && num(b.lapTime) >= 37.20) s -= 3;
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate) <= 25) s -= 4;
  
  // 地元・当地を少し強化
if (num(b.localWinRate, 0) >= 7.0) s += 4;
if (num(b.local2Rate, 0) >= 50) s += 3;

// 今節スタート重視
if (num(b.thisST, 0) > 0 && num(b.thisST) <= 0.14) s += 6;

// 今節着順重視
if (num(b.thisAverage, 0) >= 6.0) s += 5;

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

function termHelp(term) {
  const dict = {
    "モーター2連率": "そのモーターが1着または2着に入った割合です。",
    "モーター3連率": "そのモーターが3着以内に入った割合です。"
  };

  alert(`${term}\n\n${dict[term] || "説明がまだ登録されていません。"}`);
}

function helpBtn(term) {
  return `<button class="help-btn" onclick="termHelp('${term}')">?</button>`;
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
  const aiRank = analysis?.chappyIndex || [];
  const tenkai = analysis?.tenkaiRate || {
  escape: 0,
  attack: 0,
  sashi: 0,
  nokoshi: 0,
  upset: 0
};
  const evRank = analysis?.expectedValue || [];
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
        <b>🔥 攻め艇</b>
        <p>${attack}号艇：${attackComment}</p>
        <p><b>攻め指数：</b>${calcBoatScore(boatByNo(latestRaceData?.boats, attack))}点</p>
      </div>

      <div class="race-line">
        <b>🌊 差し場</b>
        <p>${sashi}号艇：攻めが入った時に差し場を拾う候補。</p>
        <p><b>差し指数：</b>${calcBoatScore(boatByNo(latestRaceData?.boats, sashi))}点</p>
      </div>

      <div class="race-line">
        <b>⚡ 残し艇</b>
        <p>${nokoshi}号艇：攻められても2・3着に残す候補。</p>
        <p><b>残し指数：</b>${calcBoatScore(boatByNo(latestRaceData?.boats, nokoshi))}点</p>
      </div>
      
      <div class="race-line">
        <b>🧠 展開根拠</b>
      </div>
      
      <div class="race-line">
        <b>🎯 展開シミュレーション</b>

        <p><b>本線</b></p>
        <p>${buildSimulation(analysis,"main")}</p>

        <p><b>対抗</b></p>
        <p>${buildSimulation(analysis,"sub")}</p>

        <p><b>万舟</b></p>
      <p>${buildSimulation(analysis,"hole")}</p>
     </div>
      
            <div class="race-line">
        <b>⚠️ 軸が飛ぶ条件</b>
        <p>${flyCondition}</p>
      </div>
<div class="race-line">
  <b>🤖 チャッピー人工知能指数</b>

  ${renderAiRank(aiRank)}

</div>
  ${renderTenkaiRate(tenkai)}
  ${renderTenkaiIndex(buildTenkaiIndexTable(latestRaceData?.boats || []))}
  ${renderEvRank(evRank)}
  `;
}


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

  return `${attack}号艇が展開を作る想定。${sashi}号艇が差し場、${nokoshi}号艇が残し候補。`;
  }
  function buildHoleComment(key, odds) {
  if (!key) return "";

  const a = key.split("-").map(Number);

  if (a[0] === 2) return "◎2差し";
  if (a[0] === 3) return "◎3攻め";
  if (a[0] === 4) return "◎4カド";
  if (a[0] === 5) return "◎5一撃";
  if (a[0] === 6) return "◎6展開";

  if (Number(odds) >= 200) return "○高配当";
  return "";
}
  function renderTenkaiIndex(list = []) {
  return `
    <div class="race-line">
      <b>📊 展開指数</b>
      ${
        list.map(x => `
          <p>
            ${x.boat}号艇 ${x.name}<br>
            攻め:${x.attack} / 差し:${x.sashi} / 残し:${x.nokoshi}
          </p>
        `).join("")
      }
    </div>
  `;
}