import type { EnergyType, EnergyBill, PricePlan } from '../domain/types';
import { getEntities } from './repository';
import { getSeries, hourIndexOf, dayIndexOf, dateOfDay, TOTAL_HOURS, qualityOfCode } from './telemetry';
import { activePlanForDate, segmentOfHour, hourOfTimestamp } from '../domain/energy/tou';
import { compareBill, classifyDifference } from '../domain/costs';

function usageOfDay(pointIds: string[], di: number): number {
  let total = 0;
  for (const pid of pointIds) {
    const s = getSeries(pid);
    if (!s) continue;
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      const q = qualityOfCode(s.quality[i]);
      if (q === 'missing' || q === 'invalid') continue;
      const v = s.values[i];
      if (!Number.isNaN(v)) total += v;
    }
  }
  return total;
}

export interface ElectricityCostResult {
  amount: number;
  bySegment: { name: string; usage: number; price: number; amount: number }[];
  usage: number;
  incomplete: boolean;
  noPlan: boolean;
}

/** 分时电费：按日取有效电价方案，缺失/无效样本不计入并提示不完整 */
export function electricityCost(pointIds: string[], from: string, to: string): ElectricityCostResult {
  const ent = getEntities();
  const plans = ent.prices.filter((p) => p.energyType === 'electricity');
  const segMap = new Map<string, { name: string; usage: number; price: number; amount: number }>();
  let amount = 0;
  let usage = 0;
  let incomplete = false;
  let noPlan = false;
  const fromDi = dayIndexOf(from);
  const toDi = dayIndexOf(to);
  for (let di = Math.max(0, fromDi); di <= toDi; di++) {
    if (di < 0 || di * 24 >= TOTAL_HOURS) break;
    const date = dateOfDay(di);
    const plan = activePlanForDate<PricePlan>(plans, 'electricity', date);
    if (!plan || !plan.segments) { noPlan = true; continue; }
    for (const seg of plan.segments) {
      if (!segMap.has(seg.name)) segMap.set(seg.name, { name: seg.name, usage: 0, price: seg.price, amount: 0 });
    }
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      let hourSum = 0;
      let counted = false;
      let missed = false;
      for (const pid of pointIds) {
        const s = getSeries(pid);
        if (!s) continue;
        const q = qualityOfCode(s.quality[i]);
        if (q === 'missing' || q === 'invalid') { missed = true; continue; }
        const v = s.values[i];
        if (!Number.isNaN(v)) { hourSum += v; counted = true; }
      }
      if (missed) incomplete = true;
      if (!counted) continue;
      const seg = segmentOfHour(plan.segments, h);
      if (!seg) continue;
      const entry = segMap.get(seg.name)!;
      entry.usage += hourSum;
      const a = hourSum * seg.price;
      entry.amount += a;
      amount += a;
      usage += hourSum;
    }
  }
  const bySegment = [...segMap.values()].map((e) => ({
    name: e.name,
    usage: Math.round(e.usage * 10) / 10,
    price: e.price,
    amount: Math.round(e.amount * 100) / 100,
  }));
  return {
    amount: Math.round(amount * 100) / 100,
    bySegment,
    usage: Math.round(usage * 10) / 10,
    incomplete,
    noPlan,
  };
}

/** 水费：按日取水价方案计算；气费同 */
export function simpleEnergyCost(energy: 'water' | 'gas', pointIds: string[], from: string, to: string): { amount: number; usage: number; incomplete: boolean; noPlan: boolean; priceNote: string } {
  const ent = getEntities();
  const plans = ent.prices.filter((p) => p.energyType === energy);
  let amount = 0;
  let usage = 0;
  let incomplete = false;
  let noPlan = false;
  let lastPrice = 0;
  for (let di = Math.max(0, dayIndexOf(from)); di <= dayIndexOf(to); di++) {
    if (di < 0 || di * 24 >= TOTAL_HOURS) break;
    const date = dateOfDay(di);
    const plan = activePlanForDate<PricePlan>(plans, energy, date);
    if (!plan || !plan.price) { noPlan = true; continue; }
    lastPrice = plan.price;
    const u = usageOfDay(pointIds, di);
    amount += u * plan.price;
    usage += u;
    const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      for (const s of seriesList) if (qualityOfCode(s.quality[i]) === 'missing') incomplete = true;
    }
  }
  return {
    amount: Math.round(amount * 100) / 100,
    usage: Math.round(usage * 10) / 10,
    incomplete,
    noPlan,
    priceNote: lastPrice > 0 ? `执行单价 ${lastPrice} 元/m³` : '',
  };
}

