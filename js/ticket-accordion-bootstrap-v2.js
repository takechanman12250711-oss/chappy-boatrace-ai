/*
  緊急復旧用：折りたたみUIの自動読込を停止する。
  AI予想の通常描画を優先し、予想ロジックには触れない。
*/
(function (root) {
  "use strict";
  if (root.ChappyTicketAccordionBootstrapV2) return;

  root.ChappyTicketAccordionBootstrapV2 = Object.freeze({
    disabled: true,
    reason: "prediction runtime recovery"
  });
})(window);
