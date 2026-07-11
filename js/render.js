/* =========================================================
  チャッピーボートレースAI
  render.js 完成版UI v3 Part 1 / 8

  役割：
  - prediction.js の返却データを表示する描画専用ファイル
  - AI計算・予想ロジックは書かない
  - 「ボートレース新聞をスマホで読む感覚」を作る

  公開関数：
  - window.renderAll(prediction)
  - window.renderPrediction(prediction)
========================================================= */

(function () {
  "use strict";

  const RENDER_VERSION = "render-ui-v3.0.0";

  const BOAT_COLORS = {
    1: { name: "白", bg: "#ffffff", text: "#111111", border: "#c9c9c9" },
    2: { name: "黒", bg: "#111111", text: "#ffffff", border: "#111111" },
    3: { name: "赤", bg: "#e53935", text: "#ffffff", border: "#e53935" },
    4: { name: "青", bg: "#1e88e5", text: "#ffffff", border: "#1e88e5" },
    5: { name: "黄", bg: "#fdd835", text: "#111111", border: "#fbc02d" },
    6: { name: "緑", bg: "#43a047", text: "#ffffff", border: "#43a047" }
  };

  const ROLE_LABELS = {
    honmei: "◎ 本命",
    main: "◎ 本命",
    taikou: "○ 対抗",
    rival: "○ 対抗",
    ana: "▲ 穴",
    hole: "▲ 穴",
    osa: "△ 押さえ",
    osae: "△ 押さえ",
    safety: "△ 押さえ",
    manshu: "💣 万舟",
    longshot: "💣 万舟",
    nokoshi: "👀 残し",
    hiroi: "🎯 拾い"
  };

  const THEORY_LABELS = {
    attack: "🔥 攻め艇",
    flow: "🌊 展開艇",
    road: "⚡ 道中艇",
    michu: "⚡ 道中艇",
    local: "🏠 当地巧者",
    slit: "⏱ スリット",
    doubleTime: "🏁 ダブルタイム",
    shinsam: "📈 新サム",
    odds: "💹 合成オッズ"
  };

  /* ===============================
    DOM
  =============================== */

  function $(id) {
    return document.getElementById(id);
  }

  function getRoot() {
  const root = document.getElementById("resultArea");

  if (!root) {
    console.error("resultArea が見つかりません。index.html を確認してください。");
    return document.body;
  }

  return root;
}

  /* ===============================
    安全処理
  =============================== */

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "object") {
      if (value.name !== undefined) return String(value.name);
      if (value.label !== undefined) return String(value.label);
      if (value.text !== undefined) return String(value.text);
      if (value.comment !== undefined) return String(value.comment);
      if (value.summary !== undefined) return String(value.summary);
      if (value.score !== undefined) return String(value.score);
      if (value.value !== undefined) return String(value.value);
      if (value.number !== undefined) return String(value.number);
      if (value.no !== undefined) return String(value.no);
      return fallback;
    }

    return String(value);
  }

  function safeNum(value, fallback = 0) {
    if (value === null || value === undefined || value === "") return fallback;

    if (typeof value === "object") {
      if (value.score !== undefined) value = value.score;
      else if (value.value !== undefined) value = value.value;
      else if (value.percent !== undefined) value = value.percent;
    }

    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHtml(value) {
    return safeText(value, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function arrayify(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  function percent(value) {
    const n = safeNum(value, null);
    if (n === null) return "-";
    return `${Math.round(n)}%`;
  }

  function signed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return safeText(value);
    return n > 0 ? `+${n}` : String(n);
  }

  function limitText(value, max = 70) {
    const text = safeText(value, "");
    if (!text) return "";
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /* ===============================
    艇番
  =============================== */

  function boatColor(no) {
    return BOAT_COLORS[Number(no)] || BOAT_COLORS[1];
  }

  function boatBadge(no, size = "") {
    const n = safeText(no);
    const c = boatColor(n);

    return `
      <span class="v3-boat-badge ${size ? `v3-boat-${escapeHtml(size)}` : ""}"
        style="background:${c.bg};color:${c.text};border-color:${c.border};">
        ${escapeHtml(n)}
      </span>
    `;
  }

  function boatTitle(no, name) {
    const c = boatColor(no);

    return `
      <span class="v3-boat-title" style="color:${c.border};">
        ${boatBadge(no)}
        <strong>${escapeHtml(name || `${safeText(no)}号艇`)}</strong>
      </span>
    `;
  }

  function ticketArrow(ticket) {
    const text = safeText(ticket);
    const html = text
      .replace(/-/g, " → ")
      .replace(/[1-6]/g, (n) => boatBadge(n, "mini"));

    return `<span class="v3-ticket-arrow">${html}</span>`;
  }

  /* ===============================
    共通UI
  =============================== */

  function section(title, body, icon = "", className = "") {
    return `
      <section class="v3-section ${className}">
        <div class="v3-section-head">
          <h2>${icon ? `${icon} ` : ""}${escapeHtml(title)}</h2>
        </div>
        <div class="v3-section-body">
          ${body || emptyBox("表示データがありません")}
        </div>
      </section>
    `;
  }

  function divider() {
    return `<div class="v3-divider"></div>`;
  }

  function emptyBox(text) {
    return `<div class="v3-empty">${escapeHtml(text || "データがありません")}</div>`;
  }

  function tag(text, type = "normal") {
    if (!text) return "";
    return `<span class="v3-tag v3-tag-${escapeHtml(type)}">${escapeHtml(text)}</span>`;
  }

  function scoreBox(label, value) {
    return `
      <div class="v3-score-box">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function starRating(value) {
    const n = safeNum(value, 0);
    const stars = Math.max(0, Math.min(5, Math.round(n / 20)));
    return "★★★★★".slice(0, stars) + "☆☆☆☆☆".slice(0, 5 - stars);
  }

  function levelLabel(value, highLabel, midLabel, lowLabel) {
    const n = safeNum(value, 0);
    if (n >= 75) return highLabel;
    if (n >= 45) return midLabel;
    return lowLabel;
  }
    /* ===============================
    メイン描画
  =============================== */

  function renderAll(prediction) {
  const root = getRoot();

  if (typeof window.renderTodayAiSummary === "function") {
    window.renderTodayAiSummary(prediction);
  }

  if (!prediction || typeof prediction !== "object") {
    root.innerHTML = renderError(
      "予想データがありません",
      "prediction.js から予想データが返っていません。"
    );
    return;
  }

  const html = `
    <div
      class="v3-root app-prediction-layout"
      data-render-version="${escapeHtml(RENDER_VERSION)}"
    >

      <!-- 1. レース基本情報 -->
      ${renderRaceInfo(prediction)}

      <!-- 2. 出走表 -->
      ${renderEntryTable(prediction)}

      <!-- 3. AI総合評価 -->
      ${renderAiSummary(prediction)}

      <!-- 4. 本命評価 -->
      ${renderNewspaperSheet(prediction, "main")}

      <!-- 5. 本命フォーメーション -->
      ${renderFormationSection(prediction, "main")}

      <!-- 6. 万舟評価 -->
      ${renderNewspaperSheet(prediction, "manshu")}

      <!-- 7. 万舟フォーメーション -->
      ${renderFormationSection(prediction, "manshu")}

      <!-- 8. AI推奨買い目 -->
      ${renderTicketRanking(prediction)}

      <!-- 9. チャッピー理論 -->
      ${renderTheoryPanel(prediction)}

      <!-- 10. 最終結論 -->
      ${renderFinalComment(prediction)}

      ${renderDebug(prediction)}

    </div>
  `;

  root.innerHTML = html;
}

  function renderError(title, message) {
    return `
      <div class="v3-root">
        <section class="v3-section v3-error">
          <div class="v3-section-head">
            <h2>⚠️ ${escapeHtml(title)}</h2>
          </div>
          <div class="v3-section-body">
            ${escapeHtml(message)}
          </div>
        </section>
      </div>
    `;
  }

  /* ===============================
    1. レース情報
  =============================== */

  function renderRaceInfo(prediction) {
  const race = prediction.race || {};
  const venue = prediction.venue || {};
  const weather = prediction.weather || {};
  const exhibition = prediction.exhibition || {};

  const raw = race.raw || {};
  const rawWeather = raw.weather || {};

  const place =
    race.place ||
    race.stadiumName ||
    venue.name ||
    prediction.venueName ||
    "-";

  const raceNo =
    race.raceNo ||
    race.rno ||
    prediction.raceNo ||
    "-";

  const date =
    race.date ||
    prediction.date ||
    "-";

  const windDirection =
    weather.windDirection ||
    rawWeather.windDirection ||
    rawWeather.windDir ||
    "-";

  const windSpeed =
    weather.windSpeed ??
    rawWeather.windSpeed ??
    rawWeather.wind ??
    "-";

  const waveHeight =
    weather.waveHeight ??
    rawWeather.waveHeight ??
    rawWeather.wave ??
    "-";

  const tenki =
    weather.weather ||
    rawWeather.weather ||
    rawWeather.condition ||
    "-";

  const temperature =
    weather.temperature ??
    rawWeather.temperature ??
    rawWeather.temp ??
    "-";

  const waterTemperature =
    weather.waterTemperature ??
    rawWeather.waterTemperature ??
    rawWeather.waterTemp ??
    "-";

  const info = [
    { label: "場", value: place },
    { label: "R", value: raceNo },
    { label: "日付", value: date },
    { label: "天候", value: tenki },
    { label: "風向", value: windDirection },
    { label: "風速", value: windSpeed === "-" ? "-" : `${windSpeed}m` },
    { label: "波高", value: waveHeight === "-" ? "-" : `${waveHeight}cm` },
    { label: "気温", value: temperature === "-" ? "-" : `${temperature}℃` },
    { label: "水温", value: waterTemperature === "-" ? "-" : `${waterTemperature}℃` },
    {
      label: "展示",
      value:
        exhibition.comment ||
        "展示・ST・気象を総合して評価。"
    }
  ];

  const note =
    weather.comment ||
    venue.memo ||
    venue.feature ||
    race.comment ||
    "展示・ST・気象を総合して評価。";

  const body = `
    <div class="v3-race-grid">
      ${info.map((item) => renderInfoCell(item)).join("")}
    </div>

    <div class="v3-note">
      ${escapeHtml(note)}
    </div>
  `;

　　return renderSection("🚤 レース情報", body);
　　}

  function renderInfoCell(item) {
    return `
      <div class="v3-info-cell">
        <span>${escapeHtml(item.label)}</span>
        <strong>${escapeHtml(item.value)}</strong>
        ${item.sub ? `<em>${escapeHtml(item.sub)}</em>` : ""}
      </div>
    `;
  }

  /* ===============================
    2. 出走表
  =============================== */

  function renderEntryTable(prediction) {
  const race = prediction.race || {};
  const entries =
    prediction.entries ||
    prediction.entry ||
    race.entries ||
    race.entry ||
    [];

  if (!Array.isArray(entries) || entries.length === 0) {
    return section(
      "出走表",
      emptyBox("出走表データがありません"),
      "👥",
      "v3-entry-section"
    );
  }

  const rows = entries.map((e, index) => {
    const no = e.no || e.waku || e.course || e.boatNo || index + 1;
    const name = e.name || e.racerName || e.player || "-";
    const grade = e.grade || e.class || e.rank || "";
    const st = e.st || e.avgSt || e.averageST || "-";

    const motorObj = e.motor || e.motorInfo || {};
    const motor =
      e.motorNo ||
      e.motorNumber ||
      motorObj.no ||
      motorObj.number ||
      "-";

    const local =
      e.localRate ||
      e.venueRate ||
      e.courseRate ||
      e.local ||
      "-";

    return `
      <div class="v3-entry-row">
        <div class="v3-entry-boat">${boatBadge(no, "small")}</div>

        <div class="v3-entry-player">
          <strong style="color:${boatColor(no).border};">${escapeHtml(name)}</strong>
          ${grade ? `<span>${escapeHtml(grade)}</span>` : ""}
        </div>

        <div class="v3-entry-num">${escapeHtml(st)}</div>
        <div class="v3-entry-num">${escapeHtml(motor)}</div>
        <div class="v3-entry-num">${escapeHtml(local)}</div>
      </div>
    `;
  }).join("");

  const body = `
    <div class="v3-entry-grid-table">
      <div class="v3-entry-row v3-entry-head">
        <div>艇番</div>
        <div>選手名</div>
        <div>平均ST</div>
        <div>モーター</div>
        <div>当地勝率</div>
      </div>

      ${rows}
    </div>
  `;

  return section("出走表", body, "👥", "v3-entry-section");
}
    /* ===============================
    3. AI総合
  =============================== */

  function renderAiSummary(prediction) {
  const confidence = prediction.confidence || {};
  const manshuPower = prediction.manshuPower || {};
  const finalAi = prediction.finalAi || {};
  const indexes = prediction.indexes || {};

  const confidenceScore =
    confidence.score ??
    confidence.value ??
    confidence.percent ??
    prediction.confidenceScore ??
    0;

  const manshuScore =
    manshuPower.score ??
    manshuPower.value ??
    manshuPower.percent ??
    prediction.manshuScore ??
    0;

  const summary =
    finalAi.summary ||
    finalAi.comment ||
    finalAi.text ||
    prediction.aiComment ||
    "AIまとめデータがありません。";

  const body = `
    <div class="v3-ai-grid">
      ${renderAiMeter(
        "本命信頼度",
        confidenceScore,
        levelLabel(confidenceScore, "高信頼", "標準", "不安定"),
        confidence.reason || confidence.comment || ""
      )}

      ${renderAiMeter(
        "万舟期待度",
        manshuScore,
        levelLabel(manshuScore, "波乱注意", "中穴気配", "本線寄り"),
        manshuPower.reason || manshuPower.comment || ""
      )}
    </div>

    <div class="v3-ai-summary-box">
      <h3>AIまとめ</h3>
      <p>${escapeHtml(summary)}</p>
    </div>

    ${renderIndexPanel(indexes)}
  `;

  return section("AI総合", body, "📊", "v3-ai-summary");
}

  function renderAiMeter(label, score, level, comment) {
    return `
      <div class="v3-ai-meter">
        <div class="v3-ai-meter-head">
          <span>${escapeHtml(label)}</span>
          <em>${escapeHtml(level)}</em>
        </div>

        <div class="v3-stars">
          ${escapeHtml(starRating(score))}
        </div>

        <div class="v3-ai-percent">
          ${escapeHtml(percent(score))}
        </div>

        <div class="v3-ai-bar">
          <div style="width:${Math.max(0, Math.min(100, safeNum(score, 0)))}%"></div>
        </div>

        ${
          comment
            ? `<p>${escapeHtml(limitText(comment, 60))}</p>`
            : ""
        }
      </div>
    `;
  }

  function renderIndexPanel(indexes) {

  if (!indexes || typeof indexes !== "object") return "";

  const rows = [];

  addIndexRows(rows, indexes.attackRanking, "🔥攻め");
  addIndexRows(rows, indexes.tenkaiRanking || indexes.flowRanking, "🌊展開");
  addIndexRows(rows, indexes.michuRanking || indexes.roadRanking, "⚡道中");
  addIndexRows(rows, indexes.localRanking, "🏠当地");
  addIndexRows(rows, indexes.expectedRanking, "🎯期待");

  if (!rows.length) return "";

  return `
    <div class="v3-index-panel">

      <h3>AI指数ランキング</h3>

      <div class="v3-index-table">

        ${rows.join("")}

      </div>

    </div>
  `;
}

  function addIndexRows(rows, list, label) {

  arrayify(list)
    .slice(0,3)
    .forEach(item => {

      if (!item) return;

      let boat = "";
      let score = "";

      if (typeof item === "number" || typeof item === "string") {
        boat = item;
      } else {
        boat =
          item.no ||
          item.boatNo ||
          item.waku ||
          item.course ||
          "";

        score =
          item.score ??
          item.value ??
          item.point ??
          "";
      }

      rows.push(`

        <div class="v3-index-row">

          <span class="label">${label}</span>

          ${boatBadge(boat,"mini")}

          <strong>${score}</strong>

        </div>

      `);

    });

}
    /* ===============================
    4. 新聞シート共通
  =============================== */

  function renderNewspaperSheet(prediction, mode) {
    if (mode === "manshu") {
      return renderManshuNewspaper(prediction);
    }

    return renderMainNewspaper(prediction);
  }

   function renderMainNewspaper(prediction) {
  const sheet = prediction.mainSheet || {};
  const items = [];

  if (Array.isArray(sheet)) {
    sheet.forEach((item, index) => {
      const roles = ["honmei", "taikou", "ana", "osa"];
      const normalized = normalizeSheetItem(item, item.role || roles[index] || "osa");
      if (normalized) items.push(normalized);
    });
  } else {
    [
      normalizeSheetItem(sheet.honmei || sheet.main || sheet["◎"] || sheet.top, "honmei"),
      normalizeSheetItem(sheet.taikou || sheet.rival || sheet["○"] || sheet.second, "taikou"),
      normalizeSheetItem(sheet.ana || sheet.hole || sheet["▲"] || sheet.third, "ana"),
      normalizeSheetItem(sheet.osa || sheet.osae || sheet["△"] || sheet.support, "osa")
    ].filter(Boolean).forEach((item) => items.push(item));

    if (items.length === 0 && Array.isArray(sheet.items)) {
      sheet.items.forEach((item, index) => {
        const roles = ["honmei", "taikou", "ana", "osa"];
        const normalized = normalizeSheetItem(item, item.role || roles[index] || "osa");
        if (normalized) items.push(normalized);
      });
    }
  }

const raceEntries =
  prediction.race?.entries ||
  prediction.entries ||
  [];

items.forEach((item) => {
  const entry = raceEntries.find((boat) => {
    const entryBoatNo = Number(
      boat.boatNo ||
      boat.no ||
      boat.waku ||
      boat.course ||
      0
    );

    return entryBoatNo === Number(item.no);
  });

  if (!entry) return;

  item.className =
    item.className ||
    entry.className ||
    entry.grade ||
    entry.class ||
    entry.rank ||
    "";
});

  if (items.length === 0) {
    return section("本命", emptyBox("本命データがありません"), "🎯", "v3-main-newspaper");
  }

  const body = `
    <div class="v3-newspaper-list">
      ${items.map(renderNewspaperCard).join("")}
    </div>
  `;

  return section("本命", body, "🎯", "v3-main-newspaper");
}

  function renderManshuNewspaper(prediction) {
  const sheet = prediction.manshuSheet || {};
  const items = [];

  if (Array.isArray(sheet)) {
    sheet.forEach((item) => {
      const normalized = normalizeSheetItem(item, item.role || "manshu");
      if (normalized) items.push(normalized);
    });
  } else {
    const candidates = arrayify(
      sheet.candidates ||
      sheet.items ||
      sheet.manshu ||
      sheet.longshot ||
      []
    );

    const nokoshi = arrayify(
      sheet.nokoshi ||
      sheet.remain ||
      sheet.keep ||
      sheet.nokoshiCandidates ||
      []
    );

    const hiroi = arrayify(
      sheet.hiroi ||
      sheet.pickup ||
      sheet.pick ||
      sheet.hiroiCandidates ||
      []
    );

    [
      ...candidates.map((item) => normalizeSheetItem(item, "manshu")),
      ...nokoshi.map((item) => normalizeSheetItem(item, "nokoshi")),
      ...hiroi.map((item) => normalizeSheetItem(item, "hiroi"))
    ].filter(Boolean).forEach((item) => items.push(item));
  }

  const comment =
    sheet.comment ||
    sheet.reason ||
    sheet.text ||
    sheet.summary ||
    "";
  const raceEntries =
  prediction.race?.entries ||
  prediction.entries ||
  [];

items.forEach((item) => {
  const entry = raceEntries.find((boat) => {
    const entryBoatNo = Number(
      boat.boatNo ||
      boat.no ||
      boat.waku ||
      boat.course ||
      0
    );

    return entryBoatNo === Number(item.no);
  });

  if (!entry) return;

  item.className =
    item.className ||
    entry.className ||
    entry.grade ||
    entry.class ||
    entry.rank ||
    "";
});
  if (items.length === 0 && !comment) {
    return section("万舟", emptyBox("万舟データがありません"), "💣", "v3-manshu-newspaper");
  }

  const body = `
    ${
      items.length
        ? `<div class="v3-newspaper-list">${items.map(renderNewspaperCard).join("")}</div>`
        : ""
    }

    ${
      comment
        ? `<div class="v3-note v3-manshu-note">${escapeHtml(comment)}</div>`
        : ""
    }
  `;

  return section("万舟", body, "💣", "v3-manshu-newspaper");
}

  function normalizeSheetItem(item, role) {
    if (!item) return null;

    if (typeof item === "number" || typeof item === "string") {
      return {
        role,
        no: item,
        name: `${item}号艇`,
        score: "",
        tags: [],
        buffs: [],
        debuffs: [],
        comment: ""
      };
    }

    const no =
      item.no ||
      item.boatNo ||
      item.waku ||
      item.course ||
      item.lane ||
      item.number;

    const rawTags = [
      item.type,
      item.tactic,
      item.style,
      ...arrayify(item.tags || item.labels)
    ].filter(Boolean);

    return {
      role: item.role || role,
      no,
      name: item.name || item.racerName || item.player || `${safeText(no)}号艇`,
      score: item.score ?? item.index ?? item.point ?? item.value ?? "",
      tags: normalizeTags(rawTags, item),
      buffs: arrayify(item.buffs || item.buff || item.plus || item.positive),
      debuffs: arrayify(item.debuffs || item.debuff || item.minus || item.negative),
      comment:
  item.comment ||
  item.reason ||
  item.shortComment ||
  "",

sub:
  item.sub ||
  item.type ||
  item.tactic ||
  "",

className:
  item.className ||
  item.grade ||
  item.class ||
  item.rank ||
  item.raw?.entry?.className ||
  item.raw?.entry?.grade ||
  item.entry?.className ||
  item.entry?.grade ||
  "",

odds:
  item.odds ??
  item.odd ??
  item.compositeOdds ??
  item.gouseiOdds ??
  ""
};
  }

  function normalizeTags(rawTags, item) {
    const tags = [];

    arrayify(rawTags).forEach((tagText) => {
      const t = safeText(tagText, "");
      if (!t) return;

      if (t.includes("当地")) tags.push("🏠当地");
      else if (t.includes("差し")) tags.push("⚡差し");
      else if (t.includes("攻め")) tags.push("🔥攻め");
      else if (t.includes("道中")) tags.push("⚡道中");
      else if (t.includes("展開")) tags.push("🌊展開");
      else if (t.includes("外")) tags.push("🌪外枠");
      else if (t.includes("イン")) tags.push("🚤イン");
      else tags.push(t);
    });

    const buffs = arrayify(item.buffs || item.buff || item.plus || item.positive)
      .map((v) => safeText(v, ""))
      .join(" ");

    if (buffs.includes("当地") && !tags.includes("🏠当地")) tags.push("🏠当地");
    if (buffs.includes("差し") && !tags.includes("⚡差し")) tags.push("⚡差し");
    if (buffs.includes("攻め") && !tags.includes("🔥攻め")) tags.push("🔥攻め");
    if (buffs.includes("展示") && !tags.includes("🚤展示")) tags.push("🚤展示");
    if (buffs.includes("ST") && !tags.includes("⏱ST")) tags.push("⏱ST");

    return [...new Set(tags)].slice(0, 5);
  }

  function renderNewspaperCard(item) {
  const rawRole =
    ROLE_LABELS[item.role] ||
    item.role ||
    "評価";

  const roleItems = [...new Set(
    String(rawRole)
      .split("/")
      .map((text) => text.trim())
      .filter(Boolean)
  )].slice(0, 3);

  const c = boatColor(item.no);

  return `
    <article class="v3-paper-card" style="border-left-color:${c.border};">

      <div class="v3-paper-head">
        <div class="v3-paper-title">

          <div class="v3-role-list">
            ${roleItems
              .map((role) => `<span class="v3-role">${escapeHtml(role)}</span>`)
              .join("")}
          </div>

          <div class="v3-paper-player-line">
  <div class="v3-paper-player-line">
  ${boatTitle(item.no, item.name)}
  ${
    item.className
      ? `<span class="v3-paper-grade">${escapeHtml(item.className)}</span>`
      : ""
  }
</div>

${
  item.score !== "" &&
  item.score !== null &&
  item.score !== undefined
    ? `
      <div class="v3-paper-score">
        <span>AI</span>
        <strong>${escapeHtml(Math.round(Number(item.score) || 0))}</strong>
      </div>
    `
    : ""
}

${
  item.odds !== "" &&
  item.odds !== null &&
  item.odds !== undefined
    ? `
      <div class="v3-paper-odds">
        <span>オッズ</span>
        <strong>${escapeHtml(item.odds)}倍</strong>
      </div>
    `
    : ""
}
</div>
      </div>

      ${
        item.tags && item.tags.length
          ? `
            <div class="v3-tag-row">
              ${item.tags
                .slice(0, 3)
                .map((tagText) => tag(tagText, "paper"))
                .join("")}
            </div>
          `
          : ""
      }

      ${renderFactorLine(item.buffs, "plus")}
      ${renderFactorLine(item.debuffs, "minus")}

      ${
        item.comment
          ? `
            <div class="v3-paper-comment">
              <strong>狙い</strong>
              <p>${escapeHtml(createCompactPaperComment(item))}</p>
            </div>
          `
          : ""
      }

    </article>
  `;
}

/* =========================================================
  本命・万舟カード用 短文コメント
========================================================= */

function createCompactPaperComment(item) {
  const data = item || {};

  const boatNo =
    Number(data.boatNo || data.no || data.waku || 0);

  const name =
    data.name ||
    data.playerName ||
    data.racerName ||
    "";

  const score =
    Number(
      data.score ??
      data.total ??
      data.aiScore ??
      data.manshuScore ??
      0
    ) || 0;

  const buffs = arrayify(data.buffs)
    .map(formatFactor)
    .filter(Boolean);

  const debuffs = arrayify(data.debuffs)
    .map(formatFactor)
    .filter(Boolean);

  const roleText =
    data.role ||
    data.label ||
    data.primaryRole?.label ||
    "";

  const points = [];

  if (roleText) {
    points.push(roleText.split("/")[0].trim());
  }

  buffs.forEach((text) => {
    if (points.length >= 3) return;
    if (!points.includes(text)) {
      points.push(text);
    }
  });

  if (points.length < 3 && debuffs.length) {
    points.push(`注意：${debuffs[0]}`);
  }

  if (!points.length && data.shortComment) {
    points.push(data.shortComment);
  }

  if (!points.length && data.comment) {
    points.push(data.comment);
  }

  const heading =
    boatNo >= 1 && boatNo <= 6
      ? `${boatNo}号艇${name ? ` ${name}` : ""}`
      : name || "評価艇";

  const scoreText =
    score > 0
      ? `AI${Math.round(score)}点`
      : "";

  const detail = points
    .slice(0, 3)
    .map((text) => `・${String(text).replace(/[。]+$/g, "")}`)
    .join("\n");

  return [
    [heading, scoreText].filter(Boolean).join(" "),
    detail
  ]
    .filter(Boolean)
    .join("\n");
}

/* =========================================================
  選手級別取得
========================================================= */

function getPaperClassName(item) {
  const data = item || {};
  const raw = data.raw || {};
  const entry = raw.entry || data.entry || {};

  return String(
    data.className ??
    data.grade ??
    data.class ??
    data.rank ??
    entry.className ??
    entry.grade ??
    entry.class ??
    entry.rank ??
    ""
  ).trim();
}
  function renderFactorLine(list, type) {
    const items = arrayify(list)
      .map(formatFactor)
      .filter(Boolean)
      .slice(0, 4);

    if (items.length === 0) return "";

    const label = type === "plus" ? "⬆" : "⬇";

    return `
      <div class="v3-factor-line v3-factor-${escapeHtml(type)}">
        <span>${label}</span>
        <div>
          ${items.map((item) => tag(item, type)).join("")}
        </div>
      </div>
    `;
  }

  function formatFactor(value) {
    if (!value) return "";

    if (typeof value === "string" || typeof value === "number") {
      return safeText(value, "");
    }

    const label = value.label || value.name || value.text || value.reason || "";
    const point =
      value.point !== undefined
        ? ` ${signed(value.point)}`
        : value.score !== undefined
          ? ` ${signed(value.score)}`
          : "";

    return `${label}${point}`.trim();
  }
    /* ===============================
    5. フォーメーション
  =============================== */

  function renderFormationSection(prediction, mode) {
    const formation = prediction.formation || {};

    if (mode === "manshu") {
      const manshu =
        formation.manshu ||
        formation.longshot ||
        formation.highPay ||
        prediction.manshuFormation ||
        [];

      return section(
        "万舟フォーメーション",
        renderFormationBody(manshu, "manshu"),
        "💣",
        "v3-manshu-formation"
      );
    }

    const main =
      formation.main ||
      formation.honmei ||
      formation.normal ||
      formation.base ||
      prediction.mainFormation ||
      [];

    const safety =
      formation.safety ||
      formation.osae ||
      formation.cover ||
      prediction.safetyFormation ||
      [];

    const hole =
      formation.hole ||
      formation.ana ||
      formation.sub ||
      [];

    const body = `
      <div class="v3-formation-group">
        <h3>本線</h3>
        ${renderFormationBody(main, "main")}
      </div>

      <div class="v3-formation-group">
        <h3>押さえ</h3>
        ${renderFormationBody(safety, "safety")}
      </div>

      ${
        arrayify(hole).length
          ? `
            <div class="v3-formation-group">
              <h3>穴</h3>
              ${renderFormationBody(hole, "hole")}
            </div>
          `
          : ""
      }

      ${renderFormationNote(formation)}
    `;

    return section("本線フォーメーション", body, "🎫", "v3-main-formation");
  }

  function renderFormationBody(list, type) {
    const items = normalizeFormationList(list);

    if (items.length === 0) {
      return emptyBox("フォーメーションデータがありません");
    }

    return `
      <div class="v3-formation-list v3-formation-${escapeHtml(type)}">
        ${items.map((item) => renderFormationRow(item, type)).join("")}
      </div>
    `;
  }

  function normalizeFormationList(list) {
    if (!list) return [];

    if (typeof list === "string") {
      return [{ ticket: list }];
    }

    if (Array.isArray(list)) {
      return list
        .map((item) => {
          if (!item) return null;

          if (typeof item === "string") {
            return { ticket: item };
          }

          return {
            ticket:
              item.ticket ||
              item.line ||
              item.formation ||
              item.bet ||
              item.kumi ||
              "",
            label: item.label || item.type || item.rank || "",
            score:
              item.score !== undefined &&
              item.score !== null &&
              item.score !== "undefined"
                ? item.score
                : "",
            odds:
              item.odds ||
              item.syntheticOdds ||
              item.gouseiOdds ||
              "",
            reason:
              item.reason ||
              item.comment ||
              item.text ||
              ""
          };
        })
        .filter(Boolean);
    }

    if (typeof list === "object") {
      return Object.entries(list)
        .map(([label, value]) => {
          if (!value) return null;

          if (typeof value === "string") {
            return { label, ticket: value };
          }

          return {
            label,
            ticket:
              value.ticket ||
              value.line ||
              value.formation ||
              value.bet ||
              value.kumi ||
              "",
            score:
              value.score !== undefined &&
              value.score !== null &&
              value.score !== "undefined"
                ? value.score
                : "",
            odds:
              value.odds ||
              value.syntheticOdds ||
              value.gouseiOdds ||
              "",
            reason:
              value.reason ||
              value.comment ||
              value.text ||
              ""
          };
        })
        .filter(Boolean);
    }

    return [];
  }

  function renderFormationRow(item, type) {
    return `
      <div class="v3-formation-row v3-formation-row-${escapeHtml(type)}">
        <div class="v3-formation-ticket">
          ${ticketArrow(item.ticket || "-")}
        </div>

        <div class="v3-formation-tags">
          ${item.label ? tag(item.label, type) : ""}
          $${
  item.score !== undefined &&
  item.score !== null &&
  item.score !== "" &&
  item.score !== "undefined"
    ? tag(`評価 ${item.score}`, "score")
    : ""
}
          ${item.odds ? tag(`合成 ${item.odds}`, "odds") : ""}
        </div>

        ${
          item.reason
            ? `<div class="v3-formation-reason">${escapeHtml(limitText(item.reason, 60))}</div>`
            : ""
        }
      </div>
    `;
  }

  function renderFormationNote(formation) {
    const note =
      formation.comment ||
      formation.reason ||
      formation.text ||
      formation.mainComment ||
      "";

    if (!note) return "";

    return `<div class="v3-note">${escapeHtml(limitText(note, 100))}</div>`;
  }
    /* ===============================
    6. AI買い目一覧
  =============================== */

  function renderTicketRanking(prediction) {

  const list = arrayify(
    prediction.ticketRanks ||
    prediction.ticketRank ||
    prediction.ranking ||
    []
  );

  if (!list.length) {
    return section(
      "AI買い目一覧",
      emptyBox("買い目ランキングデータがありません"),
      "🏆",
      "v3-ticket-section"
    );
  }

  const groups = {
    S: [],
    A: [],
    B: [],
    C: []
  };

  list.forEach((item, i) => {

    if (typeof item === "string") {
      item = {
        ticket: item,
        rank: "B"
      };
    }

    const rank = String(item.rank || item.order || "B").toUpperCase();

    if (!groups[rank]) groups.B.push(item);
    else groups[rank].push(item);

  });

  function block(title, color, rows) {

    if (!rows.length) return "";

    return `
      <div class="v3-ticket-group">

        <div class="v3-ticket-group-title"
             style="border-left:5px solid ${color};">

          ${title}

        </div>

        ${rows.slice(0,5).map(r=>`

          <div class="v3-ticket-inline">

            <span class="ticket">
              ${ticketArrow(r.ticket||"-")}
            </span>

            ${
              r.score!==undefined
              ?`<span class="score">${r.score}</span>`
              :""
            }

          </div>

        `).join("")}

      </div>
    `;
  }

  return section(

    "AI買い目一覧",

    `
      ${block("S評価（本線）","#ef4444",groups.S)}
      ${block("A評価（対抗）","#2563eb",groups.A)}
      ${block("B評価（押さえ）","#16a34a",groups.B)}
      ${block("C評価（穴）","#f59e0b",groups.C)}
    `,

    "🏆",

    "v3-ticket-section"

  );

}

  /* ===============================
    7. 舟券太郎理論
  =============================== */

  function renderTheoryPanel(prediction) {
    const indexes = prediction.indexes || {};
    const raceFlow = prediction.raceFlow || {};
    const exhibition = prediction.exhibition || {};
    const finalAi = prediction.finalAi || {};

    const items = [];

    pushTheoryFromRanking(items, "attack", indexes.attackRanking);
    pushTheoryFromRanking(items, "flow", indexes.tenkaiRanking || indexes.flowRanking);
    pushTheoryFromRanking(items, "road", indexes.michuRanking || indexes.roadRanking);
    pushTheoryFromRanking(items, "local", indexes.localRanking);

    pushTheoryText(items, "slit", finalAi.slitAlert || exhibition.slitAlert || raceFlow.slitAlert);
    pushTheoryText(items, "doubleTime", finalAi.doubleTime || exhibition.doubleTime);
    pushTheoryText(items, "shinsam", finalAi.shinsam || exhibition.shinsam);
    pushTheoryText(items, "odds", finalAi.syntheticOdds || prediction.syntheticOdds);

    if (items.length === 0) {
      return section("舟券太郎理論", emptyBox("理論表示データがありません"), "🧠", "v3-theory-section");
    }

    const body = `
      <div class="v3-theory-grid">
        ${items.map(renderTheoryItem).join("")}
      </div>
    `;

    return section("舟券太郎理論", body, "🧠", "v3-theory-section");
  }

  function pushTheoryFromRanking(items, key, ranking) {
    const list = arrayify(ranking).slice(0, 2);
    if (list.length === 0) return;

    list.forEach((item) => {
      if (!item) return;

      if (typeof item === "number" || typeof item === "string") {
        items.push({
          key,
          label: THEORY_LABELS[key],
          no: item,
          score: "",
          text: ""
        });
        return;
      }

      items.push({
        key,
        label: THEORY_LABELS[key],
        no: item.no || item.boatNo || item.waku || item.course || item.number,
        score: item.score ?? item.value ?? item.point ?? "",
        text: item.comment || item.reason || item.text || ""
      });
    });
  }

  function pushTheoryText(items, key, value) {
    if (!value) return;

    if (Array.isArray(value)) {
      value.slice(0, 2).forEach((v) => pushTheoryText(items, key, v));
      return;
    }

    if (typeof value === "object") {
      items.push({
        key,
        label: THEORY_LABELS[key],
        no: value.no || value.boatNo || value.waku || value.course || "",
        score: value.score ?? value.value ?? value.point ?? "",
        text: value.text || value.comment || value.reason || value.label || ""
      });
      return;
    }

    items.push({
      key,
      label: THEORY_LABELS[key],
      no: "",
      score: "",
      text: value
    });
  }

  function renderTheoryItem(item) {
    return `
      <div class="v3-theory-item v3-theory-${escapeHtml(item.key)}">
        <div class="v3-theory-label">${escapeHtml(item.label || "理論")}</div>

        <div class="v3-theory-main">
          ${item.no ? boatBadge(item.no, "mini") : ""}
          ${
            item.score !== ""
              ? `<strong>${escapeHtml(item.score)}</strong>`
              : ""
          }
        </div>

        ${
          item.text
            ? `<p>${escapeHtml(limitText(item.text, 45))}</p>`
            : ""
        }
      </div>
    `;
  }
    /* ===============================
    8. 最終コメント
  =============================== */

  function renderFinalComment(prediction) {
  const finalAi = prediction.finalAi || {};
  const raceFlow = prediction.raceFlow || {};

  const finalText = safeText(
    prediction.finalComment ||
    prediction.comment ||
    prediction.finalText ||
    finalAi.summary ||
    finalAi.comment ||
    "",
    ""
  );

  const flowText = safeText(
    raceFlow.comment ||
    raceFlow.summary ||
    raceFlow.text ||
    finalAi.flow ||
    "",
    ""
  );

  const blocks = [
    {
      title: "展開",
      text: flowText
    },
    {
      title: "狙い",
      text: finalAi.target || finalAi.aim || finalText
    },
    {
      title: "注意点",
      text: finalAi.risk || finalAi.warning || finalAi.caution || ""
    },
    {
      title: "AI結論",
      text: finalAi.final || finalAi.summary || finalAi.comment || finalText
    }
  ].filter((b) => b.text);

  if (blocks.length === 0) {
    return section(
      "最終コメント",
      emptyBox("最終コメントデータがありません"),
      "📝",
      "v3-final-section"
    );
  }

  const body = `
    <div class="v3-final-grid">
      ${blocks.map(renderFinalBlock).join("")}
    </div>
  `;

  return section("最終コメント", body, "📝", "v3-final-section");
}

function renderFinalBlock(block) {
  return `
    <div class="v3-final-block">
      <h3>■ ${escapeHtml(block.title)}</h3>
      <p>${escapeHtml(limitText(block.text, 140))}</p>
    </div>
  `;
}

  /* ===============================
    デバッグ
  =============================== */

  function renderDebug(prediction) {
    if (!window.CHAPPY_DEBUG_RENDER) return "";

    return `
      <section class="v3-section v3-debug">
        <div class="v3-section-head">
          <h2>🧪 Debug</h2>
        </div>
        <div class="v3-section-body">
          <pre>${escapeHtml(JSON.stringify(prediction, null, 2))}</pre>
        </div>
      </section>
    `;
  }

  /* ===============================
    外部公開
  =============================== */

  window.renderAll = renderAll;
  window.renderPrediction = renderAll;
  window.CHAPPY_RENDER_VERSION = RENDER_VERSION;

  console.info(`[Chappy BoatRace AI] render.js loaded: ${RENDER_VERSION}`);

})();
/* =========================================================
  render.js Part 9 / 10
  AI総合カード統合 + 買い目 最大3件＋もっと見る
========================================================= */

(function () {
  "use strict";

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getBoatColorClass(boatNo) {
    return `boat-${boatNo || 0}`;
  }

  function renderAiSummaryCard(prediction) {
    const area = document.getElementById("aiSummaryArea");
    if (!area) return;

    const ai = prediction?.ai || prediction?.summary || {};
    const indexes = prediction?.indexes || prediction?.scores || {};
    const picks = safeArray(prediction?.expectedBoats || prediction?.ranking || prediction?.boats);

    const trust = ai.trust ?? ai.mainTrust ?? prediction?.trust ?? "-";
    const manshu = ai.manshu ?? ai.manshuPower ?? prediction?.manshuPower ?? "-";

    const attack = indexes.attack ?? ai.attackIndex ?? "-";
    const flow = indexes.flow ?? ai.flowIndex ?? "-";
    const road = indexes.road ?? ai.roadIndex ?? "-";
    const local = indexes.local ?? ai.localIndex ?? "-";

    const topPicks = picks.slice(0, 3).map((item, index) => {
      const boatNo = item.boatNo || item.frame || item.number || item.course || index + 1;
      const name = item.name || item.playerName || item.racer || "";
      const score = item.score ?? item.total ?? item.point ?? "-";

      return `
        <div class="ai-pick-row">
          <span class="rank-badge">${index + 1}</span>
          <span class="boat-badge ${getBoatColorClass(boatNo)}">${boatNo}</span>
          <span class="ai-pick-name">${safeText(name, `${boatNo}号艇`)}</span>
          <strong>${score}点</strong>
        </div>
      `;
    }).join("");

    area.innerHTML = `
      <section class="card ai-summary-card">
        <div class="section-title">
          <span>📊 AI総合分析</span>
        </div>

        <div class="ai-summary-grid">
          <div class="ai-summary-box main">
            <span>本命信頼度</span>
            <strong>${safeText(trust)}%</strong>
          </div>

          <div class="ai-summary-box manshu">
            <span>万舟期待度</span>
            <strong>${safeText(manshu)}%</strong>
          </div>
        </div>

        <div class="index-mini-grid">
          <div><span>🔥 攻め</span><strong>${safeText(attack)}</strong></div>
          <div><span>🌊 展開</span><strong>${safeText(flow)}</strong></div>
          <div><span>⚡ 道中</span><strong>${safeText(road)}</strong></div>
          <div><span>🏠 当地</span><strong>${safeText(local)}</strong></div>
        </div>

        <div class="ai-pick-block">
          <h3>🎯 AI注目艇</h3>
          ${topPicks || `<p class="empty-text">注目艇データなし</p>`}
        </div>

        <p class="ai-short-comment">
          ${safeText(ai.comment || ai.summary || prediction?.comment, "展開・指数・気配を総合して評価中。")}
        </p>
      </section>
    `;
  }

  function groupTicketsByRank(tickets) {
  const groups = { S: [], A: [], B: [], C: [] };

  safeArray(tickets).forEach((ticket) => {
    const score = Number(
      ticket.score ??
      ticket.point ??
      ticket.index ??
      ticket.aiScore ??
      0
    );

    let rank = ticket.rank || "";

    if (!rank) {
      if (score >= 85) rank = "S";
      else if (score >= 75) rank = "A";
      else if (score >= 65) rank = "B";
      else rank = "C";
    }

    if (!groups[rank]) groups[rank] = [];

    groups[rank].push({
      ...ticket,
      score,
      rank
    });
  });

  Object.keys(groups).forEach((rank) => {
    groups[rank].sort((a, b) => Number(b.score) - Number(a.score));
  });

  return groups;
}

  function renderTicketRow(ticket) {
  const mark =
    ticket.ticket ||
    ticket.bet ||
    ticket.mark ||
    "-";

  const score =
    ticket.score ??
    ticket.point ??
    ticket.index ??
    ticket.aiScore ??
    "-";

  const rank =
    ticket.rank ||
    ticket.type ||
    ticket.label ||
    "";

  const reason =
    ticket.reason ||
    ticket.comment ||
    ticket.description ||
    "";

  const odds =
    ticket.odds ||
    ticket.expectedOdds ||
    "";

  return `
    <div class="ticket-row ticket-rank-${safeText(rank)}">
      <div class="ticket-main">
        <strong>${safeText(mark)}</strong>
        <span class="ticket-score">AI指数 ${safeText(score)}点</span>
        ${rank ? `<span class="ticket-rank-badge">信頼度 ${safeText(rank)}</span>` : ""}
        ${odds ? `<span class="ticket-odds">オッズ ${safeText(odds)}</span>` : ""}
      </div>
      ${
        reason
          ? `<p class="ticket-reason">📝 ${safeText(reason)}</p>`
          : `<p class="ticket-reason">📝 AI評価から選出</p>`
      }
    </div>
  `;
}
  function renderAiTicketsCompact(prediction) {
    const area = document.getElementById("aiTicketsArea");
    if (!area) return;

    const tickets =
      prediction?.tickets ||
      prediction?.buyTickets ||
      prediction?.aiTickets ||
      prediction?.formations?.tickets ||
      [];

    const groups = groupTicketsByRank(tickets);
    const ranks = ["S", "A", "B", "C"];

    area.innerHTML = `
      <section class="card ai-ticket-card">
        <div class="section-title">
          <span>🏆 AI買い目一覧</span>
        </div>

        ${ranks.map((rank) => {
          const items = groups[rank] || [];
          if (!items.length) return "";

          const visible = items.slice(0, 3);
          const hidden = items.slice(3);
          const uid = `ticket-more-${rank}-${Math.random().toString(36).slice(2, 8)}`;

          return `
            <div class="ticket-rank-block rank-${rank}">
              <h3>${rank}ランク</h3>

              ${visible.map(renderTicketRow).join("")}

              ${hidden.length ? `
                <details class="ticket-more" id="${uid}">
                  <summary>もっと見る（${hidden.length}件）</summary>
                  ${hidden.map(renderTicketRow).join("")}
                </details>
              ` : ""}
            </div>
          `;
        }).join("") || `<p class="empty-text">買い目データなし</p>`}
      </section>
    `;
  }

  const oldRenderAll = window.renderAll;

  window.renderAll = function renderAllWithPart9(prediction) {
    if (typeof oldRenderAll === "function") {
      oldRenderAll(prediction);
    }

    renderAiSummaryCard(prediction);
  };

})();
/* =========================================================
  render.js Part 10 / 10
  最終コメント整理 + シート視認性補助 + 完成仕上げ
========================================================= */

(function () {
  "use strict";

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function shortText(text, max = 70) {
    const value = safeText(text, "");
    if (!value) return "";
    return value.length > max ? value.slice(0, max) + "…" : value;
  }

  function getFinalComment(prediction) {
    const comment =
      prediction?.finalComment ||
      prediction?.comment ||
      prediction?.ai?.comment ||
      prediction?.summary?.comment ||
      "";

    if (!comment) {
      return {
        flow: "展開はイン中心に確認。",
        aim: "本線は上位指数艇を重視。",
        caution: "展示・直前気配で最終判断。"
      };
    }

    return {
      flow: shortText(prediction?.flowComment || comment, 55),
      aim: shortText(prediction?.aimComment || comment, 55),
      caution: shortText(prediction?.cautionComment || "オッズと展示気配のズレに注意。", 55)
    };
  }

  function renderFinalCommentCompact(prediction) {
    const area = document.getElementById("finalCommentArea");
    if (!area) return;

    const c = getFinalComment(prediction);

    area.innerHTML = `
      <section class="card final-comment-card">
        <div class="section-title">
          <span>📝 最終コメント</span>
        </div>

        <div class="final-comment-lines">
          <p><strong>展開：</strong>${c.flow}</p>
          <p><strong>狙い：</strong>${c.aim}</p>
          <p><strong>注意：</strong>${c.caution}</p>
        </div>
      </section>
    `;
  }

  function polishSheets() {
    document
      .querySelectorAll(".main-sheet-card, .manshu-sheet-card, .sheet-card")
      .forEach((card) => {
        card.classList.add("sheet-polished");
      });

    document
      .querySelectorAll(".buff, .debuff, .buff-tag, .debuff-tag")
      .forEach((tag) => {
        tag.classList.add("compact-tag");
      });
  }

  const oldRenderAll = window.renderAll;

  window.renderAll = function renderAllWithPart10(prediction) {
    if (typeof oldRenderAll === "function") {
      oldRenderAll(prediction);
    }

    renderFinalCommentCompact(prediction);
    polishSheets();
  };

})();
/* =========================================================
  render.js Phase1
  aiCore 優先表示アダプター
========================================================= */

(function () {
  "use strict";

  function hasAiCore(prediction) {
    return !!(prediction && prediction.aiCore);
  }

  function applyAiCoreAdapter(prediction) {
    if (!hasAiCore(prediction)) return prediction;

    const core = prediction.aiCore;

    return {
      ...prediction,

      ai: {
        ...(prediction.ai || {}),
        ...(core.ai || {})
      },

      indexes: {
        ...(prediction.indexes || {}),
        ...(core.indexes || {})
      },

      expectedBoats: core.expectedBoats || prediction.expectedBoats,
      ranking: core.ranking || prediction.ranking,

      mainSheet: core.mainSheet || prediction.mainSheet,
      manshuSheet: core.manshuSheet || prediction.manshuSheet,

      tickets: core.tickets || prediction.tickets,
      buyTickets: core.tickets || prediction.buyTickets,

      roleSummary: core.roleSummary || prediction.roleSummary,
      manshuCandidates: core.manshuCandidates || prediction.manshuCandidates
    };
  }

  const oldRenderAll = window.renderAll;

  window.renderAll = function renderAllWithAiCore(prediction) {
    const adaptedPrediction = applyAiCoreAdapter(prediction);

    if (typeof oldRenderAll === "function") {
      oldRenderAll(adaptedPrediction);
    }
  };

  window.ChappyRenderAdapter = {
    hasAiCore,
    applyAiCoreAdapter
  };
/* =========================================================
  今日のAIおすすめ
========================================================= */

window.renderTodayAiSummary = function renderTodayAiSummary(prediction) {
  const mainSheet = prediction?.mainSheet || {};
  const manshuSheet = prediction?.manshuSheet || {};
  const weather = prediction?.weather || {};
  const finalAi = prediction?.finalAi || {};
  const confidence = prediction?.confidence || {};
  const manshuPower = prediction?.manshuPower || {};

  const honmei =
    mainSheet.honmei ||
    mainSheet.main ||
    mainSheet.top ||
    null;

  const manshu =
    manshuSheet.candidates?.[0] ||
    prediction?.manshuCandidates?.[0] ||
    null;

  const confidenceScore = Math.round(
    Number(
      confidence.score ??
      finalAi.confidence?.score ??
      finalAi.confidence ??
      honmei?.score ??
      0
    ) || 0
  );

  const manshuScore = Math.round(
    Number(
      manshuPower.score ??
      finalAi.manshuPower?.score ??
      finalAi.manshuPower ??
      manshu?.manshuScore ??
      manshu?.score ??
      0
    ) || 0
  );

  const mainText = honmei
    ? `${honmei.boatNo || honmei.no || "-"}号艇 ${honmei.name || honmei.playerName || ""}`
    : "解析待ち";

  const manshuText = manshu
    ? `${manshu.boatNo || manshu.no || "-"}号艇 ${manshu.name || manshu.playerName || ""}`
    : "解析待ち";

  const waterParts = [];

  if (weather.windDirection) {
    waterParts.push(weather.windDirection);
  }

  if (
    weather.windSpeed !== null &&
    weather.windSpeed !== undefined &&
    weather.windSpeed !== ""
  ) {
    waterParts.push(`風${weather.windSpeed}m`);
  }

  if (
    weather.waveHeight !== null &&
    weather.waveHeight !== undefined &&
    weather.waveHeight !== ""
  ) {
    waterParts.push(`波${weather.waveHeight}cm`);
  }

  const waterText = waterParts.length
    ? waterParts.join("・")
    : "確認待ち";

  let judgeText = "解析待ち";

  if (confidenceScore >= 82) {
    judgeText = "本命強め";
  } else if (confidenceScore >= 70) {
    judgeText = "本命寄り";
  } else if (manshuScore >= 72) {
    judgeText = "万舟警戒";
  } else if (confidenceScore > 0) {
    judgeText = "混戦";
  }

  setTodayAiText(
    "todayMainPick",
    mainText,
    confidenceScore > 0
      ? `本命期待度 ${confidenceScore}%`
      : "総合指数上位"
  );

  setTodayAiText(
    "todayManshuPick",
    manshuText,
    manshuScore > 0
      ? `万舟期待度 ${manshuScore}%`
      : "妙味・展開候補"
  );

  setTodayAiText(
    "todayWaterCondition",
    waterText,
    weather.comment || "風・波・潮汐"
  );

  setTodayAiText(
    "todayAiJudge",
    judgeText,
    finalAi.summary ||
      prediction?.finalComment?.title ||
      "買い／見送り判断"
  );
  };

function setTodayAiText(id, mainText, subText) {
  const main = document.getElementById(id);

  if (!main) return;

  main.textContent = mainText || "-";

  const card = main.closest(".today-ai-card");
  const small = card?.querySelector("small");

  if (small) {
    small.textContent = subText || "-";
  }
}
})();