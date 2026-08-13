"use strict";

const assert =
  require("node:assert/strict");

global.window = global;
const selector =
  require("../js/practical-selection");
const noteGenerator =
  require("../js/note-generator");

const MAIN = [
  "1-4-3",
  "1-2-3",
  "1-3-2"
];
const COVER = [
  "2-1-3",
  "2-1-4"
];
const FLOW = [
  "1-3-5",
  "1-3-6"
];
const HOLE = "5-2-3";

function target(boatNo) {
  return {
    id: `target:${boatNo}`,
    boatNo,
    symbol: "△",
    roleIntents: [
      "head",
      "alternate-head",
      "hold",
      "pickup"
    ],
    eligiblePositions: [1, 2, 3],
    candidateTickets: []
  };
}

const TARGETS =
  [1, 2, 3, 4, 5, 6]
    .map(target);

function roleRow(
  boatNo,
  role,
  score = 80
) {
  return {
    boatNo,
    course: boatNo,
    score,
    reason:
      `${boatNo}号艇の${role}根拠`,
    qualificationSource:
      `fixture.${role}`
  };
}

function baseRaceFlow() {
  const attackBoats = [
    roleRow(1, "attack", 92),
    roleRow(4, "attack", 88),
    roleRow(5, "attack", 84),
    roleRow(6, "attack", 82)
  ];
  const holdBoats = [
    roleRow(1, "hold", 79),
    roleRow(2, "hold", 81),
    roleRow(3, "hold", 78),
    roleRow(4, "hold", 80),
    roleRow(5, "hold", 76),
    roleRow(6, "hold", 75)
  ];
  const pickupBoats = [
    roleRow(2, "pickup", 77),
    roleRow(3, "pickup", 82),
    roleRow(4, "pickup", 79),
    roleRow(5, "pickup", 78),
    roleRow(6, "pickup", 76)
  ];

  return {
    attackBoats,
    holdBoats,
    pickupBoats,
    phases: {
      start: {
        leader: attackBoats[0]
      },
      firstMark: {
        mainAttack: attackBoats[0],
        secondAttack: attackBoats[1],
        mainHold: holdBoats[3]
      },
      back: {
        leader: attackBoats[0],
        hold: holdBoats[3],
        pickup: pickupBoats[2]
      },
      secondMark: {
        mainHold: holdBoats[3],
        mainPickup: pickupBoats[2],
        secondPickup:
          pickupBoats[3]
      },
      goal: {
        expectedOrder: [
          { boatNo: 1 },
          { boatNo: 4 },
          { boatNo: 3 }
        ]
      }
    }
  };
}

function evaluations() {
  return [1, 2, 3, 4, 5, 6]
    .map(boatNo => ({
      boatNo,
      course: boatNo,
      score: 80,
      attack: 80,
      hold: 80,
      pickup: 80,
      reason:
        `${boatNo}号艇の構造化評価`
    }));
}

function evidenceCheck(
  key,
  boatNo,
  role,
  score = 80,
  required = true
) {
  return {
    key,
    label: key,
    matched: true,
    required,
    source: `fixture.${key}`,
    boatNo:
      boatNo || null,
    role,
    score
  };
}

function canonicalBranch({
  id,
  ticket,
  group,
  roleBoatNo,
  position,
  role = "hold",
  priorityScore = 80,
  provenanceOnly = false,
  attackerBoatNo = 1,
  scenarioId =
    `canonical:${attackerBoatNo}`,
  summary
}) {
  const targetId =
    `target:${roleBoatNo}`;

  return {
    id,
    kind:
      "canonical-formation",
    type: `${group}-ticket`,
    source:
      `base-formation:${group}`,
    scenarioId,
    qualified: true,
    purchaseEligible: false,
    qualificationSource:
      `base-formation:${group}`,
    requirementId: "",
    auditRequirementId: "",
    headBoatNo:
      Number(ticket.split("-")[0]),
    attackerBoatNo,
    ticket,
    sourceEvaluationIds:
      provenanceOnly
        ? []
        : [targetId],
    roles:
      provenanceOnly
        ? []
        : [{
            evaluationId: targetId,
            boatNo: roleBoatNo,
            role,
            eligiblePositions: [
              position
            ]
          }],
    priorityScore:
      provenanceOnly
        ? 0
        : priorityScore,
    reason:
      summary ||
      `${ticket}の${group}役割根拠`,
    title:
      `${ticket}の${group}候補`,
    summary:
      summary ||
      `${ticket}の${group}限定説明`,
    evidenceChecks: [
      evidenceCheck(
        "base-formation-membership",
        provenanceOnly
          ? 0
          : roleBoatNo,
        provenanceOnly
          ? ""
          : role,
        provenanceOnly
          ? 0
          : priorityScore
      )
    ],
    phaseEvidence: {
      kind: "base-formation",
      mainHeadBoatNo: 1,
      primaryAttackerBoatNo: 1,
      goalOrder: [],
      exactGoalOrder: false
    },
    exactGoalOrder: false
  };
}

