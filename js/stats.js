// =======================================
// stats.js 完全版①
// 成績保存・自動判定
// =======================================

const RESULT_KEY = "chappyResultHistory";

let currentResultStatus = "";

function autoFillOdds() {

  const result = val("#raceResultInput");
  const oddsInput = $("#oddsInput");

  if (!result || !oddsInput) {
    updateAutoPayout();
    return;
  }

  const hit = findOddsByResult(result);

  if (hit?.odds) {
    oddsInput.value = hit.odds;
  }

  updateAutoPayout();

}

function autoJudgeResult() {

  const result =
    normalizeKey(
      val("#raceResultInput")
    );

  if (!result) return;

  const tickets =
    collectPredictionTickets();

  currentResultStatus =
    tickets.includes(result)
      ? "アタリ"
      : "ハズレ";

  setStatus(

    currentResultStatus==="アタリ"

      ? "⭕ アタリ"

      : "❌ ハズレ"

  );

}

function collectPredictionTickets(){

  const p =
    latestRaceData?.prediction || {};

  return [

    p.mainFormation,
    p.safeFormation,
    p.holeFormation,
    p.manshuFormation,
    p.manshuTickets

  ]

  .filter(Array.isArray)

  .flat()

  .map(x=>

    normalizeKey(x)

  )

  .filter(Boolean);

}

function saveResult(){

  const result =
    normalizeKey(
      val("#raceResultInput")
    );

  if(!result){

    alert("結果を入力してください");

    return;

  }

  autoFillOdds();
  autoJudgeResult();

  const record={

    place:
      val("#placeSelect"),

    race:
      val("#raceSelect"),

    date:
      normalizeDate(
        val("#dateInput")
      ),

    result,

    status:
      currentResultStatus,

    bet:
      Number(
        $("#betAmountInput")?.value||0
      ),

    odds:
      Number(
        $("#oddsInput")?.value||0
      ),

    payout:
      currentResultStatus==="アタリ"

        ? Math.floor(

            Number($("#betAmountInput")?.value||0)
            *
            Number($("#oddsInput")?.value||0)

          )

        :0,

    savedAt:
      Date.now()

  };

  const history=
    loadHistory();

  history.push(record);

  saveHistory(history);

  renderStatsArea();

  updateAutoPayout();

}
// =======================================
// stats.js 完全版②
// 成績履歴・集計・払い戻し
// =======================================

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(RESULT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(
    RESULT_KEY,
    JSON.stringify(history || [])
  );
}

function undoLastResult() {
  const history = loadHistory();

  if (!history.length) {
    alert("取り消す成績がありません");
    return;
  }

  history.pop();
  saveHistory(history);

  renderStatsArea();
  alert("直前の成績を取り消しました");
}

function clearResultHistory() {
  if (!confirm("成績履歴をすべて削除しますか？")) return;

  saveHistory([]);
  renderStatsArea();
}

function updateAutoPayout() {
  const bet = Number($("#betAmountInput")?.value || 0);
  const odds = Number($("#oddsInput")?.value || 0);
  const text = $("#autoPayoutText");

  const payout = Math.floor(bet * odds);

  if (text) {
    text.textContent = `払戻金：${payout.toLocaleString()}円`;
  }
}

function findOddsByResult(result) {
  const key = normalizeKey(result);

  return (window.latestOddsList || []).find(o =>
    normalizeKey(o.key || o.result || o.number) === key
  );
}

function renderStatsArea() {
  const history = loadHistory();

  const predictions = history.length;
  const hits = history.filter(r => r.status === "アタリ").length;

  const bet = history.reduce(
    (sum, r) => sum + Number(r.bet || 0),
    0
  );

  const payout = history.reduce(
    (sum, r) => sum + Number(r.payout || 0),
    0
  );

  const hitRate = predictions
    ? ((hits / predictions) * 100).toFixed(1)
    : "0";

  const recoveryRate = bet
    ? ((payout / bet) * 100).toFixed(1)
    : "0";

  const area = $("#statsArea");
  if (!area) return;

  area.innerHTML = `
    <table class="table">
      <tr><td>予想数</td><td>${predictions}</td></tr>
      <tr><td>アタリ数</td><td>${hits}</td></tr>
      <tr><td>的中率</td><td>${hitRate}%</td></tr>
      <tr><td>購入金額</td><td>${bet.toLocaleString()}円</td></tr>
      <tr><td>払戻金額</td><td>${payout.toLocaleString()}円</td></tr>
      <tr><td>回収率</td><td>${recoveryRate}%</td></tr>
    </table>
  `;
}

window.saveResult = saveResult;
window.saveSimpleResult = saveResult;
window.undoLastResult = undoLastResult;
window.clearResultHistory = clearResultHistory;
window.renderStatsArea = renderStatsArea;
window.autoFillOdds = autoFillOdds;
window.autoJudgeResult = autoJudgeResult;
window.updateAutoPayout = updateAutoPayout;

// =======================================
// stats.js 完了
// =======================================