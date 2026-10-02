"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

global.window = global;
require("../js/evaluated-scenario-candidates");
require("../js/ai-core");

const aiCore = global.ChappyAICore;

function entries(courseByBoat = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;

    return {
      boat: boatNo,
      racerName: `${boatNo}号艇`,
      startExhibition: {
        course: Number(courseByBoat[boatNo] || boatNo),
        isOfficialCourse: true,
        mappingSource: "official-start-image"
      }
    };
  });
}

function analyses(roadByBoat = {}) {
  return Array.from({ length: 6 }, (_, index) => {
    const boatNo = index + 1;

    return {
      boatNo,
      playerName: `${boatNo}号艇`,
      roleScores: {
        road: Number(roadByBoat[boatNo] || 40)
      }
    };
  });
}

const reasonByType = {
  escape: {
    1: ["イン逃げ・残し"],
    2: ["2コース差し残り"],
    3: ["センター追走"],
    4: ["4コース残し"],
    5: ["展開拾い"],
    6: ["最内差し・道中拾い"]
  },
  sashi: {
    1: ["イン残し"],
    2: ["2コース差し"],
    3: ["差し展開の外側追走"],
    4: ["展開拾い"],
    5: ["展開拾い"],
    6: ["最内差し・道中拾い"]
  },
  threeAttack: {
    1: ["3攻め時のイン残し"],
    2: ["差し・内残し"],
    3: ["3コース攻め"],
    4: ["攻めを受ける"],
    5: ["3攻めに乗るまくり差し"],
    6: ["最内差し・道中拾い"]
  },
  fourAttack: {
    1: ["カド攻め時のイン残し"],
    2: ["差し残り"],
    3: ["内残し"],
    4: ["4カド攻め"],
    5: ["カド攻めに乗るまくり差し"],
    6: ["最内差し・展開拾い"]
  }
};

function scenario(
  type,
  attackerCourse,
  score,
  options = {}
) {
  const attackerBoatNo = Number(
    options.attackerBoatNo || attackerCourse
  );
  const labels = {
    escape: "1号艇逃げ",
    sashi: "2コース差し",
    threeAttack: "3コース攻め",
    fourAttack: "4カド攻め"
  };
  const rows = Array.from(
    { length: 6 },
    (_, index) => {
      const boatNo = index + 1;

      return {
        boatNo,
        reasons: [
          ...(reasonByType[type]?.[boatNo] || [])
        ]
      };
    }
  );

  return {
    type,
    label: labels[type] || type,
    score,
    attacker: attackerCourse,
    attackerCourse,
    attackerBoatNo,
    headBoatNo: attackerBoatNo,
    blockedBoats: [...(options.blockedBoats || [])],
    outcome: {
      boats: rows,
      secondCandidates:
        options.secondCandidates ||
        rows,
      thirdCandidates:
        options.thirdCandidates ||
        rows
    }
  };
}

function buildInput(
  ticket,
  mainScenario,
  scenarios,
  options = {}
) {
  return {
    formations: {
      mainEstablished:
        options.mainEstablished !== false,
      longshot: [ticket]
    },
    raceScenarios: {
      mainScenario,
      scenarios,
      roadRaceBoats: [
        ...(options.roadRaceBoats || [])
      ]
    },
    entries: options.entries || entries(),
    analyses: analyses(options.roadByBoat),
    racerSkillTheory: {
      roles: options.skillRoles || []
    }
  };
}

function roleOf(story, boatNo) {
  return story.roles.find(
    (role) => role.boatNo === boatNo
  );
}

const escape = scenario("escape", 1, 78);
const sashi = scenario("sashi", 2, 72);
const threeAttack = scenario("threeAttack", 3, 76);
const fourAttack = scenario("fourAttack", 4, 82);

const fourFiveOne = aiCore.buildLightManshuScenario(
  buildInput(
    "4-5-1",
    fourAttack,
    [fourAttack, escape, sashi, threeAttack]
  )
);

