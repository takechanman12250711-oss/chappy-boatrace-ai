// api/odds.js v3
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { jcd, date } = req.query;
  const rno = String(req.query.rno || "").replace("R", "");

  if (!jcd || !rno || !date) {
    return res.status(400).json({ ok:false, odds:[], error:"jcd,rno,date required" });
  }

  try {
    const url = `https://www.boatrace.jp/owpc/pc/race/odds3t?rno=${rno}&jcd=${jcd}&hd=${date}`;
    const html = await fetch(url, {
      headers: { "User-Agent":"Mozilla/5.0", "Referer":"https://www.boatrace.jp/" }
    }).then(r => r.text());

    const odds = [];
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    const nums = text.match(/\d+(?:\.\d+)?/g) || [];

    for (let i = 0; i < nums.length - 3; i++) {
      const a = Number(nums[i]);
      const b = Number(nums[i + 1]);
      const c = Number(nums[i + 2]);
      const o = Number(nums[i + 3]);

      if (
        a >= 1 && a <= 6 &&
        b >= 1 && b <= 6 &&
        c >= 1 && c <= 6 &&
        a !== b && a !== c && b !== c &&
        o >= 1 && o <= 9999
      ) {
        odds.push({
          key: `${a}-${b}-${c}`,
          first:a,
          second:b,
          third:c,
          odds:o
        });
      }
    }

    const unique = [...new Map(odds.map(x => [x.key, x])).values()]
      .sort((a,b) => a.odds - b.odds)
      .slice(0, 120);

    return res.status(200).json({
      ok:true,
      count:unique.length,
      odds:unique,
      url
    });

  } catch (e) {
    return res.status(200).json({
      ok:false,
      odds:[],
      error:e.message
    });
  }
};