function holdBranch({
  id,
  ticket,
  targetBoatNo = 4,
  targetPosition,
  partnerBoatNo,
  partnerType = "pickup",
  priorityScore = 80,
  purchaseEligible = true,
  withPhaseEvidence = true
}) {
  const position =
    targetPosition ||
    ticket.split("-")
      .map(Number)
      .indexOf(targetBoatNo) + 1;
  const partnerRole =
    partnerType === "pickup"
      ? "pickup"
      : "hold";
  const partnerScore = 78;

  return {
    id,
    kind:
      "independent-scenario",
    type:
      "hold-continuation",
    source:
      "race-flow-phase-continuation",
    qualified: true,
    purchaseEligible,
    qualificationSource:
      "raceFlow.phases+raceFlow.holdBoats",
    requirement: true,
    purchaseRequired: false,
    requirementId:
      `audit:${id}`,
    auditRequirementId:
      `audit:${id}`,
    headBoatNo:
      Number(ticket.split("-")[0]),
    attackerBoatNo: 1,
    ticket,
    sourceEvaluationIds: [
      `target:${targetBoatNo}`
    ],
    roles: [{
      evaluationId:
        `target:${targetBoatNo}`,
      boatNo: targetBoatNo,
      role: "hold",
      eligiblePositions: [
        position
      ]
    }],
    priorityScore,
    reason:
      `${ticket}の時系列残し根拠`,
    title:
      `${ticket}の独立残し`,
    summary:
      `${ticket}は4段階とpartnerが一致。`,
    evidenceChecks: [
      evidenceCheck(
        "main-head",
        1,
        "head",
        92
      ),
      evidenceCheck(
        "main-attacker",
        1,
        "attack",
        92
      ),
      evidenceCheck(
        "first-mark-hold",
        targetBoatNo,
        "hold",
        priorityScore
      ),
      evidenceCheck(
        "back-hold",
        targetBoatNo,
        "hold",
        priorityScore
      ),
      evidenceCheck(
        "second-mark-hold",
        targetBoatNo,
        "hold",
        priorityScore
      ),
      evidenceCheck(
        `partner-${partnerType}`,
        partnerBoatNo,
        partnerRole,
        partnerScore
      ),
      evidenceCheck(
        "exact-goal-order",
        0,
        "goal",
        0,
        false
      )
    ],
    phaseEvidence:
      withPhaseEvidence
        ? {
            kind:
              "hold-continuation",
            mainHeadBoatNo: 1,
            primaryAttackerBoatNo: 1,
            target:
              roleRow(
                targetBoatNo,
                "hold",
                priorityScore
              ),
            chronology: {
              firstMark:
                roleRow(
                  targetBoatNo,
                  "hold",
                  priorityScore
                ),
              back:
                roleRow(
                  targetBoatNo,
                  "hold",
                  priorityScore
                ),
              secondMark:
                roleRow(
                  targetBoatNo,
                  "hold",
                  priorityScore
                )
            },
            partner: {
              type: partnerType,
              evidence:
                roleRow(
                  partnerBoatNo,
                  partnerRole,
                  partnerScore
                )
            },
            goalOrder: [1, 4, 3],
            exactGoalOrder:
              ticket === "1-4-3"
          }
        : null,
    exactGoalOrder:
      ticket === "1-4-3"
  };
}

function alternateHeadBranch({
  id,
  ticket,
  priorityScore,
  purchaseEligible = true
}) {
  const [
    attacker,
    second,
    third
  ] = ticket.split("-").map(Number);

  return {
    id,
    kind:
      "independent-scenario",
    type:
      "alternate-head-attack",
    source:
      "race-flow-attack-scenario",
    qualified: true,
    purchaseEligible,
    qualificationSource:
      "raceFlow.attackBoats",
    requirement: true,
    purchaseRequired: false,
    requirementId:
      `audit:${id}`,
    auditRequirementId:
      `audit:${id}`,
    headBoatNo: attacker,
    attackerBoatNo: attacker,
    ticket,
    sourceEvaluationIds: [
      `target:${attacker}`
    ],
    roles: [{
      evaluationId:
        `target:${attacker}`,
      boatNo: attacker,
      role:
        "alternate-head",
      eligiblePositions: [1]
    }],
    priorityScore,
    reason:
      `${ticket}の正式攻め根拠`,
    title:
      `${ticket}の別攻め`,
    summary:
      `${ticket}は正式attackBoats由来。`,
    evidenceChecks: [
      evidenceCheck(
        "alternate-head-attack",
        attacker,
        "alternate-head",
        priorityScore
      ),
      evidenceCheck(
        "second-partner-hold",
        second,
        "hold",
        78
      ),
      evidenceCheck(
        "third-partner",
        third,
        "pickup",
        77
      ),
      evidenceCheck(
        "exact-goal-order",
        0,
        "goal",
        0,
        false
      )
    ],
    phaseEvidence: {
      kind: "alternate-head",
      mainHeadBoatNo: 1,
      primaryAttackerBoatNo: 1,
      alternateAttackerBoatNo:
        attacker,
      attack:
        roleRow(
          attacker,
          "attack",
          priorityScore
        ),
      partners: {
        second:
          roleRow(
            second,
            "hold",
            78
          ),
        third:
          roleRow(
            third,
            "pickup",
            77
          )
      },
      goalOrder: [1, 4, 3],
      exactGoalOrder: false
    },
    exactGoalOrder: false
  };
}

function presentation(
  group,
  branchOrBranches,
  summary
) {
  const branches =
    Array.isArray(branchOrBranches)
      ? branchOrBranches
      : [branchOrBranches];
  const branchIds =
    branches.map(branch => branch.id);

  return {
    source:
      `base-formation:${group}`,
    branchIds,
    supportingIndependentBranchIds:
      [],
    title:
      `${group}限定タイトル`,
    summary:
      summary ||
      `${group}限定コメント`,
    structuredEvidence: {
      source:
        `base-formation:${group}`,
      branchIds
    }
  };
}

