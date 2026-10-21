import type { PeriodUsage } from './types';

/** 同比/环比：(本期 - 基期) / 基期 ×100%；基期为0或缺失时返回 null（显示“不可计算”） */
export function pctChange(current: number | null, base: number | null): number | null {
  if (current === null || base === null) return null;
  if (base === 0) return null;
  return ((current - base) / base) * 100;
}

/** 单位面积强度：面积无效（0/缺失）时返回 null */
export function intensity(usage: number | null, area: number | null | undefined): number | null {
  if (usage === null || !area || area <= 0) return null;
  return usage / area;
}

/** 人均指标：人数分母无效时返回 null */
export function perCapita(usage: number | null, people: number | null | undefined): number | null {
  if (usage === null || people === null || people === undefined || people <= 0) return null;
  return usage / people;
}

/** 占比：分母无效时返回 null */
export function share(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total === 0) return null;
  return (part / total) * 100;
}

export function usageOf(p: PeriodUsage): number | null {
  return p.total;
}

export function rankBy<T>(items: T[], value: (t: T) => number | null, desc = true): (T & { rank: number })[] {
  const sorted = [...items].sort((a, b) => {
    const va = value(a) ?? -Infinity;
    const vb = value(b) ?? -Infinity;
    return desc ? vb - va : va - vb;
  });
  return sorted.map((t, i) => ({ ...t, rank: i + 1 }));
}