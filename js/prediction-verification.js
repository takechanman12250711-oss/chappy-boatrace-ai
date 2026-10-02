/* =========================================================
  AI予想と公式結果の共通照合

  重要：検証結果を返すだけで、予想ロジック・重み・買い目は変更しない。
========================================================= */

(function (root, factory) {
  const conditions = typeof module === "object" && module.exports
    ? require("./prediction-conditions")
    : root?.ChappyPredictionConditions;
  const api = factory(conditions);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyPredictionVerification = api;
})(typeof window !== "undefined" ? window : globalThis, function (Conditions) {
  "use strict";

  const MARKS = [
    { key: "honmei", symbol: "◎", label: "本命" },
    { key: "taikou", symbol: "○", label: "対抗" },
    { key: "ana", symbol: "▲", label: "穴" },
    { key: "osae", symbol: "△", label: "押さえ" }
  ];

  const CATEGORY_ORDER = [
    "本線",
    "押さえ",
    "流し",
    "独立展開",
    "万舟・穴",
    "その他"
  ];
  const ROLE_ORDER = [
    {
      key: "attack",
      label: "攻め・頭"
    },
    {
      key: "continuation",
      label: "追走・続行"
    },
    {
      key: "hold",
      label: "残し"
    },
    {
      key: "pickup",
      label: "拾い"
    }
  ];
  const PRIORITY_STAGES = Conditions?.PRIORITY_STAGES || [
    "展開", "コース", "ST・スリット", "展示・足",
    "残し・拾い", "当地・水面", "技量", "モーター"
  ];

  function normalizeTicket(value) {
    const boats = String(value || "").match(/[1-6]/g) || [];
    if (boats.length < 3) return "";
    const ticket = boats.slice(0, 3);
    return new Set(ticket).size === 3 ? ticket.join("-") : "";
  }

  function percentage(count, total) {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }

  function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : 0;
  }

  function boatNoOf(value) {
    const number = Number(value?.boatNo ?? value?.no ?? value?.boat ?? value);
    return number >= 1 && number <= 6 ? number : 0;
  }

  function normalizeCategory(value) {
    const text = String(value || "");
    if (/本線|本命|中心/.test(text)) return "本線";
    if (/押さえ|安全/.test(text)) return "押さえ";
    if (/流し/.test(text)) return "流し";
    if (/独立展開|展開追加/.test(text)) return "独立展開";
    if (/万舟|穴|高配当/.test(text)) return "万舟・穴";
    return "その他";
  }

  function unique(values) {
    return [
      ...new Set(
        (Array.isArray(values)
          ? values
          : [values])
          .filter(
            value =>
              value !== null &&
              value !== undefined &&
              value !== ""
          )
      )
    ];
  }

  function normalizeRole(value) {
    const role =
      String(value || "");

    if (
      role === "head" ||
      role === "alternate-head" ||
      role === "attack"
    ) {
      return "attack";
    }
    if (
      role === "continuation"
    ) {
      return "continuation";
    }
    if (
      role === "hold" ||
      role === "inside"
    ) {
      return "hold";
    }
    if (role === "pickup") {
      return "pickup";
    }
    return "";
  }

  function verificationEvidenceOf(
    prediction
  ) {
    return (
      prediction
        ?.verificationEvidence ||
      prediction
        ?.practicalSelection
        ?.verificationEvidence ||
      null
    );
  }

  function normalizeGeneration(
    value
  ) {
    const generation =
      value &&
      typeof value === "object"
        ? value
        : {};

    return {
      logicFingerprint:
        String(
          generation
            .logicFingerprint ||
          ""
        ).trim(),
      confidenceDefinitionVersion:
        String(
          generation
            .confidenceDefinitionVersion ||
          ""
        ).trim(),
      ticketPolicyVersion:
        String(
          generation
            .ticketPolicyVersion ||
          ""
        ).trim()
    };
  }

  function normalizeSchemaVersion(
    value
  ) {
    const version =
      Number(value);
    return (
      Number.isInteger(version) &&
      version > 0
    )
      ? version
      : 0;
  }

  function normalizeSupportIdentity(
    value
  ) {
    const source =
      value &&
      typeof value === "object"
        ? value
        : {};
    const identity = {
      roleSchemaVersion:
        normalizeSchemaVersion(
          source
            .roleSchemaVersion
        ),
      theorySchemaVersion:
        normalizeSchemaVersion(
          source
            .theorySchemaVersion
        ),
      theorySetFingerprint:
        String(
          source
            .theorySetFingerprint ||
          ""
        ).trim(),
      generation:
        normalizeGeneration(
          source.generation
        )
    };

    [
      "evaluator",
      "evaluatorVersion",
      "selectorCohortKey",
      "logicFingerprint",
      "theoryInputVersion"
    ].forEach(key => {
      const normalized =
        String(
          source[key] || ""
        ).trim();
      if (normalized) {
        identity[key] =
          normalized;
      }
    });

    return identity;
  }

  function generationIsComplete(
    value
  ) {
    const generation =
      normalizeGeneration(value);
    return Boolean(
      generation
        .logicFingerprint &&
      generation
        .confidenceDefinitionVersion &&
      generation
        .ticketPolicyVersion
    );
  }

  function roleSupportIdentityIsValid(
    value
  ) {
    const identity =
      normalizeSupportIdentity(
        value
      );
    return (
      identity
        .roleSchemaVersion >= 1 &&
      generationIsComplete(
        identity.generation
      )
    );
  }

  function theorySupportIdentityIsValid(
    value
  ) {
    const identity =
      normalizeSupportIdentity(
        value
      );
    return (
      identity
        .theorySchemaVersion >= 1 &&
      Boolean(
        identity
          .theorySetFingerprint
      ) &&
      Boolean(
        identity.evaluator &&
        identity
          .evaluatorVersion &&
        identity
          .selectorCohortKey &&
        identity
          .logicFingerprint &&
        identity
          .theoryInputVersion
      ) &&
      generationIsComplete(
        identity.generation
      )
    );
  }

  function supportIdentityKey(
    value
  ) {
    const identity =
      normalizeSupportIdentity(
        value
      );
    const generation =
      identity.generation;

    return JSON.stringify([
      identity
        .roleSchemaVersion,
      identity
        .theorySchemaVersion,
      identity
        .theorySetFingerprint,
      generation
        .logicFingerprint,
      generation
        .confidenceDefinitionVersion,
      generation
        .ticketPolicyVersion,
      identity.evaluator || "",
      identity
        .evaluatorVersion || "",
      identity
        .selectorCohortKey || "",
      identity
        .logicFingerprint || "",
      identity
        .theoryInputVersion || ""
    ]);
  }

  function normalizeRoleClaims(
    claims
  ) {
    return (
      Array.isArray(claims)
        ? claims
        : []
    )
      .map(claim => {
        const role =
          normalizeRole(
            claim?.role
          );
        const targetBoatNo =
          boatNoOf(claim);
        const expectedPositions =
          unique(
            claim
              ?.expectedPositions ||
            claim
              ?.eligiblePositions ||
            claim?.position ||
            []
          )
            .map(Number)
            .filter(
              position =>
                position >= 1 &&
                position <= 3
            )
            .sort(
              (a, b) => a - b
            );

        return {
          role,
          boatNo:
            targetBoatNo,
          expectedPositions
        };
      })
      .filter(
        claim =>
          claim.role &&
          claim.boatNo &&
          claim
            .expectedPositions
            .length
      );
  }

  function normalizeTheoryClaims(
    claims
  ) {
    return (
      Array.isArray(claims)
        ? claims
        : []
    )
      .map(claim => {
        const theoryKey =
          String(
            claim?.theoryKey ||
            claim?.key ||
            ""
          ).trim();

        return {
          theoryKey,
          label:
            String(
              claim?.label ||
              claim?.theoryLabel ||
              theoryKey
            ).trim(),
          version:
            String(
              claim?.theoryVersion ||
              claim?.version ||
              ""
            ).trim(),
          formal:
            claim?.formal === true,
          source:
            String(
              claim?.source || ""
            ).trim()
        };
      });
  }

  function getPracticalRows(prediction) {
    const source = Array.isArray(prediction?.practicalTickets)
      ? prediction.practicalTickets
      : [];
    const used = new Set();
    const verificationEvidence =
      verificationEvidenceOf(
        prediction
      );
    const evidenceTickets =
      new Map(
        (
          Array.isArray(
            verificationEvidence
              ?.tickets
          )
            ? verificationEvidence
                .tickets
            : []
        ).map(row => [
          normalizeTicket(
            row?.ticket
          ),
          row
        ])
      );

    return source
      .map(item => {
        const row = typeof item === "string" ? { ticket: item } : item || {};
        const ticket =
          normalizeTicket(
            row.ticket ||
            row.line ||
            row.formation
          );
        const evidenceTicket =
          evidenceTickets.get(
            ticket
          ) || {};
        const normalizedCategories =
          unique([
            row.category,
            row.role,
            ...(Array.isArray(
              row.categories
            )
              ? row.categories
              : []),
            evidenceTicket.category,
            ...(Array.isArray(
              evidenceTicket
                .categories
            )
              ? evidenceTicket
                  .categories
              : [])
          ].map(
            normalizeCategory
          ));
        const categories =
          normalizedCategories
            .some(
              category =>
                category !==
                "その他"
            )
            ? normalizedCategories
                .filter(
                  category =>
                    category !==
                    "その他"
                )
            : normalizedCategories;
        const roleClaims =
          normalizeRoleClaims(
            evidenceTicket
              .roleClaims ||
            row.roleClaims ||
            (
              Array.isArray(
                row.roleLabels
              )
                ? row.roleLabels
                    .filter(
                      role =>
                        role
                          ?.structured !==
                        false
                    )
                    .map(role => ({
                      role:
                        role.role,
                      boatNo:
                        role.boatNo,
                      expectedPositions: [
                        role.position
                      ]
                    }))
                : []
            )
          );
        const ticketTheoryClaims =
          evidenceTicket.theoryClaims !==
            undefined
            ? evidenceTicket.theoryClaims
            : row.theoryClaims !==
                undefined
              ? row.theoryClaims
              : row.theoryClaimsRef ===
                  true
                ? verificationEvidence
                    ?.theoryClaims
                : undefined;
        const theoryClaims =
          normalizeTheoryClaims(
            ticketTheoryClaims
          );

        return {
          ticket,
          category:
            categories[0] ||
            "その他",
          categories:
            categories.length
              ? categories
              : ["その他"],
          selectionTier:
            String(
              row.selectionTier ||
              evidenceTicket
                .selectionTier ||
              ""
            ),
          roleClaims,
          theoryClaims
        };
      })
      .filter(row => {
        if (!row.ticket || used.has(row.ticket)) return false;
        used.add(row.ticket);
        return true;
      })
      .slice(0, 10);
  }

  function buildSupportPerformance(
    items,
    claimField,
    options
  ) {
    const rows =
      Array.isArray(items)
        ? items.filter(
            item =>
              item?.settled
          )
        : [];
    const groups =
      new Map();
    let omittedCount = 0;

    rows.forEach(
      (item, raceIndex) => {
        const supportIdentity =
          normalizeSupportIdentity(
            item
              ?.supportIdentity
          );
        const identityValid =
          options
            .identityIsValid(
              supportIdentity
            );
        const identityKey =
          supportIdentityKey(
            supportIdentity
          );
        const resultTicket =
          normalizeTicket(
            item?.resultTicket
          );
        const payout =
          numberOrZero(
            item?.payoutPer100
          );

        (
          Array.isArray(
            item?.practicalRows
          )
            ? item.practicalRows
            : []
        ).forEach(ticketRow => {
          const ticket =
            normalizeTicket(
              ticketRow?.ticket
            );
          const uniqueClaims =
            new Map();

          (
            Array.isArray(
              ticketRow?.[claimField]
            )
              ? ticketRow[claimField]
              : []
          ).forEach(claim => {
            const descriptor =
              identityValid
                ? options
                    .describeClaim(
                      claim,
                      supportIdentity
                    )
                : null;

            if (!descriptor) {
              omittedCount += 1;
              return;
            }

            const cohortKey =
              JSON.stringify([
                identityKey,
                descriptor.groupKey
              ]);
            if (
              !uniqueClaims.has(
                cohortKey
              )
            ) {
              uniqueClaims.set(
                cohortKey,
                descriptor
              );
            }
          });

          uniqueClaims.forEach(
            (
              descriptor,
              cohortKey
            ) => {
              if (
                !groups.has(
                  cohortKey
                )
              ) {
                groups.set(
                  cohortKey,
                  {
                    key:
                      descriptor.key,
                    label:
                      String(
                        descriptor.label ||
                        descriptor.key
                      ),
                    metadata:
                      descriptor
                        .metadata || {},
                    raceIndexes:
                      new Set(),
                    ticketCount: 0,
                    hitTickets: 0,
                    stake: 0,
                    return: 0
                  }
                );
              }

              const group =
                groups.get(
                  cohortKey
                );
              group.raceIndexes
                .add(raceIndex);
              group.ticketCount += 1;
              group.stake += 100;

              if (
                ticket &&
                ticket === resultTicket
              ) {
                group.hitTickets += 1;
                group.return += payout;
              }
            }
          );
        });
      }
    );

    return {
      omittedCount,
      rows: [
        ...groups.values()
      ].map(group => ({
        key: group.key,
        label: group.label,
        raceCount:
          group.raceIndexes.size,
        ticketCount:
          group.ticketCount,
        hitTickets:
          group.hitTickets,
        stake:
          group.stake,
        return:
          group.return,
        profit:
          group.return -
          group.stake,
        recoveryRate:
          group.stake
            ? Math.round(
                group.return /
                group.stake *
                1000
              ) / 10
            : 0,
        supportCohort: true,
        overlappingCohort: true,
        notAdditive: true,
        ...group.metadata
      }))
    };
  }

  function buildRolePerformanceSummary(
    items
  ) {
    return buildSupportPerformance(
      items,
      "roleClaims",
      {
        identityIsValid:
          roleSupportIdentityIsValid,
        describeClaim: (
          claim,
          supportIdentity
        ) => {
          const key =
            normalizeRole(
              claim?.role
            );
          if (!key) return null;

          return {
            groupKey: key,
            key,
            label:
              ROLE_ORDER.find(
                role =>
                  role.key === key
              )?.label ||
              claim?.label ||
              key,
            metadata: {
              supportIdentity,
              supportIdentityKey:
                supportIdentityKey(
                  supportIdentity
                ),
              roleSchemaVersion:
                supportIdentity
                  .roleSchemaVersion
            }
          };
        }
      }
    ).rows;
  }

  function buildTheoryPerformanceSummary(
    items
  ) {
    const result =
      buildSupportPerformance(
        items,
        "theoryClaims",
        {
          identityIsValid:
            theorySupportIdentityIsValid,
          describeClaim: (
            claim,
            supportIdentity
          ) => {
            const theoryKey =
              String(
                claim?.theoryKey ||
                ""
              ).trim();
            const version =
              String(
                claim?.version ||
                ""
              ).trim();
            const source =
              String(
                claim?.source ||
                ""
              ).trim();
            const formal =
              claim?.formal === true;

            if (
              !formal ||
              !theoryKey ||
              !version ||
              !source
            ) {
              return null;
            }

            const label =
              String(
                claim?.label ||
                claim?.theoryKey ||
                theoryKey
              );

            return {
              groupKey:
                JSON.stringify([
                  theoryKey,
                  version,
                  source
                ]),
              key: theoryKey,
              label:
                `${label}（${version}）`,
              metadata: {
                theoryKey,
                version,
                theoryVersion:
                  version,
                source,
                formal: true,
                supportIdentity,
                supportIdentityKey:
                  supportIdentityKey(
                    supportIdentity
                  ),
                theorySchemaVersion:
                  supportIdentity
                    .theorySchemaVersion,
                theorySetFingerprint:
                  supportIdentity
                    .theorySetFingerprint
              }
            };
          }
        }
      );
    const rows =
      result.rows;

    return {
      status:
        rows.length
          ? "available"
          : "collecting_pre_race_attribution",
      rows,
      omittedCount:
        result.omittedCount,
      description:
        rows.length
          ? "各理論が予想時点で支持した買い目群の実績。行同士は重複し、全体収支へ合算しません。"
          : "予想時点の理論帰属が保存されたレースから集計します。旧履歴を結果後に推測して補完しません。",
      supportCohort: true,
      overlappingCohort: true,
      notAdditive: true
    };
  }

  function classifyMiss(tickets, resultTicket) {
    const actual = normalizeTicket(resultTicket);
    const selected = (Array.isArray(tickets) ? tickets : [])
      .map(normalizeTicket)
      .filter(Boolean);

    if (!actual || selected.length === 0) return "見送り";
    if (selected.includes(actual)) return "的中";

    const result = actual.split("-");
    const normalized = selected.map(ticket => ticket.split("-"));
    if (!normalized.some(ticket => ticket[0] === result[0])) return "頭外れ";

    if (normalized.some(ticket =>
      [...ticket].sort().join("") === [...result].sort().join("")
    )) return "着順違い";

    const resultOpponents = new Set(result.slice(1));
    const hasOneOpponent = normalized.some(ticket =>
      ticket[0] === result[0] &&
      ticket.slice(1).some(boat => resultOpponents.has(boat))
    );
    return hasOneOpponent ? "相手抜け" : "完全抜け";
  }

  function predictedScenarioTitle(prediction) {
    return String(
      prediction?.predictedScenarioTitle ||
      prediction?.raceFlow?.title ||
      prediction?.raceFlow?.scenario?.title ||
      ""
    ).trim();
  }

  function expectedWinningMethods(title) {
    const text = String(title || "");
    if (/まくり差し/.test(text)) return ["まくり差し"];
    if (/まくり/.test(text)) return ["まくり"];
    if (/差し/.test(text)) return ["差し"];
    if (/逃げ|イン先行|イン中心/.test(text)) return ["逃げ"];
    if (/[34]コース攻め|[34]攻め|4カド/.test(text)) {
      return ["まくり", "まくり差し"];
    }
    return [];
  }

  function expectedWinningMethod(title) {
    return expectedWinningMethods(title).join("／");
  }

  function normalizeWinningMethod(value) {
    const text = String(value || "").trim();
    if (/まくり差し/.test(text)) return "まくり差し";
    if (/まくり/.test(text)) return "まくり";
    if (/差し/.test(text)) return "差し";
    if (/逃げ/.test(text)) return "逃げ";
    if (/抜き/.test(text)) return "抜き";
    if (/恵まれ/.test(text)) return "恵まれ";
    return text;
  }

  function buildScenarioVerification(
    prediction,
    resultTicket,
    winningMethod
  ) {
    const evidence =
      verificationEvidenceOf(
        prediction
      );
    const structured =
      Number(
        evidence
          ?.roleSchemaVersion || 0
      ) >= 1;
    const scenario =
      evidence?.mainScenario || {};
    const label =
      String(
        scenario.label ||
        predictedScenarioTitle(
          prediction
        ) ||
        ""
      );
    const expectedMethods =
      unique(
        scenario
          .expectedWinningMethods ||
        expectedWinningMethods(label)
      );
    const actualWinner =
      Number(
        normalizeTicket(
          resultTicket
        ).split("-")[0] ||
        0
      );
    const expectedWinner =
      Number(
        scenario.headBoatNo ||
        scenario.attackerBoatNo ||
        0
      );
    const methodComparable =
      [
        "逃げ",
        "差し",
        "まくり",
        "まくり差し",
        "抜き",
        "恵まれ"
      ].includes(
        winningMethod
      ) &&
      expectedMethods.length > 0;
    const positionComparable =
      structured &&
      expectedWinner >= 1 &&
      expectedWinner <= 6 &&
      actualWinner >= 1 &&
      actualWinner <= 6;
    const positionMatched =
      positionComparable
        ? actualWinner ===
            expectedWinner
        : null;
    const methodMatched =
      methodComparable
        ? expectedMethods.includes(
            winningMethod
          )
        : null;
    const status =
      !structured ||
      !positionComparable ||
      !methodComparable
        ? "not_comparable"
        : positionMatched &&
            methodMatched
          ? "matched"
          : "missed";

    return {
      status,
      structured,
      label,
      expectedWinner:
        expectedWinner || null,
      actualWinner:
        actualWinner || null,
      expectedMethods,
      winningMethod,
      positionMatched,
      methodMatched
    };
  }

  function buildRoleResults(
    prediction,
    resultTicket
  ) {
    const evidence =
      verificationEvidenceOf(
        prediction
      );

    if (
      Number(
        evidence
          ?.roleSchemaVersion || 0
      ) < 1
    ) {
      return [];
    }

    const order =
      normalizeTicket(
        resultTicket
      ).split("-").map(Number);
    const claims =
      normalizeRoleClaims(
        evidence.roleClaims
      );
    const merged =
      new Map();

    claims.forEach(claim => {
      const key =
        `${claim.role}|` +
        `${claim.boatNo}`;
      const current =
        merged.get(key) || {
          role: claim.role,
          boatNo:
            claim.boatNo,
          expectedPositions: []
        };

      current.expectedPositions =
        unique([
          ...current
            .expectedPositions,
          ...claim
            .expectedPositions
        ])
          .map(Number)
          .sort(
            (a, b) => a - b
          );
      merged.set(key, current);
    });

    return [
      ...merged.values()
    ].map(claim => {
      const index =
        order.indexOf(
          claim.boatNo
        );
      const actualFinish =
        index >= 0
          ? index + 1
          : 4;
      const matched =
        claim
          .expectedPositions
          .includes(
            actualFinish
          );

      return {
        ...claim,
        label:
          ROLE_ORDER.find(
            role =>
              role.key ===
                claim.role
          )?.label ||
          claim.role,
        actualFinish,
        status:
          matched
            ? "matched"
            : "missed",
        matched,
        top3:
          actualFinish <= 3
      };
    });
  }

  function buildTicketCategoryResults(
    practicalRows,
    resultTicket
  ) {
    return CATEGORY_ORDER
      .map(label => {
        const rows =
          practicalRows.filter(
            row =>
              row.categories
                .includes(label)
          );

        if (!rows.length) {
          return null;
        }

        const matched =
          rows.some(
            row =>
              row.ticket ===
                resultTicket
          );

        return {
          label,
          attempted: true,
          matched,
          status:
            matched
              ? "matched"
              : "missed",
          ticketCount:
            rows.length
        };
      })
      .filter(Boolean);
  }

  function getMarkResults(prediction, resultTicket) {
    const order = normalizeTicket(resultTicket).split("-");
    const sheet = prediction?.mainSheet || {};

    return MARKS.map(mark => {
      const boatNo = boatNoOf(sheet[mark.key]);
      const index = boatNo ? order.indexOf(String(boatNo)) : -1;
      return {
        ...mark,
        boatNo,
        finish: boatNo ? (index >= 0 ? index + 1 : 4) : 0,
        finishLabel: boatNo ? (index >= 0 ? `${index + 1}着` : "4着以下") : "-"
      };
    });
  }

  function conditionBoat(prediction, boatNo) {
    return (prediction?.preRaceConditions?.boats || [])
      .find(boat => boatNoOf(boat) === Number(boatNo)) || null;
  }

  function classRank(value) {
    return ({ A1: 4, A2: 3, B1: 2, B2: 1 })[String(value || "")] || 0;
  }

  function actualStart(result, boatNo) {
    const row = (Array.isArray(result?.starts) ? result.starts : [])
      .find(item => boatNoOf(item) === Number(boatNo));
    return row ? numberOrZero(row.st) : 0;
  }

  function reviewStage(stage, status, evidence) {
    return { stage, status, evidence: String(evidence || "") };
  }

  function buildPriorityReview(prediction, result, detail) {
    if (!detail.settled) {
      return {
        primaryStage: "結果待ち",
        primaryEvidence: "公式結果の確定後に8段階で照合します。",
        stages: PRIORITY_STAGES.map(stage => reviewStage(stage, "結果待ち", ""))
      };
    }
    if (detail.practicalHit) {
      return {
        primaryStage: "的中",
        primaryEvidence: "実戦厳選の買い目が公式結果と一致しました。",
        stages: PRIORITY_STAGES.map(stage => reviewStage(stage, "対象外", "的中のため原因判定なし"))
      };
    }

    const winner = Number(detail.resultTicket.split("-")[0] || 0);
    const honmei = boatNoOf(prediction?.mainSheet?.honmei);
    const winnerBoat = conditionBoat(prediction, winner);
    const honmeiBoat = conditionBoat(prediction, honmei);
    const weather = prediction?.preRaceConditions?.weather || {};
    const stages = [];

    stages.push(detail.scenarioMatched === false
      ? reviewStage("展開", "要確認", `予想展開「${detail.scenarioTitle || "-"}」と決まり手「${detail.winningMethod || "-"}」が不一致`)
      : detail.scenarioMatched === true
        ? reviewStage("展開", "一致", "中心展開と公式決まり手が一致")
        : reviewStage("展開", "判定保留", "公式決まり手と直接比較できる展開情報が不足"));

    stages.push(honmei && winner && honmei !== winner
      ? reviewStage("コース", "要確認", `◎${honmei}号艇に対し、1着は${winner}号艇`)
      : honmei && winner
        ? reviewStage("コース", "一致", `◎${honmei}号艇が1着`)
        : reviewStage("コース", "判定保留", "◎または1着艇を特定できない"));

    const winnerActualSt = actualStart(result, winner);
    const honmeiActualSt = actualStart(result, honmei);
    const preStAvailable = Boolean(
      winnerBoat && honmeiBoat &&
      (winnerBoat.exhibitionST !== null || winnerBoat.currentST !== null || winnerBoat.avgST !== null) &&
      (honmeiBoat.exhibitionST !== null || honmeiBoat.currentST !== null || honmeiBoat.avgST !== null)
    );
    stages.push(winnerActualSt && honmeiActualSt && winnerActualSt + 0.03 <= honmeiActualSt
      ? reviewStage("ST・スリット", "要確認", `実戦STは1着艇${winnerActualSt.toFixed(2)}、◎${honmeiActualSt.toFixed(2)}`)
      : preStAvailable
        ? reviewStage("ST・スリット", "確認済み", "予想時点の平均・今節・展示STを保存済み")
        : reviewStage("ST・スリット", "判定保留", "予想時点の比較可能なSTが不足"));

    const winnerEx = Number(winnerBoat?.exhibitionTime || 0);
    const honmeiEx = Number(honmeiBoat?.exhibitionTime || 0);
    stages.push(winnerEx && honmeiEx && winnerEx + 0.05 <= honmeiEx
      ? reviewStage("展示・足", "要確認", `展示は1着艇${winnerEx.toFixed(2)}、◎${honmeiEx.toFixed(2)}`)
      : winnerEx && honmeiEx
        ? reviewStage("展示・足", "確認済み", `展示は1着艇${winnerEx.toFixed(2)}、◎${honmeiEx.toFixed(2)}`)
        : reviewStage("展示・足", "判定保留", "予想時点の展示比較データが不足"));

    stages.push(["相手抜け", "着順違い"].includes(detail.missType)
      ? reviewStage("残し・拾い", "要確認", `外れ方は「${detail.missType}」`)
      : reviewStage("残し・拾い", "確認済み", `外れ方は「${detail.missType}」`));

    const roughWater = Number(weather.windSpeed || 0) >= 5 ||
      Number(weather.waveHeight || 0) >= 5 ||
      Number(weather.venueTideInfluence || 0) >= 65;
    stages.push(roughWater
      ? reviewStage("当地・水面", "要確認", `風${weather.windSpeed ?? "-"}m・波${weather.waveHeight ?? "-"}cm・潮影響${weather.venueTideInfluence ?? "-"}`)
      : weather.windSpeed !== null || weather.waveHeight !== null || weather.venueTideInfluence !== null
        ? reviewStage("当地・水面", "確認済み", `風${weather.windSpeed ?? "-"}m・波${weather.waveHeight ?? "-"}cm・潮影響${weather.venueTideInfluence ?? "-"}`)
        : reviewStage("当地・水面", "判定保留", "予想時点の風・波・潮データが不足"));

    const strongerWinner = classRank(winnerBoat?.className) > classRank(honmeiBoat?.className) ||
      Number(winnerBoat?.nationalWinRate || 0) >= Number(honmeiBoat?.nationalWinRate || 0) + 1;
    stages.push(winnerBoat && honmeiBoat
      ? reviewStage("技量", strongerWinner ? "要確認" : "確認済み",
        `1着艇${winnerBoat.className || "-"}・全国${winnerBoat.nationalWinRate ?? "-"}、◎${honmeiBoat.className || "-"}・全国${honmeiBoat.nationalWinRate ?? "-"}`)
      : reviewStage("技量", "判定保留", "予想時点の選手技量データが不足"));

    const newEngineMode = Boolean(prediction?.preRaceConditions?.newEngineMode);
    const motorGap = Number(winnerBoat?.motor2Rate || 0) - Number(honmeiBoat?.motor2Rate || 0);
    stages.push(newEngineMode
      ? reviewStage("モーター", "参考外", "新エンジン期のためモーター数字を原因認定しない")
      : winnerBoat && honmeiBoat &&
        winnerBoat.motor2Rate !== null && honmeiBoat.motor2Rate !== null
        ? reviewStage("モーター", motorGap >= 10 ? "要確認" : "確認済み",
          `1着艇${winnerBoat.motor2Rate}%、◎${honmeiBoat.motor2Rate}%`)
        : reviewStage("モーター", "判定保留", "予想時点のモーター比較データが不足"));

    const primary = stages.find(item => item.status === "要確認");
    return {
      primaryStage: primary?.stage || "判定保留",
      primaryEvidence: primary?.evidence || "保存済みデータだけでは主原因を絞れません。",
      stages
    };
  }

  function verifyPrediction(prediction, result) {
    const resultTicket = normalizeTicket(
      result?.resultTicket || result?.result || result?.trifecta?.combination
    );
    const settled = Boolean(
      resultTicket && result?.resultAvailable !== false && result?.settled !== false
    );
    const practicalRows = getPracticalRows(prediction);
    const practicalTickets = practicalRows.map(row => row.ticket);
    const winningMethod = normalizeWinningMethod(result?.winningMethod);
    const scenarioTitle = predictedScenarioTitle(prediction);
    const expectedMethods = expectedWinningMethods(scenarioTitle);
    const expectedMethod = expectedMethods.join("／");
    const comparableMethod = [
      "逃げ",
      "差し",
      "まくり",
      "まくり差し",
      "抜き",
      "恵まれ"
    ]
      .includes(winningMethod);
    const hitRow = practicalRows.find(row => row.ticket === resultTicket) || null;
    const payoutPer100 = numberOrZero(
      result?.payout ?? result?.officialPayoutPer100 ?? result?.trifecta?.payout
    );
    const simulatedStake = practicalRows.length * 100;
    const simulatedReturn = hitRow ? payoutPer100 : 0;
    const scenarioVerification =
      buildScenarioVerification(
        prediction,
        resultTicket,
        winningMethod
      );
    const roleResults =
      settled
        ? buildRoleResults(
            prediction,
            resultTicket
          )
        : [];
    const ticketCategoryResults =
      settled
        ? buildTicketCategoryResults(
            practicalRows,
            resultTicket
          )
        : [];
    const verificationEvidence =
      verificationEvidenceOf(
        prediction
      );
    const supportIdentity =
      normalizeSupportIdentity(
        verificationEvidence
      );

    const base = {
      schemaVersion: 5,
      settled,
      resultTicket,
      winningMethod,
      scenarioTitle,
      expectedMethod,
      scenarioMatched: expectedMethods.length && comparableMethod
        ? expectedMethods.includes(winningMethod)
        : null,
      marks: getMarkResults(prediction, resultTicket),
      practicalRows,
      practicalTickets,
      practicalPointCount: practicalRows.length,
      practicalHit: Boolean(hitRow),
      hitCategory: hitRow?.category || "",
      hitCategories:
        hitRow?.categories || [],
      missType: settled ? classifyMiss(practicalTickets, resultTicket) : "結果待ち",
      payoutPer100,
      popularity: Number(result?.popularity ?? result?.officialPopularity ?? 0) || 0,
      simulatedStake,
      simulatedReturn,
      simulatedProfit: simulatedReturn - simulatedStake,
      simulatedRecoveryRate: simulatedStake
        ? Math.round((simulatedReturn / simulatedStake) * 1000) / 10
        : 0,
      scenarioVerification,
      roleResults,
      ticketCategoryResults,
      supportIdentity,
      calibrationKey:
        supportIdentity
          .generation,
      internalEvaluation:
        prediction
          ?.internalEvaluation ||
        null,
      usagePolicy: "検証表示のみ。予想ロジック・重み・買い目は自動変更しない"
    };
    const priorityReview = buildPriorityReview(prediction, result, base);
    return { ...base, priorityReview };
  }

  function buildSummary(items) {
    const settled = (Array.isArray(items) ? items : [])
      .filter(item => item?.settled);
    const practical = settled.filter(item => item.practicalPointCount > 0);
    const hits = practical.filter(item => item.practicalHit);
    const scenarioComparable = settled.filter(item => item.scenarioMatched !== null);
    const scenarioHits = scenarioComparable.filter(item => item.scenarioMatched);
    const totalStake = practical.reduce((sum, item) => sum + item.simulatedStake, 0);
    const totalReturn = practical.reduce((sum, item) => sum + item.simulatedReturn, 0);
    const priorityStageSummary = PRIORITY_STAGES.map(label => ({
      label,
      count: practical.filter(item =>
        !item.practicalHit && item.priorityReview?.primaryStage === label
      ).length
    }));

    const categorySummary = CATEGORY_ORDER.map(label => {
      const count = hits.filter(item => item.hitCategory === label).length;
      return { label, count, percentage: percentage(count, hits.length) };
    });
    const ticketCategorySummary =
      CATEGORY_ORDER.map(label => {
        const rows =
          settled
            .map(item =>
              (
                item
                  .ticketCategoryResults ||
                []
              ).find(
                row =>
                  row.label === label
              )
            )
            .filter(Boolean);
        const matched =
          rows.filter(
            row =>
              row.status ===
              "matched"
          ).length;

        return {
          label,
          attempts:
            rows.length,
          matched,
          hitRate:
            percentage(
              matched,
              rows.length
            )
        };
      });
    const roleSummary =
      ROLE_ORDER.map(role => {
        const rows =
          settled.flatMap(item =>
            (
              item.roleResults ||
              []
            ).filter(
              row =>
                row.role ===
                  role.key &&
                (
                  row.status ===
                    "matched" ||
                  row.status ===
                    "missed"
                )
            )
          );
        const matched =
          rows.filter(
            row =>
              row.status ===
              "matched"
          ).length;
        const top3 =
          rows.filter(
            row => row.top3
          ).length;

        return {
          ...role,
          attempts:
            rows.length,
          matched,
          matchRate:
            percentage(
              matched,
              rows.length
            ),
          top3,
          top3Rate:
            percentage(
              top3,
              rows.length
            )
        };
      });
    const structuredScenarioComparable =
      settled.filter(item =>
        [
          "matched",
          "missed"
        ].includes(
          item
            ?.scenarioVerification
            ?.status
        )
      );
    const structuredScenarioHits =
      structuredScenarioComparable
        .filter(
          item =>
            item
              .scenarioVerification
              .status ===
            "matched"
        );
    const rolePerformanceSummary =
      buildRolePerformanceSummary(
        settled
      );
    const theoryPerformanceSummary =
      buildTheoryPerformanceSummary(
        settled
      );

    const markSummary = MARKS.map(mark => {
      const rows = settled
        .map(item => item.marks?.find(value => value.key === mark.key))
        .filter(item => item?.boatNo);
      const first = rows.filter(item => item.finish === 1).length;
      const top3 = rows.filter(item => item.finish >= 1 && item.finish <= 3).length;
      return {
        ...mark,
        count: rows.length,
        first,
        firstRate: percentage(first, rows.length),
        top3,
        top3Rate: percentage(top3, rows.length)
      };
    });

    return {
      settledCount: settled.length,
      practicalCount: practical.length,
      practicalHits: hits.length,
      practicalHitRate: percentage(hits.length, practical.length),
      scenarioComparableCount: scenarioComparable.length,
      scenarioHits: scenarioHits.length,
      scenarioMatchRate: percentage(scenarioHits.length, scenarioComparable.length),
      structuredScenarioComparableCount:
        structuredScenarioComparable
          .length,
      structuredScenarioHits:
        structuredScenarioHits
          .length,
      structuredScenarioMatchRate:
        percentage(
          structuredScenarioHits
            .length,
          structuredScenarioComparable
            .length
        ),
      totalStake,
      totalReturn,
      simulatedProfit: totalReturn - totalStake,
      simulatedRecoveryRate: totalStake
        ? Math.round((totalReturn / totalStake) * 1000) / 10
        : 0,
      categorySummary,
      ticketCategorySummary,
      roleSummary,
      rolePerformanceSummary,
      theoryPerformanceSummary,
      markSummary,
      priorityStageSummary
    };
  }

  return {
    MARKS,
    CATEGORY_ORDER,
    ROLE_ORDER,
    PRIORITY_STAGES,
    normalizeTicket,
    normalizeCategory,
    normalizeSupportIdentity,
    supportIdentityKey,
    classifyMiss,
    expectedWinningMethods,
    expectedWinningMethod,
    buildScenarioVerification,
    buildRoleResults,
    buildRolePerformanceSummary,
    buildTheoryPerformanceSummary,
    buildTicketCategoryResults,
    buildPriorityReview,
    verifyPrediction,
    buildSummary
  };
});
