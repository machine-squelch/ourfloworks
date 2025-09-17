import fs from "fs";
import acorn from "acorn";

export function analyzeCode(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");
  const ast = acorn.parse(code, { ecmaVersion: "latest", sourceType: "module" });

  const functions = [];
  walkAST(ast, node => {
    if (node.type === "FunctionDeclaration") functions.push(node.id.name);
  });

  return { functions, sideEffects: [], dataFlow: "TODO" };
}

function walkAST(node, fn) {
  fn(node);
  for (const key in node) {
    const child = node[key];
    if (Array.isArray(child)) child.forEach(n => n?.type && walkAST(n, fn));
    else if (child?.type) walkAST(child, fn);
  }
}
