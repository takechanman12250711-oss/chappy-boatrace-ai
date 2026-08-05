"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const renderPath = path.join(root, "js", "render.js");
const stylePath = path.join(root, "style.css");

let render = fs.readFileSync(renderPath, "utf8");
let style = fs.readFileSync(stylePath, "utf8");

const helperMarker = "function renderTicketAccordion(";
if (!render.includes(helperMarker)) {
  const anchor = "     function renderMainNewspaper(prediction) {";
  const helper = `
  function renderTicketAccordion(
    label,
    type,
    body,
    pointCount,
    aim,
    open = false
  ) {
    if (!body) return "";

    return \
      \`<details
        name="chappy-ticket-accordion"
        class="v3-ticket-accordion v3-ticket-accordion-\${escapeHtml(type)}"
        \${open ? "open" : ""}
      >
        <summary>
          <span>\${escapeHtml(label)}</span>
          <span class="v3-ticket-accordion-count">
            \${escapeHtml(pointCount)}点
          </span>
          <span class="v3-ticket-accordion-arrow" aria-hidden="true"></span>
        </summary>
        <div class="v3-ticket-accordion-panel">
          <div class="v3-ticket-accordion-aim">
            <strong>買い目の狙い</strong>
            <p>\${escapeHtml(aim || "この分類で成立度が高い買い目を表示します。")}</p>
          </div>
          <div class="v3-ticket-accordion-label">説明・買い目・オッズ</div>
          \${body}
        </div>
      </details>\`;
  }

  function resolveTicketPointCount(list, type) {
    const rows = arrayify(list);
    if (type === "flow") {
      return Math.max(
        1,
        safeNum(
          rows[0]?.pointCount ?? rows[0]?.ticketCount,
          rows.length || 1
        )
      );
    }
    return Math.max(1, rows.length);
  }

  function resolveTicketAim(list, fallback) {
    const row = arrayify(list)[0];
    if (!row || typeof row !== "object") return fallback;
    return row.scenarioSummary || row.comment || row.reason || fallback;
  }

`;
  if (!render.includes(anchor)) {
    throw new Error("renderMainNewspaper anchor not found");
  }
  render = render.replace(anchor, helper + anchor);
}

const oldTicketBody = `    const ticketBody = [
      renderTicketRows(
        "本線",
        mainTickets,
        "main",
        "本命",
        "中心展開"
      ),

      renderTicketRows(
        "押さえ",
        coverTickets,
        "safety",
        "押さえ",
        "安全押さえ"
      ),

      renderTicketRows(
        "流し",
        flowTickets,
        "flow",
        "流し",
        "流し展開"
      )
    ]
      .filter(Boolean)
      .join("");`;

const newTicketBody = `    const ticketBody = [
      renderTicketAccordion(
        "本命",
        "main",
        renderTicketRows(
          "本線",
          mainTickets,
          "main",
          "本命",
          "中心展開"
        ),
        resolveTicketPointCount(
          mainTickets,
          "main"
        ),
        resolveTicketAim(
          mainTickets,
          "最も成立度が高い中心展開の買い目です。"
        ),
        true
      ),

      renderTicketAccordion(
        "押さえ",
        "safety",
        renderTicketRows(
          "押さえ",
          coverTickets,
          "safety",
          "押さえ",
          "安全押さえ"
        ),
        resolveTicketPointCount(
          coverTickets,
          "safety"
        ),
        resolveTicketAim(
          coverTickets,
          "本命展開が崩れた場合を補う買い目です。"
        ),
        false
      ),

      renderTicketAccordion(
        "流し",
        "flow",
        renderTicketRows(
          "流し",
          flowTickets,
          "flow",
          "流し",
          "流し展開"
        ),
        resolveTicketPointCount(
          flowTickets,
          "flow"
        ),
        resolveTicketAim(
          flowTickets,
          "中心艇を固定し、相手を広く拾う買い目です。"
        ),
        false
      )
    ]
      .filter(Boolean)
      .join("");`;

if (render.includes(oldTicketBody)) {
  render = render.replace(oldTicketBody, newTicketBody);
} else if (!render.includes("resolveTicketPointCount(\n          mainTickets")) {
  throw new Error("ticketBody block not found");
}

const oldManshuReturn = `    return section(
      "万舟",
      body,
      "💣",
      "v3-manshu-newspaper"
    );`;
const newManshuReturn = `    return renderTicketAccordion(
      "万舟",
      "manshu",
      section(
        "万舟",
        body,
        "💣",
        "v3-manshu-newspaper"
      ),
      Math.max(1, rows.length),
      resolveTicketAim(
        rows,
        "内側が崩れた場合や高配当展開を狙う買い目です。"
      ),
      false
    );`;

if (render.includes(oldManshuReturn)) {
  render = render.replace(oldManshuReturn, newManshuReturn);
} else if (!render.includes('renderTicketAccordion(\n      "万舟"')) {
  throw new Error("manshu return block not found");
}

render = render.replace(
  'const RENDER_VERSION = "render-ui-v3.2.0-flow-missing30";',
  'const RENDER_VERSION = "render-ui-v3.3.0-direct-accordion";'
);

const cssMarker = "/* direct-render ticket accordion v1 */";
if (!style.includes(cssMarker)) {
  style += `

${cssMarker}
.v3-ticket-accordion {
  margin: 12px 0;
  border: 1px solid #dbe4ee;
  border-radius: 14px;
  background: #fff;
  overflow: hidden;
}
.v3-ticket-accordion > summary {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
  list-style: none;
  font-weight: 800;
  -webkit-tap-highlight-color: transparent;
}
.v3-ticket-accordion > summary::-webkit-details-marker { display: none; }
.v3-ticket-accordion-main > summary { background: #eff6ff; color: #1d4ed8; }
.v3-ticket-accordion-safety > summary { background: #f8fafc; color: #334155; }
.v3-ticket-accordion-flow > summary { background: #f0fdf4; color: #15803d; }
.v3-ticket-accordion-manshu > summary { background: #fff1f2; color: #be123c; }
.v3-ticket-accordion-count {
  margin-left: auto;
  padding: 3px 9px;
  border-radius: 999px;
  background: rgba(255,255,255,.75);
  color: inherit;
  font-size: 12px;
}
.v3-ticket-accordion-arrow {
  width: 9px;
  height: 9px;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: rotate(45deg);
  transition: transform .18s ease;
}
.v3-ticket-accordion[open] .v3-ticket-accordion-arrow { transform: rotate(225deg); }
.v3-ticket-accordion-panel {
  padding: 0 14px 14px;
  border-top: 1px solid #edf2f7;
}
.v3-ticket-accordion-aim {
  margin: 14px 0 10px;
  padding: 12px 13px;
  border-radius: 12px;
  border-left: 4px solid #2563eb;
  background: #f8fafc;
}
.v3-ticket-accordion-aim strong,
.v3-ticket-accordion-label {
  display: block;
  margin-bottom: 5px;
  font-size: 13px;
  font-weight: 800;
  color: #334155;
}
.v3-ticket-accordion-aim p { margin: 0; line-height: 1.65; }
.v3-ticket-accordion-label { margin: 12px 0 8px; }
.v3-ticket-accordion-manshu .v3-section-head { display: none; }
`;
}

fs.writeFileSync(renderPath, render);
fs.writeFileSync(stylePath, style);
console.log("direct render accordion applied");
