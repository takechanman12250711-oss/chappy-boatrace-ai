export default async function handler(req, res) {
  const { jcd, rno, date } = req.query;

  if (!jcd || !rno || !date) {
    return res.status(400).json({
      ok: false,
      missing: [],
      error: "jcd,rno,date required"
    });
  }

  try {
    const baseUrl = `https://${req.headers.host}`;
    const oddsRes = await fetch(`${baseUrl}/api/odds?jcd=${jcd}&rno=${rno}&date=${date}`);
    const oddsJson = await oddsRes.json();

    const odds = oddsJson?.odds || [];

    const scored = odds.map(o => {
      const key = o.key;
      const n = key.split("-").map(Number);
      const odd = Number(o.odds || 0);

      let score = 0;

      // 高配当寄り
      if (odd >= 30) score += 10;
      if (odd >= 80) score += 20;
      if (odd >= 150) score += 30;
      if (odd >= 400) score -= 10;

      // 外絡みは出にくい候補
      if (n.includes(5)) score += 8;
      if (n.includes(6)) score += 12;

      // 1頭人気筋は少し下げる
      if (n[0] === 1 && odd < 40) score -= 15;

      // 場・R・日付で毎回少し変える
      const seed = Number(jcd) * 3 + Number(rno) * 7 + Number(date.slice(-2));
      score += (n[0] * 11 + n[1] * 7 + n[2] * 5 + seed) % 17;

      return {
        key,
        odds: odd,
        score
      };
    });

    const missing = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
      .map((x, i) => ({
        rank: i + 1,
        key: x.key,
        odds: x.odds
      }));

    return res.status(200).json({
      ok: true,
      type: "odds-linked-missing",
      jcd,
      rno,
      date,
      missing
    });

  } catch (e) {
    return res.status(500).json({
      ok: false,
      missing: [],
      error: e.message
    });
  }
}