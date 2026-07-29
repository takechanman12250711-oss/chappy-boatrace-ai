/* =========================================================
  場別・展開別・外れ方別の改善候補を作成

  重要：このモジュールは提案だけを返し、予想ロジックを変更しない。
========================================================= */

(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ChappyImprovementSuggestions = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const MIN_SETTLED_SAMPLE = 100;
  const MIN_GROUP_SAMPLE = 12;
  const MIN_SELECTED_SAMPLE = 30;
  const LOW_HIT_RATE = 40;
  const LOW_ROLE_MATCH_RATE = 50;
  const MISS_SHARE_ALERT = 40;
  const THEORY_SHARE_ALERT = 30;
  const MAX_SUGGESTIONS = 8;

  function percentage(count, total) {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }

  function safeGroups(value) {
    return Array.isArray(value) ? value : [];
  }

  function proposalOnly(value) {
    return {
      ...(value || {}),
      action: "proposal_only",
      approvalRequired: true,
      autoApply: false,
      applicationLock: true,
      decision: "pending",
      applied: false
    };
  }

  function groupAttempts(group) {
    return Number(
      group?.attempts ??
      group?.practicalCount ??
      group?.count ??
      0
    );
  }

  function groupMatches(group) {
    return Number(
      group?.matched ??
      group?.practicalHits ??
      group?.hits ??
      0
    );
  }

  function buildGroupSuggestions(category, groups, sampleLabel) {
    return safeGroups(groups)
      .filter(group =>
        groupAttempts(group) >= MIN_GROUP_SAMPLE &&
        percentage(
          groupMatches(group),
          groupAttempts(group)
        ) < LOW_HIT_RATE
      )
      .map(group => {
        const attempts = groupAttempts(group);
        const matches = groupMatches(group);
        const hitRate = percentage(matches, attempts);
        const isVenue = category === "場別";

        return {
          category,
          target: String(group?.label || "不明"),
          priority: hitRate < 20 ? "高" : "中",
          evidence: `${sampleLabel}${attempts}R中${matches}R一致（${hitRate}%）`,
          what: isVenue
            ? `${group.label}での補正条件を再検証する`
            : `${group.label}と判定した条件を再検証する`,
          why: `最低${MIN_GROUP_SAMPLE}Rを超え、${sampleLabel}の展開一致率が注意基準${LOW_HIT_RATE}%を下回っています。`,
          how: isVenue
            ? "展開→コース→ST・スリット→展示・足→残し・拾いの順を保ち、当地・水面補正が判定を押し上げ過ぎていないか対象レースを比較します。"
            : "予想した中心展開と実際の決まり手を照合し、展開判定の成立条件を1項目ずつ確認します。数字だけで買い目を追加・削除しません。",
          impact: isVenue
            ? `影響範囲は${group.label}の将来予想だけ。現時点では重みを変更しません。`
            : `影響範囲は「${group.label}」判定の将来予想だけ。現時点では判定条件を変更しません。`,
          approvalRequired: true
        };
      });
  }

  function buildRoleSuggestions(groups, sampleLabel) {
    return safeGroups(groups)
      .filter(group =>
        groupAttempts(group) >= MIN_GROUP_SAMPLE &&
        percentage(
          groupMatches(group),
          groupAttempts(group)
        ) < LOW_ROLE_MATCH_RATE
      )
      .map(group => {
        const attempts = groupAttempts(group);
        const matches = groupMatches(group);
        const matchRate = percentage(matches, attempts);

        return {
          category: "役割別",
          target: String(group?.label || group?.key || "役割不明"),
          priority: matchRate < 30 ? "高" : "中",
          evidence: `${sampleLabel}${attempts}件中${matches}件一致（${matchRate}%）`,
          what: `${group?.label || "役割"}の成立条件を再検証する`,
          why: `最低${MIN_GROUP_SAMPLE}件を超え、想定着順との一致率が注意基準${LOW_ROLE_MATCH_RATE}%を下回っています。`,
          how: "攻め・追走・残し・拾いの役割と期待着順を、実際の1マークからゴールまでの順序で照合します。印や艇番だけで評価を変えません。",
          impact: "影響範囲は該当役割の判定候補だけです。現時点では配点・買い目・点数上限を変更しません。",
          approvalRequired: true
        };
      });
  }

  function buildTheorySuggestions(groups, missCount, sampleLabel) {
    if (missCount < MIN_SELECTED_SAMPLE) return [];

    return safeGroups(groups)
      .map(group => {
        const count = Number(group?.count || 0);
        return {
          ...group,
          count,
          percentage: Number.isFinite(Number(group?.percentage))
            ? Number(group.percentage)
            : percentage(count, missCount)
        };
      })
      .filter(group =>
        group.count >= 3 &&
        group.percentage >= THEORY_SHARE_ALERT
      )
      .map(group => ({
        category: "理論別",
        target: String(group?.label || "判定段階不明"),
        priority: group.percentage >= 50 ? "高" : "中",
        evidence: `${sampleLabel}の不的中${missCount}R中${group.count}R（${group.percentage}%）で最初の要確認`,
        what: `${group?.label || "該当理論"}の判定条件を再検証する`,
        why: `8項目の優先順を保った原因照合で、この段階が${THEORY_SHARE_ALERT}%以上を占めています。`,
        how: "展開→コース→ST・スリット→展示・足→残し・拾い→当地・水面→技量→モーターの順を崩さず、該当段階だけを実レースと比較します。",
        impact: "影響範囲は承認後に指定した判定条件だけです。自動で重み・印・買い目へ反映しません。",
        approvalRequired: true
      }));
  }

  function buildRecoverySuggestion(input, sampleLabel) {
    const practicalCount = Number(
      input?.practicalCount ??
      0
    );
    const recoveryRate = Number(input?.recoveryRate);

    if (
      practicalCount < MIN_SELECTED_SAMPLE ||
      !Number.isFinite(recoveryRate) ||
      recoveryRate >= 100
    ) {
      return [];
    }

    return [{
      category: "回収率",
      target: "自動厳選",
      priority: recoveryRate < 80 ? "高" : "中",
      evidence: `${sampleLabel}購入あり${practicalCount}Rの1点100円検証で回収率${recoveryRate}%`,
      what: "買い目区分ごとの採用成績を再検証する",
      why: `自動厳選の検証回収率が目標100%を下回っています。`,
      how: "本線・押さえ・流し・独立展開・万舟を分け、的中率と払戻への寄与を確認します。オッズは予想生成や候補削除には使いません。",
      impact: "現時点では購入点数・資金配分・予想ロジックを変更しません。変更案は別途承認が必要です。",
      approvalRequired: true
    }];
  }

  function buildSelectionSuggestion(input, sampleLabel) {
    const selected = input?.selectionComparison?.selected || {};
    const shadow = input?.selectionComparison?.shadow || {};
    const selectedCount = Number(selected.count || 0);
    const shadowCount = Number(shadow.count || 0);
    const selectedRate = Number(selected.scenarioMatchRate);
    const shadowRate = Number(shadow.scenarioMatchRate);

    if (
      selectedCount < MIN_SELECTED_SAMPLE ||
      shadowCount < MIN_SELECTED_SAMPLE ||
      !Number.isFinite(selectedRate) ||
      !Number.isFinite(shadowRate) ||
      selectedRate > shadowRate
    ) {
      return [];
    }

    return [{
      category: "レース選定",
      target: "選定あり／見送り比較",
      priority: selectedRate + 5 < shadowRate ? "高" : "中",
      evidence: `${sampleLabel}で選定${selectedCount}Rの展開一致${selectedRate}%、見送り検証${shadowCount}Rは${shadowRate}%`,
      what: "レース選定条件の識別力を再検証する",
      why: "選定したレースの展開一致率が、見送り検証を上回っていません。",
      how: "同じ世代・完成入力・締切前データだけで点数帯と成立展開を比較し、閾値そのものと8項目の完成条件を分けて確認します。",
      impact: "選定基準は自動変更しません。60点台を購入対象へ昇格させる変更も行いません。",
      approvalRequired: true
    }];
  }

  const MISS_GUIDANCE = {
    頭外れ: {
      what: "1着軸の選定条件を再検証する",
      how: "中心展開と1着艇のコース・STを照合し、展開予測が外れたのか、軸艇評価が外れたのかを分けて確認します。"
    },
    相手抜け: {
      what: "残し・拾いの相手選定を再検証する",
      how: "本線の展開を維持したまま、2差し・4残しなど現実的な残り目を拾えていたか確認します。点数の自動追加はしません。"
    },
    着順違い: {
      what: "2・3着の並び判定を再検証する",
      how: "同じ3艇を選べていたレースだけを比較し、差し残り・外握りの着順条件を確認します。買い目の自動増加はしません。"
    },
    完全抜け: {
      what: "中心展開の見落としを再検証する",
      how: "展開→コース→ST・スリットの順で実際の1マーク展開との差を確認し、その後に展示・足と当地・水面の補正を点検します。"
    }
  };

  function buildMissSuggestions(
    missTypeSummary,
    practicalCount,
    sampleLabel
  ) {
    if (practicalCount < MIN_SETTLED_SAMPLE) return [];

    return safeGroups(missTypeSummary)
      .filter(item => item?.label !== "的中")
      .map(item => ({
        ...item,
        percentage: Number.isFinite(Number(item?.percentage))
          ? Number(item.percentage)
          : percentage(item?.count || 0, practicalCount)
      }))
      .filter(item => Number(item?.count || 0) >= 3 && item.percentage >= MISS_SHARE_ALERT)
      .map(item => {
        const guidance = MISS_GUIDANCE[item.label] || MISS_GUIDANCE.完全抜け;
        return {
          category: "外れ方別",
          target: item.label,
          priority: item.percentage >= 60 ? "高" : "中",
          evidence: `${sampleLabel}${practicalCount}R中${item.count}R（${item.percentage}%）`,
          what: guidance.what,
          why: `この外れ方が${MISS_SHARE_ALERT}%以上を占め、同じ弱点が3R以上続いています。`,
          how: guidance.how,
          impact: "影響範囲は該当する外れ方の改善候補だけ。予想基準と買い目はまだ変更しません。",
          approvalRequired: true
        };
      });
  }

  function buildImprovementSuggestions(input = {}) {
    const settledCount = Number(input.settledCount || 0);
    const practicalCount = Number(input.practicalCount || 0);
    const reviewCount = Number(input.reviewCount || settledCount || 0);
    const sampleLabel = String(input.sampleLabel || "同一世代の完成入力");

    const venue = buildGroupSuggestions(
      "場別",
      input.venueGroups,
      sampleLabel
    );
    const scenario = buildGroupSuggestions(
      "展開別",
      input.scenarioGroups,
      sampleLabel
    );
    const miss = buildMissSuggestions(
      input.missTypeSummary,
      practicalCount,
      sampleLabel
    );
    const role = buildRoleSuggestions(
      input.roleGroups,
      sampleLabel
    );
    const theory = buildTheorySuggestions(
      input.theoryGroups,
      Math.max(
        0,
        practicalCount -
        Number(input.practicalHits || 0)
      ),
      sampleLabel
    );
    const recovery = buildRecoverySuggestion(
      input,
      sampleLabel
    );
    const selection = buildSelectionSuggestion(
      input,
      sampleLabel
    );
    const rawSuggestions = [
      ...selection,
      ...theory,
      ...role,
      ...venue,
      ...scenario,
      ...miss,
      ...recovery
    ]
      .sort((a, b) =>
        (a.priority === "高" ? 0 : 1) - (b.priority === "高" ? 0 : 1) ||
        a.category.localeCompare(b.category, "ja")
      )
      .slice(0, MAX_SUGGESTIONS);

    const sampleReady =
      reviewCount >= MIN_SETTLED_SAMPLE;
    const suggestions =
      sampleReady
        ? rawSuggestions.map(
            proposalOnly
          )
        : [];
    const accumulating =
      `蓄積中 ${Math.min(reviewCount, MIN_SETTLED_SAMPLE)}/${MIN_SETTLED_SAMPLE}R`;

    return {
      minimumSample: MIN_SETTLED_SAMPLE,
      reviewCount,
      settledCount,
      practicalCount,
      sampleReady,
      suggestions,
      axisStatus: sampleReady
        ? {
            venue: venue.length ? `${venue.length}件の候補` : "変更候補なし",
            scenario: scenario.length ? `${scenario.length}件の候補` : "変更候補なし",
            miss: miss.length ? `${miss.length}件の候補` : "変更候補なし",
            role: role.length ? `${role.length}件の候補` : "変更候補なし",
            theory: theory.length ? `${theory.length}件の候補` : "変更候補なし",
            recovery: recovery.length ? `${recovery.length}件の候補` : "変更候補なし",
            selection: selection.length ? `${selection.length}件の候補` : "変更候補なし"
          }
        : {
            venue: accumulating,
            scenario: accumulating,
            miss: accumulating,
            role: accumulating,
            theory: accumulating,
            recovery: accumulating,
            selection: accumulating
          }
    };
  }

  return {
    buildImprovementSuggestions,
    proposalOnly,
    constants: {
      MIN_SETTLED_SAMPLE,
      MIN_GROUP_SAMPLE,
      MIN_SELECTED_SAMPLE,
      LOW_HIT_RATE,
      LOW_ROLE_MATCH_RATE,
      MISS_SHARE_ALERT,
      THEORY_SHARE_ALERT,
      MAX_SUGGESTIONS
    }
  };
});
