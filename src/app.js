(function (root) {
  "use strict";

  const Expr = root.EMLExpression;
  const FormulaRules = root.EMLFormulaRules;
  const Evaluator = root.EMLEvaluator;
  const Store = root.EMLValueStore;
  const Persistence = root.EMLPersistence;
  const TreeController = root.EMLTreeController;
  const Trace = root.EMLDerivationTrace;
  const Composition = root.EMLComposition;

  const elements = {
    slotX: document.getElementById("slotX"),
    slotY: document.getElementById("slotY"),
    result: document.getElementById("resultOutput"),
    add: document.getElementById("addButton"),
    directPreview: document.getElementById("directPreview"),
    notice: document.getElementById("notice"),
    valueList: document.getElementById("valueList"),
    valueCount: document.getElementById("valueCount"),
    save: document.getElementById("saveButton"),
    import: document.getElementById("importButton"),
    importFile: document.getElementById("importFile"),
    clear: document.getElementById("clearButton"),
    detailsEmpty: document.getElementById("detailsEmpty"),
    detailsContent: document.getElementById("detailsContent"),
    selectedValue: document.getElementById("selectedValue"),
    directFormulaList: document.getElementById("directFormulaList"),
    traceSummary: document.getElementById("traceSummary"),
    derivationTrace: document.getElementById("derivationTrace"),
    calculationTreeViewport: document.getElementById("calculationTreeViewport"),
    calculationTree: document.getElementById("calculationTree"),
    treeVerticalScroll: document.getElementById("treeVerticalScroll"),
    treeZoomOut: document.getElementById("treeZoomOut"),
    treeZoomIn: document.getElementById("treeZoomIn"),
    treeZoomLevel: document.getElementById("treeZoomLevel"),
    treeResetView: document.getElementById("treeResetView"),
    customFunctionApplications: document.getElementById("customFunctionApplications"),
    customDefinitionName: document.getElementById("customDefinitionName"),
    customDefinitionParameters: document.getElementById("customDefinitionParameters"),
    customDefinitionSignature: document.getElementById("customDefinitionSignature"),
    customDefinitionExpression: document.getElementById("customDefinitionExpression"),
    definitionFunctionSources: document.getElementById("definitionFunctionSources"),
    definitionParameterSources: document.getElementById("definitionParameterSources"),
    definitionValueSources: document.getElementById("definitionValueSources"),
    customApply: document.getElementById("customApplyButton"),
    customCancelEdit: document.getElementById("customCancelEditButton"),
    customDefinitionStatus: document.getElementById("customDefinitionStatus"),
  };

  let state = restoreState();
  let preview = null;
  const undoHistory = [];
  const MAX_UNDO_HISTORY = 100;
  let customDefinitionError = "";
  // 存档保留当时的公式与结果；界面和新计算采用当前规则的只读化简视图。
  // 这样规则升级立即生效，又不会在加载时改写用户的本地存档。
  const presentationCache = new Map();
  let definitionDraft = { body: null, selectedPath: "root", pendingSource: null };
  let editingFunctionId = null;
  let pointerDrag = null;
  let suppressValueClick = false;
  let treeDepth = Infinity;
  const treeController = TreeController.create({
    viewport: elements.calculationTreeViewport,
    canvas: elements.calculationTree,
    zoomOut: elements.treeZoomOut,
    zoomIn: elements.treeZoomIn,
    zoomLevel: elements.treeZoomLevel,
    resetButton: elements.treeResetView,
    verticalScroll: elements.treeVerticalScroll,
  });

  function restoreState() {
    try {
      const restored = Persistence.loadFromCache(localStorage);
      if (restored.ok) return restored.state;
    } catch {
      // A disabled cache should not prevent the calculator from starting.
    }
    return Store.createInitialState();
  }

  function persistState() {
    try {
      Persistence.saveToCache(localStorage, state);
      return true;
    } catch {
      showNotice("无法写入浏览器缓存，请使用“保存列表”备份。", true);
      return false;
    }
  }

  function commitState(nextState) {
    const before = JSON.stringify(state);
    if (before === JSON.stringify(nextState)) return false;
    undoHistory.push(before);
    if (undoHistory.length > MAX_UNDO_HISTORY) undoHistory.shift();
    state = nextState;
    recomputePreview();
    persistState();
    return true;
  }

  function undoLastChange() {
    const snapshot = undoHistory.pop();
    if (!snapshot) {
      showNotice("没有可撤销的操作。", false);
      return;
    }
    state = JSON.parse(snapshot);
    recomputePreview();
    persistState();
    showNotice("已撤销上一步操作。", false);
    render();
  }

  function showNotice(message, isError = false) {
    elements.notice.textContent = message || "";
    elements.notice.classList.toggle("error", isError);
  }

  function currentValue(valueId) {
    return valueId ? state.values[valueId] : null;
  }

  function presentationFor(value) {
    if (!value?.canonicalExpression || !FormulaRules) return {
      expression: value?.canonicalExpression || null,
      displayText: value?.displayText || "",
    };
    const cached = presentationCache.get(value.id);
    if (cached?.canonicalKey === value.canonicalKey) return cached;
    const simplified = FormulaRules.simplify(value.canonicalExpression);
    const presentation = {
      canonicalKey: value.canonicalKey,
      expression: simplified.limitReached ? value.canonicalExpression : simplified.expression,
      displayText: simplified.limitReached ? value.displayText : Expr.render(simplified.expression),
    };
    presentationCache.set(value.id, presentation);
    return presentation;
  }

  function setMath(element, expression, fallbackText) {
    if (!expression) {
      element.textContent = fallbackText;
      return;
    }
    const text = fallbackText || Expr.render(expression);
    try {
      root.katex.render(Expr.renderTex(expression), element, { throwOnError: true, strict: "ignore" });
      element.setAttribute("aria-label", text);
    } catch {
      element.textContent = text;
    }
  }

  function recomputePreview() {
    const x = currentValue(state.inputXId);
    const y = currentValue(state.inputYId);
    preview = x && y ? Evaluator.evaluateEML(presentationFor(x).expression, presentationFor(y).expression) : null;
  }

  function renderSlot(element, value, placeholder) {
    const presentation = presentationFor(value);
    setMath(element, presentation.expression, value ? presentation.displayText : placeholder);
    element.classList.toggle("filled", Boolean(value));
    element.title = value ? presentation.displayText : `${placeholder} 输入位置`;
  }

  function renderCalculator() {
    renderSlot(elements.slotX, currentValue(state.inputXId), "x");
    renderSlot(elements.slotY, currentValue(state.inputYId), "y");
    elements.result.classList.toggle("error", Boolean(preview && (!preview.ok || preview.limitReached)));

    if (!preview) {
      elements.result.textContent = "?";
      elements.directPreview.textContent = "等待 x、y";
      elements.add.disabled = true;
      return;
    }

    if (!preview.ok) {
      elements.result.textContent = "未定义";
      elements.directPreview.textContent = preview.error;
      elements.add.disabled = true;
      return;
    }

    if (preview.limitReached) {
      setMath(elements.result, preview.resultExpression, preview.displayText);
      elements.directPreview.textContent = "化简达到安全上限，当前结果尚不能添加。";
      elements.add.disabled = true;
      return;
    }

    setMath(elements.result, preview.resultExpression, preview.displayText);
    elements.directPreview.textContent = preview.directFormula;
    elements.add.disabled = false;
  }

  function definitionForCustom(custom) {
    if (custom.definitionAst) {
      return Composition.createDefinition(custom.name, custom.definitionAst.parameterNames, custom.definitionAst.body);
    }
    return Composition.parseDefinition(custom.definitionText);
  }

  function draftParameters() {
    return elements.customDefinitionParameters.value.split(",").map((name) => name.trim()).filter(Boolean);
  }

  function definitionSlot(path, label = "拖入") {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "definition-slot";
    slot.dataset.definitionPath = path;
    slot.textContent = label;
    slot.title = "拖入函数、变量或数值";
    slot.classList.toggle("selected", definitionDraft.selectedPath === path);
    bindDefinitionSlot(slot, path);
    return slot;
  }

  function renderDefinitionNode(node, path) {
    if (!node) return definitionSlot(path);
    if (node.type === "parameter" || node.type === "constant") {
      const value = document.createElement("span");
      value.className = "definition-leaf";
      value.dataset.definitionPath = path;
      value.textContent = node.type === "parameter" ? node.name : node.displayText;
      value.title = "右键删除此输入";
      bindDefinitionNode(value, path, () => true);
      return value;
    }
    const call = document.createElement("span");
    call.className = "definition-call";
    call.dataset.definitionPath = path;
    call.title = "全部输入清空后，可右键删除此函数";
    call.append(`${node.type === "eml" ? "EML" : node.name}(`);
    const children = node.type === "eml" ? [node.left, node.right] : node.arguments;
    children.forEach((child, index) => {
      if (index > 0) call.append(", ");
      call.appendChild(renderDefinitionNode(child, `${path}.${node.type === "eml" ? (index === 0 ? "left" : "right") : `arguments.${index}`}`));
    });
    call.append(")");
    bindDefinitionNode(call, path, () => children.every((child) => !child));
    return call;
  }

  function nodeAtDefinitionPath(path) {
    if (path === "root") return { parent: definitionDraft, key: "body" };
    const parts = path.split(".").slice(1);
    let parent = definitionDraft.body;
    for (let index = 0; index < parts.length - 1; index += 1) parent = parent?.[parts[index]];
    return { parent, key: parts.at(-1) };
  }

  function placeDefinitionNode(path, node) {
    const target = nodeAtDefinitionPath(path);
    if (!target.parent || !target.key) return;
    target.parent[target.key] = node;
    definitionDraft.selectedPath = path;
    customDefinitionError = "";
    renderDefinitionBuilder();
  }

  function functionNode(name, inputCount) {
    return name === "EML"
      ? { type: "eml", left: null, right: null }
      : { type: "call", name, arguments: Array(inputCount).fill(null) };
  }

  function definitionSource(kind, label, payload) {
    const source = document.createElement("button");
    source.type = "button";
    source.className = "definition-source";
    source.textContent = label;
    source.draggable = true;
    source.addEventListener("dragstart", (event) => {
      event.dataTransfer.setData("application/x-eml-definition-source", JSON.stringify({ kind, payload }));
      event.dataTransfer.effectAllowed = "copy";
    });
    source.classList.toggle("selected", definitionDraft.pendingSource?.kind === kind && JSON.stringify(definitionDraft.pendingSource.payload) === JSON.stringify(payload));
    source.addEventListener("click", () => {
      definitionDraft.pendingSource = { kind, payload };
      renderDefinitionBuilder();
    });
    return source;
  }

  function applyDefinitionSource(source, path = definitionDraft.selectedPath) {
    if (!path) return;
    definitionDraft.pendingSource = null;
    if (source.kind === "function") placeDefinitionNode(path, functionNode(source.payload.name, source.payload.inputCount));
    if (source.kind === "parameter") placeDefinitionNode(path, { type: "parameter", name: source.payload.name });
    if (source.kind === "value") placeDefinitionNode(path, {
      type: "constant",
      expression: source.payload.expression,
      displayText: source.payload.displayText,
      sourceValueId: source.payload.valueId || null,
    });
  }

  function bindDefinitionSlot(slot, path) {
    slot.addEventListener("dragover", (event) => { event.preventDefault(); slot.classList.add("drag-over"); });
    slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const raw = event.dataTransfer.getData("application/x-eml-definition-source");
      if (!raw) return;
      try { applyDefinitionSource(JSON.parse(raw), path); } catch { showNotice("拖入内容无效。", true); }
    });
    slot.addEventListener("click", () => {
      if (definitionDraft.pendingSource) applyDefinitionSource(definitionDraft.pendingSource, path);
      else {
        definitionDraft.selectedPath = path;
        renderDefinitionBuilder();
      }
    });
  }

  function bindDefinitionNode(element, path, canDelete) {
    element.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canDelete()) {
        showNotice("请先右键删除该函数中的全部输入。", true);
        return;
      }
      placeDefinitionNode(path, null);
      showNotice("已删除表达式节点。", false);
    });
  }

  function renderDefinitionBuilder() {
    const name = elements.customDefinitionName.value.trim() || "f";
    const parameters = draftParameters();
    const editing = Boolean(editingFunctionId);
    elements.customDefinitionName.readOnly = editing;
    elements.customDefinitionParameters.readOnly = editing;
    elements.customApply.textContent = editing ? "保存修改" : "保存定义";
    elements.customCancelEdit.hidden = !editing;
    elements.customDefinitionSignature.textContent = `${name}(${parameters.join(", ") || "…"})`;
    elements.customDefinitionExpression.replaceChildren(renderDefinitionNode(definitionDraft.body, "root"));
    elements.definitionFunctionSources.replaceChildren(definitionSource("function", "EML", { name: "EML", inputCount: 2 }));
    Store.getCustomFunctions(state).forEach((custom) => {
      const parsed = definitionForCustom(custom);
      if (parsed.ok) elements.definitionFunctionSources.appendChild(definitionSource("function", parsed.definition.name, { name: parsed.definition.name, inputCount: parsed.definition.parameterNames.length }));
    });
    elements.definitionParameterSources.replaceChildren();
    parameters.forEach((name) => elements.definitionParameterSources.appendChild(definitionSource("parameter", name, { name })));
    elements.definitionValueSources.replaceChildren();
    state.valueOrder.forEach((valueId) => {
      const value = state.values[valueId];
      if (value) {
        const presentation = presentationFor(value);
        elements.definitionValueSources.appendChild(definitionSource("value", presentation.displayText, {
          expression: presentation.expression,
          displayText: presentation.displayText,
          valueId,
        }));
      }
    });
  }

  function renderCustomCalculators() {
    elements.customFunctionApplications.replaceChildren();
    const functions = Store.getCustomFunctions(state);
    const definitions = functions
      .map(definitionForCustom)
      .filter((parsed) => parsed.ok)
      .map((parsed) => parsed.definition);
    for (const custom of functions) {
      const parsed = definitionForCustom(custom);
      if (!parsed.ok) continue;
      const definition = parsed.definition;
      const panel = document.createElement("div");
      panel.className = "custom-calculator";
      const line = document.createElement("div");
      line.className = "formula-line custom-formula-line";
      const name = document.createElement("span");
      name.className = "formula-name";
      name.textContent = `${definition.name}(`;
      line.appendChild(name);
      const slots = document.createElement("span");
      slots.className = "custom-input-slots";
      definition.parameterNames.forEach((parameterName, index) => {
      if (index > 0) {
        const comma = document.createElement("span");
        comma.className = "formula-punctuation";
        comma.textContent = ",";
          slots.appendChild(comma);
      }
      const slot = document.createElement("button");
      slot.type = "button";
      slot.className = "input-slot";
        slot.dataset.slot = `custom:${custom.id}:${index}`;
        slot.setAttribute("aria-label", `${parameterName} 输入位置`);
        renderSlot(slot, currentValue(custom.inputValueIds[index]), parameterName);
      bindSlot(slot, slot.dataset.slot);
        slots.appendChild(slot);
      });
      line.appendChild(slots);
      const punctuation = document.createElement("span");
      punctuation.className = "formula-punctuation";
      punctuation.textContent = ") =";
      line.appendChild(punctuation);
      const result = document.createElement("output");
      result.className = "result-slot";
      const inputs = custom.inputValueIds.map(currentValue);
      const evaluation = inputs.some((value) => !value)
        ? null
        : Composition.evaluate(definition, inputs.map((value) => presentationFor(value).expression), definitions);
      setMath(result, evaluation?.resultExpression, !evaluation ? "?" : !evaluation.ok ? "未定义" : evaluation.displayText);
      result.classList.toggle("error", Boolean(evaluation && (!evaluation.ok || evaluation.limitReached)));
      line.appendChild(result);
      const add = document.createElement("button");
      add.type = "button";
      add.className = "primary-button add-button";
      add.textContent = "添加";
      add.disabled = !evaluation || !evaluation.ok || evaluation.limitReached;
      add.addEventListener("click", () => addCustomEvaluation(custom, evaluation));
      line.appendChild(add);
      panel.appendChild(line);
      const direct = document.createElement("div");
      direct.className = "direct-preview";
      direct.textContent = !evaluation ? "等待全部参数。" : !evaluation.ok ? evaluation.error : evaluation.limitReached ? "化简达到安全上限，当前结果尚不能添加。" : (evaluation.expandedFormula || evaluation.directFormula);
      panel.appendChild(direct);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "delete-function-button";
      remove.textContent = "删除函数";
      remove.addEventListener("click", () => deleteCustomFunction(custom.id));
      panel.appendChild(remove);
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "delete-function-button";
      edit.textContent = "编辑函数";
      edit.addEventListener("click", () => startEditCustomFunction(custom));
      panel.appendChild(edit);
      elements.customFunctionApplications.appendChild(panel);
    }
    elements.customDefinitionStatus.textContent = customDefinitionError || (editingFunctionId
      ? "正在编辑函数表达式。函数名和变量固定；把函数、变量或数值拖入空槽即可修改。"
      : "拖入函数、变量或数值栏里的数值构造表达式；数值会作为固定表达式保存。点击来源后，再点击目标槽也可填入。");
    elements.customDefinitionStatus.classList.toggle("error", Boolean(customDefinitionError));
  }

  function makeDeleteButton(valueId) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "delete-button";
    button.textContent = "×";
    button.title = "删除该数值";
    button.setAttribute("aria-label", "删除该数值");
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const result = Store.deleteValue(state, valueId);
      if (result.status === "referenced") {
        const closure = Store.deletionClosure(state, valueId);
        if (!window.confirm(`该数值及其 ${closure.length - 1} 个依赖结果会一并删除，相关公式也会删除。是否继续？`)) return;
        const cascade = Store.deleteValueCascade(state, valueId);
        if (cascade.status !== "deleted") {
          showNotice("该数值存在受保护的依赖，无法级联删除。", true);
          return;
        }
        commitState(cascade.state);
        showNotice(`已删除 ${cascade.deletedValueIds.length} 个相互依赖的数值及其公式。`, false);
        render();
        return;
      }
      if (result.status !== "deleted") return;
      commitState(result.state);
      showNotice("已删除数值。", false);
      render();
    });
    return button;
  }

  function renderValues() {
    elements.valueList.replaceChildren();
    elements.valueCount.textContent = `${state.valueOrder.length} 个数值`;

    for (const valueId of state.valueOrder) {
      const value = state.values[valueId];
      if (!value) continue;
      const item = document.createElement("div");
      item.className = "value-item";
      item.classList.toggle("protected", Boolean(value.protected));
      item.classList.toggle("selected", state.selectedValueId === valueId);
      item.dataset.valueId = valueId;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "value-button";
      const presentation = presentationFor(value);
      setMath(button, presentation.expression, presentation.displayText);
      button.title = value.protected ? `${presentation.displayText}（初始值，不可删除）` : presentation.displayText;
      button.draggable = false;
      button.setAttribute("aria-pressed", String(state.selectedValueId === valueId));
      button.addEventListener("click", () => {
        if (suppressValueClick) {
          suppressValueClick = false;
          return;
        }
        state = Store.selectValue(state, valueId);
        persistState();
        showNotice("");
        render();
      });
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        pointerDrag = { valueId, startX: event.clientX, startY: event.clientY, active: false, pointerId: event.pointerId };
        button.setPointerCapture(event.pointerId);
      });
      button.addEventListener("pointermove", (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - pointerDrag.startX, event.clientY - pointerDrag.startY);
        if (distance > 6) pointerDrag.active = true;
        if (!pointerDrag.active) return;
        event.preventDefault();
        document.querySelectorAll(".input-slot, .definition-slot").forEach((slot) => slot.classList.remove("drag-over"));
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".input-slot, .definition-slot");
        if (target) target.classList.add("drag-over");
      });
      button.addEventListener("pointerup", (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        const drag = pointerDrag;
        pointerDrag = null;
        document.querySelectorAll(".input-slot, .definition-slot").forEach((slot) => slot.classList.remove("drag-over"));
        if (!drag.active) return;
        suppressValueClick = true;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".input-slot, .definition-slot");
        if (target?.classList.contains("definition-slot")) {
          const presentation = presentationFor(value);
          applyDefinitionSource({ kind: "value", payload: {
            expression: presentation.expression,
            displayText: presentation.displayText,
            valueId,
          } }, target.dataset.definitionPath);
        } else if (target) assignInput(target.dataset.slot, drag.valueId);
      });

      item.appendChild(button);
      if (!value.protected) item.appendChild(makeDeleteButton(valueId));
      elements.valueList.appendChild(item);
    }
  }

  function appendValueBranch(container, label, node) {
    const item = document.createElement("li");
    item.className = "tree-value";
    const heading = document.createElement("span");
    heading.className = "tree-label";
    heading.textContent = `${label}: ${node.label || "未知"}${node.initial ? "（初始值）" : ""}`;
    item.appendChild(heading);

    if (node.type === "cycle") {
      item.append("（检测到循环，已停止展开）");
    } else if (node.type === "reference") {
      item.append(node.initial ? "（初始值）" : "（已在前处展开）");
    } else if (node.type === "deferred") {
      item.append(node.reason === "node-limit" ? "（已达到节点显示上限）" : "（还有更早的来源）");
    } else if (node.derivations && node.derivations.length) {
      node.derivations.forEach((derivation) => item.appendChild(renderDerivation(derivation)));
    }
    container.appendChild(item);
  }

  function renderExpandedEml(node, expanded) {
    if (!node || node.type !== "eml") {
      const value = document.createElement("div");
      value.className = "expanded-eml-value";
      const label = document.createElement("span");
      label.textContent = node?.label || "未知";
      value.appendChild(label);
      const source = node?.source;
      if (source?.type === "cycle") {
        value.append("（检测到循环，已停止展开）");
      } else if (source?.type === "reference") {
        value.append(source.initial ? "（初始值）" : "（已在前处展开）");
      } else if (source?.type === "deferred") {
        value.append("（来源已折叠）");
      } else if (source?.initial) {
        value.append("（初始值）");
      } else if (source?.derivations?.length) {
        source.derivations.forEach((derivation) => value.appendChild(renderDerivation(derivation, true)));
      }
      return value;
    }
    const element = document.createElement("details");
    element.className = "expanded-eml-node";
    element.open = Boolean(expanded);
    const argumentText = (argument) => argument?.type === "eml"
      ? argument.result || "EML"
      : argument?.label || "未知";
    const heading = document.createElement("summary");
    heading.className = "expanded-eml-heading";
    heading.textContent = `EML(${argumentText(node.inputs?.[0])}, ${argumentText(node.inputs?.[1])}) = ${node.result || "?"}`;
    element.appendChild(heading);
    const inputs = document.createElement("div");
    inputs.className = "expanded-eml-inputs";
    ["x", "y"].forEach((name, index) => {
      const branch = document.createElement("div");
      branch.className = "expanded-eml-input";
      const label = document.createElement("span");
      label.className = "expanded-eml-label";
      label.textContent = `${name}: `;
      branch.appendChild(label);
      branch.appendChild(renderExpandedEml(node.inputs?.[index], true));
      inputs.appendChild(branch);
    });
    element.appendChild(inputs);
    return element;
  }

  function renderDerivation(derivation, expanded = true) {
    if (derivation.emlTree?.type === "eml") {
      const container = document.createElement("div");
      container.className = "tree-derivation expanded-eml-derivation";
      container.appendChild(renderExpandedEml(derivation.emlTree, expanded));
      return container;
    }
    const details = document.createElement("details");
    details.className = "tree-derivation";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = derivation.directFormula || "公式数据缺失";
    details.appendChild(summary);

    if (derivation.rewriteSteps && derivation.rewriteSteps.length) {
      const steps = document.createElement("ol");
      steps.className = "rewrite-steps";
      for (const step of derivation.rewriteSteps) {
        const item = document.createElement("li");
        item.textContent = `${step.before} → ${step.after}`;
        steps.appendChild(item);
      }
      details.appendChild(steps);
    }

    const inputs = document.createElement("ul");
    inputs.className = "tree-inputs";
    const branches = Array.isArray(derivation.inputs)
      ? derivation.inputs
      : [{ name: "x", node: derivation.x }, { name: "y", node: derivation.y }];
    branches.forEach((input) => appendValueBranch(inputs, input.name, input.node));
    details.appendChild(inputs);
    return details;
  }

  /** 把输入的来源描述为「值（第 N 步）」，让复用关系一眼可见。 */
  function describeTraceRef(ref) {
    if (!ref) return "—";
    const label = ref.displayText || "—";
    if (ref.refIndex === null || ref.refIndex === undefined) return label;
    return `${label}（第 ${ref.refIndex} 步）`;
  }

  function renderTraceStep(step) {
    const item = document.createElement("li");
    item.className = `trace-step ${step.kind}${step.isTarget ? " target" : ""}`;

    const head = document.createElement("div");
    head.className = "trace-step-head";
    const value = document.createElement("strong");
    value.className = "trace-step-value";
    value.textContent = step.displayText;
    head.appendChild(value);

    if (step.kind === "derived") {
      const formula = document.createElement("span");
      formula.className = "trace-step-formula";
      formula.textContent = step.directFormula;
      head.appendChild(formula);
    } else {
      const tag = document.createElement("span");
      tag.className = "trace-step-tag";
      tag.textContent = "初始值";
      head.appendChild(tag);
    }
    if (step.isTarget) {
      const tag = document.createElement("span");
      tag.className = "trace-step-tag target-tag";
      tag.textContent = "目标";
      head.appendChild(tag);
    }
    item.appendChild(head);

    if (step.kind === "derived") {
      const inputs = document.createElement("div");
      inputs.className = "trace-step-inputs";
      const refs = Array.isArray(step.inputs)
        ? step.inputs
        : [{ name: "x", value: step.x }, { name: "y", value: step.y }];
      inputs.textContent = refs.map((input) => `${input.name} = ${describeTraceRef(input.value)}`).join(" · ");
      item.appendChild(inputs);

      if (step.rewriteSteps && step.rewriteSteps.length) {
        const details = document.createElement("details");
        details.className = "trace-step-rewrites";
        const summary = document.createElement("summary");
        summary.textContent = `化简 ${step.rewriteSteps.length} 步`;
        details.appendChild(summary);
        const list = document.createElement("ol");
        for (const rewrite of step.rewriteSteps) {
          const row = document.createElement("li");
          row.textContent = `${rewrite.before} → ${rewrite.after}`;
          list.appendChild(row);
        }
        details.appendChild(list);
        item.appendChild(details);
      }
    }
    return item;
  }

  function renderTrace() {
    const trace = Trace.buildDerivationTrace(state, state.selectedValueId, { maxSteps: Trace.MAX_TRACE_STEPS });
    elements.derivationTrace.replaceChildren();

    if (!trace.ok && trace.reason === "missing-value") {
      elements.traceSummary.textContent = "";
      const empty = document.createElement("div");
      empty.className = "empty-formulas";
      empty.textContent = "找不到该数值的推导记录。";
      elements.derivationTrace.appendChild(empty);
      return;
    }

    elements.traceSummary.textContent = trace.truncated
      ? `已截断（前 ${trace.steps.length} 步）`
      : `共 ${trace.steps.length} 步`;

    const list = document.createElement("ol");
    list.className = "trace-steps";
    for (const step of trace.steps) list.appendChild(renderTraceStep(step));
    elements.derivationTrace.appendChild(list);

    if (trace.extraSourceCount > 0) {
      const note = document.createElement("div");
      note.className = "trace-note";
      note.textContent = `该数值另有 ${trace.extraSourceCount} 条来源公式，此处展示最早推出来的那条。`;
      elements.derivationTrace.appendChild(note);
    }
    if (trace.truncated) {
      const note = document.createElement("div");
      note.className = "trace-note warning";
      note.textContent = "推导链超过展示上限，已截断。";
      elements.derivationTrace.appendChild(note);
    }
  }

  function renderDetails() {
    const details = Store.getDetails(state, state.selectedValueId, {
      maxDepth: treeDepth,
      maxNodes: Infinity,
    });
    if (treeController.ensureValue(state.selectedValueId)) {
      treeDepth = Infinity;
      return renderDetails();
    }
    elements.detailsEmpty.hidden = Boolean(details);
    elements.detailsContent.hidden = !details;
    elements.directFormulaList.replaceChildren();
    elements.calculationTree.replaceChildren();
    if (!details) return;

    const presentation = presentationFor(details.value);
    setMath(elements.selectedValue, presentation.expression, presentation.displayText);
    if (details.directFormulas.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-formulas";
      empty.textContent = details.value.protected ? "初始值，没有上游公式。" : "没有公式来源。";
      elements.directFormulaList.appendChild(empty);
    } else {
      for (const formula of details.directFormulas) {
        const row = document.createElement("div");
        row.className = "formula-entry";
        row.textContent = formula;
        elements.directFormulaList.appendChild(row);
      }
    }

    // 推导过程：线性列出从初始值到当前选中值的建造顺序
    renderTrace();

    if (details.tree.derivations.length === 0) {
      const root = document.createElement("div");
      root.className = "empty-formulas";
      root.textContent = `${details.value.displayText}（初始值）`;
      elements.calculationTree.appendChild(root);
    } else {
      details.tree.derivations.forEach((derivation) => {
        elements.calculationTree.appendChild(renderDerivation(derivation));
      });
    }
    requestAnimationFrame(treeController.apply);
  }

  function render() {
    renderCalculator();
    renderCustomCalculators();
    renderDefinitionBuilder();
    renderValues();
    renderDetails();
  }

  function assignInput(slotName, valueId) {
    if (!state.values[valueId]) {
      showNotice("拖入的数值无效。", true);
      return;
    }
    if (slotName.startsWith("custom:")) {
      const parts = slotName.split(":");
      const inputIndex = Number(parts.pop());
      commitState(Store.setCustomInput(state, parts.slice(1).join(":"), inputIndex, valueId));
    } else {
      commitState(Store.setInput(state, slotName, valueId));
    }
    showNotice("");
    render();
  }

  function bindSlot(element, slotName) {
    element.addEventListener("dragover", (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      element.classList.add("drag-over");
    });
    element.addEventListener("dragleave", () => element.classList.remove("drag-over"));
    element.addEventListener("drop", (event) => {
      event.preventDefault();
      element.classList.remove("drag-over");
      const valueId = event.dataTransfer.getData("application/x-eml-value") || event.dataTransfer.getData("text/plain");
      assignInput(slotName, valueId);
    });
    element.addEventListener("click", () => {
      if (!state.selectedValueId) {
        showNotice("请先选择数值栏中的一个数值。", true);
        return;
      }
      assignInput(slotName, state.selectedValueId);
    });
  }

  bindSlot(elements.slotX, "x");
  bindSlot(elements.slotY, "y");

  elements.customApply.addEventListener("click", () => {
    const parsed = Composition.createDefinition(
      elements.customDefinitionName.value.trim(),
      draftParameters(),
      definitionDraft.body
    );
    if (!parsed.ok) {
      customDefinitionError = parsed.error;
      render();
      return;
    }
    const existingDefinitions = Store.getCustomFunctions(state)
      .map(definitionForCustom)
      .filter((existing) => existing.ok)
      .map((existing) => existing.definition);
    const callValidation = Composition.validateDefinitionCalls(parsed.definition, existingDefinitions);
    if (!callValidation.ok) {
      customDefinitionError = callValidation.error;
      render();
      return;
    }
    const definitionAst = { parameterNames: parsed.definition.parameterNames, body: parsed.definition.body };
    const result = editingFunctionId
      ? Store.updateCustomFunction(state, editingFunctionId, parsed.definition.displayText, definitionAst)
      : Store.addCustomFunction(state, parsed.definition.name, parsed.definition.displayText, parsed.definition.parameterNames.length, definitionAst);
    if (!["added", "updated"].includes(result.status)) {
      customDefinitionError = result.status === "duplicate-name" ? "同名函数已存在，请使用其他函数名。" : "函数定义无效。";
      render();
      return;
    }
    commitState(result.state);
    customDefinitionError = "";
    elements.customDefinitionName.value = "";
    elements.customDefinitionParameters.value = "";
    definitionDraft = { body: null, selectedPath: "root", pendingSource: null };
    editingFunctionId = null;
    showNotice(result.status === "updated" ? `已更新函数 ${parsed.definition.name}。` : `已添加函数 ${parsed.definition.name}。`, false);
    render();
  });

  elements.add.addEventListener("click", () => {
    if (!preview || !preview.ok || !state.inputXId || !state.inputYId) return;
    const result = Store.addEvaluation(state, preview, state.inputXId, state.inputYId);
    commitState(result.state);
    const messages = {
      "added-value": "已添加新数值和公式来源。",
      "added-formula": "数值已存在，已添加新的公式来源。",
      "duplicate-formula": "该数值和公式已经存在。",
      "cyclic-formula": "结果已存在，循环计算来源未保存；保留首次无环来源。",
    };
    showNotice(messages[result.status] || "无法添加当前结果。", result.status === "invalid");
    render();
  });

  function addCustomEvaluation(custom, evaluation) {
    if (!evaluation || !evaluation.ok || evaluation.limitReached || custom.inputValueIds.some((id) => !id)) return;
    const result = Store.addCompositionEvaluation(state, evaluation, custom.inputValueIds);
    commitState(result.state);
    const messages = {
      "added-value": "已添加组合函数结果和公式来源。",
      "added-formula": "数值已存在，已添加新的组合函数来源。",
      "duplicate-formula": "该组合函数公式已经存在。",
      "cyclic-formula": "结果已存在，循环计算来源未保存；保留首次无环来源。",
    };
    showNotice(messages[result.status] || "无法添加当前组合函数结果。", result.status === "invalid");
    render();
  }

  function deleteCustomFunction(functionId) {
    const result = Store.deleteCustomFunction(state, functionId);
    if (result.status !== "deleted") return;
    commitState(result.state);
    showNotice("已删除函数定义；已保存的数值和公式来源保持不变。", false);
    render();
  }

  function startEditCustomFunction(custom) {
    const parsed = definitionForCustom(custom);
    if (!parsed.ok) {
      showNotice("该函数定义无法载入编辑器。", true);
      return;
    }
    editingFunctionId = custom.id;
    elements.customDefinitionName.value = parsed.definition.name;
    elements.customDefinitionParameters.value = parsed.definition.parameterNames.join(", ");
    definitionDraft = { body: JSON.parse(JSON.stringify(parsed.definition.body)), selectedPath: "root", pendingSource: null };
    customDefinitionError = "";
    showNotice(`正在编辑函数 ${parsed.definition.name}。`, false);
    render();
  }

  elements.save.addEventListener("click", () => {
    const blob = new Blob([Persistence.serialize(state)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    elements.save.href = url;
    elements.save.download = "eml-workbench-v2.json";
    setTimeout(() => {
      URL.revokeObjectURL(url);
      elements.save.href = "#";
    }, 1000);
    persistState();
    showNotice("列表已保存到本地文件。", false);
  });

  elements.import.addEventListener("click", () => elements.importFile.click());
  elements.importFile.addEventListener("change", () => {
    const file = elements.importFile.files && elements.importFile.files[0];
    elements.importFile.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const restored = Persistence.deserialize(String(reader.result || ""));
      if (!restored.ok) {
        showNotice(`导入失败：${restored.error}。现有列表未改变。`, true);
        return;
      }
      commitState(restored.state);
      showNotice("导入成功。", false);
      render();
    };
    reader.onerror = () => showNotice("导入失败：无法读取文件。现有列表未改变。", true);
    reader.readAsText(file, "utf-8");
  });

  elements.clear.addEventListener("click", () => {
    if (!window.confirm("清空所有非初始数值和公式？初始值 1 会保留。")) return;
    commitState(Store.clearNonInitial());
    showNotice("已清空，初始值 1 已保留。", false);
    render();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editingText = target instanceof HTMLElement && (
      target.matches("input, textarea") || target.isContentEditable
    );
    if (!editingText && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoLastChange();
    }
  });

  [elements.customDefinitionName, elements.customDefinitionParameters].forEach((input) => {
    input.addEventListener("input", () => {
      customDefinitionError = "";
      renderDefinitionBuilder();
    });
  });

  elements.customCancelEdit.addEventListener("click", () => {
    editingFunctionId = null;
    definitionDraft = { body: null, selectedPath: "root", pendingSource: null };
    elements.customDefinitionName.value = "";
    elements.customDefinitionParameters.value = "";
    customDefinitionError = "";
    showNotice("已取消编辑函数。", false);
    render();
  });

  recomputePreview();
  render();
  root.EMLApp = {
    getState: () => JSON.parse(JSON.stringify(state)),
    getPreview: () => preview ? JSON.parse(JSON.stringify(preview)) : null,
    getTreeView: treeController.getView,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
