/* =========================================================
  チャッピーボートレースAI
  js/stats.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;
  const S = window.ChappyStorage;
  const OFFICIAL_SYNC_CONCURRENCY = 3;

  let officialSyncPromise = null;
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
                ${U.safeText(
                  item.honmeiFinish ||
                  "-"
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

              <td>
                ${U.safeText(
                  item.missType ||
                  "-"
                )}
              </td>
              

              <td>
                ${U.safeText(
                  item.missType ||
                  "-"
                )}
              </td>

              <td>
                ${U.safeText(
                  item.missType ||
                  "-"
                )}
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
        公式結果との照合状況
      </h3>

      <p>
        購入金額や回収率は使わず、
        保存済みの事前予想と同じレースの
        公式結果だけを照合します。
        結果待ちはアプリ起動時に
        自動確認します。
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
    <div class="v3-final-block">

      <h3>
        実戦厳選の判定内訳
      </h3>

      <div class="v3-table-wrap">

        <table class="table">

          <thead>
            <tr>
              <th>判定</th>
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

  async function initStatsEvents() {
    renderStats();

    try {
      await syncPendingOfficialResults();
    } catch (error) {
      console.error(
        "公式結果の自動照合エラー",
        error
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
  syncPendingOfficialResults
};

  document.addEventListener(
    "DOMContentLoaded",
    initStatsEvents
  );

})();