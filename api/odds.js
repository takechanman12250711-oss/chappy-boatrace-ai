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
  const text = cleanText(html);

  const areaStart = text.indexOf("3連単オッズ");
  const target = areaStart >= 0 ? text.slice(areaStart) : text;

  const nums = target.match(/\d+(?:\.\d+)?/g) || [];
  const odds = [];

  for (let i = 0; i < nums.length - 3; i++) {
    const a = Number(nums[i]);
    const b = Number(nums[i + 1]);
    const c = Number(nums[i + 2]);
    const o = Number(nums[i + 3]);

    if (
      a >= 1 && a <= 6 &&
      b >= 1 && b <= 6 &&
      c >= 1 && c <= 6 &&
      a !== b &&
      a !== c &&
      b !== c &&
      o >= 1 &&
      o <= 9999.9
    ) {
      odds.push({
        key: `${a}-${b}-${c}`,
        first: a,
        second: b,
        third: c,
        odds: o
      });
    }
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