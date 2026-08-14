(function (root, factory) {
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const valueStore = typeof module === "object" && module.exports
    ? require("./value-store.js")
    : root.EMLValueStore;
  const api = factory(expression, valueStore);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLPersistence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, ValueStore) {
  "use strict";

  const CACHE_KEY = "eml_workbench_v2";
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  const MAX_VALUES = 2000;
  const MAX_DERIVATIONS = 5000;
  const MAX_REWRITE_STEPS = 200;
  const MAX_TEXT_LENGTH = 2000;

  const isShortString = (value, maximum = MAX_TEXT_LENGTH) => (
    typeof value === "string" && value.length <= maximum
  );

  function hasDependencyCycle(state) {
    const visiting = new Set();
    const visited = new Set();

    function visit(valueId) {
      if (visiting.has(valueId)) return true;
      if (visited.has(valueId)) return false;
      visiting.add(valueId);
      const value = state.values[valueId];
      for (const derivationId of value.derivationIds) {
        const derivation = state.derivations[derivationId];
        if (derivation && (visit(derivation.xValueId) || visit(derivation.yValueId))) return true;
      }
      visiting.delete(valueId);
      visited.add(valueId);
      return false;
    }

    return state.valueOrder.some(visit);
  }

  function validateState(candidate) {
    if (!candidate || candidate.schemaVersion !== 2) return { ok: false, error: "不支持的数据版本" };
    if (!candidate.values || typeof candidate.values !== "object") return { ok: false, error: "缺少数值数据" };
    if (!candidate.derivations || typeof candidate.derivations !== "object") return { ok: false, error: "缺少公式数据" };
    if (!Array.isArray(candidate.valueOrder)) return { ok: false, error: "数值顺序无效" };
    if (candidate.valueOrder.length > MAX_VALUES) return { ok: false, error: "数值数量超过限制" };
    if (Object.keys(candidate.derivations).length > MAX_DERIVATIONS) return { ok: false, error: "公式数量超过限制" };
    if (new Set(candidate.valueOrder).size !== candidate.valueOrder.length) return { ok: false, error: "数值顺序存在重复" };
    if (Object.keys(candidate.values).length !== candidate.valueOrder.length) return { ok: false, error: "数值索引不完整" };

    for (const valueId of candidate.valueOrder) {
      const value = candidate.values[valueId];
      if (!value || value.id !== valueId || !Expr.isValidExpression(value.canonicalExpression)) {
        return { ok: false, error: "存在无效数值" };
      }
      if (Expr.canonicalKey(value.canonicalExpression) !== value.canonicalKey) {
        return { ok: false, error: "数值标识不一致" };
      }
      if (!isShortString(value.displayText, 500) || !isShortString(value.canonicalKey, 2000)) {
        return { ok: false, error: "数值文本无效" };
      }
      if (!Array.isArray(value.derivationIds)) return { ok: false, error: "公式索引无效" };
      if (new Set(value.derivationIds).size !== value.derivationIds.length) return { ok: false, error: "公式索引存在重复" };
    }

    for (const [derivationId, derivation] of Object.entries(candidate.derivations)) {
      if (!derivation || derivation.id !== derivationId) return { ok: false, error: "存在无效公式" };
      if (!candidate.values[derivation.xValueId] || !candidate.values[derivation.yValueId] || !candidate.values[derivation.resultValueId]) {
        return { ok: false, error: "公式引用了不存在的数值" };
      }
      if (derivation.operation !== "EML" || !isShortString(derivation.directFormula)) {
        return { ok: false, error: "公式内容无效" };
      }
      if (!Expr.isValidExpression(derivation.rawExpression)) return { ok: false, error: "公式表达式无效" };
      if (!Array.isArray(derivation.rewriteSteps) || derivation.rewriteSteps.length > MAX_REWRITE_STEPS) {
        return { ok: false, error: "化简步骤无效" };
      }
      if (derivation.rewriteSteps.some((step) => (
        !step || !isShortString(step.ruleId, 100) || !isShortString(step.before) || !isShortString(step.after)
      ))) {
        return { ok: false, error: "化简步骤内容无效" };
      }
      if (!candidate.values[derivation.resultValueId].derivationIds.includes(derivationId)) {
        return { ok: false, error: "公式与结果索引不一致" };
      }
    }

    const initial = candidate.values[ValueStore.initialValueId];
    if (!initial || !initial.protected) return { ok: false, error: "缺少受保护的初始值 1" };

    const allowedSelection = (id) => id === null || Boolean(candidate.values[id]);
    if (!allowedSelection(candidate.inputXId) || !allowedSelection(candidate.inputYId) || !allowedSelection(candidate.selectedValueId)) {
      return { ok: false, error: "选择状态引用了不存在的数值" };
    }

    if (hasDependencyCycle(candidate)) return { ok: false, error: "公式来源存在循环引用" };

    return { ok: true, state: JSON.parse(JSON.stringify(candidate)) };
  }

  function serialize(state) {
    return JSON.stringify({
      app: "EML Workbench",
      savedAt: new Date().toISOString(),
      ...state,
      schemaVersion: 2,
    }, null, 2);
  }

  function deserialize(text) {
    if (typeof text !== "string" || text.length > MAX_IMPORT_BYTES) {
      return { ok: false, error: "文件大小超过限制" };
    }
    try {
      return validateState(JSON.parse(text));
    } catch {
      return { ok: false, error: "文件不是有效的 JSON" };
    }
  }

  function saveToCache(storage, state) {
    storage.setItem(CACHE_KEY, serialize(state));
  }

  function loadFromCache(storage) {
    const text = storage.getItem(CACHE_KEY);
    if (!text) return { ok: false, error: "没有缓存" };
    return deserialize(text);
  }

  return {
    CACHE_KEY,
    MAX_IMPORT_BYTES,
    MAX_VALUES,
    MAX_DERIVATIONS,
    validateState,
    hasDependencyCycle,
    serialize,
    deserialize,
    saveToCache,
    loadFromCache,
  };
});
