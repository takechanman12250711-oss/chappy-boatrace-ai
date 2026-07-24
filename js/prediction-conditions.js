/* =========================================================
  予想時点の条件スナップショット

  ST・展示・風・波・潮などを締切前の状態で固定保存する。
  このモジュールは予想ロジック・重み・買い目を変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyPredictionConditions = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PRIORITY_STAGES = [
    "展開",
    "コース",
    "ST・スリット",
    "展示・足",
    "残し・拾い",
    "当地・水面",
    "技量",
    "モーター"
  ];

  function numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(String(value).replace(/[^\d.-]/g, ""));
    return Number.isFinite(number) ? number : null;
  }

  function text(value) {
    return String(value ?? "").trim();
  }

  function boatNoOf(value, fallback = 0) {
    const number = Number(
      value?.boat ?? value?.waku ?? value?.no ?? value?.boatNo ?? value ?? fallback
    );
    return number >= 1 && number <= 6 ? number : 0;
  }

  function average(values) {
    const numbers = values.map(numberOrNull).filter(value => value !== null);
    if (!numbers.length) return null;
    return Math.round(numbers.reduce((sum, value) => sum + value, 0) /
      numbers.length * 1000) / 1000;
  }

  function findBoat(list, boatNo) {
    return (Array.isArray(list) ? list : []).find((item, index) =>
      boatNoOf(item, index + 1) === boatNo
    ) || null;
  }

  function getCurrentSt(entry) {
    const current = entry?.currentRace || entry?.currentSeries || entry?.series || {};
    const source = current.stList || current.starts || current.startTimings || [];
    return average((Array.isArray(source) ? source : [source]).map(item =>
      item?.st ?? item?.startTime ?? item
    ));
  }

  function captureBoat(raceData, boatNo) {
    const entry = findBoat(raceData?.entries, boatNo) || {};
    const before = findBoat(raceData?.beforeInfo, boatNo) || {};
    const start = findBoat(raceData?.startExhibition, boatNo) || {};
    const exhibition = before?.exhibition || entry?.exhibition || {};

    return {
      boatNo,
      course: numberOrNull(start?.course ?? entry?.course ?? boatNo) || boatNo,
      racerName: text(entry?.racerName || entry?.name || entry?.playerName),
      className: text(entry?.className || entry?.class || entry?.grade),
      avgST: numberOrNull(entry?.avgST ?? entry?.avgSt ?? entry?.averageST ?? entry?.st),
      currentST: getCurrentSt(entry),
      exhibitionST: numberOrNull(
        start?.st ?? before?.exhibitionST ?? before?.displayST ??
        exhibition?.st ?? entry?.exhibitionST
      ),
      exhibitionTime: numberOrNull(
        before?.exhibitionTime ?? before?.displayTime ??
        exhibition?.displayTime ?? exhibition?.time ?? entry?.exhibitionTime
      ),
      lapTime: numberOrNull(
        before?.lapTime ?? before?.oneLapTime ??
        exhibition?.lapTime ?? exhibition?.oneLapTime ?? entry?.lapTime
      ),
      localWinRate: numberOrNull(
        entry?.localWinRate ?? entry?.local?.winRate ?? entry?.local?.rate
      ),
      nationalWinRate: numberOrNull(
        entry?.nationalWinRate ?? entry?.national?.winRate ?? entry?.national?.rate
      ),
      motor2Rate: numberOrNull(
        entry?.motor2Rate ?? entry?.motor?.secondRate ?? entry?.motor?.quinellaRate
      ),
      localStarts: numberOrNull(
        entry?.localStarts ?? entry?.localRaces ??
        entry?.localRaceCount ?? entry?.local?.starts
      )
    };
  }

  function captureWeather(raceData, prediction) {
    const weather = raceData?.weather || raceData?.condition || {};
    const predictionWeather = prediction?.weather || {};
    const venue = prediction?.venue || prediction?.venueProfile || {};

    const tideLevel = numberOrNull(
      weather?.tideLevel ?? weather?.tide ??
      raceData?.tideLevel ?? raceData?.tide
    );
    const tidePhase = text(
      weather?.tideFlow || weather?.tidePhase ||
      raceData?.tideFlow || raceData?.tidePhase
    );
    const liveTideAvailable =
      weather?.liveTideAvailable === true ||
      tideLevel !== null ||
      Boolean(tidePhase);

    return {
      weather: text(weather?.weather || weather?.condition || predictionWeather?.weather),
      windDirection: text(
        weather?.windDirection || weather?.wind_direction || predictionWeather?.windDirection
      ),
      windDirectionCode: numberOrNull(
        weather?.windDirectionCode ?? raceData?.windDirectionCode
      ),
      windSpeed: numberOrNull(
        weather?.windSpeed ?? weather?.wind ?? weather?.wind_velocity ??
        predictionWeather?.windSpeed
      ),
      waveHeight: numberOrNull(
        weather?.waveHeight ?? weather?.wave ?? weather?.wave_height ??
        predictionWeather?.waveHeight
      ),
      temperature: numberOrNull(
        weather?.temperature ?? weather?.airTemp ?? predictionWeather?.temperature
      ),
      waterTemperature: numberOrNull(
        weather?.waterTemperature ?? weather?.waterTemp ??
        predictionWeather?.waterTemperature
      ),
      waterType: text(
        weather?.waterType || raceData?.waterType
      ),
      tideLevel,
      tidePhase,
      tideStatus:
        liveTideAvailable
          ? "acquired"
          : "unavailable",
      liveTideAvailable,
      venueTideInfluence: numberOrNull(
        venue?.tideInfluence ?? prediction?.water?.tideInfluence
      )
    };
  }

  function countAvailable(boats, keys) {
    return boats.filter(boat => keys.some(key => boat[key] !== null)).length;
  }

  function capture(raceData = {}, prediction = {}) {
    const boats = Array.from({ length: 6 }, (_, index) =>
      captureBoat(raceData, index + 1)
    );
    const weather = captureWeather(raceData, prediction);
    const sourceText = JSON.stringify({
      raceInfo: raceData?.raceInfo || {},
      engine: prediction?.engine || prediction?.motorMode || ""
    });

    return {
      schemaVersion: 2,
      sourceTiming: "pre_deadline",
      officialResultUsed: false,
      boats,
      weather,
      dataAvailability: {
        entries: boats.filter(boat => boat.racerName || boat.className).length,
        averageST: countAvailable(boats, ["avgST", "currentST"]),
        exhibitionST: countAvailable(boats, ["exhibitionST"]),
        exhibitionTime: countAvailable(boats, ["exhibitionTime", "lapTime"]),
        wind: weather.windSpeed !== null,
        wave: weather.waveHeight !== null,
        tide:
          weather.liveTideAvailable === true
      },
      newEngineMode: Boolean(
        prediction?.isNewEngineMode ||
        /新型エンジン|新エンジン|新モーター|新燃料/.test(sourceText)
      ),
      usagePolicy: "検証表示のみ。予想ロジック・重み・買い目は自動変更しない"
    };
  }

  return {
    PRIORITY_STAGES,
    numberOrNull,
    boatNoOf,
    capture
  };
});
