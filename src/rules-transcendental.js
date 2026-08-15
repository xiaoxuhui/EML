(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports ? require("./expression.js") : root.EMLExpression;
  const properties = typeof module === "object" && module.exports
    ? require("./expression-properties.js")
    : root.EMLExpressionProperties;
  const api = factory(expression, properties);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLTranscendentalRules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, Properties) {
  "use strict";

  const { TYPES, ONE, ZERO, E, PI, I, integer, neg, mul, div, pow, sub, isSame, isInteger, isConstant } = Expr;
  const { isProvablyReal, isProvablyPositive, isProvablyNonZero } = Properties;

  const rules = [
    { id: "EXP_ZERO", label: "e^0 = 1" },
    { id: "EXP_ONE", label: "e^1 = e" },
    { id: "EXP_LN_FORMAL", label: "e^(ln(a)) = a（形式化反函数，a 不为明确的 0）" },
    { id: "EXP_SUB_LN", label: "e^(a - ln(b)) = e^a / b（b ≠ 0）" },
    { id: "EXP_NEG_LN", label: "e^(-ln(b)) = 1 / b（b ≠ 0）" },
    { id: "EXP_ADD_LN", label: "e^(ln(a) + ln(b)) = ab（形式化规则）" },
    { id: "EXP_SUM_LN_FACTOR", label: "e^(a + ln(b)) = b × e^a（形式化规则）" },
    { id: "EXP_HALF", label: "e^(1 / 2) = √(e)" },
    { id: "EXP_HALF_LN", label: "e^(ln(a) / 2) = √(a)（形式化规则）" },
    { id: "EULER_IDENTITY", label: "e^(iπ) = -1" },
    { id: "EULER_NEG_IDENTITY", label: "e^(-iπ) = -1" },
    { id: "EULER_HALF_IDENTITY", label: "e^(iπ / 2) = i" },
    { id: "EULER_NEG_HALF_IDENTITY", label: "e^(-iπ / 2) = -i" },
    { id: "LN_ONE", label: "ln(1) = 0" },
    { id: "LN_E", label: "ln(e) = 1" },
    { id: "LN_EXP_FORMAL", label: "ln(e^a) = a（形式化反函数）" },
    { id: "LN_MINUS_ONE", label: "ln(-1) = iπ（主值）" },
    { id: "LN_I", label: "ln(i) = iπ / 2（主值）" },
    { id: "LN_QUOTIENT_POSITIVE_DENOMINATOR", label: "ln(a) - ln(b) = ln(a / b)（b > 0）" },
    { id: "LN_EXP_QUOTIENT", label: "ln(e^a / b) = a - ln(b)（b ≠ 0，形式化规则）" },
    { id: "LN_REAL_EXP_PRODUCT", label: "ln(e^a × b) = a + ln(b)（a 为实数，b ≠ 0）" },
    { id: "LN_RECIPROCAL", label: "ln(1 / a) = -ln(a)（a ≠ 0，形式化规则）" },
    { id: "EULER_SINE", label: "(e^(ia) - e^(-ia)) / (2i) = sin(a)" },
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
    return expression.type === TYPES.DIV && isIpi(expression.numerator) && isInteger(expression.denominator, 2);
  }

  function isNegativeHalfIpi(expression) {
    if (expression.type === TYPES.NEG) return isHalfIpi(expression.child);
    return expression.type === TYPES.DIV && isNegativeIpi(expression.numerator) && isInteger(expression.denominator, 2);
  }

  function halfLogarithmArgument(expression) {
    if (
      expression.type === TYPES.DIV && expression.numerator.type === TYPES.LN &&
      isInteger(expression.denominator, 2)
    ) return expression.numerator.argument;
    if (expression.type !== TYPES.MUL) return null;
    const factors = [expression.left, expression.right];
    const logarithm = factors.find((factor) => factor.type === TYPES.LN);
    const half = factors.find((factor) => (
      factor.type === TYPES.DIV && isInteger(factor.numerator, 1) && isInteger(factor.denominator, 2)
    ));
    return logarithm && half ? logarithm.argument : null;
  }

  function imaginaryCoefficient(expression) {
    if (isConstant(expression, "i")) return ONE;
    if (expression.type === TYPES.NEG) {
      const coefficient = imaginaryCoefficient(expression.child);
      return coefficient ? neg(coefficient) : null;
    }
    if (expression.type !== TYPES.MUL) return null;
    if (isConstant(expression.left, "i")) return expression.right;
    if (isConstant(expression.right, "i")) return expression.left;
    return null;
  }

  function isTwoI(expression) {
    return expression.type === TYPES.MUL && (
      (isInteger(expression.left, 2) && isConstant(expression.right, "i")) ||
      (isConstant(expression.left, "i") && isInteger(expression.right, 2))
    );
  }

  function eulerSineArgument(expression) {
    if (expression.type !== TYPES.DIV || !isTwoI(expression.denominator)) return null;
    const numerator = expression.numerator;
    if (numerator.type !== TYPES.SUB) return null;
    const [left, right] = [numerator.left, numerator.right];
    if (
      left.type !== TYPES.POW || right.type !== TYPES.POW ||
      !isConstant(left.base, "e") || !isConstant(right.base, "e")
    ) return null;
    const leftCoefficient = imaginaryCoefficient(left.exponent);
    const rightCoefficient = imaginaryCoefficient(right.exponent);
    return leftCoefficient && rightCoefficient && isSame(rightCoefficient, neg(leftCoefficient))
      ? leftCoefficient
      : null;
  }

  function rewrite(expression) {
    if (expression.type === TYPES.POW && isConstant(expression.base, "e")) {
      if (isInteger(expression.exponent, 0)) return { expression: ONE, ruleId: "EXP_ZERO" };
      if (isInteger(expression.exponent, 1)) return { expression: E, ruleId: "EXP_ONE" };
      const halfLogArgument = halfLogarithmArgument(expression.exponent);
      if (halfLogArgument && !isInteger(halfLogArgument, 0)) {
        return { expression: Expr.sqrt(halfLogArgument), ruleId: "EXP_HALF_LN" };
      }
      if (
        expression.exponent.type === TYPES.DIV && isInteger(expression.exponent.numerator, 1) &&
        isInteger(expression.exponent.denominator, 2)
      ) return { expression: Expr.sqrt(E), ruleId: "EXP_HALF" };
      if (isIpi(expression.exponent)) return { expression: integer(-1), ruleId: "EULER_IDENTITY" };
      if (isNegativeIpi(expression.exponent)) return { expression: integer(-1), ruleId: "EULER_NEG_IDENTITY" };
      if (isHalfIpi(expression.exponent)) return { expression: I, ruleId: "EULER_HALF_IDENTITY" };
      if (isNegativeHalfIpi(expression.exponent)) return { expression: neg(I), ruleId: "EULER_NEG_HALF_IDENTITY" };
      if (expression.exponent.type === TYPES.LN && !isInteger(expression.exponent.argument, 0)) {
        return { expression: expression.exponent.argument, ruleId: "EXP_LN_FORMAL" };
      }
      if (
        expression.exponent.type === TYPES.SUB && expression.exponent.right.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.right.argument)
      ) {
        return {
          expression: div(pow(E, expression.exponent.left), expression.exponent.right.argument),
          ruleId: "EXP_SUB_LN",
        };
      }
      if (
        expression.exponent.type === TYPES.NEG && expression.exponent.child.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.child.argument)
      ) return { expression: div(ONE, expression.exponent.child.argument), ruleId: "EXP_NEG_LN" };
      if (
        expression.exponent.type === TYPES.ADD && expression.exponent.left.type === TYPES.LN &&
        expression.exponent.right.type === TYPES.LN && !isInteger(expression.exponent.left.argument, 0) &&
        !isInteger(expression.exponent.right.argument, 0)
      ) {
        return {
          expression: mul(expression.exponent.left.argument, expression.exponent.right.argument),
          ruleId: "EXP_ADD_LN",
        };
      }
      if (expression.exponent.type === TYPES.ADD) {
        const logarithm = expression.exponent.left.type === TYPES.LN
          ? expression.exponent.left
          : expression.exponent.right.type === TYPES.LN ? expression.exponent.right : null;
        if (logarithm && !isInteger(logarithm.argument, 0)) {
          const other = logarithm === expression.exponent.left ? expression.exponent.right : expression.exponent.left;
          return { expression: mul(logarithm.argument, pow(E, other)), ruleId: "EXP_SUM_LN_FACTOR" };
        }
      }
    }

    if (expression.type === TYPES.LN) {
      if (isInteger(expression.argument, 1)) return { expression: ZERO, ruleId: "LN_ONE" };
      if (isConstant(expression.argument, "e")) return { expression: ONE, ruleId: "LN_E" };
      if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) {
        return { expression: expression.argument.exponent, ruleId: "LN_EXP_FORMAL" };
      }
      if (expression.argument.type === TYPES.MUL) {
        const exponential = expression.argument.left.type === TYPES.POW &&
          isConstant(expression.argument.left.base, "e")
          ? expression.argument.left
          : expression.argument.right.type === TYPES.POW && isConstant(expression.argument.right.base, "e")
            ? expression.argument.right
            : null;
        if (exponential && isProvablyReal(exponential.exponent)) {
          const other = exponential === expression.argument.left
            ? expression.argument.right
            : expression.argument.left;
          if (isProvablyNonZero(other)) {
            return {
              expression: Expr.add(exponential.exponent, Expr.ln(other)),
              ruleId: "LN_REAL_EXP_PRODUCT",
            };
          }
        }
      }
      if (
        expression.argument.type === TYPES.DIV && expression.argument.numerator.type === TYPES.POW &&
        isConstant(expression.argument.numerator.base, "e") && isProvablyNonZero(expression.argument.denominator)
      ) {
        return {
          expression: sub(expression.argument.numerator.exponent, Expr.ln(expression.argument.denominator)),
          ruleId: "LN_EXP_QUOTIENT",
        };
      }
      if (
        expression.argument.type === TYPES.DIV && isInteger(expression.argument.numerator, 1) &&
        isProvablyNonZero(expression.argument.denominator)
      ) return { expression: neg(Expr.ln(expression.argument.denominator)), ruleId: "LN_RECIPROCAL" };
      if (isInteger(expression.argument, -1)) return { expression: mul(I, PI), ruleId: "LN_MINUS_ONE" };
      if (isConstant(expression.argument, "i")) {
        return { expression: div(mul(I, PI), integer(2)), ruleId: "LN_I" };
      }
    }

    if (
      expression.type === TYPES.SUB && expression.left.type === TYPES.LN && expression.right.type === TYPES.LN &&
      isProvablyNonZero(expression.left.argument) && isProvablyPositive(expression.right.argument)
    ) {
      return {
        expression: Expr.ln(div(expression.left.argument, expression.right.argument)),
        ruleId: "LN_QUOTIENT_POSITIVE_DENOMINATOR",
      };
    }

    if (expression.type === TYPES.DIV) {
      const sineArgument = eulerSineArgument(expression);
      if (sineArgument) return { expression: Expr.sin(sineArgument), ruleId: "EULER_SINE" };
    }
    return null;
  }

  return {
    name: "transcendental",
    rules,
    rewrite,
    isIpi,
    isNegativeIpi,
    isHalfIpi,
    isNegativeHalfIpi,
    eulerSineArgument,
  };
});
