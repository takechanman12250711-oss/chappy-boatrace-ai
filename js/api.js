// js/api.js
// API返却データ名ズレ対応版

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
    const url = `/api/race?jcd=${jcd}&rno=${rno}&date=${date}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!res.ok || !json.ok) {
      throw new Error(json.error || `API通信エラー: ${res.status}`);
    }

    return normalizeRace(json);
  }

  function normalizeRace(raw) {
    return {
      ok: true,
      stadiumCode: raw.stadiumCode || "",
      stadiumName: raw.stadiumName || "",
      raceNo: raw.raceNo || "",
      date: raw.date || "",
      raceInfo: raw.raceInfo || {},
      entries: normalizeEntries(raw.entries || []),
      beforeInfo: normalizeBeforeInfo(raw.beforeInfo || []),
      startExhibition: normalizeStartExhibition(raw.startExhibition || []),
      weather: normalizeWeather(raw.weather || {}),
      raw
    };
  }

  function normalizeEntries(entries) {
    return entries.map((e, index) => {
      const boatNo = Number(e.boat || e.waku || index + 1);

      return {
        boatNo,
        color: BOAT_COLORS[boatNo],

        racerName: e.racerName || "",
        registerNo: e.registerNo || "",
        className: e.className || "",
        branch: e.branch || "",
        birthplace: e.birthPlace || e.birthplace || "",
        age: e.age || "",
        weight: e.weight || "",
        fl: `F${e.fCount ?? 0} L${e.lCount ?? 0}`,
        avgST: e.avgSt ?? e.avgST ?? "",

        nationalWinRate: e.nationalWinRate ?? "",
        national2Rate: e.national2Rate ?? "",
        national3Rate: e.national3Rate ?? "",

        localWinRate: e.localWinRate ?? "",
        local2Rate: e.local2Rate ?? "",
        local3Rate: e.local3Rate ?? "",

        motorNo: e.motorNo ?? "",
        motor2Rate: e.motor2Rate ?? "",
        motor3Rate: e.motor3Rate ?? "",

        boatNumber: e.boatNo ?? "",
        boat2Rate: e.boat2Rate ?? "",
        boat3Rate: e.boat3Rate ?? "",

        exhibitionTime: e.exhibition?.displayTime ?? "",
        tilt: e.exhibition?.tilt ?? "",

        currentRace: e.currentRace || {},
        raw: e
      };
    });
  }

  function normalizeBeforeInfo(beforeInfo) {
    return beforeInfo.map((b, index) => {
      const boatNo = Number(b.boat || index + 1);

      return {
        boatNo,
        exhibitionTime: b.exhibition?.displayTime ?? "",
        tilt: b.exhibition?.tilt ?? "",
        weight: b.exhibition?.weight ?? "",
        raw: b
      };
    });
  }

  function normalizeStartExhibition(startExhibition) {
    return startExhibition.map((s, index) => {
      const boatNo = Number(s.boat || s.boatNo || index + 1);

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
      temperature: weather.temperature ?? "",
      windSpeed: weather.windSpeed ?? "",
      windDirection: weather.windDirection ?? "",
      waterTemperature: weather.waterTemperature ?? "",
      waveHeight: weather.waveHeight ?? "",
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