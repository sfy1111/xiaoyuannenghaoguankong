import { Tag, Tooltip } from 'antd';
import type { Quality } from '../domain/types';
import { QUALITY_COLOR, QUALITY_LABEL } from '../domain/quality';

export function QualityTag({ quality }: { quality: Quality }) {
  return <Tag color={QUALITY_COLOR[quality]}>{QUALITY_LABEL[quality]}</Tag>;
}

export const ALARM_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待确认', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  reviewing: { label: '待复核', color: 'purple' },
  closed: { label: '已关闭', color: 'green' },
  suspended: { label: '暂挂', color: 'default' },
};

export function AlarmStatusTag({ status }: { status: string }) {
  const meta = ALARM_STATUS_META[status] ?? { label: status, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export const SEVERITY_META: Record<string, { label: string; color: string }> = {
  critical: { label: '严重', color: 'red' },
  major: { label: '重要', color: 'orange' },
  minor: { label: '一般', color: 'blue' },
};

export function SeverityTag({ severity }: { severity: string }) {
  const meta = SEVERITY_META[severity] ?? { label: severity, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export const WO_STATUS_META: Record<string, { label: string; color: string }> = {
  assigned: { label: '待接单', color: 'orange' },
  processing: { label: '处理中', color: 'blue' },
  reviewing: { label: '待复核', color: 'purple' },
  completed: { label: '已完成', color: 'green' },
  rejected: { label: '已退回', color: 'red' },
};

export function WorkOrderStatusTag({ status }: { status: string }) {
  const meta = WO_STATUS_META[status] ?? { label: status, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

export function BillStatusTag({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: '待核对', color: 'orange' },
    confirmed: { label: '已核对', color: 'green' },
    archived: { label: '已归档', color: 'default' },
  };
  const meta = map[status] ?? { label: status, color: 'default' };
  return <Tag color={meta.color}>{meta.label}</Tag>;
}

/** 覆盖率展示：不足时给出提示色 */
export function CoverageTag({ coverage }: { coverage: number }) {
  const pct = Math.round(coverage * 1000) / 10;
  const color = coverage >= 0.98 ? 'green' : coverage >= 0.9 ? 'blue' : 'orange';
  return (
    <Tooltip title="覆盖率＝计入统计的样本小时数 / 应有样本小时数">
      <Tag color={color}>{pct}%</Tag>
    </Tooltip>
  );
}

export function IncompleteNote({ hasMissing, hasEstimated, hasInvalid, hasManual }: {
  hasMissing?: boolean; hasEstimated?: boolean; hasInvalid?: boolean; hasManual?: boolean;
}) {
  const parts: string[] = [];
  if (hasMissing) parts.push('存在缺失样本');
  if (hasInvalid) parts.push('存在无效样本');
  if (hasEstimated) parts.push('含估算值');
  if (hasManual) parts.push('含人工修正值');
  if (parts.length === 0) return <Tag color="green">数据完整</Tag>;
  return (
    <Tooltip title="缺失与无效样本不计入统计；估算与人工修正值计入并保留质量标记">
      <Tag color={hasMissing || hasInvalid ? 'orange' : 'gold'}>{parts.join('，')}</Tag>
    </Tooltip>
  );
}