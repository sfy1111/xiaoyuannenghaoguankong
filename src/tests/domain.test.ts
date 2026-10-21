import { describe, expect, it } from 'vitest';
import { cumulativeToInterval, summarize } from '../domain/energy/series';
import { electricityTouCost, activePlanForDate, segmentOfHour } from '../domain/energy/tou';
import { pctChange, intensity, perCapita, share } from '../domain/analysis';
import { compareBill, classifyDifference, simpleCost } from '../domain/costs';
import { resolveDay } from '../domain/calendar';
import { boundaryBreakdown, deduplicatePoints } from '../domain/energy/boundaries';
import type { MeteringPoint, MeterRelation, Sample } from '../domain/types';
import calendarData from '../data/campusCalendar.json';
import pricesData from '../data/prices.json';
import type { PricePlan } from '../domain/types';

const emptySample = (quality: Sample['quality']): Sample => ({ timestamp: '2026-06-01T08:00:00+08:00', value: quality === 'missing' ? null : 10, quality });

describe('累计量差分', () => {
  it('期末-期初：1000 → 1068 输出 68 kWh', () => {
    const r = cumulativeToInterval([
      { timestamp: '2026-06-01T00:00:00+08:00', value: 1000 },
      { timestamp: '2026-06-02T00:00:00+08:00', value: 1068 },
    ], []);
    expect(r).toBe(68);
  });

  it('换表归零不产生负用电量', () => {
    const r = cumulativeToInterval([
      { timestamp: '2026-06-01T00:00:00+08:00', value: 1000 },
      { timestamp: '2026-06-01T12:00:00+08:00', value: 1050 },
      { timestamp: '2026-06-02T00:00:00+08:00', value: 30 },
    ], [{ at: '2026-06-01T18:00:00+08:00', newBase: 0 }]);
    expect(r).not.toBeLessThan(0);
    expect(r).toBe(80);
  });

  it('无换表记录的回卷不计入统计', () => {
    const r = cumulativeToInterval([
      { timestamp: '2026-06-01T00:00:00+08:00', value: 1000 },
      { timestamp: '2026-06-02T00:00:00+08:00', value: 900 },
    ], []);
    expect(r).toBe(0);
  });
});

describe('样本聚合与质量', () => {
  it('缺失样本不默认为 0，且覆盖率下降', () => {
    const samples: Sample[] = [
      { timestamp: '2026-06-01T00:00:00+08:00', value: 10, quality: 'valid' },
      { timestamp: '2026-06-01T01:00:00+08:00', value: null, quality: 'missing' },
      { timestamp: '2026-06-01T02:00:00+08:00', value: 12, quality: 'valid' },
      { timestamp: '2026-06-01T03:00:00+08:00', value: 8, quality: 'invalid' },
    ];
    const s = summarize(samples);
    expect(s.total).toBe(22);
    expect(s.hasMissing).toBe(true);
    expect(s.hasInvalid).toBe(true);
    expect(s.coverage).toBe(0.5);
  });

  it('估算与人工修正计入总量并保留标记', () => {
    const s = summarize([
      { ...emptySample('estimated') },
      { ...emptySample('manual_corrected') },
    ]);
    expect(s.total).toBe(20);
    expect(s.hasEstimated).toBe(true);
    expect(s.hasManualCorrected).toBe(true);
  });

  it('无效样本不计入费用', () => {
    const cost = simpleCost([{ timestamp: '2026-06-01T08:00:00+08:00', value: 100, quality: 'invalid' }], 0.6);
    expect(cost.amount).toBe(0);
  });
});

describe('分时电价', () => {
  const planA = pricesData.find((p) => p.id === 'PR-E-A') as unknown as PricePlan;

  it('segmentOfHour 支持跨午夜低谷段', () => {
    expect(segmentOfHour(planA.segments!, 2)?.name).toBe('低谷');
    expect(segmentOfHour(planA.segments!, 20)?.name).toBe('尖峰');
    expect(segmentOfHour(planA.segments!, 9)?.name).toBe('高峰');
    expect(segmentOfHour(planA.segments!, 13)?.name).toBe('平段');
  });

  it('100 kWh × 0.60 元 = 60 元（不考虑附加项）', () => {
    const samples: Sample[] = Array.from({ length: 10 }, (_, h) => ({
      timestamp: `2026-06-01T${String(h + 8).padStart(2, '0')}:00:00+08:00`,
      value: 10,
      quality: 'valid' as const,
    }));
    const result = electricityTouCost(samples, planA);
    expect(result.total).toBeCloseTo(82.5, 1);
    const customPlan: PricePlan = { ...planA, segments: [{ key: 'f', name: '单一', start: '00:00', end: '24:00', price: 0.6 }] };
    const flat = electricityTouCost(samples, customPlan);
    expect(flat.total).toBe(60);
  });

  it('按日期选择生效价格方案（9月起执行新方案）', () => {
    const plans = pricesData as unknown as PricePlan[];
    expect(activePlanForDate(plans, 'electricity', '2026-06-15')!.id).toBe('PR-E-A');
    expect(activePlanForDate(plans, 'electricity', '2026-09-15')!.id).toBe('PR-E-B');
    expect(activePlanForDate(plans, 'water', '2026-09-15')!.id).toBe('PR-W-A');
    expect(activePlanForDate(plans, 'water', '2026-10-15')!.id).toBe('PR-W-B');
  });
});

