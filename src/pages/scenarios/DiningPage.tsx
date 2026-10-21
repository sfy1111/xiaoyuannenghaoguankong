import { useMemo, useState } from 'react';
import { Alert, DatePicker, Space, Table, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, mealsOf } from '../../services/repository';
import { scopeUsage, dailyRows } from '../../services/energyStats';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays, monthOf } from '../../domain/time';
import { resolveDay } from '../../domain/calendar';
import type { Building } from '../../domain/types';

export default function ScenarioDiningPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-09-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const canteens = entities.buildings.filter(
    (b) => b.status === 'active' && b.category === 'canteen' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)),
  );

  const data = useMemo(() => {
    const month = monthOf(anchor);
    const monthEnd = dayjs(anchor).endOf('month').format('YYYY-MM-DD');
    const rows = canteens.map((b: Building) => {
      const elec = scopeUsage('electricity', { buildingId: b.id }, `${month}-01`, monthEnd);
      const water = scopeUsage('water', { buildingId: b.id }, `${month}-01`, monthEnd);
      const gas = scopeUsage('gas', { buildingId: b.id }, `${month}-01`, monthEnd);
      const meals = mealsOf(b.id, month);
      return {
        key: b.id,
        id: b.id,
        name: b.name,
        elec: elec.total ?? 0,
        water: water.total ?? 0,
        gas: gas.total ?? 0,
        meals,
        perMealGas: meals && meals > 0 && gas.total !== null ? (gas.total / meals) * 1000 : null,
        perMealWater: meals && meals > 0 && water.total !== null ? water.total / meals : null,
        perMealElec: meals && meals > 0 && elec.total !== null ? elec.total / meals : null,
        incomplete: elec.incomplete || water.incomplete || gas.incomplete,
      };
    });

    const days30 = lastNDays(anchor, 30);
    const gasDaily = dailyRows(
      canteens.flatMap((b) => entities.meteringPoints.filter((p) => p.buildingId === b.id && p.energyType === 'gas').map((p) => p.id)),
      days30[0],
      anchor,
    );
    const operatingVsVacation = (() => {
      const groups: Record<string, { sum: number; days: number }> = { teaching: { sum: 0, days: 0 }, vacation: { sum: 0, days: 0 } };
      for (const r of gasDaily) {
        const t = resolveDay(r.date, entities.calendar).dayType;
        const key = t === 'teaching' || t === 'exam' || t === 'weekend' ? 'teaching' : t === 'vacation' || t === 'holiday' ? 'vacation' : null;
        if (key && groups[key]) { groups[key].sum += r.total; groups[key].days += 1; }
      }
      return {
        teachingAvg: groups.teaching.days > 0 ? groups.teaching.sum / groups.teaching.days : null,
        vacationAvg: groups.vacation.days > 0 ? groups.vacation.sum / groups.vacation.days : null,
      };
    })();
    return { month, rows, gasDaily, operatingVsVacation };
  }, [anchor, canteens, entities, scope]);

  const exportSheet = {
    name: '食堂能耗',
    headers: ['食堂', `本月用电(kWh)`, '用水(m³)', '用气(m³)', '供餐量(餐次)', '餐均气量(m³/千餐)', '餐均水量(m³/千餐)', '餐均电耗(kWh/千餐)'],
    rows: data.rows.map((r) => [
      r.name, Math.round(r.elec), Math.round(r.water), Math.round(r.gas),
      r.meals === null ? '缺少供餐数据' : fmtInt(r.meals),
      r.perMealGas === null ? '不可计算' : r.perMealGas.toFixed(1),
      r.perMealWater === null ? '不可计算' : (r.perMealWater * 1000).toFixed(1),
      r.perMealElec === null ? '不可计算' : (r.perMealElec * 1000).toFixed(1),
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '学生食堂']}
        title="学生食堂能耗管理"
        subtitle={
          <Space size={8} wrap>
            <span>水电气与供餐量关联分析；餐均指标在供餐量缺失或为0时不输出结果</span>
            <span className="muted">供餐量来源：饮食服务中心一卡通月度汇总（人工复核导入）</span>
          </Space>
        }
        extra={<ExportButton filename={`食堂能耗_${data.month}`} sheet={exportSheet} metaNote={`统计期：${data.month}；餐均=能源量÷供餐数；供餐量缺失月份不参与餐均计算`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">月份</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
      </FilterBar>

      <div className="kpi-row">
        {data.rows.map((r) => (
          <StatCard
            key={r.key}
            label={`${r.name} · 本月用气`}
            value={Math.round(r.gas)}
            unit="m³"
            sub={r.meals === null || r.meals === 0
              ? '缺少供餐数据，餐均指标不可计算'
              : `供餐 ${fmtInt(r.meals)} 餐次，餐均 ${r.perMealGas === null ? '—' : r.perMealGas.toFixed(1)} m³/千餐`}
            qualityNote={r.incomplete ? '存在离线缺数时段' : undefined}
          />
        ))}
        <StatCard
          label="营业日 vs 假期日均用气"
          value={data.operatingVsVacation.teachingAvg !== null && data.operatingVsVacation.vacationAvg !== null && data.operatingVsVacation.vacationAvg > 0
            ? (data.operatingVsVacation.teachingAvg / data.operatingVsVacation.vacationAvg).toFixed(1)
            : null}
          unit="倍"
          sub={`营业日约 ${data.operatingVsVacation.teachingAvg?.toFixed(0) ?? '—'} m³/日；假期约 ${data.operatingVsVacation.vacationAvg?.toFixed(0) ?? '—'} m³/日`}
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="食堂用气趋势（近30日）" height={300} note="假期第二食堂停业，气量为0属正常营业安排">
          <EnergyLineChart
            x={data.gasDaily.map((r) => r.date.slice(5))}
            series={[{ name: '日用气量', data: data.gasDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.gas, area: true }]}
            unit="m³"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="食堂能耗结构（本月合计）" height={300} note="水、电、气实物量分列，不做跨单位合计">
          <EnergyBarChart
            x={['用电(kWh)', '用水(m³)', '用气(m³)']}
            series={[{
              name: '合计',
              data: [
                Math.round(data.rows.reduce((a, r) => a + r.elec, 0)),
                Math.round(data.rows.reduce((a, r) => a + r.water, 0)),
                Math.round(data.rows.reduce((a, r) => a + r.gas, 0)),
              ],
              color: ENERGY_COLOR.gas,
            }]}
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="table-card">
        <h4 className="section-title">食堂对比明细</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          onRow={(r) => ({ onClick: () => navigate(`/monitor/building/${r.id}?from=${data.month}-01&to=${anchor}`), style: { cursor: 'pointer' } })}
          columns={[
            { title: '食堂', dataIndex: 'name' },
            { title: '用电(kWh)', dataIndex: 'elec', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '用水(m³)', dataIndex: 'water', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            { title: '用气(m³)', dataIndex: 'gas', align: 'right' as const, render: (v: number) => fmtInt(Math.round(v)) },
            {
              title: '供餐量(餐次)', dataIndex: 'meals', width: 120, align: 'right' as const,
              render: (v: number | null) => v === null ? <Tag color="orange">缺少供餐数据</Tag> : v === 0 ? <Tag color="orange">0（停业月）</Tag> : fmtInt(v),
            },
            {
              title: '餐均气量(m³/千餐)', dataIndex: 'perMealGas', width: 130, align: 'right' as const,
              render: (v: number | null) => v === null ? '不可计算' : v.toFixed(1),
            },
            {
              title: '餐均水量(m³/千餐)', width: 130, align: 'right' as const,
              render: (_v, r) => r.perMealWater === null ? '不可计算' : (r.perMealWater * 1000).toFixed(1),
            },
          ]}
        />
        <div className="muted small mt8">
          承包商商用能源与学校公共能源分账：本页为食堂整体计量口径；档口分项与承包结算由饮食服务中心按合同另行管理。
          餐均指标考核定额见「节能管理→节能目标」。
        </div>
      </div>
    </div>
  );
}