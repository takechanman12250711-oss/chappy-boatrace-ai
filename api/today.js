// api/today.js 高速版 v2

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const date = req.query.date || ymd();

  const places = [
    ["15", "丸亀"],
    ["20", "若松"],
    ["19", "下関"],
    ["24", "大村"],
    ["17", "宮島"],
    ["05", "多摩川"]
  ];

  const checks = await Promise.all(
    places.map(async ([jcd, name]) => {
      const url =
        `https://www.boatrace.jp/owpc/pc/race/racelist` +
        `?rno=1&jcd=${jcd}&hd=${date}`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0",
            "Accept-Language": "ja-JP,ja;q=0.9"
          }
        });

        clearTimeout(timeout);

        const html = await response.text();
        const hasRace = !html.includes("データがありません");

        return hasRace ? { jcd, name } : null;
      } catch {
        return null;
      }
    })
  );

  const results = checks.filter(Boolean);

  res.status(200).json({
    ok: true,
    date,
    count: results.length,
    places: results
  });
}

function ymd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
