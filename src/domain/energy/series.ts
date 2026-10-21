import type { PeriodUsage, Quality, Sample } from '../types';
import { countsInTotal } from '../quality';

/** 区间序列求和（缺失/无效不计入，估算与人工修正计入并保留标记） */
export function summarize(samples: Sample[]): PeriodUsage {
  let total = 0;
  let counted = 0;
  let hasMissing = false;
  let hasEstimated = false;
  let hasInvalid = false;
  let hasManualCorrected = false;
  for (const s of samples) {
    if (s.quality === 'missing') { hasMissing = true; continue; }
    if (s.quality === 'invalid') { hasInvalid = true; continue; }
    if (s.quality === 'estimated') hasEstimated = true;
    if (s.quality === 'manual_corrected') hasManualCorrected = true;
    if (typeof s.value === 'number' && !Number.isNaN(s.value)) {
      total += s.value;
      counted++;
    }
  }
  const expected = samples.length;
  return {
    total: expected === 0 ? null : total,
    coverage: expected === 0 ? 0 : counted / expected,
    counted,
    expected,
    hasMissing,
    hasEstimated,
    hasInvalid,
    hasManualCorrected,
    incomplete: hasMissing || hasInvalid || expected === 0,
    partial: false,
  };
}

export function sumPeriodUsage(usages: PeriodUsage[]): PeriodUsage {
  let total = 0;
  let counted = 0;
  let expected = 0;
  let hasMissing = false;
  let hasEstimated = false;
  let hasInvalid = false;
  let hasManualCorrected = false;
  let anyNull = true;
  for (const u of usages) {
    if (u.total !== null) { total += u.total; anyNull = false; }
    counted += u.counted;
    expected += u.expected;
    hasMissing = hasMissing || u.hasMissing;
    hasEstimated = hasEstimated || u.hasEstimated;
    hasInvalid = hasInvalid || u.hasInvalid;
    hasManualCorrected = hasManualCorrected || u.hasManualCorrected;
  }
  return {
    total: anyNull ? null : total,
    coverage: expected === 0 ? 0 : counted / expected,
    counted,
    expected,
    hasMissing,
    hasEstimated,
    hasInvalid,
    hasManualCorrected,
    incomplete: hasMissing || hasInvalid,
    partial: false,
  };
}

export interface CumulativeReading { timestamp: string; value: number; quality?: Quality }
export interface SwapEvent { at: string; newBase: number }

/**
 * 累计量差分：区间用量 = 期末有效读数 - 期初有效读数。
 * 遇换表事件按事件规则切换基线，换表期间未知用量段不计入；
 * 读数回卷/归零不产生负用量（无换表记录的负差值视为异常样本，不计入）。
 * 若无有效读数覆盖则返回 null（缺失不默认为0）。
 */
export function cumulativeToInterval(
  readings: CumulativeReading[],
  swaps: SwapEvent[],
): number | null {
  if (readings.length < 2) return null;
  const sorted = [...readings].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  const sw = [...swaps].sort((a, b) => (a.at < b.at ? -1 : 1));
  let total = 0;
  let sawAny = false;
  let prev: { t: string; v: number } | null = null;
  for (const r of sorted) {
    if (r.quality === 'invalid' || r.quality === 'missing') continue;
    sawAny = true;
    if (prev) {
      const prevT = prev.t;
      const swapBetween = sw.find((s) => s.at > prevT && s.at <= r.timestamp);
      if (!swapBetween) {
        const delta = r.value - prev.v;
        if (delta >= 0) total += delta;
      } else {
        // 换表规则：换表时刻起新表从 newBase 起算，旧表换表前未知用量段不计入
        const delta = r.value - swapBetween.newBase;
        if (delta >= 0) total += delta;
      }
    }
    prev = { t: r.timestamp, v: r.value };
  }
  return sawAny ? total : null;
}

/** 瞬时量不得直接求和当区间量：返回 null 由调用方决定积分策略 */
export function instantaneousToInterval(samples: Sample[]): number | null {
  return null;
}