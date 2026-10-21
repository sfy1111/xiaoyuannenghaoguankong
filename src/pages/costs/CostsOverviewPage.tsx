import { useMemo, useState } from 'react';
import { Card, DatePicker, Progress, Space, Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart, EnergyPieChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { BillStatusTag } from '../../components/StatusTags';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { campusMonthlyEstimate, allBillRows, electricityCost, electricityTouDaily } from '../../services/costService';
import { pctChange } from '../../domain/analysis';
import { ENERGY_COLOR, fmtInt, fmtMoney } from '../../domain/units';
import { rangeMonths } from '../../domain/time';

const SEG_COLORS: Record<string, string> = { 尖峰: '#d4380d', 高峰: '#fa8c16', 平段: '#1668dc', 低谷: '#13c2c2' };

export default function CostsOverviewPage() {
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);
  const month = anchor.slice(0, 7);

  const data = useMemo(() => {
    const estimate = campusMonthlyEstimate(campusId, month);
    const elec = estimate.electricity;
    const water = estimate.water;
    const gas = estimate.gas;
    const total = (elec?.amount ?? 0) + (water?.amount ?? 0) + (gas?.amount ?? 0);

    const prevMonth = dayjs(month + '-01').subtract(1, 'month').format('YYYY-MM');
    const prevEstimate = campusMonthlyEstimate(campusId, prevMonth);
    const prevTotal = (prevEstimate.electricity?.amount ?? 0) + (prevEstimate.water?.amount ?? 0) + (prevEstimate.gas?.amount ?? 0);

    const feedIds = entities.meteringPoints
      .filter((p) => p.energyType === 'electricity' && !p.buildingId && p.role === 'main' && (campusId === 'all' || p.campusId === campusId))
      .map((p) => p.id);
    const elecCost = electricityCost(feedIds, `${month}-01`, anchor.slice(0, 7) === '2026-10' ? '2026-10-20' : `${month}-28`);
    const touDaily = electricityTouDaily(feedIds, dayjs(anchor).startOf('month').format('YYYY-MM-DD'), anchor.slice(0, 7) === '2026-10' ? '2026-10-20' : `${month}-28`);

    const months = rangeMonths('2026-04', month);
    const trend = months.map((m) => {
      const est = campusMonthlyEstimate(campusId, m);
      return {
        month: m,
        elec: est.electricity?.amount ?? 0,
        water: est.water?.amount ?? 0,
        gas: est.gas?.amount ?? 0,
      };
    }).filter((r) => r.elec + r.water + r.gas > 0);

    const bills = allBillRows(campusId === 'all' ? undefined : campusId).filter((b) => b.period === month);
    const pendingBills = allBillRows(campusId === 'all' ? undefined : campusId).filter((b) => b.status === 'pending');

    return { elec, water, gas, total, prevTotal, prevMonth, elecCost, touDaily, trend, bills, pendingBills };
  }, [month, anchor, campusId, entities]);

  const exportSheet = {
    name: '能源费用月度测算',
    headers: ['月份', '电费(元)', '水费(元)', '气费(元)', '合计(元)'],
    rows: data.trend.map((r) => [r.month, Math.round(r.elec), Math.round(r.water), Math.round(r.gas), Math.round(r.elec + r.water + r.gas)]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能源费用', '费用总览']}
        title="能源费用总览"
        subtitle={
          <Space size={8} wrap>
            <span>{month}月测算口径：电费按分时电度电价测算（不含基本电费/需量费/税费）；水费含污水处理费；气费按合同单价</span>
            <span className="muted">统计至最新可得时刻（{dayjs(META.asOf).format('MM-DD HH:mm')}）</span>
          </Space>
        }
        extra={<ExportButton filename={`能源费用测算_${month}`} sheet={exportSheet} metaNote={`测算口径：${campusId === 'all' ? '全校' : entities.campuses.find((c) => c.id === campusId)?.name}；电费仅含分时电度费`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">月份</span>
        <DatePicker size="small" picker="month" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">费用属性区分“测算/账单/调整”，供应商最终账单以账单核对页为准</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label={`${month}月测算电费`} value={Math.round(data.elec?.amount ?? 0)} unit="元" sub={`用电 ${fmtInt(data.elec?.usage ?? 0)} kWh${data.elec?.incomplete ? '（含缺失未计）' : ''}`} />
        <StatCard label={`${month}月测算水费`} value={Math.round(data.water?.amount ?? 0)} unit="元" sub={`用水 ${fmtInt(data.water?.usage ?? 0)} m³`} />
        <StatCard label={`${month}月测算气费`} value={Math.round(data.gas?.amount ?? 0)} unit="元" sub={`用气 ${fmtInt(data.gas?.usage ?? 0)} m³${data.gas?.incomplete ? '（燃气表离线时段未计）' : ''}`} />
        <StatCard
          label={`${month}月合计`}
          value={Math.round(data.total)}
          unit="元"
          trend={pctChange(data.total, data.prevTotal)}
          trendLabel={`环比${data.prevMonth}`}
        />
        <StatCard label="待核对账单" value={data.pendingBills.length} unit="张" sub={<Link to="/costs/bills">进入账单核对</Link>} />
      </div>

      <div className="chart-grid c2">
        <ChartCard title={`${month}月分时电费构成`} height={300} note="金额=各时段电量×对应时段电价；缺失样本不计入">
          <EnergyBarChart
            x={data.elecCost.bySegment.map((s) => s.name)}
            series={[{ name: '电费金额', data: data.elecCost.bySegment.map((s) => Math.round(s.amount)), color: ENERGY_COLOR.electricity }]}
            unit="元"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title={`${month}月费用结构占比`} height={300} note="同口径（元）构成；测算值不等于供应商最终账单">
          <EnergyPieChart
            data={[
              { name: '电费', value: Math.round(data.elec?.amount ?? 0), color: '#1668dc' },
              { name: '水费', value: Math.round(data.water?.amount ?? 0), color: '#13c2c2' },
              { name: '气费', value: Math.round(data.gas?.amount ?? 0), color: '#fa8c16' },
            ].filter((d) => d.value > 0)}
            unit="元"
            height={290}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="月度费用趋势（电/水/气分列，元）" height={300}>
          <EnergyBarChart
            x={data.trend.map((r) => r.month)}
            series={[
              { name: '电费', data: data.trend.map((r) => Math.round(r.elec)), color: '#1668dc', stack: 'cost' },
              { name: '水费', data: data.trend.map((r) => Math.round(r.water)), color: '#13c2c2', stack: 'cost' },
              { name: '气费', data: data.trend.map((r) => Math.round(r.gas)), color: '#fa8c16', stack: 'cost' },
            ]}
            unit="元"
            height={290}
          />
        </ChartCard>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>本月账单与平台测算对比</span>} styles={{ body: { padding: '4px 12px' } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.bills}
            columns={[
              { title: '能源', dataIndex: 'energyType', width: 70, render: (e: string) => <Tag>{e === 'electricity' ? '电' : e === 'water' ? '水' : '气'}</Tag> },
              { title: '校区', dataIndex: 'campusId', width: 80, render: (c: string) => c === 'C-E' ? '东校区' : '西校区' },
              { title: '账单金额', dataIndex: 'billedAmount', align: 'right' as const, render: (v: number) => fmtMoney(Math.round(v)) },
              { title: '平台测算', dataIndex: 'estimatedAmount', align: 'right' as const, render: (v: number) => fmtMoney(Math.round(v)) },
              {
                title: '差额', dataIndex: 'difference', align: 'right' as const,
                render: (v: number) => <span style={{ color: Math.abs(v) > 1000 ? '#cf1322' : undefined }}>{fmtMoney(Math.round(v))}</span>,
              },
              { title: '状态', dataIndex: 'status', width: 84, render: (s: string) => <BillStatusTag status={s} /> },
            ]}
          />
          {data.bills.length === 0 && <div className="muted" style={{ padding: 12 }}>{month}月账单尚未出账（供应商月结后导入）</div>}
          <div className="muted small mt8">
            差异类别：用量差（抄见量口径）、价格差、固定/附加费差、计量期错位差；详见
            <Link to="/costs/bills">账单核对</Link>。
            电价9月起调整，测算值按新方案重算，已过账账单金额不变。
          </div>
        </Card>
      </div>

      <div className="chart-grid c2">
        <ChartCard title={`${month}月逐日峰平谷电费（元）`} height={300}>
          <EnergyBarChart
            x={data.touDaily.map((r) => r.date.slice(5))}
            series={['尖峰', '高峰', '平段', '低谷'].map((name) => ({
              name,
              data: data.touDaily.map((r) => Math.round((r.segments[name] ?? 0) * (name === '尖峰' ? 1.3 : name === '高峰' ? 1.06 : name === '平段' ? 0.65 : 0.35))),
              color: SEG_COLORS[name],
              stack: 'fee',
            }))}
            unit="元"
            height={290}
          />
        </ChartCard>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>费用口径说明</span>} styles={{ body: { padding: '10px 14px' } }}>
          <Space direction="vertical" size={6}>
            <div><Progress percent={100} size="small" showInfo={false} strokeColor="#1668dc" />电费测算＝Σ(各时段有效电量×时段电价)</div>
            <div className="muted small">当前有效电价：{entities.prices.find((p) => p.energyType === 'electricity' && p.validFrom <= anchor && p.validTo >= anchor)?.name ?? '无'}</div>
            <div className="muted small">水价：{entities.prices.find((p) => p.energyType === 'water' && p.validFrom <= anchor && p.validTo >= anchor)?.name}</div>
            <div className="muted small">气价：{entities.prices.find((p) => p.energyType === 'gas' && p.validFrom <= anchor && p.validTo >= anchor)?.name}</div>
            <div className="muted small">平台测算值供内部管理参考，不作为对外结算凭据；学生宿舍预付费、贸易结算不在本系统范围。</div>
          </Space>
        </Card>
      </div>
    </div>
  );
}