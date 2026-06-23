// api/race.js v3 完全版
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

    const boats = parseRaceText(text);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      url,
      count: boats.length,
      boats,
      debug: debug === "1" ? {
        textHead: text.slice(0, 1500),
        foundBlocks: boats.map(b => b.raw)
      } : undefined
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
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://www.boatrace.jp/",
      "Cache-Control": "no-cache"
    }
  });

  if (!response.ok) {
    throw new Error(`公式サイト取得失敗: ${response.status}`);
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
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r?\n/g, " ")
    .replace(/\t/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaceText(text) {
  const boats = [];

  // 出走表本文だけに寄せる
  let target = text;
  const startIndex = text.indexOf("登録番号／級別");
  if (startIndex >= 0) {
    target = text.slice(startIndex);
  }

  // 艇番 + 登録番号 + / + 級別 + 名前 を拾う
  // 例: 1 5143 / B1 常盤 海心 徳島/徳島 ...
  const regex =
    /(?:^|\s)([1-6])\s+(\d{4})\s*\/\s*(A1|A2|B1|B2)\s+([一-龥ぁ-んァ-ヶー・\s]{2,12})(?=\s+[一-龥ぁ-んァ-ヶー・]+\/|徳島\/|香川\/|大阪\/|東京\/|福岡\/|長崎\/|広島\/|岡山\/|佐賀\/|山口\/|兵庫\/|愛知\/|静岡\/|三重\/|滋賀\/|福井\/|埼玉\/|群馬\/|千葉\/|神奈川\/|北海道\/|宮城\/|福島\/|新潟\/|石川\/|富山\/|奈良\/|京都\/|和歌山\/|愛媛\/|高知\/|熊本\/|大分\/|宮崎\/|鹿児島\/|沖縄\/)/g;

  let match;

  while ((match = regex.exec(target)) !== null) {
    const boat = Number(match[1]);
    const regNo = match[2];
    const playerClass = match[3];
    const name = cleanName(match[4]);

    const blockStart = match.index;
    const nextMatch = findNextBoatIndex(target, blockStart + 10);
    const block = target.slice(blockStart, nextMatch > blockStart ? nextMatch : blockStart + 500);

    const nums = extractNumbers(block);

    boats.push({
      boat,
      regNo,
      class: playerClass,
      name,
      ageWeight: extractAgeWeight(block),
      avgST: extractAverageST(block),
      nationalWinRate: extractRateAfterKeyword(block, "全国") ?? nums.winRates[0] ?? null,
      localWinRate: extractRateAfterKeyword(block, "当地") ?? nums.winRates[1] ?? null,
      motor: extractMotor(block),
      motor2Rate: extractMotorRate(block, "2連率"),
      motor3Rate: extractMotorRate(block, "3連率"),
      boatNo: extractBoatNo(block),
      raw: block.slice(0, 350)
    });
  }

  // 重複削除
  const unique = [];
  const used = new Set();

  for (const b of boats) {
    if (used.has(b.boat)) continue;
    used.add(b.boat);
    unique.push(b);
  }

  return unique.sort((a, b) => a.boat - b.boat);
}

function findNextBoatIndex(text, from) {
  const rest = text.slice(from);
  const m = rest.match(/\s[1-6]\s+\d{4}\s*\/\s*(A1|A2|B1|B2)\s+/);
  return m ? from + m.index : text.length;
}

function cleanName(name) {
  return String(name || "")
    .replace(/\s+/g, "")
    .replace(/[0-9.]/g, "")
    .trim();
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

function extractNumbers(block) {
  const all = [...block.matchAll(/\b\d+\.\d{2}\b/g)].map(m => Number(m[0]));

  return {
    winRates: all.filter(n => n >= 1 && n <= 10),
    percentages: all.filter(n => n > 10 && n <= 100)
  };
}

function extractRateAfterKeyword(block, keyword) {
  const idx = block.indexOf(keyword);
  if (idx < 0) return null;

  const part = block.slice(idx, idx + 120);
  const m = part.match(/\b\d+\.\d{2}\b/);
  return m ? Number(m[0]) : null;
}

function extractMotor(block) {
  const m =
    block.match(/モーター\s+(\d{1,3})/) ||
    block.match(/\s(\d{1,3})\s+\d{2}\.\d{2}\s+\d{2}\.\d{2}/);

  return m ? Number(m[1]) : null;
}

function extractMotorRate(block, label) {
  const idx = block.indexOf("モーター");
  if (idx < 0) return null;

  const part = block.slice(idx, idx + 150);
  const nums = [...part.matchAll(/\b\d{2}\.\d{2}\b/g)].map(m => Number(m[0]));

  if (label === "2連率") return nums[0] ?? null;
  if (label === "3連率") return nums[1] ?? null;

  return null;
}

function extractBoatNo(block) {
  const idx = block.indexOf("ボート");
  if (idx < 0) return null;

  const part = block.slice(idx, idx + 120);
  const m = part.match(/ボート\s+(\d{1,3})/);
  return m ? Number(m[1]) : null;
}
