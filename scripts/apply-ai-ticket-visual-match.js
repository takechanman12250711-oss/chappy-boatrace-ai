"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stylePath = path.join(root, "style.css");
let style = fs.readFileSync(stylePath, "utf8");

const marker = "/* AI ticket list visual match v2 */";
if (style.includes(marker)) {
  console.log("AI ticket visual match already applied");
  process.exit(0);
}

style += `

${marker}
.v3-ticket-section {
  --ticket-main: #ef5b6c;
  --ticket-main-soft: #fff0f2;
  --ticket-safety: #4f86f7;
  --ticket-safety-soft: #eef4ff;
  --ticket-flow: #28b487;
  --ticket-flow-soft: #ecfbf6;
  --ticket-manshu: #8b5cf6;
  --ticket-manshu-soft: #f4f0ff;
}

.v3-ticket-section .v3-section-body {
  display: grid;
  gap: 12px;
  padding-top: 2px;
}

.v3-ticket-section .v3-ai-ticket-accordion {
  position: relative;
  border: 0;
  border-radius: 18px;
  background: #ffffff;
  overflow: hidden;
  box-shadow:
    0 10px 24px rgba(15, 23, 42, .08),
    0 1px 3px rgba(15, 23, 42, .08);
  transition:
    transform .18s ease,
    box-shadow .18s ease;
}

.v3-ticket-section .v3-ai-ticket-accordion:active {
  transform: scale(.995);
}

.v3-ticket-section .v3-ai-ticket-accordion[open] {
  box-shadow:
    0 14px 30px rgba(15, 23, 42, .11),
    0 2px 5px rgba(15, 23, 42, .08);
}

.v3-ticket-section .v3-ai-ticket-accordion > summary {
  position: relative;
  min-height: 72px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 28px;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 12px 20px;
  cursor: pointer;
  list-style: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.v3-ticket-section .v3-ai-ticket-accordion > summary::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 6px;
  border-radius: 18px 0 0 18px;
  background: #94a3b8;
}

.v3-ticket-section .v3-ai-ticket-accordion-main > summary::before {
  background: var(--ticket-main);
}

.v3-ticket-section .v3-ai-ticket-accordion-safety > summary::before {
  background: var(--ticket-safety);
}

.v3-ticket-section .v3-ai-ticket-accordion-flow > summary::before {
  background: var(--ticket-flow);
}

.v3-ticket-section .v3-ai-ticket-accordion-manshu > summary::before {
  background: var(--ticket-manshu);
}

.v3-ticket-section .v3-ai-ticket-accordion > summary::-webkit-details-marker {
  display: none;
}

.v3-ticket-section .v3-ai-ticket-accordion-title {
  min-width: 0;
  font-size: 18px;
  line-height: 1.2;
  color: #111827;
  font-weight: 900;
  letter-spacing: .01em;
}

.v3-ticket-section .v3-ai-ticket-accordion-count {
  min-width: 58px;
  padding: 7px 12px;
  border-radius: 999px;
  text-align: center;
  font-size: 13px;
  line-height: 1;
  font-weight: 900;
  border: 1px solid transparent;
}

.v3-ticket-section .v3-ai-ticket-accordion-main .v3-ai-ticket-accordion-count {
  background: var(--ticket-main-soft);
  color: #d93f54;
  border-color: #ffd3d9;
}

.v3-ticket-section .v3-ai-ticket-accordion-safety .v3-ai-ticket-accordion-count {
  background: var(--ticket-safety-soft);
  color: #2d66d9;
  border-color: #d5e2ff;
}

.v3-ticket-section .v3-ai-ticket-accordion-flow .v3-ai-ticket-accordion-count {
  background: var(--ticket-flow-soft);
  color: #168363;
  border-color: #ccefe3;
}

.v3-ticket-section .v3-ai-ticket-accordion-manshu .v3-ai-ticket-accordion-count {
  background: var(--ticket-manshu-soft);
  color: #7241db;
  border-color: #e2d7ff;
}

.v3-ticket-section .v3-ai-ticket-accordion-arrow {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: #f4f7fb;
  color: #64748b;
  transition:
    transform .2s ease,
    background .2s ease,
    color .2s ease;
}

.v3-ticket-section .v3-ai-ticket-accordion-arrow::before {
  content: "⌄";
  display: block;
  font-size: 20px;
  line-height: 1;
  transform: translateY(-2px);
}

.v3-ticket-section .v3-ai-ticket-accordion[open] .v3-ai-ticket-accordion-arrow {
  transform: rotate(180deg);
  background: #eaf1fb;
  color: #334155;
}

.v3-ticket-section .v3-ai-ticket-accordion-panel {
  padding: 10px 14px 14px;
  border-top: 1px solid #edf1f6;
  background: #fbfcfe;
  animation: chappyTicketPanelIn .18s ease both;
}

@keyframes chappyTicketPanelIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.v3-ticket-section .v3-ai-ticket-accordion-panel .v3-ticket-inline {
  margin-top: 10px;
  padding: 13px;
  border: 1px solid #e5eaf1;
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, .04);
}

.v3-ticket-section .v3-ai-ticket-accordion-panel .v3-ticket-inline:first-child {
  margin-top: 0;
}

.v3-ticket-section .v3-ticket-inline .ticket {
  display: block;
  margin-bottom: 8px;
  font-size: 17px;
  font-weight: 900;
  color: #111827;
}

.v3-ticket-section .v3-ticket-values {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 7px;
}

.v3-ticket-section .v3-formation-reason {
  margin-top: 8px;
  padding: 10px 11px;
  border-radius: 10px;
  background: #f7f9fc;
  color: #475569;
  font-size: 12px;
  line-height: 1.55;
}

.v3-ticket-section .v3-ai-ticket-accordion-main[open] > summary {
  background: linear-gradient(90deg, rgba(255, 240, 242, .86), #fff 54%);
}

.v3-ticket-section .v3-ai-ticket-accordion-safety[open] > summary {
  background: linear-gradient(90deg, rgba(238, 244, 255, .9), #fff 54%);
}

.v3-ticket-section .v3-ai-ticket-accordion-flow[open] > summary {
  background: linear-gradient(90deg, rgba(236, 251, 246, .9), #fff 54%);
}

.v3-ticket-section .v3-ai-ticket-accordion-manshu[open] > summary {
  background: linear-gradient(90deg, rgba(244, 240, 255, .92), #fff 54%);
}

@media (max-width: 420px) {
  .v3-ticket-section .v3-section-body {
    gap: 10px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion > summary {
    min-height: 68px;
    grid-template-columns: minmax(0, 1fr) auto 26px;
    gap: 9px;
    padding: 10px 13px 10px 18px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion-title {
    font-size: 16px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion-count {
    min-width: 52px;
    padding: 6px 9px;
    font-size: 12px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion-arrow {
    width: 26px;
    height: 26px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion-panel {
    padding: 9px 10px 11px;
  }

  .v3-ticket-section .v3-ai-ticket-accordion-panel .v3-ticket-inline {
    padding: 11px;
    border-radius: 12px;
  }

  .v3-ticket-section .v3-ticket-inline .ticket {
    font-size: 16px;
  }
}
`;

fs.writeFileSync(stylePath, style);
console.log("AI ticket list visual match applied");
