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

  const { TYPES, ONE, ZERO, I, integer, neg, add, sub, mul, canonicalKey, isSame, isInteger, isConstant } = Expr;
  const { isProvablyNonZero, imaginaryCoefficient } = Properties;

  const rules = [
    { id: "NEG_INTEGER", label: "负整数化简" },
    { id: "NEG_DOUBLE", label: "-(-a) = a" },
    { id: "NEG_DIV", label: "-(a / b) = (-a) / b" },
    { id: "NEG_SUB", label: "-(a - b) = b - a" },
    { id: "INTEGER_ADD", label: "整数加法" },
    { id: "INTEGER_SUB", label: "整数减法" },
    { id: "INTEGER_MUL", label: "整数乘法" },
    { id: "ADD_ZERO", label: "a + 0 = a" },
    { id: "ADD_INVERSE", label: "a + (-a) = 0" },
    { id: "ADD_SUB_CANCEL", label: "(a - b) + b = a" },
    { id: "ADD_SUB_SAME_LEFT", label: "(a - b) + a = a + a - b" },
    { id: "ADD_SAME_HALF", label: "a / 2 + a / 2 = a" },
    { id: "ADD_SUB_TERM_CANCEL", label: "加减式中的同项抵消" },
    { id: "ADD_IMAGINARY_COEFFICIENT", label: "ia + ib = i(a + b)" },
    { id: "SUB_ZERO", label: "a - 0 = a" },
    { id: "SUB_SELF", label: "a - a = 0" },
    { id: "SUB_NESTED_LEFT", label: "a - (a - b) = b" },
    { id: "SUB_NESTED_RIGHT", label: "(a - b) - a = -b" },
    { id: "SUB_NESTED_SAME_LEFT", label: "(a - b) - (a - c) = c - b" },
    { id: "SUB_NESTED_ADD_SAME_LEFT", label: "(a - b) - (a + c) = -(b + c)" },
    { id: "SUB_NESTED_RATIONAL_FOLD", label: "r - (n - a) = (r - n) + a" },
    { id: "SUB_NEGATIVE", label: "a - (-b) = a + b" },
    { id: "SUB_NEGATIVE_FRACTION", label: "a - (-b / c) = a + b / c" },
    { id: "SUB_ADDED_LEFT", label: "a - (a + b) = -b" },
    { id: "SUB_ADDED_CANCEL", label: "(a + b) - a = b" },
    { id: "SUB_ADD_SUB_SAME_LEFT", label: "(a + b) - (a - c) = b + c" },
    { id: "SUB_IMAGINARY_COEFFICIENT", label: "ia - ib = i(a - b)" },
    { id: "SUB_NESTED_FOLD", label: "a - (b - c) 折叠为可合并整数的形式" },
    { id: "SUB_SUM_FOLD", label: "a - (b + c) 折叠为可合并整数的形式" },
    { id: "MUL_ONE", label: "a × 1 = a" },
    { id: "MUL_ZERO", label: "a × 0 = 0" },
    { id: "MUL_NEG_ONE", label: "a × (-1) = -a" },
    { id: "I_SQUARED", label: "i × i = -1" },
    { id: "MUL_IMAGINARY_FACTORS", label: "(ia)(ib) = -ab" },
    { id: "MUL_NEG_FACTOR", label: "(-a)b = -(ab)" },
    { id: "MUL_NEGATIVE_FRACTION", label: "a × (-b / c) = -(a × b / c)" },
    { id: "I_TIMES_I_FACTOR", label: "i(ia) = -a" },
    { id: "DIV_ONE", label: "a / 1 = a" },
    { id: "DIV_SELF", label: "a / a = 1（a ≠ 0）" },
    { id: "DIV_I", label: "a / i = -ai" },
    { id: "DIV_NEG_I", label: "a / (-i) = ai" },
    { id: "INTEGER_DIV", label: "整除运算" },
    { id: "INTEGER_FRACTION_ADD", label: "整数与分数加法" },
    { id: "INTEGER_FRACTION_SUB", label: "整数与分数减法" },
    { id: "INTEGER_FRACTION_MUL", label: "整数分数相乘" },
    { id: "INTEGER_FRACTION_REDUCE", label: "整数分数约分" },
    { id: "I_TIMES_DIV", label: "i × (a / b) = ia / b" },
  ];

  function combineIntegerAndFraction(integerExpression, fraction, sign) {
    if (
      integerExpression.type !== TYPES.INTEGER || fraction.type !== TYPES.DIV ||
      fraction.numerator.type !== TYPES.INTEGER || fraction.denominator.type !== TYPES.INTEGER ||
      fraction.denominator.value === 0
    ) return null;
    return Expr.div(
      integer(integerExpression.value * fraction.denominator.value + sign * fraction.numerator.value),
      fraction.denominator
    );
  }

  function combineFractionAndInteger(fraction, integerExpression) {
    if (
      fraction.type !== TYPES.DIV || integerExpression.type !== TYPES.INTEGER ||
      fraction.numerator.type !== TYPES.INTEGER || fraction.denominator.type !== TYPES.INTEGER ||
      fraction.denominator.value === 0
    ) return null;
    return Expr.div(
      integer(fraction.numerator.value - integerExpression.value * fraction.denominator.value),
      fraction.denominator
    );
  }

  function combineFractions(left, right, sign) {
    if (
      left.type !== TYPES.DIV || right.type !== TYPES.DIV ||
      left.numerator.type !== TYPES.INTEGER || left.denominator.type !== TYPES.INTEGER ||
      right.numerator.type !== TYPES.INTEGER || right.denominator.type !== TYPES.INTEGER ||
      left.denominator.value === 0 || right.denominator.value === 0
    ) return null;
    return Expr.div(
      integer(left.numerator.value * right.denominator.value + sign * right.numerator.value * left.denominator.value),
      integer(left.denominator.value * right.denominator.value)
    );
  }

  function greatestCommonDivisor(left, right) {
    let a = Math.abs(left);
    let b = Math.abs(right);
    while (b !== 0) [a, b] = [b, a % b];
    return a || 1;
  }

  function cancelAdditiveTerms(expression) {
    const terms = [];
    const collect = (node, sign) => {
      if (node.type === TYPES.ADD) {
        collect(node.left, sign);
        collect(node.right, sign);
      } else if (node.type === TYPES.SUB) {
        collect(node.left, sign);
        collect(node.right, -sign);
      } else if (node.type === TYPES.NEG) {
        collect(node.child, -sign);
      } else if (
        node.type === TYPES.DIV && node.numerator.type === TYPES.INTEGER && node.numerator.value < 0
      ) {
        terms.push({
          expression: Expr.div(integer(-node.numerator.value), node.denominator),
          sign: -sign,
        });
      } else {
        terms.push({ expression: node, sign });
      }
    };
    collect(expression, 1);

    const counts = new Map();
    for (const term of terms) {
      const key = canonicalKey(term.expression);
      const entry = counts.get(key) || { positive: 0, negative: 0 };
      if (term.sign > 0) entry.positive += 1;
      else entry.negative += 1;
      counts.set(key, entry);
    }

    const removals = new Map();
    for (const [key, entry] of counts) {
      const pairs = Math.min(entry.positive, entry.negative);
      if (pairs > 0) removals.set(key, { positive: pairs, negative: pairs });
    }
    if (removals.size === 0) return null;

    const remaining = [];
    for (const term of terms) {
      const removal = removals.get(canonicalKey(term.expression));
      const direction = term.sign > 0 ? "positive" : "negative";
      if (removal && removal[direction] > 0) removal[direction] -= 1;
      else remaining.push(term);
    }
    if (remaining.length === 0) return ZERO;

    let rebuilt = remaining[0].sign > 0 ? remaining[0].expression : neg(remaining[0].expression);
    for (const term of remaining.slice(1)) {
      rebuilt = term.sign > 0 ? add(rebuilt, term.expression) : sub(rebuilt, term.expression);
    }
    return rebuilt;
  }

  function rewrite(expression) {
    if (expression.type === TYPES.NEG && expression.child.type === TYPES.NEG) {
      return { expression: expression.child.child, ruleId: "NEG_DOUBLE" };
    }
    if (expression.type === TYPES.NEG && expression.child.type === TYPES.INTEGER) {
      return { expression: integer(-expression.child.value), ruleId: "NEG_INTEGER" };
    }
    if (expression.type === TYPES.NEG && expression.child.type === TYPES.DIV) {
      return {
        expression: Expr.div(neg(expression.child.numerator), expression.child.denominator),
        ruleId: "NEG_DIV",
      };
    }
    // -(a - b) = b - a
    // 缺少这条时，-(e - 1) 之类的表达式会原地不动（0 步重写），
    // 从而卡住所有依赖它的后续合并。
    if (expression.type === TYPES.NEG && expression.child.type === TYPES.SUB) {
      return {
        expression: sub(expression.child.right, expression.child.left),
        ruleId: "NEG_SUB",
      };
    }

    if (expression.type === TYPES.ADD) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value + expression.right.value), ruleId: "INTEGER_ADD" };
      }
      const fractionSum = combineFractions(expression.left, expression.right, 1);
      if (fractionSum) return { expression: fractionSum, ruleId: "INTEGER_FRACTION_ADD" };
      const integerFraction = combineIntegerAndFraction(expression.left, expression.right, 1) ||
        combineIntegerAndFraction(expression.right, expression.left, 1);
      if (integerFraction) return { expression: integerFraction, ruleId: "INTEGER_FRACTION_ADD" };
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
      if (expression.left.type === TYPES.SUB && isSame(expression.left.left, expression.right)) {
        return {
          expression: sub(add(expression.right, expression.right), expression.left.right),
          ruleId: "ADD_SUB_SAME_LEFT",
        };
      }
      if (expression.right.type === TYPES.SUB && isSame(expression.left, expression.right.right)) {
        return { expression: expression.right.left, ruleId: "ADD_SUB_CANCEL" };
      }
      if (
        expression.left.type === TYPES.DIV && expression.right.type === TYPES.DIV &&
        isInteger(expression.left.denominator, 2) && isInteger(expression.right.denominator, 2) &&
        isSame(expression.left.numerator, expression.right.numerator)
      ) return { expression: expression.left.numerator, ruleId: "ADD_SAME_HALF" };
      if (
        expression.left.type === TYPES.MUL && expression.right.type === TYPES.MUL &&
        expression.left.right.type === TYPES.DIV && expression.right.right.type === TYPES.DIV &&
        isInteger(expression.left.right.numerator, 1) && isInteger(expression.left.right.denominator, 2) &&
        isInteger(expression.right.right.numerator, 1) && isInteger(expression.right.right.denominator, 2) &&
        isSame(expression.left.left, expression.right.left)
      ) return { expression: expression.left.left, ruleId: "ADD_SAME_HALF" };
      const cancelled = cancelAdditiveTerms(expression);
      if (cancelled) return { expression: cancelled, ruleId: "ADD_SUB_TERM_CANCEL" };
      const leftCoefficient = imaginaryCoefficient(expression.left);
      const rightCoefficient = imaginaryCoefficient(expression.right);
      if (leftCoefficient && rightCoefficient) {
        return {
          expression: mul(I, add(leftCoefficient, rightCoefficient)),
          ruleId: "ADD_IMAGINARY_COEFFICIENT",
        };
      }
    }

    if (expression.type === TYPES.SUB) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value - expression.right.value), ruleId: "INTEGER_SUB" };
      }
      const fractionDifference = combineFractions(expression.left, expression.right, -1);
      if (fractionDifference) return { expression: fractionDifference, ruleId: "INTEGER_FRACTION_SUB" };
      const integerFraction = combineIntegerAndFraction(expression.left, expression.right, -1) ||
        combineFractionAndInteger(expression.left, expression.right);
      if (integerFraction) return { expression: integerFraction, ruleId: "INTEGER_FRACTION_SUB" };
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
      if (expression.right.type === TYPES.DIV && expression.right.numerator.type === TYPES.NEG) {
        return {
          expression: add(expression.left, Expr.div(expression.right.numerator.child, expression.right.denominator)),
          ruleId: "SUB_NEGATIVE_FRACTION",
        };
      }
      if (
        expression.right.type === TYPES.DIV && expression.right.numerator.type === TYPES.INTEGER &&
        expression.right.numerator.value < 0
      ) {
        return {
          expression: add(expression.left, Expr.div(integer(-expression.right.numerator.value), expression.right.denominator)),
          ruleId: "SUB_NEGATIVE_FRACTION",
        };
      }
      const leftCoefficient = imaginaryCoefficient(expression.left);
      const rightCoefficient = imaginaryCoefficient(expression.right);
      if (leftCoefficient && rightCoefficient) {
        return {
          expression: mul(I, sub(leftCoefficient, rightCoefficient)),
          ruleId: "SUB_IMAGINARY_COEFFICIENT",
        };
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
      if (
        expression.left.type === TYPES.ADD && expression.right.type === TYPES.SUB
      ) {
        if (isSame(expression.left.left, expression.right.left)) {
          return {
            expression: add(expression.left.right, expression.right.right),
            ruleId: "SUB_ADD_SUB_SAME_LEFT",
          };
        }
        if (isSame(expression.left.right, expression.right.left)) {
          return {
            expression: add(expression.left.left, expression.right.right),
            ruleId: "SUB_ADD_SUB_SAME_LEFT",
          };
        }
      }
      // (a - b) - (a - c) = c - b
      if (
        expression.left.type === TYPES.SUB && expression.right.type === TYPES.SUB &&
        isSame(expression.left.left, expression.right.left)
      ) {
        return {
          expression: sub(expression.right.right, expression.left.right),
          ruleId: "SUB_NESTED_SAME_LEFT",
        };
      }
      if (
        expression.left.type === TYPES.SUB && expression.right.type === TYPES.ADD &&
        isSame(expression.left.left, expression.right.left)
      ) {
        return {
          expression: neg(add(expression.left.right, expression.right.right)),
          ruleId: "SUB_NESTED_ADD_SAME_LEFT",
        };
      }
      if (
        expression.right.type === TYPES.SUB && expression.left.type === TYPES.DIV &&
        expression.left.numerator.type === TYPES.INTEGER && expression.left.denominator.type === TYPES.INTEGER &&
        expression.right.left.type === TYPES.INTEGER
      ) {
        return {
          expression: add(sub(expression.left, expression.right.left), expression.right.right),
          ruleId: "SUB_NESTED_RATIONAL_FOLD",
        };
      }
      // a - (b - c) = a - b + c
      //
      // 只有当 a 与 c（或 a 与 b）同为整数、能立刻算出整数结果时才改写：
      // 否则会产出 (x + z) - y 这种「长度不变、没有更简」的形式，反而污染化简步骤。
      // 例：1 - (e - 1) → (1 + 1) - e → 2 - e
      if (expression.right.type === TYPES.SUB) {
        const [minuend, innerLeft, innerRight] = [expression.left, expression.right.left, expression.right.right];
        if (minuend.type === TYPES.INTEGER && innerRight.type === TYPES.INTEGER) {
          return { expression: sub(add(minuend, innerRight), innerLeft), ruleId: "SUB_NESTED_FOLD" };
        }
        if (minuend.type === TYPES.INTEGER && innerLeft.type === TYPES.INTEGER) {
          return { expression: add(sub(minuend, innerLeft), innerRight), ruleId: "SUB_NESTED_FOLD" };
        }
      }
      // a - (b + c) = a - b - c（同样只在能立刻合并整数时改写）
      // 例：2 - (e + 1) → (2 - 1) - e → 1 - e
      if (expression.right.type === TYPES.ADD) {
        const [minuend, innerLeft, innerRight] = [expression.left, expression.right.left, expression.right.right];
        if (minuend.type === TYPES.INTEGER && innerLeft.type === TYPES.INTEGER) {
          return { expression: sub(sub(minuend, innerLeft), innerRight), ruleId: "SUB_SUM_FOLD" };
        }
        if (minuend.type === TYPES.INTEGER && innerRight.type === TYPES.INTEGER) {
          return { expression: sub(sub(minuend, innerRight), innerLeft), ruleId: "SUB_SUM_FOLD" };
        }
      }
    }

    if (expression.type === TYPES.MUL) {
      if (expression.left.type === TYPES.INTEGER && expression.right.type === TYPES.INTEGER) {
        return { expression: integer(expression.left.value * expression.right.value), ruleId: "INTEGER_MUL" };
      }
      if (
        expression.left.type === TYPES.DIV && expression.right.type === TYPES.DIV &&
        expression.left.numerator.type === TYPES.INTEGER && expression.left.denominator.type === TYPES.INTEGER &&
        expression.right.numerator.type === TYPES.INTEGER && expression.right.denominator.type === TYPES.INTEGER &&
        expression.left.denominator.value !== 0 && expression.right.denominator.value !== 0
      ) {
        return {
          expression: Expr.div(
            integer(expression.left.numerator.value * expression.right.numerator.value),
            integer(expression.left.denominator.value * expression.right.denominator.value)
          ),
          ruleId: "INTEGER_FRACTION_MUL",
        };
      }
      if (isInteger(expression.left, 0) || isInteger(expression.right, 0)) {
        return { expression: ZERO, ruleId: "MUL_ZERO" };
      }
      if (isConstant(expression.left, "i") && isConstant(expression.right, "i")) {
        return { expression: integer(-1), ruleId: "I_SQUARED" };
      }
      if (isConstant(expression.left, "i") && expression.right.type === TYPES.DIV) {
        return {
          expression: Expr.div(mul(I, expression.right.numerator), expression.right.denominator),
          ruleId: "I_TIMES_DIV",
        };
      }
      if (isConstant(expression.right, "i") && expression.left.type === TYPES.DIV) {
        return {
          expression: Expr.div(mul(expression.left.numerator, I), expression.left.denominator),
          ruleId: "I_TIMES_DIV",
        };
      }
      if (
        expression.right.type === TYPES.DIV && expression.right.numerator.type === TYPES.INTEGER &&
        expression.right.numerator.value < 0
      ) {
        return {
          expression: neg(mul(expression.left, Expr.div(integer(-expression.right.numerator.value), expression.right.denominator))),
          ruleId: "MUL_NEGATIVE_FRACTION",
        };
      }
      const leftCoefficient = imaginaryCoefficient(expression.left);
      const rightCoefficient = imaginaryCoefficient(expression.right);
      if (leftCoefficient && rightCoefficient) {
        return {
          expression: neg(mul(leftCoefficient, rightCoefficient)),
          ruleId: "MUL_IMAGINARY_FACTORS",
        };
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
      if (expression.numerator.type === TYPES.INTEGER && expression.denominator.type === TYPES.INTEGER && expression.denominator.value !== 0) {
        const sign = expression.denominator.value < 0 ? -1 : 1;
        const numerator = expression.numerator.value * sign;
        const denominator = expression.denominator.value * sign;
        const divisor = greatestCommonDivisor(numerator, denominator);
        if (divisor > 1 || sign < 0) {
          return {
            expression: Expr.div(integer(numerator / divisor), integer(denominator / divisor)),
            ruleId: "INTEGER_FRACTION_REDUCE",
          };
        }
      }
    }
    return null;
  }

  return { name: "algebra", rules, rewrite };
});
