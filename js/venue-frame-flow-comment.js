// js/venue-frame-flow-comment.js
// 検証済みの場別枠傾向（採用候補のみ）を展開コメントの補足として表示する。
// 予想ロジック・印・配点・買い目・本線判定は変更しない。
(function () {
  "use strict";

  const STORAGE_KEY = "chappy_venue_frame_validation_v1";

  function readRows() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function percent(hit, total) {
    return total ? Number((hit * 100 / total).toFixed(1)) : 0;
  }

  function selectedPlace() {
    return String(document.getElementById("placeSelect")?.value || "").trim();
  }

  function adoptionItems() {
    const map = new Map();
    readRows()
      .filter(row => row?.status === "evaluated" && row?.outcome)
      .forEach(row => {
        const signals = [
          { type: "rise", frameNo: Number(row.signals?.rising?.frameNo), hit: !!row.outcome.riseHit },
          { type: "sink", frameNo: Number(row.signals?.sinking?.frameNo), hit: !!row.outcome.sinkHit }
        ];
        signals.forEach(signal => {
          if (!(signal.frameNo >= 1 && signal.frameNo <= 6)) return;
          const key = `${row.jcd}-${signal.type}-${signal.frameNo}`;
          const item = map.get(key) || {
            key,
            jcd: row.jcd,
            place: row.place || row.jcd,
            type: signal.type,
            frameNo: signal.frameNo,
            samples: 0,
            hits: 0
          };
          item.samples += 1;
          item.hits += signal.hit ? 1 : 0;
          map.set(key, item);
        });
      });

    return Array.from(map.values())
      .map(item => ({ ...item, rate: percent(item.hits, item.samples) }))
      .filter(item => item.samples >= 10 && item.rate >= 60)
      .sort((a, b) => b.rate - a.rate || b.samples - a.samples);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function findFinalCommentSection() {
    const root = document.getElementById("resultArea");
    if (!root) return null;
    return Array.from(root.querySelectorAll(".v3-section")).find(section => {
      const title = section.querySelector(".v3-section-head h2")?.textContent || "";
      return /最終結論|最終コメント|AI判断|AI結論/.test(title);
    }) || null;
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameFlowComment");
    if (holder) return holder;
    const finalSection = findFinalCommentSection();
    if (!finalSection) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameFlowComment";
    holder.className = "v3-section venue-frame-flow-comment";
    finalSection.insertAdjacentElement("beforebegin", holder);
    return holder;
  }

  function render() {
    const holder = ensureHolder();
    if (!holder) return;

    const place = selectedPlace();
    const items = adoptionItems().filter(item => item.place === place);

    if (!place || !items.length) {
      holder.hidden = true;
      holder.innerHTML = "";
      return;
    }

    const rise = items.find(item => item.type === "rise");
    const sink = items.find(item => item.type === "sink");
    const comments = [];

    if (rise) {
      comments.push(`${rise.frameNo}枠は検証${rise.samples}件で浮上判定${rise.rate}%の採用候補。展開が向く場合の相手・残し候補として補足確認。`);
    }
    if (sink) {
      comments.push(`${sink.frameNo}枠は検証${sink.samples}件で沈下判定${sink.rate}%の採用候補。展示やSTが弱い場合は評価を慎重に確認。`);
    }

    holder.hidden = false;
    holder.innerHTML = `
      <div class="v3-section-head"><h2>🧭 検証済み場別枠傾向</h2></div>
      <div class="v3-section-body">
        <div class="venue-frame-flow-comment-body">
          ${comments.map(text => `<p>${escapeHtml(text)}</p>`).join("")}
          <small>展開コメントの補足専用。展開・コース・ST・展示より優先せず、印・配点・買い目・本線判定には使用しません。</small>
        </div>
      </div>
    `;
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-flow-comment-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-flow-comment-style";
    style.textContent = `
      .venue-frame-flow-comment .venue-frame-flow-comment-body{padding:12px;border:1px solid #cfe8dc;border-radius:12px;background:#f3fbf7}
      .venue-frame-flow-comment p{margin:0 0 7px;line-height:1.65;font-size:13px}
      .venue-frame-flow-comment p:last-of-type{margin-bottom:8px}
      .venue-frame-flow-comment small{display:block;color:#64748b;font-size:11px;line-height:1.55}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    render();
    document.getElementById("placeSelect")?.addEventListener("change", render);
    window.addEventListener("storage", render);
    const target = document.getElementById("resultArea") || document.body;
    new MutationObserver(render).observe(target, { childList: true, subtree: true });
    setInterval(render, 60000);
  }

  window.ChappyVenueFrameFlowComment = { adoptionItems, render };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
})();
