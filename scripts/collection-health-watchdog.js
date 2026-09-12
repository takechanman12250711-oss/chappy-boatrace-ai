"use strict";

/*
 * 自動収集の異常出口専用。
 * 既存 collection-health の判定結果を受け取り、GitHub Actions が
 * 通知すべき異常かどうかだけを決める。
 * 予想基準・重み・買い目・収集処理は変更しない。
 */

function evaluate(report) {
  const failedCount = Number(report?.failedCount || 0);
  const invalidBoatIdentityCount = Number(report?.invalidBoatIdentityCount || 0);
  const finalUncollectedCount = Number(report?.finalUncollectedCount || 0);
  const retryingCount = Number(report?.retryingCount || 0);
  const missingCount = Number(report?.missingCount || 0);

  const critical =
    failedCount > 0 ||
    invalidBoatIdentityCount > 0 ||
    finalUncollectedCount > 0;

  return {
    healthy: !critical,
    shouldNotify: critical,
    severity: critical ? "error" : retryingCount > 0 || missingCount > 0 ? "watch" : "ok",
    summary: critical
      ? `自動収集異常: failed=${failedCount}, boatIdentity=${invalidBoatIdentityCount}, finalUncollected=${finalUncollectedCount}`
      : retryingCount > 0 || missingCount > 0
        ? `自動収集監視中: retrying=${retryingCount}, missing=${missingCount}`
        : "自動収集は正常です"
  };
}

module.exports = { evaluate };
