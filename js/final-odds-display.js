/* =========================================================
  チャッピーボートレースAI
  終了後オッズ表示

  締切前に取得できた最後の公式オッズを端末へ保存し、
  終了後は「最終取得オッズ」として表示する。
  買い目生成・分類・順番・オッズ値は変更しない。
========================================================= */
(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyFinalOddsDisplay = Object.freeze(api);
    api.install(root);
  }
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  const STORAGE_PREFIX = "chappy:last-official-odds:";
  const LIST_PATHS = [
    ["ticketSheets", "main"],
    ["ticketSheets", "cover"],
    ["ticketSheets", "flow"],
    ["ticketSheets", "hole"],
    ["ticketSheets", "all"],
    ["mainSheet", "tickets"],
    ["mainSheet", "coverTickets"],
    ["mainSheet", "flowTickets"],
    ["manshuSheet", "tickets"],
    ["aiCore", "mainSheet", "tickets"],
    ["aiCore", "mainSheet", "coverTickets"],
    ["aiCore", "mainSheet", "flowTickets"],
    ["aiCore", "manshuSheet", "tickets"],
    ["finalAi", "ticketRanks"],
    ["finalAi", "topTickets"],
    ["finalAi", "manshuTickets"],
    ["practicalTickets"],
    ["practicalSelection", "tickets"],
    ["ticketRanks"],
    ["aiTicketList"]
  ];
  const MAP_PATHS = [
    ["odds"],
    ["oddsByTicket"],
    ["trifectaOdds"],
    ["combinedOdds"]
  ];

  function normalizeTicket(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function normalizeExactTicket(value) {
    const ticket = normalizeTicket(value).replace(/→/g, "-");
    const parts = ticket.split("-");
    if (parts.length !== 3) return "";
    if (parts.some(part => !/^[1-6]$/.test(part))) return "";
    if (new Set(parts).size !== 3) return "";
    return ticket;
  }

  function ticketOf(item) {
    if (typeof item === "string") return normalizeExactTicket(item);
    return normalizeExactTicket(
      item?.ticket ||
      item?.line ||
      item?.notation ||
      item?.formation?.notation ||
      item?.formation
    );
  }

  function numericOdds(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(String(value).replace(/倍(?:（最終取得）)?/g, "").trim());
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  function oddsOf(item) {
    if (!item || typeof item !== "object") return numericOdds(item);
    return numericOdds(
      item.odds ??
      item.currentOdds ??
      item.finalOdds ??
      item.value ??
      item.oddsText
    );
  }

  function raceKey(prediction) {
    const race = prediction?.race || {};
    const date = String(
      race.date || prediction?.date || prediction?.params?.date || ""
    ).replaceAll("-", "");
    const rawJcd = String(
      race.jcd || race.stadiumCode || prediction?.stadiumCode ||
      prediction?.venue?.code || prediction?.params?.jcd || ""
    );
    const jcdNumber = Number(rawJcd);
    const rawRno = String(
      race.raceNo || race.rno || prediction?.raceNo ||
      prediction?.params?.rno || ""
    );
    const rnoNumber = Number(rawRno);

    if (
      !/^\d{8}$/.test(date) ||
      !Number.isInteger(jcdNumber) ||
      jcdNumber < 1 ||
      jcdNumber > 24 ||
      !Number.isInteger(rnoNumber) ||
      rnoNumber < 1 ||
      rnoNumber > 12
    ) {
      return "";
    }
    const jcd = String(jcdNumber).padStart(2, "0");
    const rno = String(rnoNumber);
    return `${date}:${jcd}:${rno}`;
  }

  function getAtPath(source, path) {
    return path.reduce((value, key) => value?.[key], source);
  }

  function setAtPath(source, path, value) {
    let target = source;
    for (let index = 0; index < path.length - 1; index += 1) {
      const key = path[index];
      target[key] = { ...(target[key] || {}) };
      target = target[key];
    }
    target[path[path.length - 1]] = value;
  }

  function collectOdds(prediction) {
    const byTicket = {};
    const record = (ticketValue, oddsValue) => {
      const ticket = normalizeExactTicket(ticketValue);
      const odds = numericOdds(oddsValue);
      if (ticket && odds) byTicket[ticket] = odds;
    };

    LIST_PATHS.forEach(path => {
      const list = getAtPath(prediction, path);
      if (!Array.isArray(list)) return;

      list.forEach(item => {
        record(ticketOf(item), oddsOf(item));
      });
    });

    MAP_PATHS.forEach(path => {
      const map = getAtPath(prediction, path);
      if (!map || typeof map !== "object" || Array.isArray(map)) return;
      Object.entries(map).forEach(([ticket, value]) => {
        record(ticket, oddsOf(value));
      });
    });

    return byTicket;
  }

  function timestampOf(value) {
    const parsed = Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function load(prediction, storage = root?.localStorage) {
    const key = raceKey(prediction);
    if (!key || !storage) return null;

    try {
      const parsed = JSON.parse(
        storage.getItem(`${STORAGE_PREFIX}${key}`) || "null"
      );
      return parsed?.byTicket ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function save(prediction, storage = root?.localStorage) {
    const key = raceKey(prediction);
    const currentOdds = collectOdds(prediction);

    if (!key || !Object.keys(currentOdds).length || !storage) return false;

    const previous = load(prediction, storage);
    const byTicket = {
      ...(previous?.byTicket || {}),
      ...currentOdds
    };
    const finalOddsMeta =
      prediction?.finalOddsDisplay &&
      prediction.finalOddsDisplay
        .isFinalRetrievedOdds === true
        ? prediction.finalOddsDisplay
        : null;
    const savedAt = String(
      finalOddsMeta?.savedAt ||
      new Date().toISOString()
    );
    const source = String(
      finalOddsMeta?.source ||
      "official-last-retrieved"
    );

    if (
      previous &&
      timestampOf(previous.savedAt) > timestampOf(savedAt)
    ) {
      return false;
    }

    try {
      storage.setItem(
        `${STORAGE_PREFIX}${key}`,
        JSON.stringify({
          raceKey: key,
          savedAt,
          source,
          isFinalRetrievedOdds: true,
          byTicket
        })
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function isFinished(prediction) {
    const mode = root?.document
      ?.getElementById?.("raceModeSelect")?.value;
    const status = String(
      prediction?.race?.status ||
      prediction?.status ||
      prediction?.result?.status ||
      ""
    ).toLowerCase();

    return mode === "review" ||
      Boolean(prediction?.officialResult || prediction?.result?.confirmed) ||
      ["finished", "closed", "ended", "result", "確定", "終了"].some(
        word => status.includes(word)
      );
  }

  function restoreList(list, snapshot) {
    if (!Array.isArray(list)) return list;

    const byTicket =
      snapshot?.byTicket || {};
    const source = String(
      snapshot?.source ||
      "official-last-retrieved"
    );
    const savedAt = String(
      snapshot?.savedAt ||
      ""
    );
    let changed = false;

    const restored = list.map(item => {
      if (!item || typeof item !== "object") return item;

      const ticket = ticketOf(item);
      const currentOdds = oddsOf(item);
      const savedOdds = numericOdds(byTicket?.[ticket]);
      const snapshotIsNewer =
        timestampOf(savedAt) >
        timestampOf(item.oddsSavedAt);
      const shouldUseSnapshot =
        savedOdds &&
        (
          !currentOdds ||
          item.isFinalRetrievedOdds !== true ||
          snapshotIsNewer
        );

      if (
        !ticket ||
        !shouldUseSnapshot
      ) {
        return item;
      }

      changed = true;
      return {
        ...item,
        odds: savedOdds,
        oddsText: `${savedOdds}倍（最終取得）`,
        oddsSource: source,
        oddsSavedAt: savedAt,
        isFinalRetrievedOdds: true
      };
    });

    return changed
      ? restored
      : list;
  }

  function prepare(prediction, storage = root?.localStorage) {
    if (!prediction || typeof prediction !== "object") return prediction;

    const finished = isFinished(prediction);
    const isMarkedFinalSnapshot =
      prediction?.finalOddsDisplay
        ?.isFinalRetrievedOdds === true;

    // Live odds remain the local fallback source. Once a race is finished,
    // only an explicitly marked final snapshot may replace the saved value.
    // This prevents stale or provisional odds carried by an ended prediction
    // from receiving a fresh render-time timestamp and rolling final odds back.
    if (!finished || isMarkedFinalSnapshot) {
      save(prediction, storage);
    }

    if (!finished) return prediction;

    const snapshot = load(prediction, storage);
    if (!snapshot) return prediction;

    const display = { ...prediction };
    let changed = false;

    LIST_PATHS.forEach(path => {
      const original = getAtPath(prediction, path);
      const restored = restoreList(original, snapshot);

      if (restored !== original) {
        setAtPath(display, path, restored);
        changed = true;
      }
    });

    if (!changed) return prediction;

    display.finalOddsDisplay = {
      available: true,
      label: "最終取得オッズ",
      savedAt: snapshot.savedAt,
      source: snapshot.source,
      isFinalRetrievedOdds: true
    };

    return display;
  }

  function install(target) {
    if (!target || target.__finalOddsDisplayInstalled) return false;

    ["renderAll", "renderPrediction"].forEach(name => {
      const original = target[name];
      if (typeof original !== "function") return;

      target[name] = function (prediction, ...args) {
        return original.call(this, prepare(prediction), ...args);
      };
    });

    target.__finalOddsDisplayInstalled = true;
    return true;
  }

  return {
    raceKey,
    collectOdds,
    save,
    load,
    isFinished,
    prepare,
    install
  };
});
