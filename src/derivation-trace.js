(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLDerivationTrace = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 推导链：把一个数值「怎么一步步被造出来」线性化。
   *
   * 与 value-store 的 buildValueTree 的区别：
   *  - 计算树回答「这个值由什么组成」，同一数值在不同分支会重复展开；
   *  - 推导链回答「它是按什么顺序被造出来的」，线性、拓扑有序，
   *    每个中间结果只推导一次，后续出现时引用其步号。
   *
   * 单独的步数预算（而非复用树的节点预算）：两个视图粒度不同，
   * 共用预算会成为将来的隐性耦合。
   */
  const MAX_TRACE_STEPS = 500;

  function buildDerivationTrace(state, valueId, options) {
    const maxSteps = options?.maxSteps ?? MAX_TRACE_STEPS;
    const steps = [];
    const firstIndex = new Map();
    const inProgress = new Set();
    let truncated = false;

    function visit(currentId) {
      const known = firstIndex.get(currentId);
      if (known !== undefined) {
        const value = state.values[currentId];
        return { valueId: currentId, displayText: value ? value.displayText : "?", refIndex: known };
      }
      if (inProgress.has(currentId)) {
        // 防御性分支：EML 只能引用已存在的值，正常数据不会成环。
        return { valueId: currentId, displayText: "?", refIndex: null, cycle: true };
      }

      const value = state.values[currentId];
      if (!value) return { valueId: currentId, displayText: "?", refIndex: null, missing: true };

      if (steps.length >= maxSteps) {
        truncated = true;
        return { valueId: currentId, displayText: value.displayText, refIndex: null, deferred: true };
      }

      inProgress.add(currentId);
      const derivationId = value.derivationIds[0];
      const derivation = derivationId ? state.derivations[derivationId] : null;

      const step = {
        valueId: currentId,
        displayText: value.displayText,
        kind: derivation ? "derived" : "initial",
      };

      if (derivation) {
        step.operation = derivation.operation || "EML";
        step.directFormula = derivation.directFormula || "";
        step.rewriteSteps = Array.isArray(derivation.rewriteSteps) ? derivation.rewriteSteps : [];
        // 先访问输入：后序保证任何一步被记录时，它的输入都已在前
        step.x = visit(derivation.xValueId);
        step.y = visit(derivation.yValueId);
      }

      inProgress.delete(currentId);
      // 子节点可能刚好用满预算，此时不再记录当前步 ——
      // 保证产出步数严格不超过 maxSteps（截断时链可能不完整，由 truncated 标记告知）。
      if (steps.length >= maxSteps) {
        truncated = true;
        return { valueId: currentId, displayText: value.displayText, refIndex: null, deferred: true };
      }
      steps.push(step);
      step.index = steps.length;
      firstIndex.set(currentId, step.index);
      return { valueId: currentId, displayText: value.displayText, refIndex: step.index };
    }

    const targetRef = visit(valueId);
    if (targetRef.missing) {
      return { ok: false, targetValueId: valueId, steps: [], truncated: false, reason: "missing-value", extraSourceCount: 0 };
    }

    for (const step of steps) step.isTarget = step.valueId === valueId;

    const targetValue = state.values[valueId];
    const extraSourceCount = targetValue ? Math.max(0, targetValue.derivationIds.length - 1) : 0;

    return {
      ok: !truncated,
      targetValueId: valueId,
      steps,
      truncated,
      reason: truncated ? "step-limit" : null,
      extraSourceCount,
    };
  }

  return { MAX_TRACE_STEPS, buildDerivationTrace };
});
