"use strict";

const assert = require("node:assert/strict");

global.window = global;
let fetchCount = 0;
global.fetch = async () => {
  fetchCount += 1;
  return {
    ok: true,
    async json() {
      return { ok: true, entries: [] };
    }
  };
};

require("../js/api.js");

const params = {
  jcd: "12",
  rno: 11,
  date: "20260727"
};

Promise.all([
  window.ChappyAPI.prefetchRace(params),
  window.ChappyAPI.fetchRace(params)
])
  .then(async ([prefetched, fetched]) => {
    assert.equal(fetchCount, 1);
    assert.deepEqual(prefetched, fetched);

    await window.ChappyAPI.fetchRace(
      params,
      { force: true }
    );
    assert.equal(fetchCount, 2);

    console.log(
      "レースAPI先読みキャッシュテスト: 合格"
    );
  })
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
