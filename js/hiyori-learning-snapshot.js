// js/hiyori-learning-snapshot.js
// ボートレース日和系の展示・一周・合成オッズ・気象・新エンジン情報を
// レース単位で学習用に保存する。予想ロジックには影響しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_hiyori_learning_snapshots_v1";
  const MAX_ROWS = 3000;

  function read() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function write(rows) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, MAX_ROWS)));
  }

  function normalizeDate(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 8);
  }

  function raceKey(input) {
    const date = normalizeDate(input?.date || input?.raceDate);
    const jcd = String(input?.jcd || input?.placeCode || "").padStart(2, "0");
    const raceNo = Number(input?.raceNo || input?.rno || 0);
    return date && /^\d{2}$/.test(jcd) && raceNo >= 1 && raceNo <= 12
      ? `${date}-${jcd}-${raceNo}`
      : "";
  }

  function cleanArray(value) {
    return Array.isArray(value) ? value.slice(0, 6) : [];
  }

  function normalizeSnapshot(input) {
    const key = raceKey(input);
    if (!key) return null;

    return {
      id: key,
      raceKey: key,
      capturedAt: new Date().toISOString(),
      date: normalizeDate(input.date || input.raceDate),
      jcd: String(input.jcd || input.placeCode || "").padStart(2, "0"),
      place: input.place || input.placeName || "",
      raceNo: Number(input.raceNo || input.rno),
      exhibition: cleanArray(input.exhibition || input.exhibitionTimes || input.tenji),
      lapTimes: cleanArray(input.lapTimes || input.lap || input.oneLapTimes),
      combinedOdds: cleanArray(input.combinedOdds || input.syntheticOdds || input.gouseiOdds),
      startExhibition: cleanArray(input.startExhibition || input.stExhibition),
      weather: {
        weather: input.weather?.weather || input.weatherName || "",
        windDirection: input.weather?.windDirection || input.windDirection || "",
        windSpeed: Number(input.weather?.windSpeed ?? input.windSpeed ?? 0),
        waveHeight: Number(input.weather?.waveHeight ?? input.waveHeight ?? 0),
        temperature: Number(input.weather?.temperature ?? input.temperature ?? 0),
        waterTemperature: Number(input.weather?.waterTemperature ?? input.waterTemperature ?? 0)
      },
      waterComment: input.waterComment || input.surfaceComment || input.comment || "",
      isNewEngine: Boolean(input.isNewEngine || input.newEngine || input.engineMode === "new"),
      isNewFuel: Boolean(input.isNewFuel || input.newFuel),
      source: input.source || "hiyori-compatible",
      result: input.result || null,
      status: input.result ? "matched" : "waiting_result"
    };
  }

  function save(input) {
    const normalized = normalizeSnapshot(input);
    if (!normalized) return null;

    const rows = read();
    const index = rows.findIndex(row => row?.raceKey === normalized.raceKey);
    const next = index >= 0
      ? rows.map((row, i) => i === index ? { ...row, ...normalized, capturedAt: row.capturedAt || normalized.capturedAt } : row)
      : [normalized, ...rows];

    write(next);
    window.dispatchEvent(new CustomEvent("chappy:hiyori-learning-snapshot-saved", {
      detail: { raceKey: normalized.raceKey, status: normalized.status }
    }));
    return normalized;
  }

  function attachResult(resultInput) {
    const key = raceKey(resultInput);
    if (!key) return false;
    const rows = read();
    let changed = false;
    const next = rows.map(row => {
      if (row?.raceKey !== key) return row;
      changed = true;
      return {
        ...row,
        result: resultInput.result || resultInput,
        status: "matched",
        matchedAt: new Date().toISOString()
      };
    });
    if (changed) {
      write(next);
      window.dispatchEvent(new CustomEvent("chappy:hiyori-learning-result-matched", { detail: { raceKey: key } }));
    }
    return changed;
  }

  function getAll() {
    return read();
  }

  function getMatched() {
    return read().filter(row => row?.status === "matched" && row?.result);
  }

  function install() {
    window.addEventListener("chappy:race-data-ready", event => {
      if (event?.detail) save(event.detail);
    });
    window.addEventListener("chappy:race-result-ready", event => {
      if (event?.detail) attachResult(event.detail);
    });
  }

  window.ChappyHiyoriLearningSnapshot = { save, attachResult, getAll, getMatched, raceKey };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})();
