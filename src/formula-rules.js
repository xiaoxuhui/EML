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
    { id: "EXP_LN_POSITIVE", label: "e^(ln(a)) = a（a > 0）" },
    { id: "EULER_IDENTITY", label: "e^(iπ) = -1" },
    { id: "EULER_NEG_IDENTITY", label: "e^(-iπ) = -1" },
    { id: "LN_ONE", label: "ln(1) = 0" },
    { id: "LN_E", label: "ln(e) = 1" },
    { id: "LN_EXP_FORMAL", label: "ln(e^a) = a（形式化反函数）" },
    { id: "LN_MINUS_ONE", label: "ln(-1) = iπ（主值）" },
    { id: "NEG_INTEGER", label: "负整数化简" },
    { id: "NEG_DOUBLE", label: "-(-a) = a" },
    { id: "INTEGER_ADD", label: "整数加法" },
    { id: "INTEGER_SUB", label: "整数减法" },
    { id: "INTEGER_MUL", label: "整数乘法" },
    { id: "ADD_ZERO", label: "a + 0 = a" },
    { id: "ADD_INVERSE", label: "a + (-a) = 0" },
    { id: "ADD_SUB_CANCEL", label: "(a - b) + b = a" },
    { id: "SUB_ZERO", label: "a - 0 = a" },
    { id: "SUB_SELF", label: "a - a = 0" },
    { id: "SUB_NESTED_LEFT", label: "a - (a - b) = b" },
    { id: "SUB_NESTED_RIGHT", label: "(a - b) - a = -b" },
    { id: "SUB_NEGATIVE", label: "a - (-b) = a + b" },
    { id: "SUB_ADDED_LEFT", label: "a - (a + b) = -b" },
    { id: "SUB_ADDED_CANCEL", label: "(a + b) - a = b" },
    { id: "MUL_ONE", label: "a × 1 = a" },
    { id: "MUL_ZERO", label: "a × 0 = 0" },
    { id: "MUL_NEG_ONE", label: "a × (-1) = -a" },
    { id: "I_SQUARED", label: "i × i = -1" },
  ];

  function isIpi(expression) {
    if (expression.type !== TYPES.MUL) return false;
    return (
      (isConstant(expression.left, "i") && isConstant(expression.right, "pi")) ||
      (isConstant(expression.left, "pi") && isConstant(expression.right, "i"))
    );
  }

  function isNegativeIpi(expression) {
    return expression.type === TYPES.NEG && isIpi(expression.child);
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
      case TYPES.LN:
        return isProvablyPositive(expression.argument);
      default:
        return false;
    }
  }

  function realBounds(expression) {
    switch (expression.type) {
      case TYPES.INTEGER:
        return { lower: expression.value, upper: expression.value };
      case TYPES.CONSTANT:
        if (expression.name === "e") return { lower: 2, upper: 3 };
        if (expression.name === "pi") return { lower: 3, upper: 4 };
        return null;
      case TYPES.NEG: {
        const child = realBounds(expression.child);
        return child ? { lower: -child.upper, upper: -child.lower } : null;
      }
      case TYPES.ADD:
      case TYPES.SUB: {
        const left = realBounds(expression.left);
        const right = realBounds(expression.right);
        if (!left || !right) return null;
        return expression.type === TYPES.ADD
          ? { lower: left.lower + right.lower, upper: left.upper + right.upper }
          : { lower: left.lower - right.upper, upper: left.upper - right.lower };
      }
      case TYPES.MUL: {
        const left = realBounds(expression.left);
        const right = realBounds(expression.right);
        if (!left || !right) return null;
        const products = [
          left.lower * right.lower,
          left.lower * right.upper,
          left.upper * right.lower,
          left.upper * right.upper,
        ];
        return { lower: Math.min(...products), upper: Math.max(...products) };
      }
      default:
        return null;
    }
  }

  function isProvablyPositive(expression) {
    if (
      expression.type === TYPES.POW &&
      isConstant(expression.base, "e") &&
      isProvablyReal(expression.exponent)
    ) {
      return true;
    }
    const bounds = realBounds(expression);
    return Boolean(bounds && bounds.lower > 0);
  }

  function rewriteNode(expression) {
    if (expression.type === TYPES.POW && isConstant(expression.base, "e")) {
      if (isInteger(expression.exponent, 0)) return { expression: ONE, ruleId: "EXP_ZERO" };
      if (isInteger(expression.exponent, 1)) return { expression: E, ruleId: "EXP_ONE" };
      if (isIpi(expression.exponent)) return { expression: integer(-1), ruleId: "EULER_IDENTITY" };
      if (isNegativeIpi(expression.exponent)) {
        return { expression: integer(-1), ruleId: "EULER_NEG_IDENTITY" };
      }
      if (expression.exponent.type === TYPES.LN && isProvablyPositive(expression.exponent.argument)) {
        return { expression: expression.exponent.argument, ruleId: "EXP_LN_POSITIVE" };
      }
    }

    if (expression.type === TYPES.LN) {
      if (isInteger(expression.argument, 1)) return { expression: ZERO, ruleId: "LN_ONE" };
      if (isConstant(expression.argument, "e")) return { expression: ONE, ruleId: "LN_E" };
      if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) {
        return { expression: expression.argument.exponent, ruleId: "LN_EXP_FORMAL" };
      }
      if (isInteger(expression.argument, -1)) return { expression: mul(I, PI), ruleId: "LN_MINUS_ONE" };
    }

    if (expression.type === TYPES.NEG && expression.child.type === TYPES.NEG) {
      return { expression: expression.child.child, ruleId: "NEG_DOUBLE" };
    }

    if (expression.type === TYPES.NEG && expression.child.type === TYPES.INTEGER) {
      return { expression: integer(-expression.child.value), ruleId: "NEG_INTEGER" };
    }

    if (expression.type === TYPES.ADD) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value + expression.right.value), ruleId: "INTEGER_ADD" };
      }
      if (isInteger(expression.left, 0)) return { expression: expression.right, ruleId: "ADD_ZERO" };
      if (isInteger(expression.right, 0)) return { expression: expression.left, ruleId: "ADD_ZERO" };
      if (expression.left.type === TYPES.NEG && isSame(expression.left.child, expression.right)) {
        return { expression: ZERO, ruleId: "ADD_INVERSE" };
      }
      if (expression.right.type === TYPES.NEG && isSame(expression.left, expression.right.child)) {
        return { expression: ZERO, ruleId: "ADD_INVERSE" };
      }
      if (expression.left.type === TYPES.SUB && isSame(expression.left.right, expression.right)) {
        return { expression: expression.left.left, ruleId: "ADD_SUB_CANCEL" };
      }
      if (expression.right.type === TYPES.SUB && isSame(expression.left, expression.right.right)) {
        return { expression: expression.right.left, ruleId: "ADD_SUB_CANCEL" };
      }
    }

    if (expression.type === TYPES.SUB) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value - expression.right.value), ruleId: "INTEGER_SUB" };
      }
      if (isInteger(expression.right, 0)) return { expression: expression.left, ruleId: "SUB_ZERO" };
      if (isSame(expression.left, expression.right)) return { expression: ZERO, ruleId: "SUB_SELF" };
      if (expression.right.type === TYPES.SUB && isSame(expression.left, expression.right.left)) {
        return { expression: expression.right.right, ruleId: "SUB_NESTED_LEFT" };
      }
      if (expression.left.type === TYPES.SUB && isSame(expression.left.left, expression.right)) {
        return { expression: neg(expression.left.right), ruleId: "SUB_NESTED_RIGHT" };
      }
      if (expression.right.type === TYPES.NEG) {
        return { expression: add(expression.left, expression.right.child), ruleId: "SUB_NEGATIVE" };
      }
      if (expression.right.type === TYPES.ADD) {
        if (isSame(expression.left, expression.right.left)) {
          return { expression: neg(expression.right.right), ruleId: "SUB_ADDED_LEFT" };
        }
        if (isSame(expression.left, expression.right.right)) {
          return { expression: neg(expression.right.left), ruleId: "SUB_ADDED_LEFT" };
        }
      }
      if (expression.left.type === TYPES.ADD) {
        if (isSame(expression.left.left, expression.right)) {
          return { expression: expression.left.right, ruleId: "SUB_ADDED_CANCEL" };
        }
        if (isSame(expression.left.right, expression.right)) {
          return { expression: expression.left.left, ruleId: "SUB_ADDED_CANCEL" };
        }
      }
    }

    if (expression.type === TYPES.MUL) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value * expression.right.value), ruleId: "INTEGER_MUL" };
      }
      if (isInteger(expression.left, 0) || isInteger(expression.right, 0)) {
        return { expression: ZERO, ruleId: "MUL_ZERO" };
      }
      if (isConstant(expression.left, "i") && isConstant(expression.right, "i")) {
        return { expression: integer(-1), ruleId: "I_SQUARED" };
      }
      if (isInteger(expression.left, 1)) return { expression: expression.right, ruleId: "MUL_ONE" };
      if (isInteger(expression.right, 1)) return { expression: expression.left, ruleId: "MUL_ONE" };
      if (isInteger(expression.left, -1)) return { expression: neg(expression.right), ruleId: "MUL_NEG_ONE" };
      if (isInteger(expression.right, -1)) return { expression: neg(expression.left), ruleId: "MUL_NEG_ONE" };
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
        if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) {
          return expression;
        }
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

  return { rules, simplify, isIpi, isNegativeIpi, isProvablyReal, isProvablyPositive };
});
