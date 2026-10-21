import { useMemo, useState } from 'react';
import { Card, DatePicker, Select, Space, Table, Tag, Tooltip } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyBarChart, EnergyHeatmap, EnergyLineChart } from '../../components/charts';
import { CoverageTag } from '../../components/StatusTags';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import {
  scopeUsage, scopeHourly, dailyRows, nightFlowRows, campusBalance, boundaryNote, latestPowerKw,
} from '../../services/energyStats';
import { ENERGY_COLOR } from '../../domain/units';
import { lastNDays, monthOf } from '../../domain/time';
import { getSeries, qualityOfCode, TOTAL_HOURS } from '../../services/telemetry';

export default function WaterMonitorPage() {
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const [focusPoint, setFocusPoint] = useState<string>('P-D1-W');
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const waterPoints = useMemo(() => {
    const restricted = scope.buildingIds;
    return entities.meteringPoints.filter((p) =>
      p.energyType === 'water' &&
      (p.role === 'main' || p.role === 'public') &&
      (scope.campusId === 'all' || p.campusId === scope.campusId) &&
      (!restricted || (p.buildingId ? restricted.includes(p.buildingId) : true)),
    );
  }, [entities, scope]);

  const focusOptions = waterPoints.map((p) => ({
    value: p.id,
    label: p.name + (p.buildingId ? '' : '（公共）'),
  }));

  const data = useMemo(() => {
    const yesterday = anchor;
    const month = monthOf(anchor);
    const monthEnd = dayjs(anchor).endOf('month').isAfter(dayjs(META.dataWindow.end)) ? META.dataWindow.end : dayjs(anchor).endOf('month').format('YYYY-MM-DD');

    const yesterdayUsage = scopeUsage('water', scope, yesterday, yesterday);
    const monthUsage = scopeUsage('water', scope, `${month}-01`, monthEnd);
    const flow = latestPowerKw(waterPoints.map((p) => p.id));
    const hourRows = scopeHourly('water', scope, yesterday, yesterday);
    const focusHourRows = focusPoint ? scopeHourly('water', { buildingId: entities.meteringPoints.find((p) => p.id === focusPoint)?.buildingId ?? undefined }, yesterday, yesterday) : hourRows;
    const days30 = lastNDays(anchor, 30);
    const focusDaily = focusPoint ? dailyRows([focusPoint], days30[0], anchor) : dailyRows(waterPoints.map((p) => p.id), days30[0], anchor);
    const night = focusPoint ? nightFlowRows(focusPoint, days30[0], anchor) : [];
    const zoneRows = entities.buildings
      .filter((b) => b.status === 'active' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)))
      .map((b) => {
        const u = scopeUsage('water', { buildingId: b.id }, yesterday, yesterday);
        return { id: b.id, name: b.name, value: u.total ?? 0, coverage: u.coverage, hasMissing: u.hasMissing, hasInvalid: u.hasInvalid };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value);
    const balance = scope.campusId !== 'all'
      ? campusBalance(scope.campusId, 'water', yesterday, yesterday)
      : campusBalance('C-E', 'water', yesterday, yesterday);
    const waterAlarms = entities.alarms.filter((a) => a.energyType === 'water' && a.status !== 'closed');
    return { yesterdayUsage, monthUsage, flow, hourRows, focusHourRows, days30, focusDaily, night, zoneRows, balance, waterAlarms, month };
  }, [anchor, scope, waterPoints, focusPoint, entities]);

  const nightWindow = data.night.slice(-8);
  const latestNight = nightWindow.length > 0 ? nightWindow[nightWindow.length - 1].minFlow : null;

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', '用水监测']}
        title="用水监测"
        subtitle={
          <Space size={8} wrap>
            <span>统计口径：{boundaryNote('water', scope)}</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">监测日</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="filter-label">重点水表</span>
        <Select size="small" style={{ width: 220 }} showSearch optionFilterProp="label" value={focusPoint} options={focusOptions} onChange={setFocusPoint} />
        <span className="muted small">夜间最小流量统计窗口：每日02:00-05:00；仅作漏损线索，需现场核查。</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="昨日用水量" value={data.yesterdayUsage.total} unit="m³" sub={`覆盖率 ${(data.yesterdayUsage.coverage * 100).toFixed(1)}%`} qualityNote={data.yesterdayUsage.incomplete ? '存在缺失/无效样本' : undefined} />
        <StatCard label="本月用水量" value={data.monthUsage.total} unit="m³" sub={`${data.month}月累计`} qualityNote={data.monthUsage.incomplete ? '存在缺失/无效样本' : undefined} />
        <StatCard
          label="当前流量"
          value={data.flow?.kW ?? null}
          unit="m³/h"
          sub={`最近采样小时平均流量（${data.flow ? dayjs(data.flow.ts).format('MM-DD HH时') : '—'}）`}
        />
        <StatCard
          label="夜间最小流量（重点水表）"
          value={latestNight}
          unit="m³/h"
          decimals={2}
          sub={`${anchor}（02:00-05:00 最小值）`}
          qualityNote={latestNight !== null && latestNight > 1.5 ? '超过1.5 m³/h夜间阈值，建议核查' : undefined}
        />
      </div>

      {data.waterAlarms.length > 0 && (
        <Card size="small" className="mb12" styles={{ body: { padding: '8px 12px' } }}>
          <Space direction="vertical" size={2}>
            <b>用水异常线索（可转入告警处置）</b>
            {data.waterAlarms.map((a) => (
              <div key={a.id}>
                <Tag color="orange">重要</Tag>
                {a.title}（{a.detectedValue}）<Link to={`/alarms/${a.id}`}>进入告警详情 →</Link>
              </div>
            ))}
          </Space>
        </Card>
      )}

      <div className="chart-grid c2">
        <ChartCard title={`重点水表24小时流量曲线（${anchor}）`} height={300} note="缺失小时不按0计；持续夜间流量为漏损线索，不等同认定漏水">
          <EnergyLineChart
            x={data.focusHourRows.map((r) => r.ts.slice(11, 13) + '时')}
            series={[{
              name: '小时流量',
              data: data.focusHourRows.map((r) => r.value === null ? null : Math.round(r.value * 100) / 100),
              color: ENERGY_COLOR.water,
              area: true,
            }]}
            unit="m³/h"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="近30日夜间最小流量趋势（重点水表）" height={300} note="阈值1.5 m³/h（宿舍片区规则，连续3日超限触发告警）">
          <EnergyLineChart
            x={data.night.map((r) => r.date.slice(5))}
            series={[{
              name: '夜间最小流量',
              data: data.night.map((r) => r.minFlow === null ? null : Math.round(r.minFlow * 100) / 100),
              color: ENERGY_COLOR.water,
            }]}
            unit="m³/h"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="分区用水排行（监测日）" note="按建筑水表口径" height={320}>
          <EnergyBarChart
            x={data.zoneRows.slice(0, 12).map((r) => r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name)}
            series={[{ name: '用水量', data: data.zoneRows.slice(0, 12).map((r) => Math.round(r.value)), color: ENERGY_COLOR.water }]}
            unit="m³"
            height={310}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title={`重点水表近30日用水日历（m³）`} height={320} note="颜色越深用量越高；空白为缺失">
          <EnergyHeatmap
            dates={data.focusDaily.map((r) => r.date)}
            values={data.focusDaily.map((r) => (r.total > 0 ? r.total : null))}
            unit="m³"
            colorFrom="#e6fffb"
            colorTo="#08979c"
            height={310}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2 mb12">
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>供水分区水平衡（监测日）</span>} styles={{ body: { padding: '10px 14px' } }}>
          <Space direction="vertical" size={6}>
            <div>总进水（购水边界）：<b>{Math.round(data.balance.boundary.total ?? 0).toLocaleString('zh-CN')} m³</b></div>
            <div>已核验终端合计：<b>{Math.round(data.balance.coveredTotal).toLocaleString('zh-CN')} m³</b>（建筑 {Math.round(data.balance.buildingTotal).toLocaleString('zh-CN')} + 绿化等公共 {Math.round(data.balance.publicTotal).toLocaleString('zh-CN')}）</div>
            <div>计量平衡差额：<b>{Math.round(data.balance.uncovered ?? 0).toLocaleString('zh-CN')} m³</b>（{(data.balance.uncoveredPct ?? 0).toFixed(1)}%）<span className="muted small">为计量差额，未经证实不解释为漏损</span></div>
            <div className="muted small">水平衡需相同时间窗与覆盖边界，无分区总表时仅展示子表合计并提示覆盖范围。</div>
          </Space>
        </Card>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>水表计量点状态</span>} styles={{ body: { padding: '4px 8px' } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{ y: 240 }}
            dataSource={waterPoints}
            onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '计量点', dataIndex: 'name' },
              { title: '所属', width: 150, render: (_v, p) => p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '公共设施' },
              { title: '昨日用量(m³)', width: 110, align: 'right' as const, render: (_v, p) => { const r = dailyRows([p.id], anchor, anchor)[0]; return r ? Math.round(r.total * 10) / 10 : '—'; } },
              { title: '覆盖率', width: 88, render: (_v, p) => { const r = dailyRows([p.id], anchor, anchor)[0]; return r ? <CoverageTag coverage={r.coverage} /> : '—'; } },
              {
                title: '状态', width: 84,
                render: (_v, p) => {
                  const s = getSeries(p.id);
                  let lastValid = -1;
                  if (s) {
                    for (let i = TOTAL_HOURS - 1; i >= 0; i--) {
                      const q = qualityOfCode(s.quality[i]);
                      if (q !== 'missing' && q !== 'invalid') { lastValid = i; break; }
                    }
                  }
                  const ok = lastValid >= TOTAL_HOURS - 6;
                  const corrected = entities.corrections.some((c) => c.pointId === p.id && c.status === 'approved');
                  return (
                    <Space size={4}>
                      <Tag color={ok ? 'green' : 'red'}>{ok ? '在线' : '离线'}</Tag>
                      {corrected && <Tooltip title="存在已审批的人工补录修正，原缺失样本保留"><Tag color="blue">含修正</Tag></Tooltip>}
                    </Space>
                  );
                },
              },
            ]}
          />
        </Card>
      </div>

      <div className="muted small">
        监测说明：瞬时流量为最近采样小时平均流量；夜间流量异常仅为线索，正式处置须经现场核查（告警→工单流程）。
        换表、离线时段数据缺失如实展示，不按0填充；补录值经审批后标记为人工修正。
      </div>

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}