import type {
  EnergyType, PeriodUsage, Quality, MeteringPoint,
} from '../domain/types';
import { summarize } from '../domain/energy/series';
import {
  pointsOfBuilding, pointsOfCampus, publicPointsOfCampus, subitemsOfBuilding, deduplicatePoints,
} from '../domain/energy/boundaries';
import { getSeries, hourIndexOf, hourTimestamp, TOTAL_HOURS, TOTAL_DAYS, dateOfDay, qualityOfCode, QC, dayIndexOf } from './telemetry';
import { getEntities } from './repository';
import { isOpenHour, resolveDay, openHoursFor } from '../domain/calendar';
import { lastNDays, rangeMonths } from '../domain/time';
import dayjs from 'dayjs';
import { ALL_ENERGY_TYPES } from '../domain/units';

export interface StatScope {
  campusId?: 'all' | string;
  category?: string;
  buildingId?: string;
  buildingIds?: string[];
}

export interface AggRow {
  date: string;
  total: number;
  coverage: number;
  hasMissing: boolean;
  hasEstimated: boolean;
  hasInvalid: boolean;
  hasManualCorrected: boolean;
  incomplete: boolean;
  partial: boolean;
}

export interface HourRow {
  ts: string;
  value: number | null;
  coverage: number;
  quality: Quality;
}

function clampHour(h: number): number {
  return Math.max(0, Math.min(TOTAL_HOURS - 1, h));
}

export function hourRangeOf(from: string, to: string): { fromH: number; toH: number } {
  return { fromH: hourIndexOf(from, 0), toH: hourIndexOf(to, 23) };
}

/** 一组点位在小时区间的用量汇总（统一口径入口） */
export function aggregateHours(pointIds: string[], fromH: number, toH: number): PeriodUsage {
  const from = clampHour(fromH);
  const to = clampHour(toH);
  const f = Math.min(from, to);
  const t = Math.max(from, to);
  let total = 0;
  let counted = 0;
  let expected = 0;
  let hasMissing = false;
  let hasEstimated = false;
  let hasInvalid = false;
  let hasManualCorrected = false;
  for (const pid of pointIds) {
    const series = getSeries(pid);
    if (!series) continue;
    for (let i = f; i <= t; i++) {
      expected++;
      const q = qualityOfCode(series.quality[i]);
      if (q === 'missing') { hasMissing = true; continue; }
      if (q === 'invalid') { hasInvalid = true; continue; }
      if (q === 'estimated') hasEstimated = true;
      if (q === 'manual_corrected') hasManualCorrected = true;
      const v = series.values[i];
      if (!Number.isNaN(v)) { total += v; counted++; }
    }
  }
  return {
    total: expected === 0 ? null : total,
    coverage: expected === 0 ? 0 : counted / expected,
    counted, expected,
    hasMissing, hasEstimated, hasInvalid, hasManualCorrected,
    incomplete: hasMissing || hasInvalid || expected === 0,
    partial: false,
  };
}

/** 多点位小时序列（跨点求和，覆盖率按点×小时计） */
export function hourlyRows(pointIds: string[], fromH: number, toH: number): HourRow[] {
  const f = clampHour(fromH);
  const t = clampHour(toH);
  const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
  const rows: HourRow[] = [];
  for (let i = f; i <= t; i++) {
    let value = 0;
    let counted = 0;
    let worst: number = QC.valid;
    for (const s of seriesList) {
      const q = s.quality[i];
      if (q === QC.missing || q === QC.invalid) { worst = Math.max(worst, q); continue; }
      const v = s.values[i];
      if (!Number.isNaN(v)) { value += v; counted++; }
      if (q !== QC.valid) worst = Math.max(worst, q);
    }
    rows.push({
      ts: hourTimestamp(i),
      value: counted > 0 ? Math.round(value * 100) / 100 : null,
      coverage: seriesList.length === 0 ? 0 : counted / seriesList.length,
      quality: qualityOfCode(worst),
    });
  }
  return rows;
}

