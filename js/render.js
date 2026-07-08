/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 Part 1-1 / 6

  役割：
  - prediction.js の返却データ専用の描画ファイル
  - AI計算・予想ロジックは書かない
  - renderAll(prediction) を公開する

  UI方針：
  - ボートレース新聞をスマホで読む感覚
  - 見やすさ最優先
  - 情報量は減らさない
========================================================= */

(function () {
  "use strict";

  /* ===============================
    バージョン
  =============================== */

  const RENDER_VERSION = "render-v2.0.0";

  /* ===============================
    艇カラー
  =============================== */

  const BOAT_COLORS = {
    1: {
      name: "白",
      short: "白",
      bg: "#ffffff",
      text: "#111111",
      border: "#cfcfcf",
      soft: "#f7f7f7"
    },
    2: {
      name: "黒",
      short: "黒",
      bg: "#111111",
      text: "#ffffff",
      border: "#111111",
      soft: "#eeeeee"
    },
    3: {
      name: "赤",
      short: "赤",
      bg: "#e53935",
      text: "#ffffff",
      border: "#e53935",
      soft: "#fff0f0"
    },
    4: {
      name: "青",
      short: "青",
      bg: "#1e88e5",
      text: "#ffffff",
      border: "#1e88e5",
      soft: "#eef6ff"
    },
    5: {
      name: "黄",
      short: "黄",
      bg: "#fdd835",
      text: "#111111",
      border: "#fbc02d",
      soft: "#fffbe6"
    },
    6: {
      name: "緑",
      short: "緑",
      bg: "#43a047",
      text: "#ffffff",
      border: "#43a047",
      soft: "#eefaf1"
    }
  };

  const MARK_LABELS = {
    honmei: "◎ 本命",
    taikou: "○ 対抗",
    ana: "▲ 穴",
    osa: "△ 押さえ",
    osaee: "△ 押さえ",
    manshu: "💣 万舟",
    nokoshi: "残し",
    hiroi: "拾い"
  };

  /* ===============================
    DOM取得
  =============================== */

  function $(id) {
    return document.getElementById(id);
  }

  function getRoot() {
    return (
      $("resultArea") ||
      $("predictionArea") ||
      $("mainArea") ||
      $("app") ||
      document.body
    );
  }

  /* ===============================
    安全処理
  =============================== */

  function safeText(value, fallback = "-") {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }
    return String(value);
  }

  function safeNum(value, fallback = 0) {
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

  function percent(value) {
    if (value === null || value === undefined || value === "") return "-";
    const n = Number(value);
    if (!Number.isFinite(n)) return safeText(value);
    return `${Math.round(n)}%`;
  }

  function fixed(value, digit = 1) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return n.toFixed(digit);
  }

  function signed(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    if (n > 0) return `+${n}`;
    return String(n);
  }

  function arrayify(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return [value];
  }

  /* ===============================
    艇番表示
  =============================== */

  function boatColor(no) {
    return BOAT_COLORS[Number(no)] || BOAT_COLORS[1];
  }

  function boatBadge(no, extraClass = "") {
    const c = boatColor(no);
    const n = safeText(no);

    return `
      <span class="boat-badge boat-${escapeHtml(n)} ${extraClass}"
        style="
          background:${c.bg};
          color:${c.text};
          border:1px solid ${c.border};
        ">
        ${escapeHtml(n)}
      </span>
    `;
  }

  function boatName(no, name) {
    const c = boatColor(no);

    return `
      <span class="boat-name" style="color:${c.border};">
        ${boatBadge(no)}
        <span>${escapeHtml(name || `${no}号艇`)}</span>
      </span>
    `;
  }

  function boatLine(no, name, subText = "") {
    return `
      <div class="boat-line">
        ${boatName(no, name)}
        ${
          subText
            ? `<span class="boat-line-sub">${escapeHtml(subText)}</span>`
            : ""
        }
      </div>
    `;
  }

  /* ===============================
    共通レイアウト
  =============================== */

  function section(title, body, options = {}) {
    const icon = options.icon || "";
    const className = options.className || "";
    const note = options.note || "";

    return `
      <section class="render-section ${className}">
        <div class="section-head">
          <h2>${icon ? `${icon} ` : ""}${escapeHtml(title)}</h2>
          ${note ? `<p>${escapeHtml(note)}</p>` : ""}
        </div>
        <div class="section-body">
          ${body || emptyBox("表示データがありません")}
        </div>
      </section>
    `;
  }

  function divider(label = "") {
    return `
      <div class="render-divider">
        ${label ? `<span>${escapeHtml(label)}</span>` : ""}
      </div>
    `;
  }

  function miniCard(label, value, sub = "") {
    return `
      <div class="mini-card">
        <div class="mini-card-label">${escapeHtml(label)}</div>
        <div class="mini-card-value">${escapeHtml(value)}</div>
        ${sub ? `<div class="mini-card-sub">${escapeHtml(sub)}</div>` : ""}
      </div>
    `;
  }

  function emptyBox(text = "データがありません") {
    return `
      <div class="empty-box">
        ${escapeHtml(text)}
      </div>
    `;
  }

  function tag(text, type = "normal") {
    return `
      <span class="info-tag tag-${escapeHtml(type)}">
        ${escapeHtml(text)}
      </span>
    `;
  }

  function scorePill(score, label = "指数") {
    const n = safeNum(score, null);
    const value = n === null ? "-" : Math.round(n);

    return `
      <div class="score-pill">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function strengthBar(value, max = 100) {
    const n = Math.max(0, Math.min(max, safeNum(value, 0)));
    const rate = max > 0 ? Math.round((n / max) * 100) : 0;

    return `
      <div class="strength-bar">
        <div class="strength-bar-fill" style="width:${rate}%"></div>
      </div>
    `;
  }
    /* ===============================
    メイン描画
  =============================== */

  function renderAll(prediction) {
    const root = getRoot();

    if (!prediction || typeof prediction !== "object") {
      root.innerHTML = renderError(
        "予想データがありません",
        "prediction.js から有効な prediction オブジェクトが返っていません。"
      );
      return;
    }

    const html = `
      <div class="render-root" data-render-version="${escapeHtml(RENDER_VERSION)}">

        ${renderRaceInfo(prediction)}

        ${divider()}

        ${renderEntryTable(prediction)}

        ${divider()}

        ${renderAiSummary(prediction)}

        ${divider()}

        ${renderMainSheet(prediction)}

        ${divider()}

        ${renderMainFormation(prediction)}

        ${divider()}

        ${renderManshuSheet(prediction)}

        ${divider()}

        ${renderManshuFormation(prediction)}

        ${divider()}

        ${renderTicketRanking(prediction)}

        ${divider()}

        ${renderFinalComment(prediction)}

      </div>
    `;

    root.innerHTML = html;
  }

  function renderError(title, message) {
    return `
      <div class="render-root">
        <section class="render-section error-section">
          <div class="section-head">
            <h2>⚠️ ${escapeHtml(title)}</h2>
          </div>
          <div class="section-body">
            <p>${escapeHtml(message)}</p>
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

    const title =
      race.title ||
      race.raceName ||
      `${safeText(race.place || venue.name || venue.venueName, "開催場")} ${safeText(
        race.raceNo || race.rno,
        "-"
      )}R`;

    const cards = `
      <div class="race-info-grid">
        ${miniCard("場", race.place || venue.name || venue.venueName || "-")}
        ${miniCard("R", race.raceNo || race.rno || "-", race.distance ? `${race.distance}m` : "")}
        ${miniCard("締切", race.deadline || race.closeTime || "-")}
        ${miniCard("条件", race.grade || race.className || race.condition || "-")}
        ${miniCard("風", weather.wind || weather.windText || "-", weather.windSpeed ? `${weather.windSpeed}m` : "")}
        ${miniCard("波", weather.wave || weather.waveHeight || "-", weather.water || "")}
        ${miniCard("天候", weather.weather || weather.condition || "-")}
        ${miniCard("展示", exhibition.status || exhibition.comment || "-", exhibition.updatedAt || "")}
      </div>
    `;

    const note = [
      race.date ? `日付：${race.date}` : "",
      venue.feature ? `場特徴：${venue.feature}` : "",
      weather.comment ? `水面：${weather.comment}` : ""
    ]
      .filter(Boolean)
      .join(" / ");

    return section("レース情報", cards, {
      icon: "🚤",
      note,
      className: "race-info-section"
    });
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
      return section("出走表", emptyBox("出走表データがありません"), {
        icon: "👥",
        className: "entry-section"
      });
    }

    const rows = entries
      .map((e, index) => {
        const no = e.no || e.boatNo || e.waku || e.course || index + 1;
        const name = e.name || e.racerName || e.player || "-";
        const grade = e.grade || e.class || e.rank || "-";
        const st = e.st || e.avgSt || e.averageST || "-";
        const motor = e.motorNo || e.motor || e.motorNumber || "-";
        const boat = e.boatNo2 || e.boat || e.boatNumber || "-";
        const local = e.localRate || e.venueRate || e.courseRate || "-";

        return `
          <tr>
            <td class="td-boat">${boatBadge(no)}</td>
            <td class="td-name">
              <strong style="color:${boatColor(no).border};">${escapeHtml(name)}</strong>
              <span>${escapeHtml(grade)}</span>
            </td>
            <td>${escapeHtml(st)}</td>
            <td>${escapeHtml(motor)}</td>
            <td>${escapeHtml(boat)}</td>
            <td>${escapeHtml(local)}</td>
          </tr>
        `;
      })
      .join("");

    const body = `
      <div class="table-scroll">
        <table class="entry-table">
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>ST</th>
              <th>モ</th>
              <th>ボ</th>
              <th>当地</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    return section("出走表", body, {
      icon: "👥",
      className: "entry-section"
    });
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
      "-";

    const manshuScore =
      manshuPower.score ??
      manshuPower.value ??
      manshuPower.percent ??
      prediction.manshuScore ??
      "-";

    const aiText =
      finalAi.summary ||
      finalAi.comment ||
      finalAi.text ||
      prediction.aiComment ||
      "AIまとめデータがありません";

    const cards = `
      <div class="ai-summary-grid">
        <div class="ai-score-card">
          <div class="ai-score-label">信頼度</div>
          <div class="ai-score-value">${escapeHtml(percent(confidenceScore))}</div>
          ${strengthBar(confidenceScore)}
          <p>${escapeHtml(confidence.reason || confidence.comment || "")}</p>
        </div>

        <div class="ai-score-card pink">
          <div class="ai-score-label">万舟期待度</div>
          <div class="ai-score-value">${escapeHtml(percent(manshuScore))}</div>
          ${strengthBar(manshuScore)}
          <p>${escapeHtml(manshuPower.reason || manshuPower.comment || "")}</p>
        </div>
      </div>

      <div class="ai-comment-box">
        <h3>AIまとめ</h3>
        <p>${escapeHtml(aiText)}</p>
      </div>

      ${renderIndexSummary(indexes)}
    `;

    return section("AI総合", cards, {
      icon: "📊",
      className: "ai-summary-section"
    });
  }

  function renderIndexSummary(indexes) {
    if (!indexes || typeof indexes !== "object") {
      return "";
    }

    const items = Object.entries(indexes)
      .filter(([, value]) => value !== null && value !== undefined)
      .slice(0, 12)
      .map(([key, value]) => {
        const label = normalizeIndexLabel(key);
        const text =
          typeof value === "object"
            ? value.score ?? value.value ?? value.comment ?? "-"
            : value;

        return miniCard(label, text);
      })
      .join("");

    if (!items) return "";

    return `
      <div class="index-summary">
        <h3>指数サマリー</h3>
        <div class="mini-card-grid">
          ${items}
        </div>
      </div>
    `;
  }

  function normalizeIndexLabel(key) {
    const map = {
      attack: "攻め指数",
      flow: "展開指数",
      road: "道中指数",
      local: "当地指数",
      start: "ST指数",
      exhibition: "展示指数",
      motor: "モーター",
      weather: "水面",
      venue: "場傾向",
      stability: "安定",
      power: "機力",
      odds: "オッズ"
    };

    return map[key] || key;
  }

  /* ===============================
    4. 本命シート
  =============================== */

  function renderMainSheet(prediction) {
    const sheet = prediction.mainSheet || {};

    const honmei = sheet.honmei || sheet.main || sheet◎ || sheet.top;
    const taikou = sheet.taikou || sheet.rival || sheet○ || sheet.second;
    const ana = sheet.ana || sheet.hole || sheet▲ || sheet.third;
    const osa =
      sheet.osa ||
      sheet.osae ||
      sheet.support ||
      sheet.delta ||
      sheet["△"];

    const items = [
      normalizeSheetItem(honmei, "honmei"),
      normalizeSheetItem(taikou, "taikou"),
      normalizeSheetItem(ana, "ana"),
      normalizeSheetItem(osa, "osa")
    ].filter(Boolean);

    if (items.length === 0 && Array.isArray(sheet.items)) {
      sheet.items.forEach((item, index) => {
        const roles = ["honmei", "taikou", "ana", "osa"];
        items.push(normalizeSheetItem(item, item.role || roles[index] || "osa"));
      });
    }

    if (items.length === 0) {
      return section("本命シート", emptyBox("本命シートデータがありません"), {
        icon: "🔵",
        className: "main-sheet-section"
      });
    }

    const body = `
      <div class="sheet-card-list main-sheet-list">
        ${items.map(renderMainSheetCard).join("")}
      </div>
    `;

    return section("本命シート", body, {
      icon: "🔵",
      className: "main-sheet-section"
    });
  }

  function normalizeSheetItem(item, role = "osa") {
    if (!item) return null;

    if (typeof item === "number" || typeof item === "string") {
      return {
        role,
        no: item,
        name: `${item}号艇`,
        score: "-",
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

    return {
      role: item.role || role,
      no,
      name: item.name || item.racerName || item.player || `${safeText(no)}号艇`,
      score: item.score ?? item.index ?? item.point ?? item.value ?? "-",
      buffs: arrayify(item.buffs || item.buff || item.plus || item.positive),
      debuffs: arrayify(item.debuffs || item.debuff || item.minus || item.negative),
      comment: item.comment || item.reason || item.text || item.shortComment || "",
      tags: arrayify(item.tags || item.labels),
      sub: item.sub || item.type || item.tactic || ""
    };
  }

  function renderMainSheetCard(item) {
    const roleLabel = MARK_LABELS[item.role] || item.role || "評価";
    const no = item.no;
    const c = boatColor(no);

    return `
      <article class="sheet-card main-card" style="border-left-color:${c.border};">
        <div class="sheet-card-head">
          <div>
            <div class="role-label">${escapeHtml(roleLabel)}</div>
            ${boatLine(no, item.name, item.sub)}
          </div>
          ${scorePill(item.score, "AI指数")}
        </div>

        ${renderBuffDebuff(item.buffs, item.debuffs)}

        ${
          item.tags && item.tags.length
            ? `<div class="tag-row">${item.tags.map((t) => tag(t)).join("")}</div>`
            : ""
        }

        ${
          item.comment
            ? `<p class="sheet-comment">${escapeHtml(item.comment)}</p>`
            : ""
        }
      </article>
    `;
  }

  function renderBuffDebuff(buffs, debuffs) {
    const plus = arrayify(buffs);
    const minus = arrayify(debuffs);

    if (plus.length === 0 && minus.length === 0) {
      return `
        <div class="buff-debuff empty">
          <span>⬆️ プラス要因：-</span>
          <span>⬇️ マイナス要因：-</span>
        </div>
      `;
    }

    return `
      <div class="buff-debuff">
        <div class="buff-list">
          <strong>⬆️ プラス要因</strong>
          ${
            plus.length
              ? plus.map((b) => `<span>${escapeHtml(formatFactor(b))}</span>`).join("")
              : "<span>-</span>"
          }
        </div>

        <div class="debuff-list">
          <strong>⬇️ マイナス要因</strong>
          ${
            minus.length
              ? minus.map((d) => `<span>${escapeHtml(formatFactor(d))}</span>`).join("")
              : "<span>-</span>"
          }
        </div>
      </div>
    `;
  }

  function formatFactor(value) {
    if (!value) return "-";

    if (typeof value === "string" || typeof value === "number") {
      return value;
    }

    const label = value.label || value.name || value.text || value.reason || "-";
    const point =
      value.point !== undefined
        ? ` ${signed(value.point)}`
        : value.score !== undefined
          ? ` ${signed(value.score)}`
          : "";

    return `${label}${point}`;
  }
    /* ===============================
    5. 本線フォーメーション
  =============================== */

  function renderMainFormation(prediction) {
    const formation = prediction.formation || {};
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

    const body = `
      <div class="formation-block">
        <h3>本線</h3>
        ${renderFormationList(main, "main")}
      </div>

      <div class="formation-block">
        <h3>安全押さえ</h3>
        ${renderFormationList(safety, "safety")}
      </div>

      ${renderFormationComment(formation)}
    `;

    return section("本線フォーメーション", body, {
      icon: "🎫",
      className: "formation-section main-formation-section"
    });
  }

  function renderFormationList(list, type = "main") {
    const items = normalizeFormationList(list);

    if (items.length === 0) {
      return emptyBox("フォーメーションデータがありません");
    }

    return `
      <div class="formation-list formation-${escapeHtml(type)}">
        ${items.map((item) => renderFormationItem(item, type)).join("")}
      </div>
    `;
  }

  function normalizeFormationList(list) {
    if (!list) return [];

    if (typeof list === "string") {
      return [{ ticket: list }];
    }

    if (Array.isArray(list)) {
      return list.map((item) => {
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
          reason: item.reason || item.comment || item.text || "",
          odds: item.odds || item.syntheticOdds || item.gouseiOdds || "",
          score: item.score ?? item.value ?? item.point ?? ""
        };
      });
    }

    if (typeof list === "object") {
      return Object.entries(list).map(([label, value]) => {
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
          reason: value.reason || value.comment || value.text || "",
          odds: value.odds || value.syntheticOdds || value.gouseiOdds || "",
          score: value.score ?? value.value ?? value.point ?? ""
        };
      });
    }

    return [];
  }

  function renderFormationItem(item, type) {
    const ticket = item.ticket || "-";

    return `
      <article class="formation-item ${escapeHtml(type)}">
        <div class="formation-ticket">
          ${renderTicketText(ticket)}
        </div>

        <div class="formation-meta">
          ${item.label ? tag(item.label, type) : ""}
          ${item.score !== "" ? tag(`評価 ${item.score}`, "score") : ""}
          ${item.odds ? tag(`合成 ${item.odds}`, "odds") : ""}
        </div>

        ${
          item.reason
            ? `<p class="formation-reason">${escapeHtml(item.reason)}</p>`
            : ""
        }
      </article>
    `;
  }

  function renderTicketText(ticket) {
    const text = safeText(ticket);

    const html = text.replace(/[1-6]/g, (num) => {
      return boatBadge(num, "mini");
    });

    return `<span class="ticket-text">${html}</span>`;
  }

  function renderFormationComment(formation) {
    const comment =
      formation.comment ||
      formation.reason ||
      formation.text ||
      formation.mainComment ||
      "";

    if (!comment) return "";

    return `
      <div class="formation-comment">
        ${escapeHtml(comment)}
      </div>
    `;
  }

  /* ===============================
    6. 万舟シート
  =============================== */

  function renderManshuSheet(prediction) {
    const sheet = prediction.manshuSheet || {};

    const candidates =
      sheet.candidates ||
      sheet.items ||
      sheet.manshu ||
      sheet.longshot ||
      [];

    const nokoshi =
      sheet.nokoshi ||
      sheet.remain ||
      sheet.keep ||
      sheet.nokoshiCandidates ||
      [];

    const hiroi =
      sheet.hiroi ||
      sheet.pickup ||
      sheet.pick ||
      sheet.hiroiCandidates ||
      [];

    const body = `
      <div class="manshu-block">
        <h3>万舟候補</h3>
        ${renderManshuList(candidates, "manshu")}
      </div>

      <div class="manshu-block">
        <h3>残し候補</h3>
        ${renderManshuList(nokoshi, "nokoshi")}
      </div>

      <div class="manshu-block">
        <h3>拾い候補</h3>
        ${renderManshuList(hiroi, "hiroi")}
      </div>

      ${renderManshuComment(sheet)}
    `;

    return section("万舟シート", body, {
      icon: "🌸",
      className: "manshu-sheet-section"
    });
  }

  function renderManshuList(list, role = "manshu") {
    const items = arrayify(list)
      .map((item) => normalizeSheetItem(item, role))
      .filter(Boolean);

    if (items.length === 0) {
      return emptyBox("候補データがありません");
    }

    return `
      <div class="sheet-card-list manshu-card-list">
        ${items.map((item) => renderManshuCard(item, role)).join("")}
      </div>
    `;
  }

  function renderManshuCard(item, role) {
    const roleLabel = MARK_LABELS[item.role] || MARK_LABELS[role] || "候補";
    const no = item.no;
    const c = boatColor(no);

    return `
      <article class="sheet-card manshu-card" style="border-left-color:${c.border};">
        <div class="sheet-card-head">
          <div>
            <div class="role-label pink-label">${escapeHtml(roleLabel)}</div>
            ${boatLine(no, item.name, item.sub)}
          </div>
          ${scorePill(item.score, "期待")}
        </div>

        ${renderBuffDebuff(item.buffs, item.debuffs)}

        ${
          item.comment
            ? `<p class="sheet-comment">${escapeHtml(item.comment)}</p>`
            : ""
        }
      </article>
    `;
  }

  function renderManshuComment(sheet) {
    const comment =
      sheet.comment ||
      sheet.reason ||
      sheet.text ||
      sheet.summary ||
      "";

    if (!comment) return "";

    return `
      <div class="manshu-comment">
        ${escapeHtml(comment)}
      </div>
    `;
  }
    /* ===============================
    7. 万舟フォーメーション
  =============================== */

  function renderManshuFormation(prediction) {
    const formation = prediction.formation || {};

    const manshu =
      formation.manshu ||
      formation.longshot ||
      formation.highPay ||
      prediction.manshuFormation ||
      [];

    const body = `
      <div class="formation-block">
        <h3>万舟フォーメーション</h3>
        ${renderFormationList(manshu, "manshu")}
      </div>

      ${
        formation.manshuComment
          ? `
            <div class="formation-comment">
              ${escapeHtml(formation.manshuComment)}
            </div>
          `
          : ""
      }
    `;

    return section("万舟フォーメーション", body, {
      icon: "💣",
      className: "manshu-formation-section"
    });
  }

  /* ===============================
    8. AI買い目ランキング
  =============================== */

  function renderTicketRanking(prediction) {
    const ranks =
      prediction.ticketRanks ||
      prediction.ticketRank ||
      prediction.ranking ||
      [];

    const list = arrayify(ranks);

    if (list.length === 0) {
      return section(
        "AI買い目ランキング",
        emptyBox("ランキングデータがありません"),
        {
          icon: "🏆",
          className: "ticket-ranking-section"
        }
      );
    }

    const body = `
      <div class="ticket-ranking-list">
        ${list.map(renderTicketRankCard).join("")}
      </div>
    `;

    return section("AI買い目ランキング", body, {
      icon: "🏆",
      className: "ticket-ranking-section"
    });
  }

  function renderTicketRankCard(item, index) {

    if (typeof item === "string") {
      item = {
        ticket: item
      };
    }

    const rank =
      item.rank ||
      item.order ||
      index + 1;

    const ticket =
      item.ticket ||
      item.bet ||
      item.line ||
      item.formation ||
      "-";

    const score =
      item.score ??
      item.value ??
      item.point ??
      "";

    const odds =
      item.odds ||
      item.syntheticOdds ||
      item.gouseiOdds ||
      "";

    const hit =
      item.hitRate ||
      item.probability ||
      item.rate ||
      "";

    const reason =
      item.reason ||
      item.comment ||
      item.text ||
      "";

    return `
      <article class="ticket-rank-card">

        <div class="ticket-rank-head">

          <div class="ticket-rank-no">
            ${escapeHtml(rank)}
          </div>

          <div class="ticket-rank-main">
            <div class="ticket-rank-ticket">
              ${renderTicketText(ticket)}
            </div>

            <div class="ticket-rank-tags">

              ${
                score !== ""
                  ? tag(`AI ${score}`, "score")
                  : ""
              }

              ${
                odds
                  ? tag(`合成 ${odds}`, "odds")
                  : ""
              }

              ${
                hit
                  ? tag(`的中 ${percent(hit)}`, "hit")
                  : ""
              }

            </div>

          </div>

        </div>

        ${
          reason
            ? `
              <div class="ticket-rank-comment">
                ${escapeHtml(reason)}
              </div>
            `
            : ""
        }

      </article>
    `;
  }

  /* ===============================
    共通ランキング補助
  =============================== */

  function sortByScore(list) {

    return arrayify(list).sort((a, b) => {

      const sa = Number(a.score ?? a.value ?? 0);
      const sb = Number(b.score ?? b.value ?? 0);

      return sb - sa;

    });

  }

  function topItems(list, limit = 5) {

    return sortByScore(list).slice(0, limit);

  }
    /* ===============================
    9. 最終コメント
  =============================== */

  function renderFinalComment(prediction) {
    const finalComment =
      prediction.finalComment ||
      prediction.comment ||
      prediction.finalText ||
      "";

    const finalAi = prediction.finalAi || {};
    const raceFlow = prediction.raceFlow || {};

    const summary =
      finalAi.final ||
      finalAi.summary ||
      finalAi.comment ||
      "";

    const flowComment =
      raceFlow.comment ||
      raceFlow.summary ||
      raceFlow.text ||
      "";

    const body = `
      ${
        finalComment
          ? `
            <div class="final-comment-main">
              ${escapeHtml(finalComment)}
            </div>
          `
          : ""
      }

      ${
        summary
          ? `
            <div class="final-comment-sub">
              <h3>AI最終判断</h3>
              <p>${escapeHtml(summary)}</p>
            </div>
          `
          : ""
      }

      ${
        flowComment
          ? `
            <div class="final-comment-sub">
              <h3>展開メモ</h3>
              <p>${escapeHtml(flowComment)}</p>
            </div>
          `
          : ""
      }

      ${
        !finalComment && !summary && !flowComment
          ? emptyBox("最終コメントデータがありません")
          : ""
      }
    `;

    return section("最終コメント", body, {
      icon: "📝",
      className: "final-comment-section"
    });
  }

  /* ===============================
    追加：展開データ補助表示
  =============================== */

  function renderRaceFlowMini(raceFlow) {
    if (!raceFlow || typeof raceFlow !== "object") return "";

    const attack = raceFlow.attack || raceFlow.attacker || raceFlow.seme;
    const key = raceFlow.key || raceFlow.keyBoat || raceFlow.focus;
    const flow = raceFlow.flow || raceFlow.pattern || raceFlow.type;

    if (!attack && !key && !flow) return "";

    return `
      <div class="race-flow-mini">
        ${attack ? miniCard("攻め艇", attack) : ""}
        ${key ? miniCard("展開キー", key) : ""}
        ${flow ? miniCard("想定展開", flow) : ""}
      </div>
    `;
  }

  /* ===============================
    追加：デバッグ用
  =============================== */

  function renderDebug(prediction) {
    if (!window.CHAPPY_DEBUG_RENDER) return "";

    return `
      <section class="render-section debug-section">
        <div class="section-head">
          <h2>🧪 Debug</h2>
        </div>
        <div class="section-body">
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

  /* ===============================
    読み込み確認
  =============================== */

  console.info(
    `[Chappy BoatRace AI] render.js loaded: ${RENDER_VERSION}`
  );

})();
