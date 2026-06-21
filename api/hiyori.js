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

      sections: {
        basic: "基本情報",
        course: "枠別情報",
        motor: "モータ情報",
        current: "今節成績",
        before: "直前情報",
        oddsSearch: "オッズ検索",
        oddsList: "オッズ一覧",
        result: "結果",
        kimariRank: "出目ランク"
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
