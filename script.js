// script.js v6
// 青シート＋ピンクシート自動生成版

const API_BASE = "https://chappy-boatrace-ai.vercel.app/api/race";

const PLACE_CODES = {
  "桐生": "01", "戸田": "02", "江戸川": "03", "平和島": "04",
  "多摩川": "05", "浜名湖": "06", "蒲郡": "07", "常滑": "08",
  "津": "09", "三国": "10", "びわこ": "11", "住之江": "12",
  "尼崎": "13", "鳴門": "14", "丸亀": "15", "児島": "16",
  "宮島": "17", "徳山": "18", "下関": "19", "若松": "20",
  "芦屋": "21", "福岡": "22", "唐津": "23", "大村": "24"
};

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.querySelector("#predictBtn");
  if (btn) btn.addEventListener("click", runPrediction);
});

async function runPrediction() {
  const place = getValue(["#place", "#placeSelect", "#jcd"]);
  const rno = getValue(["#rno", "#raceNo", "#race"]);
  const date = getValue(["#date", "#raceDate"]) || todayYmd();

  const jcd = PLACE_CODES[place] || place;

  if (!jcd || !rno) {
    renderError("場名とレース番号を入力してね。");
    return;
  }

  renderLoading();

  try {
    const url = `${API_BASE}?jcd=${jcd}&rno=${rno}&date=${date}`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.boats || data.boats.length === 0) {
      renderError("出走表データが取得できませんでした。開催日・場・Rを確認してね。");
      return;
    }

    renderSheets(data);
  } catch (e) {
    renderError("通信エラー：" + e.message);
  }
}

function renderSheets(data) {
  const root = getResultRoot();
  const p = data.prediction || {};
  const boats = data.boats || [];

  root.innerHTML = `
    ${renderRaceHeader(data)}
    ${renderBlueSheet(data, boats, p)}
    ${renderPinkSheet(data, boats, p)}
  `;
}

function renderRaceHeader(data) {
  const w = data.weather || {};
  const venue = data.venue || {};

  return `
    <section class="race-head">
      <h2>🚤 ${venue.name || data.jcd} ${data.rno}R 予想</h2>
      <p>
        水面：${w.weather ?? "-"} / 風 ${w.windSpeed ?? "-"}m /
        波 ${w.waveHeight ?? "-"}cm / 気温 ${w.temperature ?? "-"}℃
      </p>
      <p>場特性：${venue.courseBias || "-"} / 推奨展開：${venue.recommendedShape || "-"}</p>
    </section>
  `;
}

function renderBlueSheet(data, boats, p) {
  const marks = p.marks || {};

  return `
    <section class="sheet blue-sheet">
      <h2>🎯 本命シート</h2>

      <div class="mark-grid">
        ${renderMark("◎ 本命", marks.honmei)}
        ${renderMark("○ 対抗", marks.taikou)}
        ${renderMark("▲ 穴", marks.ana)}
        ${renderMark("△ 押さえ", marks.osaE)}
      </div>

      <h3>🚤 各艇評価</h3>
      <div class="boat-list">
        ${boats.map(renderBoatCard).join("")}
      </div>

      <h3>📌 本線フォーメーション</h3>
      ${renderFormation(p.mainFormation, "main")}

      <h3>展開コメント</h3>
      <p class="comment">${p.raceComment || "-"}</p>
    </section>
  `;
}

function renderPinkSheet(data, boats, p) {
  return `
    <section class="sheet pink-sheet">
      <h2>💣 万舟シート</h2>

      <h3>🚨 アラート</h3>
      ${renderAlerts(p)}

      <h3>💣 穴フォーメーション</h3>
      ${renderFormation(p.holeFormation, "hole")}

      <h3>外枠期待度</h3>
      <div class="boat-list">
        ${boats.filter(b => b.boat >= 4).map(renderHoleBoatCard).join("")}
      </div>
    </section>
  `;
}

function renderMark(label, m) {
  if (!m) return "";

  return `
    <div class="mark-card">
      <div class="mark-title">${label}</div>
      <div class="mark-boat">${m.boat}号艇 ${m.name || ""}</div>
      <div>総合 ${m.totalScore} / チャッピー ${m.chappyScore} / 舟券太郎 ${m.funaTaroScore}</div>
    </div>
  `;
}

function renderBoatCard(b) {
  return `
    <div class="boat-card boat-${b.boat}">
      <h4>${b.boat}号艇 ${b.name || ""}</h4>
      <p>総合指数：<b>${b.totalScore ?? "-"}</b> / チャッピー：${b.chappyScore ?? "-"} / 舟券太郎：${b.funaTaroScore ?? "-"}</p>
      <p>展示：${b.exhibitionTime ?? "-"} / 展示ST：${formatST(b.exhibitionST)} / チルト：${b.tilt ?? "-"}</p>
      <p>モーター：${b.motor ?? "-"}号機 ${b.motor2Rate ?? "-"}% / ボート：${b.boatNo ?? "-"} ${b.boat2Rate ?? "-"}%</p>
      <p>⬆️ ${arr(b.buffs)}</p>
      <p>⬇️ ${arr(b.debuffs)}</p>
      <p class="comment">${b.shortComment || "-"}</p>
    </div>
  `;
}

function renderHoleBoatCard(b) {
  return `
    <div class="boat-card hole-card boat-${b.boat}">
      <h4>${b.boat}号艇 ${b.name || ""}</h4>
      <p>万舟期待：${b.totalScore ?? "-"}点</p>
      <p>展示 ${b.exhibitionTime ?? "-"} / ST ${formatST(b.exhibitionST)} / チルト ${b.tilt ?? "-"}</p>
      <p>${b.shortComment || "展開待ち"}</p>
    </div>
  `;
}

function renderAlerts(p) {
  const alerts = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!alerts.length) return `<p>大きなアラートなし</p>`;

  return `
    <div class="alert-list">
      ${alerts.map(a => `
        <div class="alert-card">
          <b>${a.boat}号艇</b> ${a.type}<br>
          ${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderFormation(list, type) {
  if (!list || !list.length) return `<p>なし</p>`;

  return `
    <div class="formation ${type}">
      ${list.map(x => `<span>${x}</span>`).join("")}
    </div>
  `;
}

function renderLoading() {
  getResultRoot().innerHTML = `<div class="loading">読み込み中…🚤</div>`;
}

function renderError(msg) {
  getResultRoot().innerHTML = `<div class="error">${msg}</div>`;
}

function getResultRoot() {
  return document.querySelector("#result")
    || document.querySelector("#prediction")
    || document.querySelector("main")
    || document.body;
}

function getValue(selectors) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el && el.value !== undefined && el.value !== "") return el.value.trim();
  }
  return "";
}

function arr(v) {
  return Array.isArray(v) && v.length ? v.join(" / ") : "なし";
}

function formatST(v) {
  if (v === null || v === undefined) return "-";
  if (v < 0) return "F" + Math.abs(v).toFixed(2).slice(1);
  return v.toFixed(2);
}

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
