/* =========================================================
   チャッピーボートレースAI
   api.js 完全版 Part1/3
   役割：
   - API取得の共通基盤
   - 場コード管理
   - 日付・URL管理
   - キャッシュ管理
   - 安全なfetch処理
========================================================= */

"use strict";

/* =========================================================
   24場コード管理
========================================================= */

const CHAPPY_STADIUMS = {
  "桐生": { code: "01", name: "桐生" },
  "戸田": { code: "02", name: "戸田" },
  "江戸川": { code: "03", name: "江戸川" },
  "平和島": { code: "04", name: "平和島" },
  "多摩川": { code: "05", name: "多摩川" },
  "浜名湖": { code: "06", name: "浜名湖" },
  "蒲郡": { code: "07", name: "蒲郡" },
  "常滑": { code: "08", name: "常滑" },
  "津": { code: "09", name: "津" },
  "三国": { code: "10", name: "三国" },
  "びわこ": { code: "11", name: "びわこ" },
  "住之江": { code: "12", name: "住之江" },
  "尼崎": { code: "13", name: "尼崎" },
  "鳴門": { code: "14", name: "鳴門" },
  "丸亀": { code: "15", name: "丸亀" },
  "児島": { code: "16", name: "児島" },
  "宮島": { code: "17", name: "宮島" },
  "徳山": { code: "18", name: "徳山" },
  "下関": { code: "19", name: "下関" },
  "若松": { code: "20", name: "若松" },
  "芦屋": { code: "21", name: "芦屋" },
  "福岡": { code: "22", name: "福岡" },
  "唐津": { code: "23", name: "唐津" },
  "大村": { code: "24", name: "大村" }
};

/* =========================================================
   新エンジン更新日管理
   ※日付はあとで各場ごとに正確更新していく
========================================================= */

const CHAPPY_ENGINE_RENEWAL_DATES = {
  "01": null, // 桐生
  "02": null, // 戸田
  "03": null, // 江戸川
  "04": null, // 平和島
  "05": null, // 多摩川
  "06": null, // 浜名湖
  "07": null, // 蒲郡
  "08": null, // 常滑
  "09": null, // 津
  "10": null, // 三国
  "11": null, // びわこ
  "12": null, // 住之江
  "13": null, // 尼崎
  "14": null, // 鳴門
  "15": null, // 丸亀
  "16": null, // 児島
  "17": null, // 宮島
  "18": null, // 徳山
  "19": null, // 下関
  "20": null, // 若松
  "21": null, // 芦屋
  "22": null, // 福岡
  "23": null, // 唐津
  "24": "2025-05-24" // 大村：仮登録
};

/* =========================================================
   API基本設定
========================================================= */

const CHAPPY_API_CONFIG = {
  officialBase: "https://www.boatrace.jp/owpc/pc/race",
  cacheMinutes: 3,
  timeoutMs: 12000,
  retryCount: 1
};

/* =========================================================
   内部キャッシュ
========================================================= */

const chappyApiCache = new Map();

/* =========================================================
   場名 → 場コード
========================================================= */

function getStadiumCode(stadiumName) {
  if (!stadiumName) return null;

  const key = String(stadiumName).trim();
  const stadium = CHAPPY_STADIUMS[key];

  if (!stadium) {
    console.warn("未対応の場名です:", stadiumName);
    return null;
  }

  return stadium.code;
}

/* =========================================================
   場コード → 場名
========================================================= */

function getStadiumNameByCode(code) {
  const codeText = String(code).padStart(2, "0");

  const found = Object.values(CHAPPY_STADIUMS).find(
    (stadium) => stadium.code === codeText
  );

  return found ? found.name : "";
}

/* =========================================================
   日付をYYYYMMDDへ変換
========================================================= */

