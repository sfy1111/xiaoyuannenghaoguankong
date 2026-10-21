import type { EnergyType, PeriodUsage, Sample } from './types';
import { summarize } from './energy/series';
import { electricityTouCost } from './energy/tou';

/** 单价费用（水、气等）：缺失/无效不计入，返回金额与参与计算的用量 */
export function simpleCost(samples: Sample[], price: number): { amount: number; usage: number; incomplete: boolean } {
  const s = summarize(samples);
  const usage = s.total ?? 0;
  return {
    amount: Math.round(usage * price * 100) / 100,
    usage,
    incomplete: s.incomplete,
  };
}

export interface CostEstimate {
  energyType: EnergyType;
  amount: number;
  incomplete: boolean;
  bySegment?: { name: string; amount: number }[];
}

export interface BillCompare {
  billedUsage: number;
  billedAmount: number;
  estimatedAmount: number;
  difference: number;
  differencePct: number | null;
}

/** 账单对账：账单金额固定不随价格调整变化，差异 = 账单 - 平台测算 */
export function compareBill(estimate: number, usageDeltaPct: number, extraFee: number, usagePriceFactor: number): BillCompare {
  const billedUsage = Math.round(estimate * usagePriceFactor * (1 + usageDeltaPct));
  const billedAmount = Math.round((estimate * (1 + usageDeltaPct) + extraFee) * 100) / 100;
  const difference = Math.round((billedAmount - estimate) * 100) / 100;
  return {
    billedUsage,
    billedAmount,
    estimatedAmount: estimate,
    difference,
    differencePct: estimate === 0 ? null : Math.round((difference / estimate) * 10000) / 100,
  };
}

export function classifyDifference(diff: number, extraFee: number, usageDeltaPct: number): string[] {
  const parts: string[] = [];
  if (Math.abs(extraFee) > 0.01) parts.push('固定/附加费用项');
  if (Math.abs(usageDeltaPct) > 0.0001) parts.push('用量差（抄见量口径）');
  if (parts.length === 0 && Math.abs(diff) > 0.01) parts.push('价格或计量期错位差');
  if (parts.length === 0) parts.push('一致');
  return parts;
}