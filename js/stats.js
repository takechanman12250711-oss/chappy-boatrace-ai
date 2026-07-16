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
    const odds = U.byId("oddsInput")?.value;
    const amount = U.byId("betAmountInput")?.value;
    const payout = calcPayout(odds, amount);
    U.setText("autoPayoutText", `払戻金：${U.formatMoney(payout)}`);
  }

  function saveCurrentResult() {
    const result = U.byId("raceResultInput")?.value;
    const odds = U.byId("oddsInput")?.value;
    const amount = U.byId("betAmountInput")?.value;

    if (!result) {
      alert("結果を入力してください");
      return;
    }

    const record = buildResultRecord({ result, odds, amount });
    S.addResult(record);

    U.byId("raceResultInput").value = "";
    U.byId("oddsInput").value = "";
    U.byId("betAmountInput").value = "100";

    updateAutoPayout();
    renderStats();
  }

  function undoLatestResult() {
    S.removeLatestResult();
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