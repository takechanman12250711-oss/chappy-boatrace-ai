"use strict";

const { createHash } = require("node:crypto");
const ORIGINAL_EXHIBITION_TIMEOUT_MS = 15000;
const HAMANAKO_SOURCE = "BOATRACE浜名湖公式・独自計測一周";
const METRIC_DEFINITIONS = Object.freeze({
  lapTime: Object.freeze({ unit: "seconds", measurementLabel: "一周", venueCode: "06", venue: "浜名湖" }),
  mawariTime: Object.freeze({ unit: "seconds", measurementLabel: "まわり足", venueCode: "06", venue: "浜名湖" }),
  straightTime: Object.freeze({ unit: "seconds", measurementLabel: "直線", venueCode: "06", venue: "浜名湖" })
});

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
    venueCode: code,
    jcd: code,
    date: day,
    raceNo,
    rno: raceNo,
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

// The live two-row header repeats class="col6" for all three labels.
// Resolve leaf labels in order, then match them to the tbody's col6/7/8.
// Unknown/duplicated labels never acquire a different metric's value.
function metricColumns(tableHtml) {
  const head = String(tableHtml).match(/<thead\b[\s\S]*?<\/thead>/i)?.[0] || "";
  const labelToMetric = new Map(Object.entries(METRIC_DEFINITIONS)
    .map(([metric, definition]) => [definition.measurementLabel, metric]));
  const candidates = [];
  for (const row of head.match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
    const cells = [...row.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)]
      .map(match => ({ label: cleanText(match[2]),
        column: Number(className(match[1]).match(/(?:^|\s)col([6-8])(?:\s|$)/)?.[1] || 0) }));
    if (!cells.length || !cells.some(cell => labelToMetric.has(cell.label)) ||
        cells.some(cell => !cell.column)) continue;
    const repeated = new Set(cells.map(cell => cell.column)).size === 1;
    // A shortened repeated-class header cannot identify which optional
    // heading disappeared. Preserve only the explicitly first lap column.
    if (repeated && cells.length !== 3) {
      candidates.push(cells[0].label === "一周" && cells[0].column === 6 ? { lapTime: 6 } : {});
      continue;
    }
    const columns = {};
    const seenLabels = new Set();
    let valid = true;
    cells.forEach((cell, index) => {
      const column = repeated ? cells[0].column + index : cell.column;
      const metric = labelToMetric.get(cell.label);
      if (column < 6 || column > 8 || (metric && seenLabels.has(metric))) valid = false;
      if (metric) { columns[metric] = column; seenLabels.add(metric); }
    });
    if (valid && new Set(Object.values(columns)).size === Object.keys(columns).length) candidates.push(columns);
  }
  return candidates.length === 1 ? candidates[0] : {};
}

