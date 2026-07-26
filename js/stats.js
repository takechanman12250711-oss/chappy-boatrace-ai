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
  const OFFICIAL_SYNC_CONCURRENCY = 3;

  let officialSyncPromise = null;
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
      settledRows,
      item =>
        item.place ||
        `場コード${item.jcd}`
    );

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
            <article class="result-race-card">
              <header class="result-race-head">
                <div>
                  <p>${formatDate(item.date)}</p>
                  <h4>
                    ${E(item.place || item.jcd || "-")}
                    ${item.raceNo || "-"}R
                  </h4>
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
                      ? "厳選見送り"
                      : item.practicalHit
                        ? `厳選的中・${E(item.hitCategory || "区分不明")}`
                        : E(item.missType || "不的中")
                  }
                </span>
              </div>

              <details class="result-race-details">
                <summary>照合の詳細を見る</summary>
                <dl>
                  ${renderFact(
                    "◎○▲△の実着順",
                    formatMarks(item.marks)
                  )}
                  ${renderFact(
                    "厳選買い目",
                    item.practicalTickets.join("／") || "見送り"
                  )}
                  ${renderFact(
                    "8段階の主確認点",
                    item.priorityReview?.primaryStage || "判定保留"
                  )}
                  ${renderFact(
                    "確認根拠",
                    item.priorityReview?.primaryEvidence ||
                      "保存済みデータを蓄積中"
                  )}
                </dl>
              </details>
            </article>
          `)
          .join("")
      : renderEmpty(
          "公式結果と照合できる予想がありません"
        );
  const sampleMessage =
    settledRows.length < 30
      ? `サンプル蓄積中：現在${settledRows.length}R。30R未満の数値は参考値です。`
      : `${settledRows.length}Rの公式結果で検証しています。`;

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
          verificationSummary
        )
      : {
          practicalCount:
            practicalRows.length,
          practicalHits,
          practicalHitRate:
            rate(
              practicalHits,
              practicalRows.length
            ),
          totalStake:
            verificationSummary
              .totalStake || 0,
          totalReturn:
            verificationSummary
              .totalReturn || 0,
          simulatedRecoveryRate:
            Number(
              verificationSummary
                .simulatedRecoveryRate || 0
            ),
          scenarioComparableCount:
            verificationSummary
              .scenarioComparableCount || 0,
          scenarioHits:
            verificationSummary
              .scenarioHits || 0,
          scenarioMatchRate:
            verificationSummary
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
        ? `自動履歴を取得できません：${E(automaticStatsError)}`
        : "自動履歴を読み込んでいます";

  U.setHtml("statsArea", `
    <div
      class="results-analysis-dashboard"
      data-results-analysis-dashboard
    >
      <section class="result-overview" aria-labelledby="resultOverviewTitle">
        <header class="result-overview-head">
          <div>
            <p class="result-kicker">OFFICIAL VERIFICATION</p>
            <h3 id="resultOverviewTitle">結果分析ダッシュボード</h3>
            <p>
              保存済みの事前予想を、同じレースの公式結果だけで照合します。
              ${E(sampleMessage)}
            </p>
          </div>
          <span class="result-sample-badge ${
            settledRows.length >= 30
              ? "is-ready"
              : "is-building"
          }">
            結果確定 ${settledRows.length}R
          </span>
        </header>

        <div class="result-kpi-grid">
          ${renderMetricCard({
            icon: "🎯",
            label: "厳選買い目的中率",
            value: `${analysisHitRate}%`,
            detail: `${resultHeadline.practicalHits}/${resultHeadline.practicalCount}R的中`,
            tone: "blue"
          })}
          ${renderMetricCard({
            icon: "💴",
            label: "シミュレーション回収率",
            value: `${recoveryRate}%`,
            detail:
              `投資${formatMoney(resultHeadline.totalStake)}・払戻${formatMoney(resultHeadline.totalReturn)}`,
            tone:
              recoveryRate >= 100
                ? "green"
                : recoveryRate >= 80
                  ? "amber"
                  : "red"
          })}
          ${renderMetricCard({
            icon: "🌊",
            label: "中心展開一致率",
            value: `${resultHeadline.scenarioMatchRate}%`,
            detail:
              `${resultHeadline.scenarioHits}/${resultHeadline.scenarioComparableCount}R一致`,
            tone: "navy"
          })}
        </div>

        <div class="result-context-strip" aria-label="検証データの内訳">
          <span>予想 ${predictionRows.length}R</span>
          <span>結果待ち ${pendingCount}R</span>
          <span>◎1着 ${formatCountRate(honmeiHits, settledRows.length)}</span>
          <span>実戦・手動 ${realSettledRows.length}R</span>
          <span>シャドー検証 ${shadowSettledRows.length}R</span>
        </div>

        <p class="result-mode-note">
          上の3指標はシャドー予想を含む検証値です。
          シャドー予想は実購入・note公開には使っていません。
          回収率は各買い目を1点100円で均等購入した検証値です。
          ${dataLoadMessage}
        </p>
      </section>

      <section class="result-panel result-v2-panel" aria-labelledby="resultV2Title">
        <header class="result-panel-head">
          <div>
            <p class="result-kicker">SHADOW V2</p>
            <h3 id="resultV2Title">完全データ500Rの進捗</h3>
            <p>
              同一ロジック世代・8項目正式で、公式結果を取得できた校正候補だけを数えます。
            </p>
          </div>
          <span class="result-generation-chip">
            世代 ${E(v2GenerationLabel)}
          </span>
        </header>

        <div class="result-v2-summary">
          <strong>
            ${shadowV2Progress.resultJoinedCount}
            <small>/ ${shadowV2Progress.target}R</small>
          </strong>
          <p>
            次の${shadowV2Progress.nextMilestone}Rまで
            あと${shadowV2Progress.remainingToNext}R
          </p>
        </div>

        <div
          class="result-progress"
          role="progressbar"
          aria-label="V2公式結果取得済みの校正候補"
          aria-valuemin="0"
          aria-valuemax="${shadowV2Progress.target}"
          aria-valuenow="${Math.min(
            shadowV2Progress.target,
            shadowV2Progress.resultJoinedCount
          )}"
        >
          <span
            class="result-progress-fill"
            style="width:${shadowV2Progress.progressPercent}%"
          ></span>
          ${shadowV2Progress.milestones.map(item => `
            <span
              class="result-progress-marker ${item.reached ? "is-reached" : ""}"
              style="left:${Math.min(
                100,
                (item.value / shadowV2Progress.target) * 100
              )}%"
              aria-hidden="true"
            ></span>
          `).join("")}
        </div>

        <div class="result-progress-labels" aria-hidden="true">
          ${shadowV2Progress.milestones.map(item => `
            <span class="${item.reached ? "is-reached" : ""}">
              ${item.value}R
            </span>
          `).join("")}
        </div>

        <dl class="result-v2-facts">
          ${renderFact(
            "同一世代の完全データ",
            `${shadowV2Progress.completeCount}R`
          )}
          ${renderFact(
            "校正対象（8項目正式）",
            `${shadowV2Progress.eligibleCount}R`
          )}
          ${renderFact(
            "公式結果待ち",
            `${shadowV2Progress.awaitingResultCount}R`
          )}
          ${renderFact(
            "校正対象外",
            `${shadowV2Progress.excludedCount}R`
          )}
        </dl>

        <p class="result-lock-note">
          🔒 500R到達後も、予想ロジックや70点基準は承認なしで変更しません。
        </p>
      </section>

      <section class="result-panel" aria-labelledby="resultMissTitle">
        <header class="result-panel-head">
          <div>
            <p class="result-kicker">OUTCOME</p>
            <h3 id="resultMissTitle">的中と外れ方</h3>
            <p>外れの中心が、頭・相手・着順のどこかを一目で確認できます。</p>
          </div>
        </header>

        <div class="result-outcome-list">
          ${missTypeSummary.map(item => `
            <div class="result-outcome-row">
              <div>
                <strong>${E(item.label)}</strong>
                <span>${item.count}R</span>
              </div>
              <div class="result-outcome-bar" aria-hidden="true">
                <span
                  class="${item.label === "的中" ? "is-hit" : "is-miss"}"
                  style="width:${Math.min(100, item.percentage)}%"
                ></span>
              </div>
              <b>${item.percentage}%</b>
            </div>
          `).join("")}
        </div>
      </section>

      <details
        class="result-accordion"
        data-result-panel="accuracy"
        ${panelOpen("accuracy", true)}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">📊</span>
          <h3 class="result-accordion-title">
            <span class="result-accordion-name">予想精度の詳しい内訳</span>
            <small>点数帯・印・的中した買い目区分</small>
          </h3>
          <span class="result-accordion-meta">${settledRows.length}R</span>
        </summary>

        <div class="result-accordion-body">
          <section class="result-subsection">
            <header>
              <h4>点数帯別</h4>
              <p>
                数値は比較表示のみ。基準やAI重みを自動変更しません。
              </p>
            </header>
            <div class="result-data-grid">
              ${renderScoreBandCards(scoreBandRows)}
            </div>
          </section>

          <div class="result-detail-columns">
            <section class="result-subsection">
              <header>
                <h4>印別の実着順</h4>
              </header>
              <div class="result-compact-list">
                ${verificationSummary.markSummary.length
                  ? verificationSummary.markSummary.map(mark => `
                      <article>
                        <strong>${E(mark.symbol)} ${E(mark.label)}</strong>
                        <span>${mark.count}R</span>
                        <small>
                          1着 ${mark.firstRate}%・3着内 ${mark.top3Rate}%
                        </small>
                      </article>
                    `).join("")
                  : renderEmpty("印別の検証データがありません")}
              </div>
            </section>

            <section class="result-subsection">
              <header>
                <h4>的中した買い目区分</h4>
              </header>
              <div class="result-compact-list">
                ${verificationSummary.categorySummary.length
                  ? verificationSummary.categorySummary.map(category => `
                      <article>
                        <strong>${E(category.label)}</strong>
                        <span>${category.count}R</span>
                        <small>的中内 ${category.percentage}%</small>
                      </article>
                    `).join("")
                  : renderEmpty("買い目区分の検証データがありません")}
              </div>
            </section>
          </div>
        </div>
      </details>

      <details
        class="result-accordion result-approval-accordion"
        data-result-panel="improvements"
        ${panelOpen("improvements")}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🔒</span>
          <h3 class="result-accordion-title">
            <span class="result-accordion-name">改善候補</span>
            <small>分析結果から作った未反映の提案</small>
          </h3>
          <span class="result-approval-chip ${improvementStatus.className}">
            ${improvementStatus.label}
          </span>
        </summary>

        <div class="result-accordion-body">
          <p class="result-panel-note">
            場別・展開別・外れ方別に弱点を検出します。
            表示されるのは提案だけで、予想ロジックや買い目は変更しません。
          </p>

          <div class="improvement-axis-grid">
            <div>
              <b>場別</b>
              <span>${E(improvementAnalysis.axisStatus.venue)}</span>
            </div>
            <div>
              <b>展開別</b>
              <span>${E(improvementAnalysis.axisStatus.scenario)}</span>
            </div>
            <div>
              <b>外れ方別</b>
              <span>${E(improvementAnalysis.axisStatus.miss)}</span>
            </div>
          </div>

          <div class="improvement-suggestion-list">
            ${improvementHtml}
          </div>
        </div>
      </details>
      <details
        class="result-accordion"
        data-result-panel="recent"
        ${panelOpen("recent")}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🏁</span>
          <h3 class="result-accordion-title">
            <span class="result-accordion-name">最近の予想と公式結果</span>
            <small>最新10Rをカードで比較</small>
          </h3>
          <span class="result-accordion-meta">${recentRows.length}R</span>
        </summary>

        <div class="result-accordion-body">
          <div class="result-race-list">
            ${recentHtml}
          </div>
        </div>
      </details>


      <details
        class="result-accordion"
        data-result-panel="breakdowns"
        ${panelOpen("breakdowns")}
      >
        <summary>
          <span class="result-accordion-icon" aria-hidden="true">🧭</span>
          <h3 class="result-accordion-title">
            <span class="result-accordion-name">場別・展開別の成績</span>
            <small>条件ごとの得意・不得意を比較</small>
          </h3>
          <span class="result-accordion-meta">
            ${venueGroups.length}場
          </span>
        </summary>

        <div class="result-accordion-body">
          <section class="result-subsection">
            <header>
              <h4>場別成績</h4>
            </header>
            <div class="result-data-grid">
              ${renderVenueCards(venueGroups)}
            </div>
          </section>

          <section class="result-subsection">
            <header>
              <h4>展開別成績</h4>
            </header>
            <div class="result-data-grid">
              ${renderScenarioCards(predictedScenarioGroups)}
            </div>
          </section>
        </div>
      </details>
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
