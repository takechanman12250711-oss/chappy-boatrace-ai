// script.js v9.0 stable
// 完全貼り替え版：本命/万舟/オッズ/成績管理 復旧版

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
  document.querySelector("#fetchRaceBtn")?.addEventListener("click", runPrediction);
  document.querySelector("#raceResultInput")?.addEventListener("input", () => {
    autoFillOdds();
    autoJudgeResult();
  });
  document.querySelector("#oddsInput")?.addEventListener("input", updateAutoPayout);
  document.querySelector("#betAmountInput")?.addEventListener("input", updateAutoPayout);
  document.querySelector("#saveResultBtn")?.addEventListener("click", saveSimpleResult);
  document.querySelector("#undoResultBtn")?.addEventListener("click", undoLastResult);

  document.querySelector(".result-buttons")?.style.setProperty("display", "none");

  renderStatsArea();
});

async function runPrediction() {
  const place = val("#placeSelect");
  const rno = String(val("#raceSelect")).replace("R", "");
  const dateRaw = val("#dateInput");
  const date = dateRaw
    ? dateRaw.replaceAll("-", "").replaceAll("/", "")
    : todayYmd();

  const jcd = PLACE_CODES[place] || place;
  const safeDate = date || todayYmd();

  setStatus("取得中…");
  clearAreas();
  setHTML("#raceListArea", `<div class="loading">読み込み中…</div>`);

  try {
    const res = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const data = await res.json();

    const oddsRes = await fetch(`/api/odds?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const oddsData = await oddsRes.json();

    const missRes = await fetch(`/api/missing?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const missData = await missRes.json();

    let statsData = null;
    try {
      const statsRes = await fetch("/api/stats");
      statsData = await statsRes.json();
    } catch (_) {
      statsData = null;
    }

    data.odds = oddsData?.ok ? oddsData.odds || [] : oddsData?.odds || [];
    data.missing = missData?.ok ? missData.missing || [] : missData?.missing || [];
    data.stats = statsData;

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

  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderCondition(venue, weather, boats));
  setHTML("#mainSheetArea", renderMainSheet(boats, p));
  setHTML("#formationArea", renderFormations(p));
  setHTML("#oddsArea", renderOdds(odds));
  setHTML(
    "#manshuSheetArea",
    renderManshuSheet(boats, p) + renderManshuOdds(odds) + renderMissingTop30(missing)
  );
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));

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

