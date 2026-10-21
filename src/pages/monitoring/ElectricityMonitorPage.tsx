import { useMemo, useState } from 'react';
import { Card, Input, Space, Table, Tag, Tooltip, DatePicker } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyBarChart, EnergyLineChart, EnergyStackedBar } from '../../components/charts';
import { CoverageTag, IncompleteNote } from '../../components/StatusTags';
import { BuildingSelect, CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters, DATA_END } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import {
  scopeUsage, scopeHourly, latestPowerKw, dailyRows, boundaryNote, hourRangeOf,
} from '../../services/energyStats';
import { electricityTouDaily } from '../../services/costService';
import {
  cumulativeReadings, TOTAL_HOURS, hourIndexOf, hourTimestamp, qualityOfCode, getSeries,
} from '../../services/telemetry';
import { ENERGY_COLOR } from '../../domain/units';
import { lastNDays, shiftDay, monthOf } from '../../domain/time';
import type { MeteringPoint } from '../../domain/types';

const TOU_COLORS: Record<string, string> = { 尖峰: '#d4380d', 高峰: '#fa8c16', 平段: '#1668dc', 低谷: '#13c2c2' };

export default function ElectricityMonitorPage() {
  const navigate = useNavigate();
  const { campusId } = useFilters();
  const [buildingId, setBuildingId] = useState<'all' | string>('all');
  const [anchor, setAnchor] = useState<string>('2026-10-20');
  const [search, setSearch] = useState('');
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const entities = getEntities();

  const scope = useMemo(
    () => userScope(campusId, undefined, buildingId !== 'all' ? buildingId : undefined),
    [campusId, buildingId],
  );
  const boundary = buildingId !== 'all' ? boundaryNote('electricity', { buildingId }) : boundaryNote('electricity', scope);

  const effectivePointIds = useMemo(() => {
    if (buildingId !== 'all') {
      return entities.meteringPoints
        .filter((p) => p.buildingId === buildingId && p.energyType === 'electricity')
        .map((p) => p.id);
    }
    const restricted = scope.buildingIds;
    return entities.meteringPoints
      .filter((p) =>
        p.energyType === 'electricity' &&
        (p.role === 'main' || p.role === 'public') &&
        (scope.campusId === 'all' || p.campusId === scope.campusId) &&
        (!restricted || (p.buildingId ? restricted.includes(p.buildingId) : false)))
      .map((p) => p.id);
  }, [buildingId, entities, scope]);

  const data = useMemo(() => {
    const yesterday = anchor;
    const today = shiftDay(anchor, 1) <= DATA_END ? shiftDay(anchor, 1) : null;
    const month = monthOf(anchor);
    const monthEnd = dayjs(anchor).endOf('month').isAfter(dayjs(DATA_END)) ? DATA_END : dayjs(anchor).endOf('month').format('YYYY-MM-DD');

    const { fromH, toH } = hourRangeOf(yesterday, yesterday);
    const yesterdayUsage = scopeUsage('electricity', scope, yesterday, yesterday);
    const monthUsage = scopeUsage('electricity', scope, `${month}-01`, monthEnd);

    const power = latestPowerKw(effectivePointIds);
    const hourRows = scopeHourly('electricity', scope, yesterday, yesterday);
    const days7 = lastNDays(anchor, 7);
    const daily7 = dailyRows(effectivePointIds, days7[0], anchor);
    const prevWeekDaily = dailyRows(effectivePointIds, lastNDays(shiftDay(anchor, -7), 7)[0], shiftDay(anchor, -7));

    const days30 = lastNDays(anchor, 30);
    const touDaily = electricityTouDaily(effectivePointIds, days30[0], anchor);

    const buildingRank = entities.buildings
      .filter((b) => b.status === 'active' && (scope.campusId === 'all' || b.campusId === scope.campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)))
      .map((b) => {
        const u = scopeUsage('electricity', { buildingId: b.id }, yesterday, yesterday);
        return { id: b.id, name: b.name, value: u.total ?? 0, coverage: u.coverage, hasMissing: u.hasMissing };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return { yesterdayUsage, monthUsage, power, hourRows, daily7, prevWeekDaily, days7, touDaily, buildingRank, month };
  }, [anchor, scope, effectivePointIds, entities]);

  const pointsTable = useMemo(() => {
    const list = buildingId !== 'all'
      ? entities.meteringPoints.filter((p) => p.buildingId === buildingId && p.energyType === 'electricity')
      : entities.meteringPoints.filter((p) =>
        p.energyType === 'electricity' &&
        (p.role === 'main' || p.role === 'public') &&
        (scope.campusId === 'all' || p.campusId === scope.campusId) &&
        (!scope.buildingIds || (p.buildingId ? scope.buildingIds.includes(p.buildingId) : false)));
    const yesterdayIdx = hourIndexOf(anchor, 23);
    return list
      .filter((p) => !search || p.name.includes(search) || p.code.toLowerCase().includes(search.toLowerCase()))
      .map((p) => {
        const series = getSeries(p.id);
        const cum = cumulativeReadings(p.id, Math.max(0, yesterdayIdx - 23), yesterdayIdx);
        const last = cum[cum.length - 1];
        const daySum = dailyRows([p.id], anchor, anchor)[0];
        const lastValidIdx = (() => {
          if (!series) return null;
          for (let i = TOTAL_HOURS - 1; i >= 0; i--) {
            const q = qualityOfCode(series.quality[i]);
            if (q !== 'missing' && q !== 'invalid') return i;
          }
          return null;
        })();
        const offline = lastValidIdx === null ? true : (TOTAL_HOURS - 1 - lastValidIdx) >= 6;
        return {
          id: p.id,
          name: p.name,
          code: p.code,
          buildingName: p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '公共设施/关口',
          role: p.role,
          lastReading: last?.value ?? null,
          lastReadingTs: last?.timestamp ?? null,
          yesterday: daySum.total,
          coverage: daySum.coverage,
          hasMissing: daySum.hasMissing,
          hasEstimated: daySum.hasEstimated,
          hasInvalid: daySum.hasInvalid,
          hasManual: daySum.hasManualCorrected,
          offline,
          lastSeen: lastValidIdx !== null ? hourTimestamp(lastValidIdx) : null,
        };
      });
  }, [buildingId, entities, search, anchor, scope]);

  const exportSheet = {
    name: '计量点明细',
    headers: ['计量点', '编码', '所属', '类型', '最新累计读数(kWh)', `当日用电(kWh)`, '数据覆盖率', '最后上报'],
    rows: pointsTable.map((r) => [r.name, r.code, r.buildingName, r.role, r.lastReading, r.yesterday, `${(r.coverage * 100).toFixed(1)}%`, r.lastSeen ?? '—']),
  };

  const touSegments = ['尖峰', '高峰', '平段', '低谷'];

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', '电力运行监测']}
        title="电力运行监测"
        subtitle={<Space size={8} wrap><span>统计口径：{boundary}</span><span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span></Space>}
        extra={<ExportButton filename={`电力计量点明细_${anchor}`} sheet={exportSheet} metaNote={`统计日：${anchor}；口径：${boundary}；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">建筑</span>
        <BuildingSelect value={buildingId} onChange={setBuildingId} campusId={campusId} />
        <span className="filter-label">监测日</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">功率与电量分开统计；电压、电流、功率因数未接入源数据，页面不展示相应图表。</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard
          label="当前总功率"
          value={data.power?.kW ?? null}
          unit="kW"
          sub={`最近采样小时平均功率（${data.power ? dayjs(data.power.ts).format('MM-DD HH:mm') : '—'}）`}
          qualityNote="为最近完整采样小时的平均功率，非瞬时值"
        />
        <StatCard
          label="昨日用电量"
          value={data.yesterdayUsage.total}
          unit="kWh"
          sub={`覆盖率 ${(data.yesterdayUsage.coverage * 100).toFixed(1)}%`}
          qualityNote={data.yesterdayUsage.incomplete ? '存在缺失/无效样本' : undefined}
        />
        <StatCard
          label="本月用电量"
          value={data.monthUsage.total}
          unit="kWh"
          sub={`${data.month}月累计（截至最新可得时刻）`}
          qualityNote={data.monthUsage.incomplete ? '存在缺失/无效样本' : undefined}
        />
        <StatCard
          label="本月尖峰电量占比"
          value={(() => {
            const tip = data.touDaily.reduce((a, r) => a + (r.segments['尖峰'] ?? 0), 0);
            const total = data.touDaily.reduce((a, r) => a + r.total, 0);
            return total > 0 ? Math.round((tip / total) * 1000) / 10 : null;
          })()}
          unit="%"
          sub="按现行分时电价日历统计"
        />
      </div>

      <div className="chart-grid c2">
        <ChartCard title={`功率曲线（${anchor} 24小时，kW）`} note="每小时平均功率＝该小时区间电量/1小时" height={300}>
          <EnergyLineChart
            x={data.hourRows.map((r) => r.ts.slice(11, 13) + '时')}
            series={[{ name: '平均功率', data: data.hourRows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: ENERGY_COLOR.electricity }]}
            unit="kW"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title={`日内用电量（${anchor} 24小时，kWh）`} note="缺失小时不按0计，曲线断开表示无有效样本" height={300}>
          <EnergyBarChart
            x={data.hourRows.map((r) => r.ts.slice(11, 13) + '时')}
            series={[{ name: '小时用电量', data: data.hourRows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: ENERGY_COLOR.electricity }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard title="近7日用电对比" note="含上周同期对比" height={300}>
          <EnergyBarChart
            x={data.days7.map((d) => d.slice(5))}
            series={[
              { name: '近7日', data: data.daily7.map((r) => Math.round(r.total)), color: ENERGY_COLOR.electricity },
              { name: '上周同期', data: data.prevWeekDaily.map((r) => Math.round(r.total)), color: '#95de64' },
            ]}
            unit="kWh"
            height={290}
          />
        </ChartCard>
        <ChartCard
          title="近7日逐时负荷曲线（分日叠加）"
          note="每日24小时曲线叠加对比，识别日内用电规律"
          height={300}
        >
          <EnergyLineChart
            x={Array.from({ length: 24 }, (_, h) => `${h}时`)}
            series={data.days7.map((d, i) => {
              const rows = scopeHourly('electricity', scope, d, d);
              return {
                name: d.slice(5),
                data: rows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10),
                color: ['#1668dc', '#69c0ff', '#13c2c2', '#52c41a', '#faad14', '#fa8c16', '#d4380d'][i % 7],
                dashed: i === 6,
              };
            })}
            unit="kWh/h"
            height={290}
          />
        </ChartCard>
      </div>

      <div className="chart-grid c2">
        <ChartCard
          title="近30日峰平谷用电结构（kWh）"
          note="按当日有效电价方案分段；尖峰19-21时、高峰8-12/17-19时、低谷23-次日8时"
          height={320}
        >
          <EnergyStackedBar
            x={data.touDaily.map((r) => r.date.slice(5))}
            series={touSegments.map((name) => ({
              name,
              data: data.touDaily.map((r) => Math.round(r.segments[name] ?? 0)),
              color: TOU_COLORS[name],
              stack: 'tou',
              type: 'bar',
            }))}
            unit="kWh"
            height={310}
          />
        </ChartCard>
        <ChartCard title="建筑用电排行（监测日）" note="点击柱条进入楼宇详情" height={320}>
          <EnergyBarChart
            x={data.buildingRank.map((r) => r.name.length > 7 ? r.name.slice(0, 7) + '…' : r.name)}
            series={[{ name: '用电量', data: data.buildingRank.map((r) => Math.round(r.value)), color: ENERGY_COLOR.electricity }]}
            unit="kWh"
            height={310}
            showLegend={false}
            onEvent={(p) => {
              const idx = data.buildingRank.findIndex((r) => r.name.length > 7 ? (r.name.slice(0, 7) + '…') === p.name : r.name === p.name);
              if (idx >= 0) navigate(`/monitor/building/${data.buildingRank[idx].id}?from=${anchor}&to=${anchor}&campus=${campusId}`);
            }}
          />
        </ChartCard>
      </div>

      <Card
        size="small"
        className="table-card"
        title={<span style={{ fontSize: 14, fontWeight: 600 }}>计量点明细（{anchor}）</span>}
        extra={
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索计量点/编码"
            style={{ width: 200 }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        }
        styles={{ body: { padding: '4px 8px' } }}
      >
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 12 }}
          dataSource={pointsTable}
          onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
          columns={[
            { title: '计量点', dataIndex: 'name' },
            { title: '所属', dataIndex: 'buildingName', width: 150 },
            {
              title: '类型', dataIndex: 'role', width: 80,
              render: (r: string) => r === 'main' ? <Tag color="blue">总表</Tag> : r === 'public' ? <Tag color="cyan">公共</Tag> : <Tag>分表</Tag>,
            },
            {
              title: '最新累计读数(kWh)', dataIndex: 'lastReading', width: 150, align: 'right' as const,
              render: (v: number | null, r) => (
                <Tooltip title={`读数时间：${r.lastReadingTs ?? '—'}（差分统计区间用量）`}>
                  {v === null ? '—' : Math.round(v).toLocaleString('zh-CN')}
                </Tooltip>
              ),
            },
            { title: '当日用电(kWh)', dataIndex: 'yesterday', width: 110, align: 'right' as const, render: (v: number | null) => v === null ? '—' : Math.round(v).toLocaleString('zh-CN') },
            { title: '覆盖率', dataIndex: 'coverage', width: 90, render: (c: number) => <CoverageTag coverage={c} /> },
            {
              title: '数据质量', width: 96,
              render: (_v, r) => <IncompleteNote hasMissing={r.hasMissing} hasEstimated={r.hasEstimated} hasInvalid={r.hasInvalid} hasManual={r.hasManual} />,
            },
            {
              title: '采集状态', dataIndex: 'offline', width: 90,
              render: (o: boolean, r) => o
                ? <Tooltip title={`最后上报：${r.lastSeen ?? '无有效上报'}，超过6小时无数据`}><Tag color="red">离线/迟到</Tag></Tooltip>
                : <Tag color="green">在线</Tag>,
            },
          ]}
        />
      </Card>

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}