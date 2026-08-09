"use strict";

const assert = require("node:assert/strict");

const resultArea = { innerHTML: "" };
const raceInfoArea = { innerHTML: "" };
const selectedFrom = [];

global.window = global;
global.window.addEventListener = () => {};
global.document = {
  body: resultArea,
  getElementById(id) {
    if (id === "resultArea") return resultArea;
    if (id === "raceInfoArea") return raceInfoArea;
    return null;
  },
  querySelectorAll() {
    return [];
  }
};
global.ChappyPracticalSelection = {
  select(prediction) {
    const ticket = prediction?.mainSheet?.tickets?.[0]?.ticket || "";
    selectedFrom.push(ticket);
    return {
      status: "selected",
      tickets: [{ ticket, category: "本線" }],
      expansionSummary: {
        normalCount: 1,
        addedCount: 0,
        finalCount: 1
      }
    };
  }
};

require("../js/render");
require("../js/main-cover-display-boundary");

function prediction() {
  return {
    mainSheet: {
      tickets: [{ ticket: "1-2-3", category: "本線" }]
    },
    aiCore: {
      mainSheet: {
        tickets: [{ ticket: "4-5-6", category: "本線" }]
      },
      manshuSheet: { tickets: [] }
    }
  };
}

function visibleText() {
  return resultArea.innerHTML
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

const renderAllInput = prediction();
global.renderAll(renderAllInput);
assert.equal(
  selectedFrom[0],
  "4-5-6",
  "renderAllはaiCore adapter適用後にselectorを確定する"
);
assert.match(visibleText(), /4\s*→\s*5\s*→\s*6/);
assert.doesNotMatch(visibleText(), /1\s*→\s*2\s*→\s*3/);
assert.equal(renderAllInput.practicalSelection, undefined);
assert.equal(renderAllInput.mainSheet.tickets[0].ticket, "1-2-3");

const renderPredictionInput = prediction();
global.renderPrediction(renderPredictionInput);
assert.equal(
  selectedFrom[1],
  "4-5-6",
  "renderPredictionもaiCore adapter適用後にselectorを確定する"
);
assert.match(visibleText(), /4\s*→\s*5\s*→\s*6/);
assert.doesNotMatch(visibleText(), /1\s*→\s*2\s*→\s*3/);
assert.equal(renderPredictionInput.practicalSelection, undefined);
assert.equal(renderPredictionInput.mainSheet.tickets[0].ticket, "1-2-3");
assert.deepEqual(selectedFrom, ["4-5-6", "4-5-6"]);

console.log("main cover production render order: ok");
