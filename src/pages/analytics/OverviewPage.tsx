import { useMemo, useState } from 'react';
import { Segmented, Space, Table, Tag, DatePicker } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyLineChart } from '../../components/charts';
import { CampusSelect, CategorySelect, EnergySelect, FilterBar } from '../../components/FilterBar';
import { IncompleteNote } from '../../components/StatusTags';
import { useFilters, DATA_START, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeDaily, scopeMonthly, boundaryNote, scopeUsage } from '../../services/energyStats';
import { pctChange } from '../../domain/analysis';
import { ENERGY_COLOR, ENERGY_LABEL, ENERGY_UNIT, fmtInt } from '../../domain/units';
import { lastNDays, rangeMonths } from '../../domain/time';
import { resolveDay as resolveDayCal, DAY_TYPE_LABEL } from '../../domain/calendar';
import type { DayType, EnergyType } from '../../domain/types';

type Granularity = 'day' | 'month';
interface Row {
  date: string;
  total: number;
  coverage: number;
  hasMissing: boolean;
  hasEstimated: boolean;
  hasInvalid: boolean;
  hasManual: boolean;
  dayType: DayType | null;
}

export default function AnalysisOverviewPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [energy, setEnergy] = useState<EnergyType>('electricity');
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [category, setCategory] = useState<'all' | string>('all');
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId, category === 'all' ? undefined : category), [campusId, category]);

  const rows: Row[] = useMemo(() => {
    if (granularity === 'day') {
      const days = lastNDays(anchor, 30);
      return scopeDaily(energy, scope, days[0], anchor).map((r) => ({
        date: r.date,
        total: r.total,
        coverage: r.coverage,
        hasMissing: r.hasMissing,
        hasEstimated: r.hasEstimated,
        hasInvalid: r.hasInvalid,
        hasManual: r.hasManualCorrected,
        dayType: resolveDayCal(r.date, entities.calendar).dayType,
      }));
    }
    const months = rangeMonths('2025-09', anchor.slice(0, 7));
    return scopeMonthly(energy, scope, months).map((r) => ({
      date: r.date,
      total: r.total,
      coverage: r.coverage,
      hasMissing: r.hasMissing,
      hasEstimated: r.hasEstimated,
      hasInvalid: r.hasInvalid,
      hasManual: r.hasManualCorrected,
      dayType: null,
    }));
  }, [granularity, anchor, energy, scope, entities]);

  const summary = useMemo(() => {
    const from = granularity === 'day' ? lastNDays(anchor, 30)[0] : `${anchor.slice(0, 7)}-01`;
    const to = granularity === 'day' ? anchor : anchor.slice(0, 7) + '-' + String(dayjs(anchor).daysInMonth()).padStart(2, '0');
    const usage = scopeUsage(energy, scope, from, to);
    const dayCount = rows.length;
    const teachingDays = rows.filter((r) => r.dayType === 'teaching' || r.dayType === 'exam').length;
    const validRows = rows.filter((r) => (r.total ?? 0) > 0);
    return {
      usage,
      from, to,
      avgDaily: validRows.length > 0 ? validRows.reduce((a, r) => a + (r.total ?? 0), 0) / validRows.length : null,
      teachingAvg: teachingDays > 0 ? rows.filter((r) => r.dayType === 'teaching' || r.dayType === 'exam').reduce((a, r) => a + (r.total ?? 0), 0) / teachingDays : null,
      teachingDays,
      dayCount,
    };
  }, [granularity, anchor, energy, scope, rows]);

  const month = anchor.slice(0, 7);
  const prevMonthUsage = useMemo(() => {
    const prev = dayjs(month + '-01').subtract(1, 'month');
    const pm = prev.format('YYYY-MM');
    if (pm < '2025-09') return null;
    const pmEnd = prev.daysInMonth();
    return scopeUsage(energy, scope, `${pm}-01`, `${pm}-${pmEnd}`).total;
  }, [month, energy, scope]);

  const yoyUsage = useMemo(() => {
    const y = dayjs(anchor).subtract(1, 'year');
    const ym = y.format('YYYY-MM');
    if (`${ym}-01` < DATA_START) return null;
    const yEnd = `${ym}-${String(y.daysInMonth()).padStart(2, '0')}`;
    const to = yEnd > DATA_END ? DATA_END : yEnd;
    return scopeUsage(energy, scope, `${ym}-01`, to).total;
  }, [anchor, energy, scope]);

  const exportSheet = {
    name: `${ENERGY_LABEL[energy]}统计`,
    headers: ['期间', `用量(${ENERGY_UNIT[energy]})`, '覆盖率', '数据质量', '日类型'],
    rows: rows.map((r) => [
      r.date,
      r.total === 0 ? 0 : r.total ?? '缺失',
      `${(r.coverage * 100).toFixed(1)}%`,
      r.hasMissing ? '含缺失' : r.hasInvalid ? '含无效' : r.hasEstimated ? '含估算' : r.hasManual ? '含人工修正' : '完整',
      r.dayType ? DAY_TYPE_LABEL[r.dayType] : '',
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能耗分析', '校园总量与趋势']}
        title="校园总量与趋势"
        subtitle={
          <Space size={8} wrap>
            <span>口径：{boundaryNote(energy, scope)}</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
            <span className="muted">未配置折标系数，综合能耗不展示折标数值，各能源实物量独立统计</span>
          </Space>
        }
        extra={<ExportButton filename={`${ENERGY_LABEL[energy]}_${granularity === 'day' ? '近30日' : '月度'}统计`} sheet={exportSheet} metaNote={`统计范围：${boundaryNote(energy, scope)}；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">建筑类别</span>
        <CategorySelect value={category} onChange={setCategory} />
        <span className="filter-label">能源</span>
        <EnergySelect value={energy} onChange={setEnergy} />
        <span className="filter-label">粒度</span>
        <Segmented size="small" value={granularity} options={[{ value: 'day', label: '按日' }, { value: 'month', label: '按月' }]} onChange={(v) => setGranularity(v as Granularity)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} disabledDate={(d) => d.isBefore(dayjs(DATA_START)) || d.isAfter(dayjs(DATA_END))} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">点击月度图表柱条可下钻至该月日粒度</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label={`本期${ENERGY_LABEL[energy]}总量`} value={summary.usage.total} unit={ENERGY_UNIT[energy]} sub={`${summary.from} 至 ${summary.to}`} qualityNote={summary.usage.incomplete ? '存在缺失/无效样本' : undefined} />
        <StatCard label="日均用量" value={summary.avgDaily === null ? '—' : Math.round(summary.avgDaily)} unit={ENERGY_UNIT[energy]} sub={`${summary.dayCount} 个统计日`} />
        <StatCard label="教学日均用量" value={summary.teachingAvg === null ? '不可计算' : Math.round(summary.teachingAvg)} unit={summary.teachingAvg === null ? undefined : ENERGY_UNIT[energy]} sub={`教学日 ${summary.teachingDays} 天（不把周末/假期混入分母）`} />
        <StatCard label="上月同期" value={prevMonthUsage} unit={ENERGY_UNIT[energy]} trend={pctChange(summary.usage.total, prevMonthUsage)} trendLabel="环比上月" />
        <StatCard label="去年同期（月）" value={yoyUsage} unit={ENERGY_UNIT[energy]} trend={pctChange(summary.usage.total, yoyUsage)} trendLabel="同比" />
      </div>

      <ChartCard
        title={`${granularity === 'day' ? '近30日' : '分月'}${ENERGY_LABEL[energy]}趋势（${ENERGY_UNIT[energy]}）`}
        height={340}
        note="曲线断开处为缺失样本，不按0填充"
      >
        <EnergyLineChart
          x={rows.map((r) => granularity === 'day' ? r.date.slice(5) : r.date)}
          series={[{
            name: ENERGY_LABEL[energy],
            data: rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)),
            color: ENERGY_COLOR[energy],
            area: true,
          }]}
          unit={ENERGY_UNIT[energy]}
          height={330}
          showLegend={false}
          onEvent={(p) => {
            if (granularity === 'month') {
              setGranularity('day');
              setAnchor(`${p.name}-15`);
            }
          }}
        />
      </ChartCard>

      <div className="table-card">
        <Table
          size="small"
          rowKey="date"
          pagination={{ pageSize: 15 }}
          dataSource={rows.slice().reverse()}
          columns={[
            { title: '期间', dataIndex: 'date' },
            { title: `用量(${ENERGY_UNIT[energy]})`, dataIndex: 'total', align: 'right' as const, render: (v: number | null) => v === null ? '—' : fmtInt(v) },
            { title: '覆盖率', dataIndex: 'coverage', width: 90, render: (c: number) => `${(c * 100).toFixed(1)}%` },
            { title: '数据质量', width: 120, render: (_v, r) => <IncompleteNote hasMissing={r.hasMissing} hasEstimated={r.hasEstimated} hasInvalid={r.hasInvalid} hasManual={r.hasManual} /> },
            {
              title: '日类型', dataIndex: 'dayType', width: 90,
              render: (t: string | null) => t ? <Tag color={t === 'teaching' ? 'blue' : t === 'exam' ? 'purple' : t === 'vacation' ? 'orange' : t === 'holiday' ? 'red' : 'default'}>{DAY_TYPE_LABEL[t as keyof typeof DAY_TYPE_LABEL] ?? t}</Tag> : '—',
            },
          ]}
        />
      </div>
      <div className="muted small mt8">
        提示：{resolveDayCal(anchor, entities.calendar).specialName ? `当前统计截止日为「${resolveDayCal(anchor, entities.calendar).specialName}」` : '统计口径与驾驶舱、报表、费用页一致'}；
        亦可
        <a onClick={() => navigate('/analysis/buildings')}>查看建筑排行</a>
        或
        <a onClick={() => navigate('/analysis/comparison')}>同比环比分析</a>。
      </div>
    </div>
  );
}