function candidate(
  branch,
  overrides = {}
) {
  return {
    ticket: branch.ticket,
    category: "展開候補",
    branchIds: [branch.id],
    allBranchIds: [branch.id],
    independentBranchIds:
      branch.kind ===
        "independent-scenario"
        ? [branch.id]
        : [],
    supportingIndependentBranchIds:
      branch.kind ===
        "independent-scenario"
        ? [branch.id]
        : [],
    physicalCoverage: [{
      evaluationId:
        branch.sourceEvaluationIds?.[0],
      boatNo:
        branch.roles?.[0]?.boatNo,
      position:
        branch.roles?.[0]
          ?.eligiblePositions?.[0]
    }],
    priorityScore:
      branch.priorityScore,
    scenarioSummary:
      branch.summary,
    comment:
      branch.summary,
    ...overrides
  };
}

function createFixture({
  flow = false,
  longshot = false,
  flowProvenanceOnly = false,
  holeProvenanceOnly = false,
  independent = [],
  additionalBranches = [],
  possibilityExtras = [],
  categoryMismatch = false,
  flowTickets = FLOW,
  flowScenarioIds = {},
  flowSecondPriorityBoatNos = [3],
  mainSummary =
    "main category scoped summary",
  raceFlow = baseRaceFlow()
} = {}) {
  const branches = [];
  const makeGroupRows = (
    tickets,
    group,
    provenanceOnly = false
  ) =>
    tickets.map((ticket, index) => {
      const boats =
        ticket.split("-").map(Number);
      const roleDefinitions =
        group === "flow"
          ? [
              {
                boatNo: boats[0],
                position: 1,
                role: "head"
              },
              {
                boatNo: boats[1],
                position: 2,
                role: "hold"
              }
            ]
          : [{
              boatNo: boats[0],
              position: 1,
              role:
                boats[0] === 1
                  ? "head"
                  : "alternate-head"
            }];
      const ticketBranches =
        roleDefinitions.map(
          (definition) =>
            canonicalBranch({
              id:
                `${group}:${ticket}:` +
                `${definition.position}`,
              ticket,
              group:
                categoryMismatch &&
                group === "cover"
                  ? "main"
                  : group,
              roleBoatNo:
                provenanceOnly
                  ? 0
                  : definition.boatNo,
              position:
                definition.position,
              role: definition.role,
              priorityScore:
                80 - index,
              provenanceOnly,
              scenarioId:
                flowScenarioIds[ticket] ||
                "canonical:1",
              summary:
                group === "main"
                  ? mainSummary
                  : `${group}:${ticket}`
            })
        );

      branches.push(...ticketBranches);
      return {
        ticket,
        allBranchIds:
          ticketBranches.map(
            branch => branch.id
          ),
        presentationByGroup: {
          [group]:
            presentation(
              group,
              ticketBranches,
              group === "main"
                ? mainSummary
                : `${group} scoped ${ticket}`
            )
        }
      };
    });
  const mainRows =
    makeGroupRows(MAIN, "main");
  const coverRows =
    makeGroupRows(COVER, "cover");
  const flowRows =
    makeGroupRows(
      flowTickets,
      "flow",
      flowProvenanceOnly
    );
  const holeRows =
    makeGroupRows(
      [HOLE],
      "hole",
      holeProvenanceOnly
    );

  branches.push(
    ...independent,
    ...additionalBranches
  );

  return {
    raceFlow,
    boatEvaluation: {
      evaluations:
        evaluations(),
      honmei: {
        boatNo: 1
      }
    },
    aiCore: {
      formations: {
        mainEstablished: true,
        flowFormations: [{
          headBoatNo: 1,
          secondPriorityBoatNos:
            flowSecondPriorityBoatNos,
          label: "1号艇の逃げ"
        }],
        evidence: {
          flow,
          longshot,
          primaryAttackerBoatNo: 1,
          evaluatedTargets:
            TARGETS,
          branches
        }
      }
    },
    mainSheet: {
      honmei: {
        boatNo: 1
      },
      evaluations:
        evaluations(),
      tickets: mainRows,
      coverTickets: coverRows,
      flowTickets: flowRows
    },
    manshuSheet: {
      tickets: holeRows
    },
    ticketSheets: {
      possibility: [
        ...independent.map(
          branch =>
            candidate(branch)
        ),
        ...possibilityExtras
      ]
    }
  };
}

const standard =
  selector.select(createFixture());
assert.equal(
  standard.status,
  "selected"
);
assert.deepEqual(
  standard.tickets.map(
    row => row.ticket
  ),
  [...MAIN, ...COVER],
  "基本5点はmain3＋cover2だけで確定する"
);
assert.deepEqual(
  standard.tickets.map(
    row => row.category
  ),
  [
    "本線",
    "本線",
    "本線",
    "押さえ",
    "押さえ"
  ]
);
assert.equal(
  standard.tickets[0].comment,
  "main category scoped summary",
  "category scoped summaryをglobal bestで上書きしない"
);
assert.ok(
  standard.tickets.every(
    row =>
      Array.isArray(
        row.roleLabels
      ) &&
      row.roleLabels.length >= 3
  ),
  "各購入買い目へ艇・着順・役割ラベルを付ける"
);
assert.deepEqual(
  standard.expansionSummary,
  {
    normalCount: 5,
    addedCount: 0,
    finalCount: 5,
    hasIndependentAdditions: false,
    exceededNormalMaximum: false,
    addedTickets: [],
    reason:
      "購入可能な独立展開がないため、通常枠の点数を維持。"
  },
  "通常5点では拡張理由を作らない"
);

const priorityGateHoleBranch =
  canonicalBranch({
    id:
      "formation:hole:1-5-6:evaluation:ana:6:3",
    ticket: "1-5-6",
    group: "hole",
    roleBoatNo: 6,
    position: 3,
    role: "pickup",
    priorityScore: 92
  });
const priorityGateSelection =
  selector.select(
    createFixture({
      additionalBranches: [
        priorityGateHoleBranch
      ],
      possibilityExtras: [
        candidate(
          priorityGateHoleBranch
        )
      ]
    })
  );
