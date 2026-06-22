module.exports = async function handler(req, res) {
  const place = String(req.query.place || "24");
  const race = String(req.query.race || "1");
  const date = req.query.date || ymdJST();

  const url =
`https://kyoteibiyori.com/race_shusso.php?place_no=${place}&race_no=${race}&hiduke=${date}&slider=5`

  try {
    const r = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0" }
    });
    const html = await r.text();

    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\t/g, " ")
      .replace(/\n{2,}/g, "\n")
      .trim();

    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      status: "ok",
      source: "hiyori-odds",
      place,
      race,
      date,
      url,
      length: text.length,
preview: text.slice(0, 3000),
html: html
    });
  } catch (e) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).json({
      status: "error",
      message: String(e.message || e)
    });
  }
};

function ymdJST() {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
