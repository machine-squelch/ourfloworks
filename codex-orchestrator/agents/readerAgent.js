import fs from "fs";

export function analyzeCode(filePath) {
  const code = fs.readFileSync(filePath, "utf-8");

  const functions = [];
  const functionPattern = /function\s+([A-Za-z0-9_]+)/g;
  let match;
  while ((match = functionPattern.exec(code))) {
    functions.push(match[1]);
  }

  return { functions, sideEffects: [], dataFlow: "TODO" };
}
