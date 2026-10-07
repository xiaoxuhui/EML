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

  const { TYPES, ONE, ZERO, E, PI, I, integer, neg, add, mul, div, pow, sub, isSame, isInteger, isConstant } = Expr;
  const {
    isProvablyReal,
    isProvablyPositive,
    isProvablyNonZero,
    imaginaryCoefficient: pureImaginaryCoefficient,
  } = Properties;

  const rules = [
    { id: "EXP_ZERO", label: "e^0 = 1" },
    { id: "EXP_ONE", label: "e^1 = e" },
    { id: "EXP_LN_FORMAL", label: "e^(ln(a)) = a（形式化反函数，a 不为明确的 0）" },
    { id: "EXP_SUB_LN", label: "e^(a - ln(b)) = e^a / b（b ≠ 0）" },
    { id: "EXP_LN_SUB", label: "e^(ln(a) - b) = a / e^b（形式化反函数，a 不为明确的 0）" },
    { id: "EXP_NEG_LN", label: "e^(-ln(b)) = 1 / b（b ≠ 0）" },
    { id: "EXP_SUB_I_ONE_MINUS_PI", label: "e^(a - i(1 - π)) = -e^(a - i)" },
    { id: "EXP_ADD_LN", label: "e^(ln(a) + ln(b)) = ab（形式化规则）" },
    { id: "EXP_NESTED_SUM_LN_FACTOR", label: "e^((ln(a) + b) + c) = a × e^(b + c)（形式化规则）" },
    { id: "EXP_PRODUCT_LN", label: "e^(a × ln(b)) = b^a（形式化规则）" },
    { id: "EXP_SUM_LN_FACTOR", label: "e^(a + ln(b)) = b × e^a（形式化规则）" },
    { id: "EXP_HALF", label: "e^(1 / 2) = √(e)" },
    { id: "EXP_HALF_LN", label: "e^(ln(a) / 2) = √(a)（形式化规则）" },
    { id: "EULER_FORMULA", label: "e^(iθ) = cos(θ) + i sin(θ)" },
    { id: "SIN_INTEGER_PI", label: "sin(nπ) = 0（n 为整数）" },
    { id: "COS_INTEGER_PI", label: "cos(nπ) = (-1)^n（n 为整数）" },
    { id: "SIN_HALF_INTEGER_PI", label: "sin(nπ / 2) 的标准值（n 为整数）" },
    { id: "COS_HALF_INTEGER_PI", label: "cos(nπ / 2) 的标准值（n 为整数）" },
    { id: "LN_ONE", label: "ln(1) = 0" },
    { id: "LN_E", label: "ln(e) = 1" },
    { id: "LN_SQRT_E", label: "ln(√(e)) = 1 / 2" },
    { id: "LN_EXP_FORMAL", label: "ln(e^a) = a（形式化反函数）" },
    { id: "LN_EULER_FORMAL", label: "ln((cos(θ) + i sin(θ)) / b) = iθ - ln(b)（形式化规则）" },
    { id: "LN_EULER_PRODUCT_FORMAL", label: "ln((cos(θ) + i sin(θ))b) = iθ + ln(b)（形式化规则）" },
    { id: "LN_I_REAL_PRODUCT", label: "ln(ia) = ln(a) + ln(i)（a > 0）" },
    { id: "LN_PRODUCT_POSITIVE", label: "ln(a) + ln(b) = ln(ab)（a, b > 0）" },
    { id: "LN_MINUS_ONE", label: "ln(-1) = iπ（主值）" },
    { id: "LN_QUOTIENT_POSITIVE_DENOMINATOR", label: "ln(a) - ln(b) = ln(a / b)（b > 0）" },
    { id: "LN_EXP_QUOTIENT_FORMAL", label: "ln(e^a / b) = a - ln(b)（b ≠ 0，形式化规则）" },
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

  function piCoefficient(expression) {
    if (isConstant(expression, "pi")) return { numerator: 1, denominator: 1 };
    if (expression.type === TYPES.NEG) {
      const coefficient = piCoefficient(expression.child);
      return coefficient && { ...coefficient, numerator: -coefficient.numerator };
    }
    if (expression.type === TYPES.MUL) {
      if (expression.left.type === TYPES.INTEGER) {
        const coefficient = piCoefficient(expression.right);
        return coefficient && { ...coefficient, numerator: coefficient.numerator * expression.left.value };
      }
      if (expression.right.type === TYPES.INTEGER) {
        const coefficient = piCoefficient(expression.left);
        return coefficient && { ...coefficient, numerator: coefficient.numerator * expression.right.value };
      }
    }
    if (expression.type === TYPES.DIV && expression.denominator.type === TYPES.INTEGER && expression.denominator.value !== 0) {
      const coefficient = piCoefficient(expression.numerator);
      return coefficient && {
        numerator: coefficient.numerator,
        denominator: coefficient.denominator * expression.denominator.value,
      };
    }
    return null;
  }

  function normalizedMod(value, modulus) {
    return ((value % modulus) + modulus) % modulus;
  }

  function trigStandardValue(type, argument) {
    const coefficient = piCoefficient(argument);
    if (!coefficient) return null;
    const { numerator, denominator } = coefficient;
    if (denominator === 1) {
      if (type === TYPES.SIN) return ZERO;
      return integer(normalizedMod(numerator, 2) === 0 ? 1 : -1);
    }
    if (Math.abs(denominator) !== 2) return null;
    const quadrant = normalizedMod(numerator * Math.sign(denominator), 4);
    const values = type === TYPES.SIN ? [0, 1, 0, -1] : [1, 0, -1, 0];
    return integer(values[quadrant]);
  }

  function isIUnitDifference(expression) {
    if (expression.type !== TYPES.MUL) return false;
    const factors = [expression.left, expression.right];
    const difference = factors.find((factor) => (
      factor.type === TYPES.SUB && isInteger(factor.left, 1) && isConstant(factor.right, "pi")
    ));
    return Boolean(difference && factors.some((factor) => isConstant(factor, "i")));
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

  function eulerAngle(expression) {
    if (expression.type !== TYPES.ADD) return null;
    const candidates = [
      [expression.left, expression.right],
      [expression.right, expression.left],
    ];
    for (const [cosine, imaginarySine] of candidates) {
      if (cosine.type !== TYPES.COS || imaginarySine.type !== TYPES.MUL) continue;
      const sine = isConstant(imaginarySine.left, "i") && imaginarySine.right.type === TYPES.SIN
        ? imaginarySine.right
        : isConstant(imaginarySine.right, "i") && imaginarySine.left.type === TYPES.SIN
          ? imaginarySine.left
          : null;
      if (sine && isSame(cosine.argument, sine.argument)) return cosine.argument;
    }
    return null;
  }

  function eulerForm(expression) {
    const angle = eulerAngle(expression);
    if (angle) return { angle, denominator: ONE };
    if (expression.type === TYPES.DIV) {
      const numeratorAngle = eulerAngle(expression.numerator);
      return numeratorAngle ? { angle: numeratorAngle, denominator: expression.denominator } : null;
    }
    if (
      expression.type === TYPES.ADD && expression.left.type === TYPES.DIV && expression.right.type === TYPES.DIV &&
      isSame(expression.left.denominator, expression.right.denominator)
    ) {
      const numeratorAngle = eulerAngle(Expr.add(expression.left.numerator, expression.right.numerator));
      return numeratorAngle ? { angle: numeratorAngle, denominator: expression.left.denominator } : null;
    }
    return null;
  }

  function rewrite(expression) {
    if (expression.type === TYPES.POW && isConstant(expression.base, "e")) {
      if (isInteger(expression.exponent, 0)) return { expression: ONE, ruleId: "EXP_ZERO" };
      if (isInteger(expression.exponent, 1)) return { expression: E, ruleId: "EXP_ONE" };
      const halfLogArgument = halfLogarithmArgument(expression.exponent);
      if (halfLogArgument && isProvablyNonZero(halfLogArgument)) {
        return { expression: Expr.sqrt(halfLogArgument), ruleId: "EXP_HALF_LN" };
      }
      if (
        expression.exponent.type === TYPES.DIV && isInteger(expression.exponent.numerator, 1) &&
        isInteger(expression.exponent.denominator, 2)
      ) return { expression: Expr.sqrt(E), ruleId: "EXP_HALF" };
      const imaginaryPart = pureImaginaryCoefficient(expression.exponent);
      if (imaginaryPart) {
        return {
          expression: Expr.add(Expr.cos(imaginaryPart), mul(I, Expr.sin(imaginaryPart))),
          ruleId: "EULER_FORMULA",
        };
      }
      // EML uses this as a formal inverse rule. At this point the argument has
      // already been simplified bottom-up, so an actually recognized zero is
      // represented by the integer 0. Requiring a complete nonzero proof here
      // incorrectly blocks nested complex expressions such as i - ln(i / 2).
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
        expression.exponent.type === TYPES.SUB && expression.exponent.left.type === TYPES.LN &&
        !isInteger(expression.exponent.left.argument, 0)
      ) {
        const logarithmArgument = expression.exponent.left.argument;
        const exponential = pow(E, expression.exponent.right);
        return {
          expression: logarithmArgument.type === TYPES.DIV
            ? div(logarithmArgument.numerator, mul(logarithmArgument.denominator, exponential))
            : div(logarithmArgument, exponential),
          ruleId: "EXP_LN_SUB",
        };
      }
      if (
        expression.exponent.type === TYPES.NEG && expression.exponent.child.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.child.argument)
      ) return { expression: div(ONE, expression.exponent.child.argument), ruleId: "EXP_NEG_LN" };
      if (
        expression.exponent.type === TYPES.SUB && isIUnitDifference(expression.exponent.right)
      ) {
        return {
          expression: neg(pow(E, sub(expression.exponent.left, I))),
          ruleId: "EXP_SUB_I_ONE_MINUS_PI",
        };
      }
      if (
        expression.exponent.type === TYPES.ADD &&         expression.exponent.left.type === TYPES.LN &&
        expression.exponent.right.type === TYPES.LN && isProvablyNonZero(expression.exponent.left.argument) &&
        isProvablyNonZero(expression.exponent.right.argument)
      ) {
        return {
          expression: mul(expression.exponent.left.argument, expression.exponent.right.argument),
          ruleId: "EXP_ADD_LN",
        };
      }
      if (
        expression.exponent.type === TYPES.ADD && expression.exponent.left.type === TYPES.ADD &&
        expression.exponent.left.left.type === TYPES.LN &&
        isProvablyNonZero(expression.exponent.left.left.argument)
      ) {
        return {
          expression: mul(
            expression.exponent.left.left.argument,
            pow(E, add(expression.exponent.left.right, expression.exponent.right))
          ),
          ruleId: "EXP_NESTED_SUM_LN_FACTOR",
        };
      }
      if (expression.exponent.type === TYPES.MUL) {
        const logarithm = expression.exponent.left.type === TYPES.LN
          ? expression.exponent.left
          : expression.exponent.right.type === TYPES.LN ? expression.exponent.right : null;
        if (logarithm && isProvablyNonZero(logarithm.argument)) {
          const other = logarithm === expression.exponent.left
            ? expression.exponent.right
            : expression.exponent.left;
          return { expression: pow(logarithm.argument, other), ruleId: "EXP_PRODUCT_LN" };
        }
      }
      if (expression.exponent.type === TYPES.ADD) {
        const logarithm = expression.exponent.left.type === TYPES.LN
          ? expression.exponent.left
          : expression.exponent.right.type === TYPES.LN ? expression.exponent.right : null;
        if (logarithm && isProvablyNonZero(logarithm.argument)) {
          const other = logarithm === expression.exponent.left ? expression.exponent.right : expression.exponent.left;
          return { expression: mul(logarithm.argument, pow(E, other)), ruleId: "EXP_SUM_LN_FACTOR" };
        }
      }
    }

    if (expression.type === TYPES.LN) {
      if (isInteger(expression.argument, 1)) return { expression: ZERO, ruleId: "LN_ONE" };
      if (isConstant(expression.argument, "e")) return { expression: ONE, ruleId: "LN_E" };
      if (expression.argument.type === TYPES.SQRT && isConstant(expression.argument.argument, "e")) {
        return { expression: div(ONE, integer(2)), ruleId: "LN_SQRT_E" };
      }
      if (expression.argument.type === TYPES.POW && isConstant(expression.argument.base, "e")) {
        return { expression: expression.argument.exponent, ruleId: "LN_EXP_FORMAL" };
      }
      const polarForm = eulerForm(expression.argument);
      if (polarForm && isProvablyNonZero(polarForm.denominator)) {
        const imaginaryAngle = mul(I, polarForm.angle);
        return {
          expression: isInteger(polarForm.denominator, 1)
            ? imaginaryAngle
            : sub(imaginaryAngle, Expr.ln(polarForm.denominator)),
          ruleId: "LN_EULER_FORMAL",
        };
      }
      if (expression.argument.type === TYPES.MUL) {
        const factors = [expression.argument.left, expression.argument.right];
        const leftPolar = eulerForm(factors[0]);
        const rightPolar = eulerForm(factors[1]);
        const polarFactor = leftPolar || rightPolar;
        if (polarFactor && isInteger(polarFactor.denominator, 1)) {
          const other = leftPolar ? factors[1] : factors[0];
          if (isProvablyNonZero(other)) {
            return {
              expression: Expr.add(mul(I, polarFactor.angle), Expr.ln(other)),
              ruleId: "LN_EULER_PRODUCT_FORMAL",
            };
          }
        }
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
        const imaginaryFactor = isConstant(factors[0], "i") ? factors[0] : isConstant(factors[1], "i") ? factors[1] : null;
        if (imaginaryFactor) {
          const other = imaginaryFactor === factors[0] ? factors[1] : factors[0];
          if (isProvablyPositive(other)) {
            return {
              expression: Expr.add(Expr.ln(other), Expr.ln(I)),
              ruleId: "LN_I_REAL_PRODUCT",
            };
          }
        }
      }
      if (
        expression.argument.type === TYPES.DIV && expression.argument.numerator.type === TYPES.POW &&
        isConstant(expression.argument.numerator.base, "e") &&
        isProvablyNonZero(expression.argument.denominator)
      ) {
        return {
          expression: sub(expression.argument.numerator.exponent, Expr.ln(expression.argument.denominator)),
          ruleId: "LN_EXP_QUOTIENT_FORMAL",
        };
      }
      if (
        expression.argument.type === TYPES.DIV && isInteger(expression.argument.numerator, 1) &&
        isProvablyNonZero(expression.argument.denominator)
      ) return { expression: neg(Expr.ln(expression.argument.denominator)), ruleId: "LN_RECIPROCAL" };
      if (isInteger(expression.argument, -1)) return { expression: mul(I, PI), ruleId: "LN_MINUS_ONE" };
    }

    if (expression.type === TYPES.SIN || expression.type === TYPES.COS) {
      const standardValue = trigStandardValue(expression.type, expression.argument);
      if (standardValue) {
        const isHalf = Math.abs(piCoefficient(expression.argument)?.denominator || 1) === 2;
        return {
          expression: standardValue,
          ruleId: expression.type === TYPES.SIN
            ? isHalf ? "SIN_HALF_INTEGER_PI" : "SIN_INTEGER_PI"
            : isHalf ? "COS_HALF_INTEGER_PI" : "COS_INTEGER_PI",
        };
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

    if (
      expression.type === TYPES.ADD && expression.left.type === TYPES.LN && expression.right.type === TYPES.LN &&
      isProvablyPositive(expression.left.argument) && isProvablyPositive(expression.right.argument)
    ) {
      return {
        expression: Expr.ln(mul(expression.left.argument, expression.right.argument)),
        ruleId: "LN_PRODUCT_POSITIVE",
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
