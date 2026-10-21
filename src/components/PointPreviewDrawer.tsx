import { useMemo } from 'react';
import { Descriptions, Drawer, Table, Tag, Timeline } from 'antd';
import { useNavigate } from 'react-router-dom';
import { ChartCard, EnergyBarChart, EnergyLineChart } from './charts';
import { QualityTag, ALARM_STATUS_META } from './StatusTags';
import { getEntities } from '../services/repository';
import {
  cumulativeReadings, pointEvents, quarterSamples, TOTAL_HOURS, hourIndexOf, getSeries, qualityOfCode,
} from '../services/telemetry';
import { dailyRows } from '../services/energyStats';
import { lastNDays } from '../domain/time';
import { DATA_END } from '../stores/filters';
import type { Alarm } from '../domain/types';

/** 计量点详情抽屉：原始/统计值、累计读数、15分钟采样、质量与关联事件 */
export default function PointPreviewDrawer({ pointId, open, onClose }: {
  pointId: string | null; open: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();
  const entities = getEntities();
  const point = pointId ? entities.meteringPoints.find((p) => p.id === pointId) : null;

  const data = useMemo(() => {
    if (!pointId || !point) return null;
    const meter = entities.meters.find((m) => m.id === point.meterId);
    const series = getSeries(pointId);
    const lastTs = TOTAL_HOURS - 1;
    const from3d = lastTs - 71;
    const cum = cumulativeReadings(pointId, Math.max(0, from3d), lastTs);
    const days = lastNDays(DATA_END, 7);
    const daily = dailyRows([pointId], days[0], days[6]);
    const quarter = quarterSamples(pointId, lastTs);
    const recentHours: { ts: string; value: number | null; quality: string }[] = [];
    if (series) {
      for (let i = lastTs - 23; i <= lastTs; i++) {
        const q = qualityOfCode(series.quality[i]);
        const v = series.values[i];
        recentHours.push({
          ts: `${String(Math.floor(i / 24)).padStart(3, '0')}日${String(i % 24).padStart(2, '0')}时`,
          value: q === 'missing' ? null : Math.round(v * 100) / 100,
          quality: q,
        });
      }
    }
    const relatedAlarms = entities.alarms.filter((a) => a.pointId === pointId);
    const relatedCorrections = entities.corrections.filter((c) => c.pointId === pointId);
    const events = pointEvents(pointId);
    return { meter, cum, daily, quarter, recentHours, relatedAlarms, relatedCorrections, events, days };
  }, [pointId, point, entities]);

  if (!point || !data) return <Drawer open={open} onClose={onClose} title="计量点详情" width={720} />;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={760}
      title={<span>{point.name}<span className="muted small">（{point.code}）</span></span>}
    >
      <Descriptions size="small" column={2} bordered className="mb12">
        <Descriptions.Item label="计量器具">{data.meter?.name ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="表号">{data.meter?.meterNo ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="能源类型">{point.energyType}</Descriptions.Item>
        <Descriptions.Item label="计量方向/用途">{point.direction} / {point.usage}</Descriptions.Item>
        <Descriptions.Item label="量值类型">{point.readingType === 'cumulative' ? '累计量（差分统计）' : point.readingType}</Descriptions.Item>
        <Descriptions.Item label="单位">{point.unit}</Descriptions.Item>
        <Descriptions.Item label="IoT属性">{point.iotPropertyId ?? '未绑定'}</Descriptions.Item>
        <Descriptions.Item label="倍率说明">{data.meter?.ratioText ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="生效期" span={2}>{point.validFrom} 起{point.validTo ? ` 至 ${point.validTo}` : '（长期）'}</Descriptions.Item>
      </Descriptions>

      <ChartCard
        title="近3日累计读数（含换表重置处理）"
        height={230}
        note="累计读数由区间用量按统一初始基线推演；缺失小时不累计并保留质量标记"
      >
        <EnergyLineChart
          x={data.cum.map((r) => r.timestamp.slice(5, 13))}
          series={[{
            name: '累计读数',
            data: data.cum.map((r) => Math.round(r.value * 100) / 100),
            color: '#1668dc',
          }]}
          unit={point.unit}
          height={220}
        />
      </ChartCard>

      <div className="mt12" />
      <ChartCard title="近7日用量（日粒度）" height={230}>
        <EnergyBarChart
          x={data.daily.map((r) => r.date.slice(5))}
          series={[{ name: '区间用量', data: data.daily.map((r) => r.total), color: '#1668dc' }]}
          unit={point.unit}
          height={220}
        />
      </ChartCard>

      <div className="mt12" />
      <h4 className="section-title">最近24小时区间用量与质量</h4>
      <Table
        size="small"
        rowKey="ts"
        pagination={false}
        scroll={{ y: 260 }}
        dataSource={data.recentHours}
        columns={[
          { title: '时段', dataIndex: 'ts', width: 110 },
          { title: `区间用量（${point.unit}）`, dataIndex: 'value', render: (v: number | null) => v === null ? <Tag color="default">缺失</Tag> : v.toLocaleString('zh-CN') },
          { title: '数据质量', dataIndex: 'quality', width: 110, render: (q: string) => <QualityTag quality={q as never} /> },
        ]}
      />

      <div className="mt12" />
      <h4 className="section-title">最新小时15分钟采样（原始粒度推演）</h4>
      <Table
        size="small"
        rowKey="ts"
        pagination={false}
        dataSource={data.quarter}
        columns={[
          { title: '采样时刻', dataIndex: 'ts' },
          { title: `区间用量（${point.unit}）`, dataIndex: 'value' },
          { title: '小时内累计', dataIndex: 'cum' },
        ]}
      />

      {(data.events.length > 0 || data.relatedCorrections.length > 0) && (
        <>
          <div className="mt12" />
          <h4 className="section-title">计量事件与修正记录</h4>
          <Timeline
            items={[
              ...data.events.map((e) => ({
                color: e.type === 'swap' ? 'red' : 'orange',
                children: (
                  <div>
                    <b>{e.type === 'missing' ? '数据缺失' : e.type === 'invalid' ? '样本无效' : e.type === 'estimated' ? '估算时段' : e.type === 'swap' ? '换表事件' : e.type === 'surge' ? '负荷突增事件' : '夜间流量异常事件'}</b>
                    <span className="muted small">（{e.start ?? e.at}）</span>
                    <div>{e.reason}</div>
                  </div>
                ),
              })),
              ...data.relatedCorrections.map((c) => ({
                color: c.status === 'approved' ? 'green' : c.status === 'pending' ? 'gold' : 'red',
                children: (
                  <div>
                    <b>人工补录（{c.status === 'approved' ? '已批准' : c.status === 'pending' ? '待审核' : '已退回'}）</b>
                    <span className="muted small">（{c.start} 至 {c.end}）</span>
                    <div>{c.reason}</div>
                  </div>
                ),
              })),
            ]}
          />
        </>
      )}

      {data.relatedAlarms.length > 0 && (
        <>
          <div className="mt12" />
          <h4 className="section-title">关联告警事件</h4>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={data.relatedAlarms}
            columns={[
              { title: '事件', dataIndex: 'title' },
              { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => ALARM_STATUS_META[s]?.label ?? s },
              {
                title: '操作', width: 80, render: (_: unknown, a: Alarm) => (
                  <a onClick={() => navigate(`/alarms/${a.id}`)}>详情</a>
                ),
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}

export { hourIndexOf };