　/* =========================================================
  チャッピーボートレースAI
  script.js 完全版

  役割：
  - ボタン処理
  - API取得
  - renderAll()接続
========================================================= */

(function () {
  "use strict";

  const PLACE_CODE_MAP = {
    桐生: "01",
    戸田: "02",
    江戸川: "03",
    平和島: "04",
    多摩川: "05",
    浜名湖: "06",
    蒲郡: "07",
    常滑: "08",
    津: "09",
    三国: "10",
    びわこ: "11",
    住之江: "12",
    尼崎: "13",
    鳴門: "14",
    丸亀: "15",
    児島: "16",
    宮島: "17",
    徳山: "18",
    下関: "19",
    若松: "20",
    芦屋: "21",
    福岡: "22",
    唐津: "23",
    大村: "24"
  };

  let lastRaceData = null;
  let lastPrediction = null;
  let raceSelectionGeneration = 0;
  let explicitSelectionGeneration = 0;
  let predictionGeneration = 0;
  const ODDS_REQUEST_TIMEOUT_MS = 30000;
  const OFFICIAL_RESULT_TIMEOUT_MS = 12000;
  const SCHEDULE_REQUEST_TIMEOUT_MS = 30000;
  const SCHEDULE_CACHE_TTL_MS = 30000;
  const scheduleRequestCache = new Map();

  if (!window.__CHAPPY_PREDICTION_VIEW_GUARD__) {
    window.__CHAPPY_PREDICTION_VIEW_GUARD__ = true;
    window.addEventListener("chappy:view-changed", event => {
      if (event?.detail?.view !== "prediction") {
        predictionGeneration += 1;
      }
    });
  }

  function beginRaceSelection() {
    raceSelectionGeneration += 1;
    return raceSelectionGeneration;
  }

  function isCurrentRaceSelection(
    generation,
    mode,
    date
  ) {
    return generation === raceSelectionGeneration &&
      mode === getRaceMode() &&
      date === getScheduleDate();
  }

  function initializeRaceControls() {
    console.log("✅ script.js 読み込みOK");

    setDefaultDate();

    const fetchBtn =
      document.getElementById(
        "fetchRaceBtn"
      );

    const reloadBtn =
      document.getElementById(
        "reloadRaceBtn"
      );

    const oddsBtn =
      document.getElementById(
        "refreshOddsBtn"
      );

    const modeSelect =
      document.getElementById(
        "raceModeSelect"
      );

    if (
      fetchBtn &&
      fetchBtn.dataset
        .chappyRaceControlBound !==
        "true"
    ) {
      fetchBtn.dataset
        .chappyRaceControlBound =
        "true";
      fetchBtn.addEventListener(
        "click",
        fetchAndRenderRace
      );
    }

    if (
      reloadBtn &&
      reloadBtn.dataset
        .chappyRaceControlBound !==
        "true"
    ) {
      reloadBtn.dataset
        .chappyRaceControlBound =
        "true";
      reloadBtn.addEventListener(
        "click",
        fetchAndRenderRace
      );
    }

    if (
      oddsBtn &&
      oddsBtn.dataset
        .chappyRaceControlBound !==
        "true"
    ) {
      oddsBtn.dataset
        .chappyRaceControlBound =
        "true";
      oddsBtn.addEventListener(
        "click",
        refreshOddsOnly
      );
    }

    if (
      modeSelect &&
      modeSelect.dataset
        .chappyRaceControlBound !==
        "true"
    ) {
      modeSelect.dataset
        .chappyRaceControlBound =
        "true";
      modeSelect.addEventListener(
        "change",
        applyRaceMode
      );
    }

    if (!document.getElementById("homeDashboardV2")) {
      void applyRaceMode();
    }
  }

  window.ChappyRaceControls =
    Object.freeze({
      initialize:
        initializeRaceControls
    });

  if (
    document.readyState ===
      "loading"
  ) {
    window.addEventListener(
      "DOMContentLoaded",
      initializeRaceControls,
      { once: true }
    );
  } else {
    initializeRaceControls();
  }

  function setDefaultDate(
    forceToday = false
  ) {
    const input =
      document.getElementById(
        "dateInput"
      );

    if (
      !input ||
      (
        input.value &&
        !forceToday
      )
    ) {
      return;
    }

    const today =
      new Date();

    const yyyy =
      today.getFullYear();

    const mm =
      String(
        today.getMonth() + 1
      ).padStart(2, "0");

    const dd =
      String(
        today.getDate()
      ).padStart(2, "0");

    input.value =
      `${yyyy}-${mm}-${dd}`;
  }

    async function applyRaceMode(options = {}) {
    const selectionGeneration =
      beginRaceSelection();
    const modeSelect =
      document.getElementById(
        "raceModeSelect"
      );

    const dateInput =
      document.getElementById(
        "dateInput"
      );

    const help =
      document.getElementById(
        "raceModeHelp"
      );

    const fetchBtn =
      document.getElementById(
        "fetchRaceBtn"
      );

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const isReview =
      (
        modeSelect?.value ||
        "live"
      ) === "review";

    if (dateInput) {
      dateInput.disabled =
        !isReview;

      if (!isReview) {
        setDefaultDate(true);
      }

      dateInput.max =
        dateInput.value;

      dateInput.onchange = () => {
        if (
          getRaceMode() ===
          "review"
        ) {
          loadVenueChoices()
            .catch(
              handleRaceSelectionError
            );
        }
      };
    }

    if (placeSelect) {
      placeSelect.onchange = () => {
        loadRaceChoices()
          .catch(
            handleRaceSelectionError
          );
      };
    }

    if (help) {
      help.textContent =
        isReview
          ? "終了済みレースを選び、予想と公式結果を別々に表示します"
          : "本日開催中の締切前レースだけを表示します";
    }
    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    if (raceSelect) {
      raceSelect.onchange = () => {
        predictionGeneration += 1;
        lastRaceData = null;
        lastPrediction = null;

        clearReviewResult();

        const resultArea =
          document.getElementById(
            "resultArea"
          );

        if (resultArea) {
          if (
            resultArea.dataset
              .raceLoading !== "true"
          ) {
            resultArea.innerHTML = "";
          }
        }

        updateStatus(
          getRaceMode() === "review"
            ? "レースを変更しました。「振り返り予想を開始」を押してください"
            : "レースを変更しました。「AI予想を開始」を押してください"
        );
      };
    }
    
    if (fetchBtn) {
      const mainText =
        fetchBtn.querySelector(
          "span"
        );

      const subText =
        fetchBtn.querySelector(
          "small"
        );

      if (mainText) {
        mainText.textContent =
          isReview
            ? "振り返り予想を開始"
            : "AI予想を開始";
      }

      if (subText) {
        subText.textContent =
          isReview
            ? "結果を予想に使わず、予想後に公式結果を表示"
            : "開催中の締切前レースを解析";
      }
    }

    clearErrorArea();

    updateStatus(
      "開催情報を確認中..."
    );

    if (options?.skipSchedule === true) {
      return selectionGeneration;
    }

    try {
      const loaded =
        await loadVenueChoices(
        selectionGeneration
      );
      return loaded
        ? selectionGeneration
        : 0;
    } catch (error) {
      handleRaceSelectionError(
        error
      );
      return 0;
    }
  }

  function getRaceMode() {
    return (
      document.getElementById(
        "raceModeSelect"
      )?.value ||
      "live"
    );
  }

  function getScheduleDate() {
    return String(
      document.getElementById(
        "dateInput"
      )?.value ||
      ""
    ).replaceAll("-", "");
  }

  async function requestSchedule(
    date,
    jcd = ""
  ) {
    const cacheKey =
      `${String(date || "")}:` +
      `${String(jcd || "*")}`;
    const cached =
      scheduleRequestCache.get(
        cacheKey
      );
    const now = Date.now();

    if (
      cached?.data &&
      now - cached.savedAt <=
        SCHEDULE_CACHE_TTL_MS
    ) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    let url =
      `https://chappy-boatrace-api.vercel.app/api/schedule` +
      `?date=${encodeURIComponent(
        date
      )}`;

    if (jcd) {
      url +=
        `&jcd=${encodeURIComponent(
          jcd
        )}`;
    }

    const controller =
      typeof AbortController === "function"
        ? new AbortController()
        : null;
    const timeoutId = controller
      ? window.setTimeout(
          () => controller.abort(),
          SCHEDULE_REQUEST_TIMEOUT_MS
        )
      : 0;

    const promise = (async () => {
      try {
        const response =
          await fetch(
            url,
            controller
              ? { signal: controller.signal }
              : undefined
          );
        const data =
          await response.json();

        if (
          !response.ok ||
          !data?.ok
        ) {
          throw new Error(
            data?.error ||
            `開催情報APIエラー：` +
            `${response.status}`
          );
        }

        return data;
      } finally {
        if (timeoutId) {
          window.clearTimeout(
            timeoutId
          );
        }
      }
    })();

    scheduleRequestCache.set(
      cacheKey,
      {
        data: null,
        savedAt: 0,
        promise
      }
    );

    try {
      const data = await promise;
      scheduleRequestCache.set(
        cacheKey,
        {
          data,
          savedAt: Date.now(),
          promise: null
        }
      );
      return data;
    } catch (error) {
      if (
        scheduleRequestCache
          .get(cacheKey)
          ?.promise === promise
      ) {
        scheduleRequestCache.delete(
          cacheKey
        );
      }
      throw error;
    }
  }

  function primeScheduleCache(
    date,
    jcd,
    data
  ) {
    const payload = data?.ok
      ? data
      : Array.isArray(data?.races)
        ? {
            ok: true,
            date: String(date || ""),
            selectedVenue: data
          }
        : null;

    if (!payload) return false;
    const cacheKey =
      `${String(date || "")}:` +
      `${String(jcd || "*")}`;
    scheduleRequestCache.set(
      cacheKey,
      {
        data: payload,
        savedAt: Date.now(),
        promise: null
      }
    );
    return true;
  }

  function replaceSelectOptions(
    select,
    items
  ) {
    if (!select) {
      return;
    }

    select.innerHTML = "";

    items.forEach(item => {
      const option =
        document.createElement(
          "option"
        );

      option.value =
        item.value;

      option.textContent =
        item.label;

      if (item.jcd) {
        option.dataset.jcd =
          item.jcd;
      }

      select.appendChild(
        option
      );
    });
  }

  function renderOfficialVenuePicker(
    data,
    mode
  ) {
    const grid =
      document.getElementById(
        "officialVenueGrid"
      );

    const status =
      document.getElementById(
        "officialScheduleStatus"
      );

    const panel =
      document.getElementById(
        "officialRacePanel"
      );

    const selectedVenueText =
      document.getElementById(
        "officialSelectedVenue"
      );

    const eventGradeText =
      document.getElementById(
        "officialEventGrade"
      );

    const raceGrid =
      document.getElementById(
        "officialRaceGrid"
      );

    const selectedRaceText =
      document.getElementById(
        "officialSelectedRace"
      );

    const officialLink =
      document.getElementById(
        "officialRaceLink"
      );

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    if (
      !grid ||
      !placeSelect
    ) {
      return;
    }

    const availableVenues =
      Array.isArray(
        data?.venues
      )
        ? data.venues
        : [];

    const venueByJcd =
      new Map(
        availableVenues.map(
          venue => [
            String(venue.jcd),
            venue
          ]
        )
      );

    const currentJcd =
      String(
        PLACE_CODE_MAP[
          placeSelect.value
        ] ||
        ""
      );

    const preferredJcd =
      mode === "live"
        ? String(
            data?.nextRace?.jcd ||
            ""
          )
        : (
            venueByJcd.has(
              currentJcd
            )
              ? currentJcd
              : String(
                  availableVenues[0]
                    ?.jcd ||
                  ""
                )
          );

    grid.innerHTML = "";

    Object.entries(
      PLACE_CODE_MAP
    ).forEach(
      ([place, jcd]) => {
        const venue =
          venueByJcd.get(
            String(jcd)
          );

        const selectable =
          mode === "live"
            ? Boolean(
                venue?.selectable
              )
            : Boolean(venue);

        const grade =
          String(
            venue?.eventGrade ||
            ""
          );

        const statusText =
          !venue
            ? "本日なし"
            : (
                grade ||
                (
                  venue.finalClosed
                    ? "開催終了"
                    : "開催"
                )
              );

        const button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "official-venue-button";

        if (selectable) {
          button.classList.add(
            "is-open"
          );
        }

        if (
          selectable &&
          String(jcd) ===
            preferredJcd
        ) {
          button.classList.add(
            "is-selected"
          );
        }

        button.disabled =
          !selectable;

        button.dataset.jcd =
          String(jcd);

        button.dataset.place =
          place;

        const name =
          document.createElement(
            "span"
          );

        name.className =
          "official-venue-name";

        name.textContent =
          place;

        const venueStatus =
          document.createElement(
            "span"
          );

        venueStatus.className =
          "official-venue-status";

        venueStatus.textContent =
          statusText;

        if (grade) {
          venueStatus.classList.add(
            "official-event-grade"
          );

          const gradeClass =
            grade === "一般"
              ? "grade-general"
              : (
                  "grade-" +
                  grade.toLowerCase()
                );

          venueStatus.classList.add(
            gradeClass
          );
        }

        button.append(
          name,
          venueStatus
        );

        button.addEventListener(
          "click",
          () => {
            placeSelect.value =
              place;

            grid
              .querySelectorAll(
                ".official-venue-button"
              )
              .forEach(item => {
                item.classList.toggle(
                  "is-selected",
                  item === button
                );
              });

            if (panel) {
              panel.hidden =
                false;
            }

            if (
              selectedVenueText
            ) {
              selectedVenueText
                .textContent =
                place;
            }

            if (
              eventGradeText
            ) {
              eventGradeText
                .textContent =
                grade ||
                "開催";
            }

            if (raceGrid) {
              raceGrid.innerHTML =
                '<p class="official-picker-message">レース情報を取得しています</p>';
            }

            if (
              selectedRaceText
            ) {
              selectedRaceText
                .textContent =
                "レースを選択してください";
            }

            if (officialLink) {
              officialLink.href =
                "#";

              officialLink.setAttribute(
                "aria-disabled",
                "true"
              );

              officialLink.setAttribute(
                "tabindex",
                "-1"
              );
            }

            loadRaceChoices()
              .catch(
                handleRaceSelectionError
              );
          }
        );

        grid.appendChild(
          button
        );
      }
    );

    if (status) {
      status.textContent =
        `${availableVenues.length}場開催`;
    }

    const selectedVenue =
      venueByJcd.get(
        preferredJcd
      );

    if (
      panel &&
      selectedVenue
    ) {
      panel.hidden =
        false;
    }

    if (
      selectedVenueText &&
      selectedVenue
    ) {
      selectedVenueText.textContent =
        selectedVenue.place;
    }

    if (
      eventGradeText &&
      selectedVenue
    ) {
      eventGradeText.textContent =
        selectedVenue.eventGrade ||
        "開催";
    }
  }
  /* ===============================
    レース一覧用AI期待度

    買い目・オッズ・成績保存には接続しない。
    同じレースは短時間キャッシュし、3レースずつ取得する。
  =============================== */

  const raceTrendCache = new Map();
  let raceTrendScanId = 0;
  const LIVE_AUTO_PICK_MIN_SCORE = 70;

  function buildRaceTrendCacheKey(date, jcd, raceNo) {
    return [
      String(date || ""),
      String(jcd || "").padStart(2, "0"),
      Number(raceNo || 0)
    ].join("-");
  }

  function setRaceTrendMessage(
    button,
    message,
    state = "is-loading"
  ) {
    const panel = button?.querySelector(
      ".official-race-trend"
    );

    if (!panel) return;

    panel.className = `official-race-trend ${state}`;
    panel.textContent = message;
    delete button.dataset.honmeiTrend;
    delete button.dataset.manshuTrend;
  }

  function renderRaceTrendEvaluation(button, evaluation) {
    const panel = button?.querySelector(
      ".official-race-trend"
    );

    if (!panel) return;

    if (!evaluation?.ready) {
      const reason =
        evaluation?.honmei?.reasons?.[0] ||
        "判定に必要なデータを確認中";

      setRaceTrendMessage(
        button,
        `判定準備中：${reason}`,
        "is-pending"
      );
      return;
    }

    const honmei = Number(evaluation.honmei?.score || 0);
    const manshu = Number(evaluation.manshu?.score || 0);
    const honmeiReason =
      evaluation.honmei?.reasons?.[0] || "内展開を確認";
    const manshuReason =
      evaluation.manshu?.reasons?.[0] || "攻め展開を確認";

    button.dataset.honmeiTrend = String(honmei);
    button.dataset.manshuTrend = String(manshu);
    panel.className = "official-race-trend is-ready";
    panel.innerHTML = `
      <span class="official-race-trend-scores">
        <span class="official-race-trend-score is-honmei">
          <span class="official-race-trend-label">イン逃げ期待度</span>
          <strong class="official-race-trend-value">${Math.round(honmei)}%</strong>
        </span>
        <span class="official-race-trend-score is-manshu">
          <span class="official-race-trend-label">万舟波乱期待度</span>
          <strong class="official-race-trend-value">${Math.round(manshu)}%</strong>
        </span>
      </span>
      <span class="official-race-trend-reason"></span>
      <span class="official-race-trend-status"></span>
    `;

    const reason = panel.querySelector(
      ".official-race-trend-reason"
    );
    const status = panel.querySelector(
      ".official-race-trend-status"
    );

    reason.textContent =
      `根拠：${honmeiReason}／${manshuReason}`;
    reason.title = [
      ...(evaluation.honmei?.reasons || []),
      ...(evaluation.manshu?.reasons || [])
    ].join("／");
    status.textContent =
      evaluation.dataStatus?.label || "展示前・暫定";
  }

  function markRaceTrendLeaders(grid) {
    const buttons = [...grid.querySelectorAll(
      ".official-race-button"
    )];

    buttons.forEach(button => button.classList.remove(
      "is-honmei-top",
      "is-manshu-top"
    ));

    const evaluated = buttons.filter(button =>
      button.dataset.honmeiTrend != null &&
      button.dataset.manshuTrend != null
    );

    if (!evaluated.length) return;

    const topHonmei = Math.max(...evaluated.map(button =>
      Number(button.dataset.honmeiTrend)
    ));
    const topManshu = Math.max(...evaluated.map(button =>
      Number(button.dataset.manshuTrend)
    ));

    evaluated.forEach(button => {
      button.classList.toggle(
        "is-honmei-top",
        Number(button.dataset.honmeiTrend) === topHonmei
      );
      button.classList.toggle(
        "is-manshu-top",
        Number(button.dataset.manshuTrend) === topManshu
      );
    });
  }

  async function selectBestLiveRace(
    date,
    venues
  ) {
    const core = window.ChappyAICore;
    const targets = (Array.isArray(venues) ? venues : [])
      .map(venue => ({
        jcd: String(venue?.jcd || "").padStart(2, "0"),
        place: String(venue?.place || ""),
        raceNo: Number(venue?.currentRaceNo || 0),
        deadlineAt: String(venue?.deadlineAt || "")
      }))
      .filter(target => target.jcd && target.raceNo);

    if (
      !core ||
      typeof core.buildRaceTrendEvaluation !== "function" ||
      !targets.length
    ) {
      return null;
    }

    updateStatus(
      `締切前${targets.length}場をAI比較中...`
    );

    const results = [];
    let nextIndex = 0;

    const worker = async () => {
      while (nextIndex < targets.length) {
        const target = targets[nextIndex++];
        const cacheKey = buildRaceTrendCacheKey(
          date,
          target.jcd,
          target.raceNo
        );

        try {
          let evaluation = raceTrendCache.get(
            cacheKey
          )?.evaluation;

          if (!evaluation) {
            const raceData = await fetchRaceData({
              jcd: target.jcd,
              rno: target.raceNo,
              date
            });

            if (!raceData || raceData.ok === false) {
              throw new Error(
                raceData?.error ||
                "レースデータを取得できませんでした"
              );
            }

            const preparedRaceData =
              await prepareRaceDataForTheories(
                raceData,
                {
                  jcd: target.jcd,
                  rno: target.raceNo
                }
              );

            evaluation =
              core.buildRaceTrendEvaluation(
                preparedRaceData
              );

            raceTrendCache.set(cacheKey, {
              evaluation,
              checkedAt: Date.now()
            });
          }

          if (!evaluation?.ready) continue;

          const honmei = Number(
            evaluation.honmei?.score || 0
          );
          const manshu = Number(
            evaluation.manshu?.score || 0
          );
          const type =
            honmei >= manshu
              ? "本線"
              : "波乱";

          const historyTrend =
            window.ChappyRaceHistory
              ?.getVenueRace(
                target.jcd,
                target.raceNo
              )?.trend || null;

          const historySupport =
            window.ChappyHistoryInsights
              ?.supportForType(
                historyTrend,
                type
              ) || 0;

          results.push({
            ...target,
            type,
            score: Math.max(honmei, manshu),
            honmei,
            manshu,
            historySupport,
            historyTrend,
            completeness: Number(
              evaluation.dataStatus?.completeness || 0
            ),
            stage:
              evaluation.dataStatus?.stage ||
              "provisional"
          });
        } catch (error) {
          console.warn(
            `live auto pick ${target.place} ${target.raceNo}R`,
            error
          );
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(3, targets.length) },
        () => worker()
      )
    );

    results.sort((a, b) =>
      b.score - a.score ||
      b.historySupport - a.historySupport ||
      b.completeness - a.completeness ||
      Date.parse(a.deadlineAt || 0) -
        Date.parse(b.deadlineAt || 0)
    );

    const best = results[0] || null;

    return {
      checked: targets.length,
      evaluated: results.length,
      selected:
        Boolean(best) &&
        best.score >= LIVE_AUTO_PICK_MIN_SCORE,
      minScore: LIVE_AUTO_PICK_MIN_SCORE,
      best
    };
  }

  function renderLiveAutoSelection(
    selection
  ) {
    const status = document.getElementById(
      "officialScheduleStatus"
    );
    const best = selection?.best;

    if (!status || !selection) return;

    if (selection.selected && best) {
      status.textContent =
        `${selection.checked}場比較・` +
        `${best.place} ${best.raceNo}Rを自動選定` +
        `（${best.type}${Math.round(best.score)}点）`;
      return;
    }

    status.textContent = best
      ? (
          `${selection.checked}場比較・見送り` +
          `（最高${Math.round(best.score)}点／` +
          `基準${selection.minScore}点）`
        )
      : `${selection.checked}場比較・判定データ不足`;
  }

  async function loadStoredLiveSelection(
    date,
    venues
  ) {
    try {
      const data =
        await window.ChappyAutoSelection
          ?.loadDateData?.(date);
      const run = [
        ...(Array.isArray(data?.runs)
          ? data.runs
          : [])
      ].sort((a, b) =>
        String(b?.checkedAt || "")
          .localeCompare(
            String(a?.checkedAt || "")
          )
      )[0] || null;

      if (!run?.best) return null;

      const compared =
        Array.isArray(run.compared)
          ? run.compared
          : [];
      const best = {
        ...run.best,
        jcd: String(
          run.best.jcd || ""
        ).padStart(2, "0"),
        raceNo: Number(
          run.best.raceNo || 0
        ),
        score: Number(
          run.best.score || 0
        )
      };
      const threshold =
        Number(run.threshold || 70);

      return {
        checked:
          compared.length ||
          (Array.isArray(venues)
            ? venues.length
            : 0),
        evaluated: compared.length,
        selected:
          run.selected === true &&
          best.score >= threshold,
        minScore: threshold,
        best,
        compared,
        checkedAt:
          String(run.checkedAt || ""),
        source:
          "server_prediction_summary"
      };
    } catch (error) {
      console.warn(
        "保存済み自動選定の取得に失敗",
        error?.message || error
      );
      return null;
    }
  }

  let latestStoredLiveSelection = null;

  function renderStoredRaceTrends(
    data,
    grid
  ) {
    const jcd = String(
      data?.selectedVenue?.jcd || ""
    ).padStart(2, "0");
    const compared =
      Array.isArray(
        latestStoredLiveSelection?.compared
      )
        ? latestStoredLiveSelection.compared
        : [];
    const rows = compared.filter(
      item =>
        String(item?.jcd || "")
          .padStart(2, "0") === jcd
    );
    const byRace = new Map(
      rows.map(item => [
        Number(item?.raceNo || 0),
        item
      ])
    );

    [
      ...grid.querySelectorAll(
        ".official-race-button"
      )
    ].forEach(button => {
      const raceNo = Number(
        button.dataset.raceNo || 0
      );
      const stored = byRace.get(raceNo);

      if (stored?.evaluation?.ready) {
        renderRaceTrendEvaluation(
          button,
          stored.evaluation
        );
        return;
      }

      setRaceTrendMessage(
        button,
        "AI予想開始時に詳しく評価",
        "is-pending"
      );
    });

    markRaceTrendLeaders(grid);
  }

  async function loadOfficialRaceTrends(data, mode, grid) {
    const scanId = ++raceTrendScanId;
    const core = window.ChappyAICore;
    const races = Array.isArray(data?.selectedVenue?.races)
      ? data.selectedVenue.races
      : [];
    const targets = races.filter(race =>
      mode === "live"
        ? Boolean(race.selectable)
        : race.status === "closed"
    );

    const getButton = raceNo => grid.querySelector(
      `[data-race-no="${Number(raceNo)}"]`
    );

    if (
      !core ||
      typeof core.buildRaceTrendEvaluation !== "function"
    ) {
      targets.forEach(race => setRaceTrendMessage(
        getButton(race.raceNo),
        "AI判定準備中",
        "is-pending"
      ));
      return;
    }

    const placeSelect = document.getElementById("placeSelect");
    const selectedOption = placeSelect?.options?.[
      placeSelect.selectedIndex
    ];
    const jcd =
      selectedOption?.dataset?.jcd ||
      data?.selectedVenue?.jcd ||
      PLACE_CODE_MAP[placeSelect?.value];
    const date = getScheduleDate();

    if (!jcd || !date || !targets.length) return;

    targets.forEach(race => setRaceTrendMessage(
      getButton(race.raceNo),
      "AI期待度を計算中..."
    ));

    let nextIndex = 0;

    const worker = async () => {
      while (
        scanId === raceTrendScanId &&
        nextIndex < targets.length
      ) {
        const race = targets[nextIndex++];
        const raceNo = Number(race.raceNo || 0);
        const button = getButton(raceNo);

        if (!button || !raceNo) continue;

        const cacheKey = buildRaceTrendCacheKey(
          date,
          jcd,
          raceNo
        );
        const cached = raceTrendCache.get(cacheKey);
        const cacheAge = cached
          ? Date.now() - cached.checkedAt
          : Infinity;
        const maxAge =
          cached?.evaluation?.dataStatus?.stage === "final"
            ? 90 * 1000
            : 30 * 1000;

        if (cached?.evaluation && cacheAge >= 0 && cacheAge < maxAge) {
          renderRaceTrendEvaluation(button, cached.evaluation);
          continue;
        }

        try {
          const raceData = await fetchRaceData({
            jcd,
            rno: raceNo,
            date
          });

          if (!raceData || raceData.ok === false) {
            throw new Error(
              raceData?.error || "レースデータを取得できませんでした"
            );
          }

          const preparedRaceData =
            await prepareRaceDataForTheories(
              raceData,
              {
                jcd,
                rno: raceNo
              }
            );

          const evaluation =
            core.buildRaceTrendEvaluation(
              preparedRaceData
            );

          raceTrendCache.set(cacheKey, {
            evaluation,
            checkedAt: Date.now()
          });

          if (scanId !== raceTrendScanId) return;

          renderRaceTrendEvaluation(button, evaluation);
        } catch (error) {
          console.warn(`race trend ${raceNo}R`, error);

          if (scanId === raceTrendScanId) {
            setRaceTrendMessage(
              button,
              "判定準備中",
              "is-pending"
            );
          }
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(3, targets.length) },
        () => worker()
      )
    );

    if (scanId === raceTrendScanId) {
      markRaceTrendLeaders(grid);
    }
  }
  function renderOfficialRacePicker(
    data,
    mode
  ) {
    const panel =
      document.getElementById(
        "officialRacePanel"
      );

    const grid =
      document.getElementById(
        "officialRaceGrid"
      );

    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const selectedRaceText =
      document.getElementById(
        "officialSelectedRace"
      );

        const linkDescription =
      document.getElementById(
        "officialLinkDescription"
      );

    const officialLink =
      document.getElementById(
        "officialRaceLink"
      );

    const officialVoteLink =
      document.getElementById(
        "officialVoteLink"
      );

    if (
      !panel ||
      !grid ||
      !raceSelect ||
      !placeSelect
    ) {
      return;
    }

    const allRaces =
      Array.isArray(
        data?.selectedVenue?.races
      )
        ? data.selectedVenue.races
        : [];

    const selectedRaceNo =
      Number(
        String(
          raceSelect.value ||
          ""
        ).replace("R", "")
      );

        const disableOfficialLink =
      () => {
        [
          officialLink,
          officialVoteLink
        ].forEach(link => {
          if (!link) {
            return;
          }

          link.href =
            "#";

          link.setAttribute(
            "aria-disabled",
            "true"
          );

          link.setAttribute(
            "tabindex",
            "-1"
          );
        });
      };

        const updateOfficialLink =
      race => {
        const date =
          getScheduleDate();

        const selectedOption =
          placeSelect.options[
            placeSelect.selectedIndex
          ];

        const jcd =
          selectedOption
            ?.dataset?.jcd ||
          PLACE_CODE_MAP[
            placeSelect.value
          ];

        const raceNo =
          Number(
            race?.raceNo ||
            0
          );

        if (
          !officialLink ||
          !jcd ||
          !raceNo ||
          !date
        ) {
          disableOfficialLink();
          return;
        }

        const officialPage =
          mode === "review"
            ? "raceresult"
            : "racelist";

        officialLink.href =
          "https://www.boatrace.jp" +
          "/owpc/pc/race/" +
          officialPage +
          "?rno=" +
          encodeURIComponent(
            raceNo
          ) +
          "&jcd=" +
          encodeURIComponent(
            jcd
          ) +
          "&hd=" +
          encodeURIComponent(
            date
          );

        officialLink.textContent =
          mode === "review"
            ? "公式結果を見る →"
            : "公式出走表を見る →";

        officialLink.setAttribute(
          "aria-disabled",
          "false"
        );

        officialLink.removeAttribute(
          "tabindex"
        );

        if (officialVoteLink) {
          if (mode === "review") {
            officialVoteLink.href =
              "#";

            officialVoteLink.setAttribute(
              "aria-disabled",
              "true"
            );

            officialVoteLink.setAttribute(
              "tabindex",
              "-1"
            );
          } else {
                        officialVoteLink.href =
              "shortcuts://run-shortcut?name=BOATRACE%E6%8A%95%E7%A5%A8";

            officialVoteLink.textContent =
              "BOATRACEアプリで投票する →";

            officialVoteLink.setAttribute(
              "aria-disabled",
              "false"
            );

            officialVoteLink.removeAttribute(
              "tabindex"
            );

            officialVoteLink.removeAttribute(
              "target"
            );
          }
        }

        if (linkDescription) {
          linkDescription.textContent =
            mode === "review"
              ? `${placeSelect.value} ${raceNo}Rを公式サイトで確認`
              : `${placeSelect.value} ${raceNo}Rの公式確認・投票`;
        }
      };

    const updateSelectedRace =
      race => {
        const raceNo =
          Number(
            race?.raceNo ||
            0
          );

        if (!raceNo) {
          if (selectedRaceText) {
            selectedRaceText
              .textContent =
              "レース未選択";
          }

          disableOfficialLink();
          return;
        }

        if (selectedRaceText) {
          const statusText =
            mode === "review"
              ? "終了"
              : "締切予定";

          const deadline =
            race.deadline
              ? ` ${race.deadline}`
              : "";

          selectedRaceText
            .textContent =
              `${placeSelect.value} ` +
              `${raceNo}R ` +
              `${statusText}` +
              `${deadline}`;
        }

        updateOfficialLink(
          race
        );
      };

    grid.innerHTML = "";

    if (!allRaces.length) {
      grid.innerHTML =
        '<p class="official-picker-message">レース情報を取得できませんでした</p>';

      panel.hidden =
        false;

      updateSelectedRace(
        null
      );

      return;
    }

    allRaces.forEach(race => {
      const selectable =
        mode === "live"
          ? Boolean(
              race.selectable
            )
          : (
              race.status ===
              "closed"
            );

      const button =
        document.createElement(
          "button"
        );

      button.type =
        "button";

      button.className =
        "official-race-button";

      if (selectable) {
        button.classList.add(
          "is-selectable"
        );
      }

      if (
        selectable &&
        Number(race.raceNo) ===
          selectedRaceNo
      ) {
        button.classList.add(
          "is-selected"
        );
      }

      button.disabled =
        !selectable;

      button.dataset.raceNo =
        String(race.raceNo);

      const number =
        document.createElement(
          "span"
        );

      number.className =
        "official-race-number";

      number.textContent =
        `${race.raceNo}R`;

      const time =
        document.createElement(
          "span"
        );

      time.className =
        "official-race-time";

      time.textContent =
        race.status === "closed"
          ? (
              race.deadline
                ? `終了 ${race.deadline}`
                : "終了"
            )
          : (
              race.deadline ||
              "時刻未定"
            );

            const trend =
        document.createElement(
          "span"
        );

      trend.className =
        "official-race-trend";

      trend.setAttribute(
        "aria-live",
        "polite"
      );

      trend.hidden =
        !selectable;

      button.append(
        number,
        time,
        trend
      );

      button.addEventListener(
        "click",
        () => {
          raceSelect.value =
            `${race.raceNo}R`;

          if (
            typeof
              raceSelect.onchange ===
            "function"
          ) {
            raceSelect.onchange();
          }

          grid
            .querySelectorAll(
              ".official-race-button"
            )
            .forEach(item => {
              item.classList.toggle(
                "is-selected",
                item === button
              );
            });

          updateSelectedRace(
            race
          );
        }
      );

      grid.appendChild(
        button
      );
    });

    const selectedRace =
      allRaces.find(
        race =>
          Number(race.raceNo) ===
            selectedRaceNo &&
          (
            mode === "live"
              ? race.selectable
              : race.status ===
                "closed"
          )
      ) || null;

    panel.hidden =
      false;

    updateSelectedRace(
      selectedRace
    );

    renderStoredRaceTrends(
      data,
      grid
    );
  }

  async function loadVenueChoices(
    selectionGeneration =
      beginRaceSelection()
  ) {
    const mode =
      getRaceMode();

    const date =
      getScheduleDate();

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    const fetchBtn =
      document.getElementById(
        "fetchRaceBtn"
      );

    if (
      !/^\d{8}$/.test(date)
    ) {
      throw new Error(
        "日付を入力してください"
      );
    }

    const data =
      await requestSchedule(
        date
      );

    if (
      !isCurrentRaceSelection(
        selectionGeneration,
        mode,
        date
      )
    ) {
      return false;
    }

    const venues =
      mode === "live"
        ? (
            Array.isArray(
              data.liveVenues
            )
              ? data.liveVenues
              : []
          )
        : (
            Array.isArray(
              data.venues
            )
              ? data.venues
              : []
          );

    if (!venues.length) {
      replaceSelectOptions(
        placeSelect,
        [{
          value: "",

          label:
            mode === "live"
              ? "締切前の開催場はありません"
              : "開催場がありません"
        }]
      );

      replaceSelectOptions(
        raceSelect,
        [{
          value: "",

          label:
            "選択できるレースはありません"
        }]
      );

      if (fetchBtn) {
        fetchBtn.disabled =
          true;
      }

            updateStatus(
        mode === "live"
          ? "本日の締切前レースはありません。振り返りモードを選べます"
          : "この日付の終了レースはありません"
      );

      return;
    }

    const currentPlace =
      placeSelect?.value ||
      "";

    const liveAutoSelection =
      mode === "live"
        ? await loadStoredLiveSelection(
            date,
            venues
          )
        : null;
    latestStoredLiveSelection =
      liveAutoSelection;

    if (
      !isCurrentRaceSelection(
        selectionGeneration,
        mode,
        date
      )
    ) {
      return false;
    }

    const preferredJcd =
      mode === "live"
        ? String(
            (
              liveAutoSelection?.selected
                ? liveAutoSelection.best?.jcd
                : data.nextRace?.jcd
            ) ||
            ""
          )
        : String(
            PLACE_CODE_MAP[
              currentPlace
            ] ||
            venues[0]?.jcd ||
            ""
          );

    replaceSelectOptions(
      placeSelect,

      venues.map(venue => ({
        value:
          venue.place,

        jcd:
          venue.jcd,

        label:
          venue.place
      }))
    );

    const preferredVenue =
      venues.find(
        venue =>
          String(venue.jcd) ===
          preferredJcd
      ) ||
      venues[0];

    if (
      placeSelect &&
      preferredVenue
    ) {
      placeSelect.value =
        preferredVenue.place;
    }

        renderOfficialVenuePicker(
      data,
      mode
    );

    if (fetchBtn) {
      fetchBtn.disabled =
        false;
    }

    const raceChoicesLoaded =
      await loadRaceChoices(
      mode === "live"
        ? Number(
            (
              liveAutoSelection?.selected
                ? liveAutoSelection.best?.raceNo
                : data.nextRace?.raceNo
            ) ||
            0
          )
        : 0,
      selectionGeneration
    );

    if (
      !raceChoicesLoaded ||
      !isCurrentRaceSelection(
        selectionGeneration,
        mode,
        date
      )
    ) {
      return false;
    }

    if (mode === "live") {
      renderLiveAutoSelection(
        liveAutoSelection
      );

      if (liveAutoSelection?.selected) {
        const best = liveAutoSelection.best;

        updateStatus(
          `${best.place} ${best.raceNo}Rを自動選定しました` +
          `（${best.type}${Math.round(best.score)}点）`
        );
      } else if (liveAutoSelection?.best) {
        updateStatus(
          `自動選定は見送りです` +
          `（最高${Math.round(liveAutoSelection.best.score)}点／` +
          `基準${liveAutoSelection.minScore}点）`
        );
      }
    }

    const officialPicker =
      document.getElementById(
        "officialRacePicker"
      );

    const raceSelectGrid =
      document.querySelector(
        ".race-select-grid"
      );

    const placeField =
      placeSelect?.closest(
        "label"
      );

    const raceField =
      raceSelect?.closest(
        "label"
      );

    if (officialPicker) {
      officialPicker.hidden =
        false;
    }

    if (placeField) {
      placeField.hidden =
        true;
    }

    if (raceField) {
      raceField.hidden =
        true;
    }

    if (raceSelectGrid) {
      raceSelectGrid.style
        .gridTemplateColumns =
        "1fr 1fr";
    }

    return true;
  }

  async function loadRaceChoices(
    preferredRaceNo = 0,
    selectionGeneration =
      beginRaceSelection()
  ) {
    const mode =
      getRaceMode();

    const date =
      getScheduleDate();

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    const fetchBtn =
      document.getElementById(
        "fetchRaceBtn"
      );

    const selectedOption =
      placeSelect?.options?.[
        placeSelect.selectedIndex
      ];

    const jcd =
      selectedOption?.dataset?.jcd ||
      PLACE_CODE_MAP[
        placeSelect?.value
      ];

    const selectedPlace =
      placeSelect?.value ||
      "";

    if (!jcd) {
      throw new Error(
        "開催場を選択してください"
      );
    }

    updateStatus(
      "レース締切を確認中..."
    );

    const data =
      await requestSchedule(
        date,
        jcd
      );

    const currentOption =
      placeSelect?.options?.[
        placeSelect.selectedIndex
      ];

    const currentJcd =
      currentOption?.dataset?.jcd ||
      PLACE_CODE_MAP[
        placeSelect?.value
      ];

    if (
      !isCurrentRaceSelection(
        selectionGeneration,
        mode,
        date
      ) ||
      placeSelect?.value !==
        selectedPlace ||
      String(currentJcd || "") !==
        String(jcd || "")
    ) {
      return false;
    }

    const allRaces =
      Array.isArray(
        data.selectedVenue?.races
      )
        ? data.selectedVenue.races
        : [];

    const nowMs = Date.now();
    const races =
      allRaces.filter(race => {
        const deadlineMs = Date.parse(
          race?.deadlineAt ||
          race?.deadline ||
          ""
        );
        const closedByTime = Number.isFinite(deadlineMs)
          ? deadlineMs <= nowMs
          : race?.selectable === false;
        const closedByStatus = ["closed", "finished", "ended"]
          .includes(String(race?.status || "").toLowerCase());
        const closedNow = closedByTime || closedByStatus;
        return mode === "live"
          ? race?.selectable !== false &&
            !closedNow &&
            race?.cancelled !== true
          : closedNow;
      });

    if (!races.length) {
      replaceSelectOptions(
        raceSelect,
        [{
          value: "",

          label:
            mode === "live"
              ? "締切前レースはありません"
              : "終了レースはありません"
        }]
      );

      if (fetchBtn) {
        fetchBtn.disabled =
          true;
      }

      updateStatus(
        mode === "live"
          ? "この場の発売は終了しました"
          : "終了レースはまだありません"
      );

      return true;
    }

    replaceSelectOptions(
      raceSelect,

      races.map(race => ({
        value:
          `${race.raceNo}R`,

                label:
          mode === "live"
            ? (
                `${race.raceNo}R` +
                `（${race.deadline}）`
              )
            : (
                `${race.raceNo}R` +
                `（終了 ${race.deadline}）`
              )
      }))
    );

    const preferred =
      mode === "live"
        ? (
            races.find(
              race =>
                race.raceNo ===
                preferredRaceNo
            ) ||
            races[0]
          )
        : races[
            races.length - 1
          ];

    if (
      raceSelect &&
      preferred
    ) {
      raceSelect.value =
        `${preferred.raceNo}R`;
    }

　　　        if (
      typeof
        raceSelect?.onchange ===
      "function"
    ) {
      raceSelect.onchange();
    }

    renderOfficialRacePicker(
      data,
      mode
    );

    window.ChappyAPI
      ?.prefetchRace?.({
        jcd,
        rno: preferred.raceNo,
        date
      })
      .catch(() => {
        // 先読み失敗は、予想開始時の通常取得で再試行する。
      });

    if (fetchBtn) {
      fetchBtn.disabled =
        false;
    }

    updateStatus(
      mode === "live"
        ? (
            `${placeSelect.value} ` +
            `${preferred.raceNo}Rを` +
            `自動選択しました`
          )
        : (
            `${placeSelect.value} ` +
            `${preferred.raceNo}Rまで` +
            `振り返れます`
          )
    );

    return true;
  }

  async function performRaceSelection(
    input = {}
  ) {
    const modeSelect =
      document.getElementById(
        "raceModeSelect"
      );

    const dateInput =
      document.getElementById(
        "dateInput"
      );

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    const mode =
      input.mode === "review"
        ? "review"
        : "live";

    const date =
      String(
        input.date ||
        ""
      ).replace(/\D/g, "")
        .slice(0, 8);

    const place =
      String(
        input.place ||
        ""
      ).trim();

    const jcd =
      String(
        input.jcd ||
        PLACE_CODE_MAP[place] ||
        ""
      ).padStart(2, "0");

    const raceNo =
      Number(
        input.raceNo ||
        input.rno ||
        0
      );

    if (
      !modeSelect ||
      !dateInput ||
      !placeSelect ||
      !raceSelect ||
      !/^\d{8}$/.test(date) ||
      !/^\d{2}$/.test(jcd) ||
      raceNo < 1 ||
      raceNo > 12
    ) {
      throw new Error(
        "レース選択情報を確認できません"
      );
    }

    modeSelect.value = mode;
    dateInput.value =
      `${date.slice(0, 4)}-` +
      `${date.slice(4, 6)}-` +
      `${date.slice(6, 8)}`;

    const modeGeneration =
      await applyRaceMode({
        skipSchedule: true
      });

    if (!modeGeneration) {
      throw new Error(
        "開催場の選択準備が完了しませんでした"
      );
    }

    const homeVenues =
      window.ChappyHomeDashboardV2
        ?.getSchedule?.() || [];
    const venueItems =
      homeVenues
        .filter(venue =>
          venue?.place &&
          venue?.jcd
        )
        .map(venue => ({
          value: String(venue.place),
          label: String(venue.place),
          jcd: String(venue.jcd)
            .padStart(2, "0")
        }));

    if (
      !venueItems.some(item =>
        item.value === place &&
        item.jcd === jcd
      )
    ) {
      venueItems.push({
        value: place,
        label: place,
        jcd
      });
    }

    replaceSelectOptions(
      placeSelect,
      venueItems
    );

    const venueOption =
      [...placeSelect.options]
        .find(option =>
          option.value === place &&
          String(
            option.dataset.jcd ||
            ""
          ).padStart(2, "0") ===
            jcd
        );

    if (!venueOption) {
      throw new Error(
        "選択した開催場を確認できませんでした"
      );
    }

    const suppliedSchedule =
      input.scheduleData ||
      await Promise.resolve(
        input.schedulePromise || null
      ).catch(() => null);
    primeScheduleCache(
      date,
      jcd,
      suppliedSchedule
    );

    placeSelect.value = place;
    const racesLoaded =
      await loadRaceChoices(
        raceNo,
        modeGeneration
      );

    const raceValue =
      `${raceNo}R`;

    if (
      !racesLoaded ||
      ![...raceSelect.options]
        .some(option =>
          option.value === raceValue
        )
    ) {
      throw new Error(
        "選択したレース情報を取得できませんでした"
      );
    }

    raceSelect.value = raceValue;

    return {
      mode,
      date,
      place,
      jcd,
      raceNo
    };
  }

  function captureRaceSelection() {
    return {
      mode:
        document.getElementById(
          "raceModeSelect"
        )?.value ||
        "live",
      date:
        document.getElementById(
          "dateInput"
        )?.value ||
        "",
      place:
        document.getElementById(
          "placeSelect"
        )?.value ||
        "",
      race:
        document.getElementById(
          "raceSelect"
        )?.value ||
        ""
    };
  }

  async function restoreRaceSelection(
    previous
  ) {
    const modeSelect =
      document.getElementById(
        "raceModeSelect"
      );

    const dateInput =
      document.getElementById(
        "dateInput"
      );

    const placeSelect =
      document.getElementById(
        "placeSelect"
      );

    const raceSelect =
      document.getElementById(
        "raceSelect"
      );

    if (
      !modeSelect ||
      !dateInput ||
      !placeSelect ||
      !raceSelect
    ) {
      return false;
    }

    modeSelect.value =
      previous.mode === "review"
        ? "review"
        : "live";
    dateInput.value =
      previous.date;

    const modeGeneration =
      await applyRaceMode();
    if (!modeGeneration) return false;

    if (
      ![...placeSelect.options]
        .some(option =>
          option.value ===
          previous.place
        )
    ) {
      return false;
    }

    placeSelect.value =
      previous.place;
    const placeGeneration =
      beginRaceSelection();
    const racesLoaded =
      await loadRaceChoices(
        0,
        placeGeneration
      );

    if (
      !racesLoaded ||
      ![...raceSelect.options]
        .some(option =>
          option.value ===
          previous.race
        )
    ) {
      return false;
    }

    raceSelect.value =
      previous.race;
    if (
      typeof raceSelect.onchange ===
      "function"
    ) {
      raceSelect.onchange();
    }

    return true;
  }

  async function selectRaceForPrediction(
    input = {}
  ) {
    const selectionGeneration =
      ++explicitSelectionGeneration;
    const previous =
      captureRaceSelection();

    try {
      const selected =
        await performRaceSelection(
        input
      );
      if (
        selectionGeneration !==
        explicitSelectionGeneration
      ) {
        const staleError =
          new Error(
            "新しいレース選択へ切り替えました"
          );
        staleError.name =
          "AbortError";
        throw staleError;
      }
      return selected;
    } catch (error) {
      if (
        selectionGeneration !==
        explicitSelectionGeneration
      ) {
        if (error?.name === "AbortError") {
          throw error;
        }
        const staleError =
          new Error(
            "新しいレース選択へ切り替えました"
          );
        staleError.name =
          "AbortError";
        throw staleError;
      }
      beginRaceSelection();
      try {
        await restoreRaceSelection(
          previous
        );
      } catch (restoreError) {
        console.warn(
          "レース選択の復元エラー",
          restoreError
        );
      }
      throw error;
    }
  }

  function handleRaceSelectionError(
    error
  ) {
    console.error(
      "race selection error",
      error
    );

    updateStatus(
      "開催情報の取得に失敗しました"
    );

    showError(
      error?.message ||
      String(error)
    );

    const fetchBtn =
      document.getElementById(
        "fetchRaceBtn"
      );

    if (fetchBtn) {
      fetchBtn.disabled =
        true;
    }
  }

  async function prepareRaceDataForTheories(
    raceData,
    params = {}
  ) {
    await window.ChappyPredictionRuntime
      ?.ensureReady?.();

    try {
      await window.ChappyHiyoriRuntimeLoader
        ?.ensureReady?.();
    } catch (error) {
      console.warn(
        "⚠️ 予想補助モジュールを準備できませんでした",
        error?.message || error
      );
    }

    const hasApiHistoryContext = Boolean(
      raceData &&
      Object.prototype.hasOwnProperty.call(
        raceData,
        "historyContext"
      )
    );
    const allowLegacyHistoryFallback =
      window.CHAPPY_LEGACY_HISTORY_FALLBACK === true;

    if (
      !hasApiHistoryContext &&
      allowLegacyHistoryFallback
    ) {
      try {
        await window.ChappyRaceHistory
          ?.load();
      } catch (error) {
        console.warn(
          "⚠️ 開発用の旧履歴読込を完了できませんでした",
          error?.message || error
        );
      }
    }

    const jcd =
      String(
        params.jcd ??
        raceData?.stadiumCode ??
        raceData?.jcd ??
        ""
      ).padStart(2, "0");
    const raceNo =
      Number(
        params.rno ??
        params.raceNo ??
        raceData?.raceNo ??
        0
      );
    const historyContext = hasApiHistoryContext
      ? raceData.historyContext
      : allowLegacyHistoryFallback
        ? (
            window.ChappyRaceHistory
              ?.getContext({
                jcd,
                raceNo,
                registerNos:
                  Array.isArray(raceData?.entries)
                    ? raceData.entries
                        .map((entry) =>
                          entry?.registerNo
                        )
                        .filter(Boolean)
                    : []
              }) || null
          )
        : {
            ready: false,
            source: "",
            delivery: "api-history-missing",
            warnings: [
              "履歴統計を取得できないため、基礎データで予想します"
            ]
          };
    const input = {
      ...raceData,
      historyContext
    };

    return window.ChappyTheoryInput
      ?.prepare(
        input,
        window.ChappyAICore
      ) || input;
  }

    async function fetchAndRenderRace() {
    const requestGeneration =
      ++predictionGeneration;
    const isCurrentRequest = () =>
      requestGeneration ===
      predictionGeneration;
    try {
      clearErrorArea();

      updateStatus(
        "取得中..."
      );
      updatePredictionOddsStatus(
        "オッズ取得中…",
        "loading"
      );

      const params =
        getRaceParams();

      const mode =
        getRaceMode();

      const isReview =
        mode === "review";
      updatePredictionOddsStatus(
        isReview
          ? "振り返り表示"
          : "オッズ取得中…",
        isReview ? "pending" : "loading"
      );

      if (!isReview) {
        await verifyLiveDeadline(
          params
        );

        if (!isCurrentRequest()) {
          return false;
        }

        clearReviewResult();
      }

      console.log(
        "🚤 race params",
        params
      );

      const raceDataPromise =
        fetchRaceData(params);
      const oddsSupplementState = {
        settled: false,
        value: null,
        error: null
      };
      const oddsSupplementPromise =
        (
          isReview
            ? fetchReviewOddsSupplement(
                params
              )
            : fetchOddsSupplement(
                params
              )
        )
          .then(value => {
            oddsSupplementState.settled = true;
            oddsSupplementState.value = value;
            return value;
          })
          .catch(error => {
            oddsSupplementState.settled = true;
            oddsSupplementState.error = error;
            const fallback = {
              oddsData: null,
              oddsError: error,
              missingData: null
            };
            oddsSupplementState.value = fallback;
            return fallback;
          });
      const predictionRuntime =
        window.ChappyPredictionRuntime
          ?.ensureReady?.();
      const hiyoriRuntime =
        window.ChappyHiyoriRuntimeLoader
          ?.ensureReady?.()
          .catch(error => {
            console.warn(
              "⚠️ 予想補助モジュールを準備できませんでした",
              error?.message || error
            );
          });
      const [fetchedData] =
        await Promise.all([
          raceDataPromise,
          predictionRuntime,
          hiyoriRuntime
        ]);

      if (!isCurrentRequest()) {
        return false;
      }

      const data =
        await prepareRaceDataForTheories(
          fetchedData,
          params
        );

      if (!isCurrentRequest()) {
        return false;
      }

      lastRaceData =
        data;

      console.log(
        "✅ API成功 entries=",
        data?.entries?.length || 0,
        {
          source: data?.source || "",
          historyReady: Boolean(data?.historyContext)
        }
      );

      console.log("[prediction-stage] create:start");
      const prediction =
        createPredictionSafe(
          data
        ) ||
        createEmergencyPrediction(
          data
        );
      console.log("[prediction-stage] create:finished");

      function createEmergencyPrediction(
        raceData
      ) {
        return {
          ok: true,

          version:
            "emergency",

          race:
            raceData,

          indexes: {
            scores: [],
            totalRanking: []
          },

          mainSheet: {
            evaluations: [],
            formation: {}
          },

          manshuSheet: {
            candidates: [],
            formation: []
          },

          formation: {},

          finalComment: {
            title:
              "緊急表示",

            comment:
              "prediction.jsが失敗したため、取得データのみ表示します。"
          }
        };
      }

      console.log("[prediction-stage] legacy-analysis:start");
      createTheorySafe(data);
      createAISafe(data);
      console.log("[prediction-stage] legacy-analysis:finished");

      if (
        !prediction ||
        typeof prediction !==
          "object"
      ) {
        throw new Error(
          "prediction.js から有効な予想データが返っていません。"
        );
      }

      prediction.predictionMode =
        isReview
          ? "retrospective_reference"
          : "pre_deadline";

      prediction.isRetrospective =
        isReview;

      prediction
        .officialResultUsedForPrediction =
        false;

      console.log("[prediction-stage] practical-selection:start");
      ensurePracticalSelection(
        prediction
      );
      console.log("[prediction-stage] practical-selection:finished");

      let oddsAppliedBeforeRender = false;
      const settledOddsSupplement =
        oddsSupplementState?.settled
          ? oddsSupplementState.value
          : null;
      if (
        settledOddsSupplement &&
        hasUsableOddsData(
          settledOddsSupplement.oddsData
        )
      ) {
        console.log("[prediction-stage] settled-odds:start");
        try {
          lastRaceData = {
            ...lastRaceData,
            odds:
              settledOddsSupplement
                .oddsData
          };
          enrichPredictionWithOdds(
            prediction,
            settledOddsSupplement.oddsData,
            settledOddsSupplement.missingData,
            params
          );
          oddsAppliedBeforeRender = true;
        } catch (oddsError) {
          oddsSupplementState.error = oddsError;
          console.warn(
            "オッズ情報の付加に失敗",
            oddsError?.message || oddsError
          );
        }
        console.log("[prediction-stage] settled-odds:finished");
      }

      lastPrediction = prediction;
        
      if (!isReview) {
        savePredictionSnapshot(
          params,
          prediction
        );
      }
      
      if (
        typeof window.renderAll ===
        "function"
      ) {
        console.log("[prediction-stage] render:start");
        window.renderAll(
          prediction
        );
        console.log("[prediction-stage] render:finished");
        const resultArea =
          document.getElementById(
            "resultArea"
          );
        if (resultArea) {
          delete resultArea.dataset
            .raceLoading;
        }
        window.dispatchEvent(
          new CustomEvent(
            "chappy:prediction-rendered",
            {
              detail: {
                place: params.place,
                jcd: params.jcd,
                raceNo: params.rno,
                date: params.date
              }
            }
          )
        );
      } else {
        throw new Error(
          "renderAll() が見つかりません。render.jsを確認してください。"
        );
      }

      if (isReview) {
        if (oddsAppliedBeforeRender) {
          updatePredictionOddsStatus(
            "最終オッズ反映済み",
            "ready"
          );
        } else {
          void oddsSupplementPromise
            .then(oddsSupplement =>
              applyReviewOddsSupplement({
                oddsSupplement,
                prediction,
                params,
                isCurrentRequest
              })
            )
            .catch(oddsError => {
              if (
                !isCurrentRequest() ||
                lastPrediction !== prediction
              ) {
                return;
              }
              console.warn(
                "最終オッズ情報の付加に失敗",
                oddsError?.message ||
                  oddsError
              );
            });
        }

        updateStatus(
          "予想完了・公式結果を取得中..."
        );

        try {
          const officialResult =
            await fetchOfficialResult(
              params
            );

          if (!isCurrentRequest()) {
            return false;
          }

          renderReviewResult(
            officialResult,
            params
          );

          const reviewStatus =
            officialResult
              .resultAvailable
              ? "振り返り予想と公式結果を表示しました"
              : isVoidOfficialResult(
                  officialResult
                )
                ? "振り返り予想と不成立結果を表示しました"
                : "振り返り予想を表示しました。公式結果は未確定です";

          updateStatus(
            reviewStatus
          );
        } catch (
          resultError
        ) {
          if (!isCurrentRequest()) {
            return false;
          }
          console.error(
            "official result error",
            resultError
          );

          renderReviewResultError(
            resultError,
            params
          );

          updateStatus(
            "振り返り予想を表示しました。公式結果の取得に失敗しました"
          );
        }
      } else {
        if (oddsAppliedBeforeRender) {
            const count = Number(
              settledOddsSupplement
                ?.oddsData?.count || 0
            );
            if (
              !settledOddsSupplement?.missingData &&
              settledOddsSupplement?.missingPromise
            ) {
              void settledOddsSupplement.missingPromise
                .then(missingData =>
                  applyMissingSupplement({
                    missingData,
                    oddsData: settledOddsSupplement.oddsData,
                    prediction,
                    params,
                    isCurrentRequest
                  })
                )
                .catch(error => {
                  console.warn(
                    "出てない目の後追い反映に失敗",
                    error?.message || error
                  );
                });
            }
            updateStatus(
              `取得完了（オッズ${count}通り反映）`
            );
            updatePredictionOddsStatus(
              "オッズ反映済み",
              "ready"
            );
        } else if (oddsSupplementState?.settled) {
          applyOddsSupplement({
            oddsSupplement:
              oddsSupplementState.value,
            prediction,
            params,
            isCurrentRequest
          });
        } else if (oddsSupplementPromise) {
          updateStatus("予想を表示しました（オッズ取得中…）");
          updatePredictionOddsStatus(
            "オッズ取得中…",
            "loading"
          );
          void oddsSupplementPromise
            .then(oddsSupplement => applyOddsSupplement({
              oddsSupplement,
              prediction,
              params,
              isCurrentRequest
            }))
            .catch(oddsError => {
              if (!isCurrentRequest()) return;
              console.warn(
                "オッズ情報の付加に失敗",
                oddsError?.message || oddsError
              );
              updateStatus(
                "予想を表示しました（オッズは取得できませんでした）"
              );
              updatePredictionOddsStatus(
                "オッズ取得失敗",
                "error"
              );
            });
        }
      }
      return true;
    } catch (error) {
      if (!isCurrentRequest()) {
        return false;
      }
      console.error(
        "❌ fetchAndRenderRace error",
        error
      );

      updateStatus(
        "エラー"
      );
      updatePredictionOddsStatus(
        "取得失敗",
        "error"
      );
      window.ChappyHomeDashboardV2
        ?.showPredictionError?.(
          error?.message
        );

      showError(
        `${
          error.message ||
          "取得に失敗しました"
        }\n\n${
          error.stack ||
          "スタック情報を取得できません"
        }`
      );
      return false;
    }
  }

  async function verifyLiveDeadline(
    params
  ) {
    updateStatus(
      "締切時刻を再確認中..."
    );

    const schedule =
      await requestSchedule(
        params.date,
        params.jcd
      );

    const races =
      Array.isArray(
        schedule
          .selectedVenue
          ?.races
      )
        ? schedule
            .selectedVenue
            .races
        : [];

    const selectedRace =
      races.find(
        race =>
          Number(
            race.raceNo
          ) ===
          Number(
            params.rno
          )
      );

    const deadlineMs = Date.parse(
      selectedRace?.deadlineAt ||
      selectedRace?.closeAt ||
      ""
    );

    if (
      !selectedRace?.selectable ||
      (
        Number.isFinite(deadlineMs) &&
        deadlineMs <= Date.now()
      )
    ) {
      await loadVenueChoices();

      throw new Error(
        "選択したレースは締切を過ぎました。次の締切前レースを選び直しました。"
      );
    }
  }

  function fetchOfficialResultPayload(url) {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = window.setTimeout(() => {
        const createTimeoutError =
          window.ChappyResultRequestTimeout?.createTimeoutError;
        reject(
          typeof createTimeoutError === "function"
            ? createTimeoutError(OFFICIAL_RESULT_TIMEOUT_MS)
            : new Error("公式結果APIの応答が12秒を超えました")
        );
      }, OFFICIAL_RESULT_TIMEOUT_MS);
    });

    const request = (async () => {
      const response = await window.fetch(url);
      const result = await response.json();
      return { response, result };
    })();

    return Promise.race([request, timeout]).finally(() => {
      if (timer) window.clearTimeout(timer);
    });
  }

  async function fetchOfficialResult(
    params
  ) {
    const url =
      `https://chappy-boatrace-api.vercel.app/api/result` +
      `?date=${encodeURIComponent(
        params.date
      )}` +
      `&jcd=${encodeURIComponent(
        params.jcd
      )}` +
      `&rno=${encodeURIComponent(
        params.rno
      )}`;

    const payload =
      await fetchOfficialResultPayload(url);
    const response = payload.response;
    let result = payload.result;

    if (
      !response.ok ||
      !result?.ok
    ) {
      throw new Error(
        result?.error ||
        `公式結果APIエラー：` +
        `${response.status}`
      );
    }

    const compatibility =
      window.ChappyResultVoidCompat;
    if (
      compatibility &&
      typeof compatibility.normalize ===
        "function"
    ) {
      result =
        compatibility.normalize(
          result
        );
    }

    if (result.resultAvailable) {
      try {
        const storage =
          window.ChappyStorage;

        if (
          !storage ||
          typeof storage
            .buildRaceKey !==
            "function" ||
          typeof storage
            .findPredictionByRaceKey !==
            "function" ||
          typeof storage
            .upsertResult !==
            "function"
        ) {
          throw new Error(
            "公式結果のレース別保存機能が見つかりません"
          );
        }

        const requestedRaceKey =
          storage.buildRaceKey({
            date: params.date,
            jcd: params.jcd,
            raceNo: params.rno
          });

        const officialRaceKey =
          storage.buildRaceKey({
            date: result.date,
            jcd: result.jcd,
            raceNo: result.raceNo
          });

        if (
          !requestedRaceKey ||
          !officialRaceKey ||
          requestedRaceKey !==
            officialRaceKey
        ) {
          throw new Error(
            "選択レースと公式結果のレース情報が一致しません"
          );
        }

        const matchedPrediction =
          storage
            .findPredictionByRaceKey(
              officialRaceKey
            );

        storage.upsertResult({
          raceKey:
            officialRaceKey,

          recordType:
            "official_result",

          resultSource:
            result.source ||
            "boatrace-official",

          date:
            String(result.date),

          place:
            params.place,

          jcd:
            String(result.jcd),

          raceNo:
            Number(result.raceNo),

          result:
            String(
              result.trifecta
                ?.combination ||
              ""
            ),

          officialPayoutPer100:
            Number(
              result.trifecta
                ?.payout ||
              0
            ),

          officialPayoutText:
            String(
              result.trifecta
                ?.payoutText ||
              ""
            ),

          officialPopularity:
            result.trifecta
              ?.popularity ??
            null,

          winningMethod:
            String(
              result.winningMethod ||
              ""
            ),

          finishers:
            Array.isArray(result.finishers)
              ? result.finishers
              : [],

          starts:
            Array.isArray(result.starts)
              ? result.starts
              : [],

          officialCheckedAt:
            result.checkedAt ||
            new Date()
              .toISOString(),

          officialResultUrl:
            String(
              result.resultUrl ||
              ""
            ),

          predictionRaceKey:
            matchedPrediction
              ?.raceKey ||
            ""
        });
      } catch (storageError) {
        console.warn(
          "公式結果のレース別保存に失敗",
          storageError
        );
      }
    }

    return result;
  }
  function isVoidOfficialResult(
    result
  ) {
    const compatibility =
      window.ChappyResultVoidCompat;
    if (
      compatibility &&
      typeof compatibility.isVoidResult ===
        "function"
    ) {
      return compatibility
        .isVoidResult(result);
    }
    return (
      result?.resultAvailable ===
        false &&
      result?.status === "void"
    );
  }
  function ensureReviewResultArea() {
    let area =
      document.getElementById(
        "reviewResultArea"
      );

    if (area) {
      return area;
    }

    const host =
      document.getElementById(
        "predictionSection"
      );

    if (!host) {
      return null;
    }

    area =
      document.createElement(
        "section"
      );

    area.id =
      "reviewResultArea";

    area.className =
      "dashboard-section result-management-section";

    host.appendChild(
      area
    );

    return area;
  }

  function clearReviewResult() {
    const area =
      document.getElementById(
        "reviewResultArea"
      );

    if (!area) {
      return;
    }

    area.innerHTML = "";

    area.style.display =
      "none";
  }

  function renderReviewResult(
    result,
    params
  ) {
    const area =
      ensureReviewResultArea();

    if (!area) {
      return;
    }

    area.style.display =
      "block";

    const trifecta =
      result?.trifecta;

    const finishers =
      Array.isArray(
        result?.finishers
      )
        ? result.finishers
        : [];

    const starts =
      Array.isArray(
        result?.starts
      )
        ? result.starts
        : [];

    const isVoid =
      isVoidOfficialResult(
        result
      );

    const resultBody =
      result?.resultAvailable
        ? `
          <div class="race-select-card">

            <p>
              <strong>
                3連単：
                ${escapeHTML(
                  trifecta
                    ?.combination ||
                  "-"
                )}
              </strong>
            </p>

            <p>
              払戻：
              ${escapeHTML(
                trifecta
                  ?.payoutText ||
                "-"
              )}
              ／
              ${escapeHTML(
                trifecta
                  ?.popularity ??
                "-"
              )}番人気
            </p>

            <p>
              決まり手：
              ${escapeHTML(
                result
                  ?.winningMethod ||
                "-"
              )}
            </p>

            <div class="result-dashboard-grid">

              <article class="dashboard-card">

                <h3>
                  着順
                </h3>

                ${finishers
                  .map(item => `
                    <p>
                      ${escapeHTML(
                        item.rank
                      )}着　
                      ${escapeHTML(
                        item.boat
                      )}号艇　
                      ${escapeHTML(
                        item.racerName ||
                        "-"
                      )}
                    </p>
                  `)
                  .join("")}

              </article>

              <article class="dashboard-card">

                <h3>
                  スタート情報
                </h3>

                ${starts
                  .map(item => `
                    <p>
                      ${escapeHTML(
                        item.course
                      )}コース／
                      ${escapeHTML(
                        item.boat
                      )}号艇　
                      ST
                      ${escapeHTML(
                        item.raw ||
                        item.st ||
                        "-"
                      )}
                    </p>
                  `)
                  .join("")}

              </article>

            </div>

          </div>
        `
        : isVoid
          ? `
          <div class="race-select-card">

            <p>
              <strong>
                不成立（全艇F/L）
              </strong>
            </p>

            <p>
              3連単は成立していません。返還対象として扱います。
            </p>

          </div>
        `
        : `
          <div class="race-select-card">

            <p>
              公式結果はまだ確定していません。
            </p>

          </div>
        `;

    area.innerHTML = `
      <div class="dashboard-section-head">

        <div>

          <p class="section-eyebrow">
            OFFICIAL RESULT
          </p>

          <h2>
            🏁 公式レース結果
          </h2>

        </div>

        <span class="section-status-badge">
          予想とは別表示
        </span>

      </div>

      <div class="status dashboard-status">

        ${escapeHTML(
          params.place
        )}
        ${escapeHTML(
          params.rno
        )}R：

        この結果はAI予想の計算に使用していません

      </div>

      ${resultBody}
    `;
  }

  function renderReviewResultError(
    error,
    params
  ) {
    const area =
      ensureReviewResultArea();

    if (!area) {
      return;
    }

    area.style.display =
      "block";

    area.innerHTML = `
      <div class="dashboard-section-head">

        <div>

          <p class="section-eyebrow">
            OFFICIAL RESULT
          </p>

          <h2>
            🏁 公式レース結果
          </h2>

        </div>

      </div>

      <div class="dashboard-error-area">

        ${escapeHTML(
          params.place
        )}
        ${escapeHTML(
          params.rno
        )}Rの結果を取得できませんでした。

        <br>

        ${escapeHTML(
          error?.message ||
          String(error)
        )}

      </div>
    `;
  }

  function getRaceParams() {
    const place = document.getElementById("placeSelect")?.value || "大村";
    const raceText = document.getElementById("raceSelect")?.value || "1R";
    const dateValue = document.getElementById("dateInput")?.value;

    const jcd = PLACE_CODE_MAP[place];

    if (!jcd) {
      throw new Error(`場コードが見つかりません：${place}`);
    }

    const rno = Number(String(raceText).replace("R", ""));
    const date = String(dateValue || "").replaceAll("-", "");

    if (!rno) {
      throw new Error("レース番号が不正です");
    }

    if (!date || date.length !== 8) {
      throw new Error("日付を入力してください");
    }

    return {
      place,
      jcd,
      rno,
      date
    };
  }

  window.ChappyRaceSelection =
    Object.freeze({
      getRaceParams,
      select:
        selectRaceForPrediction
    });

    async function fetchRaceData(params) {
    if (
      window.ChappyAPI &&
      typeof window.ChappyAPI.getRace === "function"
    ) {
      return await window.ChappyAPI.getRace(params);
    }

    if (
      window.ChappyAPI &&
      typeof window.ChappyAPI.fetchRace === "function"
    ) {
      return await window.ChappyAPI.fetchRace(params);
    }

    if (typeof window.fetchRace === "function") {
      return await window.fetchRace(params);
    }

    const url =
      `https://chappy-boatrace-api.vercel.app/api/race?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`APIエラー：${res.status}`);
    }

    return await res.json();
  }

  function createPredictionSafe(data) {
    try {
      if (typeof window.createPrediction !== "function") {
        throw new Error(
          "window.createPrediction が見つかりません"
        );
      }

      return window.createPrediction(data);

    } catch (error) {
      console.error("prediction.js error", error);

      return {
        ok: false,
        version: "prediction-error",
        race: data,

        indexes: {
          scores: [],
          totalRanking: []
        },

        mainSheet: {
          evaluations: [],
          formation: {}
        },

        manshuSheet: {
          candidates: [],
          formation: []
        },

        formation: {},

        finalComment: {
          title: "prediction.jsエラー詳細",
          comment:
            `${error?.name || "Error"}：` +
            `${error?.message || String(error)}`
        }
      };
    }
  }


  function createTheorySafe(data) {
    try {
      if (typeof window.createTheory === "function") {
        return window.createTheory(data);
      }

      if (typeof window.analyzeTheory === "function") {
        return window.analyzeTheory(data);
      }
    } catch (error) {
      console.warn("theory.js error", error);
    }

    return null;
  }

  function createAISafe(data) {
    try {
      if (typeof window.createAI === "function") {
        return window.createAI(data);
      }

      if (typeof window.createAIIndex === "function") {
        return window.createAIIndex(data);
      }
    } catch (error) {
      console.warn("ai.js error", error);
    }

    return null;
  }

  function ensurePracticalSelection(
    prediction
  ) {
    if (
      !prediction ||
      typeof prediction !== "object"
    ) {
      return null;
    }

    if (
      prediction.practicalSelection &&
      typeof prediction
        .practicalSelection ===
        "object"
    ) {
      return prediction
        .practicalSelection;
    }

    const practicalSelector =
      typeof window !== "undefined"
        ? window
            .ChappyPracticalSelection
        : null;

    if (
      typeof practicalSelector
        ?.select !== "function"
    ) {
      return null;
    }

    try {
      const practicalSelection =
        practicalSelector.select(
          prediction
        );

      if (
        !practicalSelection ||
        typeof practicalSelection !==
          "object"
      ) {
        return null;
      }

      prediction.practicalSelection =
        practicalSelection;

      if (
        !prediction
          .verificationEvidence &&
        practicalSelection
          .verificationEvidence
      ) {
        prediction
          .verificationEvidence =
          practicalSelection
            .verificationEvidence;
      }

      return practicalSelection;
    } catch (selectionError) {
      console.warn(
        "実戦厳選の確定に失敗",
        selectionError?.message ||
          selectionError
      );
      return null;
    }
  }

      function savePredictionSnapshot(
    params,
    prediction
  ) {
    try {
      const storage =
        window.ChappyStorage;

      if (
        !storage ||
        typeof storage
          .upsertPrediction !==
          "function"
      ) {
        throw new Error(
          "ChappyStorage.upsertPrediction が見つかりません"
        );
      }

      const normalizeCategory =
        value => {
          const category =
            String(
              value || ""
            ).trim();

          if (
            category === "本線"
          ) {
            return "本命";
          }

          if (
            category === "万舟" ||
            category === "穴候補" ||
            category === "高配当候補"
          ) {
            return "穴・万舟候補";
          }

          return category;
        };

      const aiTicketList =
        Array.isArray(
          prediction?.aiTicketList
        )
          ? prediction.aiTicketList
          : [];

      const rankedSource =
        Array.isArray(
          prediction?.ticketRanks
        ) &&
        prediction.ticketRanks
          .length > 0
          ? prediction.ticketRanks
          : aiTicketList;

      const ticketRanks =
        rankedSource
          .map(item => {
            const ticket =
              String(
                item?.ticket || ""
              ).trim();

            const aiTicket =
              aiTicketList.find(
                row =>
                  String(
                    row?.ticket || ""
                  ).trim() ===
                  ticket
              ) || null;

            const rawCategories =
              aiTicket?.categories ||
              aiTicket?.category ||
              item?.categories ||
              item?.category ||
              item?.type ||
              item?.role ||
              [];

            const categories = [
              ...new Set(
                (
                  Array.isArray(
                    rawCategories
                  )
                    ? rawCategories
                    : [rawCategories]
                )
                  .map(
                    normalizeCategory
                  )
                  .filter(Boolean)
              )
            ];

            const role =
              [
                "本命",
                "押さえ",
                "流し",
                "拾い",
                "穴・万舟候補"
              ].find(value =>
                categories.includes(
                  value
                )
              ) ||
              normalizeCategory(
                item?.role
              ) ||
              "分類未保存";

            const rawScenarios =
              aiTicket
                ?.scenarioTypes ||
              aiTicket
                ?.scenarioType ||
              item?.scenarioTypes ||
              item?.scenarioType ||
              [];

            const scenarioTypes = [
              ...new Set(
                (
                  Array.isArray(
                    rawScenarios
                  )
                    ? rawScenarios
                    : [rawScenarios]
                )
                  .map(value =>
                    String(
                      value || ""
                    ).trim()
                  )
                  .filter(Boolean)
              )
            ];

            const odds =
              item?.odds ??
              aiTicket?.odds ??
              null;

            return {
              ticket,
              role,
              categories,
              scenarioTypes,

              rank:
                String(
                  item?.rank ||
                  aiTicket?.rank ||
                  ""
                ),

              score:
                Number(
                  item?.score ??
                  aiTicket?.score ??
                  0
                ),

              odds:
                odds === null ||
                odds === undefined ||
                odds === ""
                  ? null
                  : Number(odds),

              oddsValue:
                String(
                  item?.oddsValue ||
                  aiTicket?.oddsValue ||
                  ""
                ),

              isManshu:
                Boolean(
                  aiTicket?.isManshu
                ) ||
                Number(odds) >= 100
            };
          })
          .filter(
            item =>
              item.ticket
          );

      const oddsCaptured =
        ticketRanks.some(
          item =>
            Number.isFinite(
              Number(item.odds)
            ) &&
            Number(item.odds) > 0
        );

      const summarySource =
        prediction?.finalAi
          ?.summary ||
        prediction?.finalComment
          ?.comment ||
        prediction?.finalComment
          ?.title ||
        "";

      const summary =
        typeof summarySource ===
          "string"
          ? summarySource
          : "";
      const practicalSelection =
        ensurePracticalSelection(
          prediction
        );
      const compactMark =
        mark => ({
          boatNo:
            Number(
              mark?.boatNo ??
              mark?.number ??
              mark?.waku ??
              0
            ) || null,
          name:
            String(
              mark?.name ||
              mark?.playerName ||
              mark?.racerName ||
              ""
            ),
          score:
            Number(
              mark?.score ??
              mark?.total ??
              0
            )
        });
      const practicalTickets =
        (
          practicalSelection
            ?.tickets || []
        ).map(item => ({
          ticket:
            String(item?.ticket || ""),
          category:
            String(
              item?.category || ""
            ),
          displayCategory:
            String(
              item?.displayCategory ||
              item?.category ||
              ""
            ),
          comment:
            String(
              item?.comment || ""
            ),
          scenarioId:
            String(
              item?.scenarioId || ""
            ),
          scenarioTitle:
            String(
              item?.scenarioTitle || ""
            ),
          scenarioSummary:
            String(
              item?.scenarioSummary ||
              ""
            ),
          flowAnchor:
            String(
              item?.flowAnchor || ""
            ),
          flowCommonReason:
            String(
              item?.flowCommonReason ||
              ""
            ),
          flowSecondScore:
            Number.isFinite(
              Number(
                item?.flowSecondScore
              )
            )
              ? Number(
                  item.flowSecondScore
                )
              : null,
          flowThirdScore:
            Number.isFinite(
              Number(
                item?.flowThirdScore
              )
            )
              ? Number(
                  item.flowThirdScore
                )
              : null,
          flowRoleEvidence: [
            ...(item
              ?.flowRoleEvidence || [])
          ],
          selectionTier:
            String(
              item?.selectionTier || ""
            ),
          branchIds: [
            ...(item?.validBranchIds ||
              item?.branchIds ||
              [])
          ],
          requirementIds: [
            ...(item
              ?.validRequirementIds ||
              item
                ?.requirementIds ||
              [])
          ],
          evidenceReasons: [
            ...(item
              ?.evidenceReasons || [])
          ],
          roleLabels: [
            ...(item
              ?.roleLabels || [])
          ]
        }));
      const practicalSelectionAudit =
        practicalSelection
          ? window
              .ChappyPracticalSelection
              ?.compactAudit?.(
                practicalSelection
              ) ||
            null
          : null;

      const snapshot = {
        raceKey:
          `${params.date}-` +
          `${params.jcd}-` +
          `${params.rno}`,

        place: params.place,
        jcd: params.jcd,
        raceNo: params.rno,
        date: params.date,
        deadlineAt: String(
          prediction?.race?.deadlineAt ||
          prediction?.race?.deadline ||
          lastRaceData?.deadlineAt ||
          lastRaceData?.race?.deadlineAt ||
          ""
        ),

        predictionMode:
          prediction
            ?.predictionMode ||
          "pre_deadline",

        isRetrospective:
          Boolean(
            prediction
              ?.isRetrospective
          ),

        officialResultUsedForPrediction:
          false,

        oddsCaptured,

                summary,

        predictedScenarioTitle:
          String(
            prediction?.raceFlow?.title ||
            ""
          ),

        predictedScenarioSummary:
          String(
            prediction?.raceFlow?.summary ||
            ""
          ),

        predictedAttackBoat:
          Number(
            prediction?.raceFlow
              ?.attackBoats?.[0]
              ?.boatNo || 0
          ) || null,

        predictedAttackCourse:
          Number(
            prediction?.raceFlow
              ?.attackBoats?.[0]
              ?.course ||
            prediction?.raceFlow
              ?.attackBoats?.[0]
              ?.boatNo ||
            0
          ) || null,

        preRaceConditions:
          window.ChappyPredictionConditions?.capture
            ? window.ChappyPredictionConditions.capture(
                lastRaceData || {},
                prediction
              )
            : null,

        marks: {
          honmei:
            compactMark(
              prediction
                ?.mainSheet?.honmei
            ),
          taikou:
            compactMark(
              prediction
                ?.mainSheet?.taikou
            ),
          ana:
            compactMark(
              prediction
                ?.mainSheet?.ana
            ),
          osae:
            compactMark(
              prediction
                ?.mainSheet?.osae
            )
        },

        practicalTickets,

        practicalSelection:
          practicalSelectionAudit,

        verificationEvidence:
          practicalSelection
            ?.verificationEvidence ||
          null,

        internalEvaluation: {
          mode:
            String(
              prediction
                ?.simpleEvaluation
                ?.mode ||
              ""
            ),
          label:
            String(
              prediction
                ?.simpleEvaluation
                ?.label ||
              "AI評価"
            ),
          score:
            Number(
              prediction
                ?.simpleEvaluation
                ?.score ??
              prediction
                ?.confidence
                ?.score ??
              prediction
                ?.confidence ??
              0
            ) || 0,
          probability: false
        },

        ticketRanks
      };

      return storage
        .upsertPrediction(
          snapshot
        );

    } catch (storageError) {
      console.warn(
        "レース別予想の保存に失敗",
        storageError
      );

      return null;
    }
  }

  async function fetchWithTimeout(
    url,
    timeoutMs = ODDS_REQUEST_TIMEOUT_MS
  ) {
    const controller =
      typeof AbortController === "function"
        ? new AbortController()
        : null;
    const timer = controller
      ? setTimeout(
          () => controller.abort(),
          timeoutMs
        )
      : 0;

    try {
      return await fetch(
        url,
        controller
          ? { signal: controller.signal }
          : undefined
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(
          `API応答が${Math.round(timeoutMs / 1000)}秒を超えました`
        );
      }
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function fetchOddsData(
    params
  ) {
    const url =
      `https://chappy-boatrace-api.vercel.app/api/odds` +
      `?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;

    const response = await fetchWithTimeout(url);
    const oddsData = await response.json();

    if (
      !response.ok ||
      !oddsData ||
      oddsData.ok === false
    ) {
      throw new Error(
        oddsData?.error ||
        `オッズAPIエラー：${response.status}`
      );
    }

    return oddsData;
  }

  async function fetchOddsSupplement(
    params
  ) {
    let missingSettled = false;
    let missingData = null;
    const missingPromise =
      fetchMissingNumbers(params)
        .then(value => {
          missingSettled = true;
          missingData = value;
          return value;
        });
    const oddsPromise =
      fetchOddsData(params)
        .then(oddsData => ({
          oddsData,
          oddsError: null
        }))
        .catch(oddsError => {
          console.warn(
            "オッズの取得に失敗",
            oddsError?.message ||
              oddsError
          );

          return {
            oddsData: null,
            oddsError
          };
        });
    const oddsResult =
      await oddsPromise;

    return {
      ...oddsResult,
      missingData:
        missingSettled
          ? missingData
          : null,
      missingPromise
    };
  }

  async function fetchReviewOddsSupplement(
    params
  ) {
    try {
      const oddsData =
        await fetchOddsData(
          params
        );
      const normalizedOddsData =
        normalizeReviewOddsData(
          oddsData
        );

      return {
        oddsData:
          normalizedOddsData,
        oddsError: null,
        missingData: null
      };
    } catch (oddsError) {
      console.warn(
        "最終オッズの取得に失敗",
        oddsError?.message ||
          oddsError
      );

      return {
        oddsData: null,
        oddsError,
        missingData: null
      };
    }
  }

  function normalizeReviewOddsData(
    oddsData,
    retrievedAt =
      new Date().toISOString()
  ) {
    if (
      !oddsData ||
      typeof oddsData !== "object"
    ) {
      return oddsData;
    }

    return {
      ...oddsData,
      savedAt: String(
        oddsData.savedAt ||
        retrievedAt
      ),
      isFinalRetrievedOdds: true
    };
  }

  async function fetchMissingNumbers(
    params
  ) {
    try {
      const url =
        `https://chappy-boatrace-api.vercel.app/api/missing` +
        `?jcd=${encodeURIComponent(params.jcd)}` +
        `&scope=venue` +
        `&date=${encodeURIComponent(params.date)}`;

      const response = await fetchWithTimeout(url);
      const data = await response.json();

      if (
        !response.ok ||
        !data ||
        data.ok === false
      ) {
        throw new Error(
          data?.error ||
          `出てない目APIエラー：${response.status}`
        );
      }

      return data;
    } catch (error) {
      console.warn(
        "出てない目の取得に失敗",
        error?.message || error
      );

      return {
        ok: false,
        available: false,
        sampleSize: 0,
        missingNumbers: [],
        reason:
          "公式履歴の出てない目を取得できませんでした"
      };
    }
  }

  function buildMissingTop30(
    missingData,
    _byTicket
  ) {
    if (
      typeof window.ChappyOddsInsights
        ?.buildMissingTop30 ===
      "function"
    ) {
      return window.ChappyOddsInsights
        .buildMissingTop30(
          missingData,
          null,
          30
        );
    }

    const source =
      Array.isArray(
        missingData?.missingNumbers
      )
        ? missingData.missingNumbers
        : [];

    const rows = source
      .map(item => {
        const ticket = String(
          item?.ticket || ""
        );

        return {
          ...item,
          ticket
        };
      })
      .filter(item => {
        const boats = item.ticket
          .split("-")
          .map(Number);

        return (
          boats.length === 3 &&
          boats.every(boat =>
            Number.isInteger(boat) &&
            boat >= 1 &&
            boat <= 6
          ) &&
          new Set(boats).size === 3 &&
          Number(
            item.recentOccurrences || 0
          ) === 0
        );
      })
      .sort((a, b) => {
        return (
          Number(
            b.missingDays || 0
          ) -
            Number(
              a.missingDays || 0
            ) ||
          a.ticket.localeCompare(
            b.ticket
          )
        );
      })
      .slice(0, 30)
      .map((item, index) => ({
        ...item,
        rank: index + 1
      }));

    return {
      ...missingData,
      top30: rows,
      displayedCount: rows.length,
      sort:
        "zero-in-recent-30-days-then-missing-days"
    };
  }

  function attachCombinedOdds(
    prediction
  ) {
    if (
      typeof window.ChappyOddsInsights
        ?.buildCombinedOdds ===
      "function"
    ) {
      prediction.combinedOdds =
        window.ChappyOddsInsights
          .buildCombinedOdds(
            prediction
          );

      return;
    }

    prediction.combinedOdds = {
      source: "boatrace-official",
      formula:
        "1 / Σ(1 / 個別オッズ)",
      available: false,
      reason:
        "公式オッズ共通計算を読み込めませんでした"
    };
  }

  function enrichPredictionWithOdds(
    prediction,
    oddsData,
    missingData,
    params
  ) {
    if (
      !prediction ||
      typeof prediction !== "object" ||
      !oddsData ||
      typeof oddsData !== "object"
    ) {
      return prediction;
    }

    ensurePracticalSelection(
      prediction
    );

    const byTicket =
      oddsData.byTicket &&
      typeof oddsData.byTicket ===
        "object"
        ? oddsData.byTicket
        : {};
    const isFinalRetrievedOdds =
      oddsData
        .isFinalRetrievedOdds ===
      true;
    const oddsSource =
      String(
        oddsData.source ||
        ""
      );
    const oddsSavedAt =
      String(
        oddsData.savedAt ||
        ""
      );
    const oddsHistoryKey =
      `chappy_odds_history_` +
      `${params.date}_` +
      `${params.jcd}_` +
      `${params.rno}`;
    let previousByTicket = {};

    try {
      const previousRaw =
        localStorage.getItem(
          oddsHistoryKey
        );

      if (previousRaw) {
        const previousData =
          JSON.parse(previousRaw);

        previousByTicket =
          previousData?.byTicket ||
          previousData ||
          {};
      }
    } catch (historyError) {
      console.warn(
        "前回オッズの読み込みに失敗",
        historyError
      );
    }

    prediction.oddsMovements =
      Object.entries(byTicket)
        .map(
          ([
            ticket,
            currentRaw
          ]) => {
            const currentOdds =
              Number(currentRaw);
            const previousOdds =
              Number(
                previousByTicket[
                  ticket
                ]
              );

            if (
              !Number.isFinite(
                currentOdds
              ) ||
              !Number.isFinite(
                previousOdds
              ) ||
              currentOdds <= 0 ||
              previousOdds <= 0
            ) {
              return null;
            }

            const changeRate =
              (
                (
                  currentOdds -
                  previousOdds
                ) /
                previousOdds
              ) * 100;

            if (
              Math.abs(changeRate) <
              20
            ) {
              return null;
            }

            return {
              ticket,
              previousOdds,
              currentOdds,
              changeRate,
              direction:
                changeRate < 0
                  ? "急落"
                  : "上昇"
            };
          }
        )
        .filter(Boolean)
        .sort(
          (a, b) =>
            Math.abs(
              b.changeRate
            ) -
            Math.abs(
              a.changeRate
            )
        )
        .slice(0, 10);

    try {
      localStorage.setItem(
        oddsHistoryKey,
        JSON.stringify({
          savedAt:
            new Date()
              .toISOString(),
          byTicket
        })
      );
    } catch (historyError) {
      console.warn(
        "今回オッズの保存に失敗",
        historyError
      );
    }

    const attachOdds =
      list =>
        Array.isArray(list)
          ? list.map(item => {
              const ticket =
                String(
                  item?.ticket ||
                  ""
                );
              const numericOdds =
                Number(
                  byTicket[ticket]
                );

              if (
                !ticket
              ) {
                return item;
              }

              if (
                !Number.isFinite(
                  numericOdds
                ) ||
                numericOdds <= 0
              ) {
                return {
                  ...item,
                  odds: null,
                  oddsText:
                    "オッズ未取得",
                  hasOdds: false,
                  isManshu: false,
                  oddsValue: "未取得",
                  oddsSource: "",
                  oddsSavedAt: "",
                  isFinalRetrievedOdds:
                    false
                };
              }

              const aiScore =
                Number(
                  item?.score || 0
                );
              let oddsValue =
                "標準";

              if (
                aiScore < 65 &&
                numericOdds >= 10
              ) {
                oddsValue =
                  "高配当注意";
              } else if (
                aiScore >= 65 &&
                numericOdds >= 100
              ) {
                oddsValue =
                  "大穴妙味";
              } else if (
                aiScore >= 65 &&
                numericOdds >= 30
              ) {
                oddsValue =
                  "穴妙味";
              } else if (
                aiScore >= 75 &&
                numericOdds >= 10
              ) {
                oddsValue =
                  "妙味あり";
              } else if (
                numericOdds < 5
              ) {
                oddsValue =
                  "低配当";
              }

              return {
                ...item,
                odds: numericOdds,
                oddsText:
                  `${numericOdds}倍` +
                  (
                    isFinalRetrievedOdds
                      ? "（最終取得）"
                      : ""
                  ),
                hasOdds: true,
                isManshu:
                  numericOdds >= 100,
                oddsValue,
                oddsSource,
                oddsSavedAt,
                isFinalRetrievedOdds
              };
            })
          : [];

    prediction.ticketRanks =
      attachOdds(
        prediction.ticketRanks
      );
    prediction.aiTicketList =
      attachOdds(
        prediction.aiTicketList
      );

    if (prediction.ticketSheets) {
      prediction.ticketSheets = {
        ...prediction.ticketSheets,
        main:
          attachOdds(
            prediction
              .ticketSheets.main
          ),
        cover:
          attachOdds(
            prediction
              .ticketSheets.cover
          ),
        flow:
          attachOdds(
            prediction
              .ticketSheets.flow
          ),
        hole:
          attachOdds(
            prediction
              .ticketSheets.hole
          ),
        all:
          attachOdds(
            prediction
              .ticketSheets.all
          )
      };
    }

    if (prediction.mainSheet) {
      prediction.mainSheet = {
        ...prediction.mainSheet,
        tickets:
          attachOdds(
            prediction
              .mainSheet.tickets
          ),
        coverTickets:
          attachOdds(
            prediction
              .mainSheet
              .coverTickets
          ),
        flowTickets:
          attachOdds(
            prediction
              .mainSheet
              .flowTickets
          )
      };
    }

    if (prediction.manshuSheet) {
      prediction.manshuSheet = {
        ...prediction.manshuSheet,
        tickets:
          attachOdds(
            prediction
              .manshuSheet.tickets
          )
      };
    }

    if (
      prediction.aiCore &&
      typeof prediction.aiCore ===
        "object"
    ) {
      prediction.aiCore = {
        ...prediction.aiCore,
        ...(prediction.mainSheet
          ? {
              mainSheet:
                prediction.mainSheet
            }
          : {}),
        ...(prediction.manshuSheet
          ? {
              manshuSheet:
                prediction.manshuSheet
            }
          : {})
      };
    }

    if (prediction.finalAi) {
      prediction.finalAi = {
        ...prediction.finalAi,
        ticketRanks:
          attachOdds(
            prediction
              .finalAi.ticketRanks
          ),
        topTickets:
          attachOdds(
            prediction
              .finalAi.topTickets
          ),
        manshuTickets:
          attachOdds(
            prediction
              .finalAi
              .manshuTickets
          )
      };
    }

    if (
      Array.isArray(
        prediction.practicalTickets
      )
    ) {
      prediction.practicalTickets =
        attachOdds(
          prediction.practicalTickets
        );
    }

    if (
      prediction.practicalSelection &&
      typeof prediction
        .practicalSelection ===
        "object"
    ) {
      prediction.practicalSelection = {
        ...prediction
          .practicalSelection,
        tickets:
          attachOdds(
            prediction
              .practicalSelection
              .tickets
          )
      };
    }

    if (isFinalRetrievedOdds) {
      prediction.finalOddsDisplay = {
        available: true,
        label: "最終取得オッズ",
        source: oddsSource,
        savedAt: oddsSavedAt,
        isFinalRetrievedOdds: true
      };
    }

    prediction.missingNumbersData =
      buildMissingTop30(
        missingData
      );

    attachCombinedOdds(
      prediction
    );

    return prediction;
  }

  function hasUsableOddsData(
    oddsData
  ) {
    if (
      !oddsData ||
      oddsData.available === false ||
      !oddsData.byTicket ||
      typeof oddsData.byTicket !== "object"
    ) {
      return false;
    }

    return Object.values(
      oddsData.byTicket
    ).some(value => {
      const odds = Number(value);
      return Number.isFinite(odds) && odds > 0;
    });
  }

  function applyOddsSupplement({
    oddsSupplement,
    prediction,
    params,
    isCurrentRequest
  }) {
    if (
      !isCurrentRequest() ||
      lastPrediction !== prediction
    ) {
      return false;
    }

    const oddsData =
      oddsSupplement?.oddsData;

    if (!hasUsableOddsData(oddsData)) {
      if (oddsSupplement?.missingData) {
        applyMissingSupplement({
          missingData:
            oddsSupplement.missingData,
          oddsData,
          prediction,
          params,
          isCurrentRequest
        });
      } else if (
        oddsSupplement?.missingPromise
      ) {
        void oddsSupplement.missingPromise
          .then(missingData =>
            applyMissingSupplement({
              missingData,
              oddsData,
              prediction,
              params,
              isCurrentRequest
            })
          )
          .catch(error => {
            console.warn(
              "出てない目の後追い反映に失敗",
              error?.message || error
            );
          });
      }

      const failed = Boolean(
        oddsSupplement?.oddsError
      );
      updateStatus(
        failed
          ? "予想を表示しました（オッズは取得できませんでした）"
          : "予想を表示しました（オッズは発売前・未更新です）"
      );
      updatePredictionOddsStatus(
        failed
          ? "オッズ取得失敗"
          : "オッズ発売前",
        failed ? "error" : "pending"
      );
      return false;
    }

    try {
      lastRaceData = {
        ...lastRaceData,
        odds: oddsData
      };
      enrichPredictionWithOdds(
        prediction,
        oddsData,
        oddsSupplement?.missingData,
        params
      );
    } catch (oddsError) {
      console.warn(
        "オッズ情報の付加に失敗",
        oddsError?.message || oddsError
      );
      updateStatus(
        "予想を表示しました（オッズ反映に失敗しました）"
      );
      updatePredictionOddsStatus(
        "オッズ反映失敗",
        "error"
      );
      return false;
    }

    if (
      !isCurrentRequest() ||
      lastPrediction !== prediction
    ) {
      return false;
    }

    savePredictionSnapshot(
      params,
      prediction
    );

    if (
      typeof window.renderAll ===
      "function"
    ) {
      window.renderAll(prediction);
    }

    if (
      !oddsSupplement?.missingData &&
      oddsSupplement?.missingPromise
    ) {
      void oddsSupplement.missingPromise
        .then(missingData =>
          applyMissingSupplement({
            missingData,
            oddsData,
            prediction,
            params,
            isCurrentRequest
          })
        )
        .catch(error => {
          console.warn(
            "出てない目の後追い反映に失敗",
            error?.message || error
          );
        });
    }

    updateStatus(
      `取得完了（オッズ${Number(oddsData.count || 0)}通り反映）`
    );
    updatePredictionOddsStatus(
      "オッズ反映済み",
      "ready"
    );
    return true;
  }

  function applyReviewOddsSupplement({
    oddsSupplement,
    prediction,
    params,
    isCurrentRequest
  }) {
    if (
      !isCurrentRequest() ||
      lastPrediction !== prediction
    ) {
      return false;
    }

    const oddsData =
      oddsSupplement?.oddsData;

    if (!hasUsableOddsData(oddsData)) {
      const finalOddsDisplay =
        window.ChappyFinalOddsDisplay;
      const fallbackPrediction =
        finalOddsDisplay &&
        typeof finalOddsDisplay
          .prepare === "function"
          ? finalOddsDisplay
              .prepare(prediction)
          : prediction;
      const hasStoredSnapshot =
        fallbackPrediction !==
          prediction &&
        fallbackPrediction
          ?.finalOddsDisplay
          ?.available === true;
      updatePredictionOddsStatus(
        hasStoredSnapshot
          ? "端末保存の最終オッズを表示"
          : oddsSupplement?.oddsError
            ? "最終オッズ取得失敗"
            : "最終オッズ未取得",
        hasStoredSnapshot
          ? "ready"
          : oddsSupplement?.oddsError
            ? "error"
            : "pending"
      );
      return false;
    }

    try {
      lastRaceData = {
        ...lastRaceData,
        odds: oddsData
      };
      enrichPredictionWithOdds(
        prediction,
        oddsData,
        null,
        params
      );
    } catch (oddsError) {
      console.warn(
        "最終オッズ情報の付加に失敗",
        oddsError?.message ||
          oddsError
      );
      updatePredictionOddsStatus(
        "最終オッズ反映失敗",
        "error"
      );
      return false;
    }

    if (
      !isCurrentRequest() ||
      lastPrediction !== prediction
    ) {
      return false;
    }

      if (
        typeof window.renderAll ===
          "function"
      ) {
        window.renderAll(
          prediction
        );
    }

    updatePredictionOddsStatus(
      "最終オッズ反映済み",
      "ready"
    );
    return true;
  }

  function applyMissingSupplement({
    missingData,
    oddsData,
    prediction,
    params,
    isCurrentRequest
  }) {
    if (
      !isCurrentRequest() ||
      lastPrediction !== prediction
    ) {
      return false;
    }

    prediction.missingNumbersData =
      buildMissingTop30(
        missingData
      );

    savePredictionSnapshot(
      params,
      prediction
    );

    if (
      typeof window
        .updateMissingNumbersSection ===
        "function"
    ) {
      window.updateMissingNumbersSection(
        prediction
      );
    }

    return true;
  }

  async function refreshOddsOnly() {
    if (
      getRaceMode() ===
      "review"
    ) {
      updateStatus(
        "振り返り予想は参考表示のため、オッズ更新・予想保存を行いません"
      );

      return false;
    }

    if (
      !lastRaceData ||
      !lastPrediction
    ) {
      updateStatus(
        "先に出走表を取得してください"
      );

      return false;
    }

    const requestGeneration =
      ++predictionGeneration;
    const isCurrentRequest = () =>
      requestGeneration ===
      predictionGeneration;

    try {
      clearErrorArea();
      updateStatus(
        "オッズ取得中..."
      );
      updatePredictionOddsStatus(
        "オッズ取得中…",
        "loading"
      );

      const params =
        getRaceParams();
      const [
        oddsData,
        missingData
      ] = await Promise.all([
        fetchOddsData(params),
        fetchMissingNumbers(params)
      ]);

      if (!isCurrentRequest()) {
        return false;
      }

      lastRaceData = {
        ...lastRaceData,
        odds: oddsData
      };

      const prediction =
        enrichPredictionWithOdds(
          lastPrediction,
          oddsData,
          missingData,
          params
        );

      if (!isCurrentRequest()) {
        return false;
      }

      savePredictionSnapshot(
        params,
        prediction
      );

      if (
        typeof window.renderAll ===
        "function"
      ) {
        window.renderAll(
          prediction
        );
      }

      updateStatus(
        `オッズ更新完了（` +
        `${oddsData.count || 0}通り）`
      );
      updatePredictionOddsStatus(
        "オッズ反映済み",
        "ready"
      );

      return true;
    } catch (error) {
      if (!isCurrentRequest()) {
        return false;
      }

      console.warn(
        "オッズ更新エラー",
        error?.message || error
      );
      updateStatus(
        "予想はそのまま表示しています（オッズ更新に失敗しました）"
      );
      updatePredictionOddsStatus(
        "オッズ取得失敗",
        "error"
      );

      return false;
    }
  }

  function updateStatus(message) {
    const el = document.getElementById("statusArea");
    if (el) el.textContent = message;
  }

  function updatePredictionOddsStatus(
    message,
    state = ""
  ) {
    const el = document.getElementById(
      "predictionOddsStatus"
    );
    if (!el) return;
    el.textContent = String(message || "");
    if (state) el.dataset.state = state;
    else delete el.dataset.state;
  }

  function showError(message) {
    const el = document.getElementById("errorArea");
    if (!el) return;

    el.innerHTML = `
      <div class="panel error-panel">
        <h2>⚠️ エラー</h2>
        <p>${escapeHTML(message)}</p>
      </div>
    `;
  }

  function clearErrorArea() {
    const el = document.getElementById("errorArea");
    if (el) el.innerHTML = "";
  }

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function loadStatsSafe() {
    try {
      if (typeof window.getStats === "function") {
        return window.getStats();
      }

      const raw = localStorage.getItem("chappy_stats");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function loadHistorySafe() {
    try {
      if (typeof window.getRaceHistory === "function") {
        return window.getRaceHistory();
      }

      const raw = localStorage.getItem("chappy_history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }
  /* ===============================
    note投稿アシスト接続
  =============================== */

  let lastNotePrediction = null;
  let lastNoteArticle = null;

  function setupNoteAssistant() {
    const generateBtn =
      document.getElementById(
        "noteGenerateBtn"
      );

    const copyTitleBtn =
      document.getElementById(
        "noteCopyTitleBtn"
      );

    const copyFullBtn =
      document.getElementById(
        "noteCopyFullBtn"
      );

    if (
      generateBtn &&
      generateBtn.dataset
        .chappyNoteControlBound !==
        "true"
    ) {
      generateBtn.dataset
        .chappyNoteControlBound =
        "true";
      generateBtn.addEventListener(
        "click",
        generateNoteArticle
      );
    }

    if (
      copyTitleBtn &&
      copyTitleBtn.dataset
        .chappyNoteControlBound !==
        "true"
    ) {
      copyTitleBtn.dataset
        .chappyNoteControlBound =
        "true";
      copyTitleBtn.addEventListener(
        "click",
        () => copyNoteText(
          lastNoteArticle?.title || "",
          "タイトルをコピーしました"
        )
      );
    }

    if (
      copyFullBtn &&
      copyFullBtn.dataset
        .chappyNoteControlBound !==
        "true"
    ) {
      copyFullBtn.dataset
        .chappyNoteControlBound =
        "true";
      copyFullBtn.addEventListener(
        "click",
        () => copyNoteText(
          lastNoteArticle?.fullText || "",
          "記事全文をコピーしました"
        )
      );
    }
  }

  function updateNoteAssistant(
    prediction
  ) {
    const section =
      document.getElementById(
        "noteAssistantSection"
      );

    const generateBtn =
      document.getElementById(
        "noteGenerateBtn"
      );

    const copyTitleBtn =
      document.getElementById(
        "noteCopyTitleBtn"
      );

    const copyFullBtn =
      document.getElementById(
        "noteCopyFullBtn"
      );

    const titlePreview =
      document.getElementById(
        "noteTitlePreview"
      );

    const articlePreview =
      document.getElementById(
        "noteArticlePreview"
      );

    if (!section) return;

    if (
      !prediction ||
      typeof prediction !== "object" ||
      prediction.isRetrospective ||
      prediction.ok === false
    ) {
      section.hidden = true;
      lastNotePrediction = null;
      lastNoteArticle = null;
      return;
    }

    section.hidden = false;
    lastNotePrediction = prediction;
    lastNoteArticle = null;

    if (titlePreview) {
      titlePreview.value = "";
    }

    if (articlePreview) {
      articlePreview.value = "";
    }

    if (copyTitleBtn) {
      copyTitleBtn.disabled = true;
    }

    if (copyFullBtn) {
      copyFullBtn.disabled = true;
    }

    const generatorReady =
      window.ChappyNoteGenerator &&
      typeof window
        .ChappyNoteGenerator
        .generateArticle ===
        "function";

    if (generateBtn) {
      generateBtn.disabled =
        !generatorReady;
    }

    setNoteStatus(
      generatorReady
        ? "記事生成できます"
        : "生成機能を読み込めません"
    );
  }

  function generateNoteArticle() {
    if (!lastNotePrediction) {
      setNoteStatus(
        "先にAI予想を表示してください"
      );

      return;
    }

    try {
            const deadlineText =
        document.querySelector(
          ".official-race-button.is-selected .official-race-time"
        )
          ?.textContent
          ?.trim() || "";

      const deadlineMatch =
        deadlineText.match(
          /[0-2]?\d:[0-5]\d/
        );

      const predictionForNote = {
        ...lastNotePrediction,

        race: {
          ...(
            lastNotePrediction
              .race || {}
          ),

          raceInfo: {
            ...(
              lastNotePrediction
                .race
                ?.raceInfo || {}
            ),

            deadline:
              deadlineMatch
                ? deadlineMatch[0]
                : ""
          }
        }
      };

      const article =
        window.ChappyNoteGenerator
          .generateArticle(
            predictionForNote
          );

      if (!article?.ok) {
        throw new Error(
          article?.error ||
          "記事を生成できませんでした"
        );
      }

      lastNoteArticle = article;

      const titlePreview =
        document.getElementById(
          "noteTitlePreview"
        );

      const articlePreview =
        document.getElementById(
          "noteArticlePreview"
        );

      const copyTitleBtn =
        document.getElementById(
          "noteCopyTitleBtn"
        );

      const copyFullBtn =
        document.getElementById(
          "noteCopyFullBtn"
        );

      if (titlePreview) {
        titlePreview.value =
          article.title;
      }

      if (articlePreview) {
        articlePreview.value =
          article.fullText;
      }

      if (copyTitleBtn) {
        copyTitleBtn.disabled = false;
      }

      if (copyFullBtn) {
        copyFullBtn.disabled = false;
      }

      setNoteStatus(
        `記事生成済み・実戦${article.practicalTickets.length}点`
      );
    } catch (error) {
      console.error(
        "note記事生成エラー",
        error
      );

      setNoteStatus(
        error?.message ||
        "記事生成エラー"
      );
    }
  }

  async function copyNoteText(
    text,
    successMessage
  ) {
    if (!text) {
      setNoteStatus(
        "先に記事を生成してください"
      );

      return;
    }

    try {
      if (
        navigator.clipboard &&
        window.isSecureContext
      ) {
        await navigator.clipboard
          .writeText(text);
      } else {
        const temporary =
          document.createElement(
            "textarea"
          );

        temporary.value = text;

        temporary.setAttribute(
          "readonly",
          ""
        );

        temporary.style.position =
          "fixed";

        temporary.style.opacity =
          "0";

        document.body.appendChild(
          temporary
        );

        temporary.select();

        document.execCommand(
          "copy"
        );

        temporary.remove();
      }

      setNoteStatus(
        successMessage
      );
    } catch (error) {
      console.error(
        "noteコピーエラー",
        error
      );

      setNoteStatus(
        "コピーできませんでした"
      );
    }
  }

  function setNoteStatus(message) {
    const badge =
      document.getElementById(
        "noteStatusBadge"
      );

    if (badge) {
      badge.textContent = message;
    }
  }

  if (
    document.readyState ===
      "loading"
  ) {
    window.addEventListener(
      "DOMContentLoaded",
      setupNoteAssistant,
      { once: true }
    );
  } else {
    setupNoteAssistant();
  }

  const originalRenderAll =
    window.renderAll;

  if (
    typeof originalRenderAll ===
    "function" &&
    !originalRenderAll
      .noteAssistantWrapped
  ) {
    const wrappedRenderAll =
      function (prediction) {
        const result =
          originalRenderAll.apply(
            this,
            arguments
          );

        updateNoteAssistant(
          prediction
        );

        return result;
      };

    wrappedRenderAll
      .noteAssistantWrapped = true;

    window.renderAll =
      wrappedRenderAll;
  }
})();
