"use strict";

const assert =
  require("node:assert/strict");
const {
  repositorySlug,
  jstDateKey,
  sha256
} = require("./preflight-connections");

const repository =
  "takechanman12250711-oss/chappy-boatrace-ai";

assert.equal(
  repositorySlug(
    `https://github.com/${repository}.git`
  ),
  repository
);
assert.equal(
  repositorySlug(
    `git@github.com:${repository}.git`
  ),
  repository
);
assert.equal(
  repositorySlug(
    `https://evilgithub.com/${repository}.git`
  ),
  "",
  "偽GitHubホストを許可しない"
);
assert.equal(
  repositorySlug(
    `https://TOKEN@github.com/${repository}.git`
  ),
  "",
  "認証情報入りoriginを許可しない"
);
assert.match(
  jstDateKey(),
  /^\d{8}$/
);
assert.equal(
  sha256("chappy").length,
  64
);

console.log(
  "接続事前確認の安全条件テスト: 合格"
);
