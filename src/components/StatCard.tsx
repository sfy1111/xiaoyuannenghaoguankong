import type { ReactNode } from 'react';
import { Card, Tooltip } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, InfoCircleOutlined, WarningOutlined } from '@ant-design/icons';

export default function StatCard({ label, value, unit, sub, trend, trendLabel, qualityNote, onClick, decimals = 0 }: {
  label: ReactNode;
  value: number | string | null;
  unit?: string;
  sub?: ReactNode;
  trend?: number | null;
  trendLabel?: string;
  qualityNote?: string;
  onClick?: () => void;
  decimals?: number;
}) {
  const fmt = typeof value === 'number'
    ? value.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    : value ?? '—';
  const trendNode = trend !== undefined && trend !== null ? (
    <span style={{ color: trend > 0 ? '#cf1322' : trend < 0 ? '#389e0d' : 'rgba(0,0,0,0.45)', marginLeft: 6, fontSize: 12 }}>
      {trend > 0 ? <ArrowUpOutlined /> : trend < 0 ? <ArrowDownOutlined /> : null}
      {trend > 0 ? '+' : ''}{trend.toFixed(1)}%{trendLabel ? `（${trendLabel}）` : ''}
    </span>
  ) : trend === null ? (
    <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>同比不可计算</span>
  ) : null;
  return (
    <Card
      size="small"
      className="kpi-card"
      styles={{ body: { padding: '12px 14px' } }}
      style={{ cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
      hoverable={!!onClick}
    >
      <div className="kpi-label">
        {label}
        {qualityNote && (
          <Tooltip title={`数据质量：${qualityNote}`}>
            <WarningOutlined style={{ color: qualityNote.includes('缺失') ? '#fa541c' : '#faad14' }} />
          </Tooltip>
        )}
      </div>
      <div className="kpi-value">
        {fmt}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-sub">
        {sub}
        {trendNode}
      </div>
    </Card>
  );
}

export function MetricInfo({ title, content }: { title: ReactNode; content: ReactNode }) {
  return (
    <Tooltip title={content}>
      <InfoCircleOutlined className="muted" style={{ marginLeft: 4, fontSize: 13 }} />
    </Tooltip>
  );
}