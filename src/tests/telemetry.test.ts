import { describe, expect, it, beforeAll } from 'vitest';
import {
  getSeries, hourIndexOf, hourTimestamp, qualityOfCode, QC, cumulativeReadings, TOTAL_HOURS,
} from '../services/telemetry';
import { aggregateHours, dailyRows, buildingSubitems, campusBalance, teachingStats } from '../services/energyStats';
import { electricityCost } from '../services/costService';
import { dayIndexOf } from '../services/telemetry';

const T = (v: number | null | undefined) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

describe('遥测数据一致性', () => {
  it('小时用量之和 = 日用量（有效数据时）', () => {
    const day = '2026-09-15';
    const fromH = hourIndexOf(day, 0);
    const toH = hourIndexOf(day, 23);
    const hourSum = aggregateHours(['P-TA-M'], fromH, toH).total ?? 0;
    const daily = dailyRows(['P-TA-M'], day, day)[0]?.total ?? 0;
    expect(Math.abs(hourSum - daily)).toBeLessThan(0.5);
    expect(hourSum).toBeGreaterThan(100);
  });

  it('日用量之和 = 月用量', () => {
    const daily = dailyRows(['P-TA-M'], '2026-09-01', '2026-09-30');
    const sum = daily.reduce((a, r) => a + r.total, 0);
    const monthAgg = aggregateHours(['P-TA-M'], hourIndexOf('2026-09-01', 0), hourIndexOf('2026-09-30', 23)).total ?? 0;
    expect(Math.abs(sum - monthAgg)).toBeLessThan(1);
  });

  it('校区进线 > 各建筑主表合计（存在未分项差额而非重复相加）', () => {
    const from = '2026-09-15';
    const to = '2026-09-15';
    const feed = aggregateHours(['P-EF1', 'P-EF2'], hourIndexOf(from, 0), hourIndexOf(to, 23)).total ?? 0;
    const buildings = ['P-TA-M', 'P-TB-M', 'P-LC-M', 'P-AD-M', 'P-GY-M', 'P-LIB-M', 'P-IC-M', 'P-D1-M', 'P-D2-M', 'P-C1-M'];
    const sum = aggregateHours(buildings, hourIndexOf(from, 0), hourIndexOf(to, 23)).total ?? 0;
    expect(feed).toBeGreaterThan(sum);
    expect(feed / sum).toBeGreaterThan(1.02);
    expect(feed / sum).toBeLessThan(1.2);
  });

  it('建筑分项合计小于主表（差额为未分项，不为负）', () => {
    const r = buildingSubitems('B-TA', 'electricity', '2026-09-15', '2026-09-15');
    expect(r.uncovered).not.toBeNull();
    expect(r.uncovered!).toBeGreaterThan(0);
    expect(r.uncoveredPct!).toBeGreaterThan(1);
    expect(r.anomaly).toBe(false);
  });

  it('夜间用水异常事件体现在数据中（告警可溯源）', () => {
    const series = getSeries('P-D1-W')!;
    const surgeIdx = hourIndexOf('2026-10-15', 2);
    const normalIdx = hourIndexOf('2026-10-05', 2);
    expect(series.values[surgeIdx]).toBeGreaterThan(series.values[normalIdx] * 2);
  });

  it('缺失样本不计入且保留缺口，不默认为 0', () => {
    const series = getSeries('P-D2-W')!;
    const idx = hourIndexOf('2026-09-21', 3);
    expect(qualityOfCode(series.quality[idx])).toBe('missing');
    const day = aggregateHours(['P-D2-W'], hourIndexOf('2026-09-21', 0), hourIndexOf('2026-09-21', 23));
    expect(day.hasMissing).toBe(true);
    expect(day.coverage).toBeLessThan(1);
  });

  it('已审批补录标记为人工修正', () => {
    const series = getSeries('P-D2-W')!;
    const idx = hourIndexOf('2026-09-20', 8);
    expect(qualityOfCode(series.quality[idx])).toBe('manual_corrected');
    expect(series.values[idx]).toBeGreaterThan(0);
  });

  it('换表后累计读数重置且无负用量', () => {
    const before = cumulativeReadings('P-D2-W', hourIndexOf('2026-09-11', 0), hourIndexOf('2026-09-12', 7));
    const after = cumulativeReadings('P-D2-W', hourIndexOf('2026-09-12', 8), hourIndexOf('2026-09-12', 20));
    expect(before[before.length - 1].value).toBeGreaterThan(80000);
    expect(after[0].value).toBeLessThan(200);
    const diffs = after.map((r, i) => i === 0 ? 0 : r.value - after[i - 1].value);
    expect(Math.min(...diffs)).toBeGreaterThanOrEqual(-0.01);
  });

  it('估算时段计入总量并标记', () => {
    const day = aggregateHours(['P-TA-W'], hourIndexOf('2026-06-10', 0), hourIndexOf('2026-06-10', 23));
    expect(day.hasEstimated).toBe(true);
    expect(day.total).toBeGreaterThan(0);
  });

  it('无效样本时段不产生异常突增统计（信息中心跳变样本排除）', () => {
    const day = aggregateHours(['P-IC-M'], hourIndexOf('2026-10-08', 0), hourIndexOf('2026-10-08', 23));
    expect(day.hasInvalid).toBe(true);
    const neighbor = aggregateHours(['P-IC-M'], hourIndexOf('2026-10-09', 0), hourIndexOf('2026-10-09', 23));
    expect(Math.abs((day.total ?? 0) - (neighbor.total ?? 0)) / (neighbor.total ?? 1)).toBeLessThan(0.15);
  });

  it('校区水平衡存在计量差额（入口 > 已覆盖终端合计）', () => {
    const bal = campusBalance('C-E', 'water', '2026-09-15', '2026-09-15');
    expect(bal.boundary.total ?? 0).toBeGreaterThan(bal.buildingTotal + bal.publicTotal);
    expect(bal.uncovered!).toBeGreaterThan(0);
  });

  it('假期教学楼负荷显著低于教学日（校历因果一致）', () => {
    const teachingDay = dailyRows(['P-TA-M'], '2026-09-15', '2026-09-15')[0]?.total ?? 0;
    const vacationDay = dailyRows(['P-TA-M'], '2026-07-20', '2026-07-20')[0]?.total ?? 0;
    expect(teachingDay / vacationDay).toBeGreaterThan(2.5);
  });

  it('图书馆考试周负荷高于普通教学日（延长开放）', () => {
    const examDay = dailyRows(['P-LIB-M'], '2026-06-24', '2026-06-24')[0]?.total ?? 0;
    const normalDay = dailyRows(['P-LIB-M'], '2026-06-15', '2026-06-15')[0]?.total ?? 0;
    expect(examDay / normalDay).toBeGreaterThan(1.1);
  });
});

