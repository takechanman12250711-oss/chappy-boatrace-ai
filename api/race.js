import * as cheerio from "cheerio";

const STADIUM_NAME_TO_CODE = {
  "桐生":"01","戸田":"02","江戸川":"03","平和島":"04","多摩川":"05","浜名湖":"06",
  "蒲郡":"07","常滑":"08","津":"09","三国":"10","びわこ":"11","住之江":"12",
  "尼崎":"13","鳴門":"14","丸亀":"15","児島":"16","宮島":"17","徳山":"18",
  "下関":"19","若松":"20","芦屋":"21","福岡":"22","唐津":"23","大村":"24"
};

const STADIUM_CODE_TO_NAME = Object.fromEntries(
  Object.entries(STADIUM_NAME_TO_CODE).map(([k, v]) => [v, k])
);

const BASE = "https://www.boatrace.jp/owpc/pc/race";

function sendJson(res, status, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  return res.status(status).json(data);
}

function normalizeDate(v) {
  if (!v) {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
  }
  const s = String(v).replaceAll("-", "").replaceAll("/", "");
  if (!/^\d{8}$/.test(s)) throw new Error("date形式エラー");
  return s;
}

function normalizeRaceNo(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new Error("raceNo形式エラー");
  return n;
}

function normalizeStadium(v) {
  if (!v) throw new Error("stadium未指定");
  const s = String(v).trim();
  if (/^\d{1,2}$/.test(s)) return s.padStart(2, "0");
  if (STADIUM_NAME_TO_CODE[s]) return STADIUM_NAME_TO_CODE[s];
  throw new Error("未対応の場です");
}

function buildUrl(type, jcd, rno, hd) {
  const page = type === "entry" ? "racelist" : "beforeinfo";
  return `${BASE}/${page}?rno=${rno}&jcd=${jcd}&hd=${hd}`;
}

async function fetchHtml(url) {
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 ChappyBoatRaceAI",
      "Accept": "text/html"
    }
  });
  if (!r.ok) throw new Error(`公式取得失敗 ${r.status}`);
  return await r.text();
}

function zenToHan(s) {
  return String(s || "").replace(/[０-９]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
  );
}

function cleanText(s) {
  return zenToHan(String(s || ""))
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function num(v) {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseEntries(html) {
  const $ = cheerio.load(html);
  const text = cleanText($("body").text());

  const entries = [];
  const re = /(?:^|\s)([1-6])\s+(\d{4})\s*\/\s*(A1|A2|B1|B2)\s+(.+?)\s+([^\s\/]+)\/([^\s\/]+)\s+(\d+)歳\/([\d.]+)kg\s+F(\d+)\s+L(\d+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)/g;

  let m;
  while ((m = re.exec(text)) !== null) {
    entries.push({
      boat: num(m[1]),
      boatLabel: `${m[1]}号艇`,
      registerNo: m[2],
      className: m[3],
      racerName: cleanText(m[4]),
      branch: m[5],
      birthPlace: m[6],
      age: num(m[7]),
      weight: num(m[8]),
      fCount: num(m[9]),
      lCount: num(m[10]),
      avgSt: num(m[11]),
      nationalWinRate: num(m[12]),
      national2Rate: num(m[13]),
      national3Rate: num(m[14]),
      localWinRate: num(m[15]),
      local2Rate: num(m[16]),
      local3Rate: num(m[17]),
      motorNo: num(m[18]),
      motor2Rate: num(m[19]),
      motor3Rate: num(m[20]),
      boatNo: num(m[21]),
      boat2Rate: num(m[22]),
      boat3Rate: num(m[23]),
      rawFound: true
    });
  }

  for (let i = 1; i <= 6; i++) {
    if (!entries.find(e => e.boat === i)) {
      entries.push({
        boat: i,
        boatLabel: `${i}号艇`,
        racerName: "",
        className: "",
        rawFound: false
      });
    }
  }

  return entries.sort((a, b) => a.boat - b.boat);
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return sendJson(res, 200, { ok: true });
  if (req.method !== "GET") return sendJson(res, 405, { ok: false, error: "GETのみ対応" });

  try {
    const stadiumCode = normalizeStadium(req.query.stadium);
    const raceNo = normalizeRaceNo(req.query.raceNo || req.query.rno);
    const date = normalizeDate(req.query.date || req.query.hd);

    const entryUrl = buildUrl("entry", stadiumCode, raceNo, date);
    const beforeInfoUrl = buildUrl("before", stadiumCode, raceNo, date);

    const [entryHtml, beforeHtml] = await Promise.all([
      fetchHtml(entryUrl),
      fetchHtml(beforeInfoUrl).catch(() => "")
    ]);

    const entries = parseEntries(entryHtml);

    return sendJson(res, 200, {
      ok: true,
      source: "boatrace-official",
      parser: "cheerio-dom",
      stadiumCode,
      stadiumName: STADIUM_CODE_TO_NAME[stadiumCode] || "",
      raceNo,
      date,
      entryUrl,
      beforeInfoUrl,
      entries,
      beforeInfo: [],
      message: "DOM解析版：出走表取得完了"
    });
  } catch (error) {
    return sendJson(res, 500, {
      ok: false,
      error: error.message || "race API error"
    });
  }
}