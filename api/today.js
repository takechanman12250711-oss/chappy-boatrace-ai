// api/today.js
// 例: /api/today?date=20260623

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const date = req.query.date || ymd();

  const places = [
    ["01", "桐生"], ["02", "戸田"], ["03", "江戸川"], ["04", "平和島"],
    ["05", "多摩川"], ["06", "浜名湖"], ["07", "蒲郡"], ["08", "常滑"],
    ["09", "津"], ["10", "三国"], ["11", "びわこ"], ["12", "住之江"],
    ["13", "尼崎"], ["14", "鳴門"], ["15", "丸亀"], ["16", "児島"],
    ["17", "宮島"], ["18", "徳山"], ["19", "下関"], ["20", "若松"],
    ["21", "芦屋"], ["22", "福岡"], ["23", "唐津"], ["24", "大村"]
  ];

  const results = [];

  for (const [jcd, name] of places) {
    const url =
      `https://www.boatrace.jp/owpc/pc/race/racelist` +
      `?rno=1&jcd=${jcd}&hd=${date}`;

    try {
      const html = await fetchHtml(url);
      const hasRace = !html.includes("データがありません");

      if (hasRace) {
        results.push({ jcd, name });
      }
    } catch (e) {
      // 失敗した場は飛ばす
    }
  }

  return res.status(200).json({
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

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
      "Accept-Language": "ja-JP,ja;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`取得失敗 ${response.status}`);
  }

  return await response.text();
}
