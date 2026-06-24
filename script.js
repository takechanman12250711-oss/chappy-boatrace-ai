// script.js v6.2
// index.html対応版：placeSelect / raceSelect / dateInput / fetchRaceBtn 対応
// JSON直表示をやめて、青シート・ピンクシートへ表示

const API_BASE = "/api/race";

const PLACE_CODES = {
  桐生: "01", 戸田: "02", 江戸川: "03", 平和島: "04",
  多摩川: "05", 浜名湖: "06", 蒲郡: "07", 常滑: "08",
  津: "09", 三国: "10", びわこ: "11", 住之江: "12",
  尼崎: "13", 鳴門: "14", 丸亀: "15", 児島: "16",
  宮島: "17", 徳山: "18", 下関: "19", 若松: "20",
  芦屋: "21", 福岡: "22", 唐津: "23", 大村: "24"
};

document.addEventListener("DOMContentLoaded", () => {
  const btn =
    document.querySelector("#fetchRaceBtn") ||
    document.querySelector("#predictBtn") ||
    document.querySelector("#runBtn") ||
    document.querySelector("button");

  if (btn) btn.addEventListener("click", runPrediction);
});

async function runPrediction() {
  const place = getValue(["#placeSelect", "#place", "#jcd"]);
  const rno = getValue(["#raceSelect", "#rno", "#raceNo", "#race"]);
  const dateInput = getValue(["#dateInput", "#date", "#raceDate"]);
  const date = dateInput ? dateInput.replaceAll("-", "") : todayYmd();

  const jcd = PLACE_CODES[place] || place;

  if (!jcd || !rno) {
    showError("場名とレース番号を入力してね。");
    return;
  }

  showLoading();
  setStatus("取得中…");

  try {
    const url = `${API_BASE}?jcd=${encodeURIComponent(jcd)}&rno=${encodeURIComponent(rno)}&date=${encodeURIComponent(date)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok) {
      showError(data.error || "API取得に失敗しました。");
      setStatus("取得失敗");
      return;
    }

    if (!Array.isArray(data.boats) || data.boats.length === 0) {
      showError("出走表データが取得できませんでした。場・R・日付を確認してね。");
      setStatus("取得失敗");
      return;
    }

    renderPrediction(data);
    setStatus("取得成功");
  } catch (err) {
    showError("通信エラー：" + err.message);
    setStatus("通信エラー");
  }
}

function renderPrediction(data) {
  const boats = data.boats || [];
  const prediction = data.prediction || data.theory || {};
  const venue = data.venue || {};
  const weather = data.weather || {};

  setHTML("#raceListArea", raceListHtml(boats));
  setHTML("#engineArea", engineHtml(boats, weather, venue));
  setHTML("#mainSheetArea", blueSheet(boats, prediction, weather, venue, data));
  setHTML("#formationArea", formationHtml(prediction));
  setHTML("#manshuSheetArea", pinkSheet(boats, prediction));
  setHTML("#alertArea", alerts(prediction));

  const result = document.querySelector("#result");
  if (result) result.innerHTML = "";
}

function raceListHtml(boats) {
  return `
    <div class="mini-table">
      ${boats.map(b => `
        <div class="mini-row">
          <b>${b.boat}号艇</b>
          <span>${b.name || "-"}</span>
          <span>${b.class || "-"}</span>
          <span>ST ${formatST(b.avgST)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function engineHtml(boats, weather, venue) {
  return `
    <div class="info-box">
      <p><b>場特性：</b>${venue.courseBias || "-"}</p>
      <p><b>推奨展開：</b>${venue.recommendedShape || "-"}</p>
      <p><b>水面：</b>${weather.weather || "-"} / 風 ${weather.windSpeed ?? "-"}m / 波 ${weather.waveHeight ?? "-"}cm</p>
    </div>
    <div class="mini-table">
      ${boats.map(b => `
        <div class="mini-row">
          <b>${b.boat}号艇</b>
          <span>モーター ${b.motor ?? "-"} / ${b.motor2Rate ?? "-"}%</span>
          <span>ボート ${b.boatNo ?? "-"} / ${b.boat2Rate ?? "-"}%</span>
          <span>展示 ${b.exhibitionTime ?? "-"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function blueSheet(boats, p, weather, venue, data) {
  const marks = p.marks || {};

  return `
    <div class="sheet blue-sheet">
      <h3>🎯 ${venue.name || data.jcd || ""} ${data.rno || ""}R 本命シート</h3>

      <div class="mark-grid">
        ${markCard("◎ 本命", marks.honmei)}
        ${markCard("○ 対抗", marks.taikou)}
        ${markCard("▲ 穴", marks.ana)}
        ${markCard("△ 押さえ", marks.osaE)}
      </div>

      <h4>🚤 各艇指数</h4>
      ${boats.map(boatCard).join("")}

      <h4>📝 展開コメント</h4>
      <p>${p.raceComment || p.raceShape?.memo || "-"}</p>
    </div>
  `;
}

function pinkSheet(boats, p) {
  const outer = boats.filter(b => Number(b.boat) >= 4);

  return `
    <div class="sheet pink-sheet">
      <h3>💣 万舟シート</h3>

      <h4>💣 穴フォーメーション</h4>
      ${formation(p.holeFormation)}

      <h4>🌪 外枠期待度</h4>
      ${outer.map(holeBoatCard).join("")}
    </div>
  `;
}

function formationHtml(p) {
  return `
    <div class="formation-box">
      <h4>🚤 本線フォーメーション</h4>
      ${formation(p.mainFormation)}

      <h4>🚤 穴フォーメーション</h4>
      ${formation(p.holeFormation)}
    </div>
  `;
}

function markCard(label, m) {
  if (!m) return `<div class="mark-card"><b>${label}</b><br>該当なし</div>`;

  return `
    <div class="mark-card">
      <div class="mark-title">${label}</div>
      <div class="mark-boat">${m.boat}号艇 ${m.name || ""}</div>
      <p>総合 ${m.totalScore ?? "-"} / チャッピー ${m.chappyScore ?? "-"} / 舟券太郎 ${m.funaTaroScore ?? "-"}</p>
    </div>
  `;
}

function boatCard(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h4>${b.boat}号艇 ${b.name || ""}</h4>
      <p><b>総合：</b>${b.totalScore ?? "-"}　<b>チャッピー：</b>${b.chappyScore ?? "-"}　<b>舟券太郎：</b>${b.funaTaroScore ?? "-"}</p>
      <p><b>展示：</b>${b.exhibitionTime ?? "-"}　<b>展示ST：</b>${formatST(b.exhibitionST)}　<b>チルト：</b>${b.tilt ?? "-"}</p>
      <p><b>モーター：</b>${b.motor ?? "-"}号機 / 2連率 ${b.motor2Rate ?? "-"}%</p>
      <p><b>ボート：</b>${b.boatNo ?? "-"} / 2連率 ${b.boat2Rate ?? "-"}%</p>
      <p>⬆️ ${joinText(b.buffs)}</p>
      <p>⬇️ ${joinText(b.debuffs)}</p>
      <p>${b.shortComment || "-"}</p>
    </div>
  `;
}

function holeBoatCard(b) {
  const score = Number(b.totalScore || 0);
  const stars = score >= 60 ? "★★★★★" : score >= 55 ? "★★★★" : score >= 50 ? "★★★" : "★★";

  return `
    <div class="boat-card hole-card boat-${b.boat}">
      <h4>${b.boat}号艇 ${b.name || ""}</h4>
      <p><b>万舟期待：</b>${stars}</p>
      <p><b>総合：</b>${b.totalScore ?? "-"} / <b>展示：</b>${b.exhibitionTime ?? "-"} / <b>展示ST：</b>${formatST(b.exhibitionST)}</p>
      <p>${b.shortComment || "展開待ち"}</p>
    </div>
  `;
}

function alerts(p) {
  const list = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!list.length) return `<p>大きなアラートなし</p>`;

  return `
    <div class="alert-list">
      ${list.map(a => `
        <div class="alert-card">
          <b>${a.boat}号艇</b> ${a.type || "アラート"}<br>
          ${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function formation(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return `<p>なし</p>`;
  }

  return `
    <div class="formation">
      ${list.map(x => `<span>${x}</span>`).join("")}
    </div>
  `;
}

function showLoading() {
  setHTML("#raceListArea", "読み込み中…🚤");
  setHTML("#mainSheetArea", "");
  setHTML("#formationArea", "");
  setHTML("#manshuSheetArea", "");
  setHTML("#alertArea", "");
}

function showError(msg) {
  const html = `<div class="error">⚠️ ${msg}</div>`;
  setHTML("#raceListArea", html);
  setHTML("#mainSheetArea", "");
  setHTML("#formationArea", "");
  setHTML("#manshuSheetArea", "");
  setHTML("#alertArea", "");
}

function setStatus(text) {
  const el = document.querySelector("#statusText");
  if (el) el.textContent = text;
}

function setHTML(selector, html) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = html;
}

function getValue(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.value !== undefined && String(el.value).trim() !== "") {
      return String(el.value).trim();
    }
  }
  return "";
}

function joinText(arr) {
  return Array.isArray(arr) && arr.length ? arr.join(" / ") : "なし";
}

function formatST(v) {
  if (v === null || v === undefined || v === "" || Number.isNaN(Number(v))) return "-";
  const n = Number(v);
  if (n < 0) return `F${Math.abs(n).toFixed(2).slice(1)}`;
  return n.toFixed(2);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
