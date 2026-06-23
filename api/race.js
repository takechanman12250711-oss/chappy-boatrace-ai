// api/race.js v5
// 舟券太郎指数＋展開予想＋本線/穴フォーメーション自動生成版

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { jcd, rno, date, debug } = req.query;

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      error: "jcd, rno, date が必要です",
      sample: "/api/race?jcd=15&rno=1&date=20260622"
    });
  }

  const raceListUrl =
    `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${jcd}&hd=${date}`;

  const beforeInfoUrl =
    `https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const raceHtml = await fetchHtml(raceListUrl);
    const raceText = cleanText(raceHtml);

    if (raceText.includes("データがありません")) {
      return res.status(200).json({
        ok: true,
        source: "boatrace.jp",
        jcd,
        rno,
        date,
        count: 0,
        boats: [],
        message: "データがありません"
      });
    }

    const parsedRace = parseRaceText(raceText);

    let beforeParsed = {
      ok: false,
      displays: [],
      weather: null,
      text: "",
      error: ""
    };

    try {
      const beforeHtml = await fetchHtml(beforeInfoUrl);
      const beforeText = cleanText(beforeHtml);

      if (!beforeText.includes("データがありません")) {
        beforeParsed = {
          ok: true,
          displays: parseBeforeInfoText(beforeText),
          weather: parseWeatherInfo(beforeText),
          text: beforeText,
          error: ""
        };
      }
    } catch (e) {
      beforeParsed.error = e.message;
    }

    let boats = mergeBeforeInfo(parsedRace.boats, beforeParsed.displays);
    const theory = buildPredictionEngine(boats, beforeParsed.weather, jcd);

    boats = theory.boats;

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      raceListUrl,
      beforeInfoUrl,
      count: boats.length,
      weather: beforeParsed.weather,
      boats,
      prediction: {
        marks: theory.marks,
        slitAlert: theory.slitAlert,
        doubleTimeAlert: theory.doubleTimeAlert,
        newSumAlert: theory.newSumAlert,
        raceShape: theory.raceShape,
        mainFormation: theory.mainFormation,
        holeFormation: theory.holeFormation,
        raceComment: theory.raceComment
      },
      debug: debug === "1" ? makeDebug(raceHtml, raceText, parsedRace, beforeParsed, theory) : undefined
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      jcd,
      rno,
      date,
      raceListUrl,
      beforeInfoUrl
    });
  }
}

/* =========================
   fetch / clean
========================= */

async function fetchHtml(url) {
  const headersList = [
    {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://www.boatrace.jp/",
      "Cache-Control": "no-cache"
    },
    {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ja-JP,ja;q=0.9"
    }
  ];

  let lastStatus = "";

  for (const headers of headersList) {
    const response = await fetch(url, { headers });
    lastStatus = response.status;
    if (response.ok) return await response.text();
  }

  throw new Error(`公式サイト取得失敗: ${lastStatus}`);
}

function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(td|th|div|p|li|span|tr)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#12288;/g, " ")
    .replace(/　/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   出走表解析
========================= */

function parseRaceText(text) {
  let target = text;

  const startIndex = text.indexOf("登録番号");
  if (startIndex >= 0) target = text.slice(startIndex);

  const regClassRegex = /(\d{4})\s*\/\s*(A1|A2|B1|B2)/g;
  const hits = [];
  let m;

  while ((m = regClassRegex.exec(target)) !== null) {
    hits.push({
      index: m.index,
      regNo: m[1],
      class: m[2],
      end: regClassRegex.lastIndex,
      hit: m[0]
    });
  }

  const boats = [];

  for (let i = 0; i < hits.length && i < 6; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const block = target.slice(cur.index, next ? next.index : cur.index + 1100);

    const boat = i + 1;
    const afterClass = target.slice(cur.end, cur.end + 150);
    const name = extractName(afterClass);
    const rates = extractRates(block);
    const equipment = extractEquipment(block);

    boats.push({
      boat,
      regNo: cur.regNo,
      class: cur.class,
      name,
      branchHome: extractBranchHome(block),
      ageWeight: extractAgeWeight(block),
      avgST: extractAverageST(block),

      nationalWinRate: rates.nationalWinRate,
      national2Rate: rates.national2Rate,
      national3Rate: rates.national3Rate,
      localWinRate: rates.localWinRate,
      local2Rate: rates.local2Rate,
      local3Rate: rates.local3Rate,

      motor: equipment.motor,
      motor2Rate: equipment.motor2Rate,
      motor3Rate: equipment.motor3Rate,
      boatNo: equipment.boatNo,
      boat2Rate: equipment.boat2Rate,
      boat3Rate: equipment.boat3Rate,

      exhibitionTime: null,
      tilt: null,
      exhibitionST: null,
      exhibitionCourse: null,
      circumferenceTime: null,
      straightTime: null,
      turnTime: null,

      raw: block.slice(0, 650)
    });
  }

  return { boats, hits };
}

function extractName(afterClass) {
  const m = afterClass.match(
    /^\s*([一-龥ぁ-んァ-ヶー・]+\s+[一-龥ぁ-んァ-ヶー・]+)\s+[一-龥]{2,4}\/[一-龥]{2,4}/
  );

  if (m) return cleanName(m[1]);

  const fallback = afterClass.match(
    /^\s*([一-龥ぁ-んァ-ヶー・]{2,8}\s*[一-龥ぁ-んァ-ヶー・]{1,8})/
  );

  return fallback ? cleanName(fallback[1]) : "";
}

function extractRates(block) {
  const avgST = extractAverageST(block);
  const numbers = [...block.matchAll(/\b\d+\.\d{2}\b/g)].map(x => Number(x[0]));

  let start = 0;

  if (avgST !== null) {
    const stIndex = numbers.findIndex(n => Math.abs(n - avgST) < 0.001);
    if (stIndex >= 0) start = stIndex + 1;
  }

  const rates = numbers.slice(start);

  return {
    nationalWinRate: pickRate(rates[0]),
    national2Rate: pickPercent(rates[1]),
    national3Rate: pickPercent(rates[2]),
    localWinRate: pickRate(rates[3]),
    local2Rate: pickPercent(rates[4]),
    local3Rate: pickPercent(rates[5])
  };
}

function extractEquipment(block) {
  const avgST = extractAverageST(block);
  const tokens = block.split(" ");

  let startTokenIndex = 0;

  if (avgST !== null) {
    const avgStTokenIndex = tokens.findIndex(t => t === avgST.toFixed(2));
    startTokenIndex = avgStTokenIndex >= 0 ? avgStTokenIndex + 7 : 0;
  } else {
    const dashIndex = tokens.findIndex((t, idx) => {
      return t === "-" && idx > 0 && tokens[idx - 1]?.startsWith("L");
    });

    startTokenIndex = dashIndex >= 0 ? dashIndex + 7 : 0;
  }

  let equipment = findEquipmentPattern(tokens.slice(startTokenIndex));

  if (equipment.motor === null) {
    equipment = findEquipmentPattern(tokens);
  }

  return equipment;
}

function findEquipmentPattern(tokens) {
  for (let i = 0; i < tokens.length - 5; i++) {
    const mNo = toInt(tokens[i]);
    const m2 = toDecimal(tokens[i + 1]);
    const m3 = toDecimal(tokens[i + 2]);
    const bNo = toInt(tokens[i + 3]);
    const b2 = toDecimal(tokens[i + 4]);
    const b3 = toDecimal(tokens[i + 5]);

    if (
      isNo(mNo) &&
      isPercent(m2) &&
      isPercent(m3) &&
      isNo(bNo) &&
      isPercent(b2) &&
      isPercent(b3)
    ) {
      return {
        motor: mNo,
        motor2Rate: m2,
        motor3Rate: m3,
        boatNo: bNo,
        boat2Rate: b2,
        boat3Rate: b3
      };
    }
  }

  return {
    motor: null,
    motor2Rate: null,
    motor3Rate: null,
    boatNo: null,
    boat2Rate: null,
    boat3Rate: null
  };
}

/* =========================
   直前情報 / 展示解析
========================= */

function parseBeforeInfoText(text) {
  const displays = [];

  const exhibitionList = parseExhibitionList(text);
  const stList = parseStartExhibitionList(text);

  for (let boat = 1; boat <= 6; boat++) {
    const ex = exhibitionList.find(x => x.boat === boat);
    const st = stList.find(x => x.boat === boat);

    displays.push({
      boat,
      exhibitionCourse: st?.course ?? boat,
      exhibitionST: st?.st ?? null,
      exhibitionTime: ex?.exhibitionTime ?? null,
      tilt: ex?.tilt ?? null,
      circumferenceTime: null,
      straightTime: ex?.exhibitionTime ?? null,
      turnTime: null,
      beforeRaw: [ex?.raw || "", st?.raw || ""].filter(Boolean).join(" / ")
    });
  }

  return displays;
}

function parseExhibitionList(text) {
  const displays = [];

  let target = text;
  const startIndex = text.indexOf("体重 展示 タイム チルト");
  if (startIndex >= 0) target = text.slice(startIndex);

  const endIndex = target.indexOf("スタート展示");
  if (endIndex >= 0) target = target.slice(0, endIndex);

  const regex =
    /(?:^|\s)([1-6])\s+([一-龥ぁ-んァ-ヶー・]+\s+[一-龥ぁ-んァ-ヶー・]+)\s+(\d{2,3}\.\d)kg\s+(\d\.\d{2})\s+(-?\d+\.\d)/g;

  let m;
  while ((m = regex.exec(target)) !== null) {
    displays.push({
      boat: Number(m[1]),
      name: cleanName(m[2]),
      weight: Number(m[3]),
      exhibitionTime: Number(m[4]),
      tilt: Number(m[5]),
      raw: m[0].trim()
    });
  }

  return displays;
}

function parseStartExhibitionList(text) {
  const results = [];

  const idx = text.indexOf("スタート展示");
  if (idx < 0) return results;

  let target = text.slice(idx);

  const weatherIndex = target.indexOf("水面気象情報");
  if (weatherIndex >= 0) target = target.slice(0, weatherIndex);

  const regex = /([1-6])\s+(F|L)?\s*\.?(\d{2})/g;
  let m;

  while ((m = regex.exec(target)) !== null) {
    const course = Number(m[1]);
    const sign = m[2] || "";
    const rawNum = m[3];

    let st = Number(`0.${rawNum}`);
    if (sign === "F") st = -st;

    results.push({
      boat: course,
      course,
      st,
      raw: m[0].trim()
    });
  }

  return results.slice(0, 6);
}

function parseWeatherInfo(text) {
  const idx = text.indexOf("水面気象情報");
  if (idx < 0) return null;

  const target = text.slice(idx, idx + 400);

  const timeMatch = target.match(/(\d{1,2}:\d{2})現在/);
  const tempMatch = target.match(/気温\s*([\d.]+)℃/);
  const weatherMatch = target.match(/気温\s*[\d.]+℃\s*([^\s]+)\s*風速/);
  const windMatch = target.match(/風速\s*([\d.]+)m/);
  const waterMatch = target.match(/水温\s*([\d.]+)℃/);
  const waveMatch = target.match(/波高\s*([\d.]+)cm/);

  return {
    weatherTime: timeMatch ? timeMatch[1] : null,
    temperature: tempMatch ? Number(tempMatch[1]) : null,
    weather: weatherMatch ? weatherMatch[1] : null,
    windSpeed: windMatch ? Number(windMatch[1]) : null,
    waterTemp: waterMatch ? Number(waterMatch[1]) : null,
    waveHeight: waveMatch ? Number(waveMatch[1]) : null,
    raw: target
  };
}

function mergeBeforeInfo(boats, displays) {
  return boats.map(b => {
    const d = displays.find(x => x.boat === b.boat);

    if (!d) return b;

    return {
      ...b,
      exhibitionCourse: d.exhibitionCourse,
      exhibitionST: d.exhibitionST,
      exhibitionTime: d.exhibitionTime,
      tilt: d.tilt,
      circumferenceTime: d.circumferenceTime,
      straightTime: d.straightTime,
      turnTime: d.turnTime,
      beforeRaw: d.beforeRaw
    };
  });
}

/* =========================
   v5 予想エンジン
========================= */

function buildPredictionEngine(baseBoats, weather, jcd) {
  const boats = baseBoats.map(b => ({ ...b }));

  const venue = venueProfile(jcd);
  const rankedExhibition = rankByLow(boats, "exhibitionTime");
  const rankedST = rankByLow(boats, "exhibitionST");
  const rankedMotor = rankByHigh(boats, "motor2Rate");
  const rankedBoat = rankByHigh(boats, "boat2Rate");

  for (const b of boats) {
    const buffs = [];
    const debuffs = [];

    let score = 50;

    score += courseBasePoint(b.boat, venue);

    if (b.nationalWinRate != null) score += clamp((b.nationalWinRate - 4.5) * 4, -8, 12);
    if (b.localWinRate != null) score += clamp((b.localWinRate - 4.5) * 3, -6, 10);

    if (b.avgST != null) score += clamp((0.18 - b.avgST) * 100, -8, 10);
    if (b.exhibitionST != null) score += clamp((0.12 - b.exhibitionST) * 80, -8, 12);

    if (b.motor2Rate != null) score += clamp((b.motor2Rate - 33) * 0.35, -8, 10);
    if (b.boat2Rate != null) score += clamp((b.boat2Rate - 33) * 0.25, -6, 8);

    if (b.exhibitionTime != null) {
      const exRank = rankedExhibition.find(x => x.boat === b.boat)?.rank;
      if (exRank === 1) score += 8;
      else if (exRank === 2) score += 5;
      else if (exRank === 6) score -= 5;
    }

    if (b.tilt != null && b.tilt >= 0.5) {
      if (b.boat >= 4) score += 5;
      else score -= 2;
    }

    if (b.boat === 1 && venue.inStrong) score += 8;
    if (b.boat >= 5 && venue.outHard) score -= 5;

    if (weather?.windSpeed >= 4) {
      score += b.boat >= 3 ? 3 : -2;
    }

    const exRank = rankedExhibition.find(x => x.boat === b.boat)?.rank;
    const stRank = rankedST.find(x => x.boat === b.boat)?.rank;
    const motorRank = rankedMotor.find(x => x.boat === b.boat)?.rank;
    const boatRank = rankedBoat.find(x => x.boat === b.boat)?.rank;

    if (exRank === 1) buffs.push("⬆️展示タイム1位 +8");
    if (exRank === 2) buffs.push("⬆️展示タイム2位 +5");
    if (stRank === 1) buffs.push("⬆️展示ST1位 +6");
    if (motorRank === 1) buffs.push("⬆️モーター2連率1位 +5");
    if (boatRank === 1) buffs.push("⬆️ボート2連率1位 +4");
    if (b.boat === 1 && venue.inStrong) buffs.push("⬆️場特性イン有利 +8");
    if (b.localWinRate != null && b.localWinRate >= 6) buffs.push("⬆️当地勝率高め +5");
    if (b.tilt != null && b.tilt >= 0.5) buffs.push("⬆️チルト攻撃型 +5");

    if (exRank === 6) debuffs.push("⬇️展示タイム最下位 -5");
    if (b.avgST != null && b.avgST >= 0.20) debuffs.push("⬇️平均ST遅め -4");
    if (b.boat >= 5 && venue.outHard) debuffs.push("⬇️外枠不利 -5");
    if (b.motor2Rate != null && b.motor2Rate < 30) debuffs.push("⬇️モーター2連率低め -4");

    b.chappyScore = Math.round(clamp(score, 1, 100));
    b.funaTaroScore = calcFunaTaroScore(b, boats, weather);
    b.totalScore = Math.round(clamp(b.chappyScore * 0.65 + b.funaTaroScore * 0.35, 1, 100));
    b.buffs = buffs;
    b.debuffs = debuffs;
    b.shortComment = makeBoatComment(b, exRank, stRank, motorRank);
  }

  const sorted = [...boats].sort((a, b) => b.totalScore - a.totalScore);
  const marks = {
    honmei: markBoat(sorted[0], "◎"),
    taikou: markBoat(sorted[1], "○"),
    ana: markBoat(sorted[2], "▲"),
    osaE: markBoat(sorted[3], "△")
  };

  const slitAlert = makeSlitAlert(boats);
  const doubleTimeAlert = makeDoubleTimeAlert(boats);
  const newSumAlert = makeNewSumAlert(boats, weather);
  const raceShape = makeRaceShape(boats, venue, weather);
  const mainFormation = makeMainFormation(boats, sorted, raceShape, venue);
  const holeFormation = makeHoleFormation(boats, sorted, raceShape, venue);
  const raceComment = makeRaceComment(boats, marks, raceShape, weather, venue);

  return {
    boats,
    marks,
    slitAlert,
    doubleTimeAlert,
    newSumAlert,
    raceShape,
    mainFormation,
    holeFormation,
    raceComment
  };
}

function calcFunaTaroScore(b, boats, weather) {
  let score = 50;

  const exRank = rankByLow(boats, "exhibitionTime").find(x => x.boat === b.boat)?.rank;
  const stRank = rankByLow(boats, "exhibitionST").find(x => x.boat === b.boat)?.rank;
  const motorRank = rankByHigh(boats, "motor2Rate").find(x => x.boat === b.boat)?.rank;

  if (exRank === 1) score += 12;
  if (stRank === 1) score += 10;
  if (motorRank === 1) score += 7;

  if (b.exhibitionTime != null && b.straightTime != null) {
    const sum = b.exhibitionTime + b.straightTime;
    score += clamp((13.8 - sum) * 10, -8, 8);
  }

  if (weather?.windSpeed >= 4 && b.boat >= 3) score += 5;

  if (b.boat === 1) score += 6;
  if (b.boat === 2) score += 3;
  if (b.boat >= 5) score -= 2;

  return Math.round(clamp(score, 1, 100));
}

function makeSlitAlert(boats) {
  const alerts = [];

  for (let i = 0; i < boats.length; i++) {
    const cur = boats[i];
    const left = boats[i - 1];
    const right = boats[i + 1];

    if (cur.exhibitionST == null) continue;

    if (left?.exhibitionST != null && left.exhibitionST - cur.exhibitionST >= 0.1) {
      alerts.push({
        boat: cur.boat,
        type: "スリットアラート",
        reason: `${left.boat}号艇より展示STが0.10以上早い`
      });
    }

    if (right?.exhibitionST != null && right.exhibitionST - cur.exhibitionST >= 0.1) {
      alerts.push({
        boat: cur.boat,
        type: "スリットアラート",
        reason: `${right.boat}号艇より展示STが0.10以上早い`
      });
    }
  }

  return alerts;
}

function makeDoubleTimeAlert(boats) {
  const ex1 = rankByLow(boats, "exhibitionTime")[0];
  const straight1 = rankByLow(boats, "straightTime")[0];

  if (!ex1 || !straight1) return [];

  if (ex1.boat === straight1.boat) {
    return [{
      boat: ex1.boat,
      type: "ダブルタイム理論",
      reason: "展示タイム＋直線系タイムが両方上位"
    }];
  }

  return [
    { boat: ex1.boat, type: "展示タイム1位", reason: "展示タイム最上位" },
    { boat: straight1.boat, type: "直線系タイム1位", reason: "直線系タイム最上位" }
  ];
}

function makeNewSumAlert(boats, weather) {
  const sums = boats
    .filter(b => b.exhibitionTime != null && b.straightTime != null)
    .map(b => ({
      boat: b.boat,
      sum: Number((b.exhibitionTime + b.straightTime).toFixed(2))
    }));

  if (!sums.length) return [];

  const avg = sums.reduce((a, b) => a + b.sum, 0) / sums.length;

  return sums
    .map(x => ({
      boat: x.boat,
      type: "新サム理論",
      sum: x.sum,
      diff: Number((avg - x.sum).toFixed(2)),
      reason: weather?.windSpeed >= 4
        ? "風ありで新サム効果やや強め"
        : "展示＋直線系の合計が平均より良い"
    }))
    .filter(x => x.diff > 0)
    .sort((a, b) => b.diff - a.diff);
}

function makeRaceShape(boats, venue, weather) {
  const b1 = boats.find(b => b.boat === 1);
  const b2 = boats.find(b => b.boat === 2);
  const b3 = boats.find(b => b.boat === 3);
  const b4 = boats.find(b => b.boat === 4);
  const b5 = boats.find(b => b.boat === 5);

  const stRank = rankByLow(boats, "exhibitionST");
  const exRank = rankByLow(boats, "exhibitionTime");

  const fastestST = stRank[0]?.boat;
  const bestEx = exRank[0]?.boat;

  let shape = "1逃げ本線";
  let attackBoat = null;

  if (b1 && b1.totalScore >= 72 && venue.inStrong) {
    shape = "1逃げ中心";
  }

  if (fastestST === 3 || bestEx === 3) {
    shape = "3攻め警戒";
    attackBoat = 3;
  }

  if (fastestST === 4 || (b4?.tilt ?? 0) >= 0.5) {
    shape = "4カド攻め警戒";
    attackBoat = 4;
  }

  if ((b5?.tilt ?? 0) >= 0.5 || fastestST === 5) {
    shape = "5一撃まくり差し警戒";
    attackBoat = 5;
  }

  if (weather?.windSpeed >= 4) {
    shape += "・風で波乱含み";
  }

  return {
    shape,
    attackBoat,
    fastestST,
    bestExhibition: bestEx,
    memo: "高指数艇と展開カバーは分けて判定"
  };
}

function makeMainFormation(boats, sorted, raceShape, venue) {
  const top = sorted[0]?.boat || 1;
  const second = sorted[1]?.boat || 2;
  const third = sorted[2]?.boat || 3;
  const fourth = sorted[3]?.boat || 4;

  if (raceShape.shape.includes("1逃げ")) {
    return [
      `1-${second}${third}-${second}${third}${fourth}`,
      `1-2-34`,
      `1-3-24`,
      `1-23-2345`
    ];
  }

  if (raceShape.attackBoat === 3) {
    return [
      `1-3-245`,
      `3-1-245`,
      `3-4-125`,
      `1-23-2345`
    ];
  }

  if (raceShape.attackBoat === 4) {
    return [
      `1-4-235`,
      `4-1-235`,
      `4-5-123`,
      `1-24-2345`
    ];
  }

  return [
    `${top}-${second}${third}-${second}${third}${fourth}`,
    `1-23-2345`,
    `1-2-34`
  ];
}

function makeHoleFormation(boats, sorted, raceShape, venue) {
  const outer = boats
    .filter(b => b.boat >= 4)
    .sort((a, b) => b.totalScore - a.totalScore)
    .map(b => b.boat);

  const o1 = outer[0] || 5;
  const o2 = outer[1] || 4;

  const holes = [
    `${o1}-1-2346`,
    `${o1}-${o2}-1236`,
    `1-${o1}-236`,
    `2-1-${o1}${o2}`,
    `3-${o1}-126`
  ];

  if (raceShape.attackBoat === 3) {
    holes.unshift(`3-5-1246`, `3-6-1245`);
  }

  if (raceShape.attackBoat === 4) {
    holes.unshift(`4-5-1236`, `4-6-1235`);
  }

  return [...new Set(holes)].slice(0, 8);
}

function makeRaceComment(boats, marks, raceShape, weather, venue) {
  const honmei = marks.honmei?.boat;
  const taikou = marks.taikou?.boat;

  let comment = `本命は${honmei}号艇。対抗は${taikou}号艇。`;

  comment += ` 展開は「${raceShape.shape}」。`;

  if (weather) {
    comment += ` 水面は${weather.weather || "不明"}、風速${weather.windSpeed ?? "-"}m、波高${weather.waveHeight ?? "-"}cm。`;
  }

  comment += " 本線はイン逃げ・2コース差し・3コース攻めを中心に、穴は外枠の展開突きまで押さえる。";

  return comment;
}

function markBoat(b, mark) {
  if (!b) return null;

  return {
    mark,
    boat: b.boat,
    name: b.name,
    totalScore: b.totalScore,
    chappyScore: b.chappyScore,
    funaTaroScore: b.funaTaroScore
  };
}

/* =========================
   Venue
========================= */

function venueProfile(jcd) {
  const code = String(jcd).padStart(2, "0");

  const profiles = {
    "24": { name: "大村", inStrong: true, outHard: true },
    "15": { name: "丸亀", inStrong: true, outHard: false },
    "20": { name: "若松", inStrong: true, outHard: false },
    "17": { name: "宮島", inStrong: true, outHard: false },
    "03": { name: "江戸川", inStrong: false, outHard: false },
    "22": { name: "福岡", inStrong: false, outHard: false }
  };

  return profiles[code] || { name: "不明", inStrong: true, outHard: false };
}

function courseBasePoint(boat, venue) {
  if (boat === 1) return venue.inStrong ? 12 : 6;
  if (boat === 2) return 6;
  if (boat === 3) return 4;
  if (boat === 4) return 2;
  if (boat === 5) return venue.outHard ? -4 : -1;
  if (boat === 6) return venue.outHard ? -8 : -4;
  return 0;
}

/* =========================
   Utility
========================= */

function rankByLow(boats, key) {
  return boats
    .filter(b => typeof b[key] === "number" && !Number.isNaN(b[key]))
    .sort((a, b) => a[key] - b[key])
    .map((b, i) => ({ ...b, rank: i + 1 }));
}

function rankByHigh(boats, key) {
  return boats
    .filter(b => typeof b[key] === "number" && !Number.isNaN(b[key]))
    .sort((a, b) => b[key] - a[key])
    .map((b, i) => ({ ...b, rank: i + 1 }));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}

function pickRate(n) {
  return typeof n === "number" && n >= 0 && n <= 10 ? n : null;
}

function pickPercent(n) {
  return typeof n === "number" && n >= 0 && n <= 100 ? n : null;
}

function toInt(v) {
  return /^\d{1,3}$/.test(String(v)) ? Number(v) : null;
}

function toDecimal(v) {
  return /^\d+\.\d{2}$/.test(String(v)) ? Number(v) : null;
}

function isNo(n) {
  return typeof n === "number" && n >= 1 && n <= 999;
}

function isPercent(n) {
  return typeof n === "number" && n >= 0 && n <= 100;
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/[0-9.]/g, "")
    .trim();
}

function extractBranchHome(block) {
  const m = block.match(/([一-龥]{2,4})\/([一-龥]{2,4})/);
  return m ? `${m[1]}/${m[2]}` : "";
}

function extractAgeWeight(block) {
  const m = block.match(/(\d{2})歳\/\s*(\d{2,3}\.?\d*)kg/);
  return m ? `${m[1]}歳/${m[2]}kg` : "";
}

function extractAverageST(block) {
  const m = block.match(/\bF\d+\s+L\d+\s+(0\.\d{2})\b/);
  if (m) return Number(m[1]);

  if (/\bF\d+\s+L\d+\s+-\b/.test(block)) return null;

  const fallback = block.match(/\b(0\.\d{2})\b/);
  return fallback ? Number(fallback[1]) : null;
}

function makeBoatComment(b, exRank, stRank, motorRank) {
  const parts = [];

  if (b.boat === 1) parts.push("イン戦の軸候補");
  if (exRank === 1) parts.push("展示最上位");
  if (stRank === 1) parts.push("スリット優勢");
  if (motorRank === 1) parts.push("モーター上位");
  if (b.boat >= 4) parts.push("展開突き候補");

  return parts.length ? parts.join("・") : "平均的な評価";
}

function makeDebug(html, text, parsedRace, beforeParsed, theory) {
  return {
    htmlLength: html.length,
    hasNoData: text.includes("データがありません"),
    hasRacerNameClass: /A1|A2|B1|B2/.test(text),
    hasBoatColor: /boatColor|is-boatColor|boat_color/i.test(html),
    trCount: (html.match(/<tr/gi) || []).length,
    tbodyCount: (html.match(/<tbody/gi) || []).length,
    hitCount: parsedRace.hits.length,
    beforeInfoOk: beforeParsed.ok,
    beforeInfoError: beforeParsed.error,
    weather: beforeParsed.weather,
    beforeDisplays: beforeParsed.displays,
    theory: {
      marks: theory.marks,
      slitAlert: theory.slitAlert,
      doubleTimeAlert: theory.doubleTimeAlert,
      newSumAlert: theory.newSumAlert,
      raceShape: theory.raceShape,
      mainFormation: theory.mainFormation,
      holeFormation: theory.holeFormation
    },
    foundBlocks: parsedRace.boats.map(b => ({
      boat: b.boat,
      regNo: b.regNo,
      class: b.class,
      name: b.name,
      avgST: b.avgST,
      motor: b.motor,
      motor2Rate: b.motor2Rate,
      motor3Rate: b.motor3Rate,
      boatNo: b.boatNo,
      boat2Rate: b.boat2Rate,
      boat3Rate: b.boat3Rate,
      raw: b.raw
    })),
    beforeTextHead: beforeParsed.text ? beforeParsed.text.slice(0, 2500) : ""
  };
}
