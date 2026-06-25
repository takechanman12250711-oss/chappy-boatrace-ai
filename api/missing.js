// api/missing.js v1
// 出てない目TOP30 API（まずは内部計算版）
// 例: /api/missing?jcd=19&rno=7&date=20260624

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, rno, date } = req.query;

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      error: "jcd, rno, date が必要です"
    });
  }

  try {
    const oddsUrl = `${getBaseUrl(req)}/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`;
    const oddsRes = await fetch(oddsUrl);
    const oddsData = await oddsRes.json();

    const odds = Array.isArray(oddsData.odds) ? oddsData.odds : [];
    const oddsMap = new Map(odds.map(o => [o.key, o.odds]));

    const all = makeAll3tan();

    // v1は「高配当寄り＝出てない目候補」として抽出
    // 後で本物の出目ランクAPIに差し替え可能
    const missing = all
      .map(key => ({
        key,
        odds: oddsMap.get(key) ?? null,
        score: calcMissingScore(key, oddsMap.get(key))
      }))
      .filter(x => x.odds !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x, i) => ({
        rank: i + 1,
        key: x.key,
        odds: x.odds,
        score: x.score
      }));

    return res.status(200).json({
      ok: true,
      source: "internal-missing-v1",
      jcd,
      rno,
      date,
      count: missing.length,
      missing,
      oddsUrl
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      error: e.message
    });
  }
};

function makeAll3tan() {
  const list = [];

  for (let a = 1; a <= 6; a++) {
    for (let b = 1; b <= 6; b++) {
      for (let c = 1; c <= 6; c++) {
        if (a === b || a === c || b === c) continue;
        list.push(`${a}-${b}-${c}`);
      }
    }
  }

  return list;
}

function calcMissingScore(key, odds) {
  const nums = key.split("-").map(Number);
  let score = 0;

  // 高配当ほど出てない目候補として加点
  if (odds >= 1000) score += 50;
  else if (odds >= 500) score += 40;
  else if (odds >= 300) score += 32;
  else if (odds >= 200) score += 25;
  else if (odds >= 100) score += 18;
  else score += 5;

  // 外枠絡み加点
  if (nums.includes(6)) score += 10;
  if (nums.includes(5)) score += 8;
  if (nums[0] >= 4) score += 8;

  // 内が飛ぶ形
  if (nums[0] !== 1) score += 10;

  return score;
}

function getBaseUrl(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${proto}://${host}`;
}
