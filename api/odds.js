// api/odds.js v5
// オッズAPI安定版：取得できない時も画面を止めない

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(200).json({
      ok: false,
      odds: [],
      count: 0,
      error: "jcd, rno, date required"
    });
  }

  const url =
    `https://www.boatrace.jp/owpc/pc/race/odds3t` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);

    if (html.includes("データがありません")) {
      return res.status(200).json({
        ok: true,
        odds: [],
        count: 0,
        message: "公式オッズなし",
        url
      });
    }

    const odds = parseOdds3T(html);

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
    return res.status(200).json({
      ok: false,
      odds: [],
      count: 0,
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
    throw new Error(`公式オッズ取得失敗:${res.status}`);
  }

  return await res.text();
}

function parseOdds3T(html) {
  const odds = [];
  const regex = /(\d)\s*-\s*(\d)\s*-\s*(\d)[\s\S]{0,80}?(\d+\.\d+|\d+)/g;

  let m;

  while ((m = regex.exec(html)) !== null) {
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    const value = Number(m[4]);

    if (
      value > 0 &&
      value < 99999 &&
      !odds.find(x => x.key === key)
    ) {
      odds.push({
        key,
        first: Number(m[1]),
        second: Number(m[2]),
        third: Number(m[3]),
        odds: value
      });
    }
  }

  return odds.sort((a, b) => a.odds - b.odds);
}

  return uniqueOdds(odds)
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 120);
}

function uniqueOdds(list) {
  const map = new Map();

  for (const item of list) {
    if (!map.has(item.key)) {
      map.set(item.key, item);
    }
  }

  return [...map.values()];
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