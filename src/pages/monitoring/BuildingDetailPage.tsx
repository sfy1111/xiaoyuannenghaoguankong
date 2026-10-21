import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Button, Descriptions, Empty, Space, Table, Tabs, Tag, Tooltip,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyBarChart, EnergyLineChart, EnergyStackedBar } from '../../components/charts';
import { AlarmStatusTag, CoverageTag, IncompleteNote, SeverityTag } from '../../components/StatusTags';
import { getEntities, META } from '../../services/repository';
import {
  scopeUsage, scopeHourly, dailyRows, buildingSubitems, teachingStats, boundaryNote,
} from '../../services/energyStats';
import { electricityCost, simpleEnergyCost } from '../../services/costService';
import { intensity, pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, ENERGY_COLOR, ENERGY_LABEL, ENERGY_UNIT, SUBITEM_COLORS, fmtInt } from '../../domain/units';
import { lastNDays, monthOf, rangeMonths, shiftDay } from '../../domain/time';
import { DAY_TYPE_LABEL, resolveDay } from '../../domain/calendar';
import type { EnergyType, MeteringPoint } from '../../domain/types';

export default function BuildingDetailPage() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const entities = getEntities();
  const from = params.get('from') ?? '2026-10-20';
  const to = params.get('to') ?? '2026-10-20';
  const back = params.get('back');
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const building = entities.buildings.find((b) => b.id === buildingId);
  const dept = building ? entities.departments.find((d) => d.id === building.departmentId) : null;
  const campus = building ? entities.campuses.find((c) => c.id === building.campusId) : null;

  const availableEnergies = useMemo(() => {
    if (!building) return [] as EnergyType[];
    const list: EnergyType[] = [];
    for (const et of ['electricity', 'water', 'gas', 'cooling', 'heat', 'hotWater'] as EnergyType[]) {
      if (entities.meteringPoints.some((p) => p.buildingId === building.id && p.energyType === et && p.role === 'main')) list.push(et);
    }
    return list;
  }, [building, entities]);

  const hasSubitems = building ? entities.meteringPoints.some((p) => p.buildingId === building.id && p.role === 'submeter' && p.energyType === 'electricity') : false;

  const stats = useMemo(() => {
    if (!building) return null;
    const scope = { buildingId: building.id };
    const elec = scopeUsage('electricity', scope, from, to);
    const water = scopeUsage('water', scope, from, to);
    const gas = scopeUsage('gas', scope, from, to);
    const cooling = scopeUsage('cooling', scope, from, to);
    const heat = scopeUsage('heat', scope, from, to);
    const hotWater = scopeUsage('hotWater', scope, from, to);
    const prevFrom = dayjs(from).subtract(7, 'day').format('YYYY-MM-DD');
    const prevTo = dayjs(to).subtract(7, 'day').format('YYYY-MM-DD');
    const elecPrev = scopeUsage('electricity', scope, prevFrom, prevTo);

    const days30 = lastNDays(to, 30);
    const trendElec = availableEnergies.includes('electricity') ? dailyRows(entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id), days30[0], days30[29]) : [];
    const trendWater = availableEnergies.includes('water') ? dailyRows(entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'water' && p.role === 'main').map((p) => p.id), days30[0], days30[29]) : [];

    const hourElec = availableEnergies.includes('electricity')
      ? scopeHourly('electricity', scope, from, from)
      : [];
    const hourWater = availableEnergies.includes('water') ? scopeHourly('water', scope, from, from) : [];

    const sub = availableEnergies.includes('electricity') ? buildingSubitems(building.id, 'electricity', from, to) : null;
    const sub30 = sub
      ? sub.subitems.map((s) => ({
        point: s.point,
        rows: dailyRows([s.point.id], days30[0], days30[29]),
      }))
      : [];

    const teach = availableEnergies.includes('electricity') ? teachingStats(building.id, from, to) : null;

    const category = building.category;
    const peers = entities.buildings.filter((b) => b.status === 'active' && b.category === category);
    const peerIntensity = peers.map((b) => {
      const u = scopeUsage('electricity', { buildingId: b.id }, from, to);
      return { id: b.id, name: b.name, usage: u.total ?? 0, int: intensity(u.total, b.assessmentArea), area: b.assessmentArea };
    }).sort((a, b) => (b.int ?? 0) - (a.int ?? 0));

    const alarms = entities.alarms.filter((a) => a.buildingId === building.id);
    const openAlarms = alarms.filter((a) => a.status !== 'closed');

    const month = monthOf(from);
    const months = rangeMonths('2026-04', month);
    const elecPointIds = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
    const costTrend = months.map((m) => {
      const [y, mm] = m.split('-').map(Number);
      const last = new Date(Date.UTC(y, mm, 0));
      const mEnd = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`;
      const cost = electricityCost(elecPointIds, `${m}-01`, mEnd);
      return { month: m, amount: cost.amount, usage: cost.usage };
    }).filter((r) => r.usage > 0);

    const waterPoints = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'water' && p.role === 'main').map((p) => p.id);
    const waterCost = availableEnergies.includes('water') ? simpleEnergyCost('water', waterPoints, from, to) : null;
    const gasPoints = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'gas').map((p) => p.id);
    const gasCost = availableEnergies.includes('gas') ? simpleEnergyCost('gas', gasPoints, from, to) : null;

    return {
      elec, water, gas, cooling, heat, hotWater, elecPrev,
      trendElec, trendWater, hourElec, hourWater, days30,
      sub, sub30, teach, peerIntensity, alarms, openAlarms, costTrend, waterCost, gasCost,
    };
  }, [building, from, to, entities, availableEnergies]);

  if (!building || !stats) {
    return (
      <div>
        <PageHeader breadcrumb={['能源监测', '单栋楼宇详情']} title="建筑不存在" subtitle="该建筑可能在维护后被停用或编码变更，请从监测列表重新进入。" />
        <Empty description="未找到该建筑档案" />
      </div>
    );
  }

  const openHours = building.openHoursId ? entities.calendar.openHours.find((o) => o.id === building.openHoursId) : null;
  const buildingPoints = entities.meteringPoints.filter((p) => p.buildingId === building.id);
  const selfIntensity = intensity(stats.elec.total, building.assessmentArea);
  const peerRank = stats.peerIntensity.findIndex((p) => p.id === building.id) + 1;

  const backNav = () => (back ? navigate(back) : navigate(-1));

  const tabItems = [
    {
      key: 'overview',
      label: '总览',
      children: (
        <div>
          <div className="chart-grid c2">
            <ChartCard title={`24小时用电曲线（${from}）`} height={300} note="缺失小时不按0计">
              {stats.hourElec.length > 0 ? (
                <EnergyBarChart
                  x={stats.hourElec.map((r) => r.ts.slice(11, 13) + '时')}
                  series={[{ name: '小时用电量', data: stats.hourElec.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: ENERGY_COLOR.electricity }]}
                  unit="kWh"
                  height={290}
                  showLegend={false}
                />
              ) : <Empty description="该建筑未接入电力计量或本日无有效数据" style={{ padding: 40 }} />}
            </ChartCard>
            <ChartCard title={`24小时用水曲线（${from}）`} height={300}>
              {stats.hourWater.length > 0 ? (
                <EnergyLineChart
                  x={stats.hourWater.map((r) => r.ts.slice(11, 13) + '时')}
                  series={[{ name: '小时流量', data: stats.hourWater.map((r) => r.value === null ? null : Math.round(r.value * 100) / 100), color: ENERGY_COLOR.water, area: true }]}
                  unit="m³/h"
                  height={290}
                  showLegend={false}
                />
              ) : <Empty description="该建筑未接入用水计量" style={{ padding: 40 }} />}
            </ChartCard>
          </div>
          <div className="chart-grid c2">
            <ChartCard title="近30日用电趋势" height={290}>
              <EnergyLineChart
                x={stats.trendElec.map((r) => r.date.slice(5))}
                series={[{ name: '日用电量', data: stats.trendElec.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
                unit="kWh"
                height={280}
                showLegend={false}
              />
            </ChartCard>
            <ChartCard title="近30日用水趋势" height={290}>
              <EnergyLineChart
                x={stats.trendWater.map((r) => r.date.slice(5))}
                series={[{ name: '日用水量', data: stats.trendWater.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.water, area: true }]}
                unit="m³"
                height={280}
                showLegend={false}
              />
            </ChartCard>
          </div>
          <CardLike title="同类建筑基准对比（单位面积电耗，kWh/㎡）">
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={stats.peerIntensity}
              rowClassName={(r) => (r.id === building.id ? 'ant-table-row-selected' : '')}
              columns={[
                { title: '排名', width: 60, render: (_v, _r, i) => i + 1 },
                { title: '建筑', dataIndex: 'name' },
                { title: '考核面积(m²)', dataIndex: 'area', align: 'right' as const, render: (v: number) => fmtInt(v) },
                { title: '用电量(kWh)', dataIndex: 'usage', align: 'right' as const, render: (v: number) => fmtInt(v) },
                { title: '单位面积电耗', dataIndex: 'int', align: 'right' as const, render: (v: number | null) => v === null ? '不可计算（无有效面积）' : v.toFixed(3) },
                {
                  title: '说明', render: (_v, r) => r.id === building.id ? <Tag color="blue">当前建筑（第{peerRank}位）</Tag> : null,
                },
              ]}
            />
          </CardLike>
        </div>
      ),
    },
    {
      key: 'subitems',
      label: '分类分项',
      children: (
        <div>
          {!hasSubitems || !stats.sub ? (
            <Empty description="该建筑未配置用电分项计量，分项覆盖情况见能源平衡页" style={{ padding: 60 }} />
          ) : (
            <>
              <div className="chart-grid c2">
                <ChartCard
                  title="近30日分项用电结构（kWh）"
                  height={320}
                  note={`分项覆盖 ${stats.sub.uncoveredPct === null ? '—' : (100 - stats.sub.uncoveredPct).toFixed(1)}%，未分项差额 ${(stats.sub.uncovered ?? 0).toFixed(0)} kWh（主表-分项合计）`}
                >
                  <EnergyStackedBar
                    x={stats.sub30[0]?.rows.map((r) => r.date.slice(5)) ?? []}
                    series={stats.sub30.map((s) => ({
                      name: s.point.subitem ?? s.point.name,
                      data: s.rows.map((r) => Math.round(r.total)),
                      color: SUBITEM_COLORS[s.point.subitem ?? ''] ?? '#888',
                      stack: 'sub',
                      type: 'bar',
                    }))}
                    unit="kWh"
                    height={310}
                  />
                </ChartCard>
                <ChartCard title={`本期分项占比（${from} 至 ${to}）`} height={320}>
                  <EnergyBarChart
                    x={stats.sub.subitems.map((s) => s.point.subitem ?? s.point.name)}
                    series={[{ name: '用电量', data: stats.sub.subitems.map((s) => Math.round(s.usage.total ?? 0)), color: ENERGY_COLOR.electricity }]}
                    unit="kWh"
                    height={310}
                    showLegend={false}
                  />
                </ChartCard>
              </div>
              <CardLike title="分项计量点清单（点击查看原始读数）">
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={stats.sub.subitems}
                  pagination={false}
                  onRow={(r) => ({ onClick: () => setDrawerPoint(r.point.id), style: { cursor: 'pointer' } })}
                  columns={[
                    { title: '分项', dataIndex: ['point', 'subitem'], render: (v: string) => v },
                    { title: '计量点', dataIndex: ['point', 'name'] },
                    { title: '本期用量(kWh)', dataIndex: ['usage', 'total'], align: 'right' as const, render: (v: number | null) => fmtInt(v) },
                    { title: '占主表比例', dataIndex: 'share', align: 'right' as const, render: (v: number | null) => v === null ? '不可计算' : `${v.toFixed(1)}%` },
                    { title: '覆盖率', dataIndex: ['usage', 'coverage'], render: (c: number) => <CoverageTag coverage={c} /> },
                    {
                      title: '质量', render: (_v, r) => <IncompleteNote hasMissing={r.usage.hasMissing} hasEstimated={r.usage.hasEstimated} hasInvalid={r.usage.hasInvalid} hasManual={r.usage.hasManualCorrected} />,
                    },
                  ]}
                />
                <div className="muted small mt8">
                  分项为支路实测，与主表属包含关系，总量统计只计主表；分项合计用于计算覆盖与未分项差额，不与主表重复相加。
                  {stats.sub.anomaly && <Tag color="red" style={{ marginLeft: 6 }}>计量关系异常：分项合计大于主表，请检查计量拓扑</Tag>}
                </div>
              </CardLike>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'calendar',
      label: '教学日历比较',
      children: (
        <div>
          {!stats.teach ? (
            <Empty description="该建筑未接入电力计量" style={{ padding: 60 }} />
          ) : (
            <>
              <div className="kpi-row">
                <StatCard label="教学时段用电" value={stats.teach.teachingHoursUsage} unit="kWh" sub="按校历开放时段统计" />
                <StatCard label="非教学时段用电" value={stats.teach.nonTeachingUsage} unit="kWh" sub={`占比 ${stats.teach.nonTeachingShare === null ? '不可计算' : stats.teach.nonTeachingShare.toFixed(1) + '%'}`} />
                <StatCard label="口径说明" value="以学校日历估计" sub={stats.teach.definition} />
              </div>
              <div className="chart-grid c2">
                <ChartCard
                  title="教学日 vs 假期 日内用电对比"
                  height={300}
                  note="选取统计期内最近的教学日与假期日各1日叠加对比"
                >
                  <EnergyLineChart
                    x={Array.from({ length: 24 }, (_, h) => `${h}时`)}
                    series={(() => {
                      const findDay = (want: string[], fallback: string[]): string | null => {
                        const days = lastNDays(to, 30);
                        for (const d of days.reverse()) {
                          const t = resolveDay(d, entities.calendar).dayType;
                          if (want.includes(t)) return d;
                        }
                        for (const d of days) {
                          const t = resolveDay(d, entities.calendar).dayType;
                          if (fallback.includes(t)) return d;
                        }
                        return null;
                      };
                      const teachingDay = findDay(['teaching', 'exam'], ['teaching']);
                      const vacationDay = findDay(['vacation'], ['holiday', 'weekend']);
                      const series = [];
                      if (teachingDay) {
                        const rows = scopeHourly('electricity', { buildingId: building.id }, teachingDay, teachingDay);
                        series.push({ name: `教学日 ${teachingDay.slice(5)}`, data: rows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: '#1668dc' });
                      }
                      if (vacationDay) {
                        const rows = scopeHourly('electricity', { buildingId: building.id }, vacationDay, vacationDay);
                        series.push({ name: `假期日 ${vacationDay.slice(5)}`, data: rows.map((r) => r.value === null ? null : Math.round(r.value * 10) / 10), color: '#fa8c16', dashed: true });
                      }
                      return series;
                    })()}
                    unit="kWh/h"
                    height={290}
                  />
                </ChartCard>
                <CardLike title="本建筑统计期内校历分布">
                  <Table
                    size="small"
                    rowKey="date"
                    pagination={false}
                    scroll={{ y: 260 }}
                    dataSource={lastNDays(to, 14).map((d) => ({ date: d, dayType: resolveDay(d, entities.calendar).dayType, name: resolveDay(d, entities.calendar).specialName }))}
                    columns={[
                      { title: '日期', dataIndex: 'date' },
                      { title: '日类型', dataIndex: 'dayType', render: (t: string) => <Tag color={t === 'teaching' ? 'blue' : t === 'exam' ? 'purple' : t === 'vacation' ? 'orange' : t === 'holiday' ? 'red' : 'default'}>{DAY_TYPE_LABEL[t as keyof typeof DAY_TYPE_LABEL] ?? t}</Tag> },
                      { title: '说明', dataIndex: 'name', render: (v: string | null) => v ?? '—' },
                    ]}
                  />
                </CardLike>
              </div>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'points',
      label: '计量点/表计',
      children: (
        <CardLike title={`计量点清单（${buildingPoints.length} 个，点击查看读数与质量）`}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={buildingPoints}
            onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '计量点', dataIndex: 'name' },
              { title: '能源', dataIndex: 'energyType', width: 90, render: (e: EnergyType) => <Tag>{ENERGY_LABEL[e]}</Tag> },
              {
                title: '类型', dataIndex: 'role', width: 80,
                render: (r: string) => r === 'main' ? <Tag color="blue">主表</Tag> : r === 'plantOutput' ? <Tag color="purple">产出</Tag> : <Tag>分表</Tag>,
              },
              { title: '单位', dataIndex: 'unit', width: 60 },
              { title: '量值类型', dataIndex: 'readingType', width: 90, render: (t: string) => t === 'cumulative' ? '累计量' : t },
              { title: 'IoT属性', dataIndex: 'iotPropertyId', width: 130, render: (v: string | null) => v ?? <Tag color="red">未绑定</Tag> },
              {
                title: '本期用量', width: 120, align: 'right' as const,
                render: (_v, p: MeteringPoint) => {
                  const u = scopeUsage(p.energyType, { buildingId: building.id }, from, to);
                  return fmtInt(u.total);
                },
              },
            ]}
          />
        </CardLike>
      ),
    },
    {
      key: 'costs',
      label: '能源费用',
      children: (
        <div>
          <div className="chart-grid c2">
            <ChartCard title="近月电费测算趋势" height={300} note="按分时电价日历测算，仅含电度电费">
              <EnergyBarChart
                x={stats.costTrend.map((r) => r.month)}
                series={[{ name: '测算电费', data: stats.costTrend.map((r) => Math.round(r.amount)), color: ENERGY_COLOR.electricity }]}
                unit="元"
                height={290}
                showLegend={false}
              />
            </ChartCard>
            <CardLike title={`本期费用构成（${from} 至 ${to}）`}>
              <Table
                size="small"
                rowKey="key"
                pagination={false}
                dataSource={[
                  {
                    key: 'elec',
                    name: '电费（分时测算）',
                    amount: (() => {
                      const ids = entities.meteringPoints.filter((p) => p.buildingId === building.id && p.energyType === 'electricity' && p.role === 'main').map((p) => p.id);
                      return availableEnergies.includes('electricity') ? electricityCost(ids, from, to).amount : null;
                    })(),
                    note: '仅含分时电度费，不含基本电费/税费',
                  },
                  { key: 'water', name: '水费', amount: stats.waterCost?.amount ?? null, note: stats.waterCost?.priceNote ?? '' },
                  { key: 'gas', name: '气费', amount: stats.gasCost?.amount ?? null, note: stats.gasCost?.priceNote ?? '' },
                ]}
                columns={[
                  { title: '费用项', dataIndex: 'name' },
                  { title: '金额（元）', dataIndex: 'amount', align: 'right' as const, render: (v: number | null) => v === null ? '不可计算' : fmtInt(Math.round(v)) },
                  { title: '口径说明', dataIndex: 'note' },
                ]}
              />
              <div className="muted small mt8">学院责任分摊费用（共享建筑）见「校园专题 → 学院责任用能」与「能源费用 → 学院成本分摊」。</div>
            </CardLike>
          </div>
        </div>
      ),
    },
    {
      key: 'alarms',
      label: `异常记录（${stats.openAlarms.length}）`,
      children: (
        <CardLike title="本建筑相关告警事件">
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={stats.alarms}
            onRow={(r) => ({ onClick: () => navigate(`/alarms/${r.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: '事件', dataIndex: 'title' },
              { title: '级别', dataIndex: 'severity', width: 80, render: (s: string) => <SeverityTag severity={s} /> },
              { title: '发生时间', dataIndex: 'time', width: 150 },
              { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <AlarmStatusTag status={s} /> },
              { title: '工单', dataIndex: 'workOrderId', width: 130, render: (w: string | null) => w ?? '—' },
            ]}
          />
          {stats.alarms.length === 0 && <div className="muted" style={{ padding: 16 }}>暂无关联告警记录</div>}
        </CardLike>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumb={['能源监测', `${building.name}`]}
        title={building.name}
        subtitle={
          <Space size={8} wrap>
            <span>{campus?.name} · {CATEGORY_LABEL[building.category]} · 考核面积 {fmtInt(building.assessmentArea)} m² · 责任单位 {dept?.name ?? '—'}</span>
            <span className="muted">统计区间：{from} 至 {to}；数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        info={<Tooltip title="单位面积电耗＝建筑主表电量÷考核面积；面积为0时不可计算"><span className="muted small">口径说明</span></Tooltip>}
        extra={<Button size="small" icon={<ArrowLeftOutlined />} onClick={backNav}>返回</Button>}
      />
      <Descriptions
        size="small"
        bordered
        column={4}
        className="mb12"
        items={[
          { key: 'code', label: '建筑编码', children: building.code },
          { key: 'dept', label: '责任部门', children: dept?.name ?? '—' },
          { key: 'manager', label: '部门负责人', children: dept?.manager ?? '—' },
          { key: 'hours', label: '开放时间', children: openHours ? `${openHours.start}-${openHours.end}（考试周至${openHours.examExtension}）` : building.category === 'lab' || building.category === 'datacenter' ? '24小时运行' : '—' },
          { key: 'cool', label: '供冷方式', children: building.hasCentralCooling ? '能源站集中供冷' : building.coolingMode === 'multi-split' ? '分体/VRV空调' : building.coolingMode === 'central' ? '楼内中央空调' : '—' },
          { key: 'heat', label: '供热方式', children: building.heatingMode === 'central' ? '能源站集中供热' : building.heatingMode === 'multi-split' ? '分体/VRV热泵' : '—' },
          { key: 'hw', label: '生活热水', children: building.hasHotWater ? building.hotWaterMode ?? '有' : '无' },
          { key: 'metering', label: '计量点数', children: `${buildingPoints.length} 个（主表 ${buildingPoints.filter((p) => p.role === 'main').length}，分表 ${buildingPoints.filter((p) => p.role === 'submeter').length}）` },
        ]}
      />

      <div className="kpi-row">
        <StatCard
          label="本期用电量"
          value={stats.elec.total}
          unit="kWh"
          trend={pctChange(stats.elec.total, stats.elecPrev.total)}
          trendLabel="上周同期"
          qualityNote={stats.elec.incomplete ? '存在缺失/无效样本' : undefined}
        />
        <StatCard label="本期用水量" value={stats.water.total} unit="m³" qualityNote={stats.water.incomplete ? '存在缺失/无效样本' : undefined} />
        {availableEnergies.includes('gas') && <StatCard label="本期用气量" value={stats.gas.total} unit="m³" qualityNote={stats.gas.incomplete ? '存在离线缺数' : undefined} />}
        {availableEnergies.includes('cooling') && <StatCard label="本期供冷量" value={stats.cooling.total} unit="kWh" sub="能源站供给，末端计量" />}
        {availableEnergies.includes('heat') && <StatCard label="本期供热量" value={stats.heat.total} unit="kWh" sub="供暖季数据" />}
        {availableEnergies.includes('hotWater') && <StatCard label="本期生活热水" value={stats.hotWater.total} unit="kWh" sub={building.hotWaterMode} />}
        <StatCard
          label="单位面积电耗"
          value={selfIntensity === null ? '不可计算' : Math.round(selfIntensity * 1000) / 1000}
          unit={selfIntensity === null ? undefined : 'kWh/m²'}
          sub={`同类建筑第 ${peerRank}/${stats.peerIntensity.length} 位`}
        />
        <StatCard label="未关闭异常" value={stats.openAlarms.length} unit="件" onClick={() => setActiveTab('alarms')} />
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}

function CardLike({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="table-card mb12" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
      <h4 className="section-title">{title}</h4>
      {children}
    </div>
  );
}