import type { Quality } from './types';

export const QUALITY_LABEL: Record<Quality, string> = {
  valid: '有效',
  missing: '缺失',
  estimated: '估算',
  invalid: '无效',
  manual_corrected: '人工修正',
};

export const QUALITY_COLOR: Record<Quality, string> = {
  valid: 'green',
  missing: 'default',
  estimated: 'gold',
  invalid: 'red',
  manual_corrected: 'blue',
};

/** 是否计入统计总量（计入不代表无质量提示） */
export function countsInTotal(q: Quality): boolean {
  return q === 'valid' || q === 'estimated' || q === 'manual_corrected';
}

export function worstQuality(qs: Quality[]): Quality | null {
  const order: Quality[] = ['valid', 'manual_corrected', 'estimated', 'invalid', 'missing'];
  let idx = -1;
  for (const q of qs) {
    const i = order.indexOf(q);
    if (i > idx) idx = i;
  }
  return idx === -1 ? null : order[idx];
}