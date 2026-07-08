/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 Part 1/6

  役割：
  - 画面描画専用
  - prediction.js の結果をスマホ新聞UIで表示
  - renderAll() を window に公開
========================================================= */

(function () {
  "use strict";

  /* ===============================
    基本定義
  =============================== */

  const BOAT_COLORS = {
    1: { name: "白", color: "#111111", bg: "#ffffff", border: "#d8d8d8" },
    2: { name: "黒", color: "#111111", bg: "#f4f4f4", border: "#111111" },
    3: { name: "赤", color: "#d32f2f", bg: "#fff5f5", border: "#d32f2f" },
    4: { name: "青", color: "#1565c0", bg: "#f3f8ff", border: "#1565c0" },
    5: { name: "黄", color: "#b8860b", bg: "#fffbea", border: "#d6a300" },
    6: { name: "緑", color: "#188038", bg: "#f2fff6", border: "#188038" }
  };

  const ROLE_LABELS = {
    main: "本命",
    rival: "対抗",
    hole: "穴",
    keep: "押さえ",
    longshot: "万舟"
  };

  const MARKS = ["◎", "○", "▲", "△", "☆", "注"];

  /* ===============================
    DOM取得
  =============================== */

  function $(id) {
    return document.getElementById(id);
  }

  function setHTML(id, html) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = html || "";
  }

  function clearHTML(id) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = "";
  }

  /* ===============================
    安全処理
  =============================== */

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function escapeHTML(value) {
    return safeText(value, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function asArray(value) {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    return [value];
  }

  function pick(obj, keys, fallback = "") {
    if (!obj) return fallback;
    for (const key of keys) {
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== "") {
        return obj[key];
      }
    }
    return fallback;
  }

  function formatScore(value) {
    const n = safeNumber(value, 0);
    return Math.round(n);
  }

  function formatTime(value) {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    if (!Number.isFinite(n)) return safeText(value);
    return n.toFixed(2);
  }

  /* ===============================
    艇表示
  =============================== */

  function boatColor(num) {
    return BOAT_COLORS[num] || BOAT_COLORS[1];
  }

  function boatBadge(num) {
    const n = Number(num);
    const c = boatColor(n);

    return `
      <span class="boat-badge boat-${n}"
        style="
          color:${c.color};
          background:${c.bg};
          border:1px solid ${c.border};
        ">
        ${n}
      </span>
    `;
  }

  function boatName(num) {
    const c = boatColor(Number(num));
    return `${num}号艇・${c.name}`;
  }

  function racerName(racer) {
    return escapeHTML(
      pick(racer, ["name", "racerName", "playerName", "選手名"], "選手名なし")
    );
  }

  function boatTitle(racer) {
    const num = pick(racer, ["boat", "boatNo", "waku", "枠番"], "-");
    return `${boatBadge(num)} <strong>${num}号艇</strong> ${racerName(racer)}`;
  }

  /* ===============================
    共通UI部品
  =============================== */

  function sectionTitle(icon, title, sub = "") {
    return `
      <div class="render-section-title">
        <div class="render-section-main">
          <span>${icon}</span>
          <strong>${escapeHTML(title)}</strong>
        </div>
        ${sub ? `<p>${escapeHTML(sub)}</p>` : ""}
      </div>
    `;
  }

  function smallNote(text) {
    if (!text) return "";
    return `<p class="render-note">${escapeHTML(text)}</p>`;
  }

  function emptyBox(text) {
    return `
      <div class="render-empty">
        ${escapeHTML(text || "表示できるデータがありません。")}
      </div>
    `;
  }

  function divider(label) {
    return `
      <div class="render-divider">
        <span>${escapeHTML(label || "")}</span>
      </div>
    `;
  }

  function tag(text, type = "") {
    if (!text) return "";
    return `<span class="render-tag ${type}">${escapeHTML(text)}</span>`;
  }

  function tags(list, type = "") {
    const arr = asArray(list).filter(Boolean);
    if (!arr.length) return "";
    return `
      <div class="render-tags">
        ${arr.map((item) => tag(item, type)).join("")}
      </div>
    `;
  }

  function miniStat(label, value) {
    return `
      <div class="render-mini-stat">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(value)}</strong>
      </div>
    `;
  }
    function card(title, body, className = "") {
    return `
      <div class="render-card ${className}">
        ${title ? `<h3>${title}</h3>` : ""}
        ${body || ""}
      </div>
    `;
  }

  function scoreBar(score) {
    const n = Math.max(0, Math.min(100, formatScore(score)));
    return `
      <div class="render-score-bar">
        <div style="width:${n}%"></div>
      </div>
    `;
  }

  function buffDebuffBlock(item) {
    const buffs = asArray(
      pick(item, ["buffs", "plus", "positive", "goodPoints", "バフ"], [])
    );

    const debuffs = asArray(
      pick(item, ["debuffs", "minus", "negative", "badPoints", "デバフ"], [])
    );

    return `
      <div class="render-bd">
        <div>
          <strong>⬆️ プラス</strong>
          ${buffs.length ? tags(buffs, "buff") : smallNote("強調材料なし")}
        </div>
        <div>
          <strong>⬇️ マイナス</strong>
          ${debuffs.length ? tags(debuffs, "debuff") : smallNote("大きな不安なし")}
        </div>
      </div>
    `;
  }

  function commentText(item) {
    return escapeHTML(
      pick(item, ["comment", "shortComment", "reason", "memo", "一言", "解説"], "")
    );
  }

  /* ===============================
    データ正規化
  =============================== */

  function getRaceInfo(data) {
    return (
      pick(data, ["raceInfo", "race", "info"], null) ||
      {}
    );
  }

  function getEntries(data) {
    return (
      pick(data, ["entries", "racers", "players", "entry"], null) ||
      pick(getRaceInfo(data), ["entries", "racers", "players"], null) ||
      []
    );
  }

  function getPrediction(data) {
    return (
      pick(data, ["prediction", "predict", "result", "aiResult"], null) ||
      data ||
      {}
    );
  }

  function getScores(data) {
    const prediction = getPrediction(data);

    const raw =
      pick(prediction, ["scores", "ranking", "boats", "sheet"], null) ||
      pick(data, ["scores", "ranking", "boats", "sheet"], null) ||
      [];

    if (Array.isArray(raw)) return raw;

    if (typeof raw === "object" && raw) {
      return Object.keys(raw).map((key) => ({
        boat: key,
        ...raw[key]
      }));
    }

    return [];
  }

  function getFormations(data) {
    const prediction = getPrediction(data);

    return (
      pick(prediction, ["formations", "formation", "tickets", "buyList"], null) ||
      pick(data, ["formations", "formation", "tickets", "buyList"], null) ||
      {}
    );
  }

  function getLongshots(data) {
    const prediction = getPrediction(data);

    return (
      pick(prediction, ["longshots", "longshot", "manshu", "穴"], null) ||
      pick(data, ["longshots", "longshot", "manshu", "穴"], null) ||
      []
    );
  }

  function mergeEntryScore(entry, scores) {
    const boat = Number(pick(entry, ["boat", "boatNo", "waku", "枠番"], 0));

    const score =
      scores.find((s) => Number(pick(s, ["boat", "boatNo", "waku", "枠番"], 0)) === boat) ||
      {};

    return {
      ...entry,
      ...score,
      boat
    };
  }

  function getMergedBoats(data) {
    const entries = asArray(getEntries(data));
    const scores = asArray(getScores(data));

    if (entries.length) {
      return entries.map((entry) => mergeEntryScore(entry, scores));
    }

    return scores.map((score) => ({
      ...score,
      boat: Number(pick(score, ["boat", "boatNo", "waku", "枠番"], 0))
    }));
  }

  function sortByScore(list) {
    return [...asArray(list)].sort((a, b) => {
      const sa = safeNumber(pick(a, ["score", "total", "point", "index", "指数"], 0));
      const sb = safeNumber(pick(b, ["score", "total", "point", "index", "指数"], 0));
      return sb - sa;
    });
  }

  function roleByIndex(index) {
    if (index === 0) return "main";
    if (index === 1) return "rival";
    if (index === 2) return "hole";
    return "keep";
  }

  /* ===============================
    ローディング・エラー
  =============================== */

  function renderLoading(message = "読み込み中です。") {
    setHTML("errorArea", "");
    setHTML("loadingArea", `
      <div class="render-loading">
        ${escapeHTML(message)}
      </div>
    `);
  }

  function clearLoading() {
    clearHTML("loadingArea");
  }

  function renderError(message) {
    setHTML("errorArea", `
      <div class="render-error">
        <h2>⚠️ エラー</h2>
        <p>${escapeHTML(message || "エラーが発生しました。")}</p>
      </div>
    `);
  }

  function clearError() {
    clearHTML("errorArea");
  }
    /* ===============================
    🚤 レース情報
  =============================== */

  function renderRaceInfo(data) {
    const info = getRaceInfo(data);

    const place = pick(info, ["place", "venue", "stadiumName", "場"], "-");
    const raceNo = pick(info, ["raceNo", "rno", "raceNumber", "R"], "-");
    const title = pick(info, ["title", "raceTitle", "name"], "");
    const date = pick(info, ["date", "raceDate", "日付"], "");
    const distance = pick(info, ["distance", "距離"], "1800m");
    const deadline = pick(info, ["deadline", "締切"], "");

    setHTML("raceInfoArea", `
      ${sectionTitle("🚤", "レース情報", "まずは場・レース・基本条件を確認")}
      <div class="render-card">
        <div class="render-race-head">
          <div>
            <strong>${escapeHTML(place)}</strong>
            <span>${escapeHTML(raceNo)}R</span>
          </div>
          ${title ? `<p>${escapeHTML(title)}</p>` : ""}
        </div>

        <div class="render-mini-grid">
          ${miniStat("日付", date || "-")}
          ${miniStat("距離", distance)}
          ${miniStat("締切", deadline || "-")}
        </div>
      </div>
    `);
  }

  function renderWeather(data) {
    const info = getRaceInfo(data);
    const weather = pick(data, ["weather", "condition", "weatherInfo"], null) || info;

    const weatherText = pick(weather, ["weather", "天気"], "-");
    const wind = pick(weather, ["wind", "windSpeed", "風"], "-");
    const windDir = pick(weather, ["windDirection", "windDir", "風向"], "");
    const wave = pick(weather, ["wave", "waveHeight", "波"], "-");
    const temp = pick(weather, ["temperature", "temp", "気温"], "-");
    const water = pick(weather, ["waterTemperature", "waterTemp", "水温"], "-");

    setHTML("weatherArea", `
      ${sectionTitle("🌤", "水面・気象", "風・波・水温は展開の前提")}
      <div class="render-card">
        <div class="render-mini-grid">
          ${miniStat("天気", weatherText)}
          ${miniStat("風", `${windDir ? windDir + " " : ""}${wind}`)}
          ${miniStat("波", wave)}
          ${miniStat("気温", temp)}
          ${miniStat("水温", water)}
        </div>
      </div>
    `);
  }

  function renderVenue(data) {
    const info = getRaceInfo(data);
    const venue = pick(data, ["venue", "venueInfo", "stadium"], null) || {};

    const place = pick(info, ["place", "venue", "stadiumName", "場"], "");
    const feature = pick(venue, ["feature", "features", "特徴"], "");
    const bias = pick(venue, ["bias", "courseBias", "傾向"], "");
    const note = pick(venue, ["note", "memo", "メモ"], "");

    setHTML("venueArea", `
      ${sectionTitle("🏟", "場の特徴", "固定バイアスではなく、条件と展開で判断")}
      <div class="render-card">
        <h3>${escapeHTML(place || "レース場")}</h3>
        ${feature ? `<p>${escapeHTML(feature)}</p>` : ""}
        ${bias ? tags(asArray(bias), "info") : ""}
        ${note ? smallNote(note) : ""}
      </div>
    `);
  }

  /* ===============================
    👥 出走表
  =============================== */

  function renderEntryTable(data) {
    const boats = getMergedBoats(data);

    if (!boats.length) {
      setHTML("entryArea", `
        ${sectionTitle("👥", "出走表", "選手・級別・ST・モーターを確認")}
        ${emptyBox("出走表データがありません。")}
      `);
      return;
    }

    const rows = boats
      .sort((a, b) => Number(a.boat) - Number(b.boat))
      .map((racer) => {
        const boat = pick(racer, ["boat", "boatNo", "waku", "枠番"], "-");
        const cls = pick(racer, ["class", "rank", "級別"], "-");
        const st = pick(racer, ["st", "avgST", "averageST", "平均ST"], "-");
        const motor = pick(racer, ["motor", "motorNo", "モーター"], "-");
        const motorRate = pick(racer, ["motorRate", "motor2Rate", "モーター2連率"], "-");
        const local = pick(racer, ["localRate", "venueRate", "当地勝率"], "-");

        return `
          <tr>
            <td>${boatBadge(boat)}</td>
            <td>
              <strong>${racerName(racer)}</strong>
              <span>${escapeHTML(cls)}</span>
            </td>
            <td>${escapeHTML(st)}</td>
            <td>${escapeHTML(motor)}</td>
            <td>${escapeHTML(motorRate)}</td>
            <td>${escapeHTML(local)}</td>
          </tr>
        `;
      })
      .join("");

    setHTML("entryArea", `
      ${sectionTitle("👥", "出走表", "選手力・ST・当地・モーターを一覧で確認")}
      <div class="render-card render-table-card">
        <table class="render-table">
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>ST</th>
              <th>機</th>
              <th>2連率</th>
              <th>当地</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `);
  }

  /* ===============================
    📊 AI分析
  =============================== */

  function renderAiAnalysis(data) {
    const boats = sortByScore(getMergedBoats(data));

    if (!boats.length) {
      setHTML("aiAnalysisArea", `
        ${sectionTitle("📊", "AI分析", "指数・強み・不安点")}
        ${emptyBox("AI分析データがありません。")}
      `);
      return;
    }

    const html = boats
      .map((boat, index) => {
        const boatNo = pick(boat, ["boat", "boatNo", "waku", "枠番"], "-");
        const score = pick(boat, ["score", "total", "point", "index", "指数"], 0);
        const role = ROLE_LABELS[roleByIndex(index)] || "評価";
        const mark = MARKS[index] || "注";
        const comment = commentText(boat);

        return `
          <div class="render-rank-row">
            <div class="render-rank-left">
              <span class="render-mark">${mark}</span>
              ${boatBadge(boatNo)}
              <div>
                <strong>${racerName(boat)}</strong>
                <p>${escapeHTML(role)}</p>
              </div>
            </div>
            <div class="render-rank-score">
              <strong>${formatScore(score)}</strong>
              <span>指数</span>
            </div>
            ${scoreBar(score)}
            ${comment ? `<p class="render-comment">${comment}</p>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("aiAnalysisArea", `
      ${sectionTitle("📊", "AI分析", "指数は高い順。買い目とは分けて判断")}
      <div class="render-card">
        ${html}
      </div>
    `);
  }

  function renderMainPredictionSheet(data) {
    const boats = sortByScore(getMergedBoats(data));

    if (!boats.length) {
      setHTML("mainSheetArea", `
        ${sectionTitle("🔵", "本命予想シート", "通常展開の中心")}
        ${emptyBox("本命シートを表示できません。")}
      `);
      return;
    }

    const top = boats.slice(0, 6);

    const html = top
      .map((boat, index) => {
        const boatNo = pick(boat, ["boat", "boatNo", "waku", "枠番"], "-");
        const score = pick(boat, ["score", "total", "point", "index", "指数"], 0);
        const role = ROLE_LABELS[roleByIndex(index)] || "押さえ";
        const mark = MARKS[index] || "注";
        const comment = commentText(boat);

        return `
          <div class="render-sheet-item">
            <div class="render-sheet-head">
              <div>
                <span class="render-mark">${mark}</span>
                ${boatBadge(boatNo)}
                <strong>${racerName(boat)}</strong>
              </div>
              <div class="render-score-pill">${formatScore(score)}</div>
            </div>

            <div class="render-role">${escapeHTML(role)}</div>
            ${buffDebuffBlock(boat)}
            ${comment ? `<p class="render-comment">${comment}</p>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("mainSheetArea", `
      ${sectionTitle("🔵", "本命予想シート", "スコア → バフ/デバフ → 一言解説")}
      <div class="render-card render-main-sheet">
        ${html}
      </div>
    `);
  }
    /* ===============================
    🌸 万舟シート
  =============================== */

  function renderManshuSheet(data) {
    const longshots = asArray(getLongshots(data));
    const boats = sortByScore(getMergedBoats(data));

    const source = longshots.length ? longshots : boats.slice(2, 6);

    if (!source.length) {
      setHTML("manshuSheetArea", `
        ${sectionTitle("🌸", "万舟候補シート", "荒れ目・内側絡み・外枠絡みを確認")}
        ${emptyBox("万舟候補データがありません。")}
      `);
      return;
    }

    const html = source
      .map((item, index) => {
        const boatNo = pick(item, ["boat", "boatNo", "waku", "枠番"], "-");
        const score = pick(item, ["score", "longshotScore", "manshuScore", "index", "指数"], 0);
        const reason = commentText(item) || pick(item, ["reason", "理由"], "展開次第で配当妙味あり");
        const odds = pick(item, ["odds", "currentOdds", "オッズ"], "");

        return `
          <div class="render-sheet-item">
            <div class="render-sheet-head">
              <div>
                <span class="render-mark">${index === 0 ? "☆" : "注"}</span>
                ${boatBadge(boatNo)}
                <strong>${racerName(item)}</strong>
              </div>
              <div class="render-score-pill pink">${formatScore(score)}</div>
            </div>

            ${odds ? `<div class="render-role">現位オッズ：${escapeHTML(odds)}</div>` : ""}
            ${buffDebuffBlock(item)}
            <p class="render-comment">${escapeHTML(reason)}</p>
          </div>
        `;
      })
      .join("");

    setHTML("manshuSheetArea", `
      ${sectionTitle("🌸", "万舟候補シート", "外枠だけでなく、内側絡みの高配当も確認")}
      <div class="render-card render-manshu-sheet">
        ${html}
      </div>
    `);
  }

  /* ===============================
    🎯 フォーメーション
  =============================== */

  function normalizeFormationItem(item) {
    if (typeof item === "string") {
      return { ticket: item, note: "" };
    }

    return {
      ticket: pick(item, ["ticket", "formation", "buy", "買い目"], ""),
      note: pick(item, ["note", "reason", "comment", "理由"], ""),
      odds: pick(item, ["odds", "オッズ"], "")
    };
  }

  function renderFormationGroup(title, list, type) {
    const arr = asArray(list).map(normalizeFormationItem).filter((x) => x.ticket);

    if (!arr.length) return "";

    return `
      <div class="render-formation-group ${type || ""}">
        <h3>${escapeHTML(title)}</h3>
        ${arr
          .map((item) => `
            <div class="render-ticket">
              <strong>${escapeHTML(item.ticket)}</strong>
              ${item.odds ? `<span>${escapeHTML(item.odds)}</span>` : ""}
              ${item.note ? `<p>${escapeHTML(item.note)}</p>` : ""}
            </div>
          `)
          .join("")}
      </div>
    `;
  }

  function renderFormations(data) {
    const formations = getFormations(data);

    const main =
      pick(formations, ["main", "honmei", "本線"], null) ||
      pick(data, ["mainFormation", "本線"], null) ||
      [];

    const safe =
      pick(formations, ["safe", "cover", "osae", "押さえ", "安全"], null) ||
      pick(data, ["safeFormation", "押さえ"], null) ||
      [];

    const manshu =
      pick(formations, ["longshot", "manshu", "穴", "万舟"], null) ||
      pick(data, ["longshotFormation", "万舟"], null) ||
      [];

    const flow =
      pick(formations, ["flow", "nagashi", "流し"], null) ||
      pick(data, ["flowFormation", "流し"], null) ||
      [];

    const html = [
      renderFormationGroup("本線", main, "main"),
      renderFormationGroup("安全押さえ", safe, "safe"),
      renderFormationGroup("流し候補", flow, "flow"),
      renderFormationGroup("万舟狙い", manshu, "manshu")
    ].join("");

    setHTML("formationArea", `
      ${sectionTitle("🎯", "フォーメーション提案", "本線・安全・流し・万舟を分けて確認")}
      <div class="render-card">
        ${html || emptyBox("フォーメーションデータがありません。")}
      </div>
    `);
  }

  /* ===============================
    🧠 舟券太郎理論
  =============================== */

  function getTheory(data) {
    const prediction = getPrediction(data);

    return (
      pick(prediction, ["theory", "theories", "tarou"], null) ||
      pick(data, ["theory", "theories", "tarou"], null) ||
      {}
    );
  }

  function renderTheorySummary(data) {
    const theory = getTheory(data);

    const slit = pick(theory, ["slitAlert", "slit", "スリット"], null);
    const doubleTime = pick(theory, ["doubleTime", "double", "ダブルタイム"], null);
    const newSam = pick(theory, ["newSam", "sam", "新サム"], null);
    const odds = pick(theory, ["syntheticOdds", "odds", "合成オッズ"], null);

    const blocks = [
      {
        title: "スリットアラート",
        value: slit,
        note: "内外との差が大きい時に展開変化を警戒"
      },
      {
        title: "ダブルタイム",
        value: doubleTime,
        note: "展示タイム＋一周タイムの強調材料"
      },
      {
        title: "新サム",
        value: newSam,
        note: "展示＋一周の合計差を見る補助理論"
      },
      {
        title: "合成オッズ",
        value: odds,
        note: "期待値を見るための補助"
      }
    ];

    const html = blocks
      .map((b) => `
        <div class="render-theory-box">
          <strong>${escapeHTML(b.title)}</strong>
          <p>${escapeHTML(
            typeof b.value === "object"
              ? pick(b.value, ["summary", "comment", "value", "結果"], "確認中")
              : (b.value || "確認中")
          )}</p>
          <span>${escapeHTML(b.note)}</span>
        </div>
      `)
      .join("");

    setHTML("theorySummaryArea", `
      <div class="render-theory-grid">
        ${html}
      </div>
    `);
  }
    function renderTheoryAlerts(data) {
    const theory = getTheory(data);

    const alerts =
      pick(theory, ["alerts", "alert", "アラート"], null) ||
      [];

    const arr = asArray(alerts);

    if (!arr.length) {
      setHTML("theoryAlertArea", `
        <div class="render-card">
          ${emptyBox("強い理論アラートはありません。")}
        </div>
      `);
      return;
    }

    const html = arr
      .map((item) => {
        if (typeof item === "string") {
          return `<div class="render-alert-item">${escapeHTML(item)}</div>`;
        }

        const title = pick(item, ["title", "name", "type", "種類"], "アラート");
        const text = pick(item, ["text", "comment", "message", "内容"], "");
        const boat = pick(item, ["boat", "boatNo", "艇"], "");

        return `
          <div class="render-alert-item">
            <strong>${boat ? boatBadge(boat) : ""}${escapeHTML(title)}</strong>
            ${text ? `<p>${escapeHTML(text)}</p>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("theoryAlertArea", `
      <div class="render-card">
        ${html}
      </div>
    `);
  }

  /* ===============================
    ⚠️ アラート
  =============================== */

  function renderAlertArea(data) {
    const prediction = getPrediction(data);

    const alerts =
      pick(prediction, ["alerts", "warnings", "notice"], null) ||
      pick(data, ["alerts", "warnings", "notice"], null) ||
      [];

    const arr = asArray(alerts);

    if (!arr.length) {
      setHTML("alertArea", `
        ${sectionTitle("⚠️", "注意ポイント", "買い目を決める前の確認")}
        <div class="render-card">
          ${emptyBox("大きな注意材料はありません。")}
        </div>
      `);
      return;
    }

    const html = arr
      .map((item) => {
        if (typeof item === "string") {
          return `<div class="render-alert-item">${escapeHTML(item)}</div>`;
        }

        const title = pick(item, ["title", "name", "type"], "注意");
        const text = pick(item, ["text", "comment", "message"], "");
        const level = pick(item, ["level", "rank", "importance"], "");

        return `
          <div class="render-alert-item">
            <strong>${escapeHTML(title)}</strong>
            ${level ? `<span>${escapeHTML(level)}</span>` : ""}
            ${text ? `<p>${escapeHTML(text)}</p>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("alertArea", `
      ${sectionTitle("⚠️", "注意ポイント", "過信せず、展開と水面で最終確認")}
      <div class="render-card">
        ${html}
      </div>
    `);
  }

  /* ===============================
    💰 オッズ
  =============================== */

  function renderOdds(data) {
    const odds =
      pick(data, ["odds", "oddsInfo", "オッズ"], null) ||
      pick(getPrediction(data), ["odds", "oddsInfo", "オッズ"], null) ||
      [];

    const arr = asArray(odds);

    if (!arr.length) {
      setHTML("oddsArea", `
        ${sectionTitle("💰", "オッズ", "合成オッズ・現位オッズの確認")}
        <div class="render-card">
          ${emptyBox("オッズデータがありません。")}
        </div>
      `);
      return;
    }

    const html = arr
      .slice(0, 20)
      .map((item) => {
        if (typeof item === "string") {
          return `<div class="render-ticket"><strong>${escapeHTML(item)}</strong></div>`;
        }

        const ticket = pick(item, ["ticket", "formation", "combination", "目"], "");
        const value = pick(item, ["odds", "value", "倍率"], "");
        const note = pick(item, ["note", "comment", "memo"], "");

        return `
          <div class="render-ticket">
            <strong>${escapeHTML(ticket)}</strong>
            ${value ? `<span>${escapeHTML(value)}</span>` : ""}
            ${note ? `<p>${escapeHTML(note)}</p>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("oddsArea", `
      ${sectionTitle("💰", "オッズ", "人気・妙味・万舟候補を確認")}
      <div class="render-card">
        ${html}
      </div>
    `);
  }

  /* ===============================
    📋 レースリスト
  =============================== */

  function renderRaceList(data) {
    const races =
      pick(data, ["raceList", "races", "raceCards"], null) ||
      [];

    const arr = asArray(races);

    if (!arr.length) {
      setHTML("raceListArea", "");
      return;
    }

    const html = arr
      .map((race) => {
        const no = pick(race, ["raceNo", "rno", "R"], "-");
        const title = pick(race, ["title", "name"], "");
        const deadline = pick(race, ["deadline", "締切"], "");

        return `
          <div class="render-race-list-item">
            <strong>${escapeHTML(no)}R</strong>
            <span>${escapeHTML(title)}</span>
            ${deadline ? `<em>${escapeHTML(deadline)}</em>` : ""}
          </div>
        `;
      })
      .join("");

    setHTML("raceListArea", `
      ${sectionTitle("📋", "レース一覧", "取得済みレース")}
      <div class="render-card">
        ${html}
      </div>
    `);
  }

  /* ===============================
    🤖 AI補足
  =============================== */

  function renderAiExtra(data) {
    const prediction = getPrediction(data);

    const ai =
      pick(prediction, ["ai", "aiComment", "summary"], null) ||
      pick(data, ["ai", "aiComment", "summary"], null) ||
      "";

    const text =
      typeof ai === "object"
        ? pick(ai, ["comment", "summary", "text"], "")
        : ai;

    setHTML("aiArea", `
      <div class="render-card">
        <h2>🤖 チャッピーAI</h2>
        ${text ? `<p class="render-comment">${escapeHTML(text)}</p>` : smallNote("AI補足コメントはありません。")}
      </div>
    `);
  }
    /* ===============================
    全体描画
  =============================== */

  function renderAll(data) {
    try {
      clearError();
      clearLoading();

      const safeData = data || {};

      renderRaceList(safeData);
      renderRaceInfo(safeData);
      renderWeather(safeData);
      renderVenue(safeData);
      renderEntryTable(safeData);
      renderAiAnalysis(safeData);
      renderMainPredictionSheet(safeData);
      renderFormations(safeData);
      renderManshuSheet(safeData);
      renderAlertArea(safeData);
      renderOdds(safeData);
      renderTheorySummary(safeData);
      renderTheoryAlerts(safeData);
      renderAiExtra(safeData);

    } catch (error) {
      console.error("renderAll error:", error);
      renderError("画面描画中にエラーが発生しました。render.jsを確認してください。");
    }
  }

  /* ===============================
    互換用：古い呼び出し名にも対応
  =============================== */

  function renderPrediction(data) {
    renderAll(data);
  }

  function renderResult(data) {
    renderAll(data);
  }

  function renderRace(data) {
    renderAll(data);
  }

  function clearRender() {
    [
      "raceListArea",
      "raceInfoArea",
      "weatherArea",
      "venueArea",
      "entryArea",
      "aiAnalysisArea",
      "mainSheetArea",
      "formationArea",
      "manshuSheetArea",
      "alertArea",
      "oddsArea",
      "theorySummaryArea",
      "theoryAlertArea",
      "aiArea",
      "errorArea",
      "loadingArea"
    ].forEach(clearHTML);
  }

  /* ===============================
    window公開
  =============================== */

  window.renderAll = renderAll;
  window.renderPrediction = renderPrediction;
  window.renderResult = renderResult;
  window.renderRace = renderRace;
  window.renderLoading = renderLoading;
  window.clearLoading = clearLoading;
  window.renderError = renderError;
  window.clearError = clearError;
  window.clearRender = clearRender;

})();