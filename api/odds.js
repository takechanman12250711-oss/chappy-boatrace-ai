// api/odds.js v4
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  return res.status(200).json({
    ok: true,
    count: 0,
    odds: [],
    message: "公式オッズ解析は一時停止中。画面は止めない。"
  });
};