// ================================
// render.js 完全版
// 画面表示専用
// ================================

function renderRaceFlow(analysis = {}) {
  const attack = analysis.attackBoat || "-";
  const sashi = analysis.sashiBoat || "-";
  const nokoshi = analysis.nokoshiBoat || "-";
  const trust = analysis.inTrust ?? 0;
  const aiRank = analysis.chappyIndex || [];
  const tenkai = analysis.tenkaiRate || {};
  const evRank = analysis.expectedValue || [];

  const trustLabel =
    trust >= 80 ? "イン信頼高め" :
    trust >= 60 ? "標準・展開次第" :
    "イン不安・波乱警戒";

  const waveLevel =
    trust >= 80 ? "★★☆☆☆" :
    trust >= 60 ? "★★★☆☆" :
    "★★★★☆";

  return `
    <div class="sheet flow-sheet">
      <div class="summary-box">
        <b>🌊 展開予想カード</b>
        <p><b>イン信頼度：</b>${trust}点 / ${trustLabel}</p>
        <p><b>波乱度：</b>${waveLevel}</p>
        <p><b>攻めパターン：</b>${analysis.attackType || "展開待ち"}</p>
      </div>

      <div class="race-line">
        <b>🔥 攻め艇</b>
        <p>${attack}号艇：${judgeAttackComment(analysis.attackType, attack, sashi, nokoshi)}</p>
      </div>

      <div class="race-line">
        <b>🌊 差し場</b>
        <p>${sashi}号艇：攻めが入った時に差し場を拾う候補。</p>
      </div>

      <div class="race-line">
        <b>⚡ 残し艇</b>
        <p>${nokoshi}号艇：攻められても2・3着に残す候補。</p>
      </div>

      <div class="race-line">
        <b>🎯 展開シミュレーション</b>
        <p>${buildSimulation(analysis, "main")}</p>
      </div>

      <div class="race-line">
        <b>🤖 チャッピー人工知能指数</b>
        ${renderAiRank(aiRank)}
      </div>

      ${renderTenkaiRate(tenkai)}
      ${renderTenkaiIndex(analysis.attackRanking || [])}
      ${renderEvRank(evRank)}
    </div>
  `;
}

