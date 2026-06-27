// api/race.js v6 stable
// 落ちない版：公式取得失敗・解析失敗でも6艇を返す

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date, debug } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      error: "jcd, rno, date が必要です"
    });
  }

  const raceListUrl =
    `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${rno}&jcd=${jcd}&hd=${date}`;

  const beforeInfoUrl =
    `https://www.boatrace.jp/owpc/pc/race/beforeinfo?rno=${rno}&jcd=${jcd}&hd=${date}`;

  let raceHtml = "";
  let raceText = "";
  let boats = [];

  try {
    raceHtml = await fetchHtml(raceListUrl);
    raceText = cleanText(raceHtml);
    boats = parseRaceText(raceText);
  } catch (e) {
    boats = [];
  }

  if (!boats.length) {
    boats = makeFallbackBoats();
  }

  let weather = null;
  let displays = [];

  try {
    const beforeHtml = await fetchHtml(beforeInfoUrl);
    const beforeText = cleanText(beforeHtml);
    weather = parseWeatherInfo(beforeText);
    displays = parseBeforeInfoText(beforeText);
  } catch (e) {
    weather = null;
    displays = [];
  }

  boats = mergeBeforeInfo(boats, displays);

  const theory = buildPredictionEngine(boats, weather, jcd);
  boats = theory.boats;

  return res.status(200).json({
    ok: true,
    source: "boatrace.jp",
    jcd,
    rno,
    date,
    venue: theory.venue,
    raceListUrl,
    beforeInfoUrl,
    count: boats.length,
    weather,
    boats,
    prediction: {
      marks: theory.marks,
      slitAlert: theory.slitAlert,
      doubleTimeAlert: theory.doubleTimeAlert,
      newSumAlert: theory.newSumAlert,
      raceShape: theory.raceShape,
      mainFormation: theory.mainFormation,
      safeFormation: theory.safeFormation,
      holeFormation: theory.holeFormation,
      manshuFormation: theory.manshuFormation,
      raceComment: theory.raceComment
    },
    debug: debug === "1"
      ? {
          htmlLength: raceHtml.length,
          textSample: raceText.slice(0, 1500),
          count: boats.length
        }
      : null
  });
};

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Referer": "https://www.boatrace.jp/"
    }
  });

  if (!response.ok) {
    throw new Error(`公式サイト取得失敗:${response.status}`);
  }

  return await response.text();
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
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaceText(text) {
  const boats = [];
  const target = text.includes("登録番号")
    ? text.slice(text.indexOf("登録番号"))
    : text;

  const regex = /(\d{4})\s*(?:\/|\s+)\s*(A1|A2|B1|B2)/g;
  const hits = [];
  let m;

  while ((m = regex.exec(target)) !== null) {
    hits.push({
      index: m.index,
      end: regex.lastIndex,
      regNo: m[1],
      class: m[2]
    });
  }

  for (let i = 0; i < hits.length && i < 6; i++) {
    const cur = hits[i];
    const next = hits[i + 1];
    const block = target.slice(cur.index, next ? next.index : cur.index + 1000);
    const afterClass = target.slice(cur.end, cur.end + 160);

    boats.push({
      boat: i + 1,
      regNo: cur.regNo,
      class: cur.class,
      name: extractName(afterClass) || `${i + 1}号艇`,
      avgST: extractAverageST(block),
      nationalWinRate: null,
      localWinRate: null,
      motor: null,
      motor2Rate: null,
      motor3Rate: null,
      boatNo: null,
      boat2Rate: null,
      boat3Rate: null,
      exhibitionTime: null,
      exhibitionST: null,
      tilt: null,
      exhibitionCourse: i + 1,
      straightTime: null,
      raw: block.slice(0, 500)
    });
  }

  return boats;
}

function extractName(text) {
  const m = String(text || "").match(
    /([一-龥ぁ-んァ-ヶー・]{1,8}\s+[一-龥ぁ-んァ-ヶー・]{1,8})/
  );
  return m ? m[1].replace(/\s+/g, "") : "";
}

