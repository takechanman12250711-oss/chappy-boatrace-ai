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
    ["practicalSelection", "tickets"],
    ["ticketRanks"],
    ["aiTicketList"]
  ];

  function normalizeTicket(value) {
    return String(value || "").replace(/\s+/g, "").trim();
  }

  function raceKey(prediction) {
    const race = prediction?.race || {};
    const date = String(
      race.date || prediction?.date || prediction?.params?.date || ""
    ).replaceAll("-", "");
    const jcd = String(
      race.jcd || race.stadiumCode || prediction?.stadiumCode ||
      prediction?.venue?.code || prediction?.params?.jcd || ""
    ).padStart(2, "0");
    const rno = String(
      race.raceNo || race.rno || prediction?.raceNo ||
      prediction?.params?.rno || ""
    );

    if (!date || !jcd || !rno) return "";
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

    LIST_PATHS.forEach(path => {
      const list = getAtPath(prediction, path);
      if (!Array.isArray(list)) return;

      list.forEach(item => {
        const ticket = normalizeTicket(
          typeof item === "string"
            ? item
            : item?.ticket || item?.line || item?.formation
        );
        const odds = Number(item?.odds);

        if (ticket && Number.isFinite(odds) && odds > 0) {
          byTicket[ticket] = odds;
        }
      });
    });

    return byTicket;
  }

  function save(prediction, storage = root?.localStorage) {
    const key = raceKey(prediction);
    const byTicket = collectOdds(prediction);

    if (!key || !Object.keys(byTicket).length || !storage) return false;

    storage.setItem(
      `${STORAGE_PREFIX}${key}`,
      JSON.stringify({
        raceKey: key,
        savedAt: new Date().toISOString(),
        source: "official-last-retrieved",
        byTicket
      })
    );
    return true;
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

  function restoreList(list, byTicket) {
    if (!Array.isArray(list)) return list;

    return list.map(item => {
      if (!item || typeof item !== "object") return item;

      const ticket = normalizeTicket(
        item.ticket || item.line || item.formation
      );
      const currentOdds = Number(item.odds);
      const savedOdds = Number(byTicket?.[ticket]);

      if (
        !ticket ||
        (Number.isFinite(currentOdds) && currentOdds > 0) ||
        !Number.isFinite(savedOdds) ||
        savedOdds <= 0
      ) {
        return item;
      }

      return {
        ...item,
        odds: savedOdds,
        oddsText: `${savedOdds}倍（最終取得）`,
        oddsSource: "official-last-retrieved",
        isFinalRetrievedOdds: true
      };
    });
  }

  function prepare(prediction, storage = root?.localStorage) {
    if (!prediction || typeof prediction !== "object") return prediction;

    save(prediction, storage);

    if (!isFinished(prediction)) return prediction;

    const snapshot = load(prediction, storage);
    if (!snapshot) return prediction;

    const display = { ...prediction };
    let changed = false;

    LIST_PATHS.forEach(path => {
      const original = getAtPath(prediction, path);
      const restored = restoreList(original, snapshot.byTicket);

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
      source: snapshot.source
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
