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