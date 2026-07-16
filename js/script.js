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

    document.addEventListener("DOMContentLoaded", () => {
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

    if (fetchBtn) {
      fetchBtn.addEventListener(
        "click",
        fetchAndRenderRace
      );
    }

    if (reloadBtn) {
      reloadBtn.addEventListener(
        "click",
        fetchAndRenderRace
      );
    }

    if (oddsBtn) {
      oddsBtn.addEventListener(
        "click",
        refreshOddsOnly
      );
    }

    if (modeSelect) {
      modeSelect.addEventListener(
        "change",
        applyRaceMode
      );
    }

    applyRaceMode();
  });

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

    async function applyRaceMode() {
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
        lastRaceData = null;

        clearReviewResult();

        const resultArea =
          document.getElementById(
            "resultArea"
          );

        if (resultArea) {
          resultArea.innerHTML = "";
        }

        const todayItems = [
          {
            id: "todayMainPick",
            main: "解析待ち",
            sub: "総合指数上位"
          },
          {
            id: "todayManshuPick",
            main: "解析待ち",
            sub: "妙味・展開候補"
          },
          {
            id: "todayWaterCondition",
            main: "確認待ち",
            sub: "風・波・潮汐"
          },
          {
            id: "todayAiJudge",
            main: "解析待ち",
            sub: "買い／見送り判断"
          }
        ];

        todayItems.forEach(item => {
          const element =
            document.getElementById(
              item.id
            );

          if (!element) {
            return;
          }

          element.textContent =
            item.main;

          if (
            element.nextElementSibling
          ) {
            element
              .nextElementSibling
              .textContent =
              item.sub;
          }
        });

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

    try {
      await loadVenueChoices();
    } catch (error) {
      handleRaceSelectionError(
        error
      );
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
    let url =
      `/api/schedule` +
      `?date=${encodeURIComponent(
        date
      )}`;

    if (jcd) {
      url +=
        `&jcd=${encodeURIComponent(
          jcd
        )}`;
    }

    const response =
      await fetch(url);

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
        if (!officialLink) {
          return;
        }

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

        if (linkDescription) {
          linkDescription.textContent =
            `${placeSelect.value} ` +
            `${raceNo}Rを` +
            "公式サイトで確認";
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

      button.append(
        number,
        time
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
  }

  async function loadVenueChoices() {
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

    const preferredJcd =
      mode === "live"
        ? String(
            data.nextRace?.jcd ||
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

    if (fetchBtn) {
      fetchBtn.disabled =
        false;
    }

    await loadRaceChoices(
      mode === "live"
        ? Number(
            data.nextRace?.raceNo ||
            0
          )
        : 0
    );
  }

  async function loadRaceChoices(
    preferredRaceNo = 0
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

    const allRaces =
      Array.isArray(
        data.selectedVenue?.races
      )
        ? data.selectedVenue.races
        : [];

    const races =
      allRaces.filter(
        race =>
          mode === "live"
            ? race.selectable
            : (
                race.status ===
                "closed"
              )
      );

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

      return;
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

    async function fetchAndRenderRace() {
    try {
      clearErrorArea();

      updateStatus(
        "取得中..."
      );

      const params =
        getRaceParams();

      const mode =
        getRaceMode();

      const isReview =
        mode === "review";

      if (!isReview) {
        await verifyLiveDeadline(
          params
        );

        clearReviewResult();
      }

      console.log(
        "🚤 race params",
        params
      );

      const data =
        await fetchRaceData(
          params
        );

      lastRaceData =
        data;

      console.log(
        "✅ API成功 entries=",
        data?.entries?.length || 0,
        data
      );

      const prediction =
        createPredictionSafe(
          data
        ) ||
        createEmergencyPrediction(
          data
        );

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

      createTheorySafe(data);
      createAISafe(data);

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

      if (
        typeof window.renderAll ===
        "function"
      ) {
        window.renderAll(
          prediction
        );
      } else {
        throw new Error(
          "renderAll() が見つかりません。render.jsを確認してください。"
        );
      }

      if (isReview) {
        updateStatus(
          "予想完了・公式結果を取得中..."
        );

        try {
          const officialResult =
            await fetchOfficialResult(
              params
            );

          renderReviewResult(
            officialResult,
            params
          );

          updateStatus(
            officialResult
              .resultAvailable
              ? "振り返り予想と公式結果を表示しました"
              : "振り返り予想を表示しました。公式結果は未確定です"
          );
        } catch (
          resultError
        ) {
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
        updateStatus(
          "取得完了"
        );
      }
    } catch (error) {
      console.error(
        "❌ fetchAndRenderRace error",
        error
      );

      updateStatus(
        "エラー"
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

    if (
      !selectedRace?.selectable
    ) {
      await loadVenueChoices();

      throw new Error(
        "選択したレースは締切を過ぎました。次の締切前レースを選び直しました。"
      );
    }
  }

  async function fetchOfficialResult(
    params
  ) {
    const url =
      `/api/result` +
      `?date=${encodeURIComponent(
        params.date
      )}` +
      `&jcd=${encodeURIComponent(
        params.jcd
      )}` +
      `&rno=${encodeURIComponent(
        params.rno
      )}`;

    const response =
      await fetch(url);

    const result =
      await response.json();

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

    return result;
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
      `/api/race?jcd=${encodeURIComponent(params.jcd)}` +
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

    async function refreshOddsOnly() {
    if (
      getRaceMode() ===
      "review"
    ) {
      updateStatus(
        "振り返り予想は参考表示のため、オッズ更新・予想保存を行いません"
      );

      return;
    }
  if (!lastRaceData) {
    updateStatus(
      "先に出走表を取得してください"
    );
    return;
  }

  try {
    clearErrorArea();
    updateStatus("オッズ取得中...");

    const params = getRaceParams();

    const url =
      `/api/odds` +
      `?jcd=${encodeURIComponent(params.jcd)}` +
      `&rno=${encodeURIComponent(params.rno)}` +
      `&date=${encodeURIComponent(params.date)}`;

    const response = await fetch(url);
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

    lastRaceData = {
      ...lastRaceData,
      odds: oddsData
    };

    const prediction =
      createPredictionSafe(lastRaceData);

    if (
      !prediction ||
      typeof prediction !== "object"
    ) {
      throw new Error(
        "予想データを再作成できませんでした"
      );
    }

        const byTicket =
      oddsData.byTicket || {};

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

    const oddsMovements =
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

    prediction.oddsMovements =
      oddsMovements;

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

    const attachOdds = list =>
  Array.isArray(list)
    ? list.map(item => {
        const odds =
          byTicket[item?.ticket];

        if (
          odds === undefined ||
          odds === null
        ) {
          return item;
        }

        const numericOdds =
          Number(odds);

        const aiScore =
          Number(item?.score || 0);

        let oddsValue = "標準";

        if (
          aiScore < 65 &&
          numericOdds >= 10
        ) {
          oddsValue = "高配当注意";
        } else if (
          aiScore >= 65 &&
          numericOdds >= 100
        ) {
          oddsValue = "大穴妙味";
        } else if (
          aiScore >= 65 &&
          numericOdds >= 30
        ) {
          oddsValue = "穴妙味";
        } else if (
          aiScore >= 75 &&
          numericOdds >= 10
        ) {
          oddsValue = "妙味あり";
        } else if (
          numericOdds < 5
        ) {
          oddsValue = "低配当";
        }

        return {
          ...item,
          odds: numericOdds,
          oddsValue
        };
      })
    : [];

        const ticketRanksWithOdds =
      attachOdds(
        prediction.ticketRanks
      );

    const budgetInput =
      document.getElementById(
        "allocationBudgetInput"
      );

    const requestedBudget =
      Number(
        budgetInput?.value || 1000
      );

    const totalBudget =
      Math.max(
        100,
        Math.floor(
          (
            Number.isFinite(
              requestedBudget
            )
              ? requestedBudget
              : 1000
          ) / 100
        ) * 100
      );

    const valueMultiplier = {
      低配当: 0.55,
      標準: 0.9,
      妙味あり: 1.2,
      穴妙味: 1.1,
      大穴妙味: 0.8,
      高配当注意: 0.4,
      未判定: 0.7
    };

    const weightedTickets =
      ticketRanksWithOdds.map(
        (item, index) => {
          const score =
            Math.max(
              1,
              Number(
                item?.score || 1
              )
            );

          const multiplier =
            valueMultiplier[
              item?.oddsValue
            ] ?? 0.8;

          return {
            ticket:
              String(
                item?.ticket || ""
              ),
            index,
            weight:
              score * multiplier
          };
        }
      );

    const totalWeight =
      weightedTickets.reduce(
        (sum, item) =>
          sum + item.weight,
        0
      );

    const budgetUnits =
      Math.floor(
        totalBudget / 100
      );

    const allocationRows =
      weightedTickets.map(item => {
        const exactUnits =
          totalWeight > 0
            ? (
                budgetUnits *
                item.weight
              ) / totalWeight
            : 0;

        const units =
          Math.floor(exactUnits);

        return {
          ...item,
          units,
          remainder:
            exactUnits - units
        };
      });

    const usedUnits =
      allocationRows.reduce(
        (sum, item) =>
          sum + item.units,
        0
      );

    const remainingUnits =
      budgetUnits - usedUnits;

    allocationRows.sort(
      (a, b) =>
        b.remainder -
          a.remainder ||
        a.index - b.index
    );

    for (
      let index = 0;
      index < remainingUnits;
      index += 1
    ) {
      if (!allocationRows.length) {
        break;
      }

      allocationRows[
        index %
        allocationRows.length
      ].units += 1;
    }

    const allocationByTicket =
      new Map(
        allocationRows.map(
          item => [
            item.ticket,
            item.units * 100
          ]
        )
      );

    const applyAllocation =
      list =>
        attachOdds(list).map(
          item => ({
            ...item,
            recommendedAmount:
              allocationByTicket.get(
                String(
                  item?.ticket || ""
                )
              ) || 0
          })
        );

        prediction.ticketRanks =
      applyAllocation(
        prediction.ticketRanks
      );

    prediction.aiTicketList =
      applyAllocation(
        prediction.aiTicketList
      );

    if (prediction.ticketSheets) {
      prediction.ticketSheets = {
        ...prediction.ticketSheets,

        main: applyAllocation(
          prediction.ticketSheets.main
        ),

        cover: applyAllocation(
          prediction.ticketSheets.cover
        ),

        flow: applyAllocation(
          prediction.ticketSheets.flow
        ),

        hole: applyAllocation(
          prediction.ticketSheets.hole
        ),

        all: applyAllocation(
          prediction.ticketSheets.all
        )
      };
    }

    if (prediction.mainSheet) {
      prediction.mainSheet = {
        ...prediction.mainSheet,

        tickets: applyAllocation(
          prediction.mainSheet.tickets
        ),

        coverTickets: applyAllocation(
          prediction.mainSheet.coverTickets
        ),

        flowTickets: applyAllocation(
          prediction.mainSheet.flowTickets
        )
      };
    }

    if (prediction.manshuSheet) {
      prediction.manshuSheet = {
        ...prediction.manshuSheet,

        tickets: applyAllocation(
          prediction.manshuSheet.tickets
        )
      };
    }

    prediction.allocationBudget =
      totalBudget;

    prediction.allocatedTotal =
      prediction.ticketRanks.reduce(
        (sum, item) =>
          sum +
          Number(
            item?.recommendedAmount ||
            0
          ),
        0
      );

    if (prediction.finalAi) {
      prediction.finalAi = {
        ...prediction.finalAi,
        ticketRanks:
          applyAllocation(
            prediction.finalAi
              .ticketRanks
          ),
        topTickets:
          applyAllocation(
            prediction.finalAi
              .topTickets
          ),
        manshuTickets:
          applyAllocation(
            prediction.finalAi
              .manshuTickets
          )
      };
    }

        try {
      const predictionSnapshot = {
        raceKey:
          `${params.date}-` +
          `${params.jcd}-` +
          `${params.rno}`,
        place: params.place,
        jcd: params.jcd,
        raceNo: params.rno,
                date: params.date,

        predictionMode:
          "pre_deadline",

        isRetrospective:
          false,

        officialResultUsedForPrediction:
          false,
        savedAt:
          new Date().toISOString(),
        ticketRanks:
          Array.isArray(
            prediction.ticketRanks
          )
                        ? prediction.ticketRanks.map(
                item => {
                  const ticket =
                    String(
                      item?.ticket || ""
                    );

                  const aiTicket =
                    Array.isArray(
                      prediction.aiTicketList
                    )
                      ? prediction.aiTicketList.find(
                          row =>
                            String(
                              row?.ticket || ""
                            ) === ticket
                        )
                      : null;

                  const rawCategories =
                    aiTicket?.categories ||
                    aiTicket?.category ||
                    item?.type ||
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
                        .map(value => {
                          const category =
                            String(
                              value || ""
                            );

                          if (
                            category === "本線"
                          ) {
                            return "本命";
                          }

                          if (
                            category === "万舟" ||
                            category === "穴候補"
                          ) {
                            return "穴・万舟候補";
                          }

                          return category;
                        })
                        .filter(Boolean)
                    )
                  ];

                  const role =
                    [
                      "本命",
                      "押さえ",
                      "流し",
                      "穴・万舟候補"
                    ].find(value =>
                      categories.includes(
                        value
                      )
                    ) || "分類未保存";

                  const rawScenarios =
                    aiTicket?.scenarioTypes ||
                    aiTicket?.scenarioType ||
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
                          )
                        )
                        .filter(Boolean)
                    )
                  ];

                  return {
                    ticket,
                    role,
                    categories,
                    scenarioTypes,

                    rank:
                      String(
                        item?.rank || ""
                      ),

                    score:
                      Number(
                        item?.score || 0
                      ),

                    odds:
                      item?.odds ?? null,

                    oddsValue:
                      String(
                        item?.oddsValue || ""
                      ),

                    recommendedAmount:
                      Number(
                        item?.recommendedAmount ||
                        0
                      )
                  };
                }
              )
            : []
      };

      localStorage.setItem(
        "chappy_latest_prediction_v1",
        JSON.stringify(
          predictionSnapshot
        )
      );
    } catch (storageError) {
      console.warn(
        "予想履歴の一時保存に失敗",
        storageError
      );
    }

    if (
      typeof window.renderAll ===
      "function"
    ) {
      window.renderAll(prediction);
    }

    updateStatus(
      `オッズ更新完了（` +
      `${oddsData.count || 0}通り）`
    );
  } catch (error) {
    console.error(error);

    updateStatus(
      "オッズ更新エラー"
    );

    showError(
      error?.message ||
      "オッズ更新に失敗しました"
    );
  }
}

  function updateStatus(message) {
    const el = document.getElementById("statusArea");
    if (el) el.textContent = message;
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

})();