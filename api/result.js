// api/result.js
// 公式レース結果から、着順・ST・決まり手・3連単払戻を取得する。

const OFFICIAL_BASE = "https://www.boatrace.jp";

function decodeHtml(value) {
  return String(value || "")
    .replace(/&yen;/gi, "¥")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(
      /&#(\d+);/g,
      (_, code) =>
        String.fromCharCode(
          Number(code)
        )
    );
}

function stripHtml(value) {
  return decodeHtml(
    String(value || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function toHalfWidth(value) {
  return String(value || "")
    .replace(
      /[０-９]/g,
      character =>
        String.fromCharCode(
          character.charCodeAt(0) -
            0xfee0
        )
    );
}

function toNumber(value) {
  const number = Number(
    String(value ?? "")
      .replace(/[^\d.-]/g, "")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function getSection(
  html,
  heading,
  length = 10000
) {
  const start =
    String(html || "")
      .indexOf(heading);

  return start >= 0
    ? String(html)
        .slice(
          start,
          start + length
        )
    : "";
}

function parseFinishers(html) {
  const section = getSection(
    html,
    "<th>着</th>",
    12000
  );

  const tableEnd =
    section.indexOf("</table>");

  const table =
    tableEnd >= 0
      ? section.slice(0, tableEnd)
      : section;

  const finishers = [];

  const rowPattern =
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;

  while (
    (
      rowMatch =
        rowPattern.exec(table)
    ) !== null
  ) {
    const cells = [];

    const cellPattern =
      /<td[^>]*>([\s\S]*?)<\/td>/gi;

    let cellMatch;

    while (
      (
        cellMatch =
          cellPattern.exec(
            rowMatch[1]
          )
      ) !== null
    ) {
      cells.push(
        toHalfWidth(
          stripHtml(cellMatch[1])
        )
      );
    }

    if (cells.length < 4) {
      continue;
    }

    const rank =
      toNumber(cells[0]);

    const boat =
      toNumber(cells[1]);

    if (
      !rank ||
      !boat ||
      boat < 1 ||
      boat > 6
    ) {
      continue;
    }

    const racerMatch =
      cells[2].match(
        /^(\d{4})\s*(.*)$/
      );

    finishers.push({
      rank,
      boat,

      registerNo:
        racerMatch
          ? racerMatch[1]
          : "",

      racerName:
        (
          racerMatch
            ? racerMatch[2]
            : cells[2]
        ).replace(/\s+/g, ""),

      raceTime:
        cells[3] || ""
    });
  }

  return finishers.sort(
    (a, b) =>
      a.rank - b.rank
  );
}

function parseStarts(html) {
  const section = getSection(
    html,
    "スタート情報",
    18000
  );

  const tableEnd =
    section.indexOf("</table>");

  const table =
    tableEnd >= 0
      ? section.slice(0, tableEnd)
      : section;

  const starts = [];

  const rowPattern =
    /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let rowMatch;

  while (
    (
      rowMatch =
        rowPattern.exec(table)
    ) !== null
  ) {
    const boatMatch =
      rowMatch[1].match(
        /table1_boatImage1Number[^>]*>([1-6])</i
      );

    const timeMatch =
      rowMatch[1].match(
        /table1_boatImage1TimeInner[^>]*>([\s\S]*?)<\/span>/i
      );

    if (
      !boatMatch ||
      !timeMatch
    ) {
      continue;
    }

    const rawText =
      toHalfWidth(
        stripHtml(timeMatch[1])
      );

    const stMatch =
      rawText.match(
        /([FL]?)\s*\.?([0-9]{2})/i
      );

    const marker =
      stMatch
        ? stMatch[1]
            .toUpperCase()
        : "";

    starts.push({
      course:
        starts.length + 1,

      boat:
        Number(boatMatch[1]),

      st:
        stMatch
          ? Number(
              `0.${stMatch[2]}`
            )
          : null,

      marker,

      falseStart:
        marker === "F",

      lateStart:
        marker === "L",

      raw: rawText
    });
  }

  return starts;
}

function parseTrifecta(html) {
  const section = getSection(
    html,
    "3連単",
    5000
  );

  if (!section) {
    return null;
  }

  const rowEnd =
    section.indexOf("</tr>");

  const row =
    rowEnd >= 0
      ? section.slice(0, rowEnd)
      : section;

  const boats = [
    ...row.matchAll(
      /numberSet1_number[^>]*>([1-6])<\/span>/gi
    )
  ]
    .map(
      match =>
        Number(match[1])
    )
    .slice(0, 3);

  const payoutMatch =
    row.match(
      /is-payout1[^>]*>([\s\S]*?)<\/span>/i
    );

  const cells = [
    ...row.matchAll(
      /<td[^>]*>([\s\S]*?)<\/td>/gi
    )
  ].map(
    match =>
      stripHtml(match[1])
  );

  if (boats.length !== 3) {
    return null;
  }

  const payoutText =
    payoutMatch
      ? stripHtml(
          payoutMatch[1]
        )
      : "";

  const popularity =
    cells.length
      ? toNumber(
          cells[
            cells.length - 1
          ]
        )
      : null;

  return {
    combination:
      boats.join("-"),

    boats,

    payout:
      toNumber(payoutText),

    payoutText,
    popularity
  };
}

function parseWinningMethod(html) {
  const section = getSection(
    html,
    "<th>決まり手</th>",
    1200
  );

  const match =
    section.match(
      /<tbody>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/i
    );

  return match
    ? stripHtml(match[1])
    : "";
}

function parseResult(html) {
  const finishers =
    parseFinishers(html);

  const starts =
    parseStarts(html);

  const trifecta =
    parseTrifecta(html);

  const winningMethod =
    parseWinningMethod(html);

  const resultAvailable =
    finishers.length >= 3 &&
    Boolean(trifecta);

  return {
    resultAvailable,

    status:
      resultAvailable
        ? "finished"
        : "not_finished",

    finishers,
    starts,
    winningMethod,
    trifecta
  };
}

module.exports =
  async function handler(
    req,
    res
  ) {
    try {
      const date =
        String(
          req.query?.date || ""
        );

      const jcd =
        String(
          req.query?.jcd || ""
        );

      const rno =
        String(
          req.query?.rno || ""
        );

      if (
        !/^\d{8}$/.test(date)
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "dateはYYYYMMDD形式で指定してください"
          });
      }

      if (
        !/^(0[1-9]|1[0-9]|2[0-4])$/.test(
          jcd
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "jcdは01〜24で指定してください"
          });
      }

      if (
        !/^(?:[1-9]|1[0-2])$/.test(
          rno
        )
      ) {
        return res
          .status(400)
          .json({
            ok: false,

            error:
              "rnoは1〜12で指定してください"
          });
      }

      const resultUrl =
        `${OFFICIAL_BASE}` +
        `/owpc/pc/race/raceresult` +
        `?hd=${date}` +
        `&jcd=${jcd}` +
        `&rno=${rno}`;

      const response =
        await fetch(
          resultUrl,
          {
            headers: {
              "user-agent":
                "Mozilla/5.0 ChappyBoatRaceAI/1.0"
            },

            signal:
              AbortSignal.timeout(
                15000
              )
          }
        );

      if (!response.ok) {
        throw new Error(
          `公式結果取得失敗: ` +
          `${response.status}`
        );
      }

      const html =
        await response.text();

      const parsed =
        parseResult(html);

      res.setHeader(
        "Cache-Control",

        parsed.resultAvailable
          ? "s-maxage=86400, stale-while-revalidate=604800"
          : "s-maxage=15, stale-while-revalidate=15"
      );

      return res
        .status(200)
        .json({
          ok: true,

          source:
            "boatrace-official",

          date,
          jcd,

          raceNo:
            Number(rno),

          checkedAt:
            new Date()
              .toISOString(),

          resultUrl,

          ...parsed
        });
    } catch (error) {
      return res
        .status(500)
        .json({
          ok: false,

          error:
            error?.message ||
            String(error),

          name:
            error?.name ||
            "Error"
        });
    }
  };