assert.ok(fourFiveOne);
assert.equal(fourFiveOne.ticket, "4-5-1");
assert.equal(fourFiveOne.title, "取れたらいいな");
assert.equal(fourFiveOne.scenarioTitle, "取れたらいいな");
assert.equal(fourFiveOne.scenarioType, "取れたらいいな");
assert.equal(fourFiveOne.trigger.scenarioType, "fourAttack");
assert.equal(fourFiveOne.trigger.attackerBoatNo, 4);
assert.equal(roleOf(fourFiveOne, 4).role, "ATTACKER");
assert.equal(roleOf(fourFiveOne, 5).role, "FOLLOWER");
assert.equal(roleOf(fourFiveOne, 1).role, "INSIDE_SURVIVOR");
assert.match(fourFiveOne.scenarioSummary, /4号艇が攻め切る/);
assert.match(fourFiveOne.scenarioSummary, /5号艇が攻めについて行/);
assert.match(fourFiveOne.scenarioSummary, /1号艇が内で残/);
assert.match(fourFiveOne.scenarioSummary, /4-5-1の攻め筋/);
assert.equal(fourFiveOne.usesOdds, false);
assert.equal(fourFiveOne.changesTicket, false);
assert.equal(
  fourFiveOne.selectionScope,
  "existing-hole-candidate"
);

const fiveOneSix = aiCore.buildLightManshuScenario(
  buildInput(
    "5-1-6",
    fourAttack,
    [fourAttack, escape, sashi, threeAttack],
    {
      roadRaceBoats: [6],
      roadByBoat: { 6: 79 },
      skillRoles: [{
        boatNo: 6,
        score: 82,
        methodLabel: "複数戦法の実績あり",
        isAdopted: true
      }]
    }
  )
);

assert.equal(fiveOneSix.trigger.scenarioType, "fourAttack");
assert.equal(roleOf(fiveOneSix, 5).role, "FOLLOWER_LEADER");
assert.equal(roleOf(fiveOneSix, 1).role, "INSIDE_SURVIVOR");
assert.equal(roleOf(fiveOneSix, 6).role, "PICKUP");
assert.equal(fiveOneSix.roadRaceAdjustment.boatNo, 6);
assert.equal(fiveOneSix.roadRaceAdjustment.position, 3);
assert.equal(fiveOneSix.roadRaceAdjustment.usesRacerSkill, true);
assert.match(fiveOneSix.scenarioSummary, /スタートから波乱/);
assert.match(fiveOneSix.scenarioSummary, /攻めに5号艇が乗って先頭/);
assert.match(fiveOneSix.scenarioSummary, /選手の実力と道中力/);
assert.match(fiveOneSix.scenarioSummary, /5-1-6の攻め筋/);

const oneFiveSix = aiCore.buildLightManshuScenario(
  buildInput(
    "1-5-6",
    fourAttack,
    [fourAttack]
  )
);

assert.ok(oneFiveSix);
assert.equal(oneFiveSix.trigger.scenarioType, "fourAttack");
assert.equal(roleOf(oneFiveSix, 1).role, "INSIDE_SURVIVOR");
assert.match(oneFiveSix.scenarioSummary, /1号艇が内で残して先頭/);
assert.match(oneFiveSix.scenarioSummary, /5号艇が攻めについて行/);

const roadSecond = aiCore.buildLightManshuScenario(
  buildInput(
    "4-2-6",
    fourAttack,
    [fourAttack],
    {
      roadRaceBoats: [2],
      roadByBoat: { 2: 65 }
    }
  )
);

assert.equal(roadSecond.roadRaceAdjustment.boatNo, 2);
assert.equal(roadSecond.roadRaceAdjustment.position, 2);
assert.match(
  roadSecond.roadRaceAdjustment.summary,
  /位置が入れ替わっても2着を取り返す/
);
assert.ok(
  roadSecond.roleChain.some(
    (step) =>
      step.phase === "FIRST_MARK" &&
      step.boatNo === 6 &&
      step.position === 3
  ),
  "道中イベントを足しても元の3着役割を消さない"
);
assert.deepEqual(
  roadSecond.roleChain.at(-1).boatNos,
  [4, 2, 6],
  "FINISHには既存穴候補の3艇をそのまま残す"
);

