/* =========================================================
  チャッピーボートレースAI
  js/api.js 完全版
========================================================= */

(function () {
  "use strict";

  const API_BASE = "https://chappy-boatrace-ai.vercel.app";

  async function fetchRace(params) {
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

  window.ChappyAPI = {
    fetchRace
  };
})();