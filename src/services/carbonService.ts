import dayjs from 'dayjs';
import { getEntities } from './repository';
import { scopeUsage, monthlyRows } from './energyStats';
import { carbonFromUsage, type CarbonResult } from '../domain/carbon';
import { rangeMonths } from '../domain/time';
import type { CarbonFactor } from '../domain/types';

/**
 * 碳排放测算服务：与平台购入边界口径一致。
 * 范围二=校区进线关口表购入电量；范围一=各燃气表购入气量。
 */

export function getCarbonFactors(): { grid: CarbonFactor | null; gas: CarbonFactor | null } {
  const ent = getEntities();
  return {
    grid: ent.carbonFactors.find((f) => f.energyType === 'electricity') ?? null,
    gas: ent.carbonFactors.find((f) => f.energyType === 'gas') ?? null,
  };
}

export function carbonSummary(campusId: 'all' | string, from: string, to: string): CarbonResult | null {
  const { grid, gas } = getCarbonFactors();
  if (!grid || !gas) return null;
  const elec = scopeUsage('electricity', { campusId }, from, to);
  const gasUsage = scopeUsage('gas', { campusId }, from, to);
  return carbonFromUsage(elec.total, gasUsage.total, grid, gas, {
    incomplete: elec.incomplete || gasUsage.incomplete,
  });
}

export interface CarbonTrendRow {
  month: string;
  scope1: number;
  scope2: number;
  total: number;
}

/** 近 n 月排放趋势（固定窗口，标题注明窗口） */
export function carbonTrend(campusId: 'all' | string, anchor: string, n = 12): CarbonTrendRow[] {
  const { grid, gas } = getCarbonFactors();
  if (!grid || !gas) return [];
  const ent = getEntities();
  const campusIds = campusId === 'all' ? ent.campuses.map((c) => c.id) : [campusId];
  const elecIds = ent.meteringPoints
    .filter((p) => p.energyType === 'electricity' && p.role === 'main' && !p.buildingId && campusIds.includes(p.campusId))
    .map((p) => p.id);
  const gasIds = ent.meteringPoints
    .filter((p) => p.energyType === 'gas' && campusIds.includes(p.campusId))
    .map((p) => p.id);
  const end = anchor.slice(0, 7);
  let start = dayjs(end + '-01').subtract(n - 1, 'month').format('YYYY-MM');
  if (start < '2025-09') start = '2025-09';
  const months = rangeMonths(start, end);
  const eRows = monthlyRows(elecIds, months);
  const gRows = monthlyRows(gasIds, months);
  return months.map((m, i) => {
    const r = carbonFromUsage(eRows[i]?.total ?? 0, gRows[i]?.total ?? 0, grid, gas);
    return { month: m, scope1: r.scope1.co2, scope2: r.scope2.co2, total: r.total };
  });
}

export interface BuildingCarbonRow {
  id: string;
  name: string;
  category: string;
  elecUsage: number;
  gasUsage: number;
  co2: number;
}

/** 建筑碳排放排行：建筑主表电量+建筑气量折算（已计量部分，校区合计按购入边界） */
export function buildingCarbonRows(campusId: 'all' | string, from: string, to: string): BuildingCarbonRow[] {
  const { grid, gas } = getCarbonFactors();
  if (!grid || !gas) return [];
  const ent = getEntities();
  return ent.buildings
    .filter((b) => b.status === 'active' && (campusId === 'all' || b.campusId === campusId))
    .map((b) => {
      const elec = scopeUsage('electricity', { buildingId: b.id }, from, to).total ?? 0;
      const gasU = scopeUsage('gas', { buildingId: b.id }, from, to).total ?? 0;
      const r = carbonFromUsage(elec, gasU, grid, gas);
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        elecUsage: elec,
        gasUsage: gasU,
        co2: r.total,
      };
    })
    .filter((r) => r.co2 > 0)
    .sort((a, b) => b.co2 - a.co2);
}

/** 排放强度分母：范围内在用建筑考核面积合计 */
export function carbonAreaDenominator(campusId: 'all' | string): number {
  const ent = getEntities();
  return ent.buildings
    .filter((b) => b.status === 'active' && (campusId === 'all' || b.campusId === campusId))
    .reduce((a, b) => a + b.assessmentArea, 0);
}