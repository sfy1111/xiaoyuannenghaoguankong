import { useMemo, useState } from 'react';
import { DatePicker, Segmented, Space, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage, scopeHourly, dailyRows, teachingStats } from '../../services/energyStats';
import { intensity } from '../../domain/analysis';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays, rangeDays } from '../../domain/time';
import { resolveDay } from '../../domain/calendar';

type VenueTab = 'library' | 'gym';

export default function ScenarioLibrarySportsPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [tab, setTab] = useState<VenueTab>('library');
  const [anchor, setAnchor] = useState('2026-06-24');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const building = entities.buildings.find((b) => b.category === tab);
  const openRule = entities.calendar.openHours.find((o) => o.category === tab);

  const data = useMemo(() => {
    if (!building) return null;
    const days30 = lastNDays(anchor, 30);
    const usage = scopeUsage('electricity', { buildingId: building.id }, days30[0], anchor);
    const daily = dailyRows(
      entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id),
      days30[0], anchor,
    );
    const examDay = [...daily].sort((a, b) => b.total - a.total)[0];
    const examStats = teachingStats(building.id, `${anchor.slice(0, 4)}-06-20`, `${anchor.slice(0, 4)}-06-30`);
    const normalStats = teachingStats(building.id, `${anchor.slice(0, 4)}-06-08`, `${anchor.slice(0, 4)}-06-19`);
    const water = scopeUsage('water', { buildingId: building.id }, days30[0], anchor);
    const hourCompare = (() => {
      const examRows = scopeHourly('electricity', { buildingId: building.id }, '2026-06-24', '2026-06-24');
      const normalRows = scopeHourly('electricity', { buildingId: building.id }, '2026-06-10', '2026-06-10');
      return { examRows, normalRows };
    })();
    return { usage, daily, examDay, examStats, normalStats, water, hourCompare };
  }, [building, anchor, entities]);

  if (!building || !data) {
    return <PageHeader breadcrumb={['校园专题', '图书馆/体育馆']} title="图书馆与体育场馆" subtitle="当前范围无相应场馆档案" />;
  }

  const exportSheet = {
    name: '场馆用能',
    headers: ['日期', '日类型', '用电量(kWh)'],
    rows: data.daily.map((r) => [r.date, resolveDay(r.date, entities.calendar).dayType, Math.round(r.total)]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '图书馆/体育馆']}
        title="图书馆与体育场馆专题"
        subtitle={
          <Space size={8} wrap>
            <span>开放时段能耗、考试周延长开放对比与面积强度；无客流数据时不计算人次能耗</span>
            <span className="muted">统计期：近30日（至 {anchor}）</span>
          </Space>
        }
        extra={<ExportButton filename={`场馆用能_${building.id}`} sheet={exportSheet} metaNote={`场馆：${building.name}；开放时段按校历开放时间定义`} />}
      />
      <FilterBar>
        <span className="filter-label">场馆</span>
        <Segmented size="small" value={tab} options={[{ value: 'library', label: '图书馆' }, { value: 'gym', label: '体育馆' }]} onChange={(v) => setTab(v as VenueTab)} />
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="近30日用电量" value={data.usage.total} unit="kWh" qualityNote={data.usage.incomplete ? '存在缺失样本' : undefined} />
        <StatCard
          label="单位面积电耗（近30日）"
          value={intensity(data.usage.total, building.assessmentArea) === null ? '不可计算' : Math.round(intensity(data.usage.total, building.assessmentArea)! * 1000) / 1000}
          unit={intensity(data.usage.total, building.assessmentArea) === null ? undefined : 'kWh/m²'}
          sub={`考核面积 ${fmtInt(building.assessmentArea)} m²`}
        />
        <StatCard
          label={tab === 'library' ? '考试周开放延长' : '活动日对比'}
          value={tab === 'library' ? `至 ${openRule?.examExtension ?? '—'}` : '按预约开放'}
          sub={tab === 'library' ? '考试周延长开放时段用电同步上升（见对比曲线）' : '比赛/活动日负荷高于平日'}
        />
        <StatCard
          label="开放日均电耗"
          value={Math.round((data.examStats.teachingHoursUsage ?? 0) / 10)}
          unit="kWh"
          sub="以开放时段用电÷开放日估计；分母为校历开放时间"
        />
        {tab === 'gym' && <StatCard label="近30日用水（泳池）" value={data.water.total} unit="m³" sub="泳池补水与淋浴用水" />}
      </div>

      <div className="chart-grid c2">
        <ChartCard title="逐日用电趋势（近30日）" height={300}>
          <EnergyLineChart
            x={data.daily.map((r) => r.date.slice(5))}
            series={[{ name: '日用电量', data: data.daily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard
          title={tab === 'library' ? '考试周 vs 普通教学周 日内对比' : '活动日 vs 平日 日内对比'}
          height={300}
          note={tab === 'library' ? '2026-06-24（考试周）vs 2026-06-10（普通周）：延长开放至23:00，夜间用电抬升' : '按开放时段对比日内曲线'}
        >
          <EnergyLineChart
            x={Array.from({ length: 24 }, (_, h) => `${h}时`)}
            series={[
              { name: tab === 'library' ? '考试周 06-24' : '活动日', data: data.hourCompare.examRows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: '#722ed1' },
              { name: tab === 'library' ? '普通周 06-10' : '平日', data: data.hourCompare.normalRows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: ENERGY_COLOR.electricity, dashed: true },
            ]}
            unit="kWh/h"
            height={290}
          />
        </ChartCard>
      </div>

      <div className="table-card">
        <h4 className="section-title">场馆信息与统计口径</h4>
        <Table
          size="small"
          rowKey="k"
          pagination={false}
          dataSource={[
            { k: '开放时间', v: `${openRule?.start}-${openRule?.end}（考试周至${openRule?.examExtension}；假期 ${openRule?.breakStart}-${openRule?.breakEnd}）` },
            { k: '责任单位', v: entities.departments.find((d) => d.id === building.departmentId)?.name ?? '—' },
            { k: '备注', v: building.remark || '—' },
            { k: '人次能耗', v: '入馆/入场人次数据未接入，暂不计算人次能耗（分母无效）' },
            { k: '近30日用水', v: `${fmtInt(Math.round(data.water.total ?? 0))} m³${tab === 'gym' ? '（含恒温泳池补水）' : ''}` },
          ]}
          columns={[
            { dataIndex: 'k', width: 120, render: (v: string) => <b>{v}</b> },
            { dataIndex: 'v' },
          ]}
        />
        <div className="muted small mt8">
          <a onClick={() => navigate(`/monitor/building/${building.id}?from=${lastNDays(anchor, 30)[0]}&to=${anchor}`)}>进入楼宇详情</a>
          ；考试周延长开放期间的非教学时段异常判断，按批准开放例外处理（校历开放时间维护后自动生效）。
        </div>
      </div>
    </div>
  );
}