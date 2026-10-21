import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DatePicker, Descriptions, Segmented, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyLineChart, EnergySankey } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { getEntities } from '../../services/repository';
import { scopeUsage, dailyRows } from '../../services/energyStats';
import { ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';

type SeasonTab = 'cooling' | 'heating' | 'hotwater';

const TABS: Record<SeasonTab, { label: string; output: string; consumers: { id: string; name: string }[]; input: string }> = {
  cooling: {
    label: '制冷站',
    output: 'P-EP-CO',
    consumers: [{ id: 'P-TD-CO', name: '博学楼' }, { id: 'P-LE-CO', name: '笃行楼' }, { id: 'P-D3-CO', name: '竹园1号公寓' }],
    input: 'P-EP-CH',
  },
  heating: {
    label: '锅炉房（供热）',
    output: 'P-EP-HO',
    consumers: [{ id: 'P-TD-HO', name: '博学楼' }, { id: 'P-LE-HO', name: '笃行楼' }, { id: 'P-D3-HO', name: '竹园1号公寓' }],
    input: 'P-EP-G',
  },
  hotwater: {
    label: '集中热水站',
    output: 'P-EP-HW',
    consumers: [{ id: 'P-D1-HW', name: '兰园1号(热泵)' }, { id: 'P-D2-HW', name: '兰园2号(热泵)' }, { id: 'P-D3-HW', name: '竹园1号' }],
    input: 'P-EP-AUX',
  },
};

export default function ScenarioPlantPage() {
  const { campusId } = useFilters();
  const [tab, setTab] = useState<SeasonTab>('cooling');
  const [anchor, setAnchor] = useState('2026-07-15');
  const entities = getEntities();

  const data = useMemo(() => {
    const meta = TABS[tab];
    const days30 = lastNDays(anchor, 30);
    const outputUsage = scopeUsage(tab === 'hotwater' ? 'hotWater' : tab === 'cooling' ? 'cooling' : 'heat', { campusId: 'C-W' }, days30[0], anchor);
    const outputDaily = dailyRows([meta.output], days30[0], anchor);
    const inputDaily = dailyRows([meta.input], days30[0], anchor);
    const consumerRows = meta.consumers.map((c) => {
      const rows = dailyRows([c.id], days30[0], anchor);
      return { key: c.id, id: c.id, name: c.name, total: Math.round(rows.reduce((a, r) => a + r.total, 0)), rows };
    });
    const coveredTotal = consumerRows.reduce((a, r) => a + r.total, 0);
    const outputTotal = Math.round(outputUsage.total ?? 0);
    const inputTotal = Math.round(inputDaily.reduce((a, r) => a + r.total, 0));
    const epElec = scopeUsage('electricity', { buildingId: 'B-EP' }, days30[0], anchor);
    const epGas = scopeUsage('gas', { buildingId: 'B-EP' }, days30[0], anchor);
    const cop = tab === 'cooling' && inputTotal > 0 && outputTotal > 0 ? outputTotal / inputTotal : null;
    const eff = tab === 'heating' && inputTotal > 0 && outputTotal > 0 ? outputTotal / (inputTotal * 9.87) : null;
    const hpCop = tab === 'hotwater' && inputTotal > 0 && outputTotal > 0 ? outputTotal / inputTotal : null;
    return { meta, outputUsage, outputDaily, inputDaily, consumerRows, coveredTotal, outputTotal, inputTotal, epElec, epGas, cop, eff, hpCop, days30 };
  }, [tab, anchor, entities]);

  const exportSheet = {
    name: '能源站运行',
    headers: ['日期', '站产出(kWh)', '输入能耗', '建筑侧合计(kWh)'],
    rows: data.outputDaily.map((r, i) => [
      r.date, Math.round(r.total), Math.round(data.inputDaily[i]?.total ?? 0),
      Math.round(data.consumerRows.reduce((a, c) => a + (c.rows[i]?.total ?? 0), 0)),
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '能源站与管网']}
        title="能源站与管网运行"
        subtitle={
          <Space size={8} wrap>
            <span>输入电/气、产出冷/热/热水与末端计量分别统计；能源转换产出不重复计入购入能源总量</span>
            <span className="muted">统计期：近30日（至 {anchor}）· 西校区动力中心</span>
          </Space>
        }
        extra={<ExportButton filename={`能源站运行_${anchor}`} sheet={exportSheet} metaNote="输入/输出/末端三本账分别统计；COP与效率仅在计量边界完整时计算" />}
      />
      <FilterBar>
        <span className="filter-label">系统</span>
        <Segmented size="small" value={tab} options={(Object.keys(TABS) as SeasonTab[]).map((t) => ({ value: t, label: TABS[t].label }))} onChange={(v) => setTab(v as SeasonTab)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">{campusId === 'C-E' && '东校区无集中能源站（各楼分体空调），本页展示西校区动力中心'}</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="近30日站产出" value={data.outputTotal} unit="kWh" sub={data.meta.label} qualityNote={data.outputUsage.incomplete ? '存在缺失样本' : undefined} />
        <StatCard
          label={tab === 'cooling' ? '输入（冷水机组电耗）' : tab === 'heating' ? '输入（锅炉气量）' : '输入（辅助设备电耗）'}
          value={tab === 'heating' ? null : data.inputTotal}
          unit={tab === 'heating' ? undefined : 'kWh'}
          sub={tab === 'heating' ? `气量 ${fmtInt(data.inputTotal)} m³（低位热值系数9.87 kWh/m³）` : '专用分表实测'}
        />
        <StatCard label="末端建筑合计" value={data.coveredTotal} unit="kWh" sub={`管网计量差额 ${fmtInt(data.outputTotal - data.coveredTotal)} kWh（${data.outputTotal > 0 ? ((data.outputTotal - data.coveredTotal) / data.outputTotal * 100).toFixed(1) : '—'}%）`} />
        {tab === 'cooling' && <StatCard label="机组COP（近30日）" value={data.cop === null ? '不可计算' : Math.round(data.cop * 100) / 100} sub="＝供冷产出 ÷ 冷水机组输入电耗（同边界）" qualityNote={data.cop === null ? '非制冷季或输入数据缺失时不可计算' : undefined} />}
        {tab === 'heating' && <StatCard label="锅炉热效率估算" value={data.eff === null ? '不可计算' : `${(data.eff * 100).toFixed(1)}%`} sub="＝供热量 ÷（气量×低位热值系数），估算值" />}
        {tab === 'hotwater' && <StatCard label="热泵COP估算" value={data.hpCop === null ? '不可计算' : Math.round(data.hpCop * 100) / 100} sub="东校区热泵热水产出热量/输入电耗（防重复统计）" />}
      </div>

      <div className="chart-grid c2">
        <ChartCard title="站产出与末端合计趋势（近30日）" height={300} note="末端合计背离站产出时提示排查计量覆盖或管网平衡">
          <EnergyLineChart
            x={data.outputDaily.map((r) => r.date.slice(5))}
            series={[
              { name: '站产出', data: data.outputDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.cooling },
              { name: '末端合计', data: data.outputDaily.map((_r, i) => Math.round(data.consumerRows.reduce((a, c) => a + (c.rows[i]?.total ?? 0), 0))), color: '#1668dc', dashed: true },
            ]}
            unit="kWh"
            height={290}
          />
        </ChartCard>
        <ChartCard title="能源转换流向（近30日）" height={300} note="输入能源与转换产出分账：产出热量不计入购入能源总量">
          <EnergySankey
            nodes={[
              { name: tab === 'heating' ? '天然气' : '电力输入' },
              { name: data.meta.label },
              ...data.consumerRows.map((c) => ({ name: c.name })),
              ...(data.outputTotal - data.coveredTotal > 0 ? [{ name: '管网计量差额' }] : []),
            ]}
            links={[
              { source: tab === 'heating' ? '天然气' : '电力输入', target: data.meta.label, value: tab === 'heating' ? data.inputTotal * 9.87 : data.inputTotal },
              ...data.consumerRows.map((c) => ({ source: data.meta.label, target: c.name, value: c.total })),
              ...(data.outputTotal - data.coveredTotal > 0 ? [{ source: data.meta.label, target: '管网计量差额', value: data.outputTotal - data.coveredTotal }] : []),
            ]}
            height={290}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">末端建筑用量（近30日）</h4>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={data.consumerRows}
            columns={[
              { title: '建筑', dataIndex: 'name' },
              { title: '用量(kWh)', dataIndex: 'total', align: 'right' as const, render: (v: number) => fmtInt(v) },
              {
                title: '占产出比', width: 100, align: 'right' as const,
                render: (_v, r) => data.outputTotal > 0 ? `${((r.total / data.outputTotal) * 100).toFixed(1)}%` : '不可计算',
              },
            ]}
          />
        </div>
        <Card_ title="动力中心输入总账（近30日）">
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="能源站总用电（含机组/辅机）">{fmtInt(Math.round(data.epElec.total ?? 0))} kWh</Descriptions.Item>
            <Descriptions.Item label="锅炉用气">{fmtInt(Math.round(data.epGas.total ?? 0))} m³</Descriptions.Item>
            <Descriptions.Item label="站用电量占西校区购电比例">
              {(() => {
                const west = scopeUsage('electricity', { campusId: 'C-W' }, data.days30[0], anchor).total ?? 0;
                return west > 0 ? `${((data.epElec.total ?? 0) / west * 100).toFixed(1)}%` : '不可计算';
              })()}
            </Descriptions.Item>
            <Descriptions.Item label="边界说明">
              严禁将能源站产出热量与其输入电耗在同一综合能耗中重复计入；供冷/热功率 kW 与冷热量 kWh 单位分开，冷热量折标需另行配置系数。
            </Descriptions.Item>
          </Descriptions>
        </Card_>
      </div>
    </div>
  );
}

function Card_({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
      <h4 className="section-title">{title}</h4>
      {children}
    </div>
  );
}