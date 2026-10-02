/* 買い目表示専用アコーディオン。予想ロジックは変更しない。 */
(function (root) {
  "use strict";

  if (root.ChappyTicketAccordionRender) return;

  const ITEM = "chappy-ticket-accordion-item";
  const STYLE_ID = "chappy-ticket-accordion-render-style";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #resultArea .${ITEM}{margin:10px 0;border:1px solid #dbe4ee;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 2px 8px rgba(15,23,42,.05)}
      #resultArea .${ITEM}>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;cursor:pointer;list-style:none;font-weight:800;-webkit-tap-highlight-color:transparent}
      #resultArea .${ITEM}>summary::-webkit-details-marker{display:none}
      #resultArea .chappy-ticket-accordion-title{display:flex;align-items:center;gap:8px;min-width:0}
      #resultArea .chappy-ticket-accordion-count{padding:3px 9px;border-radius:999px;background:#eef4fb;color:#334155;font-size:12px;font-weight:700}
      #resultArea .chappy-ticket-accordion-arrow{width:10px;height:10px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;transform:rotate(45deg);transition:transform .18s ease}
      #resultArea .${ITEM}[open] .chappy-ticket-accordion-arrow{transform:rotate(225deg)}
      #resultArea .chappy-ticket-accordion-panel{padding:0 14px 14px;border-top:1px solid #edf2f7}
      #resultArea .chappy-ticket-aim{margin:14px 0 10px;padding:12px 13px;border-radius:12px;background:#f8fafc;border-left:4px solid #2563eb}
      #resultArea .chappy-ticket-aim strong,#resultArea .chappy-ticket-description-label{display:block;margin-bottom:5px;font-size:13px;color:#334155}
      #resultArea .chappy-ticket-aim p{margin:0;line-height:1.65;color:#0f172a}
      #resultArea .chappy-ticket-description-label{margin:12px 0 8px;font-weight:800}
      #resultArea .${ITEM}[data-ticket-kind="main"]>summary{background:#eff6ff;color:#1d4ed8}
      #resultArea .${ITEM}[data-ticket-kind="cover"]>summary{background:#f8fafc;color:#334155}
      #resultArea .${ITEM}[data-ticket-kind="flow"]>summary{background:#f0fdf4;color:#15803d}
      #resultArea .${ITEM}[data-ticket-kind="manshu"]>summary{background:#fff1f2;color:#be123c}
    `;
    document.head.appendChild(style);
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function rowCount(element) {
    return element?.querySelectorAll?.(".v3-formation-row").length || 0;
  }

  function reason(element, fallback) {
    return clean(element?.querySelector?.(".v3-formation-reason")?.textContent) || fallback;
  }

  function summary(label, count) {
    const node = document.createElement("summary");
    node.innerHTML = `<span class="chappy-ticket-accordion-title"><span>${label}</span><span class="chappy-ticket-accordion-count">${count}点</span></span><span class="chappy-ticket-accordion-arrow" aria-hidden="true"></span>`;
    return node;
  }

  function context(panel, source, fallback) {
    const aim = document.createElement("div");
    aim.className = "chappy-ticket-aim";
    const strong = document.createElement("strong");
    strong.textContent = "買い目の狙い";
    const text = document.createElement("p");
    text.textContent = reason(source, fallback);
    aim.append(strong, text);
    panel.appendChild(aim);

    const label = document.createElement("div");
    label.className = "chappy-ticket-description-label";
    label.textContent = "説明・買い目・オッズ";
    panel.appendChild(label);
  }

  function wrapGroup(group, config) {
    if (!group || group.closest(`.${ITEM}`) || group.dataset.ticketAccordionWrapped === "true") return null;
    const details = document.createElement("details");
    details.className = ITEM;
    details.dataset.ticketKind = config.kind;
    details.dataset.ticketAccordionWrapped = "true";
    const panel = document.createElement("div");
    panel.className = "chappy-ticket-accordion-panel";
    details.appendChild(summary(config.label, Math.max(1, rowCount(group))));
    context(panel, group, config.fallback);
    group.dataset.ticketAccordionWrapped = "true";
    group.parentNode.insertBefore(details, group);
    panel.appendChild(group);
    details.appendChild(panel);
    details.open = Boolean(config.open);
    return details;
  }

  function findFormationGroup(container, expectedTitle) {
    return [...container.querySelectorAll(".v3-main-newspaper .v3-formation-group")]
      .find(group => clean(group.querySelector(":scope > h3")?.textContent).startsWith(expectedTitle)) || null;
  }

  function wrapManshu(container) {
    const section = container.querySelector(".v3-manshu-newspaper");
    if (!section || section.dataset.ticketAccordionWrapped === "true") return null;
    const body = section.querySelector(":scope > .v3-section-body");
    if (!body) return null;
    const content = document.createElement("div");
    while (body.firstChild) content.appendChild(body.firstChild);
    const details = document.createElement("details");
    details.className = ITEM;
    details.dataset.ticketKind = "manshu";
    details.dataset.ticketAccordionWrapped = "true";
    const panel = document.createElement("div");
    panel.className = "chappy-ticket-accordion-panel";
    details.appendChild(summary("万舟", Math.max(1, rowCount(content))));
    context(panel, content, "内側が崩れた場合や高配当展開を狙う買い目です。");
    panel.appendChild(content);
    details.appendChild(panel);
    body.appendChild(details);
    const head = section.querySelector(":scope > .v3-section-head");
    if (head) head.hidden = true;
    section.dataset.ticketAccordionWrapped = "true";
    return details;
  }

  function bindSingleOpen(container) {
    if (container.dataset.ticketAccordionRenderBound === "true") return;
    container.dataset.ticketAccordionRenderBound = "true";
    container.addEventListener("toggle", event => {
      const current = event.target;
      if (!(current instanceof HTMLDetailsElement) || !current.open || !current.classList.contains(ITEM)) return;
      container.querySelectorAll(`.${ITEM}[open]`).forEach(item => {
        if (item !== current) item.open = false;
      });
    }, true);
  }

  function apply() {
    installStyle();
    const container = document.getElementById("resultArea");
    if (!container) return false;

    const items = [
      wrapGroup(findFormationGroup(container, "本線"), { kind: "main", label: "本命", fallback: "最も成立度が高い中心展開の買い目です。", open: true }),
      wrapGroup(findFormationGroup(container, "押さえ"), { kind: "cover", label: "押さえ", fallback: "本命展開が崩れた場合を補う買い目です。", open: false }),
      wrapGroup(
        findFormationGroup(
          container,
          "フォーメーション"
        ) || findFormationGroup(container, "流し"),
        {
          kind: "flow",
          label: "フォーメーション",
          fallback: "同じ1着・2着軸を共有する根拠付き3連単2券です。",
          open: false
        }
      ),
      wrapManshu(container)
    ].filter(Boolean);

    bindSingleOpen(container);
    return items.length > 0;
  }

  function install() {
    ["renderAll", "renderPrediction"].forEach(name => {
      const original = root[name];
      if (typeof original !== "function" || original.__ticketAccordionRenderWrapped) return;
      const wrapped = function (...args) {
        const output = original.apply(this, args);
        queueMicrotask(apply);
        return output;
      };
      wrapped.__ticketAccordionRenderWrapped = true;
      root[name] = wrapped;
    });
    queueMicrotask(apply);
  }

  root.ChappyTicketAccordionRender = Object.freeze({ apply, install });
  install();
})(window);
