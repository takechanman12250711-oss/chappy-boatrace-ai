/* =========================================================
  チャッピーボートレースAI
  本命・押さえ・流し・万舟 折りたたみUI

  表示だけを変更する。
  買い目生成・分類・点数・オッズ・AI評価は変更しない。
========================================================= */
(function (root) {
  "use strict";

  if (!root || root.ChappyTicketAccordionUI) return;

  const STYLE_ID = "chappy-ticket-accordion-style";
  const ITEM_CLASS = "chappy-ticket-accordion-item";
  const ROOT_CLASS = "chappy-ticket-accordion-ready";

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${ROOT_CLASS} .${ITEM_CLASS} {
        margin: 10px 0;
        border: 1px solid #dbe4ee;
        border-radius: 14px;
        background: #fff;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
      }

      .${ROOT_CLASS} .${ITEM_CLASS} > summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 16px;
        cursor: pointer;
        list-style: none;
        font-weight: 800;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }

      .${ROOT_CLASS} .${ITEM_CLASS} > summary::-webkit-details-marker {
        display: none;
      }

      .${ROOT_CLASS} .chappy-ticket-accordion-title {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .${ROOT_CLASS} .chappy-ticket-accordion-count {
        flex: 0 0 auto;
        padding: 3px 9px;
        border-radius: 999px;
        background: #eef4fb;
        color: #334155;
        font-size: 12px;
        font-weight: 700;
      }

      .${ROOT_CLASS} .chappy-ticket-accordion-arrow {
        flex: 0 0 auto;
        width: 10px;
        height: 10px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(45deg);
        transition: transform 0.18s ease;
      }

      .${ROOT_CLASS} .${ITEM_CLASS}[open] .chappy-ticket-accordion-arrow {
        transform: rotate(225deg);
      }

      .${ROOT_CLASS} .chappy-ticket-accordion-panel {
        padding: 0 14px 14px;
        border-top: 1px solid #edf2f7;
      }

      .${ROOT_CLASS} .chappy-ticket-aim {
        margin: 14px 0 10px;
        padding: 12px 13px;
        border-radius: 12px;
        background: #f8fafc;
        border-left: 4px solid #2563eb;
      }

      .${ROOT_CLASS} .chappy-ticket-aim strong,
      .${ROOT_CLASS} .chappy-ticket-description-label {
        display: block;
        margin-bottom: 5px;
        font-size: 13px;
        color: #334155;
      }

      .${ROOT_CLASS} .chappy-ticket-aim p {
        margin: 0;
        line-height: 1.65;
        color: #0f172a;
      }

      .${ROOT_CLASS} .chappy-ticket-description-label {
        margin: 12px 0 8px;
        font-weight: 800;
      }

      .${ROOT_CLASS} .${ITEM_CLASS}[data-ticket-kind="main"] > summary {
        background: #eff6ff;
        color: #1d4ed8;
      }

      .${ROOT_CLASS} .${ITEM_CLASS}[data-ticket-kind="cover"] > summary {
        background: #f8fafc;
        color: #334155;
      }

      .${ROOT_CLASS} .${ITEM_CLASS}[data-ticket-kind="flow"] > summary {
        background: #f0fdf4;
        color: #15803d;
      }

      .${ROOT_CLASS} .${ITEM_CLASS}[data-ticket-kind="manshu"] > summary {
        background: #fff1f2;
        color: #be123c;
      }
    `;
    document.head.appendChild(style);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function countRows(element) {
    return element?.querySelectorAll?.(".v3-formation-row").length || 0;
  }

  function firstReason(element) {
    return cleanText(
      element?.querySelector?.(".v3-formation-reason")?.textContent || ""
    );
  }

  function createSummary(label, count) {
    const summary = document.createElement("summary");
    summary.innerHTML = `
      <span class="chappy-ticket-accordion-title">
        <span>${label}</span>
        <span class="chappy-ticket-accordion-count">${count}点</span>
      </span>
      <span class="chappy-ticket-accordion-arrow" aria-hidden="true"></span>
    `;
    return summary;
  }

  function addContext(panel, source, fallbackAim) {
    const aim = firstReason(source) || fallbackAim;
    if (aim) {
      const aimBox = document.createElement("div");
      aimBox.className = "chappy-ticket-aim";
      const title = document.createElement("strong");
      title.textContent = "買い目の狙い";
      const text = document.createElement("p");
      text.textContent = aim;
      aimBox.append(title, text);
      panel.appendChild(aimBox);
    }

    const description = document.createElement("div");
    description.className = "chappy-ticket-description-label";
    description.textContent = "説明・買い目・オッズ";
    panel.appendChild(description);
  }

  function wrapGroup(group, options) {
    if (!group || group.dataset.ticketAccordionWrapped === "true") return null;

    const details = document.createElement("details");
    details.className = ITEM_CLASS;
    details.dataset.ticketKind = options.kind;
    details.dataset.ticketAccordionWrapped = "true";

    const panel = document.createElement("div");
    panel.className = "chappy-ticket-accordion-panel";

    const count = Math.max(1, countRows(group));
    details.appendChild(createSummary(options.label, count));
    addContext(panel, group, options.fallbackAim);

    group.dataset.ticketAccordionWrapped = "true";
    group.parentNode.insertBefore(details, group);
    panel.appendChild(group);
    details.appendChild(panel);

    if (options.open) details.open = true;
    return details;
  }

  function wrapManshu(section) {
    if (!section || section.dataset.ticketAccordionWrapped === "true") return null;

    const body = section.querySelector(".v3-section-body");
    if (!body) return null;

    const content = document.createElement("div");
    while (body.firstChild) content.appendChild(body.firstChild);

    const details = document.createElement("details");
    details.className = ITEM_CLASS;
    details.dataset.ticketKind = "manshu";
    details.dataset.ticketAccordionWrapped = "true";

    const panel = document.createElement("div");
    panel.className = "chappy-ticket-accordion-panel";
    const count = Math.max(1, countRows(content));

    details.appendChild(createSummary("万舟", count));
    addContext(panel, content, "内側が崩れた場合や高配当展開を狙う買い目です。");
    panel.appendChild(content);
    details.appendChild(panel);
    body.appendChild(details);

    const sectionHead = section.querySelector(":scope > .v3-section-head");
    if (sectionHead) sectionHead.hidden = true;
    section.dataset.ticketAccordionWrapped = "true";
    return details;
  }

  function enforceSingleOpen(container) {
    if (!container || container.dataset.ticketAccordionBound === "true") return;

    container.dataset.ticketAccordionBound = "true";
    container.addEventListener("toggle", event => {
      const current = event.target;
      if (!(current instanceof HTMLDetailsElement) || !current.open) return;
      if (!current.classList.contains(ITEM_CLASS)) return;

      container.querySelectorAll(`.${ITEM_CLASS}[open]`).forEach(item => {
        if (item !== current) item.open = false;
      });
    }, true);
  }

  function apply() {
    installStyle();
    const container = document.getElementById("resultArea");
    if (!container) return false;

    container.classList.add(ROOT_CLASS);

    const groups = [
      {
        selector: ".v3-main-newspaper .v3-formation-group:nth-of-type(1)",
        kind: "main",
        label: "本命",
        fallbackAim: "最も成立度が高い中心展開の買い目です。",
        open: true
      },
      {
        selector: ".v3-main-newspaper .v3-formation-group:nth-of-type(2)",
        kind: "cover",
        label: "押さえ",
        fallbackAim: "本命展開が崩れた場合を補う買い目です。",
        open: false
      },
      {
        selector: ".v3-main-newspaper .v3-formation-group:nth-of-type(3)",
        kind: "flow",
        label: "流し",
        fallbackAim: "中心艇を固定し、相手を広く拾う買い目です。",
        open: false
      }
    ];

    const wrapped = [];
    groups.forEach(options => {
      const group = container.querySelector(options.selector);
      const item = wrapGroup(group, options);
      if (item) wrapped.push(item);
    });

    const manshu = wrapManshu(
      container.querySelector(".v3-manshu-newspaper")
    );
    if (manshu) wrapped.push(manshu);

    enforceSingleOpen(container);
    return wrapped.length > 0;
  }

  function install() {
    ["renderAll", "renderPrediction"].forEach(name => {
      const original = root[name];
      if (typeof original !== "function" || original.__ticketAccordionWrapped) return;

      const wrapped = function (...args) {
        const result = original.apply(this, args);
        queueMicrotask(apply);
        return result;
      };
      wrapped.__ticketAccordionWrapped = true;
      root[name] = wrapped;
    });

    const observer = new MutationObserver(() => {
      if (document.querySelector("#resultArea .v3-main-newspaper")) {
        queueMicrotask(apply);
      }
    });

    const rootElement = document.getElementById("resultArea");
    if (rootElement) {
      observer.observe(rootElement, { childList: true, subtree: true });
    }

    queueMicrotask(apply);
    return true;
  }

  root.ChappyTicketAccordionUI = Object.freeze({ apply, install });
  install();
})(window);
