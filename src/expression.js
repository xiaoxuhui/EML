(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLExpression = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TYPES = Object.freeze({
    CONSTANT: "constant",
    INTEGER: "integer",
    NEG: "neg",
    ADD: "add",
    SUB: "sub",
    MUL: "mul",
    DIV: "div",
    POW: "pow",
    LN: "ln",
    SQRT: "sqrt",
  });

  const constant = (name) => ({ type: TYPES.CONSTANT, name });
  const integer = (value) => ({ type: TYPES.INTEGER, value: Number(value) });
  const neg = (child) => ({ type: TYPES.NEG, child });
  const add = (left, right) => ({ type: TYPES.ADD, left, right });
  const sub = (left, right) => ({ type: TYPES.SUB, left, right });
  const mul = (left, right) => ({ type: TYPES.MUL, left, right });
  const div = (numerator, denominator) => ({ type: TYPES.DIV, numerator, denominator });
  const pow = (base, exponent) => ({ type: TYPES.POW, base, exponent });
  const ln = (argument) => ({ type: TYPES.LN, argument });
  const sqrt = (argument) => ({ type: TYPES.SQRT, argument });

  const ONE = integer(1);
  const ZERO = integer(0);
  const E = constant("e");
  const PI = constant("pi");
  const I = constant("i");

  function canonicalKey(expression) {
    switch (expression.type) {
      case TYPES.CONSTANT:
        return `const:${expression.name}`;
      case TYPES.INTEGER:
        return `int:${expression.value}`;
      case TYPES.NEG:
        return `neg(${canonicalKey(expression.child)})`;
      case TYPES.ADD: {
        const keys = [canonicalKey(expression.left), canonicalKey(expression.right)].sort();
        return `add(${keys[0]},${keys[1]})`;
      }
      case TYPES.SUB:
        return `sub(${canonicalKey(expression.left)},${canonicalKey(expression.right)})`;
      case TYPES.MUL: {
        const keys = [canonicalKey(expression.left), canonicalKey(expression.right)].sort();
        return `mul(${keys[0]},${keys[1]})`;
      }
      case TYPES.DIV:
        return `div(${canonicalKey(expression.numerator)},${canonicalKey(expression.denominator)})`;
      case TYPES.POW:
        return `pow(${canonicalKey(expression.base)},${canonicalKey(expression.exponent)})`;
      case TYPES.LN:
        return `ln(${canonicalKey(expression.argument)})`;
      case TYPES.SQRT:
        return `sqrt(${canonicalKey(expression.argument)})`;
      default:
        throw new Error(`未知表达式类型：${expression.type}`);
    }
  }

  const isSame = (left, right) => canonicalKey(left) === canonicalKey(right);
  const isInteger = (expression, value) => expression.type === TYPES.INTEGER && expression.value === value;
  const isConstant = (expression, name) => expression.type === TYPES.CONSTANT && expression.name === name;

  function precedence(expression) {
    if ([TYPES.ADD, TYPES.SUB].includes(expression.type)) return 1;
    if ([TYPES.MUL, TYPES.DIV].includes(expression.type)) return 2;
    if (expression.type === TYPES.POW) return 3;
    return 4;
  }

  function render(expression, parentPrecedence = 0) {
    const ownPrecedence = precedence(expression);
    let text;
    switch (expression.type) {
      case TYPES.CONSTANT:
        text = expression.name === "pi" ? "π" : expression.name;
        break;
      case TYPES.INTEGER:
        text = String(expression.value);
        break;
      case TYPES.NEG:
        if (expression.child.type === TYPES.NEG) {
          text = `-(${render(expression.child)})`;
        } else if (
          expression.child.type === TYPES.MUL &&
          [expression.child.left, expression.child.right].every((part) =>
            [TYPES.CONSTANT, TYPES.INTEGER].includes(part.type)
          )
        ) {
          text = `-${render(expression.child, 2)}`;
        } else {
          text = `-${render(expression.child, ownPrecedence)}`;
        }
        break;
      case TYPES.ADD:
        text = `${render(expression.left, ownPrecedence)} + ${render(expression.right, ownPrecedence)}`;
        break;
      case TYPES.SUB:
        text = `${render(expression.left, ownPrecedence)} - ${render(expression.right, ownPrecedence + 1)}`;
        break;
      case TYPES.MUL: {
        const leftText = render(expression.left, ownPrecedence);
        const rightText = render(expression.right, ownPrecedence);
        const compact = [expression.left, expression.right].every((part) =>
          [TYPES.CONSTANT, TYPES.INTEGER].includes(part.type)
        );
        text = compact ? `${leftText}${rightText}` : `${leftText} × ${rightText}`;
        break;
      }
      case TYPES.DIV:
        text = `${render(expression.numerator, ownPrecedence)} / ${render(expression.denominator, ownPrecedence + 1)}`;
        break;
      case TYPES.POW: {
        const baseText = render(expression.base, ownPrecedence);
        const exponentText = render(expression.exponent);
        text = `${baseText}^(${exponentText})`;
        break;
      }
      case TYPES.LN:
        text = `ln(${render(expression.argument)})`;
        break;
      case TYPES.SQRT:
        text = `√(${render(expression.argument)})`;
        break;
      default:
        throw new Error(`未知表达式类型：${expression.type}`);
    }
    return ownPrecedence < parentPrecedence ? `(${text})` : text;
  }

  function approximate(expression) {
    const make = (re, im = 0) => ({ re, im });
    const addComplex = (a, b) => make(a.re + b.re, a.im + b.im);
    const subComplex = (a, b) => make(a.re - b.re, a.im - b.im);
    const mulComplex = (a, b) => make(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
    const divComplex = (a, b) => {
      const denominator = b.re * b.re + b.im * b.im;
      if (denominator === 0) return null;
      return make(
        (a.re * b.re + a.im * b.im) / denominator,
        (a.im * b.re - a.re * b.im) / denominator
      );
    };
    const expComplex = (z) => {
      const scale = Math.exp(z.re);
      return make(scale * Math.cos(z.im), scale * Math.sin(z.im));
    };
    const logComplex = (z) => {
      const magnitudeSquared = z.re * z.re + z.im * z.im;
      if (magnitudeSquared === 0) return null;
      return make(0.5 * Math.log(magnitudeSquared), Math.atan2(z.im, z.re));
    };

    switch (expression.type) {
      case TYPES.CONSTANT:
        if (expression.name === "e") return make(Math.E);
        if (expression.name === "pi") return make(Math.PI);
        if (expression.name === "i") return make(0, 1);
        return null;
      case TYPES.INTEGER:
        return make(expression.value);
      case TYPES.NEG: {
        const value = approximate(expression.child);
        return value ? make(-value.re, -value.im) : null;
      }
      case TYPES.ADD: {
        const left = approximate(expression.left);
        const right = approximate(expression.right);
        return left && right ? addComplex(left, right) : null;
      }
      case TYPES.SUB: {
        const left = approximate(expression.left);
        const right = approximate(expression.right);
        return left && right ? subComplex(left, right) : null;
      }
      case TYPES.MUL: {
        const left = approximate(expression.left);
        const right = approximate(expression.right);
        return left && right ? mulComplex(left, right) : null;
      }
      case TYPES.DIV: {
        const numerator = approximate(expression.numerator);
        const denominator = approximate(expression.denominator);
        return numerator && denominator ? divComplex(numerator, denominator) : null;
      }
      case TYPES.POW: {
        const base = approximate(expression.base);
        const exponent = approximate(expression.exponent);
        if (!base || !exponent) return null;
        if (Math.abs(base.re - Math.E) < 1e-12 && Math.abs(base.im) < 1e-12) return expComplex(exponent);
        const logBase = logComplex(base);
        return logBase ? expComplex(mulComplex(exponent, logBase)) : null;
      }
      case TYPES.LN: {
        const argument = approximate(expression.argument);
        return argument ? logComplex(argument) : null;
      }
      case TYPES.SQRT: {
        const argument = approximate(expression.argument);
        if (!argument) return null;
        const magnitude = Math.hypot(argument.re, argument.im);
        return make(
          Math.sqrt((magnitude + argument.re) / 2),
          Math.sign(argument.im || 1) * Math.sqrt(Math.max(0, (magnitude - argument.re) / 2))
        );
      }
      default:
        return null;
    }
  }

  function isValidExpression(expression) {
    try {
      canonicalKey(expression);
      return true;
    } catch {
      return false;
    }
  }

  return {
    TYPES,
    constant,
    integer,
    neg,
    add,
    sub,
    mul,
    div,
    pow,
    ln,
    sqrt,
    ONE,
    ZERO,
    E,
    PI,
    I,
    canonicalKey,
    isSame,
    isInteger,
    isConstant,
    render,
    approximate,
    isValidExpression,
  };
});
