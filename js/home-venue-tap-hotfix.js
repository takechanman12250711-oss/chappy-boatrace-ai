(function (root) {
  "use strict";

  if (root.ChappyHomeVenueTapHotfix) return;

  const MORNING = new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]);
  const NIGHT = new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"]);
  let officialSessionFilter = "all";
  let officialVenueObserver = null;

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

  function applyOfficialSessionFilter() {
    const grid = document.getElementById("officialVenueGrid");
    if (!grid) return;

    grid.querySelectorAll(".official-venue-button[data-place]").forEach(button => {
      const type = venueType(String(button.dataset.place || ""));
      button.dataset.session = type;
      button.hidden = officialSessionFilter !== "all" && type !== officialSessionFilter;
    });

    const selected = grid.querySelector(".official-venue-button.is-selected");
    if (selected?.hidden) {
      selected.classList.remove("is-selected");
      const panel = document.getElementById("officialRacePanel");
      if (panel) panel.hidden = true;
    }

    document.querySelectorAll("[data-official-session-filter]").forEach(button => {
      const active = button.dataset.officialSessionFilter === officialSessionFilter;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function ensureOfficialSessionFilters() {
    const grid = document.getElementById("officialVenueGrid");
    if (!grid || document.getElementById("officialVenueSessionFilters")) return;

    const filters = document.createElement("div");
    filters.id = "officialVenueSessionFilters";
    filters.className = "home-v2-filters official-venue-session-filters";
    filters.setAttribute("aria-label", "開催時間帯で絞り込み");
    filters.innerHTML = [
      ["all", "🌐 全場"],
      ["morning", "☀️ モーニング"],
      ["day", "☀️ デイ"],
      ["night", "🌙 ナイター"]
    ].map(([key, label]) =>
      `<button type="button" data-official-session-filter="${key}" aria-pressed="${key === officialSessionFilter ? "true" : "false"}" class="${key === officialSessionFilter ? "is-active" : ""}">${label}</button>`
    ).join("");

    filters.addEventListener("click", event => {
      const button = event.target.closest?.("[data-official-session-filter]");
      if (!button) return;
      officialSessionFilter = button.dataset.officialSessionFilter || "all";
      applyOfficialSessionFilter();
    });

    grid.before(filters);
    applyOfficialSessionFilter();

    officialVenueObserver?.disconnect?.();
    officialVenueObserver = new MutationObserver(() => applyOfficialSessionFilter());
    officialVenueObserver.observe(grid, { childList: true });
  }

  function bootOfficialSessionFilters() {
    ensureOfficialSessionFilters();
    if (document.getElementById("officialVenueGrid")) return;
    const observer = new MutationObserver(() => {
      if (!document.getElementById("officialVenueGrid")) return;
      observer.disconnect();
      ensureOfficialSessionFilters();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  document.addEventListener("click", openVenue, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootOfficialSessionFilters, { once: true });
  } else {
    bootOfficialSessionFilters();
  }

  root.ChappyHomeVenueTapHotfix = Object.freeze({
    openVenue,
    applyOfficialSessionFilter,
    venueType
  });
})(window);
