// api/race.js v4.0 展示タイム取得版
// racelist + beforeinfo を合体
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
    `https://www.boatrace.jp/owpc/pc/race/racelist` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  const beforeInfoUrl =
    `https://www.boatrace.jp/owpc/pc/race/beforeinfo` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

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
    .replace(/&nbsp;/g, "
