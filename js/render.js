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
    .map((x, i) => `
      <p>
        ${i + 1}位　
        ${x.boat}号艇 ${x.name}
        <b>${x.score}点</b>
        (${aiRankComment(x.score)})
      </p>
    `)
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