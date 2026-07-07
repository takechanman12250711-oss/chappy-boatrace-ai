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
function createBuffsAndDebuffs(racer){
  const buffs = [];
  const debuffs = [];

  if(racer.attackIndex >= 80){
    buffs.push(`攻め指数${racer.attackIndex}でスタート・攻撃力が高い`);
  }else if(racer.attackIndex <= 55){
    debuffs.push(`攻め指数${racer.attackIndex}で自力攻めは弱め`);
  }

  if(racer.flowIndex >= 80){
    buffs.push(`展開指数${racer.flowIndex}で差し場・展開待ちに強い`);
  }else if(racer.flowIndex <= 55){
    debuffs.push(`展開指数${racer.flowIndex}で展開を拾う力は控えめ`);
  }

  if(racer.raceIndex >= 80){
    buffs.push(`道中指数${racer.raceIndex}で2M以降の粘りが強い`);
  }else if(racer.raceIndex <= 55){
    debuffs.push(`道中指数${racer.raceIndex}で周回勝負は不安`);
  }

  if(racer.localIndex >= 80){
    buffs.push(`当地指数${racer.localIndex}で水面相性が良い`);
  }else if(racer.localIndex <= 55){
    debuffs.push(`当地指数${racer.localIndex}で当地実績は弱め`);
  }

  if(racer.motorIndex >= 80){
    buffs.push(`モーター評価${racer.motorIndex}で足色は上位`);
  }else if(racer.motorIndex <= 55){
    debuffs.push(`モーター評価${racer.motorIndex}で機力面は強調しにくい`);
  }

  if(racer.exhibitionIndex >= 80){
    buffs.push(`展示評価${racer.exhibitionIndex}で直前気配が良い`);
  }else if(racer.exhibitionIndex <= 55){
    debuffs.push(`展示評価${racer.exhibitionIndex}で直前気配は物足りない`);
  }

  return { buffs, debuffs };
}

function createRacerComment(racer){
  const boat = toNumber(racer.boat);

  if(racer.score >= 85){
    return `${boat}号艇${racer.name}は総合指数が高く、軸候補としてかなり信頼できる。攻め・展開・道中のどれかで崩れにくい形。`;
  }

  if(racer.attackIndex >= 80){
    return `${boat}号艇${racer.name}は攻め性能が高く、スリットから展開を作れるタイプ。頭まで警戒したい。`;
  }

  if(racer.flowIndex >= 80){
    return `${boat}号艇${racer.name}は展開を拾う力が高く、差し場や外の攻めに乗る形で連絡みがある。`;
  }

  if(racer.raceIndex >= 80){
    return `${boat}号艇${racer.name}は道中型。1Mで届かなくても2M以降で3着に残す力がある。`;
  }

  if(racer.localIndex >= 80){
    return `${boat}号艇${racer.name}は当地巧者。水面相性で人気以上に残す可能性がある。`;
  }

  if(boat >= 5 && racer.score >= 60){
    return `${boat}号艇${racer.name}は外枠で評価は上がりにくいが、展開が割れた時の3着候補として面白い。`;
  }

  return `${boat}号艇${racer.name}は大きな強調材料は少ないが、展開次第で押さえに入るタイプ。`;
}

function createMainPrediction(raceData){
  const ranked = rankRacers(raceData);

  const marks = ["◎", "○", "▲", "△", "☆", "注"];

  const racers = ranked.map((racer, index) => {
    const bd = createBuffsAndDebuffs(racer);

    return {
      ...racer,
      mark: marks[index] || "注",
      buffs: bd.buffs,
      debuffs: bd.debuffs,
      comment: createRacerComment(racer)
    };
  });

  return {
    racers
  };
}

function pickBoat(racers, boatNo){
  return racers.find(r => toNumber(r.boat) === toNumber(boatNo));
}

function ticket(a, b, c){
  return `${a}-${b}-${c}`;
}

function uniqueTickets(tickets){
  return [...new Set(tickets.filter(Boolean))];
}

function createMainTickets(raceData){
  const ranked = rankRacers(raceData);
  const boats = ranked.map(r => toNumber(r.boat));

  const top = boats[0];
  const second = boats[1];
  const third = boats[2];
  const fourth = boats[3];
  const fifth = boats[4];

  const one = pickBoat(ranked, 1);
  const two = pickBoat(ranked, 2);
  const three = pickBoat(ranked, 3);
  const four = pickBoat(ranked, 4);

  let main = [];
  let safe = [];
  let hole = [];

  if(one && one.score >= 76){
    main.push(
      ticket(1, second, third),
      ticket(1, third, second),
      ticket(1, second, fourth)
    );

    safe.push(
      ticket(1, 2, 3),
      ticket(1, 2, 4),
      ticket(1, 3, 2)
    );
  }else{
    main.push(
      ticket(top, second, third),
      ticket(top, third, second),
      ticket(second, top, third)
    );

    safe.push(
      ticket(1, top, second),
      ticket(top, 1, second),
      ticket(second, 1, top)
    );
  }

  if(two && two.flowIndex >= 76){
    safe.push(
      ticket(2, 1, 3),
      ticket(2, 1, 4),
      ticket(1, 2, 4)
    );
  }

  if(three && three.attackIndex >= 76){
    hole.push(
      ticket(3, 1, 2),
      ticket(3, 1, 4),
      ticket(3, 2, 1)
    );
  }

  if(four && four.attackIndex >= 74){
    hole.push(
      ticket(4, 1, 2),
      ticket(4, 1, 3),
      ticket(1, 4, 5)
    );
  }

  if(fifth){
    hole.push(
      ticket(top, fifth, second),
      ticket(top, second, fifth),
      ticket(fifth, top, second)
    );
  }

  return {
    main: uniqueTickets(main).slice(0, 6),
    safe: uniqueTickets(safe).slice(0, 8),
    hole: uniqueTickets(hole).slice(0, 10)
  };
}