const priorityGateAudit =
  priorityGateSelection
    .expansionSummary
    .priorityGateReplacement;
assert.deepEqual(
  priorityGateSelection.tickets
    .map(row => row.ticket),
  [
    ...MAIN,
    COVER[0],
    "1-5-6"
  ],
  "上位10位内・CandidateOnly・1頭・formation:holeだけを最弱1券と置換する"
);
assert.equal(
  priorityGateSelection.tickets.length,
  standard.tickets.length,
  "順位ゲート置換で点数と賭金を増やさない"
);
assert.ok(
  priorityGateSelection.tickets
    .some(row =>
      row.ticket === "1-5-6" &&
      row.selectionTier ===
        "順位ゲート置換" &&
      row.priorityGateReplacement ===
        true &&
      row.priorityGateRank <= 10 &&
      row.priorityGateSourceBranch ===
        "formation:hole"
    ),
  "置換券へ採用条件を構造化保存する"
);
assert.ok(
  priorityGateAudit &&
  priorityGateAudit.applied === true &&
  priorityGateAudit.addedTicket ===
    "1-5-6" &&
  priorityGateAudit.removedTicket ===
    COVER[1] &&
  priorityGateAudit.addedPriorityScore >
    priorityGateAudit.removedPriorityScore,
  "置換元・置換先・順位・priority差を監査保存する"
);
assert.ok(
  priorityGateSelection
    .candidateDecisions
    .some(row =>
      row.ticket === "1-5-6" &&
      row.selected === true &&
      row.reasonCode ===
        "PRIORITY_GATE_HOLE_PROMOTED"
    ) &&
  priorityGateSelection
    .candidateDecisions
    .some(row =>
      row.ticket === COVER[1] &&
      row.selected === false &&
      row.reasonCode ===
        "PRIORITY_GATE_REPLACED"
    ),
  "候補と置換元の採否をcandidateDecisionsへ残す"
);
assert.ok(
  priorityGateSelection
    .candidateOutcomes
    .some(row =>
      row.ticket === "1-5-6" &&
      row.selected === true &&
      row.reasonCode ===
        "PRIORITY_GATE_HOLE_PROMOTED"
    ) &&
  priorityGateSelection
    .candidateOutcomes
    .some(row =>
      row.ticket === COVER[1] &&
      row.selected === false &&
      row.reasonCode ===
        "PRIORITY_GATE_REPLACED"
    ),
  "置換先と置換元をcandidateOutcomesにも同じ採否で残す"
);
assert.equal(
  priorityGateSelection
    .verificationEvidence
    .generation
    .ticketPolicyVersion,
  "practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5",
  "置換導入後の収集世代をpolicy versionで識別する"
);
const priorityGateWithFlow =
  selector.select(
    createFixture({
      flow: true,
      additionalBranches: [
        priorityGateHoleBranch
      ],
      possibilityExtras: [
        candidate(
          priorityGateHoleBranch
        )
      ]
    })
  );
assert.deepEqual(
  priorityGateWithFlow.tickets
    .filter(row =>
      row.category === "流し"
    )
    .map(row => row.ticket),
  FLOW,
  "順位ゲート置換でもフォーメーション由来の2券を崩さない"
);

const wrongHeadHoleBranch =
  canonicalBranch({
    id:
      "formation:hole:2-5-6:evaluation:ana:6:3",
    ticket: "2-5-6",
    group: "hole",
    roleBoatNo: 6,
    position: 3,
    role: "pickup",
    priorityScore: 99
  });
const wrongHeadSelection =
  selector.select(
    createFixture({
      additionalBranches: [
        wrongHeadHoleBranch
      ],
      possibilityExtras: [
        candidate(
          wrongHeadHoleBranch
        )
      ]
    })
  );
assert.ok(
  !wrongHeadSelection.tickets
    .some(row =>
      row.ticket === "2-5-6"
    ) &&
  !wrongHeadSelection
    .expansionSummary
    .priorityGateReplacement,
  "2〜6号艇頭を順位ゲート置換へ広げない"
);

const weakPriorityHoleBranch =
  canonicalBranch({
    id:
      "formation:hole:1-5-4:evaluation:ana:4:3",
    ticket: "1-5-4",
    group: "hole",
    roleBoatNo: 4,
    position: 3,
    role: "pickup",
    priorityScore: 79
  });
const weakPrioritySelection =
  selector.select(
    createFixture({
      additionalBranches: [
        weakPriorityHoleBranch
      ],
      possibilityExtras: [
        candidate(
          weakPriorityHoleBranch
        )
      ]
    })
  );
assert.ok(
  !weakPrioritySelection.tickets
    .some(row =>
      row.ticket === "1-5-4"
    ) &&
  !weakPrioritySelection
    .expansionSummary
    .priorityGateReplacement,
  "選択済み最弱券と同点以下なら置換しない"
);

const mainFirstBranch =
  canonicalBranch({
    id:
      "formation:main:1-6-5:evaluation:honmei:1:1",
    ticket: "1-6-5",
    group: "main",
    roleBoatNo: 1,
    position: 1,
    role: "head",
    priorityScore: 92
  });
const holeSecondBranch =
  canonicalBranch({
    id:
      "formation:hole:1-6-5:evaluation:ana:5:3",
    ticket: "1-6-5",
    group: "hole",
    roleBoatNo: 5,
    position: 3,
    role: "pickup",
    priorityScore: 92
  });
