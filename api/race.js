// api/race.js 修正版 v2
// 例: /api/race?jcd=24&rno=7&date=20260623

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
      sample: "/api/race?jcd=24&rno=7&date=20260623"
    });
  }

  const url =
    `https://www.boatrace.jp/owpc/pc/race/racelist` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);
    const boats = parseRaceListV2(html);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      url,
      count: boats.length,
      boats,
      debug: debug === "1" ? makeDebug(html) : undefined
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
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
      "Accept-Language": "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept":
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`公式サイト取得失敗: ${response.status}`);
  }

  return await response.text();
}

function cleanText(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(td|th|div|p|li|span)>/gi, " ")
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

function splitRows(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;

  while ((m = rowRegex.exec(html)) !== null) {
    const rowHtml = m[0];
    const txt = cleanText(rowHtml);

    if (
      /is-boatColor[1-6]/.test(rowHtml) ||
      /boatColor[1-6]/.test(rowHtml) ||
      /^[1-6]\s/.test(txt) ||
      /登録番号/.test(txt) === false
    ) {
      rows.push(rowHtml);
    }
  }

  return rows;
}

function parseRaceListV2(html) {
  const boats = [];

  // 公式PC版の出走表は艇番カラーclassが入ることが多い
  const rows = splitRows(html);

  for (const row of rows) {
    const boat = extractBoatNo(row);
    if (!boat || boat < 1 || boat > 6) continue;

    const text = cleanText(row);

    const name = extractName(text);
    const playerClass = extractClass(text);
    const regNo = extractRegNo(text);
    const avgST = extractST(text);
    const rates = extractWinRates(text);
    const motor = extractMotor(text);
    const boatNo = extractBoatNumber(text);

    boats.push({
      boat,
      name,
      class: playerClass,
      regNo,
      avgST,
      nationalWinRate: rates[0] ?? null,
      localWinRate: rates[1] ?? null,
      motor,
      boatNo,
      raw: text.slice(0, 300)
    });
  }

  const unique = [];
  const used = new Set();

  for (const b of boats) {
    if (used.has(b.boat)) continue;
    used.add(b.boat);
    unique.push(b);
  }

  return unique.sort((a, b) => a.boat - b.boat);
}

function extractBoatNo(rowHtml) {
  const colorMatch =
    rowHtml.match(/is-boatColor([1-6])/i) ||
    rowHtml.match(/boatColor([1-6])/i) ||
    rowHtml.match(/boat_color_([1-6])/i);

  if (colorMatch) return Number(colorMatch[1]);

  const text = cleanText(rowHtml);
  const headMatch = text.match(/^([1-6])\s/);
  if (headMatch) return Number(headMatch[1]);

  return null;
}

function extractRegNo(text) {
  const m = text.match(/\b(\d{4})\b/);
  return m ? m[1] : "";
}

function extractClass(text) {
  const m = text.match(/\b(A1|A2|B1|B2)\b/);
  return m ? m[1] : "";
}

function extractName(text) {
  // 例: 4524 深谷知博 A1
  let m = text.match(
    /\b\d{4}\b\s+([一-龥ぁ-んァ-ヶー・\s]{2,16})\s+(A1|A2|B1|B2)\b/
  );
  if (m) return m[1].replace(/\s+/g, "");

  // 例: 深谷 知博 A1
  m = text.match(
    /([一-龥ぁ-んァ-ヶー・]{1,6}\s+[一-龥ぁ-んァ-ヶー・]{1,8})\s+(A1|A2|B1|B2)\b/
  );
  if (m) return m[1].replace(/\s+/g, "");

  return "";
}

function extractST(text) {
  // 平均ST付近を優先
  const stLabel = text.match(/平均ST\s*[:：]?\s*(0\.\d{2})/);
  if (stLabel) return Number(stLabel[1]);

  // 0.xxが複数あるので、0.10〜0.30をST候補として拾う
  const matches = [...text.matchAll(/0\.\d{2}/g)]
    .map(m => Number(m[0]))
    .filter(n => n >= 0.09 && n <= 0.35);

  return matches.length ? matches[0] : null;
}

function extractWinRates(text) {
  // 公式表には勝率が 6.12 などで複数出る
  const nums = [...text.matchAll(/\b\d+\.\d{2}\b/g)]
    .map(m => Number(m[0]))
    .filter(n => n >= 1 && n <= 10);

  // ST 0.xx は除外済み
  return nums.slice(0, 2);
}

function extractMotor(text) {
  // モーター番号っぽい 2桁
  const m =
    text.match(/モーター\s*[:：]?\s*(\d{1,3})/) ||
    text.match(/M\s*[:：]?\s*(\d{1,3})/);

  return m ? Number(m[1]) : null;
}

function extractBoatNumber(text) {
  const m =
    text.match(/ボート\s*[:：]?\s*(\d{1,3})/) ||
    text.match(/B\s*[:：]?\s*(\d{1,3})/);

  return m ? Number(m[1]) : null;
}

function makeDebug(html) {
  const text = cleanText(html);
  return {
    htmlLength: html.length,
    textHead: text.slice(0, 500),
    hasBoatColor: /boatColor|is-boatColor|boat_color/i.test(html),
    hasRacelist: /racelist/i.test(html),
    trCount: (html.match(/<tr/gi) || []).length,
    tbodyCount: (html.match(/<tbody/gi) || []).length
  };
}