function calculateManshuScore(racer){
  const boat = toNumber(racer.boat);

  let score = 0;

  if(boat >= 4) score += 18;
  if(boat >= 5) score += 12;

  score += Math.max(0, racer.attackIndex - 65) * 0.35;
  score += Math.max(0, racer.flowIndex - 65) * 0.35;
  score += Math.max(0, racer.raceIndex - 65) * 0.30;
  score += Math.max(0, racer.localIndex - 65) * 0.25;

  if(racer.score >= 65 && racer.score <= 78){
    score += 10;
  }

  if(racer.score >= 79){
    score += 4;
  }

  return Math.round(clamp(score, 0, 100));
}

function createManshuCandidates(raceData){
  const ranked = rankRacers(raceData);

  return ranked
    .map(racer => {
      const manshuScore = calculateManshuScore(racer);

      return {
        ...racer,
        manshuScore,
        comment:
          manshuScore >= 70
            ? `${racer.boat}号艇${racer.name}は万舟の起点候補。攻めか展開のどちらかで高配当を作れる。`
            : `${racer.boat}号艇${racer.name}は相手・3着穴候補。展開が割れた時に押さえたい。`
      };
    })
    .sort((a, b) => b.manshuScore - a.manshuScore);
}
/* ==========================================================
   prediction.js 完全版 Part3/3
   最終予想・フォーメーション生成
========================================================== */

function createFormation(mainTickets) {
  return {
    main: mainTickets.main || [],
    safe: mainTickets.safe || [],
    hole: mainTickets.hole || []
  };
}

function createFlowComment(ranked) {
  const attack = [...ranked]
    .sort((a, b) => b.attackIndex - a.attackIndex)[0];

  const flow = [...ranked]
    .sort((a, b) => b.flowIndex - a.flowIndex)[0];

  const race = [...ranked]
    .sort((a, b) => b.raceIndex - a.raceIndex)[0];

  const local = [...ranked]
    .sort((a, b) => b.localIndex - a.localIndex)[0];

  return [
    {
      title: "🔥 攻め艇",
      boat: attack.boat,
      name: attack.name,
      score: attack.attackIndex,
      comment: "スタートから展開を作る中心候補"
    },
    {
      title: "🌊 展開艇",
      boat: flow.boat,
      name: flow.name,
      score: flow.flowIndex,
      comment: "差し・まくり差しで展開を拾う候補"
    },
    {
      title: "⚡ 道中艇",
      boat: race.boat,
      name: race.name,
      score: race.raceIndex,
      comment: "2マーク以降で着順を上げる候補"
    },
    {
      title: "🏠 当地巧者",
      boat: local.boat,
      name: local.name,
      score: local.localIndex,
      comment: "水面実績を活かして連絡み候補"
    }
  ];
}

function createPredictionResult(raceData) {

  const ranked = rankRacers(raceData);

  const prediction = createMainPrediction(raceData);

  const tickets = createMainTickets(raceData);

  const manshu = createManshuCandidates(raceData);

  const formation = createFormation(tickets);

  const flowComments = createFlowComment(ranked);

  return {

    prediction,

    tickets,

    formation,

    manshu,

    flowComments

  };

}

function createSummary(result){

  const main = result.prediction.racers[0];

  const second = result.prediction.racers[1];

  const third = result.prediction.racers[2];

  return {

    favorite:
      `${main.boat}号艇 ${main.name}`,

    rival:
      `${second.boat}号艇 ${second.name}`,

    hole:
      `${third.boat}号艇 ${third.name}`,

    score:
      `${main.score}点`

  };

}

function buildPredictionData(raceData){

  const result = createPredictionResult(raceData);

  return {

    ...raceData,

    prediction: result.prediction,

    tickets: result.tickets,

    formation: result.formation,

    manshu: result.manshu,

    flows: result.flowComments,

    summary: createSummary(result)

  };

}

/* ==========================================================
   外部呼び出し
========================================================== */

window.buildPredictionData = buildPredictionData;
window.rankRacers = rankRacers;
window.createPredictionResult = createPredictionResult;
window.createMainPrediction = createMainPrediction;
window.createMainTickets = createMainTickets;
window.createManshuCandidates = createManshuCandidates;