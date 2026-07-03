// チャッピーAI指数
// calcBoatScore
// buildChappyAIIndex
function buildChappyAIIndex(boats, analysis) {
  return (boats || []).map(b => {
    const no = Number(b.boat);
    let score = 50;

    // 選手実力
    score += num(b.nationalWinRate, 0) * 2;
    score += num(b.localWinRate, 0) * 1.5;

    // スタートタイミング
    if (num(b.avgST, 0) > 0) {
      if (num(b.avgST) <= 0.13) score += 12;
      else if (num(b.avgST) <= 0.15) score += 8;
      else if (num(b.avgST) >= 0.20) score -= 10;
    }

    // 展示
    if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) score += 8;
    if (num(b.exhibitionTime, 0) > 0 && num(b.exhibitionTime) <= 6.75) score += 8;
    if (num(b.lapTime, 0) > 0 && num(b.lapTime) <= 37.00) score += 10;

    // モーターは控えめ
    if (num(b.motor2Rate, 0) >= 40) score += 5;
    if (num(b.motor2Rate, 0) > 0 && num(b.motor2Rate) <= 25) score -= 5;

    // 展開役割
    if (no === Number(analysis.attackBoat)) score += 12;
    if (no === Number(analysis.sashiBoat)) score += 10;
    if (no === Number(analysis.nokoshiBoat)) score += 8;

    // 場別補正
    score += venueAdjust(window.currentVenue, no, "attack");
    score += venueAdjust(window.currentVenue, no, "sashi");
    score += venueAdjust(window.currentVenue, no, "nokoshi");

    // 外枠は軸評価だけ少し下げる
    if (no >= 5) score -= 3;

    return {
      boat: no,
      name: b.name || "",
      score: clamp(score)
    };
  }).sort((a, b) => b.score - a.score);
}