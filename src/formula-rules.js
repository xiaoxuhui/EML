(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports ? require("./expression.js") : root.EMLExpression;
  const properties = typeof module === "object" && module.exports
    ? require("./expression-properties.js")
    : root.EMLExpressionProperties;
  const transcendental = typeof module === "object" && module.exports
    ? require("./rules-transcendental.js")
    : root.EMLTranscendentalRules;
  const algebra = typeof module === "object" && module.exports
    ? require("./rules-algebra.js")
    : root.EMLAlgebraRules;
  const api = factory(expression, properties, transcendental, algebra);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLFormulaRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, Properties, Transcendental, Algebra) {
  "use strict";

  const { TYPES, neg, add, sub, mul, div, pow, canonicalKey, isConstant, render } = Expr;
  const MAX_SIMPLIFY_ITERATIONS = 50;
  const registries = [Transcendental, Algebra];
  const rules = registries.flatMap((registry) => registry.rules);
  const ruleIds = new Set();

  for (const rule of rules) {
    if (!rule || !rule.id || ruleIds.has(rule.id)) throw new Error(`公式规则编号重复或无效：${rule?.id || "未知"}`);
    ruleIds.add(rule.id);
  }

  function rewriteNode(expression) {
    for (const registry of registries) {
      const rewritten = registry.rewrite(expression);
      if (!rewritten) continue;
      if (!ruleIds.has(rewritten.ruleId)) throw new Error(`公式规则未注册：${rewritten.ruleId}`);
      return rewritten;
    }
    return null;
  }

  function rewriteChildren(expression, steps) {
    const simplifyChild = (child) => simplify(child, steps).expression;
    switch (expression.type) {
      case TYPES.NEG:
        return neg(simplifyChild(expression.child));
      case TYPES.ADD:
        return add(simplifyChild(expression.left), simplifyChild(expression.right));
      case TYPES.SUB:
        return sub(simplifyChild(expression.left), simplifyChild(expression.right));
      case TYPES.MUL:
        return mul(simplifyChild(expression.left), simplifyChild(expression.right));
      case TYPES.DIV:
        return div(simplifyChild(expression.numerator), simplifyChild(expression.denominator));
      case TYPES.POW:
        return pow(simplifyChild(expression.base), simplifyChild(expression.exponent));
      case TYPES.LN:
        if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) return expression;
        return Expr.ln(simplifyChild(expression.argument));
      case TYPES.SQRT:
        return Expr.sqrt(simplifyChild(expression.argument));
      case TYPES.SIN:
        return Expr.sin(simplifyChild(expression.argument));
      default:
        return expression;
    }
  }

  function simplify(expression, sharedSteps) {
    const steps = sharedSteps || [];
    let current = expression;
    let iterations = 0;

    while (iterations < MAX_SIMPLIFY_ITERATIONS) {
      iterations += 1;
      const withChildren = rewriteChildren(current, steps);
      const rewritten = rewriteNode(withChildren);
      const next = rewritten ? rewritten.expression : withChildren;

      if (rewritten) {
        steps.push({ ruleId: rewritten.ruleId, before: render(withChildren), after: render(next) });
      }
      if (canonicalKey(next) === canonicalKey(current)) return { expression: next, steps };
      current = next;
    }
    return { expression: current, steps, limitReached: true };
  }

  return {
    rules,
    registries: registries.map((registry) => ({ name: registry.name, ruleIds: registry.rules.map((rule) => rule.id) })),
    MAX_SIMPLIFY_ITERATIONS,
    simplify,
    isIpi: Transcendental.isIpi,
    isNegativeIpi: Transcendental.isNegativeIpi,
    isHalfIpi: Transcendental.isHalfIpi,
    isNegativeHalfIpi: Transcendental.isNegativeHalfIpi,
    eulerSineArgument: Transcendental.eulerSineArgument,
    isProvablyReal: Properties.isProvablyReal,
    isProvablyPositive: Properties.isProvablyPositive,
    isProvablyNonZero: Properties.isProvablyNonZero,
    isProvablyPureImaginaryNonZero: Properties.isProvablyPureImaginaryNonZero,
  };
});
