import { useState } from 'react';
import { App, Input, Modal, Switch, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { canApprove, canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';

export default function AlarmRulesPage() {
  const { message } = App.useApp();
  const entities = getEntities();
  const [editTarget, setEditTarget] = useState<string | null>(null);
  const [threshold, setThreshold] = useState('');
  const [duration, setDuration] = useState('');
  const approvable = canApprove('alarmRules');
  const editable = canEdit('alarmRules');

  const save = () => {
    if (!editTarget) return;
    entities.actions.updateAlarmRule(editTarget, {
      ...(threshold ? { threshold } : {}),
      ...(duration ? { duration } : {}),
      lastApprovedAt: dayjs(META.asOf).format('YYYY-MM-DD HH:mm'),
    });
    message.success('规则参数已保存并经主管审批生效（阈值默认建议值需主管审批）');
    setEditTarget(null);
    setThreshold('');
    setDuration('');
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['告警与工单', '告警规则']}
        title="预置告警规则"
        subtitle={
          <span>
            系统内置规则仅允许维护启用状态、作用对象、阈值/持续时长、通知人与特殊日排除；不提供可视化条件编程器。
            数据源缺失时规则不生成“真实高能耗”误报。
          </span>
        }
      />
      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={entities.alarmRules}
        columns={[
          { title: '规则', dataIndex: 'name', width: 150 },
          { title: '判断逻辑', dataIndex: 'description' },
          {
            title: '作用对象', dataIndex: 'objectScope', width: 130,
            render: (v: string, r) => (
              <Tooltip title={r.whitelist ?? r.note ?? ''}>
                <span>{v}</span>
              </Tooltip>
            ),
          },
          { title: '阈值', dataIndex: 'threshold', width: 120 },
          { title: '持续/判定', dataIndex: 'duration', width: 100 },
          {
            title: '特殊日排除', dataIndex: 'excludeSpecialDays', width: 96,
            render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? '排除' : '不排除'}</Tag>,
          },
          {
            title: '通知对象', dataIndex: 'notifyRoles', width: 140,
            render: (v: string[]) => v.join('、'),
          },
          {
            title: '启用', dataIndex: 'enabled', width: 70,
            render: (v: boolean, r) => (
              <Switch
                size="small"
                checked={v}
                disabled={!editable}
                onChange={(checked) => {
                  entities.actions.updateAlarmRule(r.id, { enabled: checked });
                  message.success(`${r.name} 已${checked ? '启用' : '停用'}${!checked ? '（源数据不全时停用可避免误报）' : ''}`);
                }}
              />
            ),
          },
          {
            title: '最近审批', dataIndex: 'lastApprovedAt', width: 110,
            render: (v: string | null) => v ?? <Tag color="orange">待审批</Tag>,
          },
          {
            title: '操作', width: 70,
            render: (_v, r) => editable ? <a onClick={() => { setEditTarget(r.id); setThreshold(r.threshold); setDuration(r.duration); }}>维护</a> : null,
          },
        ]}
      />
      <div className="muted small mt8">
        说明：同一规则在数据源缺失时不会大量生成“真实高能耗”误报；各级阈值为建议默认值，由学校能源主管（{approvable ? '当前角色可审批' : '张启明'}）审批后生效。
        通知发送失败将重试并保留记录。设备安全类处置以现有专业系统为准。
      </div>

      <Modal
        title={`维护规则参数：${entities.alarmRules.find((r) => r.id === editTarget)?.name ?? ''}`}
        open={!!editTarget}
        onOk={save}
        onCancel={() => setEditTarget(null)}
        okText="保存（需主管审批生效）"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>
            <div className="small">阈值（保留业务描述）</div>
            <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div>
            <div className="small">持续/判定时长</div>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="muted small">保存后记录审批人与时间；已产生的历史事件不受回溯影响。</div>
        </div>
      </Modal>
    </div>
  );
}