function sourceMetadata(config = {}) {
  const jcd = String(config.jcd || config.venueCode || "");
  const raceNo = normalizeRaceNo(config.rno ?? config.raceNo);
  return {
    venue: "浜名湖", venueCode: jcd, jcd,
    date: normalizeDate(config.date), raceNo, rno: raceNo,
    sourceSha256: /^[a-f0-9]{64}$/.test(config.sourceSha256 || "") ? config.sourceSha256 : null,
    sourceFetchedAt: typeof config.sourceFetchedAt === "string" &&
      Number.isFinite(Date.parse(config.sourceFetchedAt)) ? config.sourceFetchedAt : null,
    metricDefinitions: Object.fromEntries(Object.entries(METRIC_DEFINITIONS)
      .map(([key, definition]) => [key, { ...definition }]))
  };
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
      ...sourceMetadata(config),
      rows: []
    };
  }

  const rows = [];
  const tables = text.match(/<table\b[\s\S]*?<\/table>/gi) || [];
  tables.forEach((tableHtml) => {
    const columns = metricColumns(tableHtml);
    const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
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
      const exhibitionCell = cells.find((cell) => /(?:^|\s)col5(?:\s|$)/.test(cell.className));
      const boat = Number(boatCell?.text);
      const readMetric = (metric) => {
        const column = columns[metric];
        if (!column) return null;
        const matching = cells.filter(cell => new RegExp(`(?:^|\\s)col${column}(?:\\s|$)`).test(cell.className));
        const value = matching.length === 1 ? matching[0].text.trim() : "";
        if (!/^\d{1,2}\.\d{2}$/.test(value)) return null;
        const number = Number(value);
        return number > 0 && (metric !== "lapTime" || (number >= 30 && number <= 50)) ? number : null;
      };
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
          lapTime: readMetric("lapTime"),
          mawariTime: readMetric("mawariTime"),
          straightTime: readMetric("straightTime")
        });
      }
    });
  });

  const uniqueBoats = new Set(rows.map((row) => row.boat));
  const identityComplete =
    rows.length === 6 &&
    uniqueBoats.size === 6 &&
    new Set(rows.map(row => row.registerNo)).size === 6 &&
    [1, 2, 3, 4, 5, 6].every((boat) =>
      rows.some(
        (row) =>
          row.boat === boat &&
          /^\d{4}$/.test(row.registerNo)
      )
    );
  const metricCounts = Object.fromEntries(Object.keys(METRIC_DEFINITIONS)
    .map(metric => [metric, rows.filter(row => Number.isFinite(row[metric])).length]));
  const lapComplete = identityComplete && metricCounts.lapTime === 6;

  return {
    status: lapComplete ? "available" : "incomplete",
    source,
    sourceUrl,
    ...sourceMetadata(config),
    identityComplete,
    lapComplete,
    metricCounts,
    rows: identityComplete ? rows.sort((a, b) => a.boat - b.boat) : []
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

    const html = await response.text();
    const sourceFetchedAt = new Date().toISOString();
    return parseHamanakoOriginalExhibitionHtml(html, {
      ...config, sourceFetchedAt,
      sourceSha256: createHash("sha256").update(html, "utf8").digest("hex")
    });
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
  const metadata = sourceMetadata(original);

  if (!["available", "incomplete"].includes(original?.status) || rows.length !== 6) {
    return {
      ...base,
      originalExhibition: {
        status: String(original?.status || "unavailable"),
        source: String(original?.source || ""),
        sourceUrl: String(original?.sourceUrl || ""),
        ...metadata,
        identityMatched: false,
        exhibitionMatched: false,
        boatIdentities: [],
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
      String(entry.registerNo) === String(row.registerNo)
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
        ...metadata,
        identityMatched: identityMatches,
        exhibitionMatched: exhibitionMatches,
        boatIdentities: [],
        rowCount: 0
      }
    };
  }

  const byBoat = new Map(rows.map((row) => [Number(row.boat), row]));
  const source = String(original.source || "");
  const sourceUrl = String(original.sourceUrl || "");
  const metricCounts = Object.fromEntries(Object.keys(METRIC_DEFINITIONS)
    .map(metric => [metric, rows.filter(row => Number.isFinite(row[metric])).length]));
  const lapComplete = metricCounts.lapTime === 6;
  const mergeLap = (item) => {
    const boat = Number(item?.boat ?? item?.boatNo);
    const row = byBoat.get(boat);
    if (!row) return item;
    const metrics = {};
    for (const [metric, definition] of Object.entries(METRIC_DEFINITIONS)) {
      // Keep the previous all-six gate for the scoring input. Other measured
      // columns remain independent, and existing base lap values are untouched.
      if (metric === "lapTime" && !lapComplete) continue;
      metrics[metric] = row[metric] ?? null;
      metrics[`${metric}Source`] = source;
      metrics[`${metric}SourceUrl`] = sourceUrl;
      metrics[`${metric}Unit`] = definition.unit;
      metrics[`${metric}MeasurementLabel`] = definition.measurementLabel;
      metrics[`${metric}SourceRef`] = "originalExhibition";
    }
    return {
      ...item,
      ...metrics,
      exhibition: {
        ...(item?.exhibition || {}),
        ...metrics
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
      ...metadata,
      identityComplete: true,
      lapComplete,
      metricCounts,
      identityMatched: true,
      exhibitionMatched: true,
      boatIdentities: rows.map(row => ({ boat: row.boat, registerNo: row.registerNo })),
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
