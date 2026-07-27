// api/race.js
// 公式HTML取得 → _parser.parseOfficialRaceHtml 実行版

const { parseOfficialRaceHtml } = require("./_parser");
const { buildHistoryContext } = require("./_history");

function getJstDateText(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .format(date)
    .replaceAll("-", "");
}

module.exports = async function handler(req, res) {
  try {
    const { jcd, rno, date } = req.query;

    if (!jcd || !rno || !date) {
      return res.status(400).json({
        ok: false,
        error: "jcd・rno・date が不足しています",
        query: req.query
      });
    }

    const entryUrl =
      `https://www.boatrace.jp/owpc/pc/race/racelist` +
      `?rno=${rno}&jcd=${jcd}&hd=${date}`;

    const beforeInfoUrl =
      `https://www.boatrace.jp/owpc/pc/race/beforeinfo` +
      `?rno=${rno}&jcd=${jcd}&hd=${date}`;

    const [entryRes, beforeRes] = await Promise.all([
      fetch(entryUrl),
      fetch(beforeInfoUrl)
    ]);

    if (!entryRes.ok) {
      throw new Error(`公式出走表取得失敗: ${entryRes.status}`);
    }

    const entryHtml = await entryRes.text();
    const beforeHtml = beforeRes.ok ? await beforeRes.text() : "";
    const fetchedAt = new Date().toISOString();

    const parsed =
  parseOfficialRaceHtml(
    entryHtml,
    beforeHtml
  );

    const historyContext = buildHistoryContext({
      jcd,
      raceNo: rno,
      entries: parsed?.entries
    });

    res.setHeader?.(
      "Cache-Control",
      String(date) === getJstDateText()
        ? "public, max-age=0, s-maxage=15, stale-while-revalidate=45"
        : "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
    );

    return res.status(200).json({
      ok: true,
      source: "boatrace-official",
      stadiumCode: String(jcd),
      raceNo: Number(rno),
      date: String(date),
      fetchedAt,
      entryUrl,
      beforeInfoUrl,
      ...parsed,
      historyContext
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      name: error.name,
      stack: error.stack
    });
  }
};
