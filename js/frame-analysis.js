// js/frame-analysis.js
// 公式結果から現在の枠における選手別成績を表示する。
// 第一段階では予想点へ加算せず、参考表示だけに使用する。

(function () {
  "use strict";

  const MIN_FRAME_SAMPLES = 12;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatRate(value) {
    const number = Number(value);

    return Number.isFinite(number)
      ? `${number.toFixed(1)}%`
      : "-";
  }

  function formatSt(value) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }

    const number = Number(value);

    return Number.isFinite(number)
      ? number.toFixed(3)
      : "-";
  }
    function formatRateDifference(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }
    const number =
      Number(value);

    if (!Number.isFinite(number)) {
      return "-";
    }

    const sign =
      number > 0 ? "+" : "";

    return (
      `${sign}${number.toFixed(1)}` +
      "pt"
    );
  }

    function formatStDifference(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return "-";
    }

    const number =
      Number(value);

    if (!Number.isFinite(number)) {
      return "-";
    }

    const sign =
      number > 0 ? "+" : "";

    return (
      `${sign}${number.toFixed(3)}` +
      "秒"
    );
  }
  function calculateDifference(
    value,
    baseline,
    digits = 1
  ) {
    const current =
      Number(value);

    const standard =
      Number(baseline);

    if (
      !Number.isFinite(current) ||
      !Number.isFinite(standard)
    ) {
      return null;
    }

    return Number(
      (
        current - standard
      ).toFixed(digits)
    );
  }
    function judgeFrameCompatibility({
    samples,
    venueSamples,
    winRateDifference,
    top3RateDifference,
    averageStDifference
  }) {
    if (
      samples <
        MIN_FRAME_SAMPLES ||
      venueSamples < 30
    ) {
      return {
        label: "判定保留",
        score: 0
      };
    }

    let score = 0;

    if (
      winRateDifference !== null
    ) {
      if (
        winRateDifference >= 5
      ) {
        score += 1;
      } else if (
        winRateDifference <= -5
      ) {
        score -= 1;
      }
    }

    if (
      top3RateDifference !== null
    ) {
      if (
        top3RateDifference >= 8
      ) {
        score += 1;
      } else if (
        top3RateDifference <= -8
      ) {
        score -= 1;
      }
    }

    if (
      averageStDifference !== null
    ) {
      if (
        averageStDifference <=
        -0.02
      ) {
        score += 1;
      } else if (
        averageStDifference >=
        0.02
      ) {
        score -= 1;
      }
    }

    if (score >= 2) {
      return {
        label: "強い",
        score
      };
    }

    if (score <= -2) {
      return {
        label: "弱い",
        score
      };
    }

    return {
      label: "標準",
      score
    };
  }
  function getFrameRows(prediction) {
    const entries =
      Array.isArray(
        prediction?.race?.entries
      )
        ? [...prediction.race.entries]
            .sort(
              (a, b) =>
                Number(a?.boatNo || 0) -
                Number(b?.boatNo || 0)
            )
        : [];

        const historyContext =
      prediction?.race
        ?.historyContext || {};

    const racers =
      Array.isArray(
        historyContext.racers
      )
        ? historyContext.racers
        : [];

    const venue =
      historyContext.venue || null;

    const venueFrames =
      venue?.boatPerformance || {};

    return entries.map(entry => {
      const boatNo =
        Number(entry?.boatNo || 0);

      const registerNo =
        String(
          entry?.registerNo || ""
        );

      const racer =
        racers.find(
          item =>
            String(
              item?.registerNo || ""
            ) === registerNo
        ) || null;

      const frame =
        racer?.byBoat?.[
          String(boatNo)
        ] || null;

      const venueFrame =
        venueFrames[
          String(boatNo)
        ] || null;

      const samples =
        Number(
          frame?.starts || 0
        );
      const winRate =
        frame?.winRate;

      const top3Rate =
        frame?.top3Rate;

      const averageSt =
        frame?.averageSt;

      const venueSamples =
        Number(
          venueFrame?.starts || 0
        );

      const venueWinRate =
        venueFrame?.winRate;

      const venueTop3Rate =
        venueFrame?.top3Rate;

      const venueAverageSt =
        venueFrame?.averageSt;

      const winRateDifference =
        calculateDifference(
          winRate,
          venueWinRate
        );

      const top3RateDifference =
        calculateDifference(
          top3Rate,
          venueTop3Rate
        );

            const averageStDifference =
        calculateDifference(
          averageSt,
          venueAverageSt,
          3
        );

      const compatibility =
        judgeFrameCompatibility({
          samples,
          venueSamples,
          winRateDifference,
          top3RateDifference,
          averageStDifference
        });

      return {
        boatNo,
        racerName:
          entry?.racerName ||
          racer?.racerName ||
          "-",
                samples,
        winRate,
        top3Rate,
        averageSt,

        venueSamples,
        venueWinRate,
        venueTop3Rate,
        venueAverageSt,

        winRateDifference,
        top3RateDifference,
        averageStDifference,

        compatibility:
          compatibility.label,

        compatibilityScore:
          compatibility.score,

        usable:
          samples >=
          MIN_FRAME_SAMPLES
      };
    });
  }

  function renderFrameAnalysis(
    prediction
  ) {
    const container =
      document.querySelector(
        ".v3-official-history-section .v3-final-grid"
      );

    if (!container) {
      return;
    }

    container
      .querySelector(
        ".v3-frame-analysis-block"
      )
      ?.remove();

    const rows =
      getFrameRows(prediction);

    const usableCount =
      rows.filter(
        row => row.usable
      ).length;

    const rowsHtml =
      rows.length
        ? rows
            .map(row => `
              <tr>
                <td>
                  ${escapeHtml(
                    row.boatNo
                      ? `${row.boatNo}号艇`
                      : "-"
                  )}
                </td>

                <td>
                  ${escapeHtml(
                    row.racerName
                  )}
                </td>

                <td>
                  ${row.samples}
                </td>

                <td>
                  ${formatRate(
                    row.winRate
                  )}
                </td>

                <td>
                  ${formatRate(
                    row.top3Rate
                  )}
                </td>

                <td>
                  ${formatSt(
                    row.averageSt
                  )}
                </td>

                <td>
                  ${
                    row.samples === 0
                      ? "データなし"
                      : row.usable
                        ? "参考可"
                        : "サンプル不足"
                  }
                </td>
              </tr>
            `)
            .join("")
        : `
            <tr>
              <td colspan="7">
                枠別履歴を表示できません
              </td>
            </tr>
          `;

    const block =
      document.createElement("div");

    block.className =
      "v3-final-block v3-frame-analysis-block";

    block.innerHTML = `
      <h3>■ 枠別分析</h3>

      <p>
        現在の艇番と同じ枠で
        12走以上：
        ${usableCount}名
        ／ 出場${rows.length}名
      </p>

      <p>
        この段階では予想点へ加算せず、
        公式履歴の参考表示だけに使用します。
      </p>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>出走</th>
              <th>1着率</th>
              <th>3連対率</th>
              <th>平均ST</th>
              <th>判定</th>
            </tr>
          </thead>

          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    container.appendChild(block);
  }

  const originalRenderAll =
    window.renderAll;

  const originalRenderPrediction =
    window.renderPrediction;

  if (
    typeof originalRenderAll !==
    "function"
  ) {
    console.warn(
      "[Frame Analysis] renderAllが見つかりません"
    );

    return;
  }

  function renderAllWithFrameAnalysis(
    prediction
  ) {
    const result =
      originalRenderAll.call(
        this,
        prediction
      );

    renderFrameAnalysis(
      prediction
    );

    return result;
  }

  window.renderAll =
    renderAllWithFrameAnalysis;

  window.renderPrediction =
    originalRenderPrediction ===
    originalRenderAll
      ? renderAllWithFrameAnalysis
      : function (prediction) {
          const result =
            typeof originalRenderPrediction ===
            "function"
              ? originalRenderPrediction.call(
                  this,
                  prediction
                )
              : originalRenderAll.call(
                  this,
                  prediction
                );

          renderFrameAnalysis(
            prediction
          );

          return result;
        };

  window.ChappyFrameAnalysis =
    Object.freeze({
      getFrameRows,
      renderFrameAnalysis,
      minSamples:
        MIN_FRAME_SAMPLES
    });
})();