function renderMainSheet(boats, p) {
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
        const b = boats.find(x => Number(x.boat) === Number(m.boat)) || m;
        return `
          <div class="race-line">
            <b>${mark} ${label}：${b.boat || m.boat}号艇 ${b.name || ""}</b>
            <span>評価 ${b.totalScore ?? m.totalScore ?? "-"}</span>
            <p>${roleComment(b)}</p>
            <p>理由：${simpleReasons(b)}</p>
          </div>
        `;
      }).join("") || `<div class="summary-box">本命データなし</div>`}

      <div class="summary-box">
        <b>判断軸</b>
        <p>展示・ST・場傾向・当地成績・展開を合わせて評価。モーター数字だけでは決めない。</p>
      </div>
    </div>
  `;
}

function renderFormations(p) {
  return `
    <div class="sheet">
      <h3>🧾 買い目</h3>
      <h4>本線</h4>
      ${tickets(p.mainFormation)}
      <h4>押さえ</h4>
      ${tickets(p.safeFormation || (p.holeFormation || []).slice(0, 3))}
      <h4>穴・流し候補</h4>
      ${tickets(p.holeFormation)}
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
            <b>${i + 1}. ${showKey(o.key)}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderManshuSheet(boats, p) {
  const shape = p.raceShape || {};
  const targets = boats
    .filter(b => Number(b.boat) >= 3)
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0, 4);

  return `
    <div class="sheet manshu-sheet">
      <p><b>狙い筋：</b>${shape.shape || "3攻め・4残し・5差し場・6展開待ち"}</p>
      <p><b>攻め艇：</b>${shape.attackBoat ? shape.attackBoat + "号艇" : "未判定"}</p>
      <p>外枠だけでなく、内側絡みの高配当も見る。</p>

      ${targets.map(b => `
        <div class="race-line">
          <b>${b.boat}号艇 ${b.name || ""}</b>
          <span>万舟期待 ${stars(b.totalScore)}</span>
          <p>${manshuReason(b)}</p>
          <p>理由：${simpleReasons(b)}</p>
        </div>
      `).join("") || `<div class="summary-box">万舟データなし</div>`}
    </div>
  `;
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
            <b>${i + 1}. ${showKey(o.key)}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMissingTop30(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return `<div class="summary-box">出てない目TOP30取得中...</div>`;
  }

  return `
    <div class="sheet missing-card">
      <h3>📊 出てない目 TOP30</h3>
      <div class="odds-grid">
        ${list.slice(0, 30).map((x, i) => `
          <div class="odds-pill">
            <b>${x.rank || i + 1}. ${showKey(x.key || x.result)}</b>
            <span>${x.odds || "-"}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAlerts(p) {
  const list = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!list.length) {
    return `<div class="summary-box">🚨 大きな理論アラートなし。基本展開を重視。</div>`;
  }

  return `
    <div class="sheet">
      <h3>🚨 理論アラート</h3>
      ${list.map(a => `
        <div class="race-line">
          <b>${a.boat}号艇 ${a.type || "アラート"}</b>
          <p>${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFinalComment(p, venue, weather) {
  return `
    <div class="summary-box">
      <h3>📝 最終コメント</h3>
      <p>${p.raceComment || "展開とSTを見て本線・押さえ・穴を分ける。"}</p>
      <p><b>展開：</b>${p.raceShape?.shape || "-"}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

function normalizeKey(v) {
  return String(v || "")
    .replaceAll("-", "")
    .replaceAll(" ", "")
    .trim();
}

function showKey(v) {
  const s = normalizeKey(v);
  return s.length === 3 ? `${s[0]}-${s[1]}-${s[2]}` : String(v || "-");
}

function expandTicket(raw) {
  const t = String(raw || "").trim();
  if (!t) return [];

  if (/^[1-6]-[1-6]-[1-6]$/.test(t)) return [t];

  const parts = t.split("-").filter(Boolean);
  if (parts.length !== 3) return [t];

  const out = [];
  [...parts[0]].forEach(a => {
    [...parts[1]].forEach(b => {
      [...parts[2]].forEach(c => {
        if (a !== b && b !== c && a !== c) {
          out.push(`${a}-${b}-${c}`);
        }
      });
    });
  });

  return [...new Set(out)];
}

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;

  const expanded = list
    .flatMap(x => expandTicket(typeof x === "string" ? x : x.key || x.result || ""))
    .filter(Boolean);

  const unique = [...new Set(expanded)];

  if (!unique.length) return `<p>なし</p>`;

  return `
    <div class="ticket-list">
      ${unique.map(x => `<span class="ticket">${x}</span>`).join("")}
    </div>
  `;
}

function findOddsByResult(result) {
  const key = normalizeKey(result);
  return latestOddsList.find(o => normalizeKey(o.key || o.result || o.number) === key);
}

function autoFillOdds() {
  const result = val("#raceResultInput");
  const oddsInput = document.querySelector("#oddsInput");

  if (!oddsInput) return;

  if (result) {
    const hit = findOddsByResult(result);
    if (hit?.odds) {
      oddsInput.value = hit.odds;
    }
  }

  updateAutoPayout();
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
    .flatMap(list => list.flatMap(x => expandTicket(typeof x === "string" ? x : x.key || x.result || "")))
    .map(normalizeKey);
}

function autoJudgeResult() {
  const result = normalizeKey(val("#raceResultInput"));
  if (!result) return;

  const predictions = collectPredictionTickets();
  currentResultStatus = predictions.includes(result) ? "アタリ" : "ハズレ";

  setStatus(currentResultStatus === "アタリ" ? "⭕ アタリ自動判定" : "❌ ハズレ自動判定");
  updateAutoPayout();
}

function saveSimpleResult() {
  const resultRaw = val("#raceResultInput");
  if (!resultRaw) {
    alert("レース結果を入力してね");
    return;
  }

  autoFillOdds();
  autoJudgeResult();

  const bet = Number(document.querySelector("#betAmountInput")?.value || 0);
  const odds = Number(document.querySelector("#oddsInput")?.value || 0);
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

  const hitRate = predictions > 0 ? ((hits / predictions) * 100).toFixed(1) : "0";
  const recoveryRate = bet > 0 ? ((payout / bet) * 100).toFixed(1) : "0";

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

  const area = document.querySelector("#statsArea");
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
  const bet = Number(document.querySelector("#betAmountInput")?.value || 0);
  const odds = Number(document.querySelector("#oddsInput")?.value || 0);
  const text = document.querySelector("#autoPayoutText");

  const payout = currentResultStatus === "アタリ"
    ? Math.floor(bet * odds)
    : 0;

  if (text) {
    text.textContent = `払戻金：${payout.toLocaleString()}円`;
  }
}

function simpleReasons(b) {
  if (!b) return "データ不足";

  const r = [];

  if (Number(b.exhibitionTime) > 0) r.push(`展示${b.exhibitionTime}`);
  if (Number(b.exhibitionST) > 0) r.push(`展示ST${fmtST(b.exhibitionST)}`);
  if (Number(b.avgST) > 0) r.push(`平均ST${fmtST(b.avgST)}`);
  if (Number(b.localWinRate) > 0) r.push(`当地勝率${b.localWinRate}`);
  if (Number(b.nationalWinRate) > 0) r.push(`全国勝率${b.nationalWinRate}`);
  if (Number(b.motor2Rate) > 0) r.push(`M2率${b.motor2Rate}%`);

  return r.slice(0, 5).join(" / ") || "平均的な評価";
}

function roleName(boat) {
  const n = Number(boat);
  if (n === 1) return "逃げ軸";
  if (n === 2) return "差し候補";
  if (n === 3) return "攻め候補";
  if (n === 4) return "カド攻め";
  if (n === 5) return "差し場待ち";
  if (n === 6) return "展開待ち";
  return "-";
}

function roleComment(b) {
  const n = Number(b.boat);
  if (n === 1) return "インから先マイできれば軸。ST遅れは注意。";
  if (n === 2) return "2コース差し候補。頭より2着残りも見る。";
  if (n === 3) return "センター攻めの起点。まくり・まくり差し候補。";
  if (n === 4) return "カドから攻め残し、または3攻めに乗る形。";
  if (n === 5) return "内が競った時の差し場。2・3着で配当を上げる。";
  if (n === 6) return "大外で展開待ち。当地やSTが良ければ切りすぎ注意。";
  return "展開次第。";
}

function manshuReason(b) {
  const n = Number(b.boat);
  if (n === 3) return "3が攻めると人気筋が崩れて配当が上がる。";
  if (n === 4) return "カド残しで本線からズレると高配当。";
  if (n === 5) return "差し場が開くと2・3着絡みで跳ねる。";
  if (n === 6) return "展開待ちだが人気薄で配当妙味あり。";
  return "展開がズレた時の候補。";
}

function stars(score) {
  const s = Number(score || 0);
  if (s >= 75) return "★★★★★";
  if (s >= 65) return "★★★★";
  if (s >= 55) return "★★★";
  return "★★";
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
  const el = document.querySelector("#statusText");
  if (el) el.textContent = text;
}

function val(id) {
  return document.querySelector(id)?.value?.trim() || "";
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
/* ===== v9.1 修正：フォーメーション戻し＋払戻金表示修正 ===== */

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;

  return `
    <div class="ticket-list">
      ${[...new Set(list.map(x => typeof x === "string" ? x : (x.key || x.result || "")))]
        .filter(Boolean)
        .map(x => `<span class="ticket">${x}</span>`)
        .join("")}
    </div>
  `;
}

function renderFormations(p) {
  return `
    <div class="sheet">
      <h3>🧾 買い目</h3>

      <h4>本線</h4>
      ${tickets(p.mainFormation)}

      <h4>押さえ</h4>
      ${tickets(p.safeFormation || [])}

      <h4>穴・流し候補</h4>
      ${tickets(p.holeFormation || [])}
    </div>
  `;
}

function updateAutoPayout() {
  const bet = Number(document.querySelector("#betAmountInput")?.value || 0);
  const odds = Number(document.querySelector("#oddsInput")?.value || 0);
  const text = document.querySelector("#autoPayoutText");

  const payout = Math.floor(bet * odds);

  if (text) {
    text.textContent = `払戻金：${payout.toLocaleString()}円`;
  }
}

document.querySelector("#raceResultInput")?.addEventListener("input", () => {
  autoFillOdds();
  autoJudgeResult();
  updateAutoPayout();
});

document.querySelector("#betAmountInput")?.addEventListener("input", updateAutoPayout);
document.querySelector("#oddsInput")?.addEventListener("input", updateAutoPayout);
/* ===== 本命シート強化 v9.2 ===== */

function renderMainSheet(boats, p) {
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

        const b =
          boats.find(x =>
            Number(x.boat) === Number(m.boat)
          ) || m;

        const score =
          b.totalScore ??
          m.totalScore ??
          "-";

        return `
          <div class="race-line">

            <b>${mark} ${label}</b>

            <p>
              ${b.boat}号艇
              ${b.name || ""}
            </p>

            <p>
              スコア：
              ${score}点
            </p>

            <p>
              特徴：
              ${roleName(b.boat)}
            </p>

            <p>
              展開：
              ${roleComment(b)}
            </p>

            <p>
              データ：
              ${simpleReasons(b)}
            </p>

          </div>
        `;

      }).join("")}

      <div class="summary-box">

        <b>判断軸</b>

        <p>
          展示・ST・当地・全国・
          展開を重視。
        </p>

      </div>

    </div>
  `;
}
/* ===== v10 展開診断パネル：追加専用 ===== */

function chappyNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function chappyClamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function chappyBoat(boats, no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || {};
}

function chappyInTrustScore(data) {
  const boats = data?.boats || [];
  const b1 = chappyBoat(boats, 1);

  let score = 60;

  const avgST = chappyNum(b1.avgST, 0.18);
  const exST = chappyNum(b1.exhibitionST, 0.18);
  const local = chappyNum(b1.localWinRate, 0);
  const national = chappyNum(b1.nationalWinRate, 0);
  const motor = chappyNum(b1.motor2Rate, 0);

  if (avgST > 0 && avgST <= 0.14) score += 10;
  else if (avgST >= 0.20) score -= 12;

  if (exST > 0 && exST <= 0.12) score += 8;
  else if (exST >= 0.20) score -= 10;

  if (local >= 7) score += 10;
  else if (local > 0 && local < 5) score -= 8;

  if (national >= 7) score += 6;
  if (motor >= 40) score += 5;
  if (motor > 0 && motor < 25) score -= 5;

  return chappyClamp(score);
}

function chappyAttackBoat(data) {
  const boats = data?.boats || [];
  const candidates = boats.filter(b => Number(b.boat) >= 2);

  let best = null;
  let bestScore = -999;

  candidates.forEach(b => {
    let s = 50;

    const avgST = chappyNum(b.avgST, 0.18);
    const exST = chappyNum(b.exhibitionST, 0.18);
    const motor = chappyNum(b.motor2Rate, 0);
    const local = chappyNum(b.localWinRate, 0);
    const tilt = chappyNum(b.tilt, 0);

    if (avgST > 0 && avgST <= 0.14) s += 12;
    if (exST > 0 && exST <= 0.12) s += 12;
    if (motor >= 40) s += 8;
    if (local >= 7) s += 8;
    if (tilt >= 0.5) s += 5;

    if (Number(b.boat) === 3) s += 8;
    if (Number(b.boat) === 4) s += 6;

    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  });

  return {
    boat: best?.boat || "-",
    name: best?.name || "",
    score: chappyClamp(bestScore)
  };
}

function chappySashiBoat(data, attackBoat) {
  const boats = data?.boats || [];
  const atk = Number(attackBoat);

  let targetNo = "-";

  if (atk === 3) targetNo = 5;
  else if (atk === 4) targetNo = 5;
  else if (atk === 2) targetNo = 4;
  else targetNo = 5;

  const b = chappyBoat(boats, targetNo);

  let score = 55;
  const local = chappyNum(b.localWinRate, 0);
  const avgST = chappyNum(b.avgST, 0.18);
  const motor = chappyNum(b.motor2Rate, 0);

  if (local >= 7) score += 10;
  if (avgST > 0 && avgST <= 0.15) score += 8;
  if (motor >= 40) score += 6;
  if (atk === 3 || atk === 4) score += 10;

  return {
    boat: targetNo,
    name: b.name || "",
    score: chappyClamp(score)
  };
}

function chappyNokoshiBoat(data, attackBoat) {
  const boats = data?.boats || [];
  const atk = Number(attackBoat);
  const targetNo = atk === 3 ? 4 : 2;
  const b = chappyBoat(boats, targetNo);

  let score = 55;
  const avgST = chappyNum(b.avgST, 0.18);
  const local = chappyNum(b.localWinRate, 0);

  if (avgST > 0 && avgST <= 0.16) score += 8;
  if (local >= 7) score += 8;
  if (targetNo === 4) score += 8;

  return {
    boat: targetNo,
    name: b.name || "",
    score: chappyClamp(score)
  };
}

function chappyInTrustLabel(score) {
  if (score >= 90) return "🔵 鉄板級";
  if (score >= 80) return "🟢 強い";
  if (score >= 60) return "🟡 普通";
  if (score >= 40) return "🟠 怪しい";
  return "🔴 波乱";
}

function renderRaceShapePanelV10(data) {
  const inScore = chappyInTrustScore(data);
  const attack = chappyAttackBoat(data);
  const sashi = chappySashiBoat(data, attack.boat);
  const nokoshi = chappyNokoshiBoat(data, attack.boat);

  return `
    <div id="raceShapePanelV10" class="sheet">
      <h3>🚤 展開診断</h3>

      <div class="race-line">
        <b>イン信頼度：${inScore}点</b>
        <p>${chappyInTrustLabel(inScore)}</p>
      </div>

      <div class="race-line">
        <b>🔥 攻め艇：${attack.boat}号艇 ${attack.name}</b>
        <p>攻め期待：${attack.score}点</p>
      </div>

      <div class="race-line">
        <b>🌊 差し場：${sashi.boat}号艇 ${sashi.name}</b>
        <p>差し場期待：${sashi.score}点</p>
      </div>

      <div class="race-line">
        <b>🎯 残し：${nokoshi.boat}号艇 ${nokoshi.name}</b>
        <p>残し期待：${nokoshi.score}点</p>
      </div>

      <div class="summary-box">
        <b>考え方</b>
        <p>情報 → 展開 → 評価 → 舟券。外枠期待はイン逃げが怪しい時、または外に強い選手がいる時だけ上げる。</p>
      </div>
    </div>
  `;
}

function chappyInsertRaceShapePanelV10() {
  if (!latestRaceData || !document.querySelector("#mainSheetArea")) return;

  const main = document.querySelector("#mainSheetArea");
  const old = document.querySelector("#raceShapePanelV10");
  if (old) old.remove();

  main.insertAdjacentHTML("beforebegin", renderRaceShapePanelV10(latestRaceData));
}

const chappyOldRenderAllV10 = renderAll;

renderAll = function(data) {
  chappyOldRenderAllV10(data);
  setTimeout(chappyInsertRaceShapePanelV10, 50);
};
/* ===== v11 万舟シート完成版：最後に追加 ===== */

function manshuExpectScore(boatNo, boats = [], p = {}) {
  const b = boats.find(x => Number(x.boat) === Number(boatNo)) || {};
  const shape = p.raceShape || {};
  let score = 45;

  if (Number(boatNo) === 4) score += 10;
  if (Number(boatNo) === 5) score += 12;
  if (Number(boatNo) === 6) score += 4;

  if (Number(b.totalScore || 0) >= 70) score += 12;
  if (Number(b.localWinRate || 0) >= 7) score += 10;
  if (Number(b.exhibitionST || 0) > 0 && Number(b.exhibitionST) <= 0.12) score += 8;
  if (Number(b.avgST || 0) > 0 && Number(b.avgST) <= 0.15) score += 6;
  if (Number(b.motor2Rate || 0) >= 40) score += 5;

  if (shape.attackBoat) score += 8;
  if (Number(boatNo) === 5 && (Number(shape.attackBoat) === 3 || Number(shape.attackBoat) === 4)) score += 12;
  if (Number(boatNo) === 4 && Number(shape.attackBoat) === 3) score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function manshuExpectLabel(score) {
  if (score >= 85) return "★★★★★ 激アツ";
  if (score >= 75) return "★★★★☆ 有力";
  if (score >= 60) return "★★★☆☆ 展開次第";
  if (score >= 45) return "★★☆☆☆ 押さえ";
  return "★☆☆☆☆ 低め";
}

function manshuExpectReason(boatNo, boats = [], p = {}) {
  const b = boats.find(x => Number(x.boat) === Number(boatNo)) || {};
  const shape = p.raceShape || {};
  const reasons = [];

  if (Number(boatNo) === 4) reasons.push("4はカド残し・攻め残しの対象");
  if (Number(boatNo) === 5) reasons.push("5は攻め艇が動いた時の差し場候補");
  if (Number(boatNo) === 6) reasons.push("6は展開待ち。当地・地元・STが良い時だけ評価");

  if (shape.attackBoat) reasons.push(`${shape.attackBoat}号艇が攻め艇候補`);
  if (Number(b.localWinRate || 0) >= 7) reasons.push("当地成績が強い");
  if (Number(b.exhibitionST || 0) > 0 && Number(b.exhibitionST) <= 0.12) reasons.push("展示STが良い");
  if (Number(b.avgST || 0) > 0 && Number(b.avgST) <= 0.15) reasons.push("平均STが良い");

  return reasons.join(" / ") || "イン逃げが怪しい時、外の展開が必要";
}
/* ===== v11.1 万舟シート：展開ルート強化版 ===== */

function manshuRouteTextV111(boatNo, attackBoat) {
  const atk = Number(attackBoat);

  if (boatNo === 4) {
    return atk === 3
      ? "3が攻める → 4が残す・差す → 高配当"
      : "カドから攻める or 残す展開待ち";
  }

  if (boatNo === 5) {
    return atk === 3 || atk === 4
      ? `${atk}が攻める → 内が流れる → 5に差し場`
      : "内が競る → 5が差し場を拾う";
  }

  if (boatNo === 6) {
    return "外は展開待ち。地元・当地・STが良い時だけ評価";
  }

  return "展開待ち";
}

function manshuScoreV111(boatNo, boats = [], p = {}) {
  const b = boats.find(x => Number(x.boat) === boatNo) || {};
  const shape = p.raceShape || {};
  const atk = Number(shape.attackBoat);

  let score = 45;

  if (boatNo === 4) score += 8;
  if (boatNo === 5) score += 10;
  if (boatNo === 6) score += 3;

  if (boatNo === 4 && atk === 3) score += 12;
  if (boatNo === 5 && (atk === 3 || atk === 4)) score += 15;
  if (boatNo === 6 && (atk === 3 || atk === 4)) score += 6;

  if (Number(b.totalScore || 0) >= 70) score += 10;
  if (Number(b.localWinRate || 0) >= 7) score += 10;
  if (Number(b.avgST || 0) > 0 && Number(b.avgST) <= 0.15) score += 7;
  if (Number(b.exhibitionST || 0) > 0 && Number(b.exhibitionST) <= 0.12) score += 7;
  if (Number(b.motor2Rate || 0) >= 40) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function manshuRankLabelV111(score) {
  if (score >= 85) return "★★★★★ 激アツ";
  if (score >= 75) return "★★★★☆ 有力";
  if (score >= 60) return "★★★☆☆ 展開次第";
  if (score >= 45) return "★★☆☆☆ 押さえ";
  return "★☆☆☆☆ 低め";
}

function renderManshuSheet(boats = [], p = {}) {
  const shape = p.raceShape || {};
  const attackBoat = shape.attackBoat || "-";
  const forms = p.manshuFormation || p.holeFormation || [];

  const rows = [4, 5, 6].map(no => {
    const b = boats.find(x => Number(x.boat) === no) || {};
    const score = manshuScoreV111(no, boats, p);

    return `
      <div class="race-line">
        <b>🎯 ${no}号艇期待度：${score}点</b>
        <p>${manshuRankLabelV111(score)}</p>
        <p><b>展開ルート：</b>${manshuRouteTextV111(no, attackBoat)}</p>
        <p><b>選手材料：</b>${b.name || ""} / ST:${fmtST(b.avgST)} / 当地:${b.localWinRate || "-"} / 展示ST:${fmtST(b.exhibitionST)}</p>
      </div>
    `;
  }).join("");

  return `
    <div class="sheet manshu-sheet">

      <h4>💣 万舟軸</h4>
      <p><b>${p.manshuAxis || p.holeAxis || "展開待ち"}</b></p>

      <h4>💣 万舟理由</h4>
      <p>${p.manshuReason || "イン逃げが怪しい時、攻め艇が動いて外に差し場ができる展開を見る。"}</p>

      <h4>💥 万舟発生条件</h4>
      <p>
        イン信頼度が下がる<br>
        ↓<br>
        ${attackBoat !== "-" ? `${attackBoat}号艇が攻める` : "攻め艇が動く"}<br>
        ↓<br>
        4残し・5差し場・6展開待ちが発生
      </p>

      <h4>🚤 展開ルート別 4・5・6期待度</h4>
      ${rows}

      <h4>💣 万舟フォーメーション</h4>
      ${tickets(forms)}

    </div>
  `;
}
/* ===== v12 展開ルート診断パネル ===== */

function v12Num(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function v12Boat(boats, no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || {};
}

function v12ScoreLabel(score) {
  if (score >= 85) return "★★★★★ 激アツ";
  if (score >= 75) return "★★★★☆ 有力";
  if (score >= 60) return "★★★☆☆ 展開次第";
  if (score >= 45) return "★★☆☆☆ 押さえ";
  return "★☆☆☆☆ 低め";
}

function v12PickAttackBoat(data) {
  const boats = data?.boats || [];
  let best = null;
  let bestScore = -999;

  boats.filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5).forEach(b => {
    let s = 50;

    const no = Number(b.boat);
    const avgST = v12Num(b.avgST, 0.18);
    const exST = v12Num(b.exhibitionST, 0.18);
    const motor = v12Num(b.motor2Rate, 0);
    const local = v12Num(b.localWinRate, 0);
    const tilt = v12Num(b.tilt, 0);

    if (avgST > 0 && avgST <= 0.14) s += 12;
    if (exST > 0 && exST <= 0.12) s += 12;
    if (motor >= 40) s += 7;
    if (local >= 7) s += 8;
    if (tilt >= 0.5) s += 5;

    if (no === 3) s += 8;
    if (no === 4) s += 6;

    if (s > bestScore) {
      bestScore = s;
      best = b;
    }
  });

  return {
    boat: best?.boat || 3,
    name: best?.name || "",
    score: Math.round(Math.max(0, Math.min(100, bestScore)))
  };
}

function v12InTrust(data) {
  const b1 = v12Boat(data?.boats || [], 1);
  let s = 60;

  const avgST = v12Num(b1.avgST, 0.18);
  const exST = v12Num(b1.exhibitionST, 0.18);
  const local = v12Num(b1.localWinRate, 0);
  const national = v12Num(b1.nationalWinRate, 0);
  const motor = v12Num(b1.motor2Rate, 0);

  if (avgST > 0 && avgST <= 0.14) s += 10;
  if (avgST >= 0.20) s -= 12;

  if (exST > 0 && exST <= 0.12) s += 8;
  if (exST >= 0.20) s -= 10;

  if (local >= 7) s += 10;
  if (local > 0 && local < 5) s -= 8;

  if (national >= 7) s += 6;
  if (motor >= 40) s += 5;
  if (motor > 0 && motor < 25) s -= 5;

  return Math.round(Math.max(0, Math.min(100, s)));
}

function v12RouteTickets(attackBoat) {
  const atk = Number(attackBoat);

  if (atk === 3) {
    return {
      main: ["1-3-245", "1-2-345"],
      hole: ["4-1-235", "5-1-234"],
      manshu: ["5-14-2346", "4-15-2356"]
    };
  }

  if (atk === 4) {
    return {
      main: ["1-4-235", "1-2-345"],
      hole: ["4-1-235", "5-4-123"],
      manshu: ["4-56-12356", "5-14-2346"]
    };
  }

  if (atk === 2) {
    return {
      main: ["1-2-345", "2-1-345"],
      hole: ["3-12-1245", "4-12-235"],
      manshu: ["4-23-12356", "5-23-12346"]
    };
  }

  return {
    main: ["1-23-2345"],
    hole: ["4-15-12356"],
    manshu: ["5-14-12346"]
  };
}

function v12OuterExpect(no, data, attackBoat, inTrust) {
  const boats = data?.boats || [];
  const b = v12Boat(boats, no);
  const atk = Number(attackBoat);

  let s = 40;

  if (inTrust < 60) s += 12;
  if (inTrust < 45) s += 10;

  if (no === 4 && atk === 3) s += 18;
  if (no === 5 && (atk === 3 || atk === 4)) s += 22;
  if (no === 6 && (atk === 3 || atk === 4)) s += 8;

  if (v12Num(b.localWinRate, 0) >= 7) s += 10;
  if (v12Num(b.avgST, 0.18) > 0 && v12Num(b.avgST) <= 0.15) s += 8;
  if (v12Num(b.exhibitionST, 0.18) > 0 && v12Num(b.exhibitionST) <= 0.12) s += 8;
  if (v12Num(b.motor2Rate, 0) >= 40) s += 5;

  return Math.round(Math.max(0, Math.min(100, s)));
}

function renderRoutePanelV12(data) {
  const boats = data?.boats || [];
  const attack = v12PickAttackBoat(data);
  const inTrust = v12InTrust(data);
  const r = v12RouteTickets(attack.boat);

  const e4 = v12OuterExpect(4, data, attack.boat, inTrust);
  const e5 = v12OuterExpect(5, data, attack.boat, inTrust);
  const e6 = v12OuterExpect(6, data, attack.boat, inTrust);

  const b4 = v12Boat(boats, 4);
  const b5 = v12Boat(boats, 5);
  const b6 = v12Boat(boats, 6);

  return `
    <div id="routePanelV12" class="sheet">
      <h3>🚤 V12 展開ルート診断</h3>

      <div class="summary-box">
        <b>考え方</b>
        <p>情報 → 展開 → 評価 → 舟券。ここでは「誰が攻めるか」「誰が残るか」「どこに差し場ができるか」を先に見る。</p>
      </div>

      <div class="race-line">
        <b>① イン信頼度：${inTrust}点</b>
        <p>${inTrust >= 80 ? "イン強め。本線は内残り重視。" : inTrust >= 60 ? "普通。攻め艇次第で外も見る。" : "イン怪しい。外枠・差し場・万舟警戒。"}</p>
      </div>

      <div class="race-line">
        <b>② 攻め艇：${attack.boat}号艇 ${attack.name}</b>
        <p>攻め期待：${attack.score}点</p>
      </div>

      <div class="race-line">
        <b>③ 展開ルート① 本線</b>
        <p>${attack.boat}号艇が攻める → 1が残る → 2/3/4が残る</p>
        ${tickets(r.main)}
      </div>

      <div class="race-line">
        <b>④ 展開ルート② 穴</b>
        <p>${attack.boat}号艇が攻める → 4残し・5差し場</p>
        ${tickets(r.hole)}
      </div>

      <div class="race-line">
        <b>⑤ 展開ルート③ 万舟</b>
        <p>イン信頼度が下がる → 外に差し場 → 4/5/6絡み</p>
        ${tickets(r.manshu)}
      </div>

      <div class="race-line">
        <b>🎯 4号艇期待度：${e4}点</b>
        <p>${v12ScoreLabel(e4)}</p>
        <p>${b4.name || ""} / 3攻め時の残し・差し場候補</p>
      </div>

      <div class="race-line">
        <b>🎯 5号艇期待度：${e5}点</b>
        <p>${v12ScoreLabel(e5)}</p>
        <p>${b5.name || ""} / 攻め艇が動いた時の差し場候補</p>
      </div>

      <div class="race-line">
        <b>🎯 6号艇期待度：${e6}点</b>
        <p>${v12ScoreLabel(e6)}</p>
        <p>${b6.name || ""} / 展開待ち。当地・地元・STが良い時だけ評価</p>
      </div>
    </div>
  `;
}

function insertRoutePanelV12() {
  if (!latestRaceData) return;

  const old = document.querySelector("#routePanelV12");
  if (old) old.remove();

  const target =
    document.querySelector("#raceShapePanelV10") ||
    document.querySelector("#mainSheetArea");

  if (!target) return;

  target.insertAdjacentHTML("afterend", renderRoutePanelV12(latestRaceData));
}

const oldRenderAllV12 = renderAll;

renderAll = function(data) {
  oldRenderAllV12(data);
  setTimeout(insertRoutePanelV12, 80);
};
/* ===== v12 表示保険パッチ ===== */

setInterval(() => {
  if (!document.querySelector("#routePanelV12")) {
    insertRoutePanelV12();
  }
}, 1000);
/* ===== v13 重複表示整理パッチ ===== */

function chappyDedupeTextItems(parentSelector, itemSelector) {
  document.querySelectorAll(parentSelector).forEach(parent => {
    const seen = new Set();

    parent.querySelectorAll(itemSelector).forEach(el => {
      const key = el.textContent.replace(/\s+/g, " ").trim();

      if (!key) return;

      if (seen.has(key)) {
        el.remove();
      } else {
        seen.add(key);
      }
    });
  });
}

function chappyCleanDuplicateDisplaysV13() {
  // V10とV12で同じ意味の診断が重複するので、古いV10は非表示
  document.querySelectorAll("#raceShapePanelV10").forEach(el => el.remove());

  // V12パネルが複数出た時は1つだけ残す
  const routePanels = document.querySelectorAll("#routePanelV12");
  routePanels.forEach((el, i) => {
    if (i > 0) el.remove();
  });

  // 同じ買い目が重複したら消す
  chappyDedupeTextItems(".sheet", ".ticket-pill");
  chappyDedupeTextItems(".ticket-list", "div");

  // 万舟シート内の完全重複行だけ消す
  chappyDedupeTextItems(".manshu-sheet", ".race-line");

  // V12内の完全重複行だけ消す
  chappyDedupeTextItems("#routePanelV12", ".race-line");
}

setInterval(chappyCleanDuplicateDisplaysV13, 800);
/* ===== v13.1 重複削除・役割整理 ===== */

function chappyUniqueArrayV131(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function tickets(list) {
  const arr = chappyUniqueArrayV131(
    Array.isArray(list) ? list : []
  );

  if (!arr.length) {
    return `<div class="summary-box">候補なし</div>`;
  }

  return arr
    .slice(0, 12)
    .map(x => `<div class="ticket-pill">${x}</div>`)
    .join("");
}

function chappyCleanV131() {
  // V12は展開専門なので残す
  // 古い展開診断V10は消す
  document.querySelectorAll("#raceShapePanelV10").forEach(el => el.remove());

  // V12が複数あれば1つだけ残す
  document.querySelectorAll("#routePanelV12").forEach((el, i) => {
    if (i > 0) el.remove();
  });

  // 同じ買い目ボタンを削除
  document.querySelectorAll(".sheet").forEach(sheet => {
    const seen = new Set();

    sheet.querySelectorAll(".ticket-pill").forEach(el => {
      const key = el.textContent.trim();
      if (seen.has(key)) {
        el.remove();
      } else {
        seen.add(key);
      }
    });
  });
}

setInterval(chappyCleanV131, 800);