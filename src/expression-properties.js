(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const api = factory(expression);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLExpressionProperties = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr) {
  "use strict";

  const { TYPES, isConstant } = Expr;

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
      case TYPES.SQRT:
        return isProvablyPositive(expression.argument);
      case TYPES.SIN:
        return isProvablyReal(expression.argument);
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

  return {
    realBounds,
    isProvablyReal,
    isProvablyPositive,
    isProvablyNotOne,
    isProvablyNonZero,
    isProvablyPureImaginaryNonZero,
  };
});
