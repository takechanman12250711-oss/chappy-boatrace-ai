/* =========================================================
  チャッピーボートレースAI
  js/api.js 完全版
========================================================= */

(function () {
  "use strict";

  const API_BASE = "https://chappy-boatrace-api.vercel.app";
  const RACE_CACHE_MS = 15000;
  const raceRequests = new Map();

  function raceKey(params) {
    return [
      params?.date,
      params?.jcd,
      params?.rno
    ].map(value => String(value || "")).join(":");
  }

  async function requestRace(params) {
    const jcd = params?.jcd;
    const rno = params?.rno;
    const date = params?.date;

    if (!jcd || !rno || !date) {
      throw new Error("場・レース番号・日付が不足しています");
    }

    const url =
      `${API_BASE}/api/race` +
      `?jcd=${encodeURIComponent(jcd)}` +
      `&rno=${encodeURIComponent(rno)}` +
      `&date=${encodeURIComponent(date)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`APIエラー：${res.status}`);
    }

    const data = await res.json();

    if (!data || data.ok === false) {
      throw new Error(data?.message || "レースデータを取得できませんでした");
    }

    return data;
  }

  function fetchRace(params, options = {}) {
    const key = raceKey(params);
    const now = Date.now();
    const cached = raceRequests.get(key);

    if (
      options.force !== true &&
      cached &&
      now - cached.createdAt <
        RACE_CACHE_MS
    ) {
      return cached.promise;
    }

    const promise = requestRace(params)
      .catch(error => {
        if (
          raceRequests.get(key)?.promise ===
          promise
        ) {
          raceRequests.delete(key);
        }
        throw error;
      });
    raceRequests.set(key, {
      createdAt: now,
      promise
    });
    return promise;
  }

  function prefetchRace(params) {
    return fetchRace(params);
  }

  window.ChappyAPI = {
    fetchRace,
    prefetchRace
  };
})();
