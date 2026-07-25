// js/hiyori-learning-adoption-candidates-loader.js
// 採用候補管理を既存画面へ安全に読み込む。
(function () {
  "use strict";

  const SRC = "./js/hiyori-learning-adoption-candidates.js";

  function load() {
    if (window.ChappyHiyoriLearningAdoptionCandidates) return;
    if (document.querySelector(`script[data-chappy-src="${SRC}"]`)) return;
    const script = document.createElement("script");
    script.src = SRC;
    script.defer = true;
    script.dataset.chappySrc = SRC;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
})();