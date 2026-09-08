(function (root) {
  "use strict";

  if (root.ChappyHomeVenueTapHotfix) return;

  const MORNING = new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]);
  const NIGHT = new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"]);
  let decorateTimer = 0;

  function firstRaceButton(venue) {
    return venue?.querySelector(
      ".home-v2-race[data-place][data-race]:not(:disabled)"
    ) || null;
  }

  function openVenue(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(".home-v2-race[data-place][data-race]")) return;
    if (target.closest("[data-open-venue]")) return;

    const venue = target.closest(".home-v2-venue[data-venue]");
    if (!venue) return;

    const raceButton = firstRaceButton(venue);
    if (!raceButton) return;

    event.preventDefault();
    event.stopPropagation();
    raceButton.click();
  }

  function venueType(place) {
    return MORNING.has(place) ? "morning" : NIGHT.has(place) ? "night" : "day";
  }

  function venueTypeLabel(type) {
    return type === "morning" ? "モーニング" : type === "night" ? "ナイター" : "デイ";
  }

  function hideHomeRaceSelection() {
    if (document.getElementById("chappy-home-recommend-only-style")) return true;
    const style = document.createElement("style");
    style.id = "chappy-home-recommend-only-style";
    style.textContent = [
      "#homeDashboardV2 .home-v2-filter-shell{display:none!important}",
      "#homeDashboardV2 .home-v2-schedule{display:none!important}",
      "#homeDashboardV2 .home-v2-hint{display:none!important}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
    return true;
  }

  function decorateOfficialVenueSessions() {
    const grid = document.getElementById("officialVenueGrid");
    if (!grid) return 0;

    const buttons = [...grid.querySelectorAll(".official-venue-button[data-place]")];
    buttons.forEach(button => {
      const type = venueType(String(button.dataset.place || ""));
      button.dataset.session = type;

      let badge = button.querySelector(".official-venue-session-tag");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "official-venue-session-tag";
        button.appendChild(badge);
      }
      badge.dataset.session = type;
      badge.textContent = venueTypeLabel(type);
    });
    return buttons.length;
  }

  function scheduleOfficialVenueSessions(attempt = 0) {
    if (decorateTimer) root.clearTimeout(decorateTimer);
    const found = decorateOfficialVenueSessions();
    if (found || attempt >= 20) return;
    decorateTimer = root.setTimeout(
      () => scheduleOfficialVenueSessions(attempt + 1),
      100
    );
  }

  function refreshSessionsSoon() {
    root.setTimeout(() => scheduleOfficialVenueSessions(0), 0);
    root.setTimeout(() => scheduleOfficialVenueSessions(0), 250);
  }

  function showRaceViewByDefault() {
    const hash = String(root.location?.hash || "");
    if (hash && hash !== "#raceSection") return false;
    const dashboard = root.ChappyHomeDashboardV2;
    if (typeof dashboard?.setView !== "function") return false;
    dashboard.setView("race");
    refreshSessionsSoon();
    return true;
  }

  function boot() {
    hideHomeRaceSelection();
    refreshSessionsSoon();
    root.setTimeout(showRaceViewByDefault, 0);
  }

  document.addEventListener("click", openVenue, true);
  document.addEventListener("change", event => {
    const id = event.target?.id || "";
    if (id === "raceModeSelect" || id === "dateInput" || id === "placeSelect") {
      refreshSessionsSoon();
    }
  }, true);
  root.addEventListener("chappy:view-changed", event => {
    if (event?.detail?.view === "race") refreshSessionsSoon();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  root.ChappyHomeVenueTapHotfix = Object.freeze({
    openVenue,
    decorateOfficialVenueSessions,
    venueType,
    venueTypeLabel,
    hideHomeRaceSelection,
    showRaceViewByDefault
  });
})(window);
