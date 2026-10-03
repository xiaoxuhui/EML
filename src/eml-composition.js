(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports
    ? require("./expression.js")
    : root.EMLExpression;
  const evaluator = typeof module === "object" && module.exports
    ? require("./evaluator.js")
    : root.EMLEvaluator;
  const api = factory(expression, evaluator);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLComposition = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, Evaluator) {
  "use strict";

  const MAX_PARAMETERS = 6;
  const MAX_NESTING = 16;
  const MAX_DEFINITION_LENGTH = 1000;
  const IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

  function renderBody(node) {
    if (node.type === "parameter") return node.name;
    if (node.type === "constant") return node.displayText;
    return `EML(${renderBody(node.left)}, ${renderBody(node.right)})`;
  }

  function renderDefinition(definition) {
    return `${definition.name}(${definition.parameterNames.join(", ")}) = ${renderBody(definition.body)}`;
  }

  function parseDefinition(text) {
    if (typeof text !== "string" || text.trim().length === 0) {
      return { ok: false, error: "请输入 EML 组合函数定义。" };
    }
    if (text.length > MAX_DEFINITION_LENGTH) return { ok: false, error: "函数定义过长。" };

    let index = 0;
    const source = text.trim();
    const skipWhitespace = () => {
      while (/\s/.test(source[index] || "")) index += 1;
    };
    const consume = (token) => {
      skipWhitespace();
      if (!source.startsWith(token, index)) return false;
      index += token.length;
      return true;
    };
    const identifier = () => {
      skipWhitespace();
      const match = /^[A-Za-z][A-Za-z0-9_]*/.exec(source.slice(index));
      if (!match) return null;
      index += match[0].length;
      return match[0];
    };
    const fail = (error) => ({ ok: false, error });

    const name = identifier();
    if (!name) return fail("函数名必须以英文字母开头。");
    if (!consume("(")) return fail("函数名后需要左括号。");

    const parameterNames = [];
    while (true) {
      const parameter = identifier();
      if (!parameter) return fail("参数名必须以英文字母开头。");
      if (parameter === "EML") return fail("EML 是保留名称，不能作为参数名。");
      if (parameterNames.includes(parameter)) return fail(`参数 ${parameter} 重复。`);
      parameterNames.push(parameter);
      if (parameterNames.length > MAX_PARAMETERS) return fail(`最多支持 ${MAX_PARAMETERS} 个参数。`);
      if (consume(")")) break;
      if (!consume(",")) return fail("参数之间需要逗号。");
    }
    if (!consume("=")) return fail("参数列表后需要等号。");

    function parseBody(depth) {
      if (depth > MAX_NESTING) return { error: `EML 嵌套不能超过 ${MAX_NESTING} 层。` };
      skipWhitespace();
      const constants = [
        ["1", Expr.ONE, "1"],
        ["0", Expr.ZERO, "0"],
        ["π", Expr.PI, "π"],
      ];
      for (const [token, expression, displayText] of constants) {
        if (source.startsWith(token, index)) {
          index += token.length;
          return { node: { type: "constant", expression, displayText } };
        }
      }
      const token = identifier();
      if (!token) return { error: "函数体只能使用参数名或 EML(...)。" };
      if (token === "e") return { node: { type: "constant", expression: Expr.E, displayText: "e" } };
      if (token === "i") return { node: { type: "constant", expression: Expr.I, displayText: "i" } };
      if (token === "pi") return { node: { type: "constant", expression: Expr.PI, displayText: "π" } };
      if (token !== "EML") {
        if (!parameterNames.includes(token)) return { error: `参数 ${token} 未声明。` };
        return { node: { type: "parameter", name: token } };
      }
      if (!consume("(")) return { error: "EML 后需要左括号。" };
      const left = parseBody(depth + 1);
      if (left.error) return left;
      if (!consume(",")) return { error: "EML 的两个参数之间需要逗号。" };
      const right = parseBody(depth + 1);
      if (right.error) return right;
      if (!consume(")")) return { error: "EML 调用缺少右括号。" };
      return { node: { type: "eml", left: left.node, right: right.node } };
    }

    const body = parseBody(1);
    if (body.error) return fail(body.error);
    skipWhitespace();
    if (index !== source.length) return fail("函数定义末尾存在无法识别的内容。");
    if (body.node.type !== "eml") return fail("函数体至少需要一个 EML 调用。");

    const definition = { name, parameterNames, body: body.node };
    const displayText = renderDefinition(definition);
    return {
      ok: true,
      definition: { ...definition, displayText, canonicalKey: displayText.replace(/\s/g, "") },
    };
  }

  function evaluate(definition, inputExpressions) {
    if (!definition || !Array.isArray(definition.parameterNames) || !definition.body) {
      return { ok: false, error: "函数定义无效。" };
    }
    if (!Array.isArray(inputExpressions) || inputExpressions.length !== definition.parameterNames.length) {
      return { ok: false, error: "函数输入数量不匹配。" };
    }
    if (inputExpressions.some((expression) => !Expr.isValidExpression(expression))) {
      return { ok: false, error: "函数输入无效。" };
    }
    const inputs = new Map(definition.parameterNames.map((name, index) => [name, inputExpressions[index]]));

    function evaluateNode(node) {
      if (node.type === "parameter") return { ok: true, expression: inputs.get(node.name), rewriteSteps: [], limitReached: false };
      if (node.type === "constant") return { ok: true, expression: node.expression, rewriteSteps: [], limitReached: false };
      const left = evaluateNode(node.left);
      if (!left.ok) return left;
      const right = evaluateNode(node.right);
      if (!right.ok) return right;
      const result = Evaluator.evaluateEML(left.expression, right.expression);
      if (!result.ok) return result;
      return {
        ok: true,
        expression: result.resultExpression,
        rawExpression: result.rawExpression,
        rewriteSteps: [...left.rewriteSteps, ...right.rewriteSteps, ...result.rewriteSteps],
        limitReached: left.limitReached || right.limitReached || result.limitReached,
      };
    }

    const calculated = evaluateNode(definition.body);
    if (!calculated.ok) return calculated;
    const displayText = Expr.render(calculated.expression);
    const inputText = inputExpressions.map((expression) => Expr.render(expression)).join(", ");
    return {
      ok: true,
      operation: "EML_COMPOSITION",
      functionDefinition: definition.displayText || renderDefinition(definition),
      definitionKey: definition.canonicalKey || renderDefinition(definition).replace(/\s/g, ""),
      parameterNames: [...definition.parameterNames],
      inputExpressions,
      rawExpression: calculated.rawExpression || calculated.expression,
      resultExpression: calculated.expression,
      canonicalKey: Expr.canonicalKey(calculated.expression),
      displayText,
      directFormula: `${definition.name}(${inputText}) = ${displayText}`,
      rewriteSteps: calculated.rewriteSteps,
      limitReached: calculated.limitReached,
      approximation: Expr.approximate(calculated.expression),
    };
  }

  return {
    MAX_PARAMETERS,
    MAX_NESTING,
    MAX_DEFINITION_LENGTH,
    IDENTIFIER,
    parseDefinition,
    renderBody,
    renderDefinition,
    evaluate,
  };
});
