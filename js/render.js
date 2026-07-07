/* ==========================================================
   チャッピーボートレースAI
   render.js 完全版 Part1/3
   画面表示専用
========================================================== */

function safeText(value, fallback = "-"){
  if(value === null || value === undefined || value === ""){
    return fallback;
  }
  return String(value);
}

function safeNumber(value, fallback = 0){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function boatClass(num){
  return `boat-${safeNumber(num)}`;
}

function renderEmpty(message){
  return `
    <div class="empty-box">
      ${safeText(message)}
    </div>
  `;
}

function renderError(message){
  return `
    <div class="error-box">
      ${safeText(message)}
    </div>
  `;
}

function setHTML(id, html){
  const el = document.getElementById(id);
  if(!el) return;
  el.innerHTML = html;
}

function renderEntryTable(raceData){
  const entries = raceData?.entries || [];

  if(!entries.length){
    return renderEmpty("出走表データがありません");
  }

  return `
    <div class="sheet">
      <h2>🚤 出走表カード</h2>

      <div class="legend-box">
        <span>🔥 攻め指数</span>
        <span>🌊 展開指数</span>
        <span>⚡ 道中指数</span>
        <span>🏠 当地指数</span>
      </div>

      ${entries.map(racer => `
        <div class="entry-card">
          <div class="entry-header">
            <div class="boat-number ${boatClass(racer.boat)}">
              ${safeText(racer.boat)}
            </div>

            <div>
              <div class="racer-name">
                ${safeText(racer.name)}
              </div>
              <div class="racer-class">
                ${safeText(racer.class)} / ${safeText(racer.branch)}
              </div>
            </div>
          </div>

          <div class="entry-info">
            <div>年齢：${safeText(racer.age)}</div>
            <div>体重：${safeText(racer.weight)}</div>
            <div>全国勝率：${safeText(racer.nationalWinRate)}</div>
            <div>当地勝率：${safeText(racer.localWinRate)}</div>
            <div>平均ST：${safeText(racer.avgST)}</div>
            <div>モーター：${safeText(racer.motorNo)}</div>
            <div>モーター2連率：${safeText(racer.motorRate)}</div>
            <div>ボート2連率：${safeText(racer.boatRate)}</div>
          </div>

          <div class="index-tags">
            <span class="index-tag attack-tag">🔥 攻め ${safeNumber(racer.attackIndex)}</span>
            <span class="index-tag flow-tag">🌊 展開 ${safeNumber(racer.flowIndex)}</span>
            <span class="index-tag race-tag">⚡ 道中 ${safeNumber(racer.raceIndex)}</span>
            <span class="index-tag local-tag">🏠 当地 ${safeNumber(racer.localIndex)}</span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMaterialPanel(raceData){
  const weather = raceData?.weather || {};
  const race = raceData?.race || {};

  return `
    <div class="sheet">
      <h2>📊 レース基本情報</h2>

      <div class="summary-box">
        <div><strong>場：</strong>${safeText(race.place)}</div>
        <div><strong>レース：</strong>${safeText(race.raceNo)}R</div>
        <div><strong>締切：</strong>${safeText(race.deadline)}</div>
        <div><strong>グレード：</strong>${safeText(race.grade)}</div>
      </div>

      <table class="table">
        <tbody>
          <tr>
            <th>天候</th>
            <td>${safeText(weather.weather)}</td>
          </tr>
          <tr>
            <th>風向</th>
            <td>${safeText(weather.windDirection)}</td>
          </tr>
          <tr>
            <th>風速</th>
            <td>${safeText(weather.windSpeed)}</td>
          </tr>
          <tr>
            <th>波高</th>
            <td>${safeText(weather.waveHeight)}</td>
          </tr>
          <tr>
            <th>水温</th>
            <td>${safeText(weather.waterTemp)}</td>
          </tr>
          <tr>
            <th>気温</th>
            <td>${safeText(weather.airTemp)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderRaceFlow(flowData){
  const flows = flowData || [];

  if(!flows.length){
    return renderEmpty("展開予想データがありません");
  }

  return `
    <div class="sheet flow-sheet">
      <h2>🌊 展開予想</h2>

      <div class="flow-steps">
        ${flows.map((flow, index) => `
          <div class="flow-card">
            <div class="flow-title">
              展開${index + 1}：${safeText(flow.title)}
            </div>

            <div class="flow-step">
              <span class="flow-point">起点：</span>
              ${safeText(flow.trigger)}
            </div>

            <div class="flow-step">
              <span class="flow-point">展開：</span>
              ${safeText(flow.detail)}
            </div>

            <div class="flow-step">
              <span class="flow-point">有利艇：</span>
              ${safeText(flow.advantageBoats)}
            </div>

            <div class="flow-step">
              <span class="flow-point">想定買い目：</span>
              ${safeText(flow.tickets)}
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
function renderBuffs(buffs = [], debuffs = []){
  const buffHtml = buffs.length
    ? buffs.map(item => `<div class="buff">⬆️ ${safeText(item)}</div>`).join("")
    : `<div class="buff">⬆️ 強調材料なし</div>`;
  const debuffHtml = debuffs.length
    ? debuffs.map(item => `<div class="debuff">⬇️ ${safeText(item)}</div>`).join("")
    : `<div class="debuff">⬇️ 大きな不安なし</div>`;
  return `
    <div class="buff-list">
      ${buffHtml}
      ${debuffHtml}
    </div>
  `;
}
function renderMainSheet(prediction){
  const racers = prediction?.racers || [];
  if(!racers.length){
    return renderEmpty("本命シートの予想データがありません");
  }
  return `
    <div class="sheet compact-sheet">
      <h2>🎯 青シート 本命予想</h2>
      <div class="legend-box">
        <span>⬆️ プラス要因</span>
        <span>⬇️ マイナス要因</span>
        <span>🔥 攻め</span>
        <span>🌊 展開</span>
        <span>⚡ 道中</span>
        <span>🏠 当地</span>
      </div>
      ${racers.map(racer => `
        <div class="score-card ${racer.mark === "◎" ? "top" : ""}">
          <div class="score-title">
            <div>
              ${safeText(racer.mark)} ${safeText(racer.boat)}号艇　
              ${safeText(racer.name)}
            </div>
            <div class="score-badge">
              ${safeNumber(racer.score)}点
            </div>
          </div>
          <div class="score-grid">
            <div class="score-item">
              攻め
              <strong>${safeNumber(racer.attackIndex)}</strong>
            </div>
            <div class="score-item">
              展開
              <strong>${safeNumber(racer.flowIndex)}</strong>
            </div>
            <div class="score-item">
              道中
              <strong>${safeNumber(racer.raceIndex)}</strong>
            </div>
            <div class="score-item">
              当地
              <strong>${safeNumber(racer.localIndex)}</strong>
            </div>
          </div>
          ${renderBuffs(racer.buffs, racer.debuffs)}
          <div class="comment">
            ${safeText(racer.comment)}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}
function renderOdds(oddsData){
  const odds = oddsData?.topOdds || [];
  const synthetic = oddsData?.synthetic || [];
  if(!odds.length && !synthetic.length){
    return renderEmpty("オッズデータがありません");
  }
  return `
    <div class="sheet">
      <h2>💰 オッズ・合成オッズ</h2>
      ${
        odds.length
          ? `
            <h3>3連単 人気順TOP12</h3>
            <div class="odds-grid">
              ${odds.slice(0, 12).map(item => `
                <div class="odds-card">
                  <strong>${safeText(item.ticket)}</strong>
                  <span>${safeText(item.odds)}倍</span>
                </div>
              `).join("")}
            </div>
          `
          : renderEmpty("人気順オッズがありません")
      }
      ${
        synthetic.length
          ? synthetic.map(group => `
            <div class="synthetic-odds">
              <div>
                <strong>${safeText(group.name)}</strong>
              </div>
              <div>
                買い目：${(group.tickets || []).map(t => safeText(t)).join(" / ")}
              </div>
              <div>
                合成オッズ：
                <strong>${safeText(group.syntheticOdds)}倍</strong>
              </div>
            </div>
          `).join("")
          : ""
      }
    </div>
  `;
}
function renderMissing(missingData){
  const list = missingData?.list || [];
  if(!list.length){
    return renderEmpty("出てない目TOP30のデータがありません");
  }
  return `
    <div class="sheet manshu-sheet">
      <h2>💣 ピンクシート 出てない目TOP30</h2>
      <div class="legend-box">
        <span>現位オッズのみ表示</span>
        <span>日数表示なし</span>
        <span>万舟候補の拾い用</span>
      </div>
      <div class="missing-list">
        ${list.slice(0, 30).map((item, index) => `
          <div class="missing-item">
            <div class="missing-rank">
              ${index + 1}位
            </div>
            <div class="missing-number">
              ${safeText(item.ticket)}
            </div>
            <div class="missing-odds">
              ${safeText(item.odds)}倍
            </div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
function renderStats(statsData){
  const stats = statsData || {};

  return `
    <div class="sheet">
      <h2>📈 成績・回収率管理</h2>

      <table class="table">
        <tbody>
          <tr>
            <th>予想数</th>
            <td>${safeNumber(stats.totalPredictions)}回</td>
          </tr>
          <tr>
            <th>的中数</th>
            <td>${safeNumber(stats.hitCount)}回</td>
          </tr>
          <tr>
            <th>的中率</th>
            <td>${safeText(stats.hitRate)}%</td>
          </tr>
          <tr>
            <th>購入金額</th>
            <td>${safeText(stats.totalBet)}円</td>
          </tr>
          <tr>
            <th>払戻金額</th>
            <td>${safeText(stats.totalPayout)}円</td>
          </tr>
          <tr>
            <th>回収率</th>
            <td>${safeText(stats.returnRate)}%</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderTheoryPanel(theoryData){
  const theories = theoryData || [];

  if(!theories.length){
    return renderEmpty("舟券太郎理論データがありません");
  }

  return `
    <div class="sheet">
      <h2>🧠 舟券太郎理論</h2>

      ${theories.map(theory => `
        <div class="theory-card">
          <h3>${safeText(theory.name)}</h3>
          <p>${safeText(theory.detail)}</p>
          <div class="index-tags">
            <span class="index-tag attack-tag">
              評価 ${safeNumber(theory.score)}
            </span>
            <span class="index-tag flow-tag">
              対象 ${safeText(theory.target)}
            </span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderAIPanel(aiData){
  const comments = aiData?.comments || [];

  if(!comments.length){
    return renderEmpty("AIコメントがありません");
  }

  return `
    <div class="sheet">
      <h2>🤖 AI総合コメント</h2>

      ${comments.map(comment => `
        <div class="ai-card">
          ${safeText(comment)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderResultPanel(resultData){
  const result = resultData || {};

  return `
    <div class="sheet">
      <h2>🏁 結果入力・自動判定</h2>

      <div class="result-inputs">
        <input id="resultTicketInput" placeholder="結果 例：1-2-3">
        <input id="payoutInput" placeholder="払戻金 例：1250">
      </div>

      <div class="result-buttons">
        <button onclick="saveRaceResult()">結果を保存</button>
        <button onclick="clearRaceResult()">結果を消去</button>
      </div>

      <div id="autoPayoutText">
        ${safeText(result.message, "結果未入力")}
      </div>
    </div>
  `;
}

function renderLoading(targetId, message = "読み込み中..."){
  setHTML(targetId, `
    <div class="sheet loading">
      ${safeText(message)}
    </div>
  `);
}

function renderComplete(appData){
  setHTML("entryArea", renderEntryTable(appData));
  setHTML("materialArea", renderMaterialPanel(appData));
  setHTML("flowArea", renderRaceFlow(appData?.flows));
  setHTML("mainSheetArea", renderMainSheet(appData?.prediction));
  setHTML("oddsArea", renderOdds(appData?.odds));
  setHTML("missingArea", renderMissing(appData?.missing));
  setHTML("theoryArea", renderTheoryPanel(appData?.theories));
  setHTML("aiArea", renderAIPanel(appData?.ai));
  setHTML("statsArea", renderStats(appData?.stats));
  setHTML("resultArea", renderResultPanel(appData?.result));
}

function clearAllAreas(){
  const ids = [
    "entryArea",
    "materialArea",
    "flowArea",
    "mainSheetArea",
    "oddsArea",
    "missingArea",
    "theoryArea",
    "aiArea",
    "statsArea",
    "resultArea"
  ];

  ids.forEach(id => setHTML(id, ""));
}