const mainFirstSelection =
  selector.select(
    createFixture({
      additionalBranches: [
        mainFirstBranch,
        holeSecondBranch
      ],
      possibilityExtras: [
        candidate(
          mainFirstBranch,
          {
            branchIds: [
              mainFirstBranch.id,
              holeSecondBranch.id
            ],
            allBranchIds: [
              mainFirstBranch.id,
              holeSecondBranch.id
            ]
          }
        )
      ]
    })
  );
assert.ok(
  !mainFirstSelection.tickets
    .some(row =>
      row.ticket === "1-6-5"
    ) &&
  !mainFirstSelection
    .expansionSummary
    .priorityGateReplacement,
  "後続にhole枝があっても最初のformation枝がholeでなければ採用しない"
);

const noPurchaseHoleBranch = {
  ...canonicalBranch({
    id:
      "formation:hole:1-5-2:provenance",
    ticket: "1-5-2",
    group: "hole",
    roleBoatNo: 2,
    position: 3,
    role: "pickup",
    priorityScore: 92
  }),
  sourceEvaluationIds: [],
  roles: []
};
const noPurchaseHoleSelection =
  selector.select(
    createFixture({
      additionalBranches: [
        noPurchaseHoleBranch
      ],
      possibilityExtras: [
        candidate(
          noPurchaseHoleBranch
        )
      ]
    })
  );
assert.ok(
  noPurchaseHoleSelection
    .candidateOutcomes
    .some(row =>
      row.ticket === "1-5-2" &&
      row.reasonCode ===
        "NO_PURCHASE_ELIGIBLE_BRANCH"
    ) &&
  !noPurchaseHoleSelection.tickets
    .some(row =>
      row.ticket === "1-5-2"
    ),
  "購入可能枝なしをCandidateOnly例外へ混ぜない"
);

const rankBlockTickets = [
  "1-3-4",
  "1-3-5",
  "1-3-6",
  "1-4-2",
  "1-4-5",
  "1-4-6",
  "1-5-2",
  "1-5-3",
  "1-5-4",
  "1-5-6"
];
const rankBlockBranches =
  rankBlockTickets.map(
    (ticket, index) =>
      canonicalBranch({
        id:
          `formation:main:${ticket}:evaluation:ana:` +
          `${ticket.split("-")[2]}:3`,
        ticket,
        group: "main",
        roleBoatNo:
          Number(
            ticket.split("-")[2]
          ),
        position: 3,
        role: "pickup",
        priorityScore: 110 - index
      })
  );
const rankElevenHoleBranch =
  canonicalBranch({
    id:
      "formation:hole:1-6-4:evaluation:ana:4:3",
    ticket: "1-6-4",
    group: "hole",
    roleBoatNo: 4,
    position: 3,
    role: "pickup",
    priorityScore: 92
  });
const rankElevenSelection =
  selector.select(
    createFixture({
      additionalBranches: [
        ...rankBlockBranches,
        rankElevenHoleBranch
      ],
      possibilityExtras: [
        ...rankBlockBranches.map(
          branch => candidate(branch)
        ),
        candidate(rankElevenHoleBranch)
      ]
    })
  );
assert.ok(
  !rankElevenSelection.tickets
    .some(row =>
      row.ticket === "1-6-4"
    ) &&
  !rankElevenSelection
    .expansionSummary
    .priorityGateReplacement,
  "priority順位11位以下を置換対象へ入れない"
);

const normal =
  selector.select(
    createFixture({
      flow: true,
      longshot: true
    })
  );
assert.equal(normal.tickets.length, 7);
assert.deepEqual(
  normal.tickets
    .slice(5)
    .map(row => row.ticket),
  FLOW,
  "同一展開・同一軸の3連単2券をフォーメーション由来として原子的に選ぶ"
);
assert.ok(
  normal.tickets
    .slice(5)
    .every(row =>
      row.category === "流し" &&
      row.displayCategory ===
        "フォーメーション" &&
      row.flowAnchor === "1-3" &&
      row.scenarioId ===
        "canonical:1" &&
      row.flowCommonReason ===
        normal.tickets[5]
          .flowCommonReason &&
      row.flowThirdScore >= 65 &&
      row.flowRoleEvidence.length === 2 &&
      row.roleLabels.some(role =>
        role.position === 3 &&
        role.role === "pickup" &&
        role.structured === true
      ) &&
      row.scenarioSummary.includes(
        `${row.ticket.split("-")[2]}号艇の3着拾い`
      )
    ),
  "フォーメーション由来の2券へ共通軸・同一scenario・3着別の正式根拠を保存する"
);
assert.ok(
  !normal.tickets.some(
    row => row.category === "万舟・穴"
  ),
  "フォーメーション由来2券の成立時は通常最大7点を守るため穴を併用しない"
);

const rankedGroundedFlow =
  selector.select(
    createFixture({
      flow: true,
      flowTickets: [
        "1-3-6",
        "1-3-5",
        "1-3-4"
      ]
    })
  );
assert.deepEqual(
  rankedGroundedFlow.tickets
    .filter(
      row => row.category === "流し"
    )
    .map(row => row.ticket),
  [
    "1-3-4",
    "1-3-5"
  ],
  "候補配列や艇番の先着順でなく正式な3着役割点の上位2券を選ぶ"
);

const singleGroundedFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      flowTickets: [FLOW[0]]
    })
  );
assert.deepEqual(
  singleGroundedFlow.tickets
    .slice(5)
    .map(row => row.category),
  ["万舟・穴"],
  "根拠あるexact券が1券だけなら流しと呼ばず、通常穴を残す"
);

const splitAnchorFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      flowTickets: [
        "1-3-5",
        "1-4-6"
      ],
      flowSecondPriorityBoatNos: [
        3,
        4
      ]
    })
  );
