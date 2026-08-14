(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLTreeViewport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MIN_SCALE = 0.4;
  const MAX_SCALE = 1.4;
  const SCALE_STEP = 0.1;
  const PAN_STEP = 48;

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function normalizeScale(scale) {
    return Math.round(clamp(scale, MIN_SCALE, MAX_SCALE) * 10) / 10;
  }

  function clampPosition(view, dimensions) {
    const width = Math.max(0, dimensions.contentWidth * view.scale);
    const height = Math.max(0, dimensions.contentHeight * view.scale);
    const minX = Math.min(0, dimensions.viewportWidth - width);
    const minY = Math.min(0, dimensions.viewportHeight - height);
    return {
      scale: normalizeScale(view.scale),
      x: clamp(view.x, minX, 0),
      y: clamp(view.y, minY, 0),
    };
  }

  function zoomAt(view, nextScale, origin, dimensions) {
    const scale = normalizeScale(nextScale);
    const ratio = scale / view.scale;
    return clampPosition({
      scale,
      x: origin.x - (origin.x - view.x) * ratio,
      y: origin.y - (origin.y - view.y) * ratio,
    }, dimensions);
  }

  function pan(view, deltaX, deltaY, dimensions) {
    return clampPosition({ ...view, x: view.x + deltaX, y: view.y + deltaY }, dimensions);
  }

  function wheelDeltaToPixels(delta, deltaMode, pageSize) {
    if (deltaMode === 1) return delta * 16;
    if (deltaMode === 2) return delta * pageSize;
    return delta;
  }

  function reset() {
    return { scale: 1, x: 0, y: 0 };
  }

  return {
    MIN_SCALE,
    MAX_SCALE,
    SCALE_STEP,
    PAN_STEP,
    normalizeScale,
    clampPosition,
    zoomAt,
    pan,
    wheelDeltaToPixels,
    reset,
  };
});
