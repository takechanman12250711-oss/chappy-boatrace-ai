(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.ChappyLocalWaterTheory = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const VERSION = "local-water-theory-v1.0.0";
  const VENUES = {
    "01": { name: "桐生", in: 74, sashi: 64, center: 59, outside: 48, rough: 54 },
    "02": { name: "戸田", in: 55, sashi: 55, center: 69, outside: 58, rough: 63 },
    "03": { name: "江戸川", in: 58, sashi: 52, center: 62, outside: 57, rough: 88 },
    "04": { name: "平和島", in: 60, sashi: 59, center: 65, outside: 55, rough: 70 },
    "05": { name: "多摩川", in: 65, sashi: 60, center: 64, outside: 52, rough: 58 },
    "06": { name: "浜名湖", in: 63, sashi: 61, center: 64, outside: 53, rough: 57 },
    "07": { name: "蒲郡", in: 71, sashi: 63, center: 61, outside: 49, rough: 51 },
    "08": { name: "常滑", in: 68, sashi: 62, center: 63, outside: 50, rough: 55 },
    "09": { name: "津", in: 67, sashi: 61, center: 62, outside: 50, rough: 58 },
    "10": { name: "三国", in: 69, sashi: 63, center: 60, outside: 48, rough: 62 },
    "11": { name: "びわこ", in: 59, sashi: 58, center: 66, outside: 55, rough: 72 },
    "12": { name: "住之江", in: 75, sashi: 65, center: 60, outside: 47, rough: 47 },
    "13": { name: "尼崎", in: 70, sashi: 63, center: 61, outside: 49, rough: 52 },
    "14": { name: "鳴門", in: 64, sashi: 60, center: 65, outside: 53, rough: 67 },
    "15": { name: "丸亀", in: 72, sashi: 64, center: 62, outside: 50, rough: 55 },
    "16": { name: "児島", in: 69, sashi: 62, center: 63, outside: 51, rough: 60 },
    "17": { name: "宮島", in: 66, sashi: 61, center: 64, outside: 52, rough: 65 },
    "18": { name: "徳山", in: 76, sashi: 65, center: 59, outside: 46, rough: 49 },
    "19": { name: "下関", in: 73, sashi: 64, center: 61, outside: 49, rough: 52 },
    "20": { name: "若松", in: 70, sashi: 62, center: 64, outside: 52, rough: 57 },
    "21": { name: "芦屋", in: 78, sashi: 66, center: 58, outside: 45, rough: 48 },
    "22": { name: "福岡", in: 62, sashi: 59, center: 66, outside: 55, rough: 74 },
    "23": { name: "唐津", in: 74, sashi: 64, center: 60, outside: 48, rough: 50 },
    "24": { name: "大村", in: 82, sashi: 67, center: 57, outside: 45, rough: 44 }
  };

  const NAME_TO_CODE = Object.fromEntries(Object.entries(VENUES).map(([code, v]) => [v.name, code]));
  const num = (v, f = 0) => Number.isFinite(Number(v)) ? Number(v) : f;
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const round = (v) => Math.round(v * 10) / 10;

  function getVenue(data) {
    const code = String(data?.stadiumCode ?? data?.jcd ?? data?.venueCode ?? data?.raceInfo?.stadiumCode ?? "").padStart(2, "0");
    const name = String(data?.stadiumName ?? data?.venueName ?? data?.placeName ?? data?.raceInfo?.stadiumName ?? data?.raceInfo?.venueName ?? "");
    const resolved = VENUES[code] ? code : NAME_TO_CODE[name];
    return { code: resolved || code || "", ...(VENUES[resolved] || { name: name || "不明", in: 65, sashi: 60, center: 60, outside: 50, rough: 55 }) };
  }

  function getWeather(data) {
    const w = data?.weather ?? data?.condition ?? data?.raceCondition ?? {};
    return {
      windSpeed: num(w.windSpeed ?? w.wind ?? data?.windSpeed),
      waveHeight: num(w.waveHeight ?? w.wave ?? data?.waveHeight),
      windDirection: String(w.windDirection ?? w.windDir ?? data?.windDirection ?? ""),
      tide: String(w.tide ?? w.tidal ?? data?.tide ?? "")
    };
  }

  function roleForBoat(boatNo, mainScenario) {
    const first = new Set((mainScenario?.outcome?.firstCandidates || []).map(x => Number(x?.boatNo || x)));
    const second = new Set((mainScenario?.outcome?.secondCandidates || []).map(x => Number(x?.boatNo || x)));
    const third = new Set((mainScenario?.outcome?.thirdCandidates || []).map(x => Number(x?.boatNo || x)));
    if (first.has(boatNo)) return "1着候補";
    if (second.has(boatNo)) return "残し";
    if (third.has(boatNo)) return "拾い";
    return "展開外";
  }

  function localBase(boat) {
    const win = num(boat?.localWinRate ?? boat?.local?.winRate);
    const two = num(boat?.local2Rate ?? boat?.local?.twoRate);
    const three = num(boat?.local3Rate ?? boat?.local?.threeRate);
    const starts = num(boat?.localStarts ?? boat?.local?.starts);
    const score = clamp(20 + win * 5 + two * 0.28 + three * 0.10, 0, 70);
    return { win, two, three, starts, score: round(score) };
  }

  function courseWaterFit(boatNo, venue) {
    if (boatNo === 1) return round(venue.in * 0.20);
    if (boatNo === 2) return round(venue.sashi * 0.20);
    if (boatNo === 3 || boatNo === 4) return round(venue.center * 0.20);
    return round(venue.outside * 0.20);
  }

  function weatherAdjustment(boatNo, venue, weather) {
    let score = 0;
    const rough = weather.windSpeed >= 5 || weather.waveHeight >= 5;
    if (rough) {
      if (boatNo <= 2) score += venue.in >= 70 ? 5 : 2;
      if (boatNo >= 4) score += venue.rough >= 70 ? 4 : -3;
    }
    if (weather.windSpeed >= 7) score -= boatNo >= 5 ? 3 : 0;
    return score;
  }

  function evaluate(data, analyses = [], raceScenarios = null) {
    const entries = Array.isArray(data?.entries) ? data.entries : Array.isArray(data?.boats) ? data.boats : [];
    const venue = getVenue(data);
    const weather = getWeather(data);
    const mainScenario = raceScenarios?.mainScenario || null;
    const blocked = new Set((mainScenario?.blockedBoats || raceScenarios?.blockedBoats || []).map(Number));

    const roles = entries.map((boat, i) => {
      const boatNo = Number(boat?.boatNo ?? boat?.boat ?? boat?.waku ?? i + 1);
      const local = localBase(boat);
      const water = courseWaterFit(boatNo, venue);
      const weatherScore = weatherAdjustment(boatNo, venue, weather);
      const scenarioRole = roleForBoat(boatNo, mainScenario);
      const roleScore = scenarioRole === "1着候補" ? 8 : scenarioRole === "残し" ? 6 : scenarioRole === "拾い" ? 4 : 0;
      const score = round(clamp(local.score + water + weatherScore + roleScore, 0, 100));
      const enough = local.starts >= 12 || local.win > 0 || local.two > 0 || local.three > 0;
      const isBlocked = blocked.has(boatNo);
      const isAdopted = Boolean(mainScenario) && enough && !isBlocked && scenarioRole !== "展開外" && score >= 65;
      const status = !enough ? "暫定" : isBlocked ? "展開除外" : isAdopted ? "正式採用" : score >= 55 ? "参考" : "適性不足";
      return {
        boatNo,
        score,
        grade: score >= 85 ? "S" : score >= 75 ? "A" : score >= 65 ? "B" : score >= 55 ? "C" : "D",
        status,
        isAdopted,
        role: scenarioRole,
        breakdown: { local: local.score, courseWater: water, weather: weatherScore, scenarioRole: roleScore },
        evidence: [
          `当地勝率${local.win || "-"}・2連率${local.two || "-"}%・3連率${local.three || "-"}%`,
          `${venue.name}${boatNo}コース水面適性${water}/20`,
          `風${weather.windSpeed}m・波${weather.waveHeight}cm補正${weatherScore}`,
          `最有力展開役割${scenarioRole}`
        ]
      };
    });

    return {
      version: VERSION,
      venue,
      weather,
      roles,
      adoptedBoats: roles.filter(x => x.isAdopted).map(x => x.boatNo),
      summary: roles.some(x => x.isAdopted)
        ? `当地・水面理論は${roles.filter(x => x.isAdopted).map(x => x.boatNo + "号艇").join("・")}を正式採用。`
        : "当地・水面理論は参考評価。展開を上書きしない。"
    };
  }

  return { VERSION, VENUES, evaluate };
});