const belowRoadThreshold =
  aiCore.buildLightManshuScenario(
    buildInput(
      "4-2-6",
      fourAttack,
      [fourAttack],
      {
        roadRaceBoats: [2],
        roadByBoat: { 2: 64 }
      }
    )
  );

assert.equal(
  belowRoadThreshold.roadRaceAdjustment,
  null,
  "道中役割点65未満では入れ替わりを断定しない"
);

const escapeStory = aiCore.buildLightManshuScenario(
  buildInput("1-2-3", escape, [escape])
);

assert.equal(escapeStory.trigger.scenarioType, "escape");
assert.equal(roleOf(escapeStory, 1).role, "ESCAPER");
assert.notEqual(
  roleOf(escapeStory, 2).role,
  "FOLLOWER",
  "逃げ筋の2コース差し残りを攻めの追走と誤表示しない"
);
assert.equal(
  roleOf(escapeStory, 3).label,
  "逃げ筋を追走する艇"
);
assert.match(escapeStory.scenarioSummary, /先マイして逃げ切る/);
assert.match(escapeStory.scenarioSummary, /1-2-3の逃げ筋/);
assert.equal(
  aiCore.buildLightManshuScenario(
    buildInput("3-2-4", escape, [escape])
  ),
  null,
  "逃げ成功シナリオから逃げ艇着外の穴頭を説明しない"
);

const sashiStory = aiCore.buildLightManshuScenario(
  buildInput("2-1-3", sashi, [sashi])
);

assert.equal(sashiStory.trigger.scenarioType, "sashi");
assert.equal(roleOf(sashiStory, 2).role, "SASHI_ATTACKER");
assert.equal(roleOf(sashiStory, 1).role, "INSIDE_SURVIVOR");
assert.equal(roleOf(sashiStory, 3).role, "FOLLOWER");
assert.match(sashiStory.scenarioSummary, /差し切る/);
assert.match(sashiStory.scenarioSummary, /2-1-3の差し筋/);

const threeAttackStory =
  aiCore.buildLightManshuScenario(
    buildInput(
      "3-5-1",
      threeAttack,
      [threeAttack]
    )
  );

assert.equal(
  threeAttackStory.trigger.scenarioType,
  "threeAttack"
);
assert.equal(roleOf(threeAttackStory, 3).role, "ATTACKER");
assert.equal(roleOf(threeAttackStory, 5).role, "FOLLOWER");
assert.equal(roleOf(threeAttackStory, 1).role, "INSIDE_SURVIVOR");
assert.match(threeAttackStory.scenarioSummary, /3号艇が攻め切る/);
assert.match(threeAttackStory.scenarioSummary, /3-5-1の攻め筋/);

const threeAttackReduced = scenario(
  "threeAttack",
  3,
  76
);
threeAttackReduced.outcome.boats.find(
  (row) => row.boatNo === 4
).reasons = ["3攻めで攻め場減少"];
const threeImmediateInner =
  aiCore.buildLightManshuScenario(
    buildInput(
      "3-4-1",
      threeAttackReduced,
      [threeAttackReduced]
    )
  );

assert.notEqual(
  roleOf(threeImmediateInner, 4).role,
  "FOLLOWER",
  "3攻めで攻め場が減る4コースを直外というだけで追走扱いしない"
);
assert.equal(
  roleOf(threeImmediateInner, 4).role,
  "DISPLACED_RISK",
  "攻め場減少という否定根拠を肯定的な拾い役へ変換しない"
);
assert.match(
  threeImmediateInner.scenarioSummary,
  /攻め場が減るが、展開が開いた時だけ2着に残る/
);

const unsupportedThird = scenario(
  "threeAttack",
  3,
  88,
  {
    secondCandidates: [{ boatNo: 1 }],
    thirdCandidates: [{ boatNo: 5 }, { boatNo: 6 }]
  }
);
assert.equal(
  aiCore.buildLightManshuScenario(
    buildInput(
      "3-1-4",
      unsupportedThird,
      [unsupportedThird]
    )
  ),
  null,
  "選んだ展開が券の2・3着順を裏付けない時は説明だけを見送る"
);

