import { useMemo, useState } from 'react';
import { App, Button, Descriptions, Drawer, Input, Modal, Select, Space, Table, Tag } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { SeverityTag, WorkOrderStatusTag, AlarmStatusTag } from '../../components/StatusTags';
import { canEdit, canApprove, visibleCampusIds } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import type { WorkOrder } from '../../domain/types';

export default function WorkOrdersPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const entities = getEntities();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<WorkOrder | null>(null);
  const [resultTarget, setResultTarget] = useState<WorkOrder | null>(null);
  const [resultText, setResultText] = useState('');
  const [reviewTarget, setReviewTarget] = useState<WorkOrder | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', type: '节能巡查', assignee: '陈志强', buildingId: 'B-TA', note: '' });
  const operational = canEdit('workOrders');
  const approvable = canApprove('alarms');
  const allowed = visibleCampusIds();

  const rows = useMemo(() => {
    let list = entities.workOrders.filter((w) => allowed.includes(w.campusId));
    if (statusFilter !== 'all') list = list.filter((w) => w.status === statusFilter);
    return list;
  }, [entities, statusFilter, allowed]);

  const submitResult = () => {
    if (!resultTarget) return;
    if (!resultText.trim()) {
      message.warning('请填写发现问题与处理措施');
      return;
    }
    entities.actions.submitWorkOrderResult(resultTarget.id, resultText, '陈志强');
    message.success('处理结果已提交，工单进入待复核，关联告警同步更新');
    setResultTarget(null);
    setResultText('');
  };

  const doReview = (pass: boolean) => {
    if (!reviewTarget) return;
    if (!reviewNote.trim()) {
      message.warning('请填写复核意见');
      return;
    }
    entities.actions.reviewWorkOrder(reviewTarget.id, pass, reviewNote, '张启明');
    if (pass) {
      const alarm = entities.alarms.find((a) => a.id === reviewTarget.alertId);
      if (alarm && alarm.status === 'reviewing') {
        entities.actions.closeAlarmByReview(alarm.id, `工单${reviewTarget.code}复核通过：${reviewNote}`, '张启明');
      }
      message.success('复核通过，工单完成；关联告警同步关闭');
    } else {
      message.success('已退回工单，负责人需重新处理');
    }
    setReviewTarget(null);
    setReviewNote('');
  };

  const createOrder = () => {
    if (!createForm.title.trim() || !createForm.note.trim()) {
      message.warning('请填写工单标题与说明');
      return;
    }
    const b = entities.buildings.find((x) => x.id === createForm.buildingId);
    entities.actions.createWorkOrder({
      title: createForm.title,
      source: '人工创建',
      alertId: null,
      type: createForm.type,
      campusId: b?.campusId ?? 'C-E',
      buildingId: createForm.buildingId,
      pointId: null,
      assignee: createForm.assignee,
      assigneeDept: '后勤保障处物业运维',
      priority: 'medium',
      deadline: dayjs(META.asOf).add(7, 'day').format('YYYY-MM-DD'),
    }, '王建国');
    message.success('工单已创建并派发');
    setCreateOpen(false);
  };

  const exportSheet = {
    name: '运维工单',
    headers: ['工单编号', '标题', '来源', '类型', '建筑', '负责人', '优先级', '时限', '状态', '创建时间', '完成时间'],
    rows: rows.map((w) => [
      w.code, w.title, w.source, w.type,
      entities.buildings.find((b) => b.id === w.buildingId)?.name ?? '—',
      w.assignee, w.priority === 'high' ? '高' : w.priority === 'medium' ? '中' : '低',
      w.deadline, w.status, w.createdAt, w.completedAt ?? '—',
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['告警与工单', '运维工单']}
        title="维修/排查工单"
        subtitle={
          <span>
            告警转工单后可回溯告警；工单关闭不抹去历史异常数据。流程：派单 → 接单 → 处理反馈 → 提交复核 → 复核通过/退回。
          </span>
        }
        extra={
          <Space>
            {operational && <Button size="small" type="primary" onClick={() => setCreateOpen(true)}>人工新建工单</Button>}
            <ExportButton filename="运维工单清单" sheet={exportSheet} metaNote="工单与来源告警关联导出" />
          </Space>
        }
      />
      <div className="filter-bar">
        <Select size="small" style={{ width: 120 }} value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: '全部状态' },
          { value: 'assigned', label: '待接单' },
          { value: 'processing', label: '处理中' },
          { value: 'reviewing', label: '待复核' },
          { value: 'completed', label: '已完成' },
        ]} />
        <span className="muted small">共 {rows.length} 张工单，未完成 {rows.filter((w) => w.status !== 'completed').length} 张</span>
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: '工单编号', dataIndex: 'code', width: 130 },
          { title: '标题', dataIndex: 'title' },
          {
            title: '来源', dataIndex: 'alertId', width: 120,
            render: (v: string | null, r) => v ? (
              <Link to={`/alarms/${v}`} onClick={(e) => e.stopPropagation()}>{r.source.includes('告警') ? '告警事件' : r.source}</Link>
            ) : r.source,
          },
          { title: '类型', dataIndex: 'type', width: 100 },
          { title: '负责人', dataIndex: 'assignee', width: 80 },
          {
            title: '优先级', dataIndex: 'priority', width: 76,
            render: (p: string) => <Tag color={p === 'high' ? 'red' : p === 'medium' ? 'orange' : 'default'}>{p === 'high' ? '高' : p === 'medium' ? '中' : '低'}</Tag>,
          },
          { title: '时限', dataIndex: 'deadline', width: 100 },
          { title: '状态', dataIndex: 'status', width: 84, render: (s: string) => <WorkOrderStatusTag status={s} /> },
          {
            title: '操作', width: 170,
            render: (_v, w) => (
              <Space size={4}>
                {operational && w.status === 'assigned' && (
                  <a onClick={(e) => { e.stopPropagation(); entities.actions.acceptWorkOrder(w.id, '陈志强'); message.success('已接单开始处理'); }}>接单</a>
                )}
                {operational && w.status === 'processing' && (
                  <a onClick={(e) => { e.stopPropagation(); setResultText(''); setResultTarget(w); }}>提交结果</a>
                )}
                {approvable && w.status === 'reviewing' && (
                  <a onClick={(e) => { e.stopPropagation(); setReviewNote(''); setReviewTarget(w); }}>复核</a>
                )}
                <a onClick={(e) => { e.stopPropagation(); setDetail(w); }}>详情</a>
              </Space>
            ),
          },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={640} title={detail ? `${detail.code} · ${detail.title}` : ''}>
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="来源">{detail.source}</Descriptions.Item>
              <Descriptions.Item label="类型">{detail.type}</Descriptions.Item>
              <Descriptions.Item label="建筑">{entities.buildings.find((b) => b.id === detail.buildingId)?.name ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="负责人">{detail.assignee}（{detail.assigneeDept}）</Descriptions.Item>
              <Descriptions.Item label="创建时间">{detail.createdAt}</Descriptions.Item>
              <Descriptions.Item label="计划时限">{detail.deadline}</Descriptions.Item>
              <Descriptions.Item label="开始时间">{detail.startedAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="完成时间">{detail.completedAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}><WorkOrderStatusTag status={detail.status} /></Descriptions.Item>
              <Descriptions.Item label="处理结果" span={2}>{detail.result ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="复核人">{detail.reviewer ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="复核时间">{detail.reviewedAt ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="复核意见" span={2}>{detail.reviewNote ?? '—'}</Descriptions.Item>
            </Descriptions>
            {detail.alertId && (
              <Space>
                <span>关联告警：</span>
                <Link to={`/alarms/${detail.alertId}`}>{entities.alarms.find((a) => a.id === detail.alertId)?.title}</Link>
              </Space>
            )}
            <div>
              <b>处理动作记录</b>
              <div className="mt8">
                {detail.actions.map((a, i) => (
                  <div key={i} className="small" style={{ padding: '4px 0', borderBottom: '1px dashed rgba(0,0,0,0.08)' }}>
                    <Tag color="blue">{a.time}</Tag>
                    <b>{a.action}</b>（{a.actor}）：{a.note}
                  </div>
                ))}
              </div>
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={`提交处理结果：${resultTarget?.code ?? ''}`}
        open={!!resultTarget}
        onOk={submitResult}
        onCancel={() => setResultTarget(null)}
        okText="提交并申请复核"
        cancelText="取消"
      >
        <Input.TextArea rows={4} placeholder="发现问题与处理措施（必填），如：定位漏点/更换部件/复归读数" value={resultText} onChange={(e) => setResultText(e.target.value)} />
      </Modal>

      <Modal
        title={`复核工单：${reviewTarget?.code ?? ''}`}
        open={!!reviewTarget}
        onCancel={() => setReviewTarget(null)}
        footer={[
          <Button key="reject" danger onClick={() => doReview(false)}>退回</Button>,
          <Button key="pass" type="primary" onClick={() => doReview(true)}>复核通过</Button>,
        ]}
      >
        <div className="small mb8">处理结果：{reviewTarget?.result ?? '—'}</div>
        <Input.TextArea rows={3} placeholder="复核意见（通过则同步关闭关联告警；退回则工单回到处理中）" value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} />
      </Modal>

      <Modal
        title="人工新建工单"
        open={createOpen}
        onOk={createOrder}
        onCancel={() => setCreateOpen(false)}
        okText="创建并派单"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Input placeholder="工单标题" value={createForm.title} onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })} />
          <Select style={{ width: '100%' }} value={createForm.type} onChange={(v) => setCreateForm({ ...createForm, type: v })} options={[
            { value: '节能巡查', label: '节能巡查' },
            { value: '计量设备维护', label: '计量设备维护' },
            { value: '漏损排查', label: '漏损排查' },
            { value: '计量核查', label: '计量核查' },
          ]} />
          <Select
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            value={createForm.buildingId}
            onChange={(v) => setCreateForm({ ...createForm, buildingId: v })}
            options={entities.buildings.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.name }))}
          />
          <Input.TextArea rows={3} placeholder="任务说明" value={createForm.note} onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })} />
        </Space>
      </Modal>
    </div>
  );
}