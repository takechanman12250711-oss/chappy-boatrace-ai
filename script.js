// script.js v8.4
// 見やすさ改善＋回収率欄付き

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生:"01", 戸田:"02", 江戸川:"03", 平和島:"04",
  多摩川:"05", 浜名湖:"06", 蒲郡:"07", 常滑:"08",
  津:"09", 三国:"10", びわこ:"11", 住之江:"12",
  尼崎:"13", 鳴門:"14", 丸亀:"15", 児島:"16",
  宮島:"17", 徳山:"18", 下関:"19", 若松:"20",
  芦屋:"21", 福岡:"22", 唐津:"23", 大村:"24"
};

let currentResultStatus = "";
let latestRaceData = null;
let latestOddsList = [];

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#fetchRaceBtn")?.addEventListener("click", runPrediction);
  document.querySelector("#resultTypeSelect")?.addEventListener("change", autoFillOdds);
document.querySelector("#oddsInput")?.addEventListener("input", updateAutoPayout);
document.querySelector("#betAmountInput")?.addEventListener("input", updateAutoPayout);

  document.querySelector("#hitBtn")?.addEventListener("click", () => {
    currentResultStatus = "アタリ";
    setStatus("⭕ アタリ選択中");
  });

  document.querySelector("#missBtn")?.addEventListener("click", () => {
    currentResultStatus = "ハズレ";
    setStatus("❌ ハズレ選択中");
  });

  document.querySelector("#saveResultBtn")?.addEventListener("click", saveSimpleResult);
});

async function runPrediction() {
  const place = val("#placeSelect");
  const rno = String(val("#raceSelect")).replace("R", "");
  const dateRaw = val("#dateInput");
  const date = dateRaw ? dateRaw.replaceAll("-", "").replaceAll("/", "") : todayYmd();
  const jcd = PLACE_CODES[place] || place;

  setStatus("取得中…");
  clearAreas();
  setHTML("#raceListArea", `<div class="loading">読み込み中…🚤</div>`);

  try {
    const safeDate = date || todayYmd();

    const res = await fetch(`${API_BASE}?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const data = await res.json();

    const oddsRes = await fetch(`/api/odds?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const oddsData = await oddsRes.json();
    data.odds = oddsData.ok ? oddsData.odds : [];

    const missRes = await fetch(`/api/missing?jcd=${jcd}&rno=${rno}&date=${safeDate}`);
    const missData = await missRes.json();
    data.missing = missData.ok ? missData.missing : [];
    const statsRes = await fetch("/api/stats");
    const statsData = await statsRes.json();
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
  setTimeout(autoFillOdds, 300);
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p) + renderManshuOdds(odds) + renderMissingTop30(missing));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));
  setHTML(
  "#statsArea",
  renderPerformanceBox(data.stats)
);
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
      <summary>モーター・展示詳細</summary>
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
    ["△", "押さえ", marks.osaE || marks.osae]
  ];

  return `
    <div class="sheet compact-sheet">
      <h3>🎯 本命シート</h3>

      ${picks.map(([mark, label, m]) => {
        if (!m) return "";
        const b = boats.find(x => Number(x.boat) === Number(m.boat)) || m;
        return `
          <div class="race-line">
            <b>${mark} ${b.boat}号艇 ${b.name || ""}</b>
            <span>評価 ${b.totalScore ?? m.totalScore ?? "-"}</span>
            <p>${label}：${roleComment(b)}</p>
            <p>理由：${simpleReasons(b)}</p>
          </div>
        `;
      }).join("")}

      <div class="summary-box">
        <b>判断軸</b>
        <p>展示・ST・場傾向・当地成績・展開を合わせて評価。モーター数字だけでは決めない。</p>
      </div>

      ${renderPerformanceBox()}
    </div>
  `;
}

function renderFormations(p) {
  return `
    <div class="sheet">
      <h3>🎫 買い目</h3>

      <h4>本線</h4>
      ${tickets(p.mainFormation)}

      <h4>押さえ</h4>
      ${tickets((p.holeFormation || []).slice(0, 3))}

      <h4>穴・流し候補</h4>
      ${tickets(p.holeFormation)}
    </div>
  `;
}