const unsupportedHead = scenario(
  "fourAttack",
  4,
  88,
  {
    secondCandidates: [{ boatNo: 1 }],
    thirdCandidates: [{ boatNo: 6 }]
  }
);
unsupportedHead.outcome.boats.find(
  (row) => row.boatNo === 5
).reasons = [];
assert.equal(
  aiCore.buildLightManshuScenario(
    buildInput(
      "5-1-6",
      unsupportedHead,
      [unsupportedHead]
    )
  ),
  null,
  "穴頭は攻め艇・1着候補・残し／連動根拠のどれかで裏付ける"
);

const blockedOuter = scenario(
  "fourAttack",
  4,
  82,
  { blockedBoats: [5] }
);
const blockedStory = aiCore.buildLightManshuScenario(
  buildInput("4-5-1", blockedOuter, [blockedOuter])
);

assert.equal(roleOf(blockedStory, 5).role, "BLOCKED_RISK");
assert.notEqual(roleOf(blockedStory, 5).role, "FOLLOWER");
assert.match(blockedStory.scenarioSummary, /展開が開いた時だけ/);

const escapeMainFiveOneSix =
  aiCore.buildLightManshuScenario(
    buildInput(
      "5-1-6",
      escape,
      [escape, fourAttack],
      {
        roadRaceBoats: [6],
        roadByBoat: { 6: 80 },
        skillRoles: [{
          boatNo: 6,
          score: 90,
          methodLabel: "複数戦法の実績あり",
          isAdopted: true
        }]
      }
    )
  );

assert.equal(
  escapeMainFiveOneSix.trigger.scenarioType,
  "fourAttack",
  "券の2着に1号艇がいるだけで1逃げへ誤誘導しない"
);
assert.equal(
  escapeMainFiveOneSix.roadRaceAdjustment.usesRacerSkill,
  false,
  "別展開を説明する時に主展開専用の選手技量を流用しない"
);
assert.equal(
  escapeMainFiveOneSix.scenarioSummary.includes("選手の実力"),
  false
);

const officialSwappedEntries = entries({
  3: 6,
  4: 4,
  6: 3
});
const actualCourseThree = scenario(
  "threeAttack",
  3,
  84,
  { attackerBoatNo: 6 }
);
actualCourseThree.outcome.boats.find(
  row => row.boatNo === 6
).reasons = ["3コース攻め"];
const actualCourseStory =
  aiCore.buildLightManshuScenario(
    buildInput(
      "6-5-1",
      actualCourseThree,
      [actualCourseThree, fourAttack],
      { entries: officialSwappedEntries }
    )
  );

assert.equal(actualCourseStory.trigger.attackerCourse, 3);
assert.equal(actualCourseStory.trigger.attackerBoatNo, 6);
assert.equal(roleOf(actualCourseStory, 6).role, "ATTACKER");
assert.match(roleOf(actualCourseStory, 6).evidence, /3コース攻め/);

const stableInput = buildInput(
  "4-5-1",
  fourAttack,
  [fourAttack, escape]
);
const stableInputBefore = JSON.stringify(stableInput);
const stableStory = aiCore.buildLightManshuScenario(stableInput);
assert.equal(
  JSON.stringify(stableInput),
  stableInputBefore,
  "説明生成は入力オブジェクトを変更しない"
);
const noisyStory = aiCore.buildLightManshuScenario({
  ...stableInput,
  odds: {
    byTicket: {
      "4-5-1": 999.9
    }
  },
  result: {
    trifecta: "4-5-1"
  }
});

assert.deepEqual(
  noisyStory,
  stableStory,
  "オッズ・結果の有無で説明対象や筋を変えない"
);

