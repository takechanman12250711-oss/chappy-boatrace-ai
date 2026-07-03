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