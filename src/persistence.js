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

  function validateState(candidate) {
    if (!candidate || candidate.schemaVersion !== 2) return { ok: false, error: "不支持的数据版本" };
    if (!candidate.values || typeof candidate.values !== "object") return { ok: false, error: "缺少数值数据" };
    if (!candidate.derivations || typeof candidate.derivations !== "object") return { ok: false, error: "缺少公式数据" };
    if (!Array.isArray(candidate.valueOrder)) return { ok: false, error: "数值顺序无效" };

    for (const valueId of candidate.valueOrder) {
      const value = candidate.values[valueId];
      if (!value || value.id !== valueId || !Expr.isValidExpression(value.canonicalExpression)) {
        return { ok: false, error: "存在无效数值" };
      }
      if (Expr.canonicalKey(value.canonicalExpression) !== value.canonicalKey) {
        return { ok: false, error: "数值标识不一致" };
      }
      if (!Array.isArray(value.derivationIds)) return { ok: false, error: "公式索引无效" };
    }

    for (const [derivationId, derivation] of Object.entries(candidate.derivations)) {
      if (!derivation || derivation.id !== derivationId) return { ok: false, error: "存在无效公式" };
      if (!candidate.values[derivation.xValueId] || !candidate.values[derivation.yValueId] || !candidate.values[derivation.resultValueId]) {
        return { ok: false, error: "公式引用了不存在的数值" };
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

    for (const valueId of candidate.valueOrder) {
      const tree = ValueStore.buildValueTree(candidate, valueId);
      if (JSON.stringify(tree).includes('"type":"cycle"')) return { ok: false, error: "公式来源存在循环引用" };
    }

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

  return { CACHE_KEY, validateState, serialize, deserialize, saveToCache, loadFromCache };
});
