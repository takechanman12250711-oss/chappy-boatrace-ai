// js/hiyori-proposal-approval-loader.js
// 承認管理モジュールを安全に遅延読込する。
(function () {
  "use strict";
  if (window.ChappyHiyoriProposalApproval) return;
  const script = document.createElement("script");
  script.src = "js/hiyori-proposal-approval.js";
  script.defer = true;
  script.dataset.chappyModule = "hiyori-proposal-approval";
  document.head.appendChild(script);
})();