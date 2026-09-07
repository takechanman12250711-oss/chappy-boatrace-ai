(function (root) {
  "use strict";

  if (root.ChappyHomeVenueTapHotfix) return;

  const MORNING = new Set(["三国", "鳴門", "徳山", "芦屋", "唐津", "大村"]);
  const NIGHT = new Set(["桐生", "蒲郡", "住之江", "丸亀", "下関", "若松"]);
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

  function venueTypeLabel(type) {
    return type === "morning" ? "モーニング" : type === "night" ? "ナイター" : "デイ";
  }

  function decorateOfficialVenueSessions() {
    const grid = document.getElementById("officialVenueGrid");
    if (!grid) return;

    grid.querySelectorAll(".official-venue-button[data-place]").forEach(button => {
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
  }

  function bootOfficialVenueSessions() {
    const grid = document.getElementById("officialVenueGrid");
    if (!grid) {
      const observer = new MutationObserver(() => {
        if (!document.getElementById("officialVenueGrid")) return;
        observer.disconnect();
        bootOfficialVenueSessions();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }

    decorateOfficialVenueSessions();
    officialVenueObserver?.disconnect?.();
    officialVenueObserver = new MutationObserver(() => decorateOfficialVenueSessions());
    officialVenueObserver.observe(grid, { childList: true });
  }

  document.addEventListener("click", openVenue, true);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootOfficialVenueSessions, { once: true });
  } else {
    bootOfficialVenueSessions();
  }

  root.ChappyHomeVenueTapHotfix = Object.freeze({
    openVenue,
    decorateOfficialVenueSessions,
    venueType,
    venueTypeLabel
  });
})(window);
