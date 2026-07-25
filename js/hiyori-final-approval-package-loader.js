// js/hiyori-final-approval-package-loader.js
// 最終承認パッケージを安全に読み込む。予想ロジックには接続しない。
(function () {
  "use strict";
  if (window.ChappyHiyoriFinalApprovalPackage) return;
  const script = document.createElement("script");
  script.src = "js/hiyori-final-approval-package.js";
  script.async = false;
  script.dataset.chappyModule = "hiyori-final-approval-package";
  document.head.appendChild(script);
})();