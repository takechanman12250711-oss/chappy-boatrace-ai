/* =========================================================
  チャッピーボートレースAI
  render.js 完全版

  役割：
  - 画面描画専用
  - prediction.js の結果を受け取って表示
  - 計算ロジックは持たない
  - 白カード新聞風UI
========================================================= */

(function () {
  "use strict";

  const BOAT_COLORS = {
    1: { name: "白", text: "#111111", bg: "#ffffff", border: "#d8d8d8" },
    2: { name: "黒", text: "#111111", bg: "#f4f4f4", border: "#111111" },
    3: { name: "赤", text: "#d32f2f", bg: "#fff7f7", border: "#d32f2f" },
    4: { name: "青", text: "#1565c0", bg: "#f5f9ff", border: "#1565c0" },
    5: { name: "黄", text: "#b88900", bg: "#fffbea", border: "#d6a800" },
    6: { name: "緑", text: "#168a45", bg: "#f3fff7", border: "#168a45" }
  };

  const AREA_IDS = {
    root: "resultArea",
    raceInfo: "raceInfoArea",
    entryTable: "entryTableArea",
    aiAnalysis: "aiAnalysisArea",
    mainSheet: "mainSheetArea",
    longshotSheet: "longshotSheetArea",
    formation: "formationArea",
    finalJudgement: "finalJudgementArea",
    odds: "oddsArea",
    missingNumbers: "missingNumbersArea",
    statistics: "statisticsArea",
    weather: "weatherArea",
    loading: "loadingArea",
    error: "errorArea"
  };

  const SECTION_ORDER = [
    "raceInfo",
    "entryTable",
    "aiAnalysis",
    "mainSheet",
    "longshotSheet",
    "formation",
    "finalJudgement",
    "odds",
    "missingNumbers",
    "statistics"
  ];

  const MARK_LABELS = {
    main: "◎ 本命",
    honmei: "◎ 本命",
    second: "○ 対抗",
    taikou: "○ 対抗",
    hole: "▲ 穴",
    ana: "▲ 穴",
    keep: "△ 押さえ",
    osaえ: "△ 押さえ",
    osa: "△ 押さえ",
    danger: "危 危険"
  };

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === "") return [];
    return [value];
  }

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function safeNumber(value, fallback = null) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  function formatNumber(value, digits = 1, fallback = "-") {
    const num = safeNumber(value);
    return num === null ? fallback : num.toFixed(digits);
  }

  function formatRate(value, digits = 2, fallback = "-") {
    const num = safeNumber(value);
    return num === null ? fallback : num.toFixed(digits);
  }

  function formatST(value, fallback = "-") {
    const num = safeNumber(value);
    return num === null ? fallback : num.toFixed(2);
  }

  function formatPercent(value, digits = 1, fallback = "-") {
    const num = safeNumber(value);
    return num === null ? fallback : `${num.toFixed(digits)}%`;
  }

  function escapeHTML(value) {
    return safeText(value, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function pick(obj, keys, fallback = undefined) {
    if (!isObject(obj)) return fallback;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
    }
    return fallback;
  }

  function normalizeBoatNo(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 1 && num <= 6) return num;
    return null;
  }

  function getBoatNo(item) {
    return normalizeBoatNo(pick(item, ["boatNo", "boat", "waku", "lane", "course", "number", "枠番", "艇番"]));
  }

  function getBoatColor(boatNo) {
    return BOAT_COLORS[normalizeBoatNo(boatNo)] || BOAT_COLORS[1];
      }

  function getEntryName(item) {
    return safeText(pick(item, ["name", "racerName", "playerName", "選手名"], ""));
  }

  function getScore(item) {
    return safeNumber(pick(item, ["score", "totalScore", "totalIndex", "aiScore", "index", "総合指数"], null));
  }

  function getComment(item) {
    return safeText(pick(item, ["comment", "aiComment", "summary", "短評", "AIコメント"], "コメントなし");
  }

  function getPlus(item) {
    return toArray(pick(item, ["plus", "buffs", "positive", "positiveFactors", "good", "プラス要因"], []));
  }

  function getMinus(item) {
    return toArray(pick(item, ["minus", "debuffs", "negative", "negativeFactors", "bad", "マイナス要因"], []));
  }

  function scoreClass(score) {
    const num = safeNumber(score, 0);
    if (num >= 80) return "score-high";
    if (num >= 65) return "score-mid";
    if (num >= 50) return "score-low";
    return "score-weak";
  }

  function valueClass(value, goodLine, badLine, reverse = false) {
    const num = safeNumber(value);
    if (num === null) return "";
    if (!reverse) {
      if (num >= goodLine) return "value-good";
      if (num <= badLine) return "value-bad";
      return "value-normal";
    }
    if (num <= goodLine) return "value-good";
    if (num >= badLine) return "value-bad";
    return "value-normal";
  }

  function boatBadge(boatNo, label = "") {
    const no = normalizeBoatNo(boatNo);
    if (!no) return `<span class="boat-badge empty">-</span>`;

    const c = getBoatColor(no);
    return `
      <span
        class="boat-badge boat-${no}"
        style="--boat-text:${c.text};--boat-bg:${c.bg};--boat-border:${c.border};"
      >
        ${escapeHTML(label || no)}
      </span>
    `;
  }

  function miniBoat(boatNo) {
    const no = normalizeBoatNo(boatNo);
    if (!no) return `<span class="mini-boat empty">-</span>`;

    const c = getBoatColor(no);
    return `
      <span
        class="mini-boat boat-${no}"
        style="--boat-text:${c.text};--boat-bg:${c.bg};--boat-border:${c.border};"
      >
        ${no}
      </span>
    `;
  }

  function scoreHTML(score, suffix = "") {
    const num = safeNumber(score);
    if (num === null) return `<span class="score-text score-empty">-</span>`;
    return `<span class="score-text ${scoreClass(num)}">${formatNumber(num, 1)}${escapeHTML(suffix)}</span>`;
  }

  function tagHTML(text, type = "normal") {
    if (!text) return "";
    return `<span class="factor-tag factor-${type}">${escapeHTML(text)}</span>`;
  }

  function tagListHTML(items, type = "normal", emptyText = "材料なし") {
    const list = toArray(items).filter(Boolean);
    if (!list.length) return `<div class="factor-list muted">${escapeHTML(emptyText)}</div>`;
    return `<div class="factor-list">${list.map((item) => tagHTML(item, type)).join("")}</div>`;
  }

  function plusMinusHTML(plusItems, minusItems) {
    return `
      <div class="pm-box">
        <div class="pm-row plus">
          <span class="pm-label">⬆ プラス</span>
          ${tagListHTML(plusItems, "plus")}
        </div>
        <div class="pm-row minus">
          <span class="pm-label">⬇ マイナス</span>
          ${tagListHTML(minusItems, "minus")}
        </div>
      </div>
    `;
  }

  function emptyHTML(text = "表示データなし") {
    return `<div class="empty-box">${escapeHTML(text)}</div>`;
  }

  function cardHTML(body, className = "") {
    return `<div class="chappy-card ${className}">${body || ""}</div>`;
  }

  function sectionHTML(title, subtitle, body, className = "") {
    return `
      <section class="chappy-section ${className}">
        <div class="section-divider"></div>
        <header class="section-header">
          <h2>${escapeHTML(title)}</h2>
          ${subtitle ? `<p>${escapeHTML(subtitle)}</p>` : ""}
        </header>
        <div class="section-body">
          ${body || emptyHTML()}
        </div>
      </section>
    `;
  }

  function kvHTML(label, value, className = "") {
    return `
      <div class="kv ${className}">
        <span class="kv-label">${escapeHTML(label)}</span>
        <span class="kv-value">${escapeHTML(safeText(value))}</span>
      </div>
    `;
  }

  function metricHTML(label, valueHTML, className = "") {
    return `
      <div class="metric ${className}">
        <span class="metric-label">${escapeHTML(label)}</span>
        <span class="metric-value">${valueHTML}</span>
      </div>
    `;
  }

  function comboHTML(combo) {
    if (Array.isArray(combo)) {
      return combo.map((n) => miniBoat(n)).join("<span class='combo-dash'>-</span>");
    }

    const text = safeText(combo, "");
    const nums = text.match(/[1-6]/g);
    if (nums && nums.length >= 2) {
      return nums.map((n) => miniBoat(n)).join("<span class='combo-dash'>-</span>");
    }

    return `<span class="combo-text">${escapeHTML(text || "-")}</span>`;
  }

  function getArea(id) {
    return document.getElementById(id);
  }

  function setHTML(id, html) {
    const el = getArea(id);
    if (el) el.innerHTML = html;
  }

  function clearHTML(id) {
    setHTML(id, "");
  }

  function firstArray(data, keys) {
    for (const key of keys) {
      const value = pick(data, [key], null);
      if (Array.isArray(value)) return value;
    }
    return [];
  }

  function normalizeResult(raw) {
    const data = isObject(raw) ? raw : {};
    const prediction = isObject(data.prediction) ? data.prediction : data;
    const race = isObject(data.raceInfo) ? data.raceInfo : isObject(prediction.raceInfo) ? prediction.raceInfo : {};
    const weather = isObject(data.weather) ? data.weather : isObject(prediction.weather) ? prediction.weather : {};
    const entries =
      firstArray(prediction, ["entries", "entry", "racers", "players", "boats", "出走表"]) ||
      firstArray(data, ["entries", "entry", "racers", "players", "boats", "出走表"]);

    return {
      raw: data,
      prediction,
      race,
      weather,
      entries: toArray(entries)
    };
  }

  function renderRaceInfo(raw) {
    const data = normalizeResult(raw);
    const race = data.race;
    const weather = data.weather;

    const body = cardHTML(`
      <div class="race-info-grid">
        ${kvHTML("場", pick(race, ["stadiumName", "place", "venue", "場"], "-"))}
        ${kvHTML("R", pick(race, ["raceNo", "raceNumber", "rno", "R"], "-"))}
        ${kvHTML("タイトル", pick(race, ["title", "raceTitle", "name", "レース名"], "-"))}
        ${kvHTML("締切", pick(race, ["deadline", "closeTime", "締切"], "-"))}
        ${kvHTML("距離", pick(race, ["distance", "距離"], "1800m"))}
        ${kvHTML("進入", pick(race, ["entryStyle", "進入", "course"], "-"))}
        ${kvHTML("天候", pick(weather, ["weather", "天候"], "-"))}
        ${kvHTML("風", pick(weather, ["wind", "windText", "風"], "-"))}
        ${kvHTML("波", pick(weather, ["wave", "waveHeight", "波"], "-"))}
        ${kvHTML("気温/水温", pick(weather, ["temperatureText", "tempText", "気温水温"], "-"))}
      </div>
    `, "race-info-card");

    return sectionHTML("🚤 レース情報", "場・締切・水面条件を確認", body, "race-info-section");
  }
    function renderEntryTable(raw) {
    const data = normalizeResult(raw);
    const entries = data.entries;

    if (!entries.length) {
      return sectionHTML("👥 出走表", "選手・展示・指数・コメント", emptyHTML("出走表データなし"), "entry-section");
    }

    const cards = entries
      .map((entry) => {
        const boatNo = getBoatNo(entry);
        const score = getScore(entry);
        const name = getEntryName(entry);

        const className = safeText(pick(entry, ["class", "rank", "grade", "級別"], "-"));
        const nationalRate = formatRate(pick(entry, ["nationalRate", "winRate", "全国勝率"], null));
        const localRate = formatRate(pick(entry, ["localRate", "localWinRate", "当地勝率"], null));
        const st = formatST(pick(entry, ["st", "avgST", "averageST", "ST"], null));
        const exhibition = formatNumber(pick(entry, ["exhibition", "tenji", "exhibitionTime", "展示"], null), 2);
        const motor = safeText(pick(entry, ["motor", "motorNo", "motorRate", "モーター"], "-"));
        const tactic = safeText(pick(entry, ["tactic", "style", "racingStyle", "戦法"], "-"));

        return cardHTML(`
          <div class="entry-card-head">
            <div class="entry-title">
              ${boatBadge(boatNo)}
              <div>
                <div class="entry-name">${escapeHTML(name || "選手名なし")}</div>
                <div class="entry-sub">${escapeHTML(className)} / ${escapeHTML(tactic)}</div>
              </div>
            </div>
            <div class="entry-score">
              <span>総合指数</span>
              ${scoreHTML(score)}
            </div>
          </div>

          <div class="entry-metrics">
            ${metricHTML("全国", escapeHTML(nationalRate), valueClass(nationalRate, 6.0, 4.5))}
            ${metricHTML("当地", escapeHTML(localRate), valueClass(localRate, 6.0, 4.5))}
            ${metricHTML("ST", escapeHTML(st), valueClass(st, 0.14, 0.19, true))}
            ${metricHTML("展示", escapeHTML(exhibition), valueClass(exhibition, 6.75, 6.90, true))}
            ${metricHTML("M", escapeHTML(motor))}
          </div>

          ${plusMinusHTML(getPlus(entry), getMinus(entry))}

          <div class="ai-comment">
            ${escapeHTML(getComment(entry))}
          </div>
        `, `entry-card boat-card-${boatNo || "x"}`);
      })
      .join("");

    return sectionHTML("👥 出走表", "艇番・選手・指数・バフ/デバフ", `<div class="entry-grid">${cards}</div>`, "entry-section");
  }

  function renderAIAnalysis(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;
    const analysis = isObject(p.aiAnalysis)
      ? p.aiAnalysis
      : isObject(p.analysis)
        ? p.analysis
        : {};

    const metrics = [
      ["攻め指数", pick(analysis, ["attackIndex", "attack", "攻め指数"], null)],
      ["展開指数", pick(analysis, ["flowIndex", "developmentIndex", "展開指数"], null)],
      ["道中指数", pick(analysis, ["middleIndex", "raceIndex", "道中指数"], null)],
      ["当地指数", pick(analysis, ["localIndex", "venueIndex", "当地指数"], null)],
      ["展示評価", pick(analysis, ["exhibitionIndex", "exhibition", "展示評価"], null)],
      ["ST評価", pick(analysis, ["stIndex", "startIndex", "ST評価"], null)],
      ["新エンジン", pick(analysis, ["newEngineIndex", "newEngine", "新エンジン評価"], null)]
    ];

    const metricCards = metrics
      .map(([label, value]) => metricHTML(label, scoreHTML(value), "analysis-metric"))
      .join("");

    const alerts = [
      ["スリットアラート", pick(analysis, ["slitAlert", "slit", "スリットアラート"], "")],
      ["ダブルタイム", pick(analysis, ["doubleTime", "doubleTimeTheory", "ダブルタイム"], "")],
      ["新サム理論", pick(analysis, ["shinSamu", "newSamu", "新サム理論"], "")]
    ];

    const alertHTML = alerts
      .map(([label, value]) => {
        const text = Array.isArray(value) ? value.join(" / ") : safeText(value, "該当なし");
        return cardHTML(`
          <div class="theory-title">${escapeHTML(label)}</div>
          <div class="theory-text">${escapeHTML(text)}</div>
        `, "theory-card");
      })
      .join("");

    const comment = safeText(pick(analysis, ["comment", "aiComment", "summary", "AIコメント"], "AI分析コメントなし"));

    const body = `
      <div class="analysis-grid">
        ${metricCards}
      </div>
      <div class="theory-grid">
        ${alertHTML}
      </div>
      <div class="ai-comment analysis-comment">
        ${escapeHTML(comment)}
      </div>
    `;

    return sectionHTML("📊 AI分析", "攻め・展開・道中・理論アラート", body, "analysis-section");
  }

  function getSheetItems(prediction, keys) {
    for (const key of keys) {
      const value = pick(prediction, [key], null);
      if (Array.isArray(value)) return value;
      if (isObject(value)) {
        const arr = firstArray(value, ["items", "boats", "candidates", "list"]);
        if (arr.length) return arr;
      }
    }
    return [];
  }

  function normalizeSheetItem(item, index = 0) {
    if (!isObject(item)) {
      return {
        mark: index === 0 ? "main" : index === 1 ? "second" : index === 2 ? "hole" : "keep",
        boatNo: item,
        score: null,
        comment: "コメントなし",
        plus: [],
        minus: []
      };
    }

    return {
      mark: pick(item, ["mark", "type", "rankType", "評価"], index === 0 ? "main" : index === 1 ? "second" : index === 2 ? "hole" : "keep"),
      boatNo: getBoatNo(item),
      name: getEntryName(item),
      score: getScore(item),
      comment: getComment(item),
      plus: getPlus(item),
      minus: getMinus(item)
    };
  }

  function sheetCardHTML(item, fallbackMark) {
    const normalized = normalizeSheetItem(item);
    const mark = MARK_LABELS[normalized.mark] || fallbackMark || safeText(normalized.mark, "評価");
    const boatNo = normalized.boatNo;

    return cardHTML(`
      <div class="sheet-card-head">
        <div class="sheet-mark">${escapeHTML(mark)}</div>
        <div class="sheet-boat">
          ${boatBadge(boatNo)}
          <span class="sheet-name">${escapeHTML(normalized.name || `${boatNo || "-"}号艇`)}</span>
        </div>
        <div class="sheet-score">${scoreHTML(normalized.score)}</div>
      </div>
      ${plusMinusHTML(normalized.plus, normalized.minus)}
      <div class="ai-comment">${escapeHTML(normalized.comment)}</div>
    `, "sheet-card");
  }
    function renderMainSheet(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;

    let items = getSheetItems(p, ["mainSheet", "blueSheet", "honmeiSheet", "本命シート"]);
    if (!items.length) {
      items = [
        pick(p, ["main", "honmei", "◎"], null),
        pick(p, ["second", "taikou", "○"], null),
        pick(p, ["hole", "ana", "▲"], null),
        pick(p, ["keep", "osae", "△"], null)
      ].filter(Boolean);
    }

    if (!items.length) {
      return sectionHTML("🔵 本命シート", "◎○▲△の評価", emptyHTML("本命シートなし"), "main-sheet-section");
    }

    const labels = ["◎ 本命", "○ 対抗", "▲ 穴", "△ 押さえ"];
    const body = `<div class="sheet-grid">${items.map((item, i) => sheetCardHTML(item, labels[i])).join("")}</div>`;

    return sectionHTML("🔵 本命シート", "本線側の中心評価", body, "main-sheet-section");
  }

  function renderLongshotSheet(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;

    const longshot = isObject(p.longshotSheet)
      ? p.longshotSheet
      : isObject(p.pinkSheet)
        ? p.pinkSheet
        : isObject(p.manshuSheet)
          ? p.manshuSheet
          : {};

    const candidates =
      firstArray(longshot, ["candidates", "items", "boats", "longshots", "万舟候補"]) ||
      getSheetItems(p, ["longshotCandidates", "manshuCandidates", "pinkCandidates"]);

    const candidateHTML = candidates.length
      ? `<div class="sheet-grid">${candidates.map((item) => sheetCardHTML(item, "💣 万舟候補")).join("")}</div>`
      : emptyHTML("万舟候補なし");

    const outer = pick(longshot, ["outerExpectation", "outsideExpectation", "外枠期待度"], "-");
    const reason = pick(longshot, ["reason", "targetReason", "狙い理由"], "狙い理由なし");
    const caution = pick(longshot, ["caution", "risk", "注意点"], "注意点なし");
    const missing = pick(longshot, ["missing", "missingNumbers", "出てない目"], []);

    const info = cardHTML(`
      <div class="longshot-info-grid">
        ${kvHTML("外枠期待", outer)}
        ${kvHTML("狙い理由", reason)}
        ${kvHTML("注意点", caution)}
        ${kvHTML("出てない目", Array.isArray(missing) ? missing.join(" / ") : missing)}
      </div>
      <div class="ai-comment">
        ${escapeHTML(safeText(pick(longshot, ["comment", "aiComment", "AIコメント"], "万舟コメントなし")))}
      </div>
    `, "longshot-info-card");

    return sectionHTML("🌸 万舟シート", "穴筋・外枠期待・出てない目", `${info}${candidateHTML}`, "longshot-section");
  }

  function formationBlockHTML(title, items, className) {
    const list = toArray(items).filter(Boolean);

    const body = list.length
      ? list
          .map((item) => {
            if (isObject(item)) {
              const combo = pick(item, ["combo", "formation", "ticket", "buy", "買い目"], "-");
              const odds = pick(item, ["odds", "syntheticOdds", "合成オッズ"], "");
              const comment = pick(item, ["comment", "reason", "理由"], "");
              return `
                <div class="formation-row">
                  <div class="formation-combo">${comboHTML(combo)}</div>
                  ${odds ? `<div class="formation-odds">${escapeHTML(safeText(odds))}</div>` : ""}
                  ${comment ? `<div class="formation-comment">${escapeHTML(safeText(comment))}</div>` : ""}
                </div>
              `;
            }

            return `
              <div class="formation-row">
                <div class="formation-combo">${comboHTML(item)}</div>
              </div>
            `;
          })
          .join("")
      : emptyHTML("該当買い目なし");

    return cardHTML(`
      <h3>${escapeHTML(title)}</h3>
      <div class="formation-list">${body}</div>
    `, `formation-block ${className}`);
  }

  function renderFormation(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;
    const f = isObject(p.formation) ? p.formation : isObject(p.formations) ? p.formations : {};

    const main = pick(f, ["main", "honmei", "本線"], pick(p, ["mainFormation", "本線"], []));
    const cover = pick(f, ["cover", "keep", "osae", "押さえ"], pick(p, ["coverFormation", "押さえ"], []));
    const longshot = pick(f, ["longshot", "manshu", "穴", "万舟"], pick(p, ["longshotFormation", "manshuFormation", "万舟"], []));

    const body = `
      <div class="formation-grid">
        ${formationBlockHTML("🎯 本線", main, "formation-main")}
        ${formationBlockHTML("🛡 押さえ", cover, "formation-cover")}
        ${formationBlockHTML("💣 万舟", longshot, "formation-longshot")}
      </div>
    `;

    return sectionHTML("🎯 フォーメーション", "本線・押さえ・万舟を分離", body, "formation-section");
  }

  function renderFinalJudgement(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;
    const j = isObject(p.finalJudgement)
      ? p.finalJudgement
      : isObject(p.final)
        ? p.final
        : isObject(p.judgement)
          ? p.judgement
          : {};

    const body = cardHTML(`
      <div class="final-grid">
        ${kvHTML("勝負度", pick(j, ["confidence", "battleLevel", "勝負度"], "-"))}
        ${kvHTML("本線", pick(j, ["main", "mainLine", "本線"], "-"))}
        ${kvHTML("穴", pick(j, ["hole", "longshot", "穴"], "-"))}
        ${kvHTML("危険艇", pick(j, ["danger", "dangerBoat", "危険艇"], "-"))}
        ${kvHTML("買い方", pick(j, ["buyStyle", "howToBuy", "買い方"], "-"))}
      </div>
      <div class="ai-comment final-comment">
        ${escapeHTML(safeText(pick(j, ["comment", "aiComment", "summary", "AIコメント"], "最終判断コメントなし")))}
      </div>
    `, "final-card");

    return sectionHTML("📝 AI最終判断", "勝負度・軸・穴・危険艇", body, "final-section");
  }
    function renderOdds(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;
    const odds =
      firstArray(p, ["odds", "oddsTop", "topOdds", "オッズ"]) ||
      firstArray(data.raw, ["odds", "oddsTop", "topOdds", "オッズ"]);

    const synthetic = pick(p, ["syntheticOdds", "合成オッズ"], pick(data.raw, ["syntheticOdds", "合成オッズ"], ""));

    const oddsHTML = odds.length
      ? odds
          .slice(0, 12)
          .map((item, index) => {
            const combo = isObject(item) ? pick(item, ["combo", "combination", "買い目"], "-") : item;
            const value = isObject(item) ? pick(item, ["odds", "value", "オッズ"], "") : "";
            const expected = isObject(item) ? pick(item, ["expected", "expectation", "期待値"], "") : "";

            return `
              <div class="odds-row">
                <span class="odds-rank">${index + 1}</span>
                <span class="odds-combo">${comboHTML(combo)}</span>
                <span class="odds-value">${escapeHTML(safeText(value, "-"))}</span>
                ${expected ? `<span class="odds-expected">${escapeHTML(safeText(expected))}</span>` : ""}
              </div>
            `;
          })
          .join("")
      : emptyHTML("オッズデータなし");

    const body = `
      ${synthetic ? cardHTML(`${kvHTML("合成オッズ", synthetic)}`, "synthetic-odds-card") : ""}
      ${cardHTML(`<div class="odds-list">${oddsHTML}</div>`, "odds-card")}
    `;

    return sectionHTML("📈 オッズ", "TOP12・合成オッズ・期待値", body, "odds-section");
  }

  function renderMissingNumbers(raw) {
    const data = normalizeResult(raw);
    const p = data.prediction;

    const missing =
      firstArray(p, ["missingNumbers", "missing", "missingTop", "出てない目"]) ||
      firstArray(data.raw, ["missingNumbers", "missing", "missingTop", "出てない目"]);

    if (!missing.length) {
      return sectionHTML("📉 出てない目", "TOP30・現在オッズ", emptyHTML("出てない目データなし"), "missing-section");
    }

    const rows = missing
      .slice(0, 30)
      .map((item, index) => {
        const combo = isObject(item) ? pick(item, ["combo", "combination", "買い目"], "-") : item;
        const odds = isObject(item) ? pick(item, ["odds", "currentOdds", "現在オッズ"], "-") : "-";
        const expectation = isObject(item) ? pick(item, ["expectation", "expected", "期待度"], "") : "";

        return `
          <div class="missing-row">
            <span class="missing-rank">${index + 1}</span>
            <span class="missing-combo">${comboHTML(combo)}</span>
            <span class="missing-odds">${escapeHTML(safeText(odds))}</span>
            ${expectation ? `<span class="missing-expectation">${escapeHTML(safeText(expectation))}</span>` : ""}
          </div>
        `;
      })
      .join("");

    return sectionHTML(
      "📉 出てない目",
      "TOP30・現在オッズ・期待度",
      cardHTML(`<div class="missing-list">${rows}</div>`, "missing-card"),
      "missing-section"
    );
  }

  function renderStatistics(raw) {
    const data = normalizeResult(raw);
    const stats = isObject(data.prediction.statistics)
      ? data.prediction.statistics
      : isObject(data.raw.statistics)
        ? data.raw.statistics
        : isObject(data.raw.stats)
          ? data.raw.stats
          : {};

    const body = cardHTML(`
      <div class="stats-grid">
        ${kvHTML("1コース勝率", formatPercent(pick(stats, ["course1WinRate", "firstCourseWinRate", "1コース勝率"], null)))}
        ${kvHTML("イン勝率", formatPercent(pick(stats, ["inWinRate", "イン勝率"], null)))}
        ${kvHTML("まくり率", formatPercent(pick(stats, ["makuriRate", "まくり率"], null)))}
        ${kvHTML("差し率", formatPercent(pick(stats, ["sashiRate", "差し率"], null)))}
        ${kvHTML("平均配当", pick(stats, ["averagePayout", "avgPayout", "平均配当"], "-"))}
        ${kvHTML("決まり手", pick(stats, ["winningMove", "kimarite", "決まり手"], "-"))}
      </div>
    `, "stats-card");

    return sectionHTML("📊 統計情報", "場傾向・決まり手・配当", body, "statistics-section");
  }

  function renderWeather(raw) {
    const data = normalizeResult(raw);
    const w = data.weather;

    const body = cardHTML(`
      <div class="weather-grid">
        ${kvHTML("天候", pick(w, ["weather", "天候"], "-"))}
        ${kvHTML("風向", pick(w, ["windDirection", "windDir", "風向"], "-"))}
        ${kvHTML("風速", pick(w, ["windSpeed", "風速"], "-"))}
        ${kvHTML("波高", pick(w, ["waveHeight", "wave", "波高"], "-"))}
        ${kvHTML("気温", pick(w, ["temperature", "temp", "気温"], "-"))}
        ${kvHTML("水温", pick(w, ["waterTemperature", "waterTemp", "水温"], "-"))}
      </div>
    `, "weather-card");

    return sectionHTML("🌊 水面・気象", "風・波・気温・水温", body, "weather-section");
  }

  function renderLoading(message = "読み込み中...") {
    const html = `
      <div class="loading-box">
        <div class="loading-spinner"></div>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
    setHTML(AREA_IDS.loading, html);
  }

  function clearLoading() {
    clearHTML(AREA_IDS.loading);
  }

  function renderError(error) {
    const message = error instanceof Error ? error.message : safeText(error, "不明なエラー");
    const html = `
      <div class="error-box">
        <strong>エラー</strong>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
    setHTML(AREA_IDS.error, html);
  }
    function clearError() {
    clearHTML(AREA_IDS.error);
  }

  function renderAll(raw) {
    try {
      clearError();
      clearLoading();

      const data = normalizeResult(raw);

      const html = SECTION_ORDER
        .map((section) => {
          if (section === "raceInfo") return renderRaceInfo(data.raw);
          if (section === "entryTable") return renderEntryTable(data.raw);
          if (section === "aiAnalysis") return renderAIAnalysis(data.raw);
          if (section === "mainSheet") return renderMainSheet(data.raw);
          if (section === "longshotSheet") return renderLongshotSheet(data.raw);
          if (section === "formation") return renderFormation(data.raw);
          if (section === "finalJudgement") return renderFinalJudgement(data.raw);
          if (section === "odds") return renderOdds(data.raw);
          if (section === "missingNumbers") return renderMissingNumbers(data.raw);
          if (section === "statistics") return renderStatistics(data.raw);
          return "";
        })
        .join("");

      const root = getArea(AREA_IDS.root);

      if (root) {
        root.innerHTML = html;
      } else {
        setHTML(AREA_IDS.raceInfo, renderRaceInfo(data.raw));
        setHTML(AREA_IDS.entryTable, renderEntryTable(data.raw));
        setHTML(AREA_IDS.aiAnalysis, renderAIAnalysis(data.raw));
        setHTML(AREA_IDS.mainSheet, renderMainSheet(data.raw));
        setHTML(AREA_IDS.longshotSheet, renderLongshotSheet(data.raw));
        setHTML(AREA_IDS.formation, renderFormation(data.raw));
        setHTML(AREA_IDS.finalJudgement, renderFinalJudgement(data.raw));
        setHTML(AREA_IDS.odds, renderOdds(data.raw));
        setHTML(AREA_IDS.missingNumbers, renderMissingNumbers(data.raw));
        setHTML(AREA_IDS.statistics, renderStatistics(data.raw));
      }

      return true;
    } catch (error) {
      console.error("[Chappy renderAll error]", error);
      renderError(error);
      return false;
    }
  }

  function renderSection(sectionName, raw) {
    if (sectionName === "raceInfo") return renderRaceInfo(raw);
    if (sectionName === "entryTable") return renderEntryTable(raw);
    if (sectionName === "aiAnalysis") return renderAIAnalysis(raw);
    if (sectionName === "mainSheet") return renderMainSheet(raw);
    if (sectionName === "longshotSheet") return renderLongshotSheet(raw);
    if (sectionName === "formation") return renderFormation(raw);
    if (sectionName === "finalJudgement") return renderFinalJudgement(raw);
    if (sectionName === "odds") return renderOdds(raw);
    if (sectionName === "missingNumbers") return renderMissingNumbers(raw);
    if (sectionName === "statistics") return renderStatistics(raw);
    if (sectionName === "weather") return renderWeather(raw);
    return emptyHTML("指定されたセクションがありません");
  }

  window.ChappyRender = {
    renderAll,
    renderSection,
    renderRaceInfo,
    renderEntryTable,
    renderAIAnalysis,
    renderMainSheet,
    renderLongshotSheet,
    renderFormation,
    renderFinalJudgement,
    renderOdds,
    renderMissingNumbers,
    renderStatistics,
    renderWeather,
    renderLoading,
    clearLoading,
    renderError,
    clearError
  };

  window.renderAll = renderAll;
  window.renderRaceInfo = renderRaceInfo;
  window.renderEntryTable = renderEntryTable;
  window.renderAIAnalysis = renderAIAnalysis;
  window.renderMainSheet = renderMainSheet;
  window.renderLongshotSheet = renderLongshotSheet;
  window.renderFormation = renderFormation;
  window.renderFinalJudgement = renderFinalJudgement;
  window.renderOdds = renderOdds;
  window.renderMissingNumbers = renderMissingNumbers;
  window.renderStatistics = renderStatistics;
  window.renderWeather = renderWeather;
  window.renderLoading = renderLoading;
  window.renderError = renderError;

})();