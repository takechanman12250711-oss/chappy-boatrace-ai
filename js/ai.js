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
function buildTenkaiRate(boats, analysis) {
  const attackBoat = boatByNo(boats, analysis.attackBoat);
  const sashiBoat = boatByNo(boats, analysis.sashiBoat);
  const nokoshiBoat = boatByNo(boats, analysis.nokoshiBoat);
  const b1 = boatByNo(boats, 1);

  let escape = scoreInTrust(b1, {});
  let attack = 45;
  let sashi = 40;
  let upset = 25;

  if (attackBoat) {
    if (num(attackBoat.avgST, 0) > 0 && num(attackBoat.avgST) <= 0.14) attack += 15;
    if (num(attackBoat.exhibitionST, 0) > 0 && num(attackBoat.exhibitionST) <= 0.12) attack += 12;
    if (num(attackBoat.exhibitionTime, 0) > 0 && num(attackBoat.exhibitionTime) <= 6.75) attack += 8;
    if (num(attackBoat.localWinRate, 0) >= 6) attack += 6;
  }

  if (sashiBoat) {
    if (Number(sashiBoat.boat) === 2) sashi += 10;
    if (num(sashiBoat.exhibitionTime, 0) > 0 && num(sashiBoat.exhibitionTime) <= 6.75) sashi += 8;
    if (num(sashiBoat.localWinRate, 0) >= 6) sashi += 6;
  }

  if (escape < 65) upset += 15;
  if (Number(analysis.attackBoat) >= 4) upset += 10;
  if (Number(analysis.sashiBoat) >= 5) upset += 8;

  return {
    escape: clamp(escape),
    attack: clamp(attack),
    sashi: clamp(sashi),
    nokoshi: clamp(calcBoatScore(nokoshiBoat)),
    upset: clamp(upset)
  };
}