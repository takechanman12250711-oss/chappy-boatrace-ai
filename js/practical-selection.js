/* =========================================================
  チャッピーボートレースAI
  実戦厳選・共通処理

  役割：
  - アプリ・note・自動保存で同じ買い目を返す
  - 本線3＋押さえ2を基本5点とする
  - 同一展開・同一1/2着軸の根拠がそろう場合だけ流し2点を追加する
  - 流し2点が成立しない場合だけ万舟1点を追加する
  - 検証済みの独立展開だけ最大10点へ広げる
  - 評価候補の保持と、実際の購入を分離する
========================================================= */

(function (root) {
  "use strict";

  const STANDARD_COUNT = 5;
  const NORMAL_MAXIMUM_COUNT = 7;
  const MAXIMUM_COUNT = 10;
  const FLOW_GROUP_COUNT = 2;
  const MINIMUM_FLOW_ROLE_SCORE = 65;
  const MINIMUM_CANDIDATE_PROMOTION_SCORE =
    90;
  const TARGET_SELECTED_PHYSICAL_PREVIEW_COUNT =
    1;
  const TARGET_EXCLUDED_PREVIEW_COUNT =
    2;
  const EXCLUDED_INDEPENDENT_PREVIEW_COUNT =
    4;
  const THEORY_SCHEMA_VERSION = 1;
  const THEORY_SET_FINGERPRINT =
    "structured-ticket-support-v1:flow+holdPickup";
  const THEORY_DEFINITIONS =
    Object.freeze({
      flow: Object.freeze({
        theoryKey: "flow",
        label: "展開",
        theoryVersion:
          "evaluated-scenarios-v1"
      }),
      holdPickup:
        Object.freeze({
          theoryKey:
            "holdPickup",
          label: "残し・拾い",
          theoryVersion:
            "structured-role-evidence-v1"
        })
    });
  const ROLE_LABELS = Object.freeze({
    head: "1着軸",
    "alternate-head": "攻め頭",
    attack: "攻め",
    hold: "残し",
    inside: "内残し",
    pickup: "拾い"
  });

  function arrayify(value) {
    if (Array.isArray(value)) return value;
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return [];
    }
    return [value];
  }

  function validTicket(ticket) {
    if (
      !/^[1-6]-[1-6]-[1-6]$/.test(ticket)
    ) {
      return false;
    }

    return new Set(ticket.split("-")).size === 3;
  }

  function ticketBoats(ticket) {
    return validTicket(ticket)
      ? ticket.split("-").map(Number)
      : [];
  }

  function boatNo(value) {
    return Number(
      value?.boatNo ??
      value?.number ??
      value?.waku ??
      0
    ) || 0;
  }

  function numeric(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  }

  function unique(values) {
    return [
      ...new Set(
        arrayify(values).filter(
          value =>
            value !== null &&
            value !== undefined &&
            value !== ""
        )
      )
    ];
  }

  function roleLabel(
    role,
    position
  ) {
    if (role === "hold") {
      return position === 2
        ? "2着残し"
        : position === 3
          ? "3着残り"
          : ROLE_LABELS.hold;
    }
    if (role === "pickup") {
      return position === 3
        ? "3着拾い"
        : ROLE_LABELS.pickup;
    }
    if (role === "alternate-head") {
      return "別頭";
    }
    return (
      ROLE_LABELS[role] ||
      `${position}着役割`
    );
  }

  function roleLabelsFor(row) {
    const boats =
      ticketBoats(row?.ticket);
    const byPosition =
      new Map();

    [
      ...arrayify(row?.coverage),
      ...arrayify(
        row?.flowRoleEvidence
      )
    ]
      .filter(claim => {
        const position =
          Number(
            claim?.position || 0
          );
        const targetBoatNo =
          Number(
            claim?.boatNo || 0
          );

        return (
          position >= 1 &&
          position <= 3 &&
          boats[position - 1] ===
            targetBoatNo
        );
      })
      .forEach(claim => {
        const position =
          Number(claim.position);
        const role =
          String(
            claim.role || ""
          );
        const key =
          `${claim.boatNo}|${role}`;

        if (
          !byPosition.has(position)
        ) {
          byPosition.set(
            position,
            new Map()
          );
        }

        byPosition
          .get(position)
          .set(key, {
            boatNo:
              Number(claim.boatNo),
            position,
          role,
          label:
              roleLabel(
                role,
                position
              ),
            structured: true
          });
      });

    return boats.flatMap(
      (targetBoatNo, index) => {
        const position = index + 1;
        const structured =
          byPosition.has(position)
            ? [
                ...byPosition
                  .get(position)
                  .values()
              ]
            : [];

        return structured.length
          ? structured
          : [{
              boatNo:
                targetBoatNo,
              position,
              role: "position",
              label:
                `${position}着候補`,
              structured: false
            }];
      }
    );
  }

  function compactRoleLabels(
    roles
  ) {
    return arrayify(roles)
      .map(role => ({
        boatNo:
          Number(
            role?.boatNo || 0
          ),
        position:
          Number(
            role?.position || 0
          ),
        role:
          String(
            role?.role || ""
          ),
        label:
          String(
            role?.label || ""
          ),
        structured:
          role?.structured === true
      }))
      .filter(
        role =>
          role.boatNo &&
          role.position
      );
  }

  function compactAudit(selection) {
    if (
      !selection ||
      typeof selection !== "object"
    ) {
      return null;
    }

    const excludedIndependent =
      arrayify(
        selection
          .excludedCandidates
      )
        .filter(
          item =>
            arrayify(
              item
                ?.requirementIds
            ).length > 0
        )
        .sort(
          (a, b) =>
            numeric(
              b?.priorityScore,
              0
            ) -
              numeric(
                a?.priorityScore,
                0
              ) ||
            String(
              a?.ticket || ""
            ).localeCompare(
              String(
                b?.ticket || ""
              )
            )
        );

    return {
      status:
        String(
          selection.status || ""
        ),
      reason:
        String(
          selection.reason || ""
        ),
      standardCount:
        Number(
          selection
            .standardCount || 0
        ),
      normalMaximumCount:
        Number(
          selection
            .normalMaximumCount || 0
        ),
      maximumCount:
        Number(
          selection
            .maximumCount || 0
        ),
      expansionSummary:
        selection
          .expansionSummary ||
        null,
      targetDecisions:
        arrayify(
          selection
            .targetDecisions
        ).map(decision => ({
          evaluationId:
            String(
              decision
                ?.evaluationId || ""
            ),
          boatNo:
            Number(
              decision?.boatNo || 0
            ),
          symbol:
            String(
              decision?.symbol || ""
            ),
          selected:
            decision?.selected === true,
          selectedTickets:
            arrayify(
              decision
                ?.selectedTickets
            ).map(String),
          adoptionSupported:
            decision
              ?.adoptionSupported === true,
          supportedSelectedTickets:
            arrayify(
              decision
                ?.supportedSelectedTickets
            ).map(String),
          candidateCount:
            Number(
              decision
                ?.candidateCount || 0
            ),
          selectedCandidateCount:
            Number(
              decision
                ?.selectedCandidateCount ||
              0
            ),
          excludedCandidateCount:
            Number(
              decision
                ?.excludedCandidateCount ||
              0
            ),
          hiddenCandidateCount:
            Number(
              decision
                ?.hiddenCandidateCount ||
              0
            ),
          candidateDecisions:
            arrayify(
              decision
                ?.candidateDecisions
            ).map(row => ({
              ticket:
                String(
                  row?.ticket || ""
                ),
              ticketSelected:
                row
                  ?.ticketSelected ===
                true,
              relation:
                String(
                  row?.relation || ""
                ),
              reasonCode:
                String(
                  row
                    ?.reasonCode || ""
                ),
              reason:
                row?.ticketSelected === true ||
                String(
                  row?.reasonCode || ""
                )
                  ? ""
                  : String(
                      row?.reason || ""
                    ),
              priorityScore:
                numeric(
                  row
                    ?.priorityScore,
                  0
                ),
              roleLabels:
                compactRoleLabels(
                  row?.roleLabels
                )
            })),
          bestCandidateTicket:
            String(
              decision
                ?.bestCandidateTicket ||
              ""
            ),
          bestCandidateScore:
            numeric(
              decision
                ?.bestCandidateScore,
              0
            ),
          selectionBoundary:
            decision
              ?.selectionBoundary ??
            null,
          comparisonTicket:
            String(
              decision
                ?.comparisonTicket ||
              ""
            ),
          comparisonScore:
            decision
              ?.comparisonScore ??
            null,
          scoreGap:
            decision?.scoreGap ??
            null,
          reasonCode:
            String(
              decision
                ?.reasonCode || ""
            ),
          reason:
            String(
              decision?.reason || ""
            )
        })),
      excludedIndependentCount:
        excludedIndependent.length,
      excludedIndependentCandidates:
        excludedIndependent
          .slice(
            0,
            EXCLUDED_INDEPENDENT_PREVIEW_COUNT
          )
          .map(item => ({
            ticket:
              String(
                item?.ticket || ""
              ),
            requirementIds:
              arrayify(
                item
                  ?.requirementIds
              ).map(String),
            branchIds:
              arrayify(
                item?.branchIds
              ).map(String),
            coveredEvaluationIds:
              arrayify(
                item
                  ?.coveredEvaluationIds
              ).map(String),
            priorityScore:
              numeric(
                item
                  ?.priorityScore,
                0
              ),
            reasonCode:
              String(
                item
                  ?.reasonCode || ""
              ),
            reason:
              String(
                item?.reason || ""
              )
          }))
    };
  }

  function categoryKey(category) {
    const value =
      String(category || "").trim();

    if (
      value === "main" ||
      value === "本線"
    ) {
      return "main";
    }
    if (
      value === "cover" ||
      value === "safety" ||
      value === "押さえ"
    ) {
      return "cover";
    }
    if (
      value === "flow" ||
      value === "nagashi" ||
      value === "流し"
    ) {
      return "flow";
    }
    if (
      value === "hole" ||
      value === "longshot" ||
      value === "万舟・穴" ||
      value === "穴候補"
    ) {
      return "hole";
    }
    return "possibility";
  }

  /*
    Builder の category 別 presentation はここだけで解決する。
    schema が欠ける場合は元行へ戻すが、branch 検証側は fail-closed。
  */
  function presentationFor(
    item,
    sourceCategory
  ) {
    if (
      !item ||
      typeof item !== "object" ||
      sourceCategory === "possibility"
    ) {
      return null;
    }

    const aliases = {
      main: ["main", "本線"],
      cover: [
        "cover",
        "safety",
        "押さえ"
      ],
      flow: [
        "flow",
        "nagashi",
        "流し"
      ],
      hole: [
        "hole",
        "longshot",
        "穴",
        "万舟・穴"
      ]
    }[sourceCategory] || [];
    const containers = [
      item.presentations,
      item.presentationByCategory,
      item.presentationByGroup,
      item.categoryPresentations,
      item.presentation
    ];

    for (const container of containers) {
      if (!container) continue;

      if (Array.isArray(container)) {
        const found =
          container.find(
            value =>
              categoryKey(
                value?.sourceCategory ||
                value?.categoryKey ||
                value?.category
              ) === sourceCategory
          );
        if (found) return found;
        continue;
      }

      if (
        typeof container !== "object"
      ) {
        continue;
      }

      for (const alias of aliases) {
        if (
          container[alias] &&
          typeof container[alias] ===
            "object"
        ) {
          return container[alias];
        }
      }

      if (
        categoryKey(
          container.sourceCategory ||
          container.categoryKey ||
          container.category
        ) === sourceCategory
      ) {
        return container;
      }
    }

    return null;
  }

  function normalizeTicket(
    item,
    category,
    explicitSourceCategory
  ) {
    const original =
      typeof item === "string"
        ? { ticket: item }
        : item || {};
    const sourceCategory =
      explicitSourceCategory ||
      categoryKey(category);
    const presentation =
      presentationFor(
        original,
        sourceCategory
      );
    const row = {
      ...original,
      ...(presentation || {})
    };
    const scopedSummary =
      String(
        presentation?.scenarioSummary ||
        presentation?.summary ||
        ""
      );
    const ticket = String(
      row.ticket ||
      row.line ||
      row.formation ||
      ""
    ).trim();
    const numbers =
      ticket.split("-");
    const generatedComment =
      validTicket(ticket)
        ? `${numbers[0]}号艇1着、` +
          `${numbers[1]}号艇の2着残し、` +
          `${numbers[2]}号艇の3着拾いを評価。`
        : "";

    return {
      ...row,
      ticket,
      category,
      displayCategory:
        original.displayCategory ||
        original.category ||
        category,
      sourceCategory,
      scenarioTitle:
        String(
          presentation?.scenarioTitle ||
          presentation?.title ||
          row.scenarioTitle ||
          ""
        ),
      scenarioSummary:
        scopedSummary ||
        String(
          row.scenarioSummary ||
          row.summary ||
          ""
        ),
      scenarioType: String(
        row.scenarioType ||
        arrayify(
          row.scenarioTypes
        )[0] ||
        ""
      ),
      odds:
        Number.isFinite(Number(row.odds)) &&
        Number(row.odds) > 0
          ? Number(row.odds)
          : 0,
      amount: 0,
      comment: String(
        scopedSummary ||
        row.scenarioSummary ||
        row.summary ||
        row.comment ||
        row.reason ||
        generatedComment
      ),
      branchIds:
        arrayify(
          sourceCategory ===
            "possibility"
            ? (
                original.allBranchIds ||
                original.branchIds ||
                row.allBranchIds ||
                row.branchIds
              )
            : (
                presentation
                  ?.branchIds ||
                row.branchIds
              )
        )
          .map(String)
          .filter(Boolean),
      allBranchIds:
        unique(
          original.allBranchIds ||
          original.branchIds ||
          row.allBranchIds ||
          row.branchIds
        ).map(String),
      requirementIds:
        arrayify(row.requirementIds)
          .map(String)
          .filter(Boolean),
      coverage:
        arrayify(row.coverage)
          .filter(
            (claim) =>
              claim &&
              typeof claim === "object"
          ),
      physicalCoverage:
        arrayify(
          row.physicalCoverage
        ).filter(
          (claim) =>
            claim &&
            typeof claim === "object"
        ),
      coveredEvaluationIds:
        arrayify(
          row.coveredEvaluationIds
        )
          .map(String)
          .filter(Boolean),
      coveredBoatNos:
        arrayify(row.coveredBoatNos)
          .map(Number)
          .filter(
            (boatNo) =>
              boatNo >= 1 &&
              boatNo <= 6
          ),
      candidateOnlyEvaluationIds:
        arrayify(
          row.candidateOnlyEvaluationIds
        )
          .map(String)
          .filter(Boolean),
      evidenceReasons:
        arrayify(row.evidenceReasons)
          .map(String)
          .filter(Boolean),
      priorityScore:
        Number.isFinite(
          Number(row.priorityScore)
        )
          ? Number(row.priorityScore)
          : 0
    };
  }

  function ticketLists(prediction) {
    return {
      main: arrayify(
        prediction?.mainSheet?.tickets ||
        prediction?.ticketSheets?.main
      ),
      cover: arrayify(
        prediction?.mainSheet?.coverTickets ||
        prediction?.ticketSheets?.cover
      ),
      flow: arrayify(
        prediction?.mainSheet?.flowTickets ||
        prediction?.ticketSheets?.flow
      ),
      longshot: arrayify(
        prediction?.manshuSheet?.tickets ||
        prediction?.ticketSheets?.hole
      ),
      possibility: arrayify(
        prediction?.ticketSheets
          ?.possibility ||
        prediction?.aiCore?.formations
          ?.possibilityCandidates ||
        prediction?.formations
          ?.possibilityCandidates
      )
    };
  }

  function evidenceOf(prediction) {
    const formations =
      prediction?.aiCore?.formations ||
      prediction?.formations ||
      {};
    const evidence =
      formations.evidence || {};

    return {
      ...evidence,
      mainEstablished:
        formations.mainEstablished === true,
      flow:
        evidence.flow === true,
      longshot:
        evidence.longshot === true,
      evaluatedTargets:
        arrayify(
          evidence.evaluatedTargets
        ),
      branches:
        arrayify(evidence.branches),
      primaryAttackerBoatNo:
        Number(
          evidence
            .primaryAttackerBoatNo || 0
        ),
      raceFlow:
        prediction?.raceFlow || {},
      mainHeadBoatNo:
        boatNo(
          prediction?.mainSheet?.honmei ||
          prediction?.boatEvaluation
            ?.honmei
        ),
      evaluations:
        arrayify(
          prediction?.boatEvaluation
            ?.evaluations ||
          prediction?.mainSheet
            ?.evaluations ||
          evidence.evaluations
        )
    };
  }

  function createValidationContext(
    evidence
  ) {
    const targetsById =
      new Map(
        evidence.evaluatedTargets
          .map((target) => [
            String(target?.id || ""),
            target
          ])
          .filter(([id]) => id)
      );
    const branchesById =
      new Map(
        evidence.branches
          .map((branch) => [
            String(branch?.id || ""),
            branch
          ])
          .filter(([id]) => id)
      );
    const evaluationsByBoat =
      new Map(
        evidence.evaluations
          .map((evaluation) => [
            boatNo(evaluation),
            evaluation
          ])
          .filter(
            ([number]) =>
              number >= 1 &&
              number <= 6
          )
      );
    const raceFlow =
      evidence.raceFlow || {};
    const phases =
      raceFlow.phases || {};

    return {
      targetsById,
      branchesById,
      evaluationsByBoat,
      raceFlow,
      phases,
      mainHeadBoatNo:
        Number(
          evidence.mainHeadBoatNo || 0
        ),
      primaryAttackerBoatNo:
        Number(
          evidence
            .primaryAttackerBoatNo || 0
        )
    };
  }

  function branchSourceCategory(branch) {
    const source =
      String(branch?.source || "");
    const match =
      /^base-formation:(main|cover|flow|hole)$/
        .exec(source);

    return match ? match[1] : "";
  }

  function roleRows(context, role) {
    const flow =
      context.raceFlow || {};
    const phases =
      context.phases || {};

    if (
      role === "attack" ||
      role === "head" ||
      role === "alternate-head"
    ) {
      return [
        ...arrayify(flow.attackBoats),
        phases.start?.leader,
        phases.firstMark?.mainAttack,
        phases.firstMark?.secondAttack,
        phases.back?.leader
      ].filter(Boolean);
    }
    if (
      role === "hold" ||
      role === "inside"
    ) {
      return [
        ...arrayify(flow.holdBoats),
        phases.firstMark?.mainHold,
        phases.back?.hold,
        phases.secondMark?.mainHold
      ].filter(Boolean);
    }
    if (role === "pickup") {
      return [
        ...arrayify(flow.pickupBoats),
        phases.back?.pickup,
        phases.secondMark?.mainPickup,
        phases.secondMark?.secondPickup
      ].filter(Boolean);
    }
    return [];
  }

  function roleEvidence(
    context,
    role,
    targetBoatNo
  ) {
    return roleRows(context, role)
      .find(
        row =>
          boatNo(row) === targetBoatNo
      ) || null;
  }

  function courseOf(context, targetBoatNo) {
    const evaluation =
      context.evaluationsByBoat.get(
        targetBoatNo
      );
    const direct =
      numeric(evaluation?.course, 0);

    if (direct >= 1 && direct <= 6) {
      return direct;
    }

    const row = [
      ...roleRows(context, "attack"),
      ...roleRows(context, "hold"),
      ...roleRows(context, "pickup")
    ].find(
      item =>
        boatNo(item) === targetBoatNo
    );
    const fallback =
      numeric(row?.course, 0);

    return fallback >= 1 &&
      fallback <= 6
      ? fallback
      : 0;
  }

  function roleClaimsOf(
    branch,
    context,
    boats
  ) {
    const claims = [];
    let mismatch = false;

    arrayify(branch.roles).forEach(
      role => {
        const evaluationId =
          String(
            role?.evaluationId || ""
          );
        const target =
          context.targetsById.get(
            evaluationId
          );
        const positions =
          arrayify(
            role?.eligiblePositions
          ).map(Number);
        const claimedRole =
          String(role?.role || "");
        const targetBoatNo =
          Number(role?.boatNo || 0);
        const targetPositions =
          arrayify(
            target?.eligiblePositions
          ).map(Number);
        const targetRoles =
          arrayify(
            target?.roleIntents
          ).map(String);

        if (
          !target ||
          targetBoatNo !==
            Number(target.boatNo) ||
          positions.length !== 1
        ) {
          mismatch = true;
          return;
        }

        const position = positions[0];
        const roleAccepted =
          targetRoles.includes(
            claimedRole
          ) ||
          (
            claimedRole ===
              "alternate-head" &&
            targetRoles.includes("head")
          );

        if (
          !roleAccepted ||
          !targetPositions.includes(
            position
          ) ||
          boats[position - 1] !==
            targetBoatNo
        ) {
          mismatch = true;
          return;
        }

        claims.push({
          evaluationId,
          boatNo: targetBoatNo,
          role: claimedRole,
          position,
          branchId:
            String(branch.id || "")
        });
      }
    );

    return {
      claims,
      mismatch
    };
  }

  function livePhaseBoat(
    context,
    check
  ) {
    const key =
      String(
        check?.key ||
        check?.source ||
        ""
      ).toLowerCase();
    const role =
      String(check?.role || "")
        .toLowerCase();
    const phases =
      context.phases || {};

    if (key.includes("main-head")) {
      return context.mainHeadBoatNo;
    }
    if (
      key.includes("main-attacker")
    ) {
      return context
        .primaryAttackerBoatNo;
    }
    if (
      key.includes("first") ||
      key.includes("1mark") ||
      key.includes("1マーク")
    ) {
      if (role.includes("attack")) {
        return boatNo(
          phases.firstMark?.mainAttack
        );
      }
      if (
        role.includes("hold") ||
        role.includes("inside")
      ) {
        return boatNo(
          phases.firstMark?.mainHold
        );
      }
    }
    if (key.includes("back")) {
      if (
        role.includes("attack") ||
        role.includes("head") ||
        role.includes("leader")
      ) {
        return boatNo(
          phases.back?.leader
        );
      }
      if (
        role.includes("hold") ||
        role.includes("inside")
      ) {
        return boatNo(
          phases.back?.hold
        );
      }
      if (role.includes("pickup")) {
        return boatNo(
          phases.back?.pickup
        );
      }
    }
    if (
      key.includes("second-mark") ||
      key.includes("secondmark") ||
      key.includes("2mark") ||
      key.includes("2マーク")
    ) {
      if (
        role.includes("hold") ||
        role.includes("inside")
      ) {
        return boatNo(
          phases.secondMark?.mainHold
        );
      }
      if (role.includes("pickup")) {
        const targetBoatNo =
          boatNo(check);
        return [
          phases.secondMark?.mainPickup,
          phases.secondMark?.secondPickup
        ].some(
          row =>
            boatNo(row) ===
            targetBoatNo
        )
          ? targetBoatNo
          : 0;
      }
    }
    if (
      key.includes("start") &&
      (
        role.includes("attack") ||
        role.includes("head") ||
        role.includes("leader")
      )
    ) {
      return boatNo(
        phases.start?.leader
      );
    }

    return 0;
  }

  /*
    独立枝の schema 読み取りはここへ隔離する。
    object check・phaseEvidence が欠ける旧枝は購入不可。
  */
  function validateIndependentBranch(
    branch,
    context,
    boats,
    claims
  ) {
    const phaseEvidence =
      branch?.phaseEvidence;
    const checks =
      arrayify(branch?.evidenceChecks);

    if (
      !phaseEvidence ||
      typeof phaseEvidence !==
        "object" ||
      Array.isArray(phaseEvidence) ||
      !checks.length ||
      checks.some(
        check =>
          !check ||
          typeof check !== "object" ||
          Array.isArray(check) ||
          (
            check.required !== false &&
            check.matched !== true
          ) ||
          !String(check.source || "") ||
          (
            check.required !== false &&
            (
              boatNo(check) < 1 ||
              boatNo(check) > 6
            )
          )
      )
    ) {
      return {
        purchaseEligible: false,
        reasonCode:
          "INVALID_PHASE_EVIDENCE"
      };
    }

    const kind =
      String(phaseEvidence.kind || "");
    const usesAlternateScenario =
      String(
        branch.qualificationSource ||
        ""
      ).includes(
        "raceFlow.alternateScenarioRoles"
      ) ||
      branch.source ===
        "preserved-alternate-attack-scenario";
    const alternateRoles =
      context.raceFlow
        ?.alternateScenarioRoles || {};
    const roleContext =
      usesAlternateScenario
        ? {
            ...context,
            raceFlow: {
              ...context.raceFlow,
              attackBoats: [
                ...arrayify(
                  context.raceFlow
                    ?.attackBoats
                ),
                ...arrayify(
                  alternateRoles.attackBoats
                )
              ],
              holdBoats: [
                ...arrayify(
                  context.raceFlow
                    ?.holdBoats
                ),
                ...arrayify(
                  alternateRoles.holdBoats
                )
              ],
              pickupBoats: [
                ...arrayify(
                  context.raceFlow
                    ?.pickupBoats
                ),
                ...arrayify(
                  alternateRoles.pickupBoats
                )
              ]
            },
            phases:
              alternateRoles.phases ||
              context.phases
          }
        : context;
    const priorityScore =
      numeric(branch.priorityScore, 0);
    const goalOrder =
      arrayify(
        phaseEvidence.goalOrder
      ).map(
        value =>
          boatNo(value) ||
          numeric(value, 0)
      );

    const liveGoalOrder =
      arrayify(
        context.phases?.goal
          ?.expectedOrder
      ).map(boatNo);

    if (
      goalOrder.length !== 3 ||
      liveGoalOrder.length !== 3 ||
      goalOrder.some(
        (value, index) =>
          value !==
          liveGoalOrder[index]
      ) ||
      priorityScore < 65
    ) {
      return {
        purchaseEligible: false,
        reasonCode:
          priorityScore < 65
            ? "BELOW_SCORE_THRESHOLD"
            : "PHASE_GOAL_SOURCE_MISMATCH"
      };
    }

    if (
      !String(
        branch.qualificationSource ||
        ""
      ) ||
      (
        kind === "hold-continuation" &&
        branch.source !==
          "race-flow-phase-continuation"
      ) ||
      (
        kind === "alternate-head" &&
        ![
          "race-flow-attack-scenario",
          "preserved-alternate-attack-scenario"
        ].includes(branch.source)
      )
    ) {
      return {
        purchaseEligible: false,
        reasonCode:
          "INVALID_QUALIFICATION_SOURCE"
      };
    }

    const checkMatchesLive =
      checks.every(check => {
        if (check.required === false) {
          return true;
        }

        const expectedBoatNo =
          boatNo(check);
        const role =
          String(check.role || "");
        const liveBoatNo =
          livePhaseBoat(
            roleContext,
            check
          );
        const checkKey =
          String(
            check.key ||
            check.source ||
            ""
          ).toLowerCase();

        if (liveBoatNo) {
          return liveBoatNo ===
            expectedBoatNo;
        }

        if (
          checkKey.includes("goal")
        ) {
          const position =
            numeric(
              check.position,
              boats.indexOf(
                expectedBoatNo
              ) + 1
            );
          return position >= 1 &&
            position <= 3 &&
            boats[position - 1] ===
              expectedBoatNo;
        }

        if (
          checkKey.includes("inside") ||
          String(check.source || "")
            .includes("courseByBoat")
        ) {
          return courseOf(
            roleContext,
            expectedBoatNo
          ) === 1;
        }

        if (role === "course") {
          return courseOf(
            roleContext,
            expectedBoatNo
          ) ===
            numeric(check.course, 0);
        }

        return Boolean(
          roleEvidence(
            roleContext,
            role,
            expectedBoatNo
          )
        );
      });

    if (!checkMatchesLive) {
      return {
        purchaseEligible: false,
        reasonCode:
          "PHASE_EVIDENCE_MISMATCH"
      };
    }

    if (kind === "alternate-head") {
      const attackerBoatNo =
        Number(
          branch.attackerBoatNo || 0
        );
      const attack =
        phaseEvidence.attack || {};
      const liveAttack =
        roleEvidence(
          roleContext,
          "attack",
          attackerBoatNo
        );
      const attackScore =
        numeric(attack.score, 0);

      if (
        attackerBoatNo !== boats[0] ||
        boatNo(attack) !==
          attackerBoatNo ||
        !liveAttack ||
        attackScore < 65 ||
        numeric(liveAttack?.score, 0) <
          65 ||
        (
          numeric(attack.course, 0) >
            0 &&
          numeric(attack.course, 0) !==
            courseOf(
              roleContext,
              attackerBoatNo
            )
        )
      ) {
        return {
          purchaseEligible: false,
          reasonCode:
            "ALTERNATE_HEAD_MISMATCH"
        };
      }
    } else if (
      kind === "hold-continuation"
    ) {
      const target =
        phaseEvidence.target || {};
      const targetBoatNo =
        boatNo(target);
      const targetPosition =
        numeric(
          target.position,
          claims.find(
            claim =>
              claim.boatNo ===
              targetBoatNo
          )?.position || 0
        );
      const liveHold =
        roleEvidence(
          roleContext,
          "hold",
          targetBoatNo
        );
      const targetScore =
        numeric(target.score, 0);
      const chronology =
        phaseEvidence.chronology || {};
      const chronologyMatches =
        [
          [
            chronology.firstMark,
            roleContext.phases
              ?.firstMark?.mainHold
          ],
          [
            chronology.back,
            roleContext.phases?.back?.hold
          ],
          [
            chronology.secondMark,
            roleContext.phases
              ?.secondMark?.mainHold
          ]
        ].every(
          ([declared, live]) =>
            boatNo(declared) ===
              targetBoatNo &&
            boatNo(live) ===
              targetBoatNo
        );

      if (
        targetBoatNo < 1 ||
        targetPosition < 1 ||
        targetPosition > 3 ||
        boats[targetPosition - 1] !==
          targetBoatNo ||
        !claims.some(
          claim =>
            claim.boatNo ===
              targetBoatNo &&
            claim.position ===
              targetPosition
        ) ||
        !liveHold ||
        targetScore < 65 ||
        numeric(liveHold?.score, 0) <
          65 ||
        !chronologyMatches ||
        (
          numeric(target.course, 0) >
            0 &&
          numeric(target.course, 0) !==
            courseOf(
              roleContext,
              targetBoatNo
            )
        )
      ) {
        return {
          purchaseEligible: false,
          reasonCode:
            targetScore < 65
              ? "BELOW_SCORE_THRESHOLD"
              : "HOLD_CONTINUATION_MISMATCH"
        };
      }
    } else {
      return {
        purchaseEligible: false,
        reasonCode:
          "UNKNOWN_PHASE_EVIDENCE_KIND"
      };
    }

    if (kind === "hold-continuation") {
      const partner =
        phaseEvidence.partner || {};
      const partnerEvidence =
        partner.evidence || {};
      const partnerBoatNo =
        boatNo(partnerEvidence);
      const partnerType =
        String(partner.type || "");
      const partnerPosition =
        boats.indexOf(partnerBoatNo) + 1;
      const livePartner =
        partnerType === "inside"
          ? (
              courseOf(
                roleContext,
                partnerBoatNo
              ) === 1
                ? partnerEvidence
                : null
            )
          : roleEvidence(
              roleContext,
              partnerType ===
                "other-hold"
                ? "hold"
                : partnerType,
              partnerBoatNo
            );

      if (
        partnerBoatNo < 1 ||
        partnerPosition < 2 ||
        !livePartner ||
        numeric(
          partnerEvidence.score ??
          livePartner?.score,
          0
        ) <= 0
      ) {
        return {
          purchaseEligible: false,
          reasonCode:
            "PARTNER_EVIDENCE_MISMATCH"
        };
      }
    }

    const partners =
      phaseEvidence.partners || {};

    if (kind === "alternate-head") {
      const second =
        partners.second || {};
      const third =
        partners.third || {};
      const secondBoatNo =
        boatNo(second);
      const thirdBoatNo =
        boatNo(third);
      const liveSecond =
        roleEvidence(
          roleContext,
          "hold",
          secondBoatNo
        );
      const liveThird =
        roleEvidence(
          roleContext,
          "pickup",
          thirdBoatNo
        ) ||
        roleEvidence(
          roleContext,
          "hold",
          thirdBoatNo
        );

      if (
        secondBoatNo !== boats[1] ||
        thirdBoatNo !== boats[2] ||
        !liveSecond ||
        !liveThird ||
        numeric(second.score, 0) <= 0 ||
        numeric(third.score, 0) <= 0
      ) {
        return {
          purchaseEligible: false,
          reasonCode:
            "PARTNER_POSITION_MISMATCH"
        };
      }
    }

    const exactGoalOrder =
      liveGoalOrder.length === 3 &&
      liveGoalOrder.every(
        (value, index) =>
          value === boats[index]
      );

    if (
      branch.exactGoalOrder === true &&
      !exactGoalOrder
    ) {
      return {
        purchaseEligible: false,
        reasonCode:
          "EXACT_GOAL_ORDER_MISMATCH"
      };
    }

    return {
      purchaseEligible:
        branch.purchaseEligible === true,
      reasonCode:
        branch.purchaseEligible === true
          ? ""
          : "BUILDER_PURCHASE_REJECTED",
      exactGoalOrder
    };
  }

  function validateCandidate(
    row,
    context
  ) {
    const boats =
      ticketBoats(row.ticket);

    if (!boats.length) {
      return {
        valid: false,
        reasonCode:
          "INVALID_TICKET",
        reason:
          "3艇重複なしの正確な3連単ではない。"
      };
    }

    const validBranches = [];
    const purchaseBranches = [];
    const independentBranches = [];
    const invalidReasons = [];

    row.branchIds.forEach((branchId) => {
      const branch =
        context.branchesById.get(
          branchId
        );

      if (!branch) {
        invalidReasons.push(
          `UNKNOWN_BRANCH:${branchId}`
        );
        return;
      }

      if (branch.qualified !== true) {
        invalidReasons.push(
          `BRANCH_NOT_QUALIFIED:${branchId}`
        );
        return;
      }

      if (
        String(branch.ticket || "") !==
        row.ticket
      ) {
        invalidReasons.push(
          `BRANCH_TICKET_MISMATCH:${branchId}`
        );
        return;
      }

      const branchHeadBoatNo =
        Number(
          branch.headBoatNo ??
          branch.attackerBoatNo ??
          0
        );
      const branchAttackerBoatNo =
        Number(
          branch.attackerBoatNo || 0
        );

      if (
        branchHeadBoatNo !== boats[0]
      ) {
        invalidReasons.push(
          `SCENARIO_HEAD_MISMATCH:${branchId}`
        );
        return;
      }

      const isCanonicalFormation =
        branch.kind ===
          "canonical-formation" &&
        Boolean(
          branchSourceCategory(branch)
        );
      const isIndependent =
        branch.kind ===
          "independent-scenario";
      const isRoleCandidate =
        branch.kind ===
          "role-evidence-candidate";

      if (
        !isCanonicalFormation &&
        !isIndependent &&
        !isRoleCandidate
      ) {
        invalidReasons.push(
          `UNVERIFIED_BRANCH_SOURCE:${branchId}`
        );
        return;
      }

      const roleValidation =
        roleClaimsOf(
          branch,
          context,
          boats
        );

      if (roleValidation.mismatch) {
        invalidReasons.push(
          `BRANCH_COVERAGE_MISMATCH:${branchId}`
        );
        return;
      }

      if (isCanonicalFormation) {
        const sourceCategory =
          branchSourceCategory(branch);

        if (
          row.sourceCategory !==
            "possibility" &&
          sourceCategory !==
            row.sourceCategory
        ) {
          invalidReasons.push(
            `CATEGORY_SOURCE_MISMATCH:${branchId}`
          );
          return;
        }

        if (
          branchAttackerBoatNo < 1 ||
          branchAttackerBoatNo > 6 ||
          branchAttackerBoatNo !==
            context
              .primaryAttackerBoatNo
        ) {
          invalidReasons.push(
            `SCENARIO_ATTACKER_MISMATCH:${branchId}`
          );
          return;
        }
      }

      validBranches.push(branch);

      if (
        isCanonicalFormation &&
        roleValidation.claims.length >
          0 &&
        numeric(
          branch.priorityScore,
          0
        ) > 0
      ) {
        purchaseBranches.push(branch);
      }

      if (isIndependent) {
        const phaseValidation =
          validateIndependentBranch(
            branch,
            context,
            boats,
            roleValidation.claims
          );

        if (
          phaseValidation
            .purchaseEligible
        ) {
          purchaseBranches.push(branch);
          independentBranches.push(
            branch
          );
        } else {
          invalidReasons.push(
            `${phaseValidation.reasonCode}:` +
            `${branchId}`
          );
        }
      }
    });

    const requirementIds =
      [
        ...new Set(
          independentBranches.map(
            (branch) =>
              String(
                branch.requirementId ||
                branch.id
              )
          )
        )
      ];
    const coverage =
      purchaseBranches.flatMap((branch) =>
        arrayify(branch.roles)
          .flatMap((role) =>
            arrayify(
              role.eligiblePositions
            ).map((position) => ({
              evaluationId:
                String(
                  role.evaluationId ||
                  ""
                ),
              boatNo:
                Number(role.boatNo),
              role:
                String(role.role || ""),
              position:
                Number(position),
              branchId:
                branch.id
            }))
          )
      );
    const coveredEvaluationIds = [
      ...new Set(
        coverage
          .map(
            (claim) =>
              claim.evaluationId
          )
          .filter(Boolean)
      )
    ];
    const coveredBoatNos = [
      ...new Set(
        coverage
          .map(
            (claim) =>
              claim.boatNo
          )
          .filter(
            (boatNo) =>
              boatNo >= 1 &&
              boatNo <= 6
          )
      )
    ];
    const evidenceReasons = [
      ...new Set(
      purchaseBranches
          .map(
            (branch) =>
              String(
                branch.reason || ""
              )
          )
          .filter(Boolean)
      )
    ];
    const comparableBranches =
      purchaseBranches.length
        ? purchaseBranches
        : validBranches;
    const bestBranch =
      [...comparableBranches]
        .sort(
          (a, b) =>
            Number(b.requirement) -
              Number(a.requirement) ||
            Number(b.priorityScore) -
              Number(a.priorityScore) ||
            String(a.id)
              .localeCompare(
                String(b.id)
              )
        )[0] || null;

    return {
      valid:
        validBranches.length > 0,
      purchaseEligible:
        purchaseBranches.length > 0,
      expansionEligible:
        independentBranches.length > 0,
      validBranchIds:
        validBranches.map(
          (branch) => branch.id
        ),
      validPurchaseBranchIds:
        purchaseBranches.map(
          branch => branch.id
        ),
      validIndependentBranchIds:
        independentBranches.map(
          branch => branch.id
        ),
      validScenarioIds: [
        ...new Set(
          purchaseBranches
            .map(branch =>
              String(
                branch?.scenarioId || ""
              )
            )
            .filter(Boolean)
        )
      ],
      requirementIds,
      coverage,
      coveredEvaluationIds,
      coveredBoatNos,
      evidenceReasons,
      priorityScore:
        Number(
          bestBranch?.priorityScore ||
          0
        ),
      scenarioTitle:
        String(
          bestBranch?.title ||
          row.scenarioTitle ||
          ""
        ),
      scenarioSummary:
        String(
          bestBranch?.summary ||
          row.scenarioSummary ||
          ""
        ),
      invalidReasons,
      reasonCode:
        purchaseBranches.length
          ? ""
          : validBranches.length
            ? "NO_PURCHASE_ELIGIBLE_BRANCH"
            : row.branchIds.length
            ? "INVALID_BRANCH_REFERENCE"
            : "CANDIDATE_ONLY_EVALUATION",
      reason:
        purchaseBranches.length
          ? ""
          : validBranches.length
            ? (
                invalidReasons.join(" / ") ||
                "候補枝は保持したが、購入条件を満たさない。"
              )
            : row.branchIds.length
            ? (
                invalidReasons.join(" / ") ||
                "枝参照と艇・着順が一致しない。"
              )
            : "評価された着順の物理候補として保持。独立した展開枝がないため自動購入しない。"
    };
  }

  function applyValidation(
    row,
    validation
  ) {
    if (!validation?.valid) {
      return {
        ...row,
        evidenceQualified: false,
        purchaseEligible: false,
        expansionEligible: false,
        validBranchIds: [],
        validPurchaseBranchIds: [],
        validIndependentBranchIds: [],
        validScenarioIds: [],
        validRequirementIds: []
      };
    }

    return {
      ...row,
      branchIds: [
        ...validation.validBranchIds
      ],
      requirementIds: [
        ...validation.requirementIds
      ],
      validBranchIds: [
        ...validation.validBranchIds
      ],
      validPurchaseBranchIds: [
        ...validation
          .validPurchaseBranchIds
      ],
      validIndependentBranchIds: [
        ...validation
          .validIndependentBranchIds
      ],
      validScenarioIds: [
        ...validation.validScenarioIds
      ],
      validRequirementIds: [
        ...validation.requirementIds
      ],
      coverage: [
        ...validation.coverage
      ],
      coveredEvaluationIds: [
        ...validation
          .coveredEvaluationIds
      ],
      coveredBoatNos: [
        ...validation.coveredBoatNos
      ],
      evidenceReasons: [
        ...validation.evidenceReasons
      ],
      evidenceQualified: true,
      purchaseEligible:
        validation.purchaseEligible,
      expansionEligible:
        validation.expansionEligible,
      priorityScore:
        validation.priorityScore,
      scenarioTitle:
        row.scenarioTitle ||
        validation.scenarioTitle,
      scenarioSummary:
        row.scenarioSummary ||
        validation.scenarioSummary,
      comment:
        row.scenarioSummary ||
        row.comment ||
        validation.scenarioSummary
    };
  }

  function select(prediction) {
    const lists =
      ticketLists(prediction);
    const evidence =
      evidenceOf(prediction);
    const validationContext =
      createValidationContext(
        evidence
      );
    const selected = [];
    const used = new Set();
    const candidateDecisions = [];
    const decidedCandidates =
      new Set();

    function resultForSkip(reason) {
      const candidates =
        lists.possibility.map((item) => {
          const row =
            normalizeTicket(
              item,
              item?.category ||
              "展開候補"
            );
          const validation =
            validateCandidate(
              row,
              validationContext
            );
          const enriched =
            applyValidation(
              row,
              validation
            );

          return {
            ticket:
              enriched.ticket,
            selected: false,
            reasonCode:
              "RACE_SKIPPED",
            reason,
            validationReasonCode:
              validation.reasonCode ||
              "",
            branchIds: [
              ...arrayify(
                enriched
                  .validBranchIds
              )
            ],
            coveredEvaluationIds: [
              ...arrayify(
                enriched
                  .coveredEvaluationIds
              )
            ],
            candidateOnlyEvaluationIds: [
              ...arrayify(
                enriched
                  .candidateOnlyEvaluationIds
              )
            ],
            physicalCoverage: [
              ...arrayify(
                enriched
                  .physicalCoverage
              )
            ],
            priorityScore:
              numeric(
                enriched
                  .priorityScore,
                0
              ),
            roleLabels:
              roleLabelsFor(
                enriched
              )
          };
        });
      const targetDecisions =
        evidence.evaluatedTargets
          .map((target) => {
            const evaluationId =
              String(
                target?.id || ""
              );
            const related =
              [
                ...new Map(
                  candidates
                    .filter(candidate =>
                      arrayify(
                        candidate
                          .coveredEvaluationIds
                      ).includes(
                        evaluationId
                      ) ||
                      arrayify(
                        candidate
                          .candidateOnlyEvaluationIds
                      ).includes(
                        evaluationId
                      ) ||
                      arrayify(
                        candidate
                          .physicalCoverage
                      ).some(
                        claim =>
                          claim
                            ?.evaluationId ===
                          evaluationId
                      ) ||
                      ticketBoats(
                        candidate.ticket
                      ).includes(
                        Number(
                          target
                            ?.boatNo || 0
                        )
                      )
                    )
                    .map(candidate => [
                      candidate.ticket,
                      {
                        ticket:
                          candidate
                            .ticket,
                        ticketSelected:
                          false,
                        relation:
                          arrayify(
                            candidate
                              .coveredEvaluationIds
                          ).includes(
                            evaluationId
                          )
                            ? "structured"
                            : "physical-only",
                        reasonCode:
                          "RACE_SKIPPED",
                        reason,
                        priorityScore:
                          candidate
                            .priorityScore,
                        roleLabels: [
                          ...candidate
                            .roleLabels
                        ]
                      }
                    ])
                ).values()
              ].sort(
                (a, b) =>
                  b.priorityScore -
                    a.priorityScore ||
                  a.ticket.localeCompare(
                    b.ticket
                  )
              );
            const visible =
              related.slice(
                0,
                TARGET_EXCLUDED_PREVIEW_COUNT
              );
            const best =
              related[0] || null;

            return {
              evaluationId,
              boatNo:
                Number(
                  target?.boatNo || 0
                ),
              symbol:
                String(
                  target?.symbol || ""
                ),
              selected: false,
              selectedTickets: [],
              adoptionSupported:
                false,
              supportedSelectedTickets:
                [],
              candidateCount:
                related.length,
              selectedCandidateCount:
                0,
              excludedCandidateCount:
                related.length,
              hiddenCandidateCount:
                Math.max(
                  0,
                  related.length -
                    visible.length
                ),
              candidateDecisions:
                visible,
              bestCandidateTicket:
                best?.ticket || "",
              bestCandidateScore:
                best
                  ?.priorityScore || 0,
              selectionBoundary:
                null,
              comparisonTicket: "",
              comparisonScore:
                null,
              scoreGap: null,
              reasonCode:
                "RACE_SKIPPED",
              reason
            };
          });

      return {
        status: "skipped",
        reason,
        standardCount:
          STANDARD_COUNT,
        normalMaximumCount:
          NORMAL_MAXIMUM_COUNT,
        maximumCount:
          MAXIMUM_COUNT,
        evidence,
        tickets: [],
        excludedCandidates:
          candidates,
        candidateDecisions:
          candidates,
        candidateOutcomes:
          candidates,
        targetDecisions,
        expansionSummary: {
          normalCount: 0,
          addedCount: 0,
          finalCount: 0,
          hasIndependentAdditions:
            false,
          exceededNormalMaximum:
            false,
          addedTickets: [],
          reason
        },
        verificationEvidence:
          null
      };
    }

    if (
      !evidence.mainEstablished ||
      !lists.main.length
    ) {
      return resultForSkip(
        "主軸となる展開が定まらないため見送り。"
      );
    }

    function normalizeAndValidate(
      item,
      category
    ) {
      const row =
        normalizeTicket(
          item,
          category
        );
      const validation =
        validateCandidate(
          row,
          validationContext
        );

      return applyValidation(
        row,
        validation
      );
    }

    const candidates =
      lists.possibility
        .map((item) => {
          const row =
            normalizeTicket(
              item,
              item?.category ||
              "展開候補"
            );
          const validation =
            validateCandidate(
              row,
              validationContext
            );

          return {
            row:
              applyValidation(
                row,
                validation
              ),
            validation
          };
        })
        .filter(({ row }) =>
          validTicket(row.ticket)
        );
    function take(
      list,
      limit,
      category,
      requireActionableRole = false
    ) {
      let added = 0;

      for (
        const item of arrayify(list)
      ) {
        if (
          added >= limit ||
          selected.length >=
            MAXIMUM_COUNT
        ) {
          break;
        }

        const row =
          normalizeAndValidate(
            item,
            category
          );

        if (
          !validTicket(row.ticket) ||
          used.has(row.ticket) ||
          !row.purchaseEligible ||
          !row.validPurchaseBranchIds
            .length ||
          (
            requireActionableRole &&
            (
              !row.coverage.length ||
              row.priorityScore <= 0
            )
          )
        ) {
          continue;
        }

        used.add(row.ticket);
        selected.push(row);
        added += 1;
      }

      return added;
    }

    const mainCount =
      take(lists.main, 3, "本線");
    const coverCount =
      take(lists.cover, 2, "押さえ");

    if (
      mainCount !== 3 ||
      coverCount !== 2
    ) {
      return resultForSkip(
        "本線3点・押さえ2点の基本5点を構成できないため見送り。"
      );
    }

    /*
      独立展開の順位計画は基本5点だけを基準にする。
      通常追加が「流し2券」か「穴1券」かで、別頭候補の
      採否や順位が変わらないようにする。
    */
    const expansionSelectionContext =
      selected.slice();

    function flowFormationSource() {
      const sources = [
        prediction?.mainSheet
          ?.flowFormations,
        prediction?.formation
          ?.flowFormations,
        prediction?.formations
          ?.flowFormations,
        prediction?.aiCore
          ?.formations
          ?.flowFormations
      ];

      for (const source of sources) {
        const formation =
          arrayify(source)[0];
        if (
          formation &&
          typeof formation ===
            "object"
        ) {
          return formation;
        }
      }

      return null;
    }

    function formalFlowRoleEvidence(
      role,
      targetBoatNo
    ) {
      const formalRows =
        role === "pickup"
          ? arrayify(
              validationContext
                .raceFlow
                ?.pickupBoats
            )
          : arrayify(
              validationContext
                .raceFlow
                ?.holdBoats
            );
      const row =
        formalRows.find(
          item =>
            boatNo(item) ===
              targetBoatNo
        );

      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        row.qualified === false ||
        row.isAdopted === false ||
        row.adopted === false ||
        row.active === false
      ) {
        return null;
      }

      const status =
        String(
          row.evidenceStatus ||
          row.status ||
          ""
        ).toLowerCase();
      const rejectedStatus = [
        "rejected",
        "excluded",
        "stale",
        "inactive",
        "candidate-only",
        "alternate",
        "非採用",
        "除外"
      ].some(value =>
        status.includes(value)
      );

      if (
        rejectedStatus ||
        numeric(row.score, 0) <= 0 ||
        !String(
          row.reason ||
          row.comment ||
          row.summary ||
          ""
        ).trim()
      ) {
        return null;
      }

      return row;
    }

    /*
      流しは1券ずつ先着順で取らない。
      正式主展開・同一1/2着軸・同一scenarioIdを共有し、
      2着残しと3着拾い（または3着残り）がともに65点以上の
      exact券が2券そろった時だけ、2券を原子的に採用する。
    */
    function selectGroundedFlowPair() {
      if (!evidence.flow) return [];

      const formation =
        flowFormationSource();
      const selectedMainHeadBoatNo =
        Number(
          ticketBoats(
            selected[0]?.ticket
          )[0] ||
          0
        );
      const formationHeadBoatNo =
        Number(
          formation?.headBoatNo ||
          0
        );

      if (
        !formation ||
        formationHeadBoatNo < 1 ||
        formationHeadBoatNo !==
          selectedMainHeadBoatNo ||
        (
          evidence.mainHeadBoatNo > 0 &&
          evidence.mainHeadBoatNo !==
            selectedMainHeadBoatNo
        )
      ) {
        return [];
      }

      const mainHeadBoatNo =
        selectedMainHeadBoatNo;
      const expectedScenarioId =
        `canonical:` +
        `${validationContext.primaryAttackerBoatNo}`;
      const secondPriority =
        arrayify(
          formation
            ?.secondPriorityBoatNos ||
          formation?.secondBoatNos
        )
          .map(Number)
          .filter(
            boatNumber =>
              boatNumber >= 1 &&
              boatNumber <= 6 &&
              boatNumber !==
                mainHeadBoatNo
          );
      const groups = new Map();

      arrayify(lists.flow)
        .forEach((item, index) => {
          const row =
            normalizeAndValidate(
              item,
              "流し"
            );
          const boats =
            ticketBoats(row.ticket);

          if (
            boats.length !== 3 ||
            boats[0] !==
              mainHeadBoatNo ||
            used.has(row.ticket) ||
            !row.purchaseEligible ||
            !row.validPurchaseBranchIds
              .length
          ) {
            return;
          }

          const scenarioIds =
            arrayify(
              row.validScenarioIds
            )
              .map(String)
              .filter(id =>
                id.startsWith(
                  "canonical:"
                )
              );
          const scenarioId =
            scenarioIds.length === 1
              ? scenarioIds[0]
              : "";
          const flowPurchaseBranches =
            row
              .validPurchaseBranchIds
              .map(id =>
                validationContext
                  .branchesById.get(id)
              )
              .filter(branch =>
                branch?.kind ===
                  "canonical-formation" &&
                branch?.source ===
                  "base-formation:flow" &&
                branch?.scenarioId ===
                  expectedScenarioId
              );
          const secondEvidence =
            formalFlowRoleEvidence(
              "hold",
              boats[1]
            );
          const pickupEvidence =
            formalFlowRoleEvidence(
              "pickup",
              boats[2]
            );
          const holdEvidence =
            formalFlowRoleEvidence(
              "hold",
              boats[2]
            );
          const thirdRoleCandidate = [
            {
              role: "pickup",
              evidence: pickupEvidence
            },
            {
              role: "hold",
              evidence: holdEvidence
            }
          ]
            .filter(
              candidate =>
                candidate.evidence
            )
            .sort((a, b) =>
              numeric(
                b.evidence?.score,
                0
              ) -
                numeric(
                  a.evidence?.score,
                  0
                ) ||
              (
                a.role === "pickup"
                  ? -1
                  : 1
              )
            )[0] || null;
          const thirdRole =
            thirdRoleCandidate?.role ||
            "";
          const thirdEvidence =
            thirdRoleCandidate
              ?.evidence || null;
          const secondScore =
            numeric(
              secondEvidence?.score,
              0
            );
          const thirdScore =
            numeric(
              thirdEvidence?.score,
              0
            );

          if (
            scenarioId !==
              expectedScenarioId ||
            !flowPurchaseBranches.length ||
            !secondPriority.includes(
              boats[1]
            ) ||
            !secondEvidence ||
            !thirdEvidence ||
            secondScore <
              MINIMUM_FLOW_ROLE_SCORE ||
            thirdScore <
              MINIMUM_FLOW_ROLE_SCORE
          ) {
            return;
          }

          const anchor =
            `${boats[0]}-${boats[1]}`;
          const groupKey =
            `${scenarioId}|${anchor}`;
          const thirdRoleLabel =
            thirdRole === "pickup"
              ? "3着拾い"
              : "3着残り";
          const secondEvidenceReason =
            String(
              secondEvidence?.reason ||
              ""
            ).trim();
          const thirdEvidenceReason =
            String(
              thirdEvidence?.reason ||
              ""
            ).trim();
          const scenarioTitle =
            String(
              formation?.label ||
              evidence.raceFlow
                ?.title ||
              row.scenarioTitle ||
              "正式主展開"
            );
          const commonReason =
            `${boats[0]}号艇を1着軸` +
            `（${scenarioTitle}）に、` +
            `${boats[1]}号艇の2着残し` +
            `（${secondScore}点` +
            `${secondEvidenceReason
              ? `：${secondEvidenceReason}`
              : ""}）を固定。`;
          const detailReason =
            commonReason +
            `${boats[2]}号艇の${thirdRoleLabel}` +
            `（${thirdScore}点` +
            `${thirdEvidenceReason
              ? `：${thirdEvidenceReason}`
              : ""}）が同じ展開で成立。`;
          const enriched = {
            ...row,
            category: "流し",
            scenarioId,
            flowAnchor: anchor,
            flowCommonReason:
              commonReason,
            flowSecondScore:
              secondScore,
            flowThirdScore:
              thirdScore,
            flowRoleEvidence: [
              {
                position: 2,
                boatNo: boats[1],
                role: "hold",
                score: secondScore,
                reason:
                  secondEvidenceReason,
                source:
                  secondEvidence
                    .qualificationSource ||
                  "raceFlow.holdBoats"
              },
              {
                position: 3,
                boatNo: boats[2],
                role: thirdRole,
                score: thirdScore,
                reason:
                  thirdEvidenceReason,
                source:
                  thirdEvidence
                    .qualificationSource ||
                  `raceFlow.${thirdRole}Boats`
              }
            ],
            coveredBoatNos: [
              ...new Set([
                ...arrayify(
                  row.coveredBoatNos
                ),
                boats[1],
                boats[2]
              ])
            ],
            evidenceReasons: [
              ...new Set([
                ...arrayify(
                  row.evidenceReasons
                ),
                secondEvidenceReason,
                thirdEvidenceReason
              ].filter(Boolean))
            ],
            scenarioTitle:
              `${scenarioTitle}の流し`,
            scenarioSummary:
              detailReason,
            comment: detailReason
          };

          if (!groups.has(groupKey)) {
            groups.set(groupKey, {
              scenarioId,
              anchor,
              firstIndex: index,
              secondPriorityIndex:
                secondPriority.indexOf(
                  boats[1]
                ),
              rows: []
            });
          }

          const group =
            groups.get(groupKey);
          const alreadyRegistered =
            group.rows.some(
              ({ row: registered }) =>
                registered.ticket ===
                  enriched.ticket
            );

          if (!alreadyRegistered) {
            group.rows.push({
              row: enriched,
              index,
              thirdScore
            });
          }
        });

      const selectedGroup = [
        ...groups.values()
      ]
        .filter(group =>
          new Set(
            group.rows.map(({ row }) =>
              ticketBoats(
                row.ticket
              )[2]
            )
          ).size >= FLOW_GROUP_COUNT
        )
        .sort((a, b) => {
          const priorityA =
            a.secondPriorityIndex < 0
              ? Number.MAX_SAFE_INTEGER
              : a.secondPriorityIndex;
          const priorityB =
            b.secondPriorityIndex < 0
              ? Number.MAX_SAFE_INTEGER
              : b.secondPriorityIndex;

          return (
            priorityA - priorityB ||
            a.firstIndex - b.firstIndex ||
            a.anchor.localeCompare(
              b.anchor
            )
          );
        })[0];

      if (!selectedGroup) return [];

      const pair =
        selectedGroup.rows
          .sort((a, b) =>
            b.thirdScore -
              a.thirdScore ||
            numeric(
              b.row.priorityScore,
              0
            ) -
              numeric(
                a.row.priorityScore,
                0
              ) ||
            a.index - b.index ||
            a.row.ticket.localeCompare(
              b.row.ticket
            )
          )
          .slice(
            0,
            FLOW_GROUP_COUNT
          )
          .map(({ row }) => row);

      if (
        pair.length !==
          FLOW_GROUP_COUNT
      ) {
        return [];
      }

      pair.forEach(row => {
        used.add(row.ticket);
        selected.push(row);
      });

      return pair;
    }

    const groundedFlowPair =
      selectGroundedFlowPair();

    if (
      groundedFlowPair.length !==
        FLOW_GROUP_COUNT &&
      evidence.longshot
    ) {
      take(
        lists.longshot,
        1,
        "万舟・穴",
        true
      );
    }
    const normalTicketCount =
      selected.length;

    function recordDecision(
      row,
      selectedFlag,
      reasonCode,
      reason
    ) {
      const key =
        `${row.ticket}|` +
        `${reasonCode}|` +
        `${arrayify(
          row.validRequirementIds
        ).join(",")}`;

      if (
        decidedCandidates.has(key)
      ) {
        return;
      }

      decidedCandidates.add(key);
      candidateDecisions.push({
        ticket: row.ticket,
        branchIds: [
          ...arrayify(
            row.validBranchIds
          )
        ],
        requirementIds: [
          ...arrayify(
            row.validRequirementIds
          )
        ],
        coveredEvaluationIds: [
          ...arrayify(
            row.coveredEvaluationIds
          )
        ],
        coveredBoatNos: [
          ...arrayify(
            row.coveredBoatNos
          )
        ],
        candidateOnlyEvaluationIds: [
          ...arrayify(
            row
              .candidateOnlyEvaluationIds
          )
        ],
        physicalCoverage: [
          ...arrayify(
            row.physicalCoverage
          )
        ],
        category:
          String(
            row.category || ""
          ),
        selectionTier:
          String(
            row.selectionTier || ""
          ),
        roleLabels:
          roleLabelsFor(row),
        scenarioTitle:
          String(
            row.scenarioTitle || ""
          ),
        scenarioSummary:
          String(
            row.scenarioSummary ||
            row.comment ||
            ""
          ),
        selected:
          selectedFlag,
        reasonCode,
        reason,
        priorityScore:
          row.priorityScore
      });
    }

    function mergeIntoSelected(row) {
      const index =
        selected.findIndex(
          (item) =>
            item.ticket === row.ticket
        );

      if (index < 0) return;

      const current =
        selected[index];
      const keepsCategoryScopedBranches =
        categoryKey(
          current.sourceCategory ||
          current.category
        ) !== "possibility" &&
        current.selectionTier !==
          "展開追加";
      const mergedAllBranchIds = [
        ...new Set([
          ...arrayify(
            current.allBranchIds
          ),
          ...arrayify(
            current.branchIds
          ),
          ...arrayify(
            row.allBranchIds
          ),
          ...arrayify(
            row.validBranchIds
          )
        ])
      ];
      const mergedIndependentBranchIds = [
        ...new Set([
          ...arrayify(
            current
              .supportingIndependentBranchIds
          ),
          ...arrayify(
            current
              .validIndependentBranchIds
          ),
          ...arrayify(
            row
              .validIndependentBranchIds
          )
        ])
      ];

      selected[index] = {
        ...current,
        branchIds:
          keepsCategoryScopedBranches
            ? [
                ...arrayify(
                  current.branchIds
                )
              ]
            : [
                ...new Set([
                  ...arrayify(
                    current.branchIds
                  ),
                  ...arrayify(
                    row.validBranchIds
                  )
                ])
              ],
        validBranchIds:
          keepsCategoryScopedBranches
            ? [
                ...arrayify(
                  current.validBranchIds
                )
              ]
            : [
                ...new Set([
                  ...arrayify(
                    current.validBranchIds
                  ),
                  ...arrayify(
                    row.validBranchIds
                  )
                ])
              ],
        allBranchIds:
          mergedAllBranchIds,
        supportingIndependentBranchIds:
          mergedIndependentBranchIds,
        validPurchaseBranchIds: [
          ...new Set([
            ...arrayify(
              current
                .validPurchaseBranchIds
            ),
            ...arrayify(
              row
                .validPurchaseBranchIds
            )
          ])
        ],
        validIndependentBranchIds: [
          ...new Set([
            ...arrayify(
              current
                .validIndependentBranchIds
            ),
            ...arrayify(
              row
                .validIndependentBranchIds
            )
          ])
        ],
        requirementIds: [
          ...new Set([
            ...arrayify(
              current.requirementIds
            ),
            ...arrayify(
              row.validRequirementIds
            )
          ])
        ],
        validRequirementIds: [
          ...new Set([
            ...arrayify(
              current
                .validRequirementIds
            ),
            ...arrayify(
              row.validRequirementIds
            )
          ])
        ],
        coveredEvaluationIds: [
          ...new Set([
            ...arrayify(
              current
                .coveredEvaluationIds
            ),
            ...arrayify(
              row.coveredEvaluationIds
            )
          ])
        ],
        coveredBoatNos: [
          ...new Set([
            ...arrayify(
              current.coveredBoatNos
            ),
            ...arrayify(
              row.coveredBoatNos
            )
          ])
        ],
        evidenceReasons: [
          ...new Set([
            ...arrayify(
              current.evidenceReasons
            ),
            ...arrayify(
              row.evidenceReasons
            )
          ])
        ],
        evidenceQualified: true,
        purchaseEligible:
          current.purchaseEligible ===
            true ||
          row.purchaseEligible === true,
        expansionEligible:
          current.expansionEligible ===
            true ||
          row.expansionEligible === true,
        priorityScore:
          Math.max(
            numeric(
              current.priorityScore,
              0
            ),
            numeric(
              row.priorityScore,
              0
            )
          ),
        comment:
          current.comment ||
          row.comment,
        scenarioTitle:
          current.scenarioTitle ||
          row.scenarioTitle,
        scenarioSummary:
          current.scenarioSummary ||
          row.scenarioSummary
      };
    }

    function addExpansion(row) {
      if (
        !row.evidenceQualified ||
        !row.purchaseEligible ||
        !row.expansionEligible ||
        !row.validIndependentBranchIds
          .length ||
        row.priorityScore < 65 ||
        !row.evidenceReasons.length ||
        !row.comment
      ) {
        recordDecision(
          row,
          false,
          row.priorityScore < 65
            ? "BELOW_SCORE_THRESHOLD"
            : "INSUFFICIENT_STRUCTURED_EVIDENCE",
          row.priorityScore < 65
            ? "独立展開の対象評価が65点未満のため、候補だけ保持する。"
            : "枝ID・艇・着順・役割・根拠の一致が不足。候補は保持し、自動購入しない。"
        );
        return false;
      }

      if (used.has(row.ticket)) {
        mergeIntoSelected(row);
        recordDecision(
          row,
          true,
          "ALREADY_SELECTED",
          "通常5〜7点ですでに同じ独立展開の買い目を採用済み。"
        );
        return false;
      }

      if (
        selected.length >=
        MAXIMUM_COUNT
      ) {
        const selectedExpansions =
          selected.filter(
            (item) =>
              item.selectionTier ===
              "展開追加"
          );
        const comparisonFloor =
          selectedExpansions.length
            ? Math.min(
                ...selectedExpansions
                  .map(
                    (item) =>
                      item.priorityScore
                  )
              )
            : 0;

        recordDecision(
          row,
          false,
          "MAXIMUM_REACHED",
          `最大10点に達したため候補プールへ保持。` +
          `選択済み独立展開の比較基準${comparisonFloor}点、` +
          `当該候補${row.priorityScore}点。`
        );
        return false;
      }

      const expanded = {
        ...row,
        category:
          "独立展開",
        selectionTier:
          "展開追加",
        expansionReason:
          "枝IDと艇・着順が一致する独立展開"
      };

      used.add(expanded.ticket);
      selected.push(expanded);
      recordDecision(
        row,
        true,
        "INDEPENDENT_SCENARIO",
        expanded.expansionReason
      );
      return true;
    }

    /*
      requirementId は監査IDであり購入義務ではない。
      再検証済みの独立枝だけを、対象評価の優先度で比較する。
    */
    const rawExpansionCandidates =
      candidates
        .map(({ row }) => row)
        .filter(
          row =>
            row.purchaseEligible ===
              true &&
            row.expansionEligible ===
              true &&
            row.priorityScore >= 65 &&
            row
              .validIndependentBranchIds
              .length > 0
        );
    const expansionSort = (a, b) => {
          const exactA =
            a.validIndependentBranchIds
              .some(
                id =>
                  validationContext
                    .branchesById.get(id)
                    ?.exactGoalOrder ===
                  true
              );
          const exactB =
            b.validIndependentBranchIds
              .some(
                id =>
                  validationContext
                    .branchesById.get(id)
                    ?.exactGoalOrder ===
                  true
              );

          return (
            Number(exactB) -
              Number(exactA) ||
            b.priorityScore -
              a.priorityScore ||
            a.ticket.localeCompare(
              b.ticket
            )
          );
        };
    const holdExpansionCandidates = [];
    const alternateHeadByAttacker =
      new Map();
    const expansionExclusionByTicket =
      new Map();
    const rememberExpansionExclusion =
      (
        row,
        reasonCode,
        reason
      ) => {
        if (
          !expansionExclusionByTicket
            .has(row.ticket)
        ) {
          expansionExclusionByTicket
            .set(row.ticket, {
              reasonCode,
              reason
            });
        }
      };

    rawExpansionCandidates
      .sort(expansionSort)
      .forEach(row => {
        const independentBranches =
          row.validIndependentBranchIds
            .map(id =>
              validationContext
                .branchesById.get(id)
            )
            .filter(Boolean);
        const hasHoldContinuation =
          independentBranches.some(
            branch =>
              branch.phaseEvidence?.kind ===
              "hold-continuation"
          );

        if (hasHoldContinuation) {
          holdExpansionCandidates.push(
            row
          );
          return;
        }

        const alternateBranch =
          independentBranches.find(
            branch =>
              branch.phaseEvidence?.kind ===
              "alternate-head"
          );

        if (!alternateBranch) {
          rememberExpansionExclusion(
            row,
            "UNSUPPORTED_INDEPENDENT_KIND",
            "購入可能な独立枝ではあるが、残し継続・別頭のどちらにも該当しないため追加しない。"
          );
          return;
        }

        const attackerBoatNo =
          Number(
            alternateBranch
              .attackerBoatNo || 0
          );

        if (attackerBoatNo < 1) {
          rememberExpansionExclusion(
            row,
            "MISSING_ATTACKER",
            "別頭の攻め艇を特定できないため、候補だけ保持する。"
          );
          return;
        }

        const representedHead =
          expansionSelectionContext.find(
            item =>
              ticketBoats(
                item.ticket
              )[0] ===
              attackerBoatNo
          );

        if (representedHead) {
          rememberExpansionExclusion(
            row,
            "HEAD_ALREADY_REPRESENTED",
            `${attackerBoatNo}号艇頭は` +
            `${representedHead.ticket}を通常枠で採用済みのため、` +
            `同じ頭の追加点にはしない。`
          );
          return;
        }

        const strongerSameAttacker =
          alternateHeadByAttacker.get(
            attackerBoatNo
          );

        if (strongerSameAttacker) {
          rememberExpansionExclusion(
            row,
            "LOWER_PRIORITY_SAME_ATTACKER",
            `同じ${attackerBoatNo}号艇頭では` +
            `${strongerSameAttacker.ticket}` +
            `（${strongerSameAttacker.priorityScore}点）を優先し、` +
            `当該候補${row.ticket}` +
            `（${row.priorityScore}点）は候補に保持する。`
          );
          return;
        }

        alternateHeadByAttacker.set(
          attackerBoatNo,
          row
        );
      });

    /*
      残し継続は着順違いを個別展開として比較する。
      別攻めはpartner総当たりで点数を埋めず、攻め艇ごとに
      最も強い1点だけを8〜10点候補へ進める。
    */
    const expansionCandidates = [
      ...holdExpansionCandidates,
      ...alternateHeadByAttacker.values()
    ].sort(expansionSort);

    expansionCandidates.forEach(
      row => {
        addExpansion(row);
      }
    );

    /*
      candidate-only は安全ゲートを外さない。
      既存の通常枠・独立展開を確定した後、最大10点までの空き枠だけを使う。
      1〜3着すべてに物理根拠があり、priority 90以上の候補だけを補完する。
    */
    function hasThreePositionPhysicalEvidence(row) {
      const positions = new Set(
        arrayify(row?.physicalCoverage)
          .map(claim =>
            Number(claim?.position || 0)
          )
          .filter(position =>
            position >= 1 &&
            position <= 3
          )
      );
      return positions.size === 3;
    }

    const candidateOnlyPromotionPool =
      candidates
        .filter(({ row, validation }) => {
          const candidateOnly =
            (
              validation.valid === false &&
              validation.reasonCode ===
                "CANDIDATE_ONLY_EVALUATION"
            ) ||
            (
              validation.valid === true &&
              validation.purchaseEligible === true &&
              validation.expansionEligible === false
            );

          return (
            candidateOnly &&
            !used.has(row.ticket) &&
            row.priorityScore >=
              MINIMUM_CANDIDATE_PROMOTION_SCORE &&
            hasThreePositionPhysicalEvidence(row)
          );
        })
        .sort(
          (a, b) =>
            b.row.priorityScore -
              a.row.priorityScore ||
            a.row.ticket.localeCompare(
              b.row.ticket
            )
        );

    candidateOnlyPromotionPool.forEach(
      ({ row }) => {
        if (
          selected.length >=
          MAXIMUM_COUNT
        ) {
          return;
        }

        const promoted = {
          ...row,
          coverage: [
            ...arrayify(
              row.physicalCoverage
            )
          ],
          category: "候補補完",
          selectionTier: "候補補完",
          candidatePromotion: true,
          candidatePromotionThreshold:
            MINIMUM_CANDIDATE_PROMOTION_SCORE,
          candidatePromotionReason:
            "1〜3着すべてに物理根拠があり、priority 90以上のため空き枠へ補完",
          comment:
            row.comment ||
            row.scenarioSummary ||
            "3着まで物理根拠がそろう高優先度候補を最大10点の空き枠へ補完。"
        };

        used.add(promoted.ticket);
        selected.push(promoted);
        recordDecision(
          promoted,
          true,
          "CANDIDATE_ONLY_PROMOTED",
          promoted.candidatePromotionReason
        );
      }
    );

    candidates.forEach(
      ({ row, validation }) => {
        const wasSelected =
          selected.some(
            (item) =>
              item.ticket ===
              row.ticket
          );

        if (wasSelected) {
          mergeIntoSelected(row);
          recordDecision(
            row,
            true,
            "ALREADY_SELECTED",
            "通常枠または独立展開枠で採用済み。"
          );
          return;
        }

        if (!validation.valid) {
          recordDecision(
            row,
            false,
            validation.reasonCode ||
              "CANDIDATE_ONLY_EVALUATION",
            validation.reason ||
              "評価候補として保持し、自動購入しない。"
          );
          return;
        }

        if (!validation.purchaseEligible) {
          const belowThreshold =
            validation.invalidReasons
              .some(reason =>
                reason.startsWith(
                  "BELOW_SCORE_THRESHOLD:"
                )
              );

          recordDecision(
            row,
            false,
            belowThreshold
              ? "BELOW_SCORE_THRESHOLD"
              : (
                  validation.reasonCode ||
                  "NO_PURCHASE_ELIGIBLE_BRANCH"
                ),
            belowThreshold
              ? "対象評価が65点未満のため、候補だけ保持する。"
              : (
                  validation.reason ||
                  "購入条件を満たす構造化枝がないため、候補だけ保持する。"
                )
          );
          return;
        }

        if (!validation.expansionEligible) {
          recordDecision(
            row,
            false,
            "CANDIDATE_ONLY_EVALUATION",
            "中心展開または評価着順の候補として保持。購入可能な独立枝ではないため8〜10点へ追加しない。"
          );
          return;
        }

        const rememberedExclusion =
          expansionExclusionByTicket
            .get(row.ticket);
        const selectedExpansions =
          selected
            .filter(
              (item) =>
                item.selectionTier ===
                "展開追加"
            );
        const selectedExpansionScores =
          selectedExpansions.map(
            (item) =>
              item.priorityScore
          );
        const comparisonFloor =
          selectedExpansionScores.length
            ? Math.min(
                ...selectedExpansionScores
              )
            : 0;

        if (rememberedExclusion) {
          recordDecision(
            row,
            false,
            rememberedExclusion
              .reasonCode,
            rememberedExclusion
              .reason
          );
          return;
        }

        if (
          selected.length >=
          MAXIMUM_COUNT
        ) {
          recordDecision(
            row,
            false,
            "MAXIMUM_REACHED",
            `最大10点に達したため候補プールへ保持。` +
            `当該候補${row.priorityScore}点、` +
            `選択済み独立展開の最低値` +
            `${comparisonFloor}点。`
          );
          return;
        }

        const comparison =
          [...selectedExpansions]
            .sort(
              (a, b) =>
                b.priorityScore -
                  a.priorityScore ||
                a.ticket.localeCompare(
                  b.ticket
                )
            )[0];
        recordDecision(
          row,
          false,
          "LOWER_PRIORITY_INDEPENDENT_BRANCH",
          comparison
            ? `独立展開では${comparison.ticket}` +
              `（${comparison.priorityScore}点）を優先し、` +
              `当該候補${row.ticket}` +
              `（${row.priorityScore}点）は候補に保持する。`
            : "独立展開の代表候補へ進まなかったため、購入せず候補に保持する。"
        );
      }
    );
    const candidateOutcomesByTicket =
      new Map();

    candidateDecisions.forEach(
      decision => {
        const structuredEvaluationIds =
          unique(
            decision
              .coveredEvaluationIds
          ).map(String);
        const physicalEvaluationIds =
          unique([
            ...arrayify(
              decision
                .candidateOnlyEvaluationIds
            ),
            ...arrayify(
              decision.physicalCoverage
            ).map(
              claim =>
                claim?.evaluationId
            )
          ]).map(String);
        const evaluationIds =
          unique([
            ...structuredEvaluationIds,
            ...physicalEvaluationIds
          ]);
        const current =
          candidateOutcomesByTicket
            .get(decision.ticket);
        const shouldReplace =
          !current ||
          (
            decision.selected &&
            !current.selected
          ) ||
          (
            decision.selected ===
              current.selected &&
            current.reasonCode ===
              "ALREADY_SELECTED" &&
            decision.reasonCode !==
              "ALREADY_SELECTED"
          );
        const preferred =
          shouldReplace
            ? decision
            : current;
        const roleLabels =
          [
            ...new Map(
              [
                ...arrayify(
                  current?.roleLabels
                ),
                ...arrayify(
                  decision.roleLabels
                )
              ].map(role => [
                `${role?.boatNo}|` +
                `${role?.position}|` +
                `${role?.role}`,
                role
              ])
            ).values()
          ];

        candidateOutcomesByTicket.set(
          decision.ticket,
          {
            ...preferred,
            evaluationIds:
              unique([
                ...arrayify(
                  current
                    ?.evaluationIds
                ),
                ...evaluationIds
              ]),
            structuredEvaluationIds:
              unique([
                ...arrayify(
                  current
                    ?.structuredEvaluationIds
                ),
                ...structuredEvaluationIds
              ]),
            physicalOnlyEvaluationIds:
              unique([
                ...arrayify(
                  current
                    ?.physicalOnlyEvaluationIds
                ),
                ...physicalEvaluationIds
              ]).filter(
                evaluationId =>
                  !unique([
                    ...arrayify(
                      current
                        ?.structuredEvaluationIds
                    ),
                    ...structuredEvaluationIds
                  ]).includes(
                    evaluationId
                  )
              ),
            roleLabels
          }
        );
      }
    );
    const candidateOutcomes =
      [
        ...candidateOutcomesByTicket
          .values()
      ].sort(
        (a, b) =>
          Number(b.selected) -
            Number(a.selected) ||
          numeric(
            b.priorityScore,
            0
          ) -
            numeric(
              a.priorityScore,
              0
            ) ||
          a.ticket.localeCompare(
            b.ticket
          )
      );

    const selectedExpansionBoundary =
      [...selected]
        .filter(
          row =>
            row.selectionTier ===
            "展開追加"
        )
        .sort(
          (a, b) =>
            a.priorityScore -
              b.priorityScore ||
            a.ticket.localeCompare(
              b.ticket
            )
        )[0] || null;
    const selectedRoleBoundary =
      [...selected]
        .filter(
          row =>
            numeric(
              row.priorityScore,
              0
            ) > 0
        )
        .sort(
          (a, b) =>
            a.priorityScore -
              b.priorityScore ||
            a.ticket.localeCompare(
              b.ticket
            )
        )[0] ||
      selected[0] ||
      null;
    const targetDecisions =
      evidence.evaluatedTargets
        .map((target) => {
          const evaluationId =
            String(target?.id || "");
          const targetBoatNo =
            Number(target?.boatNo || 0);
          const eligiblePositions =
            arrayify(
              target?.eligiblePositions
            ).map(Number);
          const selectedTickets =
            selected.filter((row) => {
              if (
                arrayify(
                  row.coveredEvaluationIds
                ).includes(
                  evaluationId
                )
              ) {
                return true;
              }

              const boats =
                ticketBoats(row.ticket);
              const position =
                boats.indexOf(
                  targetBoatNo
                ) + 1;

              return (
                position > 0 &&
                eligiblePositions.includes(
                  position
                )
              );
            });
          const supportedSelectedTickets =
            selected.filter(row =>
              arrayify(
                row.coveredEvaluationIds
              ).includes(
                evaluationId
              )
            );
          const targetCandidates =
            candidates
              .map(({ row }) => row)
              .filter(row => {
                const evaluationIds =
                  unique([
                    ...arrayify(
                      row
                        .coveredEvaluationIds
                    ),
                    ...arrayify(
                      row
                        .candidateOnlyEvaluationIds
                    ),
                    ...arrayify(
                      row.physicalCoverage
                    ).map(
                      claim =>
                        claim?.evaluationId
                    )
                  ]).map(String);

                return evaluationIds
                  .includes(evaluationId);
              })
              .sort(
                (a, b) =>
                  Number(
                    b.purchaseEligible
                  ) -
                    Number(
                      a.purchaseEligible
                    ) ||
                  b.priorityScore -
                    a.priorityScore ||
                  a.ticket.localeCompare(
                    b.ticket
                  )
              );
          const bestCandidate =
            targetCandidates[0] || null;
          const bestScore =
            numeric(
              bestCandidate
                ?.priorityScore,
              0
            );
          const comparisonRow =
            selectedExpansionBoundary ||
            selectedRoleBoundary;
          const comparisonScore =
            numeric(
              comparisonRow
                ?.priorityScore,
              0
            );
          const boundaryScore =
            Math.max(
              65,
              comparisonScore
            );
          const reasonCode =
            selectedTickets.length
              ? "ROLE_SELECTED"
              : !bestCandidate
                ? "NO_CANDIDATE"
                : !bestCandidate
                    .purchaseEligible
                  ? "NO_PURCHASE_ELIGIBLE_BRANCH"
                  : bestScore < 65
                    ? "BELOW_SCORE_THRESHOLD"
                    : selected.length >=
                        MAXIMUM_COUNT
                      ? "MAXIMUM_REACHED"
                      : "LOWER_PRIORITY_THAN_SELECTION";
          const targetCandidateOutcomes =
            candidateOutcomes
              .filter(outcome =>
                arrayify(
                  outcome.evaluationIds
                ).includes(
                  evaluationId
                )
              )
              .map(outcome => ({
                ticket:
                  outcome.ticket,
                ticketSelected:
                  outcome.selected,
                relation:
                  arrayify(
                    outcome
                      .structuredEvaluationIds
                  ).includes(
                    evaluationId
                  )
                    ? "structured"
                    : "physical-only",
                reasonCode:
                  outcome.reasonCode,
                reason:
                  outcome.reason,
                priorityScore:
                  outcome
                    .priorityScore,
                roleLabels: [
                  ...arrayify(
                    outcome.roleLabels
                  )
                ]
              }));
          const visibleTargetCandidateOutcomes =
            [
              ...targetCandidateOutcomes
                .filter(
                  outcome =>
                    outcome
                      .ticketSelected &&
                    outcome.relation ===
                      "structured"
                ),
              ...targetCandidateOutcomes
                .filter(
                  outcome =>
                    outcome
                      .ticketSelected &&
                    outcome.relation ===
                      "physical-only"
                )
                .slice(
                  0,
                  TARGET_SELECTED_PHYSICAL_PREVIEW_COUNT
                ),
              ...targetCandidateOutcomes
                .filter(
                  outcome =>
                    !outcome
                      .ticketSelected
                )
                .sort(
                  (a, b) =>
                    numeric(
                      b.priorityScore,
                      0
                    ) -
                      numeric(
                        a.priorityScore,
                        0
                      ) ||
                    a.ticket
                      .localeCompare(
                        b.ticket
                      )
                )
                .slice(
                  0,
                  TARGET_EXCLUDED_PREVIEW_COUNT
                )
            ];

          return {
            evaluationId,
            boatNo:
              Number(
                target?.boatNo || 0
              ),
            symbol:
              String(
                target?.symbol || ""
              ),
            selected:
              selectedTickets.length > 0,
            selectedTickets:
              selectedTickets.map(
                (row) => row.ticket
              ),
            adoptionSupported:
              supportedSelectedTickets
                .length > 0,
            supportedSelectedTickets:
              supportedSelectedTickets
                .map(
                  row => row.ticket
                ),
            candidateCount:
              targetCandidateOutcomes
                .length,
            selectedCandidateCount:
              targetCandidateOutcomes
                .filter(
                  outcome =>
                    outcome.ticketSelected
                )
                .length,
            excludedCandidateCount:
              targetCandidateOutcomes
                .filter(
                  outcome =>
                    !outcome
                      .ticketSelected
                )
                .length,
            hiddenCandidateCount:
              Math.max(
                0,
                targetCandidateOutcomes
                  .length -
                  visibleTargetCandidateOutcomes
                    .length
              ),
            candidateDecisions:
              visibleTargetCandidateOutcomes,
            bestCandidateTicket:
              bestCandidate?.ticket || "",
            bestCandidateScore:
              bestScore,
            selectionBoundary:
              selectedTickets.length
                ? null
                : boundaryScore,
            comparisonTicket:
              selectedTickets.length
                ? ""
                : (
                    comparisonRow
                      ?.ticket || ""
                  ),
            comparisonScore:
              selectedTickets.length
                ? null
                : comparisonScore,
            scoreGap:
              selectedTickets.length
                ? null
                : Number(
                    (
                      boundaryScore -
                      bestScore
                    ).toFixed(3)
                  ),
            reasonCode,
            reason:
              selectedTickets.length
                ? "評価された艇・着順役割を実戦買い目へ反映。"
                : reasonCode ===
                    "NO_CANDIDATE"
                  ? "物理候補を確認できない。"
                  : reasonCode ===
                      "NO_PURCHASE_ELIGIBLE_BRANCH"
                    ? "候補は保持したが、購入可能な構造化枝がない。"
                    : reasonCode ===
                        "BELOW_SCORE_THRESHOLD"
                      ? "候補は保持したが、対象評価が65点未満。"
                      : "候補は保持し、採用境界との優先度比較で非採用。"
          };
        });
    const excludedCandidates =
      candidateDecisions.filter(
        (decision) =>
          !decision.selected
      );
    const finalizedTickets =
      selected.map(row => ({
        ...row,
        roleLabels:
          roleLabelsFor(row)
      }));
    const addedTickets =
      finalizedTickets
        .filter(
          row =>
            row.selectionTier ===
            "展開追加"
        )
        .map(row => ({
          ticket: row.ticket,
          scenarioTitle:
            row.scenarioTitle || "",
          scenarioSummary:
            row.scenarioSummary ||
            row.comment ||
            "",
          priorityScore:
            row.priorityScore,
          roleLabels: [
            ...arrayify(
              row.roleLabels
            )
          ]
        }));
    const candidatePromotionTickets =
      finalizedTickets
        .filter(
          row =>
            row.selectionTier ===
            "候補補完"
        )
        .map(row => ({
          ticket: row.ticket,
          priorityScore:
            row.priorityScore,
          roleLabels: [
            ...arrayify(
              row.roleLabels
            )
          ]
        }));
    const expansionSummary = {
      normalCount:
        normalTicketCount,
      addedCount:
        addedTickets.length,
      finalCount:
        finalizedTickets.length,
      ...(
        candidatePromotionTickets.length
          ? {
              candidatePromotionCount:
                candidatePromotionTickets.length,
              candidatePromotionThreshold:
                MINIMUM_CANDIDATE_PROMOTION_SCORE,
              candidatePromotionTickets
            }
          : {}
      ),
      hasIndependentAdditions:
        addedTickets.length > 0,
      exceededNormalMaximum:
        finalizedTickets.length >
          NORMAL_MAXIMUM_COUNT,
      addedTickets,
      reason:
        candidatePromotionTickets.length
          ? "通常枠と検証済み独立展開を維持し、3着まで物理根拠がそろうpriority 90以上の候補だけを空き枠へ補完。"
          : addedTickets.length
            ? "通常枠とは別に、時系列と艇・着順・役割が一致した独立展開だけを追加。"
            : "購入可能な独立展開がないため、通常枠の点数を維持。"
    };
    const verificationTickets =
      finalizedTickets.map(row => {
        const continuationBoatNos =
          new Set(
            arrayify(
              row
                .validIndependentBranchIds
            )
              .map(id =>
                validationContext
                  .branchesById.get(id)
              )
              .filter(
                branch =>
                  branch
                    ?.phaseEvidence
                    ?.kind ===
                  "hold-continuation"
              )
              .map(branch =>
                boatNo(
                  branch
                    ?.phaseEvidence
                    ?.target
                )
              )
              .filter(Boolean)
          );
        const roleClaims =
          roleLabelsFor(row)
            .filter(
              role =>
                role.structured
            )
            .flatMap(role => {
              const normalizedRole =
                role.role === "head" ||
                role.role ===
                  "alternate-head" ||
                role.role === "attack"
                  ? "attack"
                  : role.role ===
                      "inside"
                    ? "hold"
                    : role.role;
              const claims = [{
                role:
                  normalizedRole,
                boatNo:
                  role.boatNo,
                expectedPositions: [
                  role.position
                ]
              }];

              if (
                normalizedRole ===
                  "hold" &&
                continuationBoatNos.has(
                  role.boatNo
                )
              ) {
                claims.push({
                  role:
                    "continuation",
                  boatNo:
                    role.boatNo,
                  expectedPositions: [
                    role.position
                  ]
                });
              }

              return claims;
            });
        const branchIds = [
          ...arrayify(
            row
              .validPurchaseBranchIds
          )
        ];
        const theoryClaims = [];

        if (
          branchIds.length > 0 &&
          (
            evidence
              .mainEstablished ||
            evidence.raceFlow
              ?.title
          )
        ) {
          theoryClaims.push({
            ...THEORY_DEFINITIONS
              .flow,
            formal: true,
            source:
              "structured-purchase-branch"
          });
        }

        if (
          roleClaims.some(claim =>
            [
              "hold",
              "pickup",
              "continuation"
            ].includes(
              claim.role
            )
          )
        ) {
          theoryClaims.push({
            ...THEORY_DEFINITIONS
              .holdPickup,
            formal: true,
            source:
              "structured-role-claim"
          });
        }

        return {
          ticket: row.ticket,
          categories:
            unique([
              row.category,
              ...arrayify(
                row.categories
              )
            ]).map(String),
          selectionTier:
            String(
              row.selectionTier || ""
            ),
          branchIds,
          roleClaims,
          theoryClaims
        };
      });
    const verificationRoleClaims =
      [
        ...new Map(
          verificationTickets
            .flatMap(ticket =>
              ticket.roleClaims
            )
            .map(claim => [
              `${claim.role}|` +
              `${claim.boatNo}`,
              claim
            ])
        ).values()
      ].map(claim => ({
        ...claim,
        expectedPositions:
          unique(
            verificationTickets
              .flatMap(ticket =>
                ticket.roleClaims
              )
              .filter(
                row =>
                  row.role ===
                    claim.role &&
                  row.boatNo ===
                    claim.boatNo
              )
              .flatMap(
                row =>
                  row
                    .expectedPositions
              )
          )
            .map(Number)
            .sort(
              (a, b) => a - b
            )
      }));
    const verificationEvidence = {
      roleSchemaVersion: 1,
      theorySchemaVersion:
        THEORY_SCHEMA_VERSION,
      theorySetFingerprint:
        THEORY_SET_FINGERPRINT,
      generation: {
        logicFingerprint:
          "evaluated-scenarios-v1",
        confidenceDefinitionVersion:
          "internal-score-v1",
        ticketPolicyVersion:
          "practical-5-7-10-grounded-flow2-candidate90-v3"
      },
      mainScenario: {
        type:
          String(
            evidence.scenarioType ||
            evidence.raceFlow
              ?.scenario
              ?.type ||
            ""
          ),
        label:
          String(
            evidence.raceFlow
              ?.title ||
            evidence.scenarioTitle ||
            ""
          ),
        headBoatNo:
          Number(
            evidence.mainHeadBoatNo ||
            0
          ),
        attackerBoatNo:
          Number(
            evidence
              .primaryAttackerBoatNo ||
            0
          )
      },
      roleClaims:
        verificationRoleClaims,
      theoryClaims: [
        ...new Map(
          verificationTickets
            .flatMap(ticket =>
              ticket
                .theoryClaims
            )
            .map(claim => [
              claim.theoryKey,
              claim
            ])
        ).values()
      ],
      tickets:
        verificationTickets
    };

    return {
      status: "selected",
      reason:
        candidatePromotionTickets.length
          ? "基本5〜7点と検証済み独立展開を維持し、priority 90以上かつ3着まで物理根拠がそろう候補だけを空き枠へ補完。"
          : selected.length >
              NORMAL_MAXIMUM_COUNT
            ? "基本5〜7点に、検証済みの独立展開だけを追加。"
            : "展開とコースから基本5〜7点を構成。",
      standardCount:
        STANDARD_COUNT,
      normalMaximumCount:
        NORMAL_MAXIMUM_COUNT,
      maximumCount:
        MAXIMUM_COUNT,
      evidence,
      tickets:
        finalizedTickets,
      excludedCandidates,
      candidateDecisions,
      candidateOutcomes,
      targetDecisions,
      expansionSummary,
      verificationEvidence
    };
  }

  const api = {
    STANDARD_COUNT,
    NORMAL_MAXIMUM_COUNT,
    MAXIMUM_COUNT,
    FLOW_GROUP_COUNT,
    MINIMUM_FLOW_ROLE_SCORE,
    MINIMUM_CANDIDATE_PROMOTION_SCORE,
    THEORY_SCHEMA_VERSION,
    THEORY_SET_FINGERPRINT,
    TARGET_SELECTED_PHYSICAL_PREVIEW_COUNT,
    TARGET_EXCLUDED_PREVIEW_COUNT,
    EXCLUDED_INDEPENDENT_PREVIEW_COUNT,
    ROLE_LABELS,
    validTicket,
    validateCandidate,
    roleLabelsFor,
    compactAudit,
    select,
    createPracticalSelection(
      prediction
    ) {
      return select(prediction).tickets;
    }
  };

  root.ChappyPracticalSelection =
    api;

  if (
    typeof module !== "undefined" &&
    module.exports
  ) {
    module.exports = api;
  }
})(
  typeof window !== "undefined"
    ? window
    : globalThis
);
