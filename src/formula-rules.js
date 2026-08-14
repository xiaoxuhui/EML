(function (root, factory) {
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const api = factory(expression);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLFormulaRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr) {
  "use strict";

  const {
    TYPES, ONE, ZERO, E, PI, I,
    integer, neg, add, sub, mul, pow,
    canonicalKey, isSame, isInteger, isConstant, render,
  } = Expr;

  const rules = [
    { id: "EXP_ZERO", label: "e^0 = 1" },
    { id: "EXP_ONE", label: "e^1 = e" },
    { id: "EULER_IDENTITY", label: "e^(iπ) = -1" },
    { id: "LN_ONE", label: "ln(1) = 0" },
    { id: "LN_E", label: "ln(e) = 1" },
    { id: "LN_EXP_REAL", label: "ln(e^a) = a（a 为实数）" },
    { id: "LN_MINUS_ONE", label: "ln(-1) = iπ（主值）" },
    { id: "NEG_INTEGER", label: "负整数化简" },
    { id: "ADD_ZERO", label: "a + 0 = a" },
    { id: "SUB_ZERO", label: "a - 0 = a" },
    { id: "SUB_SELF", label: "a - a = 0" },
    { id: "MUL_ONE", label: "a × 1 = a" },
    { id: "MUL_ZERO", label: "a × 0 = 0" },
  ];

  function isIpi(expression) {
    if (expression.type !== TYPES.MUL) return false;
    return (
      (isConstant(expression.left, "i") && isConstant(expression.right, "pi")) ||
      (isConstant(expression.left, "pi") && isConstant(expression.right, "i"))
    );
  }

  function isProvablyReal(expression) {
    switch (expression.type) {
      case TYPES.INTEGER:
        return true;
      case TYPES.CONSTANT:
        return expression.name === "e" || expression.name === "pi";
      case TYPES.NEG:
        return isProvablyReal(expression.child);
      case TYPES.ADD:
      case TYPES.SUB:
      case TYPES.MUL:
        return isProvablyReal(expression.left) && isProvablyReal(expression.right);
      case TYPES.POW:
        return isConstant(expression.base, "e") && isProvablyReal(expression.exponent);
      default:
        return false;
    }
  }

  function rewriteNode(expression) {
    if (expression.type === TYPES.POW && isConstant(expression.base, "e")) {
      if (isInteger(expression.exponent, 0)) return { expression: ONE, ruleId: "EXP_ZERO" };
      if (isInteger(expression.exponent, 1)) return { expression: E, ruleId: "EXP_ONE" };
      if (isIpi(expression.exponent)) return { expression: integer(-1), ruleId: "EULER_IDENTITY" };
    }

    if (expression.type === TYPES.LN) {
      if (isInteger(expression.argument, 1)) return { expression: ZERO, ruleId: "LN_ONE" };
      if (isConstant(expression.argument, "e")) return { expression: ONE, ruleId: "LN_E" };
      if (
        expression.argument.type === TYPES.POW &&
        isConstant(expression.argument.base, "e") &&
        isProvablyReal(expression.argument.exponent)
      ) {
        return { expression: expression.argument.exponent, ruleId: "LN_EXP_REAL" };
      }
      if (isInteger(expression.argument, -1)) return { expression: mul(I, PI), ruleId: "LN_MINUS_ONE" };
    }

    if (expression.type === TYPES.NEG && expression.child.type === TYPES.INTEGER) {
      return { expression: integer(-expression.child.value), ruleId: "NEG_INTEGER" };
    }

    if (expression.type === TYPES.ADD) {
      if (isInteger(expression.left, 0)) return { expression: expression.right, ruleId: "ADD_ZERO" };
      if (isInteger(expression.right, 0)) return { expression: expression.left, ruleId: "ADD_ZERO" };
    }

    if (expression.type === TYPES.SUB) {
      if (isInteger(expression.right, 0)) return { expression: expression.left, ruleId: "SUB_ZERO" };
      if (isSame(expression.left, expression.right)) return { expression: ZERO, ruleId: "SUB_SELF" };
    }

    if (expression.type === TYPES.MUL) {
      if (isInteger(expression.left, 0) || isInteger(expression.right, 0)) {
        return { expression: ZERO, ruleId: "MUL_ZERO" };
      }
      if (isInteger(expression.left, 1)) return { expression: expression.right, ruleId: "MUL_ONE" };
      if (isInteger(expression.right, 1)) return { expression: expression.left, ruleId: "MUL_ONE" };
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
      case TYPES.POW:
        return pow(simplifyChild(expression.base), simplifyChild(expression.exponent));
      case TYPES.LN:
        return Expr.ln(simplifyChild(expression.argument));
      case TYPES.SQRT:
        return Expr.sqrt(simplifyChild(expression.argument));
      default:
        return expression;
    }
  }

  function simplify(expression, sharedSteps) {
    const steps = sharedSteps || [];
    let current = expression;
    let iterations = 0;

    while (iterations < 50) {
      iterations += 1;
      const withChildren = rewriteChildren(current, steps);
      const rewritten = rewriteNode(withChildren);
      const next = rewritten ? rewritten.expression : withChildren;

      if (rewritten) {
        steps.push({
          ruleId: rewritten.ruleId,
          before: render(withChildren),
          after: render(next),
        });
      }

      if (canonicalKey(next) === canonicalKey(current)) {
        return { expression: next, steps };
      }
      current = next;
    }

    return { expression: current, steps, limitReached: true };
  }

  return { rules, simplify, isIpi, isProvablyReal };
});
