// api/race.js
// 公式HTML取得 → _parser.parseOfficialRaceHtml 実行版

const { parseOfficialRaceHtml } = require("./_parser");

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

    const parsed = parseOfficialRaceHtml(entryHtml, {
      jcd: String(jcd),
      rno: String(rno),
      date: String(date),
      entryUrl,
      beforeInfoUrl,
      beforeHtml
    });

    return res.status(200).json({
      ok: true,
      source: "boatrace-official",
      stadiumCode: String(jcd),
      raceNo: Number(rno),
      date: String(date),
      entryUrl,
      beforeInfoUrl,
      ...parsed
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