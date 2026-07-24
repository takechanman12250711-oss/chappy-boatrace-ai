/* =========================================================
  チャッピーボートレースAI
  js/stats.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;
  const S = window.ChappyStorage;
  const A = window.ChappyAutoStats;
  const I = window.ChappyImprovementSuggestions;
  const V = window.ChappyPredictionVerification;
  const R = window.ChappyVerificationReadiness;
  const H = window.ChappyCollectionHealth;
  const OFFICIAL_SYNC_CONCURRENCY = 3;

  let officialSyncPromise = null;
  let automaticStats = {
    predictions: [],
    results: [],
    runs: [],
    selectedCount: 0,
    shadowCount: 0
  };
  let automaticStatsLoaded = false;
  let automaticStatsError = "";

  async function loadAutomaticStats() {
    if (!A?.normalizeIndex) return automaticStats;

    try {
      const response = await fetch(
        `/data/predictions/index.json?t=${Date.now()}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      automaticStats = A.normalizeIndex(await response.json());
      automaticStatsLoaded = true;
      automaticStatsError = "";
    } catch (error) {
      automaticStatsError = String(error?.message || error);
      console.error("自動予想履歴の取得に失敗", error);
    }

    return automaticStats;
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

        usedKeys.add(raceKey);

        return {
          raceKey,
          date,
          jcd,
          raceNo,

          place:
            String(
              prediction.place ||
              prediction
                .race?.place ||
              ""
            )
        };
      })
      .filter(Boolean);
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

    if (state) {
      area.dataset.state = state;
    } else {
      delete area.dataset.state;
    }
  }
    async function syncOneOfficialResult(
    target
  ) {
    const url =
      `/api/result` +
      `?date=${encodeURIComponent(
        target.date
      )}` +
      `&jcd=${encodeURIComponent(
        target.jcd
      )}` +
      `&rno=${encodeURIComponent(
        target.raceNo
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
              nextIndex <
              targets.length
            ) {
              const target =
                targets[
                  nextIndex++
                ];

              try {
                const result =
                  await syncOneOfficialResult(
                    target
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
          `公式結果を${checked}レース確認`,
          `新たに${saved}レース確定`,
          `結果待ち${pending}レース`,
          errors
            ? `取得失敗${errors}レース`
            : ""
        ]
          .filter(Boolean)
          .join(" ／ ");

        setOfficialSyncStatus(
          message,
          errors
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
  const collectionHealth = H?.buildReport
    ? H.buildReport(automaticStats)
    : null;

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
                .slice(0, 7)
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
  const realPredictionRows = predictionRows.filter(item => !item.isShadow);

  const honmeiHits =
    realSettledRows.filter(
      item => item.honmeiHit
    ).length;

  const practicalRows =
    realSettledRows.filter(
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
        realSettledRows
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
  const automaticSettledRows = settledRows.filter(item =>
    ["自動選定", "シャドー予想"].includes(item.predictionSource)
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

  const venueGroups =
    buildGroups(
      realSettledRows,
      item =>
        item.place ||
        `場コード${item.jcd}`
    );

  const venueRaceGroups =
    buildGroups(
      realSettledRows,
      item =>
        `${item.place || `場コード${item.jcd}`} ${item.raceNo}R`
    );

  const methodGroups =
    buildGroups(
      realSettledRows,
      item =>
        item.winningMethod ||
        "不明"
    );
  const honmeiCourseGroups =
    buildGroups(
      realSettledRows,
      item => {
        const boatNo =
          Number(
            item.honmeiBoat || 0
          );

        return (
          boatNo >= 1 &&
          boatNo <= 6
        )
          ? `${boatNo}号艇◎`
          : "不明";
      }
    );

  const predictedScenarioGroups =
    buildGroups(
      realSettledRows,
      item =>
        item.predictedScenarioTitle ||
        "不明"
    );
  const improvementAnalysis =
    I?.buildImprovementSuggestions
      ? I.buildImprovementSuggestions({
          settledCount: realSettledRows.length,
          practicalCount: practicalRows.length,
          venueGroups,
          scenarioGroups: predictedScenarioGroups,
          missTypeSummary
        })
      : {
          minimumSample: 30,
          settledCount: realSettledRows.length,
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
                  ${U.safeText(item.category)}
                </span>
                <strong>
                  ${U.safeText(item.target)}
                </strong>
                <span class="improvement-priority improvement-priority-${item.priority === "高" ? "high" : "medium"}">
                  優先度${U.safeText(item.priority)}
                </span>
              </div>

              <p><b>根拠：</b>${U.safeText(item.evidence)}</p>
              <p><b>何を：</b>${U.safeText(item.what)}</p>
              <p><b>なぜ：</b>${U.safeText(item.why)}</p>
              <p><b>どう変える候補か：</b>${U.safeText(item.how)}</p>
              <p><b>影響：</b>${U.safeText(item.impact)}</p>
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
  const renderGroupRows =
    groups =>
      groups.length
        ? groups
            .map(group => `
              <tr>
                <td>
                  ${U.safeText(
                    group.label
                  )}
                </td>

                <td>
                  ${group.count}R
                </td>

                <td>
                  ${group.honmeiHits}
                  /
                  ${group.count}
                  （${rate(
                    group.honmeiHits,
                    group.count
                  )}%）
                </td>

                <td>
                  ${group.practicalHits}
                  /
                  ${group.practicalCount}
                  （${rate(
                    group.practicalHits,
                    group.practicalCount
                  )}%）
                </td>

                <td>
                  ${group.scenarioHits}
                  /
                  ${group.scenarioComparable}
                  （${rate(
                    group.scenarioHits,
                    group.scenarioComparable
                  )}%）
                </td>
              </tr>
            `)
            .join("")
        : `
            <tr>
              <td colspan="5">
                検証データがありません
              </td>
            </tr>
          `;
  const recentRows =
    settledRows.slice(0, 10);
  const formatMarks = marks =>
    (Array.isArray(marks) ? marks : [])
      .filter(mark => mark?.boatNo)
      .map(mark =>
        `${mark.symbol}${mark.boatNo}号艇 ${mark.finishLabel}`
      )
      .join("／") || "-";
    const recentHtml =
    recentRows.length
      ? recentRows
          .map(item => `
            <tr>
              <td>
                ${U.safeText(
                  item.date || "-"
                )}
              </td>

              <td>
                ${U.safeText(
                  item.predictionSource
                )}
              </td>

              <td>
                ${U.safeText(
                  item.place ||
                  item.jcd ||
                  "-"
                )}
                ${item.raceNo || "-"}R
              </td>

              <td>
                ${
                  item.honmeiBoat
                    ? `${item.honmeiBoat}号艇`
                    : "-"
                }
              </td>

              <td>
                ${U.safeText(
                  item.resultTicket
                )}
              </td>

              <td>
                ${U.safeText(
                  item.predictedScenarioTitle || "-"
                )}
              </td>

              <td>
                ${U.safeText(item.winningMethod || "-")}
              </td>

              <td>
                ${item.scenarioMatched === null
                  ? "判定不可"
                  : item.scenarioMatched
                    ? "一致"
                    : "不一致"}
              </td>

              <td>
                ${U.safeText(formatMarks(item.marks))}
              </td>

              <td>
                ${
                  item.practicalTickets
                    .length === 0
                    ? "見送り"
                    : item.practicalHit
                      ? `的中（${U.safeText(item.hitCategory || "区分不明")}）`
                      : "不的中"
                }
              </td>

              <td>
                ${U.safeText(
                  item.missType ||
                  "-"
                )}
              </td>

              <td>
                ${U.safeText(
                  item.priorityReview?.primaryStage || "判定保留"
                )}
                <small>
                  ${U.safeText(
                    item.priorityReview?.primaryEvidence || "保存済みデータを蓄積中"
                  )}
                </small>
              </td>
            </tr>
          `)
          .join("")
      : `
          <tr>
            <td colspan="12">
              公式結果と照合できる予想がありません
            </td>
          </tr>
        `;
  const sampleMessage =
    realSettledRows.length < 30
      ? `
        ⚠️ サンプル不足：
        現在${realSettledRows.length}レース。
        30レース未満の数値は参考値として扱います。
      `
      : `
        ${realSettledRows.length}レースの
        公式結果で検証しています。
      `;

  U.setHtml("statsArea", `
    <div class="v3-final-block">

            <h3>
        公式結果との照合状況
      </h3>

      <p>
        保存済みの事前予想と同じレースの
        公式結果だけを照合します。
        結果待ちはアプリ起動時に
        自動確認します。
      </p>

      <p>
        ${sampleMessage}
      </p>

      <p>
        ${automaticStatsLoaded
          ? `自動選定履歴：採用${automaticSelectedRuns}回／シャドー${automaticShadowRuns}R／見送り${automaticSkippedRuns}回を読み込み済みです。`
          : automaticStatsError
            ? `⚠️ 自動選定履歴を取得できませんでした（${U.safeText(automaticStatsError)}）`
            : "自動選定履歴を読み込んでいます。"}
      </p>

    </div>


    <div class="v3-final-grid">

      <div class="v3-final-block">
        <h3>収集監視対象</h3>
        <p>${collectionHealth?.monitoredCount ?? 0}レース</p>
        <small>監視機能追加後の締切前レース</small>
      </div>

      <div class="v3-final-block">
        <h3>事前予想保存率</h3>
        <p>${collectionHealth?.coverageRate ?? 0}%</p>
        <small>${collectionHealth?.savedCount ?? 0}/${collectionHealth?.monitoredCount ?? 0}レース</small>
      </div>

      <div class="v3-final-block">
        <h3>未保存</h3>
        <p>${collectionHealth?.missingCount ?? 0}レース</p>
        <small>データ不足${collectionHealth?.insufficientDataCount ?? 0}／取得失敗${collectionHealth?.failedCount ?? 0}</small>
      </div>

      <div class="v3-final-block">
        <h3>自動復旧</h3>
        <p>${collectionHealth?.recoveredCount ?? 0}レース</p>
        <small>再取得中${collectionHealth?.retryingCount ?? 0}／最終未取得${collectionHealth?.finalUncollectedCount ?? 0}</small>
      </div>

      <div class="v3-final-block">
        <h3>公式結果待ち</h3>
        <p>${collectionHealth?.resultWaitingCount ?? 0}レース</p>
        <small>保存${collectionHealth?.predictionCount ?? 0}／照合済み${collectionHealth?.settledCount ?? 0}</small>
      </div>

      <div class="v3-final-block">
        <h3>AI予想数</h3>

        <p>
          ${predictionRows.length}
          レース
        </p>
      </div>

      <div class="v3-final-block">
        <h3>自動選定採用</h3>

        <p>
          ${automaticSelectedRuns}回
        </p>
      </div>

      <div class="v3-final-block">
        <h3>自動見送り判定</h3>

        <p>
          ${automaticSkippedRuns}回
        </p>
      </div>

      <div class="v3-final-block">
        <h3>シャドー予想</h3>

        <p>
          ${automaticShadowRuns}レース
        </p>

        <small>検証専用・購入／note対象外</small>
      </div>


      <div class="v3-final-block">
        <h3>結果確定</h3>

        <p>
          ${realSettledRows.length}
          レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>結果待ち</h3>

        <p>
          ${
            realPredictionRows.length -
            realSettledRows.length
          }
          レース
        </p>
      </div>

      <div class="v3-final-block">
        <h3>シャドー結果確定</h3>

        <p>
          ${shadowSettledRows.length}レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>◎1着率</h3>

        <p>
          ${honmeiHits}
          /
          ${realSettledRows.length}
          （${rate(
            honmeiHits,
            realSettledRows.length
          )}%）
        </p>
      </div>


      <div class="v3-final-block">
        <h3>実戦厳選対象</h3>

        <p>
          ${practicalRows.length}
          レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>実戦厳選的中率</h3>

        <p>
          ${practicalHits}
          /
          ${practicalRows.length}
          （${rate(
            practicalHits,
            practicalRows.length
          )}%）
        </p>
      </div>

      <div class="v3-final-block">
        <h3>中心展開一致率</h3>

        <p>
          ${verificationSummary.scenarioHits}
          /
          ${verificationSummary.scenarioComparableCount}
          （${verificationSummary.scenarioMatchRate}%）
        </p>
      </div>

    </div>

    <div class="v3-final-block">
      <h3>場別の自動収集状況</h3>
      <p class="v3-note">
        締切前に取得対象となったレースを追跡します。情報不足は締切まで再取得し、復旧しなかった場合だけ最終未取得として残します。
      </p>
      <div class="v3-table-wrap">
        <table class="v3-table">
          <thead><tr><th>場</th><th>対象</th><th>保存</th><th>復旧</th><th>再取得中</th><th>最終未取得</th></tr></thead>
          <tbody>
            ${(collectionHealth?.venues || []).map(item => `
              <tr>
                <td>${U.safeText(item.place)}</td>
                <td>${item.targetCount}R</td>
                <td>${item.savedCount}R</td>
                <td>${item.recoveredCount}R</td>
                <td>${item.retryingCount}R</td>
                <td>${item.finalUncollectedCount}R</td>
              </tr>
            `).join("") || `<tr><td colspan="6">監視データを蓄積中です</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="v3-final-block">
      <h3>事前データ不足の内訳</h3>
      <div class="v3-table-wrap">
        <table class="v3-table">
          <thead><tr><th>不足項目</th><th>レース数</th></tr></thead>
          <tbody>
            ${(collectionHealth?.missingReasons || []).map(item => `
              <tr><td>${U.safeText(item.reason)}</td><td>${item.count}R</td></tr>
            `).join("") || `<tr><td colspan="2">不足項目を蓄積中です</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <div class="v3-final-block">

      <h3>検証データの蓄積段階</h3>

      <div class="v3-final-grid">
        <div class="v3-final-block">
          <h3>現在</h3>
          <p>${automaticSettledRows.length}R</p>
          <small>${U.safeText(verificationReadiness.label)}</small>
        </div>
        <div class="v3-final-block">
          <h3>段階判定</h3>
          <p>${U.safeText(verificationReadiness.message)}</p>
        </div>
        <div class="v3-final-block">
          <h3>判断ルール</h3>
          <p>${verificationReadiness.referenceOnly ? "参考表示のみ" : "改善候補を比較可能"}</p>
          <small>変更は必ず説明・同意後</small>
        </div>
      </div>

      <p class="v3-note">
        30Rで初期比較、50Rで傾向確認、100Rで改善検討可能とします。
        100R到達後も、70点基準・AI重み・買い目を自動変更しません。
      </p>

    </div>

    <div class="v3-final-block">

      <h3>点数帯別のシャドー比較</h3>

      <p class="v3-note">
        70点未満は実購入・noteへ出さず、予想精度だけを比較します。
        この比較結果から基準やAI重みを自動変更することはありません。
      </p>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>点数帯</th>
              <th>判断状態</th>
              <th>結果確定</th>
              <th>◎1着率</th>
              <th>展開一致率</th>
              <th>厳選的中率</th>
            </tr>
          </thead>
          <tbody>
            ${scoreBandRows.map(row => `
              <tr>
                <td>${U.safeText(row.label)}</td>
                <td>${U.safeText(row.readiness?.label || "蓄積中")}</td>
                <td>${row.count}R</td>
                <td>${row.honmeiHits}/${row.count}（${rate(row.honmeiHits, row.count)}%）</td>
                <td>${row.scenarioHits}/${row.scenarioComparable}（${rate(row.scenarioHits, row.scenarioComparable)}%）</td>
                <td>${row.practicalHits}/${row.practicalCount}（${rate(row.practicalHits, row.practicalCount)}%）</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

    </div>

    <div class="v3-final-block">

      <h3>印別の実着順</h3>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>印</th>
              <th>対象</th>
              <th>1着率</th>
              <th>3着内率</th>
            </tr>
          </thead>
          <tbody>
            ${verificationSummary.markSummary.length
              ? verificationSummary.markSummary.map(mark => `
                  <tr>
                    <td>${mark.symbol} ${U.safeText(mark.label)}</td>
                    <td>${mark.count}R</td>
                    <td>${mark.first}/${mark.count}（${mark.firstRate}%）</td>
                    <td>${mark.top3}/${mark.count}（${mark.top3Rate}%）</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="4">検証データがありません</td></tr>`}
          </tbody>
        </table>
      </div>

    </div>

    <div class="v3-final-block">

      <h3>的中した買い目区分</h3>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>区分</th>
              <th>的中数</th>
              <th>的中内割合</th>
            </tr>
          </thead>
          <tbody>
            ${verificationSummary.categorySummary.length
              ? verificationSummary.categorySummary.map(category => `
                  <tr>
                    <td>${U.safeText(category.label)}</td>
                    <td>${category.count}R</td>
                    <td>${category.percentage}%</td>
                  </tr>
                `).join("")
              : `<tr><td colspan="3">検証データがありません</td></tr>`}
          </tbody>
        </table>
      </div>

    </div>

    <div class="v3-final-block">

      <h3>外れ原因の8段階分析</h3>

      <p class="v3-note">
        展開→コース→ST・スリット→展示・足→残し・拾い→当地・水面→技量→モーターの順で、
        最初に要確認となった段階を集計します。データ不足は原因認定せず判定保留にします。
      </p>

      <div class="v3-table-wrap">
        <table class="table">
          <thead><tr><th>確認段階</th><th>主原因候補</th></tr></thead>
          <tbody>
            ${(verificationSummary.priorityStageSummary || []).map(item => `
              <tr><td>${U.safeText(item.label)}</td><td>${item.count}R</td></tr>
            `).join("") || `<tr><td colspan="2">検証データがありません</td></tr>`}
          </tbody>
        </table>
      </div>

    </div>

    <div class="v3-final-block">

      <h3>
        改善候補（自動分析）
      </h3>

      <p class="v3-note">
        場別・展開別・外れ方別に弱点を検出します。
        ここに表示されるのは提案だけで、予想ロジックや買い目は自動変更しません。
      </p>

      <div class="improvement-axis-grid">
        <div><b>場別</b><span>${U.safeText(improvementAnalysis.axisStatus.venue)}</span></div>
        <div><b>展開別</b><span>${U.safeText(improvementAnalysis.axisStatus.scenario)}</span></div>
        <div><b>外れ方別</b><span>${U.safeText(improvementAnalysis.axisStatus.miss)}</span></div>
      </div>

      <div class="improvement-suggestion-list">
        ${improvementHtml}
      </div>

    </div>

    <div class="v3-final-block">

      <h3>
        実戦厳選の判定内訳
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>判定</th>
              <th>8段階の主確認点</th>
              <th>件数</th>
              <th>割合</th>
            </tr>
          </thead>

          <tbody>
            ${missTypeSummary
              .map(item => `
                <tr>
                  <td>
                    ${U.safeText(
                      item.label
                    )}
                  </td>

                  <td>
                    ${item.count}R
                  </td>

                  <td>
                    ${item.percentage}%
                  </td>
                </tr>
              `)
              .join("")}
          </tbody>

        </table>

      </div>

    </div>
    <div class="v3-final-block">
    
      <h3>
        予想と公式着順の比較
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>日付</th>
              <th>保存元</th>
              <th>レース</th>
              <th>◎</th>
              <th>公式着順</th>
              <th>予想した中心展開</th>
              <th>決まり手</th>
              <th>展開一致</th>
              <th>◎○▲△の実着順</th>
              <th>実戦厳選</th>
               <th>判定</th>
               <th>8段階の主確認点</th>
            </tr>
          </thead>

          <tbody>
            ${recentHtml}
          </tbody>

        </table>

      </div>

    </div>


    <div class="v3-final-block">

      <h3>
        場別傾向
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>場</th>
              <th>対象</th>
              <th>◎1着率</th>
              <th>厳選的中率</th>
              <th>展開一致率</th>
            </tr>
          </thead>

          <tbody>
            ${renderGroupRows(
              venueGroups
            )}
          </tbody>

        </table>

      </div>

    </div>


    <div class="v3-final-block">

      <h3>場＋R番号別傾向</h3>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>場・R</th>
              <th>対象</th>
              <th>◎1着率</th>
              <th>厳選的中率</th>
              <th>展開一致率</th>
            </tr>
          </thead>
          <tbody>
            ${renderGroupRows(venueRaceGroups)}
          </tbody>
        </table>
      </div>

    </div>


    <div class="v3-final-block">

      <h3>
        決まり手別傾向
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>決まり手</th>
              <th>対象</th>
              <th>◎1着率</th>
              <th>厳選的中率</th>
              <th>展開一致率</th>
            </tr>
          </thead>

          <tbody>
            ${renderGroupRows(
              methodGroups
            )}
          </tbody>

        </table>

      </div>

    </div>
        <div class="v3-final-block">

      <h3>
        本命コース別傾向
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>本命コース</th>
              <th>対象</th>
              <th>◎1着率</th>
              <th>厳選的中率</th>
              <th>展開一致率</th>
            </tr>
          </thead>

          <tbody>
            ${renderGroupRows(
              honmeiCourseGroups
            )}
          </tbody>

        </table>

      </div>

    </div>


    <div class="v3-final-block">

      <h3>
        予想した中心展開別傾向
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>中心展開</th>
              <th>対象</th>
              <th>◎1着率</th>
              <th>厳選的中率</th>
              <th>展開一致率</th>
            </tr>
          </thead>

          <tbody>
            ${renderGroupRows(
              predictedScenarioGroups
            )}
          </tbody>

        </table>

      </div>

    </div>
  `);
}

  async function initStatsEvents() {
    renderStats();

    const [, officialResult] =
      await Promise.allSettled([
        loadAutomaticStats(),
        syncPendingOfficialResults()
      ]);

    if (
      officialResult.status ===
      "rejected"
    ) {
      console.error(
        "公式結果の自動照合エラー",
        officialResult.reason
      );

      setOfficialSyncStatus(
        "公式結果を自動照合できませんでした",
        "warning"
      );
    }

    renderStats();
  }

window.ChappyStats = {
  renderStats,
  initStatsEvents,
  syncPendingOfficialResults,
  loadAutomaticStats
};

  document.addEventListener(
    "DOMContentLoaded",
    initStatsEvents
  );

})();