assert.equal(
  aiCore.buildLightManshuScenario({
    ...stableInput,
    formations: {
      mainEstablished: true,
      longshot: ["4-4-1"]
    }
  }),
  null,
  "重複艇の券は説明しない"
);
assert.equal(
  aiCore.buildLightManshuScenario({
    ...stableInput,
    formations: {
      mainEstablished: true,
      longshot: ["4-5"]
    }
  }),
  null,
  "3連単でない文字列は説明しない"
);
assert.equal(
  aiCore.buildLightManshuScenario({
    ...stableInput,
    formations: {
      mainEstablished: true,
      longshot: []
    }
  }),
  null,
  "既存穴候補がなければ新しい券を作らない"
);
assert.equal(
  aiCore.buildLightManshuScenario(
    buildInput("6-2-3", escape, [escape])
  ),
  null,
  "穴頭と結び付かない展開から物語を作らない"
);
const unknownScenario = scenario("unknown", 1, 99);
assert.equal(
  aiCore.buildLightManshuScenario(
    buildInput(
      "1-2-3",
      unknownScenario,
      [unknownScenario]
    )
  ),
  null,
  "定義外の展開名を受け入れない"
);
assert.equal(
  aiCore.buildLightManshuScenario({
    ...stableInput,
    formations: {
      mainEstablished: false,
      longshot: ["4-5-1"]
    }
  }),
  null,
  "正式主展開が成立しないレースでは説明しない"
);
assert.equal(
  aiCore.buildLightManshuScenario({
    ...stableInput,
    raceScenarios: {
      scenarios: [fourAttack]
    }
  }),
  null,
  "正式主展開がないレースでは説明しない"
);

const savedInputs = JSON.parse(
  fs.readFileSync(
    path.join(
      __dirname,
      "../data/stats/local-water-v2-post-adoption-input-cache.json"
    ),
    "utf8"
  )
).races;
let savedStoryCount = 0;
let savedRiskCount = 0;

for (const savedRace of savedInputs) {
  const prediction = aiCore.buildPredictionData(
    savedRace.api
  );
  const story = prediction.lightManshuScenario;

  if (!story) continue;
  savedStoryCount += 1;

  const triggerScenario = [
    prediction.raceScenarios.mainScenario,
    ...(prediction.raceScenarios.scenarios || [])
  ].find((candidate) => {
    const attackerBoatNo = Number(
      candidate?.attackerBoatNo ??
      candidate?.headBoatNo ??
      candidate?.attacker ??
      0
    );

    return (
      candidate?.type === story.trigger.scenarioType &&
      attackerBoatNo === story.trigger.attackerBoatNo
    );
  });

  assert.ok(
    triggerScenario,
    `${savedRace.raceKey}: 説明の起点展開を再特定できる`
  );
  assert.equal(
    story.trigger.scenarioType === "escape" &&
      Number(story.ticket.split("-")[0]) !==
        story.trigger.attackerBoatNo,
    false,
    `${savedRace.raceKey}: 逃げ筋は逃げ艇を頭に固定する`
  );

  const [, secondText, thirdText] =
    story.ticket.split("-");
  const candidateSet = (key) =>
    new Set(
      (triggerScenario.outcome?.[key] || []).map(
        (row) => Number(row?.boatNo ?? row)
      )
    );

  assert.ok(
    candidateSet("secondCandidates").has(
      Number(secondText)
    ),
    `${savedRace.raceKey}: 2着艇を起点展開が裏付ける`
  );
  assert.ok(
    candidateSet("thirdCandidates").has(
      Number(thirdText)
    ),
    `${savedRace.raceKey}: 3着艇を起点展開が裏付ける`
  );

  for (const role of story.roles) {
    if (!/攻め場減少/.test(role.evidence || "")) {
      continue;
    }

    savedRiskCount += 1;
    assert.ok(
      ["BLOCKED_RISK", "DISPLACED_RISK"].includes(
        role.role
      ),
      `${savedRace.raceKey}: 否定根拠は条件付きのリスク役にする`
    );
  }
}

assert.ok(
  savedStoryCount > 0,
  "保存済み事前入力でも説明対象が残る"
);
assert.ok(
  savedRiskCount > 0,
  "保存済み事前入力で攻め場減少の表示を回帰確認する"
);

console.log("light manshu scenario tests passed");
