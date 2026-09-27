"use strict";

/*
  相手候補・固定コース制限の撤廃 shadow v1

  本番の buildHoldPickupTheory は変更しない。
  比較検証専用として、中心艇・明示的な展開除外艇だけを除き、
  残り全艇を2着/3着候補としてレース前の既存評価で順位化する。

  重要:
  - 艇番/コースだけを理由に score=1 へ落とさない。
  - 結果・払戻・オッズは入力しない。
  - 同じ材料を二重加点しないため、新しい独自指標は作らず、
    analyses に既に存在する hold/pickup/road/flow/total を使用する。
*/

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boatNo(row) {
  return Number(row?.boatNo ?? row?.number ?? row?.waku ?? row?.boat ?? 0);
}

function roleScore(row, role) {
  const roleScores = row?.roleScores || {};
  const indexes = row?.indexes || {};
  if (role === "second") {
    return (
      num(roleScores.hold) * 0.34 +
      num(roleScores.flow) * 0.24 +
      num(roleScores.road) * 0.16 +
      num(indexes.total) * 0.16 +
      num(roleScores.pickup) * 0.10
    );
  }
  return (
    num(roleScores.pickup) * 0.34 +
    num(roleScores.road) * 0.24 +
    num(roleScores.hold) * 0.16 +
    num(roleScores.flow) * 0.16 +
    num(indexes.total) * 0.10
  );
}

function buildOpenPartnerCandidates({
  analyses,
  attackerBoatNo,
  blockedBoats = [],
  secondLimit = 3,
  thirdLimit = 4
} = {}) {
  const list = Array.isArray(analyses) ? analyses : [];
  const attacker = Number(attackerBoatNo || 0);
  const blocked = new Set((blockedBoats || []).map(Number).filter(Boolean));
  const eligible = list.filter((row) => {
    const no = boatNo(row);
    return no >= 1 && no <= 6 && no !== attacker && !blocked.has(no);
  });

  function rank(role, limit) {
    return eligible
      .map((row) => ({
        boatNo: boatNo(row),
        score: Number(roleScore(row, role).toFixed(3)),
        source: "existing-pre-race-role-scores"
      }))
      .sort((a, b) => b.score - a.score || a.boatNo - b.boatNo)
      .slice(0, limit)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  return {
    secondCandidates: rank("second", secondLimit),
    thirdCandidates: rank("third", thirdLimit),
    policy: "open-partner-candidates-shadow-v1",
    constraints: {
      excludesOnly: ["attacker", "explicit-blocked-boats"],
      fixedCourseGate: false,
      resultUsed: false,
      oddsUsed: false
    }
  };
}

module.exports = { buildOpenPartnerCandidates, roleScore };
