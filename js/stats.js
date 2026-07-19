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
  
      function buildRaceHistory(results) {
  const resultList =
    Array.isArray(results)
      ? results
      : [];

  const predictionList =
    typeof S.loadPredictionHistory ===
      "function"
      ? S.loadPredictionHistory()
      : [];

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

    function initStatsEvents() {
  renderStats();
}

window.ChappyStats = {
  renderStats,
  initStatsEvents
};

  document.addEventListener(
    "DOMContentLoaded",
    initStatsEvents
  );

})();