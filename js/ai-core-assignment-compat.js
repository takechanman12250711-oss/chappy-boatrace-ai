(function (root) {
  "use strict";

  const VERSION = "20260824-readonly-core-fix1";

  function install() {
    if (!root) return false;

    const descriptor = Object.getOwnPropertyDescriptor(
      root,
      "ChappyAICore"
    );
    const core = root.ChappyAICore;

    if (!core || typeof core !== "object") {
      return false;
    }

    if (
      core.__localWaterTheoryV2Installed !== true ||
      core.__motorMaintenanceTheoryV2Installed !== true
    ) {
      return false;
    }

    if (
      descriptor &&
      Object.prototype.hasOwnProperty.call(
        descriptor,
        "value"
      ) &&
      descriptor.writable === true
    ) {
      return true;
    }

    if (!descriptor || descriptor.configurable !== true) {
      return false;
    }

    try {
      Object.defineProperty(
        root,
        "ChappyAICore",
        {
          configurable: true,
          enumerable: descriptor.enumerable !== false,
          writable: true,
          value: core
        }
      );
      return true;
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn(
          "[AICoreAssignmentCompat] AIコア公開方式の切替に失敗",
          error
        );
      }
      return false;
    }
  }

  const installed = install();

  root.ChappyAICoreAssignmentCompat = Object.freeze({
    version: VERSION,
    installed,
    install
  });
})(
  typeof window !== "undefined"
    ? window
    : globalThis
);
