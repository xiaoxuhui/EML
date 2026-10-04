(function (root) {
  "use strict";

  const Expr = root.EMLExpression;
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
    treeZoomOut: document.getElementById("treeZoomOut"),
    treeZoomIn: document.getElementById("treeZoomIn"),
    treeZoomLevel: document.getElementById("treeZoomLevel"),
    treeResetView: document.getElementById("treeResetView"),
    treeExpandMore: document.getElementById("treeExpandMore"),
    customFunctionApplications: document.getElementById("customFunctionApplications"),
    customDefinition: document.getElementById("customDefinition"),
    customApply: document.getElementById("customApplyButton"),
    customDefinitionStatus: document.getElementById("customDefinitionStatus"),
  };

  let state = restoreState();
  let preview = null;
  const undoHistory = [];
  const MAX_UNDO_HISTORY = 100;
  let customDefinitionError = "";
  let pointerDrag = null;
  let suppressValueClick = false;
  let treeDepth = Store.DEFAULT_TREE_DEPTH;
  const treeController = TreeController.create({
    viewport: elements.calculationTreeViewport,
    canvas: elements.calculationTree,
    zoomOut: elements.treeZoomOut,
    zoomIn: elements.treeZoomIn,
    zoomLevel: elements.treeZoomLevel,
    resetButton: elements.treeResetView,
    expandMore: elements.treeExpandMore,
    onExpandMore: () => {
      treeDepth = Math.min(Store.MAX_TREE_DEPTH, treeDepth + Store.DEFAULT_TREE_DEPTH);
      renderDetails();
    },
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

  function recomputePreview() {
    const x = currentValue(state.inputXId);
    const y = currentValue(state.inputYId);
    preview = x && y ? Evaluator.evaluateEML(x.canonicalExpression, y.canonicalExpression) : null;
  }

  function renderSlot(element, value, placeholder) {
    element.textContent = value ? value.displayText : placeholder;
    element.classList.toggle("filled", Boolean(value));
    element.title = value ? value.displayText : `${placeholder} 输入位置`;
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
      elements.result.textContent = preview.displayText;
      elements.directPreview.textContent = "化简达到安全上限，当前结果尚不能添加。";
      elements.add.disabled = true;
      return;
    }

    elements.result.textContent = preview.displayText;
    elements.directPreview.textContent = preview.directFormula;
    elements.add.disabled = false;
  }

  function renderCustomCalculators() {
    elements.customFunctionApplications.replaceChildren();
    const functions = Store.getCustomFunctions(state);
    const definitions = functions
      .map((custom) => Composition.parseDefinition(custom.definitionText))
      .filter((parsed) => parsed.ok)
      .map((parsed) => parsed.definition);
    for (const custom of functions) {
      const parsed = Composition.parseDefinition(custom.definitionText);
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
      const evaluation = inputs.some((value) => !value) ? null : Composition.evaluate(definition, inputs.map((value) => value.canonicalExpression), definitions);
      result.textContent = !evaluation ? "?" : !evaluation.ok ? "未定义" : evaluation.displayText;
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
      elements.customFunctionApplications.appendChild(panel);
    }
    elements.customDefinitionStatus.textContent = customDefinitionError || "支持多个函数；只允许参数名和 EML(...) 的嵌套组合。";
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
      button.textContent = value.displayText;
      button.title = value.protected ? `${value.displayText}（初始值，不可删除）` : value.displayText;
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
        document.querySelectorAll(".input-slot").forEach((slot) => slot.classList.remove("drag-over"));
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".input-slot");
        if (target) target.classList.add("drag-over");
      });
      button.addEventListener("pointerup", (event) => {
        if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
        const drag = pointerDrag;
        pointerDrag = null;
        document.querySelectorAll(".input-slot").forEach((slot) => slot.classList.remove("drag-over"));
        if (!drag.active) return;
        suppressValueClick = true;
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".input-slot");
        if (target) assignInput(target.dataset.slot, drag.valueId);
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
    } else if (node.type === "deferred") {
      item.append(node.reason === "node-limit" ? "（已达到节点显示上限）" : "（还有更早的来源）");
    } else if (node.derivations && node.derivations.length) {
      node.derivations.forEach((derivation) => item.appendChild(renderDerivation(derivation)));
    }
    container.appendChild(item);
  }

  function renderDerivation(derivation) {
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
      maxNodes: Store.MAX_TREE_NODES,
    });
    if (treeController.ensureValue(state.selectedValueId)) {
      treeDepth = Store.DEFAULT_TREE_DEPTH;
      return renderDetails();
    }
    elements.detailsEmpty.hidden = Boolean(details);
    elements.detailsContent.hidden = !details;
    elements.directFormulaList.replaceChildren();
    elements.calculationTree.replaceChildren();
    treeController.setExpandable(false, false);
    if (!details) return;

    elements.selectedValue.textContent = details.value.displayText;
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
    const hasDeferredBranches = Store.treeHasDeferredBranches(details.tree);
    treeController.setExpandable(hasDeferredBranches, treeDepth >= Store.MAX_TREE_DEPTH);
    requestAnimationFrame(treeController.apply);
  }

  function render() {
    renderCalculator();
    renderCustomCalculators();
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
    const parsed = Composition.parseDefinition(elements.customDefinition.value);
    if (!parsed.ok) {
      customDefinitionError = parsed.error;
      render();
      return;
    }
    const existingDefinitions = Store.getCustomFunctions(state)
      .map((custom) => Composition.parseDefinition(custom.definitionText))
      .filter((existing) => existing.ok)
      .map((existing) => existing.definition);
    const callValidation = Composition.validateDefinitionCalls(parsed.definition, existingDefinitions);
    if (!callValidation.ok) {
      customDefinitionError = callValidation.error;
      render();
      return;
    }
    const result = Store.addCustomFunction(state, parsed.definition.name, parsed.definition.displayText, parsed.definition.parameterNames.length);
    if (result.status !== "added") {
      customDefinitionError = result.status === "duplicate-name" ? "同名函数已存在，请使用其他函数名。" : "函数定义无效。";
      render();
      return;
    }
    commitState(result.state);
    customDefinitionError = "";
    elements.customDefinition.value = "";
    showNotice(`已添加函数 ${parsed.definition.name}。`, false);
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

  recomputePreview();
  render();
  root.EMLApp = {
    getState: () => JSON.parse(JSON.stringify(state)),
    getPreview: () => preview ? JSON.parse(JSON.stringify(preview)) : null,
    getTreeView: treeController.getView,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
