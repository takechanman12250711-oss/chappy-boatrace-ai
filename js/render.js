/* =========================================================
  チャッピーボートレースAI
  render.js 完全版 Part 1/10

  役割：
  - 画面描画専用
  - HTMLのIDに完全対応
  - script.jsから呼び出す描画関数をwindowに公開

  対応HTML ID：
  - raceListArea
  - weatherArea
  - venueArea
========================================================= */

(function () {
  "use strict";

  /* ===============================
    艇カラー定義
  =============================== */

  const BOAT_COLORS = {
    1: {
      name: "白",
      bg: "#ffffff",
      text: "#111111",
      border: "#d8d8d8",
      shadow: "rgba(255,255,255,0.35)"
    },
    2: {
      name: "黒",
      bg: "#111111",
      text: "#ffffff",
      border: "#444444",
      shadow: "rgba(0,0,0,0.35)"
    },
    3: {
      name: "赤",
      bg: "#e53935",
      text: "#ffffff",
      border: "#ff6b6b",
      shadow: "rgba(229,57,53,0.35)"
    },
    4: {
      name: "青",
      bg: "#1e66f5",
      text: "#ffffff",
      border: "#6ea8ff",
      shadow: "rgba(30,102,245,0.35)"
    },
    5: {
      name: "黄",
      bg: "#ffd54a",
      text: "#111111",
      border: "#ffe58a",
      shadow: "rgba(255,213,74,0.35)"
    },
    6: {
      name: "緑",
      bg: "#16a34a",
      text: "#ffffff",
      border: "#4ade80",
      shadow: "rgba(22,163,74,0.35)"
    }
  };

  const DEFAULT_TEXT = "-";

  /* ===============================
    DOM共通
  =============================== */

  function $(id) {
    return document.getElementById(id);
  }

  function setHTML(id, html) {
    const el = $(id);
    if (!el) {
      console.warn(`[render.js] #${id} が見つかりません`);
      return;
    }
    el.innerHTML = html;
  }

  function clearHTML(id) {
    setHTML(id, "");
  }

  function safe(value, fallback = DEFAULT_TEXT) {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  }

  function num(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    const n = Number(value);
    if (Number.isNaN(n)) return safe(value, fallback);
    return String(n);
  }

  function pct(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    const str = String(value);
    if (str.includes("%")) return str;
    return `${str}%`;
  }

  function st(value, fallback = "-") {
    if (value === null || value === undefined || value === "") return fallback;
    const str = String(value).trim();
    if (str.startsWith(".")) return str;
    if (str.startsWith("0.")) return str.replace(/^0/, "");
    return str;
  }

  function escapeHTML(value) {
    return safe(value, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getBoatNo(entry, index) {
    return Number(
      entry?.boatNo ??
      entry?.course ??
      entry?.teiban ??
      entry?.waku ??
      entry?.枠 ??
      entry?.艇番 ??
      index + 1
    );
  }

  function getBoatStyle(boatNo) {
    const c = BOAT_COLORS[boatNo] || BOAT_COLORS[1];
    return `
      background:${c.bg};
      color:${c.text};
      border-color:${c.border};
      box-shadow:0 8px 22px ${c.shadow};
    `;
  }

  function boatBadge(boatNo) {
    const c = BOAT_COLORS[boatNo] || BOAT_COLORS[1];
    return `
      <span class="boat-badge" style="
        background:${c.bg};
        color:${c.text};
        border:1px solid ${c.border};
      ">
        ${boatNo}
      </span>
    `;
  }

  function panel(title, body, extraClass = "") {
    return `
      <div class="panel render-panel ${extraClass}">
        <h2>${title}</h2>
        ${body}
      </div>
    `;
  }

  function miniItem(label, value) {
    return `
      <div class="mini-item">
        <span class="mini-label">${escapeHTML(label)}</span>
        <strong class="mini-value">${escapeHTML(safe(value))}</strong>
      </div>
    `;
  }

  function statRow(label, value) {
    return `
      <div class="stat-row">
        <span>${escapeHTML(label)}</span>
        <strong>${escapeHTML(safe(value))}</strong>
      </div>
    `;
  }

  function emptyBox(message) {
    return `
      <div class="empty-box">
        ${escapeHTML(message)}
      </div>
    `;
  }

  function normalizeEntries(data) {
    if (Array.isArray(data)) return data;

    return (
      data?.entries ||
      data?.entry ||
      data?.racers ||
      data?.boats ||
      data?.race?.entries ||
      []
    );
  }

  function normalizeWeather(data) {
    return (
      data?.weather ||
      data?.beforeInfo?.weather ||
      data?.raceInfo?.weather ||
      data?.condition ||
      {}
    );
  }

  function normalizeVenue(data) {
    return (
      data?.venue ||
      data?.stadium ||
      data?.raceInfo ||
      {}
    );
  }

  function getPlayerName(entry) {
    return (
      entry?.name ||
      entry?.playerName ||
      entry?.racerName ||
      entry?.選手名 ||
      "-"
    );
  }

  function getEntryValue(entry, keys, fallback = "-") {
    for (const key of keys) {
      if (entry?.[key] !== undefined && entry?.[key] !== null && entry?.[key] !== "") {
        return entry[key];
      }
    }
    return fallback;
  }

  /* ===============================
    レース基本情報
  =============================== */

  function renderRaceInfo(data) {
    const raceInfo = data?.raceInfo || data || {};
    const venue = normalizeVenue(data);

    const stadiumName =
      data?.stadiumName ||
      raceInfo?.stadiumName ||
      raceInfo?.place ||
      venue?.stadiumName ||
      venue?.name ||
      "-";

    const raceNo =
      data?.raceNo ||
      raceInfo?.raceNo ||
      raceInfo?.rno ||
      "-";

    const date =
      data?.date ||
      raceInfo?.date ||
      "-";

    const title =
      raceInfo?.title ||
      raceInfo?.raceTitle ||
      raceInfo?.grade ||
      "レース情報";

    const body = `
      <div class="race-info-card">
        <div class="race-info-main">
          <div class="race-place">${escapeHTML(stadiumName)}</div>
          <div class="race-number">${escapeHTML(raceNo)}R</div>
        </div>

        <div class="race-info-sub">
          ${miniItem("日付", date)}
          ${miniItem("タイトル", title)}
        </div>
      </div>
    `;

    return panel("🚤 レース基本情報", body, "race-info-panel");
  }

  /* ===============================
    気象
  =============================== */

  function renderWeather(data) {
    const weather = normalizeWeather(data);

    const temperature =
      weather?.temperature ??
      weather?.temp ??
      weather?.気温 ??
      "-";

    const waterTemperature =
      weather?.waterTemperature ??
      weather?.waterTemp ??
      weather?.水温 ??
      "-";

    const wave =
      weather?.wave ??
      weather?.waveHeight ??
      weather?.波高 ??
      "-";

    const windSpeed =
      weather?.windSpeed ??
      weather?.wind ??
      weather?.風速 ??
      "-";

    const windDirection =
      weather?.windDirection ??
      weather?.windDir ??
      weather?.風向 ??
      "-";

    const weatherText =
      weather?.weather ??
      weather?.condition ??
      weather?.天候 ??
      "-";

    const body = `
      <div class="weather-grid">
        ${miniItem("天候", weatherText)}
        ${miniItem("気温", temperature)}
        ${miniItem("水温", waterTemperature)}
        ${miniItem("波高", wave)}
        ${miniItem("風速", windSpeed)}
        ${miniItem("風向", windDirection)}
      </div>
    `;

    setHTML("weatherArea", body);
  }

  /* ===============================
    場情報
  =============================== */

  function renderVenue(data) {
    const venue = normalizeVenue(data);

    const stadiumName =
      data?.stadiumName ||
      venue?.stadiumName ||
      venue?.name ||
      venue?.place ||
      "-";

    const stadiumCode =
      data?.stadiumCode ||
      venue?.stadiumCode ||
      venue?.jcd ||
      "-";

    const raceNo =
      data?.raceNo ||
      venue?.raceNo ||
      venue?.rno ||
      "-";

    const date =
      data?.date ||
      venue?.date ||
      "-";

    const venueMemo = createVenueMemo(stadiumName);

    const body = `
      <div class="venue-card">
        <div class="venue-head">
          <strong>${escapeHTML(stadiumName)}</strong>
          <span>場コード：${escapeHTML(stadiumCode)}</span>
        </div>

        <div class="venue-grid">
          ${miniItem("レース", `${raceNo}R`)}
          ${miniItem("日付", date)}
          ${miniItem("水面メモ", venueMemo)}
        </div>
      </div>
    `;

    setHTML("venueArea", body);
  }

  function createVenueMemo(stadiumName) {
    const name = String(stadiumName || "");

    if (name.includes("大村")) {
      return "イン有利。ただし新エンジン期は展示・今節ST・技量重視。2コース差しも評価。";
    }

    if (name.includes("若松")) {
      return "ナイター水面。道中力・当地巧者の拾いに注意。";
    }

    if (name.includes("宮島")) {
      return "潮汐影響あり。満潮・干潮・風向きで展開変化。";
    }

    if (name.includes("江戸川")) {
      return "全国屈指の難水面。波・風・乗り心地を重視。";
    }

    if (name.includes("福岡")) {
      return "河口水面。2マーク波乱と風向きに注意。";
    }

    if (name.includes("戸田")) {
      return "狭水面。センター攻めと外の展開突きに注意。";
    }

    if (name.includes("平和島")) {
      return "イン絶対ではない。センター・ダッシュ勢の攻め注意。";
    }

    return "場の基本傾向・風・波・展示を合わせて判断。";
  }

  /* ===============================
    出走表カード
  =============================== */

  function renderEntryTable(data) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML(
        "raceListArea",
        panel("🚤 出走表", emptyBox("出走表データがありません"), "entry-panel")
      );
      return;
    }

    const cards = entries.map((entry, index) => renderEntryCard(entry, index)).join("");

    const body = `
      <div class="entry-card-grid">
        ${cards}
      </div>
    `;

    setHTML("raceListArea", panel("🚤 出走表", body, "entry-panel"));
  }

  function renderEntryCard(entry, index) {
    const boatNo = getBoatNo(entry, index);
    const name = getPlayerName(entry);

    const registerNo = getEntryValue(entry, [
      "registerNo",
      "registrationNo",
      "racerNo",
      "登録番号"
    ]);

    const className = getEntryValue(entry, [
      "class",
      "className",
      "grade",
      "級別"
    ]);

    const branch = getEntryValue(entry, [
      "branch",
      "支部"
    ]);

    const hometown = getEntryValue(entry, [
      "hometown",
      "birthplace",
      "出身"
    ]);

    const age = getEntryValue(entry, [
      "age",
      "年齢"
    ]);

    const weight = getEntryValue(entry, [
      "weight",
      "体重"
    ]);

    const fl = getEntryValue(entry, [
      "fl",
      "F/L",
      "flyingLate",
      "事故率"
    ]);

    const avgST = getEntryValue(entry, [
      "avgST",
      "averageST",
      "st",
      "平均ST"
    ]);

    const national = entry?.national || entry?.全国成績 || {};
    const local = entry?.local || entry?.当地成績 || {};
    const motor = entry?.motor || entry?.モーター || {};
    const boat = entry?.boat || entry?.ボート || {};
    const current = entry?.currentSeries || entry?.今節成績 || entry?.series || {};

    return `
      <article class="entry-card boat-${boatNo}">
        <div class="entry-card-top" style="${getBoatStyle(boatNo)}">
          <div class="entry-boat-no">${boatNo}</div>
          <div class="entry-player">
            <h3>${escapeHTML(name)}</h3>
            <p>
              ${escapeHTML(className)}
              / 登番 ${escapeHTML(registerNo)}
            </p>
          </div>
        </div>

        <div class="entry-profile">
          ${miniItem("支部", branch)}
          ${miniItem("出身", hometown)}
          ${miniItem("年齢", age)}
          ${miniItem("体重", weight)}
          ${miniItem("F/L", fl)}
          ${miniItem("平均ST", st(avgST))}
        </div>

        <div class="entry-stats-block">
          <h4>全国成績</h4>
          ${statRow("勝率", getEntryValue(national, ["winRate", "rate", "勝率"]))}
          ${statRow("2連率", pct(getEntryValue(national, ["secondRate", "quinellaRate", "2連率"])))}
          ${statRow("3連率", pct(getEntryValue(national, ["thirdRate", "trioRate", "3連率"])))}
        </div>

        <div class="entry-stats-block">
          <h4>当地成績</h4>
          ${statRow("勝率", getEntryValue(local, ["winRate", "rate", "勝率"]))}
          ${statRow("2連率", pct(getEntryValue(local, ["secondRate", "quinellaRate", "2連率"])))}
          ${statRow("3連率", pct(getEntryValue(local, ["thirdRate", "trioRate", "3連率"])))}
        </div>

        <div class="entry-stats-block machine-block">
          <h4>モーター / ボート</h4>
          ${statRow(
            "M",
            `${safe(getEntryValue(motor, ["no", "number", "番号"]))} / 2連 ${pct(getEntryValue(motor, ["secondRate", "2連率"]))}`
          )}
          ${statRow(
            "B",
            `${safe(getEntryValue(boat, ["no", "number", "番号"]))} / 2連 ${pct(getEntryValue(boat, ["secondRate", "2連率"]))}`
          )}
        </div>

        <div class="entry-stats-block current-block">
          <h4>今節成績</h4>
          <div class="current-series-text">
            ${escapeHTML(formatCurrentSeries(current))}
          </div>
        </div>
      </article>
    `;
  }

  function formatCurrentSeries(current) {
    if (!current || Object.keys(current).length === 0) return "-";

    if (Array.isArray(current)) {
      return current.map(v => safe(v)).join(" / ");
    }

    if (typeof current === "string") {
      return current;
    }

    const parts = [];

    const results =
      current.results ||
      current.result ||
      current.着順 ||
      current.成績;

    const sts =
      current.st ||
      current.ST ||
      current.startTiming ||
      current.スタート;

    if (Array.isArray(results)) {
      parts.push(`着順：${results.join(" / ")}`);
    } else if (results) {
      parts.push(`着順：${results}`);
    }

    if (Array.isArray(sts)) {
      parts.push(`ST：${sts.map(st).join(" / ")}`);
    } else if (sts) {
      parts.push(`ST：${st(sts)}`);
    }

    if (!parts.length) {
      return Object.entries(current)
        .map(([key, value]) => `${key}:${safe(value)}`)
        .join(" / ");
    }

    return parts.join("　");
  }

  /* ===============================
    Part 1 export
  =============================== */

  window.ChappyRender = window.ChappyRender || {};

  window.ChappyRender.BOAT_COLORS = BOAT_COLORS;
  window.ChappyRender.$ = $;
  window.ChappyRender.setHTML = setHTML;
  window.ChappyRender.clearHTML = clearHTML;
  window.ChappyRender.safe = safe;
  window.ChappyRender.num = num;
  window.ChappyRender.pct = pct;
  window.ChappyRender.st = st;
  window.ChappyRender.escapeHTML = escapeHTML;
  window.ChappyRender.getBoatNo = getBoatNo;
  window.ChappyRender.getBoatStyle = getBoatStyle;
  window.ChappyRender.boatBadge = boatBadge;
  window.ChappyRender.panel = panel;
  window.ChappyRender.miniItem = miniItem;
  window.ChappyRender.statRow = statRow;
  window.ChappyRender.emptyBox = emptyBox;
  window.ChappyRender.normalizeEntries = normalizeEntries;
  window.ChappyRender.normalizeWeather = normalizeWeather;
  window.ChappyRender.normalizeVenue = normalizeVenue;
  window.ChappyRender.getPlayerName = getPlayerName;
  window.ChappyRender.getEntryValue = getEntryValue;

  window.renderRaceInfo = renderRaceInfo;
  window.renderWeather = renderWeather;
  window.renderVenue = renderVenue;
  window.renderEntryTable = renderEntryTable;
    /* =========================================================
    Part 2/10
    展示・モーター・ボート・今節成績
    対応HTML ID：
    - engineArea
  ========================================================= */

  function normalizeBeforeInfo(data) {
    return (
      data?.beforeInfo ||
      data?.before ||
      data?.直前情報 ||
      {}
    );
  }

  function normalizeExhibitionEntries(data) {
    const beforeInfo = normalizeBeforeInfo(data);

    return (
      beforeInfo?.entries ||
      beforeInfo?.exhibition ||
      beforeInfo?.exhibitionEntries ||
      beforeInfo?.直前情報 ||
      data?.exhibition ||
      []
    );
  }

  function getExhibitionByBoat(data, boatNo) {
    const list = normalizeExhibitionEntries(data);

    if (!Array.isArray(list)) return {};

    return (
      list.find((item, index) => {
        const no = Number(
          item?.boatNo ??
          item?.course ??
          item?.艇番 ??
          item?.枠 ??
          index + 1
        );

        return no === Number(boatNo);
      }) || {}
    );
  }

  function getMaterialValue(entry, exhibition, keys, fallback = "-") {
    for (const key of keys) {
      if (exhibition?.[key] !== undefined && exhibition?.[key] !== null && exhibition?.[key] !== "") {
        return exhibition[key];
      }

      if (entry?.[key] !== undefined && entry?.[key] !== null && entry?.[key] !== "") {
        return entry[key];
      }
    }

    return fallback;
  }

  function renderMaterialPanel(data) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML(
        "engineArea",
        panel("⚙️ 展示・機力情報", emptyBox("展示・機力データがありません"), "material-panel")
      );
      return;
    }

    const cards = entries
      .map((entry, index) => renderMaterialCard(data, entry, index))
      .join("");

    const body = `
      <div class="material-note">
        <strong>評価ルール：</strong>
        モーター数字だけで決めず、展示・今節ST・選手技量・当地適性を合わせて見る。
      </div>

      <div class="material-card-grid">
        ${cards}
      </div>
    `;

    setHTML("engineArea", panel("⚙️ 展示・機力情報", body, "material-panel"));
  }

  function renderMaterialCard(data, entry, index) {
    const boatNo = getBoatNo(entry, index);
    const exhibition = getExhibitionByBoat(data, boatNo);

    const name = getPlayerName(entry);

    const motor = entry?.motor || entry?.モーター || {};
    const boat = entry?.boat || entry?.ボート || {};
    const current = entry?.currentSeries || entry?.今節成績 || entry?.series || {};

    const exhibitionTime = getMaterialValue(entry, exhibition, [
      "exhibitionTime",
      "tenjiTime",
      "displayTime",
      "展示タイム"
    ]);

    const exhibitionST = getMaterialValue(entry, exhibition, [
      "exhibitionST",
      "tenjiST",
      "displayST",
      "展示ST",
      "ST"
    ]);

    const tilt = getMaterialValue(entry, exhibition, [
      "tilt",
      "チルト"
    ]);

    const partsExchange = getMaterialValue(entry, exhibition, [
      "partsExchange",
      "parts",
      "部品交換"
    ]);

    const weight = getMaterialValue(entry, exhibition, [
      "weight",
      "体重"
    ]);

    const motorNo = getEntryValue(motor, [
      "no",
      "number",
      "番号"
    ]);

    const motorSecondRate = getEntryValue(motor, [
      "secondRate",
      "quinellaRate",
      "2連率"
    ]);

    const motorThirdRate = getEntryValue(motor, [
      "thirdRate",
      "trioRate",
      "3連率"
    ]);

    const boatNoValue = getEntryValue(boat, [
      "no",
      "number",
      "番号"
    ]);

    const boatSecondRate = getEntryValue(boat, [
      "secondRate",
      "quinellaRate",
      "2連率"
    ]);

    const boatThirdRate = getEntryValue(boat, [
      "thirdRate",
      "trioRate",
      "3連率"
    ]);

    const materialJudge = judgeMaterial({
      exhibitionTime,
      exhibitionST,
      tilt,
      motorSecondRate,
      current
    });

    return `
      <article class="material-card boat-${boatNo}">
        <div class="material-card-head" style="${getBoatStyle(boatNo)}">
          <div>
            ${boatBadge(boatNo)}
            <strong>${escapeHTML(name)}</strong>
          </div>
          <span>${escapeHTML(materialJudge.label)}</span>
        </div>

        <div class="material-section">
          <h4>展示情報</h4>
          <div class="material-grid">
            ${miniItem("展示タイム", exhibitionTime)}
            ${miniItem("展示ST", st(exhibitionST))}
            ${miniItem("チルト", tilt)}
            ${miniItem("部品交換", partsExchange)}
            ${miniItem("体重", weight)}
          </div>
        </div>

        <div class="material-section">
          <h4>モーター</h4>
          <div class="material-grid">
            ${miniItem("番号", motorNo)}
            ${miniItem("2連率", pct(motorSecondRate))}
            ${miniItem("3連率", pct(motorThirdRate))}
          </div>
        </div>

        <div class="material-section">
          <h4>ボート</h4>
          <div class="material-grid">
            ${miniItem("番号", boatNoValue)}
            ${miniItem("2連率", pct(boatSecondRate))}
            ${miniItem("3連率", pct(boatThirdRate))}
          </div>
        </div>

        <div class="material-section">
          <h4>今節成績</h4>
          <div class="current-series-text">
            ${escapeHTML(formatCurrentSeries(current))}
          </div>
        </div>

        <div class="material-comment ${materialJudge.className}">
          ${escapeHTML(materialJudge.comment)}
        </div>
      </article>
    `;
  }

  function judgeMaterial(params) {
    let score = 50;
    const comments = [];

    const exhibitionTimeNumber = Number(params.exhibitionTime);
    const motorSecondRateNumber = parseFloat(String(params.motorSecondRate).replace("%", ""));
    const exhibitionSTString = String(params.exhibitionST ?? "").replace("F", "").trim();
    const exhibitionSTNumber = Number(exhibitionSTString);

    if (!Number.isNaN(exhibitionTimeNumber)) {
      if (exhibitionTimeNumber <= 6.75) {
        score += 12;
        comments.push("展示タイム優秀");
      } else if (exhibitionTimeNumber <= 6.85) {
        score += 6;
        comments.push("展示タイム良好");
      } else if (exhibitionTimeNumber >= 7.00) {
        score -= 8;
        comments.push("展示タイム重め");
      }
    }

    if (!Number.isNaN(exhibitionSTNumber)) {
      if (exhibitionSTNumber <= 0.10) {
        score += 10;
        comments.push("展示ST鋭い");
      } else if (exhibitionSTNumber <= 0.15) {
        score += 5;
        comments.push("展示ST安定");
      } else if (exhibitionSTNumber >= 0.25) {
        score -= 8;
        comments.push("展示ST遅め");
      }
    }

    if (!Number.isNaN(motorSecondRateNumber)) {
      if (motorSecondRateNumber >= 40) {
        score += 8;
        comments.push("モーター数字上位");
      } else if (motorSecondRateNumber <= 25) {
        score -= 6;
        comments.push("モーター数字低め");
      }
    }

    const tiltString = String(params.tilt ?? "");
    if (tiltString.includes("3")) {
      score += 6;
      comments.push("チルト一撃型");
    }

    if (score >= 70) {
      return {
        label: "気配◎",
        className: "good",
        comment: comments.length
          ? comments.join(" / ")
          : "展示・機力ともに上位評価。"
      };
    }

    if (score >= 58) {
      return {
        label: "気配○",
        className: "normal-good",
        comment: comments.length
          ? comments.join(" / ")
          : "悪くない気配。展開次第で上位。"
      };
    }

    if (score <= 42) {
      return {
        label: "気配△",
        className: "bad",
        comment: comments.length
          ? comments.join(" / ")
          : "数字面はやや物足りない。過信注意。"
      };
    }

    return {
      label: "気配標準",
      className: "normal",
      comment: comments.length
        ? comments.join(" / ")
        : "目立つ強調材料は少ないが、展開次第。"
    };
  }

  window.ChappyRender.normalizeBeforeInfo = normalizeBeforeInfo;
  window.ChappyRender.normalizeExhibitionEntries = normalizeExhibitionEntries;
  window.ChappyRender.getExhibitionByBoat = getExhibitionByBoat;
  window.ChappyRender.getMaterialValue = getMaterialValue;
  window.ChappyRender.judgeMaterial = judgeMaterial;

  window.renderMaterialPanel = renderMaterialPanel;
    /* =========================================================
    Part 3/10
    AI展開カード
    対応HTML ID：
    - raceFlowArea
  ========================================================= */

  function renderRaceFlow(data, prediction) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML(
        "raceFlowArea",
        panel("🌊 展開予想", emptyBox("展開データがありません"), "race-flow-panel")
      );
      return;
    }

    const flow = createRaceFlow(data, prediction);

    const body = `
      <div class="flow-summary">
        <div class="flow-main-title">
          ${escapeHTML(flow.title)}
        </div>
        <p>${escapeHTML(flow.summary)}</p>
      </div>

      <div class="flow-tree">
        <div class="flow-node attack-node">
          <div class="flow-label">🔥 攻める艇</div>
          <div class="flow-boats">
            ${flow.attackBoats.map(item => renderFlowBoat(item)).join("")}
          </div>
        </div>

        <div class="flow-arrow">↓</div>

        <div class="flow-node danger-node">
          <div class="flow-label">⚠️ 飛ぶ・流れる候補</div>
          <div class="flow-boats">
            ${flow.dangerBoats.map(item => renderFlowBoat(item)).join("")}
          </div>
        </div>

        <div class="flow-arrow">↓</div>

        <div class="flow-node pickup-node">
          <div class="flow-label">⚡ 拾う艇</div>
          <div class="flow-boats">
            ${flow.pickupBoats.map(item => renderFlowBoat(item)).join("")}
          </div>
        </div>
      </div>

      <div class="flow-detail-grid">
        <div class="flow-detail-card">
          <h4>展開の入口</h4>
          <p>${escapeHTML(flow.startPoint)}</p>
        </div>

        <div class="flow-detail-card">
          <h4>1マーク想定</h4>
          <p>${escapeHTML(flow.firstMark)}</p>
        </div>

        <div class="flow-detail-card">
          <h4>2・3着の拾い</h4>
          <p>${escapeHTML(flow.pickupPoint)}</p>
        </div>
      </div>
    `;

    setHTML("raceFlowArea", panel("🌊 展開予想", body, "race-flow-panel"));
  }

  function renderFlowBoat(item) {
    const boatNo = Number(item.boatNo || item.no || item);
    const label = item.label || item.name || "";
    const score = item.score ?? "-";
    const reason = item.reason || "";

    return `
      <div class="flow-boat boat-${boatNo}">
        <div class="flow-boat-head">
          ${boatBadge(boatNo)}
          <strong>${escapeHTML(label)}</strong>
          <span>${escapeHTML(score)}</span>
        </div>
        <p>${escapeHTML(reason)}</p>
      </div>
    `;
  }

  function createRaceFlow(data, prediction) {
    if (prediction?.raceFlow) {
      return normalizeRaceFlow(prediction.raceFlow, data);
    }

    if (data?.raceFlow) {
      return normalizeRaceFlow(data.raceFlow, data);
    }

    return buildAutoRaceFlow(data);
  }

  function normalizeRaceFlow(flow, data) {
    return {
      title: flow?.title || "AI展開シミュレーション",
      summary: flow?.summary || flow?.comment || "情報から展開を自動整理しています。",
      attackBoats: normalizeFlowBoatList(flow?.attackBoats || flow?.attack || flow?.攻め艇, data),
      dangerBoats: normalizeFlowBoatList(flow?.dangerBoats || flow?.danger || flow?.飛ぶ艇, data),
      pickupBoats: normalizeFlowBoatList(flow?.pickupBoats || flow?.pickup || flow?.拾う艇, data),
      startPoint: flow?.startPoint || flow?.start || "スタート隊形と展示STから入口を確認。",
      firstMark: flow?.firstMark || flow?.turn1 || "1マークは攻め艇と内の残しを比較。",
      pickupPoint: flow?.pickupPoint || flow?.pickupComment || "2・3着は道中力、当地巧者、展開を拾う艇を重視。"
    };
  }

  function normalizeFlowBoatList(list, data) {
    const entries = normalizeEntries(data);

    if (!Array.isArray(list)) {
      return [];
    }

    return list.map((item) => {
      if (typeof item === "number" || typeof item === "string") {
        const boatNo = Number(item);
        const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

        return {
          boatNo,
          label: getPlayerName(entry || {}),
          score: "-",
          reason: "展開候補"
        };
      }

      const boatNo = Number(item.boatNo || item.no || item.艇番);
      const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

      return {
        boatNo,
        label: item.label || item.name || getPlayerName(entry || {}),
        score: item.score ?? "-",
        reason: item.reason || item.comment || "展開候補"
      };
    });
  }

  function buildAutoRaceFlow(data) {
    const entries = normalizeEntries(data);
    const scored = entries.map((entry, index) => createBasicFlowScore(data, entry, index));

    const attackBoats = [...scored]
      .sort((a, b) => b.attackScore - a.attackScore)
      .slice(0, 2)
      .map(item => ({
        boatNo: item.boatNo,
        label: item.name,
        score: item.attackScore,
        reason: item.attackReason
      }));

    const dangerBoats = [...scored]
      .sort((a, b) => b.dangerScore - a.dangerScore)
      .slice(0, 2)
      .map(item => ({
        boatNo: item.boatNo,
        label: item.name,
        score: item.dangerScore,
        reason: item.dangerReason
      }));

    const pickupBoats = [...scored]
      .sort((a, b) => b.pickupScore - a.pickupScore)
      .slice(0, 3)
      .map(item => ({
        boatNo: item.boatNo,
        label: item.name,
        score: item.pickupScore,
        reason: item.pickupReason
      }));

    const mainAttack = attackBoats[0];
    const mainPickup = pickupBoats[0];

    return {
      title: "AI自動展開",
      summary: mainAttack
        ? `${mainAttack.boatNo}号艇の攻めを起点に、残す艇と拾う艇を分けて判断。`
        : "出走データから展開を整理。",
      attackBoats,
      dangerBoats,
      pickupBoats,
      startPoint: mainAttack
        ? `${mainAttack.boatNo}号艇がスタート・攻め指数で上位。ここが展開の入口。`
        : "スタート隊形は横一線想定。",
      firstMark: dangerBoats.length
        ? `攻めが入ると${dangerBoats.map(v => `${v.boatNo}号艇`).join("・")}が流れる可能性。`
        : "内が残す展開を基本線にする。",
      pickupPoint: mainPickup
        ? `${mainPickup.boatNo}号艇は道中・当地・展開利で2、3着に拾える候補。`
        : "2、3着は内残しと展開差しを重視。"
    };
  }

  function createBasicFlowScore(data, entry, index) {
    const boatNo = getBoatNo(entry, index);
    const name = getPlayerName(entry);

    const avgSTRaw = getEntryValue(entry, [
      "avgST",
      "averageST",
      "st",
      "平均ST"
    ]);

    const avgSTNumber = Number(String(avgSTRaw).replace(/^0/, ""));

    const national = entry?.national || entry?.全国成績 || {};
    const local = entry?.local || entry?.当地成績 || {};
    const motor = entry?.motor || entry?.モーター || {};

    const nationalRate = Number(getEntryValue(national, ["winRate", "rate", "勝率"], 0));
    const localRate = Number(getEntryValue(local, ["winRate", "rate", "勝率"], 0));
    const motorRate = parseFloat(String(getEntryValue(motor, ["secondRate", "2連率"], 0)).replace("%", ""));

    let attackScore = 50;
    let pickupScore = 50;
    let dangerScore = 35;

    if (!Number.isNaN(avgSTNumber)) {
      if (avgSTNumber <= 0.13) attackScore += 18;
      else if (avgSTNumber <= 0.16) attackScore += 10;
      else if (avgSTNumber >= 0.20) attackScore -= 10;
    }

    if (!Number.isNaN(nationalRate)) {
      attackScore += Math.round(nationalRate * 2);
      pickupScore += Math.round(nationalRate * 2);
    }

    if (!Number.isNaN(localRate)) {
      pickupScore += Math.round(localRate * 3);
    }

    if (!Number.isNaN(motorRate)) {
      attackScore += Math.round((motorRate - 30) / 3);
      pickupScore += Math.round((motorRate - 30) / 4);
    }

    if (boatNo === 1) {
      pickupScore += 8;
      dangerScore += 18;
    }

    if (boatNo === 2) {
      attackScore += 5;
      pickupScore += 8;
    }

    if (boatNo === 3 || boatNo === 4) {
      attackScore += 8;
    }

    if (boatNo === 5 || boatNo === 6) {
      pickupScore += 10;
      dangerScore -= 5;
    }

    attackScore = clampScore(attackScore);
    pickupScore = clampScore(pickupScore);
    dangerScore = clampScore(dangerScore);

    return {
      boatNo,
      name,
      attackScore,
      pickupScore,
      dangerScore,
      attackReason: createAttackReason(boatNo, avgSTRaw, nationalRate, motorRate),
      pickupReason: createPickupReason(boatNo, localRate, nationalRate),
      dangerReason: createDangerReason(boatNo, avgSTRaw)
    };
  }

  function clampScore(value) {
    return Math.max(1, Math.min(99, Math.round(value)));
  }

  function createAttackReason(boatNo, avgSTRaw, nationalRate, motorRate) {
    const reasons = [];

    if (avgSTRaw !== "-") reasons.push(`平均ST ${st(avgSTRaw)}`);
    if (!Number.isNaN(nationalRate) && nationalRate > 0) reasons.push(`全国勝率 ${nationalRate}`);
    if (!Number.isNaN(motorRate) && motorRate > 0) reasons.push(`M2連 ${motorRate}%`);

    if (boatNo === 3 || boatNo === 4) {
      reasons.push("センター攻め位置");
    }

    if (boatNo === 2) {
      reasons.push("2コース差し評価");
    }

    return reasons.length ? reasons.join(" / ") : "攻め材料を自動評価";
  }

  function createPickupReason(boatNo, localRate, nationalRate) {
    const reasons = [];

    if (!Number.isNaN(localRate) && localRate > 0) reasons.push(`当地勝率 ${localRate}`);
    if (!Number.isNaN(nationalRate) && nationalRate > 0) reasons.push(`全国勝率 ${nationalRate}`);

    if (boatNo >= 5) {
      reasons.push("展開を拾う外枠候補");
    }

    if (boatNo === 2) {
      reasons.push("差し残り候補");
    }

    return reasons.length ? reasons.join(" / ") : "道中・展開利を自動評価";
  }

  function createDangerReason(boatNo, avgSTRaw) {
    if (boatNo === 1) {
      return "攻めを受けると流れ・差されるリスク。";
    }

    if (boatNo === 2) {
      return "3コース攻めを受けると引き波・差し場制限。";
    }

    if (boatNo === 4) {
      return "3が攻め切る展開では攻め場が狭くなる。";
    }

    if (avgSTRaw !== "-") {
      return `平均ST ${st(avgSTRaw)}。スタート遅れ時は展開を失う。`;
    }

    return "攻めを受けた時の展開リスク。";
  }

  window.ChappyRender.renderFlowBoat = renderFlowBoat;
  window.ChappyRender.createRaceFlow = createRaceFlow;
  window.ChappyRender.normalizeRaceFlow = normalizeRaceFlow;
  window.ChappyRender.normalizeFlowBoatList = normalizeFlowBoatList;
  window.ChappyRender.buildAutoRaceFlow = buildAutoRaceFlow;
  window.ChappyRender.createBasicFlowScore = createBasicFlowScore;
  window.ChappyRender.clampScore = clampScore;

  window.renderRaceFlow = renderRaceFlow;
    /* =========================================================
    Part 4/10
    青シート：本命予想・フォーメーション
    対応HTML ID：
    - mainSheetArea
    - formationArea
  ========================================================= */

  function renderMainSheet(data, prediction) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML(
        "mainSheetArea",
        panel("🎯 青シート", emptyBox("予想データがありません"), "main-sheet-panel")
      );
      setHTML(
        "formationArea",
        panel("🎫 フォーメーション", emptyBox("フォーメーションデータがありません"), "formation-panel")
      );
      return;
    }

    const mainSheet = createMainSheet(data, prediction);

    const body = `
      <div class="sheet-blue">
        <div class="sheet-head">
          <div>
            <h3>🎯 本命・軸評価</h3>
            <p>情報 → 展開 → スコア → フォーメーション → 解説</p>
          </div>
          <span class="sheet-tag blue-tag">本命</span>
        </div>

        <div class="mark-card-grid">
          ${renderMainMarkCard("◎ 本命", mainSheet.honmei)}
          ${renderMainMarkCard("○ 対抗", mainSheet.taikou)}
          ${renderMainMarkCard("▲ 穴", mainSheet.ana)}
          ${renderMainMarkCard("△ 押さえ", mainSheet.osae)}
        </div>

        <div class="sheet-reason-box">
          <h4>理由</h4>
          <p>${escapeHTML(mainSheet.reason)}</p>
        </div>

        <div class="buff-table-wrap">
          <h4>バフ / デバフ</h4>
          <div class="arrow-legend">
            <span>⬆️＝プラス材料</span>
            <span>⬇️＝マイナス材料</span>
            <span>➡️＝中立</span>
          </div>
          ${renderBuffDebuffTable(mainSheet.evaluations)}
        </div>
      </div>
    `;

    setHTML("mainSheetArea", panel("🎯 青シート", body, "main-sheet-panel"));
    renderFormation(data, mainSheet);
  }

  function renderMainMarkCard(title, item) {
    if (!item) {
      return `
        <div class="main-mark-card empty-mark">
          <h4>${escapeHTML(title)}</h4>
          <p>-</p>
        </div>
      `;
    }

    const boatNo = Number(item.boatNo);
    const score = item.score ?? "-";

    return `
      <div class="main-mark-card boat-${boatNo}">
        <div class="main-mark-top">
          <h4>${escapeHTML(title)}</h4>
          <span class="score-pill">${escapeHTML(score)}点</span>
        </div>

        <div class="main-mark-player">
          ${boatBadge(boatNo)}
          <strong>${escapeHTML(item.name)}</strong>
        </div>

        <p>${escapeHTML(item.comment || "-")}</p>
      </div>
    `;
  }

  function renderBuffDebuffTable(evaluations) {
    if (!Array.isArray(evaluations) || !evaluations.length) {
      return emptyBox("評価データがありません");
    }

    const rows = evaluations.map(item => {
      const boatNo = Number(item.boatNo);
      const buffs = Array.isArray(item.buffs) ? item.buffs : [];
      const debuffs = Array.isArray(item.debuffs) ? item.debuffs : [];

      return `
        <tr>
          <td>${boatBadge(boatNo)}</td>
          <td><strong>${escapeHTML(item.name)}</strong></td>
          <td>${escapeHTML(item.score ?? "-")}</td>
          <td>${buffs.length ? buffs.map(v => `⬆️ ${escapeHTML(v)}`).join("<br>") : "➡️ -"}</td>
          <td>${debuffs.length ? debuffs.map(v => `⬇️ ${escapeHTML(v)}`).join("<br>") : "➡️ -"}</td>
          <td>${escapeHTML(item.shortComment || "-")}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="table-scroll">
        <table class="render-table buff-table">
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>スコア</th>
              <th>⬆️ バフ</th>
              <th>⬇️ デバフ</th>
              <th>一言</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderFormation(data, mainSheet) {
    const formation = mainSheet?.formation || createDefaultFormation(mainSheet);

    const body = `
      <div class="formation-box">
        <div class="formation-section">
          <h3>🔥 本線</h3>
          ${renderTicketList(formation.main)}
        </div>

        <div class="formation-section">
          <h3>🛟 安全押さえ</h3>
          ${renderTicketList(formation.safe)}
        </div>

        <div class="formation-section">
          <h3>🌊 展開流し</h3>
          ${renderTicketList(formation.flow)}
        </div>

        <div class="formation-comment">
          <h4>買い方メモ</h4>
          <p>${escapeHTML(formation.comment || "本線と押さえを分けて、展開がズレた時の拾いを残す。")}</p>
        </div>
      </div>
    `;

    setHTML("formationArea", panel("🎫 フォーメーション", body, "formation-panel"));
  }

  function renderTicketList(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("該当なし");
    }

    return `
      <div class="ticket-list">
        ${list.map(ticket => `
          <div class="ticket-chip">
            ${escapeHTML(ticket)}
          </div>
        `).join("")}
      </div>
    `;
  }

  function createMainSheet(data, prediction) {
    if (prediction?.mainSheet) {
      return normalizeMainSheet(prediction.mainSheet, data);
    }

    if (data?.mainSheet) {
      return normalizeMainSheet(data.mainSheet, data);
    }

    return buildAutoMainSheet(data);
  }

  function normalizeMainSheet(sheet, data) {
    const entries = normalizeEntries(data);
    const evaluations = normalizeEvaluations(sheet?.evaluations || sheet?.scores || [], data);

    const sorted = evaluations.length
      ? [...evaluations].sort((a, b) => Number(b.score) - Number(a.score))
      : buildAutoEvaluations(data);

    return {
      honmei: normalizeMarkItem(sheet?.honmei || sheet?.main || sorted[0], entries),
      taikou: normalizeMarkItem(sheet?.taikou || sheet?.rival || sorted[1], entries),
      ana: normalizeMarkItem(sheet?.ana || sheet?.hole || sorted[2], entries),
      osae: normalizeMarkItem(sheet?.osae || sheet?.cover || sorted[3], entries),
      reason: sheet?.reason || sheet?.comment || createMainReason(sorted),
      evaluations: sorted,
      formation: sheet?.formation || createDefaultFormationFromEvaluations(sorted)
    };
  }

  function normalizeMarkItem(item, entries) {
    if (!item) return null;

    if (typeof item === "number" || typeof item === "string") {
      const boatNo = Number(item);
      const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

      return {
        boatNo,
        name: getPlayerName(entry || {}),
        score: "-",
        comment: "評価候補"
      };
    }

    const boatNo = Number(item.boatNo || item.no || item.艇番);
    const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

    return {
      boatNo,
      name: item.name || getPlayerName(entry || {}),
      score: item.score ?? "-",
      comment: item.comment || item.reason || item.shortComment || "評価候補"
    };
  }

  function normalizeEvaluations(list, data) {
    if (!Array.isArray(list) || !list.length) {
      return [];
    }

    const entries = normalizeEntries(data);

    return list.map(item => {
      const boatNo = Number(item.boatNo || item.no || item.艇番);
      const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

      return {
        boatNo,
        name: item.name || getPlayerName(entry || {}),
        score: item.score ?? "-",
        buffs: Array.isArray(item.buffs) ? item.buffs : [],
        debuffs: Array.isArray(item.debuffs) ? item.debuffs : [],
        shortComment: item.shortComment || item.comment || "-"
      };
    });
  }

  function buildAutoMainSheet(data) {
    const evaluations = buildAutoEvaluations(data);
    const sorted = [...evaluations].sort((a, b) => b.score - a.score);

    return {
      honmei: sorted[0] || null,
      taikou: sorted[1] || null,
      ana: sorted[2] || null,
      osae: sorted[3] || null,
      reason: createMainReason(sorted),
      evaluations: sorted,
      formation: createDefaultFormationFromEvaluations(sorted)
    };
  }

  function buildAutoEvaluations(data) {
    const entries = normalizeEntries(data);

    return entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const name = getPlayerName(entry);

      const scoreData = calculateMainScore(data, entry, index);

      return {
        boatNo,
        name,
        score: scoreData.score,
        buffs: scoreData.buffs,
        debuffs: scoreData.debuffs,
        shortComment: scoreData.comment,
        comment: scoreData.comment
      };
    });
  }

  function calculateMainScore(data, entry, index) {
    const boatNo = getBoatNo(entry, index);

    const avgST = getEntryValue(entry, [
      "avgST",
      "averageST",
      "st",
      "平均ST"
    ]);

    const avgSTNumber = Number(String(avgST).replace(/^0/, ""));

    const className = getEntryValue(entry, [
      "class",
      "className",
      "grade",
      "級別"
    ]);

    const national = entry?.national || entry?.全国成績 || {};
    const local = entry?.local || entry?.当地成績 || {};
    const motor = entry?.motor || entry?.モーター || {};

    const nationalRate = Number(getEntryValue(national, ["winRate", "rate", "勝率"], 0));
    const localRate = Number(getEntryValue(local, ["winRate", "rate", "勝率"], 0));
    const motorRate = parseFloat(String(getEntryValue(motor, ["secondRate", "2連率"], 0)).replace("%", ""));

    let score = 50;
    const buffs = [];
    const debuffs = [];

    if (boatNo === 1) {
      score += 14;
      buffs.push("インコース利");
    }

    if (boatNo === 2) {
      score += 8;
      buffs.push("2コース差し評価");
    }

    if (boatNo === 3 || boatNo === 4) {
      score += 5;
      buffs.push("攻め位置");
    }

    if (boatNo >= 5) {
      score -= 4;
      debuffs.push("外枠で展開待ち");
      score += 4;
      buffs.push("展開を拾う候補");
    }

    if (String(className).includes("A1")) {
      score += 12;
      buffs.push("A1格上");
    } else if (String(className).includes("A2")) {
      score += 6;
      buffs.push("A2安定");
    } else if (String(className).includes("B")) {
      score -= 2;
      debuffs.push("級別は控えめ");
    }

    if (!Number.isNaN(avgSTNumber)) {
      if (avgSTNumber <= 0.13) {
        score += 12;
        buffs.push(`ST速い ${st(avgST)}`);
      } else if (avgSTNumber <= 0.16) {
        score += 7;
        buffs.push(`ST安定 ${st(avgST)}`);
      } else if (avgSTNumber >= 0.20) {
        score -= 8;
        debuffs.push(`ST遅め ${st(avgST)}`);
      }
    }

    if (!Number.isNaN(nationalRate) && nationalRate > 0) {
      score += Math.round(nationalRate * 2);
      if (nationalRate >= 6) buffs.push(`全国勝率高い ${nationalRate}`);
      if (nationalRate <= 4) debuffs.push(`全国勝率低め ${nationalRate}`);
    }

    if (!Number.isNaN(localRate) && localRate > 0) {
      score += Math.round(localRate * 2);
      if (localRate >= 6) buffs.push(`当地勝率高い ${localRate}`);
    }

    if (!Number.isNaN(motorRate) && motorRate > 0) {
      if (motorRate >= 40) {
        score += 7;
        buffs.push(`M2連率上位 ${motorRate}%`);
      } else if (motorRate <= 25) {
        score -= 5;
        debuffs.push(`M2連率低め ${motorRate}%`);
      }
    }

    score = clampScore(score);

    return {
      score,
      buffs,
      debuffs,
      comment: createMainShortComment(boatNo, score, buffs, debuffs)
    };
  }

  function createMainShortComment(boatNo, score, buffs, debuffs) {
    if (score >= 80) {
      return `${boatNo}号艇は軸候補。${buffs.slice(0, 2).join("、")}が強い。`;
    }

    if (score >= 68) {
      return `${boatNo}号艇は相手本線。展開ひとつで頭まで。`;
    }

    if (score >= 58) {
      return `${boatNo}号艇は2・3着候補。押さえに残したい。`;
    }

    if (buffs.length && debuffs.length) {
      return `${boatNo}号艇はプラスもあるが、${debuffs[0]}が気になる。`;
    }

    return `${boatNo}号艇は展開待ち。無理に厚く買わない。`;
  }

  function createMainReason(sorted) {
    if (!Array.isArray(sorted) || !sorted.length) {
      return "出走データから本命軸を自動評価。";
    }

    const top = sorted[0];
    const second = sorted[1];

    if (!top) return "出走データから本命軸を自動評価。";

    const secondText = second
      ? `相手は${second.boatNo}号艇。`
      : "";

    return `${top.boatNo}号艇を中心評価。スコア${top.score}点で、バフ材料が最も強い。${secondText} 展開とSTを合わせて本線を組む。`;
  }

  function createDefaultFormation(mainSheet) {
    const boats = [
      mainSheet?.honmei?.boatNo,
      mainSheet?.taikou?.boatNo,
      mainSheet?.ana?.boatNo,
      mainSheet?.osae?.boatNo
    ].filter(Boolean);

    return createDefaultFormationFromBoatNos(boats);
  }

  function createDefaultFormationFromEvaluations(evaluations) {
    const boats = evaluations
      .slice(0, 4)
      .map(item => item.boatNo)
      .filter(Boolean);

    return createDefaultFormationFromBoatNos(boats);
  }

  function createDefaultFormationFromBoatNos(boats) {
    const first = boats[0];
    const second = boats[1];
    const third = boats[2];
    const fourth = boats[3];

    const main = [];
    const safe = [];
    const flow = [];

    if (first && second && third) {
      main.push(`${first}-${second}-${third}`);
      main.push(`${first}-${third}-${second}`);
    }

    if (first && second && fourth) {
      safe.push(`${first}-${second}-${fourth}`);
      safe.push(`${first}-${fourth}-${second}`);
    }

    if (second && first && third) {
      safe.push(`${second}-${first}-${third}`);
    }

    if (first && second && third && fourth) {
      flow.push(`${first}-${second}${third}-${second}${third}${fourth}`);
      flow.push(`${first}-${second}${third}${fourth}-全`);
    }

    return {
      main,
      safe,
      flow,
      comment: "本線は上位スコア中心。安全押さえは2着逆転と3着ズレをカバー。流しは展開が割れた時だけ。"
    };
  }

  window.ChappyRender.renderMainMarkCard = renderMainMarkCard;
  window.ChappyRender.renderBuffDebuffTable = renderBuffDebuffTable;
  window.ChappyRender.renderFormation = renderFormation;
  window.ChappyRender.renderTicketList = renderTicketList;
  window.ChappyRender.createMainSheet = createMainSheet;
  window.ChappyRender.normalizeMainSheet = normalizeMainSheet;
  window.ChappyRender.normalizeMarkItem = normalizeMarkItem;
  window.ChappyRender.normalizeEvaluations = normalizeEvaluations;
  window.ChappyRender.buildAutoMainSheet = buildAutoMainSheet;
  window.ChappyRender.buildAutoEvaluations = buildAutoEvaluations;
  window.ChappyRender.calculateMainScore = calculateMainScore;
  window.ChappyRender.createDefaultFormationFromEvaluations = createDefaultFormationFromEvaluations;
  window.ChappyRender.createDefaultFormationFromBoatNos = createDefaultFormationFromBoatNos;

  window.renderMainSheet = renderMainSheet;
    /* =========================================================
    Part 5/10
    ピンクシート：万舟候補
    対応HTML ID：
    - manshuSheetArea
  ========================================================= */

  function renderManshuSheet(data, prediction) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML(
        "manshuSheetArea",
        panel("💣 ピンクシート", emptyBox("万舟データがありません"), "manshu-sheet-panel")
      );
      return;
    }

    const manshuSheet = createManshuSheet(data, prediction);

    const body = `
      <div class="sheet-pink">
        <div class="sheet-head">
          <div>
            <h3>💣 万舟・穴評価</h3>
            <p>外枠だけでなく、内側絡みのズレ目も評価</p>
          </div>
          <span class="sheet-tag pink-tag">万舟</span>
        </div>

        <div class="manshu-grid">
          <div class="manshu-block">
            <h4>💣 万舟候補</h4>
            ${renderManshuCandidateList(manshuSheet.candidates)}
          </div>

          <div class="manshu-block">
            <h4>🛟 残し艇</h4>
            ${renderManshuCandidateList(manshuSheet.holdBoats)}
          </div>

          <div class="manshu-block">
            <h4>⚡ 拾い艇</h4>
            ${renderManshuCandidateList(manshuSheet.pickupBoats)}
          </div>
        </div>

        <div class="manshu-formation">
          <h4>🎫 万舟フォーメーション</h4>
          ${renderTicketList(manshuSheet.formation)}
        </div>

        <div class="missing-number-box">
          <h4>📉 出てない目</h4>
          ${renderMissingNumberList(manshuSheet.missingNumbers)}
        </div>

        <div class="sheet-reason-box pink-reason">
          <h4>万舟メモ</h4>
          <p>${escapeHTML(manshuSheet.reason)}</p>
        </div>
      </div>
    `;

    setHTML("manshuSheetArea", panel("💣 ピンクシート", body, "manshu-sheet-panel"));
  }

  function renderManshuCandidateList(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("該当なし");
    }

    return `
      <div class="manshu-candidate-list">
        ${list.map(item => {
          const boatNo = Number(item.boatNo);

          return `
            <div class="manshu-candidate boat-${boatNo}">
              <div class="manshu-candidate-head">
                ${boatBadge(boatNo)}
                <strong>${escapeHTML(item.name)}</strong>
                <span>${escapeHTML(item.score ?? "-")}点</span>
              </div>
              <p>${escapeHTML(item.reason || "-")}</p>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderMissingNumberList(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("出てない目データなし");
    }

    return `
      <div class="table-scroll">
        <table class="render-table missing-table">
          <thead>
            <tr>
              <th>順位</th>
              <th>出目</th>
              <th>現位オッズ</th>
              <th>評価</th>
            </tr>
          </thead>
          <tbody>
            ${list.slice(0, 30).map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(item.combination || item.kumi || item.ticket || "-")}</strong></td>
                <td>${escapeHTML(item.odds ?? item.currentOdds ?? "-")}</td>
                <td>${escapeHTML(item.comment || "未出目候補")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function createManshuSheet(data, prediction) {
    if (prediction?.manshuSheet) {
      return normalizeManshuSheet(prediction.manshuSheet, data);
    }

    if (data?.manshuSheet) {
      return normalizeManshuSheet(data.manshuSheet, data);
    }

    return buildAutoManshuSheet(data);
  }

  function normalizeManshuSheet(sheet, data) {
    const candidates = normalizeManshuList(
      sheet?.candidates ||
      sheet?.manshuCandidates ||
      sheet?.万舟候補 ||
      [],
      data
    );

    const holdBoats = normalizeManshuList(
      sheet?.holdBoats ||
      sheet?.nokoshi ||
      sheet?.残し艇 ||
      [],
      data
    );

    const pickupBoats = normalizeManshuList(
      sheet?.pickupBoats ||
      sheet?.拾い艇 ||
      [],
      data
    );

    const missingNumbers = normalizeMissingNumbers(
      sheet?.missingNumbers ||
      sheet?.missing ||
      sheet?.出てない目 ||
      data?.missingNumbers ||
      []
    );

    const auto = buildAutoManshuSheet(data);

    return {
      candidates: candidates.length ? candidates : auto.candidates,
      holdBoats: holdBoats.length ? holdBoats : auto.holdBoats,
      pickupBoats: pickupBoats.length ? pickupBoats : auto.pickupBoats,
      formation: Array.isArray(sheet?.formation) && sheet.formation.length
        ? sheet.formation
        : auto.formation,
      missingNumbers: missingNumbers.length ? missingNumbers : auto.missingNumbers,
      reason: sheet?.reason || sheet?.comment || auto.reason
    };
  }

  function normalizeManshuList(list, data) {
    if (!Array.isArray(list) || !list.length) return [];

    const entries = normalizeEntries(data);

    return list.map(item => {
      if (typeof item === "number" || typeof item === "string") {
        const boatNo = Number(item);
        const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

        return {
          boatNo,
          name: getPlayerName(entry || {}),
          score: "-",
          reason: "万舟候補"
        };
      }

      const boatNo = Number(item.boatNo || item.no || item.艇番);
      const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

      return {
        boatNo,
        name: item.name || getPlayerName(entry || {}),
        score: item.score ?? "-",
        reason: item.reason || item.comment || "万舟候補"
      };
    });
  }

  function normalizeMissingNumbers(list) {
    if (!Array.isArray(list)) return [];

    return list.map(item => {
      if (typeof item === "string") {
        return {
          combination: item,
          odds: "-",
          comment: "未出目候補"
        };
      }

      return {
        combination: item.combination || item.kumi || item.ticket || item.出目 || "-",
        odds: item.odds ?? item.currentOdds ?? item.オッズ ?? "-",
        comment: item.comment || item.評価 || "未出目候補"
      };
    });
  }

  function buildAutoManshuSheet(data) {
    const entries = normalizeEntries(data);
    const evaluations = buildAutoManshuEvaluations(data);

    const candidates = [...evaluations]
      .sort((a, b) => b.manshuScore - a.manshuScore)
      .slice(0, 3)
      .map(item => ({
        boatNo: item.boatNo,
        name: item.name,
        score: item.manshuScore,
        reason: item.manshuReason
      }));

    const holdBoats = [...evaluations]
      .sort((a, b) => b.holdScore - a.holdScore)
      .slice(0, 3)
      .map(item => ({
        boatNo: item.boatNo,
        name: item.name,
        score: item.holdScore,
        reason: item.holdReason
      }));

    const pickupBoats = [...evaluations]
      .sort((a, b) => b.pickupScore - a.pickupScore)
      .slice(0, 3)
      .map(item => ({
        boatNo: item.boatNo,
        name: item.name,
        score: item.pickupScore,
        reason: item.pickupReason
      }));

    const formation = createManshuFormation(candidates, holdBoats, pickupBoats);
    const missingNumbers = normalizeMissingNumbers(data?.missingNumbers || data?.missing || []);

    const candidateText = candidates.length
      ? `${candidates.map(v => `${v.boatNo}号艇`).join("・")}を穴の入口に設定。`
      : "展開穴を自動抽出。";

    return {
      candidates,
      holdBoats,
      pickupBoats,
      formation,
      missingNumbers,
      reason: `${candidateText} 万舟は外枠だけでなく、内の残し・2着ズレ・3着拾いまで見る。`
    };
  }

  function buildAutoManshuEvaluations(data) {
    const entries = normalizeEntries(data);

    return entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const name = getPlayerName(entry);

      const className = getEntryValue(entry, [
        "class",
        "className",
        "grade",
        "級別"
      ]);

      const avgST = getEntryValue(entry, [
        "avgST",
        "averageST",
        "st",
        "平均ST"
      ]);

      const avgSTNumber = Number(String(avgST).replace(/^0/, ""));

      const national = entry?.national || entry?.全国成績 || {};
      const local = entry?.local || entry?.当地成績 || {};
      const motor = entry?.motor || entry?.モーター || {};

      const nationalRate = Number(getEntryValue(national, ["winRate", "rate", "勝率"], 0));
      const localRate = Number(getEntryValue(local, ["winRate", "rate", "勝率"], 0));
      const motorRate = parseFloat(String(getEntryValue(motor, ["secondRate", "2連率"], 0)).replace("%", ""));

      let manshuScore = 45;
      let holdScore = 45;
      let pickupScore = 45;

      const manshuReasons = [];
      const holdReasons = [];
      const pickupReasons = [];

      if (boatNo >= 4) {
        manshuScore += 18;
        pickupScore += 10;
        manshuReasons.push("外枠でオッズ妙味が出やすい");
        pickupReasons.push("展開が崩れた時の拾い候補");
      }

      if (boatNo === 2) {
        holdScore += 14;
        manshuScore += 5;
        holdReasons.push("2コース差し・残し候補");
      }

      if (boatNo === 3 || boatNo === 4) {
        manshuScore += 10;
        manshuReasons.push("攻めが入ると配当が跳ねやすい");
      }

      if (boatNo === 1) {
        holdScore += 18;
        holdReasons.push("イン残し候補");
        manshuScore -= 10;
      }

      if (!Number.isNaN(avgSTNumber)) {
        if (avgSTNumber <= 0.13) {
          manshuScore += 10;
          holdScore += 8;
          pickupScore += 6;
          manshuReasons.push(`ST速い ${st(avgST)}`);
        } else if (avgSTNumber >= 0.20) {
          manshuScore -= 6;
          holdScore -= 6;
          pickupReasons.push(`ST遅めでも展開待ち ${st(avgST)}`);
        }
      }

      if (String(className).includes("A1")) {
        manshuScore += boatNo >= 4 ? 14 : 6;
        holdScore += 8;
        pickupScore += 10;
        manshuReasons.push("A1の外枠なら穴の破壊力");
      } else if (String(className).includes("A2")) {
        manshuScore += 6;
        pickupScore += 6;
      }

      if (!Number.isNaN(localRate) && localRate >= 6) {
        pickupScore += 12;
        holdScore += 8;
        pickupReasons.push(`当地勝率高い ${localRate}`);
      }

      if (!Number.isNaN(nationalRate) && nationalRate >= 6) {
        manshuScore += 6;
        holdScore += 6;
        pickupScore += 6;
      }

      if (!Number.isNaN(motorRate) && motorRate >= 40) {
        manshuScore += 7;
        pickupScore += 7;
        manshuReasons.push(`M2連率上位 ${motorRate}%`);
      }

      manshuScore = clampScore(manshuScore);
      holdScore = clampScore(holdScore);
      pickupScore = clampScore(pickupScore);

      return {
        boatNo,
        name,
        manshuScore,
        holdScore,
        pickupScore,
        manshuReason: manshuReasons.length
          ? manshuReasons.slice(0, 3).join(" / ")
          : "展開ズレで配当上昇候補",
        holdReason: holdReasons.length
          ? holdReasons.slice(0, 3).join(" / ")
          : "内残し・着残し候補",
        pickupReason: pickupReasons.length
          ? pickupReasons.slice(0, 3).join(" / ")
          : "2・3着拾い候補"
      };
    });
  }

  function createManshuFormation(candidates, holdBoats, pickupBoats) {
    const c = candidates.map(v => v.boatNo).filter(Boolean);
    const h = holdBoats.map(v => v.boatNo).filter(Boolean);
    const p = pickupBoats.map(v => v.boatNo).filter(Boolean);

    const tickets = [];

    if (c[0] && h[0] && p[0]) tickets.push(`${c[0]}-${h[0]}-${p[0]}`);
    if (c[0] && p[0] && h[0]) tickets.push(`${c[0]}-${p[0]}-${h[0]}`);
    if (h[0] && c[0] && p[0]) tickets.push(`${h[0]}-${c[0]}-${p[0]}`);
    if (h[0] && p[0] && c[0]) tickets.push(`${h[0]}-${p[0]}-${c[0]}`);

    if (c[0] && h[0] && p.length >= 2) {
      tickets.push(`${c[0]}-${h[0]}-${p[0]}${p[1]}`);
    }

    if (h[0] && c.length >= 2 && p.length >= 2) {
      tickets.push(`${h[0]}-${c[0]}${c[1]}-${p[0]}${p[1]}`);
    }

    return [...new Set(tickets)].slice(0, 8);
  }

  window.ChappyRender.renderManshuCandidateList = renderManshuCandidateList;
  window.ChappyRender.renderMissingNumberList = renderMissingNumberList;
  window.ChappyRender.createManshuSheet = createManshuSheet;
  window.ChappyRender.normalizeManshuSheet = normalizeManshuSheet;
  window.ChappyRender.normalizeManshuList = normalizeManshuList;
  window.ChappyRender.normalizeMissingNumbers = normalizeMissingNumbers;
  window.ChappyRender.buildAutoManshuSheet = buildAutoManshuSheet;
  window.ChappyRender.buildAutoManshuEvaluations = buildAutoManshuEvaluations;
  window.ChappyRender.createManshuFormation = createManshuFormation;

  window.renderManshuSheet = renderManshuSheet;
    /* =========================================================
    Part 6/10
    舟券太郎理論
    対応HTML ID：
    - theorySummaryArea
    - theoryAlertArea
    - alertArea
  ========================================================= */

  function renderTheory(data, theoryResult) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML("theorySummaryArea", emptyBox("理論データがありません"));
      setHTML("theoryAlertArea", "");
      setHTML("alertArea", panel("🚨 アラート", emptyBox("アラートなし"), "alert-panel"));
      return;
    }

    const theory = createTheoryResult(data, theoryResult);

    const summaryHTML = `
      <div class="theory-summary-grid">
        ${renderTheorySummaryCard("🚨 スリットアラート", theory.slitAlert)}
        ${renderTheorySummaryCard("⏱ ダブルタイム", theory.doubleTime)}
        ${renderTheorySummaryCard("🌊 新サム理論", theory.newSam)}
      </div>
    `;

    const alertHTML = `
      <div class="theory-alert-list">
        ${theory.alerts.length
          ? theory.alerts.map(alert => renderTheoryAlert(alert)).join("")
          : emptyBox("強い理論アラートはありません")}
      </div>
    `;

    setHTML("theorySummaryArea", summaryHTML);
    setHTML("theoryAlertArea", alertHTML);

    setHTML(
      "alertArea",
      panel("🚨 アラート", alertHTML, "alert-panel")
    );
  }

  function renderTheorySummaryCard(title, item) {
    const levelClass = item.level || "normal";

    return `
      <div class="theory-summary-card ${levelClass}">
        <h4>${escapeHTML(title)}</h4>
        <div class="theory-score">${escapeHTML(item.score ?? "-")}点</div>
        <p>${escapeHTML(item.comment || "-")}</p>
      </div>
    `;
  }

  function renderTheoryAlert(alert) {
    const boatNo = Number(alert.boatNo || alert.no || 0);

    return `
      <div class="theory-alert-card ${alert.level || "normal"}">
        <div class="theory-alert-head">
          ${boatNo ? boatBadge(boatNo) : ""}
          <strong>${escapeHTML(alert.title || "アラート")}</strong>
          <span>${escapeHTML(alert.score ?? "-")}点</span>
        </div>
        <p>${escapeHTML(alert.comment || "-")}</p>
      </div>
    `;
  }

  function createTheoryResult(data, theoryResult) {
    if (theoryResult) {
      return normalizeTheoryResult(theoryResult, data);
    }

    if (data?.theory) {
      return normalizeTheoryResult(data.theory, data);
    }

    return buildAutoTheoryResult(data);
  }

  function normalizeTheoryResult(result, data) {
    const auto = buildAutoTheoryResult(data);

    const slitAlert = normalizeTheoryBlock(
      result?.slitAlert ||
      result?.slit ||
      result?.スリットアラート,
      auto.slitAlert
    );

    const doubleTime = normalizeTheoryBlock(
      result?.doubleTime ||
      result?.ダブルタイム,
      auto.doubleTime
    );

    const newSam = normalizeTheoryBlock(
      result?.newSam ||
      result?.newSamTheory ||
      result?.新サム理論,
      auto.newSam
    );

    const alerts = Array.isArray(result?.alerts)
      ? result.alerts.map(v => normalizeTheoryAlert(v, data))
      : auto.alerts;

    return {
      slitAlert,
      doubleTime,
      newSam,
      alerts
    };
  }

  function normalizeTheoryBlock(block, fallback) {
    if (!block) return fallback;

    return {
      score: block.score ?? fallback.score,
      level: block.level || fallback.level,
      comment: block.comment || block.reason || fallback.comment
    };
  }

  function normalizeTheoryAlert(alert, data) {
    const entries = normalizeEntries(data);
    const boatNo = Number(alert.boatNo || alert.no || alert.艇番 || 0);
    const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

    return {
      boatNo,
      title: alert.title || alert.name || getPlayerName(entry || {}) || "アラート",
      score: alert.score ?? "-",
      level: alert.level || "normal",
      comment: alert.comment || alert.reason || "-"
    };
  }

  function buildAutoTheoryResult(data) {
    const entries = normalizeEntries(data);

    const slit = calculateSlitAlert(data, entries);
    const doubleTime = calculateDoubleTime(data, entries);
    const newSam = calculateNewSam(data, entries);

    const alerts = [
      ...slit.alerts,
      ...doubleTime.alerts,
      ...newSam.alerts
    ].sort((a, b) => Number(b.score) - Number(a.score));

    return {
      slitAlert: slit.summary,
      doubleTime: doubleTime.summary,
      newSam: newSam.summary,
      alerts
    };
  }

  function calculateSlitAlert(data, entries) {
    const beforeInfo = normalizeBeforeInfo(data);
    const exhibitionEntries = normalizeExhibitionEntries(data);

    const stList = entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const exhibition = getExhibitionByBoat(data, boatNo);

      const rawST =
        exhibition?.exhibitionST ??
        exhibition?.tenjiST ??
        exhibition?.displayST ??
        exhibition?.展示ST ??
        entry?.exhibitionST ??
        entry?.展示ST ??
        entry?.avgST ??
        entry?.平均ST ??
        null;

      const value = parseSTNumber(rawST);

      return {
        boatNo,
        name: getPlayerName(entry),
        st: value,
        raw: rawST
      };
    }).filter(item => item.st !== null);

    const alerts = [];

    for (let i = 0; i < stList.length; i++) {
      const current = stList[i];
      const left = stList[i - 1];
      const right = stList[i + 1];

      const diffs = [];

      if (left && left.st !== null) {
        diffs.push(left.st - current.st);
      }

      if (right && right.st !== null) {
        diffs.push(right.st - current.st);
      }

      const maxDiff = Math.max(...diffs);

      if (maxDiff >= 0.1) {
        alerts.push({
          boatNo: current.boatNo,
          title: `${current.boatNo}号艇 スリットアラート`,
          score: clampScore(70 + maxDiff * 100),
          level: "danger",
          comment: `隣艇よりST差 ${maxDiff.toFixed(2)} 優位。攻めの起点になりやすい。`
        });
      }
    }

    return {
      summary: {
        score: alerts.length ? clampScore(70 + alerts.length * 8) : 50,
        level: alerts.length ? "danger" : "normal",
        comment: alerts.length
          ? `スリット差0.10以上の艇あり。攻め展開に注意。`
          : "明確なスリット差0.10以上はなし。"
      },
      alerts
    };
  }

  function calculateDoubleTime(data, entries) {
    const timeList = entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const exhibition = getExhibitionByBoat(data, boatNo);

      const exhibitionTime = Number(
        exhibition?.exhibitionTime ??
        exhibition?.tenjiTime ??
        exhibition?.displayTime ??
        exhibition?.展示タイム ??
        entry?.exhibitionTime ??
        entry?.展示タイム
      );

      const lapTime = Number(
        exhibition?.lapTime ??
        exhibition?.oneLapTime ??
        exhibition?.一周タイム ??
        entry?.lapTime ??
        entry?.一周タイム
      );

      return {
        boatNo,
        name: getPlayerName(entry),
        exhibitionTime,
        lapTime
      };
    });

    const validExhibition = timeList.filter(v => !Number.isNaN(v.exhibitionTime));
    const validLap = timeList.filter(v => !Number.isNaN(v.lapTime));

    const bestExhibition = validExhibition
      .sort((a, b) => a.exhibitionTime - b.exhibitionTime)[0];

    const bestLap = validLap
      .sort((a, b) => a.lapTime - b.lapTime)[0];

    const alerts = [];

    if (bestExhibition) {
      alerts.push({
        boatNo: bestExhibition.boatNo,
        title: `${bestExhibition.boatNo}号艇 展示タイム1位`,
        score: 68,
        level: bestExhibition.boatNo >= 4 ? "danger" : "normal-good",
        comment: `展示タイム ${bestExhibition.exhibitionTime}。直線気配を評価。`
      });
    }

    if (bestLap) {
      alerts.push({
        boatNo: bestLap.boatNo,
        title: `${bestLap.boatNo}号艇 一周タイム1位`,
        score: 68,
        level: bestLap.boatNo >= 4 ? "danger" : "normal-good",
        comment: `一周タイム ${bestLap.lapTime}。ターン足・道中力を評価。`
      });
    }

    if (
      bestExhibition &&
      bestLap &&
      bestExhibition.boatNo === bestLap.boatNo
    ) {
      alerts.push({
        boatNo: bestExhibition.boatNo,
        title: `${bestExhibition.boatNo}号艇 ダブルタイム`,
        score: bestExhibition.boatNo >= 4 ? 88 : 78,
        level: bestExhibition.boatNo >= 4 ? "danger" : "good",
        comment: "展示タイムと一周タイムの両方で1位。特に外なら連絡み注意。"
      });
    }

    return {
      summary: {
        score: alerts.some(v => String(v.title).includes("ダブルタイム")) ? 85 : alerts.length ? 65 : 50,
        level: alerts.some(v => String(v.title).includes("ダブルタイム")) ? "danger" : "normal",
        comment: alerts.some(v => String(v.title).includes("ダブルタイム"))
          ? "展示タイム＋一周タイムのダブル1位あり。"
          : alerts.length
            ? "展示タイムまたは一周タイムの1位を確認。"
            : "展示・一周タイムデータなし。"
      },
      alerts
    };
  }

  function calculateNewSam(data, entries) {
    const samList = entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const exhibition = getExhibitionByBoat(data, boatNo);

      const exhibitionTime = Number(
        exhibition?.exhibitionTime ??
        exhibition?.tenjiTime ??
        exhibition?.displayTime ??
        exhibition?.展示タイム ??
        entry?.exhibitionTime ??
        entry?.展示タイム
      );

      const lapTime = Number(
        exhibition?.lapTime ??
        exhibition?.oneLapTime ??
        exhibition?.一周タイム ??
        entry?.lapTime ??
        entry?.一周タイム
      );

      if (Number.isNaN(exhibitionTime) || Number.isNaN(lapTime)) {
        return null;
      }

      return {
        boatNo,
        name: getPlayerName(entry),
        total: exhibitionTime + lapTime,
        exhibitionTime,
        lapTime
      };
    }).filter(Boolean);

    if (!samList.length) {
      return {
        summary: {
          score: 50,
          level: "normal",
          comment: "新サム理論に必要な展示＋一周タイムが不足。"
        },
        alerts: []
      };
    }

    const average =
      samList.reduce((sum, item) => sum + item.total, 0) / samList.length;

    const alerts = samList
      .map(item => {
        const diff = average - item.total;

        if (diff <= 0) return null;

        return {
          boatNo: item.boatNo,
          title: `${item.boatNo}号艇 新サムアラート`,
          score: clampScore(65 + diff * 20),
          level: diff >= 0.15 ? "danger" : "normal-good",
          comment: `展示＋一周の合計が平均より ${diff.toFixed(2)} 良い。プラスのみ採用。`
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(b.score) - Number(a.score));

    return {
      summary: {
        score: alerts.length ? alerts[0].score : 50,
        level: alerts.length ? alerts[0].level : "normal",
        comment: alerts.length
          ? "新サム理論で平均より良い艇あり。海水面・風強めでは評価アップ。"
          : "平均より明確に良い新サム該当艇なし。"
      },
      alerts
    };
  }

  function parseSTNumber(value) {
    if (value === null || value === undefined || value === "") return null;

    const str = String(value)
      .replace("F", "")
      .replace("L", "")
      .replace(/^0/, "")
      .trim();

    const n = Number(str);

    if (Number.isNaN(n)) return null;

    return n;
  }

  window.ChappyRender.renderTheorySummaryCard = renderTheorySummaryCard;
  window.ChappyRender.renderTheoryAlert = renderTheoryAlert;
  window.ChappyRender.createTheoryResult = createTheoryResult;
  window.ChappyRender.normalizeTheoryResult = normalizeTheoryResult;
  window.ChappyRender.normalizeTheoryBlock = normalizeTheoryBlock;
  window.ChappyRender.normalizeTheoryAlert = normalizeTheoryAlert;
  window.ChappyRender.buildAutoTheoryResult = buildAutoTheoryResult;
  window.ChappyRender.calculateSlitAlert = calculateSlitAlert;
  window.ChappyRender.calculateDoubleTime = calculateDoubleTime;
  window.ChappyRender.calculateNewSam = calculateNewSam;
  window.ChappyRender.parseSTNumber = parseSTNumber;

  window.renderTheory = renderTheory;
    /* =========================================================
    Part 7/10
    チャッピーAI指数
    対応HTML ID：
    - aiIndexArea
    - attackRankingArea
    - expectedValueArea
    - tenkaiIndexArea
  ========================================================= */

  function renderAIIndex(data, aiResult) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML("aiIndexArea", emptyBox("AI指数データがありません"));
      setHTML("attackRankingArea", "");
      setHTML("expectedValueArea", "");
      setHTML("tenkaiIndexArea", "");
      return;
    }

    const aiIndex = createAIIndex(data, aiResult);

    const rows = aiIndex.scores
      .map(item => `
        <tr>
          <td>${boatBadge(item.boatNo)}</td>
          <td><strong>${escapeHTML(item.name)}</strong></td>
          <td>🔥 ${escapeHTML(item.attack)}</td>
          <td>🌊 ${escapeHTML(item.tenkai)}</td>
          <td>⚡ ${escapeHTML(item.michu)}</td>
          <td>🏠 ${escapeHTML(item.local)}</td>
          <td><strong>⭐ ${escapeHTML(item.total)}</strong></td>
          <td>${escapeHTML(item.label)}</td>
        </tr>
      `)
      .join("");

    const tableHTML = `
      <div class="ai-index-wrap">
        <div class="arrow-legend">
          <span>🔥＝攻め指数</span>
          <span>🌊＝展開指数</span>
          <span>⚡＝道中指数</span>
          <span>🏠＝当地指数</span>
          <span>⭐＝総合指数</span>
        </div>

        <div class="table-scroll">
          <table class="render-table ai-index-table">
            <thead>
              <tr>
                <th>艇</th>
                <th>選手</th>
                <th>攻め</th>
                <th>展開</th>
                <th>道中</th>
                <th>当地</th>
                <th>総合</th>
                <th>評価</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    setHTML("aiIndexArea", tableHTML);

    setHTML(
      "attackRankingArea",
      renderAIRankingBox(
        "🔥 攻めランキング",
        aiIndex.attackRanking,
        "スタート・センター攻め・差し抜けの入口評価"
      )
    );

    setHTML(
      "tenkaiIndexArea",
      renderAIRankingBox(
        "🌊 展開ランキング",
        aiIndex.tenkaiRanking,
        "攻めを受けた後に展開を取れる艇"
      )
    );

    setHTML(
      "expectedValueArea",
      renderAIRankingBox(
        "💰 期待値候補",
        aiIndex.expectedRanking,
        "人気より評価が上がりやすい穴・妙味候補"
      )
    );
  }

  function renderAIRankingBox(title, list, comment) {
    if (!Array.isArray(list) || !list.length) {
      return `
        <div class="ranking-box">
          <h3>${escapeHTML(title)}</h3>
          ${emptyBox("ランキングデータなし")}
        </div>
      `;
    }

    return `
      <div class="ranking-box">
        <h3>${escapeHTML(title)}</h3>
        <p class="ranking-comment">${escapeHTML(comment)}</p>

        <div class="ai-ranking-list">
          ${list.map((item, index) => `
            <div class="ai-ranking-item boat-${item.boatNo}">
              <div class="ai-ranking-left">
                <span class="rank-no">${index + 1}</span>
                ${boatBadge(item.boatNo)}
                <strong>${escapeHTML(item.name)}</strong>
              </div>
              <div class="ai-ranking-score">
                ${escapeHTML(item.score)}点
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function createAIIndex(data, aiResult) {
    if (aiResult) {
      return normalizeAIIndex(aiResult, data);
    }

    if (data?.ai) {
      return normalizeAIIndex(data.ai, data);
    }

    return buildAutoAIIndex(data);
  }

  function normalizeAIIndex(aiResult, data) {
    const auto = buildAutoAIIndex(data);

    const rawScores =
      aiResult?.scores ||
      aiResult?.index ||
      aiResult?.aiIndex ||
      aiResult?.指数 ||
      [];

    if (!Array.isArray(rawScores) || !rawScores.length) {
      return auto;
    }

    const entries = normalizeEntries(data);

    const scores = rawScores.map(item => {
      const boatNo = Number(item.boatNo || item.no || item.艇番);
      const entry = entries.find((e, index) => getBoatNo(e, index) === boatNo);

      const attack = Number(item.attack ?? item.attackIndex ?? item.攻め指数 ?? 50);
      const tenkai = Number(item.tenkai ?? item.flow ?? item.展開指数 ?? 50);
      const michu = Number(item.michu ?? item.middle ?? item.道中指数 ?? 50);
      const local = Number(item.local ?? item.localIndex ?? item.当地指数 ?? 50);

      const total = Number(
        item.total ??
        item.totalIndex ??
        item.総合指数 ??
        Math.round((attack * 0.3) + (tenkai * 0.25) + (michu * 0.25) + (local * 0.2))
      );

      return {
        boatNo,
        name: item.name || getPlayerName(entry || {}),
        attack: clampScore(attack),
        tenkai: clampScore(tenkai),
        michu: clampScore(michu),
        local: clampScore(local),
        total: clampScore(total),
        expected: clampScore(Number(item.expected ?? item.value ?? item.期待値 ?? total)),
        label: item.label || createAILabel({ attack, tenkai, michu, local, total })
      };
    }).sort((a, b) => b.total - a.total);

    return buildAIIndexRankings(scores);
  }

  function buildAutoAIIndex(data) {
    const entries = normalizeEntries(data);

    const scores = entries.map((entry, index) => {
      const boatNo = getBoatNo(entry, index);
      const name = getPlayerName(entry);

      const base = createAIBaseScore(data, entry, index);

      return {
        boatNo,
        name,
        attack: base.attack,
        tenkai: base.tenkai,
        michu: base.michu,
        local: base.local,
        total: base.total,
        expected: base.expected,
        label: createAILabel(base)
      };
    }).sort((a, b) => b.total - a.total);

    return buildAIIndexRankings(scores);
  }

  function buildAIIndexRankings(scores) {
    const sorted = [...scores].sort((a, b) => b.total - a.total);

    return {
      scores: sorted,
      attackRanking: [...scores]
        .sort((a, b) => b.attack - a.attack)
        .slice(0, 6)
        .map(item => ({
          boatNo: item.boatNo,
          name: item.name,
          score: item.attack
        })),
      tenkaiRanking: [...scores]
        .sort((a, b) => b.tenkai - a.tenkai)
        .slice(0, 6)
        .map(item => ({
          boatNo: item.boatNo,
          name: item.name,
          score: item.tenkai
        })),
      expectedRanking: [...scores]
        .sort((a, b) => b.expected - a.expected)
        .slice(0, 6)
        .map(item => ({
          boatNo: item.boatNo,
          name: item.name,
          score: item.expected
        }))
    };
  }

  function createAIBaseScore(data, entry, index) {
    const boatNo = getBoatNo(entry, index);

    const className = getEntryValue(entry, [
      "class",
      "className",
      "grade",
      "級別"
    ]);

    const avgST = getEntryValue(entry, [
      "avgST",
      "averageST",
      "st",
      "平均ST"
    ]);

    const avgSTNumber = Number(String(avgST).replace(/^0/, ""));

    const national = entry?.national || entry?.全国成績 || {};
    const localData = entry?.local || entry?.当地成績 || {};
    const motor = entry?.motor || entry?.モーター || {};
    const exhibition = getExhibitionByBoat(data, boatNo);

    const nationalRate = Number(getEntryValue(national, ["winRate", "rate", "勝率"], 0));
    const localRate = Number(getEntryValue(localData, ["winRate", "rate", "勝率"], 0));
    const motorRate = parseFloat(String(getEntryValue(motor, ["secondRate", "2連率"], 0)).replace("%", ""));

    const exhibitionTime = Number(getMaterialValue(entry, exhibition, [
      "exhibitionTime",
      "tenjiTime",
      "displayTime",
      "展示タイム"
    ]));

    let attack = 50;
    let tenkai = 50;
    let michu = 50;
    let local = 50;
    let expected = 50;

    if (boatNo === 1) {
      attack += 10;
      tenkai += 8;
      michu += 6;
      expected -= 6;
    }

    if (boatNo === 2) {
      attack += 8;
      tenkai += 10;
      michu += 8;
      expected += 4;
    }

    if (boatNo === 3) {
      attack += 12;
      tenkai += 8;
      expected += 8;
    }

    if (boatNo === 4) {
      attack += 10;
      tenkai += 9;
      expected += 10;
    }

    if (boatNo === 5 || boatNo === 6) {
      tenkai += 10;
      michu += 12;
      expected += 16;
    }

    if (String(className).includes("A1")) {
      attack += 12;
      tenkai += 8;
      michu += 12;
      expected += boatNo >= 4 ? 10 : 3;
    } else if (String(className).includes("A2")) {
      attack += 6;
      tenkai += 5;
      michu += 6;
      expected += 3;
    } else if (String(className).includes("B")) {
      attack -= 2;
      michu -= 2;
    }

    if (!Number.isNaN(avgSTNumber)) {
      if (avgSTNumber <= 0.13) {
        attack += 15;
        tenkai += 8;
        expected += 6;
      } else if (avgSTNumber <= 0.16) {
        attack += 8;
        tenkai += 4;
      } else if (avgSTNumber >= 0.20) {
        attack -= 10;
        tenkai -= 5;
      }
    }

    if (!Number.isNaN(nationalRate) && nationalRate > 0) {
      attack += Math.round(nationalRate * 1.8);
      michu += Math.round(nationalRate * 2.2);
      expected += nationalRate >= 6 ? 4 : 0;
    }

    if (!Number.isNaN(localRate) && localRate > 0) {
      local += Math.round(localRate * 4);
      michu += Math.round(localRate * 1.2);
      expected += localRate >= 6 ? 8 : 0;
    }

    if (!Number.isNaN(motorRate) && motorRate > 0) {
      attack += Math.round((motorRate - 30) / 3);
      tenkai += Math.round((motorRate - 30) / 4);
      expected += motorRate >= 40 ? 6 : 0;
    }

    if (!Number.isNaN(exhibitionTime)) {
      if (exhibitionTime <= 6.75) {
        attack += 8;
        michu += 6;
        expected += 5;
      } else if (exhibitionTime <= 6.85) {
        attack += 4;
        michu += 3;
      } else if (exhibitionTime >= 7.00) {
        attack -= 6;
        michu -= 4;
      }
    }

    attack = clampScore(attack);
    tenkai = clampScore(tenkai);
    michu = clampScore(michu);
    local = clampScore(local);

    const total = clampScore(
      Math.round((attack * 0.3) + (tenkai * 0.25) + (michu * 0.25) + (local * 0.2))
    );

    expected = clampScore(
      Math.round((expected * 0.45) + (tenkai * 0.2) + (michu * 0.2) + (attack * 0.15))
    );

    return {
      attack,
      tenkai,
      michu,
      local,
      total,
      expected
    };
  }

  function createAILabel(item) {
    const attack = Number(item.attack);
    const tenkai = Number(item.tenkai);
    const michu = Number(item.michu);
    const local = Number(item.local);
    const total = Number(item.total);

    const labels = [];

    if (attack >= 75) labels.push("🔥攻め艇");
    if (tenkai >= 75) labels.push("🌊展開艇");
    if (michu >= 75) labels.push("⚡道中艇");
    if (local >= 75) labels.push("🏠当地巧者");

    if (total >= 80) labels.push("⭐軸候補");
    else if (total >= 68) labels.push("○相手本線");
    else if (total >= 58) labels.push("△押さえ");

    if (!labels.length) {
      return "展開待ち";
    }

    return labels.join(" / ");
  }

  window.ChappyRender.renderAIRankingBox = renderAIRankingBox;
  window.ChappyRender.createAIIndex = createAIIndex;
  window.ChappyRender.normalizeAIIndex = normalizeAIIndex;
  window.ChappyRender.buildAutoAIIndex = buildAutoAIIndex;
  window.ChappyRender.buildAIIndexRankings = buildAIIndexRankings;
  window.ChappyRender.createAIBaseScore = createAIBaseScore;
  window.ChappyRender.createAILabel = createAILabel;

  window.renderAIIndex = renderAIIndex;
    /* =========================================================
    Part 8/10
    オッズ・合成オッズ・期待値
    対応HTML ID：
    - oddsArea
  ========================================================= */

  function renderOdds(data, oddsResult) {
    const odds = createOddsResult(data, oddsResult);

    const body = `
      <div class="odds-wrap">

        <div class="odds-section">
          <h3>💰 3連単オッズ TOP12</h3>
          ${renderOddsTable(odds.trifecta)}
        </div>

        <div class="odds-section">
          <h3>🎯 2連単オッズ</h3>
          ${renderOddsTable(odds.exacta)}
        </div>

        <div class="odds-section">
          <h3>🛟 2連複・拡連複</h3>
          <div class="odds-two-grid">
            <div>
              <h4>2連複</h4>
              ${renderOddsTable(odds.quinella)}
            </div>
            <div>
              <h4>拡連複</h4>
              ${renderOddsTable(odds.place)}
            </div>
          </div>
        </div>

        <div class="odds-section synthetic-odds-box">
          <h3>🧮 合成オッズ</h3>
          ${renderSyntheticOdds(odds.synthetic)}
        </div>

        <div class="odds-section expected-value-box">
          <h3>📈 期待値評価</h3>
          ${renderExpectedValueTable(odds.expected)}
        </div>

      </div>
    `;

    setHTML("oddsArea", panel("💰 オッズ", body, "odds-panel"));
  }

  function renderOddsTable(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("オッズデータなし");
    }

    return `
      <div class="table-scroll">
        <table class="render-table odds-table">
          <thead>
            <tr>
              <th>順位</th>
              <th>買い目</th>
              <th>オッズ</th>
              <th>評価</th>
            </tr>
          </thead>
          <tbody>
            ${list.slice(0, 12).map((item, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><strong>${escapeHTML(item.ticket || item.combination || "-")}</strong></td>
                <td>${escapeHTML(item.odds ?? "-")}</td>
                <td>${escapeHTML(item.comment || judgeOddsComment(item.odds))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderSyntheticOdds(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("合成オッズ計算対象なし");
    }

    return `
      <div class="synthetic-list">
        ${list.map(item => `
          <div class="synthetic-card">
            <div class="synthetic-head">
              <strong>${escapeHTML(item.name || "合成")}</strong>
              <span>${escapeHTML(item.syntheticOdds ?? "-")}倍</span>
            </div>
            <div class="ticket-list">
              ${(item.tickets || []).map(ticket => `
                <div class="ticket-chip">${escapeHTML(ticket)}</div>
              `).join("")}
            </div>
            <p>${escapeHTML(item.comment || "複数買い目をまとめた実質オッズ。")}</p>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderExpectedValueTable(list) {
    if (!Array.isArray(list) || !list.length) {
      return emptyBox("期待値データなし");
    }

    return `
      <div class="table-scroll">
        <table class="render-table expected-table">
          <thead>
            <tr>
              <th>買い目</th>
              <th>オッズ</th>
              <th>的中期待</th>
              <th>期待値</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(item => `
              <tr>
                <td><strong>${escapeHTML(item.ticket || "-")}</strong></td>
                <td>${escapeHTML(item.odds ?? "-")}</td>
                <td>${escapeHTML(item.hitRate ?? "-")}</td>
                <td>${escapeHTML(item.value ?? "-")}</td>
                <td>${escapeHTML(item.judge || "-")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function createOddsResult(data, oddsResult) {
    if (oddsResult) {
      return normalizeOddsResult(oddsResult, data);
    }

    if (data?.odds) {
      return normalizeOddsResult(data.odds, data);
    }

    return buildAutoOddsResult(data);
  }

  function normalizeOddsResult(oddsResult, data) {
    const trifecta = normalizeOddsList(
      oddsResult?.trifecta ||
      oddsResult?.sanrentan ||
      oddsResult?.["3連単"] ||
      []
    );

    const exacta = normalizeOddsList(
      oddsResult?.exacta ||
      oddsResult?.nirentan ||
      oddsResult?.["2連単"] ||
      []
    );

    const quinella = normalizeOddsList(
      oddsResult?.quinella ||
      oddsResult?.nirenpuku ||
      oddsResult?.["2連複"] ||
      []
    );

    const place = normalizeOddsList(
      oddsResult?.place ||
      oddsResult?.wide ||
      oddsResult?.kakurenpuku ||
      oddsResult?.["拡連複"] ||
      []
    );

    const synthetic = normalizeSyntheticOdds(
      oddsResult?.synthetic ||
      oddsResult?.syntheticOdds ||
      oddsResult?.合成オッズ ||
      []
    );

    const expected = normalizeExpectedValue(
      oddsResult?.expected ||
      oddsResult?.expectedValue ||
      oddsResult?.期待値 ||
      []
    );

    const auto = buildAutoOddsResult(data);

    return {
      trifecta: trifecta.length ? trifecta : auto.trifecta,
      exacta: exacta.length ? exacta : auto.exacta,
      quinella: quinella.length ? quinella : auto.quinella,
      place: place.length ? place : auto.place,
      synthetic: synthetic.length ? synthetic : auto.synthetic,
      expected: expected.length ? expected : auto.expected
    };
  }

  function normalizeOddsList(list) {
    if (!Array.isArray(list)) return [];

    return list.map(item => {
      if (typeof item === "string") {
        return {
          ticket: item,
          odds: "-",
          comment: "オッズ確認"
        };
      }

      return {
        ticket: item.ticket || item.combination || item.kumi || item.買い目 || "-",
        odds: item.odds ?? item.オッズ ?? "-",
        comment: item.comment || item.評価 || ""
      };
    });
  }

  function normalizeSyntheticOdds(list) {
    if (!Array.isArray(list)) return [];

    return list.map(item => ({
      name: item.name || item.label || "合成オッズ",
      tickets: Array.isArray(item.tickets)
        ? item.tickets
        : Array.isArray(item.買い目)
          ? item.買い目
          : [],
      syntheticOdds: item.syntheticOdds ?? item.odds ?? item.合成オッズ ?? "-",
      comment: item.comment || item.評価 || ""
    }));
  }

  function normalizeExpectedValue(list) {
    if (!Array.isArray(list)) return [];

    return list.map(item => ({
      ticket: item.ticket || item.combination || item.買い目 || "-",
      odds: item.odds ?? item.オッズ ?? "-",
      hitRate: item.hitRate ?? item.probability ?? item.的中期待 ?? "-",
      value: item.value ?? item.expectedValue ?? item.期待値 ?? "-",
      judge: item.judge || item.判定 || "-"
    }));
  }

  function buildAutoOddsResult(data) {
    const mainSheet = createMainSheet(data);
    const manshuSheet = createManshuSheet(data);

    const mainTickets = [
      ...(mainSheet?.formation?.main || []),
      ...(mainSheet?.formation?.safe || [])
    ];

    const manshuTickets = manshuSheet?.formation || [];

    const trifecta = [
      ...mainTickets.map(ticket => ({
        ticket,
        odds: "-",
        comment: "本線・押さえ候補"
      })),
      ...manshuTickets.map(ticket => ({
        ticket,
        odds: "-",
        comment: "万舟候補"
      }))
    ].slice(0, 12);

    const exacta = mainTickets
      .map(ticket => {
        const parts = String(ticket).split("-");
        return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "";
      })
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .map(ticket => ({
        ticket,
        odds: "-",
        comment: "2連単派生"
      }));

    const quinella = exacta
      .map(item => {
        const parts = item.ticket.split("-");
        return parts.sort().join("-");
      })
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .map(ticket => ({
        ticket,
        odds: "-",
        comment: "2連複派生"
      }));

    const place = quinella.map(item => ({
      ticket: item.ticket,
      odds: "-",
      comment: "拡連複候補"
    }));

    const synthetic = createAutoSyntheticOdds([
      {
        name: "本線セット",
        tickets: mainSheet?.formation?.main || []
      },
      {
        name: "安全押さえセット",
        tickets: mainSheet?.formation?.safe || []
      },
      {
        name: "万舟セット",
        tickets: manshuTickets
      }
    ]);

    const expected = [
      ...mainTickets.map(ticket => ({
        ticket,
        odds: "-",
        hitRate: "高め",
        value: "-",
        judge: "オッズ待ち"
      })),
      ...manshuTickets.map(ticket => ({
        ticket,
        odds: "-",
        hitRate: "中〜低",
        value: "妙味あり",
        judge: "高配当候補"
      }))
    ].slice(0, 12);

    return {
      trifecta,
      exacta,
      quinella,
      place,
      synthetic,
      expected
    };
  }

  function createAutoSyntheticOdds(groups) {
    return groups
      .filter(group => Array.isArray(group.tickets) && group.tickets.length)
      .map(group => ({
        name: group.name,
        tickets: group.tickets,
        syntheticOdds: "-",
        comment: "実オッズ取得後に 1 ÷（各買い目の 1/オッズ 合計）で計算。"
      }));
  }

  function calcSyntheticOdds(oddsList) {
    if (!Array.isArray(oddsList) || !oddsList.length) return null;

    const inverseSum = oddsList.reduce((sum, odds) => {
      const n = Number(odds);
      if (Number.isNaN(n) || n <= 0) return sum;
      return sum + (1 / n);
    }, 0);

    if (inverseSum <= 0) return null;

    return Math.round((1 / inverseSum) * 10) / 10;
  }

  function judgeOddsComment(odds) {
    const n = Number(odds);

    if (Number.isNaN(n)) return "オッズ待ち";
    if (n < 5) return "人気寄り";
    if (n < 15) return "本線圏";
    if (n < 40) return "妙味あり";
    if (n < 100) return "穴候補";
    return "万舟候補";
  }

  window.ChappyRender.renderOddsTable = renderOddsTable;
  window.ChappyRender.renderSyntheticOdds = renderSyntheticOdds;
  window.ChappyRender.renderExpectedValueTable = renderExpectedValueTable;
  window.ChappyRender.createOddsResult = createOddsResult;
  window.ChappyRender.normalizeOddsResult = normalizeOddsResult;
  window.ChappyRender.normalizeOddsList = normalizeOddsList;
  window.ChappyRender.normalizeSyntheticOdds = normalizeSyntheticOdds;
  window.ChappyRender.normalizeExpectedValue = normalizeExpectedValue;
  window.ChappyRender.buildAutoOddsResult = buildAutoOddsResult;
  window.ChappyRender.createAutoSyntheticOdds = createAutoSyntheticOdds;
  window.ChappyRender.calcSyntheticOdds = calcSyntheticOdds;
  window.ChappyRender.judgeOddsComment = judgeOddsComment;

  window.renderOdds = renderOdds;
    /* =========================================================
    Part 9/10
    成績管理・データ確認・最終コメント
    対応HTML ID：
    - statsArea
    - missingArea
    - historyArea
    - finalCommentArea
  ========================================================= */

  function renderStats(statsData) {
    const stats = normalizeStats(statsData);

    const body = `
      <div class="stats-grid">
        ${miniItem("購入レース数", `${stats.totalRaces}R`)}
        ${miniItem("的中数", `${stats.hitCount}回`)}
        ${miniItem("的中率", `${stats.hitRate}%`)}
        ${miniItem("購入額", `${stats.totalBet.toLocaleString()}円`)}
        ${miniItem("払戻額", `${stats.totalPayout.toLocaleString()}円`)}
        ${miniItem("回収率", `${stats.returnRate}%`)}
      </div>

      <div class="stats-comment ${stats.returnRate >= 100 ? "good" : "normal"}">
        ${escapeHTML(stats.comment)}
      </div>
    `;

    setHTML("statsArea", body);
  }

  function renderMissing(data) {
    const missing = createMissingCheck(data);

    const body = `
      <div class="missing-check-list">
        ${missing.items.map(item => `
          <div class="missing-check-item ${item.ok ? "ok" : "ng"}">
            <span>${item.ok ? "✅" : "⚠️"}</span>
            <strong>${escapeHTML(item.label)}</strong>
            <p>${escapeHTML(item.comment)}</p>
          </div>
        `).join("")}
      </div>
    `;

    setHTML("missingArea", body);
  }

  function renderHistory(historyData) {
    const history = normalizeHistory(historyData);

    if (!history.length) {
      setHTML("historyArea", emptyBox("保存履歴はまだありません"));
      return;
    }

    const body = `
      <div class="table-scroll">
        <table class="render-table history-table">
          <thead>
            <tr>
              <th>日付</th>
              <th>場</th>
              <th>R</th>
              <th>結果</th>
              <th>オッズ</th>
              <th>購入額</th>
              <th>払戻</th>
            </tr>
          </thead>
          <tbody>
            ${history.slice(0, 20).map(item => `
              <tr>
                <td>${escapeHTML(item.date)}</td>
                <td>${escapeHTML(item.place)}</td>
                <td>${escapeHTML(item.raceNo)}</td>
                <td><strong>${escapeHTML(item.result)}</strong></td>
                <td>${escapeHTML(item.odds)}</td>
                <td>${escapeHTML(item.betAmount)}円</td>
                <td>${escapeHTML(item.payout)}円</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    setHTML("historyArea", body);
  }

  function renderFinalComment(data, prediction) {
    const entries = normalizeEntries(data);

    if (!entries.length) {
      setHTML("finalCommentArea", emptyBox("コメント生成に必要なデータがありません"));
      return;
    }

    const mainSheet = createMainSheet(data, prediction);
    const manshuSheet = createManshuSheet(data, prediction);
    const aiIndex = createAIIndex(data);

    const top = mainSheet.honmei;
    const rival = mainSheet.taikou;
    const manshu = manshuSheet.candidates?.[0];
    const aiTop = aiIndex.scores?.[0];

    const comment = createFinalCommentText({
      top,
      rival,
      manshu,
      aiTop
    });

    const body = `
      <div class="final-comment-box">
        <p>${escapeHTML(comment)}</p>

        <div class="final-comment-tags">
          ${top ? `<span>◎ ${escapeHTML(top.boatNo)}号艇</span>` : ""}
          ${rival ? `<span>○ ${escapeHTML(rival.boatNo)}号艇</span>` : ""}
          ${manshu ? `<span>💣 ${escapeHTML(manshu.boatNo)}号艇</span>` : ""}
          ${aiTop ? `<span>⭐ AI ${escapeHTML(aiTop.boatNo)}号艇</span>` : ""}
        </div>
      </div>
    `;

    setHTML("finalCommentArea", body);
  }

  function normalizeStats(statsData) {
    const data = statsData || {};

    const totalRaces = Number(data.totalRaces ?? data.count ?? 0);
    const hitCount = Number(data.hitCount ?? data.hits ?? 0);
    const totalBet = Number(data.totalBet ?? data.bet ?? 0);
    const totalPayout = Number(data.totalPayout ?? data.payout ?? 0);

    const hitRate = totalRaces > 0
      ? Math.round((hitCount / totalRaces) * 1000) / 10
      : 0;

    const returnRate = totalBet > 0
      ? Math.round((totalPayout / totalBet) * 1000) / 10
      : 0;

    return {
      totalRaces,
      hitCount,
      hitRate,
      totalBet,
      totalPayout,
      returnRate,
      comment: createStatsComment(hitRate, returnRate)
    };
  }

  function createStatsComment(hitRate, returnRate) {
    if (returnRate >= 120) {
      return "回収率はかなり良い状態。万舟と本線のバランスが取れている。";
    }

    if (returnRate >= 100) {
      return "回収率100%超え。買い目の絞り方は悪くない。";
    }

    if (hitRate >= 40 && returnRate < 100) {
      return "的中率はあるが、人気寄りに偏っている可能性。合成オッズを見て厚薄調整。";
    }

    if (hitRate < 25) {
      return "的中率が低め。まず本線と押さえの精度を優先。";
    }

    return "現在は標準状態。本線・押さえ・万舟を分けて記録していく。";
  }

  function createMissingCheck(data) {
    const entries = normalizeEntries(data);
    const beforeInfo = normalizeBeforeInfo(data);
    const weather = normalizeWeather(data);
    const odds = data?.odds || {};
    const missingNumbers = data?.missingNumbers || data?.missing || [];

    const items = [
      {
        label: "出走表",
        ok: entries.length === 6,
        comment: entries.length === 6
          ? "6艇取得済み"
          : `取得数 ${entries.length}。6艇未満です。`
      },
      {
        label: "直前情報",
        ok: Boolean(beforeInfo && Object.keys(beforeInfo).length),
        comment: beforeInfo && Object.keys(beforeInfo).length
          ? "beforeInfo取得済み"
          : "直前情報が未取得です。"
      },
      {
        label: "気象",
        ok: Boolean(weather && Object.keys(weather).length),
        comment: weather && Object.keys(weather).length
          ? "気象データあり"
          : "気象データが未取得です。"
      },
      {
        label: "オッズ",
        ok: Boolean(odds && Object.keys(odds).length),
        comment: odds && Object.keys(odds).length
          ? "オッズデータあり"
          : "オッズは未取得または空です。"
      },
      {
        label: "出てない目",
        ok: Array.isArray(missingNumbers) && missingNumbers.length > 0,
        comment: Array.isArray(missingNumbers) && missingNumbers.length > 0
          ? `${missingNumbers.length}件あり`
          : "出てない目データなし"
      }
    ];

    return { items };
  }

  function normalizeHistory(historyData) {
    if (!Array.isArray(historyData)) return [];

    return historyData.map(item => ({
      date: item.date || item.savedAt || "-",
      place: item.place || item.stadiumName || "-",
      raceNo: item.raceNo || item.rno || "-",
      result: item.result || item.raceResult || "-",
      odds: item.odds ?? "-",
      betAmount: item.betAmount ?? item.bet ?? 0,
      payout: item.payout ?? 0
    }));
  }

  function createFinalCommentText(params) {
    const top = params.top;
    const rival = params.rival;
    const manshu = params.manshu;
    const aiTop = params.aiTop;

    const parts = [];

    if (top) {
      parts.push(`本線は${top.boatNo}号艇を中心。${top.comment || "総合評価が高い。"}。`);
    }

    if (rival) {
      parts.push(`相手は${rival.boatNo}号艇。2着・3着の両方で残したい。`);
    }

    if (manshu) {
      parts.push(`万舟を見るなら${manshu.boatNo}号艇の絡み。${manshu.reason || "展開がズレた時の配当妙味あり。"}。`);
    }

    if (aiTop && (!top || aiTop.boatNo !== top.boatNo)) {
      parts.push(`AI指数では${aiTop.boatNo}号艇も高評価。スコア差に注意。`);
    }

    if (!parts.length) {
      return "データ取得後、情報→展開→スコア→フォーメーションの順で最終判断。";
    }

    return parts.join(" ");
  }

  function renderAll(data, options = {}) {
    renderEntryTable(data);
    renderMaterialPanel(data);
    renderRaceFlow(data, options.prediction);
    renderMainSheet(data, options.prediction);
    renderManshuSheet(data, options.prediction);
    renderTheory(data, options.theory);
    renderAIIndex(data, options.ai);
    renderOdds(data, options.odds);
    renderWeather(data);
    renderVenue(data);
    renderMissing(data);
    renderFinalComment(data, options.prediction);

    if (options.stats) {
      renderStats(options.stats);
    }

    if (options.history) {
      renderHistory(options.history);
    }
  }

  window.ChappyRender.renderStats = renderStats;
  window.ChappyRender.renderMissing = renderMissing;
  window.ChappyRender.renderHistory = renderHistory;
  window.ChappyRender.renderFinalComment = renderFinalComment;
  window.ChappyRender.normalizeStats = normalizeStats;
  window.ChappyRender.createStatsComment = createStatsComment;
  window.ChappyRender.createMissingCheck = createMissingCheck;
  window.ChappyRender.normalizeHistory = normalizeHistory;
  window.ChappyRender.createFinalCommentText = createFinalCommentText;
  window.ChappyRender.renderAll = renderAll;

  window.renderStats = renderStats;
  window.renderMissing = renderMissing;
  window.renderHistory = renderHistory;
  window.renderFinalComment = renderFinalComment;
  window.renderAll = renderAll;
    /* =========================================================
    Part 10/10
    閉じ処理・互換関数・初期化チェック
  ========================================================= */

  function renderError(message) {
    setHTML(
      "errorArea",
      `
        <div class="panel error-panel">
          <h2>⚠️ エラー</h2>
          <p>${escapeHTML(message || "エラーが発生しました")}</p>
        </div>
      `
    );
  }

  function clearError() {
    clearHTML("errorArea");
  }

  function renderLoading(message = "読み込み中...") {
    const status = $("statusArea");
    if (status) {
      status.textContent = message;
    }
  }

  function renderStatus(message = "待機中") {
    const status = $("statusArea");
    if (status) {
      status.textContent = message;
    }
  }

  function clearRenderAreas() {
    [
      "raceListArea",
      "engineArea",
      "raceFlowArea",
      "mainSheetArea",
      "formationArea",
      "manshuSheetArea",
      "alertArea",
      "oddsArea",
      "weatherArea",
      "venueArea",
      "theorySummaryArea",
      "theoryAlertArea",
      "aiIndexArea",
      "attackRankingArea",
      "expectedValueArea",
      "tenkaiIndexArea",
      "statsArea",
      "missingArea",
      "historyArea",
      "finalCommentArea"
    ].forEach(clearHTML);
  }

  function renderRaceList(data) {
    renderEntryTable(data);
  }

  function renderEngine(data) {
    renderMaterialPanel(data);
  }

  function renderMaterial(data) {
    renderMaterialPanel(data);
  }

  function renderPrediction(data, prediction) {
    renderRaceFlow(data, prediction);
    renderMainSheet(data, prediction);
    renderManshuSheet(data, prediction);
    renderFinalComment(data, prediction);
  }

  function renderTheorySummary(data, theoryResult) {
    renderTheory(data, theoryResult);
  }

  function renderChappyAI(data, aiResult) {
    renderAIIndex(data, aiResult);
  }

  function initRender() {
    console.log("✅ render.js loaded");
    console.log("✅ ChappyRender ready", Object.keys(window.ChappyRender || {}));
  }

  window.ChappyRender.renderError = renderError;
  window.ChappyRender.clearError = clearError;
  window.ChappyRender.renderLoading = renderLoading;
  window.ChappyRender.renderStatus = renderStatus;
  window.ChappyRender.clearRenderAreas = clearRenderAreas;
  window.ChappyRender.renderRaceList = renderRaceList;
  window.ChappyRender.renderEngine = renderEngine;
  window.ChappyRender.renderMaterial = renderMaterial;
  window.ChappyRender.renderPrediction = renderPrediction;
  window.ChappyRender.renderTheorySummary = renderTheorySummary;
  window.ChappyRender.renderChappyAI = renderChappyAI;
  window.ChappyRender.initRender = initRender;

  window.renderError = renderError;
  window.clearError = clearError;
  window.renderLoading = renderLoading;
  window.renderStatus = renderStatus;
  window.clearRenderAreas = clearRenderAreas;

  window.renderRaceList = renderRaceList;
  window.renderEngine = renderEngine;
  window.renderMaterial = renderMaterial;
  window.renderPrediction = renderPrediction;
  window.renderTheorySummary = renderTheorySummary;
  window.renderChappyAI = renderChappyAI;

  initRender();

})();