/** 某校区（或全校）某月的能源费用测算 */
export function campusMonthlyEstimate(campusId: 'all' | string, month: string): Record<EnergyType, { amount: number; usage: number; incomplete: boolean } | null> {
  const ent = getEntities();
  const campusIds = campusId === 'all' ? ent.campuses.map((c) => c.id) : [campusId];
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  const from = `${month}-01`;
  const to = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
  const pick = (energy: EnergyType, filter: (p: { campusId: string }) => boolean): string[] => {
    if (energy === 'electricity') {
      return ent.meteringPoints.filter((p) => p.energyType === 'electricity' && p.role === 'main' && !p.buildingId && campusIds.includes(p.campusId)).map((p) => p.id);
    }
    if (energy === 'water') {
      return ent.meteringPoints.filter((p) => p.energyType === 'water' && p.role === 'main' && !p.buildingId && campusIds.includes(p.campusId)).map((p) => p.id);
    }
    return ent.meteringPoints.filter((p) => p.energyType === energy && filter(p) && campusIds.includes(p.campusId) && (p.role === 'main' || p.role === 'plantOutput') && (p.buildingId !== null || p.role === 'plantOutput')).map((p) => p.id);
  };
  const elecIds = pick('electricity', () => true);
  const waterIds = pick('water', () => true);
  const gasIds = ent.meteringPoints.filter((p) => p.energyType === 'gas' && campusIds.includes(p.campusId)).map((p) => p.id);
  const elec = electricityCost(elecIds, from, to);
  const water = simpleEnergyCost('water', waterIds, from, to);
  const gas = simpleEnergyCost('gas', gasIds, from, to);
  const map: Record<EnergyType, { amount: number; usage: number; incomplete: boolean } | null> = {
    electricity: elecIds.length ? { amount: elec.amount, usage: elec.usage, incomplete: elec.incomplete } : null,
    water: waterIds.length ? { amount: water.amount, usage: water.usage, incomplete: water.incomplete } : null,
    gas: gasIds.length ? { amount: gas.amount, usage: gas.usage, incomplete: gas.incomplete } : null,
    heat: null,
    cooling: null,
    hotWater: null,
  };
  return map;
}

export interface BillRow extends EnergyBill {
  estimatedUsage: number;
  estimatedAmount: number;
  billedUsage: number;
  billedAmount: number;
  difference: number;
  differencePct: number | null;
  differenceCategories: string[];
  planNote: string;
}

export function billRowOf(bill: EnergyBill): BillRow {
  const ent = getEntities();
  const [y, m] = bill.period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  const from = `${bill.period}-01`;
  const to = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
  let estimatedAmount = 0;
  let estimatedUsage = 0;
  let planNote = '';
  if (bill.energyType === 'electricity') {
    const r = electricityCost(bill.billingPointIds, from, to);
    estimatedAmount = r.amount;
    estimatedUsage = r.usage;
    const plan = activePlanForDate(ent.prices, 'electricity', `${bill.period}-15`);
    planNote = plan ? `${plan.name}（${plan.note}）` : '无适用电价方案';
  } else {
    const r = simpleEnergyCost(bill.energyType === 'water' ? 'water' : 'gas', bill.billingPointIds, from, to);
    estimatedAmount = r.amount;
    estimatedUsage = r.usage;
    planNote = r.priceNote || '无适用价格方案';
  }
  const cmp = compareBill(estimatedAmount, bill.usageDeltaPct, bill.extraFee, 1 + bill.usageDeltaPct);
  // 人工录入的账单以录入值为准（账单金额固定，不随价格重算变化）
  const billedUsage = bill.billedUsageOverride ?? cmp.billedUsage;
  const billedAmount = bill.billedAmountOverride ?? cmp.billedAmount;
  const difference = Math.round((billedAmount - estimatedAmount) * 100) / 100;
  const differencePct = estimatedAmount === 0 ? null : Math.round((difference / estimatedAmount) * 10000) / 100;
  return {
    ...bill,
    estimatedUsage,
    estimatedAmount,
    billedUsage,
    billedAmount,
    difference,
    differencePct,
    differenceCategories: classifyDifference(difference, bill.extraFee, bill.usageDeltaPct),
    planNote,
  };
}