function extractAverageST(block) {
  const m = String(block || "").match(/\b(0\.\d{2})\b/);
  return m ? Number(m[1]) : null;
}

function parseBeforeInfoText(text) {
  const displays = [];
  for (let boat = 1; boat <= 6; boat++) {
    displays.push({
      boat,
      exhibitionCourse: boat,
      exhibitionST: null,
      exhibitionTime: null,
      tilt: null
    });
  }
  return displays;
}

function parseWeatherInfo(text) {
  const temp = String(text || "").match(/気温\s*([\d.]+)℃/);
  const wind = String(text || "").match(/風速\s*([\d.]+)m/);
  const wave = String(text || "").match(/波高\s*([\d.]+)cm/);

  return {
    weather: null,
    temperature: temp ? Number(temp[1]) : null,
    windSpeed: wind ? Number(wind[1]) : null,
    waveHeight: wave ? Number(wave[1]) : null
  };
}

function mergeBeforeInfo(boats, displays) {
  return boats.map(b => {
    const d = displays.find(x => x.boat === b.boat);
    return d ? { ...b, ...d } : b;
  });
}

function buildPredictionEngine(baseBoats, weather, jcd) {
  const venue = venueProfile(jcd);
  const boats = baseBoats.map(b => {
    let score = 50 + courseBasePoint(b.boat, venue);

    if (b.boat === 1) score += venue.inPower;
    if (b.avgST != null && b.avgST <= 0.15) score += 6;
    if (b.avgST != null && b.avgST >= 0.20) score -= 5;

    return {
      ...b,
      totalScore: clamp(score, 1, 100),
      chappyScore: clamp(score, 1, 100),
      funaTaroScore: clamp(score, 1, 100),
      buffs: b.boat === 1 ? ["⬆️イン有利"] : [],
      debuffs: [],
      shortComment: roleName(b.boat)
    };
  });

  const sorted = [...boats].sort((a, b) => b.totalScore - a.totalScore);

  const marks = {
    honmei: markBoat(sorted[0], "◎"),
    taikou: markBoat(sorted[1], "○"),
    ana: markBoat(sorted[2], "▲"),
    osae: markBoat(sorted[3], "△")
  };

  const raceShape = makeRaceShape(boats, venue, weather);

  return {
    venue,
    boats,
    marks,
    slitAlert: [],
    doubleTimeAlert: [],
    newSumAlert: [],
    raceShape,
    mainFormation: makeMainFormation(raceShape),
    safeFormation: ["1-23-2345"],
    holeFormation: makeHoleFormation(raceShape),
    manshuFormation: makeManshuFormation(raceShape),
    raceComment: `${venue.name}は「${venue.courseBias}」。情報→展開→評価→舟券で見る。`
  };
}

function makeRaceShape(boats, venue, weather) {
  let shape = venue.recommendedShape;
  let attackBoat = null;

  if (venue.inPower >= 8) {
    shape = "1逃げ中心";
  }

  if (weather?.windSpeed >= 4 || weather?.waveHeight >= 5) {
    shape += "・水面波乱注意";
  }

  return {
    venueName: venue.name,
    courseBias: venue.courseBias,
    recommendedShape: venue.recommendedShape,
    shape,
    attackBoat,
    memo: "場特性を優先して展開判定"
  };
}

function makeMainFormation(raceShape) {
  if (raceShape.shape.includes("1逃げ")) {
    return ["1-23-2345"];
  }
  return ["1-23-2345", "3-1-245"];
}

function makeHoleFormation(raceShape) {
  return ["3-1-245", "4-1-235", "5-14-2346"];
}

function makeManshuFormation(raceShape) {
  return ["4-15-2356", "5-14-2346", "6-34-12345"];
}

