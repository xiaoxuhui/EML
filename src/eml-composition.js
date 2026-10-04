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
    if (node.type === "eml") return `EML(${renderBody(node.left)}, ${renderBody(node.right)})`;
    return `${node.name}(${node.arguments.map(renderBody).join(", ")})`;
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
      if (!consume("(")) {
        if (!parameterNames.includes(token)) return { error: `参数或函数 ${token} 未声明。` };
        return { node: { type: "parameter", name: token } };
      }
      const argumentsList = [];
      while (true) {
        const argument = parseBody(depth + 1);
        if (argument.error) return argument;
        argumentsList.push(argument.node);
        if (consume(")")) break;
        if (!consume(",")) return { error: `${token} 的参数之间需要逗号。` };
      }
      if (token === "EML") {
        if (argumentsList.length !== 2) return { error: "EML 需要两个参数。" };
        return { node: { type: "eml", left: argumentsList[0], right: argumentsList[1] } };
      }
      if (parameterNames.includes(token)) return { error: `参数 ${token} 不能作为函数调用。` };
      return { node: { type: "call", name: token, arguments: argumentsList } };
    }

    const body = parseBody(1);
    if (body.error) return fail(body.error);
    skipWhitespace();
    if (index !== source.length) return fail("函数定义末尾存在无法识别的内容。");
    if (!["eml", "call"].includes(body.node.type)) return fail("函数体至少需要一个 EML 或已定义函数调用。");

    const definition = { name, parameterNames, body: body.node };
    const displayText = renderDefinition(definition);
    return {
      ok: true,
      definition: { ...definition, displayText, canonicalKey: displayText.replace(/\s/g, "") },
    };
  }

  function definitionMap(definitions) {
    if (definitions instanceof Map) return definitions;
    return new Map((Array.isArray(definitions) ? definitions : []).map((item) => [item.name, item]));
  }

  function renderExpandedBody(node, bindings, definitions, callStack = new Set()) {
    if (node.type === "parameter") return bindings.get(node.name) || node.name;
    if (node.type === "constant") return node.displayText;
    if (node.type === "eml") {
      return `EML(${renderExpandedBody(node.left, bindings, definitions, callStack)}, ${renderExpandedBody(node.right, bindings, definitions, callStack)})`;
    }
    const target = definitions.get(node.name);
    if (!target || callStack.has(node.name)) return `${node.name}(${node.arguments.map((argument) => renderExpandedBody(argument, bindings, definitions, callStack)).join(", ")})`;
    const argumentTexts = node.arguments.map((argument) => renderExpandedBody(argument, bindings, definitions, callStack));
    const targetBindings = new Map(target.parameterNames.map((name, index) => [name, argumentTexts[index]]));
    return renderExpandedBody(target.body, targetBindings, definitions, new Set([...callStack, node.name]));
  }

  function validateDefinitionCalls(definition, definitions) {
    const available = definitionMap(definitions);
    let error = "";
    function visit(node) {
      if (error || node.type === "parameter" || node.type === "constant") return;
      if (node.type === "eml") {
        visit(node.left);
        visit(node.right);
        return;
      }
      if (node.name === definition.name) {
        error = `函数 ${definition.name} 不能调用自身。`;
        return;
      }
      const target = available.get(node.name);
      if (!target) {
        error = `函数 ${node.name} 尚未定义。`;
        return;
      }
      if (target.parameterNames.length !== node.arguments.length) {
        error = `函数 ${node.name} 需要 ${target.parameterNames.length} 个参数。`;
        return;
      }
      node.arguments.forEach(visit);
    }
    visit(definition.body);
    return error ? { ok: false, error } : { ok: true };
  }

  function evaluate(definition, inputExpressions, definitions, callStack = new Set()) {
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
    const available = definitionMap(definitions);

    function evaluateNode(node) {
      if (node.type === "parameter") {
        const expression = inputs.get(node.name);
        return { ok: true, expression, rewriteSteps: [], limitReached: false, emlTree: { type: "value", label: Expr.render(expression), parameterName: node.name } };
      }
      if (node.type === "constant") {
        return { ok: true, expression: node.expression, rewriteSteps: [], limitReached: false, emlTree: { type: "value", label: node.displayText } };
      }
      if (node.type === "call") {
        const target = available.get(node.name);
        if (!target) return { ok: false, error: `函数 ${node.name} 尚未定义。` };
        if (callStack.has(node.name)) return { ok: false, error: "函数调用存在循环引用。" };
        const argumentsResult = node.arguments.map(evaluateNode);
        const failed = argumentsResult.find((result) => !result.ok);
        if (failed) return failed;
        const nested = evaluate(target, argumentsResult.map((result) => result.expression), available, new Set([...callStack, definition.name]));
        if (!nested.ok) return nested;
        return {
          ok: true,
          expression: nested.resultExpression,
          rawExpression: nested.rawExpression,
          rewriteSteps: [...argumentsResult.flatMap((result) => result.rewriteSteps), ...nested.rewriteSteps],
          limitReached: argumentsResult.some((result) => result.limitReached) || nested.limitReached,
          emlTree: nested.emlTree,
        };
      }
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
        emlTree: {
          type: "eml",
          result: Expr.render(result.resultExpression),
          inputs: [left.emlTree, right.emlTree],
        },
      };
    }

    const calculated = evaluateNode(definition.body);
    if (!calculated.ok) return calculated;
    const displayText = Expr.render(calculated.expression);
    const inputText = inputExpressions.map((expression) => Expr.render(expression)).join(", ");
    const callText = `${definition.name}(${inputText})`;
    const expandedBody = renderExpandedBody(
      definition.body,
      new Map(definition.parameterNames.map((name, index) => [name, Expr.render(inputExpressions[index])])),
      available
    );
    const expandedFormula = `${expandedBody} = ${displayText}`;
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
      // 函数名只属于调用控件；保存与展开的计算过程统一从实际 EML 式开始。
      directFormula: expandedFormula,
      expandedFormula,
      emlTree: calculated.emlTree,
      rewriteSteps: [
        ...(expandedBody === callText ? [] : [{ ruleId: "FUNCTION_EXPANSION", before: callText, after: expandedBody }]),
        ...calculated.rewriteSteps,
      ],
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
    validateDefinitionCalls,
    renderBody,
    renderDefinition,
    renderExpandedBody,
    evaluate,
  };
});
