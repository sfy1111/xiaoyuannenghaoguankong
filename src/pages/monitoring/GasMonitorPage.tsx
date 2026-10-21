import { useMemo, useState } from 'react';
import { Alert, DatePicker, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeUsage, scopeHourly, dailyRows } from '../../services/energyStats';
import { simpleEnergyCost } from '../../services/costService';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays, monthOf } from '../../domain/time';
import { resolveDay } from '../../domain/calendar';

export default function GasMonitorPage() {
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const gasPoints = useMemo(() => {
    const restricted = scope.buildingIds;
    return entities.meteringPoints.filter((p) =>
      p.energyType === 'gas' &&
      (scope.campusId === 'all' || p.campusId === scope.campusId) &&
      (!restricted || (p.buildingId ? restricted.includes(p.buildingId) : true)),
    );
  }, [entities, scope]);

  const data = useMemo(() => {
    const month = monthOf(anchor);
    const monthEnd = dayjs(anchor).endOf('month').isAfter(dayjs(META.dataWindow.end)) ? META.dataWindow.end : dayjs(anchor).endOf('month').format('YYYY-MM-DD');
    const yesterdayUsage = scopeUsage('gas', scope, anchor, anchor);
    const monthUsage = scopeUsage('gas', scope, `${month}-01`, monthEnd);
    const hourRows = scopeHourly('gas', scope, anchor, anchor);
    const cost = simpleEnergyCost('gas', gasPoints.map((p) => p.id), `${month}-01`, monthEnd);
    const consumerRows = gasPoints.map((p) => {
      const u = scopeUsage('gas', { buildingId: p.buildingId ?? '' }, anchor, anchor);
      const day = dailyRows([p.id], anchor, anchor)[0];
      return {
        id: p.id,
        name: p.name,
        building: p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '—',
        usage: day?.total ?? 0,
        coverage: day?.coverage ?? 0,
        hasMissing: day?.hasMissing ?? false,
        value: u.total ?? 0,
      };
    }).sort((a, b) => b.usage - a.usage);
    const days30 = lastNDays(anchor, 30);
    const daily30 = dailyRows(gasPoints.map((p) => p.id), days30[0], anchor);
    const dayTypeAvg = (() => {
      const groups: Record<string, { sum: number; days: number }> = { teaching: { sum: 0, days: 0 }, weekend: { sum: 0, days: 0 }, vacation: { sum: 0, days: 0 }, holiday: { sum: 0, days: 0 } };
      const daily = dailyRows(gasPoints.map((p) => p.id), days30[0], anchor);
      for (const r of daily) {
        const t = resolveDay(r.date, entities.calendar).dayType;
        const key = t === 'exam' || t === 'special' ? 'teaching' : t;
        if (groups[key]) { groups[key].sum += r.total; groups[key].days += 1; }
      }
      return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.days > 0 ? Math.round(v.sum / v.days) : null]));
    })();
    const offlinePoint = gasPoints.find((p) => p.id === 'P-C2-G');
    return { yesterdayUsage, monthUsage, hourRows, cost, consumerRows, daily30, days30, dayTypeAvg, month, offlinePoint };
  }, [anchor, scope, gasPoints, entities]);

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', '天然气监测']}
        title="天然气监测"
        subtitle={
          <Space size={8} wrap>
            <span>计量口径：各燃气表直抄（第一食堂、第二食堂、能源站锅炉），无层级总表</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">监测日</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">气量按工况体积计量，与标况体积不直接换算；瞬时流量与累计气量分别展示。</span>
      </FilterBar>

      {data.offlinePoint && (
        <Alert
          className="mb12"
          type="warning"
          showIcon
          message="第二食堂燃气表采集设备自 2026-10-19 22:00 起离线"
          description="离线时段无有效样本，相关统计如实标记为数据不完整，恢复后将自动补传并重算；不影响其他表计统计。可在「系统管理→数据接口」查看补拉任务。"
        />
      )}

      <div className="kpi-row">
        <StatCard label="昨日用气量" value={data.yesterdayUsage.total} unit="m³" sub={`覆盖率 ${(data.yesterdayUsage.coverage * 100).toFixed(1)}%`} qualityNote={data.yesterdayUsage.incomplete ? '存在离线缺数时段' : undefined} />
        <StatCard label="本月用气量" value={data.monthUsage.total} unit="m³" sub={`${data.month}月累计`} qualityNote={data.monthUsage.incomplete ? '存在离线缺数时段' : undefined} />
        <StatCard label={`${data.month}月气费测算`} value={data.cost.amount} unit="元" sub={data.cost.priceNote || '无适用价格方案'} qualityNote="按实际合同单价测算，不含附加费用" />
        <StatCard label="教学日均 / 假期日均" value={data.dayTypeAvg.teaching !== null && data.dayTypeAvg.vacation !== null ? (data.dayTypeAvg.teaching / data.dayTypeAvg.vacation).toFixed(1) : null} unit="倍" sub="近30日按校历日类型分组的日均用气" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title={`用气日内曲线（${anchor}）`} note="烹饪高峰：早餐05-08时、午餐10-13时、晚餐16-18时" height={300}>
          <EnergyLineChart
            x={data.hourRows.map((r) => r.ts.slice(11, 13) + '时')}
            series={[{ name: '小时用气量', data: data.hourRows.map((r) => r.value === null ? null : Math.round(r.value * 100) / 100), color: ENERGY_COLOR.gas, area: true }]}
            unit="m³"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="近30日用气趋势" height={300} note="假期与营业日差异来自校历与供餐安排">
          <EnergyLineChart
            x={data.daily30.map((r) => r.date.slice(5))}
            series={[{ name: '日用气量', data: data.daily30.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.gas }]}
            unit="m³"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="用气单位对比（监测日）" height={300} note="点击表格行查看计量点原始读数">
          <EnergyBarChart
            x={data.consumerRows.map((r) => r.building)}
            series={[{ name: '用气量', data: data.consumerRows.map((r) => Math.round(r.usage)), color: ENERGY_COLOR.gas }]}
            unit="m³"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <div className="table-card">
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.consumerRows}
            onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '用气单位', dataIndex: 'building' },
              { title: '计量点', dataIndex: 'name' },
              { title: '监测日用量(m³)', dataIndex: 'usage', align: 'right' as const, render: (v: number) => v.toFixed(1) },
              { title: '样本覆盖', dataIndex: 'coverage', render: (c: number, r) => c < 1 ? <Tag color="orange">{(c * 100).toFixed(0)}%（离线缺数）</Tag> : <Tag color="green">完整</Tag> },
            ]}
            title={() => <span style={{ fontSize: 14, fontWeight: 600 }}>燃气计量点明细</span>}
          />
          <div className="muted small mt8">
            天然气安全报警的正式处置以具备资质的燃气安全系统及应急预案为准，本系统仅提供能耗与数据质量线索。
            全校月气量合计约 {fmtInt(data.monthUsage.total ?? 0)} m³。
          </div>
        </div>
      </div>

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}