function renderEntryTable(boats = []) {
  return `
    <div class="sheet">
      <h3>🚤 出走表一覧</h3>
      <div class="table">
        <table>
          <thead>
            <tr>
              <th>艇</th><th>選手</th><th>級</th><th>平均ST</th>
              <th>全国</th><th>当地</th><th>モーター</th><th>役割</th>
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
                <td>${b.motor || "-"}</td>
                <td>${roleName(b.boat)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderMaterialPanel(venue = {}, weather = {}, boats = []) {
  return `
    <div class="sheet">
      <h3>🌊 水面・モーター情報</h3>

      <div class="summary-box">
        <p><b>${venue.name || "-"}</b>：${venue.courseBias || "-"}</p>
        <p>推奨展開：${venue.recommendedShape || "1逃げ＋2差し＋3攻め"}</p>
        <p>天候：${weather.weather || "-"} / 風${weather.windSpeed ?? "-"}m / 波${weather.waveHeight ?? "-"}cm / 気温${weather.temperature ?? "-"}℃</p>
      </div>

      <details>
        <summary>▶ モーター・展示詳細</summary>
        <div class="table">
          <table>
            <thead>
              <tr>
                <th>艇</th><th>全国</th><th>当地</th><th>モーター</th>
                <th>M2</th><th>M3</th><th>展示</th><th>展示ST</th>
              </tr>
            </thead>
            <tbody>
              ${boats.map(b => `
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

function renderMainSheet(boats = [], p = {}, analysis = {}) {
  const marks = p.marks || {};
  const picks = [
    ["◎", "本命", marks.honmei],
    ["○", "対抗", marks.taikou],
    ["▲", "穴", marks.ana],
    ["△", "押さえ", marks.osae || marks.osaE]
  ];

  return `
    <div class="sheet compact-sheet blue-sheet">
      <h3>🎯 青シート</h3>
      ${picks.map(([mark, label, m]) => {
        if (!m) return "";
        const b = boatByNo(boats, m.boat) || m;
        return `
          <div class="race-line main-card">
            <b>${mark} ${label}：${b.boat || m.boat}号艇 ${b.name || ""}</b>
            <p><b>総合：</b>${b.totalScore ?? m.totalScore ?? calcBoatScore(b)}点</p>
            <p><b>理由：</b>${buildPickReason(b, label, analysis)}</p>
            <p>⬆️ ${buildBuffs(b).join(" / ") || "大きな加点なし"}</p>
            <p>⬇️ ${buildDebuffs(b).join(" / ") || "大きな減点なし"}</p>
          </div>
        `;
      }).join("") || `<div class="summary-box">本命データなし</div>`}
    </div>
  `;
}

function renderManshuSheet(boats = [], p = {}, analysis = {}) {
  const targets = pickManshuTargets(boats, analysis);

  return `
    <div class="sheet manshu-sheet pink-sheet">
      <h3>💣 万舟シート</h3>

      <div class="summary-box">
        <b>💣 万舟になる条件</b>
        <p>・${analysis.attackBoat || "-"}号艇が攻める展開</p>
        <p>・${analysis.sashiBoat || "-"}号艇に差し場</p>
        <p>・${analysis.nokoshiBoat || "-"}号艇が残すと配当がズレる</p>
      </div>

      <h4>💣 万舟注目艇</h4>
      ${targets.map(b => `
        <div class="race-line">
          <b>${b.boat}号艇 ${b.name || ""}</b>
          <p><b>万舟指数：</b>${b.manshuScore}点</p>
          <p><b>材料：</b>${simpleReasons(b)}</p>
          <p>${manshuReason(b)}</p>
        </div>
      `).join("") || `<div class="summary-box">万舟候補なし</div>`}
    </div>
  `;
}

function renderOdds(odds = []) {
  window.latestOddsList = Array.isArray(odds) ? odds : [];

  if (!window.latestOddsList.length) {
    return `<div class="summary-box">オッズ未取得</div>`;
  }

  return `
    <div class="sheet odds-card">
      <h3>💰 オッズTOP12</h3>
      <div class="odds-grid">
        ${window.latestOddsList.slice(0, 12).map((o, i) => `
          <div class="odds-pill">
            <b>${i + 1}. ${showKey(o.key || o.result || o.number)}</b>
            <span>${o.odds}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderMissing(missing = [], odds = []) {
  const list = Array.isArray(missing) ? missing : [];

  if (!list.length) {
    return `<div class="summary-box">出てない目TOP30取得なし</div>`;
  }

  return `
    <div class="sheet missing-card pink-sheet">
      <h3>📊 出てない目TOP30</h3>
      <div class="odds-grid">
        ${list.slice(0, 30).map((x, i) => `
          <div class="odds-pill">
            <b>${x.rank || i + 1}. ${showKey(x.key || x.result || x.number)}</b>
            <span>${x.odds || "-"}倍</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderAlerts(p = {}) {
  const raw = [
    ...(p.slitAlert || []),
    ...(p.doubleTimeAlert || []),
    ...(p.newSumAlert || [])
  ];

  if (!raw.length) {
    return `<div class="summary-box">🚨 理論アラートなし</div>`;
  }

  return `
    <div class="sheet">
      <h3>🚨 舟券太郎 理論アラート</h3>
      ${raw.map(a => `
        <div class="race-line">
          <b>${a.boat ? `${a.boat}号艇 ` : ""}${a.type || "アラート"}</b>
          <p>${a.reason || ""}${a.sum ? ` / 合計 ${a.sum}` : ""}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderFinalComment(p = {}, venue = {}, weather = {}, analysis = {}) {
  return `
    <div class="summary-box">
      <h3>📝 最終コメント</h3>
      <p>${p.raceComment || "材料・展開・舟券を分けて判断する。"}</p>
      <p><b>展開：</b>${analysis.shapeText || "-"}</p>
      <p><b>場：</b>${venue.courseBias || "-"} / <b>水面：</b>${weather.weather || "-"} 風${weather.windSpeed ?? "-"}m 波${weather.waveHeight ?? "-"}cm</p>
    </div>
  `;
}

function renderAiRank(list = []) {
  if (!list.length) return `<p>AI指数なし</p>`;
  return list.slice(0, 6).map(x => `
    <p>${x.boat}号艇 ${x.name || ""}：${x.score}点</p>
  `).join("");
}

function renderTenkaiRate(t = {}) {
  return `
    <div class="race-line">
      <b>📈 展開率</b>
      <p>逃げ:${t.escape || 0}% / 攻め:${t.attack || 0}% / 差し:${t.sashi || 0}% / 残し:${t.nokoshi || 0}% / 波乱:${t.upset || 0}%</p>
    </div>
  `;
}

function renderEvRank(list = []) {
  if (!list.length) return "";
  return `
    <div class="race-line">
      <b>💰 回収期待値</b>
      ${list.slice(0, 6).map(x => `<p>${x.boat}号艇 ${x.name || ""}：EV ${x.ev}</p>`).join("")}
    </div>
  `;
}

function renderTenkaiIndex(list = []) {
  if (!list.length) return "";
  return `
    <div class="race-line">
      <b>📊 展開指数</b>
      ${list.map(x => `
        <p>${x.boat}号艇 ${x.name || ""}<br>攻め:${x.attack || x.score || 0}</p>
      `).join("")}
    </div>
  `;
}

function buildPickReason(b, label, analysis) {
  const no = Number(b.boat);
  if (label === "本命") return "展開の中心。材料とイン信頼度を見て軸候補。";
  if (no === Number(analysis.attackBoat)) return `${no}号艇が攻め役。展開を作る可能性が高い。`;
  if (no === Number(analysis.sashiBoat)) return `${no}号艇は差し場候補。攻めが入った時に浮上。`;
  if (no === Number(analysis.nokoshiBoat)) return `${no}号艇は残し候補。2・3着で重要。`;
  if (label === "穴") return "展開が崩れた時の高配当候補。";
  return "本線の取りこぼしを拾う押さえ候補。";
}

function judgeAttackComment(type, attack, sashi, nokoshi) {
  if (type === "まくり") return `${attack}号艇が全速で攻める展開。${nokoshi}号艇の残しと、${sashi}号艇の差し場を重視。`;
  if (type === "まくり差し") return `${attack}号艇がまくり差しで差し場を狙う展開。内残りと外の連動を両方見る。`;
  if (type === "差し") return `${attack}号艇の差し展開。イン残りを見ながら、2着・3着の残しを重視。`;
  return `${attack}号艇が展開を作る想定。${sashi}号艇が差し場、${nokoshi}号艇が残し候補。`;
}

function calcBoatScore(b = {}) {
  let s = 50;
  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.14) s += 10;
  if (num(b.localWinRate, 0) >= 6) s += 6;
  if (num(b.nationalWinRate, 0) >= 6) s += 8;
  if (num(b.motor2Rate, 0) >= 40) s += 5;
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) s += 8;
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) s += 8;
  return clamp(s);
}

function buildBuffs(b = {}) {
  const r = [];
  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) r.push("平均ST◎");
  if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) r.push("展示ST◎");
  if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) r.push("展示タイム◎");
  if (num(b.localWinRate, 0) >= 6) r.push("当地勝率◎");
  if (num(b.nationalWinRate, 0) >= 6) r.push("全国勝率◎");
  if (num(b.motor2Rate, 0) >= 40) r.push("モーター◎");
  return r;
}

function buildDebuffs(b = {}) {
  const r = [];
  if (num(b.avgST, 0) >= 0.20) r.push("ST遅め");
  if (num(b.localWinRate, 0) > 0 && num(b.localWinRate) < 4) r.push("当地弱め");
  if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate) < 25) r.push("モーター弱め");
  return r;
}

function simpleReasons(b = {}) {
  const r = [];
  if (num(b.nationalWinRate, 0) > 0) r.push(`全国${fmtNum(b.nationalWinRate)}`);
  if (num(b.localWinRate, 0) > 0) r.push(`当地${fmtNum(b.localWinRate)}`);
  if (num(b.avgST, 0) > 0) r.push(`平均ST${fmtST(b.avgST)}`);
  if (num(b.motor2Rate, 0) > 0) r.push(`M2 ${fmtPct(b.motor2Rate)}`);
  if (num(b.exhibitionTime, 0) > 0) r.push(`展示${fmtNum(b.exhibitionTime)}`);
  return r.join(" / ") || "データ不足";
}

function roleName(boat) {
  const n = Number(boat);
  if (n === 1) return "逃げ軸";
  if (n === 2) return "差し候補";
  if (n === 3) return "攻め候補";
  if (n === 4) return "カド攻め・残し";
  if (n === 5) return "差し場待ち";
  if (n === 6) return "展開待ち";
  return "-";
}

function manshuReason(b = {}) {
  const n = Number(b.boat);
  if (n === 3) return "3が攻めると人気筋が崩れる。";
  if (n === 4) return "4残しで本線からズレると高配当。";
  if (n === 5) return "差し場が開くと配当が跳ねる。";
  if (n === 6) return "展開待ちだが3着拾いで高配当。";
  return "展開ズレの候補。";
}

function pickManshuTargets(boats = [], analysis = {}) {
  return boats
    .filter(b => Number(b.boat) >= 3)
    .map(b => ({ ...b, manshuScore: calcManshuScore(b, analysis) }))
    .sort((a, b) => b.manshuScore - a.manshuScore)
    .slice(0, 3);
}

function calcManshuScore(b = {}, analysis = {}) {
  let s = 40;
  const no = Number(b.boat);
  if (no === 4 && Number(analysis.attackBoat) === 3) s += 18;
  if (no === 5 && [3, 4].includes(Number(analysis.attackBoat))) s += 22;
  if (no === 6 && Number(analysis.inTrust || 0) < 65) s += 12;
  if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) s += 8;
  if (num(b.localWinRate, 0) >= 6) s += 8;
  return clamp(s);
}

// グローバル登録
window.renderRaceFlow = renderRaceFlow;
window.renderEntryTable = renderEntryTable;
window.renderMaterialPanel = renderMaterialPanel;
window.renderMainSheet = renderMainSheet;
window.renderManshuSheet = renderManshuSheet;
window.renderOdds = renderOdds;
window.renderMissing = renderMissing;
window.renderAlerts = renderAlerts;
window.renderFinalComment = renderFinalComment;