export default async function handler(req, res) {
  const place = String(req.query.place || "24");
  const race = String(req.query.race || "1");
  const date = req.query.date || ymdJST();

  const hiyoriUrl =
    `https://kyoteibiyori.com/race_shusso.php?place_no=${place}&race_no=${race}&hiduke=${date}`;

  try {
    const r = await fetch(hiyoriUrl, {
      headers: {
        "user-agent": "Mozilla/5.0"
      }
    });

    const html = await r.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\n{2,}/g, "\n")
      .trim();

    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).json({
      status: "ok",
      source: "boatrace-hiyori",
      place,
      race,
      date,
      hiyoriUrl,
      hiyoriLength: html.length,
      hiyoriHtml: html,
hiyoriText: text,
preview: text.slice(0, 3000),
hasBasic: text.includes("基本情報"),
hasCourse: text.includes("枠別情報"),
hasMotor: text.includes("モータ"),
hasCurrent: text.includes("今節成績"),
hasBefore: text.includes("直前情報"),
hasOdds: text.includes("オッズ"),
hasResult: text.includes("結果"),
hasRank: text.includes("出目"),

sections: {
      }
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
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
