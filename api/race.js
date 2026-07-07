// api/race.js
// _parser.js の export 名ズレ対応版

const parser = require("./_parser");

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

    const params = {
      jcd: String(jcd),
      rno: String(rno),
      date: String(date)
    };

    const fetcher =
      parser.fetchRaceData ||
      parser.getRaceData ||
      parser.parseRaceData ||
      parser.default ||
      parser;

    if (typeof fetcher !== "function") {
      return res.status(500).json({
        ok: false,
        error: "_parser.js に実行できる関数がありません",
        parserKeys: Object.keys(parser)
      });
    }

    const data = await fetcher(params);

    return res.status(200).json({
      ok: true,
      ...data
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack,
      name: error.name
    });
  }
};