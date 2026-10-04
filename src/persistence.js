(function (root, factory) {
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const valueStore = typeof module === "object" && module.exports
    ? require("./value-store.js")
    : root.EMLValueStore;
  const composition = typeof module === "object" && module.exports
    ? require("./eml-composition.js")
    : root.EMLComposition;
  const api = factory(expression, valueStore, composition);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLPersistence = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, ValueStore, Composition) {
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

  function migrateCustomFunctions(candidate) {
    const next = JSON.parse(JSON.stringify(candidate));
    if (!Array.isArray(next.customFunctions)) {
      next.customFunctions = ValueStore.getCustomFunctions(next);
    }
    delete next.customFunction;
    return next;
  }

  function migrateCompositionFormulas(candidate) {
    const next = migrateCustomFunctions(candidate);
    const definitions = new Map();
    for (const custom of next.customFunctions) {
      const parsed = Composition.parseDefinition(custom.definitionText);
      if (parsed.ok) definitions.set(parsed.definition.name, parsed.definition);
    }

    for (const derivation of Object.values(next.derivations || {})) {
      if (derivation.operation !== "EML_COMPOSITION" || !Array.isArray(derivation.inputValueIds)) continue;
      const parsed = Composition.parseDefinition(derivation.functionDefinition);
      const result = next.values[derivation.resultValueId];
      const inputs = derivation.inputValueIds.map((valueId) => next.values[valueId]?.canonicalExpression);
      if (!parsed.ok || !result || inputs.some((input) => !input) || inputs.length !== parsed.definition.parameterNames.length) continue;

      const available = new Map(definitions);
      available.set(parsed.definition.name, parsed.definition);
      const bindings = new Map(parsed.definition.parameterNames.map((name, index) => [name, Expr.render(inputs[index])]));
      const expandedFormula = `${Composition.renderExpandedBody(parsed.definition.body, bindings, available)} = ${result.displayText}`;
      derivation.expandedFormula = expandedFormula;
      derivation.directFormula = expandedFormula;
    }
    return next;
  }

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
        if (derivation && ValueStore.derivationInputIds(derivation).some((inputValueId) => (
          inputValueId !== derivation.resultValueId && visit(inputValueId)
        ))) return true;
      }
      visiting.delete(valueId);
      visited.add(valueId);
      return false;
    }

    return state.valueOrder.some(visit);
  }

  function validateState(candidate) {
    candidate = migrateCompositionFormulas(candidate);
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
      const inputValueIds = ValueStore.derivationInputIds(derivation);
      if (inputValueIds.length === 0 || inputValueIds.some((valueId) => !candidate.values[valueId]) || !candidate.values[derivation.resultValueId]) {
        return { ok: false, error: "公式引用了不存在的数值" };
      }
      if (!isShortString(derivation.directFormula)) {
        return { ok: false, error: "公式内容无效" };
      }
      if (derivation.operation === "EML") {
        if (inputValueIds.length !== 2 || !candidate.values[derivation.xValueId] || !candidate.values[derivation.yValueId]) {
          return { ok: false, error: "EML 公式输入无效" };
        }
      } else if (derivation.operation === "EML_COMPOSITION") {
        if (
          inputValueIds.length > ValueStore.MAX_CUSTOM_INPUTS ||
          !Array.isArray(derivation.inputNames) || derivation.inputNames.length !== inputValueIds.length ||
          derivation.inputNames.some((name) => !isShortString(name, 100)) ||
          !isShortString(derivation.functionDefinition, 1000)
        ) return { ok: false, error: "组合函数内容无效" };
      } else {
        return { ok: false, error: "不支持的公式类型" };
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

    if (!Array.isArray(candidate.customFunctions) || new Set(candidate.customFunctions.map((item) => item?.id)).size !== candidate.customFunctions.length) {
      return { ok: false, error: "组合函数状态无效" };
    }
    if (new Set(candidate.customFunctions.map((item) => item?.name)).size !== candidate.customFunctions.length) return { ok: false, error: "函数名称存在重复" };
    for (const custom of candidate.customFunctions) {
      if (
        !custom || !isShortString(custom.id, 120) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(custom.name) ||
        !isShortString(custom.definitionText, 1000) || !Array.isArray(custom.inputValueIds) ||
        custom.inputValueIds.length > ValueStore.MAX_CUSTOM_INPUTS ||
        custom.inputValueIds.some((valueId) => valueId !== null && !candidate.values[valueId])
      ) return { ok: false, error: "组合函数状态无效" };
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
