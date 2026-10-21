import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { AlarmStatusTag, SeverityTag } from '../../components/StatusTags';
import { canEdit, userScope, visibleCampusIds } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { ENERGY_LABEL } from '../../domain/units';
import type { Alarm } from '../../domain/types';

const SEVERITY_LABEL: Record<string, string> = { critical: '严重', major: '重要', minor: '一般' };

export default function AlarmCenterPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const entities = getEntities();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [energyFilter, setEnergyFilter] = useState<string>('all');
  const [campusFilter, setCampusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [confirmTarget, setConfirmTarget] = useState<Alarm | null>(null);
  const [falseTarget, setFalseTarget] = useState<Alarm | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<Alarm | null>(null);
  const [confirmForm, setConfirmForm] = useState({ handler: '', note: '' });
  const [noteText, setNoteText] = useState('');
  const handleable = canEdit('alarms');
  const allowed = visibleCampusIds();

  const rows = useMemo(() => {
    let list = entities.alarms;
    if (statusFilter !== 'all') list = list.filter((a) => a.status === statusFilter);
    if (severityFilter !== 'all') list = list.filter((a) => a.severity === severityFilter);
    if (energyFilter !== 'all') list = list.filter((a) => a.energyType === energyFilter);
    if (campusFilter !== 'all') list = list.filter((a) => a.campusId === campusFilter);
    if (search) {
      list = list.filter((a) => a.title.includes(search) || a.code.includes(search) ||
        (entities.buildings.find((b) => b.id === a.buildingId)?.name ?? '').includes(search));
    }
    list = list.filter((a) => allowed.includes(a.campusId));
    return [...list].sort((x, y) => (x.time < y.time ? 1 : -1));
  }, [entities, statusFilter, severityFilter, energyFilter, campusFilter, search, allowed]);

  const exportSheet = {
    name: '告警事件清单',
    headers: ['事件编号', '标题', '严重级别', '能源', '校区', '建筑', '点位', '状态', '发生时间', '责任人', '关联工单'],
    rows: rows.map((a) => [
      a.code, a.title, SEVERITY_LABEL[a.severity], ENERGY_LABEL[a.energyType],
      entities.campuses.find((c) => c.id === a.campusId)?.name ?? a.campusId,
      entities.buildings.find((b) => b.id === a.buildingId)?.name ?? '—',
      a.pointId ?? '—', a.status, a.time, a.handler ?? '—', a.workOrderId ?? '—',
    ]),
  };

  const doConfirm = () => {
    if (!confirmTarget) return;
    if (!confirmForm.handler.trim() || !confirmForm.note.trim()) {
      message.warning('请填写确认责任人与确认说明');
      return;
    }
    entities.actions.confirmAlarm(confirmTarget.id, confirmForm.handler, confirmForm.note, '王建国');
    message.success('告警已确认并进入处理中，时间线与审计已更新');
    setConfirmTarget(null);
    setConfirmForm({ handler: '', note: '' });
  };

  const doFalse = () => {
    if (!falseTarget) return;
    if (!noteText.trim()) {
      message.warning('请说明误报原因');
      return;
    }
    entities.actions.markAlarmFalse(falseTarget.id, noteText, '王建国');
    message.success('已判定为误报并关闭，事件与历史能耗记录保留');
    setFalseTarget(null);
    setNoteText('');
  };

  const doSuspend = () => {
    if (!suspendTarget) return;
    if (!noteText.trim()) {
      message.warning('请填写暂挂原因');
      return;
    }
    entities.actions.suspendAlarm(suspendTarget.id, noteText, '王建国');
    message.success('告警已暂挂（数据恢复与人工关闭为独立状态）');
    setSuspendTarget(null);
    setNoteText('');
  };

  const statusCount = {
    pending: entities.alarms.filter((a) => a.status === 'pending').length,
    processing: entities.alarms.filter((a) => a.status === 'processing').length,
    reviewing: entities.alarms.filter((a) => a.status === 'reviewing').length,
    closed: entities.alarms.filter((a) => a.status === 'closed').length,
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['告警与工单', '告警中心']}
        title="告警中心"
        subtitle={
          <Space size={10} wrap>
            <span>待确认 {statusCount.pending} · 处理中 {statusCount.processing} · 待复核 {statusCount.reviewing} · 已关闭 {statusCount.closed}</span>
            <span className="muted">流程：新发生 → 待确认 → 处理中 → 待复核 → 已关闭；误报需说明原因，不删除历史数据</span>
          </Space>
        }
        extra={<ExportButton filename="告警事件清单" sheet={exportSheet} metaNote="告警事件导出；状态与责任人口径与页面一致" />}
      />
      <div className="filter-bar">
        <Select size="small" style={{ width: 110 }} value={statusFilter} onChange={setStatusFilter} options={[
          { value: 'all', label: '全部状态' },
          { value: 'pending', label: '待确认' },
          { value: 'processing', label: '处理中' },
          { value: 'reviewing', label: '待复核' },
          { value: 'suspended', label: '暂挂' },
          { value: 'closed', label: '已关闭' },
        ]} />
        <Select size="small" style={{ width: 100 }} value={severityFilter} onChange={setSeverityFilter} options={[
          { value: 'all', label: '全部级别' },
          { value: 'critical', label: '严重' },
          { value: 'major', label: '重要' },
          { value: 'minor', label: '一般' },
        ]} />
        <Select size="small" style={{ width: 100 }} value={energyFilter} onChange={setEnergyFilter} options={[
          { value: 'all', label: '全部能源' },
          ...['electricity', 'water', 'gas'].map((e) => ({ value: e, label: ENERGY_LABEL[e as 'electricity'] })),
        ]} />
        <Select size="small" style={{ width: 110 }} value={campusFilter} onChange={setCampusFilter} options={[
          { value: 'all', label: '全部校区' },
          ...entities.campuses.filter((c) => allowed.includes(c.id)).map((c) => ({ value: c.id, label: c.name })),
        ]} />
        <Input size="small" allowClear placeholder="搜索事件/建筑" style={{ width: 180 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <span className="muted small">点击行查看完整时间线与原始曲线溯源</span>
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        onRow={(r) => ({ onClick: () => navigate(`/alarms/${r.id}`), style: { cursor: 'pointer' } })}
        columns={[
          { title: '事件编号', dataIndex: 'code', width: 130 },
          {
            title: '事件', dataIndex: 'title', render: (v: string, r) => (
              <Space size={6}>
                <SeverityTag severity={r.severity} />
                <span>{v}</span>
              </Space>
            ),
          },
          { title: '建筑', width: 130, render: (_v, r) => entities.buildings.find((b) => b.id === r.buildingId)?.name ?? '—' },
          { title: '点位', dataIndex: 'pointId', width: 100, render: (v: string | null) => v ?? '—' },
          { title: '发生时间', dataIndex: 'time', width: 140 },
          { title: '状态', dataIndex: 'status', width: 84, render: (s: string) => <AlarmStatusTag status={s} /> },
          { title: '责任人', dataIndex: 'handler', width: 84, render: (v: string | null) => v ?? '—' },
          {
            title: '工单', dataIndex: 'workOrderId', width: 130,
            render: (v: string | null) => v ? <Link to="/work-orders" onClick={(e) => e.stopPropagation()}>{v}</Link> : '—',
          },
          {
            title: '操作', width: 190, render: (_v, r) => {
              if (!handleable) return <span className="muted small">需处置权限</span>;
              const stop = (fn: () => void) => (e: { stopPropagation: () => void }) => { e.stopPropagation(); fn(); };
              return (
                <Space size={4}>
                  {r.status === 'pending' && <a onClick={stop(() => { setConfirmForm({ handler: '', note: '' }); setConfirmTarget(r); })}>确认</a>}
                  {r.status === 'pending' && <a onClick={stop(() => { setNoteText(''); setFalseTarget(r); })} style={{ color: '#873800' }}>误报</a>}
                  {(r.status === 'pending' || r.status === 'processing') && <a onClick={stop(() => { setNoteText(''); setSuspendTarget(r); })}>暂挂</a>}
                  {r.status === 'closed' && <Tooltip title="重新打开进入待确认"><a onClick={stop(() => { entities.actions.updateAlarmTimeline(r.id, { time: dayjs().format('YYYY-MM-DD HH:mm'), actor: '王建国', action: '重新打开', note: '复核发现异常复现，重新进入待确认' }, 'pending'); message.success('告警已重新打开'); })}>重开</a></Tooltip>}
                  <a onClick={stop(() => navigate(`/alarms/${r.id}`))}>详情</a>
                </Space>
              );
            },
          },
        ]}
        expandable={{
          expandedRowRender: (r) => (
            <div style={{ padding: '4px 8px' }}>
              {r.timeline.map((t, i) => (
                <div key={i} className="small">
                  <Tag color="blue">{t.time}</Tag>
                  <b>{t.action}</b>（{t.actor}）：{t.note}
                </div>
              ))}
            </div>
          ),
        }}
      />

      <Modal
        title={`确认告警：${confirmTarget?.title ?? ''}`}
        open={!!confirmTarget}
        onOk={doConfirm}
        onCancel={() => setConfirmTarget(null)}
        okText="确认并进入处理"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div className="small">检测值：{confirmTarget?.detectedValue}；阈值：{confirmTarget?.threshold}</div>
          <Select
            style={{ width: '100%' }}
            placeholder="指定确认责任人"
            value={confirmForm.handler || undefined}
            onChange={(v) => setConfirmForm({ ...confirmForm, handler: v })}
            options={entities.users.map((u) => ({ value: u.name, label: `${u.name}（${u.title}）` }))}
          />
          <Input.TextArea
            rows={3}
            placeholder="确认说明（区分采集故障与真实用能异常，作为时间线证据）"
            value={confirmForm.note}
            onChange={(e) => setConfirmForm({ ...confirmForm, note: e.target.value })}
          />
        </Space>
      </Modal>

      <Modal
        title={`判定误报：${falseTarget?.title ?? ''}`}
        open={!!falseTarget}
        onOk={doFalse}
        onCancel={() => setFalseTarget(null)}
        okText="确认误报并关闭"
        cancelText="取消"
      >
        <Input.TextArea rows={3} placeholder="误报原因说明（必填，事件与历史能耗保留）" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </Modal>

      <Modal
        title={`暂挂告警：${suspendTarget?.title ?? ''}`}
        open={!!suspendTarget}
        onOk={doSuspend}
        onCancel={() => setSuspendTarget(null)}
        okText="暂挂"
        cancelText="取消"
      >
        <Input.TextArea rows={3} placeholder="暂挂原因（如等待IoT补传后再判断）" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
      </Modal>
    </div>
  );
}