// js/hiyori-adoption-proposals-loader.js
// 採用候補・変更提案書を安全に読み込む。
(function () {
  "use strict";
  if (document.querySelector('script[data-hiyori-adoption-proposals]')) return;
  const script = document.createElement("script");
  script.src = "./js/hiyori-adoption-proposals.js";
  script.defer = true;
  script.dataset.hiyoriAdoptionProposals = "true";
  document.head.appendChild(script);
})();
