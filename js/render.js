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
function renderRaceFlow(analysis) {
  if (!analysis) {
    return `<div class="sheet">展開分析データなし</div>`;
  }

  const attack = analysis.attackBoat || "-";
  const sashi = analysis.sashiBoat || "-";
  const nokoshi = analysis.nokoshiBoat || "-";
  const trust = analysis.inTrust || 0;
  const type = analysis.attackType || "展開不明";
  const tenkai = analysis.tenkaiRate || {};

  return `
    <div class="sheet">
      <h3>🚤 展開分析</h3>

      <p><b>イン信頼度：</b>${trust}点</p>
      <p>${trust >= 70 ? "イン中心。" : "普通。攻め艇次第で穴も見る。"}</p>

      <p><b>攻め艇：</b>${attack}号艇</p>
      <p><b>差し候補：</b>${sashi}号艇</p>
      <p><b>残し候補：</b>${nokoshi}号艇</p>

      <h4>展開の流れ</h4>
      <p>${type}</p>

      <ul>
        <li>攻め期待：${tenkai.attack || 0}%</li>
        <li>差し期待：${tenkai.sashi || 0}%</li>
        <li>残し期待：${tenkai.nokoshi || 0}%</li>
        <li>波乱率：${tenkai.upset || 0}%</li>
      </ul>
    </div>
  `;
}

