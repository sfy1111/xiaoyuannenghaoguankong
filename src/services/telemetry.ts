import telemetryData from '../data/telemetry.json';
import defaultCalendar from '../data/campusCalendar.json';
import type {
  CampusCalendarData, DataCorrection, DayType, Quality, TelemetryEvent,
} from '../domain/types';
import { resolveDay } from '../domain/calendar';

type LeafParam = {
  pointId: string; curve: string; baseDaily?: number; heatingBoost?: number;
  seed: number; initialReading?: number; decimals?: number;
  parent?: string; share?: number;
};
type DerivedParam = {
  pointId: string; children: string[]; lossPct: number; seed: number;
  initialReading: number; decimals: number;
};

const leaves = telemetryData.leaves as unknown as LeafParam[];
const derived = telemetryData.derived as unknown as DerivedParam[];
const events = telemetryData.events as unknown as TelemetryEvent[];
const seedCorrections = telemetryData.corrections as unknown as DataCorrection[];

const WIN_START = new Date('2025-09-01T00:00:00+08:00').getTime();
const WIN_END = new Date('2026-10-21T08:00:00+08:00').getTime();
const DAY_MS = 86400000;
const HOUR_MS = 3600000;

export const TOTAL_HOURS = Math.round((WIN_END - WIN_START) / HOUR_MS);
export const TOTAL_DAYS = Math.ceil(TOTAL_HOURS / 24);
export const WINDOW_START_DATE = '2025-09-01';
export const WINDOW_END_DATE = '2026-10-21';

const EPOCH_DAY0 = Math.floor((WIN_START + 8 * HOUR_MS) / DAY_MS);

const pad = (n: number) => String(n).padStart(2, '0');

