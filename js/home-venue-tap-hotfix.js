(function (root) {
  "use strict";

  if (root.ChappyHomeVenueTapHotfix) return;

  const OHMURA = "大村";
  const NIGHT_LABEL = "ナイター";
  let activeFilter = "all";
  let patchQueued = false;

  function firstRaceButton(venue) {
    return venue?.querySelector(
      ".home-v2-race[data-place][data-race]:not(:disabled)"
    ) || null;
  }

  function venueHost() {
    return document.querySelector("[data-home-venues]");
  }

  function scheduleVenue(place) {
    const schedule = root.ChappyHomeDashboardV2?.getSchedule?.() || [];
    return schedule.find(item => String(item?.place || "").trim() === place) || null;
  }

  function timeOf(value) {
    if (!value) return "--:--";
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }
    const match = String(value).match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, "0")}:${match[2]}` : "--:--";
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function racesOf(venue) {
    return (Array.isArray(venue?.races) ? venue.races : [])
      .map(row => {
        const deadlineAt = row?.deadlineAt || row?.deadline || row?.closeAt || "";
        const deadlineMs = Date.parse(deadlineAt);
        return {
          raceNo: Number(row?.raceNo ?? row?.rno) || 0,
          deadlineAt,
          selectable:
            row?.selectable !== false &&
            row?.closed !== true &&
            (!Number.isFinite(deadlineMs) || deadlineMs > Date.now())
        };
      })
      .filter(row => row.raceNo >= 1 && row.raceNo <= 12)
      .sort((a, b) => a.raceNo - b.raceNo);
  }

  function buildOhmuraCard() {
    const venue = scheduleVenue(OHMURA);
    if (!venue) return null;

    const article = document.createElement("article");
    article.className = "home-v2-venue";
    article.dataset.venue = OHMURA;

    const races = racesOf(venue).filter(row => row.selectable).slice(0, 4);
    const raceHtml = races.length
      ? races.map(row => (
          `<button class="home-v2-race is-main" type="button" data-place="${OHMURA}" data-race="${row.raceNo}">` +
            `<strong>${row.raceNo}R</strong><span><i></i>${escapeHtml(timeOf(row.deadlineAt))}</span>` +
          `</button>`
        )).join("")
      : '<span class="home-v2-no-race">› を押して1R〜12Rを表示</span>';

    article.innerHTML =
      `<div class="home-v2-venue-info"><strong>${OHMURA} <span>≋</span></strong><small>${NIGHT_LABEL}</small></div>` +
      `<div class="home-v2-races">${raceHtml}</div>` +
      `<button class="home-v2-venue-next" type="button" data-open-venue="${OHMURA}" aria-label="${OHMURA}の1Rから12Rを表示">›</button>`;

    return article;
  }

  function patchOhmuraClassification() {
    const host = venueHost();
    if (!host) return;

    let card = host.querySelector(`.home-v2-venue[data-venue="${OHMURA}"]`);

    if (activeFilter === "morning") {
      card?.remove();
      return;
    }

    if (activeFilter === "night" && !card) {
      card = buildOhmuraCard();
      if (card) host.appendChild(card);
    }

    const label = card?.querySelector(".home-v2-venue-info small");
    if (label && label.textContent !== NIGHT_LABEL) {
      label.textContent = NIGHT_LABEL;
    }
  }

  function queueClassificationPatch() {
    if (patchQueued) return;
    patchQueued = true;
    const run = () => {
      patchQueued = false;
      patchOhmuraClassification();
    };
    if (typeof root.requestAnimationFrame === "function") {
      root.requestAnimationFrame(run);
    } else {
      root.setTimeout(run, 0);
    }
  }

  async function ensureResultPanel() {
    if (root.ChappyRaceFlowResultPanel) return root.ChappyRaceFlowResultPanel;
    if (typeof root.ChappyTodayResultsHome?.load !== "function") {
      throw new Error("終了レース表示モジュールを読み込めません");
    }
    return root.ChappyTodayResultsHome.load();
  }

  async function expandVenueForReview(venue) {
    const openButton = venue?.querySelector("[data-open-venue]");
    if (!openButton) return false;
    const panel = await ensureResultPanel();
    if (typeof panel?.expandVenue !== "function") {
      throw new Error("終了レース一覧を開けません");
    }
    await panel.expandVenue(openButton);
    return true;
  }

  function openVenue(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const explicitOpen = target.closest("[data-open-venue]");
    if (explicitOpen) {
      const venue = explicitOpen.closest(".home-v2-venue[data-venue]");
      if (!venue) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void expandVenueForReview(venue).catch(error => {
        console.error("[home-review-hotfix] 終了レース一覧を開けません", error);
      });
      return;
    }

    if (target.closest(".home-v2-race[data-place][data-race]")) return;

    const venue = target.closest(".home-v2-venue[data-venue]");
    if (!venue) return;

    const raceButton = firstRaceButton(venue);
    event.preventDefault();
    event.stopPropagation();

    if (raceButton) {
      raceButton.click();
      return;
    }

    void expandVenueForReview(venue).catch(error => {
      console.error("[home-review-hotfix] 終了レース一覧を開けません", error);
    });
  }

  function trackFilter(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-filter]") : null;
    if (!target) return;
    activeFilter = target.dataset.filter || "all";
    queueClassificationPatch();
  }

  document.addEventListener("click", openVenue, true);
  document.addEventListener("click", trackFilter, false);
  root.addEventListener("chappy:home-schedule", queueClassificationPatch);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", queueClassificationPatch, { once: true });
  } else {
    queueClassificationPatch();
  }

  root.ChappyHomeVenueTapHotfix = Object.freeze({
    openVenue,
    expandVenueForReview,
    patchOhmuraClassification
  });
})(window);