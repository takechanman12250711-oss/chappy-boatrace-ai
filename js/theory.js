/* ==========================================================
   チャッピーボートレースAI
   theory.js 完全版 Part1/3
   独自理論・評価エンジン
========================================================== */

function clampTheory(value, min = 0, max = 100){
  return Math.max(min, Math.min(max, Math.round(value)));
}

function createTheoryResult(){

  return {
    score:0,
    buffs:[],
    debuffs:[],
    alerts:[],
    detail:[]
  };

}

/* ==========================
   スリットアラート
========================== */

function slitAlert(entries){

  const result=[];

  entries.forEach((boat,index)=>{

    if(index===0) return;

    const left=Number(entries[index-1].exhibitionST||0);
    const current=Number(boat.exhibitionST||0);

    if(Math.abs(left-current)>=0.10){

      result.push({

        boat:boat.boat,
        type:"SLIT",
        score:15,
        message:`${boat.boat}号艇 スリット差0.10以上`

      });

    }

  });

  return result;

}

/* ==========================
   ダブルタイム理論
========================== */

function doubleTimeTheory(entries){

  if(!entries.length) return [];

  const exhibition=[...entries].sort((a,b)=>
    Number(a.exhibitionTime)-Number(b.exhibitionTime)
  );

  const lap=[...entries].sort((a,b)=>
    Number(a.lapTime)-Number(b.lapTime)
  );

  const bestExhibition=exhibition[0];
  const bestLap=lap[0];

  const result=[];

  if(bestExhibition){

    result.push({

      boat:bestExhibition.boat,
      score:12,
      type:"展示最速"

    });

  }

  if(bestLap){

    result.push({

      boat:bestLap.boat,
      score:12,
      type:"一周最速"

    });

  }

  if(
    bestExhibition &&
    bestLap &&
    bestExhibition.boat===bestLap.boat
  ){

    result.push({

      boat:bestLap.boat,
      score:25,
      type:"ダブルタイム"

    });

  }

  return result;

}

/* ==========================
   新サム理論
========================== */

function newSamTheory(entries){

  const result=[];

  entries.forEach(racer=>{

    const exhibition=Number(racer.exhibitionTime||0);

    const lap=Number(racer.lapTime||0);

    if(!exhibition||!lap) return;

    const total=exhibition+lap;

    if(total<=43.80){

      result.push({

        boat:racer.boat,
        score:20,
        type:"新サム◎"

      });

    }
    else if(total<=44.10){

      result.push({

        boat:racer.boat,
        score:10,
        type:"新サム○"

      });

    }

  });

  return result;

}

/* ==========================
   攻め艇
========================== */

function attackTheory(racer){

  let score=0;

  score+=Number(racer.attackIndex||0)*0.6;

  score+=Number(racer.exhibitionIndex||0)*0.4;

  return clampTheory(score);

}

/* ==========================
   展開艇
========================== */

function flowTheory(racer){

  let score=0;

  score+=Number(racer.flowIndex||0)*0.7;

  score+=Number(racer.localIndex||0)*0.3;

  return clampTheory(score);

}

/* ==========================
   道中艇
========================== */

function raceTheory(racer){

  let score=0;

  score+=Number(racer.raceIndex||0)*0.7;

  score+=Number(racer.localIndex||0)*0.3;

  return clampTheory(score);

}

/* ==========================
   当地巧者
========================== */

function localTheory(racer){

  let score=0;

  score+=Number(racer.localIndex||0);

  return clampTheory(score);

}
/* ==========================
   展開崩れ理論
========================== */

function collapseTheory(racers){

  const alerts=[];

  racers.forEach(racer=>{

    if(
      racer.attackIndex>=80 &&
      racer.flowIndex<=60
    ){

      alerts.push({

        boat:racer.boat,

        type:"攻め失敗",

        score:12,

        message:`${racer.boat}号艇は攻めるが残れない可能性`

      });

    }

  });

  return alerts;

}

/* ==========================
   展開拾い理論
========================== */

function pickupTheory(racers){

  const result=[];

  racers.forEach(racer=>{

    const score=

      racer.flowIndex*0.45+

      racer.raceIndex*0.35+

      racer.localIndex*0.20;

    if(score>=78){

      result.push({

        boat:racer.boat,

        score:Math.round(score),

        type:"展開拾い"

      });

    }

  });

  return result;

}

/* ==========================
   万舟アラート
========================== */

function manshuAlert(racers){

  const result=[];

  racers.forEach(racer=>{

    let score=0;

    if(Number(racer.boat)>=4) score+=18;

    score+=Math.max(0,racer.attackIndex-70);

    score+=Math.max(0,racer.flowIndex-70);

    score+=Math.max(0,racer.raceIndex-70);

    score+=Math.max(0,racer.localIndex-70);

    if(score>=35){

      result.push({

        boat:racer.boat,

        score:Math.round(score),

        type:"万舟候補"

      });

    }

  });

  return result;

}

/* ==========================
   バフ生成
========================== */

function theoryBuffs(racer){

  const buffs=[];

  if(racer.attackIndex>=80)
    buffs.push("攻め足が強い");

  if(racer.flowIndex>=80)
    buffs.push("展開を拾える");

  if(racer.raceIndex>=80)
    buffs.push("道中逆転が期待できる");

  if(racer.localIndex>=80)
    buffs.push("当地巧者");

  if(racer.motorIndex>=80)
    buffs.push("機力上位");

  if(racer.exhibitionIndex>=80)
    buffs.push("展示気配良好");

  return buffs;

}

