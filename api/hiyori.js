export default async function handler(req, res) {
  const place = String(req.query.place || "24");
  const race = String(req.query.race || "1");
  const date = req.query.date || ymdJST();

  const hiyoriUrl =
    `https://kyoteibiyori.com/race_shusso.php?place_no=${place}&race_no=${race}&hiduke=${date}`;

  try {
    const r = await fetch(hiyoriUrl, {
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
      .replace(/[ ]{2,}/g, " ")
      .trim();

    const sections = {
  basic: text.slice(0, 4000),
  course: "",
  current: "",
  motor: "",
  before: "",
  result: "",
  oddsSearch: "",
  oddsList: "",
  kimariRank: ""
};
    };

    res.setHeader("Access-Control-Allow-Origin", "*");

    return res.status(200).json({
      status: "ok",
      source: "boatrace-hiyori",
      place,
      race,
      date,
      hiyoriUrl,
      hiyoriLength: html.length,
      preview: text.slice(0, 1000),
      hasBasic: !!sections.basic,
      hasCourse: !!sections.course,
      hasMotor: !!sections.motor,
      hasCurrent: !!sections.current,
      hasBefore: !!sections.before,
      hasOdds: !!sections.oddsSearch,
      hasResult: !!sections.result,
      hasRank: !!sections.kimariRank,
      sections
    });

  } catch (e) {
    return res.status(500).json({
      status: "error",
      message: e.message
    });
  }
}

function cut(text, start, end) {
  const menuEnd = text.indexOf("データ取得中です");
  const baseText = menuEnd >= 0 ? text.slice(menuEnd) : text;

  const s = baseText.indexOf(start);
  if (s < 0) return "";

  const e = baseText.indexOf(end, s + start.length);
  const raw = e >= 0 ? baseText.slice(s, e) : baseText.slice(s);

  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 4000);
}

function ymdJST() {
  const d = new Date();
  d.setHours(d.getHours() + 9);
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
