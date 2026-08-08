// API Productionが旧版でも全艇F/Lの不成立を未確定表示しないための互換層。
(function (root) {
  "use strict";
  if (root.__CHAPPY_RESULT_VOID_COMPAT__) return;
  root.__CHAPPY_RESULT_VOID_COMPAT__ = true;

  const originalFetch = root.fetch.bind(root);

  function isResultApiRequest(input) {
    const url = typeof input === "string"
      ? input
      : String(input?.url || "");
    return url.includes("chappy-boatrace-api.vercel.app/api/result");
  }

  function isVoidRacePayload(payload) {
    if (!payload || payload.resultAvailable === true || payload.trifecta) return false;
    const starts = Array.isArray(payload.starts) ? payload.starts : [];
    if (starts.length !== 6) return false;
    return starts.every(item => {
      const marker = String(item?.marker || "").trim().toUpperCase();
      return marker === "F" || marker === "L" || item?.falseStart === true || item?.lateStart === true;
    });
  }

  function applyVoidPresentation(payload) {
    if (!isVoidRacePayload(payload)) return payload;
    root.__CHAPPY_LAST_VOID_RESULT__ = {
      date: String(payload.date || ""),
      jcd: String(payload.jcd || ""),
      raceNo: Number(payload.raceNo || 0),
      checkedAt: String(payload.checkedAt || new Date().toISOString())
    };
    return {
      ...payload,
      status: "void",
      void: true,
      voidReason: "all-boats-f-l"
    };
  }

  root.fetch = async function (...args) {
    const response = await originalFetch(...args);
    if (!isResultApiRequest(args[0])) return response;

    try {
      const payload = await response.clone().json();
      const normalized = applyVoidPresentation(payload);
      if (normalized === payload) return response;

      const headers = new Headers(response.headers);
      headers.set("content-type", "application/json; charset=utf-8");
      return new Response(JSON.stringify(normalized), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };

  const observer = new MutationObserver(() => {
    const latest = root.__CHAPPY_LAST_VOID_RESULT__;
    if (!latest) return;
    const area = document.getElementById("reviewResultArea");
    if (!area || area.style.display === "none") return;

    const text = area.textContent || "";
    if (!text.includes("公式結果はまだ確定していません")) return;

    const card = area.querySelector(".race-select-card");
    if (card) {
      card.innerHTML = `
        <p><strong>不成立（全艇F/L）</strong></p>
        <p>3連単は成立していません。返還対象として扱います。</p>
      `;
    }

    const status = document.getElementById("statusArea");
    if (status && status.textContent.includes("公式結果は未確定")) {
      status.textContent = "振り返り予想と不成立結果を表示しました";
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }
})(window);
