// api/race.js v3.6 艇番固定版
// 6艇の順番をそのまま 1〜6号艇に固定する版
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

  const url =
    `https://www.boatrace.jp/owpc/pc/race/racelist` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);
    const text = cleanText(html);

    if (text.includes("データがありません")) {
      return res.status(200).json({
        ok: true,
        source: "boatrace.jp",
        jcd,
        rno,
        date,
        url,
        count: 0,
        boats: [],
        message: "データがありません"
      });
    }

    const parsed = parseRaceText(text);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      url,
      count: parsed.boats.length,
      boats: parsed.boats,
      debug: debug === "1" ? makeDebug(html, text, parsed) : undefined
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message,
      jcd,
      rno,
      date,
      url
    });
  }
}

async function fetchHtml(url) {
  const headersList = [
    {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
    const block = target.slice(cur.index, next ? next.index : cur.index + 1000);

    const boat = i + 1; // ★艇番は出走表の順番で固定

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

      raw: block.slice(0, 550)
    });
  }

  return {
    boats,
    hits
  };
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

function pickRate(n) {
  return typeof n === "number" && n >= 0 && n <= 10 ? n : null;
}

function pickPercent(n) {
  return typeof n === "number" && n >= 0 && n <= 100 ? n : null;
}

function extractEquipment(block) {
  const avgST = extractAverageST(block);
  const tokens = block.split(" ");

  const avgStTokenIndex =
    avgST === null ? -1 : tokens.findIndex(t => t === avgST.toFixed(2));

  const startTokenIndex = avgStTokenIndex >= 0 ? avgStTokenIndex + 7 : 0;
  const tail = tokens.slice(startTokenIndex);

  return findEquipmentPattern(tail);
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
  const m = block.match(/\b(0\.\d{2})\b/);
  if (m) return Number(m[1]);
  return null;
}

function makeDebug(html, text, parsed) {
  return {
    htmlLength: html.length,
    hasNoData: text.includes("データがありません"),
    hasRacerNameClass: /A1|A2|B1|B2/.test(text),
    hasBoatColor: /boatColor|is-boatColor|boat_color/i.test(html),
    trCount: (html.match(/<tr/gi) || []).length,
    tbodyCount: (html.match(/<tbody/gi) || []).length,
    hitCount: parsed.hits.length,
    hits: parsed.hits.slice(0, 10),
    foundBlocks: parsed.boats.map(b => ({
      boat: b.boat,
      regNo: b.regNo,
      class: b.class,
      name: b.name,
      motor: b.motor,
      motor2Rate: b.motor2Rate,
      motor3Rate: b.motor3Rate,
      boatNo: b.boatNo,
      boat2Rate: b.boat2Rate,
      boat3Rate: b.boat3Rate,
      raw: b.raw
    }))
  };
}