assert.ok(
  !splitAnchorFlow.tickets.some(
    row => row.category === "流し"
  ) &&
    splitAnchorFlow.tickets.some(
      row => row.category ===
        "万舟・穴"
    ),
  "1/2着軸が違うexact券を流しへ混在させない"
);

const splitScenarioFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      flowScenarioIds: {
        [FLOW[1]]: "canonical:4"
      }
    })
  );
assert.ok(
  !splitScenarioFlow.tickets.some(
    row => row.category === "流し"
  ),
  "別scenarioIdのexact券を同じ流しへまとめない"
);

const weakThirdRaceFlow =
  baseRaceFlow();
weakThirdRaceFlow.pickupBoats =
  weakThirdRaceFlow.pickupBoats
    .map(row =>
      row.boatNo === 6
        ? {
            ...row,
            score: 64
          }
        : row
    );
const weakThirdFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      raceFlow: weakThirdRaceFlow
    })
  );
assert.deepEqual(
  weakThirdFlow.tickets
    .filter(
      row => row.category === "流し"
    )
    .map(row => ({
      ticket: row.ticket,
      role:
        row.flowRoleEvidence.find(
          evidence =>
            evidence.position === 3
        )?.role,
      score: row.flowThirdScore
    })),
  [
    {
      ticket: "1-3-5",
      role: "pickup",
      score: 78
    },
    {
      ticket: "1-3-6",
      role: "hold",
      score: 75
    }
  ],
  "3着拾いが65点未満でも、より強い3着残りの正式根拠を採用する"
);

const allWeakThirdRaceFlow =
  baseRaceFlow();
allWeakThirdRaceFlow.pickupBoats =
  allWeakThirdRaceFlow.pickupBoats
    .map(row =>
      row.boatNo === 6
        ? { ...row, score: 64 }
        : row
    );
allWeakThirdRaceFlow.holdBoats =
  allWeakThirdRaceFlow.holdBoats
    .map(row =>
      row.boatNo === 6
        ? { ...row, score: 64 }
        : row
    );
const allWeakThirdFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      raceFlow:
        allWeakThirdRaceFlow
    })
  );
assert.ok(
  !allWeakThirdFlow.tickets.some(
    row => row.category === "流し"
  ),
  "3着拾い・3着残りの両方が65点未満なら流しを不成立にする"
);

const rejectedThirdRaceFlow =
  baseRaceFlow();
rejectedThirdRaceFlow.pickupBoats =
  rejectedThirdRaceFlow.pickupBoats
    .map(row =>
      row.boatNo === 6
        ? {
            ...row,
            score: 95,
            qualified: false
          }
        : row
    );
rejectedThirdRaceFlow.holdBoats =
  rejectedThirdRaceFlow.holdBoats
    .map(row =>
      row.boatNo === 6
        ? {
            ...row,
            score: 95,
            qualified: false
          }
        : row
    );
rejectedThirdRaceFlow.phases
  .secondMark.secondPickup =
    roleRow(6, "pickup", 99);
const rejectedThirdFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      raceFlow:
        rejectedThirdRaceFlow
    })
  );
assert.ok(
  !rejectedThirdFlow.tickets.some(
    row => row.category === "流し"
  ),
  "正式pickup一覧で非採用の艇をphase fallbackで流しへ戻さない"
);

const provenanceOnly =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      flowProvenanceOnly: true,
      holeProvenanceOnly: true
    })
  );
assert.equal(
  provenanceOnly.tickets.length,
  5,
  "rolesなし・priority 0のprovenanceだけでは流し・穴を購入しない"
);

const skippedAudit =
  selector.select(
    createFixture({
      categoryMismatch: true,
      possibilityExtras: [{
        ticket: "1-4-6",
        priorityScore: 50,
        comment:
          "見送り時も残す候補"
      }]
    })
  );
assert.equal(
  skippedAudit.status,
  "skipped",
  "cover行へmain sourceを流用しない"
);
assert.ok(
  skippedAudit
    .targetDecisions
    .some(decision =>
      decision
        .candidateDecisions
        .some(row =>
          row.reasonCode ===
          "RACE_SKIPPED"
        )
    ),
  "見送りでも艇別候補と非採用理由を表示用に残す"
);

const fakeBoolean =
  createFixture({
    possibilityExtras: [{
      ticket: "1-4-6",
      evidenceQualified: true,
      purchaseEligible: true,
      expansionEligible: true,
      branchIds: [],
      allBranchIds: [],
      priorityScore: 100,
      comment:
        "自己申告だけの候補"
    }]
  });
assert.equal(
  selector.select(fakeBoolean)
    .tickets.length,
  5,
  "自己申告boolでは追加しない"
);

const noPhase =
  holdBranch({
    id: "hold:no-phase",
    ticket: "1-4-5",
    targetBoatNo: 4,
    partnerBoatNo: 5,
    withPhaseEvidence: false
  });
assert.ok(
  !selector.select(
    createFixture({
      independent: [noPhase]
    })
  ).tickets.some(
    row => row.ticket === "1-4-5"
  ),
  "source文字列とobject配列だけではphaseEvidenceなし枝を購入しない"
);

const strongFour = [
  holdBranch({
    id: "hold:exact",
    ticket: "1-4-3",
    partnerBoatNo: 3,
    partnerType: "pickup",
    priorityScore: 80
  }),
  holdBranch({
    id: "hold:inside",
    ticket: "1-4-2",
    partnerBoatNo: 2,
    partnerType: "other-hold",
    priorityScore: 80
  }),
  holdBranch({
    id: "hold:third",
    ticket: "1-2-4",
    targetPosition: 3,
    partnerBoatNo: 2,
    partnerType: "other-hold",
    priorityScore: 80
  }),
  holdBranch({
    id: "hold:pickup",
    ticket: "1-4-5",
    partnerBoatNo: 5,
    partnerType: "pickup",
    priorityScore: 80
  })
];
const preserved =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      independent: strongFour
    })
  );
