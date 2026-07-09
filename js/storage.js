/* =========================================================
  チャッピーボートレースAI
  storage.js 完全版
  ローカル保存管理
========================================================= */

(function () {
  "use strict";

  const RESULT_KEY = "chappy_results_v1";
  const SETTING_KEY = "chappy_settings_v1";

  function loadResults() {
    try {
      const raw = localStorage.getItem(RESULT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  function saveResults(results) {
    localStorage.setItem(
      RESULT_KEY,
      JSON.stringify(results)
    );
  }

  function addResult(result) {
    const list = loadResults();
    list.unshift({
      ...result,
      savedAt: new Date().toISOString()
    });
    saveResults(list);
    return list;
  }

  function removeLatestResult() {
    const list = loadResults();
    list.shift();
    saveResults(list);
    return list;
  }

  function clearResults() {
    localStorage.removeItem(RESULT_KEY);
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTING_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(
      SETTING_KEY,
      JSON.stringify(settings)
    );
  }

  window.ChappyStorage = {
    loadResults,
    saveResults,
    addResult,
    removeLatestResult,
    clearResults,
    loadSettings,
    saveSettings
  };

})();