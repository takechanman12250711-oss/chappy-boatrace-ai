"use strict";

function decodeHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTrifectaOdds(html) {
  const tbodyMatch =
    String(html || "").match(
      /<tbody[^>]*class=["'][^"']*is-p3-0[^"']*["'][^>]*>([\s\S]*?)<\/tbody>/i
    );

  if (!tbodyMatch) {
    return [];
  }

  const rows = [
    ...tbodyMatch[1].matchAll(
      /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    )
  ];

  const secondByFirst =
    Array(6).fill(0);

  const result = [];

  rows.forEach(rowMatch => {
    const cells = [
      ...rowMatch[1].matchAll(
        /<td([^>]*)>([\s\S]*?)<\/td>/gi
      )
    ].map(match => ({
      attrs: match[1] || "",
      text: decodeHtml(match[2])
    }));

    let cellIndex = 0;

    for (
      let first = 1;
      first <= 6;
      first += 1
    ) {
      const maybeSecond =
        cells[cellIndex];

      if (
        maybeSecond &&
        /rowspan\s*=\s*["']?4["']?/i.test(
          maybeSecond.attrs
        )
      ) {
        secondByFirst[first - 1] =
          Number(maybeSecond.text);

        cellIndex += 1;
      }

      const thirdCell =
        cells[cellIndex];

      const oddsCell =
        cells[cellIndex + 1];

      cellIndex += 2;

      const second =
        secondByFirst[first - 1];

      const third =
        Number(thirdCell?.text);

      const odds =
        Number(
          String(
            oddsCell?.text || ""
          ).replace(/,/g, "")
        );

      if (
        [first, second, third].every(
          no => no >= 1 && no <= 6
        ) &&
        new Set([
          first,
          second,
          third
        ]).size === 3 &&
        Number.isFinite(odds) &&
        odds > 0
      ) {
        result.push({
          ticket:
            `${first}-${second}-${third}`,
          first,
          second,
          third,
          odds
        });
      }
    }
  });

  return result;
}

module.exports =
  async function handler(req, res) {
    try {
      const {
        jcd,
        rno,
        date
      } = req.query || {};

      if (!jcd || !rno || !date) {
        return res.status(400).json({
          ok: false,
          error:
            "jcd・rno・date が不足しています"
        });
      }

      const oddsUrl =
        "https://www.boatrace.jp" +
        "/owpc/pc/race/odds3t" +
        `?rno=${encodeURIComponent(rno)}` +
        `&jcd=${encodeURIComponent(jcd)}` +
        `&hd=${encodeURIComponent(date)}`;

      const response =
        await fetch(oddsUrl, {
          headers: {
            "user-agent":
              "Mozilla/5.0 " +
              "ChappyBoatRaceAI/1.0"
          }
        });

      if (!response.ok) {
        throw new Error(
          "公式オッズ取得エラー：" +
          response.status
        );
      }

      const html =
        await response.text();

      const trifecta =
        parseTrifectaOdds(html);

      const byTicket =
        Object.fromEntries(
          trifecta.map(item => [
            item.ticket,
            item.odds
          ])
        );

      return res.status(200).json({
        ok: true,
        source: "boatrace-official",
        stadiumCode: String(jcd),
        raceNo: Number(rno),
        date: String(date),
        oddsUrl,
        available:
          trifecta.length > 0,
        count: trifecta.length,
        trifecta,
        byTicket
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error:
          error?.message ||
          String(error)
      });
    }
  };

module.exports.parseTrifectaOdds =
  parseTrifectaOdds;