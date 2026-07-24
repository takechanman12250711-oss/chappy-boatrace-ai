// js/reference-tags.js
// レース情報を参考タグとして整理する。予想・印・買い目・配点は変更しない。
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyReferenceTags = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const BOAT_ICONS = { 1: "⚪", 2: "⚫", 3: "🔴", 4: "🔵", 5: "🟡", 6: "🟢" };

  function number(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function listEntries(prediction) {
    const race = prediction?.race || {};
    const entries = prediction?.entries || prediction?.entry || race.entries || race.entry || [];
    return Array.isArray(entries) ? entries : [];
  }

  function boatNo(entry, index) {
    return Number(entry?.boatNo || entry?.no || entry?.waku || entry?.course || index + 1);
  }

  function valueFrom(entry, keys) {
    for (const key of keys) {
      const value = key.split(".").reduce((current, part) => current?.[part], entry);
      const parsed = number(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function addBestTag(tags, entries, options) {
    const candidates = entries
      .map((entry, index) => ({
        boat: boatNo(entry, index),
        value: valueFrom(entry, options.keys)
      }))
      .filter(item => item.boat >= 1 && item.boat <= 6 && item.value !== null);

    if (candidates.length < options.minimumCount) return;
    candidates.sort((a, b) => options.lowerIsBetter ? a.value - b.value : b.value - a.value);
    const best = candidates[0];
    const second = candidates[1];
    const gap = second ? Math.abs(second.value - best.value) : 0;
    const strength = gap >= options.strongGap ? 3 : gap >= options.mediumGap ? 2 : 1;

    tags.push({
      key: options.key,
      icon: options.icon,
      label: `${BOAT_ICONS[best.boat] || ""}${best.boat}号艇 ${options.label}`,
      detail: options.format(best.value),
      strength,
      kind: options.kind || "data"
    });
  }

  function build(prediction) {
    const tags = [];
    const entries = listEntries(prediction);

    addBestTag(tags, entries, {
      key: "exhibition",
      icon: "🟢",
      label: "展示タイム上位",
      keys: ["exhibitionTime", "exTime", "exhibition.time", "displayTime"],
      minimumCount: 3,
      lowerIsBetter: true,
      strongGap: 0.08,
      mediumGap: 0.03,
      format: value => `${value.toFixed(2)}秒`
    });

    addBestTag(tags, entries, {
      key: "lap",
      icon: "⚡",
      label: "一周タイム上位",
      keys: ["lapTime", "lap", "turnTime", "exhibition.lapTime"],
      minimumCount: 3,
      lowerIsBetter: true,
      strongGap: 0.15,
      mediumGap: 0.05,
      format: value => `${value.toFixed(2)}秒`
    });

    addBestTag(tags, entries, {
      key: "start",
      icon: "🚀",
      label: "ST上位",
      keys: ["currentST", "exhibitionST", "st", "avgST", "avgSt", "averageST"],
      minimumCount: 3,
      lowerIsBetter: true,
      strongGap: 0.06,
      mediumGap: 0.03,
      format: value => value.toFixed(2)
    });

    addBestTag(tags, entries, {
      key: "local",
      icon: "🏠",
      label: "当地実績上位",
      keys: ["localWinRate", "localRate", "venueRate", "local.winRate", "local.rate"],
      minimumCount: 3,
      lowerIsBetter: false,
      strongGap: 1.2,
      mediumGap: 0.5,
      format: value => value.toFixed(2)
    });

    const weather = prediction?.weather || prediction?.race?.raw?.weather || {};
    const windSpeed = number(weather.windSpeed ?? weather.wind);
    const waveHeight = number(weather.waveHeight ?? weather.wave);
    const windDirection = String(weather.windDirection || weather.windDir || "").trim();

    if (windSpeed !== null && windSpeed >= 4) {
      tags.push({
        key: "wind",
        icon: "🌬️",
        label: `${windDirection ? `${windDirection} ` : ""}風${windSpeed}m注意`,
        detail: "水面・進入への影響を参考確認",
        strength: windSpeed >= 7 ? 3 : windSpeed >= 5 ? 2 : 1,
        kind: "caution"
      });
    }

    if (waveHeight !== null && waveHeight >= 4) {
      tags.push({
        key: "wave",
        icon: "🌊",
        label: `波高${waveHeight}cm注意`,
        detail: "ターン・残しへの影響を参考確認",
        strength: waveHeight >= 10 ? 3 : waveHeight >= 6 ? 2 : 1,
        kind: "caution"
      });
    }

    const sourceText = JSON.stringify({
      mode: prediction?.newEngineMode,
      engine: prediction?.engineMode,
      fuel: prediction?.fuelMode,
      race: prediction?.race?.comment,
      venue: prediction?.venue?.memo,
      source: prediction?.externalData?.source || prediction?.dataSource || ""
    });

    if (/新エンジン|新型エンジン|新モーター/i.test(sourceText)) {
      tags.push({
        key: "new-engine",
        icon: "🔧",
        label: "新エンジン期",
        detail: "モーター数字は参考度を下げて確認",
        strength: 2,
        kind: "caution"
      });
    }

    if (/新燃料/i.test(sourceText)) {
      tags.push({
        key: "new-fuel",
        icon: "⛽",
        label: "新燃料使用期",
        detail: "展示・今節気配を優先して参考確認",
        strength: 2,
        kind: "caution"
      });
    }

    const combined = prediction?.combinedOdds || {};
    const categories = Object.values(combined.categories || {});
    const formal = categories.filter(item => item?.isFormal && Number(item?.combinedOdds) > 0);
    if (formal.length) {
      const best = formal.slice().sort((a, b) => Number(b.combinedOdds) - Number(a.combinedOdds))[0];
      tags.push({
        key: "combined-odds",
        icon: "💹",
        label: "合成オッズ取得済み",
        detail: `${Number(best.combinedOdds).toFixed(1)}倍を含む参考値`,
        strength: 1,
        kind: "odds"
      });
    }

    const source = String(prediction?.externalData?.source || prediction?.hiyori?.source || "");
    if (/日和|hiyori/i.test(source)) {
      tags.push({
        key: "hiyori-source",
        icon: "📎",
        label: "日和データあり",
        detail: "公式情報とは分けて参考表示",
        strength: 1,
        kind: "source"
      });
    }

    return tags
      .filter((item, index, self) => self.findIndex(other => other.key === item.key) === index)
      .slice(0, 8);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function render(tags) {
    if (!Array.isArray(tags) || !tags.length) return "";
    return `
      <section class="reference-tags-section" aria-label="参考情報タグ">
        <div class="reference-tags-head">
          <strong>📎 参考情報</strong>
          <small>予想の主判断ではなく補足として表示</small>
        </div>
        <div class="reference-tags-list">
          ${tags.map(item => `
            <span class="reference-tag reference-tag-${escapeHtml(item.kind)}" title="${escapeHtml(item.detail)}">
              <b>${escapeHtml(item.icon)} ${escapeHtml(item.label)}</b>
              <em>${"★".repeat(item.strength)}${"☆".repeat(3 - item.strength)}</em>
              ${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ""}
            </span>
          `).join("")}
        </div>
      </section>
    `;
  }

  function ensureStyle() {
    if (typeof document === "undefined" || document.getElementById("reference-tags-style")) return;
    const style = document.createElement("style");
    style.id = "reference-tags-style";
    style.textContent = `
      .reference-tags-section{margin:12px 0;padding:14px;border:1px solid #dbe6f3;border-radius:14px;background:#f8fbff}
      .reference-tags-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;margin-bottom:10px}
      .reference-tags-head strong{font-size:15px}.reference-tags-head small{color:#64748b}
      .reference-tags-list{display:flex;gap:8px;flex-wrap:wrap}
      .reference-tag{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;padding:7px 9px;border:1px solid #d8e1ec;border-radius:999px;background:#fff;font-size:12px;line-height:1.3}
      .reference-tag b{font-weight:700}.reference-tag em{font-style:normal;color:#d97706;letter-spacing:-1px}
      .reference-tag small{color:#64748b}.reference-tag-caution{background:#fffaf0}.reference-tag-odds{background:#f4fff8}.reference-tag-source{background:#faf7ff}
      @media(max-width:640px){.reference-tag{width:100%;border-radius:12px}.reference-tag small{width:100%;padding-left:2px}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    ensureStyle();
    const attach = () => {
      if (typeof window.renderAll !== "function" || window.renderAll.__referenceTagsWrapped) return false;
      const original = window.renderAll;
      function wrapped(prediction) {
        const result = original.apply(this, arguments);
        const target = document.getElementById("raceInfoArea");
        if (target) {
          const old = document.getElementById("referenceTagsArea");
          if (old) old.remove();
          const tags = build(prediction);
          if (tags.length) {
            const area = document.createElement("div");
            area.id = "referenceTagsArea";
            area.innerHTML = render(tags);
            target.insertAdjacentElement("afterend", area);
          }
        }
        return result;
      }
      wrapped.__referenceTagsWrapped = true;
      window.renderAll = wrapped;
      window.renderPrediction = wrapped;
      return true;
    };
    if (!attach()) window.addEventListener("DOMContentLoaded", attach, { once: true });
  }

  return { build, render, install };
});
