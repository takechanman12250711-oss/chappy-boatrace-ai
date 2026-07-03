function buildDynamicRaceEngine(boats, analysis) {
  const list = boats || [];
  const theory = latestRaceData?.prediction?.theory || latestRaceData?.theory || {};

  const exhibitionRank = [...list]
    .filter(b => num(b.exhibitionTime, 0) > 0)
    .sort((a, b) => num(a.exhibitionTime) - num(b.exhibitionTime));

  const lapRank = [...list]
    .filter(b => num(b.lapTime, 0) > 0)
    .sort((a, b) => num(a.lapTime) - num(b.lapTime));

  const rankPoint = (rank, boatNo, points) => {
    const idx = rank.findIndex(x => Number(x.boat) === Number(boatNo));
    return idx >= 0 && idx < points.length ? points[idx] : 0;
  };

  return list.map(b => {
    const no = Number(b.boat);
    let attack = 40;
    let sashi = 40;
    let nokoshi = 40;
    let tenkai = 40;
    let manshu = 35;
    const isAttack = no === Number(analysis.attackBoat);
    const isSashi = no === Number(analysis.sashiBoat);
    const isNokoshi = no === Number(analysis.nokoshiBoat);
    const isOutside = no >= 5;

    if (no === 1) nokoshi += analysis.inTrust >= 70 ? 22 : 10;
    if (no === 2) sashi += 14;
    if (no === 3) attack += 12;
    if (no === 4) attack += 10;
    if (no === 5) sashi += 10;
    if (no === 6) tenkai += 12;

    if (isAttack) attack += 15;
    if (isSashi) sashi += 15;
    if (isNokoshi) nokoshi += 12;
    if (isAttack) {
  tenkai += 15;
  manshu += 10;
}

if (isSashi) {
  tenkai += 12;
}

if (isNokoshi) {
  manshu += 8;
}

if (isOutside && isAttack) {
  manshu += 12;
}

    if (num(b.avgST, 0) > 0 && num(b.avgST) <= 0.15) {
      attack += 10;
      tenkai += 6;
    }

    if (num(b.exhibitionST, 0) > 0 && num(b.exhibitionST) <= 0.12) {
      attack += 8;
      tenkai += 5;
    }

    const exPoint = rankPoint(exhibitionRank, no, [12, 9, 6]);
    attack += exPoint;
    sashi += Math.round(exPoint / 2);

    const lapPoint = rankPoint(lapRank, no, [15, 10, 7]);
    nokoshi += lapPoint;
    tenkai += Math.round(lapPoint / 2);
    if (exPoint >= 12) {
  attack += 8;
  tenkai += 8;
  manshu += 5;
}

if (exPoint >= 9 && isSashi) {
  sashi += 8;
  tenkai += 5;
}

if (exPoint >= 9 && isAttack) {
  attack += 10;
}

    if (lapPoint >= 15) {
  nokoshi += 12;
  tenkai += 10;

  if (isAttack) attack += 8;
  if (isSashi) sashi += 8;
}

if (exPoint === 12 && lapPoint === 15) {
  attack += 12;
  sashi += 10;
  manshu += 10;
}

    if (num(b.localWinRate, 0) >= 6) {
      tenkai += 10;
      nokoshi += 6;
    }

    if (num(b.motor2Rate, 0) >= 40) {
      attack += 6;
      sashi += 6;
    }

    if (analysis.inTrust < 60 && no >= 4) {
  manshu += 18;
  tenkai += 10;
}

if (analysis.inTrust < 50 && isOutside) {
  manshu += 15;
  attack += 5;
}

if (analysis.attackScore >= 75 && isAttack) {
  attack += 12;
  tenkai += 8;
}

if (analysis.attackScore >= 75 && isOutside) {
  manshu += 10;
}

    if (no >= 5) manshu += 10;

    return {
      theory,
      boat: no,
      name: b.name || "",
      attack: clamp(attack),
      sashi: clamp(sashi),
      nokoshi: clamp(nokoshi),
      tenkai: clamp(tenkai),
      manshu: clamp(manshu)
    };
  });
}