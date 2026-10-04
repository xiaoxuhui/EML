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
  const MAX_CUSTOM_INPUTS = 6;

  const customFunctionIdFor = (name) => encodeId("function", name);

  function getCustomFunctions(state) {
    if (Array.isArray(state?.customFunctions)) {
      return state.customFunctions
        .filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.definitionText === "string" && Array.isArray(item.inputValueIds))
        .map((item) => ({ id: item.id, name: item.name, definitionText: item.definitionText, inputValueIds: item.inputValueIds.slice(0, MAX_CUSTOM_INPUTS) }));
    }
    const legacy = state?.customFunction;
    if (legacy?.definitionText && Array.isArray(legacy.inputValueIds)) {
      const name = String(legacy.definitionText).match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*\(/)?.[1];
      if (name) return [{ id: customFunctionIdFor(name), name, definitionText: legacy.definitionText, inputValueIds: legacy.inputValueIds.slice(0, MAX_CUSTOM_INPUTS) }];
    }
    return [];
  }

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
      customFunctions: [],
    };
  }

  const cloneState = (state) => JSON.parse(JSON.stringify(state));

  function formulaKeyFor(evaluation) {
    return `eml(${Expr.canonicalKey(evaluation.xExpression)},${Expr.canonicalKey(evaluation.yExpression)})->${evaluation.canonicalKey}`;
  }

  function compositionFormulaKeyFor(evaluation) {
    return `eml-composition(${evaluation.definitionKey}|${evaluation.inputExpressions
      .map((expression) => Expr.canonicalKey(expression)).join(",")})->${evaluation.canonicalKey}`;
  }

  function derivationInputIds(derivation) {
    if (Array.isArray(derivation?.inputValueIds)) return derivation.inputValueIds;
    return derivation ? [derivation.xValueId, derivation.yValueId] : [];
  }

  function dependsOnValue(state, startValueId, targetValueId, maximumDerivationIndex = Infinity, seen = new Set()) {
    if (startValueId === targetValueId) return true;
    if (seen.has(startValueId)) return false;
    seen.add(startValueId);
    const value = state.values[startValueId];
    if (!value) return false;
    const derivationIds = Object.keys(state.derivations);
    return value.derivationIds.some((derivationId) => {
      const index = derivationIds.indexOf(derivationId);
      const derivation = state.derivations[derivationId];
      return derivation && index < maximumDerivationIndex && derivationInputIds(derivation)
        .some((inputValueId) => dependsOnValue(state, inputValueId, targetValueId, maximumDerivationIndex, new Set(seen)));
    });
  }

  function wouldIntroduceCycle(state, resultValueId, inputValueIds) {
    return inputValueIds.some((inputValueId) => dependsOnValue(state, inputValueId, resultValueId));
  }

  function isCyclicDerivation(state, derivation) {
    const index = Object.keys(state.derivations).indexOf(derivation.id);
    return derivationInputIds(derivation).some((inputValueId) => (
      inputValueId === derivation.resultValueId || dependsOnValue(state, inputValueId, derivation.resultValueId, index)
    ));
  }

  function visibleDerivations(state, valueId) {
    const value = state.values[valueId];
    if (!value) return [];
    return value.derivationIds
      .map((id) => state.derivations[id])
      .filter((derivation) => derivation && !isCyclicDerivation(state, derivation));
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

    if (existingValue && !existingDerivation && wouldIntroduceCycle(state, resultValueId, [xValueId, yValueId])) {
      return { state, resultValueId, status: "cyclic-formula" };
    }

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

  function addCompositionEvaluation(state, evaluation, inputValueIds) {
    if (!evaluation || !evaluation.ok || evaluation.operation !== "EML_COMPOSITION") {
      return { state, status: "invalid" };
    }
    if (!Array.isArray(inputValueIds) || inputValueIds.length !== evaluation.inputExpressions.length) {
      return { state, status: "missing-input" };
    }
    if (inputValueIds.some((valueId) => !state.values[valueId])) return { state, status: "missing-input" };

    const next = cloneState(state);
    const resultValueId = valueIdFor(evaluation.canonicalKey);
    const formulaKey = compositionFormulaKeyFor(evaluation);
    const derivationId = derivationIdFor(formulaKey);
    const existingValue = next.values[resultValueId];
    const existingDerivation = next.derivations[derivationId];

    if (existingValue && !existingDerivation && wouldIntroduceCycle(state, resultValueId, inputValueIds)) {
      return { state, resultValueId, status: "cyclic-formula" };
    }

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

    const fields = {
      inputValueIds: [...inputValueIds],
      inputNames: [...evaluation.parameterNames],
      functionDefinition: evaluation.functionDefinition,
      rawExpression: evaluation.rawExpression,
      resultValueId,
      directFormula: evaluation.directFormula,
      expandedFormula: evaluation.expandedFormula,
      emlTree: evaluation.emlTree,
      rewriteSteps: evaluation.rewriteSteps,
    };
    if (!existingDerivation) {
      next.derivations[derivationId] = {
        id: derivationId,
        formulaKey,
        operation: "EML_COMPOSITION",
        ...fields,
        createdAt: new Date().toISOString(),
      };
      next.values[resultValueId].derivationIds.push(derivationId);
    } else {
      Object.assign(existingDerivation, fields);
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
      (derivation) => derivation.resultValueId !== valueId && derivationInputIds(derivation).includes(valueId)
    );
  }

  function deletionClosure(state, valueId) {
    if (!state.values[valueId]) return [];
    const valueIds = new Set([valueId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const derivation of Object.values(state.derivations)) {
        if (!derivation || !state.values[derivation.resultValueId]) continue;
        if (derivationInputIds(derivation).some((inputValueId) => valueIds.has(inputValueId)) && !valueIds.has(derivation.resultValueId)) {
          valueIds.add(derivation.resultValueId);
          changed = true;
        }
      }
    }
    return [...valueIds];
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
    next.customFunctions = getCustomFunctions(next).map((custom) => ({
      ...custom,
      inputValueIds: custom.inputValueIds.map((id) => id === valueId ? null : id),
    }));
    if (next.selectedValueId === valueId) next.selectedValueId = null;
    return { state: next, status: "deleted" };
  }

  function deleteValueCascade(state, valueId) {
    const value = state.values[valueId];
    if (!value) return { state, status: "missing" };
    if (value.protected || valueId === initialValueId) return { state, status: "protected" };
    const valueIds = deletionClosure(state, valueId);
    if (valueIds.some((id) => state.values[id]?.protected || id === initialValueId)) return { state, status: "protected-dependency" };
    const deletedIds = new Set(valueIds);
    const next = cloneState(state);
    for (const [derivationId, derivation] of Object.entries(next.derivations)) {
      if (deletedIds.has(derivation.resultValueId) || derivationInputIds(derivation).some((id) => deletedIds.has(id))) {
        delete next.derivations[derivationId];
      }
    }
    for (const id of deletedIds) delete next.values[id];
    next.valueOrder = next.valueOrder.filter((id) => !deletedIds.has(id));
    if (deletedIds.has(next.inputXId)) next.inputXId = null;
    if (deletedIds.has(next.inputYId)) next.inputYId = null;
    next.customFunctions = getCustomFunctions(next).map((custom) => ({
      ...custom,
      inputValueIds: custom.inputValueIds.map((id) => deletedIds.has(id) ? null : id),
    }));
    if (deletedIds.has(next.selectedValueId)) next.selectedValueId = null;
    return { state: next, status: "deleted", deletedValueIds: valueIds };
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

  function addCustomFunction(state, name, definitionText, inputCount) {
    if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || typeof definitionText !== "string" || !Number.isInteger(inputCount) || inputCount < 1 || inputCount > MAX_CUSTOM_INPUTS) return { state, status: "invalid" };
    const functions = getCustomFunctions(state);
    if (functions.some((item) => item.name === name)) return { state, status: "duplicate-name" };
    const next = cloneState(state);
    next.customFunctions = functions.concat({ id: customFunctionIdFor(name), name, definitionText, inputValueIds: Array(inputCount).fill(null) });
    delete next.customFunction;
    return { state: next, status: "added", functionId: customFunctionIdFor(name) };
  }

  function deleteCustomFunction(state, functionId) {
    const functions = getCustomFunctions(state);
    if (!functions.some((item) => item.id === functionId)) return { state, status: "missing" };
    const next = cloneState(state);
    next.customFunctions = functions.filter((item) => item.id !== functionId);
    delete next.customFunction;
    return { state: next, status: "deleted" };
  }

  function setCustomInput(state, functionId, inputIndex, valueId) {
    const functions = getCustomFunctions(state);
    const custom = functions.find((item) => item.id === functionId);
    if (!state.values[valueId] || !custom || !Number.isInteger(inputIndex) || inputIndex < 0 || inputIndex >= custom.inputValueIds.length) return state;
    const next = cloneState(state);
    next.customFunctions = functions.map((item) => item.id === functionId ? {
      ...item,
      inputValueIds: item.inputValueIds.map((id, index) => index === inputIndex ? valueId : id),
    } : item);
    delete next.customFunction;
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
        derivations: visibleDerivations(state, currentValueId).map((derivation) => {
          const inputIds = derivationInputIds(derivation);
          const inputNames = Array.isArray(derivation.inputNames)
            ? derivation.inputNames
            : ["x", "y"];
          const inputs = inputIds.map((inputId, index) => ({
            name: inputNames[index] || `参数 ${index + 1}`,
            node: buildNode(inputId, nextPath, depth + 1),
          }));
          const treeDerivation = {
            type: "derivation",
            derivationId: derivation.id,
            directFormula: derivation.expandedFormula || derivation.directFormula,
            emlTree: derivation.emlTree,
            rewriteSteps: derivation.rewriteSteps,
            inputs,
          };
          if (derivation.operation === "EML") {
            treeDerivation.x = inputs[0]?.node;
            treeDerivation.y = inputs[1]?.node;
          }
          return treeDerivation;
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
      derivation && Array.isArray(derivation.inputs) && derivation.inputs.some((input) => treeHasDeferredBranches(input.node))
    ));
  }

  function getDetails(state, valueId, treeOptions) {
    const value = state.values[valueId];
    if (!value) return null;
    return {
      value,
      directFormulas: visibleDerivations(state, valueId)
        .map((derivation) => derivation.expandedFormula || derivation.directFormula),
      tree: buildValueTree(state, valueId, treeOptions),
    };
  }

  return {
    initialValueId,
    DEFAULT_TREE_DEPTH,
    MAX_TREE_DEPTH,
    MAX_TREE_NODES,
    MAX_CUSTOM_INPUTS,
    customFunctionIdFor,
    valueIdFor,
    formulaKeyFor,
    compositionFormulaKeyFor,
    derivationInputIds,
    visibleDerivations,
    createInitialState,
    addEvaluation,
    addCompositionEvaluation,
    deletionClosure,
    deleteValue,
    deleteValueCascade,
    clearNonInitial,
    selectValue,
    setInput,
    getCustomFunctions,
    addCustomFunction,
    deleteCustomFunction,
    setCustomInput,
    isReferenced,
    buildValueTree,
    treeHasDeferredBranches,
    getDetails,
  };
});
