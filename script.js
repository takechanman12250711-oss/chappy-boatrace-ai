// script.js v7
// 大きく見やすい表示版

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
  const rnoRaw = val("#raceSelect");
  const rno = String(rnoRaw).replace("R", "");
  const dateRaw = val("#dateInput");
  const date = dateRaw ? dateRaw.replaceAll("-", "").replaceAll("/", "") : todayYmd();
  const jcd = PLACE_CODES[place] || place;

  if (!jcd || !rno) {
    showError("場とレースを選んでね");
    return;
  }

  setStatus("取得中…");
  clearAreas();
  setHTML("#raceListArea", `<div class="loading">読み込み中…🚤</div>`);

  try {
    const url = `${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      showError(data.error || "API取得失敗");
      setStatus("取得失敗");
      return;
    }

    if (!Array.isArray(data.boats) || data.boats.length === 0) {
      showError(data.message || "出走表データがありません");
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

  setHTML("#raceListArea", renderEntryTable(boats));
  setHTML("#engineArea", renderCondition(data, venue, weather, boats));
  setHTML("#mainSheetArea", renderMainSheet(boats, p, venue));
  setHTML("#formationArea", renderFormations(p));
  setHTML("#manshuSheetArea", renderManshuSheet(boats, p));
  setHTML("#alertArea", renderAlerts(p));
  setHTML("#finalCommentArea", renderFinalComment(p, venue, weather));
}

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>平均ST</th><th>展示ST</th><th>展示</th><th>総合</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${fmtST(b.exhibitionST)}</td>
              <td>${b.exhibitionTime ?? "-"}</td>
              <td><b>${b.totalScore ?? "-"}</b></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCondition(data, venue, weather, boats) {
  return `
    <div class="comment-box">
      <p><b>場：</b>${venue.name || data.jcd}　<b>傾向：</b>${venue.courseBias || "-"}</p>
      <p><b>推奨展開：</b>${venue.recommendedShape || "-"}</p>
      <p><b>水面：</b>${weather.weather || "-"} / 風 ${weather.windSpeed ?? "-"}m / 波 ${weather.waveHeight ?? "-"}cm / 気温 ${weather.temperature ?? "-"}℃</p>
    </div>

    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>モーター</th><th>M2率</th><th>M3率</th><th>ボート</th><th>B2率</th><th>チルト</th>
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
              <td>${b.tilt ?? "-"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderMainSheet(boats, p, venue) {
  const m = p.marks || {};

  return `
    <div class="rank-card">${markLine("◎ 本命", m.honmei)}</div>
    <div class="rank-card">${markLine("○ 対抗", m.taikou)}</div>
    <div class="rank-card">${markLine("▲ 穴", m.ana)}</div>
    <div class="rank-card">${markLine("△ 押さえ", m.osaE)}</div>

    <details open>
      <summary>各艇の詳しい評価を見る</summary>
      ${boats.map(renderBoatDetail).join("")}
    </details>
  `;
}

function markLine(label, m) {
  if (!m) return `<b>${label}</b><br>該当なし`;

  return `
    <b>${label}</b><br>
    <span style="font-size:1.25rem;font-weight:800;">${m.boat}号艇 ${m.name || ""}</span><br>
    総合 ${m.totalScore ?? "-"} / チャッピー ${m.chappyScore ?? "-"} / 舟券太郎 ${m.funaTaroScore ?? "-"}
  `;
}

function renderBoatDetail(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h3>${b.boat}号艇 ${b.name || ""}</h3>
      <p><b>指数：</b>総合 ${b.totalScore ?? "-"} / チャッピー ${b.chappyScore ?? "-"} / 舟券太郎 ${b.funaTaroScore ?? "-"}</p>
      <p><b>選手：</b>${b.class || "-"} / ${b.branchHome || "-"} / ${b.ageWeight || "-"}</p>
      <p><b>勝率：</b>全国 ${b.nationalWinRate ?? "-"} / 当地 ${b.localWinRate ?? "-"}</p>
      <p><b>ST：</b>平均 ${fmtST(b.avgST)} / 展示 ${fmtST(b.exhibitionST)}</p>
      <p><b>展示：</b>${b.exhibitionTime ?? "-"} / チルト ${b.tilt ?? "-"}</p>
      <p><b>モーター：</b>${b.motor ?? "-"}号機 / 2率 ${b.motor2Rate ?? "-"}% / 3率 ${b.motor3Rate ?? "-"}%</p>
      <p><b>ボート：</b>${b.boatNo ?? "-"} / 2率 ${b.boat2Rate ?? "-"}% / 3率 ${b.boat3Rate ?? "-"}%</p>
      <p>⬆️ ${join(b.buffs)}</p>
      <p>⬇️ ${join(b.debuffs)}</p>
      <p><b>一言：</b>${b.shortComment || "-"}</p>
    </div>
  `;
}

function renderFormations(p) {
  return `
    <h3>🎯 本線</h3>
    ${tickets(p.mainFormation)}

    <h3>🛡 押さえ・流し</h3>
    ${tickets((p.mainFormation || []).filter(x => String(x).includes("流し")))}

    <h3>💣 穴</h3>
    ${tickets(p.holeFormation)}
  `;
}

function renderManshuSheet(boats, p) {
  const outer = boats.filter(b => Number(b.boat) >= 4);

  return `
    <div class="comment-box">
      <b>万舟の見方：</b>外枠だけでなく、2差し・3攻めからの内側残りも見る。
    </div>
    ${outer.map(b => `
      <div class="boat-card boat-${b.boat}">
        <h3>${b.boat}号艇 ${b.name || ""}</h3>
        <p><b>万舟期待度：</b>${stars(b.totalScore)}</p>
        <p>総合 ${b.totalScore ?? "-"} / 展示 ${b.exhibitionTime ?? "-"} / 展示ST ${fmtST(b.exhibitionST)}</p>
        <p>${b.shortComment || "展開待ち"}</p>
      </div>
    `).join("")}
  `;
}

function renderAlerts(p) {
  const list = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!list.length) return `<div class="comment-box">大きなアラートなし</div>`;

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
      <p>${p.raceComment || "-"}</p>
      <p><b>展開：</b>${p.raceShape?.shape || "-"}</p>
      <p><b>場特性：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

function tickets(list) {
  if (!Array.isArray(list) || list.length === 0) return `<p>なし</p>`;
  return list.map(x => `<span class="ticket">${x}</span>`).join("");
}

function stars(score) {
  const s = Number(score || 0);
  if (s >= 70) return "★★★★★";
  if (s >= 60) return "★★★★";
  if (s >= 50) return "★★★";
  return "★★";
}

function clearAreas() {
  ["#raceListArea","#engineArea","#mainSheetArea","#formationArea","#manshuSheetArea","#alertArea","#finalCommentArea"]
    .forEach(id => setHTML(id, ""));
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

function join(v) {
  return Array.isArray(v) && v.length ? v.join(" / ") : "なし";
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
