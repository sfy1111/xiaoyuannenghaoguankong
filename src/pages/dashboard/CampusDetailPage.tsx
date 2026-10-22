import { useMemo } from 'react';
import { Card, Descriptions, Space, Table, Tag } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import RangeModeControl from '../../components/RangeModeControl';
import { ChartCard, EnergyLineChart, EnergyPieChart } from '../../components/charts';
import { IncompleteNote, AlarmStatusTag } from '../../components/StatusTags';
import { useFilters, currentRange, DATA_END } from '../../stores/filters';
import { campusAllowedByUser } from '../../stores/identity';
import { getEntities, studentsOfMonth, META } from '../../services/repository';
import { scopeUsage, scopeDaily, campusBalance, boundaryNote } from '../../services/energyStats';
import { pctChange } from '../../domain/analysis';
import { CATEGORY_LABEL, ENERGY_COLOR, fmtInt } from '../../domain/units';
import { lastNDays, monthOf, shiftDay } from '../../domain/time';

export default function CampusDetailPage() {
  const { campusId } = useParams<{ campusId: string }>();
  const navigate = useNavigate();
  const { dateMode, date } = useFilters();
  const entities = getEntities();
  const range = useMemo(() => currentRange(dateMode, date), [dateMode, date]);
  const campus = entities.campuses.find((c) => c.id === campusId);

  const allowed = campusId ? campusAllowedByUser(campusId) : false;
  const data = useMemo(() => {
    if (!campusId || !allowed) return null;
    const cid = campusId;
    const elec = scopeUsage('electricity', { campusId: cid }, range.from, range.to);
    const water = scopeUsage('water', { campusId: cid }, range.from, range.to);
    const gas = scopeUsage('gas', { campusId: cid }, range.from, range.to);
    const cooling = scopeUsage('cooling', { campusId: cid }, range.from, range.to);
    const heat = scopeUsage('heat', { campusId: cid }, range.from, range.to);
    const hotWater = scopeUsage('hotWater', { campusId: cid }, range.from, range.to);

    const baseRange = dateMode === 'day'
      ? { from: shiftDay(range.from, -7), to: shiftDay(range.to, -7) }
      : dateMode === 'month'
        ? (() => {
            const prev = dayjs(range.from).subtract(1, 'month');
            return { from: prev.format('YYYY-MM-DD'), to: prev.endOf('month').format('YYYY-MM-DD') };
          })()
        : null;
    const elecBase = baseRange ? scopeUsage('electricity', { campusId: cid }, baseRange.from, baseRange.to) : null;

    const days30 = lastNDays(DATA_END, 30);
    const elecDaily = scopeDaily('electricity', { campusId: cid }, days30[0], days30[29]);
    const buildings = entities.buildings.filter((b) => b.status === 'active' && b.campusId === cid);
    const buildingRows = buildings.map((b) => {
      const e = scopeUsage('electricity', { buildingId: b.id }, range.from, range.to);
      const w = scopeUsage('water', { buildingId: b.id }, range.from, range.to);
      return {
        id: b.id,
        name: b.name,
        category: b.category,
        area: b.assessmentArea,
        elec: e.total ?? 0,
        water: w.total ?? 0,
        coverage: e.coverage,
        incomplete: e.incomplete || w.incomplete,
        hasMissing: e.hasMissing || w.hasMissing,
        hasEstimated: e.hasEstimated || w.hasEstimated,
        hasInvalid: e.hasInvalid || w.hasInvalid,
        hasManual: e.hasManualCorrected || w.hasManualCorrected,
      };
    }).sort((a, b) => b.elec - a.elec);

    const elecBalance = campusBalance(cid, 'electricity', range.from, range.to);
    const waterBalance = campusBalance(cid, 'water', range.from, range.to);
    const alarms = entities.alarms.filter((a) => a.campusId === cid && a.status !== 'closed');
    const month = monthOf(range.from);
    const students = studentsOfMonth(month);
    const campusStudents = cid === 'C-E' ? students?.east ?? null : students?.west ?? null;
    return { elec, water, gas, cooling, heat, hotWater, elecBase, elecDaily, buildingRows, elecBalance, waterBalance, alarms, campusStudents };
  }, [campusId, range, dateMode, entities, allowed]);

  if (!campusId || !campus) {
    return <PageHeader breadcrumb={['综合驾驶舱', '校区总览']} title="校区不存在" subtitle="请从菜单重新进入" />;
  }
  if (!allowed) {
    return <PageHeader breadcrumb={['综合驾驶舱', '校区总览']} title="无该校区访问权限" subtitle="当前角色视角未授权该校区，可在右上角切换角色。" />;
  }
  if (!data) return null;

  const categoryArea = entities.buildings
    .filter((b) => b.status === 'active' && b.campusId === campusId)
    .reduce((m, b) => ({ ...m, [b.category]: (m[b.category] ?? 0) + b.assessmentArea }), {} as Record<string, number>);

  return (
    <div>
      <PageHeader
        breadcrumb={['综合驾驶舱', `${campus.name}总览`]}
        title={`${campus.name}总览`}
        subtitle={
          <Space size={8} wrap>
            <span>{range.label}{range.partialNote ? `（${range.partialNote}）` : ''}</span>
            <span className="muted">电力口径：{boundaryNote('electricity', { campusId })}</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={<RangeModeControl />}
      />
      <Descriptions
        size="small"
        bordered
        column={4}
        className="mb12"
        items={[
          { key: '1', label: '校区面积', children: `${fmtInt(campus.area)} m²` },
          { key: '2', label: '建筑数量', children: `${entities.buildings.filter((b) => b.status === 'active' && b.campusId === campusId).length} 栋` },
          { key: '3', label: '教学面积', children: `${fmtInt(campus.teachingArea)} m²` },
          { key: '4', label: '统计学生数', children: data.campusStudents ? `${fmtInt(data.campusStudents)} 人（${monthOf(range.from)}月注册口径）` : '缺少当月人数数据' },
        ]}
      />

      <div className="kpi-row">
        <StatCard label="本期用电量" value={data.elec.total} unit="kWh" trend={pctChange(data.elec.total, data.elecBase?.total ?? null)} trendLabel={dateMode === 'day' ? '上周同期' : '上月'} qualityNote={data.elec.incomplete ? '存在样本缺失/无效' : undefined} onClick={() => navigate('/monitor/electricity')} />
        <StatCard label="本期用水量" value={data.water.total} unit="m³" qualityNote={data.water.incomplete ? '存在样本缺失/无效' : undefined} onClick={() => navigate('/monitor/water')} />
        <StatCard label="本期天然气" value={data.gas.total} unit="m³" qualityNote={data.gas.incomplete ? '燃气表离线时段未计入' : undefined} onClick={() => navigate('/monitor/gas')} />
        <StatCard
          label="本期供冷量" value={data.cooling.total}
          unit="kWh"
          sub={data.cooling.total === null ? <span className="muted">该校区无集中供冷接入</span> : '能源站产出侧口径，与输入电耗分开统计'}
          onClick={() => navigate('/monitor/thermal')}
        />
        <StatCard
          label="本期供热量" value={data.heat.total}
          unit="kWh"
          sub={data.heat.total === null ? <span className="muted">该校区无集中供热接入</span> : '供暖季数据（11月-次年3月）'}
          onClick={() => navigate('/monitor/thermal')}
        />
        <StatCard label="本期生活热水" value={data.hotWater.total} unit="kWh" sub="热泵/集中热水计量口径" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="近30日本校区用电趋势" height={300} note="与全校驾驶舱同口径">
          <EnergyLineChart
            x={data.elecDaily.map((r) => r.date.slice(5))}
            series={[{ name: '日用电量', data: data.elecDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard
          title="计量覆盖与能源平衡"
          height={300}
          note="差额为未分项/计量差额，未经证实不解释为线路损耗"
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <div>
              <b>电力：</b>购入 {fmtInt(data.elecBalance.boundary.total)} kWh，已确认建筑与公共设施 {fmtInt(data.elecBalance.coveredTotal)} kWh，
              未分项差额 {fmtInt(data.elecBalance.uncovered)} kWh（{data.elecBalance.uncoveredPct?.toFixed(1) ?? '—'}%）
            </div>
            <div>
              <b>用水：</b>购入 {fmtInt(data.waterBalance.boundary.total)} m³，已覆盖 {fmtInt(data.waterBalance.coveredTotal)} m³，
              差额 {fmtInt(data.waterBalance.uncovered)} m³（{data.waterBalance.uncoveredPct?.toFixed(1) ?? '—'}%）
            </div>
            <div className="muted small">点击各建筑行查看分项与计量点明细，或前往能源平衡页查看流向。</div>
            <a onClick={() => navigate('/analysis/balance')}>进入能源平衡分析</a>
          </Space>
        </ChartCard>
      </div>

      <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>校区建筑用能明细（{range.label}）</span>} styles={{ body: { padding: '4px 8px' } }} className="table-card mb12">
        <Table
          size="small"
          rowKey="id"
          pagination={{ pageSize: 10 }}
          dataSource={data.buildingRows}
          onRow={(r) => ({
            onClick: () => navigate(`/monitor/building/${r.id}?from=${range.from}&to=${range.to}&campus=${campusId}`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: '建筑名称', dataIndex: 'name' },
            { title: '类别', dataIndex: 'category', width: 100, render: (c: string) => CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] },
            { title: '考核面积(m²)', dataIndex: 'area', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '用电量(kWh)', dataIndex: 'elec', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '用水量(m³)', dataIndex: 'water', width: 100, align: 'right' as const, render: (v: number) => fmtInt(v) },
            { title: '单位面积电耗(kWh/m²)', width: 140, align: 'right' as const, render: (_v, r) => r.area > 0 ? (r.elec / r.area).toFixed(2) : '不可计算' },
            { title: '数据质量', width: 100, render: (_v, r) => <IncompleteNote hasMissing={r.hasMissing} hasEstimated={r.hasEstimated} hasInvalid={r.hasInvalid} hasManual={r.hasManual} /> },
          ]}
        />
      </Card>

      <div className="chart-grid c2">
        <ChartCard title="本校区建筑类型面积构成（m²）" height={280}>
          <EnergyPieChart
            data={Object.entries(categoryArea).map(([c, v], i) => ({
              name: CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL] ?? c,
              value: Math.round(v),
              color: ['#1668dc', '#13c2c2', '#722ed1', '#fa8c16', '#f5222d', '#faad14', '#52c41a', '#2f54eb', '#eb2f96', '#a0d911'][i % 10],
            }))}
            unit="m²"
            height={270}
          />
        </ChartCard>
        <Card size="small" title={<span style={{ fontSize: 14, fontWeight: 600 }}>本校区未关闭告警（{data.alarms.length}）</span>} styles={{ body: { padding: '4px 12px' } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.alarms}
            onRow={(r) => ({ onClick: () => navigate(`/alarms/${r.id}`), style: { cursor: 'pointer' } })}
            columns={[
              { title: '事件', dataIndex: 'title' },
              { title: '建筑', width: 130, render: (_v, r) => entities.buildings.find((b) => b.id === r.buildingId)?.name ?? '—' },
              { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <AlarmStatusTag status={s} /> },
            ]}
          />
          {data.alarms.length === 0 && <div className="muted" style={{ padding: 12 }}>当前无未关闭告警 <Tag color="green">正常</Tag></div>}
        </Card>
      </div>
    </div>
  );
}