describe('教学时段统计', () => {
  it('教学楼非教学时段占比在合理区间且口径说明存在', () => {
    const stats = teachingStats('B-TA', '2026-09-01', '2026-09-30');
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.nonTeachingShare!).toBeGreaterThan(10);
    expect(stats.nonTeachingShare!).toBeLessThan(80);
    expect(stats.definition.length).toBeGreaterThan(0);
  });

  it('24小时运行建筑不判为异常高占比', () => {
    const stats = teachingStats('B-LC', '2026-09-01', '2026-09-30');
    expect(stats.nonTeachingShare).not.toBeNull();
  });
});

describe('费用测算与价格联动', () => {
  it('9月电费按新价格方案测算，8月按旧方案', () => {
    const feeds = ['P-EF1', 'P-EF2'];
    const aug = electricityCost(feeds, '2026-08-01', '2026-08-31');
    const sep = electricityCost(feeds, '2026-09-01', '2026-09-30');
    expect(aug.bySegment.find((s) => s.name === '尖峰')!.price).toBe(1.25);
    expect(sep.bySegment.find((s) => s.name === '尖峰')!.price).toBe(1.3);
    expect(sep.amount).toBeGreaterThan(aug.amount * 0.95);
  });

  it('分时结构合计等于总电量', () => {
    const sep = electricityCost(['P-EF1', 'P-EF2'], '2026-09-01', '2026-09-30');
    const segSum = sep.bySegment.reduce((a, s) => a + s.usage, 0);
    expect(Math.abs(segSum - sep.usage)).toBeLessThan(1);
  });

  it('供冷季能源站COP可计算且内部热量不重复计入购入电量', () => {
    const coolOut = aggregateHours(['P-EP-CO'], hourIndexOf('2026-07-15', 0), hourIndexOf('2026-07-15', 23)).total ?? 0;
    const chillerElec = aggregateHours(['P-EP-CH'], hourIndexOf('2026-07-15', 0), hourIndexOf('2026-07-15', 23)).total ?? 0;
    expect(coolOut).toBeGreaterThan(0);
    const cop = coolOut / (chillerElec || 1);
    expect(cop).toBeGreaterThan(1.5);
    expect(cop).toBeLessThan(8);
    const winter = aggregateHours(['P-EP-CO'], hourIndexOf('2026-01-15', 0), hourIndexOf('2026-01-15', 23)).total ?? 0;
    expect(winter).toBe(0);
  });
});

describe('时间窗口', () => {
  it('数据窗口与时间戳换算一致', () => {
    expect(hourTimestamp(hourIndexOf('2026-10-21', 7))).toContain('2026-10-21T07:00');
    expect(hourIndexOf('2026-10-21', 7)).toBe(TOTAL_HOURS - 1);
    expect(dayIndexOf('2025-09-01')).toBe(0);
  });

  it('热泵输出热量与输入电分开计量（防重复统计）', () => {
    const hw = aggregateHours(['P-D1-HW'], hourIndexOf('2026-10-15', 0), hourIndexOf('2026-10-15', 23)).total ?? 0;
    const elec = aggregateHours(['P-D1-L3'], hourIndexOf('2026-10-15', 0), hourIndexOf('2026-10-15', 23)).total ?? 0;
    expect(hw).toBeGreaterThan(0);
    expect(elec).toBeGreaterThan(0);
    expect(hw).toBeGreaterThan(elec);
  });
});

describe('数据质量', () => {
  it('质量码映射一致', () => {
    expect(qualityOfCode(QC.valid)).toBe('valid');
    expect(qualityOfCode(QC.missing)).toBe('missing');
    expect(qualityOfCode(QC.manual_corrected)).toBe('manual_corrected');
  });

  it('近期有效点在窗口内有数据', () => {
    const s = getSeries('P-TA-M')!;
    const idx = hourIndexOf('2026-10-20', 12);
    expect(s.values[idx]).toBeGreaterThan(0);
    expect(qualityOfCode(s.quality[idx])).toBe('valid');
  });
});

void T;
void QC;