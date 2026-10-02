"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");

global.window = global;
require("../js/ai-core");
const theoryInput = require("../js/theory-input");
require("../js/prediction");
const practicalSelector = require("../js/practical-selection");

const DATES = [
  "20260722",
  "20260723",
  "20260724",
  "20260725",
  "20260726",
  "20260727",
  "20260728"
];
const MARK_KEYS = [
  "honmei",
  "taikou",
  "ana",
  "osae"
];
const NUMERIC_FIELDS = [
  "score",
  "total",
  "attack",
  "tenkai",
  "michu",
  "hold",
  "pickup"
];
const ROLE_POSITIONS = {
  head: [1],
  "alternate-head": [1],
  hold: [2, 3],
  pickup: [3]
};
const CATEGORY_GROUPS = {
  "本線": "main",
  "本命": "main",
  "押さえ": "cover",
  "流し": "flow",
  "万舟・穴": "hole",
  "穴": "hole",
  "穴候補": "hole",
  "独立展開": "independent",
  "候補補完": "candidate-promotion",
  "順位ゲート補完":
    "priority-gate-replacement"
};

function boatNo(mark) {
  return Number(
    mark?.boatNo ??
    mark?.number ??
    mark?.waku ??
    0
  );
}

function scenarioKey(scenario) {
  const rawHead =
    scenario?.headBoatNo ??
    scenario?.attackerBoatNo ??
    scenario?.attacker ??
    0;
  const head =
    Number(rawHead) ||
    boatNo(rawHead);

  return [
    String(scenario?.label || ""),
    head
  ].join(":");
}

function createRaceData(record) {
  const snapshot =
    record?.prediction?.preRaceConditions;

  assert.ok(
    Array.isArray(snapshot?.boats) &&
      snapshot.boats.length === 6,
    `${record?.raceKey || "unknown"}: 事前条件6艇を復元できる`
  );

  const entries = snapshot.boats.map((boat) => ({
    boat: boat.boatNo,
    course: boat.course,
    courseOfficial: boat.courseOfficial === true,
    courseMappingSource:
      boat.courseMappingSource || "",
    registerNo: boat.registerNo,
    racerName: boat.racerName,
    className: boat.className,
    avgSt: boat.avgST,
    nationalWinRate: boat.nationalWinRate,
    national2Rate: boat.national2Rate,
    national3Rate: boat.national3Rate,
    localWinRate: boat.localWinRate,
    localStarts: boat.localStarts,
    motor2Rate: boat.motor2Rate,
    motor3Rate: boat.motor3Rate,
    boat2Rate: boat.boat2Rate,
    exhibitionSt: boat.exhibitionST,
    exhibitionTime: boat.exhibitionTime,
    lapTime: boat.lapTime,
    currentRace: {
      stList:
        boat.currentST === null ||
        boat.currentST === undefined
          ? []
          : [boat.currentST]
    }
  }));
  const hasOfficialCourses =
    entries.every(
      (entry) =>
        entry.courseOfficial === true &&
        Number(entry.course) >= 1 &&
        Number(entry.course) <= 6
    );

  return {
    ok: true,
    source: "boatrace-official",
    stadiumCode:
      String(record.jcd).padStart(2, "0"),
    stadiumName: record.place,
    raceNo: Number(record.raceNo),
    date: String(record.date),
    weather: snapshot.weather,
    entries,
    ...(
      hasOfficialCourses
        ? {
            startExhibition: entries.map((entry) => ({
              boat: entry.boat,
              course: entry.course,
              st: entry.exhibitionSt,
              isOfficialCourse: true,
              mappingSource:
                entry.courseMappingSource ||
                "saved-official-course"
            }))
          }
        : {}
    )
  };
}

function exactTicket(ticket) {
  const boats = String(ticket || "")
    .split("-")
    .map(Number);

  return (
    boats.length === 3 &&
    boats.every(
      (number) =>
        number >= 1 &&
        number <= 6
    ) &&
    new Set(boats).size === 3
  )
    ? boats
    : null;
}

function arrayify(value) {
  if (Array.isArray(value)) return value;

  return (
    value === null ||
    value === undefined ||
    value === ""
  )
    ? []
    : [value];
}

function finiteNumber(value) {
  return Number.isFinite(Number(value));
}

function isFormalRaceFlowRole(row) {
  if (
    !row ||
    boatNo(row) < 1 ||
    boatNo(row) > 6 ||
    row.qualified === false ||
    row.isAdopted === false
  ) {
    return false;
  }

  return !/不成立|除外|非採用|見送り/.test(
    String(row.status || "")
  );
}

function categoryGroup(category) {
  return CATEGORY_GROUPS[
    String(category || "").trim()
  ] || "";
}

function baseFormationGroup(source) {
  const match =
    String(source || "").match(
      /^base-formation:(main|cover|flow|hole)$/
    );

  return match?.[1] || "";
}

function comparisonIsConcrete(decision) {
  return Boolean(
    exactTicket(
      decision?.bestCandidateTicket
    ) &&
    finiteNumber(
      decision?.bestCandidateScore
    ) &&
    finiteNumber(
      decision?.selectionBoundary
    ) &&
    exactTicket(
      decision?.comparisonTicket
    ) &&
    finiteNumber(
      decision?.scoreGap
    ) &&
    String(
      decision?.reasonCode || ""
    ).trim() &&
    String(
      decision?.reason || ""
    ).trim()
  );
}

