import { useMemo, useState } from 'react';
import { Button, Segmented, Space } from 'antd';
import { ArrowLeftOutlined, FullscreenOutlined, FullscreenExitOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactECharts from 'echarts-for-react';
import dayjs from 'dayjs';
import type { EChartsOption } from 'echarts';
import RangeModeControl from '../../components/RangeModeControl';
import { getEntities, META } from '../../services/repository';
import { scopeDaily, scopeUsage, latestPowerKw, aggregateHours, hourRangeOf, trendSeriesForMode, trendXLabel } from '../../services/energyStats';
import { electricityTouDaily } from '../../services/costService';
import { nightFlowRows } from '../../services/energyStats';
import { useFilters, DATA_END, currentRange, syncFiltersToUrl } from '../../stores/filters';
import { useNavigation } from '../../stores/navigation';
import { userScope } from '../../stores/identity';
import { ENERGY_LABEL } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import { fmtInt } from '../../domain/units';
import type { EnergyType } from '../../domain/types';

const PALETTE = {
  electricity: '#69c0ff', water: '#5cdbd3', gas: '#ffc069', thermal: '#b37feb', text: '#cfdeee', axis: 'rgba(207,222,238,0.55)', split: 'rgba(105,192,255,0.15)',
};

function screenOption(option: EChartsOption): EChartsOption {
  return {
    textStyle: { color: PALETTE.text },
    ...option,
  };
}

const axisCommon = {
  axisLabel: { color: PALETTE.axis, fontSize: 11 },
  axisLine: { lineStyle: { color: 'rgba(105,192,255,0.35)' } },
  splitLine: { lineStyle: { color: PALETTE.split } },
};

export default function EnergyScreenPage() {
  const navigate = useNavigate();
  const { campusId, dateMode, date } = useFilters();
  const [tab, setTab] = useState<'electricity' | 'water' | 'gas' | 'thermal'>('electricity');
  const [fullscreen, setFullscreen] = useState(false);
  const entities = getEntities();
  const scope = useMemo(() => userScope(campusId), [campusId]);
  const range = useMemo(() => currentRange(dateMode, date), [dateMode, date]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
      setFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setFullscreen(false);
    }
  };

  const days30 = lastNDays(DATA_END, 30);

  const kpis = useMemo(() => {
    if (tab === 'thermal') {
      const cooling = scopeUsage('cooling', scope, range.from, range.to);
      const heat = scopeUsage('heat', scope, range.from, range.to);
      const hotWater = scopeUsage('hotWater', scope, range.from, range.to);
      return [
        { label: `本期供冷量（kWh）`, value: fmtInt(cooling.total), note: '能源站产出侧' },
        { label: '本期供热量（kWh）', value: fmtInt(heat.total), note: '供暖季（11月-次年3月）' },
        { label: '本期生活热水（kWh）', value: fmtInt(hotWater.total), note: '热泵/集中热水' },
        { label: '待处理异常（件）', value: entities.alarms.filter((a) => a.status !== 'closed').length, note: '告警中心联动' },
      ];
    }
    const energy = tab as EnergyType;
    const usage = scopeUsage(energy, scope, range.from, range.to);
    const power = energy === 'electricity' ? latestPowerKw(entities.meteringPoints.filter((p) => p.energyType === 'electricity' && (p.role === 'main') && (campusId === 'all' || p.campusId === campusId)).map((p) => p.id)) : null;
    const night = energy === 'water' ? nightFlowRows('P-D1-W', days30[0], days30[29]) : null;
    return [
      { label: `本期${ENERGY_LABEL[energy]}总量`, value: usage.total === null ? '—' : fmtInt(usage.total), unit: energy === 'electricity' ? 'kWh' : 'm³', note: range.partialNote ?? '与后台同口径' },
      ...(power ? [{ label: '当前总功率（kW）', value: fmtInt(power.kW), note: `最近采样 ${dayjs(power.ts).format('HH:mm')}` }] : []),
      ...(night ? [{ label: '夜间最小流量（m³/h）', value: night.length ? (night[night.length - 1].minFlow ?? '—') : '—', note: '兰园1号公寓（02-05时）' }] : []),
      {
        label: '数据覆盖率',
        value: `${(usage.coverage * 100).toFixed(1)}%`,
        note: usage.incomplete ? '存在缺失/无效样本，如实提示' : '样本完整',
      },
    ];
  }, [tab, scope, range, entities, campusId, days30]);

  const trend = useMemo(() => {
    if (tab === 'thermal') {
      const cooling = trendSeriesForMode('cooling', scope, dateMode, date);
      const heat = trendSeriesForMode('heat', scope, dateMode, date);
      return {
        x: cooling.rows.map((r) => trendXLabel(r.date)),
        series: [
          { name: '供冷量', data: cooling.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: PALETTE.thermal },
          { name: '供热量', data: heat.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: '#ff7875' },
        ],
        unit: 'kWh',
        windowLabel: cooling.windowLabel,
        note: cooling.note,
      };
    }
    const energy = tab as EnergyType;
    const rows = trendSeriesForMode(energy, scope, dateMode, date);
    return {
      x: rows.rows.map((r) => trendXLabel(r.date)),
      series: [{ name: `${ENERGY_LABEL[energy]}量`, data: rows.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)), color: tab === 'electricity' ? PALETTE.electricity : tab === 'water' ? PALETTE.water : PALETTE.gas }],
      unit: energy === 'electricity' ? 'kWh' : 'm³',
      windowLabel: rows.windowLabel,
      note: rows.note,
    };
  }, [tab, scope, dateMode, date]);

  const rank = useMemo(() => {
    if (tab === 'thermal') {
      const buildings = ['B-TD', 'B-LE', 'B-D3'].map((bid) => {
        const b = entities.buildings.find((x) => x.id === bid)!;
        const u = scopeUsage('cooling', { buildingId: bid }, range.from, range.to);
        return { name: b.name, value: u.total ?? 0 };
      }).sort((a, b) => b.value - a.value);
      return { title: '建筑供冷排行（西校区）', items: buildings };
    }
    const energy = tab as EnergyType;
    const rows = entities.buildings
      .filter((b) => b.status === 'active' && (campusId === 'all' || b.campusId === campusId) && (!scope.buildingIds || scope.buildingIds.includes(b.id)))
      .map((b) => {
        const u = scopeUsage(energy, { buildingId: b.id }, range.from, range.to);
        return { name: b.name, value: u.total ?? 0 };
      })
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return { title: `建筑${ENERGY_LABEL[energy]}排行（${range.label}）`, items: rows };
  }, [tab, scope, range, entities, campusId]);

  const structure = useMemo(() => {
    if (tab === 'electricity') {
      const tou = electricityTouDaily(entities.meteringPoints.filter((p) => p.energyType === 'electricity' && p.role === 'main' && !p.buildingId && (campusId === 'all' || p.campusId === campusId)).map((p) => p.id), days30[0], days30[29]);
      const names = ['尖峰', '高峰', '平段', '低谷'];
      const colors = ['#d4380d', '#fa8c16', '#1668dc', '#13c2c2'];
      return {
        title: '近30日峰平谷用电结构',
        data: names.map((n, i) => ({ name: n, value: Math.round(tou.reduce((a, r) => a + (r.segments[n] ?? 0), 0)), itemStyle: { color: colors[i] } })),
      };
    }
    if (tab === 'water') {
      const dorms = entities.buildings.filter((b) => b.category === 'dormitory');
      const others = entities.buildings.filter((b) => b.category !== 'dormitory' && b.category !== 'plant');
      const dormTotal = dorms.reduce((a, b) => a + (scopeUsage('water', { buildingId: b.id }, range.from, range.to).total ?? 0), 0);
      const otherTotal = others.reduce((a, b) => a + (scopeUsage('water', { buildingId: b.id }, range.from, range.to).total ?? 0), 0);
      const greenIds = entities.meteringPoints.filter((p) => p.energyType === 'water' && p.role === 'public' && (campusId === 'all' || p.campusId === campusId)).map((p) => p.id);
      const { fromH, toH } = hourRangeOf(range.from, range.to);
      const greenTotal = greenIds.length ? (aggregateHours(greenIds, fromH, toH).total ?? 0) : 0;
      return {
        title: '用水结构（监测区间）',
        data: [
          { name: '学生宿舍', value: Math.round(dormTotal), itemStyle: { color: '#5cdbd3' } },
          { name: '教学科研等', value: Math.round(otherTotal), itemStyle: { color: '#69c0ff' } },
          { name: '绿化等公共', value: Math.round(greenTotal), itemStyle: { color: '#95de64' } },
        ],
      };
    }
    if (tab === 'gas') {
      const c1 = scopeUsage('gas', { buildingId: 'B-C1' }, range.from, range.to).total ?? 0;
      const c2 = scopeUsage('gas', { buildingId: 'B-C2' }, range.from, range.to).total ?? 0;
      const ep = scopeUsage('gas', { buildingId: 'B-EP' }, range.from, range.to).total ?? 0;
      return {
        title: '用气结构（监测区间）',
        data: [
          { name: '第一食堂', value: Math.round(c1), itemStyle: { color: '#ffc069' } },
          { name: '第二食堂', value: Math.round(c2), itemStyle: { color: '#ffa940' } },
          { name: '能源站锅炉', value: Math.round(ep), itemStyle: { color: '#ff9c6e' } },
        ],
      };
    }
    const out = scopeUsage('cooling', { campusId: 'C-W' }, range.from, range.to).total ?? 0;
    const covered = ['B-TD', 'B-LE', 'B-D3'].reduce((a, bid) => a + (scopeUsage('cooling', { buildingId: bid }, range.from, range.to).total ?? 0), 0);
    return {
      title: '供冷计量覆盖（西校区）',
      data: [
        { name: '建筑侧已计量', value: Math.round(covered), itemStyle: { color: '#b37feb' } },
        { name: '管网计量差额', value: Math.max(0, Math.round(out - covered)), itemStyle: { color: '#9254de' } },
      ],
    };
  }, [tab, range, entities, campusId, scope, days30]);

  const alarmsTicker = entities.alarms.filter((a) => a.status !== 'closed').slice(0, 4);

  const color = tab === 'electricity' ? PALETTE.electricity : tab === 'water' ? PALETTE.water : tab === 'gas' ? PALETTE.gas : PALETTE.thermal;

  return (
    <div className="screen-layout">
      <div className="screen-header">
        <Space size={16}>
          <Button type="text" icon={<ArrowLeftOutlined />} style={{ color: '#cfdeee' }} onClick={() => { useNavigation.getState().markMenuJump(); navigate('/dashboard/campus'); }}>
            返回管理端
          </Button>
          <Segmented
            size="small"
            value={campusId}
            options={[
              { value: 'all', label: '全部校区' },
              { value: 'C-E', label: '东校区' },
              { value: 'C-W', label: '西校区' },
            ]}
            onChange={(v) => {
              useFilters.getState().setCampus(v as 'all' | string);
              syncFiltersToUrl();
            }}
          />
        </Space>
        <div className="screen-title">能源专题驾驶舱</div>
        <Space size={12}>
          <RangeModeControl showLabel={false} />
          <span style={{ color: '#7fa8cf' }}>数据更新 {dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          <Button
            type="text"
            style={{ color: '#cfdeee' }}
            icon={fullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
            onClick={toggleFullscreen}
          >
            {fullscreen ? '退出全屏' : '全屏'}
          </Button>
        </Space>
      </div>

      <div className="screen-body">
        <Segmented
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: 'electricity', label: '电力' },
            { value: 'water', label: '用水' },
            { value: 'gas', label: '天然气' },
            { value: 'thermal', label: '冷/热/热水' },
          ]}
          style={{ alignSelf: 'center', background: 'rgba(20,44,78,0.9)' }}
        />
        <div className="screen-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="screen-card">
              <div className="sk-label">{k.label}</div>
              <div className="sk-value">{typeof k.value === 'number' ? fmtInt(k.value) : k.value}{'unit' in k && k.unit ? <span style={{ fontSize: 15, marginLeft: 4 }}>{k.unit}</span> : null}</div>
              <div style={{ color: '#7fa8cf', fontSize: 12 }}>{k.note}</div>
            </div>
          ))}
        </div>

        <div className="screen-charts" style={{ flex: 1 }}>
          <div className="screen-card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="screen-card-title">{trend.windowLabel}{tab === 'thermal' ? '冷热量' : ENERGY_LABEL[tab as EnergyType]}趋势{trend.note ? `（${trend.note}）` : ''}</div>
            <ReactECharts
              style={{ flex: 1, minHeight: 240 }}
              notMerge
              option={screenOption({
                grid: { left: 64, right: 24, top: 54, bottom: 30 },
                tooltip: { trigger: 'axis' },
                legend: { top: 4, textStyle: { color: PALETTE.text } },
                xAxis: { type: 'category', data: trend.x, ...axisCommon },
                yAxis: { type: 'value', name: trend.unit, nameGap: 14, nameTextStyle: { color: PALETTE.axis, fontSize: 11 }, ...axisCommon },
                series: trend.series.map((s) => ({
                  name: s.name,
                  type: 'line',
                  smooth: 0.3,
                  data: s.data,
                  itemStyle: { color: s.color },
                  lineStyle: { color: s.color, width: 2 },
                  areaStyle: { color: s.color, opacity: 0.12 },
                  connectNulls: false,
                })),
              })}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <div className="screen-card">
              <div className="screen-card-title">{rank.title}</div>
              <ReactECharts
                style={{ height: 260 }}
                notMerge
                option={screenOption({
                  grid: { left: 110, right: 30, top: 10, bottom: 24 },
                  tooltip: { trigger: 'axis' },
                  xAxis: { type: 'value', ...axisCommon },
                  yAxis: { type: 'category', data: [...rank.items].reverse().map((r) => r.name.length > 8 ? r.name.slice(0, 8) + '…' : r.name), ...axisCommon },
                  series: [{
                    type: 'bar',
                    data: [...rank.items].reverse().map((r) => Math.round(r.value)),
                    itemStyle: { color },
                    barMaxWidth: 16,
                  }],
                })}
              />
            </div>
            <div className="screen-card">
              <div className="screen-card-title">{structure.title}</div>
              <ReactECharts
                style={{ height: 240 }}
                notMerge
                option={screenOption({
                  tooltip: { trigger: 'item' },
                  series: [{
                    type: 'pie',
                    radius: ['40%', '68%'],
                    center: ['50%', '50%'],
                    data: structure.data.filter((d) => d.value > 0),
                    label: { color: PALETTE.text, formatter: '{b}\n{d}%', fontSize: 11 },
                  }],
                })}
              />
            </div>
          </div>
        </div>

        <div className="screen-card" style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <span className="sk-label">异常事件</span>
          <div style={{ display: 'flex', gap: 32, overflow: 'hidden', flexWrap: 'wrap' }}>
            {alarmsTicker.map((a) => (
              <span key={a.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/alarms/${a.id}`)}>
                <span style={{ color: a.severity === 'major' ? '#ff9c6e' : '#ffd666' }}>●</span>{' '}
                {a.title}（{a.status === 'pending' ? '待确认' : a.status === 'processing' ? '处理中' : '待复核'}）
              </span>
            ))}
            {alarmsTicker.length === 0 && <span style={{ color: '#7fa8cf' }}>当前无未关闭异常事件</span>}
          </div>
        </div>
      </div>
    </div>
  );
}