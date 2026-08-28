/* =========================================================
  チャッピーボートレースAI
  js/stats.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;
  const S = window.ChappyStorage;
  const P =
    window.ChappyPredictionIndexLoader;
  const A = window.ChappyAutoStats;
  const I = window.ChappyImprovementSuggestions;
  const V = window.ChappyPredictionVerification;
  const R = window.ChappyVerificationReadiness;
  const C = window.ChappyCollectionHealth;
  const OFFICIAL_SYNC_CONCURRENCY = 3;
  const OFFICIAL_SYNC_MAX_TARGETS = 5;
  const STATS_REQUEST_TIMEOUT_MS = 30000;
  const RESULTS_UI_PHASE3 = "results-ui-phase3-20260806";
  const RESULTS_UI_VERSION = "results-ui-phase1-20260806";
  const NEW_METHOD_MINIMUM_COUNT = 30;
  const CURRENT_CALIBRATION_GENERATION = {
    logicFingerprint:
      "evaluated-scenarios-v1",
    confidenceDefinitionVersion:
      "internal-score-v1",
    ticketPolicyVersion:
      "practical-5-7-10-v1"
  };

  function buildObservedRateDisplay(
    attempts,
    matched
  ) {
    const sampleSize =
      Math.max(
        0,
        Math.floor(
          Number(attempts) || 0
        )
      );
    const hitCount =
      Math.min(
        sampleSize,
        Math.max(
          0,
          Math.floor(
            Number(matched) || 0
          )
        )
      );
    const ready =
      sampleSize >=
      NEW_METHOD_MINIMUM_COUNT;

    return {
      ready,
      sampleSize,
      hitCount,
      rate:
        ready
          ? Math.round(
              hitCount /
              sampleSize *
              1000
            ) / 10
          : null,
      message:
        ready
          ? `${hitCount}/${sampleSize}件`
          : `新方式データ蓄積中：${sampleSize}/${NEW_METHOD_MINIMUM_COUNT}件`
    };
  }

  let officialSyncPromise = null;
  let officialSyncAbortController = null;
  let statsInitPromise = null;
  let automaticStats = {
    predictions: [],
    results: [],
    runs: [],
    shadowV2Predictions: [],
    selectedCount: 0,
    shadowCount: 0
  };
  let automaticStatsLoaded = false;
  let automaticStatsError = "";
  let improvementReview =
    null;
  let improvementReviewLoaded =
    false;
  let improvementReviewError =
    "";

  async function fetchJsonWithTimeout(url, options = {}) {
    const externalSignal = options.signal || null;
    const { signal: _ignoredSignal, ...requestOptions } = options;
    const controller = typeof window.AbortController === "function"
      ? new window.AbortController()
      : null;
    const abortFromExternal = () => controller?.abort();
    if (externalSignal && controller) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
    const timer = controller
      ? window.setTimeout(() => controller.abort(), STATS_REQUEST_TIMEOUT_MS)
      : 0;

    try {
      const response = await fetch(url, {
        ...requestOptions,
        ...((controller?.signal || externalSignal)
          ? { signal: controller?.signal || externalSignal }
          : {})
      });
      const payload = await response.json();
      return { response, payload };
    } catch (error) {
      if (error?.name === "AbortError") {
        if (externalSignal?.aborted) {
          const stopped = new Error("公式結果の照合を中止しました");
          stopped.name = "AbortError";
          throw stopped;
        }
        throw new Error("成績データの応答が30秒を超えました");
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
      externalSignal?.removeEventListener?.("abort", abortFromExternal);
    }
  }

  async function loadAutomaticStats() {
    if (!A?.normalizeIndex) return automaticStats;

    try {
      let payload;
      if (
        typeof P?.loadPredictionIndex ===
        "function"
      ) {
        const loaded =
          await P.loadPredictionIndex({
            requestJson: url =>
              fetchJsonWithTimeout(
                url,
                {
                  cache:
                    String(url).includes(
                      "/index-shards/"
                    )
                      ? "force-cache"
                      : "no-cache"
                }
              ),
            manifestUrl:
              "data/predictions/index-manifest.json",
            legacyUrl:
              "data/predictions/index.json"
          });
        payload = loaded.data;
        if (
          loaded.source === "legacy" &&
          loaded.fallbackReason
        ) {
          console.warn(
            "分割予想indexを読めないためlegacy indexを使用",
            loaded.fallbackReason
          );
        }
      } else {
        const legacy =
          await fetchJsonWithTimeout(
            "data/predictions/index.json",
            { cache: "no-cache" }
          );
        if (!legacy.response.ok) {
          throw new Error(
            `HTTP ${legacy.response.status}`
          );
        }
        payload = legacy.payload;
      }

      automaticStats =
        A.normalizeIndex(payload);
      automaticStatsLoaded = true;
      automaticStatsError = "";
    } catch (error) {
      automaticStatsError = String(error?.message || error);
      console.error("自動予想履歴の取得に失敗", error);
    }

    return automaticStats;
  }

  async function loadImprovementReview() {
    try {
      const { response, payload } = await fetchJsonWithTimeout(
        "data/predictions/improvement-review.json?v=20260729-review2",
        { cache: "no-cache" }
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      improvementReview =
        payload;
      improvementReviewLoaded =
        true;
      improvementReviewError =
        "";
    } catch (error) {
      improvementReviewError =
        String(
          error?.message ||
          error
        );
      console.error(
        "100R精度検証の取得に失敗",
        error
      );
    }

    return improvementReview;
  }
    function normalizeDateKey(value) {
    return String(value || "")
      .replace(/\D/g, "")
      .slice(0, 8);
  }
  function getPendingPredictions() {
    const predictions =
      typeof S
        .loadPredictionHistory ===
        "function"
        ? S.loadPredictionHistory()
        : [];

    const results =
      typeof S.loadResults ===
        "function"
        ? S.loadResults()
        : [];

    const officialResultKeys =
      new Set(
        results
          .filter(record =>
            record?.recordType ===
              "official_result" ||
            record?.resultSource ===
              "boatrace-official"
          )
          .map(record =>
            S.buildRaceKey(record)
          )
          .filter(Boolean)
      );

    const today =
      getTodayKey();

    const usedKeys =
      new Set();

    return (
      Array.isArray(predictions)
        ? predictions
        : []
    )
      .map(prediction => {
        if (
          !prediction ||
          prediction
            .isRetrospective ||
          prediction
            .predictionMode ===
            "retrospective_reference"
        ) {
          return null;
        }

        const raceKey =
          S.buildRaceKey(
            prediction
          );

        if (
          !raceKey ||
          usedKeys.has(raceKey) ||
          officialResultKeys.has(
            raceKey
          )
        ) {
          return null;
        }

        const parts =
          raceKey.split("-");

        const date =
          normalizeDateKey(
            parts[0]
          );

        const jcd =
          String(parts[1] || "")
            .padStart(2, "0");

        const raceNo =
          Number(parts[2] || 0);

        if (
          date.length !== 8 ||
          date > today ||
          !/^\d{2}$/.test(jcd) ||
          raceNo < 1 ||
          raceNo > 12
        ) {
          return null;
        }

        const deadlineAt = String(
          prediction.deadlineAt ||
          prediction.race?.deadlineAt ||
          prediction.race?.deadline ||
          ""
        );
        const deadlineMs = Date.parse(deadlineAt);
        if (
          date === today &&
          (!Number.isFinite(deadlineMs) || deadlineMs > Date.now())
        ) {
          return null;
        }

        usedKeys.add(raceKey);

        return {
          raceKey,
          date,
          jcd,
          raceNo,
          deadlineAt,

          place:
            String(
              prediction.place ||
              prediction
                .race?.place ||
              ""
            )
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.raceKey.localeCompare(a.raceKey))
      .slice(0, OFFICIAL_SYNC_MAX_TARGETS);
  }
  function getTodayKey() {
    const now = new Date();

    const year =
      now.getFullYear();

    const month =
      String(
        now.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        now.getDate()
      ).padStart(2, "0");

    return `${year}${month}${day}`;
  }

  function setOfficialSyncStatus(
    message,
    state = ""
  ) {
    const area =
      document.getElementById(
        "resultSyncStatus"
      );

    if (!area) {
      return;
    }

    area.textContent =
      String(message || "");
    area.hidden =
      state === "ready";

    if (state) {
      area.dataset.state = state;
    } else {
      delete area.dataset.state;
    }
  }
  async function syncOneOfficialResult(
    target,
    signal = null
  ) {
    const url =
      `https://chappy-boatrace-api.vercel.app/api/result` +
      `?date=${encodeURIComponent(
        target.date
      )}` +
      `&jcd=${encodeURIComponent(
        target.jcd
      )}` +
      `&rno=${encodeURIComponent(
        target.raceNo
      )}`;

    const { response, payload: result } =
      await fetchJsonWithTimeout(url, { cache: "no-store", signal });

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

    if (!result.resultAvailable) {
      return {
        status: "pending",
        raceKey: target.raceKey
      };
    }

    const resultTicket =
      String(
        result.trifecta
          ?.combination || ""
      )
        .match(/[1-6]/g)
        ?.slice(0, 3)
        .join("-") || "";

    if (
      !/^[1-6]-[1-6]-[1-6]$/
        .test(resultTicket) ||
      new Set(
        resultTicket.split("-")
      ).size !== 3
    ) {
      return {
        status: "pending",
        raceKey: target.raceKey
      };
    }

    const officialRaceKey =
      S.buildRaceKey({
        date: result.date,
        jcd: result.jcd,
        raceNo: result.raceNo
      });

    if (
      !officialRaceKey ||
      officialRaceKey !==
        target.raceKey
    ) {
      throw new Error(
        "保存済み予想と公式結果のレース情報が一致しません"
      );
    }

    S.upsertResult({
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
        target.place,

      jcd:
        String(result.jcd),

      raceNo:
        Number(result.raceNo),

      result:
        resultTicket,

      officialPayoutPer100:
        Number(
          result.trifecta
            ?.payout || 0
        ),

      officialPayoutText:
        String(
          result.trifecta
            ?.payoutText || ""
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
        officialRaceKey
    });

    return {
      status: "saved",
      raceKey: officialRaceKey
    };
  }
    async function syncPendingOfficialResults() {
    if (officialSyncPromise) {
      return officialSyncPromise;
    }

    officialSyncPromise =
      (async () => {
        const controller = typeof window.AbortController === "function"
          ? new window.AbortController()
          : null;
        officialSyncAbortController = controller;
        const signal = controller?.signal || null;
        const targets =
          getPendingPredictions();

        if (!targets.length) {
          setOfficialSyncStatus(
            "公式結果の照合対象はありません",
            "ready"
          );

          return {
            checked: 0,
            saved: 0,
            pending: 0,
            errors: 0
          };
        }

        let nextIndex = 0;
        let checked = 0;
        let saved = 0;
        let pending = 0;
        let errors = 0;

        setOfficialSyncStatus(
          `公式結果を自動照合中… ` +
          `0 / ${targets.length}`,
          "loading"
        );

        const worker =
          async () => {
            while (
              nextIndex < targets.length &&
              !signal?.aborted
            ) {
              const target =
                targets[
                  nextIndex++
                ];

              try {
                const result =
                  await syncOneOfficialResult(
                    target,
                    signal
                  );

                if (
                  result.status ===
                  "saved"
                ) {
                  saved += 1;
                } else {
                  pending += 1;
                }
              } catch (error) {
                if (signal?.aborted || error?.name === "AbortError") break;
                errors += 1;

                console.warn(
                  "公式結果の自動照合に失敗",
                  target.raceKey,
                  error
                );
              }

              checked += 1;

              setOfficialSyncStatus(
                `公式結果を自動照合中… ` +
                `${checked} / ` +
                `${targets.length}`,
                "loading"
              );
            }
          };

        await Promise.all(
          Array.from(
            {
              length:
                Math.min(
                  OFFICIAL_SYNC_CONCURRENCY,
                  targets.length
                )
            },
            () => worker()
          )
        );

        const message = [
          signal?.aborted
            ? `公式結果の照合を中止（${checked}/${targets.length}レース）`
            : `公式結果を${checked}レース確認`,
          `新たに${saved}レース確定`,
          `結果待ち${pending}レース`,
          !signal?.aborted && errors
            ? `取得失敗${errors}レース`
            : ""
        ]
          .filter(Boolean)
          .join(" ／ ");

        setOfficialSyncStatus(
          message,
          signal?.aborted
            ? ""
            : errors
            ? "warning"
            : "ready"
        );

        return {
          checked,
          saved,
          pending,
          errors
        };
      })()
        .finally(() => {
          officialSyncPromise =
            null;
          officialSyncAbortController = null;
        });

    return officialSyncPromise;
  }
  function buildRaceHistory(
    results,
    additionalPredictions = []
  ) {
  const resultList =
    Array.isArray(results)
      ? results
      : [];

  const localPredictionList =
    typeof S.loadPredictionHistory ===
      "function"
      ? S.loadPredictionHistory()
      : [];

  const predictionList = [
    ...(Array.isArray(localPredictionList)
      ? localPredictionList
      : []),
    ...(Array.isArray(additionalPredictions)
      ? additionalPredictions
      : [])
  ];

  const normalizeTicket = value => {
    const boats =
      String(value || "")
        .match(/[1-6]/g) || [];

    return (
      boats.length === 3 &&
      new Set(boats).size === 3
    )
      ? boats.join("-")
      : "";
  };

  const raceMap = new Map();

  const ensureRace = source => {
    const raceKey =
      S.buildRaceKey(source);

    if (!raceKey) {
      return null;
    }

    const parts =
      raceKey.split("-");

    if (!raceMap.has(raceKey)) {
      raceMap.set(raceKey, {
        raceKey,

        date:
          parts[0] || "",

        jcd:
          parts[1] || "",

        raceNo:
          Number(
            parts[2] || 0
          ),

        place: "",
        prediction: null,
        officialResult: null,
        latestAt: ""
      });
    }

    const entry =
      raceMap.get(raceKey);

    const place =
      String(
        source?.place ||
        source?.predictionPlace ||
        ""
      ).trim();

    if (place) {
      entry.place = place;
    }

    const date =
      String(
        source?.date ||
        source?.predictionDate ||
        ""
      )
        .replace(/\D/g, "")
        .slice(0, 8);

    if (date.length === 8) {
      entry.date = date;
    }

    const rawJcd =
      String(
        source?.jcd ||
        source?.predictionJcd ||
        ""
      ).replace(/\D/g, "");

    if (rawJcd) {
      entry.jcd =
        rawJcd
          .padStart(2, "0")
          .slice(-2);
    }

    const raceNo =
      Number(
        source?.raceNo ??
        source?.rno ??
        source
          ?.predictionRaceNo ??
        0
      );

    if (
      raceNo >= 1 &&
      raceNo <= 12
    ) {
      entry.raceNo =
        raceNo;
    }

    [
      source?.updatedAt,
      source?.officialCheckedAt,
      source?.savedAt
    ]
      .map(value =>
        String(value || "")
      )
      .filter(Boolean)
      .forEach(value => {
        if (
          value >
          entry.latestAt
        ) {
          entry.latestAt =
            value;
        }
      });

    return entry;
  };


  predictionList.forEach(
    prediction => {
      if (
        !prediction ||
        prediction
          .isRetrospective ||
        prediction
          .predictionMode ===
          "retrospective_reference"
      ) {
        return;
      }

      const entry =
        ensureRace(
          prediction
        );

      if (
        entry &&
        !entry.prediction
      ) {
        entry.prediction =
          prediction;
      }
    }
  );


  resultList.forEach(
    record => {
      const isOfficial =
        record?.recordType ===
          "official_result" ||
        record?.resultSource ===
          "boatrace-official";

      const resultTicket =
        normalizeTicket(
          record?.result
        );

      if (
        !isOfficial ||
        !resultTicket
      ) {
        return;
      }

      const entry =
        ensureRace(record);

      if (
        entry &&
        !entry.officialResult
      ) {
        entry.officialResult =
          record;
      }
    }
  );


  return Array.from(
    raceMap.values()
  )
    .map(entry => {
      const resultTicket =
        normalizeTicket(
          entry.officialResult
            ?.result
        );

      const predictionTickets =
        [];

      const seen =
        new Set();

      const sourceTickets =
        Array.isArray(
          entry.prediction
            ?.ticketRanks
        )
          ? entry.prediction
              .ticketRanks
          : [];

      sourceTickets.forEach(
        item => {
          const ticket =
            normalizeTicket(
              item?.ticket
            );

          if (
            !ticket ||
            seen.has(ticket)
          ) {
            return;
          }

          seen.add(ticket);

          predictionTickets.push({
            ...item,
            ticket
          });
        }
      );

      return {
        raceKey:
          entry.raceKey,

        date:
          entry.date,

        place:
          entry.place,

        jcd:
          entry.jcd,

        raceNo:
          entry.raceNo,

        latestAt:
          entry.latestAt,

        prediction:
          entry.prediction,

        predictionTickets,

        officialResult:
          entry.officialResult,

        resultTicket,

        payoutPer100:
          U.safeNumber(
            entry.officialResult
              ?.officialPayoutPer100,
            0
          ),

        winningMethod:
          String(
            entry.officialResult
              ?.winningMethod ||
            ""
          ),

        officialPopularity:
          entry.officialResult
            ?.officialPopularity ??
          null,

        raceStatus:
          entry.officialResult &&
          resultTicket
            ? "結果確定"
            : "結果待ち"
      };
    })
    .sort(
      (a, b) =>
        String(
          b.latestAt || ""
        ).localeCompare(
          String(
            a.latestAt || ""
          )
        ) ||
        String(
          b.raceKey
        ).localeCompare(
          String(
            a.raceKey
          ),
          "ja",
          {
            numeric: true
          }
        )
    );
}
    function renderStats() {
  const localResults = S.loadResults();
  const results = [
    ...(Array.isArray(localResults)
      ? localResults
      : []),
    ...(Array.isArray(automaticStats.results)
      ? automaticStats.results
      : [])
  ];
  const history = buildRaceHistory(
    results,
    automaticStats.predictions
  );
  const automaticRuns =
    Array.isArray(automaticStats.runs)
      ? automaticStats.runs
      : [];
  const automaticSelectedRuns =
    Number(automaticStats.selectedCount || 0);
  const automaticShadowRuns =
    Number(automaticStats.shadowCount || 0);
  const automaticSkippedRuns =
    automaticRuns.filter(
      run => !run?.selected
    ).length;
  const normalizeTicket = value => {
    const boats =
      String(value || "")
        .match(/[1-6]/g) || [];

    return (
      boats.length === 3 &&
      new Set(boats).size === 3
    )
      ? boats.join("-")
      : "";
  };

  const rate = (
    hits,
    total
  ) =>
    total > 0
      ? U.round(
          (hits / total) * 100,
          1
        )
      : 0;

  const derivePracticalTickets =
    tickets => {
      const source =
        Array.isArray(tickets)
          ? tickets
          : [];

      const selected = [];
      const used = new Set();

      const add = (
        role,
        limit
      ) => {
        let added = 0;

        source.forEach(item => {
          const ticket =
            normalizeTicket(
              item?.ticket
            );

          if (
            added >= limit ||
            selected.length >= 7 ||
            String(
              item?.role || ""
            ) !== role ||
            !ticket ||
            used.has(ticket)
          ) {
            return;
          }

          used.add(ticket);
          selected.push(ticket);
          added += 1;
        });
      };

      const hasMain =
        source.some(
          item =>
            String(
              item?.role || ""
            ) === "本命"
        );

      if (!hasMain) {
        return [];
      }

      add("本命", 3);
      add("押さえ", 2);
      add("流し", 1);
      add("穴・万舟候補", 1);

      if (selected.length < 5) {
        source.forEach(item => {
          const ticket =
            normalizeTicket(
              item?.ticket
            );

          if (
            selected.length < 7 &&
            ticket &&
            !used.has(ticket)
          ) {
            used.add(ticket);
            selected.push(ticket);
          }
        });
      }

      return selected;
    };
  const classifyPracticalResult = (
    tickets,
    resultTicket
  ) => {
    const actual =
      normalizeTicket(
        resultTicket
      );

    const selected =
      (Array.isArray(tickets)
        ? tickets
        : []
      )
        .map(normalizeTicket)
        .filter(Boolean);

    if (!actual || selected.length === 0) {
      return "見送り";
    }

    if (selected.includes(actual)) {
      return "的中";
    }

    const actualBoats =
      actual.split("-");

    const actualWinner =
      actualBoats[0];

    const winnerSelected =
      selected.some(ticket =>
        ticket.split("-")[0] ===
        actualWinner
      );

    if (!winnerSelected) {
      return "頭外れ";
    }

    const sameBoatSet =
      selected.some(ticket => {
        const boats =
          ticket.split("-");

        return actualBoats.every(
          boat =>
            boats.includes(boat)
        );
      });

    if (sameBoatSet) {
      return "着順違い";
    }

    const maxOverlap =
      selected.reduce(
        (max, ticket) => {
          const boats =
            ticket.split("-");

          const overlap =
            actualBoats.filter(
              boat =>
                boats.includes(boat)
            ).length;

          return Math.max(
            max,
            overlap
          );
        },
        0
      );

    return maxOverlap >= 2
      ? "相手抜け"
      : "完全抜け";
  };
  
    const getHonmeiFinish = (
    honmeiBoat,
    resultTicket
  ) => {
    if (
      !honmeiBoat ||
      !resultTicket
    ) {
      return "-";
    }

    const position =
      resultTicket
        .split("-")
        .indexOf(
          String(honmeiBoat)
        );

    return position >= 0
      ? `${position + 1}着`
      : "4着以下";
  };
  const predictionRows =
    history
      .filter(item =>
        Boolean(item?.prediction)
      )
      .map(item => {
        const isAutomatic =
          String(item.prediction?.predictionSource || "")
            .startsWith("automatic");
        const isShadow =
          item.prediction?.predictionSource === "automatic_shadow";

        const resultTicket =
          normalizeTicket(
            item?.resultTicket
          );

        const mainTicket =
          (
            item.predictionTickets ||
            []
          ).find(
            ticket =>
              String(
                ticket?.role || ""
              ) === "本命"
          ) ||
          item.predictionTickets?.[0] ||
          null;

        const directHonmeiBoat =
          Number(
            item.prediction
              ?.mainSheet
              ?.honmei
              ?.boatNo || 0
          );

        const honmeiBoat =
          directHonmeiBoat >= 1 &&
          directHonmeiBoat <= 6
            ? String(directHonmeiBoat)
            : normalizeTicket(
                mainTicket?.ticket
              ).split("-")[0] || "";

        const practicalTickets =
          isAutomatic
            ? (Array.isArray(
                item.prediction
                  ?.practicalTickets
              )
                ? item.prediction
                    .practicalTickets
                : []
              )
                .map(ticket =>
                  normalizeTicket(
                    ticket?.ticket ||
                    ticket
                  )
                )
                .filter(Boolean)
                .slice(0, 10)
            : derivePracticalTickets(
                item.predictionTickets
              );

        const settled =
          item.raceStatus ===
            "結果確定" &&
          Boolean(resultTicket);

        const verificationPrediction = {
          ...item.prediction,
          practicalTickets: isAutomatic
            ? item.prediction?.practicalTickets || []
            : practicalTickets.map(ticket => {
                const source = (item.predictionTickets || [])
                  .find(row => normalizeTicket(row?.ticket) === ticket);
                return {
                  ticket,
                  category: source?.role || source?.category || ""
                };
              })
        };
        const verification = V?.verifyPrediction
          ? V.verifyPrediction(verificationPrediction, {
              resultAvailable: settled,
              result: resultTicket,
              officialPayoutPer100: item.payoutPer100,
              officialPopularity: item.officialPopularity,
              winningMethod: item.winningMethod,
              finishers: item.officialResult?.finishers || [],
              starts: item.officialResult?.starts || []
            })
          : null;

        return {
          ...item,
          resultTicket,
          honmeiBoat,
          predictionSource:
            isShadow
              ? "シャドー予想"
              : isAutomatic
                ? "自動選定"
              : "手動保存",
          isShadow,
          automaticScore: Number(
            item.prediction?.automaticSelection?.score || 0
          ),
          selectionCohort:
            String(
              item.prediction
                ?.selectionCohort ||
              "legacy"
            ),
          selectionActiveCohort:
            item.prediction
              ?.selectionActiveCohort ===
              true,
          thresholdComparable:
            item.prediction
              ?.thresholdComparable ===
              true,

          honmeiFinish:
            settled
              ? getHonmeiFinish(
                  honmeiBoat,
                  resultTicket
                )
              : "-",

          practicalTickets,
          settled,

          verification,
          marks: verification?.marks || [],
          predictedScenarioTitle:
            verification?.scenarioTitle ||
            item.prediction?.predictedScenarioTitle ||
            item.prediction?.raceFlow?.title ||
            "",
          expectedWinningMethod:
            verification?.expectedMethod || "",
          scenarioMatched:
            verification?.scenarioMatched ?? null,
          hitCategory:
            verification?.hitCategory || "",
          simulatedStake:
            verification?.simulatedStake || 0,
          simulatedReturn:
            verification?.simulatedReturn || 0,

          missType:
            settled
              ? verification?.missType ||
                classifyPracticalResult(
                  practicalTickets,
                  resultTicket
                )
              : "結果待ち",

          priorityReview:
            verification?.priorityReview || null,

          honmeiHit:
            settled &&
            resultTicket
              .split("-")[0] ===
              honmeiBoat,

          practicalHit:
            settled && (verification
              ? verification.practicalHit
              : practicalTickets.includes(
                  resultTicket
                ))
        };
      });

  const settledRows =
    predictionRows.filter(
      item => item.settled
    );

  const realSettledRows = settledRows.filter(item => !item.isShadow);
  const shadowSettledRows = settledRows.filter(item => item.isShadow);
  const userPracticalRows =
    realSettledRows.filter(
      item =>
        item.practicalTickets
          .length > 0
    );
  const userPracticalHits =
    userPracticalRows.filter(
      item => item.practicalHit
    ).length;
  const userVerificationSummary =
    V?.buildSummary
      ? V.buildSummary(
          realSettledRows
            .map(item => item.verification)
            .filter(Boolean)
        )
      : {
          scenarioComparableCount: 0,
          scenarioHits: 0,
          scenarioMatchRate: 0,
          practicalCount:
            userPracticalRows.length,
          practicalHits:
            userPracticalHits,
          practicalHitRate:
            rate(
              userPracticalHits,
              userPracticalRows.length
            ),
          totalStake: 0,
          totalReturn: 0,
          simulatedRecoveryRate: 0
        };

  const honmeiHits =
    settledRows.filter(
      item => item.honmeiHit
    ).length;

  const practicalRows =
    settledRows.filter(
      item =>
        item.practicalTickets
          .length > 0
    );

  const practicalHits =
    practicalRows.filter(
      item => item.practicalHit
    ).length;
  const verificationSummary = V?.buildSummary
    ? V.buildSummary(
        settledRows
          .map(item => item.verification)
          .filter(Boolean)
      )
    : {
        scenarioComparableCount: 0,
        scenarioHits: 0,
        scenarioMatchRate: 0,
        totalStake: 0,
        totalReturn: 0,
        simulatedProfit: 0,
        simulatedRecoveryRate: 0,
        categorySummary: [],
        markSummary: [],
        priorityStageSummary: []
      };
  /*
    役割・買い目区分・構造化展開の新方式実績は、
    軽量校正へ接続できる保存値だけを別集計する。
    旧履歴を混ぜて0%や見かけの率を作らない。
  */
  const newMethodVerifications =
    realSettledRows
      .map(item => item.verification)
      .filter(
        item => {
          const generation =
            item?.calibrationKey || {};
          const sameGeneration =
            Object.entries(
              CURRENT_CALIBRATION_GENERATION
            ).every(
              ([key, value]) =>
                generation?.[key] ===
                value
            );

          return (
            item?.settled === true &&
            sameGeneration &&
            Boolean(
              item.internalEvaluation
            ) &&
            item
              .scenarioVerification
              ?.structured === true
          );
        }
      );
  const newMethodSummary =
    V?.buildSummary
      ? V.buildSummary(
          newMethodVerifications
        )
      : {
          structuredScenarioComparableCount:
            0,
          structuredScenarioHits: 0,
          structuredScenarioMatchRate:
            0,
          ticketCategorySummary: [],
          roleSummary: []
        };
  const newMethodCount =
    newMethodVerifications.length;
  const newMethodReady =
    newMethodCount >=
    NEW_METHOD_MINIMUM_COUNT;
  const missTypeLabels = [
    "的中",
    "頭外れ",
    "相手抜け",
    "着順違い",
    "完全抜け"
  ];

  const missTypeSummary =
    missTypeLabels.map(label => {
      const count =
        practicalRows.filter(
          item =>
            item.missType === label
        ).length;

      return {
        label,
        count,
        percentage:
          rate(
            count,
            practicalRows.length
          )
      };
    });

  const buildScoreBand = (label, rows) => {
    const summary = V?.buildSummary
      ? V.buildSummary(rows.map(item => item.verification).filter(Boolean))
      : null;
    return {
      label,
      count: rows.length,
      honmeiHits: rows.filter(item => item.honmeiHit).length,
      scenarioHits: summary?.scenarioHits || 0,
      scenarioComparable: summary?.scenarioComparableCount || 0,
      practicalHits: summary?.practicalHits || 0,
      practicalCount: summary?.practicalCount || 0
    };
  };
  const automaticSettledRows =
    settledRows.filter(
      item =>
        [
          "自動選定",
          "シャドー予想"
        ].includes(
          item.predictionSource
        ) &&
        item
          .selectionActiveCohort &&
        item
          .thresholdComparable
    );
  const verificationReadiness = R?.getSampleStage
    ? R.getSampleStage(automaticSettledRows.length)
    : {
        label: automaticSettledRows.length >= 100 ? "改善検討可能" : "蓄積中",
        count: automaticSettledRows.length,
        remaining: Math.max(0, 100 - automaticSettledRows.length),
        message: "検証データを蓄積しています。",
        referenceOnly: automaticSettledRows.length < 100
      };
  const scoreBandRows = (R?.buildScoreBands
    ? R.buildScoreBands(automaticSettledRows)
    : [
        { label: "70点以上", rows: automaticSettledRows.filter(item => item.automaticScore >= 70), readiness: verificationReadiness },
        { label: "70点未満（シャドー）", rows: automaticSettledRows.filter(item => item.automaticScore < 70), readiness: verificationReadiness }
      ]
  ).map(band => ({
    ...buildScoreBand(band.label, band.rows),
    readiness: band.readiness
  }));
  const buildGroups = (
    list,
    getLabel
  ) => {
    const map = new Map();

    list.forEach(item => {
      const label =
        String(
          getLabel(item) ||
          "不明"
        );

      if (!map.has(label)) {
        map.set(label, {
          label,
          count: 0,
          honmeiHits: 0,
          practicalCount: 0,
          practicalHits: 0,
          scenarioComparable: 0,
          scenarioHits: 0
        });
      }

      const bucket =
        map.get(label);

      bucket.count += 1;

      if (item.honmeiHit) {
        bucket.honmeiHits += 1;
      }

      if (item.scenarioMatched !== null) {
        bucket.scenarioComparable += 1;
        if (item.scenarioMatched) bucket.scenarioHits += 1;
      }

      if (
        item.practicalTickets
          .length > 0
      ) {
        bucket.practicalCount += 1;

        if (item.practicalHit) {
          bucket.practicalHits += 1;
        }
      }
    });

    return Array.from(
      map.values()
    ).sort(
      (a, b) =>
        b.count - a.count ||
        a.label.localeCompare(
          b.label,
          "ja"
        )
    );
  };

  const VENUE_NAMES = [
    "桐生", "戸田", "江戸川", "平和島", "多摩川", "浜名湖",
    "蒲郡", "常滑", "津", "三国", "びわこ", "住之江",
    "尼崎", "鳴門", "丸亀", "児島", "宮島", "徳山",
    "下関", "若松", "芦屋", "福岡", "唐津", "大村"
  ];
  const venueGroupMap = new Map(
    buildGroups(
      settledRows,
      item =>
        item.place ||
        `場コード${item.jcd}`
    ).map(row => [row.label, row])
  );
  const venueGroups = VENUE_NAMES.map(label =>
    venueGroupMap.get(label) || {
      label,
      count: 0,
      honmeiHits: 0,
      practicalCount: 0,
      practicalHits: 0,
      scenarioComparable: 0,
      scenarioHits: 0
    }
  );
  const RESULTS_VENUE_VERSION = "venue-24-display-20260806";

  const predictedScenarioGroups =
    buildGroups(
      settledRows,
      item =>
        item.predictedScenarioTitle ||
        "不明"
    );
  const E = value =>
    U.escapeHtml
      ? U.escapeHtml(value)
      : U.safeText(value);
  const improvementAnalysis =
    I?.buildImprovementSuggestions
      ? I.buildImprovementSuggestions({
          settledCount: settledRows.length,
          practicalCount: practicalRows.length,
          sampleLabel: "シャドーを含む検証買い目",
          venueGroups,
          scenarioGroups: predictedScenarioGroups,
          missTypeSummary
        })
      : {
          minimumSample: 30,
          settledCount: settledRows.length,
          practicalCount: practicalRows.length,
          sampleReady: false,
          suggestions: [],
          axisStatus: {
            venue: "分析準備中",
            scenario: "分析準備中",
            miss: "分析準備中"
          }
        };

  const improvementHtml =
    improvementAnalysis.suggestions.length
      ? improvementAnalysis.suggestions
          .map(item => `
            <article class="improvement-suggestion-card">
              <div class="improvement-suggestion-head">
                <span class="improvement-category">
                  ${E(item.category)}
                </span>
                <strong>
                  ${E(item.target)}
                </strong>
                <span class="improvement-priority improvement-priority-${item.priority === "高" ? "high" : "medium"}">
                  優先度${E(item.priority)}
                </span>
              </div>

              <p><b>根拠：</b>${E(item.evidence)}</p>
              <p><b>何を：</b>${E(item.what)}</p>
              <p><b>なぜ：</b>${E(item.why)}</p>
              <p><b>どう変える候補か：</b>${E(item.how)}</p>
              <p><b>影響：</b>${E(item.impact)}</p>
              <p class="improvement-approval">
                🔒 あっくんの同意待ち・未反映
              </p>
            </article>
          `)
          .join("")
      : `
          <div class="v3-empty">
            ${improvementAnalysis.sampleReady
              ? "現在の成績に、変更を検討するほど偏った弱点はありません。"
              : `サンプル蓄積中です。結果確定${improvementAnalysis.settledCount}R／実戦厳選${improvementAnalysis.practicalCount}R。最低${improvementAnalysis.minimumSample}Rまでは改善案を確定しません。`}
          </div>
        `;
  const improvementStatus =
    improvementAnalysis.suggestions.length
      ? {
          label: "承認待ち",
          className: "is-waiting"
        }
      : improvementAnalysis.sampleReady
        ? {
            label: "候補なし",
            className: "is-clear"
          }
        : {
            label: "蓄積中",
            className: "is-building"
          };
  const formatCountRate = (
    count,
    total
  ) =>
    `${count}/${total}（${rate(count, total)}%）`;
  const formatDate = value => {
    const digits =
      String(value || "")
        .replace(/\D/g, "")
        .slice(0, 8);

    return digits.length === 8
      ? `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`
      : E(value || "-");
  };
  const formatMoney = value =>
    `${Math.round(Number(value || 0)).toLocaleString("ja-JP")}円`;
  const renderEmpty = message => `
    <div class="result-empty-state">
      ${E(message)}
    </div>
  `;
  const renderFact = (
    label,
    value
  ) => `
    <div>
      <dt>${E(label)}</dt>
      <dd>${E(value)}</dd>
    </div>
  `;
  const latestAccuracyReview =
    Array.isArray(
      improvementReview?.reports
    )
      ? improvementReview
          .reports
          .at(-1) ||
        null
      : null;
  const collectionReport =
    C?.buildReport
      ? C.buildReport(
          automaticStats
        )
      : null;
  const latestV2Health =
    collectionReport?.v2 || null;
  const latestV2ReasonText =
    Array.isArray(
      latestV2Health
        ?.missingReasons
    )
      ? latestV2Health
          .missingReasons
          .slice(0, 3)
          .map(reason =>
            `${reason.label || reason.code} ${Number(reason.count || 0)}R`
          )
          .join(" ／ ")
      : "";
  const reviewProgress =
    improvementReview
      ?.progress || {};
  const reviewCurrentCount =
    Number(
      reviewProgress
        .currentWindowCount ||
      0
    );
  const reviewTarget =
    Number(
      improvementReview
        ?.reviewSize ||
      100
    );
  const reviewExclusionLabels = {
    notSettled:
      "結果待ち",
    legacySchema:
      "旧方式",
    retrospectiveReference:
      "締切後の振り返り",
    officialResultLeakage:
      "結果参照あり",
    calibrationUnavailable:
      "校正未完了",
    unsupportedCohort:
      "対象外の収集世代",
    incompleteInput:
      "入力未完成",
    preDeadlineUnconfirmed:
      "締切前を未確認",
    missingRaceKey:
      "レース識別不足",
    missingGeneration:
      "予想世代不足",
    missingSelectorCohort:
      "選定世代不足",
    missingTheorySetFingerprint:
      "理論世代不足",
    missingMode:
      "検証種別不足",
    unsupportedEvaluator:
      "対象外の評価器",
    incompleteShadowV2:
      "V2判定未完成",
    scenarioNotComparable:
      "展開を比較不能",
    missingSelectionScore:
      "選定点不足",
    invalidSelectionDecision:
      "選定判定不正",
    duplicateRace:
      "同一レース重複",
    nonActiveGeneration:
      "現行と異なる世代"
  };
  const reviewExclusionRows =
    Object.entries(
      improvementReview
        ?.source
        ?.excluded || {}
    )
      .map(([code, count]) => ({
        code,
        count:
          Number(count || 0)
      }))
      .filter(item =>
        item.count > 0
      )
      .sort((left, right) =>
        right.count - left.count
      )
      .slice(0, 5);
  const reviewExcludedReasonText =
    reviewExclusionRows
      .map(item =>
        `${reviewExclusionLabels[item.code] || item.code} ${item.count}R`
      )
      .join(" ／ ");
  const reviewExcludedExampleText =
    reviewExclusionRows
      .map(item => {
        const examples =
          improvementReview
            ?.source
            ?.excludedExamples
            ?.[item.code];
        const raceKeys =
          (
            Array.isArray(examples)
              ? examples
              : []
          )
            .map(value =>
              String(value || "")
                .trim()
            )
            .filter(Boolean)
            .slice(0, 3);

        return raceKeys.length
          ? `${
              reviewExclusionLabels[
                item.code
              ] ||
              item.code
            }：${raceKeys.join("、")}`
          : "";
      })
      .filter(Boolean)
      .join(" ／ ");
  const reviewRoleRows =
    latestAccuracyReview
      ?.cumulative
      ?.selectedPerformance
      ?.roleSupportPerformance ||
    [];
  const reviewTheorySupport =
    latestAccuracyReview
      ?.cumulative
      ?.selectedPerformance
      ?.theorySupportPerformance ||
    null;
  const reviewTheoryStages =
    latestAccuracyReview
      ?.cumulative
      ?.selectedPerformance
      ?.theoryStages ||
    [];
  const reviewPerformance =
    latestAccuracyReview
      ?.cumulative
      ?.selectedPerformance ||
    null;
  const reviewProposals =
    Array.isArray(
      latestAccuracyReview
        ?.proposals
    )
      ? latestAccuracyReview
          .proposals
      : [];
  const renderReviewRoleRows = () =>
    reviewRoleRows.length
      ? reviewRoleRows
          .map(row => `
            <article class="result-data-card">
              <header>
                <h4>${E(row.label || row.key || "役割")}</h4>
                <span>${Number(row.raceCount || 0)}R</span>
              </header>
              <dl class="result-data-facts">
                ${renderFact(
                  "支持買い目",
                  `${Number(row.hitTickets || 0)}/${Number(row.ticketCount || 0)}点`
                )}
                ${renderFact(
                  "回収率",
                  `${Number(row.recoveryRate || 0)}%`
                )}
              </dl>
            </article>
          `)
          .join("")
      : renderEmpty(
          "最初の100R到達後に、役割が支持した買い目群の実績を表示します"
        );
  const renderReviewProposals = () =>
    reviewProposals.length
      ? reviewProposals
          .map(item => `
            <article class="result-data-card">
              <header>
                <h4>${E(item.target || item.category || "検討提案")}</h4>
                <span>承認待ち・未反映</span>
              </header>
              <p><b>根拠：</b>${E(item.evidence || item.why || "")}</p>
              <p><b>何を：</b>${E(item.what || "")}</p>
              <p><b>なぜ：</b>${E(item.why || "")}</p>
              <p><b>方法：</b>${E(item.how || "")}</p>
              <p><b>影響：</b>${E(item.impact || "")}</p>
              <p class="result-panel-note">
                🔒 自動反映なし。あっくんの明示承認後も、別PR・別世代でのみ実装します。
              </p>
            </article>
          `)
          .join("")
      : renderEmpty(
          latestAccuracyReview
            ? "この100R区間では、変更を提案する根拠がありません"
            : "100R到達までは変更提案を作りません"
        );
  const reviewDiagnosticsHtml = `
    <p class="result-panel-note">
      旧形式・未完成入力・締切後・結果を参照した記録・検証用の非採用予想は正式な100Rへ混ぜません。
    </p>
    ${
      reviewExcludedReasonText
        ? `
            <p class="result-panel-note">
              正式100Rへ入らない主因：${E(reviewExcludedReasonText)}
            </p>
          `
        : ""
    }
    ${
      reviewExcludedExampleText
        ? `
            <p class="result-panel-note">
              除外の代表例：${E(reviewExcludedExampleText)}
            </p>
          `
        : ""
    }
    ${
      latestAccuracyReview
        ? `
            <p class="result-panel-note">
              次の正式レビューまで：${reviewCurrentCount}/${reviewTarget}R
            </p>
          `
        : ""
    }
    ${
      latestV2Health
        ? `
            <p class="result-panel-note">
              直近収集のV2判定可能：
              ${Number(latestV2Health.readyCount || 0)}/${Number(latestV2Health.evaluatedCount || 0)}R
              ${
                latestV2ReasonText
                  ? `（未完成の主因：${E(latestV2ReasonText)}）`
                  : ""
              }
            </p>
          `
        : ""
    }
  `;
  const improvementReviewHtml =
    latestAccuracyReview &&
    reviewPerformance
      ? `
          <div class="result-context-strip">
            <span>
              同一世代・自動厳選・完成入力 ${Number(latestAccuracyReview.milestone || 0)}R
            </span>
            <span>
              的中${Number(reviewPerformance.practicalHits || 0)}/${Number(reviewPerformance.practicalCount || 0)}R
            </span>
            <span>
              回収率${Number(reviewPerformance.recoveryRate || 0)}%
            </span>
          </div>
          <section class="result-subsection">
            <header>
              <h4>役割が支持した買い目群</h4>
              <p>
                行同士は重複するため、合算して全体収支にはしません。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderReviewRoleRows()}
            </div>
          </section>
          <section class="result-subsection">
            <header>
              <h4>理論の事後検証</h4>
              <p>
                結果後の推測はせず、予想時点の帰属が保存された理論だけを集計します。
              </p>
            </header>
            ${
              reviewTheorySupport?.status === "available"
                ? `<div class="result-data-grid">${
                    (reviewTheorySupport.rows || []).map(row => `
                      <article class="result-data-card">
                        <header>
                          <h4>${E(row.label || row.key || "理論")}</h4>
                          <span>${Number(row.raceCount || 0)}R</span>
                        </header>
                        <dl class="result-data-facts">
                          ${renderFact("支持買い目", `${Number(row.hitTickets || 0)}/${Number(row.ticketCount || 0)}点`)}
                          ${renderFact("回収率", `${Number(row.recoveryRate || 0)}%`)}
                        </dl>
                      </article>
                    `).join("")
                  }</div>`
                : renderEmpty(
                    "新しい事前帰属データを蓄積中です。旧履歴を理論実績へ遡及補完しません"
                  )
            }
            ${
              reviewTheoryStages.length
                ? `<p class="result-panel-note">要確認段階：${
                    reviewTheoryStages
                      .map(row => `${E(row.label)} ${Number(row.count || 0)}件`)
                      .join(" ／ ")
                  }</p>`
                : ""
            }
          </section>
          <section class="result-subsection">
            <header>
              <h4>承認待ちの提案</h4>
              <p>
                レポートは提案だけを生成し、予想基準・重み・買い目へ自動反映しません。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderReviewProposals()}
            </div>
          </section>
          ${reviewDiagnosticsHtml}
        `
      : `
          ${renderEmpty(
            improvementReviewLoaded
              ? `同一世代・自動厳選・完成入力を蓄積中：${reviewCurrentCount}/${reviewTarget}R`
              : improvementReviewError
                ? "100R精度検証を読み込めませんでした"
                : "100R精度検証を読み込んでいます"
          )}
          ${reviewDiagnosticsHtml}
        `;
  const renderMetricCard = ({
    icon,
    label,
    value,
    detail,
    tone = "blue"
  }) => `
    <article class="result-kpi-card result-tone-${tone}">
      <div class="result-kpi-heading">
        <span aria-hidden="true">${icon}</span>
        <h4>${E(label)}</h4>
      </div>
      <strong class="result-kpi-value">${E(value)}</strong>
      <p>${E(detail)}</p>
    </article>
  `;
  const renderVenueCards = groups =>
    groups.length
      ? groups.map(group => `
          <article class="result-data-card">
            <header>
              <h4>${E(group.label)}</h4>
              <span>${group.count}R</span>
            </header>
            <dl class="result-data-facts">
              ${renderFact(
                "◎1着率",
                formatCountRate(
                  group.honmeiHits,
                  group.count
                )
              )}
              ${renderFact(
                "厳選的中率",
                formatCountRate(
                  group.practicalHits,
                  group.practicalCount
                )
              )}
            </dl>
          </article>
        `).join("")
      : renderEmpty("場別に比較できる検証データがありません");
  const renderScenarioCards = groups =>
    groups.length
      ? groups.map(group => `
          <article class="result-data-card">
            <header>
              <h4>${E(group.label)}</h4>
              <span>${group.count}R</span>
            </header>
            <dl class="result-data-facts">
              ${renderFact(
                "展開一致率",
                formatCountRate(
                  group.scenarioHits,
                  group.scenarioComparable
                )
              )}
              ${renderFact(
                "厳選的中率",
                formatCountRate(
                  group.practicalHits,
                  group.practicalCount
                )
              )}
            </dl>
          </article>
        `).join("")
      : renderEmpty("展開別に比較できる検証データがありません");
  const renderScoreBandCards = rows =>
    rows.length
      ? rows.map(row => `
          <article class="result-data-card">
            <header>
              <h4>${E(row.label)}</h4>
              <span>${row.count}R</span>
            </header>
            <p class="result-data-state">
              ${E(row.readiness?.label || "蓄積中")}
            </p>
            <dl class="result-data-facts result-data-facts-three">
              ${renderFact(
                "◎1着率",
                formatCountRate(
                  row.honmeiHits,
                  row.count
                )
              )}
              ${renderFact(
                "展開一致",
                formatCountRate(
                  row.scenarioHits,
                  row.scenarioComparable
                )
              )}
              ${renderFact(
                "厳選的中",
                formatCountRate(
                  row.practicalHits,
                  row.practicalCount
                )
              )}
            </dl>
          </article>
        `).join("")
      : renderEmpty("点数帯別に比較できる検証データがありません");
  const newMethodRoleRows =
    (
      newMethodSummary
        .roleSummary || []
    ).filter(
      row =>
        Number(row?.attempts || 0) >
        0
    );
  const newMethodTicketCategoryRows =
    (
      newMethodSummary
        .ticketCategorySummary || []
    ).filter(
      row =>
        Number(row?.attempts || 0) >
        0
    );
  const structuredScenarioCount =
    Number(
      newMethodSummary
        .structuredScenarioComparableCount ||
      0
    );
  const structuredScenarioHits =
    Number(
      newMethodSummary
        .structuredScenarioHits || 0
    );
  const calibrationAvailable =
    Boolean(
      window
        .ChappyPredictionCalibration
    );
  const calibrationCountStage =
    newMethodReady
      ? `${newMethodCount}件・参考確認段階`
      : `${newMethodCount}/${NEW_METHOD_MINIMUM_COUNT}件・蓄積中`;
  const renderNewMethodRoleCards = () =>
    newMethodRoleRows.length
      ? newMethodRoleRows
          .map(row => {
            const matched =
              buildObservedRateDisplay(
                row.attempts,
                row.matched
              );
            const top3 =
              buildObservedRateDisplay(
                row.attempts,
                row.top3
              );

            return `
              <article class="result-data-card">
                <header>
                  <h4>${E(row.label || row.key || "役割")}</h4>
                  <span>${matched.sampleSize}件</span>
                </header>
                ${
                  matched.ready
                    ? `
                      <dl class="result-data-facts">
                        ${renderFact(
                          "期待着順一致",
                          `${matched.message}（${matched.rate}%）`
                        )}
                        ${renderFact(
                          "3着内",
                          `${top3.message}（${top3.rate}%）`
                        )}
                      </dl>
                    `
                    : `
                      <p class="result-data-state">
                        ${E(matched.message)}
                      </p>
                    `
                }
              </article>
            `;
          })
          .join("")
      : renderEmpty(
          "役割別の新方式データ蓄積中"
        );
  const renderNewMethodTicketCards = () =>
    newMethodTicketCategoryRows.length
      ? newMethodTicketCategoryRows
          .map(row => {
            const display =
              buildObservedRateDisplay(
                row.attempts,
                row.matched
              );

            return `
              <article class="result-data-card">
                <header>
                  <h4>${E(row.label || "買い目区分")}</h4>
                  <span>${display.sampleSize}R</span>
                </header>
                ${
                  display.ready
                    ? `
                      <dl class="result-data-facts">
                        ${renderFact(
                          "実績的中",
                          `${display.hitCount}/${display.sampleSize}R`
                        )}
                        ${renderFact(
                          "実績的中率",
                          `${display.rate}%`
                        )}
                      </dl>
                    `
                    : `
                      <p class="result-data-state">
                        ${E(display.message)}
                      </p>
                    `
                }
              </article>
            `;
          })
          .join("")
      : renderEmpty(
          "買い目区分別の新方式データ蓄積中"
        );
  const renderStructuredScenarioCard = () => {
    const display =
      buildObservedRateDisplay(
        structuredScenarioCount,
        structuredScenarioHits
      );

    return structuredScenarioCount > 0
      ? `
          <article class="result-data-card">
            <header>
              <h4>中心展開</h4>
              <span>${structuredScenarioCount}R</span>
            </header>
            ${
              display.ready
                ? `
                  <dl class="result-data-facts">
                    ${renderFact(
                      "展開一致",
                      `${display.hitCount}/${display.sampleSize}R`
                    )}
                    ${renderFact(
                      "実績一致率",
                      `${display.rate}%`
                    )}
                  </dl>
                `
                : `
                  <p class="result-data-state">
                    ${E(display.message)}
                  </p>
                `
            }
          </article>
        `
      : renderEmpty(
          "比較可能な構造化展開データを蓄積中"
        );
  };
  const newMethodDetailsHtml =
    newMethodReady
      ? `
          ${
            calibrationAvailable
              ? `
                <div class="result-context-strip">
                  <span>
                    軽量校正：${E(calibrationCountStage)}
                  </span>
                </div>
              `
              : ""
          }

          <section class="result-subsection">
            <header>
              <h4>構造化展開</h4>
              <p>
                保存した中心展開と公式結果を事後照合しています。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderStructuredScenarioCard()}
            </div>
          </section>

          <section class="result-subsection">
            <header>
              <h4>役割別</h4>
              <p>
                攻め・追走・残し・拾いが、想定した着順になった実績です。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderNewMethodRoleCards()}
            </div>
          </section>

          <section class="result-subsection">
            <header>
              <h4>買い目区分別</h4>
              <p>
                本線・押さえ・流し・独立展開・万舟の実績を分けています。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderNewMethodTicketCards()}
            </div>
          </section>

          <p class="result-panel-note">
            内部評価は的中確率ではありません。この表示は、保存済み予想と公式結果の事後実績です。
          </p>
        `
      : `
          ${renderEmpty(
            `新方式データ蓄積中：` +
            `${newMethodCount}/` +
            `${NEW_METHOD_MINIMUM_COUNT}件。` +
            "旧履歴は新方式の率へ混ぜません。"
          )}
          ${
            calibrationAvailable
              ? `
                <div class="result-context-strip">
                  <span>
                    軽量校正：${E(calibrationCountStage)}
                  </span>
                </div>
              `
              : ""
          }
          <p class="result-panel-note">
            30件に達するまで、役割別・買い目区分別・構造化展開の率は表示しません。内部評価は的中確率ではありません。
          </p>
        `;
  /* results UI phase2 grouped panels */
  const venuePerformanceHtml =
    venueGroups.length
      ? venueGroups.map((row, index) => `
          <details class="result-group-item" data-result-group="venue-${index}">
            <summary>
              <span class="result-group-title">${E(row.label)}</span>
              <span class="result-group-meta">
                ${row.count > 0
                  ? `${row.count}R・厳選${rate(row.practicalHits, row.practicalCount)}%`
                  : "0R・データなし"}
              </span>
            </summary>
            <div class="result-group-body">
              <dl class="result-data-facts">
                ${renderFact("本命1着", formatCountRate(row.honmeiHits, row.count))}
                ${renderFact("実戦厳選", formatCountRate(row.practicalHits, row.practicalCount))}
                ${renderFact("展開一致", formatCountRate(row.scenarioHits, row.scenarioComparable))}
              </dl>
            </div>
          </details>
        `).join("")
      : renderEmpty("場別に比較できる公式結果がありません");

  const scenarioPerformanceHtml =
    predictedScenarioGroups.length
      ? predictedScenarioGroups.map(row => {
          const practicalRate = rate(row.practicalHits, row.practicalCount);
          const state = row.practicalCount === 0
            ? "is-neutral"
            : practicalRate >= 30
              ? "is-hit"
              : practicalRate >= 15
                ? "is-neutral"
                : "is-miss";
          const icon = state === "is-hit" ? "🟢" : state === "is-miss" ? "🔴" : "🟡";
          const strengthLabel = row.practicalCount < 5
            ? "蓄積中"
            : practicalRate >= 30
              ? "得意"
              : practicalRate >= 15
                ? "標準"
                : "改善対象";
          return `
            <article class="result-data-card result-scenario-card ${state}">
              <header>
                <h4>${icon} ${E(row.label)}</h4>
                <span class="result-strength-badge ${state}">${strengthLabel}</span>
              </header>
              <dl class="result-data-facts">
                ${renderFact("展開一致", formatCountRate(row.scenarioHits, row.scenarioComparable))}
                ${renderFact("実戦厳選", formatCountRate(row.practicalHits, row.practicalCount))}
                ${renderFact("本命1着", formatCountRate(row.honmeiHits, row.count))}
              </dl>
            </article>
          `;
        }).join("")
      : renderEmpty("展開別に比較できる公式結果がありません");

  const comparableScenarioRows = predictedScenarioGroups
    .filter(row => row.practicalCount >= 5)
    .map(row => ({ ...row, practicalRate: rate(row.practicalHits, row.practicalCount) }))
    .sort((a, b) => b.practicalRate - a.practicalRate);
  const strongestScenario = comparableScenarioRows[0] || null;
  const weakestScenario = comparableScenarioRows[comparableScenarioRows.length - 1] || null;
  const scenarioInsightHtml = comparableScenarioRows.length
    ? `<div class="result-ai-insight">
        <strong>AI改善メモ</strong>
        <p>好調：${E(strongestScenario.label)}（厳選${strongestScenario.practicalRate}%）</p>
        ${weakestScenario && weakestScenario !== strongestScenario
          ? `<p>改善対象：${E(weakestScenario.label)}（厳選${weakestScenario.practicalRate}%）</p>`
          : ""}
      </div>`
    : `<div class="result-ai-insight"><strong>AI改善メモ</strong><p>各展開5R以上になるまで蓄積中です。</p></div>`;
  const RESULTS_UI_PHASE4 = "results-ui-phase4-20260806";
  const ROLE_TICKETS_NOT_STORED = "分類別データ未保存";

  const renderRoleTickets = (item, role) => {
    const predictionTickets = Array.isArray(item?.predictionTickets)
      ? item.predictionTickets
      : [];
    const tickets = predictionTickets
      .filter(row => String(row?.role || row?.category || "") === role)
      .map(row => normalizeTicket(row?.ticket))
      .filter(Boolean);
    if (tickets.length) return tickets.join("、");
    if (
      predictionTickets.length === 0 &&
      Array.isArray(item?.practicalTickets) &&
      item.practicalTickets.length > 0
    ) {
      return ROLE_TICKETS_NOT_STORED;
    }
    return "なし";
  };

  const shadowV2Progress =
    A?.buildShadowV2Progress
      ? A.buildShadowV2Progress(
          automaticStats
            .shadowV2Predictions,
          {
            officialResultRaceKeys:
              new Set(
                (
                  results || []
                )
                  .filter(item =>
                    item?.recordType ===
                      "official_result" ||
                    item?.resultSource ===
                      "boatrace-official"
                  )
                  .map(item =>
                    String(
                      item?.raceKey ||
                      ""
                    )
                  )
                  .filter(Boolean)
              )
          }
        )
      : {
          cohortKey: "",
          logicFingerprint: "",
          recordCount: 0,
          completeCount: 0,
          eligibleCount: 0,
          resultJoinedCount: 0,
          awaitingResultCount: 0,
          excludedCount: 0,
          target: 500,
          nextMilestone: 100,
          remainingToNext: 100,
          progressPercent: 0,
          milestones: [
            { value: 100, reached: false },
            { value: 250, reached: false },
            { value: 500, reached: false }
          ]
        };

  const recentRows =
    realSettledRows.slice(0, 5);
  const recentHtml =
    recentRows.length
      ? recentRows
          .map(item => `
            <article class="result-race-card">
              <header class="result-race-head">
                <div>
                  <h4>
                    ${E(item.place || item.jcd || "-")}
                    ${item.raceNo || "-"}R
                  </h4>
                  <p>${formatDate(item.date)}</p>
                </div>
                <span class="result-source-chip">
                  ${E(item.predictionSource)}
                </span>
              </header>

              <div class="result-race-comparison">
                <div>
                  <span>予想</span>
                  <strong>
                    ◎${E(item.honmeiBoat || "-")}号艇
                  </strong>
                  <small>
                    ${E(item.predictedScenarioTitle || "-")}
                  </small>
                </div>

                <span class="result-race-arrow" aria-hidden="true">→</span>

                <div>
                  <span>公式結果</span>
                  <strong>${E(item.resultTicket || "-")}</strong>
                  <small>${E(item.winningMethod || "-")}</small>
                </div>
              </div>

              <div class="result-chip-row">
                <span class="result-status-chip ${
                  item.scenarioMatched
                    ? "is-hit"
                    : item.scenarioMatched === false
                      ? "is-miss"
                      : "is-neutral"
                }">
                  展開${
                    item.scenarioMatched === null
                      ? "判定不可"
                      : item.scenarioMatched
                        ? "一致"
                        : "不一致"
                  }
                </span>
                <span class="result-status-chip ${
                  item.practicalHit
                    ? "is-hit"
                    : item.practicalTickets.length
                      ? "is-miss"
                      : "is-neutral"
                }">
                  ${
                    item.practicalTickets.length === 0
                      ? "🟡 厳選見送り"
                      : item.practicalHit
                        ? `🟢 厳選的中・${E(item.hitCategory || "区分不明")}`
                        : `🔴 ${E(item.missType || "不的中")}`
                  }
                </span>
              </div>

              <details class="result-race-more">
                <summary><span>詳細を見る</span><small>買い目・公式結果・払戻</small></summary>
                <div class="result-race-more-body">
                  <div class="result-ticket-details">
                    ${[
                      ["本命", renderRoleTickets(item, "本命")],
                      ["押さえ", renderRoleTickets(item, "押さえ")],
                      ["流し", renderRoleTickets(item, "流し")],
                      ["万舟", renderRoleTickets(item, "穴・万舟候補")],
                      ["実戦厳選", item.practicalTickets.length ? item.practicalTickets.join("、") : "見送り"]
                    ].map(([label, value]) => `
                      <details class="result-ticket-detail">
                        <summary><span>${label}</span><small>開く</small></summary>
                        <p>${E(value)}</p>
                      </details>
                    `).join("")}
                  </div>
                  <dl class="result-data-facts result-official-facts">
                    ${renderFact("公式結果", item.resultTicket || "-")}
                    ${renderFact("払戻", item.payoutPer100 > 0 ? formatMoney(item.payoutPer100) + "／100円" : "-")}
                  </dl>
                </div>
              </details>

            </article>
          `)
          .join("")
      : renderEmpty(
          "公式結果と照合できる予想がありません"
        );
  const sampleMessage =
    realSettledRows.length < 30
      ? `サンプル蓄積中：現在${realSettledRows.length}R。30R未満の数値は参考値です。`
      : `${realSettledRows.length}Rの公式結果で検証しています。`;

  const previousDashboard =
    document.querySelector(
      "#statsArea .results-analysis-dashboard"
    );
  const openPanels =
    new Set(
      Array.from(
        document.querySelectorAll(
          "#statsArea details[data-result-panel][open]"
        )
      ).map(panel =>
        String(
          panel.dataset.resultPanel || ""
        )
      )
    );
  const panelOpen = (
    key,
    initiallyOpen = false
  ) =>
    (
      previousDashboard
        ? openPanels.has(key)
        : initiallyOpen
    )
      ? " open"
      : "";
  const resultHeadline =
    A?.buildResultHeadline
      ? A.buildResultHeadline(
          userVerificationSummary
        )
      : {
          practicalCount:
            userPracticalRows.length,
          practicalHits:
            userPracticalHits,
          practicalHitRate:
            rate(
              userPracticalHits,
              userPracticalRows.length
            ),
          totalStake:
            userVerificationSummary
              .totalStake || 0,
          totalReturn:
            userVerificationSummary
              .totalReturn || 0,
          simulatedRecoveryRate:
            Number(
              userVerificationSummary
                .simulatedRecoveryRate || 0
            ),
          scenarioComparableCount:
            userVerificationSummary
              .scenarioComparableCount || 0,
          scenarioHits:
            userVerificationSummary
              .scenarioHits || 0,
          scenarioMatchRate:
            userVerificationSummary
              .scenarioMatchRate || 0
        };
  const analysisHitRate =
    resultHeadline
      .practicalHitRate;
  const recoveryRate =
    resultHeadline
      .simulatedRecoveryRate;
  const pendingCount =
    Math.max(
      0,
      predictionRows.length -
        settledRows.length
    );
  const v2GenerationLabel =
    shadowV2Progress.logicFingerprint
      ? shadowV2Progress
          .logicFingerprint
          .slice(0, 8)
      : "未取得";
  const dataLoadMessage =
    automaticStatsLoaded
      ? `自動履歴：採用${automaticSelectedRuns}回・シャドー${automaticShadowRuns}R・見送り${automaticSkippedRuns}回`
      : automaticStatsError
        ? `自動履歴を取得できません：${automaticStatsError}`
        : "自動履歴を読み込んでいます";

  U.setHtml("statsArea", `
    <div
      class="results-analysis-dashboard"
      data-results-analysis-dashboard
    >
      <section class="result-overview" aria-labelledby="resultOverviewTitle">
        <header class="result-overview-head">
          <div>
            <p class="result-kicker">RESULT</p>
            <h3 id="resultOverviewTitle">成績の要点</h3>
            <p>${E(sampleMessage)}</p>
            <p
              class="result-panel-note"
              data-stats-load-state="${
                automaticStatsLoaded
                  ? "ready"
                  : automaticStatsError
                    ? "error"
                    : "loading"
              }"
            >
              ${E(dataLoadMessage)}
            </p>
          </div>
          <span class="result-sample-badge ${
            realSettledRows.length >= 30
              ? "is-ready"
              : "is-building"
          }">
            ${realSettledRows.length}R
          </span>
        </header>

        <div class="result-kpi-grid result-kpi-grid-five">
          ${renderMetricCard({
            icon: "🎯",
            label: "厳選的中率",
            value: `${analysisHitRate}%`,
            detail: `${resultHeadline.practicalHits}/${resultHeadline.practicalCount}R`,
            tone: "blue"
          })}
          ${renderMetricCard({
            icon: "📈",
            label: "回収率",
            value: `${recoveryRate}%`,
            detail: "1点100円の検証値",
            tone:
              recoveryRate >= 100
                ? "green"
                : recoveryRate >= 80
                  ? "amber"
                  : "red"
          })}
          ${renderMetricCard({
            icon: "💹",
            label: "検証収支",
            value: formatMoney(
              resultHeadline.totalReturn -
                resultHeadline.totalStake
            ),
            detail: "払戻－購入額",
            tone:
              resultHeadline.totalReturn >=
              resultHeadline.totalStake
                ? "green"
                : "red"
          })}
          ${renderMetricCard({
            icon: "🧾",
            label: "購入額",
            value: formatMoney(resultHeadline.totalStake),
            detail: `対象${resultHeadline.practicalCount}R`,
            tone: "amber"
          })}
          ${renderMetricCard({
            icon: "💴",
            label: "払戻額",
            value: formatMoney(resultHeadline.totalReturn),
            detail: `的中${resultHeadline.practicalHits}R`,
            tone:
              resultHeadline.totalReturn > 0
                ? "green"
                : "blue"
          })}
        </div>

        <p class="result-mode-note">
          1点100円の検証値です。
        </p>
      </section>

      <details
        class="result-accordion"
        data-result-panel="new-method-performance"
        ${panelOpen(
          "new-method-performance"
        )}
      >
        <summary>
          <span
            class="result-accordion-icon"
            aria-hidden="true"
          >
            🧭
          </span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">
              新方式の詳細実績
            </span>
            <small>
              役割別・買い目区分別・構造化展開
            </small>
          </span>
          <span class="result-accordion-meta">
            ${
              newMethodReady
                ? `${newMethodCount}件`
                : "データ蓄積中"
            }
          </span>
        </summary>
        <div class="result-accordion-body result-compact-analysis-body">
          <div class="result-compact-progress">
            <strong>${newMethodCount}/${NEW_METHOD_MINIMUM_COUNT}件</strong>
            <span>${newMethodReady ? "参考確認段階" : "データ蓄積中"}</span>
          </div>
          <details class="result-inner-details">
            <summary>詳しい説明を見る</summary>
            <div class="result-inner-details-body">
              ${newMethodDetailsHtml}
            </div>
          </details>
        </div>
      </details>

      <details
        class="result-accordion"
        data-result-panel="accuracy-review"
        ${panelOpen(
          "accuracy-review"
        )}
      >
        <summary>
          <span
            class="result-accordion-icon"
            aria-hidden="true"
          >
            🔬
          </span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">
              100R精度検証
            </span>
            <small>
              実績・回収率・役割・承認待ち提案
            </small>
          </span>
          <span class="result-accordion-meta">
            ${
              latestAccuracyReview
                ? `累計${Number(latestAccuracyReview.milestone || 0)}R・次${reviewCurrentCount}/${reviewTarget}R`
                : `${reviewCurrentCount}/${reviewTarget}R`
            }
          </span>
        </summary>
        <div class="result-accordion-body result-compact-analysis-body">
          <div class="result-compact-progress">
            <strong>${reviewCurrentCount}/${reviewTarget}R</strong>
            <span>データ蓄積中</span>
          </div>
          <details class="result-inner-details">
            <summary>詳しい説明を見る</summary>
            <div class="result-inner-details-body">
              ${improvementReviewHtml}
            </div>
          </details>
        </div>
      </details>

      <details
        class="result-accordion"
        data-result-panel="venue-performance"
        ${panelOpen("venue-performance")}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🏟️</span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">場別成績</span>
            <small>場ごとの本命・実戦厳選・展開一致</small>
          </span>
          <span class="result-accordion-meta">${venueGroups.length}場</span>
        </summary>
        <div class="result-accordion-body result-group-list">
          ${venuePerformanceHtml}
        </div>
      </details>

      <details
        class="result-accordion"
        data-result-panel="scenario-performance"
        ${panelOpen("scenario-performance")}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🧠</span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">展開別AI分析</span>
            <small>イン逃げ・差し・攻め・カドの強みと弱み</small>
          </span>
          <span class="result-accordion-meta">${predictedScenarioGroups.length}展開</span>
        </summary>
        <div class="result-accordion-body">
          ${scenarioInsightHtml}
          <div class="result-data-grid result-scenario-grid">
            ${scenarioPerformanceHtml}
          </div>
        </div>
      </details>

      <details
        class="result-accordion"
        data-result-panel="recent-results"
        ${panelOpen("recent-results", true)}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🗂️</span>
          <span class="result-accordion-title">
            <span class="result-accordion-name">直近の結果</span>
            <small>予想・公式結果・的中／不的中を確認</small>
          </span>
          <span class="result-accordion-meta">
            最新${recentRows.length}R
          </span>
        </summary>
        <div class="result-accordion-body">
          <div class="result-race-list">
            ${recentHtml}
          </div>
        </div>
      </details>
    </div>
  `);
}

  function startOfficialSyncInBackground() {
    const section = document.getElementById("resultSection");
    if (!section || section.hidden) return Promise.resolve(false);
    return syncPendingOfficialResults()
      .then(() => {
        if (section && !section.hidden) renderStats();
        window.dispatchEvent(new CustomEvent("chappy:stats-updated"));
      })
      .catch(error => {
        if (error?.name === "AbortError") return;
        console.error("公式結果の自動照合エラー", error);
        setOfficialSyncStatus(
          "公式結果を自動照合できませんでした",
          "warning"
        );
      });
  }

  function initStatsEvents() {
    if (statsInitPromise) {
      return statsInitPromise;
    }

    statsInitPromise = (async () => {
      window.dispatchEvent(
        new CustomEvent(
          "chappy:stats-hydrating"
        )
      );
      renderStats();

      await Promise.allSettled([
        loadAutomaticStats(),
        loadImprovementReview()
      ]);

      renderStats();
      window.dispatchEvent(
        new CustomEvent(
          "chappy:stats-updated"
        )
      );

      void startOfficialSyncInBackground();
    })();

    return statsInitPromise;
  }

  function setupLazyStats() {
    if (
      typeof document
        ?.getElementById !==
        "function"
    ) {
      return;
    }
    const section =
      document.getElementById(
        "resultSection"
      );
    const area =
      document.getElementById(
        "statsArea"
      );
    const status =
      document.getElementById(
        "resultSyncStatus"
      );
    let observer = null;
    let started = false;

    const start = () => {
      if (started) return;
      started = true;
      observer?.disconnect();
      if (status) {
        status.hidden = false;
        status.textContent =
          "結果分析を読み込んでいます…";
      }
      initStatsEvents();
    };

    if (area) {
      area.innerHTML =
        '<div class="result-empty-state">結果分析は、この画面を開いた時に読み込みます。</div>';
    }
    if (status) {
      status.hidden = false;
      status.textContent =
        "結果分析は必要な時だけ読み込みます";
    }

    document
      .querySelector(
        'a[href="#resultSection"]'
      )
      ?.addEventListener(
        "click",
        start,
        { once: true }
      );
    window.addEventListener(
      "chappy:stats-requested",
      start,
      { once: true }
    );
    window.addEventListener("chappy:view-changed", event => {
      if (event?.detail?.view !== "result") {
        officialSyncAbortController?.abort();
        return;
      }
      if (statsInitPromise) {
        void statsInitPromise.then(() => startOfficialSyncInBackground());
      }
    });

    if (
      section &&
      "IntersectionObserver" in window
    ) {
      observer = new IntersectionObserver(
        entries => {
          if (
            entries.some(
              entry =>
                entry.isIntersecting
            )
          ) {
            start();
          }
        },
        { rootMargin: "300px 0px" }
      );
      observer.observe(section);
    }
  }

window.ChappyStats = {
  renderStats,
  initStatsEvents,
  syncPendingOfficialResults,
  loadAutomaticStats,
  loadImprovementReview,
  buildObservedRateDisplay,
  setupLazyStats
};

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      setupLazyStats,
      { once: true }
    );
  } else {
    setupLazyStats();
  }

})();
