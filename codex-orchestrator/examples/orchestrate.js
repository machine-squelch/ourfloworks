#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { analyzeCode } from "../agents/readerAgent.js";
import { auditCode } from "../agents/auditorAgent.js";
import { refactorCode } from "../agents/refactorAgent.js";
import { verify } from "../agents/verifierAgent.js";

const targetFile = process.argv[2];
if (!targetFile) {
  console.error("Usage: node orchestrate.js <file.js>");
  process.exit(1);
}

const rulesPath = path.resolve(
  new URL("../rules/commission-rules.json", import.meta.url).pathname,
);
const code = fs.readFileSync(targetFile, "utf-8");

console.log("🔍 Analyzing...");
const analysis = analyzeCode(targetFile);

console.log("🧾 Auditing...");
const violations = auditCode(analysis, rulesPath);

if (!violations.length) {
  console.log("✅ No violations found.");
  process.exit(0);
}

console.table(violations);

console.log("🛠 Refactoring...");
const refactored = refactorCode(code, violations);
const out = targetFile.replace(/\.js$/, ".refactored.js");
fs.writeFileSync(out, refactored);

console.log("🔁 Verifying...");
const result = verify(out, rulesPath);
console.log(result);
