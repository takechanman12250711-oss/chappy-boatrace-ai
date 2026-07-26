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

  const MIN_SETTLED_SAMPLE = 30;
  const MIN_GROUP_SAMPLE = 12;
  const LOW_HIT_RATE = 40;
  const MISS_SHARE_ALERT = 40;
  const MAX_SUGGESTIONS = 6;

  function percentage(count, total) {
    return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  }

  function safeGroups(value) {
    return Array.isArray(value) ? value : [];
  }

  function buildGroupSuggestions(category, groups, sampleLabel) {
    return safeGroups(groups)
      .filter(group =>
        Number(group?.practicalCount || 0) >= MIN_GROUP_SAMPLE &&
        percentage(group?.practicalHits || 0, group?.practicalCount || 0) < LOW_HIT_RATE
      )
      .map(group => {
        const hitRate = percentage(group.practicalHits, group.practicalCount);
        const isVenue = category === "場別";

        return {
          category,
          target: String(group?.label || "不明"),
          priority: hitRate < 20 ? "高" : "中",
          evidence: `${sampleLabel}${group.practicalCount}R中${group.practicalHits}R的中（${hitRate}%）`,
          what: isVenue
            ? `${group.label}での補正条件を再検証する`
            : `${group.label}と判定した条件を再検証する`,
          why: `最低${MIN_GROUP_SAMPLE}Rを超え、${sampleLabel}の的中率が注意基準${LOW_HIT_RATE}%を下回っています。`,
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
    const sampleLabel = String(input.sampleLabel || "実戦厳選");

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
    const suggestions = [...venue, ...scenario, ...miss]
      .sort((a, b) =>
        (a.priority === "高" ? 0 : 1) - (b.priority === "高" ? 0 : 1) ||
        a.category.localeCompare(b.category, "ja")
      )
      .slice(0, MAX_SUGGESTIONS);

    const sampleReady =
      settledCount >= MIN_SETTLED_SAMPLE &&
      practicalCount >= MIN_SETTLED_SAMPLE;
    const accumulating =
      `蓄積中 ${Math.min(practicalCount, MIN_SETTLED_SAMPLE)}/${MIN_SETTLED_SAMPLE}R`;

    return {
      minimumSample: MIN_SETTLED_SAMPLE,
      settledCount,
      practicalCount,
      sampleReady,
      suggestions,
      axisStatus: sampleReady
        ? {
            venue: venue.length ? `${venue.length}件の候補` : "変更候補なし",
            scenario: scenario.length ? `${scenario.length}件の候補` : "変更候補なし",
            miss: miss.length ? `${miss.length}件の候補` : "変更候補なし"
          }
        : {
            venue: accumulating,
            scenario: accumulating,
            miss: accumulating
          }
    };
  }

  return {
    buildImprovementSuggestions,
    constants: {
      MIN_SETTLED_SAMPLE,
      MIN_GROUP_SAMPLE,
      LOW_HIT_RATE,
      MISS_SHARE_ALERT,
      MAX_SUGGESTIONS
    }
  };
});
