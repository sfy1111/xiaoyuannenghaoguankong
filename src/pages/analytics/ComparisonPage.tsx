import { useMemo, useState } from 'react';
import { Segmented, Space, Switch, Table, Tag, DatePicker } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyLineChart } from '../../components/charts';
import { CampusSelect, EnergySelect, FilterBar } from '../../components/FilterBar';
import { useFilters, DATA_START, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeDaily, scopeUsage } from '../../services/energyStats';
import { pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, ENERGY_COLOR, ENERGY_LABEL, ENERGY_UNIT, fmtInt } from '../../domain/units';
import { daysBetween, monthRange, shiftDay } from '../../domain/time';
import type { EnergyType } from '../../domain/types';

type Mode = 'mom' | 'yoy';

export default function AnalysisComparisonPage() {
  const { campusId } = useFilters();
  const [energy, setEnergy] = useState<EnergyType>('electricity');
  const [mode, setMode] = useState<Mode>('mom');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [excludeAnomaly, setExcludeAnomaly] = useState(false);
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const periods = useMemo(() => {
    const anchorDay = anchor;
    const anchorMonth = anchorDay.slice(0, 7);
    const cur = monthRange(anchorMonth);
    const curTo = cur.to > DATA_END ? DATA_END : cur.to;
    const prevMonthDayjs = dayjs(anchorMonth + '-01').subtract(1, 'month');
    const prevMonth = prevMonthDayjs.format('YYYY-MM');
    const prev = monthRange(prevMonth);
    const yoyMonth = dayjs(anchorMonth + '-01').subtract(1, 'year').format('YYYY-MM');
    const yoy = monthRange(yoyMonth);
    return {
      cur: { from: cur.from, to: curTo, label: `${anchorMonth}（本月）`, days: daysBetween(cur.from, curTo) },
      prev: `${prev.from}` < DATA_START ? null : { from: prev.from, to: prev.to, label: `${prevMonth}（上月）`, days: daysBetween(prev.from, prev.to) },
      yoy: `${yoy.from}` < DATA_START ? null : { from: yoy.from, to: yoy.to > DATA_END ? DATA_END : yoy.to, label: `${yoyMonth}（去年同期）`, days: daysBetween(yoy.from, yoy.to > DATA_END ? DATA_END : yoy.to) },
    };
  }, [anchor]);

  const usageOf = (from: string, to: string) => {
    const full = scopeUsage(energy, scope, from, to);
    if (!excludeAnomaly) return full;
    const daily = scopeDaily(energy, scope, from, to);
    const cleanDays = daily.filter((r) => !r.hasEstimated && !r.hasInvalid);
    const cleanTotal = cleanDays.reduce((a, r) => a + r.total, 0);
    const expected = cleanDays.length * 24;
    return {
      ...full,
      total: expected === 0 ? null : cleanTotal,
      coverage: full.coverage,
      counted: Math.round(expected * full.coverage),
      expected,
      hasEstimated: false,
      hasInvalid: false,
      incomplete: full.hasMissing,
    };
  };

  const data = useMemo(() => {
    const cur = usageOf(periods.cur.from, periods.cur.to);
    const prev = periods.prev ? usageOf(periods.prev.from, periods.prev.to) : null;
    const yoy = periods.yoy ? usageOf(periods.yoy.from, periods.yoy.to) : null;

    const dailyCur = scopeDaily(energy, scope, periods.cur.from, periods.cur.to);
    const dailyPrev = periods.prev ? scopeDaily(energy, scope, periods.prev.from, periods.prev.to) : [];
    const dailyYoy = periods.yoy ? scopeDaily(energy, scope, periods.yoy.from, periods.yoy.to) : [];

    const categories = ['teaching', 'lab', 'library', 'dormitory', 'canteen', 'office', 'gym', 'datacenter', 'logistics', 'plant'] as const;
    const decomp = categories.map((c) => {
      const buildings = entities.buildings.filter((b) => b.status === 'active' && b.category === c && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)));
      const usage = (from: string, to: string) => buildings.reduce((a, b) => a + (scopeUsage(energy, { buildingId: b.id }, from, to).total ?? 0), 0);
      const curU = usage(periods.cur.from, periods.cur.to);
      const prevU = periods.prev ? usage(periods.prev.from, periods.prev.to) : null;
      const delta = prevU !== null ? curU - prevU : null;
      return {
        key: c,
        label: CATEGORY_LABEL[c],
        cur: curU,
        prev: prevU,
        delta,
        deltaPct: pctChange(curU, prevU),
      };
    }).filter((r) => r.cur > 0 || (r.prev ?? 0) > 0);

    const vacationDaysCur = dailyCur.filter((r) => {
      const cal = entities.calendar;
      const sd = cal.specialDays.find((s) => r.date >= s.date && r.date <= s.end);
      const inBreak = cal.semesters.some((s) => s.type !== 'term' && r.date >= s.start && r.date <= s.end);
      return !!sd || inBreak;
    }).length;

    return { cur, prev, yoy, dailyCur, dailyPrev, dailyYoy, decomp, vacationDaysCur };
  }, [periods, energy, scope, entities, excludeAnomaly]);

  const exportSheet = {
    name: '同比环比分析',
    headers: ['项目', `本期(${periods.cur.label})`, '对比期', '差异', '差异率(%)'],
    rows: [
      [`${ENERGY_LABEL[energy]}总量`, data.cur.total ?? '缺失', data.prev?.total ?? '—', data.prev ? (data.cur.total ?? 0) - (data.prev.total ?? 0) : '—', pctChange(data.cur.total, data.prev?.total ?? null) === null ? '不可计算' : pctChange(data.cur.total, data.prev?.total ?? null)!.toFixed(1)],
      [`${ENERGY_LABEL[energy]}总量（同比）`, data.cur.total ?? '缺失', data.yoy?.total ?? '—', data.yoy ? (data.cur.total ?? 0) - (data.yoy.total ?? 0) : '—', pctChange(data.cur.total, data.yoy?.total ?? null) === null ? '不可计算' : pctChange(data.cur.total, data.yoy?.total ?? null)!.toFixed(1)],
      ...data.decomp.map((r) => [r.label, Math.round(r.cur), r.prev === null ? '—' : Math.round(r.prev), r.delta === null ? '—' : Math.round(r.delta), r.deltaPct === null ? '不可计算' : r.deltaPct.toFixed(1)]),
    ],
  };

  const xForChart = data.dailyCur.map((r) => r.date.slice(8));
  const pad = (rows: typeof data.dailyCur) => data.dailyCur.map((_r, i) => (rows[i] ? Math.round(rows[i].total) : null));

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '同比环比与用能结构']}
        title="同比环比与用能结构"
        subtitle={
          <Space size={8} wrap>
            <span>基期可比性、统计天数与假期分布均展示；基数缺失时显示“不可计算”而非0%</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={<ExportButton filename={`同比环比分析_${anchor.slice(0, 7)}`} sheet={exportSheet} metaNote={`本期：${periods.cur.label}${periods.cur.days}天；对比口径：${excludeAnomaly ? '两侧同口径剔除含估算/无效样本日' : '全样本'}；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">能源</span>
        <EnergySelect value={energy} onChange={setEnergy} />
        <span className="filter-label">对比</span>
        <Segmented size="small" value={mode} options={[{ value: 'mom', label: '环比上月' }, { value: 'yoy', label: '同比去年' }]} onChange={(v) => setMode(v as Mode)} />
        <span className="filter-label">本月</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="filter-label">排除质量异常时段</span>
        <Switch size="small" checked={excludeAnomaly} onChange={setExcludeAnomaly} />
        <span className="muted small">开启后两侧同口径剔除含估算/无效样本的日，重新计算差异</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label={`本期用量（${periods.cur.days}天）`} value={data.cur.total} unit={ENERGY_UNIT[energy]} qualityNote={data.cur.incomplete ? '存在缺失样本' : undefined} />
        <StatCard
          label="环比上月"
          value={data.prev?.total ?? null}
          unit={ENERGY_UNIT[energy]}
          sub={periods.prev ? `${periods.prev.label}（${periods.prev.days}天）` : '基期不在数据窗口内'}
          trend={pctChange(data.cur.total, data.prev?.total ?? null)}
        />
        <StatCard
          label="同比去年同月"
          value={data.yoy?.total ?? null}
          unit={ENERGY_UNIT[energy]}
          sub={periods.yoy ? `${periods.yoy.label}（${periods.yoy.days}天）` : '基期不在数据窗口内'}
          trend={pctChange(data.cur.total, data.yoy?.total ?? null)}
        />
        <StatCard label="本期假期/假日天数" value={data.vacationDaysCur} unit="天" sub="来自校历特殊日与假期段" />
        <StatCard label="本期覆盖率" value={Math.round(data.cur.coverage * 1000) / 10} unit="%" sub={`计入样本 ${data.cur.counted} / ${data.cur.expected}`} />
      </div>

      <ChartCard
        title={`${anchor.slice(0, 7)} 月逐日对比（${ENERGY_UNIT[energy]}）`}
        height={340}
        note={`按日对齐展示本期${periods.prev ? '、上月' : ''}${periods.yoy ? '、去年同期' : ''}曲线；不可比天数见基期说明`}
      >
        <EnergyLineChart
          x={xForChart}
          series={[
            { name: periods.cur.label, data: data.dailyCur.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR[energy] },
            ...(mode === 'mom' && periods.prev ? [{ name: periods.prev.label, data: pad(data.dailyPrev), color: '#95de64', dashed: true }] : []),
            ...(mode === 'yoy' && periods.yoy ? [{ name: periods.yoy.label, data: pad(data.dailyYoy), color: '#ff9c6e', dashed: true }] : []),
          ]}
          unit={ENERGY_UNIT[energy]}
          height={330}
        />
      </ChartCard>

      <div className="table-card">
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.decomp}
          title={() => <span style={{ fontSize: 14, fontWeight: 600 }}>用能结构变化来源分解（本期 vs 上月，按建筑类别）</span>}
          columns={[
            { title: '建筑类别', dataIndex: 'label' },
            { title: `本期(${ENERGY_UNIT[energy]})`, dataIndex: 'cur', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '上月', dataIndex: 'prev', align: 'right' as const, render: (v: number | null) => v === null ? '—' : fmtInt(Math.round(v)) },
            { title: '差异', dataIndex: 'delta', align: 'right' as const, render: (v: number | null) => v === null ? '—' : <span style={{ color: v > 0 ? '#cf1322' : '#389e0d' }}>{v >= 0 ? '+' : ''}{Math.round(v)}</span> },
            {
              title: '差异率', dataIndex: 'deltaPct', align: 'right' as const,
              render: (v: number | null) => v === null ? <Tag>不可计算</Tag> : <Tag color={v > 5 ? 'red' : v < -5 ? 'green' : 'default'}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</Tag>,
            },
          ]}
        />
      </div>
      <div className="muted small mt8">
        可比性说明：环比/同比按等长有效统计窗或显式标注不可比；基期为0或缺失显示“不可计算”。
        寒暑假/考试周错位场景建议结合教学日历分析（<a href="#/analysis/calendar" style={{ color: '#1668dc' }}>教学日历分析</a>）按同类日对比。数据窗口：{DATA_START} 至 {DATA_END}。
        {shiftDay(anchor, 0) > DATA_END && '（提示：当前所选日期超出数据窗口）'}
      </div>
    </div>
  );
}