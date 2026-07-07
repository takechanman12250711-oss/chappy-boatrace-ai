/* =========================================================
   チャッピーボートレースAI
   api/race.js 完全版 Part1/3

   役割：
   - Vercel API側の race メインAPI
   - 出走表・展示情報の取得基盤
   - 24場コード管理
   - パラメータチェック
   - 公式URL生成
   - HTML取得
========================================================= */

const STADIUMS = {
  kiryu: { code: "01", name: "桐生" },
  toda: { code: "02", name: "戸田" },
  edogawa: { code: "03", name: "江戸川" },
  heiwajima: { code: "04", name: "平和島" },
  tamagawa: { code: "05", name: "多摩川" },
  hamanako: { code: "06", name: "浜名湖" },
  gamagori: { code: "07", name: "蒲郡" },
  tokoname: { code: "08", name: "常滑" },
  tsu: { code: "09", name: "津" },
  mikuni: { code: "10", name: "三国" },
  biwako: { code: "11", name: "びわこ" },
  suminoe: { code: "12", name: "住之江" },
  amagasaki: { code: "13", name: "尼崎" },
  naruto: { code: "14", name: "鳴門" },
  marugame: { code: "15", name: "丸亀" },
  kojima: { code: "16", name: "児島" },
  miyajima: { code: "17", name: "宮島" },
  tokuyama: { code: "18", name: "徳山" },
  shimonoseki: { code: "19", name: "下関" },
  wakamatsu: { code: "20", name: "若松" },
  ashiya: { code: "21", name: "芦屋" },
  fukuoka: { code: "22", name: "福岡" },
  karatsu: { code: "23", name: "唐津" },
  omura: { code: "24", name: "大村" }
};

const STADIUM_NAME_TO_CODE = {
  "桐生": "01",
  "戸田": "02",
  "江戸川": "03",
  "平和島": "04",
  "多摩川": "05",
  "浜名湖": "06",
  "蒲郡": "07",
  "常滑": "08",
  "津": "09",
  "三国": "10",
  "びわこ": "11",
  "住之江": "12",
  "尼崎": "13",
  "鳴門": "14",
  "丸亀": "15",
  "児島": "16",
  "宮島": "17",
  "徳山": "18",
  "下関": "19",
  "若松": "20",
  "芦屋": "21",
  "福岡": "22",
  "唐津": "23",
  "大村": "24"
};

const OFFICIAL_BASE_URL = "https://www.boatrace.jp/owpc/pc/race";

function sendJson(res, statusCode, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.status(statusCode).json(data);
}

function normalizeDate(dateText) {
  if (!dateText) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return `${yyyy}${mm}${dd}`;
  }

  const cleaned = String(dateText).replaceAll("-", "").replaceAll("/", "");

  if (!/^\d{8}$/.test(cleaned)) {
    throw new Error("dateは YYYYMMDD または YYYY-MM-DD で指定してください");
  }

  return cleaned;
}

function normalizeRaceNo(raceNo) {
  const num = Number(raceNo);

  if (!Number.isInteger(num) || num < 1 || num > 12) {
    throw new Error("raceNoは1〜12で指定してください");
  }

  return num;
}

function normalizeStadiumCode(stadium) {
  if (!stadium) {
    throw new Error("stadiumを指定してください");
  }

  const value = String(stadium).trim();

  if (/^\d{1,2}$/.test(value)) {
    return value.padStart(2, "0");
  }

  if (STADIUM_NAME_TO_CODE[value]) {
    return STADIUM_NAME_TO_CODE[value];
  }

  if (STADIUMS[value]) {
    return STADIUMS[value].code;
  }

  throw new Error("未対応の場です");
}

function getStadiumName(code) {
  const target = String(code).padStart(2, "0");
  const found = Object.values(STADIUMS).find((item) => item.code === target);
  return found ? found.name : "";
}

function buildOfficialUrl(type, stadiumCode, raceNo, date) {
  const pageMap = {
    entry: "racelist",
    before: "beforeinfo"
  };

  const page = pageMap[type];

  if (!page) {
    throw new Error("未対応の取得タイプです");
  }

  return `${OFFICIAL_BASE_URL}/${page}?rno=${raceNo}&jcd=${stadiumCode}&hd=${date}`;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; ChappyBoatRaceAI/1.0; +https://github.com/)",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
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

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function buildEmptyRaceData({ stadiumCode, raceNo, date }) {
  return {
    ok: true,
    source: "boatrace-official",
    stadiumCode,
    stadiumName: getStadiumName(stadiumCode),
    raceNo,
    date,
    entryUrl: buildOfficialUrl("entry", stadiumCode, raceNo, date),
    beforeInfoUrl: buildOfficialUrl("before", stadiumCode, raceNo, date),
    entries: [],
    beforeInfo: [],
    rawText: {
      entry: "",
      beforeInfo: ""
    },
    message: "Part1ではHTML取得基盤まで。Part2で出走表パースを追加。"
  };
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
    const stadiumCode = normalizeStadiumCode(req.query.stadium);
    const raceNo = normalizeRaceNo(req.query.raceNo || req.query.rno);
    const date = normalizeDate(req.query.date || req.query.hd);

    const entryUrl = buildOfficialUrl("entry", stadiumCode, raceNo, date);
    const beforeInfoUrl = buildOfficialUrl("before", stadiumCode, raceNo, date);

    const [entryHtml, beforeHtml] = await Promise.all([
      fetchHtml(entryUrl),
      fetchHtml(beforeInfoUrl).catch(() => "")
    ]);

    const data = buildEmptyRaceData({
      stadiumCode,
      raceNo,
      date
    });

    data.rawText.entry = stripHtml(entryHtml);
    data.rawText.beforeInfo = stripHtml(beforeHtml);

    return sendJson(res, 200, data);
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "race API error"
    });
  }
}
