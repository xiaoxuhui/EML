(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports ? require("./expression.js") : root.EMLExpression;
  const properties = typeof module === "object" && module.exports
    ? require("./expression-properties.js")
    : root.EMLExpressionProperties;
  const api = factory(expression, properties);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLAlgebraRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, Properties) {
  "use strict";

  const { TYPES, ONE, ZERO, I, integer, neg, add, mul, isSame, isInteger, isConstant } = Expr;
  const { isProvablyNonZero } = Properties;

  const rules = [
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
    { id: "MUL_NEG_FACTOR", label: "(-a)b = -(ab)" },
    { id: "I_TIMES_I_FACTOR", label: "i(ia) = -a" },
    { id: "DIV_ONE", label: "a / 1 = a" },
    { id: "DIV_SELF", label: "a / a = 1（a ≠ 0）" },
    { id: "DIV_I", label: "a / i = -ai" },
    { id: "DIV_NEG_I", label: "a / (-i) = ai" },
    { id: "INTEGER_DIV", label: "整除运算" },
  ];

  function rewrite(expression) {
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
      if (expression.left.type === TYPES.NEG) {
        return { expression: neg(mul(expression.left.child, expression.right)), ruleId: "MUL_NEG_FACTOR" };
      }
      if (expression.right.type === TYPES.NEG) {
        return { expression: neg(mul(expression.left, expression.right.child)), ruleId: "MUL_NEG_FACTOR" };
      }
      if (isConstant(expression.left, "i") && expression.right.type === TYPES.MUL) {
        if (isConstant(expression.right.left, "i")) return { expression: neg(expression.right.right), ruleId: "I_TIMES_I_FACTOR" };
        if (isConstant(expression.right.right, "i")) return { expression: neg(expression.right.left), ruleId: "I_TIMES_I_FACTOR" };
      }
      if (isConstant(expression.right, "i") && expression.left.type === TYPES.MUL) {
        if (isConstant(expression.left.left, "i")) return { expression: neg(expression.left.right), ruleId: "I_TIMES_I_FACTOR" };
        if (isConstant(expression.left.right, "i")) return { expression: neg(expression.left.left), ruleId: "I_TIMES_I_FACTOR" };
      }
      if (isInteger(expression.left, 1)) return { expression: expression.right, ruleId: "MUL_ONE" };
      if (isInteger(expression.right, 1)) return { expression: expression.left, ruleId: "MUL_ONE" };
      if (isInteger(expression.left, -1)) return { expression: neg(expression.right), ruleId: "MUL_NEG_ONE" };
      if (isInteger(expression.right, -1)) return { expression: neg(expression.left), ruleId: "MUL_NEG_ONE" };
    }

    if (expression.type === TYPES.DIV) {
      if (isInteger(expression.denominator, 1)) return { expression: expression.numerator, ruleId: "DIV_ONE" };
      if (isSame(expression.numerator, expression.denominator) && isProvablyNonZero(expression.numerator)) {
        return { expression: ONE, ruleId: "DIV_SELF" };
      }
      if (isConstant(expression.denominator, "i")) {
        return { expression: neg(mul(expression.numerator, I)), ruleId: "DIV_I" };
      }
      if (expression.denominator.type === TYPES.NEG && isConstant(expression.denominator.child, "i")) {
        return { expression: mul(expression.numerator, I), ruleId: "DIV_NEG_I" };
      }
      if (
        expression.numerator.type === TYPES.INTEGER && expression.denominator.type === TYPES.INTEGER &&
        expression.denominator.value !== 0 && expression.numerator.value % expression.denominator.value === 0
      ) {
        return { expression: integer(expression.numerator.value / expression.denominator.value), ruleId: "INTEGER_DIV" };
      }
    }
    return null;
  }

  return { name: "algebra", rules, rewrite };
});