const counters = {
  races: 0,
  selected: 0,
  skipped: 0,
  expandedRaces: 0,
  expandedTickets: 0,
  maximum: 0,
  candidates: 0,
  physicalCandidates: 0,
  independentBranches: 0,
  candidateOnly: 0,
  formalRoleBranches: 0,
  categoryPresentations: 0,
  provenanceOnlyBlocked: 0,
  comparisonDecisions: 0,
  protectedHighRoleTargets: 0,
  maximumAuditBytes: 0,
  maximumVisibleCandidateRows: 0,
  selectedByScenarioKind: {
    "hold-continuation": 0,
    "alternate-head": 0
  },
  ticketCountDistribution:
    Object.fromEntries(
      [5, 6, 7, 8, 9, 10].map(
        (number) => [
          number,
          0
        ]
      )
    ),
  selectedByBoat: Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((number) => [
      number,
      0
    ])
  )
};
const selectedTicketRows = [];

DATES.forEach((date) => {
  const archive =
    require(`../data/predictions/${date}.json`);
  const records =
    archive.verificationPredictions || [];

  records.forEach((record) => {
    counters.races += 1;
    const raceKey = record.raceKey;
    const prepared = theoryInput.prepare(
      createRaceData(record),
      global.ChappyAICore
    );
    const prediction =
      global.createPrediction(prepared);
    const practical =
      practicalSelector.select(prediction);
    selectedTicketRows.push(
      practical.tickets.map(
        item => item.ticket
      )
    );
    const visibleCandidateRows =
      practical.targetDecisions
        .reduce(
          (sum, decision) =>
            sum +
            arrayify(
              decision
                .candidateDecisions
            ).length,
          0
        );
    const auditBytes =
      Buffer.byteLength(
        JSON.stringify({
          practicalSelection:
            practicalSelector
              .compactAudit(
                practical
              ),
          verificationEvidence:
            practical
              .verificationEvidence
        }),
        "utf8"
      );
    counters.maximumAuditBytes =
      Math.max(
        counters
          .maximumAuditBytes,
        auditBytes
      );
    counters
      .maximumVisibleCandidateRows =
      Math.max(
        counters
          .maximumVisibleCandidateRows,
        visibleCandidateRows
      );
    assert.ok(
      visibleCandidateRows <= 50,
      `${raceKey}: 折りたたみ表示の候補行を50行以内にする`
    );
    assert.ok(
      auditBytes <= 35000,
      `${raceKey}: 保存用の透明性監査データを35KB以内にする（${auditBytes} bytes）`
    );
    const evidence =
      prediction?.aiCore?.formations
        ?.evidence || {};
    const integrity =
      evidence.evaluationIntegrity;
    const branches =
      evidence.branches || [];
    const candidates =
      prediction?.ticketSheets
        ?.possibility || [];
    const mainTickets =
      prediction?.formation?.main || [];
    const coverTickets =
      prediction?.formation?.cover || [];
    const holeTickets =
      prediction?.formation?.hole || [];
    const publicMainHead =
      boatNo(
        prediction.mainSheet?.honmei
      );

    assert.ok(
      mainTickets.every(
        (ticket) =>
          Number(
            String(ticket).split("-")[0]
          ) === publicMainHead
      ),
      `${raceKey}: 本線全点の1着を正式本命と一致させる`
    );
    assert.deepEqual(
      coverTickets.filter(
        (ticket) =>
          holeTickets.includes(ticket)
      ),
      [],
      `${raceKey}: 押さえと穴へ同じ買い目を重複分類しない`
    );

    MARK_KEYS.forEach((key) => {
      const evaluationMark =
        prediction.boatEvaluation?.[key];
      const sheetMark =
        prediction.mainSheet?.[key];
      const coreMark =
        prediction.aiCore?.marks?.[key];
      const formalMark =
        prediction.aiCore
          ?.analysisMarks?.[key];

      assert.equal(
        boatNo(evaluationMark),
        boatNo(sheetMark),
        `${raceKey}: 艇評価と新聞の${key}を同じ正本にする`
      );
      assert.equal(
        boatNo(evaluationMark),
        boatNo(coreMark),
        `${raceKey}: 艇評価とAIコアの${key}を同じ正本にする`
      );
      assert.equal(
        boatNo(evaluationMark),
        boatNo(formalMark),
        `${raceKey}: ${key}を正式シナリオの分析印と一致させる`
      );
      NUMERIC_FIELDS.forEach((field) => {
        assert.equal(
          evaluationMark?.[field],
          sheetMark?.[field],
          `${raceKey}: ${key}.${field}を表示間で変えない`
        );
        assert.equal(
          evaluationMark?.[field],
          coreMark?.[field],
          `${raceKey}: ${key}.${field}をAIコアで上書きしない`
        );
      });
      assert.equal(
        evaluationMark?.comment,
        sheetMark?.comment,
        `${raceKey}: ${key}の評価コメントを一致させる`
      );
      assert.equal(
        evaluationMark?.comment,
        coreMark?.comment,
        `${raceKey}: ${key}の評価コメントをAIコアで変えない`
      );
    });

    const expectedAttackerBoatNo =
      boatNo(
        prediction.raceFlow?.phases
          ?.firstMark?.mainAttack
      ) ||
      boatNo(
        prediction.raceFlow
          ?.attackBoats?.[0]
      ) ||
      boatNo(
        prediction.mainSheet.honmei
      );

    assert.equal(
      prediction.aiCore.raceScenarios
        .mainScenario.attackerBoatNo,
      expectedAttackerBoatNo,
      `${raceKey}: 主攻め艇を元の展開時系列と一致させる`
    );
    assert.equal(
      prediction.aiCore.raceScenarios
        .mainScenario.headBoatNo,
      boatNo(prediction.mainSheet.honmei),
      `${raceKey}: 1着中心艇を本命印と一致させる`
    );
    const formalMainScenario =
      prediction.aiCore
        .raceScenarios.mainScenario;
    const formalSummary =
      prediction.raceFlow?.summary;
    assert.equal(
      prediction.raceFlow?.title,
      formalMainScenario.label,
      `${raceKey}: 表示タイトルを正式主展開と一致させる`
    );
    assert.ok(
      String(formalSummary || "")
        .includes(
          `${publicMainHead}号艇を1着軸`
        ),
      `${raceKey}: 表示要約へ正式本命の1着軸を明記する`
    );
    assert.equal(
      formalMainScenario.summary,
      formalSummary,
      `${raceKey}: 正式主展開と展開表示の要約を一致させる`
    );
    assert.equal(
      prediction.finalComment,
      formalSummary,
      `${raceKey}: 最終コメントへ古い別展開を残さない`
    );
    assert.equal(
      prediction.finalAi?.summary,
      formalSummary,
      `${raceKey}: AI要約へ古い別展開を残さない`
    );
    assert.equal(
      prediction.aiCore?.ai?.comment,
      formalSummary,
      `${raceKey}: AIコアコメントも正式主展開へ統一する`
    );
    const scenarioRoleBoatNos =
      candidates => [
        ...new Set(
          arrayify(candidates)
            .map(boatNo)
            .filter(Boolean)
        )
      ];
    assert.deepEqual(
      prediction.raceFlow.holdBoats
        .map(boatNo),
      scenarioRoleBoatNos(
        formalMainScenario.outcome
          ?.secondCandidates
      ),
      `${raceKey}: 2着残しを正式主展開から作る`
    );
    assert.deepEqual(
      prediction.raceFlow.pickupBoats
        .map(boatNo),
      scenarioRoleBoatNos(
        formalMainScenario.outcome
          ?.thirdCandidates
      ),
      `${raceKey}: 3着拾いを正式主展開から作る`
    );
    assert.equal(
      boatNo(
        prediction.aiCore
          .ranking?.[0]
      ),
      boatNo(prediction.mainSheet.honmei),
      `${raceKey}: 公開順位の先頭を本命印と一致させる`
    );
    const canonicalScenarios =
      prediction.aiCore
        .raceScenarios
        .scenarios;
    const canonicalScenarioKeys =
      canonicalScenarios.map(
        scenarioKey
      );
    assert.equal(
      new Set(canonicalScenarioKeys).size,
      canonicalScenarioKeys.length,
      `${raceKey}: 正式主展開を一覧へ二重登録しない`
    );
    (
      prediction.aiCore
        .analysisRaceScenarios
        ?.scenarios || []
    ).forEach((scenario) => {
      assert.ok(
        canonicalScenarioKeys.includes(
          scenarioKey(scenario)
        ),
        `${raceKey}: 元の複数シナリオを消さず正本と併存させる`
      );
    });
    assert.ok(
      Array.isArray(integrity?.targets) &&
        integrity.targets.length >= 4 &&
        integrity.targets.length <= 6 &&
        MARK_KEYS.every((key) =>
          integrity.targets.some(
            (target) =>
              target.markKey === key &&
              boatNo(target) ===
                boatNo(
                  prediction.mainSheet[key]
                )
          )
        ),
      `${raceKey}: 正式4印と置換前の有力評価艇を重複なく保持する`
    );
    assert.deepEqual(
      integrity.missingPhysicalCandidateTargetIds,
      [],
      `${raceKey}: 評価艇の物理候補を上限制限前に生成する`
    );

    integrity.targets.forEach((target) => {
      assert.equal(
        target.candidateTickets.length,
        target.eligiblePositions.length * 20,
        `${raceKey}: ${target.symbol}${target.boatNo}号艇の全着順枝をsliceしない`
      );
      assert.ok(
        [
          "structured-candidate-generated",
          "candidate-only-no-structured-evidence"
        ].includes(target.status),
        `${raceKey}: 候補と根拠不足を区別する`
      );
    });

    const branchById =
      new Map(
        branches.map((branch) => [
          branch.id,
          branch
        ])
      );

    const mainHeadBoatNo =
      boatNo(
        prediction.mainSheet.honmei
      );
    const formalRoleSources = [
      {
        rows:
          prediction.raceFlow
            ?.attackBoats || [],
        roleFor(target) {
          return target.boatNo ===
            mainHeadBoatNo
            ? "head"
            : "alternate-head";
        }
      },
      {
        rows:
          prediction.raceFlow
            ?.holdBoats || [],
        roleFor() {
          return "hold";
        }
      },
      {
        rows:
          prediction.raceFlow
            ?.pickupBoats || [],
        roleFor() {
          return "pickup";
        }
      }
    ];

    integrity.targets.forEach((target) => {
      formalRoleSources.forEach(
        (source) => {
          const roleEvidence =
            source.rows.find(
              (row) =>
                boatNo(row) ===
                  target.boatNo &&
                isFormalRaceFlowRole(
                  row
                )
            );

          if (!roleEvidence) return;

          const role =
            source.roleFor(target);
          const positions =
            ROLE_POSITIONS[role] || [];

          assert.ok(
            target.roleIntents.includes(
              role
            ),
            `${raceKey}: ${target.symbol}${target.boatNo}号艇へ` +
            `raceFlowの${role}役割を印に関係なく統合する`
          );
          positions.forEach((position) => {
            assert.ok(
              target.eligiblePositions
                .includes(position),
              `${raceKey}: ${target.symbol}${target.boatNo}号艇の` +
              `${role}役割を${position}着候補へ通す`
            );
          });

          const qualifiedBranch =
            branches.find((branch) =>
              branch.qualified === true &&
              (
                branch
                  .sourceEvaluationIds ||
                []
              ).includes(target.id) &&
              (branch.roles || [])
                .some((branchRole) =>
                  branchRole
                    .evaluationId ===
                    target.id &&
                  branchRole.role ===
                    role &&
                  (
                    branchRole
                      .eligiblePositions ||
                    []
                  ).some((position) =>
                    positions.includes(
                      Number(position)
                    )
                  )
                )
            );

          assert.ok(
            qualifiedBranch,
            `${raceKey}: ${target.symbol}${target.boatNo}号艇の` +
            `正式${role}役割にqualified branchを作る`
          );
          counters.formalRoleBranches += 1;
        }
      );
    });

    branches.forEach((branch) => {
      const boats =
        exactTicket(branch.ticket);

      assert.ok(
        boats,
        `${raceKey}: 枝の買い目を正確な3連単にする`
      );
      assert.equal(
        Number(branch.headBoatNo),
        boats[0],
        `${raceKey}: 枝の1着艇と買い目頭を一致させる`
      );
      if (
        branch.source ===
          "race-flow-attack-scenario" ||
        branch.source ===
          "preserved-alternate-attack-scenario" ||
        branch.source ===
          "boat-evaluation-attack-candidate"
      ) {
        assert.equal(
          Number(branch.attackerBoatNo),
          boats[0],
          `${raceKey}: 別攻め枝の攻め艇と買い目頭を一致させる`
        );
      } else {
        assert.equal(
          Number(branch.attackerBoatNo),
          expectedAttackerBoatNo,
          `${raceKey}: 枝の攻め艇を元の主展開と一致させる`
        );
      }
      assert.ok(
        String(
          branch.qualificationSource ||
          ""
        ).trim(),
        `${raceKey}: 枝へ購入資格の判定元を保存する`
      );
      assert.equal(
        typeof branch.purchaseEligible,
        "boolean",
        `${raceKey}: 枝の購入可否をbooleanで明示する`
      );
      assert.ok(
        branch.phaseEvidence &&
          typeof branch
            .phaseEvidence ===
            "object" &&
          !Array.isArray(
            branch.phaseEvidence
          ),
        `${raceKey}: 枝へ構造化phaseEvidenceを保存する`
      );
      assert.ok(
        Array.isArray(
          branch.evidenceChecks
        ) &&
          branch.evidenceChecks
            .every(
              (check) =>
                check &&
                typeof check ===
                  "object" &&
                !Array.isArray(check)
            ),
        `${raceKey}: evidenceChecksを文字列でなく構造化objectにする`
      );
      assert.ok(
        branch.source?.startsWith(
          "base-formation:"
        ) ||
          (
            branch.source ===
              "race-flow-phase-continuation" &&
            branch.evidenceChecks
              ?.length >= 4
          ) ||
          (
            [
              "race-flow-attack-scenario",
              "preserved-alternate-attack-scenario"
            ].includes(branch.source) &&
            branch.phaseEvidence?.kind ===
              "alternate-head"
          ) ||
          (
            (
              branch.source ===
                "race-flow-role-candidate" ||
              branch.source ===
                "boat-evaluation-attack-candidate"
            ) &&
            branch.purchaseEligible ===
              false
          ),
        `${raceKey}: 枝を検証可能な出所へ接続する`
      );
      if (
        branch.kind ===
          "canonical-formation" &&
        (
          branch.source ===
            "base-formation:flow" ||
          branch.source ===
            "base-formation:hole"
        ) &&
        (
          branch.roles || []
        ).length === 0
      ) {
        assert.equal(
          branch.purchaseEligible,
          false,
          `${raceKey}: ${branch.ticket}のprovenance-only ` +
          `${branch.source}枝を購入可能にしない`
        );
        counters.provenanceOnlyBlocked += 1;
      }
      (branch.roles || []).forEach(
        (role) => {
          const target =
            integrity.targets.find(
              (item) =>
                item.id ===
                role.evaluationId
            );
          const positions =
            role.eligiblePositions ||
            [];

          assert.ok(
            target,
            `${raceKey}: 枝の評価IDを実在させる`
          );
          assert.ok(
            target.roleIntents.includes(
              role.role
            ),
            `${raceKey}: 枝の役割を評価意図と一致させる`
          );
          assert.equal(
            positions.length,
            1,
            `${raceKey}: 枝の着順役割を1位置へ固定する`
          );
          assert.equal(
            boats[positions[0] - 1],
            target.boatNo,
            `${raceKey}: 枝の艇・着順を物理一致させる`
          );
        }
      );
    });

    assert.ok(
      prediction.mainSheet.tickets
        .every(
          (ticket) =>
            Number(
              String(
                ticket.ticket ||
                ticket
              ).split("-")[0]
            ) ===
            boatNo(
              prediction.mainSheet
                .honmei
            )
        ),
      `${raceKey}: 本線の1着艇を◎へ統一する`
    );

    candidates.forEach((candidate) => {
      counters.candidates += 1;
      assert.ok(
        Array.isArray(
          candidate.allBranchIds
        ),
        `${raceKey}: ${candidate.ticket}へ全枝IDを保持する`
      );
      assert.ok(
        candidate.allBranchIds
          .every((branchId) =>
            branchById.has(branchId)
          ),
        `${raceKey}: ${candidate.ticket}のallBranchIdsを実在枝へ接続する`
      );
      assert.ok(
        (
          candidate.branchIds || []
        ).every((branchId) =>
          candidate.allBranchIds
            .includes(branchId)
        ),
        `${raceKey}: ${candidate.ticket}の選択用枝を全枝集合内に保つ`
      );
      assert.ok(
        candidate.presentationByGroup &&
          typeof candidate
            .presentationByGroup ===
            "object" &&
          !Array.isArray(
            candidate
              .presentationByGroup
          ),
        `${raceKey}: ${candidate.ticket}へカテゴリ別表示根拠を保持する`
      );
      Object.entries(
        candidate
          .presentationByGroup || {}
      ).forEach(
        ([group, presentation]) => {
          if (!presentation) return;

          assert.ok(
            [
              "main",
              "cover",
              "flow",
              "hole"
            ].includes(group),
            `${raceKey}: ${candidate.ticket}の表示グループを正規化する`
          );
          const source =
            presentation.source ||
            presentation
              .structuredEvidence
              ?.source ||
            "";
          const presentationBranchIds =
            arrayify(
              presentation.branchIds ||
              presentation
                .structuredEvidence
                ?.branchIds
            );

          assert.equal(
            source,
            `base-formation:${group}`,
            `${raceKey}: ${candidate.ticket}の${group}表示根拠を同カテゴリへ固定する`
          );

          if (
            presentationBranchIds.length ===
            0
          ) {
            assert.equal(
              presentation.structuredEvidence,
              null,
              `${raceKey}: ${candidate.ticket}の未成立${group}表示へ根拠を偽装しない`
            );
            return;
          }

          assert.ok(
            presentationBranchIds
                .every((branchId) =>
                  candidate
                    .allBranchIds
                    .includes(
                      branchId
                    ) &&
                  branchById.get(
                    branchId
                  )?.source ===
                    `base-formation:${group}`
                ),
            `${raceKey}: ${candidate.ticket}の${group}表示枝を同カテゴリへ限定する`
          );
          counters.categoryPresentations += 1;
        }
      );
      if (
        (
          candidate
            .physicalCoverage || []
        ).length > 0
      ) {
        counters.physicalCandidates += 1;
      }
      const boats =
        exactTicket(candidate.ticket);

      assert.ok(
        boats,
        `${raceKey}: 候補は正確な3連単にする`
      );
      (candidate.physicalCoverage || [])
        .forEach((claim) => {
          assert.equal(
            boats[Number(claim.position) - 1],
            Number(claim.boatNo),
            `${raceKey}: 評価艇と候補着順を物理一致させる`
          );
        });

      if (
        candidate.expansionEligible === true
      ) {
        counters.independentBranches += 1;
        assert.ok(
          candidate.branchIds.length > 0 &&
          candidate.requirementIds.length > 0 &&
          candidate.evidenceReasons.length > 0 &&
          candidate.structuredEvidence,
          `${raceKey}: 8〜10点候補へ枝ID・要件・理由を必須にする`
        );
        candidate.requirementIds.forEach(
          (requirementId) => {
            assert.ok(
              branches.some(
                (branch) =>
                  branch.requirementId ===
                    requirementId &&
                  branch.kind ===
                    "independent-scenario" &&
                  branch.qualified === true &&
                  branch.purchaseEligible ===
                    true
              ),
              `${raceKey}: 購入資格を実在する独立枝へ接続する`
            );
          }
        );
      } else {
        counters.candidateOnly += 1;
      }

      (candidate.coverage || [])
        .forEach((claim) => {
          const branch =
            branchById.get(claim.branchId);

          assert.ok(
            branch,
            `${raceKey}: coverageの枝参照を実在させる`
          );
          assert.equal(
            boats[Number(claim.position) - 1],
            Number(claim.boatNo),
            `${raceKey}: coverageの艇・着順を一致させる`
          );
        });
    });

    if (practical.status !== "selected") {
      counters.skipped += 1;
      assert.ok(
        practical.targetDecisions.every(
          (decision) =>
            decision.reasonCode ===
            "RACE_SKIPPED"
        ),
        `${raceKey}: 見送り時も評価候補の理由を残す`
      );
      return;
    }

    counters.selected += 1;
    counters.maximum = Math.max(
      counters.maximum,
      practical.tickets.length
    );
    counters.ticketCountDistribution[
      practical.tickets.length
    ] += 1;
    assert.ok(
      practical.tickets.length >= 5 &&
        practical.tickets.length <= 10,
      `${raceKey}: 実戦厳選を5〜10点に収める`
    );
    const groundedFlowTickets =
      practical.tickets.filter(
        item => item.category === "流し"
      );
    assert.ok(
      [0, 2].includes(
        groundedFlowTickets.length
      ),
      `${raceKey}: フォーメーション由来券は0券または根拠付き2券を一組で採用する`
    );
    if (
      groundedFlowTickets.length === 2
    ) {
      assert.ok(
        groundedFlowTickets.every(
          item =>
            item.displayCategory ===
              "フォーメーション"
        ),
        `${raceKey}: 通常表示で流しと呼ばずフォーメーションを明示する`
      );
      assert.equal(
        new Set(
          groundedFlowTickets.map(
            item => item.flowAnchor
          )
        ).size,
        1,
        `${raceKey}: フォーメーション2券の1着・2着軸を一致させる`
      );
      assert.equal(
        new Set(
          groundedFlowTickets.map(
            item => item.scenarioId
          )
        ).size,
        1,
        `${raceKey}: フォーメーション2券の正式展開IDを一致させる`
      );
      assert.ok(
        groundedFlowTickets.every(
          item =>
            item.flowSecondScore >= 65 &&
            item.flowThirdScore >= 65 &&
            arrayify(
              item.flowRoleEvidence
            ).length === 2
        ),
        `${raceKey}: フォーメーション2券へ2着残し・3着拾いの正式根拠を保存する`
      );
      assert.ok(
        !practical.tickets.some(
          item =>
            item.category ===
              "万舟・穴"
        ),
        `${raceKey}: フォーメーション2券と通常穴を併用しない`
      );
    }
    assert.equal(
      new Set(
        practical.tickets.map((item) => item.ticket)
      ).size,
      practical.tickets.length,
      `${raceKey}: 実戦買い目を重複させない`
    );
    assert.ok(
      practical.tickets.every(
        (item) =>
          String(item.comment || "").trim()
      ),
      `${raceKey}: 選択買い目へ個別コメントを付ける`
    );
    practical.tickets.forEach((item) => {
      const boats =
        exactTicket(item.ticket);
      const group =
        categoryGroup(item.category);

      assert.ok(
        boats,
        `${raceKey}: 選択買い目を正確な3連単にする`
      );
      boats.forEach((number) => {
        assert.ok(
          String(
            item.comment || ""
          ).includes(
            `${number}号艇`
          ),
          `${raceKey}: ${item.ticket}のコメントへ${number}号艇を明記する`
        );
      });
      assert.ok(
        group,
        `${raceKey}: ${item.ticket}の選択カテゴリを正規化する`
      );

      const selectedBranches =
        arrayify(
          item.validBranchIds ||
          item.branchIds
        )
          .map((branchId) =>
            branchById.get(branchId)
          )
          .filter(Boolean);
      const baseBranches =
        selectedBranches.filter(
          (branch) =>
            baseFormationGroup(
              branch.source
            )
        );

      if (
        item.selectionTier ===
          "候補補完"
      ) {
        assert.equal(
          group,
          "candidate-promotion",
          `${raceKey}: 候補補完を専用カテゴリとして監査する`
        );
        assert.equal(
          item.candidatePromotion,
          true,
          `${raceKey}: 候補補完フラグを明示する`
        );
        assert.equal(
          Number(item.candidatePromotionThreshold),
          90,
          `${raceKey}: 候補補完閾値を90に固定する`
        );
        assert.ok(
          Number(item.priorityScore || 0) >= 90,
          `${raceKey}: 候補補完をpriority 90以上に限定する`
        );
        const physicalPositions = new Set(
          arrayify(item.physicalCoverage)
            .map(claim => Number(claim?.position || 0))
            .filter(position => position >= 1 && position <= 3)
        );
        assert.equal(
          physicalPositions.size,
          3,
          `${raceKey}: 候補補完は1〜3着すべての物理根拠を必須にする`
        );
      } else if (
        item.selectionTier ===
          "順位ゲート置換"
      ) {
        assert.equal(
          group,
          "priority-gate-replacement",
          `${raceKey}: 順位ゲート置換を専用カテゴリとして監査する`
        );
        assert.equal(
          item.priorityGateReplacement,
          true,
          `${raceKey}: 順位ゲート置換フラグを明示する`
        );
        assert.ok(
          Number(item.priorityGateRank) >= 1 &&
          Number(item.priorityGateRank) <= 10,
          `${raceKey}: 順位ゲートを上位10位内に限定する`
        );
        assert.equal(
          item.priorityGateSourceReasonCode,
          "CANDIDATE_ONLY_EVALUATION",
          `${raceKey}: CandidateOnlyだけを置換候補にする`
        );
        assert.equal(
          item.priorityGateSourceBranch,
          "formation:hole",
          `${raceKey}: 最初のformation:hole枝だけを採用する`
        );
        assert.equal(
          Number(
            item.ticket.split("-")[0]
          ),
          1,
          `${raceKey}: 順位ゲート置換を1号艇頭に限定する`
        );
        assert.ok(
          practical.expansionSummary
            .priorityGateReplacement
            ?.applied === true &&
          practical.expansionSummary
            .priorityGateReplacement
            ?.addedTicket === item.ticket,
          `${raceKey}: 置換元・置換先をexpansionSummaryへ保存する`
        );
      } else if (
        item.selectionTier !==
        "展開追加"
      ) {
        assert.ok(
          baseBranches.every(
            (branch) =>
              baseFormationGroup(
                branch.source
              ) === group
          ),
          `${raceKey}: ${item.ticket}の${item.category}表示へ別カテゴリ枝を混ぜない ` +
          `(sourceCategory=${item.sourceCategory || ""}, ` +
          `selectionTier=${item.selectionTier || ""}, ` +
          `sources=${baseBranches.map((branch) => branch.source).join(",")})`
        );
      } else {
        assert.equal(
          group,
          "independent",
          `${raceKey}: 8〜10点目を独立展開として表示する`
        );
      }

      const structuredSource =
        item.structuredEvidence
          ?.source || "";
      const structuredGroup =
        baseFormationGroup(
          structuredSource
        );

      if (
        structuredGroup &&
        item.selectionTier !==
          "展開追加" &&
        item.selectionTier !==
          "候補補完" &&
        item.selectionTier !==
          "順位ゲート置換"
      ) {
        assert.equal(
          structuredGroup,
          group,
          `${raceKey}: ${item.ticket}のstructuredEvidenceを${item.category}と一致させる`
        );
      }

      if (
        group === "flow" ||
        group === "hole" ||
        item.selectionTier ===
          "展開追加" ||
        item.selectionTier ===
          "順位ゲート置換"
      ) {
        assert.ok(
          selectedBranches.some(
            (branch) =>
              branch.purchaseEligible ===
                true ||
              (
                branch.roles || []
              ).length > 0 &&
              Number(
                branch.priorityScore ||
                  0
              ) > 0
          ),
          `${raceKey}: ${item.ticket}をprovenance-only枝だけで購入しない`
        );
      }
    });
    assert.ok(
      practical.tickets.every(
        (item) =>
          (
            item.evidenceQualified === true &&
            (
              item.validBranchIds ||
              []
            ).length > 0
          ) ||
          (
            item.selectionTier === "候補補完" &&
            item.candidatePromotion === true &&
            Number(item.priorityScore || 0) >= 90 &&
            new Set(
              arrayify(item.physicalCoverage)
                .map(claim => Number(claim?.position || 0))
                .filter(position => position >= 1 && position <= 3)
            ).size === 3
          )
      ),
      `${raceKey}: 全購入買い目を構造化枝または承認済み候補補完条件へ接続する ` +
      practical.tickets
        .filter(
          (item) =>
            item.evidenceQualified !==
              true ||
            !(
              item.validBranchIds ||
              []
            ).length
        )
        .map((item) => ({
          ticket: item.ticket,
          branchIds:
            item.branchIds,
          validBranchIds:
            item.validBranchIds,
          primaryAttackerBoatNo:
            evidence
              .primaryAttackerBoatNo
        }))
        .map(JSON.stringify)
        .join(",")
    );
    assert.equal(
      practical.targetDecisions.length,
      integrity.targets.length,
      `${raceKey}: 正式4印と保持評価艇の採否理由を残す`
    );
    practical.targetDecisions
      .filter(
        (decision) =>
          decision.selected === false
      )
      .forEach((decision) => {
        assert.ok(
          comparisonIsConcrete(
            decision
          ),
          `${raceKey}: ${decision.symbol}${decision.boatNo}号艇の非採用へ` +
          "最良候補・採用境界・比較相手・点差・理由を保存する"
        );
        counters.comparisonDecisions += 1;
      });

    const selectedTicketBoats =
      practical.tickets.map(
        (item) => ({
          ticket: item.ticket,
          boats:
            exactTicket(item.ticket) ||
            []
        })
      );
    integrity.targets.forEach((target) => {
      const evaluationScore =
        Number(
          target.evaluation?.score ??
          target.evaluation?.total
        );
      const formalRoleScore =
        Math.max(
          ...formalRoleSources
            .flatMap((source) =>
              source.rows
            )
            .filter(
              (row) =>
                boatNo(row) ===
                  target.boatNo &&
                isFormalRaceFlowRole(
                  row
                ) &&
                finiteNumber(row.score)
            )
            .map((row) =>
              Number(row.score)
            ),
          Number.NEGATIVE_INFINITY
        );

      if (
        evaluationScore < 70 ||
        formalRoleScore < 65 ||
        practical.tickets.length >= 10
      ) {
        return;
      }

      const physicallySelected =
        selectedTicketBoats.some(
          (item) =>
            item.boats.includes(
              target.boatNo
            )
        );
      const targetDecision =
        practical.targetDecisions
          .find(
            (decision) =>
              decision.evaluationId ===
                target.id
          );

      assert.ok(
        physicallySelected ||
          (
            targetDecision
              ?.selected === false &&
            comparisonIsConcrete(
              targetDecision
            )
          ),
        `${raceKey}: ${target.symbol}${target.boatNo}号艇は` +
        `評価${evaluationScore}点・正式役割${formalRoleScore}点のため、` +
        "10点未満なら買い目へ含めるか採用境界との具体比較を残す"
      );
      counters.protectedHighRoleTargets += 1;
    });

    const expanded =
      practical.tickets.filter(
        (item) =>
          item.selectionTier === "展開追加"
      );

    if (
      practical.tickets.length > 7
    ) {
      counters.expandedRaces += 1;
      counters.expandedTickets +=
        expanded.length;
    }

    expanded.forEach((item) => {
      assert.ok(
        item.validRequirementIds.length > 0 &&
        item.validBranchIds.length > 0 &&
        item.evidenceReasons.length > 0 &&
        item.evidenceQualified === true &&
        item.expansionEligible === true,
        `${raceKey}: 展開追加を検証済み独立枝だけに限定する`
      );
      assert.notEqual(
        item.candidateKind,
        "evaluation-coverage",
        `${raceKey}: 印だけの候補を8〜10点へ昇格しない`
      );
      const selectedKinds =
        new Set(
          item.validBranchIds
            .map((branchId) =>
              branchById.get(
                branchId
              )?.phaseEvidence?.kind
            )
            .filter(
              (kind) =>
                kind ===
                  "hold-continuation" ||
                kind ===
                  "alternate-head"
            )
        );

      selectedKinds.forEach((kind) => {
        counters.selectedByScenarioKind[
          kind
        ] += 1;
      });
    });

    expanded.forEach((item) => {
      (item.coveredBoatNos || [])
        .forEach((number) => {
          counters.selectedByBoat[number] += 1;
        });
    });
    practical.excludedCandidates
      .forEach((candidate) => {
        assert.ok(
          String(candidate.reasonCode || "").trim() &&
          String(candidate.reason || "").trim(),
          `${raceKey}: 非採用候補へ構造化理由を残す`
        );
      });
    practical.candidateOutcomes
      .filter(
        outcome =>
          outcome.reasonCode ===
          "MAXIMUM_REACHED"
      )
      .forEach(() => {
        assert.equal(
          practical.tickets.length,
          10,
          `${raceKey}: 最大到達を理由にできるのは実際に10点の時だけ`
        );
      });
  });
});