/** 日粒度聚合：小时量合计=日量；覆盖率按有效小时/应有小时 */
export function dailyRows(pointIds: string[], fromDay: string, toDay: string): AggRow[] {
  const fromDi = dayIndexOf(fromDay);
  const toDi = dayIndexOf(toDay);
  const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
  const rows: AggRow[] = [];
  for (let di = Math.max(0, fromDi); di <= Math.min(TOTAL_DAYS - 1, toDi); di++) {
    const hoursAvail = Math.min(24, TOTAL_HOURS - di * 24);
    let total = 0;
    let counted = 0;
    let expected = 0;
    let hasMissing = false;
    let hasEstimated = false;
    let hasInvalid = false;
    let hasManualCorrected = false;
    for (let h = 0; h < hoursAvail; h++) {
      const i = di * 24 + h;
      for (const s of seriesList) {
        expected++;
        const q = qualityOfCode(s.quality[i]);
        if (q === 'missing') { hasMissing = true; continue; }
        if (q === 'invalid') { hasInvalid = true; continue; }
        if (q === 'estimated') hasEstimated = true;
        if (q === 'manual_corrected') hasManualCorrected = true;
        const v = s.values[i];
        if (!Number.isNaN(v)) { total += v; counted++; }
      }
    }
    rows.push({
      date: dateOfDay(di),
      total: Math.round(total * 100) / 100,
      coverage: expected === 0 ? 0 : counted / expected,
      hasMissing, hasEstimated, hasInvalid, hasManualCorrected,
      incomplete: hasMissing || hasInvalid || seriesList.length === 0,
      partial: hoursAvail < 24,
    });
  }
  return rows;
}

/** 月粒度聚合 */
export function monthlyRows(pointIds: string[], months: string[]): AggRow[] {
  const rows: AggRow[] = [];
  for (const m of months) {
    const from = `${m}-01`;
    const [y, mm] = m.split('-').map(Number);
    const last = new Date(Date.UTC(y, mm, 0));
    const to = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
    const daily = dailyRows(pointIds, from, to);
    const total = daily.reduce((a, r) => a + r.total, 0);
    const expected = daily.length * 24 * pointIds.length;
    const counted = Math.round(daily.reduce((a, r) => a + r.coverage * 24 * pointIds.length, 0));
    rows.push({
      date: m,
      total: Math.round(total * 100) / 100,
      coverage: expected === 0 ? 0 : counted / expected,
      hasMissing: daily.some((r) => r.hasMissing),
      hasEstimated: daily.some((r) => r.hasEstimated),
      hasInvalid: daily.some((r) => r.hasInvalid),
      hasManualCorrected: daily.some((r) => r.hasManualCorrected),
      incomplete: daily.some((r) => r.incomplete),
      partial: daily.some((r) => r.partial),
    });
  }
  return rows;
}

// ---------- 边界解析 ----------

export function scopePointIds(energy: EnergyType, scope: StatScope): string[] {
  const ent = getEntities();
  const idx = { points: ent.meteringPoints, relations: ent.meterRelations };
  const campusIds = scope.campusId && scope.campusId !== 'all' ? [scope.campusId] : ent.campuses.map((c) => c.id);
  if (scope.buildingId) {
    return pointsOfBuilding(idx, scope.buildingId, energy).map((p) => p.id);
  }
  if (scope.buildingIds) {
    return scope.buildingIds.flatMap((bid) => pointsOfBuilding(idx, bid, energy).map((p) => p.id));
  }
  if (scope.category) {
    const buildings = ent.buildings.filter(
      (b) => b.status === 'active' && campusIds.includes(b.campusId) && b.category === scope.category,
    );
    return buildings.flatMap((b) => pointsOfBuilding(idx, b.id, energy).map((p) => p.id));
  }
  if (scope.campusId && scope.campusId !== 'all') {
    const pts = pointsOfCampus(idx, scope.campusId, energy);
    if (pts.length > 0) return pts.map((p) => p.id);
    // 无边界总表（如生活热水）：使用已覆盖建筑表合计
    const buildings = ent.buildings.filter((b) => b.status === 'active' && b.campusId === scope.campusId);
    return buildings.flatMap((b) => pointsOfBuilding(idx, b.id, energy).map((p) => p.id));
  }
  const pts = campusIds.flatMap((cid) => pointsOfCampus(idx, cid, energy).map((p) => p.id));
  if (pts.length > 0) return deduplicatePoints(idx, pts);
  const buildings = ent.buildings.filter((b) => b.status === 'active');
  return deduplicatePoints(idx, buildings.flatMap((b) => pointsOfBuilding(idx, b.id, energy).map((p) => p.id)));
}

