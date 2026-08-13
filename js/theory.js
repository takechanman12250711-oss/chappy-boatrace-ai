/* =========================================================
  チャッピーボートレースAI
  js/theory.js 完全版
========================================================= */

(function () {
  "use strict";

  const U = window.ChappyUtils;

  function getEntries(data) {
    const core = window.ChappyAICore;
    if (typeof core?.getRaceEntries === "function") {
      const entries = core.getRaceEntries(data);
      if (entries.length) return entries;
    }
    return data?.entries || data?.racers || data?.entry || [];
  }

  function courseMappingOf(source) {
    const core = window.ChappyAICore;
    if (typeof core?.buildOfficialCourseMapping === "function") {
      const entries = Array.isArray(source)
        ? source
        : getEntries(source);
      return core.buildOfficialCourseMapping(
        entries.map((entry, index) => ({
          ...entry,
          boat: boatNoOf(entry, index + 1)
        }))
      );
    }

    return {
      formal: false,
      boatAtCourse(course) {
        return Number(course) || null;
      },
      courseOfBoat(boatNo) {
        return Number(boatNo) || null;
      }
    };
  }

  function boatNoOf(boat, fallback) {
    for (const value of [
      boat?.boat,
      boat?.waku,
      boat?.frame,
      boat?.boatNo,
      boat?.number
    ]) {
      const candidate = Number(value);
      if (
        Number.isInteger(candidate) &&
        candidate >= 1 &&
        candidate <= 6
      ) {
        return candidate;
      }
    }
    return fallback;
  }

  function calcSlitAlerts(entries, mapping = courseMappingOf(entries)) {
    const list = [];
    const ordered = entries
      .map((boat, index) => ({
        boat,
        boatNo: boatNoOf(boat, index + 1)
      }))
      .map(item => ({
        ...item,
        course: Number(
          mapping.courseOfBoat(item.boatNo) ??
          item.boatNo
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

  function calcDoubleTime(entries, mapping = courseMappingOf(entries)) {
    const ranked = entries
      .map((boat, index) => {
        const exhibition = U.safeNumber(boat.exhibitionTime ?? boat.tenjiTime, 99);
        const lap = U.safeNumber(boat.lapTime ?? boat.roundTime ?? boat.oneLapTime, 99);

        return {
          boatNo: boatNoOf(boat, index + 1),
          name: boat.name ?? boat.racerName ?? "-",
          exhibition,
          lap,
          total: exhibition + lap
        };
      })
      .filter(x => x.exhibition < 99 && x.lap < 99);

    const exhibitionTop = [...ranked].sort((a, b) => a.exhibition - b.exhibition)[0] || null;
    const lapTop = [...ranked].sort((a, b) => a.lap - b.lap)[0] || null;

    const isDouble = Boolean(
      exhibitionTop &&
      lapTop &&
      exhibitionTop.boatNo === lapTop.boatNo
    );
    const exhibitionSecond = [...ranked]
      .sort((a, b) => a.exhibition - b.exhibition)[1] || null;
    const lapSecond = [...ranked]
      .sort((a, b) => a.lap - b.lap)[1] || null;
    const exhibitionGap = isDouble && exhibitionSecond
      ? Math.max(
          0,
          exhibitionSecond.exhibition - exhibitionTop.exhibition
        )
      : 0;
    const lapGap = isDouble && lapSecond
      ? Math.max(0, lapSecond.lap - lapTop.lap)
      : 0;
    const confidence = isDouble
      ? Math.max(
          70,
          Math.min(
            100,
            70 +
            Math.min(15, Math.round(exhibitionGap * 150)) +
            Math.min(15, Math.round(lapGap * 75))
          )
        )
      : 0;
    const topBoatNo = isDouble
      ? Number(exhibitionTop.boatNo)
      : null;
    const topCourse = topBoatNo
      ? Number(mapping.courseOfBoat(topBoatNo) || topBoatNo)
      : null;
    const hasNonIdentityCourse = Boolean(
      mapping.formal === true &&
      topBoatNo &&
      topCourse !== topBoatNo
    );

    return {
      exhibitionTop,
      lapTop,
      isDouble,
      topBoat: topBoatNo,
      ...(hasNonIdentityCourse ? { topCourse } : {}),
      confidence,
      exhibitionGap: U.round(exhibitionGap, 3),
      lapGap: U.round(lapGap, 3),
      isOuterTarget: Boolean(topCourse >= 4 && topCourse <= 6)
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
          exhibitionTime: exhibition,
          lapTime: lap,
          total: U.round(exhibition + lap, 3)
        };
      })
      .filter(Boolean);

    const validBoatNos = new Set(
      list.map((boat) => Number(boat.boatNo))
    );
    const missingBoatNos = [1, 2, 3, 4, 5, 6]
      .filter((boatNo) => !validBoatNos.has(boatNo));
    const isFormal = list.length === 6 && missingBoatNos.length === 0;

    if (!list.length) {
      return {
        ranking: [],
        average: 0,
        isFormal: false,
        missingBoatNos
      };
    }

    const avg =
      list.reduce((sum, x) => sum + x.total, 0) / list.length;

    function gradeOf(diff) {
      if (diff >= 0.300) return "S";
      if (diff >= 0.200) return "A";
      if (diff >= 0.150) return "B";
      if (diff >= 0) return "C";
      return "D";
    }

    const ranking = list
      .map(x => ({
        ...x,
        diff: U.round(avg - x.total, 3)
      }))
      .map(x => ({
        ...x,
        grade: gradeOf(x.diff),
        isFormal
      }))
      .sort((a, b) => b.diff - a.diff || a.boatNo - b.boatNo);

    return {
      ranking,
      average: U.round(avg, 3),
      isFormal,
      missingBoatNos
    };
  }

  function analyzeTheory(data) {
    const entries = getEntries(data);
    const mapping = courseMappingOf(entries);

    return {
      slitAlerts: calcSlitAlerts(entries, mapping),
      doubleTime: calcDoubleTime(entries, mapping),
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
      <div class="v3-theory-item">
        <span class="v3-theory-label">判定</span>
        <div class="v3-theory-main">
          ${d.isDouble && d.topBoat ? U.boatBadge(d.topBoat, "mini") : ""}
          <strong>${
            d.isDouble
              ? `信頼度 ${d.confidence}点`
              : "ダブルタイム不成立"
          }</strong>
        </div>
        <p>${
          d.isDouble
            ? d.isOuterTarget
              ? d.topCourse
                ? `${d.topBoat}号艇は${d.topCourse}コースの実戦対象。連絡み条件は展開側で確認。`
                : "4・5・6号艇の実戦対象。連絡み条件は展開側で確認。"
              : d.topCourse
                ? `${d.topBoat}号艇は${d.topCourse}コースのため気配情報として使用。`
                : "1〜3号艇は気配情報として使用。"
            : "展示1位と一周1位が一致していません。"
        }</p>
      </div>
    `;

    const newSamRanking = theory.newSam.ranking || [];
    const newSamHtml = newSamRanking.length
      ? newSamRanking.slice(0, 6).map(x => `
          <div class="v3-theory-item">
            <div class="v3-theory-main">
              ${U.boatBadge(x.boatNo, "mini")}
              <strong>${U.escapeHtml(x.name)}</strong>
            </div>
            <p>新サム${x.grade}：${x.diff >= 0 ? "+" : ""}${U.round(x.diff, 3)}</p>
          </div>
        `).join("") + (
          theory.newSam.isFormal
            ? ""
            : `<div class="v3-theory-item"><p>6艇分がそろっていないため参考表示のみ（不足：${theory.newSam.missingBoatNos.join("・")}号艇）</p></div>`
        )
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
