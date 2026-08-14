(function (root, factory) {
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const formulaRules = typeof module === "object" && module.exports
    ? require("./formula-rules.js")
    : root.EMLFormulaRules;
  const api = factory(expression, formulaRules);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLEvaluator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, FormulaRules) {
  "use strict";

  function evaluateEML(xExpression, yExpression) {
    const yApproximation = Expr.approximate(yExpression);
    if (yApproximation && Math.abs(yApproximation.re) < 1e-12 && Math.abs(yApproximation.im) < 1e-12) {
      return { ok: false, error: "ln(0) 未定义" };
    }

    const rawExpression = Expr.sub(Expr.pow(Expr.E, xExpression), Expr.ln(yExpression));
    const simplified = FormulaRules.simplify(rawExpression);
    return {
      ok: true,
      xExpression,
      yExpression,
      rawExpression,
      resultExpression: simplified.expression,
      canonicalKey: Expr.canonicalKey(simplified.expression),
      displayText: Expr.render(simplified.expression),
      directFormula: `EML(${Expr.render(xExpression)}, ${Expr.render(yExpression)}) = ${Expr.render(simplified.expression)}`,
      rewriteSteps: simplified.steps,
      limitReached: Boolean(simplified.limitReached),
      approximation: Expr.approximate(simplified.expression),
    };
  }

  return { evaluateEML };
});