export function boundaryNote(energy: EnergyType, scope: StatScope): string {
  if (scope.buildingId) {
    const byEnergy: Record<string, string> = {
      electricity: '建筑总表（含空调、照明、动力等分项支路，分项不重复计入总量）',
      water: '建筑水表',
      gas: '建筑燃气表',
      cooling: '建筑供冷计量表',
      heat: '建筑供热计量表',
      hotWater: '建筑生活热水计量表',
    };
    return byEnergy[energy] ?? '建筑计量点';
  }
  if (scope.category) return '该类建筑主表合计（已计量覆盖部分）';
  const byEnergy: Record<string, string> = {
    electricity: '校区购入边界（进线关口表），下属建筑表仅作分项',
    water: '校区总进水表（购水边界），分项仅作覆盖统计',
    gas: '各燃气表直抄合计（无层级总表）',
    cooling: '能源站供冷产出总表（产出侧边界）',
    heat: '能源站供热产出总表（产出侧边界）',
    hotWater: '生活热水计量点合计（部分校区无总表，为已覆盖合计）',
  };
  return byEnergy[energy] ?? '统一计量边界';
}

export function scopeUsage(energy: EnergyType, scope: StatScope, from: string, to: string): PeriodUsage {
  const ids = scopePointIds(energy, scope);
  if (ids.length === 0) {
    return { total: null, coverage: 0, counted: 0, expected: 0, hasMissing: false, hasEstimated: false, hasInvalid: false, hasManualCorrected: false, incomplete: true, partial: false };
  }
  const { fromH, toH } = hourRangeOf(from, to);
  return aggregateHours(ids, fromH, toH);
}

export function scopeDaily(energy: EnergyType, scope: StatScope, from: string, to: string): AggRow[] {
  const ids = scopePointIds(energy, scope);
  return dailyRows(ids, from, to);
}

export function scopeMonthly(energy: EnergyType, scope: StatScope, months: string[]): AggRow[] {
  const ids = scopePointIds(energy, scope);
  return monthlyRows(ids, months);
}

export function scopeHourly(energy: EnergyType, scope: StatScope, from: string, to: string): HourRow[] {
  const ids = scopePointIds(energy, scope);
  const { fromH, toH } = hourRangeOf(from, to);
  return hourlyRows(ids, fromH, toH);
}

// ---------- 建筑分项与平衡 ----------

export interface SubitemRow {
  point: MeteringPoint;
  usage: PeriodUsage;
  share: number | null;
}

export function buildingSubitems(buildingId: string, energy: EnergyType, from: string, to: string): {
  mainUsage: PeriodUsage;
  subitems: SubitemRow[];
  coveredTotal: number;
  uncovered: number | null;
  uncoveredPct: number | null;
  anomaly: boolean;
} {
  const ent = getEntities();
  const idx = { points: ent.meteringPoints, relations: ent.meterRelations };
  const mainIds = pointsOfBuilding(idx, buildingId, energy).map((p) => p.id);
  const subs = subitemsOfBuilding(idx, buildingId, energy);
  const { fromH, toH } = hourRangeOf(from, to);
  const mainUsage = aggregateHours(mainIds, fromH, toH);
  const subitems: SubitemRow[] = subs.map((p) => {
    const usage = aggregateHours([p.id], fromH, toH);
    return {
      point: p,
      usage,
      share: mainUsage.total && mainUsage.total > 0 && usage.total !== null ? (usage.total / mainUsage.total) * 100 : null,
    };
  });
  const coveredTotal = subitems.reduce((a, s) => a + (s.usage.total ?? 0), 0);
  const mainTotal = mainUsage.total;
  return {
    mainUsage,
    subitems,
    coveredTotal,
    uncovered: mainTotal === null ? null : mainTotal - coveredTotal,
    uncoveredPct: mainTotal === null || mainTotal === 0 ? null : ((mainTotal - coveredTotal) / mainTotal) * 100,
    anomaly: mainTotal !== null && mainTotal - coveredTotal < -0.5,
  };
}

export interface CampusBalance {
  energy: EnergyType;
  boundary: PeriodUsage;
  buildingTotal: number;
  publicTotal: number;
  coveredTotal: number;
  uncovered: number | null;
  uncoveredPct: number | null;
  anomaly: boolean;
  buildingRows: { buildingId: string; name: string; total: number; category: string }[];
  publicRows: { pointId: string; name: string; total: number }[];
}

