/* ==========================================================
   チャッピーボートレースAI
   prediction.js 完全版 Part1/3
   予想ロジック・指数計算
========================================================== */

function clamp(value, min = 0, max = 100){
  const num = Number(value);
  if(!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, num));
}

function toNumber(value, fallback = 0){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function stToScore(st){
  const v = toNumber(st, 0.18);

  if(v <= 0.11) return 95;
  if(v <= 0.13) return 88;
  if(v <= 0.15) return 78;
  if(v <= 0.17) return 66;
  if(v <= 0.19) return 54;
  return 42;
}

function winRateToScore(rate){
  const v = toNumber(rate, 0);

  if(v >= 7.5) return 94;
  if(v >= 6.8) return 86;
  if(v >= 6.0) return 78;
  if(v >= 5.2) return 66;
  if(v >= 4.5) return 55;
  return 44;
}

function motorToScore(rate){
  const v = toNumber(rate, 0);

  if(v >= 45) return 90;
  if(v >= 40) return 82;
  if(v >= 35) return 74;
  if(v >= 30) return 64;
  if(v >= 25) return 54;
  return 46;
}

function courseBaseScore(boat){
  const course = toNumber(boat);

  const base = {
    1: 92,
    2: 76,
    3: 74,
    4: 68,
    5: 58,
    6: 48
  };

  return base[course] || 50;
}

function classScore(racerClass){
  const c = String(racerClass || "").toUpperCase();

  if(c === "A1") return 90;
  if(c === "A2") return 76;
  if(c === "B1") return 58;
  if(c === "B2") return 45;
  return 55;
}

function calculateAttackIndex(racer){
  const stScore = stToScore(racer.avgST);
  const classPower = classScore(racer.class);
  const course = toNumber(racer.boat);

  let courseAttack = 60;

  if(course === 1) courseAttack = 72;
  if(course === 2) courseAttack = 66;
  if(course === 3) courseAttack = 78;
  if(course === 4) courseAttack = 74;
  if(course === 5) courseAttack = 64;
  if(course === 6) courseAttack = 55;

  return clamp(
    stScore * 0.45 +
    classPower * 0.25 +
    courseAttack * 0.30
  );
}

function calculateFlowIndex(racer){
  const course = toNumber(racer.boat);
  const local = winRateToScore(racer.localWinRate);
  const national = winRateToScore(racer.nationalWinRate);
  const motor = motorToScore(racer.motorRate);

  let courseFlow = 60;

  if(course === 1) courseFlow = 80;
  if(course === 2) courseFlow = 82;
  if(course === 3) courseFlow = 74;
  if(course === 4) courseFlow = 76;
  if(course === 5) courseFlow = 68;
  if(course === 6) courseFlow = 62;

  return clamp(
    courseFlow * 0.35 +
    local * 0.25 +
    national * 0.20 +
    motor * 0.20
  );
}

function calculateRaceIndex(racer){
  const national = winRateToScore(racer.nationalWinRate);
  const local = winRateToScore(racer.localWinRate);
  const cls = classScore(racer.class);
  const course = toNumber(racer.boat);

  let courseRace = 60;

  if(course === 1) courseRace = 72;
  if(course === 2) courseRace = 74;
  if(course === 3) courseRace = 76;
  if(course === 4) courseRace = 78;
  if(course === 5) courseRace = 76;
  if(course === 6) courseRace = 72;

  return clamp(
    national * 0.30 +
    local * 0.30 +
    cls * 0.25 +
    courseRace * 0.15
  );
}

function calculateLocalIndex(racer){
  const local = winRateToScore(racer.localWinRate);
  const national = winRateToScore(racer.nationalWinRate);
  const course = courseBaseScore(racer.boat);

  return clamp(
    local * 0.55 +
    national * 0.25 +
    course * 0.20
  );
}

function calculateMotorIndex(racer){
  const motor = motorToScore(racer.motorRate);
  const boat = motorToScore(racer.boatRate);

  return clamp(
    motor * 0.70 +
    boat * 0.30
  );
}

function calculateExhibitionIndex(racer){
  const exhibition = toNumber(racer.exhibitionTime, 6.85);
  const lap = toNumber(racer.lapTime, 37.5);

  let exhibitionScore = 60;
  let lapScore = 60;

  if(exhibition <= 6.65) exhibitionScore = 94;
  else if(exhibition <= 6.72) exhibitionScore = 86;
  else if(exhibition <= 6.80) exhibitionScore = 76;
  else if(exhibition <= 6.90) exhibitionScore = 64;
  else exhibitionScore = 52;

  if(lap <= 36.8) lapScore = 94;
  else if(lap <= 37.1) lapScore = 84;
  else if(lap <= 37.4) lapScore = 74;
  else if(lap <= 37.8) lapScore = 62;
  else lapScore = 50;

  return clamp(
    exhibitionScore * 0.50 +
    lapScore * 0.50
  );
}

function calculateConditionAdjust(racer, raceData){
  const weather = raceData?.weather || {};
  const wind = toNumber(weather.windSpeed);
  const wave = toNumber(weather.waveHeight);
  const boat = toNumber(racer.boat);

  let adjust = 0;

  if(wind >= 5){
    if(boat >= 4) adjust += 3;
    if(boat === 1) adjust -= 3;
  }

  if(wave >= 5){
    if(boat >= 5) adjust += 2;
    if(boat === 1) adjust -= 2;
  }

  return adjust;
}

function calculateRacerIndexes(racer, raceData){
  const attackIndex = calculateAttackIndex(racer);
  const flowIndex = calculateFlowIndex(racer);
  const raceIndex = calculateRaceIndex(racer);
  const localIndex = calculateLocalIndex(racer);
  const motorIndex = calculateMotorIndex(racer);
  const exhibitionIndex = calculateExhibitionIndex(racer);
  const conditionAdjust = calculateConditionAdjust(racer, raceData);

  const totalScore = clamp(
    courseBaseScore(racer.boat) * 0.18 +
    attackIndex * 0.18 +
    flowIndex * 0.16 +
    raceIndex * 0.16 +
    localIndex * 0.12 +
    motorIndex * 0.10 +
    exhibitionIndex * 0.10 +
    conditionAdjust
  );

  return {
    ...racer,
    attackIndex: Math.round(attackIndex),
    flowIndex: Math.round(flowIndex),
    raceIndex: Math.round(raceIndex),
    localIndex: Math.round(localIndex),
    motorIndex: Math.round(motorIndex),
    exhibitionIndex: Math.round(exhibitionIndex),
    score: Math.round(totalScore)
  };
}

function rankRacers(raceData){
  const entries = raceData?.entries || [];

  return entries
    .map(racer => calculateRacerIndexes(racer, raceData))
    .sort((a, b) => b.score - a.score);
}