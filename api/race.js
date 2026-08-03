// api/race.js
// 公式HTML取得 → _parser.parseOfficialRaceHtml 実行版

const { parseOfficialRaceHtml } = require("./_parser");
const { buildHistoryContext } = require("./_history");
const OFFICIAL_REQUEST_TIMEOUT_MS = 15000;

function fetchOfficial(url) {
  return fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 ChappyBoatRaceAI/1.0"
    },
    signal: AbortSignal.timeout(OFFICIAL_REQUEST_TIMEOUT_MS)
  });
}

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

    const [entryResult, beforeResult] = await Promise.allSettled([
      fetchOfficial(entryUrl),
      fetchOfficial(beforeInfoUrl)
    ]);

    if (entryResult.status === "rejected") {
      throw entryResult.reason;
    }

    const entryRes = entryResult.value;
    const beforeRes = beforeResult.status === "fulfilled"
      ? beforeResult.value
      : null;

    if (!entryRes.ok) {
      throw new Error(`公式出走表取得失敗: ${entryRes.status}`);
    }

    const entryHtml = await entryRes.text();
    let beforeHtml = "";
    let beforeInfoWarning = "";
    if (beforeRes?.ok) {
      try {
        beforeHtml = await beforeRes.text();
      } catch (error) {
        beforeInfoWarning = `直前情報の本文取得を省略: ${error?.message || error}`;
      }
    } else {
      const reason = beforeResult.status === "rejected"
        ? beforeResult.reason
        : beforeRes
          ? `HTTP ${beforeRes.status}`
          : "応答なし";
      beforeInfoWarning = `直前情報を省略: ${reason?.message || reason}`;
    }
    const beforeInfoAvailable = Boolean(beforeHtml);
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
      beforeInfoAvailable
        ? String(date) === getJstDateText()
          ? "public, max-age=0, s-maxage=15, stale-while-revalidate=45"
          : "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800"
        : "private, no-store, max-age=0"
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
      beforeInfoAvailable,
      warnings: beforeInfoWarning ? [beforeInfoWarning] : [],
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
