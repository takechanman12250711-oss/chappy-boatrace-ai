// 場＋R番号別の公式3年履歴を参考表示する。
// 予想点・買い目・60点基準には加算しない。

(function () {
  "use strict";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function rate(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? `${parsed.toFixed(1)}%`
      : "-";
  }

  function methodRows(methods) {
    const rows = Array.isArray(methods)
      ? methods.slice(0, 5)
      : [];

    return rows.length
      ? rows
          .map(item =>
            `${escapeHtml(item.key)} ${rate(item.rate)}`
          )
          .join(" ／ ")
      : "データ確認中";
  }

  function frameRows(boats) {
    return Array.from(
      { length: 6 },
      (_, index) => {
        const boatNo = index + 1;
        const boat =
          boats?.[String(boatNo)] || {};

        return `
          <tr>
            <td>${boatNo}号艇</td>
            <td>${Number(boat.starts || 0)}</td>
            <td>${rate(boat.winRate)}</td>
            <td>${rate(boat.secondRate)}</td>
            <td>${rate(boat.thirdRate)}</td>
            <td>${rate(boat.outsideTop3Rate)}</td>
          </tr>
        `;
      }
    ).join("");
  }

  function renderVenueRaceAnalysis(
    prediction
  ) {
    const container =
      document.querySelector(
        ".v3-official-history-section .v3-final-grid"
      );

    if (!container) return;

    container
      .querySelector(
        ".v3-venue-race-analysis-block"
      )
      ?.remove();

    const history =
      prediction?.race
        ?.historyContext || {};
    const venueRace =
      history.venueRace || null;
    const trend =
      venueRace?.trend || null;

    if (!trend) return;

    const block =
      document.createElement("div");

    block.className =
      "v3-final-block v3-venue-race-analysis-block";

    if (!trend.available) {
      block.innerHTML = `
        <h3>■ 場＋R別 公式3年分析</h3>
        <p>
          同じ場・同じR番号の履歴が
          ${escapeHtml(trend.allSamples)}レースのため、
          30レース到達まで判定を保留します。
        </p>
      `;
      container.appendChild(block);
      return;
    }

    block.innerHTML = `
      <h3>■ 場＋R別 公式3年分析</h3>

      <div class="history-trend-head">
        <strong>${escapeHtml(trend.label)}</strong>
        <span>
          直近1年 ${escapeHtml(trend.recentSamples)}R
          ／ 3年合計 ${escapeHtml(trend.allSamples)}R
        </span>
      </div>

      <p>
        直近1年を優先し、過去2年を裏付けに使用。
        数字だけで買い目を作成・削除せず、
        60点基準も変更しません。
      </p>

      <div class="history-trend-metrics">
        <span>1号艇1着率<strong>${rate(trend.escapeRate)}</strong></span>
        <span>波乱発生率<strong>${rate(trend.roughRate)}</strong></span>
        <span>万舟率<strong>${rate(trend.manshuRate)}</strong></span>
        <span>外枠1着率<strong>${rate(trend.outsideWinRate)}</strong></span>
        <span>1号艇着外率<strong>${rate(trend.boatOneMissRate)}</strong></span>
      </div>

      <p>
        <strong>決まり手：</strong>
        ${methodRows(trend.winningMethods)}
      </p>

      <div class="v3-table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>枠</th>
              <th>出走</th>
              <th>1着率</th>
              <th>2着率</th>
              <th>3着率</th>
              <th>着外率</th>
            </tr>
          </thead>
          <tbody>
            ${frameRows(trend.boatPerformance)}
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

  if (typeof originalRenderAll !== "function") {
    console.warn(
      "[Venue Race Analysis] renderAllが見つかりません"
    );
    return;
  }

  function renderAllWithVenueRace(
    prediction
  ) {
    const result = originalRenderAll.call(
      this,
      prediction
    );
    renderVenueRaceAnalysis(prediction);
    return result;
  }

  window.renderAll =
    renderAllWithVenueRace;

  window.renderPrediction =
    originalRenderPrediction === originalRenderAll
      ? renderAllWithVenueRace
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

          renderVenueRaceAnalysis(prediction);
          return result;
        };

  window.ChappyVenueRaceAnalysis =
    Object.freeze({
      renderVenueRaceAnalysis
    });
})();
