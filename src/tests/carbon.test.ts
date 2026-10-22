import { describe, expect, it, beforeAll } from 'vitest';
import { carbonFromUsage } from '../domain/carbon';
import type { CarbonFactor } from '../domain/types';
import { useIdentity } from '../stores/identity';

beforeAll(() => {
  useIdentity.getState().setUserId('U-ZHANG');
});

const gridFactor: CarbonFactor = {
  id: 'F-GRID', name: '全国电力平均二氧化碳排放因子', energyType: 'electricity',
  value: 0.5366, usageUnit: 'tCO₂/MWh', scope: '范围二（外购电力）',
  source: '生态环境部《2022年电力二氧化碳排放因子》', version: '2022年度',
};
const gasFactor: CarbonFactor = {
  id: 'F-GAS', name: '天然气燃烧二氧化碳排放因子', energyType: 'gas',
  value: 21.62, usageUnit: 'tCO₂/万m³', scope: '范围一（化石燃料燃烧）',
  source: '省级温室气体清单编制指南缺省值折算', version: '缺省值',
};

describe('碳排放纯计算', () => {
  it('外购电力：10,000 kWh × 0.5366 tCO₂/MWh = 5.366 t（保留2位=5.37）', () => {
    const r = carbonFromUsage(10000, 0, gridFactor, gasFactor);
    expect(r.scope2.co2).toBe(5.37);
    expect(r.scope2.usage).toBe(10000);
    expect(r.scope1.co2).toBe(0);
  });

  it('天然气：10,000 m³ × 21.62 tCO₂/万m³ = 21.62 t', () => {
    const r = carbonFromUsage(0, 10000, gridFactor, gasFactor);
    expect(r.scope1.co2).toBe(21.62);
    expect(r.total).toBe(21.62);
  });

  it('合计=范围一+范围二，互不重复', () => {
    const r = carbonFromUsage(10000, 10000, gridFactor, gasFactor);
    expect(r.total).toBe(Math.round((5.366 + 21.62) * 100) / 100);
  });

  it('内部转换冷/热/热水不参与函数输入：口径由调用方保证（仅电+气两个入参）', () => {
    // 函数签名仅接受电/气用量，供冷、供热、生活热水在边界规则下不进入核算
    const r = carbonFromUsage(10000, 10000, gridFactor, gasFactor);
    expect(Object.keys(r)).toContain('scope1');
    expect(Object.keys(r)).toContain('scope2');
    expect(r.incomplete).toBe(false);
  });

  it('用量缺失（null）时标记不完整且不默认为0', () => {
    const r = carbonFromUsage(null, 10000, gridFactor, gasFactor);
    expect(r.incomplete).toBe(true);
    expect(r.scope2.usage).toBe(0);
  });
});

describe('碳排放服务（边界与因子）', () => {
  it('全校合计 = 东校区 + 西校区（购入边界可加和）', async () => {
    const { carbonSummary } = await import('../services/carbonService');
    const all = carbonSummary('all', '2026-09-01', '2026-09-30');
    const east = carbonSummary('C-E', '2026-09-01', '2026-09-30');
    const west = carbonSummary('C-W', '2026-09-01', '2026-09-30');
    expect(all).not.toBeNull();
    expect(all!.total).toBeCloseTo(Math.round((east!.total + west!.total) * 100) / 100, 0);
  });

  it('因子维护即时生效且非法值被拒绝', async () => {
    const { getEntities } = await import('../services/repository');
    const { carbonSummary } = await import('../services/carbonService');
    const ent = getEntities();
    const before = carbonSummary('all', '2026-09-01', '2026-09-30')!;
    // 非法值（0/负数）被阻止
    expect(ent.actions.updateCarbonFactor('F-GRID', 0, '测试非法值')).toBe(false);
    expect(ent.actions.updateCarbonFactor('F-GRID', -1, '测试非法值')).toBe(false);
    // 合法调整后测算重算
    const ok = ent.actions.updateCarbonFactor('F-GRID', 0.6, '测试：模拟最新官方发布值调整');
    expect(ok).toBe(true);
    const after = carbonSummary('all', '2026-09-01', '2026-09-30')!;
    expect(after.scope2.co2).toBeCloseTo(Math.round((before.scope2.usage / 1000) * 0.6 * 100) / 100, 1);
    expect(after.scope1.co2).toBeCloseTo(before.scope1.co2, 5);
    // 审计留痕
    expect(getEntities().auditLogs.some((l) => l.action === '维护排放因子' && l.objectId === 'F-GRID')).toBe(true);
    // 恢复初始因子
    ent.actions.updateCarbonFactor('F-GRID', 0.5366, '测试后恢复官方发布值');
  });

  it('趋势窗口按月粒度产出且总量守恒', async () => {
    const { carbonTrend } = await import('../services/carbonService');
    const trend = carbonTrend('all', '2026-10-20', 12);
    expect(trend.length).toBeGreaterThan(0);
    expect(trend.every((r) => Math.abs(r.total - (r.scope1 + r.scope2)) <= 0.01)).toBe(true);
    const month = trend.find((r) => r.month === '2026-09');
    const summary = (await import('../services/carbonService')).carbonSummary('all', '2026-09-01', '2026-09-30')!;
    expect(month).not.toBeUndefined();
    expect(month!.total).toBeCloseTo(summary.total, 0);
  });
});