describe('指标计算边界', () => {
  it('基期为 0 时同比不可计算', () => {
    expect(pctChange(120, 0)).toBeNull();
    expect(pctChange(120, null)).toBeNull();
    expect(pctChange(120, 100)).toBeCloseTo(20, 5);
  });

  it('面积/人数分母无效时强度不可计算', () => {
    expect(intensity(10000, 5000)).toBe(2);
    expect(intensity(10000, 0)).toBeNull();
    expect(intensity(10000, null)).toBeNull();
    expect(perCapita(300, 0)).toBeNull();
    expect(perCapita(300, 100)).toBe(3);
    expect(share(30, 0)).toBeNull();
    expect(share(30, 120)).toBe(25);
  });

  it('账单对账：账单金额固定，差异可解释', () => {
    const cmp = compareBill(1000, 0.01, 50, 1.01);
    expect(cmp.billedAmount).toBe(1060);
    expect(cmp.difference).toBe(60);
    expect(classifyDifference(60, 50, 0.01)).toContain('固定/附加费用项');
  });
});

describe('计量边界防重复', () => {
  const points: MeteringPoint[] = [
    { id: 'M', code: 'M', name: '总表', meterId: 'm', iotPropertyId: 'i', energyType: 'electricity', campusId: 'C', buildingId: 'B', direction: 'import', role: 'main', usage: '消耗', readingType: 'cumulative', unit: 'kWh', validFrom: '2025-01-01' },
    { id: 'S1', code: 'S1', name: '分表1', meterId: 'm1', iotPropertyId: 'i1', energyType: 'electricity', campusId: 'C', buildingId: 'B', direction: 'import', role: 'submeter', usage: '分项', readingType: 'cumulative', unit: 'kWh', validFrom: '2025-01-01' },
    { id: 'S2', code: 'S2', name: '分表2', meterId: 'm2', iotPropertyId: 'i2', energyType: 'electricity', campusId: 'C', buildingId: 'B', direction: 'import', role: 'submeter', usage: '分项', readingType: 'cumulative', unit: 'kWh', validFrom: '2025-01-01' },
  ];
  const relations: MeterRelation[] = [
    { id: 'r1', parentId: 'M', childId: 'S1', relationType: 'contains', validFrom: '2025-01-01' },
    { id: 'r2', parentId: 'M', childId: 'S2', relationType: 'contains', validFrom: '2025-01-01' },
  ];

  it('总表与子表同时出现时仅保留总表（100 而非 180）', () => {
    const ids = deduplicatePoints({ points, relations }, ['M', 'S1', 'S2']);
    expect(ids).toEqual(['M']);
  });

  it('未分项差额 = 100 - 80 = 20，不将子表叠加为总量', () => {
    const b = boundaryBreakdown(100, 80);
    expect(b.boundaryTotal).toBe(100);
    expect(b.uncovered).toBe(20);
    expect(b.uncoveredPct).toBe(20);
    expect(b.anomaly).toBe(false);
  });

  it('分项合计超过总表时标记计量关系异常', () => {
    expect(boundaryBreakdown(100, 105).anomaly).toBe(true);
  });
});

describe('校历日类型', () => {
  const cal = calendarData as never as Parameters<typeof resolveDay>[1];
  it('关键日类型解析正确', () => {
    expect(resolveDay('2026-10-01', cal).dayType).toBe('holiday');
    expect(resolveDay('2026-07-20', cal).dayType).toBe('vacation');
    expect(resolveDay('2026-06-24', cal).dayType).toBe('exam');
    expect(resolveDay('2026-10-10', cal).dayType).toBe('weekend');
    expect(resolveDay('2026-10-12', cal).dayType).toBe('teaching');
    expect(resolveDay('2026-05-16', cal).dayType).toBe('special');
    expect(resolveDay('2026-02-01', cal).dayType).toBe('vacation');
  });
});