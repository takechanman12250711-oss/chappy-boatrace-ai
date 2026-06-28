// api/odds.js v7
// 公式3連単オッズ：表の行構造から120点取得

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(200).json({ ok: false, odds: [], count: 0, error: "jcd,rno,date required" });
  }

  const url = `https://www.boatrace.jp/owpc/pc/race/odds3t?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const html = await fetchHtml(url);
    const odds = parseOddsRows(html);

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
    return res.status(200).json({ ok: false, odds: [], count: 0, error: e.message, url });
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

  if (!res.ok) throw new Error(`公式オッズ取得失敗:${res.status}`);
  return await res.text();
}

function parseOddsRows(html) {
  if (!html || html.includes("データがありません")) return [];

  const start = html.indexOf("3連単オッズ");
  const target = start >= 0 ? html.slice(start) : html;

  const rowMatches = target.match(/<tr[\s\S]*?<\/tr>/gi) || [];
  const rows = rowMatches
    .map(row => extractCells(row))
    .filter(cells => cells.some(isOdds));

  const odds = [];
  const currentSecond = {};

  rows.forEach((cells, rowIndex) => {
    let i = 0;
    const rowInGroup = rowIndex % 4;

    for (let first = 1; first <= 6; first++) {
      let second;
      let third;
      let value;

      if (rowInGroup === 0) {
        second = Number(cells[i++]);
        third = Number(cells[i++]);
        value = Number(cells[i++]);
        currentSecond[first] = second;
      } else {
        second = currentSecond[first];
        third = Number(cells[i++]);
        value = Number(cells[i++]);
      }

      addOdds(odds, first, second, third, value);
    }
  });

  return uniqueOdds(odds)
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 120);
}

function extractCells(rowHtml) {
  return [...String(rowHtml).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map(m => cleanText(m[1]))
    .filter(Boolean);
}

function addOdds(list, first, second, third, value) {
  const a = Number(first);
  const b = Number(second);
  const c = Number(third);
  const odds = Number(value);

  if (![a, b, c].every(n => n >= 1 && n <= 6)) return;
  if (a === b || a === c || b === c) return;
  if (!Number.isFinite(odds) || odds <= 0 || odds > 9999.9) return;

  list.push({
    key: `${a}-${b}-${c}`,
    first: a,
    second: b,
    third: c,
    odds
  });
}

function uniqueOdds(list) {
  const map = new Map();
  list.forEach(x => {
    if (!map.has(x.key)) map.set(x.key, x);
  });
  return [...map.values()];
}

function isOdds(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 9999.9 && String(v).includes(".");
}

function cleanText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}