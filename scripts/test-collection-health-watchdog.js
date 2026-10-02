"use strict";

const assert = require("node:assert/strict");
const { evaluate } = require("./collection-health-watchdog");

const ok = evaluate({ missingCount: 0, failedCount: 0, retryingCount: 0 });
assert.equal(ok.shouldNotify, false);
assert.equal(ok.severity, "ok");

const retrying = evaluate({ missingCount: 1, retryingCount: 1, failedCount: 0 });
assert.equal(retrying.shouldNotify, false);
assert.equal(retrying.severity, "watch");

const failed = evaluate({ failedCount: 1 });
assert.equal(failed.shouldNotify, true);
assert.equal(failed.severity, "error");

const finalUncollected = evaluate({ finalUncollectedCount: 1 });
assert.equal(finalUncollected.shouldNotify, true);

const identity = evaluate({ invalidBoatIdentityCount: 1 });
assert.equal(identity.shouldNotify, true);

console.log("自動収集watchdogテスト: 合格");
