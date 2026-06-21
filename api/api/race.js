export default async function handler(req, res) {
  const place = String(req.query.place || "24").padStart(2, "0");
  const race = String(req.query.race || "1");
  const date = req.query.date || ymdJST();

  const officialUrl =
    `https://www.boatrace.jp/owpc/pc/race/racelist?rno=${race}&jcd=${place}&hd=${date}`;

  try {
    const r = await fetch(officialUrl, {
      headers: {
        "user-agent": "Mozilla/5.0"
      }
    });

    const html = await r.text();

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      status: "ok",
      place,
      race,
      date,
      officialUrl,
      officialLength: html.length,
      officialHtml: html
    });
  } catch (e) {
    return res.status(500).json({
      status: "error",
      message: e.message
    });
  }
}

function ymdJST() {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  return d.toISOString().slice(0, 10).replaceAll("-", "");
}
