"use strict";

const assert = require("node:assert/strict");
const shadow = require(
  "../js/practical-priority-shadow"
);

function selectedRow(
  ticket,
  priorityScore,
  category
) {
  return {
    ticket,
    priorityScore,
    category
  };
}

function rolesFor(ticket) {
  const boats = ticket
    .split("-")
    .map(Number);

  return [
    {
      boatNo: boats[0],
      position: 1,
      role: "head",
      structured: true
    },
    {
      boatNo: boats[1],
      position: 2,
      role: "hold",
      structured: true
    },
    {
      boatNo: boats[2],
      position: 3,
      role: "pickup",
      structured: true
    }
  ];
}

function candidate(
  ticket = "1-4-2",
  options = {}
) {
  return {
    ticket,
    selected:
      options.selected ?? false,
    reasonCode:
      options.reasonCode ??
      "CANDIDATE_ONLY_EVALUATION",
    priorityScore:
      options.priorityScore ?? 92,
    branchIds:
      options.branchIds ?? [
        `formation:flow:${ticket}:provenance`,
        `formation:flow:${ticket}:evaluation`
      ],
    roleLabels:
      options.roleLabels ??
      rolesFor(ticket)
  };
}

function fixture(options = {}) {
  return {
    verificationEvidence:
      options.verificationEvidence ?? {
        generation: {
          logicFingerprint:
            "evaluated-scenarios-v1",
          confidenceDefinitionVersion:
            "internal-score-v1",
          ticketPolicyVersion:
            "practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5"
        }
      },
    tickets:
      options.tickets ?? [
        selectedRow(
          "1-2-3",
          100,
          "本線"
        ),
        selectedRow(
          "1-2-4",
          60,
          "流し"
        ),
        selectedRow(
          "1-2-5",
          61,
          "流し"
        ),
        selectedRow(
          "2-1-3",
          80,
          "押さえ"
        ),
        selectedRow(
          "1-2-6",
          75,
          "独立展開"
        )
      ],
    candidateOutcomes:
      options.candidateOutcomes ?? [
        candidate()
      ]
  };
}

function deepFreeze(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Object.isFrozen(value)
  ) {
    return value;
  }

  Object.freeze(value);
  Object.values(value).forEach(
    deepFreeze
  );
  return value;
}

function assertCandidateRejected(
  row,
  reason
) {
  const result = shadow.build(
    fixture({
      candidateOutcomes: [row]
    })
  );

  assert.equal(
    result.eligible,
    false,
    `${reason}: shadow置換しない`
  );
  assert.equal(
    result.reasonCode,
    "NO_ELIGIBLE_CANDIDATE",
    `${reason}: 候補不成立として返す`
  );
  assert.equal(
    result.diagnostics
      .rejectedCandidateCounts[reason],
    1,
    `${reason}: 構造化した除外理由を返す`
  );
  assert.deepEqual(
    result.shadowTickets,
    result.baseTickets,
    `${reason}: 本番買い目を変更しない`
  );
}

const frozenSelection = deepFreeze(
  fixture()
);
const before = JSON.stringify(
  frozenSelection
);
const eligible = shadow.build(
  frozenSelection
);

