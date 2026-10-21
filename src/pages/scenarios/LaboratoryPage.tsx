import { useMemo, useState } from 'react';
import { DatePicker, Select, Space, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyStackedBar } from '../../components/charts';
import { BuildingSelect, CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage, scopeHourly, dailyRows, teachingStats } from '../../services/energyStats';
import { ENERGY_COLOR, SUBITEM_COLORS, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import { rangeDays } from '../../domain/time';
import { DAY_TYPE_LABEL, resolveDay as resolveDayCal } from '../../domain/calendar';

export default function ScenarioLaboratoryPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [buildingId, setBuildingId] = useState<string>('B-LC');
  const [from, setFrom] = useState('2026-09-01');
  const [to, setTo] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const labs = entities.buildings.filter(
    (b) => b.status === 'active' && b.category === 'lab' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
  );
  const building = entities.buildings.find((b) => b.id === buildingId) ?? labs[0];

  const data = useMemo(() => {
    if (!building) return null;
    const mainUsage = scopeUsage('electricity', { buildingId: building.id }, from, to);
    const specialPoints = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.subitem === '特殊用电');
    const specialUsage = specialPoints.length > 0
      ? dailyRows(specialPoints.map((p) => p.id), from, to).reduce((a, r) => a + r.total, 0)
      : 0;
    const commonUsage = Math.max(0, (mainUsage.total ?? 0) - specialUsage);
    const teach = teachingStats(building.id, from, to);
    const days = rangeDays(from, to);
    const daily = dailyRows(entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id), from, to);
    const nightRows = days.slice(-3).map((d) => {
      const rows = scopeHourly('electricity', { buildingId: building.id }, d, d);
      const night = rows.slice(0, 6).filter((r) => r.value !== null);
      const day = rows.slice(8, 18).filter((r) => r.value !== null);
      return {
        date: d,
        nightAvg: night.length ? night.reduce((a, r) => a + (r.value as number), 0) / night.length : null,
        dayAvg: day.length ? day.reduce((a, r) => a + (r.value as number), 0) / day.length : null,
      };
    });
    const subitems = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.role === 'submeter');
    const subDaily = subitems.map((p) => ({ point: p, rows: dailyRows([p.id], from, to) }));
    return { mainUsage, specialUsage, commonUsage, teach, daily, nightRows, subitems, subDaily, specialPoints };
  }, [building, from, to, entities]);

  if (!building || !data) {
    return <PageHeader breadcrumb={['校园专题', '科研实验楼']} title="科研实验楼用能" subtitle="当前范围无实验科研楼档案" />;
  }

  const exportSheet = {
    name: '实验楼用能',
    headers: ['日期', '日类型', '总用电(kWh)', '科研专用(kWh)', '公共用电(kWh)'],
    rows: data.daily.map((r) => [
      r.date, DAY_TYPE_LABEL[resolveDayCal(r.date, entities.calendar).dayType], Math.round(r.total),
      Math.round(data.subDaily.filter((s) => s.point.subitem === '特殊用电').reduce((a, s) => a + (s.rows.find((x) => x.date === r.date)?.total ?? 0), 0)),
      Math.round(r.total - data.subDaily.filter((s) => s.point.subitem === '特殊用电').reduce((a, s) => a + (s.rows.find((x) => x.date === r.date)?.total ?? 0), 0)),
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '科研实验楼']}
        title="科研实验楼用能管理"
        subtitle={
          <Space size={8} wrap>
            <span>公共用能与科研专用设备用能分开统计；24小时必要运行设备不因夜间负荷判为异常</span>
            <span className="muted">统计期：{from} 至 {to} · {building.name}</span>
          </Space>
        }
        extra={<ExportButton filename={`实验楼用能_${building.id}`} sheet={exportSheet} metaNote="科研专用=特殊用电分表实测；公共用电=总表-科研专用（含未分项）" />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} width={110} />
        <span className="filter-label">实验楼</span>
        <BuildingSelect value={building.id} onChange={(v) => setBuildingId(v as string)} campusId={campusId} category="lab" allowAll={false} />
        <DatePicker.RangePicker size="small" value={[dayjs(from), dayjs(to)]} onChange={(v) => { if (v?.[0] && v?.[1]) { setFrom(v[0].format('YYYY-MM-DD')); setTo(v[1].format('YYYY-MM-DD')); } }} />
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="统计期总用电" value={data.mainUsage.total} unit="kWh" sub="建筑主表口径" qualityNote={data.mainUsage.incomplete ? '存在缺失样本' : undefined} />
        <StatCard label="科研专用设备用电" value={Math.round(data.specialUsage)} unit="kWh" sub={`${data.specialPoints.length} 个专用回路分表实测`} />
        <StatCard label="公共用能（含未分项）" value={Math.round(data.commonUsage)} unit="kWh" sub="总表−科研专用；含照明/空调/动力等" />
        <StatCard label="非教学时段占比" value={data.teach.nonTeachingShare === null ? '不可计算' : Math.round(data.teach.nonTeachingShare * 10) / 10} unit={data.teach.nonTeachingShare === null ? undefined : '%'} sub="实验楼24小时运行，非教学时段负荷属正常业务" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="分项结构趋势（近30日）" height={300} note="科研专用设备（特殊用电）为持续运行基载；不随意将夜间负荷标红">
          <EnergyStackedBar
            x={data.subDaily[0]?.rows.slice(-30).map((r) => r.date.slice(5)) ?? []}
            series={data.subDaily.map((s) => ({
              name: s.point.subitem ?? s.point.name,
              data: s.rows.slice(-30).map((r) => Math.round(r.total)),
              color: SUBITEM_COLORS[s.point.subitem ?? ''] ?? '#888',
              stack: 'sub',
              type: 'bar' as const,
            }))}
            unit="kWh"
            height={290}
          />
        </ChartCard>
        <ChartCard title="昼夜负荷对比（最近3日）" height={300} note="夜间(00-06时)与日间(08-18时)平均功率对比">
          <EnergyBarChart
            x={data.nightRows.map((r) => r.date.slice(5))}
            series={[
              { name: '夜间均值', data: data.nightRows.map((r) => r.nightAvg === null ? null : Math.round(r.nightAvg * 10) / 10), color: '#722ed1' },
              { name: '日间均值', data: data.nightRows.map((r) => r.dayAvg === null ? null : Math.round(r.dayAvg * 10) / 10), color: ENERGY_COLOR.electricity },
            ]}
            unit="kWh/h"
            height={290}
          />
        </ChartCard>
      </div>

      <div className="table-card">
        <h4 className="section-title">实验楼专项回路与必要运行设备清单</h4>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={data.subitems}
          columns={[
            { title: '分项', dataIndex: 'subitem' },
            { title: '计量点', dataIndex: 'name' },
            {
              title: '运行特征', dataIndex: 'alwaysOn', width: 120,
              render: (v: boolean | undefined) => v ? <Tag color="green">24小时必要运行</Tag> : <Tag>按需运行</Tag>,
            },
            {
              title: '统计期用电(kWh)', width: 130, align: 'right' as const,
              render: (_v, p) => fmtInt(Math.round(data.subDaily.find((s) => s.point.id === p.id)?.rows.reduce((a, r) => a + r.total, 0) ?? 0)),
            },
            {
              title: '', width: 70, render: (_v, p) => <a onClick={() => navigate(`/monitor/building/${building.id}?from=${from}&to=${to}`)}>楼宇</a>,
            },
          ]}
        />
        <div className="muted small mt8">
          业务规则：正常的持续运行设备不判为“非教学时间高耗电”违规；总量分析不因考核排除规则改变，
          专项扣除仅在单独计量并符合口径时于节能评价中列示。{building.remark}
        </div>
      </div>
    </div>
  );
}