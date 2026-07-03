// ================================
// チャッピーAI
// 表示関係
// ================================

function aiRankComment(score) {
  if (score >= 90) return "◎本命";
  if (score >= 80) return "○対抗";
  if (score >= 70) return "▲連下";
  return "☆穴";
}
function renderAiRank(aiRank = []) {
  return aiRank
    .map((x, i) => {
      const mark = aiRankComment(x.score);
      return `
        <div class="ai-rank-row">
          <b>${i + 1}位　${mark}</b><br>
          ${x.boat}号艇 ${x.name}<br>
          AI指数：<b>${x.score}点</b>
        </div>
      `;
    })
    .join("");
}
function renderTenkaiRate(tenkai) {
  return `
    <div class="race-line">
      <b>🎯 展開成立率</b>
      <p>🛶 逃げ成立率　${tenkai.escape}%</p>
      <p>⚡ 攻め成立率　${tenkai.attack}%</p>
      <p>➡️ 差し成立率　${tenkai.sashi}%</p>
      <p>🛡️ 残し成立率　${tenkai.nokoshi}%</p>
      <p>💥 波乱率　${tenkai.upset}%</p>
    </div>
  `;
}
function renderEvRank(evRank = []) {
  return `
    <div class="race-line">
      <b>💰 回収期待値</b>
      ${
        evRank.map((x, i) => `
          <div class="ai-rank-row">
            <b>${i + 1}位</b>　
            ${x.boat}号艇 ${x.name}<br>
            <span>期待値候補：AI指数とオッズ妙味で評価</span>
          </div>
        `).join("")
      }
    </div>
  `;
}