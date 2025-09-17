export function calculateCommission(
  lineSubtotal,
  stateMonthlySales,
  purchaseType,
  isIncentivized,
  incentiveRateOverride = null
) {
  if (!["new", "repeat"].includes(purchaseType))
    throw new Error("Invalid purchaseType");

  const baseRates = [
    { min: 0, max: 9999, repeat: 0.02,  new: 0.03  },
    { min: 10000, max: 49999, repeat: 0.01,  new: 0.02  },
    { min: 50000, max: Infinity, repeat: 0.005, new: 0.015 }
  ];

  const stateBonuses = [
    { min: 10000, max: 49999, bonus: 100 },
    { min: 50000, max: Infinity, bonus: 300 }
  ];

  let rate;
  if (isIncentivized) {
    rate = incentiveRateOverride ?? 0.03;
  } else {
    const tier = baseRates.find(t => stateMonthlySales >= t.min && stateMonthlySales <= t.max);
    rate = tier[purchaseType];
  }

  const commission = lineSubtotal * rate;

  const bonusRule = stateBonuses.find(b => stateMonthlySales >= b.min && stateMonthlySales <= b.max);
  const bonus = bonusRule ? bonusRule.bonus : 0;

  return { commission, appliedRate: rate, bonus };
}
