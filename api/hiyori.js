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
  basic: cut(text, "基本情報", "枠別勝率"),
  course: cut(text, "枠別勝率", "今節情報"),
  current: cut(text, "今節情報", "モーター比較"),
  motor: cut(text, "モーター比較", "直前情報"),
  before: cut(text, "直前情報", "結果"),
  result: cut(text, "結果", "オッズ"),
  oddsSearch: cut(text, "オッズ", "オッズ一覧"),
  oddsList: cut(text, "オッズ一覧", "出目ランク"),
  kimariRank: cut(text, "出目ランク", "MyData")
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
