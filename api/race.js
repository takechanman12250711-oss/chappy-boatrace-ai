// api/race.js
// エラー内容をフロントに返すデバッグ版

const {
  fetchRaceData
} = require("./_parser");

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

    const data = await fetchRaceData({
      jcd: String(jcd),
      rno: String(rno),
      date: String(date)
    });

    return res.status(200).json({
      ok: true,
      ...data
    });

  } catch (error) {
    console.error("api/race error", error);

    return res.status(500).json({
      ok: false,
      error: error.message,
      stack: error.stack,
      name: error.name
    });
  }
};