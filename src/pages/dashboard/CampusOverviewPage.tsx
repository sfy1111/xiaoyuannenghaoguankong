import { useMemo } from 'react';
import { Button, Card, List, Space, Table, Tag, Tooltip } from 'antd';
import { FullscreenOutlined, RightOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import RangeModeControl from '../../components/RangeModeControl';
import { ChartCard, EnergyLineChart, EnergyPieChart } from '../../components/charts';
import { IncompleteNote, AlarmStatusTag, SeverityTag } from '../../components/StatusTags';
import { useFilters, currentRange } from '../../stores/filters';
import { userScope, visibleBuildings, visibleCampusIds } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import {
  scopeUsage, buildingSubitems, boundaryNote, trendSeriesForMode, trendXLabel,
} from '../../services/energyStats';
import { campusMonthlyEstimate } from '../../services/costService';
import { pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, ENERGY_COLOR, ENERGY_LABEL, ENERGY_UNIT, fmtInt } from '../../domain/units';
import { shiftDay, monthOf, daysBetween } from '../../domain/time';

export default function CampusOverviewPage() {
  const navigate = useNavigate();
  const { campusId, dateMode, date } = useFilters();
  const entities = getEntities();
  const range = useMemo(() => currentRange(dateMode, date), [dateMode, date]);
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const stats = useMemo(() => {
    const elec = scopeUsage('electricity', scope, range.from, range.to);
    const water = scopeUsage('water', scope, range.from, range.to);
    const gas = scopeUsage('gas', scope, range.from, range.to);
    const baseRange = dateMode === 'day'
      ? { from: shiftDay(range.from, -7), to: shiftDay(range.to, -7) }
      : dateMode === 'month'
        ? (() => {
            const prev = dayjs(range.from).subtract(1, 'month');
            return { from: prev.format('YYYY-MM-DD'), to: prev.endOf('month').format('YYYY-MM-DD') };
          })()
        : null;
    const elecBase = baseRange ? scopeUsage('electricity', scope, baseRange.from, baseRange.to) : null;
    const waterBase = baseRange ? scopeUsage('water', scope, baseRange.from, baseRange.to) : null;
    const gasBase = baseRange ? scopeUsage('gas', scope, baseRange.from, baseRange.to) : null;

    const month = dateMode === 'day' ? monthOf(range.from) : monthOf(range.from);
    const estimate = campusMonthlyEstimate(campusId, month);
    const elecCost = estimate.electricity?.amount ?? 0;
    const waterCost = estimate.water?.amount ?? 0;
    const gasCost = estimate.gas?.amount ?? 0;

    const trendElec = trendSeriesForMode('electricity', scope, dateMode, date);
    const trendWater = trendSeriesForMode('water', scope, dateMode, date);

    const buildings = visibleBuildings();
    const buildingRank = buildings
      .map((b) => {
        const u = scopeUsage('electricity', { buildingId: b.id }, range.from, range.to);
        const sub = buildingSubitems(b.id, 'electricity', range.from, range.to);
        return {
          id: b.id,
          name: b.name,
          category: b.category,
          value: u.total ?? 0,
          coverage: u.coverage,
          incomplete: u.incomplete,
          hasMissing: u.hasMissing,
          hasEstimated: u.hasEstimated,
          hasInvalid: u.hasInvalid,
          hasManual: u.hasManualCorrected,
          uncoveredPct: sub.uncoveredPct,
        };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);

    const categoryMap = new Map<string, number>();
    for (const row of buildingRank) {
      categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + row.value);
    }
    const categoryPie = [...categoryMap.entries()].map(([c, v], i) => ({
      name: CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c,
      value: Math.round(v),
      color: ['#1668dc', '#13c2c2', '#722ed1', '#fa8c16', '#f5222d', '#faad14', '#52c41a', '#2f54eb', '#eb2f96', '#a0d911'][i % 10],
    }));

    const alarms = entities.alarms;
    const activeAlarms = alarms.filter((a) => a.status !== 'closed');
    const openWorkOrders = entities.workOrders.filter((w) => w.status !== 'completed');
    const pendingCorrections = entities.corrections.filter((c) => c.status === 'pending');
    const pendingBills = entities.energyBills.filter((b) => b.status === 'pending');

    const recentPoints = entities.meteringPoints.slice(0, 6);

    const overallCoverage = (() => {
      let counted = 0;
      let expected = 0;
      for (const et of ['electricity', 'water', 'gas'] as const) {
        const u = scopeUsage(et, scope, range.from, range.to);
        counted += u.counted;
        expected += u.expected;
      }
      return expected === 0 ? null : counted / expected;
    })();

    return {
      elec, water, gas, elecBase, waterBase, gasBase,
      elecCost, waterCost, gasCost,
      trendElec, trendWater,
      buildingRank, categoryPie,
      activeAlarms, openWorkOrders, pendingCorrections, pendingBills,
      recentPoints, overallCoverage,
    };
  }, [range, scope, dateMode, date, campusId, entities]);

  const trendLabel = dateMode === 'day' ? '上周同期' : '上月';

  const campusCompareRows = entities.campuses
    .filter((c) => visibleCampusIds().includes(c.id))
    .map((c) => {
      const e = scopeUsage('electricity', { campusId: c.id }, range.from, range.to);
      const w = scopeUsage('water', { campusId: c.id }, range.from, range.to);
      const g = scopeUsage('gas', { campusId: c.id }, range.from, range.to);
      return { key: c.id, name: c.name, elec: e, water: w, gas: g };
    });

  return (
    <div>
      <PageHeader
        breadcrumb={['综合驾驶舱', '校园综合概览']}
        title="校园综合概览"
        subtitle={
          <Space size={8} wrap>
            <span>统计区间：{range.label}{range.partialNote ? `（${range.partialNote}）` : ''}</span>
            <span className="muted">电力口径：{boundaryNote('electricity', scope)}</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={
          <Space>
            <RangeModeControl />
            <Button size="small" icon={<FullscreenOutlined />} onClick={() => navigate('/dashboard/energy')}>能源专题大屏</Button>
          </Space>
        }
      />

      <div className="kpi-row">
        <StatCard
          label="本期用电量" value={stats.elec.total} unit="kWh" decimals={0}
          trend={pctChange(stats.elec.total, stats.elecBase?.total ?? null)} trendLabel={trendLabel}
          qualityNote={stats.elec.incomplete ? '本期样本存在缺失或无效，总量为已计入部分' : undefined}
          onClick={() => navigate('/monitor/electricity')}
        />
        <StatCard
          label="本期用水量" value={stats.water.total} unit="m³" decimals={0}
          trend={pctChange(stats.water.total, stats.waterBase?.total ?? null)} trendLabel={trendLabel}
          qualityNote={stats.water.incomplete ? '本期样本存在缺失或无效' : undefined}
          onClick={() => navigate('/monitor/water')}
        />
        <StatCard
          label="本期天然气" value={stats.gas.total} unit="m³" decimals={0}
          trend={pctChange(stats.gas.total, stats.gasBase?.total ?? null)} trendLabel={trendLabel}
          qualityNote={stats.gas.incomplete ? '燃气表采集设备离线时段未计入' : undefined}
          onClick={() => navigate('/monitor/gas')}
        />
        <StatCard
          label={`能源费用测算（${monthOf(range.from)}月）`}
          value={stats.elecCost + stats.waterCost + stats.gasCost}
          unit="元" decimals={0}
          sub={<span>电 {fmtInt(stats.elecCost)} ＋ 水 {fmtInt(stats.waterCost)} ＋ 气 {fmtInt(stats.gasCost)}</span>}
          qualityNote="电费仅含分时电度费，不含基本电费与税费"
          onClick={() => navigate('/costs/overview')}
        />
        <StatCard
          label="待处理异常事件"
          value={stats.activeAlarms.length}
          unit="件"
          sub={`${stats.activeAlarms.filter((a) => a.severity === 'major' || a.severity === 'critical').length} 件重要及以上`}
          onClick={() => navigate('/alarms')}
        />
        <StatCard
          label="数据覆盖率"
          value={stats.overallCoverage === null ? '—' : Math.round(stats.overallCoverage * 1000) / 10}
          unit="%"
          sub="电/水/气三类能源本期样本"
          onClick={() => navigate('/base/data-quality')}
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`${stats.trendElec.windowLabel}用电趋势（${campusId === 'all' ? '全校' : '当前校区'}）`}
          note={stats.trendElec.note ?? '曲线断开处为缺失样本，缺失不按0计'}
          height={280}
        >
          <EnergyLineChart
            x={stats.trendElec.rows.map((r) => trendXLabel(r.date))}
            series={[{
              name: dateMode === 'day' ? '日用电量（kWh）' : '用电量（kWh）',
              data: stats.trendElec.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)),
              color: ENERGY_COLOR.electricity,
              area: true,
            }]}
            unit="kWh"
            height={270}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard
          title={`${stats.trendWater.windowLabel}用水趋势`}
          note={stats.trendWater.note}
          height={280}
        >
          <EnergyLineChart
            x={stats.trendWater.rows.map((r) => trendXLabel(r.date))}
            series={[{
              name: dateMode === 'day' ? '日用水量（m³）' : '用水量（m³）',
              data: stats.trendWater.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)),
              color: ENERGY_COLOR.water,
              area: true,
            }]}
            unit="m³"
            height={270}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title={`建筑用电排行（${range.label}）`}
          note="点击柱条进入楼宇详情；分项未覆盖部分见楼宇详情与能源平衡页"
          height={340}
        >
          <EnergyLineChart
            x={[...stats.buildingRank].slice(0, 10).reverse().map((r) => r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name)}
            series={[{
              name: '用电量',
              data: [...stats.buildingRank].slice(0, 10).reverse().map((r) => Math.round(r.value)),
              color: ENERGY_COLOR.electricity,
            }]}
            unit="kWh"
            height={330}
            showLegend={false}
          />
        </ChartCard>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>建筑用电排行明细（{range.label}）</span>} styles={{ body: { padding: '4px 8px' } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ y: 300 }}
            dataSource={stats.buildingRank.slice(0, 10)}
            onRow={(r) => ({ onClick: () => navigate(`/monitor/building/${r.id}?from=${range.from}&to=${range.to}&campus=${campusId}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: '#', width: 36, render: (_v, r, i) => i + 1 },
              { title: '建筑', dataIndex: 'name' },
              { title: '类别', dataIndex: 'category', width: 84, render: (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] },
              { title: '用电量(kWh)', dataIndex: 'value', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
              {
                title: '数据质量', width: 96, render: (_v, r) => (
                  <IncompleteNote hasMissing={r.hasMissing} hasEstimated={r.hasEstimated} hasInvalid={r.hasInvalid} hasManual={r.hasManual} />
                ),
              },
            ]}
          />
        </Card>
      </div>

      <div className="chart-grid c3">
        <ChartCard title={`建筑类型用电构成（${range.label}）`} note="同单位（kWh）构成占比" height={300}>
          <EnergyPieChart data={stats.categoryPie} unit="kWh" height={290} />
        </ChartCard>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>校区对比（{range.label}）</span>} styles={{ body: { padding: '8px 12px' } }}>
          <Table
            size="small"
            rowKey="key"
            pagination={false}
            dataSource={campusCompareRows}
            columns={[
              { title: '校区', dataIndex: 'name', width: 76 },
              {
                title: `用电 ${ENERGY_UNIT.electricity}`, dataIndex: 'elec', align: 'right' as const,
                render: (u: { total: number | null; incomplete: boolean }) => (
                  <span>{fmtInt(u.total)} {u.incomplete ? <Tooltip title="样本存在缺失/无效"><WarningOutlined style={{ color: '#fa8c16' }} /></Tooltip> : null}</span>
                ),
              },
              {
                title: `用水 ${ENERGY_UNIT.water}`, dataIndex: 'water', align: 'right' as const,
                render: (u: { total: number | null }) => fmtInt(u.total),
              },
              {
                title: `用气 ${ENERGY_UNIT.gas}`, dataIndex: 'gas', align: 'right' as const,
                render: (u: { total: number | null }) => fmtInt(u.total),
              },
            ]}
          />
          <div className="muted small mt8">不同能源实物量分列展示，不做跨单位加总</div>
          <Space direction="vertical" size={2} className="mt8">
            {entities.campuses.map((c) => (
              <a key={c.id} onClick={() => navigate(`/dashboard/campus/${c.id}`)}>
                {c.name}总览 <RightOutlined />
              </a>
            ))}
          </Space>
        </Card>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>异常事件摘要</span>} styles={{ body: { padding: '4px 8px' } }} extra={<a onClick={() => navigate('/alarms')}>全部</a>}>
          <List
            size="small"
            dataSource={entities.alarms.slice(0, 5)}
            renderItem={(a) => (
              <List.Item
                style={{ cursor: 'pointer', padding: '6px 8px' }}
                onClick={() => navigate(`/alarms/${a.id}`)}
              >
                <div style={{ width: '100%' }}>
                  <Space size={4} wrap>
                    <SeverityTag severity={a.severity} />
                    <AlarmStatusTag status={a.status} />
                    <span style={{ fontSize: 13 }}>{a.title}</span>
                  </Space>
                  <div className="muted small">{a.time} · {entities.buildings.find((b) => b.id === a.buildingId)?.name ?? '公共区域'}</div>
                </div>
              </List.Item>
            )}
          />
        </Card>
      </div>

      <div className="chart-grid c3">
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>今日待处理事项</span>} styles={{ body: { padding: '8px 12px' } }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <a onClick={() => navigate('/alarms')}>待处理/处理中告警 <b>{stats.activeAlarms.length}</b> 件 <RightOutlined /></a>
            <a onClick={() => navigate('/work-orders')}>未完成工单 <b>{stats.openWorkOrders.length}</b> 项 <RightOutlined /></a>
            <a onClick={() => navigate('/base/data-quality')}>待审核补录 <b>{stats.pendingCorrections.length}</b> 条 <RightOutlined /></a>
            <a onClick={() => navigate('/costs/bills')}>待核对账单 <b>{stats.pendingBills.length}</b> 张 <RightOutlined /></a>
          </Space>
        </Card>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>最近更新计量点</span>} styles={{ body: { padding: '4px 12px' } }} extra={<a onClick={() => navigate('/base/meters')}>计量档案</a>}>
          <List
            size="small"
            dataSource={stats.recentPoints}
            renderItem={(p) => (
              <List.Item style={{ padding: '4px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 13 }}>
                  <span>{p.name}</span>
                  <Space size={4}>
                    <Tag color="green">{ENERGY_LABEL[p.energyType]}</Tag>
                    <span className="muted small">{dayjs(META.asOf).format('HH:mm')}</span>
                  </Space>
                </div>
              </List.Item>
            )}
          />
        </Card>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>校园专题入口</span>} styles={{ body: { padding: '8px 12px' } }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <a onClick={() => navigate('/scenarios/teaching')}>教学楼用能（教学/假期对比）<RightOutlined /></a>
            <a onClick={() => navigate('/analysis/calendar')}>教学日历分析 <RightOutlined /></a>
            <a onClick={() => navigate('/scenarios/dormitory')}>学生宿舍用能 <RightOutlined /></a>
            <a onClick={() => navigate('/scenarios/plant')}>能源站与管网 <RightOutlined /></a>
            <a onClick={() => navigate('/analysis/balance')}>能源平衡与计量覆盖 <RightOutlined /></a>
          </Space>
        </Card>
      </div>

      <div className="muted small" style={{ marginTop: 8 }}>
        统计说明：本期天数 {daysBetween(range.from, range.to)} 天；建筑排行按建筑主表口径，校区汇总按购入边界口径，二者不重复计量。
        综合折标统计未配置折标系数，故不展示吨标煤数值。
      </div>
    </div>
  );
}