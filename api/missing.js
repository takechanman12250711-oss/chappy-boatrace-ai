// api/missing.js v3
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const dummy = [];
    const boats = ["1","2","3","4","5","6"];

    for (const a of boats) {
      for (const b of boats) {
        for (const c of boats) {
          if (a !== b && a !== c && b !== c) {
            dummy.push({
              rank: dummy.length + 1,
              key: `${a}-${b}-${c}`,
              odds: "-"
            });
          }
        }
      }
    }

    return res.status(200).json({
      ok: true,
      missing: dummy.slice(0, 30)
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      missing: [],
      error: e.message
    });
  }
};