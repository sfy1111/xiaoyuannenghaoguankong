import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { canEdit, canApprove } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { electricityCost, trialElectricityCost } from '../../services/costService';
import { ENERGY_LABEL, fmtInt, fmtMoney } from '../../domain/units';
import { findPriceOverlap } from '../../domain/energy/tou';
import type { EnergyType, PricePlan } from '../../domain/types';

type EnergyTab = 'electricity' | 'water' | 'gas';

export default function CostsPricingPage() {
  const { message, modal } = App.useApp();
  const entities = getEntities();
  const [tab, setTab] = useState<EnergyTab>('electricity');
  const [editPlan, setEditPlan] = useState<PricePlan | 'new' | null>(null);
  const [trialFrom, setTrialFrom] = useState('2026-09-01');
  const [trialTo, setTrialTo] = useState('2026-09-30');
  const [form] = Form.useForm();
  const editable = canEdit('costs');
  const approvable = canApprove('costs');

  const plans = useMemo(
    () => entities.prices.filter((p) => p.energyType === tab).sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)),
    [entities, tab],
  );

  const changeLogs = entities.auditLogs.filter((l) => l.module === '费用管理').slice(0, 8);

  const feedIds = entities.meteringPoints
    .filter((p) => p.energyType === 'electricity' && !p.buildingId && p.role === 'main')
    .map((p) => p.id);

  const submitPlan = async () => {
    const v = await form.validateFields();
    const existing = editPlan !== 'new' && editPlan !== null ? plans.find((p) => p.id === editPlan.id) ?? null : null;
    const planId = existing?.id ?? `PR-${tab}-${Date.now().toString().slice(-5)}`;
    const plan: PricePlan = {
      id: planId,
      code: v.code,
      name: v.name,
      energyType: tab,
      supplier: v.supplier,
      validFrom: v.validFrom.format('YYYY-MM-DD'),
      validTo: v.validTo.format('YYYY-MM-DD'),
      status: 'active',
      applicableScope: v.applicableScope,
      currency: '元',
      billingUnit: tab === 'electricity' ? 'kWh' : 'm³',
      ...(tab === 'electricity'
        ? {
          segments: [
            { key: 'tip', name: '尖峰', start: '19:00', end: '21:00', price: v.tip },
            { key: 'peak', name: '高峰', start: '08:00', end: '12:00', price: v.peak },
            { key: 'peak2', name: '高峰', start: '17:00', end: '19:00', price: v.peak },
            { key: 'flat', name: '平段', start: '12:00', end: '17:00', price: v.flat },
            { key: 'flat3', name: '平段', start: '21:00', end: '23:00', price: v.flat },
            { key: 'valley', name: '低谷', start: '23:00', end: '08:00', price: v.valley },
          ],
        }
        : {
          price: v.price,
          ...(tab === 'water' ? { waterBase: v.waterBase, sewageFee: v.sewageFee } : {}),
        }),
      note: v.note,
      version: (existing?.version ?? 0) + 1,
    };
    const overlapWith = entities.prices.find((p) => findPriceOverlap(plan, p));
    if (overlapWith) {
      message.error(`保存被阻止：与「${overlapWith.name}」（${overlapWith.validFrom}至${overlapWith.validTo}）有效期重叠，同一对象相同计费时间不得有冲突价格版本`);
      return;
    }
    const ok = entities.actions.savePricePlan(plan);
    if (ok) {
      message.success(approvable
        ? '价格方案已保存并经财务确认生效；费用页对相应期间重新估算，供能账单原金额不变'
        : '价格方案已保存（财务确认后生效）');
      setEditPlan(null);
    }
  };

  const openEdit = (plan: PricePlan | 'new') => {
    if (plan === 'new') {
      form.resetFields();
      form.setFieldsValue({
        code: `PR-${tab.toUpperCase()}-2026C`,
        name: tab === 'electricity' ? '新分时电价方案' : tab === 'water' ? '新综合水价方案' : '新天然气价格方案',
        supplier: tab === 'gas' ? '明川市燃气公司' : tab === 'water' ? '明川市自来水公司' : '明川市供电公司',
        validFrom: dayjs('2026-11-01'),
        validTo: dayjs('2027-04-30'),
        tip: 1.3, peak: 1.06, flat: 0.65, valley: 0.35,
        price: 4.3, waterBase: 3.28, sewageFee: 1.02,
        applicableScope: tab === 'electricity' ? '全校各进线关口表' : tab === 'water' ? '各校区总进水表' : '食堂、能源站燃气表',
        note: '仅含电度电价/合同单价，不含附加费用',
      });
    } else {
      form.setFieldsValue({
        code: plan.code,
        name: plan.name,
        supplier: plan.supplier,
        validFrom: dayjs(plan.validFrom),
        validTo: dayjs(plan.validTo),
        applicableScope: plan.applicableScope,
        note: plan.note,
        ...(tab === 'electricity'
          ? {
            tip: plan.segments?.find((s) => s.name === '尖峰')?.price,
            peak: plan.segments?.find((s) => s.name === '高峰')?.price,
            flat: plan.segments?.find((s) => s.name === '平段')?.price,
            valley: plan.segments?.find((s) => s.name === '低谷')?.price,
          }
          : { price: plan.price, waterBase: plan.waterBase, sewageFee: plan.sewageFee }),
      });
    }
    setEditPlan(plan);
  };

  const currentPlan = entities.prices.filter((p) => p.energyType === 'electricity');
  const planA = currentPlan.find((p) => p.id === 'PR-E-A');
  const planB = currentPlan.find((p) => p.id === 'PR-E-B');
  const trialCurrent = electricityCost(feedIds, trialFrom, trialTo);
  const trialWithA = planA ? trialElectricityCost(feedIds, trialFrom, trialTo, planA) : null;

  return (
    <div>
      <PageHeader
        breadcrumb={['能源费用', '价格方案管理']}
        title="电/水/气价格方案管理"
        subtitle={
          <Space size={8} wrap>
            <span>同一对象相同计费时间不得有冲突价格版本；有效期变更后费用测算按新方案重新计算，供能账单金额不被改写</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
        extra={editable ? <Button size="small" type="primary" onClick={() => openEdit('new')}>新增价格方案</Button> : <span className="muted small">当前角色仅可查看</span>}
      />
      <div className="filter-bar">
        <Segmented
          size="small"
          value={tab}
          options={[
            { value: 'electricity', label: `分时电价（${ENERGY_LABEL.electricity}）` },
            { value: 'water', label: '水价' },
            { value: 'gas', label: '气价' },
          ]}
          onChange={(v) => setTab(v as EnergyTab)}
        />
      </div>

      <Table
        size="small"
        rowKey="id"
        pagination={false}
        dataSource={plans}
        columns={[
          { title: '方案编码', dataIndex: 'code', width: 130 },
          { title: '名称', dataIndex: 'name' },
          {
            title: '有效期', width: 190,
            render: (_v, p) => `${p.validFrom} 至 ${p.validTo}`,
          },
          {
            title: '价格构成', render: (_v, p) =>
              tab === 'electricity'
                ? (p.segments ?? []).filter((s, i, arr) => arr.findIndex((x) => x.name === s.name) === i).map((s) => `${s.name}${s.price}`).join(' / ') + ' 元/kWh'
                : tab === 'water'
                  ? `水资源费 ${p.waterBase} + 污水处理费 ${p.sewageFee} = ${p.price} 元/m³`
                  : `${p.price} 元/m³`,
          },
          {
            title: '状态', dataIndex: 'status', width: 80,
            render: (s: string, p) => {
              const activeNow = p.validFrom <= dayjs(META.asOf).format('YYYY-MM-DD') && p.validTo >= dayjs(META.asOf).format('YYYY-MM-DD');
              return <Tag color={activeNow ? 'green' : s === 'active' ? 'blue' : 'default'}>{activeNow ? '当前执行' : s === 'active' ? '有效' : '已停用'}</Tag>;
            },
          },
          {
            title: '操作', width: 120,
            render: (_v, p) => editable ? (
              <Space size={6}>
                <a onClick={() => openEdit(p)}>编辑</a>
                {p.status === 'active' && dayjs(p.validFrom).isAfter(dayjs(META.asOf)) && (
                  <a style={{ color: '#cf1322' }} onClick={() => {
                    modal.confirm({
                      title: '停用价格方案',
                      content: `停用「${p.name}」？已过账期测算结果不受影响，未生效期间将无适用价格（费用测算显示不可计算）。`,
                      onOk: () => {
                        entities.actions.deactivatePricePlan(p.id);
                        message.success('方案已停用');
                      },
                    });
                  }}>停用</a>
                )}
              </Space>
            ) : null,
          },
        ]}
        expandable={{
          expandedRowRender: (p) => (
            <div className="small">
              <div>适用范围：{p.applicableScope}；{p.note}</div>
              {tab === 'electricity' && (
                <div className="mt8">
                  时段表：
                  {(p.segments ?? []).map((s) => `${s.name} ${s.start}-${s.end}（${s.price}元）`).join('；')}
                </div>
              )}
            </div>
          ),
        }}
      />

      <div className="chart-grid c2 mt12">
        <ChartCard
          title="价格方案试算（费用联动演示）"
          height={280}
          note={`对 ${trialFrom} 至 ${trialTo} 用既有电量分别按现行方案与旧方案试算；账单页测算值随现行方案变化`}
        >
          <EnergyBarChart
            x={['现行有效方案', 'PR-E-A 旧方案']}
            series={[{
              name: '试算电费',
              data: [Math.round(trialCurrent.amount), trialWithA ? Math.round(trialWithA.amount) : null],
              color: '#1668dc',
            }]}
            unit="元"
            height={270}
            showLegend={false}
          />
        </ChartCard>
        <div className="table-card" style={{ background: '#fff', borderRadius: 8, border: '1px solid rgba(5,5,5,0.06)', padding: '8px 12px' }}>
          <h4 className="section-title">试算条件与结果</h4>
          <Space direction="vertical" size={6}>
            <Space>
              <DatePicker size="small" value={dayjs(trialFrom)} onChange={(v) => v && setTrialFrom(v.format('YYYY-MM-DD'))} />
              <span>至</span>
              <DatePicker size="small" value={dayjs(trialTo)} onChange={(v) => v && setTrialTo(v.format('YYYY-MM-DD'))} />
            </Space>
            <div className="small">试算电量：{fmtInt(Math.round(trialCurrent.usage))} kWh</div>
            <div className="small">现行方案金额：{fmtMoney(Math.round(trialCurrent.amount))}（{planB?.name}）</div>
            {trialWithA && <div className="small">旧方案PR-E-A金额：{fmtMoney(Math.round(trialWithA.amount))}，差额 {fmtMoney(Math.round(trialCurrent.amount - trialWithA.amount))}</div>}
            <div className="muted small">试算不改变账单与已保存方案；电表无最大需量信息，需量/容量费用不做虚构。</div>
          </Space>
        </div>
      </div>

      <div className="table-card mt12">
        <h4 className="section-title">价格变更记录（审计）</h4>
        <Table
          size="small"
          rowKey="id"
          pagination={false}
          dataSource={changeLogs}
          columns={[
            { title: '时间', dataIndex: 'time', width: 140 },
            { title: '操作人', dataIndex: 'actor', width: 90 },
            { title: '操作', dataIndex: 'action', width: 110 },
            { title: '对象', dataIndex: 'objectId', width: 110 },
            { title: '说明', dataIndex: 'detail' },
          ]}
        />
      </div>

      <Modal
        title={editPlan === 'new' ? `新增${tab === 'electricity' ? '电价' : tab === 'water' ? '水价' : '气价'}方案` : '编辑价格方案'}
        open={!!editPlan}
        onOk={submitPlan}
        onCancel={() => setEditPlan(null)}
        okText="保存（校验有效期重叠）"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="code" label="方案编码" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="name" label="方案名称" rules={[{ required: true }]}><Input /></Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="supplier" label="供应商" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="validFrom" label="生效日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
            <Form.Item name="validTo" label="失效日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
          </Space>
          {tab === 'electricity' ? (
            <Space size={12} style={{ display: 'flex' }}>
              <Form.Item name="tip" label="尖峰(19-21时) 元/kWh" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
              <Form.Item name="peak" label="高峰 元/kWh" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
              <Form.Item name="flat" label="平段 元/kWh" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
              <Form.Item name="valley" label="低谷(23-8时) 元/kWh" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
            </Space>
          ) : (
            <Space size={12} style={{ display: 'flex' }}>
              <Form.Item name="price" label={tab === 'water' ? '综合水价 元/m³' : '气价 元/m³'} rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
              {tab === 'water' && (
                <>
                  <Form.Item name="waterBase" label="水资源费" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
                  <Form.Item name="sewageFee" label="污水处理费" rules={[{ required: true }]}><InputNumber step={0.01} /></Form.Item>
                </>
              )}
            </Space>
          )}
          <Form.Item name="applicableScope" label="适用范围" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="note" label="备注（含/不含费用项说明）" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
        </Form>
        <div className="muted small">保存时系统将校验：同一对象、同能源、有效期重叠冲突将被阻止（流程D）。</div>
      </Modal>
    </div>
  );
}