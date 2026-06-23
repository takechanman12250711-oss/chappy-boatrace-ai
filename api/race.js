// api/race.js
// 例: /api/race?jcd=24&rno=7&date=20260623

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { jcd, rno, date } = req.query;

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
    const boats = parseRaceList(html);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      url,
      count: boats.length,
      boats
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`公式サイト取得失敗: ${response.status}`);
  }

  return await response.text();
}

function cleanText(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRaceList(html) {
  const boats = [];

  const tableMatch = html.match(
    /<tbody[^>]*is-fs12[^>]*>([\s\S]*?)<\/tbody>/i
  );

  const targetHtml = tableMatch ? tableMatch[1] : html;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(targetHtml)) !== null) {
    const row = rowMatch[1];

    const boatNoMatch = row.match(/is-boatColor([1-6])/);
    if (!boatNoMatch) continue;

    const boat = Number(boatNoMatch[1]);

    const text = cleanText(row);

    const regNoMatch = text.match(/(\d{4})/);
    const classMatch = text.match(/\b(A1|A2|B1|B2)\b/);
    const stMatch = text.match(/0\.\d{2}/);

    const nameMatch = text.match(
      /\d{4}\s+([一-龥ぁ-んァ-ヶー・\s]{2,12})\s+(A1|A2|B1|B2)/
    );

    const winRates = [...text.matchAll(/(\d+\.\d{2})/g)].map(m =>
      Number(m[1])
    );

    boats.push({
      boat,
      name: nameMatch ? nameMatch[1].replace(/\s+/g, "") : "",
      class: classMatch ? classMatch[1] : "",
      regNo: regNoMatch ? regNoMatch[1] : "",
      avgST: stMatch ? Number(stMatch[0]) : null,
      nationalWinRate: winRates[0] ?? null,
      localWinRate: winRates[1] ?? null,
      raw: text
    });
  }

  return boats.sort((a, b) => a.boat - b.boat);
}
