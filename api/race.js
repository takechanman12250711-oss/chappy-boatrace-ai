// api/race.js v3.3 完全版
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
        message: "データがありません",
        debug: debug === "1" ? makeDebug(html, text, [], []) : undefined
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
      debug: debug === "1" ? makeDebug(html, text, parsed.boats, parsed.markers) : undefined
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
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaceText(text) {
  let target = text;
  const startIndex = text.indexOf("登録番号／級別");
  if (startIndex >= 0) target = text.slice(startIndex);

  const markerRegex = /([1-6])\s+(\d{4})\s*\/\s*(A1|A2|B1|B2)/g;
  const markers = [];
  let m;

  while ((m = markerRegex.exec(target)) !== null) {
    markers.push({
      index: m.index,
      boat: Number(m[1]),
      regNo: m[2],
      class: m[3],
      end: markerRegex.lastIndex,
      hit: m[0]
    });
  }

  const boats = [];

  for (let i = 0; i < markers.length; i++) {
    const cur = markers[i];
    const next = markers[i + 1];
    const block = target.slice(cur.index, next ? next.index : cur.index + 900);
    const afterClass = target.slice(cur.end, cur.end + 160);

    const nameMatch = afterClass.match(
      /^\s*([一-龥ぁ-んァ-ヶー・]+\s*[一-龥ぁ-んァ-ヶー・]+)/
    );

    const name = nameMatch ? cleanName(nameMatch[1]) : "";

    boats.push({
      boat: cur.boat,
      regNo: cur.regNo,
      class: cur.class,
      name,
      branchHome: extractBranchHome(block),
      ageWeight: extractAgeWeight(block),
      avgST: extractAverageST(block),
      nationalWinRate: extractNationalWinRate(block),
      localWinRate: extractLocalWinRate(block),
      motor: extractMotor(block),
      motor2Rate: extractMotorRates(block)[0],
      motor3Rate: extractMotorRates(block)[1],
      boatNo: extractBoatNo(block),
      raw: block.slice(0, 500)
    });
  }

  return {
    boats: uniqueBoats(boats),
    markers
  };
}

function uniqueBoats(boats) {
  const used = new Set();

  return boats
    .filter(b => {
      if (!b.boat || used.has(b.boat)) return false;
      used.add(b.boat);
      return true;
    })
    .sort((a, b) => a.boat - b.boat);
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
  const m = block.match(/平均ST\s*(0\.\d{2})/);
  if (m) return Number(m[1]);

  const list = [...block.matchAll(/\b0\.\d{2}\b/g)]
    .map(x => Number(x[0]))
    .filter(n => n >= 0.09 && n <= 0.35);

  return list.length ? list[0] : null;
}

function extractCandidateRates(block) {
  return [...block.matchAll(/\b\d+\.\d{2}\b/g)]
    .map(m => Number(m[0]))
    .filter(n => n >= 1 && n <= 10);
}

function extractNationalWinRate(block) {
  const nums = extractCandidateRates(block);
  return nums[0] ?? null;
}

function extractLocalWinRate(block) {
  const nums = extractCandidateRates(block);
  return nums[3] ?? nums[1] ?? null;
}

function extractMotor(block) {
  const idx = block.indexOf("モーター");

  if (idx >= 0) {
    const part = block.slice(idx, idx + 120);
    const m = part.match(/モーター\s+(\d{1,3})/);
    if (m) return Number(m[1]);
  }

  const m = block.match(/\s(\d{1,3})\s+\d{2}\.\d{2}\s+\d{2}\.\d{2}/);
  return m ? Number(m[1]) : null;
}

function extractMotorRates(block) {
  const idx = block.indexOf("モーター");
  if (idx < 0) return [null, null];

  const part = block.slice(idx, idx + 160);
  const nums = [...part.matchAll(/\b\d{2}\.\d{2}\b/g)].map(m => Number(m[0]));

  return [nums[0] ?? null, nums[1] ?? null];
}

function extractBoatNo(block) {
  const idx = block.indexOf("ボート");
  if (idx < 0) return null;

  const part = block.slice(idx, idx + 120);
  const m = part.match(/ボート\s+(\d{1,3})/);
  return m ? Number(m[1]) : null;
}

function makeDebug(html, text, boats, markers) {
  return {
    htmlLength: html.length,
    hasNoData: text.includes("データがありません"),
    hasRacerNameClass: /A1|A2|B1|B2/.test(text),
    hasBoatColor: /boatColor|is-boatColor|boat_color/i.test(html),
    trCount: (html.match(/<tr/gi) || []).length,
    tbodyCount: (html.match(/<tbody/gi) || []).length,
    markerCount: markers.length,
    markers: markers.slice(0, 20),
    textHead: text.slice(0, 2000),
    foundBlocks: boats.map(b => ({
      boat: b.boat,
      name: b.name,
      raw: b.raw
    }))
  };
}
