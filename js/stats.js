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

    const normalizeTicket = value =>
      (
        String(value || "")
          .match(/[1-6]/g) || []
      )
        .slice(0, 3)
        .join("-");

    const createBucket = label => ({
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

    const oddsValueStats = {};

    const checkedResults =
      list.filter(
        record =>
          record?.predictionChecked &&
          Array.isArray(
            record.predictionTickets
          )
      );

    checkedResults.forEach(record => {
      const actualTicket =
        normalizeTicket(record.result);

      record.predictionTickets.forEach(
        ticket => {
          const predictedTicket =
            normalizeTicket(
              ticket?.ticket
            );

          const isHit =
            Boolean(actualTicket) &&
            predictedTicket ===
              actualTicket;

          const rank =
            String(
              ticket?.rank || ""
            ).toUpperCase();

          const oddsValue =
            String(
              ticket?.oddsValue ||
              "未判定"
            );

          const odds =
            U.safeNumber(
              ticket?.odds,
              0
            );

          const updateBucket =
            bucket => {
              bucket.ticketCount += 1;
              bucket.theoreticalBet +=
                100;

              if (isHit) {
                bucket.hitCount += 1;
                bucket.theoreticalPayout +=
                  Math.round(
                    odds * 100
                  );
              }
            };

          if (rankStats[rank]) {
            updateBucket(
              rankStats[rank]
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
        }
      );
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

    const predictionHitCount =
      checkedResults.filter(
        record =>
          record.predictionHit
      ).length;

    return {
      count,
      totalBet,
      totalPayout,
      profit,
      recoveryRate,

      predictionRaceCount:
        checkedResults.length,
      predictionHitCount,
      predictionHitRate:
        checkedResults.length > 0
          ? (
              predictionHitCount /
              checkedResults.length
            ) * 100
          : 0,

      rankStats:
        finalizedRankStats,
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

    const rankBuckets =
      ["S", "A", "B", "C"]
        .map(
          rank =>
            stats.rankStats?.[rank]
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
      <div class="v3-final-grid">
        <div class="v3-final-block">
          <h3>購入数</h3>
          <p>${stats.count}件</p>
        </div>

        <div class="v3-final-block">
          <h3>総購入</h3>
          <p>
            ${U.formatMoney(
              stats.totalBet
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>総払戻</h3>
          <p>
            ${U.formatMoney(
              stats.totalPayout
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>収支</h3>
          <p>
            ${U.formatMoney(
              stats.profit
            )}
          </p>
        </div>

        <div class="v3-final-block">
          <h3>回収率</h3>
          <p>
            ${U.round(
              stats.recoveryRate,
              1
            )}%
          </p>
        </div>

        <div class="v3-final-block">
          <h3>AI予想検証</h3>
          <p>
            ${stats.predictionRaceCount}
            レース中
            ${stats.predictionHitCount}
            レース的中
          </p>
          <p>
            的中率
            ${U.round(
              stats.predictionHitRate,
              1
            )}%
          </p>
        </div>
      </div>

      <div class="v3-final-block">
        <h3>
          S・A・B・C評価別
        </h3>

        <div class="v3-table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>評価</th>
                <th>候補</th>
                <th>的中</th>
                <th>理論回収率</th>
              </tr>
            </thead>
            <tbody>
              ${renderBucketRows(
                rankBuckets
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
    U.byId("oddsInput")?.addEventListener("input", updateAutoPayout);
    U.byId("betAmountInput")?.addEventListener("input", updateAutoPayout);
    U.byId("saveResultBtn")?.addEventListener("click", saveCurrentResult);
    U.byId("undoResultBtn")?.addEventListener("click", undoLatestResult);

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
})();