function formatDateToYmd(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error("日付形式が正しくありません");
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}${mm}${dd}`;
}

/* =========================================================
   日付をYYYY-MM-DDへ変換
========================================================= */

function formatDateToHyphen(dateInput) {
  const date = dateInput ? new Date(dateInput) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw new Error("日付形式が正しくありません");
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

/* =========================================================
   URL生成
========================================================= */

function buildOfficialUrl(pageType, stadiumCode, raceNo, dateInput) {
  const jcd = String(stadiumCode).padStart(2, "0");
  const rno = Number(raceNo);
  const hd = formatDateToYmd(dateInput);

  const pageMap = {
    entry: "racelist",
    beforeInfo: "beforeinfo",
    odds3t: "odds3t",
    odds3f: "odds3f",
    result: "raceresult"
  };

  const page = pageMap[pageType];

  if (!page) {
    throw new Error(`未対応の公式ページ種別です: ${pageType}`);
  }

  return `${CHAPPY_API_CONFIG.officialBase}/${page}?rno=${rno}&jcd=${jcd}&hd=${hd}`;
}

/* =========================================================
   キャッシュキー生成
========================================================= */

function buildCacheKey(type, stadiumCode, raceNo, dateInput) {
  const jcd = String(stadiumCode).padStart(2, "0");
  const rno = Number(raceNo);
  const date = formatDateToYmd(dateInput);

  return `${type}:${jcd}:${rno}:${date}`;
}

/* =========================================================
   キャッシュ取得
========================================================= */

function getApiCache(key) {
  const cached = chappyApiCache.get(key);

  if (!cached) return null;

  const now = Date.now();
  const expireMs = CHAPPY_API_CONFIG.cacheMinutes * 60 * 1000;

  if (now - cached.savedAt > expireMs) {
    chappyApiCache.delete(key);
    return null;
  }

  return cached.data;
}

/* =========================================================
   キャッシュ保存
========================================================= */

function setApiCache(key, data) {
  chappyApiCache.set(key, {
    savedAt: Date.now(),
    data
  });
}

/* =========================================================
   fetchタイムアウト制御
========================================================= */

function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHAPPY_API_CONFIG.timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

/* =========================================================
   安全なHTML取得
========================================================= */

async function fetchHtml(url) {
  let lastError = null;

  for (let attempt = 0; attempt <= CHAPPY_API_CONFIG.retryCount; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "GET",
        mode: "cors"
      });

      if (!response.ok) {
        throw new Error(`HTTPエラー: ${response.status}`);
      }

      const html = await response.text();

      if (!html || html.length < 100) {
        throw new Error("取得HTMLが空、または短すぎます");
      }

      return html;
    } catch (error) {
      lastError = error;
      console.warn(`HTML取得失敗 attempt=${attempt + 1}`, error);
    }
  }

  throw lastError || new Error("HTML取得に失敗しました");
}

/* =========================================================
   新エンジン状態判定
========================================================= */

function getEngineMode(stadiumCode, dateInput) {
  const code = String(stadiumCode).padStart(2, "0");
  const renewalDateText = CHAPPY_ENGINE_RENEWAL_DATES[code];

  if (!renewalDateText) {
    return {
      isNewEngine: false,
      mode: "normal",
      daysFromRenewal: null,
      renewalDate: null,
      memo: "新エンジン更新日未登録"
    };
  }

  const targetDate = new Date(formatDateToHyphen(dateInput));
  const renewalDate = new Date(renewalDateText);

  if (Number.isNaN(targetDate.getTime()) || Number.isNaN(renewalDate.getTime())) {
    return {
      isNewEngine: false,
      mode: "normal",
      daysFromRenewal: null,
      renewalDate: renewalDateText,
      memo: "日付判定エラー"
    };
  }

  const diffMs = targetDate.getTime() - renewalDate.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return {
      isNewEngine: false,
      mode: "normal",
      daysFromRenewal: days,
      renewalDate: renewalDateText,
      memo: "更新日前"
    };
  }

  if (days <= 60) {
    return {
      isNewEngine: true,
      mode: "early",
      daysFromRenewal: days,
      renewalDate: renewalDateText,
      memo: "新エンジン初期：展示・ST・今節・技量重視"
    };
  }

  if (days <= 180) {
    return {
      isNewEngine: true,
      mode: "middle",
      daysFromRenewal: days,
      renewalDate: renewalDateText,
      memo: "新エンジン中期：展示とモーターを半々で評価"
    };
  }

  return {
    isNewEngine: false,
    mode: "stable",
    daysFromRenewal: days,
    renewalDate: renewalDateText,
    memo: "データ蓄積後：通常評価"
  };
}

/* =========================================================
   Part1終了
   次のPart2で作るもの：
   - 出走表HTML取得
   - 出走表パース
   - 選手名・級別・支部・年齢・体重
   - モーター・ボート
   - 全国勝率・当地勝率
========================================================= */
