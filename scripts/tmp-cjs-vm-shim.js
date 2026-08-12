"use strict";

const vm = require("node:vm");
const Module = require("node:module");
const path = require("node:path");

const originalRunInThisContext = vm.runInThisContext;

vm.runInThisContext = function patchedRunInThisContext(code, options) {
  const filename = String(options?.filename || "");
  if (!filename.includes("tmp-physical-three-promotion")) {
    return originalRunInThisContext.call(vm, code, options);
  }

  const realAiCoreFilename = path.resolve(__dirname, "..", "js", "ai-core.js");
  const compiled = new Module(realAiCoreFilename, module.parent);
  compiled.filename = realAiCoreFilename;
  compiled.paths = Module._nodeModulePaths(path.dirname(realAiCoreFilename));
  compiled._compile(String(code), realAiCoreFilename);
  return compiled.exports;
};