export function allBillRows(campusId?: 'all' | string): BillRow[] {
  const ent = getEntities();
  return ent.energyBills
    .filter((b) => !campusId || campusId === 'all' || b.campusId === campusId)
    .map(billRowOf)
    .sort((a, b) => (a.period < b.period ? 1 : -1));
}

/** 每日分时电量结构（用于峰平谷图表） */
export function electricityTouDaily(pointIds: string[], from: string, to: string): {
  date: string;
  segments: Record<string, number>;
  total: number;
}[] {
  const ent = getEntities();
  const plans = ent.prices.filter((p) => p.energyType === 'electricity');
  const seriesList = pointIds.map((p) => getSeries(p)).filter((s): s is NonNullable<typeof s> => s !== null);
  const out: { date: string; segments: Record<string, number>; total: number }[] = [];
  for (let di = Math.max(0, dayIndexOf(from)); di <= dayIndexOf(to); di++) {
    if (di < 0 || di * 24 >= TOTAL_HOURS) break;
    const date = dateOfDay(di);
    const plan = activePlanForDate<PricePlan>(plans, 'electricity', date);
    const segNames = [...new Set((plan?.segments ?? []).map((s) => s.name))];
    const segments: Record<string, number> = {};
    let total = 0;
    for (const name of segNames) segments[name] = 0;
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      const seg = plan?.segments ? segmentOfHour(plan.segments, h) : null;
      let hourSum = 0;
      let counted = false;
      for (const s of seriesList) {
        const q = qualityOfCode(s.quality[i]);
        if (q === 'missing' || q === 'invalid') continue;
        const v = s.values[i];
        if (!Number.isNaN(v)) { hourSum += v; counted = true; }
      }
      if (!counted || !seg) continue;
      segments[seg.name] = (segments[seg.name] ?? 0) + hourSum;
      total += hourSum;
    }
    out.push({ date, segments, total: Math.round(total * 10) / 10 });
  }
  return out;
}

/** 价格变更影响测算：用给定方案试算某月电费（不改账单） */
export function trialElectricityCost(pointIds: string[], from: string, to: string, overridePlan?: PricePlan): ElectricityCostResult {
  if (!overridePlan) return electricityCost(pointIds, from, to);
  const base = electricityCost(pointIds, from, to);
  const plans = [overridePlan];
  let amount = 0;
  let usage = 0;
  const segMap = new Map<string, { name: string; usage: number; price: number; amount: number }>();
  for (const seg of overridePlan.segments ?? []) {
    if (!segMap.has(seg.name)) segMap.set(seg.name, { name: seg.name, usage: 0, price: seg.price, amount: 0 });
  }
  for (let di = dayIndexOf(from); di <= dayIndexOf(to); di++) {
    if (di < 0 || di * 24 >= TOTAL_HOURS) break;
    const plan = activePlanForDate<PricePlan>(plans, 'electricity', dateOfDay(di));
    if (!plan?.segments) continue;
    for (let h = 0; h < 24; h++) {
      const i = di * 24 + h;
      if (i >= TOTAL_HOURS) break;
      let hourSum = 0;
      let counted = false;
      for (const pid of pointIds) {
        const s = getSeries(pid);
        if (!s) continue;
        const q = qualityOfCode(s.quality[i]);
        if (q === 'missing' || q === 'invalid') continue;
        const v = s.values[i];
        if (!Number.isNaN(v)) { hourSum += v; counted = true; }
      }
      if (!counted) continue;
      const seg = segmentOfHour(plan.segments, h);
      if (!seg) continue;
      const entry = segMap.get(seg.name)!;
      entry.usage += hourSum;
      const a = hourSum * seg.price;
      entry.amount += a;
      amount += a;
      usage += hourSum;
    }
  }
  return {
    amount: Math.round(amount * 100) / 100,
    bySegment: [...segMap.values()].map((e) => ({ name: e.name, usage: Math.round(e.usage * 10) / 10, price: e.price, amount: Math.round(e.amount * 100) / 100 })),
    usage: Math.round(usage * 10) / 10,
    incomplete: base.incomplete,
    noPlan: false,
  };
}