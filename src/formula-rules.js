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
    integer, neg, add, sub, mul, div, pow,
    canonicalKey, isSame, isInteger, isConstant, render,
  } = Expr;

  const rules = [
    { id: "EXP_ZERO", label: "e^0 = 1" },
    { id: "EXP_ONE", label: "e^1 = e" },
    { id: "EXP_LN_FORMAL", label: "e^(ln(a)) = a（形式化反函数，a 不为明确的 0）" },
    { id: "EXP_SUB_LN", label: "e^(a - ln(b)) = e^a / b（b ≠ 0）" },
    { id: "EXP_NEG_LN", label: "e^(-ln(b)) = 1 / b（b ≠ 0）" },
    { id: "EXP_ADD_LN", label: "e^(ln(a) + ln(b)) = ab（形式化规则）" },
    { id: "EULER_IDENTITY", label: "e^(iπ) = -1" },
    { id: "EULER_NEG_IDENTITY", label: "e^(-iπ) = -1" },
    { id: "EULER_HALF_IDENTITY", label: "e^(iπ / 2) = i" },
    { id: "EULER_NEG_HALF_IDENTITY", label: "e^(-iπ / 2) = -i" },
    { id: "LN_ONE", label: "ln(1) = 0" },
    { id: "LN_E", label: "ln(e) = 1" },
    { id: "LN_EXP_FORMAL", label: "ln(e^a) = a（形式化反函数）" },
    { id: "LN_MINUS_ONE", label: "ln(-1) = iπ（主值）" },
    { id: "LN_QUOTIENT_POSITIVE_DENOMINATOR", label: "ln(a) - ln(b) = ln(a / b)（b > 0）" },
    { id: "LN_EXP_QUOTIENT", label: "ln(e^a / b) = a - ln(b)（b ≠ 0，形式化规则）" },
    { id: "LN_RECIPROCAL", label: "ln(1 / a) = -ln(a)（a ≠ 0，形式化规则）" },
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
    { id: "INTEGER_DIV", label: "整除运算" },
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

  function isHalfIpi(expression) {
    return (
      expression.type === TYPES.DIV &&
      isIpi(expression.numerator) &&
      isInteger(expression.denominator, 2)
    );
  }

  function isNegativeHalfIpi(expression) {
    if (expression.type === TYPES.NEG) return isHalfIpi(expression.child);
    return (
      expression.type === TYPES.DIV &&
      isNegativeIpi(expression.numerator) &&
      isInteger(expression.denominator, 2)
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
      case TYPES.DIV:
        return isProvablyReal(expression.numerator) && isProvablyReal(expression.denominator);
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
      case TYPES.DIV: {
        const numerator = realBounds(expression.numerator);
        const denominator = realBounds(expression.denominator);
        if (!numerator || !denominator || (denominator.lower <= 0 && denominator.upper >= 0)) return null;
        const quotients = [
          numerator.lower / denominator.lower,
          numerator.lower / denominator.upper,
          numerator.upper / denominator.lower,
          numerator.upper / denominator.upper,
        ];
        return { lower: Math.min(...quotients), upper: Math.max(...quotients) };
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

  function isProvablyNotOne(expression) {
    if (expression.type === TYPES.INTEGER) return expression.value !== 1;
    if (expression.type === TYPES.CONSTANT) return true;
    if (expression.type === TYPES.MUL) {
      return (
        (isConstant(expression.left, "i") && isProvablyNonZero(expression.right)) ||
        (isConstant(expression.right, "i") && isProvablyNonZero(expression.left))
      );
    }
    return false;
  }

  function isProvablyPureImaginaryNonZero(expression) {
    switch (expression.type) {
      case TYPES.CONSTANT:
        return expression.name === "i";
      case TYPES.NEG:
        return isProvablyPureImaginaryNonZero(expression.child);
      case TYPES.MUL:
        return (
          (isProvablyPureImaginaryNonZero(expression.left) &&
            isProvablyReal(expression.right) &&
            isProvablyNonZero(expression.right)) ||
          (isProvablyPureImaginaryNonZero(expression.right) &&
            isProvablyReal(expression.left) &&
            isProvablyNonZero(expression.left))
        );
      case TYPES.DIV:
        return (
          isProvablyPureImaginaryNonZero(expression.numerator) &&
          isProvablyReal(expression.denominator) &&
          isProvablyNonZero(expression.denominator)
        );
      default:
        return false;
    }
  }

  function isProvablyNonZero(expression) {
    switch (expression.type) {
      case TYPES.INTEGER:
        return expression.value !== 0;
      case TYPES.CONSTANT:
        return true;
      case TYPES.NEG:
        return isProvablyNonZero(expression.child);
      case TYPES.MUL:
        return isProvablyNonZero(expression.left) && isProvablyNonZero(expression.right);
      case TYPES.DIV:
        return isProvablyNonZero(expression.numerator) && isProvablyNonZero(expression.denominator);
      case TYPES.POW:
        return isConstant(expression.base, "e");
      case TYPES.LN:
        return isProvablyNonZero(expression.argument) && isProvablyNotOne(expression.argument);
      case TYPES.ADD:
      case TYPES.SUB: {
        const bounds = realBounds(expression);
        return Boolean(
          (isProvablyPureImaginaryNonZero(expression.left) && isProvablyReal(expression.right)) ||
          (isProvablyPureImaginaryNonZero(expression.right) && isProvablyReal(expression.left)) ||
          (bounds && (bounds.lower > 0 || bounds.upper < 0))
        );
      }
      default: {
        const bounds = realBounds(expression);
        return Boolean(bounds && (bounds.lower > 0 || bounds.upper < 0));
      }
    }
  }

  function rewriteNode(expression) {
    if (expression.type === TYPES.POW && isConstant(expression.base, "e")) {
      if (isInteger(expression.exponent, 0)) return { expression: ONE, ruleId: "EXP_ZERO" };
      if (isInteger(expression.exponent, 1)) return { expression: E, ruleId: "EXP_ONE" };
      if (isIpi(expression.exponent)) return { expression: integer(-1), ruleId: "EULER_IDENTITY" };
      if (isNegativeIpi(expression.exponent)) {
        return { expression: integer(-1), ruleId: "EULER_NEG_IDENTITY" };
      }
      if (isHalfIpi(expression.exponent)) return { expression: I, ruleId: "EULER_HALF_IDENTITY" };
      if (isNegativeHalfIpi(expression.exponent)) {
        return { expression: neg(I), ruleId: "EULER_NEG_HALF_IDENTITY" };
      }
      if (expression.exponent.type === TYPES.LN && !isInteger(expression.exponent.argument, 0)) {
        return { expression: expression.exponent.argument, ruleId: "EXP_LN_FORMAL" };
      }
      if (
        expression.exponent.type === TYPES.SUB &&
        expression.exponent.right.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.right.argument)
      ) {
        return {
          expression: div(pow(E, expression.exponent.left), expression.exponent.right.argument),
          ruleId: "EXP_SUB_LN",
        };
      }
      if (
        expression.exponent.type === TYPES.NEG &&
        expression.exponent.child.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.child.argument)
      ) {
        return {
          expression: div(ONE, expression.exponent.child.argument),
          ruleId: "EXP_NEG_LN",
        };
      }
      if (
        expression.exponent.type === TYPES.ADD &&
        expression.exponent.left.type === TYPES.LN &&
        expression.exponent.right.type === TYPES.LN &&
        !isInteger(expression.exponent.left.argument, 0) &&
        !isInteger(expression.exponent.right.argument, 0)
      ) {
        return {
          expression: mul(
            expression.exponent.left.argument,
            expression.exponent.right.argument
          ),
          ruleId: "EXP_ADD_LN",
        };
      }
    }

    if (expression.type === TYPES.LN) {
      if (isInteger(expression.argument, 1)) return { expression: ZERO, ruleId: "LN_ONE" };
      if (isConstant(expression.argument, "e")) return { expression: ONE, ruleId: "LN_E" };
      if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) {
        return { expression: expression.argument.exponent, ruleId: "LN_EXP_FORMAL" };
      }
      if (
        expression.argument.type === TYPES.DIV &&
        expression.argument.numerator.type === TYPES.POW &&
        isConstant(expression.argument.numerator.base, "e") &&
        isProvablyNonZero(expression.argument.denominator)
      ) {
        return {
          expression: sub(
            expression.argument.numerator.exponent,
            Expr.ln(expression.argument.denominator)
          ),
          ruleId: "LN_EXP_QUOTIENT",
        };
      }
      if (
        expression.argument.type === TYPES.DIV &&
        isInteger(expression.argument.numerator, 1) &&
        isProvablyNonZero(expression.argument.denominator)
      ) {
        return {
          expression: neg(Expr.ln(expression.argument.denominator)),
          ruleId: "LN_RECIPROCAL",
        };
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
      if (
        expression.left.type === TYPES.LN &&
        expression.right.type === TYPES.LN &&
        isProvablyNonZero(expression.left.argument) &&
        isProvablyPositive(expression.right.argument)
      ) {
        return {
          expression: Expr.ln(div(expression.left.argument, expression.right.argument)),
          ruleId: "LN_QUOTIENT_POSITIVE_DENOMINATOR",
        };
      }
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
        if (isConstant(expression.right.left, "i")) {
          return { expression: neg(expression.right.right), ruleId: "I_TIMES_I_FACTOR" };
        }
        if (isConstant(expression.right.right, "i")) {
          return { expression: neg(expression.right.left), ruleId: "I_TIMES_I_FACTOR" };
        }
      }
      if (isConstant(expression.right, "i") && expression.left.type === TYPES.MUL) {
        if (isConstant(expression.left.left, "i")) {
          return { expression: neg(expression.left.right), ruleId: "I_TIMES_I_FACTOR" };
        }
        if (isConstant(expression.left.right, "i")) {
          return { expression: neg(expression.left.left), ruleId: "I_TIMES_I_FACTOR" };
        }
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
      if (
        expression.numerator.type === TYPES.INTEGER &&
        expression.denominator.type === TYPES.INTEGER &&
        expression.denominator.value !== 0 &&
        expression.numerator.value % expression.denominator.value === 0
      ) {
        return {
          expression: integer(expression.numerator.value / expression.denominator.value),
          ruleId: "INTEGER_DIV",
        };
      }
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

  return {
    rules,
    simplify,
    isIpi,
    isNegativeIpi,
    isHalfIpi,
    isNegativeHalfIpi,
    isProvablyReal,
    isProvablyPositive,
    isProvablyNonZero,
    isProvablyPureImaginaryNonZero,
  };
});
