// js/render.js
// チャッピーボートレースAI 表示処理

function renderEntryTable(raceData) {
  const el = document.getElementById("entryTable");
  if (!el) return;

  const entries = raceData.entries || [];

  if (!entries.length) {
    el.innerHTML = `<div class="empty-box">出走表データなし</div>`;
    return;
  }

  el.innerHTML = `
    <div class="section-title">🚤 出走表</div>
    <div class="entry-grid">
      ${entries.map(renderEntryCard).join("")}
    </div>
  `;
}

function renderEntryCard(e) {
  const c = e.color || ChappyAPI.getBoatColor(e.boatNo);

  return `
    <div class="entry-card">
      <div class="boat-badge" style="background:${c.bg};color:${c.text};">
        ${e.boatNo}号艇
      </div>

      <div class="racer-name">${escapeHtml(e.racerName)}</div>
      <div class="racer-sub">
        ${escapeHtml(e.className)} / ${escapeHtml(e.branch)} / ${escapeHtml(e.age)}歳
      </div>

      <div class="data-row">
        <span>平均ST</span><b>${value(e.avgST)}</b>
      </div>
      <div class="data-row">
        <span>全国</span><b>${value(e.nationalWinRate)}</b>
      </div>
      <div class="data-row">
        <span>当地</span><b>${value(e.localWinRate)}</b>
      </div>
      <div class="data-row">
        <span>モーター</span><b>${value(e.motorNo)} / ${value(e.motor2Rate)}%</b>
      </div>
      <div class="data-row">
        <span>ボート</span><b>${value(e.boatNumber)} / ${value(e.boat2Rate)}%</b>
      </div>
    </div>
  `;
}

function renderMaterialPanel(raceData) {
  const el = document.getElementById("materialPanel");
  if (!el) return;

  const before = raceData.beforeInfo || [];
  const start = raceData.startExhibition || [];
  const weather = raceData.weather || {};

  el.innerHTML = `
    <div class="section-title">📊 直前情報・展示・気象</div>

    <div class="material-box">
      <h3>展示情報</h3>
      <div class="simple-table">
        <div class="table-head">
          <span>艇</span><span>展示</span><span>チルト</span><span>体重</span>
        </div>
        ${before.map(b => `
          <div class="table-row">
            <span>${b.boatNo}</span>
            <span>${value(b.exhibitionTime)}</span>
            <span>${value(b.tilt)}</span>
            <span>${value(b.weight)}</span>
          </div>
        `).join("") || `<div class="empty-box">展示情報なし</div>`}
      </div>
    </div>

    <div class="material-box">
      <h3>スタート展示</h3>
      <div class="simple-table">
        <div class="table-head">
          <span>艇</span><span>進入</span><span>展示ST</span>
        </div>
        ${start.map(s => `
          <div class="table-row">
            <span>${s.boatNo}</span>
            <span>${value(s.course)}</span>
            <span>${value(s.st)}</span>
          </div>
        `).join("") || `<div class="empty-box">スタート展示なし</div>`}
      </div>
    </div>

    <div class="material-box">
      <h3>気象・水面</h3>
      <div class="weather-grid">
        <div>気温 <b>${value(weather.temperature)}</b></div>
        <div>風速 <b>${value(weather.windSpeed)}</b></div>
        <div>風向 <b>${value(weather.windDirection)}</b></div>
        <div>水温 <b>${value(weather.waterTemperature)}</b></div>
        <div>波高 <b>${value(weather.waveHeight)}</b></div>
      </div>
    </div>
  `;
}

function renderRaceFlow(raceData) {
  const el = document.getElementById("raceFlow");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">🌊 AI展開読み</div>
    <div class="flow-box">
      <div class="flow-step">① 誰が攻める</div>
      <div class="flow-arrow">↓</div>
      <div class="flow-step">② 誰が飛ぶ</div>
      <div class="flow-arrow">↓</div>
      <div class="flow-step">③ 誰が拾う</div>
    </div>
    <div class="mini-note">
      実データ接続済み。次の工程で攻め指数・展開指数・道中指数・当地指数をここに反映。
    </div>
  `;
}

function renderMainSheet(raceData) {
  const el = document.getElementById("mainSheet");
  if (!el) return;

  const entries = raceData.entries || [];

  el.innerHTML = `
    <div class="section-title">🎯 青シート 本命評価</div>
    <div class="score-grid">
      ${entries.map(e => renderScoreCard(e)).join("")}
    </div>
  `;
}

function renderScoreCard(e) {
  const c = e.color || ChappyAPI.getBoatColor(e.boatNo);
  const score = calcSimpleScore(e);

  return `
    <div class="score-card">
      <div class="boat-badge" style="background:${c.bg};color:${c.text};">
        ${e.boatNo}号艇
      </div>
      <div class="racer-name">${escapeHtml(e.racerName)}</div>
      <div class="score-number">${score}</div>
      <div class="buff-line">⬆️ 当地・ST・級別を加点</div>
      <div class="debuff-line">⬇️ 展示と今節成績は次工程で精密化</div>
      <div class="short-comment">
        ${e.boatNo}号艇の基本力を仮スコア化。次にAI指数へ接続。
      </div>
    </div>
  `;
}

function renderOdds() {
  const el = document.getElementById("oddsPanel");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">💰 オッズ</div>
    <div class="empty-box">次工程で odds.js と接続</div>
  `;
}

function renderMissing() {
  const el = document.getElementById("missingPanel");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">💣 ピンクシート 万舟候補</div>
    <div class="empty-box">次工程で missing.js と接続</div>
  `;
}

function renderStats() {
  const el = document.getElementById("statsPanel");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">📈 統計・出目</div>
    <div class="empty-box">次工程で出目ランキングを接続</div>
  `;
}

function renderTheory(raceData) {
  const el = document.getElementById("theoryPanel");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">🧠 舟券太郎理論</div>
    <div class="theory-grid">
      <div class="theory-card">🔥 スリットアラート<br><b>次工程で算出</b></div>
      <div class="theory-card">⏱ ダブルタイム<br><b>次工程で算出</b></div>
      <div class="theory-card">🌊 新サム理論<br><b>次工程で算出</b></div>
    </div>
  `;
}

function renderAI(raceData) {
  const el = document.getElementById("aiPanel");
  if (!el) return;

  el.innerHTML = `
    <div class="section-title">🤖 チャッピーAI指数</div>
    <div class="ai-grid">
      <div>🔥 攻め指数</div>
      <div>🌊 展開指数</div>
      <div>⚡ 道中指数</div>
      <div>🏠 当地指数</div>
    </div>
  `;
}

function calcSimpleScore(e) {
  let score = 50;

  const cls = String(e.className || "");
  if (cls.includes("A1")) score += 15;
  if (cls.includes("A2")) score += 8;
  if (Number(e.localWinRate) >= 6) score += 8;
  if (Number(e.nationalWinRate) >= 6) score += 6;
  if (Number(e.motor2Rate) >= 40) score += 5;
  if (Number(e.avgST) > 0 && Number(e.avgST) <= 0.15) score += 5;

  return Math.min(99, Math.max(1, Math.round(score)));
}

function value(v) {
  return v === undefined || v === null || v === "" ? "-" : escapeHtml(v);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}