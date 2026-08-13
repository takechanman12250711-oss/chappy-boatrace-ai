"use strict";

const ORIGINAL_EXHIBITION_TIMEOUT_MS = 15000;
const HAMANAKO_SOURCE = "BOATRACE浜名湖公式・独自計測一周";

function normalizeJcd(value) {
  return String(value || "").padStart(2, "0");
}

function normalizeDate(value) {
  const text = String(value || "").replace(/[^0-9]/g, "");
  return /^\d{8}$/.test(text) ? text : "";
}

function normalizeRaceNo(value) {
  const raceNo = Number(value);
  return Number.isInteger(raceNo) && raceNo >= 1 && raceNo <= 12
    ? raceNo
    : null;
}

function sourceConfig({ jcd, date, rno }) {
  const code = normalizeJcd(jcd);
  const day = normalizeDate(date);
  const raceNo = normalizeRaceNo(rno);

  if (code !== "06" || !day || !raceNo) return null;

  return {
    venue: "浜名湖",
    source: HAMANAKO_SOURCE,
    sourceUrl:
      "https://www.boatrace-hamanako.jp/modules/yosou/group-cyokuzen.php" +
      `?day=${day}&race=${raceNo}&kind=2`
  };
}

function cleanText(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function className(attributes) {
  const match = String(attributes || "").match(
    /\bclass\s*=\s*["']([^"']*)["']/i
  );
  return match ? match[1] : "";
}

function parseHamanakoOriginalExhibitionHtml(html, config = {}) {
  const source = config.source || HAMANAKO_SOURCE;
  const sourceUrl = String(config.sourceUrl || "");
  const text = String(html || "");
  const officialMeasurement =
    /一周・まわり足・直線タイムは、?\s*BOATRACE\s*浜名湖独自計測値/.test(
      cleanText(text)
    );

  if (!officialMeasurement) {
    return {
      status: "unavailable",
      source,
      sourceUrl,
      rows: []
    };
  }

  const rows = [];
  const rowMatches = text.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];

  rowMatches.forEach((rowHtml) => {
    const cells = [];
    const cellPattern = /<td\b([^>]*)>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
      cells.push({
        className: className(cellMatch[1]),
        html: cellMatch[2],
        text: cleanText(cellMatch[2])
      });
    }

    const boatCell = cells.find((cell) => /(?:^|\s)col1(?:\s|$)/.test(cell.className));
    const lapCell = cells.find((cell) => /(?:^|\s)col6(?:\s|$)/.test(cell.className));
    const exhibitionCell = cells.find((cell) => /(?:^|\s)col5(?:\s|$)/.test(cell.className));
    const boat = Number(boatCell?.text);
    const lapText = String(lapCell?.text || "").trim();
    const lapTime = /^\d{2}\.\d{2}$/.test(lapText)
      ? Number(lapText)
      : null;
    const exhibitionText = String(exhibitionCell?.text || "").trim();
    const exhibitionTime = /^[67]\.\d{2}$/.test(exhibitionText)
      ? Number(exhibitionText)
      : null;
    const registerMatch = rowHtml.match(/\btoban=(\d{4})\b/i) ||
      rowHtml.match(/\/\s*(\d{4})\s*<\/li>/i);
    const registerNo = registerMatch ? registerMatch[1] : "";

    if (boat >= 1 && boat <= 6) {
      rows.push({
        boat,
        registerNo,
        exhibitionTime,
        lapTime:
          Number.isFinite(lapTime) && lapTime >= 30 && lapTime <= 50
            ? lapTime
            : null
      });
    }
  });

  const uniqueBoats = new Set(rows.map((row) => row.boat));
  const complete =
    rows.length === 6 &&
    uniqueBoats.size === 6 &&
    [1, 2, 3, 4, 5, 6].every((boat) =>
      rows.some(
        (row) =>
          row.boat === boat &&
          /^\d{4}$/.test(row.registerNo) &&
          Number.isFinite(row.lapTime)
      )
    );

  return {
    status: complete ? "available" : "incomplete",
    source,
    sourceUrl,
    rows: complete ? rows.sort((a, b) => a.boat - b.boat) : []
  };
}

