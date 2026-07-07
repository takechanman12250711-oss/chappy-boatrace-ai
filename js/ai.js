/* ==========================================================
   チャッピーボートレースAI
   ai.js 完全版 Part1/3
   AI総合分析エンジン
========================================================== */

function aiSafeNumber(value, fallback = 0){
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function aiAverage(values = []){
  if(!values.length) return 0;
  const sum = values.reduce((a, b) => a + aiSafeNumber(b), 0);
  return sum / values.length;
}

/* ==========================
   AI総合指数
========================== */

function calculateAIScore(racer){

  const values = [

    racer.score,
    racer.attackIndex,
    racer.flowIndex,
    racer.raceIndex,
    racer.localIndex,
    racer.motorIndex,
    racer.exhibitionIndex

  ];

  return Math.round(aiAverage(values));

}

/* ==========================
   AI評価ランク
========================== */

function getAIRank(score){

  if(score >= 90) return "SS";
  if(score >= 85) return "S";
  if(score >= 80) return "A";
  if(score >= 75) return "B";
  if(score >= 70) return "C";
  return "D";

}

/* ==========================
   AI本命コメント
========================== */

function createMainComment(racer){

  if(racer.attackIndex >= 85){

    return "スタート力が高く、主導権を握る可能性が高い。";

  }

  if(racer.flowIndex >= 85){

    return "展開を的確に拾えるタイプで、差し展開なら中心。";

  }

  if(racer.localIndex >= 85){

    return "当地実績が高く、水面適性を活かせる。";

  }

  if(racer.raceIndex >= 85){

    return "道中で順位を押し上げる力があり、連争いに期待。";

  }

  return "総合力が高く、安定した軸候補。";

}

/* ==========================
   AI穴コメント
========================== */

function createHoleComment(racer){

  if(Number(racer.boat) >= 5){

    return "外枠だが展開が向けば高配当の立役者。";

  }

  if(racer.flowIndex >= 80){

    return "差し場ができれば一気に浮上する可能性。";

  }

  return "人気以上の走りが期待できる穴候補。";

}

/* ==========================
   AI万舟コメント
========================== */

function createManshuComment(racer){

  if(Number(racer.boat) >= 4){

    return "外枠一撃で万舟演出の可能性あり。";

  }

  return "波乱展開なら高配当に絡む。";

}
/* ==========================================================
   ai.js 完全版 Part2/3
   展開AI・最終評価
========================================================== */

/* ==========================
   攻め艇抽出
========================== */

function detectAttackBoat(racers){

  return [...racers].sort(
    (a,b)=>b.attackIndex-a.attackIndex
  )[0];

}

/* ==========================
   展開艇抽出
========================== */

function detectFlowBoat(racers){

  return [...racers].sort(
    (a,b)=>b.flowIndex-a.flowIndex
  )[0];

}

/* ==========================
   道中艇抽出
========================== */

function detectRaceBoat(racers){

  return [...racers].sort(
    (a,b)=>b.raceIndex-a.raceIndex
  )[0];

}

/* ==========================
   当地巧者抽出
========================== */

function detectLocalBoat(racers){

  return [...racers].sort(
    (a,b)=>b.localIndex-a.localIndex
  )[0];

}

/* ==========================
   飛んだ時に拾う艇
========================== */

function detectPickupBoat(racers,attackBoat){

  const list=racers.filter(r=>

    r.boat!==attackBoat.boat

  );

  return list.sort((a,b)=>{

    const aa=

      a.flowIndex*0.5+

      a.raceIndex*0.3+

      a.localIndex*0.2;

    const bb=

      b.flowIndex*0.5+

      b.raceIndex*0.3+

      b.localIndex*0.2;

    return bb-aa;

  })[0];

}

/* ==========================
   AI展開シミュレーション
========================== */

function buildAISimulation(racers){

  const attack=detectAttackBoat(racers);

  const flow=detectFlowBoat(racers);

  const race=detectRaceBoat(racers);

  const local=detectLocalBoat(racers);

  const pickup=detectPickupBoat(

    racers,

    attack

  );

  return{

    attack,

    flow,

    race,

    local,

    pickup,

    steps:[

      `🔥 ${attack.boat}号艇 ${attack.name} が攻める`,

      `🌊 ${flow.boat}号艇 ${flow.name} が展開を受ける`,

      `⚡ ${race.boat}号艇 ${race.name} が道中浮上`,

      `🏠 ${local.boat}号艇 ${local.name} が残す`,

      `💣 攻め艇が崩れた場合は ${pickup.boat}号艇 ${pickup.name} が浮上`

    ]

  };

}

/* ==========================
   AI最終評価
========================== */

function buildAIEvaluation(racers){

  return racers

    .map(racer=>{

      const aiScore=

        calculateAIScore(racer);

      return{

        ...racer,

        aiScore,

        aiRank:getAIRank(aiScore),

        mainComment:createMainComment(racer),

        holeComment:createHoleComment(racer),

        manshuComment:createManshuComment(racer)

      };

    })

    .sort((a,b)=>

      b.aiScore-a.aiScore

    );

}
/* ==========================================================
   ai.js 完全版 Part3/3
   AI統合・最終コメント
========================================================== */

/* ==========================
   AI総合コメント生成
========================== */

function createAISummary(aiResult, simulation){

  const top = aiResult[0];
  const second = aiResult[1];
  const hole = aiResult.find(r => Number(r.boat) >= 4) || aiResult[2];

  return [

    `◎ 本命は ${top.boat}号艇 ${top.name}。AI総合評価 ${top.aiRank}（${top.aiScore}点）。${top.mainComment}`,

    `○ 対抗は ${second.boat}号艇 ${second.name}。展開次第で逆転まで。`,

    `▲ 穴候補は ${hole.boat}号艇 ${hole.name}。${hole.holeComment}`,

    `💣 万舟は「${simulation.pickup.boat}号艇」が展開を拾うケースを警戒。`,

    `🔥 攻め艇は ${simulation.attack.boat}号艇。`,
    `🌊 展開艇は ${simulation.flow.boat}号艇。`,
    `⚡ 道中艇は ${simulation.race.boat}号艇。`,
    `🏠 当地巧者は ${simulation.local.boat}号艇。`

  ];

}

/* ==========================
   AI最終データ生成
========================== */

function buildAIData(raceData){

  const racers = rankRacers(raceData);

  const aiResult = buildAIEvaluation(racers);

  const simulation = buildAISimulation(racers);

  const comments = createAISummary(

    aiResult,

    simulation

  );

  return{

    ranking:aiResult,

    simulation,

    comments

  };

}

/* ==========================
   AI展開テキスト
========================== */

function createFlowText(simulation){

  return simulation.steps.join("\n");

}

/* ==========================
   AI買い目評価
========================== */

function evaluateTickets(ticketData, aiData){

  const topBoat = aiData.ranking[0].boat;

  return{

    main:ticketData.main.map(ticket=>({

      ticket,

      evaluation:
        ticket.startsWith(String(topBoat))
        ? "A"
        : "B"

    })),

    safe:ticketData.safe,

    hole:ticketData.hole

  };

}

/* ==========================
   外部公開
========================== */

window.buildAIData = buildAIData;
window.createAISummary = createAISummary;
window.createFlowText = createFlowText;
window.evaluateTickets = evaluateTickets;