export function campusBalance(campusId: string, energy: EnergyType, from: string, to: string): CampusBalance {
  const ent = getEntities();
  const idx = { points: ent.meteringPoints, relations: ent.meterRelations };
  const boundaryIds = pointsOfCampus(idx, campusId, energy).map((p) => p.id);
  const { fromH, toH } = hourRangeOf(from, to);
  const boundary = aggregateHours(boundaryIds, fromH, toH);
  const buildings = ent.buildings.filter((b) => b.status === 'active' && b.campusId === campusId);
  const buildingRows = buildings
    .map((b) => {
      const ids = pointsOfBuilding(idx, b.id, energy).map((p) => p.id);
      const u = aggregateHours(ids, fromH, toH);
      return { buildingId: b.id, name: b.name, total: u.total ?? 0, category: b.category };
    })
    .filter((r) => r.total > 0);
  const buildingTotal = buildingRows.reduce((a, r) => a + r.total, 0);
  const publicPts = publicPointsOfCampus(idx, campusId, energy);
  const publicRows = publicPts.map((p) => {
    const u = aggregateHours([p.id], fromH, toH);
    return { pointId: p.id, name: p.name, total: u.total ?? 0 };
  }).filter((r) => r.total > 0);
  const publicTotal = publicRows.reduce((a, r) => a + r.total, 0);
  const coveredTotal = buildingTotal + publicTotal;
  const uncovered = boundary.total === null ? null : boundary.total - coveredTotal;
  return {
    energy,
    boundary,
    buildingTotal,
    publicTotal,
    coveredTotal,
    uncovered,
    uncoveredPct: boundary.total && boundary.total > 0 && uncovered !== null ? (uncovered / boundary.total) * 100 : null,
    anomaly: uncovered !== null && uncovered < -0.5,
    buildingRows,
    publicRows,
  };
}

// ---------- 教学时段统计 ----------

export interface TeachingStats {
  total: number | null;
  teachingHoursUsage: number | null;
  nonTeachingUsage: number | null;
  nonTeachingShare: number | null;
  definition: string;
  hasMissing: boolean;
}

export function teachingStats(buildingId: string, from: string, to: string, energy: EnergyType = 'electricity'): TeachingStats {
  const ent = getEntities();
  const building = ent.buildings.find((b) => b.id === buildingId);
  if (!building) return { total: null, teachingHoursUsage: null, nonTeachingUsage: null, nonTeachingShare: null, definition: '建筑不存在', hasMissing: false };
  const idx = { points: ent.meteringPoints, relations: ent.meterRelations };
  const pointIds = pointsOfBuilding(idx, buildingId, energy).map((p) => p.id);
  const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
  if (seriesList.length === 0) return { total: null, teachingHoursUsage: null, nonTeachingUsage: null, nonTeachingShare: null, definition: '该建筑未接入此能源计量', hasMissing: false };
  const rule = openHoursFor(building.category, ent.calendar, 'teaching');
  const fromDi = dayIndexOf(from);
  const toDi = dayIndexOf(to);
  let teaching = 0;
  let nonTeaching = 0;
  let hasMissing = false;
  for (let di = fromDi; di <= toDi; di++) {
    if (di < 0 || di >= TOTAL_DAYS) continue;
    const date = dateOfDay(di);
    const dayType = resolveDay(date, ent.calendar).dayType;
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      for (const s of seriesList) {
        const q = qualityOfCode(s.quality[i]);
        if (q === 'missing' || q === 'invalid') { if (q === 'missing') hasMissing = true; continue; }
        const v = s.values[i];
        if (Number.isNaN(v)) continue;
        if (isOpenHour(rule, dayType, h)) teaching += v;
        else nonTeaching += v;
      }
    }
  }
  const total = teaching + nonTeaching;
  const definition = rule
    ? `教学时段＝${building.category === 'lab' || building.category === 'dormitory' || building.category === 'datacenter' ? '该类建筑为24小时运行，按开放时段定义全日使用' : '校历教学日 ' + rule.start + '-' + rule.end + '（考试周 ' + rule.examExtension + '），假期按 ' + rule.breakStart + '-' + rule.breakEnd + ' 之外时段计非教学'}`
    : '该建筑类型未定义开放时间，仅按校历日类型区分';
  return {
    total: total === 0 && hasMissing ? null : total,
    teachingHoursUsage: Math.round(teaching * 100) / 100,
    nonTeachingUsage: Math.round(nonTeaching * 100) / 100,
    nonTeachingShare: total > 0 ? (nonTeaching / total) * 100 : null,
    definition,
    hasMissing,
  };
}

