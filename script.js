// script.js v8.3
// 表示整理版：プラス/マイナス廃止・カード減量・情報量維持

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生:"01", 戸田:"02", 江戸川:"03", 平和島:"04",
  多摩川:"05", 浜名湖:"06", 蒲郡:"07", 常滑:"08",
  津:"09", 三国:"10", びわこ:"11", 住之江:"12",
  尼崎:"13", 鳴門:"14", 丸亀:"15", 児島:"16",
  宮島:"17", 徳山:"18", 下関:"19", 若松:"20",
  芦屋:"21", 福岡:"22", 唐津:"23", 大村:"24"
};

document.addEventListener("DOMContentLoaded", () => {
  document.querySelector("#fetchRaceBtn")?.addEventListener("click", runPrediction);
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
  setHTML(
    "#manshuSheetArea",
    renderManshuSheet(boats, p)
    + renderManshuOdds(odds)
    + renderMissingTop30(missing)
  );
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));
  setHTML("#oddsArea", renderOdds(odds));
}

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>ST</th><th>展示</th><th>特徴</th>
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
              <td>${shortSkill(b)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCondition(venue, weather, boats) {
  return `
    <div class="comment-box">
      <p><b>🌊 場の見方</b></p>
      <p>${venue.name || "-"}は <b>${venue.courseBias || "場傾向不明"}</b></p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候 ${weather.weather || "-"} / 風 ${weather.windSpeed ?? "-"}m / 波 ${weather.waveHeight ?? "-"}cm / 気温 ${weather.temperature ?? "-"}℃</p>
    </div>

    <details>
      <summary>モーター・展示の詳細を見る</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>M</th><th>M2</th><th>M3</th><th>B</th><th>B2</th><th>展示ST</th><th>チルト</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td><b>${b.boat}</b></td>
                <td>${b.motor ?? "-"}</td>
                <td>${b.motor2Rate ?? "-"}%</td>
                <td>${b.motor3Rate ?? "-"}%</td>
                <td>${b.boatNo ?? "-"}</td>
                <td>${b.boat2Rate ?? "-"}%</td>
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
    ["◎ 本命", marks.honmei, "軸候補"],
    ["○ 対抗", marks.taikou, "相手筆頭"],
    ["▲ 穴", marks.ana, "展開向けば配当上昇"],
    ["△ 押さえ", marks.osaE || marks.osae, "安全カバー"]
  ];

  return `
    <div class="sheet compact-sheet">
      <h3>🎯 本命シート</h3>
      ${picks.map(([label, m, role]) => {
        if (!m) return `<div class="line-block"><b>${label}</b>：該当なし</div>`;
        const b = boats.find(x => Number(x.boat) === Number(m.boat)) || m;
        return `
          <div class="line-block">
            <b>${label} ${b.boat}号艇 ${b.name || ""}　評価${b.totalScore ?? m.totalScore ?? "-"}</b>
            <p>役割：${role}</p>
            <p>理由：${simpleReasons(b)}</p>
            <p>特徴：${buyReason(b)}</p>
          </div>
        `;
      }).join("")}
      <div class="mini-note">
        指数だけでなく、コース・ST・展示・場特性・当地成績を合わせて判断。
      </div>
    </div>

    <details>
      <summary>全艇の詳細を見る</summary>
      ${boats.map(boatDetail).join("")}
    </details>

    ${renderPerformanceBox()}
  `;
}

function boatDetail(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h3>${b.boat}号艇 ${b.name || ""}</h3>
      <p><b>今回の役割：</b>${positionReason(b)}</p>
      <p><b>評価理由：</b>${simpleReasons(b)}</p>
      <details>
        <summary>数字の詳細</summary>
        <p>総合 ${b.totalScore ?? "-"} / チャッピー ${b.chappyScore ?? "-"} / 舟券太郎 ${b.funaTaroScore ?? "-"}</p>
        <p>級別 ${b.class || "-"} / 支部 ${b.branchHome || "-"} / ${b.ageWeight || "-"}</p>
        <p>全国勝率 ${b.nationalWinRate ?? "-"} / 当地勝率 ${b.localWinRate ?? "-"}</p>
        <p>平均ST ${fmtST(b.avgST)} / 展示ST ${fmtST(b.exhibitionST)}</p>
        <p>展示 ${b.exhibitionTime ?? "-"} / チルト ${b.tilt ?? "-"}</p>
        <p>モーター ${b.motor ?? "-"} / 2率 ${b.motor2Rate ?? "-"}% / 3率 ${b.motor3Rate ?? "-"}%</p>
      </details>
    </div>
  `;
}

function renderFormations(p) {
  return `
    <h3>🎫 本線</h3>
    <p>一番素直な展開。まずここを中心。</p>
    ${tickets(p.mainFormation)}

    <h3>🛟 押さえ</h3>
    <p>展開が少しズレた時の安全カバー。</p>
    ${tickets((p.holeFormation || []).slice(0, 3))}

    <h3>💣 穴・万舟</h3>
    <p>攻め艇が動いた時、内が残った時の高配当候補。</p>
    ${tickets(p.holeFormation)}
  `;
}

function renderManshuSheet(boats, p) {
  const shape = p.raceShape || {};
  const targets = boats
    .filter(b => Number(b.boat) >= 3)
    .sort((a,b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0,4);

  return `
    <div class="sheet manshu-sheet">
      <h3>💣 万舟シート</h3>
      <p><b>狙い筋：</b>${shape.shape || "3攻め・4残し・5差し場・6展開待ち"}</p>
      <p><b>攻め艇：</b>${shape.attackBoat ? shape.attackBoat + "号艇" : "未判定"}</p>
      <p>外枠一撃だけでなく、内側絡みの高配当も見る。</p>

      ${targets.map(b => `
        <div class="line-block">
          <b>${b.boat}号艇 ${b.name || ""}　万舟期待 ${stars(b.totalScore)}</b>
          <p>${manshuReason(b)}</p>
          <p>理由：${simpleReasons(b)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderOdds(odds) {
  if (!Array.isArray(odds) || odds.length === 0) {
    return `<div class="card">オッズ未取得</div>`;
  }

  const top = odds.slice(0, 12);

  return `
    <div class="sheet odds-card">
      <h3>💰 3連単オッズ TOP12</h3>
      <div class="odds-grid">
        ${top.map((o, i) => `
          <div class="odds-pill">
            <b>${i + 1}. ${o.key}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMissingTop30(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return `<div class="card">出てない目TOP30取得中...</div>`;
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
    return `<div class="card">💣 万舟候補なし</div>`;
  }

  return `
    <div class="sheet manshu-odds-card">
      <h3>💣 万舟候補TOP10</h3>
      ${list.map((o, i) => `
        <div class="odds-pill manshu-pill">
          <b>${i + 1}. ${o.key}</b>
          <span>${o.odds}倍</span>
        </div>
      `).join("")}
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
    return `<div class="comment-box">大きな理論アラートなし。基本展開を重視。</div>`;
  }

  return list.map(a => `
    <div class="alert-card">
      <b>${a.boat}号艇 ${a.type || "アラート"}</b><br>
      ${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}
    </div>
  `).join("");
}

function renderFinalComment(p, venue, weather) {
  return `
    <div class="comment-box">
      <p><b>最終判断</b></p>
      <p>${p.raceComment || "展開とSTを見て本線・押さえ・穴を分ける。"}</p>
      <p><b>展開：</b>${p.raceShape?.shape || "-"}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

function renderPerformanceBox() {
  return `
    <div class="sheet performance-sheet">
      <h3>📈 成績集計</h3>
      <p>的中率：未集計</p>
      <p>回収率：未集計</p>
      <p class="mini-note">次の工程で結果APIと連携して自動集計する。</p>
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
  if (Number(b.motor2Rate) > 0) r.push(`モーター2連率${b.motor2Rate}%`);

  if (Number(b.boat) === 1) r.push("イン戦");
  if (Number(b.boat) >= 4) r.push("展開待ち");

  return r.slice(0, 6).join(" / ") || "平均的な評価";
}

function shortSkill(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "逃げ軸";
  if (boat === 2) return "差し候補";
  if (boat === 3) return "攻め候補";
  if (boat === 4) return "カド攻め";
  if (boat === 5) return "差し場待ち";
  if (boat === 6) return "展開待ち";
  return "評価中";
}

function buyReason(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "インから先マイできれば軸。ST遅れは注意。";
  if (boat === 2) return "2コース差し候補。頭より2着残りも見る。";
  if (boat === 3) return "3コース攻め候補。まくり・まくり差しの起点。";
  if (boat === 4) return "カドから攻め残し、または3攻めに乗る形。";
  if (boat === 5) return "内が競った時の差し場。2・3着で配当を上げる。";
  if (boat === 6) return "大外で展開待ち。当地やSTが良ければ切りすぎ注意。";
  return "展開次第の押さえ候補。";
}

function positionReason(b) {
  const boat = Number(b.boat);
  if (boat === 1) return "1マーク先取りが条件。";
  if (boat === 2) return "1を見て差す形。";
  if (boat === 3) return "センター攻めの起点。";
  if (boat === 4) return "カド攻め、または展開乗り。";
  if (boat === 5) return "差し場待ち。";
  if (boat === 6) return "最内差し・展開待ち。";
  return "-";
}

function manshuReason(b) {
  const boat = Number(b.boat);
  if (boat === 3) return "3が攻めると人気筋が崩れて配当が上がる。";
  if (boat === 4) return "カドから残ると本命筋とズレて高配当になりやすい。";
  if (boat === 5) return "内が競った時の差し場。2・3着絡みで万舟候補。";
  if (boat === 6) return "大外で人気が落ちる分、展開がハマれば跳ねる。";
  return "展開がズレた時の高配当候補。";
}

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;
  return list.map(x => `<span class="ticket">${x}</span>`).join("");
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
