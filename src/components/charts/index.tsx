import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { ReactNode } from 'react';
import { Card, Empty } from 'antd';
import { ENERGY_COLOR } from '../../domain/units';

export interface ChartSeries {
  name: string;
  data: (number | null)[];
  color?: string;
  type?: 'line' | 'bar';
  stack?: string;
  area?: boolean;
  dashed?: boolean;
}

interface BaseProps {
  x: string[];
  series: ChartSeries[];
  unit?: string;
  height?: number;
  showLegend?: boolean;
  onEvent?: (params: { name: string; seriesName?: string; dataIndex: number }) => void;
}

const AXIS_STYLE = {
  axisLabel: { color: 'rgba(0,0,0,0.55)', fontSize: 11 },
  axisLine: { lineStyle: { color: 'rgba(0,0,0,0.18)' } },
};

function tooltipFormatter(params: unknown, unit?: string): string {
  const list = params as { name: string; marker: string; seriesName: string; value: number | null | '-' }[];
  if (!Array.isArray(list)) return '';
  const rows = list.map((p) => {
    const v = p.value === null || p.value === undefined || p.value === '-' ? '缺失' : `${Number(p.value).toLocaleString('zh-CN')} ${unit ?? ''}`;
    return `${p.marker}${p.seriesName}：${v}`;
  });
  return [list[0]?.name ?? '', ...rows].join('<br/>');
}

export function hasAnyData(series: ChartSeries[]): boolean {
  return series.some((s) => s.data.some((v) => v !== null && v !== undefined));
}

export function EnergyLineChart({ x, series, unit, height = 300, showLegend = true, onEvent }: BaseProps) {
  if (!hasAnyData(series)) return <Empty description="暂无有效数据" style={{ padding: 32 }} />;
  const option: EChartsOption = {
    color: series.map((s) => s.color ?? ENERGY_COLOR.electricity),
    grid: { left: 56, right: 24, top: showLegend ? 40 : 24, bottom: 30 },
    tooltip: { trigger: 'axis', valueFormatter: undefined, formatter: (p) => tooltipFormatter(p, unit) },
    legend: showLegend ? { top: 4, textStyle: { fontSize: 12 } } : undefined,
    xAxis: { type: 'category', data: x, ...AXIS_STYLE, boundaryGap: false },
    yAxis: { type: 'value', name: unit, nameTextStyle: { color: 'rgba(0,0,0,0.45)' }, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: (v: number) => v >= 10000 ? `${Math.round(v / 1000)}k` : String(v) }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } } },
    series: series.map((s) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data,
      smooth: 0.25,
      showSymbol: x.length <= 40,
      connectNulls: false,
      lineStyle: s.dashed ? { type: 'dashed' } : undefined,
      areaStyle: s.area ? { opacity: 0.15 } : undefined,
    })),
  };
  return <ReactECharts option={option} style={{ height }} onEvents={{ click: (p: { name: string; seriesName?: string; dataIndex: number }) => onEvent?.(p) }} notMerge />;
}

export function EnergyBarChart({ x, series, unit, height = 300, showLegend = true, onEvent }: BaseProps) {
  if (!hasAnyData(series)) return <Empty description="暂无有效数据" style={{ padding: 32 }} />;
  const option: EChartsOption = {
    color: series.map((s) => s.color ?? ENERGY_COLOR.electricity),
    grid: { left: 56, right: 24, top: showLegend ? 40 : 24, bottom: 30 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => tooltipFormatter(p, unit) },
    legend: showLegend ? { top: 4, textStyle: { fontSize: 12 } } : undefined,
    xAxis: { type: 'category', data: x, ...AXIS_STYLE },
    yAxis: { type: 'value', name: unit, nameTextStyle: { color: 'rgba(0,0,0,0.45)' }, axisLabel: { ...AXIS_STYLE.axisLabel, formatter: (v: number) => v >= 10000 ? `${Math.round(v / 1000)}k` : String(v) }, splitLine: { lineStyle: { color: 'rgba(0,0,0,0.06)' } } },
    series: series.map((s) => ({
      name: s.name,
      type: 'bar' as const,
      stack: s.stack,
      data: s.data,
      barMaxWidth: 28,
    })),
  };
  return <ReactECharts option={option} style={{ height }} onEvents={{ click: (p: { name: string; seriesName?: string; dataIndex: number }) => onEvent?.(p) }} notMerge />;
}

export function EnergyStackedBar({ x, series, unit, height = 300 }: BaseProps) {
  return <EnergyBarChart x={x} series={series} unit={unit} height={height} showLegend />;
}

export interface PieDatum { name: string; value: number; color?: string }