// ---------- 其他工具 ----------

export function nightFlowRows(pointId: string, fromDay: string, toDay: string): { date: string; minFlow: number | null }[] {
  const series = getSeries(pointId);
  if (!series) return [];
  const rows: { date: string; minFlow: number | null }[] = [];
  for (let di = dayIndexOf(fromDay); di <= dayIndexOf(toDay); di++) {
    if (di < 0 || di >= TOTAL_DAYS) continue;
    let min: number | null = null;
    let any = false;
    for (const h of [1, 2, 3, 4, 5]) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      const q = qualityOfCode(series.quality[i]);
      if (q === 'missing' || q === 'invalid') continue;
      const v = series.values[i];
      if (Number.isNaN(v)) continue;
      any = true;
      if (min === null || v < min) min = v;
    }
    rows.push({ date: dateOfDay(di), minFlow: any ? min : null });
  }
  return rows;
}

export function latestPowerKw(pointIds: string[]): { ts: string; kW: number | null } | null {
  const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
  if (seriesList.length === 0) return null;
  let i = TOTAL_HOURS - 1;
  for (; i >= 0; i--) {
    let sum = 0;
    let counted = 0;
    for (const s of seriesList) {
      const q = qualityOfCode(s.quality[i]);
      if (q === 'missing' || q === 'invalid') continue;
      const v = s.values[i];
      if (!Number.isNaN(v)) { sum += v; counted++; }
    }
    if (counted > 0) return { ts: hourTimestamp(i), kW: Math.round(sum * 10) / 10 };
  }
  return null;
}

export function pointIdsOf(energy: EnergyType, scope: StatScope): string[] {
  return scopePointIds(energy, scope);
}

export function pointNameMap(): Map<string, MeteringPoint> {
  const ent = getEntities();
  return new Map(ent.meteringPoints.map((p) => [p.id, p]));
}

export function hasEnergyData(energy: EnergyType, scope: StatScope): boolean {
  return scopePointIds(energy, scope).length > 0;
}

export const SUPPORTED_ENERGY = ALL_ENERGY_TYPES;

/**
 * 统计区间驱动的趋势序列：让页面所有数据面板随“按日/按月/按年”整体切换。
 * - 按日：近30日日粒度
 * - 按月：近12月月粒度
 * - 按年：所选年度逐月（按数据窗口裁剪并注明）
 */
export function trendSeriesForMode(
  energy: EnergyType,
  scope: StatScope,
  dateMode: 'day' | 'month' | 'year',
  anchor: string,
): { rows: { date: string; total: number }[]; windowLabel: string; note?: string } {
  const WINDOW_START_MONTH = '2025-09';
  const WINDOW_END_MONTH = '2026-10';
  if (dateMode === 'day') {
    const days = lastNDays(anchor, 30);
    return { rows: scopeDaily(energy, scope, days[0], anchor), windowLabel: '近30日' };
  }
  if (dateMode === 'month') {
    const end = anchor.slice(0, 7);
    let start = dayjs(end + '-01').subtract(11, 'month').format('YYYY-MM');
    if (start < WINDOW_START_MONTH) start = WINDOW_START_MONTH;
    const months = rangeMonths(start, end);
    return {
      rows: scopeMonthly(energy, scope, months),
      windowLabel: '近12月',
      note: months.length < 12 ? `数据窗口自${WINDOW_START_MONTH}起，仅展示可得月份` : undefined,
    };
  }
  const year = anchor.slice(0, 4);
  let start = `${year}-01`;
  let end = `${year}-12`;
  if (start < WINDOW_START_MONTH) start = WINDOW_START_MONTH;
  if (end > WINDOW_END_MONTH) end = WINDOW_END_MONTH;
  const months = rangeMonths(start, end);
  return {
    rows: scopeMonthly(energy, scope, months),
    windowLabel: `${year}年逐月`,
    note: start !== `${year}-01` || end !== `${year}-12`
      ? `数据窗口 2025-09 至 2026-10-21，年度按可得期间编制`
      : undefined,
  };
}

/** 趋势图 x 轴标签：日粒度 MM-DD，月粒度 M月（跨年仍可由 tooltip/标题定位年份） */
export function trendXLabel(date: string): string {
  return date.length === 7 ? `${date.slice(5)}月` : date.slice(5);
}