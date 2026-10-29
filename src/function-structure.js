(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.EMLFunctionStructure = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MAX_NODES = 512;
  const MAX_DEPTH = 32;

  function expand(node, definitions = []) {
    const available = new Map(definitions.map((definition) => [definition.name, definition]));
    let remaining = MAX_NODES;
    const error = (message) => ({ type: "error", message });
    function visit(current, bindings, stack, depth) {
      if (--remaining < 0 || depth > MAX_DEPTH) return error("结构展开已达到安全上限");
      if (!current) return { type: "hole", label: "□" };
      if (current.type === "parameter") {
        const binding = bindings.get(current.name);
        return binding
          ? visit(binding.node, binding.bindings, binding.stack, depth + 1)
          : { type: "parameter", label: current.name };
      }
      if (current.type === "constant") {
        return { type: "constant", label: current.displayText, expression: current.expression };
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

  return { expand, MAX_NODES, MAX_DEPTH };
});
