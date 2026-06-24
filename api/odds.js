// api/odds.js
// 3連単オッズ取得API
// 例: /api/odds?jcd=19&rno=7&date=20260624

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      error: "jcd, rno, date が必要です"
    });
  }

  const url =
    `https://www.boatrace.jp/owpc/pc/race/odds3t` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);
    const text = cleanText(html);
console.log(oddsText.substring(0,5000));
    const odds = parseOdds3t(text);

    return res.status(200).json({
      ok: true,
      source: "boatrace.jp",
      jcd,
      rno,
      date,
      count: odds.length,
      odds,
      url
    });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message,
      url
    });
  }
};

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "ja-JP,ja;q=0.9",
      "Referer": "https://www.boatrace.jp/"
    }
  });

  if (!res.ok) {
    throw new Error(`公式オッズ取得失敗: ${res.status}`);
  }

  return await res.text();
}

function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOdds3t(text) {
  const odds = [];

  // 例: 1 2 3 8.6
  const regex = /\b([1-6])\s+([1-6])\s+([1-6])\s+(\d+\.\d)\b/g;

  let m;
  while ((m = regex.exec(text)) !== null) {
    const first = m[1];
    const second = m[2];
    const third = m[3];

    if (first === second || first === third || second === third) continue;

    odds.push({
      key: `${first}-${second}-${third}`,
      first: Number(first),
      second: Number(second),
      third: Number(third),
      odds: Number(m[4])
    });
  }

  return uniqueOdds(odds);
}

function uniqueOdds(list) {
  const map = new Map();

  for (const item of list) {
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  }

  return [...map.values()].sort((a, b) => a.odds - b.odds);
}