assert.equal(
  counters.races,
  281,
  "保存済み281レースを全件再計算する"
);
const selectionHash =
  crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        selectedTicketRows
      )
    )
    .digest("hex");
assert.equal(
  selectionHash,
  "a6ebbf71183e95ace493f22768cb6cd7e7c045414c5d9cc82ef190cd00b8e287",
  "正式主展開と根拠付き同一軸フォーメーション2券を含む281レースの買い目を固定する"
);

console.log("評価済み展開の全件整合テスト: 合格");
console.log(`- 再計算: ${counters.races}レース`);
console.log(
  `- 実戦選択: ${counters.selected} / 見送り: ${counters.skipped}`
);
console.log(
  `- 8〜10点へ拡張: ${counters.expandedRaces}レース・${counters.expandedTickets}点 / 最大: ${counters.maximum}`
);
console.log(
  `- 点数分布: ${JSON.stringify(counters.ticketCountDistribution)}`
);
console.log(
  `- 全候補: ${counters.candidates} / 評価印の物理候補: ${counters.physicalCandidates} / 独立枝候補: ${counters.independentBranches} / 購入非昇格: ${counters.candidateOnly}`
);
console.log(
  `- 独立枝採用（艇番別）: ${JSON.stringify(counters.selectedByBoat)}`
);
console.log(
  `- 独立枝採用（種類別）: ${JSON.stringify(counters.selectedByScenarioKind)}`
);
console.log(
  `- 正式raceFlow役割の枝接続: ${counters.formalRoleBranches}件`
);
console.log(
  `- カテゴリ別表示根拠: ${counters.categoryPresentations}件 / ` +
  `provenance-only購入遮断: ${counters.provenanceOnlyBlocked}件`
);
console.log(
  `- 非採用の具体比較: ${counters.comparisonDecisions}件 / ` +
  `高評価・正式役割保護: ${counters.protectedHighRoleTargets}件`
);
console.log(
  `- 買い目固定SHA-256: ${selectionHash}`
);
console.log(
  `- 透明性監査上限: ${counters.maximumAuditBytes} bytes / ` +
  `${counters.maximumVisibleCandidateRows}表示行`
);
