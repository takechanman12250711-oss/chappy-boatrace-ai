// engine.js
// チャッピー展開AIエンジン v3.0

function chappyEngineVersion() {
  return "engine v3.0";
}

function chappyAnalyzeRaceEngine(boats, p, venue) {
  const shape = p?.raceShape || {};
  const b1 = chappyBoatByNo(boats, 1);

  const inTrust = chappyScoreInTrust(b1, venue);
  const attack = chappyPickAttackBoat(boats, shape.attackBoat);
  const attackType = chappyJudgeAttackType(attack.boat, boats, venue, b1);

  const sashiBoat = attack.boat === 3 || attack.boat === 4 ? 5 : 2;
  const nokoshiBoat = attack.boat === 3 ? 4 : 2;

  const probability = chappyBuildProbability({
    inTrust,
    attackBoat: attack.boat,
    attackScore: attack.score,
    attackType
  });

  return {
    inTrust,
    attackBoat: attack.boat,
    attackName: attack.name,
    attackScore: attack.score,
    attackType,
    sashiBoat,
    nokoshiBoat,
    probability,
    shapeText:
      shape.shape ||
      `${attack.boat}号艇${attackType} → ${sashiBoat}号艇差し場 → ${nokoshiBoat}号艇残し`
  };
}

function chappyBuildProbability(x) {
  const trust = Number(x.inTrust || 60);
  const attackScore = Number(x.attackScore || 60);
  const type = x.attackType || "まくり差し";

  let escape = trust;
  let sashi = 20;
  let makuri = 15;
  let makuriSashi = 15;
  let upset = 100 - trust;

  if (type === "差し") {
    sashi += 15;
    escape -= 5;
  }

  if (type === "まくり") {
    makuri += 20;
    escape -= 12;
    upset += 10;
  }

  if (type === "まくり差し") {
    makuriSashi += 18;
    sashi += 6;
    escape -= 6;
  }

  if (attackScore >= 75) {
    makuri += 5;
    makuriSashi += 5;
    upset += 5;
  }

  return {
    escape: chappyClamp(escape),
    sashi: chappyClamp(sashi),
    makuri: chappyClamp(makuri),
    makuriSashi: chappyClamp(makuriSashi),
    upset: chappyClamp(upset)
  };
}

function chappyScoreInTrust(b, venue) {
  let s = 55 + chappyNum(venue?.inPower, 0);
  if (!b) return chappyClamp(s);

  if (chappyNum(b.avgST, 0) > 0 && chappyNum(b.avgST) <= 0.14) s += 10;
  if (chappyNum(b.avgST, 0) >= 0.20) s -= 12;
  if (chappyNum(b.localWinRate, 0) >= 6) s += 8;
  if (chappyNum(b.nationalWinRate, 0) >= 6) s += 6;
  if (chappyNum(b.motor2Rate, 0) >= 40) s += 5;
  if (chappyNum(b.motor2Rate, 0) > 0 && chappyNum(b.motor2Rate) < 25) s -= 5;

  return chappyClamp(s);
}

function chappyPickAttackBoat(boats, forced) {
  if (forced) {
    const b = chappyBoatByNo(boats, forced);
    return { boat: Number(forced), name: b?.name || "", score: 75 };
  }

  let best = null;
  let bestScore = -999;

  (boats || [])
    .filter(b => Number(b.boat) >= 2 && Number(b.boat) <= 5)
    .forEach(b => {
      let s = 45;
      const no = Number(b.boat);

      if (chappyNum(b.avgST, 0) > 0 && chappyNum(b.avgST) <= 0.14) s += 12;
      if (chappyNum(b.exhibitionST, 0) > 0 && chappyNum(b.exhibitionST) <= 0.12) s += 10;
      if (chappyNum(b.exhibitionTime, 0) > 0 && chappyNum(b.exhibitionTime) <= 6.75) s += 8;
      if (chappyNum(b.localWinRate, 0) >= 6) s += 8;
      if (chappyNum(b.motor2Rate, 0) >= 40) s += 6;

      if (no === 3) s += 8;
      if (no === 4) s += 6;

      if (s > bestScore) {
        bestScore = s;
        best = b;
      }
    });

  return {
    boat: Number(best?.boat || 3),
    name: best?.name || "",
    score: chappyClamp(bestScore)
  };
}

function chappyJudgeAttackType(boat, boats, venue, b1) {
  const b = chappyBoatByNo(boats, boat);
  if (!b) return "攻め";

  const st = Number(b.avgST || 0.18);
  const inTrust = chappyScoreInTrust(b1, venue);

  if (boat === 2) return "差し";

  if (boat === 3) {
    if (st <= 0.14 && inTrust < 75) return "まくり";
    return "まくり差し";
  }

  if (boat === 4) {
    if (st <= 0.14) return "まくり差し";
    return "差し";
  }

  if (boat >= 5) return "展開待ち";

  return "逃げ";
}

function chappyBoatByNo(boats, no) {
  return (boats || []).find(b => Number(b.boat) === Number(no)) || null;
}

function chappyNum(v, fb = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
}

function chappyClamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}