async function fetchOriginalExhibition(
  request,
  fetchImpl = global.fetch
) {
  const config = sourceConfig(request || {});
  if (!config) {
    return {
      status: "unsupported",
      source: "",
      sourceUrl: "",
      rows: []
    };
  }

  try {
    const response = await fetchImpl(config.sourceUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 ChappyBoatRaceAI/1.0"
      },
      signal: AbortSignal.timeout(
        ORIGINAL_EXHIBITION_TIMEOUT_MS
      )
    });
    if (!response?.ok) {
      return {
        status: "fetch-failed",
        source: config.source,
        sourceUrl: config.sourceUrl,
        rows: [],
        error: `HTTP ${response?.status || 0}`
      };
    }

    return parseHamanakoOriginalExhibitionHtml(
      await response.text(),
      config
    );
  } catch (error) {
    return {
      status: "fetch-failed",
      source: config.source,
      sourceUrl: config.sourceUrl,
      rows: [],
      error: String(error?.message || error)
    };
  }
}

function attachOriginalLapTimes(parsed, original) {
  const base = parsed && typeof parsed === "object" ? parsed : {};
  const rows = Array.isArray(original?.rows) ? original.rows : [];
  const entries = Array.isArray(base.entries) ? base.entries : [];
  const beforeInfo = Array.isArray(base.beforeInfo) ? base.beforeInfo : [];

  if (original?.status !== "available" || rows.length !== 6) {
    return {
      ...base,
      originalExhibition: {
        status: String(original?.status || "unavailable"),
        source: String(original?.source || ""),
        sourceUrl: String(original?.sourceUrl || ""),
        rowCount: 0
      }
    };
  }

  const identityMatches = [1, 2, 3, 4, 5, 6].every((boat) => {
    const entry = entries.find((item) => Number(item?.boat) === boat);
    const row = rows.find((item) => Number(item?.boat) === boat);
    return Boolean(
      entry &&
      row &&
      /^\d{4}$/.test(String(entry?.registerNo || "")) &&
      String(entry.registerNo) === String(row.registerNo) &&
      Number.isFinite(row.lapTime)
    );
  });

  const exhibitionMatches = [1, 2, 3, 4, 5, 6].every((boat) => {
    const before = beforeInfo.find((item) => Number(item?.boat) === boat);
    const row = rows.find((item) => Number(item?.boat) === boat);
    const central = Number(before?.exhibition?.displayTime);
    return Boolean(
      row &&
      Number.isFinite(central) &&
      Number.isFinite(row.exhibitionTime) &&
      Math.abs(central - row.exhibitionTime) < 0.001
    );
  });

  if (!identityMatches || !exhibitionMatches) {
    return {
      ...base,
      originalExhibition: {
        status: identityMatches
          ? "exhibition-mismatch"
          : "identity-mismatch",
        source: String(original?.source || ""),
        sourceUrl: String(original?.sourceUrl || ""),
        rowCount: 0
      }
    };
  }

  const byBoat = new Map(rows.map((row) => [Number(row.boat), row]));
  const source = String(original.source || "");
  const sourceUrl = String(original.sourceUrl || "");
  const mergeLap = (item) => {
    const boat = Number(item?.boat ?? item?.boatNo);
    const row = byBoat.get(boat);
    if (!row) return item;
    return {
      ...item,
      lapTime: row.lapTime,
      lapTimeSource: source,
      lapTimeSourceUrl: sourceUrl,
      exhibition: {
        ...(item?.exhibition || {}),
        lapTime: row.lapTime,
        lapTimeSource: source,
        lapTimeSourceUrl: sourceUrl
      }
    };
  };

  return {
    ...base,
    entries: entries.map(mergeLap),
    beforeInfo: beforeInfo.map(mergeLap),
    originalExhibition: {
      status: "available",
      source,
      sourceUrl,
      rowCount: 6
    }
  };
}

module.exports = {
  HAMANAKO_SOURCE,
  sourceConfig,
  parseHamanakoOriginalExhibitionHtml,
  fetchOriginalExhibition,
  attachOriginalLapTimes
};
