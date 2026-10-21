import { Descriptions, Timeline } from 'antd';
import type { Alarm } from '../domain/types';

export default function AlarmTimeline({ alarm }: { alarm: Alarm }) {
  return (
    <Timeline
      items={alarm.timeline.map((t) => ({
        color: t.action.includes('触发') ? 'red' : t.action.includes('关闭') ? 'green' : 'blue',
        children: (
          <div>
            <div style={{ fontWeight: 600 }}>{t.action} <span className="muted small">{t.time}</span></div>
            <div className="muted">操作人：{t.actor}</div>
            <div>{t.note}</div>
          </div>
        ),
      }))}
    />
  );
}

export function AlarmMeta({ alarm }: { alarm: Alarm }) {
  return (
    <Descriptions size="small" column={2} bordered>
      <Descriptions.Item label="事件编号">{alarm.code}</Descriptions.Item>
      <Descriptions.Item label="发生时间">{alarm.time}</Descriptions.Item>
      <Descriptions.Item label="校区">{alarm.campusId === 'C-E' ? '东校区' : '西校区'}</Descriptions.Item>
      <Descriptions.Item label="建筑">{alarm.buildingId ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="关联计量点">{alarm.pointId ?? '—'}</Descriptions.Item>
      <Descriptions.Item label="触发规则">{alarm.ruleId}</Descriptions.Item>
      <Descriptions.Item label="检测值" span={2}>{alarm.detectedValue}</Descriptions.Item>
      <Descriptions.Item label="阈值" span={2}>{alarm.threshold}</Descriptions.Item>
    </Descriptions>
  );
}