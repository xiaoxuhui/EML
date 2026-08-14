(function (root, factory) {
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const api = factory(expression);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLValueStore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr) {
  "use strict";

  const encodeId = (prefix, key) => `${prefix}:${encodeURIComponent(key)}`;
  const valueIdFor = (canonicalKey) => encodeId("value", canonicalKey);
  const derivationIdFor = (formulaKey) => encodeId("derivation", formulaKey);
  const initialValueId = valueIdFor(Expr.canonicalKey(Expr.ONE));
  const DEFAULT_TREE_DEPTH = 4;
  const MAX_TREE_DEPTH = 32;
  const MAX_TREE_NODES = 800;

  function createInitialValue() {
    return {
      id: initialValueId,
      canonicalExpression: Expr.ONE,
      canonicalKey: Expr.canonicalKey(Expr.ONE),
      displayText: "1",
      protected: true,
      derivationIds: [],
      createdAt: new Date(0).toISOString(),
    };
  }

  function createInitialState() {
    const initialValue = createInitialValue();
    return {
      schemaVersion: 2,
      values: { [initialValue.id]: initialValue },
      derivations: {},
      valueOrder: [initialValue.id],
      inputXId: null,
      inputYId: null,
      selectedValueId: null,
    };
  }

  const cloneState = (state) => JSON.parse(JSON.stringify(state));

  function formulaKeyFor(evaluation) {
    return `eml(${Expr.canonicalKey(evaluation.xExpression)},${Expr.canonicalKey(evaluation.yExpression)})->${evaluation.canonicalKey}`;
  }

  function addEvaluation(state, evaluation, xValueId, yValueId) {
    if (!evaluation || !evaluation.ok) return { state, status: "invalid" };
    if (!state.values[xValueId] || !state.values[yValueId]) return { state, status: "missing-input" };

    const next = cloneState(state);
    const resultValueId = valueIdFor(evaluation.canonicalKey);
    const formulaKey = formulaKeyFor(evaluation);
    const derivationId = derivationIdFor(formulaKey);
    const existingValue = next.values[resultValueId];
    const existingDerivation = next.derivations[derivationId];

    if (!existingValue) {
      next.values[resultValueId] = {
        id: resultValueId,
        canonicalExpression: evaluation.resultExpression,
        canonicalKey: evaluation.canonicalKey,
        displayText: evaluation.displayText,
        protected: evaluation.canonicalKey === Expr.canonicalKey(Expr.ONE),
        derivationIds: [],
        createdAt: new Date().toISOString(),
      };
      next.valueOrder.push(resultValueId);
    }

    if (!existingDerivation) {
      next.derivations[derivationId] = {
        id: derivationId,
        formulaKey,
        operation: "EML",
        xValueId,
        yValueId,
        rawExpression: evaluation.rawExpression,
        resultValueId,
        directFormula: evaluation.directFormula,
        rewriteSteps: evaluation.rewriteSteps,
        createdAt: new Date().toISOString(),
      };
      next.values[resultValueId].derivationIds.push(derivationId);
    } else {
      Object.assign(existingDerivation, {
        xValueId,
        yValueId,
        rawExpression: evaluation.rawExpression,
        resultValueId,
        directFormula: evaluation.directFormula,
        rewriteSteps: evaluation.rewriteSteps,
      });
    }

    next.selectedValueId = resultValueId;
    return {
      state: next,
      resultValueId,
      status: existingDerivation ? "duplicate-formula" : existingValue ? "added-formula" : "added-value",
    };
  }

  function isReferenced(state, valueId) {
    return Object.values(state.derivations).some(
      (derivation) => derivation.xValueId === valueId || derivation.yValueId === valueId
    );
  }

  function deleteValue(state, valueId) {
    const value = state.values[valueId];
    if (!value) return { state, status: "missing" };
    if (value.protected || valueId === initialValueId) return { state, status: "protected" };
    if (isReferenced(state, valueId)) return { state, status: "referenced" };

    const next = cloneState(state);
    for (const derivationId of value.derivationIds) delete next.derivations[derivationId];
    delete next.values[valueId];
    next.valueOrder = next.valueOrder.filter((id) => id !== valueId);
    if (next.inputXId === valueId) next.inputXId = null;
    if (next.inputYId === valueId) next.inputYId = null;
    if (next.selectedValueId === valueId) next.selectedValueId = null;
    return { state: next, status: "deleted" };
  }

  function clearNonInitial() {
    return createInitialState();
  }

  function selectValue(state, valueId) {
    if (!state.values[valueId]) return state;
    const next = cloneState(state);
    next.selectedValueId = valueId;
    return next;
  }

  function setInput(state, inputName, valueId) {
    if (!state.values[valueId] || !["x", "y"].includes(inputName)) return state;
    const next = cloneState(state);
    if (inputName === "x") next.inputXId = valueId;
    if (inputName === "y") next.inputYId = valueId;
    return next;
  }

  function buildValueTree(state, valueId, options) {
    const maxDepth = options?.maxDepth ?? Infinity;
    const maxNodes = options?.maxNodes ?? Infinity;
    const budget = { count: 0 };

    function buildNode(currentValueId, path, depth) {
      const value = state.values[currentValueId];
      if (!value) return { type: "missing", valueId: currentValueId };
      if (path.has(currentValueId)) return { type: "cycle", valueId: currentValueId, label: value.displayText };
      if (budget.count >= maxNodes) {
        return { type: "deferred", valueId: currentValueId, label: value.displayText, reason: "node-limit" };
      }
      budget.count += 1;
      if (depth >= maxDepth && value.derivationIds.length > 0) {
        return { type: "deferred", valueId: currentValueId, label: value.displayText, reason: "depth-limit" };
      }

      const nextPath = new Set(path);
      nextPath.add(currentValueId);
      return {
        type: "value",
        valueId: currentValueId,
        label: value.displayText,
        initial: value.protected && value.derivationIds.length === 0,
        derivations: value.derivationIds.map((derivationId) => {
          const derivation = state.derivations[derivationId];
          if (!derivation) return { type: "missing-derivation", derivationId };
          return {
            type: "derivation",
            derivationId,
            directFormula: derivation.directFormula,
            rewriteSteps: derivation.rewriteSteps,
            x: buildNode(derivation.xValueId, nextPath, depth + 1),
            y: buildNode(derivation.yValueId, nextPath, depth + 1),
          };
        }),
      };
    }

    return buildNode(valueId, new Set(), 0);
  }

  function treeHasDeferredBranches(node) {
    if (!node || typeof node !== "object") return false;
    if (node.type === "deferred") return true;
    if (!Array.isArray(node.derivations)) return false;
    return node.derivations.some((derivation) => (
      derivation && (treeHasDeferredBranches(derivation.x) || treeHasDeferredBranches(derivation.y))
    ));
  }

  function getDetails(state, valueId, treeOptions) {
    const value = state.values[valueId];
    if (!value) return null;
    return {
      value,
      directFormulas: value.derivationIds
        .map((id) => state.derivations[id])
        .filter(Boolean)
        .map((derivation) => derivation.directFormula),
      tree: buildValueTree(state, valueId, treeOptions),
    };
  }

  return {
    initialValueId,
    DEFAULT_TREE_DEPTH,
    MAX_TREE_DEPTH,
    MAX_TREE_NODES,
    valueIdFor,
    formulaKeyFor,
    createInitialState,
    addEvaluation,
    deleteValue,
    clearNonInitial,
    selectValue,
    setInput,
    isReferenced,
    buildValueTree,
    treeHasDeferredBranches,
    getDetails,
  };
});
