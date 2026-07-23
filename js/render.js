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
    courseStructure: "🧭 進入・コース構造",
    attack: "🔥 攻め艇",
    wall: "🧱 壁艇",
    flow: "🌊 展開艇",
    road: "⚡ 道中艇",
    michu: "⚡ 道中艇",
    local: "🏠 当地巧者",
    racerSkill: "🧭 選手技量・戦法適性",
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

      <!-- 7. AI買い目一覧 -->
      ${renderTicketRanking(prediction)}
      
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
    const st =
  e.st ||
  e.avgST ||
  e.avgSt ||
  e.averageST ||
  "-";

    const motorObj = e.motor || e.motorInfo || {};
    const motor =
      e.motorNo ||
      e.motorNumber ||
      motorObj.no ||
      motorObj.number ||
      "-";

    const local =
  e.localRate ??
  e.venueRate ??
  e.courseRate ??
  e.local?.winRate ??
  e.local?.rate ??
  (
    typeof e.local !== "object"
      ? e.local
      : null
  ) ??
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
  addIndexRows(rows, indexes.roadRanking || indexes.michuRanking, "⚡道中");
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

    boatItems.forEach(item => {
      const entry =
        raceEntries.find(boat => {
          const entryBoatNo =
            Number(
              boat.boatNo ||
              boat.no ||
              boat.waku ||
              boat.course ||
              0
            );

          return (
            entryBoatNo ===
            Number(item.no)
          );
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

    const flowTickets = arrayify(
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
          row.category ||
          fallbackCategory,

        scenarioType:
          row.scenarioType ||
          fallbackScenario,

        oddsText:
          hasOdds
            ? `${numericOdds}倍`
            : row.oddsText ||
              "オッズ未取得",

        scenarioTitle:
          row.scenarioTitle ||
          prediction.raceFlow?.title ||
          "",

                scenarioSummary:
          createTicketSpecificComment(
            prediction,
            row.ticket ||
              row.line ||
              row.formation ||
              "",
            [
              row.category ||
              fallbackCategory
            ]
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
                  : "flow"
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
                          limitText(
                            item.scenarioSummary,
                            90
                          )
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
    const boatBody =
      boatItems.length
        ? `
          <div class="v3-newspaper-list">
            ${boatItems
              .map(renderNewspaperCard)
              .join("")}
          </div>
        `
        : emptyBox(
            "艇評価データがありません"
          );

    const ticketBody = [
      renderTicketRows(
        "本線",
        mainTickets,
        "main",
        "本命",
        "中心展開"
      ),

      renderTicketRows(
        "押さえ",
        coverTickets,
        "safety",
        "押さえ",
        "安全押さえ"
      ),

      renderTicketRows(
        "流し",
        flowTickets,
        "flow",
        "流し",
        "流し展開"
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
            hasOdds
              ? `${numericOdds}倍`
              : row.oddsText ||
                "オッズ未取得",

          scenarioType:
            row.scenarioType ||
            "穴展開",

          scenarioTitle:
            row.scenarioTitle ||
            prediction.raceFlow?.title ||
            "",

                    scenarioSummary:
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
                          limitText(
                            item.scenarioSummary,
                            90
                          )
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

    return section(
      "万舟",
      body,
      "💣",
      "v3-manshu-newspaper"
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
          "オッズ更新後に、公式3年履歴と現在オッズを照合して表示します。"
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
          "同条件の公式履歴が不足しているため、参考判定を停止しました。"
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
          "出現0回の組み合わせ、または現在オッズを確認できませんでした。"
        ),
        "🔎",
        "v3-missing-numbers"
      );
    }

    const renderRow = item => {
      const odds = Number(
        item.odds
      );

      const oddsText =
        Number.isFinite(odds) &&
        odds > 0
          ? `${odds}倍`
          : "オッズ未取得";

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
              oddsText,
              "odds"
            )}
            ${tag(
              item.label ||
              `直近0/${safeNum(
                item.recentSampleSize,
                data.recentSampleSize ||
                data.sampleSize
              )}`,
              "manshu"
            )}
            ${tag(
              `3年${safeNum(
                item.threeYearOccurrences,
                0
              )}/${safeNum(
                item.threeYearSampleSize,
                data.threeYearSampleSize
              )}`,
              "history"
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
      data.firstDate,
      data.lastDate
    ]
      .filter(Boolean)
      .join("〜");

    const body = `
      <div class="v3-note">
        直近1年${escapeHtml(
          data.recentSampleSize || data.sampleSize
        )}レース・3年${escapeHtml(
          data.threeYearSampleSize || data.sampleSize
        )}レースを対象に、
        同じ開催場・同じR番号で直近1年出現0回の目を
        現在オッズの低い順に表示。
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

    const flow =
      prediction.mainSheet?.flowTickets ||
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
              <h3>流し</h3>
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
              item.label ||
              item.category ||
              item.type ||
              item.rank ||
              "",

            scenarioType:
              item.scenarioType ||
              "",

            score:
              item.score !== undefined &&
              item.score !== null &&
              item.score !== "undefined"
                ? item.score
                : "",

            oddsText: hasActualOdds
              ? `${numericOdds}倍`
              : item.oddsText || "オッズ未取得",

            reason:
              item.scenarioSummary ||
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
              value.label ||
              value.category ||
              label,

            scenarioType:
              value.scenarioType ||
              "",

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

            oddsText: hasActualOdds
              ? `${numericOdds}倍`
              : value.oddsText || "オッズ未取得",

            reason:
              value.scenarioSummary ||
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
                ${escapeHtml(limitText(item.reason, 60))}
              </div>
            `
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

    const boatNoOf = item =>
      Number(
        item?.boatNo ??
        item?.no ??
        item?.waku ??
        item?.number ??
        0
      );

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

    const roleOf = (
      boatNo,
      position
    ) => {
      if (boatNo === 1) {
        return position === "first"
          ? "イン逃げ"
          : "イン残し";
      }

      if (attackBoats.has(boatNo)) {
        if (boatNo === 2) {
          return "2コース差し";
        }

        if (boatNo === 3) {
          return "3コース攻め";
        }

        if (boatNo === 4) {
          return "4カド攻め";
        }

        if (boatNo === 5) {
          return "まくり差し";
        }

        return "外からの攻め";
      }

      if (holdBoats.has(boatNo)) {
        if (boatNo === 2) {
          return "2差し・残り";
        }

        if (boatNo === 4) {
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

      if (boatNo === 2) {
        return "2差し・残り";
      }

      if (boatNo === 4) {
        return "4残し";
      }

      if (boatNo >= 5) {
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
        `着順変化を拾う流し。`
      );
    }

    return (
      `${firstBoat}号艇の${firstRole}が頭まで届き、` +
      `${secondBoat}号艇の${secondRole}と` +
      `${thirdBoat}号艇の${thirdRole}が絡む波乱形。`
    );
  }
  function renderPracticalSelection(prediction) {
    const selector = window.ChappyPracticalSelection;
    const result = selector && typeof selector.select === "function"
      ? selector.select(prediction)
      : {
          status: "skipped",
          reason: "実戦厳選の共通処理を読み込めないため見送り。",
          tickets: []
        };

    if (result.status !== "selected") {
      return section(
        "実戦厳選",
        emptyBox(
          result.reason ||
          "主軸となる本線展開が定まらないため、このレースは見送りです。"
        ),
        "🔥",
        "v3-practical-section"
      );
    }

    const selected = result.tickets.map(item => ({
      ...item,
      oddsText: item.odds > 0
        ? `${item.odds}倍`
        : item.oddsText || "オッズ未取得",
      comment: item.comment || createTicketSpecificComment(
        prediction,
        item.ticket,
        [item.category]
      )
    }));

    const typeOf = category => {
      if (category === "本線") return "main";
      if (category === "押さえ") return "safety";
      if (category === "流し") return "flow";
      return "manshu";
    };

    const body = `
      <div class="v3-note">
        展開とコースを優先して厳選。
        数字・オッズだけによる削除はしていません。
      </div>

      <div class="v3-formation-list">
        ${selected
          .map(item => {
            const type =
              typeOf(item.category);

            return `
              <div
                class="v3-formation-row
                  v3-formation-row-${escapeHtml(type)}"
              >
                <div class="v3-formation-ticket">
                  ${ticketArrow(item.ticket)}
                </div>

                <div class="v3-formation-tags">
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

                <div class="v3-formation-reason">
                  ${escapeHtml(
                    limitText(
                      item.comment,
                      90
                    )
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
        ／最大7点
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

    if (!sourceList.length) {
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
            scenarioTypes,

            oddsText:
              hasOdds
                ? `${numericOdds}倍`
                : row.oddsText ||
                  "オッズ未取得",

            oddsValue:
              rankRow.oddsValue ||
              "",

                        scenarioSummary:
              createTicketSpecificComment(
                prediction,
                ticketText,
                categories
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

    const renderGroup = (
      title,
      rows,
      type
    ) => {
      if (!rows.length) return "";

      return `
        <div class="v3-ticket-group">
          <div
            class="v3-ticket-group-title"
          >
            ${escapeHtml(title)}
          </div>

          ${rows
            .map(item => `
              <div class="v3-ticket-inline">
                <span class="ticket">
                  ${ticketArrow(
                    item.ticket
                  )}
                </span>

                <div class="v3-ticket-values">
                  ${item.categories
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
                        limitText(
                          item.scenarioSummary,
                          90
                        )
                      )}
                    </div>
                  `
                  : ""}
              </div>
            `)
            .join("")}
        </div>
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
        "流し",
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
    7. 舟券太郎理論
  =============================== */

  function renderTheoryPanel(prediction) {
    const indexes = prediction.indexes || {};
    const raceFlow = prediction.raceFlow || {};
    const exhibition = prediction.exhibition || {};
    const finalAi = prediction.finalAi || {};

    const items = [];

    {
      const courseTheory =
        prediction.courseStructureTheory ||
        prediction.aiCore
          ?.courseStructureTheory ||
        null;
      const rows = arrayify(
        courseTheory?.ranking ||
        indexes.courseStructureRanking
      )
        .filter(Boolean)
        .slice(0, 2);

      if (!courseTheory || !rows.length) {
        items.push({
          key: "courseStructure",
          label:
            THEORY_LABELS.courseStructure,
          no: "",
          score: "暫定",
          text:
            "公式スタート展示の6艇進入、または場×実進入コース統計が不足しているため、現在の枠番評価を維持する。"
        });
      } else {
        rows.forEach(item => {
          const components =
            item.components || {};
          const mappingText =
            item.mappingFormal
              ? "公式の艇番画像から6艇の進入を重複なく取得。"
              : "進入の欠落・重複・未取得があるため、枠番評価を維持。";
          const statsText =
            item.statsFormal
              ? `場×${item.course}コース${item.venueSamples || 0}走で正式統計。`
              : `場×${item.course}コース${item.venueSamples || 0}走で100走未満のため暫定。`;

          items.push({
            key: "courseStructure",
            label:
              THEORY_LABELS.courseStructure,
            no: item.boatNo || "",
            score:
              `${item.score ?? 0}点・` +
              `${item.grade || "-"}`,
            text:
              `${item.boatNo}号艇は${item.frame}枠から展示進入${item.course}コース、${item.status}。` +
              `内訳は基本構造${components.basicStructure ?? 0}/35、` +
              `場別1着率${components.venueWin ?? 0}/20、` +
              `場別3連率${components.venueTop3 ?? 0}/15、` +
              `直近1年・過去2年推移${components.periodTrend ?? 0}/10、` +
              `枠番からの進入変動${components.courseChange ?? 0}/10、` +
              `取得信頼度${components.mappingReliability ?? 0}/10。` +
              mappingText +
              statsText +
              (
                item.isFormal
                  ? "既存のコース24％枠へ統合して反映。"
                  : "予想点へ新しい点を加えず、従来の枠番評価を使用。"
              ) +
              "前付けを無条件で有利にせず、選手技量・ST・展示・水面・展開を二重加算しない。"
          });
        });
      }
    }

    {
      const attackTheoryRows = arrayify(
        prediction.attackTheory?.ranking ||
        indexes.attackRanking
      ).filter(Boolean);

      if (!attackTheoryRows.length) {
        pushTheoryText(
          items,
          "attack",
          "3・4コースの攻め成立データがないため、攻め艇理論は判定できません。"
        );
      } else {
        attackTheoryRows.forEach((item) => {
          const boatNo = Number(item.boatNo || 0);
          const course = Number(item.course || boatNo);
          const score = Number(item.score || 0);
          const grade = String(item.grade || "");
          const status = String(
            item.status ||
            (item.isAdopted ? "正式採用" : "参考")
          );
          const components = item.components || {};
          const development =
            course === 3
              ? "3コースのまくり・まくり差しを確認。"
              : "4コースのカド攻めを確認。";
          const mainScenarioType = String(
            prediction.aiCore?.raceScenarios
              ?.mainScenario?.type ||
            ""
          );
          const isScenarioAligned =
            item.isAdopted &&
            (
              (course === 3 &&
                mainScenarioType === "threeAttack") ||
              (course === 4 &&
                mainScenarioType === "fourAttack")
            );
          const reflection = isScenarioAligned
            ? "正式な攻め判定と最有力展開が一致。展開根拠として反映。"
            : item.isAdopted
              ? "正式な攻め判定だが最有力展開とは不一致。補足表示のみ。"
            : item.isFormal
              ? "成立条件未達のため予想へ反映しない。"
              : "展示前の暫定値で、予想へ正式反映しない。";
          const evidence = item.hasStartEvidence
            ? "ST・隣艇比較の裏付けあり。"
            : "ST・隣艇比較の裏付け不足。";

          items.push({
            key: "attack",
            label: THEORY_LABELS.attack,
            no: boatNo || "",
            score,
            text:
              `${boatNo}号艇・${course}コースは${status}（${grade}評価）。` +
              `内訳は展開${components.development ?? 0}/40、` +
              `コース${components.course ?? 0}/20、` +
              `ST・スリット${components.startAndSlit ?? 0}/20、` +
              `展示・足${components.exhibitionFoot ?? 0}/10、` +
              `場傾向${components.venueCourse ?? 0}/10。` +
              development +
              evidence +
              reflection
          });
        });
      }
    }
    {
      const wallTheory =
        prediction.wallTheory ||
        prediction.aiCore?.wallTheory ||
        null;
      const wallCandidate =
        arrayify(wallTheory?.roles)
          .find((item) => item?.isAdjacent) ||
        null;

      if (!wallTheory || !wallCandidate) {
        items.push({
          key: "wall",
          label: THEORY_LABELS.wall,
          no: "",
          score:
            wallTheory?.state === "対象外"
              ? "対象外"
              : "暫定",
          text:
            wallTheory?.state === "対象外"
              ? "最有力展開が1号艇逃げのため、内側隣接の壁艇は設定しない。"
              : "攻め艇または展示進入の隣接関係を確定できないため、壁艇は正式採用しない。"
        });
      } else {
        const components = wallCandidate.components || {};
        const reflection =
          wallCandidate.isAdopted
            ? "65点以上で実際の進入・STまたは展示の裏付けがそろい、正式な壁艇として相手候補へ接続。"
            : wallCandidate.status === "壁崩れ"
              ? "攻め艇より明確にSTが遅く、壁崩れ候補として判定。壁艇として相手候補へ接続しない。"
              : wallCandidate.status === "互角・不安定"
                ? "壁成立点が65点未満のため、互角・不安定として正式採用しない。"
                : wallCandidate.status === "展開除外"
                  ? "最有力展開の飛び候補に該当するため、正式採用しない。"
                  : "進入・ST・展示の根拠が不足するため、暫定表示に止める。";

        items.push({
          key: "wall",
          label: THEORY_LABELS.wall,
          no: wallCandidate.boatNo || "",
          score:
            `${wallCandidate.score ?? 0}点・` +
            `${wallCandidate.grade || "-"}`,
          text:
            `${wallCandidate.boatNo}号艇・${wallCandidate.course}コースは` +
            `${wallCandidate.status}。攻め艇は${wallTheory.attackerNo || "-"}号艇。` +
            `内訳は攻め艇とのST比較${components.startComparison ?? 0}/25、` +
            `ST安定性${components.startStability ?? 0}/15、` +
            `展示進入・隣接${components.courseAdjacency ?? 0}/15、` +
            `展示直線・一周・足${components.exhibitionFoot ?? 0}/15、` +
            `残し・回り足・道中${components.holdRoad ?? 0}/15、` +
            `技量・コース適性${components.skillCourse ?? 0}/10、` +
            `場・水面・風適応${components.surfaceAdaptation ?? 0}/5。` +
            reflection +
            "既存の壁補正は最大±3点の範囲を維持し、壁成立点を重ねて加算しない。"
        });
      }
    }
        {
      const flowTheoryRows = arrayify(
        prediction.flowTheory?.ranking ||
        indexes.tenkaiRanking ||
        indexes.flowRanking
      )
        .filter(item =>
          item &&
          (
            item.isAdopted ||
            item.status === "暫定" ||
            item.status === "参考"
          )
        )
        .slice(0, 2)
        .map(item =>
          typeof item === "number" ||
          typeof item === "string"
            ? { boatNo: item }
            : item
        );

      if (!flowTheoryRows.length) {
        pushTheoryText(
          items,
          "flow",
          prediction.flowTheory?.isFormal
            ? "最有力展開と一致する65点以上の展開艇はありません。"
            : "展示または成立展開のデータが不足しているため、展開艇理論は参考判定です。"
        );
      } else {
        const getFlowBoatNo = item =>
          Number(
            item?.boatNo ||
            item?.no ||
            item?.waku ||
            item?.course ||
            item?.number ||
            0
          );

        const getFlowScore = item =>
          item?.score ??
          item?.value ??
          item?.point ??
          "";

        const flowSummary = String(
          raceFlow.summary ||
          raceFlow.scenario?.summary ||
          ""
        )
          .trim()
          .replace(/[。]+$/, "");

        flowTheoryRows.forEach(
          (item) => {
            const boatNo =
              getFlowBoatNo(item);

            const score =
              getFlowScore(item);

            const indexItem =
              indexes.byBoat?.[boatNo] ||
              arrayify(indexes.scores).find(
                row =>
                  Number(row?.boatNo) ===
                  boatNo
              ) ||
              {};

            const courseCandidate = Number(
              indexItem.course ??
              item.course ??
              boatNo
            );

            const course =
              courseCandidate >= 1 &&
              courseCandidate <= 6
                ? courseCandidate
                : boatNo;

            const raceContext =
              flowSummary
                ? `レース全体の成立展開は「${flowSummary}」。`
                : "レース全体の成立展開コメントは未取得。";

            const sourceReason = String(
              item.comment ||
              item.reason ||
              item.text ||
              indexItem.shortComment ||
              ""
            )
              .trim()
              .replace(/[。]+$/, "");

            const reasonText =
              sourceReason
                ? `指数側の根拠は「${sourceReason}」。`
                : "指数側の個別根拠は未取得。";

            const status = String(
              item.status ||
              (item.isAdopted ? "正式採用" : "参考")
            );
            const grade = String(item.grade || "");
            const components = item.components || {};
            const formalReflection = item.isAdopted
              ? "最有力展開の2・3着候補と一致し、正式な展開艇として採用。"
              : item.status === "暫定"
                ? "展示前の暫定値で、予想へ正式反映しない。"
                : "成立点または採用条件が未達のため、補足表示のみ。";

            items.push({
              key: "flow",
              label:
                THEORY_LABELS.flow,
              no: boatNo || "",
              score,
              text:
                `${boatNo}号艇・${course}コースは${status}（${grade}評価）。` +
                `内訳は展開一致${components.scenarioMatch ?? 0}/40、` +
                `位置・コース${components.positionRelation ?? 0}/20、` +
                `残し・拾い${components.holdPickup ?? 0}/15、` +
                `ST・スリット${components.startAndSlit ?? 0}/10、` +
                `展示・足${components.exhibitionFoot ?? 0}/10、` +
                `場・水面${components.venueWater ?? 0}/5。` +
                formalReflection +
                raceContext +
                reasonText +
                (
                  item.isBlocked
                    ? "最有力展開で飛び候補のため除外。"
                    : ""
                )
            });
          }
        );
      }
    }
        {
      const roadTheoryRows = arrayify(
        prediction.roadTheory?.ranking ||
        indexes.michuRanking ||
        indexes.roadRanking
      )
        .filter(Boolean)
        .slice(0, 2)
        .map(item =>
          typeof item === "number" ||
          typeof item === "string"
            ? { boatNo: item }
            : item
        );

      if (!roadTheoryRows.length) {
        pushTheoryText(
          items,
          "road",
          "道中指数の順位データがないため、道中艇理論は判定できません。"
        );
      } else {
        const getRoadBoatNo = item =>
          Number(
            item?.boatNo ||
            item?.no ||
            item?.waku ||
            item?.course ||
            item?.number ||
            0
          );

        const getRoadScore = item =>
          item?.score ??
          item?.value ??
          item?.point ??
          "";

        const roadPhaseSummary = [
          raceFlow.phases
            ?.back?.comment,
          raceFlow.phases
            ?.secondMark?.comment,
          raceFlow.phases
            ?.goal?.comment
        ]
          .filter(Boolean)
          .map(value =>
            String(value)
              .trim()
              .replace(/[。]+$/, "")
          )
          .join(" / ");

        const expectedOrder =
          arrayify(
            raceFlow.phases
              ?.goal?.expectedOrder
          );

        roadTheoryRows.forEach(
          (item, position) => {
            const boatNo =
              getRoadBoatNo(item);

            const score =
              getRoadScore(item);

            const indexItem =
              indexes.byBoat?.[boatNo] ||
              arrayify(indexes.scores).find(
                row =>
                  Number(row?.boatNo) ===
                  boatNo
              ) ||
              {};

            const courseCandidate = Number(
              indexItem.course ??
              item.course ??
              boatNo
            );

            const course =
              courseCandidate >= 1 &&
              courseCandidate <= 6
                ? courseCandidate
                : boatNo;

            const comparedItem =
              roadTheoryRows[
                position === 0 ? 1 : 0
              ] ||
              null;

            const comparedBoatNo =
              getRoadBoatNo(
                comparedItem
              );

            const comparedScore =
              getRoadScore(
                comparedItem
              );

            const scoreNumber =
              Number(score);

            const comparedScoreNumber =
              Number(comparedScore);

            const hasScore =
              score !== "" &&
              score !== null &&
              score !== undefined &&
              Number.isFinite(
                scoreNumber
              );

            const hasComparedScore =
              comparedScore !== "" &&
              comparedScore !== null &&
              comparedScore !== undefined &&
              Number.isFinite(
                comparedScoreNumber
              );

            let comparison =
              "比較できる相手艇の道中指数がないため、単独で確認。";

            if (comparedBoatNo) {
              if (
                hasScore &&
                hasComparedScore
              ) {
                const difference =
                  Math.round(
                    Math.abs(
                      scoreNumber -
                      comparedScoreNumber
                    ) * 10
                  ) / 10;

                if (difference === 0) {
                  comparison =
                    `${comparedBoatNo}号艇と道中指数${scoreNumber}で同値。`;
                } else if (
                  scoreNumber >
                  comparedScoreNumber
                ) {
                  comparison =
                    `${comparedBoatNo}号艇より道中指数が${difference}高い。`;
                } else {
                  comparison =
                    `${comparedBoatNo}号艇に次ぐ道中指数で、差は${difference}。`;
                }
              } else {
                comparison =
                  `${comparedBoatNo}号艇との比較対象だが、指数差の数値は未取得。`;
              }
            }

            let development =
              "コースを確定できないため、バック・2マークの補足材料として確認する。";

            if (course === 1) {
              development =
                "1コースは先マイ後にバックで内を守り、2マークで差し返しを防いで残す道中を確認する。";
            } else if (course === 2) {
              development =
                "2コースは差し後のバックでの伸び比べと、2マークの位置取りで1着・残しを確認する。";
            } else if (course === 3) {
              development =
                "3コースは攻めた後のバックで内を捕らえ、2マークで着を残せるか確認する。";
            } else if (course === 4) {
              development =
                "4コースはカド攻め後のバックから2マークで位置を守り、残しと拾いを確認する。";
            } else if (course === 5) {
              development =
                "5コースは内の攻めで空いた差し場をバックで拾い、2マークで2・3着へ残す道中を確認する。";
            } else if (course === 6) {
              development =
                "6コースは最外から空いた水面を追走し、バック・2マークで2・3着へ届く拾いを確認する。";
            }

            const expectedPosition =
              expectedOrder.findIndex(
                row =>
                  getRoadBoatNo(row) ===
                  boatNo
              );

            const goalPosition =
              expectedPosition >= 0
                ? `既存のゴール想定では${expectedPosition + 1}番手。`
                : "既存のゴール想定3艇には入っていないため、着を押し上げる道中の補足評価。";

            const reflectedRoles = [];

            const honmeiBoatNo = Number(
              prediction.mainSheet
                ?.honmei?.boatNo ||
              prediction.mainSheet
                ?.main?.boatNo ||
              0
            );

            if (
              honmeiBoatNo === boatNo
            ) {
              reflectedRoles.push(
                "1着候補"
              );
            }

            if (
              arrayify(
                raceFlow.holdBoats
              ).some(
                row =>
                  getRoadBoatNo(row) ===
                  boatNo
              )
            ) {
              reflectedRoles.push(
                "残し"
              );
            }

            if (
              arrayify(
                raceFlow.pickupBoats
              ).some(
                row =>
                  getRoadBoatNo(row) ===
                  boatNo
              )
            ) {
              reflectedRoles.push(
                "拾い"
              );
            }

            const reflection =
              reflectedRoles.length
                ? `現在の予想では${reflectedRoles.join("・")}へ反映。`
                : "現在の予想では1着候補・残し・拾いへ直接反映せず、道中評価の補足材料。";

            const phaseContext =
              roadPhaseSummary
                ? `バックからゴールまでの既存分析は「${roadPhaseSummary}」。`
                : "バック・2マーク・ゴールの分析コメントは未取得。";

            const sourceReason = String(
              item.comment ||
              item.reason ||
              item.text ||
              indexItem.shortComment ||
              ""
            )
              .trim()
              .replace(/[。]+$/, "");

            const reasonText =
              sourceReason
                ? `指数側の根拠は「${sourceReason}」。`
                : "指数側の個別根拠は未取得。";

            items.push({
              key: "road",
              label:
                THEORY_LABELS.road,
              no: boatNo || "",
              score,
              text:
                item.components
                  ? (
                    `${boatNo}号艇・${course}コースは${item.status || "参考"}` +
                    `（${item.grade || "-"}評価・${item.role || "道中"}）。` +
                    `内訳はゴール想定${item.components.scenarioMatch ?? 0}/30、` +
                    `一周・回り足・展示${item.components.lapAndFoot ?? 0}/25、` +
                    `今節安定${item.components.seriesStability ?? 0}/15、` +
                    `進入・位置${item.components.coursePosition ?? 0}/15、` +
                    `当地・水面${item.components.localWater ?? 0}/10、` +
                    `技量${item.components.playerSkill ?? 0}/5。` +
                    (
                      item.isAdopted
                        ? "65点以上で最有力展開のゴール想定と一致し、正式な道中艇として採用。"
                        : item.status === "暫定"
                          ? "一周タイムまたは今節成績の裏付け不足により、予想へ正式反映しない。"
                          : item.isBlocked
                            ? "最有力展開の飛び候補のため、正式採用しない。"
                            : "成立点またはゴール想定との一致条件が未達のため、補足表示のみ。"
                    ) +
                    phaseContext +
                    reasonText
                  )
                  : (
                    `${boatNo}号艇を道中艇理論の既存表示${position + 1}位として確認。` +
                    comparison +
                    development +
                    goalPosition +
                    reflection +
                    phaseContext +
                    reasonText
                  )
            });
          }
        );
      }
    }
        {
      const localTheoryRows = arrayify(
        prediction.localTheory?.ranking ||
        indexes.localRanking
      )
        .filter(item =>
          item &&
          (
            item.isAdopted ||
            item.status === "暫定" ||
            item.status === "参考"
          )
        )
        .slice(0, 2)
        .map(item =>
          typeof item === "number" ||
          typeof item === "string"
            ? { boatNo: item }
            : item
        );

      if (!localTheoryRows.length) {
        pushTheoryText(
          items,
          "local",
          prediction.localTheory?.isFormal
            ? "最有力展開と一致する65点以上の当地巧者はいません。"
            : "当地・全国成績または成立展開のデータが不足しているため、当地巧者理論は参考判定です。"
        );
      } else {
        const getLocalBoatNo = item =>
          Number(
            item?.boatNo ||
            item?.no ||
            item?.waku ||
            item?.course ||
            item?.number ||
            0
          );

        const getLocalScore = item =>
          item?.score ??
          item?.value ??
          item?.point ??
          "";

        const localEntries =
          arrayify(
            prediction.race?.entries
          );

        const getLocalEntry = boatNo =>
          localEntries.find(
            entry =>
              Number(entry?.boatNo) ===
              boatNo
          ) ||
          {};

        const hasLocalRate = value =>
          value !== null &&
          value !== undefined &&
          value !== "" &&
          Number.isFinite(
            Number(value)
          ) &&
          Number(value) > 0;

        const formatLocalRate = value =>
          Number(value)
            .toFixed(2)
            .replace(/\.?0+$/, "");

        const localVenue =
          prediction.venue ||
          {};

        const localWeather =
          prediction.weather ||
          {};

        const venueName =
          localVenue.name ||
          prediction.race
            ?.stadiumName ||
          "この場";

        const venueContextParts = [
          `${venueName}・${localVenue.water || "水面種別未取得"}`,
          localVenue.memo,
          localWeather.comment
        ]
          .filter(Boolean)
          .map(value =>
            String(value)
              .trim()
              .replace(/[。]+$/, "")
          );

        const venueContext =
          venueContextParts.length
            ? `当地・水面の既存分析は「${venueContextParts.join(" / ")}」。`
            : "当地・水面の分析コメントは未取得。";

        localTheoryRows.forEach(
          (item, position) => {
            const boatNo =
              getLocalBoatNo(item);

            const score =
              getLocalScore(item);

            const indexItem =
              indexes.byBoat?.[boatNo] ||
              arrayify(indexes.scores).find(
                row =>
                  Number(row?.boatNo) ===
                  boatNo
              ) ||
              {};

            const entry =
              getLocalEntry(boatNo);

            const localRate =
              entry.local?.winRate;

            const courseCandidate = Number(
              indexItem.course ??
              item.course ??
              boatNo
            );

            const course =
              courseCandidate >= 1 &&
              courseCandidate <= 6
                ? courseCandidate
                : boatNo;

            const comparedItem =
              localTheoryRows[
                position === 0 ? 1 : 0
              ] ||
              null;

            const comparedBoatNo =
              getLocalBoatNo(
                comparedItem
              );

            const comparedScore =
              getLocalScore(
                comparedItem
              );

            const comparedEntry =
              getLocalEntry(
                comparedBoatNo
              );

            const comparedLocalRate =
              comparedEntry.local
                ?.winRate;

            const scoreNumber =
              Number(score);

            const comparedScoreNumber =
              Number(comparedScore);

            const hasScore =
              score !== "" &&
              score !== null &&
              score !== undefined &&
              Number.isFinite(
                scoreNumber
              );

            const hasComparedScore =
              comparedScore !== "" &&
              comparedScore !== null &&
              comparedScore !== undefined &&
              Number.isFinite(
                comparedScoreNumber
              );

            let comparison =
              "比較できる相手艇の当地指数がないため、単独で確認。";

            if (comparedBoatNo) {
              if (
                hasScore &&
                hasComparedScore
              ) {
                const difference =
                  Math.round(
                    Math.abs(
                      scoreNumber -
                      comparedScoreNumber
                    ) * 10
                  ) / 10;

                if (difference === 0) {
                  comparison =
                    `${comparedBoatNo}号艇と当地指数${scoreNumber}で同値。`;
                } else if (
                  scoreNumber >
                  comparedScoreNumber
                ) {
                  comparison =
                    `${comparedBoatNo}号艇より当地指数が${difference}高い。`;
                } else {
                  comparison =
                    `${comparedBoatNo}号艇に次ぐ当地指数で、差は${difference}。`;
                }
              } else {
                comparison =
                  `${comparedBoatNo}号艇との比較対象だが、指数差の数値は未取得。`;
              }
            }

            let rateComparison =
              "当地勝率データがないため、当地巧者としての直接比較はできない。";

            if (
              hasLocalRate(localRate)
            ) {
              if (
                hasLocalRate(
                  comparedLocalRate
                ) &&
                comparedBoatNo
              ) {
                const rateDifference =
                  Math.round(
                    Math.abs(
                      Number(localRate) -
                      Number(
                        comparedLocalRate
                      )
                    ) * 100
                  ) / 100;

                if (
                  rateDifference === 0
                ) {
                  rateComparison =
                    `当地勝率は両艇とも${formatLocalRate(localRate)}。`;
                } else if (
                  Number(localRate) >
                  Number(
                    comparedLocalRate
                  )
                ) {
                  rateComparison =
                    `当地勝率${formatLocalRate(localRate)}で、` +
                    `${comparedBoatNo}号艇の${formatLocalRate(comparedLocalRate)}より${rateDifference}高い。`;
                } else {
                  rateComparison =
                    `当地勝率${formatLocalRate(localRate)}で、` +
                    `${comparedBoatNo}号艇の${formatLocalRate(comparedLocalRate)}より${rateDifference}低い。`;
                }
              } else {
                rateComparison =
                  `当地勝率は${formatLocalRate(localRate)}。比較艇の当地勝率は未取得。`;
              }
            }

            let development =
              "コースを確定できないため、当地・水面適応は展開の補足材料として確認する。";

            if (course === 1) {
              development =
                "1コースでは当地・水面適応をイン先マイと内残しの補足に使う。";
            } else if (course === 2) {
              development =
                "2コースでは当地・水面適応を2差しと差し残しの補足に使う。";
            } else if (course === 3) {
              development =
                "3コースでは当地・水面適応をまくり・まくり差し後の残しと拾いの補足に使う。";
            } else if (course === 4) {
              development =
                "4コースでは当地・水面適応をカド攻め後の残しと外側の拾いの補足に使う。";
            } else if (course === 5) {
              development =
                "5コースでは当地・水面適応を展開に乗るまくり差しと2・3着拾いの補足に使う。";
            } else if (course === 6) {
              development =
                "6コースでは当地・水面適応を最外からの追走と2・3着拾いの補足に使う。";
            }

            const reflectedRoles = [];

            const honmeiBoatNo = Number(
              prediction.mainSheet
                ?.honmei?.boatNo ||
              prediction.mainSheet
                ?.main?.boatNo ||
              0
            );

            if (
              honmeiBoatNo === boatNo
            ) {
              reflectedRoles.push(
                "1着候補"
              );
            }

            if (
              arrayify(
                raceFlow.holdBoats
              ).some(
                row =>
                  getLocalBoatNo(row) ===
                  boatNo
              )
            ) {
              reflectedRoles.push(
                "残し"
              );
            }

            if (
              arrayify(
                raceFlow.pickupBoats
              ).some(
                row =>
                  getLocalBoatNo(row) ===
                  boatNo
              )
            ) {
              reflectedRoles.push(
                "拾い"
              );
            }

            const reflection =
              reflectedRoles.length
                ? `現在の予想では${reflectedRoles.join("・")}へ反映。`
                : "現在の予想では1着候補・残し・拾いへ直接反映せず、当地・水面評価の補足材料。";

            const sourceReason = String(
              item.comment ||
              item.reason ||
              item.text ||
              indexItem.shortComment ||
              ""
            )
              .trim()
              .replace(/[。]+$/, "");

            const reasonText =
              sourceReason
                ? `指数側の根拠は「${sourceReason}」。`
                : "指数側の個別根拠は未取得。";

            items.push({
              key: "local",
              label:
                THEORY_LABELS.local,
              no: boatNo || "",
              score,
              text:
                item.components
                  ? (
                    `${boatNo}号艇・${course}コースは${item.status || "参考"}` +
                    `（${item.grade || "-"}評価・${item.role || "展開外"}）。` +
                    `内訳は当地・全国比較${item.components.localVsNational ?? 0}/25、` +
                    `当地成績${item.components.localResults ?? 0}/20、` +
                    `展開役割${item.components.scenarioRole ?? 0}/20、` +
                    `進入適合${item.components.venueCourse ?? 0}/15、` +
                    `場・水面${item.components.venueWater ?? 0}/15、` +
                    `技量${item.components.playerSkill ?? 0}/5。` +
                    (
                      item.isAdopted
                        ? "65点以上で最有力展開の1〜3着候補と一致し、正式な当地巧者として採用。"
                        : item.status === "暫定"
                          ? "当地勝率・全国勝率・当地2連率または3連率の裏付け不足により、予想へ正式反映しない。"
                          : item.isBlocked
                            ? "最有力展開の飛び候補のため、正式採用しない。"
                            : "成立点または展開一致条件が未達のため、補足表示のみ。"
                    ) +
                    venueContext +
                    "当地評価だけで印・展開・買い目を変更しない。" +
                    reasonText
                  )
                  : (
                    `${boatNo}号艇を当地巧者理論の既存表示${position + 1}位として確認。` +
                    comparison +
                    rateComparison +
                    development +
                    reflection +
                    venueContext +
                    "当地評価は展開・コース・ST・展示の後に補正し、当地数字だけで1着候補や買い目を決めない。" +
                    reasonText
                  )
            });
          }
        );
      }
    }

    {
      const racerSkillTheory =
        prediction.racerSkillTheory ||
        prediction.aiCore?.racerSkillTheory ||
        null;
      const displayRows =
        arrayify(racerSkillTheory?.ranking)
          .filter(item =>
            item &&
            (
              item.isAdopted ||
              item.status === "暫定" ||
              item.status === "標準・参考"
            )
          )
          .slice(0, 2);

      if (!racerSkillTheory || !displayRows.length) {
        items.push({
          key: "racerSkill",
          label: THEORY_LABELS.racerSkill,
          no: "",
          score:
            racerSkillTheory?.isProvisional
              ? "暫定"
              : "成立なし",
          text:
            racerSkillTheory
              ? "公式の実進入コース別履歴が12走未満、または65点以上で最有力展開と一致する艇がないため、正式な技量評価は採用していない。級別だけで印を上げず、B級だけで消さない。"
              : "共通の選手技量・戦法適性データがないため、正式判定できない。"
        });
      } else {
        displayRows.forEach(item => {
          const components =
            item.components || {};
          const adoptionText =
            item.isAdopted
              ? "65点以上・実進入12走以上・最有力展開一致により、正式な技量評価として展開役割の根拠へ接続。"
              : item.isBlocked
                ? "飛び候補のため正式採用しない。"
                : item.status === "暫定"
                  ? `実進入${item.course}コース${item.samples || 0}走で必要使用数に届かず、推測表示に止める。`
                  : "成立点または展開一致条件が未達のため、補足表示のみ。";
          const reliabilityText =
            item.reliability === "high"
              ? "30走以上・高信頼"
              : item.reliability === "medium"
                ? "12走以上・中信頼"
                : "12走未満・低信頼";

          items.push({
            key: "racerSkill",
            label: THEORY_LABELS.racerSkill,
            no: item.boatNo || "",
            score:
              `${item.score ?? 0}点・` +
              `${item.grade || "-"}`,
            text:
              `${item.boatNo}号艇・実進入${item.course}コースは${item.status}` +
              `（${item.role || "展開外"}・${reliabilityText}）。` +
              `内訳は現在コース1着率・3連率${components.coursePerformance ?? 0}/25、` +
              `コース別ST・安定性${components.courseStart ?? 0}/15、` +
              `得意戦法一致${components.methodFit ?? 0}/20、` +
              `直近1年・過去2年推移${components.recentTrend ?? 0}/15、` +
              `級別・全国勝率${components.classNational ?? 0}/15、` +
              `今節着順・道中${components.seriesRoad ?? 0}/5、` +
              `最有力展開役割${components.scenarioRole ?? 0}/5。` +
              `戦法根拠は${item.methodLabel || "不足"}。` +
              adoptionText +
              "技量適性点は既存の技量枠へ二重加算せず、展開・コース・ST・展示・当地水面の判断を逆転させない。"
          });
        });
      }
    }

        const slitPhase =
      raceFlow.phases?.slit || null;

    if (
      Array.isArray(
        slitPhase?.alerts
      ) &&
      slitPhase.alerts.length
    ) {
      slitPhase.alerts.forEach(
        alert => {
          pushTheoryText(
            items,
            "slit",
            alert
          );
        }
      );
    } else {
      pushTheoryText(
        items,
        "slit",
        slitPhase?.comment ||
          finalAi.slitAlert ||
          exhibition.slitAlert ||
          raceFlow.slitAlert ||
          "スリットアラートの判定データがありません。"
      );
    }
        const doubleTimeBoat =
      exhibition.doubleTimeBoat ||
      null;

    const doubleTimeList =
      arrayify(
        exhibition.list
      );

    const exhibitionTop =
      exhibition.topExhibition ||
      doubleTimeList.find(
        item =>
          Number(
            item?.exhibitionRank
          ) === 1
      ) ||
      null;

    const lapTop =
      exhibition.topLap ||
      doubleTimeList.find(
        item =>
          Number(
            item?.lapRank
          ) === 1
      ) ||
      null;

    if (doubleTimeBoat) {
      const boatNo =
        Number(
          doubleTimeBoat.boatNo ||
          0
        );

      const course =
        Number(
          doubleTimeBoat.course ||
          boatNo
        );

      const exhibitionSecond =
        doubleTimeList.find(
          item =>
            Number(
              item?.exhibitionRank
            ) === 2
        ) ||
        null;

      const lapSecond =
        doubleTimeList.find(
          item =>
            Number(
              item?.lapRank
            ) === 2
        ) ||
        null;

      const comparison = [];

      if (exhibitionSecond) {
        comparison.push(
          `展示${doubleTimeBoat.exhibitionTime}` +
          `（2位${exhibitionSecond.boatNo}号艇 ` +
          `${exhibitionSecond.exhibitionTime}）`
        );
      } else {
        comparison.push(
          `展示${doubleTimeBoat.exhibitionTime}`
        );
      }

      if (lapSecond) {
        comparison.push(
          `一周${doubleTimeBoat.lapTime}` +
          `（2位${lapSecond.boatNo}号艇 ` +
          `${lapSecond.lapTime}）`
        );
      } else {
        comparison.push(
          `一周${doubleTimeBoat.lapTime}`
        );
      }

      let development =
        "展示直線と回り足の両方が上位で、展開を作れる足。";

      if (course === 1) {
        development =
          "イン先マイを後押しし、1着候補として確認する足。";
      } else if (course === 2) {
        development =
          "2コース差しの入口となり、1着候補と内の残しを比較する足。";
      } else if (
        course === 3 ||
        course === 4
      ) {
        development =
          `${course}コース攻めの入口となり、` +
          "内の残しと外の拾いを比較する足。";
      } else if (course >= 5) {
        development =
          "外から展開を突く足で、1着固定ではなく拾いまで確認する。";
      }

      const reflectedRoles = [];

      const honmeiBoatNo =
        Number(
          prediction.mainSheet
            ?.honmei?.boatNo ||
          prediction.mainSheet
            ?.main?.boatNo ||
          0
        );

      if (
        honmeiBoatNo === boatNo
      ) {
        reflectedRoles.push(
          "1着候補"
        );
      }

      if (
        arrayify(
          raceFlow.holdBoats
        ).some(
          item =>
            Number(
              item?.boatNo
            ) === boatNo
        )
      ) {
        reflectedRoles.push(
          "残し"
        );
      }

      if (
        arrayify(
          raceFlow.pickupBoats
        ).some(
          item =>
            Number(
              item?.boatNo
            ) === boatNo
        )
      ) {
        reflectedRoles.push(
          "拾い"
        );
      }

      const reflection =
        reflectedRoles.length
          ? `現在の予想では` +
            `${reflectedRoles.join("・")}へ反映。`
          : "現在の予想では1着候補・残し・拾いへ直接反映せず、展示評価の補足材料。";

      pushTheoryText(
        items,
        "doubleTime",
        {
          boatNo,

          score:
            doubleTimeBoat.score ??
            "",

          comment:
            `${boatNo}号艇が` +
            `${comparison.join("、")}でともに1位。` +
            "展示1位＋一周1位が一致し、ダブルタイム発動。" +
            development +
            reflection
        }
      );
    } else if (
      exhibitionTop &&
      lapTop
    ) {
      const exhibitionBoatNo =
        Number(
          exhibitionTop.boatNo ||
          0
        );

      const lapBoatNo =
        Number(
          lapTop.boatNo ||
          0
        );

      const sameTop =
        exhibitionBoatNo ===
        lapBoatNo;

      const reason =
        sameTop
          ? "展示1位と一周1位は同じ艇だが、ダブルタイム判定データが成立していないため発動していない。"
          : `展示1位は${exhibitionBoatNo}号艇` +
            `（${exhibitionTop.exhibitionTime}）、` +
            `一周1位は${lapBoatNo}号艇` +
            `（${lapTop.lapTime}）で一致しないため、` +
            "ダブルタイムは発動していない。";

      pushTheoryText(
        items,
        "doubleTime",
        reason +
          "それぞれ展示気配と回り足の補足材料とし、1着候補・残し・拾いは展開全体から判断する。"
      );
    } else {
      const missing = [];

      if (!exhibitionTop) {
        missing.push(
          "展示タイム"
        );
      }

      if (!lapTop) {
        missing.push(
          "一周タイム"
        );
      }

      const knownTop =
        exhibitionTop
          ? `展示1位は${exhibitionTop.boatNo}号艇だが、`
          : lapTop
            ? `一周1位は${lapTop.boatNo}号艇だが、`
            : "";

      pushTheoryText(
        items,
        "doubleTime",
        knownTop +
          `${missing.join("・")}が不足しているため、` +
          "ダブルタイムは判定できない。"
      );
    }
    const newSamTheory = prediction.newSam || {};
    const newSamRows = arrayify(newSamTheory.ranking);

    if (newSamRows.length) {
      newSamRows.forEach((row) => {
        const diff = Number(row?.diff || 0);
        const diffText = `${diff >= 0 ? "+" : ""}${diff.toFixed(3)}`;
        const adjustment = Number(row?.scoreAdjustment || 0);
        const reflection = adjustment > 0
          ? `${row.role}へ+${adjustment}点の範囲で反映。`
          : row?.comment || "参考表示のみ。";

        pushTheoryText(
          items,
          "shinsam",
          {
            boatNo: Number(row?.boatNo || 0),
            score: `${row?.grade || "-"} ${diffText}`,
            comment:
              `${row?.boatNo}号艇は展示` +
              `${Number(row?.exhibitionTime || 0).toFixed(2)}＋一周` +
              `${Number(row?.lapTime || 0).toFixed(2)}＝合計` +
              `${Number(row?.sum || 0).toFixed(3)}。` +
              `6艇平均${Number(newSamTheory.average || 0).toFixed(3)}との差は` +
              `${diffText}、新サム${row?.grade || "-"}評価。` +
              reflection
          }
        );
      });

      if (!newSamTheory.isFormal) {
        pushTheoryText(
          items,
          "shinsam",
          `6艇分がそろっていないため参考表示のみ。` +
            `不足：${arrayify(newSamTheory.missingBoatNos).join("・") || "不明"}号艇。`
        );
      }
    } else {
      pushTheoryText(
        items,
        "shinsam",
        "展示タイムと一周タイムがそろった艇がないため、新サムは判定できない。"
      );
    }
    const waterWeatherTheory =
      prediction.waterWeatherTheory ||
      prediction.aiCore?.waterWeatherTheory ||
      null;

    if (waterWeatherTheory) {
      const surface = waterWeatherTheory.surface || {};
      const wind = waterWeatherTheory.wind || {};
      const conditionText = [
        wind.label || "風向不明",
        waterWeatherTheory.windSpeed !== null
          ? `風速${waterWeatherTheory.windSpeed}m`
          : "風速不明",
        waterWeatherTheory.waveHeight !== null
          ? `波高${waterWeatherTheory.waveHeight}cm`
          : "波高不明",
        surface.waterType || "水面種別不明",
        surface.hasLiveTide
          ? `潮${surface.tideFlow || surface.tideLevel}`
          : surface.isTidal
            ? "現在潮位・潮流なし"
            : "潮汐影響小"
      ].join("・");
      const displayRows =
        arrayify(waterWeatherTheory.ranking)
          .filter(item =>
            item &&
            (
              item.isAdopted ||
              item.status === "暫定" ||
              item.status === "参考"
            )
          )
          .slice(0, 2);

      if (!displayRows.length) {
        items.push({
          key: "waterWeather",
          label: "🌊 水面・気象適応",
          no: "",
          score: waterWeatherTheory.isProvisional ? "暫定" : "成立なし",
          text:
            `${conditionText}。` +
            (
              waterWeatherTheory.isProvisional
                ? "実測値または分類根拠が不足するため、正式な適応艇は採用していない。"
                : "65点以上かつ最有力展開と一致する正式な水面適応艇はいない。"
            ) +
            "既存の風・波補正だけを維持し、適応点は印・展開・買い目へ二重加算しない。"
        });
      } else {
        displayRows.forEach(item => {
          const components = item.components || {};
          const adoptionText =
            item.isAdopted
              ? "65点以上で最有力展開と一致し、正式な水面適応艇として採用。"
              : item.isBlocked
                ? "飛び候補のため正式採用しない。"
                : item.status === "暫定"
                  ? "風・波・潮または展示の根拠不足により、正式採用しない。"
                  : "成立点または展開一致条件が未達のため、補足表示のみ。";

          items.push({
            key: "waterWeather",
            label: "🌊 水面・気象適応",
            no: item.boatNo || "",
            score: `${item.score ?? 0}点・${item.grade || "-"}`,
            text:
              `${conditionText}。` +
              `${item.boatNo}号艇・${item.course}コースは${item.status}` +
              `（${item.role || "展開外"}）。` +
              `内訳は風向・風速とコース${components.windCourse ?? 0}/20、` +
              `波・展示・回り足${components.waveExhibition ?? 0}/20、` +
              `水面・潮汐${components.surfaceTide ?? 0}/15、` +
              `展開役割${components.scenarioRole ?? 0}/20、` +
              `当地・道中${components.localRoad ?? 0}/15、` +
              `ST・技量${components.stSkill ?? 0}/10。` +
              `${adoptionText}` +
              "適応点だけで印・展開・買い目を変更せず、既存の風・波補正へ二重加算しない。"
          });
        });
      }
    } else {
      items.push({
        key: "waterWeather",
        label: "🌊 水面・気象適応",
        no: "",
        score: "判定不可",
        text: "共通の水面・気象適応データがないため、正式判定できない。"
      });
    }

    const motorMaintenanceTheory =
      prediction.motorMaintenanceTheory ||
      prediction.aiCore?.motorMaintenanceTheory ||
      null;

    if (motorMaintenanceTheory) {
      const displayRows =
        arrayify(motorMaintenanceTheory.ranking)
          .filter(item =>
            item &&
            (
              item.isAdopted ||
              item.status === "暫定" ||
              item.status === "参考"
            )
          )
          .slice(0, 2);

      if (!displayRows.length) {
        items.push({
          key: "motorMaintenance",
          label: "🔩 モーター・整備気配",
          no: "",
          score:
            motorMaintenanceTheory.isProvisional
              ? "暫定"
              : "成立なし",
          text:
            `${motorMaintenanceTheory.motorStatsStatus || "モーター数字は参考"}。` +
            (
              motorMaintenanceTheory.isProvisional
                ? "展示または今節実績の裏付けが不足するため、正式な実戦機力艇は採用していない。"
                : "65点以上かつ実走根拠・最有力展開がそろう正式な実戦機力艇はいない。"
            ) +
            "実戦機力点だけで印・展開・買い目は変更しない。"
        });
      } else {
        displayRows.forEach(item => {
          const components = item.components || {};
          const maintenance = item.maintenance || {};
          const partsText =
            maintenance.partsExchange
              ? `部品交換は${maintenance.partsExchange}、交換後判定は${maintenance.trend || "比較不足"}。`
              : "部品交換情報なし。";
          const adoptionText =
            item.isAdopted
              ? "65点以上で実走根拠と最有力展開が一致し、正式な機力評価として採用。"
              : item.isBlocked
                ? "飛び候補のため正式採用しない。"
                : item.status === "暫定"
                  ? "展示または今節実績が不足するため、正式採用しない。"
                  : "成立点または展開一致条件が未達のため、補足表示のみ。";

          items.push({
            key: "motorMaintenance",
            label: "🔩 モーター・整備気配",
            no: item.boatNo || "",
            score: `${item.score ?? 0}点・${item.grade || "-"}`,
            text:
              `${item.boatNo}号艇・${item.course}コースは${item.status}` +
              `（${item.role || "展開外"}）。` +
              `内訳は展示・一周・回り足${components.exhibitionFoot ?? 0}/25、` +
              `今節・道中${components.currentRoad ?? 0}/20、` +
              `今節ST・スリット${components.startAndSlit ?? 0}/15、` +
              `整備後変化${components.maintenanceChange ?? 0}/15、` +
              `場内相対モーター${components.relativeMotor ?? 0}/10、` +
              `展開役割${components.scenarioRole ?? 0}/10、` +
              `調整力・当地${components.playerAdjustment ?? 0}/5。` +
              `${partsText}${motorMaintenanceTheory.motorStatsStatus || ""}。` +
              `${adoptionText}` +
              "モーターとボート成績を分離し、実戦機力点だけで印・展開・買い目を変更しない。"
          });
        });
      }
    } else {
      items.push({
        key: "motorMaintenance",
        label: "🔩 モーター・整備気配",
        no: "",
        score: "判定不可",
        text: "共通のモーター・整備気配データがないため、正式判定できない。"
      });
    }

    const newEnvironmentTheory =
      prediction.newEnvironmentTheory ||
      prediction.aiCore?.newEnvironmentTheory ||
      null;

    if (newEnvironmentTheory) {
      const deployments =
        arrayify(newEnvironmentTheory.deployments)
          .filter(item => item?.enabled);
      const deploymentText =
        deployments.length
          ? deployments
              .map(item =>
                `${item.label}${item.introducedAt ? `（${item.introducedAt}導入）` : ""}・${item.status}`
              )
              .join("、")
          : "新型エンジン・新燃料とも対象登録なし";
      const environmentLabel =
        deployments.map(item => item.label).join("・") ||
        "新型エンジン・新燃料";
      const displayRows =
        arrayify(newEnvironmentTheory.ranking)
          .filter(item =>
            item &&
            (
              item.isAdopted ||
              item.status === "暫定" ||
              item.status === "参考"
            )
          )
          .slice(0, 2);

      if (!newEnvironmentTheory.isTarget) {
        items.push({
          key: "newEngine",
          label: "🔧 新型エンジン・新燃料",
          no: "",
          score: "",
          text:
            `${newEnvironmentTheory.venueName || "この場"}は対象期間として登録されていない。` +
            "通常どおり展開・コース・ST・展示を優先し、モーター数字は補助材料として扱う。"
        });
      } else if (newEnvironmentTheory.isStable) {
        items.push({
          key: "newEngine",
          label: `🔧 ${environmentLabel}`,
          no: "",
          score: "通常評価",
          text:
            `${deploymentText}。導入から121日以上の安定期に入っているため、` +
            "新環境補正は終了し、通常評価へ戻している。"
        });
      } else if (!displayRows.length) {
        items.push({
          key: "newEngine",
          label: `🔧 ${environmentLabel}`,
          no: "",
          score:
            newEnvironmentTheory.isProvisional
              ? "暫定"
              : "成立なし",
          text:
            `${deploymentText}。` +
            (
              newEnvironmentTheory.isProvisional
                ? "導入日が不明なため正式判定せず、予想への新環境補正も発動していない。"
                : "65点以上かつ最有力展開と一致する正式な適応艇はいない。"
            )
        });
      } else {
        displayRows.forEach(item => {
          const components = item.components || {};
          const evidenceText =
            item.hasAdaptationEvidence
              ? "展示または今節実績の裏付けあり"
              : "展示・今節実績不足";
          const adoptionText =
            item.isAdopted
              ? "65点以上で最有力展開と一致し、正式な適応艇として採用。"
              : item.status === "暫定"
                ? "導入日または実績データ不足のため、予想へ正式反映しない。"
                : item.isBlocked
                  ? "飛び候補のため正式採用しない。"
                  : "成立点または展開一致条件が未達のため、補足表示のみ。";

          items.push({
            key: "newEngine",
            label: `🔧 ${environmentLabel}`,
            no: item.boatNo || "",
            score: `${item.score ?? 0}点・${item.grade || "-"}`,
            text:
              `${deploymentText}。` +
              `${item.boatNo}号艇・${item.course}コースは${item.status}` +
              `（${item.role || "展開外"}）。` +
              `内訳は展示・足${components.exhibitionFoot ?? 0}/30、` +
              `今節ST・スリット${components.startAndSlit ?? 0}/20、` +
              `今節・道中${components.currentAndRoad ?? 0}/20、` +
              `展開役割${components.scenarioRole ?? 0}/15、` +
              `技量${components.playerSkill ?? 0}/10、` +
              `当地・水面${components.localWater ?? 0}/5。` +
              `${evidenceText}。${adoptionText}` +
              "新環境適応点だけで印・展開・買い目を変更せず、モーター2連率・3連率は直接加点しない。"
          });
        });
      }
    } else {
      const engineTheory =
        prediction.newEngine ||
        {};

    const engineVenue =
      prediction.venue ||
      {};

    const engineWeather =
      prediction.weather ||
      {};

    const engineEntries =
      arrayify(
        prediction.race?.entries
      );

    const engineVenueName =
      engineTheory.venueName ||
      engineVenue.name ||
      prediction.race?.stadiumName ||
      "この場";

    const enginePhaseText =
      engineTheory.phaseLabel &&
      engineTheory.phaseLabel !==
        "通常"
        ? engineTheory.phaseLabel
        : "対象期間";

    const hasEngineNumber =
      value =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(
          Number(value)
        );

    if (!engineTheory.updated) {
      items.push({
        key: "newEngine",

        label:
          "🔧 新型エンジン",

        no: "",

        score: "",

        text:
          `${engineVenueName}は新型エンジン対象期間として登録されていないため、` +
          "新型エンジン理論は発動していない。" +
          "通常どおり展開・コース・ST・展示を優先して判断する。"
      });
    } else {
      const engineRoles =
        new Map();

      const addEngineRole = (
        candidate,
        role
      ) => {
        const boatNo =
          Number(
            candidate?.boatNo ||
            candidate?.no ||
            0
          );

        if (
          boatNo < 1 ||
          boatNo > 6
        ) {
          return;
        }

        const roles =
          engineRoles.get(
            boatNo
          ) ||
          [];

        if (
          !roles.includes(
            role
          )
        ) {
          roles.push(
            role
          );
        }

        engineRoles.set(
          boatNo,
          roles
        );
      };

      addEngineRole(
        prediction.mainSheet
          ?.honmei ||
        prediction.mainSheet
          ?.main,
        "1着候補"
      );

      arrayify(
        raceFlow.holdBoats
      ).forEach(
        item =>
          addEngineRole(
            item,
            "残し"
          )
      );

      arrayify(
        raceFlow.pickupBoats
      ).forEach(
        item =>
          addEngineRole(
            item,
            "拾い"
          )
      );

      const engineExhibitionRows =
        doubleTimeList
          .filter(
            item =>
              hasEngineNumber(
                item?.exhibitionTime
              ) &&
              Number(
                item.exhibitionTime
              ) > 0
          )
          .sort(
            (a, b) =>
              Number(
                a.exhibitionTime
              ) -
              Number(
                b.exhibitionTime
              )
          );

      const engineStRows =
        doubleTimeList
          .filter(
            item =>
              hasEngineNumber(
                item?.exhibitionSTNumber
              )
          )
          .sort(
            (a, b) =>
              Number(
                a.exhibitionSTNumber
              ) -
              Number(
                b.exhibitionSTNumber
              )
          );

      const waterParts = [];

      if (
        hasEngineNumber(
          engineWeather.windSpeed
        )
      ) {
        waterParts.push(
          `風${engineWeather.windSpeed}m`
        );
      }

      if (
        hasEngineNumber(
          engineWeather.waveHeight
        )
      ) {
        waterParts.push(
          `波${engineWeather.waveHeight}cm`
        );
      }

      if (
        arrayify(
          engineVenue.bias
        ).length
      ) {
        waterParts.push(
          arrayify(
            engineVenue.bias
          ).join("・")
        );
      }

      const createEngineComparison = (
        item,
        rankKey,
        rows,
        label
      ) => {
        const rank =
          Number(
            item?.[rankKey] ||
            0
          );

        if (!rank) {
          return "";
        }

        if (rank === 1) {
          const second =
            rows.find(
              row =>
                Number(
                  row?.boatNo
                ) !==
                Number(
                  item?.boatNo
                )
            );

          return second
            ? `${label}は${second.boatNo}号艇との比較で1位`
            : `${label}1位`;
        }

        const top =
          rows[0];

        return top
          ? `${label}1位${top.boatNo}号艇との比較で${rank}位`
          : "";
      };

      if (
        engineRoles.size === 0
      ) {
        items.push({
          key: "newEngine",

          label:
            "🔧 新型エンジン",

          no: "",

          score:
            enginePhaseText,

          text:
            `${engineVenueName}は新型エンジン${enginePhaseText}。` +
            "モーター数字を過信せず、展示・ST・今節気配・技量・当地・水面を確認したが、" +
            "現在の予想に1着候補・残し・拾いがないため、艇別の直接反映はない。"
        });
      } else {
        engineRoles.forEach(
          (roles, boatNo) => {
            const entry =
              engineEntries.find(
                item =>
                  Number(
                    item?.boatNo
                  ) === boatNo
              ) ||
              {};

            const exhibitionItem =
              doubleTimeList.find(
                item =>
                  Number(
                    item?.boatNo
                  ) === boatNo
              ) ||
              {};

            const indexItem =
              indexes.byBoat?.[
                boatNo
              ] ||
              arrayify(
                indexes.scores
              ).find(
                item =>
                  Number(
                    item?.boatNo
                  ) === boatNo
              ) ||
              {};

            const evidence = [];

            let hasCurrentForm =
              false;

            if (
              hasEngineNumber(
                indexItem.currentSTAverage
              ) &&
              Number(
                indexItem.currentSTCount
              ) > 0
            ) {
              evidence.push(
                `今節ST平均${Number(indexItem.currentSTAverage).toFixed(2)}` +
                `・${indexItem.currentSTCount}走`
              );

              hasCurrentForm =
                true;
            } else if (
              entry.avgST
            ) {
              evidence.push(
                `平均ST${entry.avgST}`
              );
            }

            const currentForm =
              safeText(
                entry.currentSeries
                  ?.text,
                ""
              );

            if (currentForm) {
              evidence.push(
                `今節気配${limitText(currentForm, 40)}`
              );

              hasCurrentForm =
                true;
            }

            if (!hasCurrentForm) {
              evidence.push(
                "今節気配未取得"
              );
            }

            if (
              hasEngineNumber(
                exhibitionItem
                  .exhibitionSTNumber
              )
            ) {
              evidence.push(
                `展示ST${Number(exhibitionItem.exhibitionSTNumber).toFixed(2)}` +
                (
                  exhibitionItem.stRank
                    ? `・${exhibitionItem.stRank}位`
                    : ""
                )
              );
            }

            if (
              hasEngineNumber(
                exhibitionItem
                  .exhibitionTime
              ) &&
              Number(
                exhibitionItem
                  .exhibitionTime
              ) > 0
            ) {
              evidence.push(
                `展示${Number(exhibitionItem.exhibitionTime).toFixed(2)}` +
                (
                  exhibitionItem
                    .exhibitionRank
                    ? `・${exhibitionItem.exhibitionRank}位`
                    : ""
                )
              );
            } else {
              evidence.push(
                "展示未取得"
              );
            }

            if (
              waterParts.length
            ) {
              evidence.push(
                `水面${waterParts.join("・")}`
              );
            } else {
              evidence.push(
                "水面データ未取得"
              );
            }

            const localWinRate =
              Number(
                entry.local?.winRate
              );

            if (
              Number.isFinite(
                localWinRate
              ) &&
              localWinRate > 0
            ) {
              evidence.push(
                `当地${localWinRate}`
              );
            } else {
              evidence.push(
                "当地データ未取得"
              );
            }

            const skillParts = [];

            if (entry.className) {
              skillParts.push(
                entry.className
              );
            }

            const nationalWinRate =
              Number(
                entry.national?.winRate
              );

            if (
              Number.isFinite(
                nationalWinRate
              ) &&
              nationalWinRate > 0
            ) {
              skillParts.push(
                `全国${nationalWinRate}`
              );
            }

            evidence.push(
              skillParts.length
                ? `技量${skillParts.join("・")}`
                : "技量データ未取得"
            );

            const comparisons = [
              createEngineComparison(
                exhibitionItem,
                "stRank",
                engineStRows,
                "展示ST"
              ),

              createEngineComparison(
                exhibitionItem,
                "exhibitionRank",
                engineExhibitionRows,
                "展示"
              )
            ].filter(Boolean);

            const comparisonText =
              comparisons.length
                ? `${comparisons.join("、")}。`
                : "展示・展示STの比較データが不足しているため、今節ST・技量・当地・水面で補足。";

            const motorParts = [];

            if (entry.motor?.no) {
              motorParts.push(
                `モーター${entry.motor.no}`
              );
            }

            const motorSecondRate =
              Number(
                entry.motor?.secondRate
              );

            if (
              Number.isFinite(
                motorSecondRate
              ) &&
              motorSecondRate > 0
            ) {
              motorParts.push(
                `2連率${motorSecondRate}%`
              );
            }

            const motorNote =
              motorParts.length
                ? `${motorParts.join("・")}は参考止まりで、中心評価にはしない。`
                : "モーター数字は未取得のため使わず、他の気配を優先。";

            const course =
              Number(
                exhibitionItem.course ||
                indexItem.course ||
                boatNo
              );

            let development =
              "展開全体の補足材料として確認する。";

            if (course === 1) {
              development =
                "イン先マイと内残しを確認する。";
            } else if (
              course === 2
            ) {
              development =
                "2コース差しと2残しを確認する。";
            } else if (
              course === 3
            ) {
              development =
                "3コース攻めから内の残しと外の拾いを確認する。";
            } else if (
              course === 4
            ) {
              development =
                "4コース攻めと4残し、外の拾いを確認する。";
            } else if (
              course >= 5
            ) {
              development =
                "外からの展開突きとして、1着固定ではなく拾いまで確認する。";
            }

            const racerName =
              entry.racerName ||
              entry.name ||
              indexItem.name ||
              "";

            items.push({
              key: "newEngine",

              label:
                "🔧 新型エンジン",

              no:
                boatNo,

              score:
                enginePhaseText,

              text:
                `${engineVenueName}の新型エンジン${enginePhaseText}。` +
                `${boatNo}号艇${racerName ? ` ${racerName}` : ""}は` +
                development +
                `現在の予想では${roles.join("・")}へ反映。` +
                `${evidence.join("、")}。` +
                comparisonText +
                motorNote
            });
          }
        );
      }
    }

    }

    const compositeCategories =
      prediction.combinedOdds
        ?.categories;

    if (compositeCategories) {
      Object.values(
        compositeCategories
      )
        .filter(category =>
          category?.totalCount > 0
        )
        .forEach(category => {
          const countText =
            `${category.availableCount}/${category.totalCount}点`;

          const coverageText =
            `${Number(category.coverageRate).toFixed(1)}%`;

          const referenceOdds =
            Number(
              category.referenceCombinedOdds
            );

          const hasReferenceOdds =
            Number.isFinite(
              referenceOdds
            ) &&
            referenceOdds > 0;

          const allocationText =
            category.isFormal &&
            Array.isArray(
              category.allocation
            )
              ? category.allocation
                  .map(row =>
                    `${row.ticket}=${Number(row.allocationRate).toFixed(1)}%`
                  )
                  .join("、")
              : "";

          const margin = Number(
            category
              .theoreticalRecoveryMarginPercent
          );

          const formalText =
            category.isFormal
              ? `全点取得のため正式判定。合成オッズは${Number(category.combinedOdds).toFixed(1)}倍、理論回収余力は${margin.toFixed(1)}%。` +
                `等払戻配分率は${allocationText}。`
              : hasReferenceOdds
                ? `未取得点があるため正式判定せず、取得済み分の参考合成オッズは${referenceOdds.toFixed(1)}倍。配分率は算出しない。`
                : "実オッズが未取得のため、合成オッズと配分率は算出しない。";

          items.push({
            key: "odds",
            label:
              `${THEORY_LABELS.odds}・${category.label}`,
            no: "",
            score:
              category.isFormal
                ? `合成 ${Number(category.combinedOdds).toFixed(1)}倍`
                : hasReferenceOdds
                  ? `参考 ${referenceOdds.toFixed(1)}倍`
                  : "未取得",
            text:
              `${category.label}は公式オッズ${countText}を取得し、データ充足率${coverageText}。` +
              formalText +
              "オッズは予想完成後の表示・分類・配分比率だけに使い、買い目の追加・削除、展開、印、最大7点には反映しない。"
          });
        });
    } else {
        {
      const rawSyntheticOdds =
        finalAi.syntheticOdds ||
        prediction.syntheticOdds ||
        "";

      const toSyntheticText = value => {
        if (!value) return "";

        if (Array.isArray(value)) {
          return value
            .map(toSyntheticText)
            .filter(Boolean)
            .join(" / ");
        }

        if (
          typeof value === "object"
        ) {
          return toSyntheticText(
            value.text ||
            value.comment ||
            value.reason ||
            value.label ||
            ""
          );
        }

        return String(value)
          .trim()
          .replace(/[。]+$/, "");
      };

      const syntheticText =
        toSyntheticText(
          rawSyntheticOdds
        );

      const ticketRankRows =
        arrayify(
          prediction.ticketRanks
        );

      const finalRankRows =
        arrayify(
          finalAi.ticketRanks
        );

      const aiTicketRows =
        arrayify(
          prediction.aiTicketList
        );

      const sourceRows =
        ticketRankRows.length
          ? ticketRankRows
          : finalRankRows.length
            ? finalRankRows
            : aiTicketRows;

      const getTicketText = item =>
        String(
          item?.ticket ||
          item?.line ||
          item?.formation ||
          item ||
          ""
        ).trim();

      const aiTicketByTicket =
        new Map(
          aiTicketRows
            .map(item => [
              getTicketText(item),
              item
            ])
            .filter(
              ([ticket]) =>
                Boolean(ticket)
            )
        );

      const seenTickets =
        new Set();

      const ticketRows =
        sourceRows
          .map(sourceItem => {
            const item =
              typeof sourceItem ===
                "string"
                ? { ticket: sourceItem }
                : sourceItem || {};

            const ticket =
              getTicketText(item);

            if (
              !ticket ||
              seenTickets.has(ticket)
            ) {
              return null;
            }

            seenTickets.add(ticket);

            const aiItem =
              aiTicketByTicket.get(
                ticket
              ) ||
              {};

            return {
              ...aiItem,
              ...item,
              ticket,

              odds:
                item.odds ??
                aiItem.odds ??
                null,

              oddsValue:
                item.oddsValue ||
                aiItem.oddsValue ||
                ""
            };
          })
          .filter(Boolean);

      const hasActualOdds = value =>
        value !== null &&
        value !== undefined &&
        value !== "" &&
        Number.isFinite(
          Number(value)
        ) &&
        Number(value) > 0;

      const formatOdds = value =>
        Number(value)
          .toFixed(2)
          .replace(/\.?0+$/, "");

      const actualOddsRows =
        ticketRows.filter(
          item =>
            hasActualOdds(
              item.odds
            )
        );

      if (!ticketRows.length) {
        items.push({
          key: "odds",
          label:
            THEORY_LABELS.odds,
          no: "",
          score: "判定不可",
          text:
            "展開とコースから作成済みのAI買い目がないため、合成オッズ理論は判定できない。" +
            "買い目作成前にオッズから候補を追加・削除しない。"
        });
      } else if (
        !actualOddsRows.length
      ) {
        items.push({
          key: "odds",
          label:
            THEORY_LABELS.odds,
          no: "",
          score: "未取得",
          text:
            `展開とコースから作成済みのAI買い目は${ticketRows.length}点あるが、` +
            "実オッズが未取得のため、買い目同士の倍率比較・オッズ評価・資金配分は判定できない。" +
            (
              syntheticText
                ? `既存の合成オッズ分析は「${syntheticText}」。`
                : "合成オッズの既存分析データも未取得。"
            ) +
            "オッズ未取得でも作成済み買い目は維持し、数字だけで追加・削除しない。"
        });
      } else {
        const displayOddsRows =
          actualOddsRows.slice(
            0,
            2
          );

        const getTheoryBoatNo = item =>
          Number(
            item?.boatNo ||
            item?.no ||
            item ||
            0
          );

        const honmeiBoatNo = Number(
          prediction.mainSheet
            ?.honmei?.boatNo ||
          prediction.mainSheet
            ?.main?.boatNo ||
          0
        );

        const holdBoatNumbers =
          new Set(
            arrayify(
              raceFlow.holdBoats
            )
              .map(getTheoryBoatNo)
              .filter(Boolean)
          );

        const pickupBoatNumbers =
          new Set(
            arrayify(
              raceFlow.pickupBoats
            )
              .map(getTheoryBoatNo)
              .filter(Boolean)
          );

        const normalizeTextList =
          value =>
            arrayify(value)
              .map(item =>
                String(item || "")
                  .trim()
              )
              .filter(Boolean);

        displayOddsRows.forEach(
          (row, position) => {
            const odds =
              Number(row.odds);

            const comparedRow =
              displayOddsRows[
                position === 0 ? 1 : 0
              ] ||
              null;

            let comparison =
              "実オッズが確認できた他の買い目がないため、倍率差は比較できない。";

            if (
              comparedRow &&
              hasActualOdds(
                comparedRow.odds
              )
            ) {
              const comparedOdds =
                Number(
                  comparedRow.odds
                );

              const oddsDifference =
                Math.round(
                  Math.abs(
                    odds -
                    comparedOdds
                  ) * 100
                ) / 100;

              if (
                oddsDifference === 0
              ) {
                comparison =
                  `${comparedRow.ticket}と同じ${formatOdds(odds)}倍。`;
              } else if (
                odds > comparedOdds
              ) {
                comparison =
                  `${comparedRow.ticket}の${formatOdds(comparedOdds)}倍より${formatOdds(oddsDifference)}倍高い。`;
              } else {
                comparison =
                  `${comparedRow.ticket}の${formatOdds(comparedOdds)}倍より${formatOdds(oddsDifference)}倍低い。`;
              }
            }

            const ticketBoats =
              String(row.ticket)
                .split("-")
                .map(Number)
                .filter(
                  boatNo =>
                    boatNo >= 1 &&
                    boatNo <= 6
                );

            const positionText =
              ticketBoats.length === 3
                ? `${ticketBoats[0]}号艇を1着、${ticketBoats[1]}号艇を2着、${ticketBoats[2]}号艇を3着に構成。`
                : "着順構成は未取得。";

            const roleText =
              ticketBoats.length
                ? ticketBoats
                    .map(boatNo => {
                      const roles = [];

                      if (
                        boatNo ===
                        honmeiBoatNo
                      ) {
                        roles.push(
                          "1着候補"
                        );
                      }

                      if (
                        holdBoatNumbers.has(
                          boatNo
                        )
                      ) {
                        roles.push(
                          "残し"
                        );
                      }

                      if (
                        pickupBoatNumbers.has(
                          boatNo
                        )
                      ) {
                        roles.push(
                          "拾い"
                        );
                      }

                      return (
                        `${boatNo}号艇=` +
                        (
                          roles.length
                            ? roles.join("・")
                            : "買い目構成艇"
                        )
                      );
                    })
                    .join("、")
                : "艇別の反映先は未取得";

            const categoryText = [
              ...new Set([
                ...normalizeTextList(
                  row.categories ||
                  row.category
                ),
                ...normalizeTextList(
                  row.type
                )
              ])
            ].join("・") ||
              "分類未取得";

            const aiEvidence = [];

            if (row.rank) {
              aiEvidence.push(
                `AIランク${row.rank}`
              );
            }

            if (
              row.score !== null &&
              row.score !== undefined &&
              row.score !== "" &&
              Number.isFinite(
                Number(row.score)
              )
            ) {
              aiEvidence.push(
                `AIスコア${Number(row.score)}`
              );
            }

            const oddsValueText =
              row.oddsValue
                ? `既存のオッズ分類は「${row.oddsValue}」。`
                : "オッズ分類は未判定。";

            const scenarioSummary =
              String(
                row.scenarioSummary ||
                raceFlow.summary ||
                ""
              )
                .trim()
                .replace(/[。]+$/, "");

            const scenarioText =
              scenarioSummary
                ? `成立展開は「${scenarioSummary}」。`
                : "成立展開コメントは未取得。";

            const syntheticEvidence =
              syntheticText
                ? `既存の合成オッズ分析は「${syntheticText}」。`
                : "合成オッズの追加分析データはない。";

            items.push({
              key: "odds",
              label:
                THEORY_LABELS.odds,
              no: "",
              score:
                `${formatOdds(odds)}倍`,
              text:
                `買い目${row.ticket}を、作成済みAI買い目の既存表示${position + 1}番として確認。` +
                comparison +
                positionText +
                `艇別の反映は${roleText}。` +
                `買い目分類は${categoryText}。` +
                (
                  aiEvidence.length
                    ? `${aiEvidence.join("・")}。`
                    : "AIランク・スコアは未取得。"
                ) +
                scenarioText +
                oddsValueText +
                syntheticEvidence +
                "オッズは買い目作成後の表示・分類だけに使用し、数字だけで買い目を追加・削除しない。" 
            });
          }
        );
      }
    }
    }

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
      ? `<p>${escapeHtml(item.text)}</p>`
            : ""
        }
      </div>
    `;
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