assert.equal(
  eligible.version,
  shadow.VERSION
);
assert.equal(
  eligible.logicFingerprint,
  shadow.LOGIC_FINGERPRINT
);
assert.equal(
  eligible.contract.mode,
  "prospective-shadow-only"
);
assert.equal(
  eligible.contract
    .priorityScoreExclusiveMinimum,
  90
);
assert.deepEqual(
  eligible.contract
    .protectedSelectedCategories,
  ["本線", "流し"]
);
assert.deepEqual(
  eligible.contract
    .exactStructuredRoles,
  [
    { position: 1, role: "head" },
    { position: 2, role: "hold" },
    { position: 3, role: "pickup" }
  ]
);
assert.equal(
  eligible.eligible,
  true
);
assert.equal(
  eligible.sourceSelectionFingerprint,
  "evaluated-scenarios-v1|internal-score-v1|practical-5-7-10-grounded-flow2-candidate90-strongescape-prioritygate-v5"
);
assert.equal(
  eligible.applicationMode,
  "shadow-only"
);
assert.equal(
  eligible.automaticApplication,
  false
);
assert.equal(
  eligible.usableForPrediction,
  false
);
assert.equal(
  eligible.affectsPrediction,
  false
);
assert.equal(
  eligible.affectsTickets,
  false
);
assert.deepEqual(
  eligible.baseTickets,
  [
    "1-2-3",
    "1-2-4",
    "1-2-5",
    "2-1-3",
    "1-2-6"
  ]
);
assert.deepEqual(
  eligible.shadowTickets,
  [
    "1-2-3",
    "1-2-4",
    "1-2-5",
    "2-1-3",
    "1-4-2"
  ],
  "本線と内部フォーメーション2券を固定し、最弱の残り1券と同じ位置だけをshadow置換する"
);
assert.deepEqual(
  eligible.replacement,
  {
    sourceOutcomeIndex: 0,
    selectedIndex: 4,
    addedTicket: "1-4-2",
    addedPriorityScore: 92,
    addedReasonCode:
      "CANDIDATE_ONLY_EVALUATION",
    addedFirstFormationBranch:
      "formation:flow",
    removedTicket: "1-2-6",
    removedPriorityScore: 75,
    removedCategory: "独立展開",
    priorityScoreDelta: 17,
    ticketCountBefore: 5,
    ticketCountAfter: 5
  }
);
assert.equal(
  JSON.stringify(frozenSelection),
  before,
  "入力selectionを変更しない"
);

const missingGeneration = shadow.build(
  fixture({ verificationEvidence: {} })
);
assert.equal(
  missingGeneration.sourceSelectionFingerprint,
  "",
  "生成情報不足を見かけの世代識別子にしない"
);
assert.equal(missingGeneration.eligible, false);
assert.equal(
  missingGeneration.reasonCode,
  "SOURCE_SELECTION_GENERATION_MISMATCH"
);

const differentGeneration = shadow.build(
  fixture({
    verificationEvidence: {
      generation: {
        logicFingerprint:
          "evaluated-scenarios-v2",
        confidenceDefinitionVersion:
          "internal-score-v1",
        ticketPolicyVersion:
          "prioritygate-v6"
      }
    }
  })
);
assert.equal(differentGeneration.eligible, false);
assert.equal(
  differentGeneration.reasonCode,
  "SOURCE_SELECTION_GENERATION_MISMATCH",
  "異なる実戦厳選世代をシャドー対象にしない"
);

assertCandidateRejected(
  candidate("1-4-2", {
    selected: true
  }),
  "NOT_UNSELECTED"
);
assertCandidateRejected(
  candidate("1-4-2", {
    reasonCode: "MAXIMUM_REACHED"
  }),
  "WRONG_REASON_CODE"
);
assertCandidateRejected(
  candidate("1-4-2", {
    branchIds: [
      "formation:main:1-4-2:provenance",
      "formation:flow:1-4-2:provenance"
    ]
  }),
  "WRONG_FIRST_FORMATION_BRANCH"
);
assertCandidateRejected(
  candidate("2-1-4"),
  "WRONG_HEAD"
);
assertCandidateRejected(
  candidate("1-4-2", {
    priorityScore: 90
  }),
  "PRIORITY_NOT_ABOVE_90"
);
assertCandidateRejected(
  candidate("1-1-2", {
    roleLabels: []
  }),
  "INVALID_TICKET"
);

const malformedRoleSets = [
  rolesFor("1-4-2").slice(0, 2),
  rolesFor("1-4-2").map(
    (role, index) =>
      index === 2
        ? {
            ...role,
            role: "hold"
          }
        : role
  ),
  rolesFor("1-4-2").map(
    (role, index) =>
      index === 1
        ? {
            ...role,
            structured: false
          }
        : role
  ),
  [
    ...rolesFor("1-4-2"),
    {
      boatNo: 2,
      position: 3,
      role: "hold",
      structured: true
    }
  ],
  rolesFor("1-4-2").map(
    (role, index) =>
      index === 1
        ? {
            ...role,
            boatNo: 5
          }
        : role
  )
];
malformedRoleSets.forEach(
  (roleLabels, index) =>
    assertCandidateRejected(
      candidate("1-4-2", {
        roleLabels
      }),
      "STRUCTURED_ROLE_CONTRACT_MISMATCH",
      `role mismatch ${index}`
    )
);

