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
/* 表示：出走表 */

function renderEntryTable(boats) {
  return `
    <div class="table">
      <table>
        <thead>
          <tr>
            <th>艇</th><th>選手</th><th>級</th><th>平均ST</th><th>全国</th><th>当地</th><th>モーター2連率 ${helpBtn("モーター2連率")}</th><th>役割</th>
          </tr>
        </thead>
        <tbody>
          ${boats.map(b => `
            <tr>
              <td><b>${b.boat}</b></td>
              <td>${b.name || "-"}</td>
              <td>${b.class || "-"}</td>
              <td>${fmtST(b.avgST)}</td>
              <td>${fmtNum(b.nationalWinRate)}</td>
              <td>${fmtNum(b.localWinRate)}</td>
              <td>${fmtPct(b.motor2Rate)}</td>
              <td>${roleName(b.boat)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

/* 表示：材料カード */

function renderMaterialPanel(venue, weather, boats, analysis) {
  return `
    <div class="summary-box">
      <h3>🌊 材料カード</h3>
      <p><b>${venue.name || "-"}</b>：${venue.courseBias || "-"}</p>
      <p>推奨展開：<b>${venue.recommendedShape || "-"}</b></p>
      <p>天候：${weather?.weather || "-"} / 風${weather?.windSpeed ?? "-"}m / 波${weather?.waveHeight ?? "-"}cm / 気温${weather?.temperature ?? "-"}℃</p>
    </div>

    <div class="sheet">
      <h3>🚤 展開分析</h3>
      <div class="race-line">
        <b>イン信頼度：${analysis.inTrust}点</b>
        <p>${inTrustText(analysis.inTrust)}</p>
      </div>
      <div class="race-line">
        <b>攻め艇：${analysis.attackBoat}号艇 ${analysis.attackName || ""}</b>
        <p>攻め期待：${analysis.attackScore}点</p>
      </div>
      <div class="race-line">
        <b>展開の流れ</b>
        <p>${analysis.shapeText}</p>
      </div>
    </div>

    <details>
      <summary>▶ モーター・展示詳細</summary>
      <div class="table">
        <table>
          <thead>
            <tr>
  <th>艇</th>
<th>全国勝率</th>
<th>当地勝率</th>
<th>モーター番号</th>
<th>モーター2連率 ${helpBtn("モーター2連率")}</th>
<th>モーター3連率 ${helpBtn("モーター3連率")}</th>
<th>展示タイム</th>
<th>展示スタート</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td>${b.boat}</td>
                <td>${fmtNum(b.nationalWinRate)}</td>
                <td>${fmtNum(b.localWinRate)}</td>
                <td>${b.motor ?? "-"}</td>
                <td>${fmtPct(b.motor2Rate)}</td>
                <td>${fmtPct(b.motor3Rate)}</td>
                <td>${fmtNum(b.exhibitionTime)}</td>
                <td>${fmtST(b.exhibitionST)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </details>
  `;
}