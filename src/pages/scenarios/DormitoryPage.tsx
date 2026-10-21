import { useMemo, useState } from 'react';
import { Alert, DatePicker, Segmented, Space, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, occupancyOf } from '../../services/repository';
import { scopeUsage, dailyRows, nightFlowRows } from '../../services/energyStats';
import { perCapita } from '../../domain/analysis';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays, monthOf } from '../../domain/time';

export default function ScenarioDormitoryPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [view, setView] = useState<'month' | 'night'>('month');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const dorms = entities.buildings.filter(
    (b) => b.status === 'active' && b.category === 'dormitory' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
  );

  const data = useMemo(() => {
    const month = monthOf(anchor);
    const monthEnd = dayjs(anchor).endOf('month').isAfter(dayjs('2026-10-21')) ? '2026-10-21' : dayjs(anchor).endOf('month').format('YYYY-MM-DD');
    const rows = dorms.map((b) => {
      const elec = scopeUsage('electricity', { buildingId: b.id }, `${month}-01`, monthEnd);
      const water = scopeUsage('water', { buildingId: b.id }, `${month}-01`, monthEnd);
      const hotWater = scopeUsage('hotWater', { buildingId: b.id }, `${month}-01`, monthEnd);
      const occ = occupancyOf(b.id, month);
      const floors = entities.floors.filter((f) => f.buildingId === b.id);
      return {
        key: b.id,
        id: b.id,
        name: b.name,
        campus: b.campusId === 'C-E' ? '东校区' : '西校区',
        floors: floors.length || b.floors,
        rooms: floors.reduce((a, f) => a + f.rooms, 0) || b.floors * 30,
        elec: elec.total ?? 0,
        water: water.total ?? 0,
        hotWater: hotWater.total ?? 0,
        residents: occ?.residents ?? null,
        occupancyRate: occ?.occupancyRate ?? null,
        perCapitaWater: perCapita(water.total, occ?.residents ?? null),
        perCapitaElec: perCapita(elec.total, occ?.residents ?? null),
        incomplete: elec.incomplete || water.incomplete,
      };
    });

    const days30 = lastNDays(anchor, 30);
    const trendDaily = dailyRows(
      dorms.flatMap((b) => entities.meteringPoints.filter((p) => p.buildingId === b.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id)),
      days30[0],
      anchor,
    );
    const nightFlows = nightFlowRows('P-D1-W', days30[0], anchor);

    const nightAnomalies = nightFlows.filter((r) => r.minFlow !== null && r.minFlow > 1.5);
    return { rows, trendDaily, nightFlows, nightAnomalies, month, monthEnd };
  }, [anchor, dorms, entities, scope]);

  const exportSheet = {
    name: '宿舍用能',
    headers: ['公寓', '校区', '楼层', '房间数', `本月用电(kWh)`, `本月用水(m³)`, '生活热水(kWh)', '住宿人数', '入住率(%)', '人均用水(m³/人)', '人均用电(kWh/人)'],
    rows: data.rows.map((r) => [
      r.name, r.campus, r.floors, r.rooms, Math.round(r.elec), Math.round(r.water), Math.round(r.hotWater),
      r.residents ?? '缺少入住数据', r.occupancyRate === null ? '—' : (r.occupancyRate * 100).toFixed(0),
      r.perCapitaWater === null ? '不可计算' : r.perCapitaWater.toFixed(2), r.perCapitaElec === null ? '不可计算' : r.perCapitaElec.toFixed(1),
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '学生宿舍']}
        title="学生宿舍用能管理"
        subtitle={
          <Space size={8} wrap>
            <span>楼栋/楼层聚合统计、入住人均指标与夜间异常线索；不展示任何可识别学生的个人信息或房间明细</span>
            <span className="muted">人数分母：学生工作处月度住宿快照（{data.month}）</span>
          </Space>
        }
        extra={<ExportButton filename={`宿舍用能_${data.month}`} sheet={exportSheet} metaNote={`统计期：${data.month}；人均指标分母为当月住宿人数快照；不提供远程断电功能`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">月份</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">默认聚合展示楼栋层面；房间级明细仅在专门授权下开放，本演示不包含</span>
      </FilterBar>

      <Alert
        className="mb12"
        type="info"
        showIcon
        message="隐私与业务边界"
        description="宿舍页面仅展示楼栋与楼层汇总用能；学生个人与房间明细不在本系统默认范围。监测值不作为商业结算或预付费余额依据，系统不提供远程断电功能。"
      />

      <div className="kpi-row">
        <StatCard label={`${data.month}月宿舍总用电`} value={data.rows.reduce((a, r) => a + r.elec, 0)} unit="kWh" sub={`${dorms.length} 栋公寓`} />
        <StatCard label={`${data.month}月宿舍总用水`} value={data.rows.reduce((a, r) => a + r.water, 0)} unit="m³" />
        <StatCard
          label="入住人均月用水（全校宿舍）"
          value={(() => {
            const totalWater = data.rows.reduce((a, r) => a + r.water, 0);
            const totalResidents = data.rows.reduce((a, r) => a + (r.residents ?? 0), 0);
            return perCapita(totalWater, totalResidents || null);
          })()}
          unit="m³/人"
          decimals={2}
          sub="定额目标 ≤3.2 m³/人·月（节能目标页）"
        />
        <StatCard label="夜间用水异常（近30日）" value={data.nightAnomalies.length} unit="天" sub="兰园1号公寓夜间最小流量>1.5 m³/h，可转告警工单" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="宿舍总用电趋势（近30日）" height={300}>
          <EnergyLineChart
            x={data.trendDaily.map((r) => r.date.slice(5))}
            series={[{ name: '宿舍日用电', data: data.trendDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="夜间最小流量趋势（兰园1号公寓）" height={300} note="阈值1.5 m³/h；夜间流量仅作漏损线索，需现场核查">
          <EnergyLineChart
            x={data.nightFlows.map((r) => r.date.slice(5))}
            series={[{ name: '夜间最小流量', data: data.nightFlows.map((r) => r.minFlow === null ? null : Math.round(r.minFlow * 100) / 100), color: ENERGY_COLOR.water }]}
            unit="m³/h"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="table-card">
        <h4 className="section-title">楼栋用能与人均指标</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          onRow={(r) => ({ onClick: () => navigate(`/monitor/building/${r.id}?from=${data.month}-01&to=${data.monthEnd}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: '公寓', dataIndex: 'name' },
            { title: '校区', dataIndex: 'campus', width: 76 },
            { title: '楼层', dataIndex: 'floors', width: 60, align: 'right' as const },
            { title: '本月用电(kWh)', dataIndex: 'elec', width: 110, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '本月用水(m³)', dataIndex: 'water', width: 100, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '生活热水(kWh)', dataIndex: 'hotWater', width: 100, align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '住宿人数', dataIndex: 'residents', width: 84, align: 'right' as const, render: (v: number | null) => v === null ? '缺少数据' : fmtInt(v) },
            { title: '入住率', dataIndex: 'occupancyRate', width: 80, render: (v: number | null) => v === null ? '—' : `${(v * 100).toFixed(0)}%` },
            {
              title: '人均用水(m³)', dataIndex: 'perCapitaWater', width: 100, align: 'right' as const,
              render: (v: number | null) => v === null ? '不可计算' : v.toFixed(2),
            },
            {
              title: '人均用电(kWh)', dataIndex: 'perCapitaElec', width: 100, align: 'right' as const,
              render: (v: number | null) => v === null ? '不可计算' : v.toFixed(1),
            },
          ]}
        />
        <div className="muted small mt8">
          人均指标分母采用当月住宿人数快照（随时间变化保存适用月份）；人数缺失时显示不可计算。
          公共与房间用能区分：走廊照明计入户公共分项，热水由热泵/能源站计量。假期入住下降时人均指标按实际住宿人数计算。
        </div>
      </div>
    </div>
  );
}