// api/race.js v4.1 展示タイム完全取得版
// racelist + beforeinfo 合体
// 例: /api/race?jcd=15&rno=1&date=20260622&debug=1

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
          text: beforeText,
          error: ""
        };
      }
    } catch (e) {
      beforeParsed.error = e.message;
    }

    const boats = mergeBeforeInfo(parsedRace.boats, beforeParsed.displays);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      raceListUrl,
      beforeInfoUrl,
      count: boats.length,
      boats,
      debug: debug === "1" ? makeDebug(raceHtml, raceText, parsedRace, beforeParsed) : undefined
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
   直前情報 / 展示解析 v4.1
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
   Utility
========================= */

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

function makeDebug(html, text, parsedRace, beforeParsed) {
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
    beforeDisplays: beforeParsed.displays,
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
