/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 Part 1/6
========================================================= */

(function () {
  "use strict";

  const VERSION = "render-v2.0.0";

  const BOAT_COLORS = {
    1: { name: "白", className: "boat-1" },
    2: { name: "黒", className: "boat-2" },
    3: { name: "赤", className: "boat-3" },
    4: { name: "青", className: "boat-4" },
    5: { name: "黄", className: "boat-5" },
    6: { name: "緑", className: "boat-6" }
  };

  const SECTION_TITLES = {
    raceInfo: "🚤 レース情報",
    entry: "👥 出走表",
    ai: "📊 AI分析",
    main: "🔵 本命予想シート",
    manshu: "🌸 万舟予想シート",
    formation: "🎯 フォーメーション",
    flow: "🌊 展開予想",
    final: "🤖 AI総合コメント"
  };

  function getRoot() {
    return document.getElementById("resultArea")
      || document.getElementById("predictionArea")
      || document.getElementById("output")
      || document.querySelector("main")
      || document.body;
  }

  function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function valueOrDash(value) {
    if (value === null || value === undefined || value === "") return "-";
    return escapeHtml(value);
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function boatClass(boatNo) {
    const no = Number(boatNo);
    return BOAT_COLORS[no] ? BOAT_COLORS[no].className : "";
  }

  function boatBadge(boatNo) {
    const no = Number(boatNo);
    const color = BOAT_COLORS[no];

    if (!color) {
      return `<span class="boat-badge unknown">${valueOrDash(boatNo)}</span>`;
    }

    return `<span class="boat-badge ${color.className}">${no}</span>`;
  }

  function scoreText(score) {
    if (score === null || score === undefined || score === "") return "-";
    return `<span class="score-text">${escapeHtml(score)}</span>`;
  }

  function tagList(items, type = "normal") {
    const list = asArray(items);
    if (!list.length) return `<span class="empty-text">-</span>`;

    return `
      <div class="tag-list ${escapeHtml(type)}">
        ${list.map(item => `<span class="mini-tag">${escapeHtml(item)}</span>`).join("")}
      </div>
    `;
  }

  function textList(items) {
    const list = asArray(items);
    if (!list.length) return `<p class="empty-text">-</p>`;

    return `
      <ul class="text-list">
        ${list.map(item => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    `;
  }

  function createSection(id, title) {
    return `
      <section class="chappy-section" id="${escapeHtml(id)}">
        <div class="section-header">
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="section-body" data-section-body="${escapeHtml(id)}"></div>
      </section>
    `;
  }

  function getSectionBody(id) {
    return document.querySelector(`[data-section-body="${id}"]`);
  }

  function safeRender(sectionName, renderFn) {
    try {
      renderFn();
    } catch (error) {
      console.error(`[render.js] ${sectionName} render error:`, error);
      const body = getSectionBody(sectionName);
      if (body) {
        body.innerHTML = `
          <div class="notice-card error">
            <strong>表示エラー</strong>
            <p>${escapeHtml(sectionName)} の描画中に問題が発生しました。</p>
          </div>
        `;
      }
    }
  }

  function buildBaseLayout(root) {
    root.innerHTML = `
      <div class="chappy-render" data-render-version="${escapeHtml(VERSION)}">
        ${createSection("raceInfo", SECTION_TITLES.raceInfo)}
        ${createSection("entry", SECTION_TITLES.entry)}
        ${createSection("ai", SECTION_TITLES.ai)}
        ${createSection("main", SECTION_TITLES.main)}
        ${createSection("manshu", SECTION_TITLES.manshu)}
        ${createSection("formation", SECTION_TITLES.formation)}
        ${createSection("flow", SECTION_TITLES.flow)}
        ${createSection("final", SECTION_TITLES.final)}
      </div>
    `;
  }

  function renderAll(prediction) {
    const root = getRoot();

    if (!prediction || typeof prediction !== "object") {
      root.innerHTML = `
        <div class="notice-card error">
          <strong>予想データがありません</strong>
          <p>prediction.js から有効な prediction オブジェクトが渡されていません。</p>
        </div>
      `;
      return;
    }

    buildBaseLayout(root);

    safeRender("raceInfo", () => renderRaceInfo(prediction));
    safeRender("entry", () => renderEntryTable(prediction));
    safeRender("ai", () => renderAiAnalysis(prediction));
    safeRender("main", () => renderMainSheet(prediction));
    safeRender("manshu", () => renderManshuSheet(prediction));
    safeRender("formation", () => renderFormation(prediction));
    safeRender("flow", () => renderRaceFlow(prediction));
    safeRender("final", () => renderFinalComment(prediction));
  }
    function renderRaceInfo(prediction) {
    const body = getSectionBody("raceInfo");
    if (!body) return;

    const race = prediction.race || {};
    const venue = prediction.venue || {};
    const weather = prediction.weather || {};
    const newEngine = prediction.newEngine || {};

    body.innerHTML = `
      <div class="info-grid">
        <div class="info-card">
          <div class="info-label">場</div>
          <div class="info-value">${valueOrDash(venue.name || race.venueName)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">レース</div>
          <div class="info-value">${valueOrDash(race.raceNo)}R</div>
        </div>
        <div class="info-card">
          <div class="info-label">締切</div>
          <div class="info-value">${valueOrDash(race.deadline || race.closeTime)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">距離</div>
          <div class="info-value">${valueOrDash(race.distance || "1800m")}</div>
        </div>
        <div class="info-card">
          <div class="info-label">天候</div>
          <div class="info-value">${valueOrDash(weather.weather)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">風</div>
          <div class="info-value">${valueOrDash(weather.wind)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">波</div>
          <div class="info-value">${valueOrDash(weather.wave)}</div>
        </div>
        <div class="info-card">
          <div class="info-label">新エンジン</div>
          <div class="info-value">${valueOrDash(newEngine.comment || newEngine.status)}</div>
        </div>
      </div>
    `;
  }

    function renderEntryTable(prediction) {
    const body = getSectionBody("entry");
    if (!body) return;

    const entries = asArray(prediction.race && prediction.race.entries);

    if (!entries.length) {
      body.innerHTML = `
        <div class="notice-card">
          <p>出走表データがありません。</p>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="table-scroll">
        <table class="entry-table">
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>級</th>
              <th>支部</th>
              <th>ST</th>
              <th>全国</th>
              <th>当地</th>
              <th>モーター</th>
              <th>展示</th>
            </tr>
          </thead>
          <tbody>
            ${entries.map(entry => {
              const boatNo = entry.boatNo || entry.course || entry.waku;
              const motorText = formatMotor(entry);
              const nationalText = formatRate(entry.national, entry.nationalRate || entry.winRate);
              const localText = formatRate(entry.local, entry.localRate || entry.venueRate);

              return `
                <tr>
                  <td>${boatBadge(boatNo)}</td>
                  <td class="name-cell">
                    <span class="boat-name ${boatClass(boatNo)}">
                      ${valueOrDash(entry.name || entry.racerName || entry.playerName)}
                    </span>
                  </td>
                  <td>${valueOrDash(entry.className || entry.class || entry.grade)}</td>
                  <td>${valueOrDash(entry.branch || entry.area)}</td>
                  <td>${valueOrDash(entry.avgST || entry.st || entry.avgSt)}</td>
                  <td>${nationalText}</td>
                  <td>${localText}</td>
                  <td>${motorText}</td>
                  <td>${valueOrDash(entry.exhibitionTime || entry.exTime)}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function formatRate(rateObj, fallback) {
    if (rateObj && typeof rateObj === "object") {
      const win = rateObj.winRate ?? "-";
      const second = rateObj.secondRate ?? "-";
      return `${valueOrDash(win)} / 2連${valueOrDash(second)}%`;
    }

    return valueOrDash(fallback);
  }

  function formatMotor(entry) {
    if (!entry) return "-";

    if (entry.motor && typeof entry.motor === "object") {
      const no = entry.motor.no ?? entry.motor.motorNo ?? "-";
      const second = entry.motor.secondRate ?? entry.motor.motor2Rate ?? "-";
      return `${valueOrDash(no)}号機 / 2連${valueOrDash(second)}%`;
    }

    if (entry.motorNo) {
      return `${valueOrDash(entry.motorNo)}号機`;
    }

    return valueOrDash(entry.motor);
  }
    function renderAiAnalysis(prediction) {
    const body = getSectionBody("ai");
    if (!body) return;

    const scores = asArray(prediction.indexes && prediction.indexes.scores);

    if (!scores.length) {
      body.innerHTML = `
        <div class="notice-card">
          <p>AI分析データがありません。</p>
        </div>
      `;
      return;
    }

    body.innerHTML = `
      <div class="analysis-legend">
        <span>🔥 攻め指数</span>
        <span>🌊 展開指数</span>
        <span>⚡ 道中指数</span>
        <span>🏠 当地指数</span>
      </div>

      <div class="analysis-list">
        ${scores.map(item => {
          const boatNo = item.boatNo || item.boat || item.waku;
          return `
            <div class="analysis-card">
              <div class="analysis-head">
                ${boatBadge(boatNo)}
                <strong class="boat-name ${boatClass(boatNo)}">
                  ${valueOrDash(item.name || item.playerName)}
                </strong>
                <span class="total-score">${scoreText(item.total || item.score)}</span>
              </div>

              <div class="index-grid">
                <div><span>🔥 攻め</span><b>${valueOrDash(item.attack)}</b></div>
                <div><span>🌊 展開</span><b>${valueOrDash(item.flow)}</b></div>
                <div><span>⚡ 道中</span><b>${valueOrDash(item.middle)}</b></div>
                <div><span>🏠 当地</span><b>${valueOrDash(item.local)}</b></div>
              </div>

              <div class="analysis-comment">
                ${valueOrDash(item.comment)}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderSheetRows(rows) {
    const list = asArray(rows);

    if (!list.length) {
      return `
        <div class="notice-card">
          <p>シートデータがありません。</p>
        </div>
      `;
    }

    return `
      <div class="sheet-list">
        ${list.map(row => {
          const boatNo = row.boatNo || row.boat || row.waku;
          return `
            <div class="sheet-card">
              <div class="sheet-head">
                <div class="sheet-left">
                  ${boatBadge(boatNo)}
                  <strong class="boat-name ${boatClass(boatNo)}">
                    ${valueOrDash(row.name || row.playerName)}
                  </strong>
                </div>
                <div class="sheet-score">
                  ${scoreText(row.score || row.index)}
                </div>
              </div>

              <div class="buff-area">
                <div class="buff-row">
                  <span class="buff-label up">⬆️ バフ</span>
                  ${tagList(row.buffs || row.plus || row.good, "buff")}
                </div>
                <div class="buff-row">
                  <span class="buff-label down">⬇️ デバフ</span>
                  ${tagList(row.debuffs || row.minus || row.bad, "debuff")}
                </div>
              </div>

              <p class="sheet-comment">
                ${valueOrDash(row.comment || row.summary)}
              </p>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMainSheet(prediction) {
    const body = getSectionBody("main");
    if (!body) return;

    const sheet = prediction.mainSheet || {};
    const rows = sheet.rows || sheet.items || sheet.list;

    body.innerHTML = `
      <div class="sheet-summary blue-sheet">
        <div class="sheet-title">${valueOrDash(sheet.title || "本命予想")}</div>
        <p>${valueOrDash(sheet.comment || sheet.summary)}</p>
      </div>
      ${renderSheetRows(rows)}
    `;
  }
    function renderManshuSheet(prediction) {
    const body = getSectionBody("manshu");
    if (!body) return;

    const sheet = prediction.manshuSheet || {};
    const rows = sheet.rows || sheet.items || sheet.list;
    const missing = asArray(sheet.missingTop30 || sheet.missing || sheet.top30);

    body.innerHTML = `
      <div class="sheet-summary pink-sheet">
        <div class="sheet-title">${valueOrDash(sheet.title || "万舟予想")}</div>
        <p>${valueOrDash(sheet.comment || sheet.summary)}</p>
      </div>

      ${renderSheetRows(rows)}

      <div class="sub-block">
        <h3>💣 出てない目 TOP30</h3>
        ${renderMissingTickets(missing)}
      </div>
    `;
  }

  function renderMissingTickets(list) {
    const items = asArray(list);

    if (!items.length) {
      return `
        <div class="notice-card">
          <p>出てない目データがありません。</p>
        </div>
      `;
    }

    return `
      <div class="table-scroll">
        <table class="ticket-table">
          <thead>
            <tr>
              <th>順位</th>
              <th>買い目</th>
              <th>現位オッズ</th>
              <th>評価</th>
            </tr>
          </thead>
          <tbody>
            ${items.slice(0, 30).map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td class="ticket-text">${valueOrDash(item.ticket || item.buy || item.mark)}</td>
                <td>${valueOrDash(item.odds || item.currentOdds)}</td>
                <td>${valueOrDash(item.rank || item.comment || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFormation(prediction) {
    const body = getSectionBody("formation");
    if (!body) return;

    const formation = prediction.formation || {};

    const main = asArray(formation.main || formation.honsen);
    const cover = asArray(formation.cover || formation.osaae);
    const nagashi = asArray(formation.nagashi || formation.flow);
    const hole = asArray(formation.hole || formation.manshu);

    body.innerHTML = `
      <div class="formation-grid">
        ${renderTicketBlock("本線", main)}
        ${renderTicketBlock("安全押さえ", cover)}
        ${renderTicketBlock("流し", nagashi)}
        ${renderTicketBlock("万舟", hole)}
      </div>
    `;
  }

  function renderTicketBlock(title, tickets) {
    const list = asArray(tickets);

    return `
      <div class="ticket-block">
        <h3>${escapeHtml(title)}</h3>
        ${
          list.length
            ? `
              <div class="ticket-list">
                ${list.map(ticket => `
                  <div class="ticket-item">
                    <span class="ticket-mark">
                      ${valueOrDash(ticket.ticket || ticket.buy || ticket)}
                    </span>
                    <span class="ticket-note">
                      ${valueOrDash(ticket.comment || ticket.rank || "")}
                    </span>
                  </div>
                `).join("")}
              </div>
            `
            : `<p class="empty-text">-</p>`
        }
      </div>
    `;
  }
    function renderRaceFlow(prediction) {
    const body = getSectionBody("flow");
    if (!body) return;

    const flow = prediction.raceFlow || {};
    const points = asArray(flow.points || flow.steps || flow.list);
    const keyBoats = asArray(flow.keyBoats || flow.focusBoats);

    body.innerHTML = `
      <div class="flow-summary">
        <div class="flow-title">
          ${valueOrDash(flow.title || "展開予想")}
        </div>
        <p>${valueOrDash(flow.comment || flow.summary)}</p>
      </div>

      <div class="sub-block">
        <h3>展開ポイント</h3>
        ${textList(points)}
      </div>

      <div class="sub-block">
        <h3>注目艇</h3>
        ${renderKeyBoats(keyBoats)}
      </div>
    `;
  }

  function renderKeyBoats(items) {
    const list = asArray(items);

    if (!list.length) {
      return `<p class="empty-text">-</p>`;
    }

    return `
      <div class="key-boat-list">
        ${list.map(item => {
          const boatNo = item.boatNo || item.boat || item.waku;
          return `
            <div class="key-boat-card">
              <div class="key-boat-head">
                ${boatBadge(boatNo)}
                <strong class="boat-name ${boatClass(boatNo)}">
                  ${valueOrDash(item.name || item.playerName)}
                </strong>
                <span>${valueOrDash(item.role || item.type)}</span>
              </div>
              <p>${valueOrDash(item.comment)}</p>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderFinalComment(prediction) {
    const body = getSectionBody("final");
    if (!body) return;

    const finalAi = prediction.finalAi || {};
    const finalComment = prediction.finalComment || "";

    body.innerHTML = `
      <div class="final-card">
        <div class="final-main">
          ${valueOrDash(finalComment || finalAi.comment || finalAi.summary)}
        </div>

        <div class="final-grid">
          <div>
            <span>信頼度</span>
            <b>${valueOrDash(prediction.confidence || finalAi.confidence)}</b>
          </div>
          <div>
            <span>万舟力</span>
            <b>${valueOrDash(prediction.manshuPower || finalAi.manshuPower)}</b>
          </div>
          <div>
            <span>最終評価</span>
            <b>${valueOrDash(finalAi.rank || finalAi.grade || "-")}</b>
          </div>
        </div>
      </div>
    `;
  }
    window.renderAll = renderAll;

  window.ChappyRender = {
    version: VERSION,
    renderAll
  };

})();