assert.equal(
  preserved.tickets.length,
  10
);
strongFour.forEach(branch => {
  assert.ok(
    preserved.tickets.some(
      row =>
        row.ticket ===
        branch.ticket
    ),
    `${branch.ticket}を通常重複込みで最大10点内へ通す`
  );
});
assert.deepEqual(
  preserved.tickets
    .slice(0, 5)
    .map(row => row.ticket),
  [...MAIN, ...COVER],
  "高い独立枝でも基本coverを退けない"
);
assert.equal(
  preserved
    .expansionSummary
    .normalCount,
  7
);
assert.equal(
  preserved
    .expansionSummary
    .addedCount,
  3
);
assert.equal(
  preserved
    .expansionSummary
    .finalCount,
  10
);
assert.equal(
  preserved
    .expansionSummary
    .exceededNormalMaximum,
  true
);
assert.deepEqual(
  preserved
    .expansionSummary
    .addedTickets
    .map(row => row.ticket),
  preserved.tickets
    .filter(
      row =>
        row.selectionTier ===
        "展開追加"
    )
    .map(row => row.ticket),
  "7点超過理由へ実際に追加した独立展開を列挙する"
);

const uniqueIndependentAfterFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      independent:
        strongFour.slice(1)
    })
  );
const additionsAfterFlow =
  uniqueIndependentAfterFlow.tickets
    .filter(
      row =>
        row.selectionTier ===
          "展開追加"
    );
assert.deepEqual(
  additionsAfterFlow.map(
    row => row.ticket
  ),
  [
    "1-2-4",
    "1-4-2",
    "1-4-5"
  ],
  "フォーメーション由来2券の通常7点後も、重複しない独立展開3枠を維持する"
);
assert.deepEqual(
  {
    normal:
      uniqueIndependentAfterFlow
        .expansionSummary
        .normalCount,
    added:
      uniqueIndependentAfterFlow
        .expansionSummary
        .addedCount,
    final:
      uniqueIndependentAfterFlow
        .expansionSummary
        .finalCount
  },
  {
    normal: 7,
    added: 3,
    final: 10
  }
);
assert.equal(
  new Set(
    uniqueIndependentAfterFlow
      .tickets
      .map(row => row.ticket)
  ).size,
  uniqueIndependentAfterFlow
    .tickets.length,
  "流しと独立展開で同じ券を重複購入しない"
);

const alternateFive =
  alternateHeadBranch({
    id:
      "attack:5:normal-mode-stability",
    ticket: "5-4-3",
    priorityScore: 88
  });
const independentWithFlow =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      independent: [alternateFive]
    })
  );
const independentWithoutFlow =
  selector.select(
    createFixture({
      flow: false,
      longshot: true,
      independent: [alternateFive]
    })
  );
assert.deepEqual(
  [
    independentWithFlow,
    independentWithoutFlow
  ].map(result =>
    result.tickets
      .filter(
        row =>
          row.selectionTier ===
            "展開追加"
      )
      .map(row => row.ticket)
  ),
  [
    ["5-4-3"],
    ["5-4-3"]
  ],
  "通常追加がフォーメーション由来2券か穴1券かで独立展開の別頭順位を変えない"
);
assert.ok(
  preserved.targetDecisions
    .every(
      decision =>
        Array.isArray(
          decision
            .candidateDecisions
        ) &&
        new Set(
          decision
            .candidateDecisions
            .map(
              row => row.ticket
            )
        ).size ===
          decision
            .candidateDecisions
            .length &&
        decision
          .candidateDecisions
          .every(
            row =>
              row.reason &&
              [
                "structured",
                "physical-only"
              ].includes(
                row.relation
              )
          )
    ),
  "艇別候補を重複なしで採用・非採用理由へ接続する"
);
assert.ok(
  preserved.targetDecisions
    .every(decision =>
      decision
        .candidateDecisions
        .length <=
        decision
          .candidateCount &&
      decision
        .hiddenCandidateCount ===
        decision
          .candidateCount -
        decision
          .candidateDecisions
          .length
    ),
  "画面・保存用候補は総数と省略数を保持した軽量プレビューにする"
);

const weak =
  holdBranch({
    id: "hold:weak",
    ticket: "1-6-4",
    targetBoatNo: 6,
    partnerBoatNo: 4,
    partnerType: "other-hold",
    priorityScore: 1
  });
const weakSelection =
  selector.select(
    createFixture({
      independent: [weak]
    })
  );
assert.ok(
  !weakSelection.tickets.some(
    row => row.ticket === "1-6-4"
  ),
  "score 1の独立枝は0追加"
);
assert.ok(
  weakSelection.excludedCandidates
    .some(
      row =>
        row.ticket === "1-6-4" &&
        row.reasonCode ===
          "BELOW_SCORE_THRESHOLD"
    )
);

const alternate =
  alternateHeadBranch({
    id: "attack:4",
    ticket: "4-2-3",
    priorityScore: 88
  });
assert.ok(
  selector.select(
    createFixture({
      independent: [alternate]
    })
  ).tickets.some(
    row => row.ticket === "4-2-3"
  ),
  "alternate-headはattacker=headかつattackBoats実在時だけ通す"
);
const invalidFlow =
  baseRaceFlow();
invalidFlow.attackBoats =
  invalidFlow.attackBoats
    .filter(row => row.boatNo !== 4);
invalidFlow.phases.firstMark
  .secondAttack = null;