export function EnergyPieChart({ data, unit, height = 300, onEvent }: {
  data: PieDatum[];
  unit?: string;
  height?: number;
  onEvent?: (name: string) => void;
}) {
  const valid = data.filter((d) => d.value > 0);
  if (valid.length === 0) return <Empty description="暂无有效数据" style={{ padding: 32 }} />;
  const option: EChartsOption = {
    color: valid.map((d) => d.color ?? ENERGY_COLOR.electricity),
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = p as { name: string; value: number; percent: number; marker: string };
        return `${item.marker}${item.name}<br/>${item.value.toLocaleString('zh-CN')} ${unit ?? ''}（${item.percent}%）`;
      },
    },
    legend: { bottom: 0, textStyle: { fontSize: 12 } },
    series: [
      {
        type: 'pie',
        radius: ['38%', '66%'],
        center: ['50%', '44%'],
        data: valid,
        label: { formatter: '{b}\n{d}%', fontSize: 11 },
        emphasis: { itemStyle: { shadowBlur: 8, shadowOffsetX: 0 } },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} onEvents={{ click: (p: { name: string }) => onEvent?.(p.name) }} notMerge />;
}

/** 日历热力图：value 为日粒度数值 */
export function EnergyHeatmap({ dates, values, unit, height = 260, colorFrom = '#e6f4ff', colorTo = '#1668dc' }: {
  dates: string[];
  values: (number | null)[];
  unit?: string;
  height?: number;
  colorFrom?: string;
  colorTo?: string;
}) {
  const any = values.some((v) => v !== null);
  if (!any) return <Empty description="暂无有效数据" style={{ padding: 32 }} />;
  const yLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const cols = 16;
  const xLabels: string[] = [];
  const cellDate = new Map<string, string>();
  const data: [number, number, number | string][] = [];
  let col = 0;
  let prevWeekKey = '';
  dates.forEach((dateStr, idx) => {
    const weekday = (new Date(dateStr + 'T00:00:00+08:00').getUTCDay() + 6) % 7;
    const weekKey = dateStr.slice(0, 7) + String(Math.floor(new Date(dateStr + 'T00:00:00+08:00').getUTCDate() / 7));
    if (prevWeekKey === '') prevWeekKey = weekKey;
    if (weekKey !== prevWeekKey) { col++; prevWeekKey = weekKey; }
    if (col >= cols) return;
    if (xLabels.length <= col) xLabels.push(dateStr.slice(5));
    cellDate.set(`${col}-${weekday}`, dateStr);
    const v = values[idx];
    data.push([col, weekday, v === null ? '-' : Math.round(v * 100) / 100]);
  });
  const max = Math.max(...values.filter((v): v is number => v !== null));
  const option: EChartsOption = {
    grid: { left: 44, right: 16, top: 24, bottom: 52 },
    tooltip: {
      formatter: (p) => {
        const item = p as unknown as { data: [number, number, number | string] };
        const date = cellDate.get(`${item.data[0]}-${item.data[1]}`) ?? '';
        const val = item.data[2];
        return `${date}（${yLabels[item.data[1]]}）<br/>${val === '-' ? '缺失' : `${val} ${unit ?? ''}`}`;
      },
    },
    xAxis: { type: 'category', data: xLabels, splitArea: { show: true }, ...AXIS_STYLE },
    yAxis: { type: 'category', data: yLabels, ...AXIS_STYLE },
    visualMap: {
      min: 0,
      max: max * 1.05 || 1,
      calculable: true,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      inRange: { color: [colorFrom, colorTo] },
      textStyle: { fontSize: 11 },
    },
    series: [
      {
        type: 'heatmap',
        data,
        label: { show: false },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}

export interface SankeyNode { name: string }
export interface SankeyLink { source: string; target: string; value: number }

export function EnergySankey({ nodes, links, height = 380, colors }: {
  nodes: SankeyNode[];
  links: SankeyLink[];
  height?: number;
  colors?: string[];
}) {
  if (links.length === 0) return <Empty description="暂无有效数据" style={{ padding: 32 }} />;
  const option: EChartsOption = {
    color: colors ?? ['#1668dc', '#69c0ff', '#13c2c2', '#fa8c16', '#722ed1', '#f5222d'],
    tooltip: {
      trigger: 'item',
      formatter: (p) => {
        const item = p as { dataType: string; name: string; value: number };
        if (item.dataType === 'edge') return `${item.name}<br/>流量：${Math.round(item.value * 100) / 100}`;
        return item.name;
      },
    },
    series: [
      {
        type: 'sankey',
        left: 12,
        right: 120,
        top: 12,
        bottom: 12,
        nodeWidth: 14,
        emphasis: { focus: 'adjacency' },
        data: nodes.map((n) => { void n; return { name: n.name } as never; }),
        links: links.map((l) => ({ source: l.source, target: l.target, value: Math.round(l.value * 100) / 100 })),
        label: { fontSize: 11, color: 'rgba(0,0,0,0.75)' },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.35 },
      },
    ],
  };
  return <ReactECharts option={option} style={{ height }} notMerge />;
}

/** 图表卡片容器 */
export function ChartCard({ title, extra, note, children, height }: {
  title: ReactNode;
  extra?: ReactNode;
  note?: ReactNode;
  children: ReactNode;
  height?: number;
}) {
  return (
    <Card
      size="small"
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>}
      extra={extra}
      styles={{ body: { padding: '4px 8px 8px' } }}
    >
      <div style={{ height }}>{children}</div>
      {note && <div className="data-quality-note" style={{ marginTop: 4 }}>{note}</div>}
    </Card>
  );
}