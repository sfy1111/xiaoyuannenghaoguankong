import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag, Progress } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { CampusSelect, FilterBar } from '../../components/FilterBar';
import { useFilters } from '../../stores/filters';
import { canApprove } from '../../stores/identity';
import { getEntities, budget } from '../../services/repository';
import { campusMonthlyEstimate } from '../../services/costService';
import { fmtMoney } from '../../domain/units';
import { rangeMonths } from '../../domain/time';

type EnergyKey = 'electricity' | 'water' | 'gas';

const LABEL: Record<EnergyKey, string> = { electricity: '电费', water: '水费', gas: '气费' };

export default function CostsBudgetPage() {
  const { campusId } = useFilters();
  const { message } = App.useApp();
  const [energy, setEnergy] = useState<EnergyKey>('electricity');
  const [anchor, setAnchor] = useState('2026-10-20');
  const [adjOpen, setAdjOpen] = useState(false);
  const [form] = Form.useForm();
  const entities = getEntities();
  const approvable = canApprove('costs');

  const months = rangeMonths('2026-01', '2026-10');
  const data = useMemo(() => {
    const adjOf = (m: string) => entities.budgetAdjustments.find((a) => a.month === m && a.energyType === energy);
    const rows = months.map((m) => {
      const budgetRow = budget.monthlyBudget.find((b) => b.month === m);
      const adjustment = adjOf(m);
      const bud = adjustment ? adjustment.amount : budgetRow ? budgetRow[energy] : 0;
      const est = campusMonthlyEstimate(campusId, m);
      const actual = est[energy]?.amount ?? 0;
      const executed = m <= '2026-09';
      return {
        key: m,
        month: m,
        budget: bud,
        adjusted: !!adjustment,
        actual: executed ? Math.round(actual) : null,
        estimate: executed ? null : Math.round(actual),
        usageRate: bud > 0 && actual > 0 ? actual / bud : null,
        risk: bud > 0 && actual > bud * 1.0 ? 'over' : bud > 0 && actual > bud * 0.95 ? 'warn' : 'ok',
      };
    });
    const yearBudget = rows.reduce((a, b) => a + b.budget, 0);
    const yearActualOrEst = rows.reduce((a, r) => a + (r.actual ?? r.estimate ?? 0), 0);
    const completed = rows.filter((r) => r.actual !== null).reduce((a, r) => a + (r.actual ?? 0), 0);
    return { rows, yearBudget, yearActualOrEst, completed, adjustments: entities.budgetAdjustments };
  }, [months, energy, campusId, entities]);

  const openAdj = (month?: string) => {
    form.resetFields();
    form.setFieldsValue({
      month: dayjs((month ?? '2026-11') + '-01'),
      energyType: energy,
      amount: data.rows.find((r) => r.month === month)?.budget ?? 300000,
    });
    setAdjOpen(true);
  };

  const submitAdj = async () => {
    const v = await form.validateFields();
    if (!v.reason.trim()) {
      message.warning('请填写调整原因（审计留痕，原预算版本保留）');
      return;
    }
    entities.actions.adjustBudget(v.month.format('YYYY-MM'), v.energyType, v.amount, v.reason);
    message.success('预算已调整：原版本与调整记录保留，趋势图按调整后口径展示');
    setAdjOpen(false);
  };

  const exportSheet = {
    name: '预算执行',
    headers: ['月份', `预算(${LABEL[energy]})`, `实际已结算`, '系统测算（未结算月）', '执行率', '超支风险', '是否调整'],
    rows: data.rows.map((r) => [
      r.month, Math.round(r.budget), r.actual ?? '—', r.estimate ?? '—',
      r.usageRate === null ? '不可计算' : `${(r.usageRate * 100).toFixed(1)}%`,
      r.risk === 'over' ? '超支' : r.risk === 'warn' ? '接近上限' : '正常',
      r.adjusted ? '调整后' : '',
    ]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['能源费用', '能源预算']}
        title="能源预算与超支分析"
        subtitle={
          <Space size={8} wrap>
            <span>已结算实际、系统测算与预测建议值分列，不混列；预算调整保留原版本（审计留痕）</span>
            <span className="muted">2026年度预算由财务处{budget.approvedBy}于 {budget.approvedAt} 批准</span>
          </Space>
        }
        extra={
          <Space>
            {approvable && <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdj()}>调整预算</Button>}
            <ExportButton filename={`能源预算_${energy}`} sheet={exportSheet} metaNote={`预测值为截至最新数据月的执行趋势建议值，不与实际已结算混列；生成时间：${dayjs('2026-10-21').format('YYYY-MM-DD HH:mm')}`} />
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">校区</span>
        <CampusSelect value={campusId} onChange={(v) => useFilters.getState().setCampus(v)} />
        <span className="filter-label">能源</span>
        <Segmented size="small" value={energy} options={(Object.keys(LABEL) as EnergyKey[]).map((k) => ({ value: k, label: LABEL[k] }))} onChange={(v) => setEnergy(v as EnergyKey)} />
        <span className="filter-label">年度</span>
        <DatePicker size="small" picker="year" value={dayjs(anchor)} allowClear={false} onChange={(v) => v && setAnchor(v.format('YYYY-MM-DD'))} />
        <span className="muted small">{data.adjustments.length} 条调整记录（原预算版本保留）</span>
      </FilterBar>

      <div className="kpi-row">
        <StatCard label="年度预算总额" value={data.yearBudget} unit="元" sub={`${LABEL[energy]}·2026年度（含调整后）`} />
        <StatCard label="已结算累计（1-9月）" value={data.completed} unit="元" sub={`执行率 ${data.yearBudget > 0 ? ((data.completed / data.yearBudget) * 100).toFixed(1) : '—'}%`} />
        <StatCard label="测算+预测累计（含10月测算）" value={data.yearActualOrEst} unit="元" sub={`预计年度执行 ${data.yearBudget > 0 ? ((data.yearActualOrEst / data.yearBudget) * 100).toFixed(1) : '—'}%（建议值）`} />
        <StatCard
          label="超支风险月份数"
          value={data.rows.filter((r) => r.risk === 'over').length}
          unit="个"
          sub={`接近上限 ${data.rows.filter((r) => r.risk === 'warn').length} 个`}
        />
      </div>

      <ChartCard title={`2026年${LABEL[energy]}预算 vs 实际/测算（元）`} height={320} note="已结算月份按实际口径；未结算月展示系统测算值（标注区别）；调整后预算在图中生效">
        <EnergyBarChart
          x={data.rows.map((r) => r.month)}
          series={[
            { name: '预算', data: data.rows.map((r) => Math.round(r.budget)), color: '#95de64' },
            { name: '实际已结算', data: data.rows.map((r) => r.actual), color: '#1668dc' },
            { name: '系统测算', data: data.rows.map((r) => r.estimate), color: '#faad14' },
          ]}
          unit="元"
          height={310}
        />
      </ChartCard>

      <div className="table-card">
        <h4 className="section-title">月度预算执行明细</h4>
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={data.rows}
          columns={[
            { title: '月份', dataIndex: 'month', width: 90 },
            {
              title: '预算(元)', dataIndex: 'budget', width: 130, align: 'right' as const,
              render: (v: number, r) => (
                <Space size={4}>
                  {fmtMoney(Math.round(v))}
                  {r.adjusted && <Tag color="purple">调整</Tag>}
                </Space>
              ),
            },
            {
              title: '实际已结算(元)', dataIndex: 'actual', width: 120, align: 'right' as const,
              render: (v: number | null) => v === null ? <span className="muted">未结算</span> : fmtMoney(v),
            },
            {
              title: '系统测算(元)', dataIndex: 'estimate', width: 120, align: 'right' as const,
              render: (v: number | null) => v === null ? <span className="muted">已结算月不重复展示</span> : <span style={{ color: '#d48806' }}>{fmtMoney(v)}（测算）</span>,
            },
            {
              title: '执行率', width: 190,
              render: (_v, r) => r.usageRate === null ? '不可计算' : (
                <Progress
                  percent={Math.round(r.usageRate * 100)}
                  size="small"
                  strokeColor={r.risk === 'over' ? '#cf1322' : r.risk === 'warn' ? '#d48806' : '#52c41a'}
                  format={(p) => `${p}%`}
                />
              ),
            },
            {
              title: '超支风险', width: 100,
              render: (_v, r) => r.risk === 'over' ? <Tag color="red">超支</Tag> : r.risk === 'warn' ? <Tag color="orange">接近上限</Tag> : <Tag color="green">正常</Tag>,
            },
            ...(approvable ? [{
              title: '', width: 90,
              render: (_v: unknown, r: { month: string }) => (
                <a onClick={() => openAdj(r.month)}>调整</a>
              ),
            }] : []),
          ]}
        />
        {data.adjustments.length > 0 && (
          <div className="mt8">
            <b className="small">预算调整记录（原版本保留）：</b>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.adjustments}
              columns={[
                { title: '调整时间', dataIndex: 'adjustedAt', width: 140 },
                { title: '调整人', dataIndex: 'adjustedBy', width: 90 },
                { title: '月份/能源', width: 130, render: (_v, a: { month: string; energyType: string }) => `${a.month} / ${LABEL[a.energyType as EnergyKey]}` },
                { title: '调整后金额(元)', dataIndex: 'amount', width: 130, align: 'right' as const, render: (v: number) => fmtMoney(v) },
                { title: '原因', dataIndex: 'reason' },
              ]}
            />
          </div>
        )}
        <div className="muted small mt8">
          口径说明：测算值基于分时电价/合同单价与有效计量数据，未含基本电费与税费（与账单差异见账单核对页）；
          预算调整、学生规模或新增建筑变化在评价说明中反映。学生规模变化与新增建筑面积影响见建筑档案与学籍数据源说明。
        </div>
      </div>

      <Modal
        title="调整预算（保留原版本）"
        open={adjOpen}
        onOk={submitAdj}
        onCancel={() => setAdjOpen(false)}
        okText="保存调整"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="month" label="月份" rules={[{ required: true }]}><DatePicker picker="month" /></Form.Item>
            <Form.Item name="energyType" label="能源" rules={[{ required: true }]}>
              <Select style={{ width: 110 }} options={[
                { value: 'electricity', label: '电费' },
                { value: 'water', label: '水费' },
                { value: 'gas', label: '气费' },
              ]} />
            </Form.Item>
            <Form.Item name="amount" label="调整后金额(元)" rules={[{ required: true }, { type: 'number', min: 0, message: '须为非负数' }]}><InputNumber style={{ width: 150 }} /></Form.Item>
          </Space>
          <Form.Item name="reason" label="调整原因（必填，写入审计）" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="如 新增实验楼投用，12月电费预算上调" /></Form.Item>
          <div className="muted small">调整后原预算版本与调整记录同时保留；预测值不与实际已结算混列。</div>
        </Form>
      </Modal>
    </div>
  );
}