import type { PricePlan, PriceSegment, Sample } from '../types';

/** 获取某小时（0-23）适用的分时时段段（支持跨午夜段，如 23:00-08:00） */
export function segmentOfHour(segments: PriceSegment[], hour: number): PriceSegment | null {
  for (const seg of segments) {
    const s = Number(seg.start.slice(0, 2));
    const e = Number(seg.end.slice(0, 2));
    if (s <= e) {
      if (hour >= s && hour < e) return seg;
    } else {
      if (hour >= s || hour < e) return seg;
    }
  }
  return null;
}

export function hourOfTimestamp(ts: string): number {
  return Number(ts.slice(11, 13));
}

export interface TouBreakdown {
  total: number;
  bySegment: { key: string; name: string; usage: number; price: number; amount: number }[];
}

/** 分时电费：Σ(各时段有效区间电量 × 时段电价)；缺失小时不计入且提示不完整 */
export function electricityTouCost(samples: Sample[], plan: PricePlan): TouBreakdown {
  if (!plan.segments) return { total: 0, bySegment: [] };
  const map = new Map<string, { key: string; name: string; usage: number; price: number; amount: number }>();
  for (const seg of plan.segments) {
    const key = seg.name;
    if (!map.has(key)) map.set(key, { key: seg.key, name: seg.name, usage: 0, price: seg.price, amount: 0 });
  }
  let total = 0;
  for (const s of samples) {
    if (s.quality === 'missing' || s.quality === 'invalid') continue;
    if (typeof s.value !== 'number' || Number.isNaN(s.value)) continue;
    const seg = segmentOfHour(plan.segments, hourOfTimestamp(s.timestamp));
    if (!seg) continue;
    const entry = map.get(seg.name)!;
    entry.usage += s.value;
    const amount = s.value * seg.price;
    entry.amount += amount;
    total += amount;
  }
  const bySegment = [...map.values()];
  for (const e of bySegment) {
    e.usage = Math.round(e.usage * 10) / 10;
    e.amount = Math.round(e.amount * 100) / 100;
  }
  return { total: Math.round(total * 100) / 100, bySegment };
}

export interface PlanWithValidity { plan: PricePlan }

/** 按“同一对象 + 同能源 + 有效期重叠”校验价格方案冲突 */
export function findPriceOverlap(a: PricePlan, b: PricePlan): boolean {
  if (a.energyType !== b.energyType) return false;
  if (a.id === b.id) return false;
  return !(a.validTo < b.validFrom || b.validTo < a.validFrom);
}

export function activePlanForDate<T extends { energyType: string; validFrom: string; validTo: string }>(
  plans: T[], energyType: string, date: string,
): T | null {
  const matched = plans.filter(
    (p) => p.energyType === energyType && p.validFrom <= date && p.validTo >= date,
  );
  if (matched.length === 0) return null;
  return matched[matched.length - 1];
}