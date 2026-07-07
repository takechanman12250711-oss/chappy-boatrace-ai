import { parseOfficialRaceHtml } from "./_parser.js";

const STADIUM_NAME_TO_CODE = {
  "桐生": "01", "戸田": "02", "江戸川": "03", "平和島": "04",
  "多摩川": "05", "浜名湖": "06", "蒲郡": "07", "常滑": "08",
  "津": "09", "三国": "10", "びわこ": "11", "住之江": "12",
  "尼崎": "13", "鳴門": "14", "丸亀": "15", "児島": "16",
  "宮島": "17", "徳山": "18", "下関": "19", "若松": "20",
  "芦屋": "21", "福岡": "22", "唐津": "23", "大村": "24"
};

const STADIUM_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STADIUM_NAME_TO_CODE).map(([name, code]) => [code, name])
);

const BASE_URL = "https://www.boatrace.jp/owpc/pc/race";

function sendJson(res, statusCode, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(statusCode).json(data);
}

function normalizeDate(value) {
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }

  const text = String(value).replaceAll("-", "").replaceAll("/", "");

  if (!/^\d{8}$/.test(text)) {
    throw new Error("dateは YYYYMMDD または YYYY-MM-DD で指定してください");
  }

  return text;
}

function normalizeRaceNo(value) {
  const raceNo = Number(value);

  if (!Number.isInteger(raceNo) || raceNo < 1 || raceNo > 12) {
    throw new Error("raceNoは1〜12で指定してください");
  }

  return raceNo;
}

function normalizeStadium(value) {
  if (!value) {
    throw new Error("stadiumを指定してください");
  }

  const text = String(value).trim();

  if (/^\d{1,2}$/.test(text)) {
    return text.padStart(2, "0");
  }

  if (STADIUM_NAME_TO_CODE[text]) {
    return STADIUM_NAME_TO_CODE[text];
  }

  throw new Error("未対応の場です");
}

function buildOfficialUrl(type, stadiumCode, raceNo, date) {
  const page = type === "entry" ? "racelist" : "beforeinfo";
  return `${BASE_URL}/${page}?rno=${raceNo}&jcd=${stadiumCode}&hd=${date}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 ChappyBoatRaceAI",
      "Accept": "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(`公式HTML取得失敗: ${response.status}`);
  }

  const html = await response.text();

  if (!html || html.length < 100) {
    throw new Error("公式HTMLが空、または短すぎます");
  }

  return html;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method !== "GET") {
    return sendJson(res, 405, {
      ok: false,
      error: "GETのみ対応です"
    });
  }

  try {
    const stadiumCode = normalizeStadium(req.query.stadium);
    const raceNo = normalizeRaceNo(req.query.raceNo || req.query.rno);
    const date = normalizeDate(req.query.date || req.query.hd);

    const entryUrl = buildOfficialUrl("entry", stadiumCode, raceNo, date);
    const beforeInfoUrl = buildOfficialUrl("before", stadiumCode, raceNo, date);

    const [entryHtml, beforeHtml] = await Promise.all([
      fetchHtml(entryUrl),
      fetchHtml(beforeInfoUrl).catch(() => "")
    ]);

    const parsed = parseOfficialRaceHtml(entryHtml, beforeHtml);

    return sendJson(res, 200, {
      ok: true,
      source: "boatrace-official",
      parser: "chappy-parser-v2",
      stadiumCode,
      stadiumName: STADIUM_CODE_TO_NAME[stadiumCode] || "",
      raceNo,
      date,
      entryUrl,
      beforeInfoUrl,
      raceInfo: parsed.raceInfo,
      entries: parsed.entries,
      beforeInfo: parsed.beforeInfo,
      startExhibition: parsed.startExhibition,
      weather: parsed.weather,
      debug: {
        foundEntries: parsed.entries.filter((entry) => entry.rawFound).length,
        foundBeforeInfo: parsed.beforeInfo.filter((item) => item.rawBlock).length,
        foundStartExhibition: parsed.startExhibition.length
      },
      message: "race.js v2：出走表＋直前情報 接続完了"
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "race API error"
    });
  }
}