function markBoat(b, mark) {
  if (!b) return null;
  return {
    mark,
    boat: b.boat,
    name: b.name,
    totalScore: b.totalScore
  };
}

function venueProfile(jcd) {
  const code = String(jcd).padStart(2, "0");

  const map = {
    "01": ["桐生", 8, "イン寄り", "1逃げ＋2差し＋3攻め"],
    "02": ["戸田", 3, "センター波乱", "3・4攻め警戒"],
    "03": ["江戸川", 1, "波乱水面", "波風で外差し警戒"],
    "04": ["平和島", 5, "中穴", "1逃げ＋3攻め"],
    "05": ["多摩川", 6, "静水面寄り", "センター実力重視"],
    "06": ["浜名湖", 5, "風注意", "3・4・5浮上"],
    "07": ["蒲郡", 8, "イン寄り", "1逃げ＋2差し"],
    "08": ["常滑", 7, "イン＋センター", "1逃げ＋3攻め"],
    "09": ["津", 7, "イン寄り", "1逃げ＋2差し"],
    "10": ["三国", 7, "イン＋3攻め", "1逃げ＋3まくり"],
    "11": ["びわこ", 5, "風波乱", "4カド警戒"],
    "12": ["住之江", 9, "イン強い", "1逃げ中心"],
    "13": ["尼崎", 8, "イン寄り", "1逃げ＋2差し"],
    "14": ["鳴門", 5, "風波乱", "まくり差し警戒"],
    "15": ["丸亀", 8, "イン寄りナイター", "1逃げ＋2差し＋3攻め"],
    "16": ["児島", 7, "バランス", "1逃げ＋3攻め"],
    "17": ["宮島", 6, "潮注意", "潮で2差し・4残り警戒"],
    "18": ["徳山", 9, "イン強い", "1逃げ中心"],
    "19": ["下関", 8, "イン寄りナイター", "1逃げ＋2差し"],
    "20": ["若松", 7, "夜の展開水面", "2差し＋3攻め＋外拾い"],
    "21": ["芦屋", 8, "イン寄り", "1逃げ＋2差し"],
    "22": ["福岡", 3, "河口波乱", "2M波乱・外差し警戒"],
    "23": ["唐津", 8, "イン寄り", "1逃げ＋2差し"],
    "24": ["大村", 10, "全国屈指のイン水面", "1逃げ中心＋2差し残り"]
  };

  const v = map[code] || map["24"];

  return {
    name: v[0],
    inPower: v[1],
    secondPower: 5,
    thirdPower: 4,
    fourthPower: 3,
    fifthPower: 0,
    sixthPower: -3,
    courseBias: v[2],
    recommendedShape: v[3]
  };
}

function courseBasePoint(boat, venue) {
  if (boat === 1) return venue.inPower;
  if (boat === 2) return venue.secondPower;
  if (boat === 3) return venue.thirdPower;
  if (boat === 4) return venue.fourthPower;
  if (boat === 5) return venue.fifthPower;
  if (boat === 6) return venue.sixthPower;
  return 0;
}

function roleName(boat) {
  if (boat === 1) return "逃げ軸";
  if (boat === 2) return "差し候補";
  if (boat === 3) return "攻め候補";
  if (boat === 4) return "カド攻め・残し";
  if (boat === 5) return "差し場待ち";
  if (boat === 6) return "展開待ち";
  return "-";
}

function makeFallbackBoats() {
  return [1, 2, 3, 4, 5, 6].map(no => ({
    boat: no,
    regNo: "",
    class: "-",
    name: `${no}号艇`,
    avgST: null,
    nationalWinRate: null,
    localWinRate: null,
    motor: null,
    motor2Rate: null,
    motor3Rate: null,
    boatNo: null,
    boat2Rate: null,
    boat3Rate: null,
    exhibitionTime: null,
    exhibitionST: null,
    tilt: null,
    exhibitionCourse: no,
    straightTime: null,
    raw: "fallback"
  }));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n) || 0));
}