function renderOdds(odds) {
  latestOddsList = Array.isArray(odds) ? odds : [];
  setTimeout(autoFillOdds, 100);

  if (!Array.isArray(odds) || odds.length === 0) {
    return `<div class="summary-box">オッズ未取得</div>`;
  }

  return `
    <div class="sheet odds-card">
      <h3>💰 3連単オッズ TOP12</h3>
      <div class="odds-grid">
        ${odds.slice(0, 12).map((o, i) => `
          <div class="odds-pill">
            <b>${i + 1}. ${o.key}</b>
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
    .sort((a,b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0, 4);

  return `
    <div class="sheet manshu-sheet">
      <h3>💣 万舟シート</h3>
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
      `).join("")}
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
        ${list.slice(0, 30).map(x => `
          <div class="odds-pill">
            <b>${x.rank}. ${x.key}</b>
            <span>${x.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function getManshuOdds(odds) {
  if (!Array.isArray(odds)) return [];
  return odds.filter(o => Number(o.odds) >= 100).slice(0, 10);
}

function renderManshuOdds(odds) {
  const list = getManshuOdds(odds);

  if (!list.length) {
    return `<div class="summary-box">💣 万舟候補なし</div>`;
  }

  return `
    <div class="sheet manshu-odds-card">
      <h3>💣 万舟候補TOP10</h3>
      <div class="odds-grid">
        ${list.map((o, i) => `
          <div class="odds-pill manshu-pill">
            <b>${i + 1}. ${o.key}</b>
            <span>${o.odds}倍</span>
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

function renderPerformanceBox(stats) {

  if (!stats || !stats.total) {
    return `
      <div class="card">
        <h3>📈 的中率・回収率</h3>
        <p>まだデータなし</p>
      </div>
    `;
  }

  const t = stats.total;

  return `
    <div class="card">

      <h3>📈 的中率・回収率</h3>

      <table style="width:100%">
        <tr>
          <td>予想数</td>
          <td><b>${t.predictions}</b></td>
        </tr>

        <tr>
          <td>的中率</td>
          <td><b>${t.hitRate}%</b></td>
        </tr>

        <tr>
          <td>回収率</td>
          <td><b>${t.recoveryRate}%</b></td>
        </tr>

        <tr>
          <td>本命的中率</td>
          <td><b>${t.honmeiHitRate}%</b></td>
        </tr>

        <tr>
          <td>万舟的中率</td>
          <td><b>${t.manshuHitRate}%</b></td>
        </tr>

      </table>

    </div>
  `;
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

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;
  return `<div class="ticket-list">${list.map(x => `<span class="ticket">${x}</span>`).join("")}</div>`;
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
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}
function saveSimpleResult() {
  const bet = Number(document.querySelector("#betAmountInput")?.value || 0);
  const odds = Number(document.querySelector("#oddsInput")?.value || 0);
  const payout = currentResultStatus === "アタリ" ? Math.floor(bet * odds) : 0;
  const result =
  document.querySelector("#raceResultInput")?.value
    ?.trim();

  if (!result) {
  alert("レース結果を入力してね");
  return;
}

autoJudgeResult();

if (!currentResultStatus) {
  currentResultStatus = "ハズレ";
}

const fixedResult = result.replaceAll("-", "");

  const history = JSON.parse(
    localStorage.getItem("chappyResultHistory") || "[]"
  );

  history.push({
  place: val("#placeSelect"),
  result: fixedResult,
  status: currentResultStatus,
  bet,
  odds,
  payout,
  savedAt: Date.now()
});

  localStorage.setItem(
    "chappyResultHistory",
    JSON.stringify(history)
  );

  renderStatsArea();

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

  localStorage.setItem(
    "chappyResultHistory",
    JSON.stringify(history)
  );

  renderStatsArea();

  alert("直前の成績を取り消しました");
}

function renderStatsArea() {
  const history = JSON.parse(
    localStorage.getItem("chappyResultHistory") || "[]"
  );

  const predictions = history.length;

  const hits = history.filter(
    r => r.status === "アタリ"
  ).length;

  const bet = history.reduce(
    (sum, r) => sum + Number(r.bet || 0),
    0
  );

  const payout = history.reduce(
    (sum, r) => sum + Number(r.payout || 0),
    0
  );

  const hitRate =
    predictions > 0
      ? ((hits / predictions) * 100).toFixed(1)
      : "0";

  const recoveryRate =
    bet > 0
      ? ((payout / bet) * 100).toFixed(1)
      : "0";
  const venueStats = {};
  const typeStats = {
  本命: { predictions: 0, hits: 0 },
  万舟: { predictions: 0, hits: 0 },
  展開: { predictions: 0, hits: 0 }
};

history.forEach(r => {
  if (!r.type) return;

  typeStats[r.type].predictions++;

  if (r.status === "アタリ") {
    typeStats[r.type].hits++;
  }
});

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

  if (r.status === "アタリ") {
    venueStats[r.place].hits++;
  }

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
    <h3>🎯 予想別成績</h3>

<table class="table">
<tr>
<th>種類</th>
<th>予想</th>
<th>的中率</th>
</tr>

${Object.entries(typeStats).map(([type, s]) => {

const rate =
s.predictions > 0
? ((s.hits / s.predictions) * 100).toFixed(1)
: "0";

return `
<tr>
<td>${type}</td>
<td>${s.predictions}</td>
<td>${rate}%</td>
</tr>
`;

}).join("")}

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

document
  .querySelector("#undoResultBtn")
  ?.addEventListener("click", undoLastResult);

renderStatsArea();
function autoFillOdds() {
  const oddsInput = document.querySelector("#oddsInput");
  if (!oddsInput || !Array.isArray(latestOddsList) || latestOddsList.length === 0) return;
const oddsList = latestOddsList;

  const type = val("#resultTypeSelect");

  let target = null;

  if (type === "万舟") {
    target = oddsList.find(o => Number(o.odds) >= 100);
  } else {
    target = oddsList[0];
  }

  if (target && target.odds) {
    oddsInput.value = target.odds;
  }

  updateAutoPayout();
}

function updateAutoPayout() {
  const bet = Number(document.querySelector("#betAmountInput")?.value || 0);
  const odds = Number(document.querySelector("#oddsInput")?.value || 0);
  const text = document.querySelector("#autoPayoutText");

  const payout =
    currentResultStatus === "アタリ"
      ? Math.floor(bet * odds)
      : 0;

  if (text) {
    text.textContent = `払戻金：${payout.toLocaleString()}円`;
  }
}