export function dateOfDay(di: number): string {
  const t = new Date((EPOCH_DAY0 + di) * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function partsOfDay(di: number): { m: number; d: number; wd: number } {
  const t = new Date((EPOCH_DAY0 + di) * DAY_MS);
  return { m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}
export function hourTimestamp(hi: number): string {
  const di = Math.floor(hi / 24);
  const h = hi % 24;
  return `${dateOfDay(di)}T${pad(h)}:00:00+08:00`;
}
export function hourIndexOf(date: string, hour: number): number {
  const di = Math.round((Date.parse(date + 'T00:00:00+08:00') + 8 * HOUR_MS) / DAY_MS) - EPOCH_DAY0;
  return di * 24 + hour;
}
export function hourIndexFromTs(ts: string): number {
  const date = ts.slice(0, 10);
  const hour = Number(ts.slice(11, 13));
  return hourIndexOf(date, hour);
}
export function dayIndexOf(date: string): number {
  return hourIndexOf(date, 0) / 24;
}

// ---------- 曲线与季节因子 ----------

const CURVES: Record<string, number[]> = {
  teaching: [0.010, 0.009, 0.008, 0.008, 0.009, 0.012, 0.020, 0.035, 0.052, 0.070, 0.072, 0.068, 0.048, 0.052, 0.068, 0.070, 0.065, 0.052, 0.048, 0.055, 0.060, 0.058, 0.038, 0.018],
  lab: [0.032, 0.031, 0.030, 0.030, 0.031, 0.032, 0.034, 0.036, 0.040, 0.044, 0.045, 0.044, 0.038, 0.038, 0.043, 0.044, 0.042, 0.038, 0.036, 0.036, 0.038, 0.038, 0.035, 0.033],
  library: [0.008, 0.007, 0.006, 0.006, 0.006, 0.008, 0.014, 0.030, 0.045, 0.055, 0.058, 0.055, 0.040, 0.042, 0.055, 0.058, 0.056, 0.050, 0.046, 0.052, 0.058, 0.060, 0.032, 0.012],
  office: [0.010, 0.008, 0.007, 0.007, 0.008, 0.010, 0.016, 0.030, 0.055, 0.065, 0.062, 0.055, 0.040, 0.038, 0.052, 0.055, 0.052, 0.042, 0.036, 0.030, 0.024, 0.018, 0.012, 0.008],
  datacenter: Array(24).fill(1 / 24),
  gym: [0.012, 0.010, 0.009, 0.008, 0.008, 0.010, 0.022, 0.035, 0.045, 0.048, 0.048, 0.046, 0.042, 0.042, 0.048, 0.050, 0.052, 0.056, 0.060, 0.062, 0.055, 0.040, 0.022, 0.014],
  dorm: [0.024, 0.020, 0.017, 0.015, 0.015, 0.018, 0.040, 0.055, 0.048, 0.034, 0.026, 0.022, 0.022, 0.024, 0.026, 0.028, 0.032, 0.040, 0.046, 0.050, 0.052, 0.050, 0.042, 0.034],
  canteen: [0.012, 0.010, 0.010, 0.010, 0.016, 0.045, 0.060, 0.045, 0.022, 0.030, 0.070, 0.075, 0.055, 0.030, 0.028, 0.045, 0.070, 0.065, 0.038, 0.020, 0.014, 0.012, 0.010, 0.010],
  heatpump: [0.030, 0.026, 0.022, 0.020, 0.022, 0.030, 0.045, 0.055, 0.040, 0.028, 0.024, 0.022, 0.022, 0.024, 0.026, 0.032, 0.040, 0.055, 0.065, 0.060, 0.050, 0.044, 0.040, 0.035],
  lighting: [0.004, 0.003, 0.003, 0.003, 0.003, 0.004, 0.006, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.010, 0.014, 0.030, 0.060, 0.090, 0.100, 0.100, 0.090, 0.050],
  plant: [0.016, 0.015, 0.014, 0.014, 0.015, 0.018, 0.024, 0.034, 0.046, 0.056, 0.062, 0.064, 0.058, 0.054, 0.056, 0.058, 0.056, 0.050, 0.044, 0.040, 0.036, 0.032, 0.026, 0.020],
  chiller: [0.016, 0.015, 0.014, 0.014, 0.015, 0.018, 0.024, 0.034, 0.046, 0.056, 0.062, 0.064, 0.058, 0.054, 0.056, 0.058, 0.056, 0.050, 0.044, 0.040, 0.036, 0.032, 0.026, 0.020],
  waterDay: [0.010, 0.008, 0.007, 0.006, 0.006, 0.010, 0.030, 0.060, 0.075, 0.060, 0.045, 0.040, 0.035, 0.035, 0.040, 0.042, 0.045, 0.055, 0.070, 0.060, 0.040, 0.028, 0.020, 0.013],
  waterDorm: [0.028, 0.024, 0.021, 0.019, 0.020, 0.026, 0.055, 0.075, 0.055, 0.034, 0.026, 0.024, 0.026, 0.028, 0.030, 0.034, 0.040, 0.048, 0.055, 0.060, 0.058, 0.050, 0.042, 0.032],
  waterCanteen: [0.008, 0.006, 0.005, 0.005, 0.010, 0.060, 0.090, 0.050, 0.018, 0.030, 0.080, 0.070, 0.040, 0.022, 0.028, 0.060, 0.090, 0.050, 0.018, 0.010, 0.008, 0.007, 0.006, 0.006],
  irrigation: [0.004, 0.003, 0.004, 0.010, 0.090, 0.160, 0.080, 0.010, 0.004, 0.004, 0.004, 0.004, 0.004, 0.004, 0.004, 0.004, 0.006, 0.010, 0.060, 0.140, 0.200, 0.120, 0.030, 0.010],
  gasCanteen: [0.004, 0.003, 0.003, 0.003, 0.008, 0.055, 0.085, 0.045, 0.012, 0.020, 0.090, 0.100, 0.060, 0.022, 0.020, 0.060, 0.110, 0.090, 0.030, 0.012, 0.008, 0.006, 0.004, 0.003],
  gasBoiler: [0.035, 0.033, 0.032, 0.032, 0.034, 0.040, 0.055, 0.060, 0.050, 0.045, 0.040, 0.038, 0.036, 0.036, 0.038, 0.040, 0.045, 0.055, 0.065, 0.060, 0.052, 0.048, 0.044, 0.040],
  cooling: [0.010, 0.008, 0.007, 0.006, 0.006, 0.008, 0.014, 0.030, 0.052, 0.068, 0.072, 0.070, 0.058, 0.052, 0.056, 0.062, 0.065, 0.060, 0.050, 0.040, 0.032, 0.026, 0.018, 0.010],
  heating: [0.050, 0.048, 0.046, 0.045, 0.046, 0.052, 0.062, 0.060, 0.048, 0.040, 0.036, 0.034, 0.032, 0.032, 0.034, 0.038, 0.044, 0.052, 0.058, 0.056, 0.050, 0.048, 0.052, 0.051],
  hotWater: [0.030, 0.024, 0.020, 0.018, 0.020, 0.030, 0.055, 0.075, 0.050, 0.026, 0.018, 0.016, 0.016, 0.018, 0.022, 0.028, 0.040, 0.060, 0.078, 0.085, 0.075, 0.062, 0.048, 0.036],
};

const DAY_FACTORS: Record<string, Record<DayType, number>> = {
  teaching: { teaching: 1.0, exam: 0.9, weekend: 0.55, vacation: 0.28, holiday: 0.32, special: 1.05 },
  lab: { teaching: 1.0, exam: 1.0, weekend: 0.92, vacation: 0.78, holiday: 0.85, special: 1.0 },
  library: { teaching: 1.0, exam: 1.35, weekend: 0.95, vacation: 0.5, holiday: 0.4, special: 0.8 },
  office: { teaching: 1.0, exam: 1.0, weekend: 0.25, vacation: 0.15, holiday: 0.12, special: 0.5 },
  datacenter: { teaching: 1.0, exam: 1.0, weekend: 1.0, vacation: 1.0, holiday: 1.0, special: 1.0 },
  gym: { teaching: 1.0, exam: 0.85, weekend: 1.15, vacation: 0.45, holiday: 0.5, special: 1.3 },
  dorm: { teaching: 1.0, exam: 1.05, weekend: 1.12, vacation: 0.38, holiday: 0.9, special: 0.9 },
  canteen: { teaching: 1.0, exam: 0.95, weekend: 0.85, vacation: 0.32, holiday: 0.55, special: 0.7 },
  heatpump: { teaching: 1.0, exam: 1.05, weekend: 1.1, vacation: 0.45, holiday: 0.95, special: 0.95 },
  lighting: { teaching: 1.0, exam: 1.0, weekend: 0.95, vacation: 0.6, holiday: 0.65, special: 1.2 },
  plant: { teaching: 1.0, exam: 1.0, weekend: 0.95, vacation: 0.7, holiday: 0.7, special: 1.1 },
  chiller: { teaching: 1.0, exam: 1.0, weekend: 0.85, vacation: 0.6, holiday: 0.6, special: 1.0 },
  waterDay: { teaching: 1.0, exam: 1.0, weekend: 0.7, vacation: 0.3, holiday: 0.4, special: 0.8 },
  waterDorm: { teaching: 1.0, exam: 1.05, weekend: 1.1, vacation: 0.35, holiday: 0.9, special: 0.9 },
  waterCanteen: { teaching: 1.0, exam: 0.95, weekend: 0.85, vacation: 0.3, holiday: 0.55, special: 0.7 },
  irrigation: { teaching: 1.0, exam: 1.0, weekend: 1.0, vacation: 0.75, holiday: 1.0, special: 1.0 },
  gasCanteen: { teaching: 1.0, exam: 0.95, weekend: 0.85, vacation: 0.32, holiday: 0.55, special: 0.7 },
  gasBoiler: { teaching: 1.0, exam: 1.0, weekend: 0.9, vacation: 0.85, holiday: 0.9, special: 0.95 },
  cooling: { teaching: 1.0, exam: 1.0, weekend: 0.85, vacation: 0.6, holiday: 0.6, special: 1.0 },
  heating: { teaching: 1.0, exam: 1.0, weekend: 0.9, vacation: 0.85, holiday: 0.9, special: 0.95 },
  hotWater: { teaching: 1.0, exam: 1.05, weekend: 1.1, vacation: 0.4, holiday: 0.95, special: 0.95 },
  share: { teaching: 1, exam: 1, weekend: 1, vacation: 1, holiday: 1, special: 1 },
};

function coolingSeason(m: number, d: number): number {
  if (m < 5 || m > 9) return 0;
  if (m === 5) return 0.3 + (0.3 * d) / 31;
  if (m === 6) return 0.8;
  if (m === 7 || m === 8) return 1.0;
  return 0.55 * (1 - (d - 1) / 30);
}
function heatingSeason(m: number, d: number): number {
  if (m === 11) return d < 15 ? (0.4 * d) / 15 : 0.9;
  if (m === 12 || m === 1 || m === 2) return 1.0;
  if (m === 3) return d <= 15 ? 1 - 0.5 * (d / 15) : 0.2;
  if (m === 4) return d <= 10 ? 0.25 : 0.15;
  return 0.12;
}
function hwSeason(m: number): number {
  if (m === 12 || m === 1 || m === 2) return 1.2;
  if (m === 3 || m === 11) return 1.1;
  if (m === 6 || m === 7 || m === 8 || m === 9) return 0.8;
  return 0.95;
}
function seasonFactor(curve: string, m: number, d: number): number {
  switch (curve) {
    case 'cooling': return coolingSeason(m, d);
    case 'chiller': return coolingSeason(m, d);
    case 'heating': return heatingSeason(m, d);
    case 'hotWater': return hwSeason(m);
    case 'irrigation': return m >= 5 && m <= 9 ? 1.2 : 0.85;
    default: return 1;
  }
}

function h01(seed: number, a: number, b: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 374761393) ^ Math.imul(a + 1, 668265263) ^ Math.imul(b + 1, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function round(v: number, decimals: number): number {
  const p = Math.pow(10, decimals);
  return Math.round(v * p) / p;
}

// ---------- 生成引擎 ----------

export interface PointSeries {
  values: Float64Array;
  quality: Uint8Array;
}

const QUALITY_CODES: Quality[] = ['valid', 'missing', 'estimated', 'invalid', 'manual_corrected'];
export function qualityOfCode(code: number): Quality {
  return QUALITY_CODES[code] ?? 'valid';
}
export const QC = { valid: 0, missing: 1, estimated: 2, invalid: 3, manual_corrected: 4 } as const;

let calendarProvider: () => CampusCalendarData = () => defaultCalendar as unknown as CampusCalendarData;
let correctionsProvider: () => DataCorrection[] = () => seedCorrections;

export function setTelemetryProviders(opts: {
  calendar?: () => CampusCalendarData;
  corrections?: () => DataCorrection[];
}): void {
  if (opts.calendar) calendarProvider = opts.calendar;
  if (opts.corrections) correctionsProvider = opts.corrections;
}

let dayTypeCache: DayType[] | null = null;

function ensureDayTypes(): DayType[] {
  if (dayTypeCache) return dayTypeCache;
  const cal = calendarProvider();
  const arr: DayType[] = new Array(TOTAL_DAYS);
  for (let di = 0; di < TOTAL_DAYS; di++) {
    arr[di] = resolveDay(dateOfDay(di), cal).dayType;
  }
  dayTypeCache = arr;
  return arr;
}

const seriesCache = new Map<string, PointSeries>();

export function invalidateTelemetry(): void {
  seriesCache.clear();
  dayTypeCache = null;
}

function stableInitialReading(pointId: string): number {
  let h = 7;
  for (let i = 0; i < pointId.length; i++) h = (Math.imul(h, 31) + pointId.charCodeAt(i)) >>> 0;
  return 100000 + (h % 900000);
}

function buildLeaf(param: LeafParam): PointSeries {
  const decimals = param.decimals ?? 1;
  const values = new Float64Array(TOTAL_HOURS);
  const quality = new Uint8Array(TOTAL_HOURS);
  const weights = CURVES[param.curve] ?? Array(24).fill(1 / 24);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const dayTypes = ensureDayTypes();
  const base = param.baseDaily ?? 0;
  const boost = param.heatingBoost ?? 0;

  for (let di = 0; di < TOTAL_DAYS; di++) {
    const dayHourBase = di * 24;
    const { m, d } = partsOfDay(di);
    const dayType = dayTypes[di];
    const f = DAY_FACTORS[param.curve]?.[dayType] ?? 1;
    const season = seasonFactor(param.curve, m, d);
    const dailyTarget =
      round((base * f * season + (param.curve === 'gasBoiler' ? boost * heatingSeason(m, d) : 0)) *
        (0.93 + 0.14 * h01(param.seed, di, 999)), decimals);
    if (dailyTarget <= 0) continue;
    const raw: number[] = new Array(24);
    let maxIdx = 0;
    for (let h = 0; h < 24; h++) {
      raw[h] = dailyTarget * (weights[h] / wSum) * (0.92 + 0.16 * h01(param.seed, di, h));
      if (raw[h] > raw[maxIdx]) maxIdx = h;
    }
    const rounded = raw.map((v) => Math.max(0, round(v, decimals)));
    const residual = round(dailyTarget - rounded.reduce((a, b) => a + b, 0), decimals);
    if (Math.abs(residual) > 0) rounded[maxIdx] = Math.max(0, round(rounded[maxIdx] + residual, decimals));
    for (let h = 0; h < 24; h++) values[dayHourBase + h] = rounded[h];
  }

  // 真实用能事件（surge / nightSurge）作用于原始值，父级汇总同步体现
  const iso = (di: number) => dateOfDay(di);
  for (const ev of events) {
    if (ev.pointId !== param.pointId) continue;
    if (ev.type === 'surge' || ev.type === 'nightSurge') {
      const from = dayIndexOf(ev.start!);
      const to = dayIndexOf(ev.end!);
      for (let di = from; di <= to; di++) {
        if (di < 0 || di >= TOTAL_DAYS) continue;
        for (let h = 0; h < 24; h++) {
          if (ev.type === 'surge' && ev.dayHoursOnly && (h < 8 || h > 18)) continue;
          if (ev.type === 'nightSurge' && !(ev.hours ?? []).includes(h)) continue;
          const idx = di * 24 + h;
          values[idx] = round(values[idx] * (ev.factor ?? 1), decimals);
        }
      }
    }
  }
  return { values, quality };
}

function applyQualityEvents(series: PointSeries, pointId: string): void {
  for (const ev of events) {
    if (ev.pointId !== pointId) continue;
    if (ev.type === 'missing') {
      const from = hourIndexFromTs(ev.start!);
      const to = hourIndexFromTs(ev.end!);
      for (let i = from; i <= to && i < TOTAL_HOURS; i++) {
        series.quality[i] = QC.missing;
        series.values[i] = NaN;
      }
    } else if (ev.type === 'invalid') {
      const from = hourIndexFromTs(ev.start!);
      const to = hourIndexFromTs(ev.end!);
      for (let i = from; i <= to && i < TOTAL_HOURS; i++) {
        series.quality[i] = QC.invalid;
        series.values[i] = round(series.values[i] * (ev.factor ?? 1), 1);
      }
    } else if (ev.type === 'estimated') {
      const from = hourIndexFromTs(ev.start!);
      const to = hourIndexFromTs(ev.end!);
      for (let i = from; i <= to && i < TOTAL_HOURS; i++) series.quality[i] = QC.estimated;
    }
  }
  // 已审批通过的人工补录替换缺失样本
  for (const cr of correctionsProvider()) {
    if (cr.pointId !== pointId || cr.status !== 'approved') continue;
    const from = hourIndexFromTs(cr.start);
    const to = hourIndexFromTs(cr.end);
    for (let i = from; i <= to && i < TOTAL_HOURS; i++) {
      const v = cr.values[i - from];
      if (typeof v === 'number') {
        series.values[i] = v;
        series.quality[i] = QC.manual_corrected;
      }
    }
  }
}

function buildDerived(param: DerivedParam, get: (id: string) => PointSeries | null): PointSeries {
  const values = new Float64Array(TOTAL_HOURS);
  const quality = new Uint8Array(TOTAL_HOURS);
  const childrenSeries = param.children.map((c) => get(c)).filter((s): s is PointSeries => s !== null);
  for (let i = 0; i < TOTAL_HOURS; i++) {
    let sum = 0;
    for (const cs of childrenSeries) sum += Number.isNaN(cs.values[i]) ? 0 : cs.values[i];
    const noise = 1 + (h01(param.seed, i, 77) - 0.5) * 0.03;
    values[i] = Math.max(0, round(sum * (1 + param.lossPct / 100) * noise, param.decimals));
  }
  return { values, quality };
}

function getOrBuild(pointId: string): PointSeries | null {
  const cached = seriesCache.get(pointId);
  if (cached) return cached;
  const leaf = leaves.find((l) => l.pointId === pointId);
  const derivedParam = derived.find((d) => d.pointId === pointId);
  let series: PointSeries | null = null;
  if (leaf) {
    series = buildLeaf(leaf);
    applyQualityEvents(series, pointId);
    seriesCache.set(pointId, series);
    return series;
  }
  if (derivedParam) {
    series = buildDerived(derivedParam, (id) => getOrBuild(id));
    applyQualityEvents(series, pointId);
    seriesCache.set(pointId, series);
    return series;
  }
  return null;
}

const rawCache = new Map<string, Float64Array>();

/** 原始（事件前）小时值，用于父级边界表汇总，避免子表缺数影响总表实测 */
function rawHours(pointId: string): Float64Array | null {
  const cached = rawCache.get(pointId);
  if (cached) return cached;
  const leaf = leaves.find((l) => l.pointId === pointId);
  const derivedParam = derived.find((d) => d.pointId === pointId);
  let raw: Float64Array | null = null;
  if (leaf && leaf.parent) {
    const parentRaw = rawHours(leaf.parent);
    if (parentRaw) {
      raw = new Float64Array(TOTAL_HOURS);
      for (let i = 0; i < TOTAL_HOURS; i++) {
        const pv = Number.isNaN(parentRaw[i]) ? 0 : parentRaw[i];
        raw[i] = Math.max(0, round(pv * (leaf.share ?? 0) * (1 + (h01(leaf.seed, i, 55) - 0.5) * 0.08), 1));
      }
    }
  } else if (leaf) {
    const built = buildLeaf(leaf);
    raw = built.values;
  } else if (derivedParam) {
    raw = new Float64Array(TOTAL_HOURS);
    for (let i = 0; i < TOTAL_HOURS; i++) {
      let sum = 0;
      for (const c of derivedParam.children) {
        const cs = rawHours(c);
        if (cs) sum += Number.isNaN(cs[i]) ? 0 : cs[i];
      }
      const noise = 1 + (h01(derivedParam.seed, i, 77) - 0.5) * 0.03;
      raw[i] = Math.max(0, round(sum * (1 + derivedParam.lossPct / 100) * noise, derivedParam.decimals));
    }
  }
  if (raw) rawCache.set(pointId, raw);
  return raw;
}

/** share 型分表：独立于父表质量事件，按父表原始曲线比例生成 */
function getShareSeries(pointId: string): PointSeries | null {
  const leaf = leaves.find((l) => l.pointId === pointId && l.curve === 'share');
  if (!leaf) return null;
  const parentRaw = rawHours(leaf.parent!);
  if (!parentRaw) return null;
  const values = new Float64Array(TOTAL_HOURS);
  const quality = new Uint8Array(TOTAL_HOURS);
  for (let i = 0; i < TOTAL_HOURS; i++) {
    const pv = Number.isNaN(parentRaw[i]) ? 0 : parentRaw[i];
    values[i] = Math.max(0, round(pv * (leaf.share ?? 0) * (1 + (h01(leaf.seed, i, 55) - 0.5) * 0.08), 1));
  }
  return { values, quality };
}

export function getSeries(pointId: string): PointSeries | null {
  const leaf = leaves.find((l) => l.pointId === pointId && l.curve === 'share');
  if (leaf) {
    const cached = seriesCache.get(pointId);
    if (cached) return cached;
    const s = getShareSeries(pointId);
    if (s) seriesCache.set(pointId, s);
    return s;
  }
  return getOrBuild(pointId);
}

export function getPointParam(pointId: string): { initialReading: number; decimals: number } | null {
  const leaf = leaves.find((l) => l.pointId === pointId);
  if (leaf) return { initialReading: leaf.initialReading ?? stableInitialReading(pointId), decimals: leaf.decimals ?? 1 };
  const dp = derived.find((d) => d.pointId === pointId);
  if (dp) return { initialReading: dp.initialReading, decimals: dp.decimals };
  return null;
}

export function pointEvents(pointId: string): TelemetryEvent[] {
  return events.filter((e) => e.pointId === pointId);
}

/** 累计读数（含换表重置）。缺失小时沿用上一有效读数 */
export function cumulativeReadings(pointId: string, fromHour: number, toHour: number) {
  const series = getSeries(pointId);
  const param = getPointParam(pointId);
  if (!series || !param) return [];
  const swaps = events
    .filter((e) => e.pointId === pointId && e.type === 'swap')
    .map((e) => ({ at: e.at!, newBase: e.newBase ?? 0 }))
    .sort((a, b) => (a.at < b.at ? -1 : 1));
  let reading = param.initialReading;
  let swapIdx = 0;
  const out: { hour: number; timestamp: string; value: number; quality: Quality }[] = [];
  for (let i = 0; i <= Math.min(toHour, TOTAL_HOURS - 1); i++) {
    if (swapIdx < swaps.length && hourIndexFromTs(swaps[swapIdx].at) <= i) {
      reading = swaps[swapIdx].newBase;
      swapIdx++;
    }
    if (series.quality[i] !== QC.missing && !Number.isNaN(series.values[i])) {
      reading += series.values[i];
    }
    if (i >= fromHour) {
      out.push({ hour: i, timestamp: hourTimestamp(i), value: Math.round(reading * 100) / 100, quality: qualityOfCode(series.quality[i]) });
    }
  }
  return out;
}

/** 15分钟采样预览（由小时曲线确定性细分） */
export function quarterSamples(pointId: string, hourIdx: number): { ts: string; value: number; cum: number }[] {
  const series = getSeries(pointId);
  if (!series || Number.isNaN(series.values[hourIdx])) return [];
  const hourValue = series.values[hourIdx];
  const qw = [0.27, 0.24, 0.25, 0.24];
  const out: { ts: string; value: number; cum: number }[] = [];
  let cum = 0;
  for (let q = 0; q < 4; q++) {
    const v = Math.max(0, round(hourValue * qw[q] * (0.9 + 0.2 * h01(hourIdx + 7, q, 13)), 2));
    cum = round(cum + v, 2);
    out.push({ ts: `${hourTimestamp(hourIdx).slice(0, 13)}:${pad(q * 15)}:00+08:00`, value: v, cum });
  }
  return out;
}

export const telemetrySeedCorrections = seedCorrections;