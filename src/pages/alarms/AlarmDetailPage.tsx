import { useMemo, useState } from 'react';
import { App, Button, Card, Descriptions, Input, Modal, Select, Space, Tag, Tooltip } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import AlarmTimeline, { AlarmMeta } from '../../components/AlarmTimeline';
import { ChartCard, EnergyLineChart } from '../../components/charts';
import { AlarmStatusTag, SeverityTag } from '../../components/StatusTags';
import { canEdit, canApprove } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { dailyRows, hourRangeOf, aggregateHours } from '../../services/energyStats';
import { getSeries, qualityOfCode, TOTAL_HOURS, hourTimestamp } from '../../services/telemetry';
import { ENERGY_COLOR, ENERGY_LABEL, fmtInt } from '../../domain/units';
import { shiftDay } from '../../domain/time';
import type { Alarm } from '../../domain/types';

export default function AlarmDetailPage() {
  const { alertId } = useParams<{ alertId: string }>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const entities = getEntities();
  const alarm = entities.alarms.find((a) => a.id === alertId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [confirmForm, setConfirmForm] = useState({ handler: '', note: '' });
  const [dispatchForm, setDispatchForm] = useState({ assignee: '陈志强', dept: '后勤保障处物业运维', deadline: '2026-10-25', type: '漏损排查', note: '' });
  const [closeNote, setCloseNote] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const handleable = canEdit('alarms');
  const approvable = canApprove('alarms');

  const curve = useMemo(() => {
    if (!alarm) return null;
    const pointId = alarm.pointId;
    if (!pointId) return null;
    const center = alarm.time.slice(0, 10);
    const from = shiftDay(center, -12);
    const to = center;
    const rows = dailyRows([pointId], from, to);
    const baselineDays = dailyRows([pointId], shiftDay(from, -21), shiftDay(from, -1));
    const baselineAvg = (() => {
      const valid = baselineDays.filter((r) => r.total > 0);
      if (valid.length === 0) return null;
      const arr = valid.map((r) => r.total).sort((a, b) => a - b);
      return arr[Math.floor(arr.length / 2)];
    })();
    const point = entities.meteringPoints.find((p) => p.id === pointId);
    let lastSeen = '—';
    if (point) {
      const s = getSeries(point.id);
      if (s) {
        for (let i = TOTAL_HOURS - 1; i >= 0; i--) {
          const q = qualityOfCode(s.quality[i]);
          if (q !== 'missing' && q !== 'invalid') { lastSeen = hourTimestamp(i).slice(0, 16); break; }
        }
      }
    }
    return { rows, baselineAvg, from, to, center, point };
  }, [alarm, entities]);

  if (!alarm) {
    return <PageHeader breadcrumb={['告警与工单', '告警详情']} title="告警不存在" subtitle="事件可能已归档，请返回告警中心" />;
  }

  const building = entities.buildings.find((b) => b.id === alarm.buildingId);
  const rule = entities.alarmRules.find((r) => r.id === alarm.ruleId);
  const workOrder = alarm.workOrderId ? entities.workOrders.find((w) => w.id === alarm.workOrderId) : null;
  const point = entities.meteringPoints.find((p) => p.id === alarm.pointId);
  const meter = point ? entities.meters.find((m) => m.id === point.meterId) : null;
  const gateway = point ? entities.iotGateways.find((g) => g.campusId === point.campusId) : null;

  const doConfirm = () => {
    if (!confirmForm.handler.trim() || !confirmForm.note.trim()) {
      message.warning('请填写确认责任人与说明');
      return;
    }
    entities.actions.confirmAlarm(alarm.id, confirmForm.handler, confirmForm.note, '王建国');
    message.success('告警已确认');
    setConfirmOpen(false);
  };

  const doDispatch = () => {
    if (!dispatchForm.note.trim()) {
      message.warning('请填写派单说明');
      return;
    }
    const wo = entities.actions.createWorkOrderFromAlarm(alarm.id, {
      assignee: dispatchForm.assignee,
      assigneeDept: dispatchForm.dept,
      deadline: dispatchForm.deadline,
      type: dispatchForm.type,
      note: dispatchForm.note,
    }, '王建国');
    if (wo) {
      message.success(`工单 ${wo.code} 已生成并派发至 ${dispatchForm.assignee}`);
    } else {
      message.info('该告警已有工单');
    }
    setDispatchOpen(false);
  };

  const doClose = () => {
    if (!closeNote.trim()) {
      message.warning('请填写复核意见');
      return;
    }
    entities.actions.closeAlarmByReview(alarm.id, closeNote, '张启明');
    message.success('告警已复核关闭；数据恢复与人工事件关闭为独立状态');
    setCloseOpen(false);
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['告警与工单', alarm.title]}
        title={alarm.title}
        subtitle={
          <Space size={8} wrap>
            <SeverityTag severity={alarm.severity} />
            <AlarmStatusTag status={alarm.status} />
            <span>发生时间 {alarm.time}</span>
            <span className="muted">{building ? building.name : '公共区域'}</span>
          </Space>
        }
        extra={
          <Space>
            {handleable && alarm.status === 'pending' && <Button size="small" type="primary" onClick={() => { setConfirmForm({ handler: '', note: '' }); setConfirmOpen(true); }}>确认告警</Button>}
            {handleable && (alarm.status === 'pending' || alarm.status === 'processing') && !alarm.workOrderId && (
              <Button size="small" onClick={() => setDispatchOpen(true)}>转运维工单</Button>
            )}
            {approvable && alarm.status === 'reviewing' && <Button size="small" type="primary" onClick={() => { setCloseNote(''); setCloseOpen(true); }}>复核关闭</Button>}
            <Button size="small" onClick={() => navigate('/alarms')}>返回列表</Button>
          </Space>
        }
      />

      <div className="chart-grid c2">
        <Card size="small" title="事件与规则说明" styles={{ body: { padding: '8px 12px' } }}>
          <AlarmMeta alarm={alarm} />
          {rule && (
            <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
              <Descriptions.Item label="规则说明">{rule.description}</Descriptions.Item>
              <Descriptions.Item label="业务约束">{rule.note ?? rule.whitelist ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="特殊日排除">{rule.excludeSpecialDays ? '启用（假期/特殊日按校历排除误报）' : '不启用'}</Descriptions.Item>
              <Descriptions.Item label="通知对象">{rule.notifyRoles.join('、')}</Descriptions.Item>
              <Descriptions.Item label="规则审批人">{rule.approver}</Descriptions.Item>
            </Descriptions>
          )}
        </Card>

        <Card size="small" title="关联计量点与IoT状态" styles={{ body: { padding: '8px 12px' } }}>
          {point ? (
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="计量点">{point.name}</Descriptions.Item>
              <Descriptions.Item label="器具/表号">{meter?.name ?? '—'}（{meter?.meterNo ?? '—'}）</Descriptions.Item>
              <Descriptions.Item label="IoT属性">{point.iotPropertyId ?? '未绑定'}</Descriptions.Item>
              <Descriptions.Item label="最后有效上报">{curve ? (curve.rows[curve.rows.length - 1]?.date ?? '—') : '—'}</Descriptions.Item>
              <Descriptions.Item label="采集网关">{gateway?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="网关心跳">{gateway ? dayjs(gateway.lastHeartbeat).format('MM-DD HH:mm') : '—'}</Descriptions.Item>
            </Descriptions>
          ) : <div className="muted">无关联计量点</div>}
          {alarm.workOrderId ? (
            <div className="mt8">
              关联工单：<Link to="/work-orders">{workOrder?.code}（{workOrder?.title}）</Link>
            </div>
          ) : (
            <div className="muted small mt8">尚无关联工单{handleable ? '，可在上方派发' : ''}</div>
          )}
        </Card>
      </div>

      {curve && (
        <ChartCard
          title={`原始/统计曲线（${curve.from} 至 ${curve.to}，${curve.point?.unit ?? ''}）`}
          height={320}
          note={`事件日 ${curve.center} 高亮；虚线为事件前3周同点位中位日基线${curve.baselineAvg === null ? '（基期样本不足）' : '（' + fmtInt(Math.round(curve.baselineAvg)) + '）'}；曲线断开为缺失样本`}
        >
          <EnergyLineChart
            x={curve.rows.map((r) => r.date.slice(5))}
            series={[
              {
                name: '日用量',
                data: curve.rows.map((r) => (r.total > 0 ? Math.round(r.total) : null)),
                color: ENERGY_COLOR[alarm.energyType],
              },
              ...(curve.baselineAvg !== null
                ? [{ name: '基线（中位）', data: curve.rows.map(() => Math.round(curve.baselineAvg!)), color: '#fa8c16', dashed: true }]
                : []),
            ]}
            unit={curve.point?.unit}
            height={310}
          />
        </ChartCard>
      )}

      <div className="chart-grid c2">
        <Card size="small" title="处置时间线（每步写入审计）" styles={{ body: { padding: '12px 16px' } }}>
          <AlarmTimeline alarm={alarm} />
        </Card>
        <Card size="small" title="同期相似时段对比" styles={{ body: { padding: '8px 12px' } }}>
          {curve && alarm.pointId ? (
            <Descriptions size="small" column={1} bordered>
              <Descriptions.Item label="事件日窗口用量">
                {(() => {
                  const { fromH, toH } = hourRangeOf(alarm.time.slice(0, 10), alarm.time.slice(0, 10));
                  const u = aggregateHours([alarm.pointId!], fromH, toH);
                  return `${fmtInt(Math.round(u.total ?? 0))} ${curve.point?.unit ?? ''}（覆盖率 ${(u.coverage * 100).toFixed(0)}%）`;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="上周同日">同规则基线内比较，异常幅度见检测值说明</Descriptions.Item>
              <Descriptions.Item label="处置结论">
                {alarm.isFalse ? '经核实为误报（保留事件与历史数据）' : alarm.status === 'closed' ? '已闭环处置' : '处置进行中'}
              </Descriptions.Item>
            </Descriptions>
          ) : <div className="muted">无对比数据</div>}
          <div className="muted small mt8">
            数据恢复（补传）与人工事件关闭为两个独立状态：补传后相关指标自动重算，事件仍需复核后关闭。
          </div>
        </Card>
      </div>

      <Modal title="确认告警" open={confirmOpen} onOk={doConfirm} onCancel={() => setConfirmOpen(false)} okText="确认" cancelText="取消">
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            placeholder="指定确认责任人"
            value={confirmForm.handler || undefined}
            onChange={(v) => setConfirmForm({ ...confirmForm, handler: v })}
            options={entities.users.map((u) => ({ value: u.name, label: `${u.name}（${u.title}）` }))}
          />
          <Input.TextArea
            rows={3}
            placeholder="确认说明（区分采集故障与真实用能异常）"
            value={confirmForm.note}
            onChange={(e) => setConfirmForm({ ...confirmForm, note: e.target.value })}
          />
        </Space>
      </Modal>

      <Modal title="转运维工单" open={dispatchOpen} onOk={doDispatch} onCancel={() => setDispatchOpen(false)} okText="派单" cancelText="取消">
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Select
            style={{ width: '100%' }}
            value={dispatchForm.assignee}
            onChange={(v) => setDispatchForm({ ...dispatchForm, assignee: v })}
            options={entities.users.filter((u) => u.roleId === 'R-OPERATION').map((u) => ({ value: u.name, label: `${u.name}（${u.title}）` }))}
          />
          <Select
            style={{ width: '100%' }}
            value={dispatchForm.type}
            onChange={(v) => setDispatchForm({ ...dispatchForm, type: v })}
            options={[{ value: '漏损排查', label: '漏损排查' }, { value: '计量设备维护', label: '计量设备维护' }, { value: '节能巡查', label: '节能巡查' }, { value: '计量核查', label: '计量核查' }]}
          />
          <Input placeholder="计划完成时限（YYYY-MM-DD）" value={dispatchForm.deadline} onChange={(e) => setDispatchForm({ ...dispatchForm, deadline: e.target.value })} />
          <Input.TextArea rows={3} placeholder="派单说明（现场核查要点）" value={dispatchForm.note} onChange={(e) => setDispatchForm({ ...dispatchForm, note: e.target.value })} />
        </Space>
      </Modal>

      <Modal title="复核关闭" open={closeOpen} onOk={doClose} onCancel={() => setCloseOpen(false)} okText="复核通过并关闭" cancelText="取消">
        <Input.TextArea rows={3} placeholder="复核意见（必填，写入时间线与审计）" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} />
      </Modal>
    </div>
  );
}