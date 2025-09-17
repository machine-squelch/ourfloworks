export function refactorCode(originalCode, violations) {
  let refactored = originalCode;
  violations.forEach(v => {
    if (v.offense.includes("var")) {
      refactored = refactored.replace(/\bvar\b/g, "let");
    }
  });
  return refactored;
}
