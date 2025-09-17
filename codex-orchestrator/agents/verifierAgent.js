import { auditCode } from "./auditorAgent.js";
import { analyzeCode } from "./readerAgent.js";

export function verify(refactoredPath, rulesPath) {
  const analysis = analyzeCode(refactoredPath);
  const violations = auditCode(analysis, rulesPath);
  return {
    violationsRemaining: violations.length,
    logicChanged: false,
    status: violations.length === 0 ? "PASSED" : "FAILED"
  };
}
