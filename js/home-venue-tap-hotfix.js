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

  function installUiOverrides() {
    if (document.getElementById("chappy-home-race-ui-overrides")) return true;
    const style = document.createElement("style");
    style.id = "chappy-home-race-ui-overrides";
    style.textContent = [
      "#homeDashboardV2 .home-v2-filter-shell{display:none!important}",
      "#homeDashboardV2 .home-v2-schedule{display:none!important}",
      "#homeDashboardV2 .home-v2-hint{display:none!important}",
      "#raceSection .select-field:has(#placeSelect){display:none!important}",
      "#raceSection .select-field:has(#raceSelect){display:none!important}",
      "#raceSection #officialRacePicker{display:block!important}",
      "#raceSection #officialVenueGrid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}",
      "#raceSection .official-venue-button{position:relative!important;min-width:0!important;padding:11px 9px!important}",
      "#raceSection .official-venue-session-tag{display:inline-flex!important;align-items:center!important;justify-content:center!important;margin-top:5px!important;padding:2px 7px!important;border-radius:999px!important;font-size:10px!important;font-weight:800!important;line-height:1.4!important;white-space:nowrap!important;background:#eef4fb!important;color:#48627d!important}",
      "#raceSection .official-venue-session-tag[data-session='morning']{background:#fff5d8!important;color:#9a6500!important}",
      "#raceSection .official-venue-session-tag[data-session='day']{background:#eaf4ff!important;color:#0878f9!important}",
      "#raceSection .official-venue-session-tag[data-session='night']{background:#eef0ff!important;color:#4954c6!important}",
      "#raceSection #officialRaceGrid{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:7px!important}",
      "@media (max-width:420px){#raceSection .race-select-grid{grid-template-columns:1fr 1fr!important}#raceSection #officialVenueGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}#raceSection #officialRaceGrid{grid-template-columns:repeat(4,minmax(0,1fr))!important}}"
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
    return true;
  }

  function showOfficialRacePicker() {
    installUiOverrides();
    const picker = document.getElementById("officialRacePicker");
    if (!picker) return false;
    picker.hidden = false;
    picker.removeAttribute("hidden");
    refreshSessionsSoon();
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
    showOfficialRacePicker();
    return true;
  }

  function boot() {
    installUiOverrides();
    showOfficialRacePicker();
    root.setTimeout(showRaceViewByDefault, 0);
  }

  document.addEventListener("click", openVenue, true);
  document.addEventListener("change", event => {
    const id = event.target?.id || "";
    if (id === "raceModeSelect" || id === "dateInput" || id === "placeSelect") {
      showOfficialRacePicker();
    }
  }, true);
  root.addEventListener("chappy:view-changed", event => {
    if (event?.detail?.view === "race") showOfficialRacePicker();
  });
  root.addEventListener("chappy:home-schedule", showOfficialRacePicker);

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
    installUiOverrides,
    showOfficialRacePicker,
    showRaceViewByDefault
  });
})(window);
