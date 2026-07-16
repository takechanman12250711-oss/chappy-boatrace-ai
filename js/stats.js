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
    function renderStats() {
    const results =
      S.loadResults();

    const stats =
      calcStats(results);
      
          const actualStats =
      calcActualStats(
        results
      );

    const renderBucketRows =
      buckets => {
        if (!buckets.length) {
          return `
            <tr>
              <td colspan="4">
                検証データがありません
              </td>
            </tr>
          `;
        }

        return buckets
          .map(bucket => `
            <tr>
              <td>
                ${U.safeText(
                  bucket.label
                )}
              </td>
              <td>
                ${bucket.ticketCount}点
              </td>
              <td>
                ${bucket.hitCount}件
                （${U.round(
                  bucket.hitRate,
                  1
                )}%）
              </td>
              <td>
                ${U.round(
                  bucket.recoveryRate,
                  1
                )}%
              </td>
            </tr>
          `)
          .join("");
      };

            const roleBuckets =
      [
        "本命",
        "押さえ",
        "流し",
        "拾い",
        "穴・万舟候補"
      ]
        .map(
          role =>
            stats.roleStats?.[role]
        )
        .filter(Boolean);

    const oddsValueOrder = [
      "低配当",
      "標準",
      "妙味あり",
      "穴妙味",
      "大穴妙味",
      "高配当注意",
      "未判定"
    ];

    const oddsValueBuckets =
      oddsValueOrder
        .map(
          label =>
            stats.oddsValueStats?.[
              label
            ]
        )
        .filter(
          bucket =>
            bucket &&
            bucket.ticketCount > 0
        );

    U.setHtml("statsArea", `
            <div class="v3-final-block">
        <h3>
          実購入成績
        </h3>

        <p>
          実際に保存した買い目を、
          同じレースの公式結果・公式払戻だけで
          照合した成績です。
          結果待ちは収支・回収率に含めません。
        </p>
      </div>

      <div class="v3-final-grid">
        <div class="v3-final-block">
          <h3>
            記録レース
          </h3>

          <p>
            ${actualStats.purchaseRaceCount}
            レース
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            記録買い目
          </h3>

          <p>
            ${actualStats.purchaseTicketCount}
            点
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            確定買い目
          </h3>

          <p>
            ${actualStats.settledTicketCount}
            点
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            結果待ち
          </h3>

          <p>
            ${actualStats.pendingTicketCount}
            点
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            実購入総額
          </h3>

          <p>
            ${U.formatMoney(
              actualStats
                .totalPurchaseAmount
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            結果待ち購入
          </h3>

          <p>
            ${U.formatMoney(
              actualStats.pendingBet
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            成績対象購入
          </h3>

          <p>
            ${U.formatMoney(
              actualStats.totalBet
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            公式払戻
          </h3>

          <p>
            ${U.formatMoney(
              actualStats.totalPayout
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            実収支
          </h3>

          <p>
            ${U.formatMoney(
              actualStats.profit
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            実回収率
          </h3>

          <p>
            ${U.round(
              actualStats.recoveryRate,
              1
            )}%
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            的中レース
          </h3>

          <p>
            ${actualStats.hitRaceCount}
            /
            ${actualStats.settledRaceCount}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            的中率
          </h3>

          <p>
            ${U.round(
              actualStats.hitRate,
              1
            )}%
          </p>
        </div>
      </div>
            <div class="v3-final-block">
        <h3>
          AI理論成績
        </h3>

        <p>
          AIの推奨購入額を使い、
          公式結果と自動照合した成績です
        </p>
      </div>

      <div class="v3-final-grid">
        <div class="v3-final-block">
          <h3>
            対象レース
          </h3>

          <p>
            ${stats.predictionRaceCount}
            レース
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            理論購入点数
          </h3>

          <p>
            ${stats.theoryTicketCount}
            点
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            理論購入
          </h3>

          <p>
            ${U.formatMoney(
              stats.theoryTotalBet
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            理論払戻
          </h3>

          <p>
            ${U.formatMoney(
              stats.theoryTotalPayout
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            理論収支
          </h3>

          <p>
            ${U.formatMoney(
              stats.theoryProfit
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            理論回収率
          </h3>

          <p>
            ${U.round(
              stats.theoryRecoveryRate,
              1
            )}%
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            的中レース
          </h3>

          <p>
            ${stats.predictionHitCount}
            /
            ${stats.predictionRaceCount}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>
            的中率
          </h3>

          <p>
            ${U.round(
              stats.predictionHitRate,
              1
            )}%
          </p>
        </div>
      </div>

      <div class="v3-final-block">
        <h3>
          買い目役割別
        </h3>

        <div class="v3-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>役割</th>
                <th>候補</th>
                <th>的中</th>
                <th>理論回収率</th>
              </tr>
            </thead>

            <tbody>
              ${renderBucketRows(
                roleBuckets
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div class="v3-final-block">
        <h3>
          オッズ妙味別
        </h3>

        <div class="v3-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>判定</th>
                <th>候補</th>
                <th>的中</th>
                <th>理論回収率</th>
              </tr>
            </thead>
            <tbody>
              ${renderBucketRows(
                oddsValueBuckets
              )}
            </tbody>
          </table>
        </div>
      </div>
    `);
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