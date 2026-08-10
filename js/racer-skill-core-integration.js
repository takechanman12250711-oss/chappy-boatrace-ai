// チャッピーボートレースAI
// 技量Ver2の固有情報だけを、残し・拾いが同等評価の時の最終優先順へ接続する。
// 展開・コース・ST・展示・残し/拾いを上書きせず、級別/全国勝率/STを二重加点しない。
(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.ChappyRacerSkillCoreIntegration = api;
    api.install();
  }
})(
  typeof window !== "undefined" ? window : globalThis,
  function (root) {
    "use strict";

    const MAX_HOLD_BONUS = 1.2;
    const MAX_PICKUP_BONUS = 0.8;
    const EQUIVALENT_GAP = 2;

    function number(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }

    function boatNo(value) {
      const parsed = Number(
        value?.boatNo ??
        value?.number ??
        value?.waku ??
        value?.boat ??
        value
      );
      return parsed >= 1 && parsed <= 6 ? parsed : 0;
    }

    function ticketText(value) {
      return String(
        typeof value === "string"
          ? value
          : value?.ticket || ""
      ).trim();
    }

    function ticketBoats(value) {
      const ticket = ticketText(value);
      if (!/^[1-6]-[1-6]-[1-6]$/.test(ticket)) return [];
      const boats = ticket.split("-").map(Number);
      return new Set(boats).size === 3 ? boats : [];
    }

    function uniqueSkillScore(role) {
      if (!role || role.isFormal !== true) return null;
      const components = role.components || {};

      // 既存コアですでに使う級別・全国勝率・ST・今節道中は再加点しない。
      // 技量Ver2だけが持つ「実進入別成績・戦法適性・年次推移」だけを使う。
      return (
        number(components.coursePerformance) +
        number(components.methodFit) +
        number(components.recentTrend)
      );
    }

    function roleScore(candidate) {
      return number(
        candidate?.score ??
        candidate?.holdScore ??
        candidate?.pickupScore ??
        candidate?.roleScore,
        0
      );
    }

    function createSkillMap(prediction) {
      const roles =
        prediction?.racerSkillTheory?.roles ||
        prediction?.aiCore?.racerSkillTheory?.roles ||
        [];

      return new Map(
        (Array.isArray(roles) ? roles : [])
          .map((role) => [
            boatNo(role),
            {
              role,
              score: uniqueSkillScore(role)
            }
          ])
          .filter(
            ([no, value]) =>
              no >= 1 &&
              no <= 6 &&
              value.score !== null
          )
      );
    }

    function rankEquivalentCandidates(candidates, skillMap, maxBonus) {
      const source = Array.isArray(candidates)
        ? candidates.map((candidate, index) => ({ candidate, index }))
        : [];
      const rows = [];
      const bonusByBoat = new Map();
      const groups = [];

      for (let start = 0; start < source.length;) {
        const leaderScore = roleScore(source[start].candidate);
        let end = start + 1;

        while (
          end < source.length &&
          Math.abs(
            leaderScore - roleScore(source[end].candidate)
          ) <= EQUIVALENT_GAP
        ) {
          end += 1;
        }

        const group = source.slice(start, end);
        const ranked = group
          .map((row) => ({
            ...row,
            skillScore:
              skillMap.get(boatNo(row.candidate))?.score ?? null
          }))
          .sort((a, b) => {
            const aHas = a.skillScore !== null;
            const bHas = b.skillScore !== null;
            if (aHas !== bHas) return bHas - aHas;
            if (aHas && bHas && b.skillScore !== a.skillScore) {
              return b.skillScore - a.skillScore;
            }
            return a.index - b.index;
          });

        const comparable = ranked.filter(
          (row) => row.skillScore !== null
        );

        if (group.length >= 2 && comparable.length >= 2) {
          const best = Math.max(
            ...comparable.map((row) => row.skillScore)
          );
          const worst = Math.min(
            ...comparable.map((row) => row.skillScore)
          );
          const range = best - worst;

          ranked.forEach((row) => {
            if (row.skillScore === null) return;
            const ratio = range > 0
              ? (row.skillScore - worst) / range
              : 0;
            bonusByBoat.set(
              boatNo(row.candidate),
              Math.round(ratio * maxBonus * 100) / 100
            );
          });

          groups.push({
            baseScore: leaderScore,
            boatNos: group.map((row) => boatNo(row.candidate)),
            rankedBoatNos: ranked.map((row) => boatNo(row.candidate)),
            skillScores: Object.fromEntries(
              ranked.map((row) => [boatNo(row.candidate), row.skillScore])
            )
          });
        }

        rows.push(...ranked.map((row) => row.candidate));
        start = end;
      }

      return {
        rows,
        bonusByBoat,
        groups,
        changed:
          rows.some(
            (row, index) =>
              boatNo(row) !== boatNo(source[index]?.candidate)
          )
      };
    }

    function enrichTicket(row, secondBonus, thirdBonus) {
      const boats = ticketBoats(row);
      if (!boats.length) return row;

      const holdBonus = secondBonus.get(boats[1]) || 0;
      const pickupBonus = thirdBonus.get(boats[2]) || 0;
      const bonus = Math.round((holdBonus + pickupBonus) * 100) / 100;

      if (bonus <= 0 || typeof row === "string") return row;

      return {
        ...row,
        priorityScore:
          Math.round(
            (number(row.priorityScore) + bonus) * 100
          ) / 100,
        racerSkillTieBreak: {
          applied: true,
          bonus,
          holdBonus,
          pickupBonus,
          rule:
            "残し・拾い2点以内の同等候補だけを、実進入別成績・戦法適性・年次推移で比較"
        }
      };
    }

    function enrichTicketList(list, secondBonus, thirdBonus) {
      return Array.isArray(list)
        ? list.map((row) =>
            enrichTicket(row, secondBonus, thirdBonus)
          )
        : list;
    }

    function reorderFlowRows(rows, rankedCandidates) {
      if (!Array.isArray(rows) || !Array.isArray(rankedCandidates)) {
        return rows;
      }
      const rank = new Map(
        rankedCandidates.map((row, index) => [boatNo(row), index])
      );
      return [...rows].sort((a, b) => {
        const aRank = rank.has(boatNo(a)) ? rank.get(boatNo(a)) : 999;
        const bRank = rank.has(boatNo(b)) ? rank.get(boatNo(b)) : 999;
        return aRank - bRank;
      });
    }

    function enhance(prediction) {
      if (!prediction || typeof prediction !== "object") return prediction;

      const holdPickup =
        prediction.holdPickupTheory ||
        prediction.aiCore?.holdPickupTheory ||
        null;
      if (!holdPickup || holdPickup.isFormal !== true) return prediction;

      const skillMap = createSkillMap(prediction);
      if (skillMap.size < 2) return prediction;

      const second = rankEquivalentCandidates(
        holdPickup.secondCandidates || [],
        skillMap,
        MAX_HOLD_BONUS
      );
      const third = rankEquivalentCandidates(
        holdPickup.thirdCandidates || [],
        skillMap,
        MAX_PICKUP_BONUS
      );

      if (!second.groups.length && !third.groups.length) {
        return prediction;
      }

      const updatedHoldPickup = {
        ...holdPickup,
        secondCandidates: second.rows,
        thirdCandidates: third.rows,
        racerSkillTieBreak: {
          applied: true,
          changesHead: false,
          changesScenario: false,
          changesBaseScore: false,
          equivalentGap: EQUIVALENT_GAP,
          secondGroups: second.groups,
          thirdGroups: third.groups,
          uniqueComponents: [
            "coursePerformance",
            "methodFit",
            "recentTrend"
          ]
        }
      };

      const enrich = (list) =>
        enrichTicketList(
          list,
          second.bonusByBoat,
          third.bonusByBoat
        );

      const mainSheet = prediction.mainSheet || {};
      const ticketSheets = prediction.ticketSheets || {};
      const manshuSheet = prediction.manshuSheet || {};
      const raceFlow = prediction.raceFlow || {};

      return {
        ...prediction,
        holdPickupTheory: updatedHoldPickup,
        racerSkillCoreIntegration: {
          applied: true,
          changesHead: false,
          changesScenario: false,
          changesBaseScore: false,
          secondChanged: second.changed,
          thirdChanged: third.changed,
          secondGroups: second.groups,
          thirdGroups: third.groups
        },
        raceFlow: {
          ...raceFlow,
          holdBoats: reorderFlowRows(
            raceFlow.holdBoats,
            second.rows
          ),
          pickupBoats: reorderFlowRows(
            raceFlow.pickupBoats,
            third.rows
          )
        },
        mainSheet: {
          ...mainSheet,
          tickets: enrich(mainSheet.tickets),
          coverTickets: enrich(mainSheet.coverTickets),
          flowTickets: enrich(mainSheet.flowTickets)
        },
        manshuSheet: {
          ...manshuSheet,
          tickets: enrich(manshuSheet.tickets)
        },
        ticketSheets: {
          ...ticketSheets,
          main: enrich(ticketSheets.main),
          cover: enrich(ticketSheets.cover),
          flow: enrich(ticketSheets.flow),
          hole: enrich(ticketSheets.hole),
          possibility: enrich(ticketSheets.possibility),
          all: enrich(ticketSheets.all)
        },
        aiTicketList: enrich(prediction.aiTicketList),
        aiCore: {
          ...(prediction.aiCore || {}),
          holdPickupTheory: updatedHoldPickup,
          racerSkillTieBreak:
            updatedHoldPickup.racerSkillTieBreak
        }
      };
    }

    function install() {
      const base = root?.createPrediction;
      if (
        typeof base !== "function" ||
        base.__chappyRacerSkillCoreIntegrationWrapped
      ) {
        return false;
      }

      function wrappedCreatePrediction(data) {
        return enhance(base(data));
      }

      wrappedCreatePrediction.__chappyRacerSkillCoreIntegrationWrapped = true;
      wrappedCreatePrediction.__chappyBaseCreatePrediction = base;
      root.createPrediction = wrappedCreatePrediction;
      return true;
    }

    return {
      enhance,
      install,
      rankEquivalentCandidates,
      uniqueSkillScore,
      constants: {
        EQUIVALENT_GAP,
        MAX_HOLD_BONUS,
        MAX_PICKUP_BONUS
      }
    };
  }
);
