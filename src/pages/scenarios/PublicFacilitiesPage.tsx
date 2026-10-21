import { useMemo, useState } from 'react';
import { DatePicker, Space, Table, Tag } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyLineChart, EnergyBarChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { userScope } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage, dailyRows, hourRangeOf, aggregateHours } from '../../services/energyStats';
import { ENERGY_COLOR, ENERGY_UNIT, fmtInt } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import { resolveDay } from '../../domain/calendar';

export default function ScenarioPublicPage() {
  const { campusId } = useFilters();
  const [anchor, setAnchor] = useState('2026-10-20');
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);

  const data = useMemo(() => {
    const cid = scope.campusId === 'all' ? 'C-E' : scope.campusId;
    const days30 = lastNDays(anchor, 30);
    const lighting = entities.meteringPoints.filter((p) => p.energyType === 'electricity' && p.role === 'public' && p.campusId === cid);
    const green = entities.meteringPoints.filter((p) => p.energyType === 'water' && p.role === 'public' && p.campusId === cid);

    const lightingDaily = lighting.length ? dailyRows(lighting.map((p) => p.id), days30[0], anchor) : [];
    const greenDaily = green.length ? dailyRows(green.map((p) => p.id), days30[0], anchor) : [];

    const nightLights = (() => {
      const { fromH, toH } = hourRangeOf(anchor, anchor);
      const nightUse = lighting.length ? aggregateHours(lighting.map((p) => p.id), fromH + 0, fromH + 5).total ?? 0 : 0;
      const dayUse = lighting.length ? aggregateHours(lighting.map((p) => p.id), fromH + 6, fromH + 17).total ?? 0 : 0;
      return { nightUse, dayUse };
    })();

    const longOnClues = lightingDaily.filter((r) => {
      const t = resolveDay(r.date, entities.calendar).dayType;
      return t === 'teaching' && r.total > 110;
    }).length;

    const irrigationAnomaly = greenDaily.filter((r) => {
      const t = resolveDay(r.date, entities.calendar).dayType;
      return (t === 'vacation' || t === 'holiday') && r.total > 45;
    });

    return { lighting, green, lightingDaily, greenDaily, nightLights, longOnClues, irrigationAnomaly, cid };
  }, [anchor, scope, entities]);

  const exportSheet = {
    name: '公共设施用能',
    headers: ['日期', '道路照明用电(kWh)', '绿化用水(m³)', '日类型'],
    rows: data.lightingDaily.map((r, i) => [
      r.date, Math.round(r.total), Math.round(data.greenDaily[i]?.total ?? 0), resolveDay(r.date, entities.calendar).dayType,
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['校园专题', '公共设施与照明']}
        title="公共设施与校园照明"
        subtitle={
          <Space size={8} wrap>
            <span>道路照明、绿化灌溉等公共区域能耗与控制责任信息；本页仅提供数据监测与管理建议，不执行远程控制</span>
            <span className="muted">统计期：近30日（至 {anchor}）· {entities.campuses.find((c) => c.id === data.cid)?.name}</span>
          </Space>
        }
        extra={<ExportButton filename="公共设施用能" sheet={exportSheet} metaNote="公共设施计量点口径：道路照明回路与绿化灌溉水表" />}
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">截止</span>
        <DatePicker size="small" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">日落与夜间时段用电为照明主要负荷；路灯异常长亮仅作线索提示</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="近30日道路照明用电" value={data.lightingDaily.reduce((a, r) => a + r.total, 0)} unit="kWh" sub={`${data.lighting.length} 个照明回路`} />
        <StatCard label="近30日绿化灌溉用水" value={data.greenDaily.reduce((a, r) => a + r.total, 0)} unit="m³" sub={`${data.green.length} 个灌溉水表`} />
        <StatCard
          label="白天时段照明用电（监测日）"
          value={Math.round(data.nightLights.dayUse)}
          unit="kWh"
          sub="06:00-18:00 用电；偏高提示核查开关灯计划"
          qualityNote={data.nightLights.dayUse > 12 ? '白天照明用电偏高，建议核查时控计划' : undefined}
        />
        <StatCard label="疑似长亮天数" value={data.longOnClues} unit="天" sub="教学日照明日用电超过110 kWh的天数（线索，非结论）" />
      </div>

      <div className="chart-grid c2">
        <ChartCard title="道路照明用电趋势（近30日）" height={300} note="夜间负荷集中于18-23时；曲线反映照明时控计划">
          <EnergyLineChart
            x={data.lightingDaily.map((r) => r.date.slice(5))}
            series={[{ name: '照明日用电', data: data.lightingDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.electricity, area: true }]}
            unit="kWh"
            height={290}
            showLegend={false}
          />
        </ChartCard>
        <ChartCard title="绿化灌溉用水（近30日）" height={300} note="早晚灌溉时段用水集中；假期灌溉异常将列入线索">
          <EnergyBarChart
            x={data.greenDaily.map((r) => r.date.slice(5))}
            series={[{ name: '灌溉日用水', data: data.greenDaily.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: ENERGY_COLOR.water }]}
            unit="m³"
            height={290}
            showLegend={false}
          />
        </ChartCard>
      </div>

      <div className="table-card">
        <h4 className="section-title">公共设施计量点与控制责任</h4>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={[...data.lighting, ...data.green]}
          columns={[
            { title: '计量点', dataIndex: 'name' },
            { title: '能源', dataIndex: 'energyType', width: 80, render: (e: string) => <Tag>{e === 'electricity' ? '电' : '水'}</Tag> },
            {
              title: '设施类型', width: 100,
              render: (_v, p) => p.energyType === 'electricity' ? '道路照明回路' : '绿化灌溉',
            },
            {
              title: `近30日用量`, width: 130, align: 'right' as const,
              render: (_v, p) => {
                const rows = dailyRows([p.id], lastNDays(anchor, 30)[0], anchor);
                return `${fmtInt(Math.round(rows.reduce((a, r) => a + r.total, 0)))} ${ENERGY_UNIT[p.energyType]}`;
              },
            },
            { title: '控制责任', render: () => '后勤保障处能源管理办公室（时控计划由物业运维执行）' },
            { title: '远程控制', width: 90, render: () => <Tag color="default">不支持（仅监测建议）</Tag> },
          ]}
        />
        <div className="muted small mt8">
          {data.irrigationAnomaly.length > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Tag color="orange">线索</Tag>
              假期/假日灌溉用水偏高的日期：{data.irrigationAnomaly.slice(-3).map((r) => r.date).join('、')}，建议核查灌溉时控与雨感设置。
            </div>
          )}
          泵房、广场、停车设施等未单独计量的公共区域纳入校区“未分项差额”，见能源平衡页；建议按需增设计量点（可在能源平衡页发起补计量建议单）。
        </div>
      </div>
    </div>
  );
}