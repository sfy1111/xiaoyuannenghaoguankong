import { useMemo, useState } from 'react';
import { App, Button, Descriptions, Drawer, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { BillStatusTag } from '../../components/StatusTags';
import { canApprove, canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { allBillRows } from '../../services/costService';
import { fmtInt, fmtMoney } from '../../domain/units';
import type { BillRow } from '../../services/costService';

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'archived';

export default function CostsBillsPage() {
  const { message, modal } = App.useApp();
  const entities = getEntities();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [energyFilter, setEnergyFilter] = useState<string>('all');
  const [detail, setDetail] = useState<BillRow | null>(null);
  const [reasonTarget, setReasonTarget] = useState<BillRow | null>(null);
  const [reasonText, setReasonText] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [form] = Form.useForm();
  const approvable = canApprove('costs');
  const editable = canEdit('costs');

  const rows = useMemo(() => {
    let list = allBillRows();
    if (statusFilter !== 'all') list = list.filter((b) => b.status === statusFilter);
    if (energyFilter !== 'all') list = list.filter((b) => b.energyType === energyFilter);
    return list;
  }, [statusFilter, energyFilter, entities]);

  const submitReason = () => {
    if (!reasonTarget) return;
    if (!reasonText.trim()) {
      message.warning('请填写差异原因');
      return;
    }
    entities.actions.setBillReview(reasonTarget.id, { differenceReason: reasonText });
    message.success('差异原因已填写并记录审计');
    setReasonTarget(null);
    setReasonText('');
  };

  const submitEntry = async () => {
    const v = await form.validateFields();
    const bill = entities.actions.addBill({
      period: v.period.format('YYYY-MM'),
      energyType: v.energyType,
      campusId: v.campusId,
      billNo: v.billNo,
      billedUsage: v.billedUsage,
      billedAmount: v.billedAmount,
      differenceReason: v.differenceReason,
      entryNote: v.entryNote,
    });
    if (!bill) {
      message.error('录入被阻止：账单编号已存在或数值非法（抄见量/金额须为非负数）');
      return;
    }
    message.success(`账单 ${bill.billNo} 已录入并进入待核对，系统将自动与平台测算比对差额`);
    setEntryOpen(false);
  };

  const exportSheet = {
    name: '账单核对',
    headers: ['账期', '能源', '供应商', '校区', '账单编号', '抄见量', '账单金额(元)', '平台测算(元)', '差额(元)', '差异率(%)', '差异原因', '审核状态'],
    rows: rows.map((b) => [
      b.period,
      b.energyType === 'electricity' ? '电' : b.energyType === 'water' ? '水' : '气',
      b.supplier,
      entities.campuses.find((c) => c.id === b.campusId)?.name ?? b.campusId,
      b.billNo,
      fmtInt(b.billedUsage),
      Math.round(b.billedAmount),
      Math.round(b.estimatedAmount),
      Math.round(b.difference),
      b.differencePct === null ? '不可计算' : b.differencePct.toFixed(2),
      b.differenceReason ?? '待填写',
      b.status === 'pending' ? '待核对' : b.status === 'confirmed' ? '已核对' : '已归档',
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能源费用', '账单核对']}
        title="能源账单核对"
        subtitle={
          <Space size={8} wrap>
            <span>账单金额（供应商）固定不变；平台测算随价格方案与有效数据重算；差额拆解为用量差/价格差/固定费差/计量期错位差</span>
            <span className="muted">审批前状态为“待核对”</span>
          </Space>
        }
        extra={
          <Space>
            {editable && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); form.setFieldsValue({ period: dayjs(), energyType: 'electricity', campusId: 'C-E', billedUsage: 0, billedAmount: 0 }); setEntryOpen(true); }}>录入账单</Button>}
            <ExportButton filename="账单核对表" sheet={exportSheet} metaNote={`对账口径：供应商账单 vs 平台测算；生成时间：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`} />
          </Space>
        }
      />
      <div className="filter-bar">
        <Segmented
          size="small"
          value={statusFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'pending', label: '待核对' },
            { value: 'confirmed', label: '已核对' },
            { value: 'archived', label: '已归档' },
          ]}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <Select size="small" style={{ width: 110 }} value={energyFilter} onChange={setEnergyFilter} options={[
          { value: 'all', label: '全部能源' },
          { value: 'electricity', label: '电费账单' },
          { value: 'water', label: '水费账单' },
          { value: 'gas', label: '气费账单' },
        ]} />
        <span className="muted small">共 {rows.length} 张账单；待核对 {rows.filter((b) => b.status === 'pending').length} 张</span>
      </div>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 12 }}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: '账期', dataIndex: 'period', width: 84 },
          {
            title: '能源', dataIndex: 'energyType', width: 60,
            render: (e: string) => <Tag color={e === 'electricity' ? 'blue' : e === 'water' ? 'cyan' : 'orange'}>{e === 'electricity' ? '电' : e === 'water' ? '水' : '气'}</Tag>,
          },
          { title: '校区', dataIndex: 'campusId', width: 76, render: (c: string) => c === 'C-E' ? '东校区' : '西校区' },
          { title: '供应商', dataIndex: 'supplier', width: 130 },
          { title: '抄见量', dataIndex: 'billedUsage', width: 100, align: 'right' as const, render: (v: number) => fmtInt(v) },
          { title: '账单金额', dataIndex: 'billedAmount', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(Math.round(v)) },
          { title: '平台测算', dataIndex: 'estimatedAmount', width: 110, align: 'right' as const, render: (v: number) => fmtMoney(Math.round(v)) },
          {
            title: '差额', dataIndex: 'difference', width: 110, align: 'right' as const,
            render: (v: number, r) => (
              <span style={{ color: Math.abs(v) > 1000 ? '#cf1322' : Math.abs(v) > 100 ? '#d48806' : undefined }}>
                {fmtMoney(Math.round(v))}{r.differencePct !== null && <span className="muted small">（{r.differencePct > 0 ? '+' : ''}{r.differencePct.toFixed(2)}%）</span>}
              </span>
            ),
          },
          { title: '差异原因', dataIndex: 'differenceReason', ellipsis: true, render: (v: string | null) => v ?? <Tag color="orange">待填写</Tag> },
          { title: '状态', dataIndex: 'status', width: 84, render: (s: string) => <BillStatusTag status={s} /> },
          {
            title: '操作', width: 140,
            render: (_v, b) => (
              <Space size={4}>
                {editable && b.status === 'pending' && <a onClick={(e) => { e.stopPropagation(); setReasonText(''); setReasonTarget(b); }}>填写差异原因</a>}
                {approvable && b.status === 'pending' && b.differenceReason && (
                  <a onClick={(e) => {
                    e.stopPropagation();
                    modal.confirm({
                      title: '标记已核对',
                      content: `账期 ${b.period}（${b.supplier}）核对通过？差异 ${fmtMoney(Math.round(b.difference))} 将登记原因并锁定该月对账。`,
                      onOk: () => {
                        entities.actions.setBillReview(b.id, { status: 'confirmed' });
                        message.success('账单已核对完成，写入审计');
                      },
                    });
                  }}>核对</a>
                )}
                {approvable && b.status === 'confirmed' && (
                  <a onClick={(e) => {
                    e.stopPropagation();
                    modal.confirm({
                      title: '归档账单',
                      content: `归档后账单与差异说明进入存档状态，原始账单附件不可被覆盖。`,
                      onOk: () => {
                        entities.actions.setBillReview(b.id, { status: 'archived' });
                        message.success('账单已归档');
                      },
                    });
                  }}>归档</a>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={680} title={detail ? `${detail.period} · ${detail.supplier}（${detail.billNo}）` : ''}>
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="账期">{detail.period}</Descriptions.Item>
              <Descriptions.Item label="能源">{detail.energyType === 'electricity' ? '电' : detail.energyType === 'water' ? '水' : '气'}</Descriptions.Item>
              <Descriptions.Item label="计费计量点">{detail.billingPointIds.join('、')}</Descriptions.Item>
              <Descriptions.Item label="校区">{detail.campusId === 'C-E' ? '东校区' : '西校区'}</Descriptions.Item>
              <Descriptions.Item label="抄见量">{fmtInt(detail.billedUsage)}</Descriptions.Item>
              <Descriptions.Item label="平台测算用量">{fmtInt(Math.round(detail.estimatedUsage))}</Descriptions.Item>
              <Descriptions.Item label="账单金额">{fmtMoney(Math.round(detail.billedAmount))}</Descriptions.Item>
              <Descriptions.Item label="平台测算金额">{fmtMoney(Math.round(detail.estimatedAmount))}</Descriptions.Item>
              <Descriptions.Item label="差额">{fmtMoney(Math.round(detail.difference))}（{detail.differencePct === null ? '不可计算' : detail.differencePct.toFixed(2) + '%'}）</Descriptions.Item>
              <Descriptions.Item label="状态"><BillStatusTag status={detail.status} /></Descriptions.Item>
              <Descriptions.Item label="价格方案" span={2}>{detail.planNote}</Descriptions.Item>
              <Descriptions.Item label="差异拆解" span={2}>{detail.differenceCategories.join('；')}</Descriptions.Item>
              <Descriptions.Item label="差异原因" span={2}>{detail.differenceReason ?? <Tag color="orange">待填写</Tag>}</Descriptions.Item>
              {detail.extraFeeNote && <Descriptions.Item label="账单附加项" span={2}>{detail.extraFeeNote}：{fmtMoney(detail.extraFee)}（平台测算口径不含该项，仅展示解释差异）</Descriptions.Item>}
            </Descriptions>
            <div className="muted small">
              核对要求：差异应拆分为用量差、价格差、固定费/税费差、计量期错位差分别排查；原始账单附件不可被默默覆盖；
              严禁将人工估算的监测费用当作付款凭据。10月账单尚未出账（供应商月结后导入）。
            </div>
          </Space>
        )}
      </Drawer>

      <Modal
        title={`填写差异原因：${reasonTarget?.period ?? ''}（${reasonTarget ? reasonTarget.energyType === 'electricity' ? '电费' : reasonTarget.energyType === 'water' ? '水费' : '气费' : ''}）`}
        open={!!reasonTarget}
        onOk={submitReason}
        onCancel={() => setReasonTarget(null)}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <div className="small">
            差额 {fmtMoney(Math.round(reasonTarget?.difference ?? 0))}，拆解：{reasonTarget?.differenceCategories.join('；')}
          </div>
          <Input.TextArea rows={3} placeholder="差异原因（如：含基本电费及功率因数调整费/抄表期错位/阶梯计费差）" value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
        </Space>
      </Modal>

      <Modal
        title="录入供应商账单（月结后导入）"
        open={entryOpen}
        onOk={submitEntry}
        onCancel={() => setEntryOpen(false)}
        okText="保存（进入待核对）"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="period" label="账期" rules={[{ required: true }]}><DatePicker picker="month" /></Form.Item>
            <Form.Item name="energyType" label="能源" rules={[{ required: true }]}>
              <Select style={{ width: 110 }} options={[
                { value: 'electricity', label: '电费' },
                { value: 'water', label: '水费' },
                { value: 'gas', label: '气费' },
              ]} />
            </Form.Item>
            <Form.Item name="campusId" label="校区" rules={[{ required: true }]}>
              <Select style={{ width: 110 }} options={entities.campuses.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
          </Space>
          <Form.Item name="billNo" label="账单编号（唯一）" rules={[{ required: true }]}><Input placeholder="如 EL2026100117" /></Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="billedUsage" label="抄见量（kWh/m³）" rules={[{ required: true }, { type: 'number', min: 0, message: '须为非负数值' }]}><InputNumber style={{ width: 160 }} /></Form.Item>
            <Form.Item name="billedAmount" label="账单金额（元）" rules={[{ required: true }, { type: 'number', min: 0, message: '须为非负数值' }]}><InputNumber style={{ width: 160 }} /></Form.Item>
          </Space>
          <Form.Item name="differenceReason" label="已知差异说明（可选）"><Input placeholder="如 含基本电费与功率因数调整" /></Form.Item>
          <Form.Item name="entryNote" label="附件/凭据说明"><Input placeholder="如 账单PDF扫描件编号（附件留档，不可被覆盖）" /></Form.Item>
          <div className="muted small">
            录入后系统自动与平台测算比对差额并进入“待核对”；账单金额固定不随后续价格重算变化（与价格页联动演示一致）。
          </div>
        </Form>
      </Modal>
      <div className="muted small mt8">
        注：2026年9月东校区电费账单含“基本电费及功率因数调整费”（平台测算口径不含该项），为演示对账差异的典型场景。
      </div>
    </div>
  );
}