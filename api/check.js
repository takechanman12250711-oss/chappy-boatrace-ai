// api/check.js
// 例: /api/check?jcd=20&rno=1&date=20260623

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const jcd = req.query.jcd || "20";
  const rno = req.query.rno || "1";
  const date = req.query.date || ymd();

  const url =
    `https://www.boatrace.jp/owpc/pc/race/racelist` +
    `?rno=${rno}&jcd=${jcd}&hd=${date}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "ja-JP,ja;q=0.9"
      }
    });

    const html = await response.text();
    const text = cleanText(html);

    res.status(200).json({
      ok: true,
      status: response.status,
      url,
      htmlLength: html.length,
      hasNoData: text.includes("データがありません"),
      hasRacerNameClass: /A1|A2|B1|B2/.test(text),
      hasBoatColor: /boatColor|is-boatColor|boat_color/i.test(html),
      trCount: (html.match(/<tr/gi) || []).length,
      tbodyCount: (html.match(/<tbody/gi) || []).length,
      textHead: text.slice(0, 1200)
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
      url
    });
  }
}

function ymd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function cleanText(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
