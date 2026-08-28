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

  const RENDER_VERSION = "render-ui-v3.7.1-formation-display";

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

    return String(value)
      .replace(/independent-scenario/g, "独立展開");
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

  function displayOddsText(item, numericOdds, hasOdds) {
    if (
      item?.isFinalRetrievedOdds === true &&
      item.oddsText
    ) {
      return item.oddsText;
    }

    return hasOdds
      ? `${numericOdds}倍`
      : item?.oddsText || "オッズ未取得";
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

  function userFacingFormationText(value) {
    return safeText(value, "")
      .replace(/実進入・位置関係(\d+)\/15/g, "実進入・位置関係$1/25")
      .replace(/canonical[-_ ]formation/gi, "フォーメーション")
      .replace(/残り全艇へ流す/g, "残り全艇に組む")
      .replace(/全艇へ流す/g, "全艇に組む")
      .replace(/流し候補/g, "フォーメーション候補")
      .replace(/流し展開/g, "フォーメーション")
      .replace(/流し/g, "フォーメーション");
  }

  function practicalDisplayCategory(row) {
    if (row?.selectionTier === "順位ゲート置換") {
      return "順位ゲート補完";
    }
    if (row?.selectionTier === "候補補完") {
      return "候補補完";
    }
    if (row?.selectionTier === "展開追加") {
      return "独立展開";
    }
    if (
      [
        "順位ゲート補完",
        "候補補完",
        "独立展開"
      ].includes(row?.category)
    ) {
      return row.category;
    }
    if (row?.category === "流し") {
      return "フォーメーション";
    }

    return userFacingFormationText(
      row?.displayCategory ||
      row?.category ||
      "買い目"
    );
  }

  function resolvePracticalSelection(
    prediction
  ) {
    if (
      prediction
        ?.practicalSelection &&
      typeof prediction
        .practicalSelection ===
        "object"
    ) {
      return prediction
        .practicalSelection;
    }

    const selector =
      window
        .ChappyPracticalSelection;
    const selection =
      selector &&
      typeof selector.select ===
        "function"
        ? selector.select(
            prediction
          )
        : null;

    if (
      selection &&
      typeof selection ===
        "object"
    ) {
      prediction.practicalSelection =
        selection;

      if (
        !prediction
          .verificationEvidence &&
        selection
          .verificationEvidence
      ) {
        prediction
          .verificationEvidence =
          selection
            .verificationEvidence;
      }
    }

    return selection;
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

  if (!prediction || typeof prediction !== "object") {
    root.innerHTML = renderError(
      "予想データがありません",
      "prediction.js から予想データが返っていません。"
    );
    return;
  }

  /*
    実戦選定は1描画につき1回だけ生成し、
    AI総合・実戦厳選・保存が同じ監査世代を見る。
  */
  resolvePracticalSelection(
    prediction
  );

  const html = `
    <div
      class="v3-root app-prediction-layout"
      data-render-version="${escapeHtml(RENDER_VERSION)}"
    >

      <!-- 1. レース基本情報 -->
      <div id="raceInfoArea"></div>

      <!-- 2. 出走表 -->
      ${renderEntryTable(prediction)}

      <!-- 3. AI総合評価 -->
      ${renderAiSummary(prediction)}

      <!-- 3.5 公式履歴分析 -->
      ${renderOfficialHistory(
        prediction
      )}

      <!-- 4. 本命買い目 -->
      ${renderNewspaperSheet(prediction, "main")}

      <!-- 5. 万舟買い目 -->
      ${renderNewspaperSheet(prediction, "manshu")}

      <!-- 5.5 出てない目TOP30 -->
      ${renderMissingNumbers(
        prediction
      )}

            <!-- 6. 実戦厳選 -->
      ${renderPracticalSelection(prediction)}

      ${
        Array.isArray(
          prediction.oddsMovements
        ) &&
        prediction.oddsMovements.length
          ? section(
              "オッズ変動アラート",
              prediction.oddsMovements
                .map(item => {
                  const isDrop =
                    item?.direction ===
                    "急落";

                  const changeRate =
                    Math.abs(
                      safeNum(
                        item?.changeRate,
                        0
                      )
                    ).toFixed(1);

                  return `
                    <div
                      class="
                        ticket-row
                        ${
                          isDrop
                            ? "ticket-rank-A"
                            : "ticket-rank-C"
                        }
                      "
                    >
                      <div
                        class="ticket-main"
                      >
                        <strong>
                          ${ticketArrow(
                            item?.ticket ||
                            "-"
                          )}
                        </strong>

                        <span
                          class="
                            ticket-rank-badge
                          "
                        >
                          ${
                            isDrop
                              ? "🔻 急落"
                              : "🔺 上昇"
                          }
                          ${escapeHtml(
                            changeRate
                          )}%
                        </span>

                        <span
                          class="ticket-odds"
                        >
                          ${escapeHtml(
                            item?.previousOdds
                          )}倍
                          →
                          ${escapeHtml(
                            item?.currentOdds
                          )}倍
                        </span>
                      </div>

                      <p
                        class="ticket-reason"
                      >
                        ${
                          isDrop
                            ? "人気が集まり、オッズが急落しています。"
                            : "オッズが上昇し、人気が下がっています。"
                        }
                      </p>
                    </div>
                  `;
                })
                .join(""),
              "📈",
              "v3-odds-movement-section"
            )
          : ""
      }

      <!-- 10. 最終結論 -->
      ${renderFinalComment(prediction)}

      ${renderDebug(prediction)}

    </div>
  `;

  root.innerHTML = html;
  renderRaceInfo(prediction);
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

　　const raceInfoArea = document.getElementById("raceInfoArea");

if (raceInfoArea) {
  raceInfoArea.innerHTML = section(
    "レース情報",
    body,
    "🚤",
    "v3-race-section"
  );
　　}
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

  function entryLaneNumber(entry, index) {
    const source = entry && typeof entry === "object" ? entry : {};
    const primitiveBoat =
      source.boat !== null &&
      typeof source.boat !== "object"
        ? source.boat
        : null;
    const normalizedBoatNo =
      source.boat &&
      typeof source.boat === "object"
        ? source.boatNo
        : null;
    const candidates = [
      source.no,
      source.waku,
      normalizedBoatNo,
      primitiveBoat,
      source.lane,
      source.course,
      source.boatNo
    ];

    for (const value of candidates) {
      const lane = Number(value);
      if (Number.isInteger(lane) && lane >= 1 && lane <= 6) {
        return lane;
      }
    }

    return index + 1;
  }

  function findEntryByLane(entries, lane) {
    const target = Number(lane);
    if (!Array.isArray(entries) || !Number.isInteger(target)) return null;
    return entries.find((entry, index) =>
      entryLaneNumber(entry, index) === target
    ) || null;
  }

  function firstEntryValue(...values) {
    return values.find(
      value =>
        value !== null &&
        value !== undefined &&
        value !== ""
    );
  }

  function formatEntryNumber(value, digits = 2) {
    const source = firstEntryValue(value);
    if (source === undefined) return "-";
    const numeric = Number(source);
    return Number.isFinite(numeric)
      ? numeric.toFixed(digits)
      : safeText(source, "-");
  }

  function formatEntryPercent(value) {
    const source = firstEntryValue(value);
    if (source === undefined) return "-";

    const numeric = Number(
      String(source)
        .replace(/[％%]/g, "")
        .trim()
    );

    return Number.isFinite(numeric)
      ? `${numeric.toFixed(2)}%`
      : "-";
  }

  function entryPenaltyCount(entry, key) {
    const source = entry && typeof entry === "object" ? entry : {};
    const raw = source.raw && typeof source.raw === "object" ? source.raw : {};
    const direct = key === "F"
      ? firstEntryValue(
          source.fCount,
          source.falseStartCount,
          raw.fCount,
          raw.falseStartCount
        )
      : firstEntryValue(
          source.lCount,
          source.lateStartCount,
          raw.lCount,
          raw.lateStartCount
        );

    if (direct !== undefined && Number.isFinite(Number(direct))) {
      return `${key}${Number(direct)}`;
    }

    const flText = String(
      firstEntryValue(source.fl, source.flyingLate, raw.fl) || ""
    );
    const match = flText.match(new RegExp(`${key}\\s*(\\d+)`, "i"));
    return match ? `${key}${Number(match[1])}` : `${key}-`;
  }

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

  const cards = entries.map((e, index) => {
    const no = entryLaneNumber(e, index);
    const raw = e.raw && typeof e.raw === "object" ? e.raw : {};
    const name = firstEntryValue(
      e.name,
      e.racerName,
      e.player,
      raw.name,
      raw.racerName
    ) || "-";
    const registerNo = firstEntryValue(
      e.registerNo,
      e.registrationNo,
      e.racerNo,
      raw.registerNo
    ) || "-";
    const grade = firstEntryValue(
      e.className,
      e.grade,
      e.class,
      e.rank,
      raw.className,
      raw.grade
    ) || "-";
    const branch = firstEntryValue(
      e.branch,
      e.prefecture,
      raw.branch
    ) || "-";
    const birthplace = firstEntryValue(
      e.birthplace,
      e.birthPlace,
      e.hometown,
      raw.birthplace,
      raw.birthPlace
    ) || "-";
    const age = firstEntryValue(e.age, raw.age);
    const weight = firstEntryValue(
      e.weight,
      e.exhibition?.weight,
      raw.weight,
      raw.exhibition?.weight
    );
    const st = firstEntryValue(
      e.avgST,
      e.avgSt,
      e.averageST,
      e.averageSt,
      e.st,
      raw.avgST,
      raw.avgSt
    );
    const national = firstEntryValue(
      e.nationalWinRate,
      e.nationalRate,
      e.national?.winRate,
      e.national?.rate,
      raw.nationalWinRate
    );
    const local = firstEntryValue(
      e.localWinRate,
      e.localRate,
      e.venueRate,
      e.courseRate,
      e.local?.winRate,
      e.local?.rate,
      typeof e.local !== "object" ? e.local : undefined,
      raw.localWinRate
    );
    const motorSecondRate = firstEntryValue(
      e.motor2Rate,
      e.motorSecondRate,
      e.motor?.secondRate,
      e.motor?.quinellaRate,
      e.motorInfo?.secondRate,
      raw.motor2Rate
    );
    const ageWeight = [
      age === undefined ? "-歳" : `${safeText(age)}歳`,
      weight === undefined ? "-kg" : `${formatEntryNumber(weight, 1)}kg`
    ].join("/");
    const cardLabel =
      `${no}号艇 ${safeText(name)}`;

    return `
      <article class="v3-entry-card" data-boat="${escapeHtml(no)}" role="listitem" aria-label="${escapeHtml(cardLabel)}">
        <div class="v3-entry-card-boat" aria-hidden="true">${boatBadge(no, "small")}</div>

        <div class="v3-entry-card-player">
          <h3>${escapeHtml(name)}</h3>
          <span class="v3-entry-card-meta">
            ${escapeHtml(registerNo)}<i aria-hidden="true">|</i>${escapeHtml(grade)}<i aria-hidden="true">|</i>${escapeHtml(branch)}/${escapeHtml(birthplace)}<i aria-hidden="true">|</i>${escapeHtml(ageWeight)}
          </span>
          <span class="v3-entry-card-start">
            平均ST ${escapeHtml(formatEntryNumber(st, 2))}<i aria-hidden="true">|</i>${escapeHtml(entryPenaltyCount(e, "F"))}<i aria-hidden="true">|</i>${escapeHtml(entryPenaltyCount(e, "L"))}
          </span>
        </div>

        <div class="v3-entry-card-stats">
          <span>全国 <strong>${escapeHtml(formatEntryNumber(national, 2))}</strong></span>
          <span>当地 <strong>${escapeHtml(formatEntryNumber(local, 2))}</strong></span>
          <span aria-label="モーター2連率 ${escapeHtml(formatEntryPercent(motorSecondRate))}">M <strong aria-hidden="true">${escapeHtml(formatEntryPercent(motorSecondRate))}</strong></span>
        </div>
      </article>
    `;
  }).join("");

  const body = `
    <div class="v3-entry-card-list" role="list" aria-label="出走表 6艇">
      ${cards}
    </div>
  `;

  return section("出走表", body, "👥", "v3-entry-section");
}
    /* ===============================
    3. AI総合
  =============================== */

  function renderAiSummary(prediction) {
  const confidence = prediction.confidence || {};
  const finalAi = prediction.finalAi || {};

  const confidenceScore =
    confidence.score ??
    confidence.value ??
    confidence.percent ??
    prediction.confidenceScore ??
    0;

  const simpleEvaluation =
    prediction.simpleEvaluation ||
    finalAi.simpleEvaluation ||
    (
      window
        .ChappyPredictionSimpleEvaluation
        ?.build?.(prediction)
    ) ||
    {
      mode: "main",
      label: "本線信頼度",
      level:
        levelLabel(
          confidenceScore,
          "高",
          "中",
          "低"
        ),
      score: confidenceScore,
      mainComment:
        confidence.reason ||
        confidence.comment ||
        ""
    };
  const evaluationScore =
    safeNum(
      simpleEvaluation.score,
      confidenceScore
    );
  const verificationEvidence =
    prediction
      .practicalSelection
      ?.verificationEvidence ||
    prediction.verificationEvidence ||
    {};
  const isRetrospective =
    prediction.isRetrospective ===
      true ||
    String(
      prediction.predictionMode ||
      ""
    )
      .trim()
      .toLowerCase() ===
      "retrospective_reference";
  const calibrationView =
    window
      .ChappyPredictionCalibration
      ?.displayFor?.({
        score: evaluationScore,
        mode:
          simpleEvaluation.mode ||
          "",
        isRetrospective,
        predictionMode:
          prediction.predictionMode ||
          "",
        generation:
          verificationEvidence
            .generation || {}
      }) ||
    {
      status: "unavailable",
      sampleSize: 0,
      message:
        "実績校正データを取得できません。予想はそのまま確認できます。"
    };
  const calibrationGenerationKey =
    window
      .ChappyPredictionCalibration
      ?.generationKey?.(
        verificationEvidence
          .generation || {}
      ) || "";
  const calibrationMessage =
    calibrationView.message ||
    (
      calibrationView.status ===
        "collecting"
        ? `実績校正：新方式データを蓄積中（${safeNum(calibrationView.sampleSize, 0)}/30R）`
        : "実績校正データを確認できません"
    );

  const body = `
    <div class="v3-ai-grid v3-ai-grid-single">
      ${renderAiMeter(
        `${simpleEvaluation.label || "AI評価"}（内部指数）`,
        evaluationScore,
        simpleEvaluation.level ||
          levelLabel(
            evaluationScore,
            "高",
            "中",
            "低"
          ),
        simpleEvaluation.mainComment ||
          confidence.reason ||
          confidence.comment ||
          "",
        "点"
      )}
    </div>
    <div
      class="v3-ai-calibration is-${escapeHtml(
        calibrationView.status ||
        "collecting"
      )}"
      data-calibration-status="${escapeHtml(
        calibrationView.status ||
        "collecting"
      )}"
      data-calibration-score="${escapeHtml(
        evaluationScore
      )}"
      data-calibration-generation="${escapeHtml(
        calibrationGenerationKey
      )}"
      data-calibration-mode="${escapeHtml(
        simpleEvaluation.mode ||
        ""
      )}"
      data-calibration-retrospective="${escapeHtml(
        isRetrospective
          ? "true"
          : "false"
      )}"
      data-calibration-prediction-mode="${escapeHtml(
        prediction.predictionMode ||
        ""
      )}"
    >
      <strong>${escapeHtml(calibrationMessage)}</strong>
      <p>
        内部指数は予想同士を比較する評価点で、的中確率ではありません。
      </p>
    </div>
    ${
      prediction.dataQuality &&
      typeof prediction
        .dataQuality === "object"
        ? `
          <div
            class="v3-ai-summary-box"
          >
            <h3>
              データ充足度
              ${escapeHtml(
                prediction
                  .dataQuality
                  .score ?? 0
              )}%
              （${escapeHtml(
                prediction
                  .dataQuality
                  .level || "低"
              )}）
            </h3>

            <div class="v3-ai-bar">
              <div
                style="
                  width:
                    ${Math.max(
                      0,
                      Math.min(
                        100,
                        safeNum(
                          prediction
                            .dataQuality
                            .score,
                          0
                        )
                      )
                    )}%;
                  background:
                    ${
                      safeNum(
                        prediction
                          .dataQuality
                          .score,
                        0
                      ) >= 90
                        ? "#16a34a"
                        : safeNum(
                            prediction
                              .dataQuality
                              .score,
                            0
                          ) >= 70
                          ? "#f59e0b"
                          : "#ef4444"
                    };
                "
              ></div>
            </div>

            ${
              arrayify(
                prediction
                  .dataQuality
                  .warnings
              ).length
                ? `
                  <div
                    class="v3-tag-row"
                  >
                    ${arrayify(
                      prediction
                        .dataQuality
                        .warnings
                    )
                      .map(
                        warning => `
                          <span
                            class="v3-tag"
                          >
                            ⚠️
                            ${escapeHtml(
                              warning
                            )}
                          </span>
                        `
                      )
                      .join("")}
                  </div>

                  <p>
                    不足データがあるため、
                    予想精度が下がる可能性があります。
                  </p>
                `
                : `
                  <p>
                    必要な予想データは
                    揃っています。
                  </p>
                `
            }
          </div>
        `
        : ""
    }

  `;

  return section("AI総合", body, "📊", "v3-ai-summary");
}

  function refreshCalibrationDisplays() {
    const calibration =
      window
        .ChappyPredictionCalibration;

    document
      .querySelectorAll(
        ".v3-ai-calibration[data-calibration-score]"
      )
      .forEach(element => {
        const view =
          calibration?.displayFor
            ? calibration.displayFor({
                score:
                  element.dataset
                    .calibrationScore,
                mode:
                  element.dataset
                    .calibrationMode,
                isRetrospective:
                  element.dataset
                    .calibrationRetrospective ===
                  "true",
                predictionMode:
                  element.dataset
                    .calibrationPredictionMode,
                generationKey:
                  element.dataset
                    .calibrationGeneration
              })
            : {
                status:
                  "unavailable",
                message:
                  "実績校正データを取得できません。予想はそのまま確認できます。"
              };
        const rawStatus =
          String(
            view?.status ||
            "collecting"
          );
        const status =
          [
            "collecting",
            "reference",
            "trend",
            "ready",
            "unavailable"
          ].includes(rawStatus)
            ? rawStatus
            : "unavailable";
        const message =
          element.querySelector(
            "strong"
          );

        element.classList.remove(
          "is-collecting",
          "is-reference",
          "is-trend",
          "is-ready",
          "is-unavailable"
        );
        element.classList.add(
          `is-${status}`
        );
        element.dataset
          .calibrationStatus =
          status;

        if (message) {
          message.textContent =
            view?.message ||
            "実績校正データを確認できません";
        }
      });
  }

  function renderAiMeter(
    label,
    score,
    level,
    comment,
    unit = "%"
  ) {
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
          ${escapeHtml(
            unit === "%"
              ? percent(score)
              : `${Math.round(
                  safeNum(score, 0)
                )}${unit}`
          )}
        </div>

        <div class="v3-ai-bar">
          <div style="width:${Math.max(0, Math.min(100, safeNum(score, 0)))}%"></div>
        </div>

        ${
          comment
            ? `<p>${escapeHtml(comment)}</p>`
            : ""
        }
      </div>
    `;
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

  function renderCombinedOddsTag(
    prediction,
    key
  ) {
    const combined =
      prediction.combinedOdds || {};

    const category =
      combined.categories?.[key];

    if (category) {
      if (!category.totalCount) {
        return "";
      }

      const countText =
        `取得 ${category.availableCount}/${category.totalCount}`;

      if (category.isFormal) {
        return tag(
          `合成 ${Number(category.combinedOdds).toFixed(1)}倍・${countText}`,
          "odds"
        );
      }

      if (
        Number.isFinite(
          Number(
            category.referenceCombinedOdds
          )
        ) &&
        Number(
          category.referenceCombinedOdds
        ) > 0
      ) {
        return tag(
          `参考 ${Number(category.referenceCombinedOdds).toFixed(1)}倍・${countText}`,
          "odds"
        );
      }

      return tag(
        `オッズ ${countText}`,
        "odds"
      );
    }

    const odds = Number(
      combined[key]
    );

    if (
      !Number.isFinite(odds) ||
      odds <= 0
    ) {
      return "";
    }

    return tag(
      `合成 ${odds.toFixed(1)}倍`,
      "odds"
    );
  }

  function normalizeFlowFormationRows(
    prediction
  ) {
    const source =
      prediction?.mainSheet
        ?.flowFormations ||
      prediction?.formation
        ?.flowFormations ||
      prediction?.formations
        ?.flowFormations ||
      [];

    return arrayify(source)
      .map(item => {
        const row =
          item &&
          typeof item === "object"
            ? item
            : {};
        const headBoatNo = Number(
          row.headBoatNo ??
          row.head ??
          0
        );
        const secondBoatNos = [
          ...new Set(
            arrayify(
              row.secondBoatNos ??
              row.seconds
            )
              .map(Number)
              .filter(
                boatNo =>
                  boatNo >= 1 &&
                  boatNo <= 6 &&
                  boatNo !== headBoatNo
              )
          )
        ].slice(0, 3);
        const notation = String(
          row.notation ||
          row.display ||
          (
            headBoatNo &&
            secondBoatNos.length
              ? `${headBoatNo}-${secondBoatNos.join("")}-全`
              : ""
          )
        ).trim();
        const expandedCount =
          arrayify(
            row.expandedTickets ||
            row.tickets
          ).length;
        const pointCount = Number(
          row.pointCount ??
          row.ticketCount ??
          (
            expandedCount ||
            secondBoatNos.length * 4
          )
        );

        if (
          !notation ||
          !headBoatNo ||
          !secondBoatNos.length ||
          ![4, 8, 12].includes(
            pointCount
          )
        ) {
          return null;
        }

        return {
          ticket: notation,
          category: "流し",
          displayCategory: "フォーメーション",
          categories: ["流し"],
          displayCategories: ["フォーメーション"],
          scenarioType:
            userFacingFormationText(
              row.scenarioType || ""
            ),
          scenarioTypes:
            row.scenarioType
              ? [
                  userFacingFormationText(
                    row.scenarioType
                  )
                ]
              : [],
          oddsText: `${pointCount}点`,
          pointCount,
          scenarioSummary:
            userFacingFormationText(
              row.reason ||
              row.scenarioSummary ||
              `${headBoatNo}号艇を1着に固定し、` +
                `${secondBoatNos.join("・")}号艇を2着、` +
                "3着を残り全艇に組む。"
            ),
          isFlowFormation: true
        };
      })
      .filter(Boolean);
  }


  function renderTicketAccordion(
    label,
    type,
    body,
    pointCount,
    aim,
    open = false
  ) {
    if (!body) return "";

    return       `<details
        name="chappy-ticket-accordion"
        class="v3-ticket-accordion v3-ticket-accordion-${escapeHtml(type)}"
        ${open ? "open" : ""}
      >
        <summary>
          <span>${escapeHtml(label)}</span>
          <span class="v3-ticket-accordion-count">
            ${escapeHtml(pointCount)}点
          </span>
          <span class="v3-ticket-accordion-arrow" aria-hidden="true"></span>
        </summary>
        <div class="v3-ticket-accordion-panel">
          <div class="v3-ticket-accordion-aim">
            <strong>買い目の狙い</strong>
            <p>${escapeHtml(aim || "この分類で成立度が高い買い目を表示します。")}</p>
          </div>
          <div class="v3-ticket-accordion-label">説明・買い目・オッズ</div>
          ${body}
        </div>
      </details>`;
  }

  function resolveTicketPointCount(list, type) {
    const rows = arrayify(list);
    if (type === "flow") {
      return Math.max(
        1,
        safeNum(
          rows[0]?.pointCount ?? rows[0]?.ticketCount,
          rows.length || 1
        )
      );
    }
    return Math.max(1, rows.length);
  }

  function resolveTicketAim(list, fallback) {
    const row = arrayify(list)[0];
    if (!row || typeof row !== "object") return fallback;
    return userFacingFormationText(
      row.flowCommonReason ||
      row.scenarioSummary ||
      row.comment ||
      row.reason ||
      fallback
    );
  }

     function renderMainNewspaper(prediction) {
    const sheet =
      prediction.mainSheet || {};

    const boatSheet =
      prediction.boatEvaluation ||
      sheet;

    const boatItems = [];

    [
      normalizeSheetItem(
        boatSheet.honmei ||
        boatSheet.main ||
        boatSheet["◎"] ||
        boatSheet.top,
        "honmei"
      ),
      normalizeSheetItem(
        boatSheet.taikou ||
        boatSheet.rival ||
        boatSheet["○"] ||
        boatSheet.second,
        "taikou"
      ),
      normalizeSheetItem(
        boatSheet.ana ||
        boatSheet.hole ||
        boatSheet["▲"] ||
        boatSheet.third,
        "ana"
      ),
      normalizeSheetItem(
        boatSheet.osa ||
        boatSheet.osae ||
        boatSheet["△"] ||
        boatSheet.support,
        "osa"
      )
    ]
      .filter(Boolean)
      .forEach(item =>
        boatItems.push(item)
      );

    if (
      !boatItems.length &&
      Array.isArray(
        boatSheet.evaluations
      )
    ) {
      boatSheet.evaluations
        .slice(0, 6)
        .forEach((item, index) => {
          const roles = [
            "honmei",
            "taikou",
            "ana",
            "osa",
            "osa",
            "osa"
          ];

          const normalized =
            normalizeSheetItem(
              item,
              item?.role ||
              roles[index] ||
              "osa"
            );

          if (normalized) {
            boatItems.push(normalized);
          }
        });
    }

    const raceEntries =
      prediction.race?.entries ||
      prediction.entries ||
      [];

    /* ensure all six boat evaluation tabs */
    const existingBoatNos = new Set(
      boatItems
        .map(item => safeNum(item?.no, 0))
        .filter(no => no >= 1 && no <= 6)
    );

    if (Array.isArray(boatSheet.evaluations)) {
      boatSheet.evaluations
        .slice(0, 6)
        .forEach((item, index) => {
          const boatNo = safeNum(
            item?.no ?? item?.boatNo ?? item?.waku ?? item?.course,
            index + 1
          );
          if (existingBoatNos.has(boatNo)) return;

          const normalized = normalizeSheetItem(
            item,
            item?.role || "osa"
          );
          if (!normalized) return;

          normalized.no = boatNo;
          boatItems.push(normalized);
          existingBoatNos.add(boatNo);
        });
    }

    raceEntries.slice(0, 6).forEach((entry, index) => {
      const boatNo = entryLaneNumber(entry, index);
      if (existingBoatNos.has(boatNo)) return;

      const normalized = normalizeSheetItem(
        { ...entry, no: boatNo },
        entry?.role || "osa"
      );
      if (!normalized) return;

      normalized.no = boatNo;
      normalized.name =
        normalized.name ||
        entry?.name ||
        entry?.racerName ||
        `${boatNo}号艇`;
      normalized.comment =
        normalized.comment ||
        "艇評価の詳細データはありません。出走表情報を表示しています。";
      boatItems.push(normalized);
      existingBoatNos.add(boatNo);
    });

    boatItems.forEach(item => {
      const entry = findEntryByLane(
        raceEntries,
        item.no
      );

      if (!entry) return;

      item.className =
        item.className ||
        entry.className ||
        entry.grade ||
        entry.class ||
        entry.rank ||
        "";
    });

    const mainTickets = arrayify(
      sheet.tickets ||
      prediction.ticketSheets?.main ||
      []
    );

    const coverTickets = arrayify(
      sheet.coverTickets ||
      prediction.ticketSheets?.cover ||
      []
    );

    const compactFlowRows =
      normalizeFlowFormationRows(
        prediction
      );

    const flowTickets =
      compactFlowRows.length
        ? compactFlowRows
        : arrayify(
            sheet.flowTickets ||
            prediction.ticketSheets?.flow ||
            []
          );

    const normalizeTicketRow = (
      item,
      fallbackCategory,
      fallbackScenario
    ) => {
      const row =
        typeof item === "string"
          ? { ticket: item }
          : item || {};

      const numericOdds =
        Number(row.odds);

      const hasOdds =
        row.odds !== null &&
        row.odds !== undefined &&
        row.odds !== "" &&
        Number.isFinite(
          numericOdds
        ) &&
        numericOdds > 0;

      return {
        ticket:
          row.ticket ||
          row.line ||
          row.formation ||
          "",

        category:
          row.category === "流し"
            ? "フォーメーション"
            : userFacingFormationText(
                row.displayCategory ||
                row.category ||
                fallbackCategory
              ),

        scenarioType:
          userFacingFormationText(
            row.scenarioType ||
            fallbackScenario
          ),

        oddsText:
          displayOddsText(
            row,
            numericOdds,
            hasOdds
          ),

        scenarioTitle:
          userFacingFormationText(
            row.scenarioTitle ||
            prediction.raceFlow?.title ||
            ""
          ),

        scenarioSummary:
          userFacingFormationText(
            row.scenarioSummary ||
            row.comment ||
            row.reason ||
            createTicketSpecificComment(
              prediction,
              row.ticket ||
                row.line ||
                row.formation ||
                "",
              [
                row.category === "流し"
                  ? "フォーメーション"
                  : row.category ||
                    fallbackCategory
              ]
            )
          )
      };
    };

        const displayedTickets =
      new Set();

    const renderTicketRows = (
      title,
      list,
      type,
      fallbackCategory,
      fallbackScenario
    ) => {
      const rows = arrayify(list)
        .map(item =>
          normalizeTicketRow(
            item,
            fallbackCategory,
            fallbackScenario
          )
        )
        .filter(item => {
          const ticket =
            String(
              item.ticket || ""
            ).trim();

          if (
            !ticket ||
            displayedTickets.has(
              ticket
            )
          ) {
            return false;
          }

          displayedTickets.add(
            ticket
          );

          return true;
        });

      if (!rows.length) return "";

      return `
        <div class="v3-formation-group">
          <h3>
            ${escapeHtml(title)}
            ${renderCombinedOddsTag(
              prediction,
              type === "main"
                ? "main"
                : type === "safety"
                  ? "cover"
                  : ""
            )}
          </h3>

          <div
            class="v3-formation-list
              v3-formation-${escapeHtml(type)}"
          >
            ${rows
              .map(item => `
                <div
                  class="v3-formation-row
                    v3-formation-row-${escapeHtml(type)}"
                  ${
                    type === "flow"
                      ? `data-flow-notation="${escapeHtml(item.ticket)}"`
                      : ""
                  }
                >
                  <div class="v3-formation-ticket">
                    ${ticketArrow(item.ticket)}
                  </div>

                  <div class="v3-formation-tags">
                  ${tag(
                    item.category,
                    type
                  )}

                  ${item.scenarioType
                    ? tag(
                        item.scenarioType,
                        "flow"
                      )
                    : ""}

                  ${tag(
                    item.oddsText,
                    "odds"
                  )}
                  </div>

                  ${item.scenarioSummary
                    ? `
                      <div class="v3-formation-reason">
                        ${escapeHtml(
                          item.scenarioSummary
                        )}
                      </div>
                    `
                    : ""}
                </div>
              `)
              .join("")}
          </div>
        </div>
      `;
    };
    const boatTabItems = boatItems
      .slice()
      .sort((a, b) =>
        safeNum(a?.no, 99) -
        safeNum(b?.no, 99)
      );

    const boatBody =
      boatTabItems.length
        ? `
          <div class="v3-boat-tabs">
            <div class="v3-boat-tab-buttons" role="tablist" aria-label="艇評価を選択">
              ${boatTabItems
                .map((item, index) => {
                  const boatNo = safeNum(item?.no, index + 1);
                  return `
                    <input class="v3-boat-tab-radio" type="radio"
                      name="chappy-boat-evaluation-tab"
                      id="chappy-boat-tab-${escapeHtml(boatNo)}"
                      ${index === 0 ? "checked" : ""}>
                    <label class="v3-boat-tab-button v3-boat-tab-button-${escapeHtml(boatNo)}"
                      for="chappy-boat-tab-${escapeHtml(boatNo)}" role="tab">
                      <span>${escapeHtml(boatNo)}</span><small>号艇</small>
                    </label>
                  `;
                })
                .join("")}
            </div>
            <div class="v3-boat-tab-panels">
              ${boatTabItems
                .map((item, index) => {
                  const boatNo = safeNum(item?.no, index + 1);
                  return `
                    <div class="v3-boat-tab-panel v3-boat-tab-panel-${escapeHtml(boatNo)}"
                      data-boat-tab-panel="${escapeHtml(boatNo)}">
                      ${renderNewspaperCard(item)}
                    </div>
                  `;
                })
                .join("")}
            </div>
          </div>
        `
        : emptyBox("艇評価データがありません");

    const formationLabel =
      "フォーメーション";
    const ticketBody = [
      renderTicketAccordion(
        "本命",
        "main",
        renderTicketRows(
          "本線",
          mainTickets,
          "main",
          "本命",
          "中心展開"
        ),
        resolveTicketPointCount(
          mainTickets,
          "main"
        ),
        resolveTicketAim(
          mainTickets,
          "最も成立度が高い中心展開の買い目です。"
        ),
        true
      ),

      renderTicketAccordion(
        "押さえ",
        "safety",
        renderTicketRows(
          "押さえ",
          coverTickets,
          "safety",
          "押さえ",
          "安全押さえ"
        ),
        resolveTicketPointCount(
          coverTickets,
          "safety"
        ),
        resolveTicketAim(
          coverTickets,
          "本命展開が崩れた場合を補う買い目です。"
        ),
        false
      ),

      renderTicketAccordion(
        formationLabel,
        "flow",
        renderTicketRows(
          formationLabel,
          flowTickets,
          "flow",
          formationLabel,
          formationLabel
        ),
        resolveTicketPointCount(
          flowTickets,
          "flow"
        ),
        resolveTicketAim(
          flowTickets,
          "同じ1着・2着軸を共有する根拠付き3連単2券です。"
        ),
        false
      )
    ]
      .filter(Boolean)
      .join("");

    const boatSection = section(
      "AI総合／艇評価",
      boatBody,
      "📊",
      "v3-boat-evaluation"
    );

    const ticketSection = section(
      "本命",
      ticketBody ||
        emptyBox(
          "本命買い目データがありません"
        ),
      "🎯",
      "v3-main-newspaper"
    );

    return `
      ${boatSection}
      ${ticketSection}
    `;
  }

    function renderManshuNewspaper(prediction) {
    const sheet =
      prediction.manshuSheet || {};

    const sourceTickets = arrayify(
      sheet.tickets ||
      prediction.ticketSheets?.hole ||
      []
    );

    const rows = sourceTickets
      .map(item => {
        const row =
          typeof item === "string"
            ? { ticket: item }
            : item || {};

        const numericOdds =
          Number(row.odds);

        const hasOdds =
          row.odds !== null &&
          row.odds !== undefined &&
          row.odds !== "" &&
          Number.isFinite(
            numericOdds
          ) &&
          numericOdds > 0;

        const isManshu =
          hasOdds &&
          numericOdds >= 100;

        const category =
          row.category ||
          (
            isManshu
              ? "万舟"
              : hasOdds
                ? "高配当候補"
                : "穴候補"
          );

        return {
          ticket:
            row.ticket ||
            row.line ||
            row.formation ||
            "",

          category,

          oddsText:
            displayOddsText(
              row,
              numericOdds,
              hasOdds
            ),

          scenarioType:
            row.scenarioType ||
            "穴展開",

          scenarioTitle:
            row.scenarioTitle ||
            prediction.raceFlow?.title ||
            "",

                    scenarioSummary:
            row.scenarioSummary ||
            row.comment ||
            row.reason ||
            createTicketSpecificComment(
              prediction,
              row.ticket ||
                row.line ||
                row.formation ||
                "",
              [category]
            ),

          isManshu
        };
      })
      .filter(item => item.ticket);

    if (!rows.length) {
      return section(
        "万舟",
        emptyBox(
          "成立する穴展開の買い目がありません"
        ),
        "💣",
        "v3-manshu-newspaper"
      );
    }

    const groups = {
      万舟: [],
      高配当候補: [],
      穴候補: []
    };

    rows.forEach(item => {
      if (item.isManshu) {
        groups["万舟"].push({
          ...item,
          category: "万舟"
        });
        return;
      }

      if (
        item.category ===
        "高配当候補"
      ) {
        groups["高配当候補"]
          .push(item);
        return;
      }

      groups["穴候補"].push({
        ...item,
        category: "穴候補"
      });
    });

    const renderGroup = (
      title,
      items,
      type
    ) => {
      if (!items.length) return "";

      return `
        <div class="v3-formation-group">
          <h3>${escapeHtml(title)}</h3>

          <div
            class="v3-formation-list
              v3-formation-${escapeHtml(type)}"
          >
            ${items
              .map(item => `
                <div
                  class="v3-formation-row
                    v3-formation-row-${escapeHtml(type)}"
                >
                  <div class="v3-formation-ticket">
                    ${ticketArrow(item.ticket)}
                  </div>

                  <div class="v3-formation-tags">
                    ${tag(
                      item.category,
                      type
                    )}

                    ${tag(
                      item.oddsText,
                      "odds"
                    )}

                    ${tag(
                      item.scenarioType,
                      "flow"
                    )}
                  </div>

                  ${item.scenarioSummary
                    ? `
                      <div class="v3-formation-reason">
                        ${escapeHtml(
                          item.scenarioSummary
                        )}
                      </div>
                    `
                    : ""}
                </div>
              `)
              .join("")}
          </div>
        </div>
      `;
    };

    const manshuCombinedOdds =
      renderCombinedOddsTag(
        prediction,
        "manshu"
      );

    const body = [
      manshuCombinedOdds
        ? `
          <div class="v3-note">
            万舟候補全体の
            ${manshuCombinedOdds}
          </div>
        `
        : "",

      renderGroup(
        "万舟（実オッズ100倍以上）",
        groups["万舟"],
        "manshu"
      ),

      renderGroup(
        "100倍未満の高配当候補",
        groups["高配当候補"],
        "highpay"
      ),

      renderGroup(
        "穴候補（オッズ未取得）",
        groups["穴候補"],
        "hole"
      )
    ]
      .filter(Boolean)
      .join("");

    return renderTicketAccordion(
      "万舟",
      "manshu",
      section(
        "万舟",
        body,
        "💣",
        "v3-manshu-newspaper"
      ),
      Math.max(1, rows.length),
      resolveTicketAim(
        rows,
        "内側が崩れた場合や高配当展開を狙う買い目です。"
      ),
      false
    );
  }

  function renderMissingNumbers(
    prediction
  ) {
    const data =
      prediction.missingNumbersData;

    if (!data) {
      return section(
        "出てない目TOP30",
        emptyBox(
          "開催場の1R〜12Rを合算し、直近30日で出ていない目を未出現日数で表示します。"
        ),
        "🔎",
        "v3-missing-numbers"
      );
    }

    if (!data.available) {
      return section(
        "出てない目TOP30",
        emptyBox(
          data.reason ||
          "直近30日の公式結果を確認できないため、参考判定を停止しました。"
        ),
        "🔎",
        "v3-missing-numbers"
      );
    }

    const rows = arrayify(
      data.top30
    );

    if (!rows.length) {
      return section(
        "出てない目TOP30",
        emptyBox(
          "直近30日で未出現の組み合わせはありません。"
        ),
        "🔎",
        "v3-missing-numbers"
      );
    }

    const renderRow = item => {
      const missingDays = safeNum(
        item.missingDays,
        null
      );
      const missingLabel =
        missingDays !== null
          ? item.missingDaysLowerBound
            ? `${missingDays}日以上未出`
            : `${missingDays}日未出`
          : item.label ||
            "未出日数を確認できません";

      return `
        <div class="v3-formation-row v3-formation-row-manshu">
          <div class="v3-formation-ticket">
            <span class="v3-missing-rank">
              ${escapeHtml(item.rank)}位
            </span>
            ${ticketArrow(item.ticket)}
          </div>

          <div class="v3-formation-tags">
            ${tag(
              missingLabel,
              "manshu"
            )}
          </div>
        </div>
      `;
    };

    const visibleRows =
      rows.slice(0, 10);

    const hiddenRows =
      rows.slice(10);

    const period = [
      data.windowStartDate,
      data.dataThroughDate
    ]
      .filter(Boolean)
      .join("〜");

    const formationLabel =
      "フォーメーション";
    const body = `
      <div class="v3-note">
        選択した開催場の1R〜12Rを合算し、
        直近30日で一度も出ていない目を、
        最後に出てからの未出現日数が長い順に表示。
        30日を超えても実日数を表示し、
        履歴を連続確認できない範囲は「日以上」と表示します。
        買い目の作成・削除には使用しません。
        ${
          period
            ? `集計期間：${escapeHtml(period)}`
            : ""
        }
      </div>

      <div class="v3-formation-list v3-formation-manshu">
        ${visibleRows
          .map(renderRow)
          .join("")}
      </div>

      ${
        hiddenRows.length
          ? `
            <details class="v3-missing-more">
              <summary>
                11〜${escapeHtml(rows.length)}位を見る
              </summary>
              <div class="v3-formation-list v3-formation-manshu">
                ${hiddenRows
                  .map(renderRow)
                  .join("")}
              </div>
            </details>
          `
          : ""
      }
    `;

    return section(
      "出てない目TOP30",
      body,
      "🔎",
      "v3-missing-numbers"
    );
  }

  function updateMissingNumbersSection(
    prediction
  ) {
    const root = getRoot();
    const current = root.querySelector(
      ".v3-missing-numbers"
    );
    if (!current) return false;

    const template =
      document.createElement("template");
    template.innerHTML =
      renderMissingNumbers(prediction)
        .trim();
    const replacement =
      template.content.firstElementChild;
    if (!replacement) return false;
    current.replaceWith(replacement);
    return true;
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
      score:
  item.score ??
  item.manshuScore ??
  item.holdScore ??
  item.pickupScore ??
  item.index ??
  item.point ??
  item.value ??
  "",
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

  const roleItems = [
    ...new Set(
      String(rawRole)
        .split("/")
        .map((text) => text.trim())
        .filter(Boolean)
    )
  ].slice(0, 3);

  const c = boatColor(item.no);

  const hasScore =
    item.score !== "" &&
    item.score !== null &&
    item.score !== undefined &&
    Number.isFinite(Number(item.score));

  const hasOdds =
    item.odds !== "" &&
    item.odds !== null &&
    item.odds !== undefined;

  return `
    <article
      class="v3-paper-card"
      style="border-left-color:${c.border};"
    >
      <div class="v3-paper-head">

        <div class="v3-paper-title">

          ${
            roleItems.length
              ? `
                <div class="v3-role-list">
                  ${roleItems
                    .map(
                      (role) =>
                        `<span class="v3-role">${escapeHtml(role)}</span>`
                    )
                    .join("")}
                </div>
              `
              : ""
          }

          <div class="v3-paper-player-line">
            ${boatTitle(item.no, item.name)}

            ${
              item.className
                ? `
                  <span class="v3-paper-grade">
                    ${escapeHtml(item.className)}
                  </span>
                `
                : ""
            }
          </div>

        </div>

        ${
          hasScore
            ? `
              <div class="v3-paper-score">
                <span>AI</span>
                <strong>
                  ${escapeHtml(Math.round(Number(item.score)))}
                </strong>
              </div>
            `
            : ""
        }

      </div>

      ${
        hasOdds
          ? `
            <div class="v3-paper-odds">
              <span>オッズ</span>
              <strong>${escapeHtml(item.odds)}倍</strong>
            </div>
          `
          : ""
      }

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

  const boatNo = Number(
    data.boatNo ||
    data.no ||
    data.waku ||
    data.course ||
    0
  );

  const name =
    data.name ||
    data.playerName ||
    data.racerName ||
    "";

  const score = Number(
    data.score ??
    data.total ??
    data.aiScore ??
    data.manshuScore ??
    0
  ) || 0;

  const safeBuffs = arrayify(
    data.buffs ||
    data.buff ||
    data.plus ||
    data.positive
  )
    .map(formatFactor)
    .filter(Boolean);

  const safeDebuffs = arrayify(
    data.debuffs ||
    data.debuff ||
    data.minus ||
    data.negative
  )
    .map(formatFactor)
    .filter(Boolean);

  const roleText =
    data.role ||
    data.label ||
    data.primaryRole?.label ||
    "";

  const points = [];

  if (roleText) {
    points.push(
      String(roleText)
        .split("/")[0]
        .trim()
    );
  }

  safeBuffs.forEach((text) => {
    if (points.length >= 3) return;

    if (!points.includes(text)) {
      points.push(text);
    }
  });

  if (points.length < 3 && safeDebuffs.length) {
    points.push(`注意：${safeDebuffs[0]}`);
  }

  if (!points.length && data.shortComment) {
    points.push(data.shortComment);
  }

  if (!points.length && data.comment) {
    points.push(data.comment);
  }

  const fullComment =
    String(
      data.comment || ""
    ).trim();
  if (
    fullComment &&
    !points.includes(fullComment)
  ) {
    points.push(fullComment);
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
    .map((text) => {
      return `・${String(text).replace(/[。]+$/g, "")}`;
    })
    .join("\n");

  return [
    [heading, scoreText]
      .filter(Boolean)
      .join(" "),
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
    const ticketSheets = prediction.ticketSheets || {};

    if (mode === "manshu") {
      const manshu =
        prediction.manshuSheet?.tickets ||
        ticketSheets.hole ||
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
      prediction.mainSheet?.tickets ||
      ticketSheets.main ||
      formation.main ||
      formation.honmei ||
      formation.normal ||
      formation.base ||
      prediction.mainFormation ||
      [];

    const safety =
      prediction.mainSheet?.coverTickets ||
      ticketSheets.cover ||
      formation.safety ||
      formation.osae ||
      formation.cover ||
      prediction.safetyFormation ||
      [];

    const compactFlow =
      normalizeFlowFormationRows(
        prediction
      );

    const flow = compactFlow.length
      ? compactFlow
      : prediction.mainSheet?.flowTickets ||
        ticketSheets.flow ||
        formation.nagashi ||
        formation.flow ||
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
        arrayify(flow).length
          ? `
            <div class="v3-formation-group">
              <h3>${formationLabel}</h3>
              ${renderFormationBody(flow, "flow")}
            </div>
          `
          : ""
      }

      ${renderFormationNote(formation)}
    `;

    return section(
      "本線フォーメーション",
      body,
      "🎫",
      "v3-main-formation"
    );
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
      return [{
        ticket: list,
        oddsText: "オッズ未取得"
      }];
    }

    if (Array.isArray(list)) {
      return list
        .map((item) => {
          if (!item) return null;

          if (typeof item === "string") {
            return {
              ticket: item,
              oddsText: "オッズ未取得"
            };
          }

          const numericOdds = Number(item.odds);
          const hasActualOdds =
            Number.isFinite(numericOdds) &&
            numericOdds > 0;

          return {
            ticket:
              item.ticket ||
              item.line ||
              item.formation ||
              item.bet ||
              item.kumi ||
              "",

            label:
              userFacingFormationText(
                item.label ||
                item.category ||
                item.type ||
                item.rank ||
                ""
              ),

            scenarioType:
              userFacingFormationText(
                item.scenarioType ||
                ""
              ),

            score:
              item.score !== undefined &&
              item.score !== null &&
              item.score !== "undefined"
                ? item.score
                : "",

            oddsText: displayOddsText(
              item,
              numericOdds,
              hasActualOdds
            ),

            reason:
              userFacingFormationText(
                item.scenarioSummary ||
                item.reason ||
                item.comment ||
                item.text ||
                ""
              )
          };
        })
        .filter(Boolean);
    }

    if (typeof list === "object") {
      return Object.entries(list)
        .map(([label, value]) => {
          if (!value) return null;

          if (typeof value === "string") {
            return {
              label,
              ticket: value,
              oddsText: "オッズ未取得"
            };
          }

          const numericOdds = Number(value.odds);
          const hasActualOdds =
            Number.isFinite(numericOdds) &&
            numericOdds > 0;

          return {
            label:
              userFacingFormationText(
                value.label ||
                value.category ||
                label
              ),

            scenarioType:
              userFacingFormationText(
                value.scenarioType ||
                ""
              ),

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

            oddsText: displayOddsText(
              value,
              numericOdds,
              hasActualOdds
            ),

            reason:
              userFacingFormationText(
                value.scenarioSummary ||
                value.reason ||
                value.comment ||
                value.text ||
                ""
              )
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
          ${
            item.scenarioType
              ? tag(item.scenarioType, "scenario")
              : ""
          }
          ${
            item.score !== undefined &&
            item.score !== null &&
            item.score !== "" &&
            item.score !== "undefined"
              ? tag(`評価 ${item.score}`, "score")
              : ""
          }
          ${tag(
            item.oddsText || "オッズ未取得",
            "odds"
          )}
        </div>

        ${
          item.reason
            ? `
              <div class="v3-formation-reason">
                ${escapeHtml(item.reason)}
              </div>
            `
            : ""
        }
      </div>
    `;
  }

  function renderFormationNote(formation) {
    const note =
      userFacingFormationText(
        formation.comment ||
        formation.reason ||
        formation.text ||
        formation.mainComment ||
        ""
      );

    if (!note) return "";

    return `<div class="v3-note">${escapeHtml(note)}</div>`;
  }
  /* ===============================
    6. AI買い目一覧
  =============================== */

  function createTicketSpecificComment(
    prediction,
    ticketText,
    categories
  ) {
    const boats = String(
      ticketText || ""
    )
      .match(/[1-6]/g)
      ?.slice(0, 3)
      .map(Number) || [];

    if (boats.length !== 3) {
      return "";
    }

    const [
      firstBoat,
      secondBoat,
      thirdBoat
    ] = boats;

    const raceFlow =
      prediction?.raceFlow || {};

    const mainSheet =
      prediction?.mainSheet || {};

    const boatNoOf = item => {
      for (const value of [
        item?.boat,
        item?.waku,
        item?.frame,
        item?.boatNo,
        item?.no,
        item?.number
      ]) {
        const candidate = Number(value);
        if (
          Number.isInteger(candidate) &&
          candidate >= 1 &&
          candidate <= 6
        ) {
          return candidate;
        }
      }
      return 0;
    };

    const honmeiNo =
      boatNoOf(mainSheet.honmei);

    const taikouNo =
      boatNoOf(mainSheet.taikou);

    const anaNo =
      boatNoOf(mainSheet.ana);

    const osaeNo =
      boatNoOf(mainSheet.osae);

    const boatSet = source =>
      new Set(
        arrayify(source)
          .map(boatNoOf)
          .filter(
            boatNo =>
              boatNo >= 1 &&
              boatNo <= 6
          )
      );

    const attackBoats =
      boatSet(raceFlow.attackBoats);

    const holdBoats =
      boatSet(raceFlow.holdBoats);

    const pickupBoats =
      boatSet(raceFlow.pickupBoats);

    const core = window.ChappyAICore;
    const mappingSource =
      prediction?.preRaceConditions ||
      prediction?.race?.raw ||
      prediction?.race ||
      prediction;
    const officialCourseMapping =
      typeof core?.getRaceEntries === "function" &&
      typeof core?.buildOfficialCourseMapping === "function"
        ? core.buildOfficialCourseMapping(
            core
              .getRaceEntries(mappingSource)
              .map((entry, index) => ({
                ...entry,
                boat: boatNoOf(entry) || index + 1
              }))
          )
        : null;
    const courseOfBoat = boatNo => {
      if (officialCourseMapping?.formal === true) {
        return Number(
          officialCourseMapping.courseOfBoat(boatNo) ||
          boatNo
        );
      }
      return Number(boatNo);
    };

    const roleOf = (
      boatNo,
      position
    ) => {
      const course = courseOfBoat(boatNo);

      if (course === 1) {
        return position === "first"
          ? "イン逃げ"
          : "イン残し";
      }

      if (attackBoats.has(boatNo)) {
        if (course === 2) {
          return "2コース差し";
        }

        if (course === 3) {
          return "3コース攻め";
        }

        if (course === 4) {
          return "4カド攻め";
        }

        if (course === 5) {
          return "まくり差し";
        }

        return "外からの攻め";
      }

      if (holdBoats.has(boatNo)) {
        if (course === 2) {
          return "2差し・残り";
        }

        if (course === 4) {
          return "4残し";
        }

        return "展開残し";
      }

        if (pickupBoats.has(boatNo)) {
        return "展開拾い";
      }

      if (boatNo === honmeiNo) {
        return "中心展開";
      }

      if (boatNo === taikouNo) {
        return "対抗展開";
      }

      if (boatNo === anaNo) {
        return "穴展開";
      }

      if (boatNo === osaeNo) {
        return "押さえ評価";
      }

      if (course === 2) {
        return "2差し・残り";
      }

      if (course === 4) {
        return "4残し";
      }

      if (course >= 5) {
        return "外の展開拾い";
      }

      return "相手評価";
    };

    const firstRole =
      roleOf(firstBoat, "first");

    const secondRole =
      roleOf(secondBoat, "second");

    const thirdRole =
      roleOf(thirdBoat, "third");

    const categoryText =
      arrayify(categories)
        .map(value => String(value || ""))
        .join("・");

    if (
      categoryText.includes("本線") ||
      categoryText.includes("本命")
    ) {
      return (
        `${firstBoat}号艇の${firstRole}を頭に、` +
        `${secondBoat}号艇の${secondRole}を2着、` +
        `${thirdBoat}号艇の${thirdRole}を3着に置く本線。`
      );
    }

    if (
      categoryText.includes("押さえ")
    ) {
      return (
        `本線の着順ズレに備え、` +
        `${firstBoat}号艇の${firstRole}を頭に、` +
        `${secondBoat}号艇の${secondRole}と` +
        `${thirdBoat}号艇の${thirdRole}を残す押さえ。`
      );
    }

    if (
      categoryText.includes("流し")
    ) {
      return (
        `${firstBoat}号艇の${firstRole}を軸に、` +
        `${secondBoat}号艇の${secondRole}と` +
        `${thirdBoat}号艇の${thirdRole}まで` +
        `着順変化を拾うフォーメーション。`
      );
    }

    return (
      `${firstBoat}号艇の${firstRole}が頭まで届き、` +
      `${secondBoat}号艇の${secondRole}と` +
      `${thirdBoat}号艇の${thirdRole}が絡む波乱形。`
    );
  }
  function renderPracticalSelection(prediction) {
    const result =
      resolvePracticalSelection(
        prediction
      ) ||
      {
          status: "skipped",
          reason: "実戦厳選の共通処理を読み込めないため見送り。",
          tickets: []
      };

    const isSelected =
      result.status ===
      "selected";
    const selected =
      isSelected
        ? arrayify(
            result.tickets
          ).map(item => ({
            ...item,
            displayCategory:
              practicalDisplayCategory(
                item
              ),
            scenarioTitle:
              userFacingFormationText(
                item.scenarioTitle
              ),
            scenarioSummary:
              userFacingFormationText(
                item.scenarioSummary
              ),
            scenarioType:
              userFacingFormationText(
                item.scenarioType
              ),
            reason:
              userFacingFormationText(
                item.reason
              ),
            roleLabels:
              arrayify(
                item.roleLabels
              ),
            oddsText: displayOddsText(
              item,
              Number(item.odds),
              Number(item.odds) > 0
            ),
            comment:
              userFacingFormationText(
                item.comment ||
                createTicketSpecificComment(
                  prediction,
                  item.ticket,
                  [
                    practicalDisplayCategory(
                      item
                    )
                  ]
                )
              )
          }))
        : [];

    const typeOf = category => {
      if (category === "本線") return "main";
      if (category === "押さえ") return "safety";
      if (category === "流し") return "flow";
      if (category === "独立展開") return "flow";
      return "manshu";
    };
    const renderRoleTags =
      roles =>
        [
          ...new Map(
            arrayify(roles)
              .map(role => [
                `${role?.boatNo}|` +
                `${role?.position}|` +
                `${role?.role}`,
                role
              ])
          ).values()
        ]
          .map(role =>
            tag(
              `${role?.boatNo || "-"}号艇 ` +
              `${role?.label || `${role?.position || "-"}着候補`}`,
              role?.structured
                ? "flow"
                : "odds"
            )
          )
          .join("");
    const targetsById =
      new Map(
        arrayify(
          result.evidence
            ?.evaluatedTargets
        ).map(target => [
          String(
            target?.id || ""
          ),
          target
        ])
      );
    const targetDecisionHtml =
      arrayify(
        result.targetDecisions
      )
        .map(decision => {
          const target =
            targetsById.get(
              String(
                decision
                  ?.evaluationId || ""
              )
            ) || {};
          const evaluation =
            target.evaluation || {};
          const evaluationScore =
            safeNum(
              evaluation.score ??
              evaluation.total,
              0
            );
          const candidateRows =
            arrayify(
              decision
                ?.candidateDecisions
            );
          const adoptedCount =
            safeNum(
              decision
                ?.selectedCandidateCount,
              candidateRows.filter(
                row =>
                  row.ticketSelected
              ).length
            );
          const supportedCount =
            arrayify(
              decision
                ?.supportedSelectedTickets
            ).length ||
            candidateRows.filter(
              row =>
                row.ticketSelected &&
                row.relation ===
                  "structured"
            ).length;
          const candidateCount =
            safeNum(
              decision
                ?.candidateCount,
              candidateRows.length
            );
          const hiddenCandidateCount =
            safeNum(
              decision
                ?.hiddenCandidateCount,
              0
            );

          return `
            <details
              class="v3-adoption-card"
              data-boat-no="${escapeHtml(
                decision?.boatNo || ""
              )}"
            >
              <summary>
                <span class="v3-adoption-boat">
                  ${escapeHtml(
                    decision?.symbol || ""
                  )}${boatBadge(
                    decision?.boatNo,
                    "small"
                  )}
                  <b>艇評価（買い目前）</b>
                </span>
                <span class="v3-adoption-counts">
                  評価${escapeHtml(
                    evaluationScore
                  )}点
                  ／候補${candidateCount}点
                  ／根拠一致${supportedCount}点
                </span>
              </summary>

              <div class="v3-adoption-body">
                ${
                  candidateRows.length
                    ? candidateRows
                        .map(row => {
                          const relationIsStructured =
                            row.relation ===
                            "structured";
                          const statusClass =
                            row.ticketSelected
                              ? relationIsStructured
                                ? "is-selected"
                                : "is-related"
                              : "is-excluded";
                          const statusText =
                            row.ticketSelected
                              ? relationIsStructured
                                ? "評価根拠で採用"
                                : "買い目採用・別根拠"
                              : "候補保持・非採用";

                          return `
                            <div
                              class="v3-adoption-row ${statusClass}"
                            >
                              <div class="v3-adoption-row-head">
                                <strong>
                                  ${ticketArrow(
                                    row.ticket
                                  )}
                                </strong>
                                <span>${escapeHtml(statusText)}</span>
                              </div>
                              <div class="v3-formation-tags">
                                ${renderRoleTags(
                                  row.roleLabels
                                )}
                              </div>
                              <p>
                                ${escapeHtml(
                                  row.reason ||
                                  "候補判定理由を確認中"
                                )}
                              </p>
                            </div>
                          `;
                        })
                        .join("")
                    : emptyBox(
                        "この艇の候補判定データがありません"
                      )
                }
                <p class="v3-adoption-note">
                  買い目採用${adoptedCount}点。
                  「別根拠」は買い目には入っていますが、
                  この艇の評価を採用理由にはしていません。
                  ${
                    hiddenCandidateCount > 0
                      ? `画面は評価根拠で採用された買い目、別根拠の代表、比較上位の非採用候補を表示し、残り${escapeHtml(hiddenCandidateCount)}点は総候補数に含めています。`
                      : ""
                  }
                </p>
              </div>
            </details>
          `;
        })
        .join("");
    const expansion =
      result.expansionSummary || {};
    const expansionHtml =
      expansion
        .hasIndependentAdditions
        ? `
          <div class="v3-expansion-banner">
            <strong>
              ${
                expansion
                  .exceededNormalMaximum
                  ? "8〜10点へ拡張"
                  : "独立展開を追加"
              }：
              通常${escapeHtml(
                expansion.normalCount
              )}点
              ＋独立${escapeHtml(
                expansion.addedCount
              )}点
              ＝${escapeHtml(
                expansion.finalCount
              )}点
            </strong>
            <p>
              ${escapeHtml(
                expansion.reason || ""
              )}
            </p>
            <div class="v3-formation-tags">
              ${arrayify(
                expansion.addedTickets
              )
                .map(item =>
                  tag(
                    `${item.ticket}・採用優先度 ${item.priorityScore || 0}（内部比較値）`,
                    "flow"
                  )
                )
                .join("")}
            </div>
          </div>
        `
        : "";

    const selectionBody =
      isSelected
        ? `
      <div class="v3-note">
        展開を最優先に実戦向けへ厳選。通常は5～7点、独立して成立する展開がある場合のみ最大10点まで追加します。数字・オッズだけによる削除はしていません。
      </div>

      ${expansionHtml}

      <div class="v3-formation-list">
        ${selected
          .map(item => {
            const type =
              typeOf(item.category);
            const displayCategory =
              item.displayCategory ||
              item.category ||
              "買い目";

            return `
              <div
                class="v3-formation-row
                  v3-formation-row-${escapeHtml(type)}"
              >
                <div class="v3-formation-ticket">
                  ${ticketArrow(item.ticket)}
                </div>

                <div class="v3-formation-tags">
                  ${tag(
                    displayCategory,
                    type
                  )}

                  ${item.scenarioType
                    ? tag(
                        item.scenarioType,
                        "flow"
                      )
                    : ""}

                  ${item.selectionTier === "展開追加"
                    ? tag(
                        "展開追加",
                        "flow"
                      )
                    : ""}

                  ${renderRoleTags(
                    item.roleLabels
                  )}

                  ${tag(
                    item.oddsText,
                    "odds"
                  )}
                </div>

                <div class="v3-formation-reason">
                  ${escapeHtml(
                    item.comment
                  )}
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <div class="v3-note">
        実戦購入候補：
        ${selected.length}点
        ／最大${result.maximumCount || 10}点
      </div>
    `
        : `
      ${emptyBox(
        result.reason ||
        "主軸となる本線展開が定まらないため、このレースは見送りです。"
      )}
      <div class="v3-note">
        購入は見送りますが、艇ごとの候補と非採用理由は下に残します。
      </div>
    `;

    const body = `
      ${selectionBody}

      <div class="v3-adoption-audit">
        <div class="v3-adoption-head">
          <h3>買い目採用判定</h3>
          <p>
            艇評価と購入判断を分け、
            候補を消さずに採用・非採用の理由を表示します。
          </p>
        </div>
        ${targetDecisionHtml ||
          emptyBox(
            "艇別の採用判定データがありません"
          )}
      </div>
    `;

    return section(
      "実戦厳選",
      body,
      "🔥",
      "v3-practical-section"
    );
  }
  function renderTicketRanking(prediction) {
    const sourceList = arrayify(
      prediction.aiTicketList ||
      prediction.ticketSheets?.all ||
      prediction.ticketRanks ||
      []
    );

    const compactFlowRows =
      normalizeFlowFormationRows(
        prediction
      );

    if (
      !sourceList.length &&
      !compactFlowRows.length
    ) {
      return section(
        "AI買い目一覧",
        emptyBox(
          "AI買い目データがありません"
        ),
        "🏆",
        "v3-ticket-section"
      );
    }

    const rankByTicket =
      new Map(
        arrayify(
          prediction.ticketRanks
        ).map(item => [
          String(
            item?.ticket || ""
          ),
          item
        ])
      );

    const seenTickets =
      new Set();

    const normalizedRows =
      sourceList
        .map(item => {
          const row =
            typeof item === "string"
              ? { ticket: item }
              : item || {};

          const ticketText =
            String(
              row.ticket ||
              row.line ||
              row.formation ||
              ""
            );

          if (
            !ticketText ||
            seenTickets.has(ticketText)
          ) {
            return null;
          }

          seenTickets.add(ticketText);

          const rankRow =
            rankByTicket.get(
              ticketText
            ) || {};

          const categories = [
            ...new Set(
              arrayify(
                row.categories ||
                row.category ||
                rankRow.type ||
                "買い目"
              )
                .map(value =>
                  String(value || "")
                )
                .filter(Boolean)
            )
          ];

          const scenarioTypes = [
            ...new Set(
              arrayify(
                row.scenarioTypes ||
                row.scenarioType ||
                []
              )
                .map(value =>
                  String(value || "")
                )
                .filter(Boolean)
            )
          ];

          const oddsCandidate =
            row.odds ??
            rankRow.odds;

          const numericOdds =
            Number(oddsCandidate);

          const hasOdds =
            oddsCandidate !== null &&
            oddsCandidate !==
              undefined &&
            oddsCandidate !== "" &&
            Number.isFinite(
              numericOdds
            ) &&
            numericOdds > 0;

          return {
            ticket: ticketText,
            categories,
            displayCategories:
              categories.map(category =>
                category === "流し"
                  ? "フォーメーション候補"
                  : userFacingFormationText(
                      category
                    )
              ),
            scenarioTypes:
              scenarioTypes.map(
                userFacingFormationText
              ),

            oddsText:
              displayOddsText(
                row,
                numericOdds,
                hasOdds
              ),

            oddsValue:
              rankRow.oddsValue ||
              "",

            scenarioSummary:
              userFacingFormationText(
                row.scenarioSummary ||
                row.comment ||
                row.reason ||
                rankRow.scenarioSummary ||
                rankRow.comment ||
                rankRow.reason ||
                createTicketSpecificComment(
                  prediction,
                  ticketText,
                  categories.map(category =>
                    category === "流し"
                      ? "フォーメーション候補"
                      : category
                  )
                )
              )
          };
        })
        .filter(Boolean);

    const groups = {
      main: [],
      cover: [],
      flow: [],
      hole: []
    };

    normalizedRows.forEach(item => {
      if (
        item.categories.includes(
          "本命"
        ) ||
        item.categories.includes(
          "本線"
        )
      ) {
        groups.main.push(item);
        return;
      }

      if (
        item.categories.includes(
          "押さえ"
        )
      ) {
        groups.cover.push(item);
        return;
      }

      if (
        item.categories.includes(
          "流し"
        )
      ) {
        groups.flow.push(item);
        return;
      }

      groups.hole.push(item);
    });

    if (compactFlowRows.length) {
      groups.flow = compactFlowRows;
    }

    const renderGroup = (
      title,
      rows,
      type
    ) => {
      if (!rows.length) return "";

      return `
        <details
          name="chappy-ai-ticket-accordion"
          class="v3-ai-ticket-accordion v3-ai-ticket-accordion-${escapeHtml(type)}"
        >
          <summary>
            <span class="v3-ai-ticket-accordion-title">
              ${escapeHtml(title)}
            </span>
            <span class="v3-ai-ticket-accordion-count">
              ${escapeHtml(rows.length)}点
            </span>
            <span class="v3-ai-ticket-accordion-arrow" aria-hidden="true"></span>
          </summary>
          <div class="v3-ai-ticket-accordion-panel">
          ${rows
            .map(item => `
              <div
                class="v3-ticket-inline"
                ${
                  type === "flow"
                    ? `data-flow-notation="${escapeHtml(item.ticket)}"`
                    : ""
                }
              >
                <span class="ticket">
                  ${ticketArrow(
                    item.ticket
                  )}
                </span>

                <div class="v3-ticket-values">
                  ${arrayify(
                    item.displayCategories ||
                    item.displayCategory ||
                    item.categories
                  )
                    .map(category =>
                      tag(
                        category,
                        type
                      )
                    )
                    .join("")}

                  ${item.scenarioTypes
                    .map(scenario =>
                      tag(
                        scenario,
                        "flow"
                      )
                    )
                    .join("")}

                  ${tag(
                    item.oddsText,
                    "odds"
                  )}

                  ${item.oddsValue
                    ? tag(
                        item.oddsValue,
                        "score"
                      )
                    : ""}

                </div>

                ${item.scenarioSummary
                  ? `
                    <div class="v3-formation-reason">
                      ${escapeHtml(
                        item.scenarioSummary
                      )}
                    </div>
                  `
                  : ""}
              </div>
            `)
            .join("")}

          </div>
        </details>
      `;
    };

    const body = [
      renderGroup(
        "本命",
        groups.main,
        "main"
      ),

      renderGroup(
        "押さえ",
        groups.cover,
        "safety"
      ),

      renderGroup(
        compactFlowRows.length
          ? "フォーメーション"
          : "フォーメーション候補",
        groups.flow,
        "flow"
      ),

      renderGroup(
        "穴・万舟候補",
        groups.hole,
        "manshu"
      )
    ]
      .filter(Boolean)
      .join("");

    return section(
      "AI買い目一覧",
      body,
      "🏆",
      "v3-ticket-section"
    );
  }

    /* ===============================
    8. 最終コメント
  =============================== */
function renderOfficialHistory(
  prediction
) {
  const history =
    prediction?.officialHistory || null;

  if (!history?.ready) {
    return "";
  }

  const venue =
    history.venue || null;

  const methods =
    Array.isArray(
      venue?.winningMethods
    )
      ? venue.winningMethods
      : [];

  const getMethodRate = key => {
    const item =
      methods.find(
        row =>
          String(row?.key || "") ===
          key
      );

    const rate =
      Number(item?.rate);

    return Number.isFinite(rate)
      ? `${rate.toFixed(1)}%`
      : "-";
  };

  const samples =
    Number(
      venue?.samples || 0
    );

  const manshuRate =
    Number(
      venue?.payoutBands
        ?.over10000?.rate
    );

  const averageWinningSt =
    Number(
      venue?.averageWinningSt
    );

  const usableRacers =
    Array.isArray(history.racers)
      ? history.racers.filter(
          racer => racer?.usable
        )
      : [];

  const statusText =
    venue?.usable
      ? "参考補正に使用可能"
      : "サンプル不足・参考表示のみ";

  const warningText =
    Array.isArray(history.warnings) &&
    history.warnings.length
      ? history.warnings.join("／")
      : "履歴は展開・コース判断後の参考情報として使用します";

  const body = `
    <div class="v3-final-grid">

      <div class="v3-final-block">
        <h3>
          ■ ${escapeHtml(
            venue?.place || "開催場"
          )}の公式履歴
        </h3>

        <p>
          集計：${samples}レース
          ／ ${escapeHtml(statusText)}
        </p>
      </div>

      <div class="v3-final-block">
        <h3>■ 決まり手率</h3>

        <p>
          逃げ ${getMethodRate("逃げ")}
          ／ 差し ${getMethodRate("差し")}
          ／ まくり ${getMethodRate("まくり")}
          ／ まくり差し ${getMethodRate("まくり差し")}
        </p>
      </div>

      <div class="v3-final-block">
        <h3>■ 配当・スタート傾向</h3>

        <p>
          万舟率 ${
            Number.isFinite(manshuRate)
              ? `${manshuRate.toFixed(1)}%`
              : "-"
          }
          ／ 勝ち艇平均ST ${
            Number.isFinite(
              averageWinningSt
            )
              ? averageWinningSt
                  .toFixed(3)
              : "-"
          }
        </p>
      </div>

      <div class="v3-final-block">
        <h3>■ 選手別履歴</h3>

        <p>
          参考補正可能：
          ${usableRacers.length}名
          ／ 出場6名
        </p>
      </div>

      <div class="v3-final-block">
        <h3>■ 使用条件</h3>

        <p>
          ${escapeHtml(warningText)}
        </p>
      </div>

    </div>
  `;

  return section(
    "公式履歴分析",
    body,
    "📚",
    "v3-official-history-section"
  );
}
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
      <p>${escapeHtml(block.text)}</p>
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
  window.updateMissingNumbersSection =
    updateMissingNumbersSection;
  window.CHAPPY_RENDER_VERSION = RENDER_VERSION;
  if (
    window.CHAPPY_RENDER_TEST_HOOKS ===
      true
  ) {
    window.ChappyRenderTestHooks =
      Object.freeze({
        normalizeFlowFormationRows,
        practicalDisplayCategory,
        renderTicketRanking,
        createTicketSpecificComment
      });
  }
  window.addEventListener(
    "chappy:prediction-calibration-loaded",
    refreshCalibrationDisplays
  );
  window.addEventListener(
    "chappy:prediction-calibration-unavailable",
    refreshCalibrationDisplays
  );
  window.addEventListener(
    "chappy:prediction-runtime-optional-unavailable",
    refreshCalibrationDisplays
  );

  console.info(`[Chappy BoatRace AI] render.js loaded: ${RENDER_VERSION}`);

})();
/* =========================================================
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
    const displayPrediction =
      adaptedPrediction &&
      typeof adaptedPrediction === "object"
        ? { ...adaptedPrediction }
        : adaptedPrediction;

    if (typeof oldRenderAll === "function") {
      oldRenderAll(displayPrediction);
    }
  };

  window.ChappyRenderAdapter = {
    hasAiCore,
    applyAiCoreAdapter
  };
})();
