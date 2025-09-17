import { calculateCommission } from "../agents/calculateCommission.js";

console.log(
  calculateCommission(1000, 12000, "new", false),
  calculateCommission(1000, 12000, "repeat", false),
  calculateCommission(1000, 52000, "new", true, 0.04)
);
