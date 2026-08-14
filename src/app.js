(function (root) {
  "use strict";

  const Expr = root.EMLExpression;
  const Evaluator = root.EMLEvaluator;
  const Store = root.EMLValueStore;
  const Persistence = root.EMLPersistence;

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
    calculationTree: document.getElementById("calculationTree"),
  };

  let state = restoreState();
  let preview = null;
  let pointerDrag = null;
  let suppressValueClick = false;

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
    elements.result.classList.toggle("error", Boolean(preview && !preview.ok));

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

    elements.result.textContent = preview.displayText;
    elements.directPreview.textContent = preview.directFormula;
    elements.add.disabled = false;
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
        showNotice("该数值已被其他公式引用，不能删除。", true);
        return;
      }
      if (result.status !== "deleted") return;
      state = result.state;
      recomputePreview();
      persistState();
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
    appendValueBranch(inputs, "x", derivation.x);
    appendValueBranch(inputs, "y", derivation.y);
    details.appendChild(inputs);
    return details;
  }

  function renderDetails() {
    const details = Store.getDetails(state, state.selectedValueId);
    elements.detailsEmpty.hidden = Boolean(details);
    elements.detailsContent.hidden = !details;
    elements.directFormulaList.replaceChildren();
    elements.calculationTree.replaceChildren();
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
  }

  function render() {
    renderCalculator();
    renderValues();
    renderDetails();
  }

  function assignInput(slotName, valueId) {
    if (!state.values[valueId]) {
      showNotice("拖入的数值无效。", true);
      return;
    }
    state = Store.setInput(state, slotName, valueId);
    recomputePreview();
    persistState();
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

  elements.add.addEventListener("click", () => {
    if (!preview || !preview.ok || !state.inputXId || !state.inputYId) return;
    const result = Store.addEvaluation(state, preview, state.inputXId, state.inputYId);
    state = result.state;
    persistState();
    const messages = {
      "added-value": "已添加新数值和公式来源。",
      "added-formula": "数值已存在，已添加新的公式来源。",
      "duplicate-formula": "该数值和公式已经存在。",
    };
    showNotice(messages[result.status] || "无法添加当前结果。", result.status === "invalid");
    render();
  });

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
      state = restored.state;
      recomputePreview();
      persistState();
      showNotice("导入成功。", false);
      render();
    };
    reader.onerror = () => showNotice("导入失败：无法读取文件。现有列表未改变。", true);
    reader.readAsText(file, "utf-8");
  });

  elements.clear.addEventListener("click", () => {
    if (!window.confirm("清空所有非初始数值和公式？初始值 1 会保留。")) return;
    state = Store.clearNonInitial();
    preview = null;
    persistState();
    showNotice("已清空，初始值 1 已保留。", false);
    render();
  });

  recomputePreview();
  render();
  root.EMLApp = {
    getState: () => JSON.parse(JSON.stringify(state)),
    getPreview: () => preview ? JSON.parse(JSON.stringify(preview)) : null,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
