/* =========================================================
  チャッピーボートレースAI
  js/theory.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;

  function getEntries(data) {
    return data?.entries || data?.racers || data?.entry || [];
  }

  function calcSlitAlerts(entries) {
    const list = [];

    entries.forEach((boat, index) => {
      const st = U.safeNumber(boat.exhibitionST ?? boat.st ?? boat.avgST, null);
      if (st === null) return;

      const before = entries[index - 1];
      const after = entries[index + 1];

      const beforeST = before
        ? U.safeNumber(before.exhibitionST ?? before.st ?? before.avgST, null)
        : null;

      const afterST = after
        ? U.safeNumber(after.exhibitionST ?? after.st ?? after.avgST, null)
        : null;

      const diffBefore = beforeST !== null ? Math.abs(st - beforeST) : 0;
      const diffAfter = afterST !== null ? Math.abs(st - afterST) : 0;

      if (diffBefore >= 0.1 || diffAfter >= 0.1) {
        list.push({
          boatNo: boat.boatNo ?? boat.number ?? index + 1,
          name: boat.name ?? boat.racerName ?? "-",
          value: st,
          comment: "隣艇とスリット差0.10以上。隊形変化に注意。"
        });
      }
    });

    return list;
  }

  function calcDoubleTime(entries) {
    const ranked = entries
      .map((boat, index) => {
        const exhibition = U.safeNumber(boat.exhibitionTime ?? boat.tenjiTime, 99);
        const lap = U.safeNumber(boat.lapTime ?? boat.roundTime ?? boat.oneLapTime, 99);

        return {
          boatNo: boat.boatNo ?? boat.number ?? index + 1,
          name: boat.name ?? boat.racerName ?? "-",
          exhibition,
          lap,
          total: exhibition + lap
        };
      })
      .filter(x => x.exhibition < 99 || x.lap < 99);

    const exhibitionTop = [...ranked].sort((a, b) => a.exhibition - b.exhibition)[0] || null;
    const lapTop = [...ranked].sort((a, b) => a.lap - b.lap)[0] || null;

    return {
      exhibitionTop,
      lapTop,
      isDouble:
        exhibitionTop &&
        lapTop &&
        exhibitionTop.boatNo === lapTop.boatNo
    };
  }

  function calcNewSam(entries) {
    const list = entries
      .map((boat, index) => {
        const exhibition = U.safeNumber(boat.exhibitionTime ?? boat.tenjiTime, null);
        const lap = U.safeNumber(boat.lapTime ?? boat.roundTime ?? boat.oneLapTime, null);

        if (exhibition === null || lap === null) return null;

        return {
          boatNo: boat.boatNo ?? boat.number ?? index + 1,
          name: boat.name ?? boat.racerName ?? "-",
          total: exhibition + lap
        };
      })
      .filter(Boolean);

    if (!list.length) return [];

    const avg =
      list.reduce((sum, x) => sum + x.total, 0) / list.length;

    return list
      .map(x => ({
        ...x,
        diff: avg - x.total
      }))
      .filter(x => x.diff > 0)
      .sort((a, b) => b.diff - a.diff);
  }

  function analyzeTheory(data) {
    const entries = getEntries(data);

    return {
      slitAlerts: calcSlitAlerts(entries),
      doubleTime: calcDoubleTime(entries),
      newSam: calcNewSam(entries)
    };
  }

  function renderTheory(data) {
    const theory = analyzeTheory(data);

    const slitHtml = theory.slitAlerts.length
      ? theory.slitAlerts.map(x => `
          <div class="v3-theory-item">
            <div class="v3-theory-main">
              ${U.boatBadge(x.boatNo, "mini")}
              <strong>${U.escapeHtml(x.name)}</strong>
            </div>
            <p>${U.escapeHtml(x.comment)}</p>
          </div>
        `).join("")
      : U.showEmpty("スリットアラートなし");

    const d = theory.doubleTime;
    const doubleHtml = `
      <div class="v3-theory-item">
        <span class="v3-theory-label">展示1位</span>
        <div class="v3-theory-main">
          ${d.exhibitionTop ? U.boatBadge(d.exhibitionTop.boatNo, "mini") : ""}
          <strong>${U.escapeHtml(d.exhibitionTop?.name || "-")}</strong>
        </div>
        <p>展示タイム：${d.exhibitionTop?.exhibition ?? "-"}</p>
      </div>
      <div class="v3-theory-item">
        <span class="v3-theory-label">一周1位</span>
        <div class="v3-theory-main">
          ${d.lapTop ? U.boatBadge(d.lapTop.boatNo, "mini") : ""}
          <strong>${U.escapeHtml(d.lapTop?.name || "-")}</strong>
        </div>
        <p>一周タイム：${d.lapTop?.lap ?? "-"}</p>
      </div>
    `;

    const newSamHtml = theory.newSam.length
      ? theory.newSam.slice(0, 3).map(x => `
          <div class="v3-theory-item">
            <div class="v3-theory-main">
              ${U.boatBadge(x.boatNo, "mini")}
              <strong>${U.escapeHtml(x.name)}</strong>
            </div>
            <p>新サム差：+${U.round(x.diff, 3)}</p>
          </div>
        `).join("")
      : U.showEmpty("新サムプラスなし");

    U.setHtml("theorySummaryArea", `
      <div class="v3-theory-grid">
        ${doubleHtml}
      </div>
    `);

    U.setHtml("theoryAlertArea", `
      <div class="v3-section">
        <div class="v3-section-head">
          <h2>🚨 スリットアラート</h2>
        </div>
        <div class="v3-theory-grid">
          ${slitHtml}
        </div>
      </div>

      <div class="v3-section">
        <div class="v3-section-head">
          <h2>🌊 新サムアラート</h2>
        </div>
        <div class="v3-theory-grid">
          ${newSamHtml}
        </div>
      </div>
    `);

    return theory;
  }

  window.ChappyTheory = {
    getEntries,
    calcSlitAlerts,
    calcDoubleTime,
    calcNewSam,
    analyzeTheory,
    renderTheory
  };
})();