assert.ok(
  !selector.select(
    createFixture({
      independent: [alternate],
      raceFlow: invalidFlow
    })
  ).tickets.some(
    row => row.ticket === "4-2-3"
  ),
  "attackBoatsにないalternate-headを拒否する"
);

const maximumBranches = [
  ["4-2-3", 95],
  ["4-2-5", 94],
  ["4-3-5", 93],
  ["4-5-6", 92],
  ["4-6-5", 91]
].map(([ticket, score], index) =>
  alternateHeadBranch({
    id: `maximum:${index}`,
    ticket,
    priorityScore: score
  })
);
const capped =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      independent:
        maximumBranches
    })
  );
assert.equal(
  capped
    .verificationEvidence
    .theorySchemaVersion,
  1,
  "理論実績は事前の構造化支持だけを新スキーマで保存する"
);
assert.equal(
  capped
    .verificationEvidence
    .theorySetFingerprint,
  "structured-ticket-support-v1:flow+holdPickup"
);
assert.ok(
  capped
    .verificationEvidence
    .tickets
    .every(ticket =>
      ticket.theoryClaims
        .some(
          claim =>
            claim.theoryKey ===
              "flow" &&
            claim.formal ===
              true
        )
    ),
  "展開枝が購入を支持した買い目だけへ展開理論を事前帰属する"
);
assert.ok(
  capped
    .verificationEvidence
    .tickets
    .filter(ticket =>
      ticket.roleClaims
        .some(claim =>
          [
            "hold",
            "pickup",
            "continuation"
          ].includes(
            claim.role
          )
        )
    )
    .every(ticket =>
      ticket.theoryClaims
        .some(
          claim =>
            claim.theoryKey ===
              "holdPickup"
        )
    ),
  "残し・拾いの構造化役割がある買い目だけへ同理論を事前帰属する"
);
assert.equal(
  capped.tickets.length,
  8,
  "同じ別頭のpartner総当たりで点数を増やさない"
);
assert.deepEqual(
  capped.tickets
    .filter(
      row =>
        row.selectionTier ===
        "展開追加"
    )
    .map(row => row.ticket),
  [
    "4-2-3"
  ],
  "別頭は攻め艇ごとにpriority最上位1点だけ購入する"
);
assert.ok(
  maximumBranches.every(
    branch =>
      capped.candidateDecisions
        .some(
          row =>
            row.ticket ===
              branch.ticket
        )
  ),
  "購入しないpartner違いも候補プールには全件保持する"
);
assert.ok(
  maximumBranches
    .slice(1)
    .every(branch =>
      capped
        .candidateDecisions
        .some(row =>
          row.ticket ===
            branch.ticket &&
          row.selected === false &&
          row.reasonCode ===
            "LOWER_PRIORITY_SAME_ATTACKER" &&
          row.reason.includes(
            "を優先"
          )
        )
    ),
  "10点未満で落ちた同じ別頭候補は、最大到達でなく優先比較を理由にする"
);
assert.ok(
  capped.tickets
    .filter(
      row =>
        row.selectionTier ===
        "展開追加"
    )
    .every(
      row =>
        row.category ===
        "独立展開"
    ),
  "8〜10点の独立枝は通常の押さえと区別する"
);

const capBranches = [
  ...strongFour,
  holdBranch({
    id: "hold:cap",
    ticket: "1-4-6",
    partnerBoatNo: 6,
    partnerType: "pickup",
    priorityScore: 79
  })
];
const maximum =
  selector.select(
    createFixture({
      flow: true,
      longshot: true,
      independent: capBranches
    })
  );
assert.equal(
  maximum.tickets.length,
  10,
  "独立した残し着順は比較しつつ最大10点を超えない"
);
assert.ok(
  !maximum.tickets.some(
    row => row.ticket === "1-4-6"
  )
);
assert.ok(
  maximum.excludedCandidates
    .some(
      row =>
        row.ticket === "1-4-6" &&
        row.reasonCode ===
          "MAXIMUM_REACHED" &&
        row.reason.includes(
          "当該候補"
        ) &&
        (
          row.reason.includes(
            "比較基準"
          ) ||
          row.reason.includes(
            "最低値"
          )
        )
    )
);

const weakTargetDecision =
  weakSelection.targetDecisions
    .find(
      decision =>
        decision.boatNo === 6
    );
assert.ok(
  weakTargetDecision &&
  weakTargetDecision.selected ===
    false &&
  weakTargetDecision
    .bestCandidateTicket ===
    "1-6-4" &&
  weakTargetDecision
    .bestCandidateScore === 1 &&
  weakTargetDecision
    .selectionBoundary >= 65 &&
  weakTargetDecision
    .comparisonTicket &&
  weakTargetDecision
    .comparisonScore > 0 &&
  weakTargetDecision.scoreGap ===
    weakTargetDecision
      .selectionBoundary - 1 &&
  weakTargetDecision.reasonCode ===
    "NO_PURCHASE_ELIGIBLE_BRANCH",
  "非採用targetへ候補・境界・比較差を具体保存する"
);

assert.deepEqual(
  noteGenerator
    .createPracticalSelection(
      createFixture({
        flow: true,
        longshot: true,
        independent:
          maximumBranches
      })
    ),
  capped.tickets,
  "アプリとnoteで同じ選択器を使う"
);

console.log("実戦厳選共通テスト: 合格");
console.log("- 基本5点: main3＋cover2を固定");
console.log("- 通常追加: フォーメーション由来の根拠付き3連単2券（穴と排他）");
console.log("- 独立追加: 現raceFlow再照合・65点以上・priority比較");
console.log("- 最大10点: requirementは監査IDとして保持");
console.log("- 非採用: 候補・境界・比較差を構造化保存");
console.log("- category scoped comment・note共通処理: 合格");
