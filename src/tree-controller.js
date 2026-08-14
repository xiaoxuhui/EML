(function (root, factory) {
  "use strict";
  const viewportModel = typeof module === "object" && module.exports
    ? require("./tree-viewport.js")
    : root.EMLTreeViewport;
  const api = factory(viewportModel);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLTreeController = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (ViewportModel) {
  "use strict";

  function create(options) {
    const { viewport, canvas, zoomOut, zoomIn, zoomLevel, resetButton, expandMore, onExpandMore } = options;
    let view = { ...ViewportModel.reset(), valueId: null };
    let pointer = null;

    function dimensions() {
      return {
        viewportWidth: viewport.clientWidth,
        viewportHeight: viewport.clientHeight,
        contentWidth: canvas.scrollWidth,
        contentHeight: canvas.scrollHeight,
      };
    }

    function apply() {
      const next = ViewportModel.clampPosition(view, dimensions());
      view = { ...next, valueId: view.valueId };
      canvas.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      zoomLevel.textContent = `${Math.round(view.scale * 100)}%`;
      zoomOut.disabled = view.scale <= ViewportModel.MIN_SCALE;
      zoomIn.disabled = view.scale >= ViewportModel.MAX_SCALE;
    }

    function zoom(delta) {
      view = {
        ...ViewportModel.zoomAt(
          view,
          view.scale + delta,
          { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
          dimensions()
        ),
        valueId: view.valueId,
      };
      apply();
    }

    function pan(deltaX, deltaY) {
      view = { ...ViewportModel.pan(view, deltaX, deltaY, dimensions()), valueId: view.valueId };
      apply();
    }

    function reset(valueId = view.valueId) {
      view = { ...ViewportModel.reset(), valueId };
      apply();
    }

    zoomOut.addEventListener("click", () => zoom(-ViewportModel.SCALE_STEP));
    zoomIn.addEventListener("click", () => zoom(ViewportModel.SCALE_STEP));
    resetButton.addEventListener("click", () => reset());
    expandMore.addEventListener("click", onExpandMore);

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("summary, button, a, input")) return;
      pointer = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
      viewport.setPointerCapture(event.pointerId);
      viewport.focus();
    });
    viewport.addEventListener("pointermove", (event) => {
      if (!pointer || pointer.pointerId !== event.pointerId) return;
      event.preventDefault();
      pan(event.clientX - pointer.lastX, event.clientY - pointer.lastY);
      pointer.lastX = event.clientX;
      pointer.lastY = event.clientY;
    });
    const stopPointer = (event) => {
      if (pointer && pointer.pointerId === event.pointerId) pointer = null;
    };
    viewport.addEventListener("pointerup", stopPointer);
    viewport.addEventListener("pointercancel", stopPointer);
    viewport.addEventListener("wheel", (event) => {
      if (event.ctrlKey || event.metaKey) return;
      const deltaY = ViewportModel.wheelDeltaToPixels(event.deltaY, event.deltaMode, viewport.clientHeight);
      const previousY = view.y;
      pan(0, -deltaY);
      if (view.y !== previousY) event.preventDefault();
    }, { passive: false });
    viewport.addEventListener("keydown", (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const movements = {
        w: [0, ViewportModel.PAN_STEP],
        a: [ViewportModel.PAN_STEP, 0],
        s: [0, -ViewportModel.PAN_STEP],
        d: [-ViewportModel.PAN_STEP, 0],
      };
      const movement = movements[event.key.toLowerCase()];
      if (!movement) return;
      event.preventDefault();
      pan(...movement);
    });
    window.addEventListener("resize", apply);

    return {
      apply,
      ensureValue(valueId) {
        if (view.valueId === valueId) return false;
        view = { ...ViewportModel.reset(), valueId };
        return true;
      },
      setExpandable(visible, disabled) {
        expandMore.hidden = !visible;
        expandMore.disabled = Boolean(disabled);
      },
      getView: () => ({ scale: view.scale, x: view.x, y: view.y }),
    };
  }

  return { create };
});
