// js/script.js
// 強制診断版

document.addEventListener("DOMContentLoaded", () => {
  const box = document.createElement("div");
  box.id = "debugBox";
  box.style.cssText = `
    margin:16px;
    padding:16px;
    background:#111;
    color:#0f0;
    font-size:14px;
    border-radius:12px;
    white-space:pre-wrap;
    z-index:99999;
    position:relative;
  `;
  document.body.prepend(box);

  log("✅ script.js 読み込みOK");

  log(`ChappyAPI: ${typeof window.ChappyAPI}`);
  log(`renderEntryTable: ${typeof window.renderEntryTable}`);
  log(`renderMaterialPanel: ${typeof window.renderMaterialPanel}`);

  const button = document.querySelector("button");
  log(`button: ${button ? "あり" : "なし"}`);

  if (!button) return;

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    log("✅ ボタン押された");

    try {
      const raceData = await window.ChappyAPI.fetchRace({
        jcd: "24",
        rno: "1",
        date: "20260707"
      });

      log(`✅ API成功 entries=${raceData.entries.length}`);

      const test = document.createElement("div");
      test.style.cssText = `
        margin:16px;
        padding:16px;
        background:white;
        color:#111;
        border-radius:12px;
        font-size:18px;
      `;

      test.innerHTML = `
        <h2>🚤 出走表テスト表示</h2>
        ${raceData.entries.map(e => `
          <div style="padding:10px;border-bottom:1px solid #ddd;">
            ${e.boatNo}号艇 ${e.racerName} / ${e.className} / ST ${e.avgST}
          </div>
        `).join("")}
      `;

      document.body.prepend(test);

    } catch (err) {
      log(`❌ エラー: ${err.message}`);
    }
  });

  function log(msg) {
    box.textContent += msg + "\n";
  }
});