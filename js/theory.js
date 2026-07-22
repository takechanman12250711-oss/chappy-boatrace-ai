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
    const ordered = entries
      .map((boat, index) => ({
        boat,
        boatNo: boat.boatNo ?? boat.number ?? index + 1,
        course: Number(
          boat.course ??
          boat.entryCourse ??
          boat.boatNo ??
          boat.number ??
          index + 1
        )
      }))
      .sort((a, b) => a.course - b.course);

    ordered.forEach((item, index) => {
      const boat = item.boat;
      const st = U.safeNumber(
        boat.exhibitionST ??
        boat.exhibitionSt ??
        boat.displayST ??
        boat.displaySt,
        null
      );
      if (st === null) return;

      const before = ordered[index - 1] || null;
      const after = ordered[index + 1] || null;

      const beforeST = before
        ? U.safeNumber(
            before.boat.exhibitionST ?? before.boat.exhibitionSt ??
            before.boat.displayST ?? before.boat.displaySt,
            null
          )
        : null;

      const afterST = after
        ? U.safeNumber(
            after.boat.exhibitionST ?? after.boat.exhibitionSt ??
            after.boat.displayST ?? after.boat.displaySt,
            null
          )
        : null;

      const comparisons = [
        beforeST !== null
          ? { boatNo: before.boatNo, diff: beforeST - st }
          : null,
        afterST !== null
          ? { boatNo: after.boatNo, diff: afterST - st }
          : null
      ].filter(Boolean);

      const fastest = comparisons
        .sort((a, b) => b.diff - a.diff)[0] || null;

      if (fastest && fastest.diff >= 0.1) {
        list.push({
          boatNo: item.boatNo,
          name: boat.name ?? boat.racerName ?? "-",
          value: st,
          comparedBoatNo: fastest.boatNo,
          diff: Math.round(fastest.diff * 100) / 100,
          comment:
            `隣の${fastest.boatNo}号艇より展示STで` +
            `${fastest.diff.toFixed(2)}速い。隊形変化に注意。`
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
