import { useMemo, useState } from 'react';
import { App, Button, Descriptions, Drawer, Form, Input, Modal, Select, Space, Table, Tag, Tooltip } from 'antd';
import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { ENERGY_LABEL, fmtInt } from '../../domain/units';
import type { EnergyType, Meter } from '../../domain/types';

export default function FoundationMetersPage() {
  const { message } = App.useApp();
  const entities = getEntities();
  const [search, setSearch] = useState('');
  const [energyFilter, setEnergyFilter] = useState<'all' | EnergyType>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<Meter | null>(null);
  const [pointDrawer, setPointDrawer] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [swapTarget, setSwapTarget] = useState<Meter | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Meter | null>(null);
  const [deactivateReason, setDeactivateReason] = useState('');
  const [addForm] = Form.useForm();
  const [swapForm] = Form.useForm();
  const editable = canEdit('foundation');

  const meters = useMemo(() => {
    let list = entities.meters;
    if (energyFilter !== 'all') list = list.filter((m) => m.energyType === energyFilter);
    if (statusFilter !== 'all') list = list.filter((m) => m.status === statusFilter);
    if (search) list = list.filter((m) => m.name.includes(search) || m.meterNo.includes(search));
    return list;
  }, [entities, search, energyFilter, statusFilter]);

  const pointOf = (m: Meter) => entities.meteringPoints.find((p) => p.meterId === m.id);

  const daysToCheck = (m: Meter) => (m.nextCheck ? dayjs(m.nextCheck).diff(dayjs(META.asOf), 'day') : null);

  const submitAdd = async () => {
    const v = await addForm.validateFields();
    const created = entities.actions.addMeter({
      name: v.name, energyType: v.energyType as EnergyType, meterNo: v.meterNo, model: v.model,
      accuracy: v.accuracy, installDate: v.installDate, lastCheck: v.installDate,
      nextCheck: v.nextCheck ?? null, status: 'active', billing: !!v.billing,
      location: v.location, deviceId: `DEV-${v.meterNo}`, ratioText: v.ratioText || '直入',
    });
    if (!created) {
      message.error('表号已存在，计量器具编码必须唯一');
      return;
    }
    message.success('计量器具已入台账；需在「计量关系与点位维护」为业务计量点绑定该器具与IoT属性后方可统计');
    setAddOpen(false);
  };

  const submitSwap = async () => {
    const v = await swapForm.validateFields();
    if (!swapTarget) return;
    entities.actions.replaceMeter(
      swapTarget.id,
      {
        name: `${swapTarget.name.split('（')[0]}（新表）`,
        energyType: swapTarget.energyType,
        meterNo: v.meterNo, model: v.model, accuracy: v.accuracy,
        installDate: dayjs(META.asOf).format('YYYY-MM-DD'),
        lastCheck: dayjs(META.asOf).format('YYYY-MM-DD'),
        nextCheck: v.nextCheck ?? null, billing: swapTarget.billing,
        location: swapTarget.location, deviceId: `DEV-${v.meterNo}`, ratioText: v.ratioText || swapTarget.ratioText,
      },
      v.terminalReading,
      v.reason,
    );
    message.success(`换表完成：旧表终止示值 ${v.terminalReading} 已归档，累计读数按新表起始值重算，不产生负用量`);
    setSwapTarget(null);
  };

  const submitDeactivate = () => {
    if (!deactivateTarget) return;
    if (!deactivateReason.trim()) {
      message.warning('请填写停用理由（审计留痕）');
      return;
    }
    entities.actions.deactivateMeter(deactivateTarget.id, deactivateReason);
    message.success('计量器具已停用；关联计量点历史数据保留，需时可重新启用或换表');
    setDeactivateTarget(null);
    setDeactivateReason('');
  };

  const exportSheet = {
    name: '计量器具清册',
    headers: ['器具编码', '名称', '能源', '表号', '型号', '准确度', '安装位置', '安装日期', '最近检定', '下次检定', '状态', '是否计费'],
    rows: meters.map((m) => [
      m.id, m.name, ENERGY_LABEL[m.energyType], m.meterNo, m.model, m.accuracy, m.location,
      m.installDate, m.lastCheck, m.nextCheck ?? '—', m.status === 'active' ? '在用' : m.status === 'replaced' ? '已更换' : '停用', m.billing ? '贸易结算' : '内部计量',
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '计量器具台账']}
        title="计量器具台账"
        subtitle={`共 ${entities.meters.length} 具计量器具；换表记录旧表终止示值与新表起始示值，检定临期自动提醒。数据更新：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`}
        extra={
          <Space>
            {editable && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { addForm.resetFields(); setAddOpen(true); }}>新增器具</Button>}
            <ExportButton filename="计量器具清册" sheet={exportSheet} metaNote="依据GB 17167配备管理通则维护计量器具台账；未纳入强检目录的仪表按校内制度管理检定周期" />
          </Space>
        }
      />
      <div className="filter-bar">
        <Input allowClear size="small" prefix placeholder="搜索名称/表号" style={{ width: 200 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select size="small" style={{ width: 120 }} value={energyFilter} onChange={setEnergyFilter} options={[{ value: 'all', label: '全部能源' }, ...['electricity', 'water', 'gas', 'heat', 'cooling', 'hotWater'].map((e) => ({ value: e, label: ENERGY_LABEL[e as EnergyType] }))]} />
        <Select size="small" style={{ width: 120 }} value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '在用' }, { value: 'replaced', label: '已更换' }, { value: 'inactive', label: '停用' }]} />
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={meters}
        pagination={{ pageSize: 12 }}
        onRow={(m) => ({ onClick: () => setDetail(m), style: { cursor: 'pointer' } })}
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: '能源', dataIndex: 'energyType', width: 80, render: (e: EnergyType) => <Tag>{ENERGY_LABEL[e]}</Tag> },
          { title: '表号', dataIndex: 'meterNo', width: 130 },
          { title: '安装位置', dataIndex: 'location', width: 160 },
          { title: '倍率', dataIndex: 'ratioText', width: 150, render: (t: string) => <Tooltip title="IoT平台侧已完成倍率折算，系统按一次侧量值统计"><span className="small">{t}</span></Tooltip> },
          {
            title: '检定', width: 100,
            render: (_v, m) => {
              const days = daysToCheck(m);
              if (days === null) return <Tag>未纳入强检</Tag>;
              if (days < 60) return <Tag color="red">临期（{days}天）</Tag>;
              if (days < 180) return <Tag color="orange">{days}天</Tag>;
              return <Tag color="green">{m.nextCheck}</Tag>;
            },
          },
          {
            title: '状态', dataIndex: 'status', width: 84,
            render: (s: string) => <Tag color={s === 'active' ? 'green' : s === 'replaced' ? 'default' : 'red'}>{s === 'active' ? '在用' : s === 'replaced' ? '已更换' : '停用'}</Tag>,
          },
          {
            title: '操作', width: 130,
            render: (_v, m) => (
              <Space size={6}>
                {pointOf(m) && <a onClick={(e) => { e.stopPropagation(); setPointDrawer(pointOf(m)!.id); }}>读数</a>}
                {editable && m.status === 'active' && <a onClick={(e) => { e.stopPropagation(); swapForm.resetFields(); setSwapTarget(m); }}><SwapOutlined /> 换表</a>}
                {editable && m.status === 'active' && (
                  <a style={{ color: '#cf1322' }} onClick={(e) => { e.stopPropagation(); setDeactivateReason(''); setDeactivateTarget(m); }}>停用</a>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={640} title={detail?.name}>
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="器具编码">{detail.id}</Descriptions.Item>
              <Descriptions.Item label="表号">{detail.meterNo}</Descriptions.Item>
              <Descriptions.Item label="型号/准确度">{detail.model} / {detail.accuracy}</Descriptions.Item>
              <Descriptions.Item label="IoT设备">{detail.deviceId}</Descriptions.Item>
              <Descriptions.Item label="安装位置">{detail.location}</Descriptions.Item>
              <Descriptions.Item label="倍率说明">{detail.ratioText}</Descriptions.Item>
              <Descriptions.Item label="安装日期">{detail.installDate}</Descriptions.Item>
              <Descriptions.Item label="检定周期">{detail.lastCheck} → {detail.nextCheck ?? '未纳入强检'}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>{detail.status === 'active' ? '在用' : detail.status === 'replaced' ? '已更换' : '停用'}</Descriptions.Item>
              {detail.swap && (
                <>
                  <Descriptions.Item label="换表时间">{detail.swap.replacedAt}</Descriptions.Item>
                  <Descriptions.Item label="旧表终止示值">{fmtInt(detail.swap.terminalReading)}</Descriptions.Item>
                  <Descriptions.Item label="换表原因" span={2}>{detail.swap.reason}</Descriptions.Item>
                </>
              )}
            </Descriptions>
            {pointOf(detail) ? (
              <Button size="small" type="primary" onClick={() => setPointDrawer(pointOf(detail)!.id)}>查看关联计量点与原始读数</Button>
            ) : (
              <div className="muted">该器具尚未关联业务计量点</div>
            )}
          </Space>
        )}
      </Drawer>

      <Modal title="新增计量器具" open={addOpen} onOk={submitAdd} onCancel={() => setAddOpen(false)} okText="保存" cancelText="取消">
        <Form form={addForm} layout="vertical">
          <Form.Item name="name" label="器具名称" rules={[{ required: true }]}><Input placeholder="如 明理楼总电表" /></Form.Item>
          <Space>
            <Form.Item name="energyType" label="能源类型" rules={[{ required: true }]} initialValue="electricity">
              <Select style={{ width: 140 }} options={['electricity', 'water', 'gas', 'heat', 'cooling', 'hotWater'].map((e) => ({ value: e, label: ENERGY_LABEL[e as EnergyType] }))} />
            </Form.Item>
            <Form.Item name="meterNo" label="表号（唯一）" rules={[{ required: true }]}><Input placeholder="如 3201A01106101" /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="model" label="型号" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="accuracy" label="准确度等级" rules={[{ required: true }]} initialValue="1.0级"><Input /></Form.Item>
          </Space>
          <Space>
            <Form.Item name="installDate" label="安装日期" rules={[{ required: true }]}><Input placeholder="YYYY-MM-DD" /></Form.Item>
            <Form.Item name="nextCheck" label="下次检定日期"><Input placeholder="可留空（未纳入强检）" /></Form.Item>
          </Space>
          <Form.Item name="location" label="安装位置" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="billing" label="是否贸易结算表"><Select options={[{ value: true, label: '是' }, { value: false, label: '否（内部计量）' }]} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`换表登记：${swapTarget?.name ?? ''}`}
        open={!!swapTarget}
        onOk={submitSwap}
        onCancel={() => setSwapTarget(null)}
        okText="确认换表"
        cancelText="取消"
      >
        {swapTarget && (
          <Form form={swapForm} layout="vertical">
            <div className="muted small mb8">
              换表要求登记旧表终止示值与新表起始示值；换表时刻起累计读数重置，区间用量统计不产生负值，原历史读数保留。
            </div>
            <Space>
              <Form.Item name="meterNo" label="新表表号（唯一）" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="model" label="新表型号" rules={[{ required: true }]}><Input /></Form.Item>
              <Form.Item name="accuracy" label="准确度" rules={[{ required: true }]} initialValue={swapTarget.accuracy}><Input /></Form.Item>
            </Space>
            <Space>
              <Form.Item name="terminalReading" label="旧表终止示值" rules={[{ required: true, message: '请录入旧表终止示值' }]}><Input type="number" /></Form.Item>
              <Form.Item name="nextCheck" label="新表下次检定"><Input placeholder="YYYY-MM-DD" /></Form.Item>
            </Space>
            <Form.Item name="reason" label="换表原因" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="如 表具故障/检定到期更换" /></Form.Item>
          </Form>
        )}
      </Modal>

      <Modal
        title={`停用计量器具：${deactivateTarget?.name ?? ''}`}
        open={!!deactivateTarget}
        onOk={submitDeactivate}
        onCancel={() => setDeactivateTarget(null)}
        okText="确认停用"
        cancelText="取消"
      >
        <Input.TextArea
          rows={3}
          placeholder="停用理由（必填，审计留痕），如：表具返厂检定/回路改造"
          value={deactivateReason}
          onChange={(e) => setDeactivateReason(e.target.value)}
        />
        <div className="muted small mt8">停用后该器具退出在用清册；关联计量点历史数据与审计记录全部保留。</div>
      </Modal>

      <PointPreviewDrawer pointId={pointDrawer} open={!!pointDrawer} onClose={() => setPointDrawer(null)} />
    </div>
  );
}