window.renderRaceFlow = renderRaceFlow;
function renderEntryTable(boats = []) {
  if (!boats.length) {
    return `<div class="sheet">出走表データなし</div>`;
  }

  return `
    <div class="sheet">
      <h3>🚤 出走表一覧</h3>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>級</th>
              <th>支部</th>
              <th>平均ST</th>
              <th>全国勝率</th>
              <th>当地勝率</th>
              <th>モーター</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => `
              <tr>
                <td>${b.boat || "-"}</td>
                <td>${b.name || "-"}</td>
                <td>${b.class || b.grade || "-"}</td>
                <td>${b.branch || "-"}</td>
                <td>${fmtST(b.avgST)}</td>
                <td>${fmtNum(b.nationalWinRate)}</td>
                <td>${fmtNum(b.localWinRate)}</td>
                <td>${b.motor || "-"}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.renderEntryTable = renderEntryTable;
function renderMaterialPanel(venue = {}, weather = {}, boats = []) {

  const place = venue.place || venue.name || "-";
  const trend = venue.trend || venue.waterType || "-";

  const wind = weather.wind ?? "-";
  const wave = weather.wave ?? "-";
  const temp = weather.temperature ?? weather.temp ?? "-";

  return `
<div class="sheet">

<h3>🌊 水面・モーター情報</h3>

<h4>🌊 材料カード</h4>

<p><b>${place}</b>：${trend}</p>

<p>
推奨展開：
${venue.recommend || "1逃げ＋2差し＋3攻め"}
</p>

<p>
天候：
${weather.weather || "-"}
／風${wind}m
／波${wave}cm
／気温${temp}℃
</p>

<details>

<summary>▶▶ モーター・展示詳細</summary>

<div class="table">

<table>

<thead>

<tr>
<th>艇</th>
<th>全国勝率</th>
<th>当地勝率</th>
<th>モーター</th>
<th>2連率</th>
<th>3連率</th>
<th>展示</th>
<th>ST</th>
</tr>

</thead>

<tbody>

${boats.map(b=>`

<tr>

<td>${b.boat}</td>

<td>${fmtNum(b.nationalWinRate)}</td>

<td>${fmtNum(b.localWinRate)}</td>

<td>${b.motor || "-"}</td>

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

</div>
`;

}

window.renderMaterialPanel = renderMaterialPanel;
function renderMainSheet(boats = [], p = {}, analysis = {}) {
  if (!boats.length) {
    return `<div class="sheet blue-sheet">青シートデータなし</div>`;
  }

  const aiRank = analysis.aiRank || [];
  const tenkai = analysis.tenkaiRate || {};

  return `
    <div class="sheet blue-sheet">
      <h3>🎯 青シート</h3>

      <div class="summary-box">
        <b>本命・軸判断</b>
        <p>イン信頼度：${analysis.inTrust || 0}点</p>
        <p>攻め艇：${analysis.attackBoat || "-"}号艇</p>
        <p>差し候補：${analysis.sashiBoat || "-"}号艇</p>
        <p>残し候補：${analysis.nokoshiBoat || "-"}号艇</p>
      </div>

      <h4>🚤 展開指数</h4>
      <ul>
        <li>攻め：${tenkai.attack || 0}%</li>
        <li>差し：${tenkai.sashi || 0}%</li>
        <li>残し：${tenkai.nokoshi || 0}%</li>
        <li>波乱：${tenkai.upset || 0}%</li>
      </ul>

      <h4>🏆 AIランクTOP6</h4>
      ${renderAiRank(aiRank)}

      <h4>📋 各艇評価</h4>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th>
              <th>選手</th>
              <th>AI</th>
              <th>ST</th>
              <th>展示</th>
              <th>一言</th>
            </tr>
          </thead>
          <tbody>
            ${boats.map(b => {
              const rank = aiRank.find(x => Number(x.boat) === Number(b.boat));
              return `
                <tr>
                  <td>${b.boat || "-"}</td>
                  <td>${b.name || "-"}</td>
                  <td>${rank?.score ?? "-"}</td>
                  <td>${fmtST(b.avgST || b.exhibitionST)}</td>
                  <td>${fmtNum(b.exhibitionTime)}</td>
                  <td>${rank?.comment || "AI指数と展開で評価"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.renderMainSheet = renderMainSheet;
function renderOdds(odds = []) {
  if (!Array.isArray(odds) || !odds.length) {
    return `<div class="sheet">オッズデータなし</div>`;
  }

  const top = [...odds]
    .map(o => ({
      key: o.key || o.result || o.number || "-",
      odds: Number(o.odds || 0)
    }))
    .filter(o => o.key !== "-" && o.odds > 0)
    .sort((a, b) => a.odds - b.odds)
    .slice(0, 12);

  return `
    <div class="sheet">
      <h3>💰 オッズTOP12</h3>
      <div class="odds-list">
        ${top.map((o, i) => `
          <div class="odds-row">
            <b>${i + 1}位</b>
            <span>${o.key}</span>
            <span>${o.odds.toFixed(1)}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

window.renderOdds = renderOdds;
function renderOdds(odds = []) {
  const list = Array.isArray(odds) ? odds : [];

  if (!list.length) {
    return `
      <div class="sheet">
        <h3>💰 オッズTOP12</h3>
        <p>オッズデータなし</p>
      </div>
    `;
  }

  const top = [...list]
    .filter(o => Number(o.odds) > 0)
    .sort((a, b) => Number(a.odds) - Number(b.odds))
    .slice(0, 12);

  return `
    <div class="sheet">
      <h3>💰 オッズTOP12</h3>

      <div class="table">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>買い目</th>
              <th>オッズ</th>
            </tr>
          </thead>
          <tbody>
            ${top.map((o, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${o.key || o.result || o.number || "-"}</td>
                <td>${Number(o.odds).toFixed(1)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.renderOdds = renderOdds;
function renderMissing(missing = [], odds = []) {
  const list = Array.isArray(missing) ? missing : [];
  const oddsMap = new Map(
    (Array.isArray(odds) ? odds : []).map(o => [
      String(o.key || o.result || o.number || "").replaceAll("-", ""),
      Number(o.odds || 0)
    ])
  );

  if (!list.length) {
    return `
      <div class="sheet pink-sheet">
        <h3>💣 出てない目TOP30</h3>
        <p>出てない目データなし</p>
      </div>
    `;
  }

  return `
    <div class="sheet pink-sheet">
      <h3>💣 出てない目TOP30</h3>
      <p>日数なし・現位オッズのみ</p>

      <div class="table">
        <table>
          <thead>
            <tr>
              <th>順位</th>
              <th>出目</th>
              <th>オッズ</th>
            </tr>
          </thead>
          <tbody>
            ${list.slice(0, 30).map((m, i) => {
              const rawKey = m.key || m.result || m.number || "";
              const key = String(rawKey).replaceAll("-", "");
              const oddsValue = Number(m.odds || oddsMap.get(key) || 0);

              return `
                <tr>
                  <td>${m.rank || i + 1}</td>
                  <td>${key || "-"}</td>
                  <td>${oddsValue ? oddsValue.toFixed(1) : "-"}</td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

window.renderMissing = renderMissing;
function renderStats(history = []) {
  const list = Array.isArray(history) ? history : [];

  const total = list.length;
  const hit = list.filter(x => x.hit === true || x.result === "hit").length;
  const bet = list.reduce((sum, x) => sum + Number(x.bet || 0), 0);
  const pay = list.reduce((sum, x) => sum + Number(x.pay || x.payout || 0), 0);

  const hitRate = total ? ((hit / total) * 100).toFixed(1) : "0.0";
  const recovery = bet ? ((pay / bet) * 100).toFixed(1) : "0.0";

  return `
    <div class="sheet">
      <h3>📊 成績管理</h3>
      <p>予想数：${total}</p>
      <p>的中数：${hit}</p>
      <p>的中率：${hitRate}%</p>
      <p>購入金額：${bet}円</p>
      <p>払戻金額：${pay}円</p>
      <p>回収率：${recovery}%</p>
    </div>
  `;
}

window.renderStats = renderStats;