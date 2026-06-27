// script.js v14.0 前半
// 完全再構築版：追加パッチなし / 重複関数なし

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生: "01",
  戸田: "02",
  江戸川: "03",
  平和島: "04",
  多摩川: "05",
  浜名湖: "06",
  蒲郡: "07",
  常滑: "08",
  津: "09",
  三国: "10",
  びわこ: "11",
  住之江: "12",
  尼崎: "13",
  鳴門: "14",
  丸亀: "15",
  児島: "16",
  宮島: "17",
  徳山: "18",
  下関: "19",
  若松: "20",
  芦屋: "21",
  福岡: "22",
  唐津: "23",
  大村: "24"
};

let currentResultStatus = "";
let latestRaceData = null;
let latestOddsList = [];

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
    const res = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`);
    const data = await res.json();

    const oddsRes = await fetch(`/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`);
    const oddsData = await oddsRes.json();

    const missRes = await fetch(`/api/missing?jcd=${jcd}&rno=${rno}&date=${date}`);
    const missData = await missRes.json();

    data.odds = oddsData?.ok ? oddsData.odds || [] : oddsData?.odds || [];
    data.missing = missData?.ok ? missData.missing || [] : missData?.missing || [];

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

function renderAll(data) {
  latestRaceData = data;

  const boats = data.boats || [];
  const p = data.prediction || {};
  const venue = data.venue || {};
  const weather = data.weather || {};
  const odds = data.odds || [];
  const missing = data.missing || [];
  const analysis = analyzeRace(boats, p);

  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderCondition(venue, weather, boats));
  setHTML("#mainSheetArea", renderMainSheet(boats, p, analysis));
  setHTML("#formationArea", renderFormations(p));
  setHTML("#oddsArea", renderOdds(odds));
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p, analysis) + renderManshuOdds(odds) + renderMissingTop30(missing));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather, analysis));

  renderStatsArea();
  setTimeout(autoFillOdds, 200);
}

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>ST</th><th>展示</th><th>役割</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${b.exhibitionTime ?? "-"}</td>
              <td>${roleName(b.boat)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCondition(venue, weather, boats) {
  return `
    <div class="summary-box">
      <h3>🌊 水面・場傾向</h3>
      <p><b>${venue.name || "-"}</b>：${venue.courseBias || "場傾向不明"}</p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候：${weather.weather || "-"} / 風${weather.windSpeed ?? "-"}m / 波${weather.waveHeight ?? "-"}cm / 気温${weather.temperature ?? "-"}℃</p>
    </div>

    <details>
      <summary>▶ モーター・展示詳細</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>M</th><th>M2</th><th>M3</th><th>展示ST</th><th>チルト</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td>${b.boat}</td>
                <td>${b.motor ?? "-"}</td>
                <td>${b.motor2Rate ?? "-"}%</td>
                <td>${b.motor3Rate ?? "-"}%</td>
                <td>${fmtST(b.exhibitionST)}</td>
                <td>${b.tilt ?? "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}

function analyzeRace(boats, p) {
  const shape = p.raceShape || {};
  const b1 = boatByNo(boats, 1);
  const attack = pickAttackBoat(boats, shape.attackBoat);

  const inTrust = scoreInTrust(b1);

  return {
    inTrust,
    attackBoat: attack.boat,
    attackName: attack.name,
    attackScore: attack.score,
    sashiBoat: attack.boat === 3 || attack.boat === 4 ? 5 : 2,
    nokoshiBoat: attack.boat === 3 ? 4 : 2,
    shapeText: shape.shape || `${attack.boat}号艇攻め → 内残り・差し場`
  };
}

function scoreInTrust(b) {
  let s = 60;
  if (!b) return s;

  const avgST = num(b.avgST, 0.18);
  const exST = num(b.exhibitionST, 0.18);
  const local = num(b.localWinRate, 0);
  const national = num(b.nationalWinRate, 0);
  const motor = num(b.motor2Rate, 0);

  if (avgST > 0 && avgST <= 0.14) s += 10;
  if (avgST >= 0.20) s -= 12;
  if (exST > 0 && exST <= 0.12) s += 8;
  if (exST >= 0.20) s -= 10;
  if (local >= 7) s += 10;
  if (local > 0 && local < 5) s -= 8;
  if (national >= 7) s += 6;
  if (motor >= 40) s += 5;
  if (motor > 0 && motor < 25) s -= 5;

  return clamp(s);
}

function pickAttackBoat(boats, forced) {
  if (forced) {
    const b = boatByNo(boats, forced);
    return {
      boat: Number(forced),
      name: b?.name || "",
      score: 75
    };
  }

  let best = null;
  let bestScore = -999;

  boats
    .filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5)
    .forEach(b => {
      let s = 50;
      const no = Number(b.boat);

      if (num(b.avgST, 0.18) > 0 && num(b.avgST, 0.18) <= 0.14) s += 12;
      if (num(b.exhibitionST, 0.18) > 0 && num(b.exhibitionST, 0.18) <= 0.12) s += 12;
      if (num(b.motor2Rate, 0) >= 40) s += 6;
      if (num(b.localWinRate, 0) >= 7) s += 8;
      if (num(b.tilt, 0) >= 0.5) s += 5;
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
      <div class="summary-box">
        <b>🚤 展開診断</b>
        <p>イン信頼度：${analysis.inTrust}点</p>
        <p>攻め艇：${analysis.attackBoat}号艇 ${analysis.attackName || ""} / 攻め期待 ${analysis.attackScore}点</p>
        <p>流れ：${analysis.shapeText}</p>
      </div>

      ${picks.map(([mark, label, m]) => {
        if (!m) return "";

        const b = boatByNo(boats, m.boat) || m;
        const score = b.totalScore ?? m.totalScore ?? calcBoatScore(b);
        const plus = buildBuffs(b);
        const minus = buildDebuffs(b);

        return `
          <div class="race-line">
            <b>${mark} ${label}：${b.boat || m.boat}号艇 ${b.name || ""}</b>
            <p>スコア：${score}点</p>
            <p>特徴：${roleName(b.boat)}</p>
            <p>展開：${roleComment(b)}</p>
            <p>⬆️ ${plus.length ? plus.join(" / ") : "大きな加点なし"}</p>
            <p>⬇️ ${minus.length ? minus.join(" / ") : "大きな減点なし"}</p>
            <p>データ：${simpleReasons(b)}</p>
          </div>
        `;
      }).join("") || `<div class="summary-box">本命データなし</div>`}

      <div class="summary-box">
        <b>判断軸</b>
        <p>情報 → 展開 → 評価 → 舟券。展示・ST・当地・水面を材料にして展開を考える。</p>
      </div>
    </div>
  `;
}

function renderFormations(p) {
  return `
    <div class="sheet">
      <h3>🧾 フォーメーション</h3>

      <h4>本線</h4>
      ${tickets(p.mainFormation || [])}

      <h4>押さえ</h4>
      ${tickets(p.safeFormation || [])}

      <h4>穴・流し候補</h4>
      ${tickets(p.holeFormation || [])}

      <h4>万舟</h4>
      ${tickets(p.manshuFormation || p.manshuTickets || [])}
    </div>
  `;
}

function renderOdds(odds) {
  latestOddsList = Array.isArray(odds) ? odds : [];

  if (!latestOddsList.length) {
    return `<div class="summary-box">オッズ未取得</div>`;
  }

  return `
    <div class="sheet odds-card">
      <h3>💰 3連単オッズ TOP12</h3>
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

function renderManshuSheet(boats, p, analysis) {
  const shape = p.raceShape || {};
  const forms = p.manshuFormation || p.manshuTickets || p.holeFormation || [];
  const targets = pickManshuTargets(boats, analysis);

  return `
    <div class="sheet manshu-sheet">
      <h3>💣 万舟シート</h3>

      <h4>💣 万舟軸</h4>
      <p><b>${p.manshuAxis || p.holeAxis || targets.map(b => `${b.boat}号艇`).join("・") || "展開待ち"}</b></p>

      <h4>💣 万舟理由</h4>
      <p>${p.manshuReason || shape.shape || "イン信頼度が下がり、攻め艇が動いて差し場ができた時に高配当を狙う。"}</p>

      <h4>🚤 展開ルート</h4>
      <p>
        ${analysis.attackBoat}号艇が攻める<br>
        ↓<br>
        1残り・2差し残り・4残しを見る<br>
        ↓<br>
        5差し場・6展開待ちで万舟化
      </p>

      <h4>💣 万舟フォーメーション</h4>
      ${tickets(forms)}

      <h4>注目艇</h4>
      ${targets.map(b => `
        <div class="race-line">
          <b>${b.boat}号艇 ${b.name || ""}</b>
          <p>万舟指数：${b.manshuScore}点</p>
          <p>⬆️ ${buildBuffs(b).join(" / ") || "展開待ち"}</p>
          <p>${manshuReason(b)}</p>
        </div>
      `).join("") || `<div class="summary-box">万舟候補なし</div>`}
    </div>
  `;
}

function pickManshuTargets(boats, analysis) {
  return boats
    .filter(b => Number(b.boat) >= 3)
    .map(b => ({
      ...b,
      manshuScore: calcManshuScore(b, analysis)
    }))
    .sort((a, b) => b.manshuScore - a.manshuScore)
    .slice(0, 3);
}

function calcManshuScore(b, analysis) {
  let s = 40;
  const no = Number(b.boat);

  if (no === 4 && analysis.attackBoat === 3) s += 18;
  if (no === 5 && [3, 4].includes(analysis.attackBoat)) s += 22;
  if (no === 6 && analysis.inTrust < 65) s += 12;
  if (num(b.localWinRate, 0) >= 7) s += 10;
  if (num(b.avgST, 0.18) > 0 && num(b.avgST, 0.18) <= 0.15) s += 8;
  if (num(b.exhibitionST, 0.18) > 0 && num(b.exhibitionST, 0.18) <= 0.12) s += 8;
  if (num(b.totalScore, 0) >= 70) s += 8;

  return clamp(s);
}

function renderManshuOdds(odds) {
  const list = Array.isArray(odds)
    ? odds.filter(o => Number(o.odds) >= 100).slice(0, 10)
    : [];

  if (!list.length) {
    return `<div class="summary-box">💣 万舟候補なし</div>`;
  }

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
      <p>${p.raceComment || "展開とSTを見て本線・押さえ・穴・万舟を分ける。"}</p>
      <p><b>展開：</b>${analysis?.shapeText || p.raceShape?.shape || "-"}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

function autoFillOdds() {
  const result = val("#raceResultInput");
  const oddsInput = $("#oddsInput");

  if (!oddsInput || !result) {
    updateAutoPayout();
    return;
  }

  const hit = findOddsByResult(result);

  if (hit?.odds) {
    oddsInput.value = hit.odds;
  }

  updateAutoPayout();
}

function autoJudgeResult() {
  const result = normalizeKey(val("#raceResultInput"));
  if (!result) return;

  const predictions = collectPredictionTickets();

  currentResultStatus = predictions.includes(result)
    ? "アタリ"
    : "ハズレ";

  setStatus(
    currentResultStatus === "アタリ"
      ? "⭕ アタリ自動判定"
      : "❌ ハズレ自動判定"
  );
}

function collectPredictionTickets() {
  const p = latestRaceData?.prediction || {};

  const lists = [
    p.mainFormation,
    p.safeFormation,
    p.holeFormation,
    p.manshuFormation,
    p.manshuTickets
  ];

  return lists
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
  const payout = currentResultStatus === "アタリ"
    ? Math.floor(bet * odds)
    : 0;

  const history = JSON.parse(
    localStorage.getItem("chappyResultHistory") || "[]"
  );

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
  const history = JSON.parse(
    localStorage.getItem("chappyResultHistory") || "[]"
  );

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
  const history = JSON.parse(
    localStorage.getItem("chappyResultHistory") || "[]"
  );

  const predictions = history.length;
  const hits = history.filter(r => r.status === "アタリ").length;

  const bet = history.reduce((sum, r) => sum + Number(r.bet || 0), 0);
  const payout = history.reduce((sum, r) => sum + Number(r.payout || 0), 0);

  const hitRate = predictions > 0
    ? ((hits / predictions) * 100).toFixed(1)
    : "0";

  const recoveryRate = bet > 0
    ? ((payout / bet) * 100).toFixed(1)
    : "0";

  const venueStats = {};

  history.forEach(r => {
    if (!r.place) return;

    if (!venueStats[r.place]) {
      venueStats[r.place] = {
        predictions: 0,
        hits: 0,
        bet: 0,
        payout: 0
      };
    }

    venueStats[r.place].predictions++;
    if (r.status === "アタリ") venueStats[r.place].hits++;
    venueStats[r.place].bet += Number(r.bet || 0);
    venueStats[r.place].payout += Number(r.payout || 0);
  });

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

    <h3>🚤 24場別成績</h3>
    <table class="table">
      <tr>
        <th>場</th>
        <th>予想</th>
        <th>的中率</th>
        <th>回収率</th>
      </tr>
      ${Object.entries(venueStats).map(([place, s]) => {
        const vHitRate = s.predictions > 0
          ? ((s.hits / s.predictions) * 100).toFixed(1)
          : "0";

        const vRecoveryRate = s.bet > 0
          ? ((s.payout / s.bet) * 100).toFixed(1)
          : "0";

        return `
          <tr>
            <td>${place}</td>
            <td>${s.predictions}</td>
            <td>${vHitRate}%</td>
            <td>${vRecoveryRate}%</td>
          </tr>
        `;
      }).join("")}
    </table>
  `;
}

function updateAutoPayout() {
  const bet = Number($("#betAmountInput")?.value || 0);
  const odds = Number($("#oddsInput")?.value || 0);
  const text = $("#autoPayoutText");

  const payout = Math.floor(bet * odds);

  if (text) {
    text.textContent = `払戻金：${payout.toLocaleString()}円`;
  }
}

function calcBoatScore(b) {
  if (!b) return 50;

  let s = 50;

  if (num(b.avgST, 0.18) > 0 && num(b.avgST, 0.18) <= 0.14) s += 10;
  if (num(b.exhibitionST, 0.18) > 0 && num(b.exhibitionST, 0.18) <= 0.12) s += 8;
  if (num(b.localWinRate, 0) >= 7) s += 10;
  if (num(b.nationalWinRate, 0) >= 7) s += 8;
  if (num(b.motor2Rate, 0) >= 40) s += 5;

  return clamp(s);
}

function buildBuffs(b) {
  const r = [];

  if (num(b.avgST, 0) > 0 && num(b.avgST, 0) <= 0.15) r.push("ST良");
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST, 0) <= 0.12) r.push("展示ST良");
  if (num(b.localWinRate, 0) >= 7) r.push("当地強");
  if (num(b.nationalWinRate, 0) >= 7) r.push("全国勝率高");
  if (num(b.motor2Rate, 0) >= 40) r.push("モーター良");

  return r;
}

function buildDebuffs(b) {
  const r = [];

  if (num(b.avgST, 0) >= 0.20) r.push("ST遅め");
  if (num(b.exhibitionST, 0) >= 0.20) r.push("展示ST遅め");
  if (num(b.localWinRate, 0) > 0 && num(b.localWinRate, 0) < 5) r.push("当地弱め");
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate, 0) < 25) r.push("モーター弱め");

  return r;
}

function simpleReasons(b) {
  if (!b) return "データ不足";

  const r = [];

  if (num(b.exhibitionTime, 0) > 0) r.push(`展示${b.exhibitionTime}`);
  if (num(b.exhibitionST, 0) > 0) r.push(`展示ST${fmtST(b.exhibitionST)}`);
  if (num(b.avgST, 0) > 0) r.push(`平均ST${fmtST(b.avgST)}`);
  if (num(b.localWinRate, 0) > 0) r.push(`当地勝率${b.localWinRate}`);
  if (num(b.nationalWinRate, 0) > 0) r.push(`全国勝率${b.nationalWinRate}`);
  if (num(b.motor2Rate, 0) > 0) r.push(`M2率${b.motor2Rate}%`);

  return r.slice(0, 5).join(" / ") || "平均的な評価";
}

function roleName(boat) {
  const n = Number(boat);

  if (n === 1) return "逃げ軸";
  if (n === 2) return "差し候補";
  if (n === 3) return "攻め候補";
  if (n === 4) return "カド攻め・残し";
  if (n === 5) return "差し場待ち";
  if (n === 6) return "展開待ち・当地注意";

  return "-";
}

function roleComment(b) {
  const n = Number(b.boat);

  if (n === 1) return "インから先マイできれば軸。ST遅れは波乱。";
  if (n === 2) return "2コース差し候補。頭だけでなく2着残りも見る。";
  if (n === 3) return "センター攻めの起点。まくり・まくり差し候補。";
  if (n === 4) return "4コース残しを切らない。3攻めに乗る形も見る。";
  if (n === 5) return "内が競った時の差し場。万舟の入口。";
  if (n === 6) return "大外で展開待ち。当地・地元・道中力があれば注意。";

  return "展開次第。";
}

function manshuReason(b) {
  const n = Number(b.boat);

  if (n === 3) return "3が攻めると人気筋が崩れて配当が上がる。";
  if (n === 4) return "4残し・カド攻めで本線からズレると高配当。";
  if (n === 5) return "差し場が開くと2・3着絡みで跳ねる。";
  if (n === 6) return "展開待ちだが当地・道中力で3着拾いあり。";

  return "展開がズレた時の候補。";
}

function findOddsByResult(result) {
  const key = normalizeKey(result);

  return latestOddsList.find(o =>
    normalizeKey(o.key || o.result || o.number) === key
  );
}

function normalizeKey(v) {
  return String(v || "")
    .replaceAll("-", "")
    .replaceAll("－", "")
    .replaceAll(" ", "")
    .trim();
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

function normalizeDate(v) {
  return String(v || "")
    .replaceAll("-", "")
    .replaceAll("/", "")
    .trim();
}

function clearAreas() {
  [
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
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) {
    return "-";
  }

  const n = Number(v);

  if (n < 0) {
    return `F${Math.abs(n).toFixed(2).slice(1)}`;
  }

  return n.toFixed(2);
}

function todayYmd() {
  const d = new Date();

  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}