/* ==========================
   デバフ生成
========================== */

function theoryDebuffs(racer){

  const debuffs=[];

  if(racer.attackIndex<=55)
    debuffs.push("攻め弱め");

  if(racer.flowIndex<=55)
    debuffs.push("展開待ち");

  if(racer.raceIndex<=55)
    debuffs.push("道中不安");

  if(racer.localIndex<=55)
    debuffs.push("当地実績不足");

  if(racer.motorIndex<=55)
    debuffs.push("機力劣勢");

  if(racer.exhibitionIndex<=55)
    debuffs.push("展示気配弱い");

  return debuffs;

}

/* ==========================
   風・波補正
========================== */

function weatherTheory(racer,raceData){

  const weather=raceData?.weather||{};

  const wind=Number(weather.windSpeed||0);

  const wave=Number(weather.waveHeight||0);

  let adjust=0;

  if(wind>=5){

    if(Number(racer.boat)>=4){

      adjust+=5;

    }else{

      adjust-=3;

    }

  }

  if(wave>=5){

    if(racer.localIndex>=80){

      adjust+=3;

    }

  }

  return adjust;

}

/* ==========================
   場特性補正
========================== */

function venueTheory(racer,raceData){

  const place=String(raceData?.race?.place||"");

  let adjust=0;

  switch(place){

    case "大村":

      if(Number(racer.boat)===1) adjust+=6;
      if(Number(racer.boat)===3) adjust+=3;
      break;

    case "若松":

      if(racer.localIndex>=80) adjust+=5;
      break;

    case "宮島":

      if(racer.flowIndex>=80) adjust+=4;
      break;

    case "多摩川":

      if(racer.attackIndex>=80) adjust+=4;
      break;

    default:

      break;

  }

  return adjust;

}
/* ==========================================================
   theory.js 完全版 Part3/3
   全理論統合エンジン
========================================================== */

function applyTheoryEngine(raceData, racers){

  const slit = slitAlert(racers);
  const doubleTime = doubleTimeTheory(racers);
  const newSam = newSamTheory(racers);
  const collapse = collapseTheory(racers);
  const pickup = pickupTheory(racers);
  const manshu = manshuAlert(racers);

  const theoryMap = {};

  racers.forEach(racer=>{

    theoryMap[racer.boat]={

      boat:racer.boat,

      score:0,

      buffs:[],

      debuffs:[],

      alerts:[]

    };

  });

  function addAlert(list){

    list.forEach(item=>{

      const target=theoryMap[item.boat];

      if(!target) return;

      target.score+=Number(item.score||0);

      target.alerts.push(item.type);

    });

  }

  addAlert(slit);
  addAlert(doubleTime);
  addAlert(newSam);
  addAlert(collapse);
  addAlert(pickup);
  addAlert(manshu);

  racers.forEach(racer=>{

    const target=theoryMap[racer.boat];

    const weatherAdjust=weatherTheory(racer,raceData);

    const venueAdjust=venueTheory(racer,raceData);

    target.score+=weatherAdjust;
    target.score+=venueAdjust;

    target.buffs=theoryBuffs(racer);

    target.debuffs=theoryDebuffs(racer);

    target.attackScore=attackTheory(racer);

    target.flowScore=flowTheory(racer);

    target.raceScore=raceTheory(racer);

    target.localScore=localTheory(racer);

    target.totalTheoryScore=clampTheory(

      target.score+

      target.attackScore*0.25+

      target.flowScore*0.25+

      target.raceScore*0.25+

      target.localScore*0.25

    );

  });

  return Object.values(theoryMap)

    .sort((a,b)=>b.totalTheoryScore-a.totalTheoryScore);

}

/* ==========================
   AI展開ツリー
========================== */

function buildFlowTree(racers){

  const attack=[...racers].sort((a,b)=>b.attackIndex-a.attackIndex)[0];

  const flow=[...racers].sort((a,b)=>b.flowIndex-a.flowIndex)[0];

  const race=[...racers].sort((a,b)=>b.raceIndex-a.raceIndex)[0];

  const local=[...racers].sort((a,b)=>b.localIndex-a.localIndex)[0];

  return{

    attackBoat:attack?.boat,

    flowBoat:flow?.boat,

    raceBoat:race?.boat,

    localBoat:local?.boat,

    summary:[
      `${attack?.boat}号艇が攻める`,
      `${flow?.boat}号艇が展開を拾う`,
      `${race?.boat}号艇が道中浮上`,
      `${local?.boat}号艇が連争い`
    ]

  };

}

/* ==========================
   理論統合
========================== */

function buildTheoryData(raceData, racers){

  const theoryResult=applyTheoryEngine(

    raceData,

    racers

  );

  const flowTree=buildFlowTree(racers);

  return{

    theoryResult,

    flowTree,

    alerts:theoryResult.filter(r=>r.alerts.length),

    attackBoat:flowTree.attackBoat,

    flowBoat:flowTree.flowBoat,

    raceBoat:flowTree.raceBoat,

    localBoat:flowTree.localBoat

  };

}

/* ==========================
   外部公開
========================== */

window.buildTheoryData=buildTheoryData;
window.applyTheoryEngine=applyTheoryEngine;
window.buildFlowTree=buildFlowTree;