/* 折りたたみUIを予想結果の描画へ直接接続する。 */
(function (root) {
  "use strict";
  if (root.ChappyTicketAccordionBootstrapV2) return;

  const VERSION = "20260805-ticket-accordion-render2";
  let scheduled = false;

  function apply() {
    scheduled = false;
    root.ChappyTicketAccordionRender?.apply?.();
  }

  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(apply);
  }

  function observe() {
    const resultArea = document.getElementById("resultArea");
    if (!resultArea || resultArea.dataset.ticketAccordionObserverV2 === "true") return;
    resultArea.dataset.ticketAccordionObserverV2 = "true";
    new MutationObserver(scheduleApply).observe(resultArea, {
      childList: true,
      subtree: true
    });
    scheduleApply();
  }

  function loadRenderer() {
    if (root.ChappyTicketAccordionRender) {
      observe();
      return;
    }
    const script = document.createElement("script");
    script.src = `js/ticket-accordion-render.js?v=${VERSION}`;
    script.async = false;
    script.addEventListener("load", observe, { once: true });
    script.addEventListener("error", () => {
      console.error("折りたたみUIを読み込めません");
    }, { once: true });
    document.head.appendChild(script);
  }

  root.ChappyTicketAccordionBootstrapV2 = Object.freeze({ observe, scheduleApply });
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadRenderer, { once: true });
  } else {
    loadRenderer();
  }
})(window);
