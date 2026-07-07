// js/render.js
// index.html表示エリア完全対応版

function renderEntryTable(raceData) {
  const el = document.getElementById("raceListArea");
  if (!el) return;

  el.innerHTML = `
    <div class="panel">
      <h2>🚤 出走表</h2>
      ${raceData.entries.map(e => `
        <div class="entry-card">
          <h3>${e.boatNo}号艇　${e.racerName}</h3>
          <p>${e.className} / ${e.branch} / ${e.age}歳 / ${e.weight}kg</p>
          <p>平均ST：${v(e.avgST)}　F/L：${v(e.fl)}</p>
          <p>全国：${v(e.nationalWinRate)} / 当地：${v(e.localWinRate)}</p>
          <p>モーター：${v(e.motorNo)} / 2連率 ${v(e.motor2Rate)}%</p>
          <p>ボート：${v(e.boatNumber)} / 2連率 ${v(e.boat2Rate)}%</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMaterialPanel(raceData) {
  const el = document.getElementById("engineArea");
  if (!el) return;

  el.innerHTML = `
    <div class="panel">
      <h2>📊 展示・モーター情報</h2>
      ${raceData.entries.map(e => `
        <div class="mini-card">
          ${e.boatNo}号艇 ${e.racerName}
          <br>展示：${v(e.exhibitionTime)} / チルト：${v(e.tilt)}
          <br>モーター2連率：${v(e.motor2Rate)}%
        </div>
      `).join("")}
    </div>
  `;

  const weather = document.getElementById("weatherArea");
  if (weather) {
    weather.innerHTML = `
      <p>気温：${v(raceData.weather.temperature)}</p>
      <p>風速：${v(raceData.weather.windSpeed)}</p>
      <p>水温：${v(raceData.weather.waterTemperature)}</p>
      <p>波高：${v(raceData.weather.waveHeight)}</p>
    `;
  }
}

function renderRaceFlow() {
  const el = document.getElementById("raceFlowArea");
  if (!el) return;

  el.innerHTML = `
    <div class="panel">
      <h2>🌊 展開</h2>
      <p>誰が攻める → 誰が飛ぶ → 誰が拾う</p>
    </div>
  `;
}

function renderMainSheet(raceData) {
  const el = document.getElementById("mainSheetArea");
  if (!el) return;

  el.innerHTML = `
    <div class="panel blue-sheet">
      <h2>🎯 青シート</h2>
      ${raceData.entries.map(e => `
        <div class="score-card">
          <b>${e.boatNo}号艇 ${e.racerName}</b>
          <br>スコア：${calcScore(e)}
          <br>⬆️ ST・当地・モーター加点
          <br>⬇️ 展示未取得は減点保留
        </div>
      `).join("")}
    </div>
  `;
}

function renderOdds() {
  const el = document.getElementById("oddsArea");
  if (!el) return;
  el.innerHTML = `<div class="panel"><h2>💰 オッズ</h2><p>次工程で接続</p></div>`;
}

function renderMissing() {
  const el = document.getElementById("manshuSheetArea");
  if (!el) return;
  el.innerHTML = `<div class="panel pink-sheet"><h2>💣 万舟シート</h2><p>次工程で接続</p></div>`;
}

function renderStats() {}

function renderTheory() {
  const el = document.getElementById("theorySummaryArea");
  if (!el) return;
  el.innerHTML = `
    <p>🔥 スリットアラート：次工程</p>
    <p>⏱ ダブルタイム：次工程</p>
    <p>🌊 新サム理論：次工程</p>
  `;
}

function renderAI() {
  const el = document.getElementById("aiIndexArea");
  if (!el) return;
  el.innerHTML = `
    <p>🔥 攻め指数</p>
    <p>🌊 展開指数</p>
    <p>⚡ 道中指数</p>
    <p>🏠 当地指数</p>
  `;
}

function calcScore(e) {
  let s = 50;
  if (e.className === "A1") s += 15;
  if (e.className === "A2") s += 8;
  if (Number(e.avgST) <= 0.15) s += 5;
  if (Number(e.localWinRate) >= 5) s += 6;
  if (Number(e.motor2Rate) >= 40) s += 6;
  return s;
}

function v(x) {
  return x === null || x === undefined || x === "" ? "-" : x;
}