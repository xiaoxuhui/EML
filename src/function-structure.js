(function (root, factory) {
  "use strict";
  const expression = typeof module === "object" && module.exports ? require("./expression.js") : root.EMLExpression;
  const rules = typeof module === "object" && module.exports ? require("./formula-rules.js") : root.EMLFormulaRules;
  const api = factory(expression, rules);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLFunctionStructure = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Expr, Rules) {
  "use strict";

  function expand(node, definitions = []) {
    const available = new Map(definitions.map((definition) => [definition.name, definition]));
    const memo = new WeakMap();
    const error = (message) => ({ type: "error", message });
    function visit(current, bindings, stack, depth) {
      if (!current) return { type: "hole", label: "□" };
      let environments = memo.get(current);
      if (!environments) memo.set(current, environments = new WeakMap());
      let paths = environments.get(bindings);
      if (!paths) environments.set(bindings, paths = new WeakMap());
      if (paths.has(stack)) return paths.get(stack);
      const result = expandNode(current, bindings, stack, depth);
      paths.set(stack, result);
      return result;
    }
    function expandNode(current, bindings, stack, depth) {
      if (current.type === "parameter") {
        const binding = bindings.get(current.name);
        return binding
          ? visit(binding.node, binding.bindings, binding.stack, depth + 1)
          : { type: "parameter", label: current.name };
      }
      if (current.type === "constant") {
        return { type: "constant", label: current.displayText, expression: current.expression, sourceValueId: current.sourceValueId };
      }
      if (current.type === "eml") {
        return { type: "call", label: "EML", inputs: [
          { label: "X", node: visit(current.left, bindings, stack, depth + 1) },
          { label: "Y", node: visit(current.right, bindings, stack, depth + 1) },
        ] };
      }
      if (current.type !== "call") return error("无法识别的表达式节点");
      const target = available.get(current.name);
      if (!target) return error(`函数 ${current.name} 未定义`);
      if (stack.has(current.name)) return error(`函数 ${current.name} 存在循环引用`);
      if (current.arguments.length !== target.parameterNames.length) return error(`函数 ${current.name} 参数数量不匹配`);
      const inputs = target.parameterNames.map((name, index) => ({
        label: name,
        node: visit(current.arguments[index], bindings, stack, depth + 1),
      }));
      // 实参保留调用时的环境，不能被被调函数的同名形参重新捕获。
      const nestedBindings = new Map(target.parameterNames.map((name, index) => [name, {
        node: current.arguments[index], bindings, stack,
      }]));
      return {
        type: "call", label: target.name, inputs,
        body: visit(target.body, nestedBindings, new Set([...stack, current.name]), depth + 1),
      };
    }
    return visit(node, new Map(), new Set(), 0);
  }

  function toEmlTree(structure) {
    const memo = new WeakMap();
    function convert(node) {
      if (memo.has(node)) return memo.get(node);
      const result = convertNode(node);
      memo.set(node, result);
      return result;
    }
    function convertNode(node) {
      if (node.body) return convert(node.body);
      if (node.type === "call") {
        const inputs = node.inputs.map((input) => convert(input.node));
        const invalid = inputs.find((input) => !input.expression);
        if (invalid) return { type: "eml", result: "未定义", expression: null, inputs, error: "输入未定义" };
        if (Expr.isInteger(inputs[1].expression, 0)) {
          return { type: "eml", result: "未定义", expression: null, inputs, error: "ln(0) 未定义" };
        }
        const expression = Rules.simplify(Expr.sub(Expr.pow(Expr.E, inputs[0].expression), Expr.ln(inputs[1].expression))).expression;
        return { type: "eml", result: Expr.render(expression), expression, inputs };
      }
      return {
        type: "value", label: node.message || node.label,
        expression: node.expression || (!node.message ? Expr.symbol(node.label) : null),
        ...(node.type === "constant" ? { sourceValueId: node.sourceValueId, provenance: "definition-constant" } : {}),
      };
    }
    return convert(structure);
  }

  return { expand, toEmlTree };
});
