// js/api.js
// チャッピーボートレースAI API接続

const ChappyAPI = (() => {
  const BASE_URL = "";

  const BOAT_COLORS = {
    1: { name: "白", bg: "#ffffff", text: "#111111" },
    2: { name: "黒", bg: "#111111", text: "#ffffff" },
    3: { name: "赤", bg: "#e53935", text: "#ffffff" },
    4: { name: "青", bg: "#1e88e5", text: "#ffffff" },
    5: { name: "黄", bg: "#fdd835", text: "#111111" },
    6: { name: "緑", bg: "#43a047", text: "#ffffff" }
  };

  async function fetchRace({ jcd, rno, date }) {
    if (!jcd || !rno || !date) {
      throw new Error("jcd・rno・date が不足しています");
    }

    const url =
      `${BASE_URL}/api/race?jcd=${encodeURIComponent(jcd)}` +
      `&rno=${encodeURIComponent(rno)}` +
      `&date=${encodeURIComponent(date)}`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`API通信エラー: ${res.status}`);
    }

    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || "API取得に失敗しました");
    }

    return normalizeRace(json);
  }

  function normalizeRace(raw) {
    const entries = normalizeEntries(raw.entries || raw.entry || []);
    const beforeInfo = raw.beforeInfo || raw.before || [];
    const startExhibition = raw.startExhibition || raw.start || [];

    return {
      ok: true,

      stadiumCode: raw.stadiumCode || raw.jcd || "",
      stadiumName: raw.stadiumName || raw.stadium || "",
      raceNo: raw.raceNo || raw.rno || "",
      date: raw.date || "",

      raceInfo: raw.raceInfo || {},
      weather: normalizeWeather(raw.weather || {}),
      entries,
      beforeInfo: normalizeBeforeInfo(beforeInfo),
      startExhibition: normalizeStartExhibition(startExhibition),

      debug: raw.debug || {},

      raw
    };
  }

  function normalizeEntries(entries) {
    return entries.map((e, index) => {
      const boatNo = Number(e.boatNo || e.waku || e.course || index + 1);

      return {
        boatNo,
        color: BOAT_COLORS[boatNo],

        racerName: e.racerName || e.name || "",
        registerNo: e.registerNo || e.regNo || "",
        className: e.className || e.grade || "",
        branch: e.branch || "",
        birthplace: e.birthplace || e.from || "",
        age: e.age || "",
        weight: e.weight || "",
        fl: e.fl || e.F_L || "",
        avgST: e.avgST || e.st || "",

        nationalWinRate: e.nationalWinRate || e.nationalRate || "",
        national2Rate: e.national2Rate || e.national2 || "",
        national3Rate: e.national3Rate || e.national3 || "",

        localWinRate: e.localWinRate || e.localRate || "",
        local2Rate: e.local2Rate || e.local2 || "",
        local3Rate: e.local3Rate || e.local3 || "",

        motorNo: e.motorNo || "",
        motor2Rate: e.motor2Rate || e.motor2 || "",
        motor3Rate: e.motor3Rate || e.motor3 || "",

        boatNumber: e.boatNumber || e.boatNo2 || e.boat || "",
        boat2Rate: e.boat2Rate || e.boat2 || "",
        boat3Rate: e.boat3Rate || e.boat3 || "",

        raw: e
      };
    });
  }

  function normalizeBeforeInfo(beforeInfo) {
    return beforeInfo.map((b, index) => {
      const boatNo = Number(b.boatNo || b.waku || index + 1);

      return {
        boatNo,
        exhibitionTime: b.exhibitionTime || b.tenjiTime || b.displayTime || "",
        tilt: b.tilt || "",
        weight: b.weight || "",
        raw: b
      };
    });
  }

  function normalizeStartExhibition(startExhibition) {
    return startExhibition.map((s, index) => {
      const boatNo = Number(s.boatNo || s.waku || index + 1);

      return {
        boatNo,
        course: s.course || boatNo,
        st: s.st || s.startTime || "",
        raw: s
      };
    });
  }

  function normalizeWeather(weather) {
    return {
      temperature: weather.temperature || weather.temp || "",
      windSpeed: weather.windSpeed || weather.wind || "",
      windDirection: weather.windDirection || weather.windDir || "",
      waterTemperature: weather.waterTemperature || weather.waterTemp || "",
      waveHeight: weather.waveHeight || weather.wave || "",
      raw: weather
    };
  }

  function getBoatColor(boatNo) {
    return BOAT_COLORS[Number(boatNo)] || BOAT_COLORS[1];
  }

  return {
    fetchRace,
    getBoatColor
  };
})();

window.ChappyAPI = ChappyAPI;