/* =========================================================
  チャッピーボートレースAI
  js/stats.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;
  const S = window.ChappyStorage;

  function calcPayout(odds, amount) {
    const o = U.safeNumber(odds, 0);
    const a = U.safeNumber(amount, 0);
    return Math.round(o * a);
  }

    function buildResultRecord({
    result,
    odds,
    amount
  }) {
    const normalizedResult =
      (
        String(result || "")
          .match(/[1-6]/g) || []
      )
        .slice(0, 3)
        .join("-");

    let predictionSnapshot = null;

    try {
      const raw =
        localStorage.getItem(
          "chappy_latest_prediction_v1"
        );

      predictionSnapshot =
        raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn(
        "保存予想の読み込みに失敗",
        error
      );
    }

    const predictionTickets =
      Array.isArray(
        predictionSnapshot?.ticketRanks
      )
        ? predictionSnapshot.ticketRanks
        : [];

    const matchedTicket =
      predictionTickets.find(item => {
        const normalizedTicket =
          (
            String(item?.ticket || "")
              .match(/[1-6]/g) || []
          )
            .slice(0, 3)
            .join("-");

        return (
          normalizedResult &&
          normalizedTicket ===
            normalizedResult
        );
      }) || null;

    return {
      result:
        U.safeText(result),
      odds:
        U.safeNumber(odds, 0),
      amount:
        U.safeNumber(amount, 0),
      payout:
        calcPayout(odds, amount),

      predictionChecked:
        Boolean(predictionSnapshot),
      predictionHit:
        Boolean(matchedTicket),
      predictionRank:
        matchedTicket?.rank || "",
      predictionScore:
        matchedTicket?.score || 0,
      predictionOdds:
        matchedTicket?.odds ?? null,
      predictionOddsValue:
        matchedTicket?.oddsValue || "",

      predictionRaceKey:
        predictionSnapshot?.raceKey || "",
      predictionPlace:
        predictionSnapshot?.place || "",
      predictionRaceNo:
        predictionSnapshot?.raceNo || 0,
      predictionDate:
        predictionSnapshot?.date || "",

      predictionTickets
    };
  }
  
    function calcActualStats(
    results
  ) {
    const list =
      Array.isArray(results)
        ? results
        : [];

    const purchases =
      typeof S.loadActualPurchases ===
        "function"
        ? S.loadActualPurchases()
        : [];

    const normalizeTicket =
      value => {
        const boats =
          String(value || "")
            .match(/[1-6]/g) || [];

        if (
          boats.length !== 3 ||
          new Set(boats).size !== 3
        ) {
          return "";
        }

        return boats.join("-");
      };

    const officialResultMap =
      new Map();

    list.forEach(record => {
      const raceKey =
        S.buildRaceKey(record);

      const resultTicket =
        normalizeTicket(
          record?.result
        );

      const payoutPer100 =
        U.safeNumber(
          record
            ?.officialPayoutPer100,
          0
        );

      const isOfficial =
        record?.recordType ===
          "official_result" ||
        record?.resultSource ===
          "boatrace-official";

      if (
        !raceKey ||
        !resultTicket ||
        payoutPer100 <= 0 ||
        !isOfficial ||
        officialResultMap.has(
          raceKey
        )
      ) {
        return;
      }

      officialResultMap.set(
        raceKey,
        {
          resultTicket,
          payoutPer100
        }
      );
    });

    const seenPurchaseKeys =
      new Set();

    const purchaseRaceKeys =
      new Set();

    const settledRaceKeys =
      new Set();

    const hitRaceKeys =
      new Set();

    let purchaseTicketCount = 0;
    let settledTicketCount = 0;
    let pendingTicketCount = 0;
    let hitTicketCount = 0;
    let totalPurchaseAmount = 0;
    let pendingBet = 0;
    let totalBet = 0;
    let totalPayout = 0;

    purchases.forEach(purchase => {
      const raceKey =
        S.buildRaceKey(purchase);

      const ticket =
        normalizeTicket(
          purchase?.ticket
        );

      const amount =
        U.safeNumber(
          purchase?.amount,
          0
        );

      const purchaseKey =
        raceKey && ticket
          ? (
              raceKey +
              "-" +
              ticket
            )
          : "";

      if (
        !raceKey ||
        !ticket ||
        !purchaseKey ||
        amount <= 0 ||
        seenPurchaseKeys.has(
          purchaseKey
        )
      ) {
        return;
      }

      seenPurchaseKeys.add(
        purchaseKey
      );

      purchaseTicketCount += 1;
      totalPurchaseAmount += amount;

      purchaseRaceKeys.add(
        raceKey
      );

      const officialResult =
        officialResultMap.get(
          raceKey
        );

      if (!officialResult) {
        pendingTicketCount += 1;
        pendingBet += amount;
        return;
      }

      settledTicketCount += 1;
      totalBet += amount;

      settledRaceKeys.add(
        raceKey
      );

      const isHit =
        ticket ===
        officialResult
          .resultTicket;

      if (!isHit) {
        return;
      }

      hitTicketCount += 1;

      hitRaceKeys.add(
        raceKey
      );

      totalPayout +=
        Math.round(
          (
            officialResult
              .payoutPer100 /
            100
          ) * amount
        );
    });

    const profit =
      totalPayout - totalBet;

    const recoveryRate =
      totalBet > 0
        ? (
            totalPayout /
            totalBet
          ) * 100
        : 0;

    const hitRate =
      settledRaceKeys.size > 0
        ? (
            hitRaceKeys.size /
            settledRaceKeys.size
          ) * 100
        : 0;

    return {
      purchaseTicketCount,

      purchaseRaceCount:
        purchaseRaceKeys.size,

      settledTicketCount,
      pendingTicketCount,
      hitTicketCount,

      settledRaceCount:
        settledRaceKeys.size,

      hitRaceCount:
        hitRaceKeys.size,

      totalPurchaseAmount,
      pendingBet,
      totalBet,
      totalPayout,
      profit,
      recoveryRate,
      hitRate
    };
  }
  
      function calcStats(results) {
    const list =
      Array.isArray(results)
        ? results
        : [];

    const count = list.length;

    const totalBet =
      list.reduce(
        (sum, record) =>
          sum +
          U.safeNumber(
            record.amount,
            0
          ),
        0
      );

    const totalPayout =
      list.reduce(
        (sum, record) =>
          sum +
          U.safeNumber(
            record.payout,
            0
          ),
        0
      );

    const profit =
      totalPayout - totalBet;

    const recoveryRate =
      totalBet > 0
        ? (
            totalPayout /
            totalBet
          ) * 100
        : 0;

    const normalizeTicket =
      value =>
        (
          String(value || "")
            .match(/[1-6]/g) || []
        )
          .slice(0, 3)
          .join("-");

    const createBucket =
      label => ({
        label,
        ticketCount: 0,
        hitCount: 0,
        theoreticalBet: 0,
        theoreticalPayout: 0
      });

    const rankStats = {
      S: createBucket("S"),
      A: createBucket("A"),
      B: createBucket("B"),
      C: createBucket("C")
    };

    const roleStats = {
      本命:
        createBucket("本命"),

      押さえ:
        createBucket("押さえ"),

      流し:
        createBucket("流し"),

      拾い:
        createBucket("拾い"),

      "穴・万舟候補":
        createBucket(
          "穴・万舟候補"
        )
    };

    const oddsValueStats = {};

    let predictionRaceCount = 0;
    let predictionHitCount = 0;
    let theoryTicketCount = 0;
    let theoryTotalBet = 0;
    let theoryTotalPayout = 0;

    const officialResults =
      list.filter(record => {
        const raceKey =
          S.buildRaceKey(record);

        const resultTicket =
          normalizeTicket(
            record?.result
          );

        const payoutPer100 =
          U.safeNumber(
            record
              ?.officialPayoutPer100,
            0
          );

        const isOfficial =
          record?.recordType ===
            "official_result" ||
          record?.resultSource ===
            "boatrace-official";

        return Boolean(
          raceKey &&
          resultTicket &&
          payoutPer100 > 0 &&
          isOfficial
        );
      });

    officialResults.forEach(record => {
      const raceKey =
        S.buildRaceKey(record);

      const savedPredictionKey =
        S.buildRaceKey(
          record?.predictionRaceKey ||
          ""
        );

      if (
        savedPredictionKey &&
        savedPredictionKey !==
          raceKey
      ) {
        return;
      }

      const prediction =
        S.findPredictionByRaceKey(
          raceKey
        );

      if (
        !prediction ||
        prediction.isRetrospective ||
        prediction.predictionMode ===
          "retrospective_reference"
      ) {
        return;
      }

      const seenTickets =
        new Set();

      const theoryTickets = [];

      (
        Array.isArray(
          prediction.ticketRanks
        )
          ? prediction.ticketRanks
          : []
      ).forEach(ticket => {
        const normalizedTicket =
          normalizeTicket(
            ticket?.ticket
          );

        const recommendedAmount =
          U.safeNumber(
            ticket
              ?.recommendedAmount,
            0
          );

        if (
          !normalizedTicket ||
          recommendedAmount <= 0 ||
          seenTickets.has(
            normalizedTicket
          )
        ) {
          return;
        }

        seenTickets.add(
          normalizedTicket
        );

        theoryTickets.push({
          ...ticket,
          normalizedTicket,
          recommendedAmount
        });
      });

      if (!theoryTickets.length) {
        return;
      }

      const actualTicket =
        normalizeTicket(
          record.result
        );

      const payoutPer100 =
        U.safeNumber(
          record
            .officialPayoutPer100,
          0
        );

      const matchedTicket =
        theoryTickets.find(
          ticket =>
            ticket
              .normalizedTicket ===
            actualTicket
        ) || null;

      const raceBet =
        theoryTickets.reduce(
          (sum, ticket) =>
            sum +
            ticket.recommendedAmount,
          0
        );

      const racePayout =
        matchedTicket
          ? Math.round(
              (
                payoutPer100 /
                100
              ) *
              matchedTicket
                .recommendedAmount
            )
          : 0;

      predictionRaceCount += 1;

      theoryTicketCount +=
        theoryTickets.length;

      theoryTotalBet +=
        raceBet;

      theoryTotalPayout +=
        racePayout;

      if (matchedTicket) {
        predictionHitCount += 1;
      }

      theoryTickets.forEach(ticket => {
        const isHit =
          ticket.normalizedTicket ===
          actualTicket;

        const rank =
          String(
            ticket?.rank || ""
          ).toUpperCase();

        const role =
          String(
            ticket?.role || ""
          );

        const oddsValue =
          String(
            ticket?.oddsValue ||
            "未判定"
          );

        const updateBucket =
          bucket => {
            bucket.ticketCount += 1;

            bucket.theoreticalBet +=
              ticket
                .recommendedAmount;

            if (isHit) {
              bucket.hitCount += 1;

              bucket
                .theoreticalPayout +=
                Math.round(
                  (
                    payoutPer100 /
                    100
                  ) *
                  ticket
                    .recommendedAmount
                );
            }
          };

        if (rankStats[rank]) {
          updateBucket(
            rankStats[rank]
          );
        }

        if (roleStats[role]) {
          updateBucket(
            roleStats[role]
          );
        }

        if (
          !oddsValueStats[
            oddsValue
          ]
        ) {
          oddsValueStats[
            oddsValue
          ] = createBucket(
            oddsValue
          );
        }

        updateBucket(
          oddsValueStats[
            oddsValue
          ]
        );
      });
    });

    const finalizeBucket =
      bucket => ({
        ...bucket,

        hitRate:
          bucket.ticketCount > 0
            ? (
                bucket.hitCount /
                bucket.ticketCount
              ) * 100
            : 0,

        recoveryRate:
          bucket.theoreticalBet > 0
            ? (
                bucket
                  .theoreticalPayout /
                bucket
                  .theoreticalBet
              ) * 100
            : 0
      });

    const finalizedRankStats =
      Object.fromEntries(
        Object.entries(
          rankStats
        ).map(
          ([key, bucket]) => [
            key,
            finalizeBucket(bucket)
          ]
        )
      );

    const finalizedRoleStats =
      Object.fromEntries(
        Object.entries(
          roleStats
        ).map(
          ([key, bucket]) => [
            key,
            finalizeBucket(bucket)
          ]
        )
      );

    const finalizedOddsValueStats =
      Object.fromEntries(
        Object.entries(
          oddsValueStats
        ).map(
          ([key, bucket]) => [
            key,
            finalizeBucket(bucket)
          ]
        )
      );

    const theoryProfit =
      theoryTotalPayout -
      theoryTotalBet;

    const theoryRecoveryRate =
      theoryTotalBet > 0
        ? (
            theoryTotalPayout /
            theoryTotalBet
          ) * 100
        : 0;

    return {
      count,
      totalBet,
      totalPayout,
      profit,
      recoveryRate,

      predictionRaceCount,
      predictionHitCount,

      predictionHitRate:
        predictionRaceCount > 0
          ? (
              predictionHitCount /
              predictionRaceCount
            ) * 100
          : 0,

      theoryTicketCount,
      theoryTotalBet,
      theoryTotalPayout,
      theoryProfit,
      theoryRecoveryRate,

      rankStats:
        finalizedRankStats,

      roleStats:
        finalizedRoleStats,

      oddsValueStats:
        finalizedOddsValueStats
    };
  }
    function buildRaceHistory(results) {
    const resultList =
      Array.isArray(results) ? results : [];

    const predictionList =
      typeof S.loadPredictionHistory === "function"
        ? S.loadPredictionHistory()
        : [];

    const purchaseList =
      typeof S.loadActualPurchases === "function"
        ? S.loadActualPurchases()
        : [];

    const normalizeTicket = value => {
      const boats =
        String(value || "").match(/[1-6]/g) || [];

      if (
        boats.length !== 3 ||
        new Set(boats).size !== 3
      ) {
        return "";
      }

      return boats.join("-");
    };

    const raceMap = new Map();

    const ensureRace = source => {
      const raceKey = S.buildRaceKey(source);

      if (!raceKey) {
        return null;
      }

      const keyParts = raceKey.split("-");

      if (!raceMap.has(raceKey)) {
        raceMap.set(raceKey, {
          raceKey,
          date: keyParts[0] || "",
          jcd: keyParts[1] || "",
          raceNo: Number(keyParts[2] || 0),
          place: "",
          prediction: null,
          officialResult: null,
          actualPurchases: [],
          latestAt: ""
        });
      }

      const entry = raceMap.get(raceKey);

      const place = String(
        source?.place ||
        source?.predictionPlace ||
        ""
      ).trim();

      if (place) {
        entry.place = place;
      }

      const date = String(
        source?.date ||
        source?.predictionDate ||
        ""
      )
        .replace(/\D/g, "")
        .slice(0, 8);

      if (date.length === 8) {
        entry.date = date;
      }

      const rawJcd = String(
        source?.jcd ||
        source?.predictionJcd ||
        ""
      ).replace(/\D/g, "");

      const jcd = rawJcd
        ? rawJcd.padStart(2, "0").slice(-2)
        : "";

      if (jcd) {
        entry.jcd = jcd;
      }

      const raceNo = Number(
        source?.raceNo ??
        source?.rno ??
        source?.predictionRaceNo ??
        0
      );

      if (raceNo >= 1 && raceNo <= 12) {
        entry.raceNo = raceNo;
      }

      [
        source?.updatedAt,
        source?.officialCheckedAt,
        source?.savedAt
      ]
        .map(value => String(value || ""))
        .filter(Boolean)
        .forEach(value => {
          if (value > entry.latestAt) {
            entry.latestAt = value;
          }
        });

      return entry;
    };

    predictionList.forEach(prediction => {
      if (
        !prediction ||
        prediction.isRetrospective ||
        prediction.predictionMode ===
          "retrospective_reference"
      ) {
        return;
      }

      const entry = ensureRace(prediction);

      if (entry && !entry.prediction) {
        entry.prediction = prediction;
      }
    });

    resultList.forEach(record => {
      const isOfficial =
        record?.recordType ===
          "official_result" ||
        record?.resultSource ===
          "boatrace-official";

      const resultTicket =
        normalizeTicket(record?.result);

      const payoutPer100 = U.safeNumber(
        record?.officialPayoutPer100,
        0
      );

      if (
        !isOfficial ||
        !resultTicket ||
        payoutPer100 <= 0
      ) {
        return;
      }

      const entry = ensureRace(record);

      if (entry && !entry.officialResult) {
        entry.officialResult = record;
      }
    });

    purchaseList.forEach(purchase => {
      const entry = ensureRace(purchase);

      if (entry) {
        entry.actualPurchases.push(purchase);
      }
    });

    return Array.from(raceMap.values())
      .map(entry => {
        const officialResult =
          entry.officialResult;

        const resultTicket =
          normalizeTicket(
            officialResult?.result
          );

        const payoutPer100 = U.safeNumber(
          officialResult
            ?.officialPayoutPer100,
          0
        );

        const isSettled = Boolean(
          officialResult &&
          resultTicket &&
          payoutPer100 > 0
        );

        const predictionTickets = [];
        const seenPredictionTickets =
          new Set();

        const sourceTickets = Array.isArray(
          entry.prediction?.ticketRanks
        )
          ? entry.prediction.ticketRanks
          : [];

        sourceTickets.forEach(ticket => {
          const normalizedTicket =
            normalizeTicket(ticket?.ticket);

          if (
            !normalizedTicket ||
            seenPredictionTickets.has(
              normalizedTicket
            )
          ) {
            return;
          }

          seenPredictionTickets.add(
            normalizedTicket
          );

          predictionTickets.push({
            ...ticket,
            ticket: normalizedTicket,
            recommendedAmount: U.safeNumber(
              ticket?.recommendedAmount,
              0
            )
          });
        });

        const theoryTickets =
          predictionTickets.filter(
            ticket =>
              ticket.recommendedAmount > 0
          );

        const theoryBet =
          theoryTickets.reduce(
            (sum, ticket) =>
              sum +
              ticket.recommendedAmount,
            0
          );

        const theoryHitTicket = isSettled
          ? (
              theoryTickets.find(
                ticket =>
                  ticket.ticket ===
                  resultTicket
              ) || null
            )
          : null;

        const theoryPayout =
          theoryHitTicket
            ? Math.round(
                (
                  payoutPer100 /
                  100
                ) *
                theoryHitTicket
                  .recommendedAmount
              )
            : 0;

        const theoryProfit =
          isSettled &&
          theoryTickets.length > 0
            ? theoryPayout - theoryBet
            : null;

        let theoryStatus = "予想なし";

        if (entry.prediction) {
          if (!isSettled) {
            theoryStatus = "結果待ち";
          } else if (!theoryTickets.length) {
            theoryStatus = "購入額なし";
          } else {
            theoryStatus = theoryHitTicket
              ? "的中"
              : "不的中";
          }
        }

        const actualPurchases = [];
        const seenActualTickets = new Set();

        entry.actualPurchases.forEach(
          purchase => {
            const ticket =
              normalizeTicket(
                purchase?.ticket
              );

            const amount = U.safeNumber(
              purchase?.amount,
              0
            );

            if (
              !ticket ||
              amount <= 0 ||
              seenActualTickets.has(ticket)
            ) {
              return;
            }

            seenActualTickets.add(ticket);

            actualPurchases.push({
              ...purchase,
              ticket,
              amount,
              isHit:
                isSettled &&
                ticket === resultTicket
            });
          }
        );

        const actualBet =
          actualPurchases.reduce(
            (sum, purchase) =>
              sum + purchase.amount,
            0
          );

        const actualHitPurchase =
          isSettled
            ? (
                actualPurchases.find(
                  purchase =>
                    purchase.ticket ===
                    resultTicket
                ) || null
              )
            : null;

        const actualPayout =
          actualHitPurchase
            ? Math.round(
                (
                  payoutPer100 /
                  100
                ) *
                actualHitPurchase.amount
              )
            : 0;

        const actualProfit =
          isSettled &&
          actualPurchases.length > 0
            ? actualPayout - actualBet
            : null;

        let actualStatus = "実購入なし";

        if (actualPurchases.length > 0) {
          if (!isSettled) {
            actualStatus = "結果待ち";
          } else {
            actualStatus =
              actualHitPurchase
                ? "的中"
                : "不的中";
          }
        }

        return {
          raceKey: entry.raceKey,
          date: entry.date,
          place: entry.place,
          jcd: entry.jcd,
          raceNo: entry.raceNo,
          latestAt: entry.latestAt,

          prediction: entry.prediction,
          predictionTickets,

          officialResult,
          resultTicket,
          payoutPer100,

          winningMethod: String(
            officialResult
              ?.winningMethod || ""
          ),

          officialPopularity:
            officialResult
              ?.officialPopularity ?? null,

          raceStatus:
            isSettled
              ? "結果確定"
              : "結果待ち",

          theoryTickets,
          theoryBet,
          theoryPayout,
          theoryProfit,
          theoryHitTicket,
          theoryStatus,

          actualPurchases,
          actualBet,
          actualPayout,
          actualProfit,
          actualHitPurchase,
          actualStatus
        };
      })
      .sort(
        (a, b) =>
          String(
            b.latestAt || ""
          ).localeCompare(
            String(a.latestAt || "")
          ) ||
          String(b.raceKey).localeCompare(
            String(a.raceKey),
            "ja",
            { numeric: true }
          )
      );
  }
  
    function renderRaceHistory(results) {
    const history =
      buildRaceHistory(results);

    if (!history.length) {
      U.setHtml(
        "historyArea",
        `
          <div class="v3-final-block">
            <h3>
              レース別履歴
            </h3>

            <p>
              保存された予想・公式結果・実購入はありません
            </p>
          </div>
        `
      );

      return;
    }

    const escapeText = value =>
      typeof U.escapeHtml === "function"
        ? U.escapeHtml(value)
        : String(value || "");

    const formatDate = value => {
      const digits =
        String(value || "")
          .replace(/\D/g, "")
          .slice(0, 8);

      if (digits.length !== 8) {
        return "日付不明";
      }

      return (
        digits.slice(0, 4) +
        "/" +
        digits.slice(4, 6) +
        "/" +
        digits.slice(6, 8)
      );
    };

    const formatResultMoney = value =>
      value === null
        ? "-"
        : U.formatMoney(value);

    const renderPredictionRows = item =>
      item.predictionTickets
        .map(ticket => {
          const scenarioText =
            Array.isArray(
              ticket?.scenarioTypes
            ) &&
            ticket.scenarioTypes.length > 0
              ? ticket.scenarioTypes
                  .map(escapeText)
                  .join(" / ")
              : "-";

          const resultText =
            item.raceStatus !== "結果確定"
              ? "結果待ち"
              : ticket.ticket ===
                item.resultTicket
                ? "結果一致"
                : "-";

          const amountText =
            ticket.recommendedAmount > 0
              ? U.formatMoney(
                  ticket.recommendedAmount
                )
              : "未配分";

          return `
            <tr>
              <td>
                ${escapeText(ticket.ticket)}
              </td>
              <td>
                ${escapeText(
                  ticket.role ||
                  "分類未保存"
                )}
              </td>
              <td>
                ${scenarioText}
              </td>
              <td>
                ${amountText}
              </td>
              <td>
                ${resultText}
              </td>
            </tr>
          `;
        })
        .join("");

    const renderActualRows = item =>
      item.actualPurchases
        .map(purchase => {
          const purchaseOdds =
            U.safeNumber(
              purchase?.purchaseOdds,
              0
            );

          const oddsText =
            purchaseOdds > 0
              ? U.formatOdds(
                  purchaseOdds
                )
              : "-";

          const resultText =
            item.raceStatus !== "結果確定"
              ? "結果待ち"
              : purchase.isHit
                ? "的中"
                : "不的中";

          return `
            <tr>
              <td>
                ${escapeText(
                  purchase.ticket
                )}
              </td>
              <td>
                ${U.formatMoney(
                  purchase.amount
                )}
              </td>
              <td>
                ${oddsText}
              </td>
              <td>
                ${resultText}
              </td>
            </tr>
          `;
        })
        .join("");

    U.setHtml(
      "historyArea",
      `
        <div class="v3-final-block">
          <h3>
            レース別履歴
          </h3>

          <p>
            予想・公式結果・的中・実購入・払戻・収支を
            同じレースごとに表示します
          </p>
        </div>

        ${history
          .map(item => {
            const placeText =
              item.place
                ? escapeText(item.place)
                : item.jcd
                  ? "場コード" +
                    escapeText(item.jcd)
                  : "場不明";

            const officialPopularity =
              U.safeNumber(
                item.officialPopularity,
                0
              );

            const popularityText =
              officialPopularity > 0
                ? " / " +
                  officialPopularity +
                  "番人気"
                : "";

            const winningMethodText =
              item.winningMethod
                ? " / 決まり手 " +
                  escapeText(
                    item.winningMethod
                  )
                : "";

            const resultHtml =
              item.raceStatus ===
                "結果確定"
                ? `
                    <p>
                      結果：
                      <strong>
                        ${escapeText(
                          item.resultTicket
                        )}
                      </strong>
                      / 公式100円払戻：
                      <strong>
                        ${U.formatMoney(
                          item.payoutPer100
                        )}
                      </strong>
                      ${popularityText}
                      ${winningMethodText}
                    </p>
                  `
                : `
                    <p>
                      公式結果：結果待ち
                    </p>
                  `;

            const predictionHtml =
              item.predictionTickets.length > 0
                ? `
                    <div class="v3-table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>AI買い目</th>
                            <th>役割</th>
                            <th>成立展開</th>
                            <th>推奨購入</th>
                            <th>結果</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${renderPredictionRows(
                            item
                          )}
                        </tbody>
                      </table>
                    </div>
                  `
                : `
                    <p>
                      保存されたAI予想はありません
                    </p>
                  `;

            const actualHtml =
              item.actualPurchases.length > 0
                ? `
                    <div class="v3-table-wrap">
                      <table class="table">
                        <thead>
                          <tr>
                            <th>実購入</th>
                            <th>購入額</th>
                            <th>購入時オッズ</th>
                            <th>結果</th>
                          </tr>
                        </thead>

                        <tbody>
                          ${renderActualRows(
                            item
                          )}
                        </tbody>
                      </table>
                    </div>
                  `
                : `
                    <p>
                      実購入は記録されていません
                    </p>
                  `;

            return `
              <article class="v3-final-block">
                <h3>
                  ${formatDate(item.date)}
                  ${placeText}
                  ${item.raceNo}R
                </h3>

                <p>
                  ${escapeText(item.raceStatus)}
                </p>

                ${resultHtml}

                <h4>
                  レース成績
                </h4>

                <div class="v3-table-wrap">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>区分</th>
                        <th>判定</th>
                        <th>購入</th>
                        <th>払戻</th>
                        <th>収支</th>
                      </tr>
                    </thead>

                    <tbody>
                      <tr>
                        <td>AI理論</td>
                        <td>
                          ${escapeText(
                            item.theoryStatus
                          )}
                        </td>
                        <td>
                          ${U.formatMoney(
                            item.theoryBet
                          )}
                        </td>
                        <td>
                          ${formatResultMoney(
                            item.theoryProfit ===
                              null
                              ? null
                              : item.theoryPayout
                          )}
                        </td>
                        <td>
                          ${formatResultMoney(
                            item.theoryProfit
                          )}
                        </td>
                      </tr>

                      <tr>
                        <td>実購入</td>
                        <td>
                          ${escapeText(
                            item.actualStatus
                          )}
                        </td>
                        <td>
                          ${U.formatMoney(
                            item.actualBet
                          )}
                        </td>
                        <td>
                          ${formatResultMoney(
                            item.actualProfit ===
                              null
                              ? null
                              : item.actualPayout
                          )}
                        </td>
                        <td>
                          ${formatResultMoney(
                            item.actualProfit
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <h4>
                  実購入明細
                </h4>

                ${actualHtml}
              </article>
            `;
          })
          .join("")}
      `
    );
  }
    function renderStats() {
  const results = S.loadResults();
  const history = buildRaceHistory(results);

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

  const predictionRows =
    history
      .filter(item =>
        Boolean(item?.prediction)
      )
      .map(item => {
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

        const honmeiBoat =
          normalizeTicket(
            mainTicket?.ticket
          ).split("-")[0] || "";

        const practicalTickets =
          derivePracticalTickets(
            item.predictionTickets
          );

        const settled =
          item.raceStatus ===
            "結果確定" &&
          Boolean(resultTicket);

        return {
          ...item,
          resultTicket,
          honmeiBoat,
          practicalTickets,
          settled,

          honmeiHit:
            settled &&
            resultTicket
              .split("-")[0] ===
              honmeiBoat,

          practicalHit:
            settled &&
            practicalTickets.includes(
              resultTicket
            )
        };
      });

  const settledRows =
    predictionRows.filter(
      item => item.settled
    );

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
          practicalHits: 0
        });
      }

      const bucket =
        map.get(label);

      bucket.count += 1;

      if (item.honmeiHit) {
        bucket.honmeiHits += 1;
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

  const methodGroups =
    buildGroups(
      settledRows,
      item =>
        item.winningMethod ||
        "不明"
    );

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
              </tr>
            `)
            .join("")
        : `
            <tr>
              <td colspan="4">
                検証データがありません
              </td>
            </tr>
          `;

  const recentRows =
    settledRows.slice(0, 10);

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
                ${item.honmeiHit
                  ? "◎"
                  : "×"}
              </td>

              <td>
                ${
                  item.practicalTickets
                    .length === 0
                    ? "見送り"
                    : item.practicalHit
                      ? "的中"
                      : "不的中"
                }
              </td>
            </tr>
          `)
          .join("")
      : `
          <tr>
            <td colspan="6">
              公式結果と照合できる予想がありません
            </td>
          </tr>
        `;

  const sampleMessage =
    settledRows.length < 30
      ? `
        ⚠️ サンプル不足：
        現在${settledRows.length}レース。
        30レース未満の数値は参考値として扱います。
      `
      : `
        ${settledRows.length}レースの
        公式結果で検証しています。
      `;

  U.setHtml("statsArea", `
    <div class="v3-final-block">

      <h3>
        AI予想の検証結果
      </h3>

      <p>
        購入金額や回収率は使わず、
        保存済みの事前予想と同じレースの
        公式結果だけを照合しています。
      </p>

      <p>
        ${sampleMessage}
      </p>

    </div>


    <div class="v3-final-grid">

      <div class="v3-final-block">
        <h3>AI予想数</h3>

        <p>
          ${predictionRows.length}
          レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>結果確定</h3>

        <p>
          ${settledRows.length}
          レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>結果待ち</h3>

        <p>
          ${
            predictionRows.length -
            settledRows.length
          }
          レース
        </p>
      </div>


      <div class="v3-final-block">
        <h3>◎1着率</h3>

        <p>
          ${honmeiHits}
          /
          ${settledRows.length}
          （${rate(
            honmeiHits,
            settledRows.length
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
              <th>レース</th>
              <th>◎</th>
              <th>公式着順</th>
              <th>◎1着</th>
              <th>実戦厳選</th>
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
  `);

  U.setHtml(
    "historyArea",
    `
      <div class="v3-final-block">

        <h3>
          検証について
        </h3>

        <p>
          振り返り予想は成績に含めず、
          レース前に保存されたAI予想だけを
          公式結果と照合します。
        </p>

      </div>
    `
  );
}

    function updateAutoPayout() {
    const odds =
      U.byId(
        "oddsInput"
      )?.value;

    const amount =
      U.byId(
        "betAmountInput"
      )?.value;

    const estimatedPayout =
      calcPayout(
        odds,
        amount
      );

    U.setText(
      "autoPayoutText",
      `的中時の想定払戻：${U.formatMoney(estimatedPayout)}`
    );
  }

    function saveCurrentResult() {
    const ticketInput =
      U.byId(
        "raceResultInput"
      )?.value;

    const odds =
      U.byId(
        "oddsInput"
      )?.value;

    const amount =
      U.byId(
        "betAmountInput"
      )?.value;

    const boats =
      String(ticketInput || "")
        .match(/[1-6]/g) || [];

    if (
      boats.length !== 3 ||
      new Set(boats).size !== 3
    ) {
      alert(
        "購入した3連単を入力してください（例：1-2-3）"
      );

      return;
    }

    const purchaseAmount =
      U.safeNumber(amount, 0);

    if (purchaseAmount <= 0) {
      alert(
        "購入金額を入力してください"
      );

      return;
    }

    try {
      const getRaceParams =
        window
          .ChappyRaceSelection
          ?.getRaceParams;

      if (
        typeof getRaceParams !==
        "function"
      ) {
        throw new Error(
          "選択中のレース情報を取得できません"
        );
      }

      const params =
        getRaceParams();

      const raceKey =
        S.buildRaceKey({
          date: params.date,
          jcd: params.jcd,
          raceNo: params.rno
        });

      if (!raceKey) {
        throw new Error(
          "実購入を保存するレースを特定できません"
        );
      }

      S.upsertActualPurchase({
        recordType:
          "actual_purchase",

        raceKey,
        date: params.date,
        place: params.place,
        jcd: params.jcd,
        raceNo: params.rno,

        ticket:
          boats.join("-"),

        amount:
          purchaseAmount,

        purchaseOdds:
          U.safeNumber(odds, 0)
      });

      U.byId(
        "raceResultInput"
      ).value = "";

      U.byId(
        "oddsInput"
      ).value = "";

      U.byId(
        "betAmountInput"
      ).value = "100";

      updateAutoPayout();
      renderStats();

    } catch (error) {
      console.error(error);

      alert(
        error?.message ||
        "実購入の保存に失敗しました"
      );
    }
  }

    function undoLatestResult() {
    S.removeLatestActualPurchase();
    renderStats();
  }

    function initStatsEvents() {
    U.byId("oddsInput")
      ?.addEventListener(
        "input",
        updateAutoPayout
      );

    U.byId("betAmountInput")
      ?.addEventListener(
        "input",
        updateAutoPayout
      );

    U.byId("saveResultBtn")
      ?.addEventListener(
        "click",
        saveCurrentResult
      );

    U.byId("undoResultBtn")
      ?.addEventListener(
        "click",
        undoLatestResult
      );

    updateAutoPayout();
    renderStats();
  }

  window.ChappyStats = {
    calcPayout,
    buildResultRecord,
    calcStats,
    renderStats,
    updateAutoPayout,
    saveCurrentResult,
    undoLatestResult,
    initStatsEvents
  };

  document.addEventListener(
    "DOMContentLoaded",
    initStatsEvents
  );

})();