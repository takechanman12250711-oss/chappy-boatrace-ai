/* =========================================================
  チャッピーボートレースAI
  評価済み展開・候補プール

  - 艇番に依存せず、評価印の全物理候補を上限前に保持する
  - 既存フォーメーションの根拠と、時系列で確認できる独立枝を分ける
  - 評価印だけでは8〜10点目へ自動昇格させない
========================================================= */

(function (root, factory) {
  "use strict";

  const api = factory();

  root.ChappyEvaluatedScenarioCandidates = api;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis,
  function () {
    "use strict";

    const MARK_DEFINITIONS = [
      {
        key: "honmei",
        symbol: "◎",
        roleIntents: ["head"],
        eligiblePositions: [1]
      },
      {
        key: "taikou",
        symbol: "○",
        roleIntents: ["head", "hold"],
        eligiblePositions: [1, 2, 3]
      },
      {
        key: "ana",
        symbol: "▲",
        roleIntents: [
          "alternate-head",
          "pickup"
        ],
        eligiblePositions: [1, 3]
      },
      {
        key: "osae",
        symbol: "△",
        roleIntents: ["hold", "pickup"],
        eligiblePositions: [2, 3]
      }
    ];

    function number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed)
        ? parsed
        : fallback;
    }

    function boatNo(value) {
      return Number(
        value?.boatNo ??
        value?.number ??
        value?.waku ??
        value?.boat ??
        0
      );
    }

    function unique(values) {
      return [...new Set(values)];
    }

    function exactTicket(ticket) {
      const boats = String(ticket || "")
        .split("-")
        .map(Number);

      if (
        boats.length !== 3 ||
        boats.some(
          (value) =>
            value < 1 ||
            value > 6
        ) ||
        new Set(boats).size !== 3
      ) {
        return null;
      }

      return boats;
    }

    function ticketValue(value) {
      return String(
        value?.ticket ||
        value ||
        ""
      ).trim();
    }

    function isRoleEvidence(row) {
      if (
        !row ||
        boatNo(row) < 1 ||
        boatNo(row) > 6
      ) {
        return false;
      }

      if (
        row.qualified === false ||
        row.isAdopted === false
      ) {
        return false;
      }

      if (
        /不成立|除外|非採用|見送り/.test(
          String(row.status || "")
        )
      ) {
        return false;
      }

      return (
        number(row.score, 0) > 0 &&
        String(
          row.reason ||
          row.flowReason ||
          ""
        ).trim().length > 0
      );
    }

    function roleMap(rows) {
      return new Map(
        (Array.isArray(rows) ? rows : [])
          .filter(isRoleEvidence)
          .map((row) => [
            boatNo(row),
            row
          ])
      );
    }

    function roleReason(label, row) {
      if (!row) return "";

      return [
        `${boatNo(row)}号艇の${label}`,
        number(row.score, 0) > 0
          ? `${number(row.score)}点`
          : "",
        String(
          row.reason ||
          row.flowReason ||
          ""
        ).trim()
      ].filter(Boolean).join("・");
    }

    const PURCHASE_ROLE_SCORE_MINIMUM = 65;

    function evidenceSnapshot(
      row,
      source
    ) {
      if (!row) return null;

      return {
        boatNo: boatNo(row),
        course:
          number(row.course, 0) || null,
        score:
          number(row.score, 0),
        reason:
          String(
            row.reason ||
            row.flowReason ||
            ""
          ).trim(),
        source:
          String(
            row.qualificationSource ||
            row.source ||
            source ||
            ""
          )
      };
    }

    function evaluationRoleEvidence(
      evaluation,
      role
    ) {
      if (!evaluation) return null;

      const fields =
        role === "attack"
          ? ["attack", "tenkai"]
          : role === "hold"
            ? ["hold"]
            : ["pickup", "expected", "tenkai"];
      const scoredFields =
        fields
          .map((field) => ({
            field,
            score:
              number(
                evaluation?.[field],
                0
              )
          }))
          .filter(
            (item) =>
              item.score >=
              PURCHASE_ROLE_SCORE_MINIMUM
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );
      const strongest =
        scoredFields[0] || null;

      if (!strongest) return null;

      return {
        boatNo: boatNo(evaluation),
        course:
          number(
            evaluation?.course,
            boatNo(evaluation)
          ),
        score: strongest.score,
        reason:
          String(
            evaluation?.comment ||
            evaluation?.shortComment ||
            `${strongest.field}評価${strongest.score}点`
          ).trim(),
        qualificationSource:
          `boatEvaluation.${strongest.field}`,
        derivedFromEvaluation: true
      };
    }

    function uniqueEvidenceRows(rows) {
      const byBoat = new Map();

      (Array.isArray(rows) ? rows : [])
        .filter(isRoleEvidence)
        .forEach((row) => {
          const targetBoatNo =
            boatNo(row);
          const current =
            byBoat.get(targetBoatNo);

          if (
            !current ||
            number(row.score, 0) >
              number(current.score, 0)
          ) {
            byBoat.set(
              targetBoatNo,
              row
            );
          }
        });

      return [...byBoat.values()];
    }

    function positionsForRoles(roles) {
      const positions = new Set();

      (Array.isArray(roles) ? roles : [])
        .forEach((role) => {
          if (
            role === "head" ||
            role === "alternate-head"
          ) {
            positions.add(1);
          }

          if (role === "hold") {
            positions.add(2);
            positions.add(3);
          }

          if (role === "pickup") {
            positions.add(3);
          }
        });

      return [...positions]
        .sort((a, b) => a - b);
    }

    function build(basePrediction) {
      const base =
        basePrediction &&
        typeof basePrediction === "object"
          ? basePrediction
          : {};
      const mainSheet =
        base.mainSheet &&
        !Array.isArray(base.mainSheet)
          ? base.mainSheet
          : {};
      const boatEvaluation =
        base.boatEvaluation &&
        !Array.isArray(base.boatEvaluation)
          ? base.boatEvaluation
          : mainSheet;
      const evaluations =
        Array.isArray(
          boatEvaluation.evaluations
        )
          ? boatEvaluation.evaluations
          : Array.isArray(
              mainSheet.evaluations
            )
            ? mainSheet.evaluations
            : [];
      const evaluationByBoat =
        new Map(
          evaluations.map((evaluation) => [
            boatNo(evaluation),
            evaluation
          ])
        );
      const marks = {};
      const targets =
        MARK_DEFINITIONS
          .map((definition) => {
            const rawMark =
              boatEvaluation[
                definition.key
              ] ||
              mainSheet[
                definition.key
              ] ||
              null;
            const targetBoatNo =
              boatNo(rawMark);

            if (
              targetBoatNo < 1 ||
              targetBoatNo > 6
            ) {
              return null;
            }

            const evaluation =
              evaluationByBoat.get(
                targetBoatNo
              ) ||
              rawMark;

            marks[definition.key] =
              evaluation;

            return {
              id:
                `evaluation:` +
                `${definition.key}:` +
                `${targetBoatNo}`,
              markKey: definition.key,
              symbol: definition.symbol,
              boatNo: targetBoatNo,
              roleIntents: [
                ...definition.roleIntents
              ],
              defaultRoleIntents: [
                ...definition.roleIntents
              ],
              eligiblePositions: [
                ...definition
                  .eligiblePositions
              ],
              evaluation,
              candidateTickets: [],
              qualifiedCandidateTickets: []
            };
          })
          .filter(Boolean);
      const boatNumbers =
        unique(
          evaluations
            .map(boatNo)
            .filter(
              (value) =>
                value >= 1 &&
                value <= 6
            )
        )
          .sort((a, b) => a - b);
      const courseByBoat =
        new Map(
          evaluations.map((evaluation) => {
            const targetBoatNo =
              boatNo(evaluation);
            const course =
              number(
                evaluation?.course,
                targetBoatNo
              );

            return [
              targetBoatNo,
              course >= 1 && course <= 6
                ? course
                : targetBoatNo
            ];
          })
        );
      const boatAtCourse = (course) =>
        boatNumbers.find(
          (value) =>
            courseByBoat.get(value) ===
            Number(course)
        ) || null;
      const insideBoatNo =
        boatAtCourse(1);
      const mainHeadBoatNo =
        boatNo(marks.honmei);
      const raceFlow =
        base.raceFlow || {};
      const phases =
        raceFlow.phases || {};
      const attackByBoat =
        roleMap(raceFlow.attackBoats);
      const holdByBoat =
        roleMap(raceFlow.holdBoats);
      const pickupByBoat =
        roleMap(raceFlow.pickupBoats);
      const primaryAttackerBoatNo =
        boatNo(
          phases.firstMark?.mainAttack
        ) ||
        boatNo(phases.back?.leader) ||
        boatNo(raceFlow.attackBoats?.[0]) ||
        mainHeadBoatNo;
      const scenarioTitle =
        String(
          raceFlow.title ||
          "評価済み中心展開"
        ).trim();
      const scenarioSummary =
        String(
          raceFlow.summary ||
          mainSheet.reason ||
          ""
        ).trim();
      const insideEvidence =
        insideBoatNo
          ? {
              boatNo: insideBoatNo,
              course: 1,
              score: number(
                evaluationByBoat
                  .get(insideBoatNo)
                  ?.hold ??
                evaluationByBoat
                  .get(insideBoatNo)
                  ?.score,
                1
              ),
              reason:
                "実1コースからの内残り",
              qualificationSource:
                "courseByBoat+boatEvaluation"
            }
          : null;
      const mainHeadEvidence = {
        boatNo: mainHeadBoatNo,
        course:
          courseByBoat.get(
            mainHeadBoatNo
          ) ||
          mainHeadBoatNo,
        score: number(
          marks.honmei?.score ??
          marks.honmei?.total,
          0
        ),
        reason:
          scenarioSummary ||
          `${mainHeadBoatNo}号艇を中心評価`,
        qualificationSource:
          "boatEvaluation.honmei"
      };
      const roleEvidenceByType = {
        attack: new Map(),
        hold: new Map(),
        pickup: new Map()
      };

      evaluations.forEach((evaluation) => {
        [
          "attack",
          "hold",
          "pickup"
        ].forEach((role) => {
          const evidence =
            evaluationRoleEvidence(
              evaluation,
              role
            );

          if (evidence) {
            roleEvidenceByType[role]
              .set(
                boatNo(evaluation),
                evidence
              );
          }
        });
      });

      [
        [
          "attack",
          attackByBoat,
          "raceFlow.attackBoats"
        ],
        [
          "hold",
          holdByBoat,
          "raceFlow.holdBoats"
        ],
        [
          "pickup",
          pickupByBoat,
          "raceFlow.pickupBoats"
        ]
      ].forEach(
        ([
          role,
          sourceMap,
          qualificationSource
        ]) => {
          sourceMap.forEach(
            (row, targetBoatNo) => {
              roleEvidenceByType[role]
                .set(
                  targetBoatNo,
                  {
                    ...row,
                    qualificationSource
                  }
                );
            }
          );
        }
      );

      targets.forEach((target) => {
        const roles =
          new Set(target.roleIntents);
        const attackEvidence =
          roleEvidenceByType.attack
            .get(target.boatNo) || null;
        const holdEvidence =
          (
            target.boatNo ===
            insideBoatNo
              ? insideEvidence
              : null
          ) ||
          roleEvidenceByType.hold
            .get(target.boatNo) ||
          null;
        const pickupEvidence =
          roleEvidenceByType.pickup
            .get(target.boatNo) || null;

        if (attackEvidence) {
          roles.add(
            target.boatNo ===
              mainHeadBoatNo
              ? "head"
              : "alternate-head"
          );
        }
        if (holdEvidence) {
          roles.add("hold");
        }
        if (pickupEvidence) {
          roles.add("pickup");
        }

        target.roleIntents = [
          ...roles
        ];
        target.eligiblePositions =
          positionsForRoles(
            target.roleIntents
          );
        target.roleEvidence = {
          attack:
            evidenceSnapshot(
              attackEvidence,
              "attack"
            ),
          hold:
            evidenceSnapshot(
              holdEvidence,
              "hold"
            ),
          pickup:
            evidenceSnapshot(
              pickupEvidence,
              "pickup"
            )
        };
      });
      const branches = [];
      const branchIds = new Set();

      function targetRoleEvidence(
        target,
        position
      ) {
        if (
          !target.eligiblePositions
            .includes(position)
        ) {
          return null;
        }

        if (position === 1) {
          if (
            target.boatNo ===
              mainHeadBoatNo &&
            target.roleIntents
              .includes("head")
          ) {
            return {
              role: "head",
              evidence:
                mainHeadEvidence
            };
          }

          if (
            target.roleIntents.includes(
              "alternate-head"
            ) &&
            roleEvidenceByType.attack.has(
              target.boatNo
            )
          ) {
            return {
              role:
                "alternate-head",
              evidence:
                roleEvidenceByType.attack.get(
                  target.boatNo
                )
            };
          }

          if (
            target.roleIntents
              .includes("head") &&
            roleEvidenceByType.attack.has(
              target.boatNo
            )
          ) {
            return {
              role: "head",
              evidence:
                roleEvidenceByType.attack.get(
                  target.boatNo
                )
            };
          }

          return null;
        }

        if (
          position === 2 &&
          target.roleIntents
            .includes("hold")
        ) {
          const evidence =
            target.boatNo ===
              insideBoatNo
              ? insideEvidence
              : roleEvidenceByType.hold.get(
                  target.boatNo
                );

          return evidence
            ? {
                role: "hold",
                evidence
              }
            : null;
        }

        if (
          position === 3 &&
          target.roleIntents
            .includes("pickup") &&
          roleEvidenceByType.pickup.has(
            target.boatNo
          )
        ) {
          return {
            role: "pickup",
            evidence:
              roleEvidenceByType.pickup.get(
                target.boatNo
              )
          };
        }

        if (
          position === 3 &&
          target.roleIntents
            .includes("hold")
        ) {
          const evidence =
            target.boatNo ===
              insideBoatNo
              ? insideEvidence
              : roleEvidenceByType.hold.get(
                  target.boatNo
                );

          return evidence
            ? {
                role: "hold",
                evidence
              }
            : null;
        }

        return null;
      }

      function addBranch({
        id,
        kind,
        type,
        ticket,
        target,
        targetPosition,
        targetRole,
        targetEvidence,
        partnerEvidence,
        title,
        summary,
        requirement = false,
        requirementId = "",
        source,
        evidenceChecks = [],
        phaseEvidence = null,
        qualificationSource = "",
        purchaseEligible = false,
        branchAttackerBoatNo = 0
      }) {
        const boats =
          exactTicket(ticket);

        if (
          !boats ||
          !target ||
          branchIds.has(id) ||
          boats[
            targetPosition - 1
          ] !== target.boatNo ||
          !target.eligiblePositions
            .includes(
              targetPosition
            ) ||
          !target.roleIntents
            .includes(targetRole) ||
          !isRoleEvidence(
            targetEvidence
          )
        ) {
          return;
        }

        const headBoatNo = boats[0];
        const normalizedChecks =
          evidenceChecks.map(
            (check, index) =>
              check &&
              typeof check === "object"
                ? {
                    key:
                      String(
                        check.key ||
                        `check-${index + 1}`
                      ),
                    label:
                      String(
                        check.label ||
                        check.key ||
                        `根拠${index + 1}`
                      ),
                    matched:
                      check.matched === true,
                    required:
                      check.required !== false,
                    source:
                      String(
                        check.source ||
                        qualificationSource ||
                        source ||
                        ""
                      ),
                    boatNo:
                      number(
                        check.boatNo,
                        0
                      ) || null,
                    role:
                      String(
                        check.role || ""
                      ),
                    score:
                      number(
                        check.score,
                        0
                      )
                  }
                : {
                    key:
                      `legacy-check-${index + 1}`,
                    label:
                      String(check || ""),
                    matched: true,
                    required: false,
                    source:
                      String(
                        qualificationSource ||
                        source ||
                        ""
                      ),
                    boatNo: null,
                    role: "",
                    score: 0
                  }
          );
        const partnerEvidenceRows =
          (
            Array.isArray(
              partnerEvidence
            )
              ? partnerEvidence
              : [partnerEvidence]
          ).filter(Boolean);
        const resolvedQualificationSource =
          String(
            qualificationSource ||
            targetEvidence
              ?.qualificationSource ||
            source ||
            ""
          );
        const resolvedAttackerBoatNo =
          number(
            branchAttackerBoatNo,
            0
          ) ||
          primaryAttackerBoatNo;
        const isIndependent =
          kind ===
          "independent-scenario";
        const branch = {
          id,
          kind,
          type,
          source,
          scenarioId:
            (
              isIndependent
                ? "independent:"
                : "canonical:"
            ) +
            `${resolvedAttackerBoatNo}`,
          scenarioTitle,
          qualified: true,
          purchaseEligible:
            isIndependent &&
            purchaseEligible === true,
          qualificationSource:
            resolvedQualificationSource,
          headBoatNo,
          attackerBoatNo:
            resolvedAttackerBoatNo,
          ticket,
          sourceEvaluationIds: [
            target.id
          ],
          roles: [{
            evaluationId:
              target.id,
            boatNo:
              target.boatNo,
            role: targetRole,
            eligiblePositions: [
              targetPosition
            ]
          }],
          requirement,
          purchaseRequired: false,
          requirementPurpose:
            isIndependent
              ? "audit-only"
              : "",
          requirementId:
            String(
              requirementId ||
              (
                isIndependent
                  ? id
                  : ""
              )
            ),
          auditRequirementId:
            String(
              requirementId ||
              (
                isIndependent
                  ? id
                  : ""
              )
            ),
          priorityScore:
            number(
              targetEvidence.score ??
              target.evaluation?.score ??
              target.evaluation?.total,
              0
            ),
          reason: [
            scenarioSummary,
            roleReason(
              targetRole,
              targetEvidence
            ),
            ...partnerEvidenceRows.map(
              (row, index) =>
                roleReason(
                  partnerEvidenceRows.length > 1
                    ? `${index + 2}着役割`
                    : targetPosition === 2
                      ? "3着役割"
                      : "2着役割",
                  row
                )
            ),
            ...normalizedChecks
              .filter(
                (check) =>
                  check.matched
              )
              .map(
                (check) =>
                  check.label
              )
          ].filter(Boolean).join(" / "),
          evidenceChecks:
            normalizedChecks,
          phaseEvidence:
            phaseEvidence &&
            typeof phaseEvidence ===
              "object"
              ? phaseEvidence
              : {
                  kind:
                    kind ===
                    "canonical-formation"
                      ? "base-formation"
                      : "role-evidence",
                  mainHeadBoatNo,
                  primaryAttackerBoatNo:
                    resolvedAttackerBoatNo,
                  goalOrder: [],
                  exactGoalOrder: false
                },
          exactGoalOrder:
            phaseEvidence
              ?.exactGoalOrder === true,
          title,
          summary
        };

        branchIds.add(id);
        branches.push(branch);
      }

      const baseFormation =
        base.formation || {};
      const formationGroups = [
        {
          key: "main",
          label: "本線",
          tickets: [
            ...(mainSheet.tickets || []),
            ...(baseFormation.main || [])
          ]
        },
        {
          key: "cover",
          label: "押さえ",
          tickets: [
            ...(mainSheet.coverTickets || []),
            ...(baseFormation.cover || []),
            ...(baseFormation.safety || [])
          ]
        },
        {
          key: "flow",
          label: "流し",
          tickets: [
            ...(mainSheet.flowTickets || []),
            ...(baseFormation.nagashi || []),
            ...(baseFormation.flow || [])
          ]
        },
        {
          key: "hole",
          label: "穴",
          tickets: [
            ...(base.manshuSheet
              ?.tickets || []),
            ...(baseFormation.hole || []),
            ...(baseFormation.longshot || [])
          ]
        }
      ];

      formationGroups.forEach((group) => {
        unique(
          group.tickets
            .map(ticketValue)
            .filter(exactTicket)
        ).forEach((ticket) => {
          const boats =
            exactTicket(ticket);
          const provenanceId =
            `formation:` +
            `${group.key}:` +
            `${ticket}:provenance`;

          if (
            boats &&
            !branchIds.has(
              provenanceId
            )
          ) {
            branchIds.add(
              provenanceId
            );
            branches.push({
              id:
                provenanceId,
              kind:
                "canonical-formation",
              type:
                `${group.key}-ticket`,
              source:
                `base-formation:` +
                `${group.key}`,
              scenarioId:
                `canonical:` +
                `${primaryAttackerBoatNo}`,
              scenarioTitle,
              qualified: true,
              purchaseEligible: false,
              qualificationSource:
                `base-formation:${group.key}`,
              headBoatNo:
                boats[0],
              attackerBoatNo:
                primaryAttackerBoatNo,
              ticket,
              sourceEvaluationIds: [],
              roles: [],
              requirement: false,
              purchaseRequired: false,
              requirementPurpose: "",
              requirementId: "",
              auditRequirementId: "",
              priorityScore: 0,
              reason: [
                scenarioSummary,
                "既存フォーメーションに同一買い目あり"
              ].filter(Boolean).join(" / "),
              evidenceChecks: [
                {
                  key:
                    "base-formation-membership",
                  label:
                    "既存フォーメーションに同一買い目あり",
                  matched: true,
                  required: true,
                  source:
                    `base-formation:${group.key}`,
                  boatNo: null,
                  role: "",
                  score: 0
                }
              ],
              phaseEvidence: {
                kind:
                  "base-formation",
                mainHeadBoatNo,
                primaryAttackerBoatNo,
                goalOrder: [],
                exactGoalOrder: false
              },
              exactGoalOrder: false,
              title:
                `${ticket}の` +
                `${group.label}展開`,
              summary:
                `${scenarioTitle}から作られた` +
                `${group.label}候補。` +
                `${boats[0]}号艇1着、` +
                `${boats[1]}号艇2着、` +
                `${boats[2]}号艇3着の順で評価する。`
            });
          }

          targets.forEach((target) => {
            const position =
              boats.indexOf(
                target.boatNo
              ) + 1;

            if (position < 1) return;

            const roleEvidence =
              targetRoleEvidence(
                target,
                position
              );

            if (!roleEvidence) return;

            addBranch({
              id:
                `formation:` +
                `${group.key}:` +
                `${ticket}:` +
                `${target.id}:` +
                `${position}`,
              kind:
                "canonical-formation",
              type:
                `${group.key}-ticket`,
              ticket,
              target,
              targetPosition:
                position,
              targetRole:
                roleEvidence.role,
              targetEvidence:
                roleEvidence.evidence,
              title:
                `${ticket}の` +
                `${group.label}展開`,
              summary:
                `${scenarioTitle}から作られた` +
                `${group.label}候補。` +
                `${boats[0]}号艇1着、` +
                `${boats[1]}号艇2着、` +
                `${boats[2]}号艇3着の順で評価する。`,
              source:
                `base-formation:${group.key}`,
              qualificationSource:
                `base-formation:${group.key}`,
              purchaseEligible: false,
              evidenceChecks: [
                {
                  key:
                    "base-formation-membership",
                  label:
                    "既存フォーメーションに同一買い目あり",
                  matched: true,
                  required: true,
                  source:
                    `base-formation:${group.key}`,
                  boatNo:
                    target.boatNo,
                  role:
                    roleEvidence.role,
                  score:
                    number(
                      roleEvidence
                        .evidence?.score,
                      0
                    )
                }
              ]
            });
          });
        });
      });

      /*
        独立枝は候補として保持する段階と、購入比較へ進める段階を
        分ける。時系列とpartnerは正本データから構造化して保持し、
        ゴール順は枝ごとのexactGoalOrderとして別判定する。
      */
      const goalOrder =
        Array.isArray(
          phases.goal?.expectedOrder
        )
          ? phases.goal.expectedOrder
              .map(boatNo)
              .filter(Boolean)
          : [];
      const sourceEvidenceRows = (
        evidenceMap,
        source
      ) =>
        uniqueEvidenceRows(
          [...evidenceMap.values()]
        ).map((row) => ({
          ...row,
          qualificationSource:
            row.qualificationSource ||
            source
        }));
      const canonicalHoldPartners =
        uniqueEvidenceRows([
          ...(
            isRoleEvidence(
              insideEvidence
            )
              ? [insideEvidence]
              : []
          ),
          ...sourceEvidenceRows(
            holdByBoat,
            "raceFlow.holdBoats"
          )
        ]);
      const canonicalPickupPartners =
        sourceEvidenceRows(
          pickupByBoat,
          "raceFlow.pickupBoats"
        );
      const primaryAttackEvidence =
        roleEvidenceByType.attack.get(
          primaryAttackerBoatNo
        ) ||
        (
          primaryAttackerBoatNo ===
          mainHeadBoatNo
            ? mainHeadEvidence
            : null
        );

      function evidenceCheck({
        key,
        label,
        matched,
        required = true,
        source,
        row,
        role
      }) {
        return {
          key,
          label,
          matched:
            matched === true,
          required:
            required !== false,
          source,
          boatNo:
            boatNo(row) || null,
          role,
          score:
            number(row?.score, 0)
        };
      }

      function exactGoalOrderFor(ticket) {
        const boats =
          exactTicket(ticket);

        return Boolean(
          boats &&
          goalOrder.length >= 3 &&
          boats.every(
            (value, index) =>
              goalOrder[index] === value
          )
        );
      }

      targets.forEach((target) => {
        if (
          !target.roleIntents
            .includes("hold") ||
          target.boatNo ===
            mainHeadBoatNo
        ) {
          return;
        }

        const rawTargetHold =
          target.boatNo === insideBoatNo
            ? insideEvidence
            : holdByBoat.get(
                target.boatNo
              );
        const targetHold =
          rawTargetHold
            ? {
                ...rawTargetHold,
                qualificationSource:
                  rawTargetHold
                    .qualificationSource ||
                  (
                    target.boatNo ===
                    insideBoatNo
                      ? "courseByBoat+boatEvaluation"
                      : "raceFlow.holdBoats"
                  )
              }
            : null;
        const firstMarkHold =
          phases.firstMark?.mainHold ||
          null;
        const backHold =
          phases.back?.hold || null;
        const secondMarkHold =
          phases.secondMark?.mainHold ||
          null;
        const phaseRows = [
          {
            key: "first-mark-hold",
            label:
              "1マークで対象艇が残す",
            source:
              "raceFlow.phases.firstMark.mainHold",
            row: firstMarkHold
          },
          {
            key: "back-hold",
            label:
              "バックで対象艇が残す",
            source:
              "raceFlow.phases.back.hold",
            row: backHold
          },
          {
            key: "second-mark-hold",
            label:
              "2マークで対象艇が残す",
            source:
              "raceFlow.phases.secondMark.mainHold",
            row: secondMarkHold
          }
        ];
        const sharedChecks = [
          evidenceCheck({
            key: "main-head",
            label:
              "主頭を評価正本で確認",
            matched:
              mainHeadBoatNo >= 1,
            source:
              "boatEvaluation.honmei",
            row: mainHeadEvidence,
            role: "head"
          }),
          evidenceCheck({
            key: "main-attacker",
            label:
              "主攻めを展開正本で確認",
            matched:
              primaryAttackerBoatNo >= 1 &&
              isRoleEvidence(
                primaryAttackEvidence
              ),
            source:
              primaryAttackEvidence
                ?.qualificationSource ||
              "raceFlow.attackBoats",
            row:
              primaryAttackEvidence,
            role: "attack"
          }),
          ...phaseRows.map((item) =>
            evidenceCheck({
              key: item.key,
              label: item.label,
              matched:
                boatNo(item.row) ===
                  target.boatNo &&
                isRoleEvidence(
                  item.row
                ),
              source: item.source,
              row: item.row,
              role: "hold"
            })
          )
        ];
        const chronologyComplete =
          isRoleEvidence(targetHold) &&
          sharedChecks.every(
            (check) =>
              !check.required ||
              check.matched
          );

        if (!chronologyComplete) {
          return;
        }

        const pickupPatterns =
          canonicalPickupPartners
            .filter(
              (row) =>
                ![
                  mainHeadBoatNo,
                  target.boatNo
                ].includes(
                  boatNo(row)
                )
            )
            .map((partner) => ({
              type:
                "continuation-pickup",
              partnerType: "pickup",
              second:
                target.boatNo,
              third:
                boatNo(partner),
              position: 2,
              partner,
              summary:
                `${mainHeadBoatNo}号艇の主筋から、` +
                `${target.boatNo}号艇が2着へ追走・残し、` +
                `${boatNo(partner)}号艇が3着で展開を拾う筋。`
            }));
        const insidePatterns =
          isRoleEvidence(
            insideEvidence
          ) &&
          ![
            mainHeadBoatNo,
            target.boatNo
          ].includes(insideBoatNo)
            ? [
                {
                  type:
                    "continuation-inside",
                  partnerType: "inside",
                  second:
                    target.boatNo,
                  third:
                    insideBoatNo,
                  position: 2,
                  partner:
                    insideEvidence,
                  summary:
                    `${mainHeadBoatNo}号艇の主筋から、` +
                    `${target.boatNo}号艇が2着へ追走・残し、` +
                    `${insideBoatNo}号艇が3着で内に残る筋。`
                },
                {
                  type:
                    "inside-continuation",
                  partnerType: "inside",
                  second:
                    insideBoatNo,
                  third:
                    target.boatNo,
                  position: 3,
                  partner:
                    insideEvidence,
                  summary:
                    `${mainHeadBoatNo}号艇の主筋から、` +
                    `${insideBoatNo}号艇が内で2着に残り、` +
                    `${target.boatNo}号艇の3着残りを拾う筋。`
                }
              ]
            : [];
        const otherHoldPatterns =
          canonicalHoldPartners
            .filter(
              (row) =>
                ![
                  mainHeadBoatNo,
                  target.boatNo,
                  insideBoatNo
                ].includes(
                  boatNo(row)
                )
            )
            .map((partner) => ({
              type:
                "continuation-other-hold",
              partnerType:
                "other-hold",
              second:
                target.boatNo,
              third:
                boatNo(partner),
              position: 2,
              partner,
              summary:
                `${mainHeadBoatNo}号艇の主筋から、` +
                `${target.boatNo}号艇が2着へ追走・残し、` +
                `${boatNo(partner)}号艇が3着で残る筋。`
            }));

        [
          ...pickupPatterns,
          ...insidePatterns,
          ...otherHoldPatterns
        ].forEach((pattern) => {
          const ticket =
            `${mainHeadBoatNo}-` +
            `${pattern.second}-` +
            `${pattern.third}`;

          if (
            !exactTicket(ticket) ||
            !isRoleEvidence(
              pattern.partner
            )
          ) {
            return;
          }

          const exactGoalOrder =
            exactGoalOrderFor(ticket);
          const partnerCheck =
            evidenceCheck({
              key:
                `partner-${pattern.partnerType}`,
              label:
                `${pattern.partnerType}のpartnerを正本で確認`,
              matched: true,
              source:
                pattern.partner
                  .qualificationSource ||
                (
                  pattern.partnerType ===
                  "pickup"
                    ? "raceFlow.pickupBoats/boatEvaluation.pickup"
                    : pattern.partnerType ===
                        "inside"
                      ? "courseByBoat+boatEvaluation"
                      : "raceFlow.holdBoats/boatEvaluation.hold"
                ),
              row: pattern.partner,
              role:
                pattern.partnerType ===
                "pickup"
                  ? "pickup"
                  : "hold"
            });
          const checks = [
            ...sharedChecks,
            partnerCheck,
            evidenceCheck({
              key: "exact-goal-order",
              label:
                "ゴール3艇順の完全一致",
              matched:
                exactGoalOrder,
              required: false,
              source:
                "raceFlow.phases.goal.expectedOrder",
              row: null,
              role: "goal"
            })
          ];
          const purchaseEligible =
            number(
              targetHold.score,
              0
            ) >=
              PURCHASE_ROLE_SCORE_MINIMUM &&
            checks.every(
              (check) =>
                !check.required ||
                check.matched
            );

          addBranch({
            id:
              `${target.id}:` +
              `${pattern.type}:` +
              `${ticket}`,
            kind:
              "independent-scenario",
            type: pattern.type,
            ticket,
            target,
            targetPosition:
              pattern.position,
            targetRole: "hold",
            targetEvidence:
              targetHold,
            partnerEvidence:
              pattern.partner,
            title:
              `${mainHeadBoatNo}主筋＋` +
              `${target.boatNo}追走・残し`,
            summary:
              pattern.summary,
            requirement: true,
            requirementId:
              `audit:${target.id}:` +
              `${pattern.type}:` +
              `${ticket}`,
            source:
              "race-flow-phase-continuation",
            qualificationSource:
              "raceFlow.phases+raceFlow.holdBoats",
            purchaseEligible,
            evidenceChecks: checks,
            phaseEvidence: {
              kind:
                "hold-continuation",
              mainHeadBoatNo,
              primaryAttackerBoatNo,
              target:
                evidenceSnapshot(
                  targetHold,
                  "raceFlow.holdBoats"
                ),
              chronology: {
                firstMark:
                  evidenceSnapshot(
                    firstMarkHold,
                    "raceFlow.phases.firstMark.mainHold"
                  ),
                back:
                  evidenceSnapshot(
                    backHold,
                    "raceFlow.phases.back.hold"
                  ),
                secondMark:
                  evidenceSnapshot(
                    secondMarkHold,
                    "raceFlow.phases.secondMark.mainHold"
                  )
              },
              partner: {
                type:
                  pattern.partnerType,
                evidence:
                  evidenceSnapshot(
                    pattern.partner,
                    partnerCheck.source
                  )
              },
              goalOrder: [
                ...goalOrder
              ],
              exactGoalOrder
            }
          });
        });
      });

      /*
        正式な攻め根拠がある評価艇は、印記号に関係なく1着枝を
        作る。attackBoats由来だけを独立枝とし、評価値だけの枝は
        候補保持に留める。
      */
      targets.forEach((target) => {
        const attackEvidence =
          roleEvidenceByType.attack.get(
            target.boatNo
          );

        if (
          !attackEvidence ||
          !target.roleIntents.includes(
            "alternate-head"
          )
        ) {
          return;
        }

        const formalAttack =
          attackByBoat.has(
            target.boatNo
          );
        const secondPartners =
          canonicalHoldPartners
            .filter(
              (row) =>
                boatNo(row) !==
                target.boatNo
            );
        const thirdPartners =
          uniqueEvidenceRows([
            ...canonicalPickupPartners,
            ...canonicalHoldPartners
          ]).filter(
            (row) =>
              boatNo(row) !==
              target.boatNo
          );

        secondPartners.forEach(
          (secondPartner) => {
            thirdPartners.forEach(
              (thirdPartner) => {
                const secondBoatNo =
                  boatNo(secondPartner);
                const thirdBoatNo =
                  boatNo(thirdPartner);
                const ticket =
                  `${target.boatNo}-` +
                  `${secondBoatNo}-` +
                  `${thirdBoatNo}`;

                if (!exactTicket(ticket)) {
                  return;
                }

                const exactGoalOrder =
                  exactGoalOrderFor(
                    ticket
                  );
                const checks = [
                  evidenceCheck({
                    key:
                      "alternate-head-attack",
                    label:
                      "対象艇の正式な攻め根拠",
                    matched:
                      isRoleEvidence(
                        attackEvidence
                      ),
                    source:
                      formalAttack
                        ? "raceFlow.attackBoats"
                        : attackEvidence
                            .qualificationSource,
                    row:
                      attackEvidence,
                    role: "alternate-head"
                  }),
                  evidenceCheck({
                    key:
                      "second-partner-hold",
                    label:
                      "2着partnerの残し根拠",
                    matched:
                      isRoleEvidence(
                        secondPartner
                      ),
                    source:
                      secondPartner
                        .qualificationSource ||
                      "raceFlow.holdBoats/boatEvaluation.hold",
                    row:
                      secondPartner,
                    role: "hold"
                  }),
                  evidenceCheck({
                    key:
                      "third-partner",
                    label:
                      "3着partnerの残し・拾い根拠",
                    matched:
                      isRoleEvidence(
                        thirdPartner
                      ),
                    source:
                      thirdPartner
                        .qualificationSource ||
                      "raceFlow.pickupBoats/raceFlow.holdBoats",
                    row:
                      thirdPartner,
                    role:
                      pickupByBoat.has(
                        thirdBoatNo
                      )
                        ? "pickup"
                        : "hold"
                  }),
                  evidenceCheck({
                    key:
                      "first-mark-attack",
                    label:
                      "1マーク攻め艇との一致",
                    matched:
                      boatNo(
                        phases.firstMark
                          ?.mainAttack
                      ) ===
                        target.boatNo ||
                      boatNo(
                        phases.firstMark
                          ?.secondAttack
                      ) ===
                        target.boatNo,
                    required: false,
                    source:
                      "raceFlow.phases.firstMark",
                    row:
                      (
                        boatNo(
                          phases.firstMark
                            ?.mainAttack
                        ) ===
                        target.boatNo
                          ? phases.firstMark
                              ?.mainAttack
                          : phases.firstMark
                              ?.secondAttack
                      ),
                    role: "attack"
                  }),
                  evidenceCheck({
                    key:
                      "exact-goal-order",
                    label:
                      "ゴール3艇順の完全一致",
                    matched:
                      exactGoalOrder,
                    required: false,
                    source:
                      "raceFlow.phases.goal.expectedOrder",
                    row: null,
                    role: "goal"
                  })
                ];
                const purchaseEligible =
                  formalAttack &&
                  target.defaultRoleIntents
                    .some(
                      role =>
                        role === "head" ||
                        role ===
                          "alternate-head"
                    ) &&
                  number(
                    attackEvidence.score,
                    0
                  ) >=
                    PURCHASE_ROLE_SCORE_MINIMUM &&
                  checks.every(
                    (check) =>
                      !check.required ||
                      check.matched
                  );

                addBranch({
                  id:
                    `${target.id}:` +
                    `alternate-head:${ticket}`,
                  kind:
                    formalAttack
                      ? "independent-scenario"
                      : "role-evidence-candidate",
                  type:
                    "alternate-head-attack",
                  ticket,
                  target,
                  targetPosition: 1,
                  targetRole:
                    "alternate-head",
                  targetEvidence:
                    attackEvidence,
                  partnerEvidence: [
                    secondPartner,
                    thirdPartner
                  ],
                  title:
                    `${target.boatNo}号艇の別攻め`,
                  summary:
                    `${target.boatNo}号艇が攻め切り、` +
                    `${secondBoatNo}号艇が2着に残り、` +
                    `${thirdBoatNo}号艇が3着を拾う筋。`,
                  requirement:
                    formalAttack,
                  requirementId:
                    `audit:${target.id}:` +
                    `alternate-head:${ticket}`,
                  source:
                    formalAttack
                      ? "race-flow-attack-scenario"
                      : "boat-evaluation-attack-candidate",
                  branchAttackerBoatNo:
                    target.boatNo,
                  qualificationSource:
                    formalAttack
                      ? "raceFlow.attackBoats"
                      : attackEvidence
                          .qualificationSource,
                  purchaseEligible,
                  evidenceChecks: checks,
                  phaseEvidence: {
                    kind:
                      "alternate-head",
                    mainHeadBoatNo,
                    primaryAttackerBoatNo,
                    alternateAttackerBoatNo:
                      target.boatNo,
                    attack:
                      evidenceSnapshot(
                        attackEvidence,
                        formalAttack
                          ? "raceFlow.attackBoats"
                          : attackEvidence
                              .qualificationSource
                      ),
                    partners: {
                      second:
                        evidenceSnapshot(
                          secondPartner,
                          "hold"
                        ),
                      third:
                        evidenceSnapshot(
                          thirdPartner,
                          "pickup/hold"
                        )
                    },
                    goalOrder: [
                      ...goalOrder
                    ],
                    exactGoalOrder
                  }
                });
              }
            );
          }
        );
      });

      /*
        raceFlow上の正式なhold/pickup役割には、時系列継続が
        購入条件に届かない場合も同じ役割の候補枝を最低1本残す。
      */
      targets.forEach((target) => {
        const hasRoleBranch = (role) =>
          branches.some(
            (branch) =>
              branch.qualified === true &&
              branch.roles.some(
                (item) =>
                  item.evaluationId ===
                    target.id &&
                  item.role === role
              )
          );
        const alternateRoleHead =
          sourceEvidenceRows(
            roleEvidenceByType.attack,
            "raceFlow.attackBoats/boatEvaluation.attack"
          ).find(
            (row) =>
              boatNo(row) !==
              target.boatNo
          );
        const roleHeadBoatNo =
          target.boatNo ===
          mainHeadBoatNo
            ? (
                boatNo(
                  alternateRoleHead
                ) ||
                [
                  marks.taikou,
                  marks.ana,
                  marks.osae
                ]
                  .map(boatNo)
                  .find(
                    (value) =>
                      value >= 1 &&
                      value <= 6 &&
                      value !==
                        target.boatNo
                  ) ||
                0
              )
            : mainHeadBoatNo;

        if (
          holdByBoat.has(
            target.boatNo
          ) &&
          target.roleIntents.includes(
            "hold"
          ) &&
          !hasRoleBranch("hold")
        ) {
          const targetHold = {
            ...holdByBoat.get(
              target.boatNo
            ),
            qualificationSource:
              "raceFlow.holdBoats"
          };
          const pickupPartner =
            canonicalPickupPartners.find(
              (row) =>
                ![
                  roleHeadBoatNo,
                  target.boatNo
                ].includes(
                  boatNo(row)
                )
            );
          const ticket =
            `${roleHeadBoatNo}-` +
            `${target.boatNo}-` +
            `${boatNo(pickupPartner)}`;

          if (
            exactTicket(ticket) &&
            isRoleEvidence(
              pickupPartner
            )
          ) {
            addBranch({
              id:
                `${target.id}:` +
                `hold-role:${ticket}`,
              kind:
                "role-evidence-candidate",
              type:
                "hold-role-candidate",
              ticket,
              target,
              targetPosition: 2,
              targetRole: "hold",
              targetEvidence:
                targetHold,
              partnerEvidence:
                pickupPartner,
              title:
                `${target.boatNo}号艇の残し候補`,
              summary:
                `${roleHeadBoatNo}号艇の展開で` +
                `${target.boatNo}号艇が2着に残り、` +
                `${boatNo(pickupPartner)}号艇が3着を拾う候補。`,
              source:
                "race-flow-role-candidate",
              qualificationSource:
                "raceFlow.holdBoats",
              purchaseEligible: false,
              evidenceChecks: [
                evidenceCheck({
                  key:
                    "hold-role-source",
                  label:
                    "正式なhold役割",
                  matched: true,
                  source:
                    "raceFlow.holdBoats",
                  row: targetHold,
                  role: "hold"
                }),
                evidenceCheck({
                  key:
                    "pickup-partner-source",
                  label:
                    "3着partnerの拾い根拠",
                  matched: true,
                  source:
                    pickupPartner
                      .qualificationSource ||
                    "raceFlow.pickupBoats",
                  row:
                    pickupPartner,
                  role: "pickup"
                })
              ]
            });
          }
        }

        if (
          pickupByBoat.has(
            target.boatNo
          ) &&
          target.roleIntents.includes(
            "pickup"
          ) &&
          !hasRoleBranch("pickup")
        ) {
          const targetPickup = {
            ...pickupByBoat.get(
              target.boatNo
            ),
            qualificationSource:
              "raceFlow.pickupBoats"
          };
          const holdPartner =
            canonicalHoldPartners.find(
              (row) =>
                ![
                  roleHeadBoatNo,
                  target.boatNo
                ].includes(
                  boatNo(row)
                )
            );
          const ticket =
            `${roleHeadBoatNo}-` +
            `${boatNo(holdPartner)}-` +
            `${target.boatNo}`;

          if (
            exactTicket(ticket) &&
            isRoleEvidence(
              holdPartner
            )
          ) {
            addBranch({
              id:
                `${target.id}:` +
                `pickup-role:${ticket}`,
              kind:
                "role-evidence-candidate",
              type:
                "pickup-role-candidate",
              ticket,
              target,
              targetPosition: 3,
              targetRole: "pickup",
              targetEvidence:
                targetPickup,
              partnerEvidence:
                holdPartner,
              title:
                `${target.boatNo}号艇の拾い候補`,
              summary:
                `${roleHeadBoatNo}号艇の展開で` +
                `${boatNo(holdPartner)}号艇が2着に残り、` +
                `${target.boatNo}号艇が3着を拾う候補。`,
              source:
                "race-flow-role-candidate",
              qualificationSource:
                "raceFlow.pickupBoats",
              purchaseEligible: false,
              evidenceChecks: [
                evidenceCheck({
                  key:
                    "pickup-role-source",
                  label:
                    "正式なpickup役割",
                  matched: true,
                  source:
                    "raceFlow.pickupBoats",
                  row:
                    targetPickup,
                  role: "pickup"
                }),
                evidenceCheck({
                  key:
                    "hold-partner-source",
                  label:
                    "2着partnerの残し根拠",
                  matched: true,
                  source:
                    holdPartner
                      .qualificationSource ||
                    "raceFlow.holdBoats",
                  row:
                    holdPartner,
                  role: "hold"
                })
              ]
            });
          }
        }
      });

      const branchesByTicket =
        new Map();

      branches.forEach((branch) => {
        const current =
          branchesByTicket.get(
            branch.ticket
          ) || [];
        current.push(branch);
        branchesByTicket.set(
          branch.ticket,
          current
        );
      });

      const candidatePool = [];

      boatNumbers.forEach((first) => {
        boatNumbers.forEach((second) => {
          boatNumbers.forEach((third) => {
            const ticket =
              `${first}-${second}-${third}`;
            const boats =
              exactTicket(ticket);

            if (!boats) return;

            const physicalCoverage =
              targets
                .map((target) => {
                  const position =
                    boats.indexOf(
                      target.boatNo
                    ) + 1;

                  if (
                    position < 1 ||
                    !target
                      .eligiblePositions
                      .includes(position)
                  ) {
                    return null;
                  }

                  return {
                    evaluationId:
                      target.id,
                    boatNo:
                      target.boatNo,
                    position,
                    role:
                      position === 1
                        ? (
                            target.roleIntents
                              .includes("head")
                              ? "head"
                              : "alternate-head"
                          )
                        : position === 2
                          ? "hold"
                          : (
                              target.roleIntents
                                .includes("pickup")
                                ? "pickup"
                                : "hold"
                            )
                  };
                })
                .filter(Boolean);

            if (
              !physicalCoverage.length &&
              !branchesByTicket.has(
                ticket
              )
            ) {
              return;
            }

            const ticketBranches =
              branchesByTicket.get(
                ticket
              ) || [];
            const coverage =
              ticketBranches.flatMap(
                (branch) =>
                  branch.roles.map(
                    (role) => ({
                      ...role,
                      position:
                        role
                          .eligiblePositions[0],
                      branchId:
                        branch.id
                    })
                  )
              );
            const independentBranches =
              ticketBranches.filter(
                (branch) =>
                  branch.kind ===
                    "independent-scenario"
              );
            const purchasableIndependentBranches =
              independentBranches.filter(
                (branch) =>
                  branch.purchaseEligible ===
                  true
              );
            const bestBranch =
              [...ticketBranches]
                .sort(
                  (a, b) =>
                    Number(
                      b.purchaseEligible
                    ) -
                      Number(
                        a.purchaseEligible
                      ) ||
                    Number(
                      b.kind ===
                        "independent-scenario"
                    ) -
                      Number(
                        a.kind ===
                          "independent-scenario"
                      ) ||
                    b.priorityScore -
                      a.priorityScore ||
                    a.id.localeCompare(
                      b.id
                    )
                )[0] || null;
            const supportingIndependentBranchIds =
              independentBranches.map(
                (branch) => branch.id
              );
            const presentationByGroup =
              Object.fromEntries(
                formationGroups.map(
                  (group) => {
                    const source =
                      `base-formation:${group.key}`;
                    const groupBranches =
                      ticketBranches.filter(
                        (branch) =>
                          branch.source ===
                          source
                      );
                    const groupBest =
                      [...groupBranches]
                        .sort(
                          (a, b) =>
                            b.priorityScore -
                              a.priorityScore ||
                            a.id.localeCompare(
                              b.id
                            )
                        )[0] || null;
                    const independentSupportSummary =
                      unique(
                        independentBranches
                          .map(
                            (branch) =>
                              branch.summary
                          )
                          .filter(Boolean)
                      ).join(" ");
                    const baseSummary =
                      groupBest?.summary ||
                      "";

                    return [
                      group.key,
                      {
                        source,
                        branchIds:
                          groupBranches.map(
                            (branch) =>
                              branch.id
                          ),
                        supportingIndependentBranchIds: [
                          ...supportingIndependentBranchIds
                        ],
                        title:
                          groupBest?.title ||
                          "",
                        summary:
                          groupBranches.length
                            ? [
                                baseSummary,
                                independentSupportSummary
                              ]
                                .filter(Boolean)
                                .join(" ")
                            : "",
                        structuredEvidence:
                          groupBranches.length
                            ? {
                                source,
                                branchIds:
                                  groupBranches.map(
                                    (branch) =>
                                      branch.id
                                  )
                              }
                            : null
                      }
                    ];
                  }
                )
              );

            candidatePool.push({
              id:
                `candidate:${ticket}`,
              ticket,
              category:
                "展開候補",
              candidateKind:
                independentBranches
                  .length
                  ? "independent-scenario"
                  : ticketBranches.length
                    ? "canonical-formation"
                    : "evaluation-coverage",
              branchIds:
                ticketBranches.map(
                  (branch) =>
                    branch.id
                ),
              allBranchIds:
                ticketBranches.map(
                  (branch) =>
                    branch.id
                ),
              independentBranchIds: [
                ...supportingIndependentBranchIds
              ],
              supportingIndependentBranchIds: [
                ...supportingIndependentBranchIds
              ],
              requirementIds:
                unique(
                  independentBranches.map(
                    (branch) =>
                      branch
                        .requirementId ||
                      branch.id
                  )
                ),
              coverage,
              physicalCoverage,
              coveredEvaluationIds:
                unique(
                  coverage.map(
                    (claim) =>
                      claim.evaluationId
                  )
                ),
              coveredBoatNos:
                unique(
                  coverage.map(
                    (claim) =>
                      claim.boatNo
                  )
                ),
              candidateOnlyEvaluationIds:
                unique(
                  physicalCoverage.map(
                    (claim) =>
                      claim.evaluationId
                  )
                ),
              evidenceQualified:
                ticketBranches.length > 0,
              purchaseEligible:
                purchasableIndependentBranches
                  .length > 0,
              expansionEligible:
                purchasableIndependentBranches
                  .length > 0,
              preservationRequired: false,
              coverageKey:
                independentBranches
                  .map(
                    (branch) =>
                      branch.id
                  )
                  .join("|") ||
                `physical:${ticket}`,
              priorityScore:
                bestBranch
                  ?.priorityScore || 0,
              evidenceReasons:
                unique(
                  ticketBranches
                    .map(
                      (branch) =>
                        branch.reason
                    )
                    .filter(Boolean)
                ),
              scenarioTitle:
                bestBranch?.title ||
                `${ticket}の成立候補`,
              scenarioSummary:
                bestBranch?.summary ||
                `${ticket}は評価印の着順に対応する物理候補。` +
                "構造化された成立枝がないため、自動購入へは昇格しない。",
              comment:
                bestBranch?.summary ||
                `${ticket}は候補として保持。` +
                "構造化根拠を確認できるまで実戦厳選へ追加しない。",
              structuredEvidence:
                bestBranch
                  ? {
                      branchIds:
                        ticketBranches.map(
                          (branch) =>
                            branch.id
                        ),
                      source:
                        bestBranch.source
                    }
                  : null,
              presentationByGroup
            });
          });
        });
      });

      const candidateByTicket =
        new Map(
          candidatePool.map(
            (candidate) => [
              candidate.ticket,
              candidate
            ]
          )
        );

      targets.forEach((target) => {
        target.candidateTickets =
          candidatePool
            .filter((candidate) =>
              candidate
                .physicalCoverage
                .some(
                  (claim) =>
                    claim
                      .evaluationId ===
                    target.id
                )
            )
            .map(
              (candidate) =>
                candidate.ticket
            );
        target.qualifiedCandidateTickets =
          candidatePool
            .filter((candidate) =>
              candidate.coverage.some(
                (claim) =>
                  claim.evaluationId ===
                  target.id
              )
            )
            .map(
              (candidate) =>
                candidate.ticket
            );
        target.status =
          target
            .qualifiedCandidateTickets
            .length
            ? "structured-candidate-generated"
            : "candidate-only-no-structured-evidence";
      });

      return {
        marks,
        evaluations,
        targets,
        branches,
        candidatePool,
        candidateByTicket,
        courseByBoat:
          Object.fromEntries(
            courseByBoat
          ),
        mainHeadBoatNo,
        primaryAttackerBoatNo,
        scenarioTitle,
        scenarioSummary,
        integrity: {
          targets,
          primaryAttackerBoatNo,
          missingPhysicalCandidateTargetIds:
            targets
              .filter(
                (target) =>
                  !target
                    .candidateTickets
                    .length
              )
              .map(
                (target) =>
                  target.id
              ),
          missingStructuredEvidenceTargetIds:
            targets
              .filter(
                (target) =>
                  !target
                    .qualifiedCandidateTickets
                    .length
              )
              .map(
                (target) =>
                  target.id
              )
        }
      };
    }

    return Object.freeze({
      MARK_DEFINITIONS,
      exactTicket,
      build
    });
  }
);