const alreadySelected = shadow.build(
  fixture({
    candidateOutcomes: [
      candidate("1-2-6")
    ]
  })
);
assert.equal(
  alreadySelected.eligible,
  false
);
assert.equal(
  alreadySelected.diagnostics
    .rejectedCandidateCounts
    .TICKET_ALREADY_SELECTED,
  1
);

const duplicateOnly = shadow.build(
  fixture({
    candidateOutcomes: [
      candidate("1-4-2"),
      candidate("1-4-2")
    ]
  })
);
assert.equal(
  duplicateOnly.eligible,
  false,
  "同じsource ticketが複数行なら一意な置換元として扱わない"
);
assert.equal(
  duplicateOnly.diagnostics
    .rejectedCandidateCounts
    .SOURCE_TICKET_NOT_UNIQUE,
  2
);

const tiedAndDeduplicated = shadow.build(
  fixture({
    candidateOutcomes: [
      candidate("1-3-6"),
      candidate("1-3-6"),
      candidate("1-5-2"),
      candidate("1-4-2")
    ]
  })
);
assert.equal(
  tiedAndDeduplicated.eligible,
  true
);
assert.equal(
  tiedAndDeduplicated.replacement
    .addedTicket,
  "1-4-2",
  "重複source ticketを除外し、同点の一意候補をticket昇順で決める"
);
assert.equal(
  tiedAndDeduplicated.diagnostics
    .eligibleCandidateCount,
  2
);

const candidateTie = shadow.build(
  fixture({
    candidateOutcomes: [
      candidate("1-5-2"),
      candidate("1-4-2")
    ]
  })
);
assert.equal(
  candidateTie.replacement
    .addedTicket,
  "1-4-2",
  "候補はpriority降順・ticket昇順で安定選択する"
);

const weakestTie = shadow.build(
  fixture({
    tickets: [
      selectedRow(
        "1-2-3",
        100,
        "本線"
      ),
      selectedRow(
        "1-2-4",
        1,
        "流し"
      ),
      selectedRow(
        "1-2-5",
        1,
        "流し"
      ),
      selectedRow(
        "2-1-4",
        75,
        "押さえ"
      ),
      selectedRow(
        "2-1-3",
        75,
        "独立展開"
      )
    ]
  })
);
assert.equal(
  weakestTie.replacement
    .removedTicket,
  "2-1-3",
  "置換先はpriority昇順・ticket昇順で安定選択する"
);
assert.equal(
  weakestTie.replacement
    .selectedIndex,
  4,
  "安定選択した券の元位置を維持する"
);

const onlyProtected = shadow.build(
  fixture({
    tickets: [
      selectedRow(
        "1-2-3",
        100,
        "本線"
      ),
      selectedRow(
        "1-2-4",
        1,
        "流し"
      ),
      selectedRow(
        "1-2-5",
        1,
        "流し"
      )
    ]
  })
);
assert.equal(
  onlyProtected.eligible,
  false
);
assert.equal(
  onlyProtected.reasonCode,
  "NO_REPLACEABLE_SELECTED_TICKET"
);

const notStrictlyStronger = shadow.build(
  fixture({
    tickets: [
      selectedRow(
        "1-2-3",
        100,
        "本線"
      ),
      selectedRow(
        "2-1-3",
        92,
        "押さえ"
      )
    ]
  })
);
assert.equal(
  notStrictlyStronger.eligible,
  false
);
assert.equal(
  notStrictlyStronger.reasonCode,
  "CANDIDATE_NOT_STRICTLY_STRONGER"
);

const duplicateSelected = shadow.build(
  fixture({
    tickets: [
      selectedRow(
        "1-2-3",
        100,
        "本線"
      ),
      selectedRow(
        "1-2-3",
        75,
        "押さえ"
      )
    ]
  })
);
assert.equal(
  duplicateSelected.eligible,
  false
);
assert.equal(
  duplicateSelected.reasonCode,
  "SELECTED_SOURCE_NOT_UNIQUE"
);

console.log(
  "practical priority prospective shadow contract: OK"
);
