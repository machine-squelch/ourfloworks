import fs from "fs";

export function auditCode(analysis, rulesPath) {
  const rules = JSON.parse(fs.readFileSync(rulesPath, "utf-8"))
    .commissionRules.calculationLogic;

  const violations = [];

  if (!analysis.functions.includes("calculateCommission")) {
    violations.push({
      line: 0,
      offense: "Missing calculateCommission function",
      rule: "STRUCTURE"
    });
  }

  violations.push({
    line: 0,
    offense: "Must branch on purchaseType new vs repeat",
    rule: "PURCHASE_TYPE"
  });

  violations.push({
    line: 0,
    offense: "Must override base rates if isIncentivized === true",
    rule: "INCENTIVE_OVERRIDE"
  });

  violations.push({
    line: 0,
    offense: "Must select tier based on stateMonthlySales",
    rule: "TIERS"
  });

  return violations;
}
