import { useMemo, useState } from 'react';
import { DatePicker, Segmented, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyBarChart, EnergyLineChart } from '../../components/charts';
import { FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { getEntities, META } from '../../services/repository';
import { scopeUsage, scopeHourly, dailyRows } from '../../services/energyStats';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import type { EnergyType } from '../../domain/types';

type TabKey = 'cooling' | 'heat' | 'hotWater';

const TAB_META: Record<TabKey, { title: string; outputPoint: string; buildingPoints: string[]; season: string }> = {
  cooling: { title: '供冷', outputPoint: 'P-EP-CO', buildingPoints: ['P-TD-CO', 'P-LE-CO', 'P-D3-CO'], season: '制冷季（5月中旬-9月底）' },
  heat: { title: '供热', outputPoint: 'P-EP-HO', buildingPoints: ['P-TD-HO', 'P-LE-HO', 'P-D3-HO'], season: '供暖季（11月中旬-次年3月中旬）' },
  hotWater: { title: '生活热水', outputPoint: 'P-EP-HW', buildingPoints: ['P-D1-HW', 'P-D2-HW', 'P-D3-HW'], season: '全年（冬夏负荷随季节变化）' },
};

export default function ThermalMonitorPage() {
  const { campusId } = useFilters();
  const [tab, setTab] = useState<TabKey>('cooling');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const entities = getEntities();

  const meta = TAB_META[tab];
  const energy = tab as EnergyType;

  const data = useMemo(() => {
    const outputUsage = scopeUsage(energy, { campusId: 'C-W' }, anchor, anchor);
    const buildingRows = meta.buildingPoints.map((pid) => {
      const p = entities.meteringPoints.find((x) => x.id === pid)!;
      const day = dailyRows([pid], anchor, anchor)[0];
      return {
        id: pid,
        name: p.name,
        building: p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '—',
        value: day?.total ?? 0,
        coverage: day?.coverage ?? 0,
        hasMissing: day?.hasMissing ?? false,
      };
    });
    const covered = buildingRows.reduce((a, r) => a + r.value, 0);
    const outputTotal = outputUsage.total ?? 0;
    const days30 = lastNDays(anchor, 30);
    const trendOut = dailyRows([meta.outputPoint], days30[0], anchor);
    const trendCovered = dailyRows(meta.buildingPoints, days30[0], anchor);
    const hourOut = scopeHourly(energy, { campusId: 'C-W' }, anchor, anchor);
    const hourRowsBuilding = meta.buildingPoints.map((pid) => ({
      name: entities.meteringPoints.find((x) => x.id === pid)?.name ?? pid,
      rows: scopeHourly(energy, { buildingId: entities.meteringPoints.find((x) => x.id === pid)?.buildingId ?? '' }, anchor, anchor),
    }));
    const chillerElec = dailyRows(['P-EP-CH'], anchor, anchor)[0]?.total ?? 0;
    const boilerGas = dailyRows(['P-EP-G'], anchor, anchor)[0]?.total ?? 0;
    const cop = tab === 'cooling' && chillerElec > 0 && outputTotal > 0 ? outputTotal / chillerElec : null;
    const boilerEff = tab === 'heat' && boilerGas > 0 && outputTotal > 0 ? outputTotal / (boilerGas * 9.87) : null;
    return { outputUsage, buildingRows, covered, outputTotal, trendOut, trendCovered, days30, hourOut, hourRowsBuilding, chillerElec, boilerGas, cop, boilerEff };
  }, [anchor, tab, meta, entities, energy]);

  const inSeason = data.outputUsage.total !== null && data.outputUsage.total > 0;

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', '供热供冷与生活热水监测']}
        title="供热供冷与生活热水监测"
        subtitle={
          <Space size={8} wrap>
            <span>西校区集中供能由能源站供应，东校区无集中供冷供热（各楼分体空调计入建筑用电）</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">系统</span>
        <Segmented
          size="small"
          value={tab}
          options={[
            { value: 'cooling', label: '集中供冷' },
            { value: 'heat', label: '集中供热' },
            { value: 'hotWater', label: '生活热水' },
          ]}
          onChange={(v) => setTab(v as TabKey)}
        />
        <span className="filter-label">监测日</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">{meta.season}；能源站产出侧与建筑侧分别计量，冷热量与电力输入分开统计，不重复计入综合能耗。</span>
      </FilterBar>

      {!inSeason && (
        <div className="muted mb12" style={{ background: '#fff', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)' }}>
          当前监测日不在{meta.title}运行时段，无有效供能量数据；可切换至运行季内日期查看（供冷季 5-9 月，供热季 11 月-次年 3 月）。
        </div>
      )}

      <div className="kpi-row">
        <StatCard label={`${meta.title}站产出（监测日）`} value={data.outputUsage.total} unit="kWh" sub="能源站产出总表口径" qualityNote={data.outputUsage.incomplete ? '存在缺失样本' : undefined} />
        <StatCard label="建筑侧已计量合计" value={data.covered} unit="kWh" sub={`${meta.buildingPoints.length} 个建筑计量点合计`} />
        <StatCard
          label="管网计量差额"
          value={data.outputTotal > 0 ? Math.round(data.outputTotal - data.covered) : null}
          unit="kWh"
          sub={data.outputTotal > 0 ? `占产出 ${(100 * (data.outputTotal - data.covered) / data.outputTotal).toFixed(1)}%` : '—'}
          qualityNote="为计量差额（含未计量末端与输配），未经证实不解释为损耗"
        />
        {tab === 'cooling' && (
          <StatCard
            label="冷水机组能效比（COP）"
            value={data.cop ? Math.round(data.cop * 100) / 100 : null}
            sub="＝供冷产出 ÷ 冷水机组输入电耗（同日边界）"
            qualityNote={data.cop === null ? '非制冷季或输入电耗无数据，不可计算' : undefined}
          />
        )}
        {tab === 'heat' && (
          <StatCard
            label="锅炉热效率估算"
            value={data.boilerEff ? (Math.round(data.boilerEff * 1000) / 10) + '%' : null}
            sub={`＝供热量 ÷（气量 × 9.87 kWh/m³低位热值系数）`}
            qualityNote={data.boilerEff === null ? '非供暖季或数据不全，不可计算' : '基于低位热值系数假设的估算值'}
          />
        )}
        {tab === 'hotWater' && (
          <StatCard
            label="热泵/热水系统说明"
            value="东校区热泵"
            sub="兰园1号/2号公寓热泵热水，输入电耗计入院区动力分项；产出热量独立计量，不计入购入电量"
          />
        )}
      </div>

      <div className="chart-grid c2">
        <ChartCard title={`${meta.title}24小时产出曲线（${anchor}）`} height={300}>
          <EnergyLineChart
            x={data.hourOut.map((r) => r.ts.slice(11, 13) + '时')}
            series={[
              { name: `${meta.title}站产出`, data: data.hourOut.map((r) => r.value === null ? null : Math.round(r.value)), color: tab === 'cooling' ? ENERGY_COLOR.cooling : tab === 'heat' ? ENERGY_COLOR.heat : ENERGY_COLOR.hotWater },
              ...data.hourRowsBuilding.map((b, i) => ({
                name: b.name,
                data: b.rows.map((r) => r.value === null ? null : Math.round(r.value)),
                color: ['#1668dc', '#13c2c2', '#faad14'][i % 3],
                dashed: true,
              })),
            ]}
            unit="kWh/h"
            height={290}
          />
        </ChartCard>
        <ChartCard title="近30日站产出与建筑侧合计趋势" height={300} note="差额为未分项计量部分，趋势背离时提示排查计量覆盖">
          <EnergyLineChart
            x={data.trendOut.map((r) => r.date.slice(5))}
            series={[
              { name: '站产出', data: data.trendOut.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: '#722ed1' },
              { name: '建筑侧合计', data: data.trendCovered.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: '#1668dc', dashed: true },
            ]}
            unit="kWh"
            height={290}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="建筑侧用量对比（监测日）" height={300}>
          <EnergyBarChart
            x={data.buildingRows.map((r) => r.building)}
            series={[{ name: meta.title, data: data.buildingRows.map((r) => Math.round(r.value)), color: tab === 'cooling' ? ENERGY_COLOR.cooling : tab === 'heat' ? ENERGY_COLOR.heat : ENERGY_COLOR.hotWater }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <div className="table-card">
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.buildingRows}
            title={() => <span style={{ fontSize: 14, fontWeight: 600 }}>{meta.title}计量点明细</span>}
            onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '计量点', dataIndex: 'name' },
              { title: '建筑', dataIndex: 'building', width: 150 },
              { title: '用量(kWh)', dataIndex: 'value', align: 'right' as const, render: (v: number) => fmtInt(v) },
              { title: '样本', render: (_v, r) => r.coverage >= 1 ? <Tag color="green">完整</Tag> : <Tag color="orange">{(r.coverage * 100).toFixed(0)}%</Tag> },
            ]}
          />
          <div className="muted small mt8">
            能源站输入侧：当日冷水机组电耗 {fmtInt(data.chillerElec)} kWh、锅炉气量 {fmtInt(data.boilerGas)} m³。
            供回水温度与流量未接入源数据，相应图表不展示。
          </div>
        </div>
      </div>

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}