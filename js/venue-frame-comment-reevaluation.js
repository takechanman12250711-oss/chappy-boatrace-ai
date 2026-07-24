// js/venue-frame-comment-reevaluation.js
// 展開コメント連携後の実績で採用候補を再評価する。
// 予想ロジック・印・配点・買い目は変更しない。
(function () {
  "use strict";

  const AUDIT_KEY = "chappy_venue_frame_comment_audit_v1";
  const OVERRIDE_KEY = "chappy_venue_frame_comment_overrides_v1";

  function read(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function write(value) {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(value));
  }

  function percent(hit, total) {
    return total ? Number((hit * 100 / total).toFixed(1)) : 0;
  }

  function status(rate, samples) {
    if (samples < 5) return { key:"watch", label:"継続観察" };
    if (rate >= 55) return { key:"continue", label:"連携継続" };
    if (rate >= 40) return { key:"hold", label:"連携保留" };
    return { key:"stop", label:"連携停止" };
  }

  function aggregate() {
    const map = new Map();
    read(AUDIT_KEY)
      .filter(row => row?.status === "evaluated" && Array.isArray(row?.outcomes))
      .forEach(row => {
        row.outcomes.forEach(outcome => {
          const frameNo = Number(outcome?.frameNo);
          if (!(frameNo >= 1 && frameNo <= 6)) return;
          const type = outcome?.type === "sink" ? "sink" : "rise";
          const key = `${row.jcd}-${type}-${frameNo}`;
          const item = map.get(key) || {
            key,
            jcd: row.jcd,
            place: row.place || row.jcd,
            type,
            frameNo,
            samples: 0,
            hits: 0,
            lastEvaluatedAt: null
          };
          item.samples += 1;
          item.hits += outcome.hit ? 1 : 0;
          const date = row.evaluatedAt || row.updatedAt || row.displayedAt || null;
          if (date && (!item.lastEvaluatedAt || String(date) > String(item.lastEvaluatedAt))) {
            item.lastEvaluatedAt = date;
          }
          map.set(key, item);
        });
      });

    return Array.from(map.values()).map(item => {
      const rate = percent(item.hits, item.samples);
      return { ...item, rate, decision: status(rate, item.samples) };
    }).sort((a,b) => b.samples - a.samples || b.rate - a.rate);
  }

  function ensureHolder() {
    let holder = document.getElementById("venueFrameCommentReevaluation");
    if (holder) return holder;
    const anchor = document.getElementById("venueFrameCommentAudit") || document.getElementById("venueFrameAdoptionCandidates") || document.getElementById("statsArea");
    if (!anchor) return null;
    holder = document.createElement("section");
    holder.id = "venueFrameCommentReevaluation";
    holder.className = "venue-frame-comment-reevaluation";
    anchor.insertAdjacentElement("afterend", holder);
    return holder;
  }

  function render(items) {
    const holder = ensureHolder();
    if (!holder) return;
    const rows = items || aggregate();
    holder.innerHTML = `
      <h3>🔁 展開コメント連携の再評価</h3>
      <p>採用後の実績で連携継続・保留・停止を自動判定します。</p>
      ${rows.length ? `<div class="venue-frame-comment-reevaluation-list">${rows.slice(0,18).map(item => `
        <div class="decision-${item.decision.key}">
          <b>${item.place} ${item.frameNo}枠 ${item.type === "rise" ? "浮上" : "沈下"}</b>
          <span>${item.decision.label}</span>
          <small>${item.samples}件・的中 ${item.rate}%</small>
        </div>`).join("")}</div>` : `<small>コメント連携後の結果が5件以上蓄積されると再評価します。</small>`}
      <p class="venue-frame-comment-reevaluation-note">連携停止は補足コメントの表示だけを止めます。予想ロジック・印・配点・買い目には影響しません。</p>
    `;
  }

  function apply() {
    const items = aggregate();
    const overrides = Object.fromEntries(items.map(item => [item.key, {
      key: item.decision.key,
      label: item.decision.label,
      samples: item.samples,
      rate: item.rate,
      updatedAt: item.lastEvaluatedAt || new Date().toISOString()
    }]));
    write(overrides);

    const place = String(document.getElementById("placeSelect")?.value || "").trim();
    const holder = document.getElementById("venueFrameFlowComment");
    const current = items.filter(item => item.place === place);
    const active = current.filter(item => item.decision.key === "continue" || item.decision.key === "watch");

    if (holder && current.length && !active.length) {
      holder.hidden = true;
      holder.setAttribute("data-reevaluation", "stopped");
    } else if (holder) {
      holder.removeAttribute("data-reevaluation");
    }

    render(items);
    window.dispatchEvent(new CustomEvent("chappy:venue-frame-comment-reevaluated", { detail: { items, overrides } }));
  }

  function ensureStyle() {
    if (document.getElementById("venue-frame-comment-reevaluation-style")) return;
    const style = document.createElement("style");
    style.id = "venue-frame-comment-reevaluation-style";
    style.textContent = `
      .venue-frame-comment-reevaluation{margin-top:16px;padding:16px;border:1px solid #dbe6f3;border-radius:16px;background:#fff}
      .venue-frame-comment-reevaluation h3{margin:0 0 5px;font-size:17px}.venue-frame-comment-reevaluation>p{margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.6}
      .venue-frame-comment-reevaluation-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.venue-frame-comment-reevaluation-list div{padding:9px;border-radius:11px;border:1px solid #e2e8f0}.venue-frame-comment-reevaluation-list b,.venue-frame-comment-reevaluation-list span,.venue-frame-comment-reevaluation-list small{display:block}.venue-frame-comment-reevaluation-list span{margin:3px 0;font-size:12px}.venue-frame-comment-reevaluation-list small{color:#64748b}
      .decision-continue{background:#f2fbf6}.decision-watch{background:#f8fafc}.decision-hold{background:#fffaf0}.decision-stop{background:#fff5f5}.venue-frame-comment-reevaluation-note{margin-top:10px!important}
      @media(max-width:640px){.venue-frame-comment-reevaluation-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    ensureStyle();
    apply();
    document.getElementById("placeSelect")?.addEventListener("change", apply);
    window.addEventListener("storage", apply);
    window.addEventListener("chappy:venue-frame-comment-audit-updated", apply);
    const target = document.getElementById("resultArea") || document.body;
    new MutationObserver(apply).observe(target, { childList:true, subtree:true });
    setInterval(apply, 60000);
  }

  window.ChappyVenueFrameCommentReevaluation = { aggregate, status, apply };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once:true });
  else install();
})();