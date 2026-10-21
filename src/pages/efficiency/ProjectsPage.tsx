import { useMemo, useState } from 'react';
import { App, Button, DatePicker, Descriptions, Drawer, Form, Input, InputNumber, Modal, Segmented, Select, Space, Table, Tag } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { FilterBar } from '../../components/FilterBar';
import { canEdit } from '../../stores/identity';
import { getEntities } from '../../services/repository';
import { scopeUsage, dailyRows } from '../../services/energyStats';
import { fmtInt } from '../../domain/units';
import type { EnergyProject } from '../../domain/types';

const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: '已验收', color: 'green' },
  inProgress: { label: '实施中', color: 'blue' },
  planned: { label: '计划中', color: 'default' },
};

export default function EfficiencyProjectsPage() {
  const { message } = App.useApp();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [detail, setDetail] = useState<EnergyProject | null>(null);
  const [editProject, setEditProject] = useState<EnergyProject | 'new' | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<EnergyProject | null>(null);
  const [archiveEval, setArchiveEval] = useState('');
  const entities = getEntities();
  const editable = canEdit('targets');
  const [form] = Form.useForm();

  const projects = entities.projects;

  const rows = useMemo(() => projects.filter((p) => statusFilter === 'all' || p.status === statusFilter), [statusFilter, projects]);

  const effectOf = (p: EnergyProject) => {
    if (p.status === 'planned' || !p.baseline) return null;
    const building = p.buildings[0];
    const mainIds = entities.meteringPoints.filter((x) => x.buildingId === building && x.energyType === 'electricity' && x.role === 'main').map((x) => x.id);
    if (mainIds.length === 0) return null;
    const baseRows = dailyRows(mainIds, p.baseline.from, p.baseline.to);
    const baseDays = baseRows.length || 1;
    const baseAvg = baseRows.reduce((a, r) => a + r.total, 0) / baseDays;
    const impl = dayjs(p.implementDate);
    const obsFrom = impl.isBefore(dayjs(p.baseline.to)) ? dayjs(p.baseline.to).add(1, 'day').format('YYYY-MM-DD') : p.implementDate;
    const obsDays = Math.min(30, dayjs('2026-10-20').diff(dayjs(obsFrom), 'day') + 1);
    if (obsDays <= 1) return null;
    const obsRows = dailyRows(mainIds, obsFrom, dayjs(obsFrom).add(obsDays - 1, 'day').format('YYYY-MM-DD'));
    const obsAvg = obsRows.reduce((a, r) => a + r.total, 0) / (obsRows.length || 1);
    const changePct = baseAvg > 0 ? ((obsAvg - baseAvg) / baseAvg) * 100 : null;
    return { baseAvg, obsAvg, changePct, obsFrom, obsDays };
  };

  const openEdit = (p: EnergyProject | 'new') => {
    if (p === 'new') {
      form.resetFields();
      form.setFieldsValue({
        name: '', type: '照明改造', status: 'planned', buildings: ['B-TA'],
        implementDate: dayjs('2027-01-01'),
        baselineFrom: dayjs('2026-04-01'), baselineTo: dayjs('2026-06-30'), baselineNote: '改造前同口径基期',
        measure: '', investment: 0, plannedSaving: 5, owner: '张启明', evidence: '',
      });
    } else {
      form.setFieldsValue({
        name: p.name, type: p.type, status: p.status, buildings: p.buildings,
        implementDate: dayjs(p.implementDate),
        baselineFrom: p.baseline ? dayjs(p.baseline.from) : null,
        baselineTo: p.baseline ? dayjs(p.baseline.to) : null,
        baselineNote: p.baseline?.note ?? '',
        measure: p.measure, investment: p.investment, plannedSaving: p.plannedSaving,
        owner: p.owner, evidence: p.evidence,
      });
    }
    setEditProject(p);
  };

  const save = async () => {
    const v = await form.validateFields();
    if (!v.name.trim() || !v.measure.trim()) {
      message.warning('项目名称与措施描述必填');
      return;
    }
    const baseline = v.baselineFrom && v.baselineTo
      ? { from: v.baselineFrom.format('YYYY-MM-DD'), to: v.baselineTo.format('YYYY-MM-DD'), note: v.baselineNote || '同口径基期' }
      : null;
    if (baseline && baseline.from > baseline.to) {
      message.error('基期开始不能晚于结束');
      return;
    }
    const existing = editProject !== 'new' && editProject ? projects.find((p) => p.id === editProject.id) : null;
    entities.actions.saveProject({
      id: existing?.id,
      name: v.name,
      buildings: v.buildings,
      type: v.type,
      status: v.status,
      implementDate: v.implementDate.format('YYYY-MM-DD'),
      baseline,
      measure: v.measure,
      investment: v.investment ?? 0,
      plannedSaving: v.plannedSaving ?? 0,
      owner: v.owner,
      evaluation: existing?.evaluation ?? '待实施后评估',
      evidence: v.evidence || '—',
    });
    message.success(existing ? '项目已更新（版本记录见审计）' : '节能项目已创建并入台账');
    setEditProject(null);
  };

  const doArchive = () => {
    if (!archiveTarget) return;
    if (!archiveEval.trim()) {
      message.warning('请填写验收评估结论（未经校正的变化量须标注）');
      return;
    }
    entities.actions.archiveProject(archiveTarget.id, archiveEval);
    message.success('项目已验收归档，评估结论写入审计');
    setArchiveTarget(null);
    setArchiveEval('');
  };

  const exportSheet = {
    name: '节能项目',
    headers: ['项目', '类型', '状态', '实施日期', '投资(元)', '计划节能(%)', '评估结论'],
    rows: rows.map((p) => [p.name, p.type, STATUS_META[p.status].label, p.implementDate, p.investment, p.plannedSaving, p.evaluation]),
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['节能管理', '节能措施与项目']}
        title="节能措施与项目管理"
        subtitle={
          <Space size={8} wrap>
            <span>仅“改造前后用电差”不代表归因节能量；未经天气/人数/教学时长校正的变化量均明确标注</span>
            <span className="muted">共 {projects.length} 个项目</span>
          </Space>
        }
        extra={
          <Space>
            {editable && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => openEdit('new')}>新建项目</Button>}
            <ExportButton filename="节能项目台账" sheet={exportSheet} metaNote="基期、观察期与评估方法随项目导出；未经校正的变化量单独标注" />
          </Space>
        }
      />
      <FilterBar>
        <span className="filter-label">状态</span>
        <Segmented
          size="small"
          value={statusFilter}
          options={[
            { value: 'all', label: '全部' },
            { value: 'inProgress', label: '实施中' },
            { value: 'completed', label: '已验收' },
            { value: 'planned', label: '计划中' },
          ]}
          onChange={(v) => setStatusFilter(v as string)}
        />
        <span className="muted small">新建/编辑/验收归档均写入审计；归档项目保留基线说明与实测观察期</span>
      </FilterBar>

      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        onRow={(r) => ({ onClick: () => setDetail(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: '项目', dataIndex: 'name' },
          { title: '类型', dataIndex: 'type', width: 100 },
          {
            title: '建筑', width: 160,
            render: (_v, p) => <Space size={4} wrap>{p.buildings.map((b) => <Tag key={b}>{entities.buildings.find((x) => x.id === b)?.name ?? b}</Tag>)}</Space>,
          },
          { title: '实施日期', dataIndex: 'implementDate', width: 100 },
          { title: '投资(元)', dataIndex: 'investment', width: 100, align: 'right' as const, render: (v: number) => fmtInt(v) },
          { title: '计划节能', dataIndex: 'plannedSaving', width: 90, align: 'right' as const, render: (v: number) => `${v}%` },
          { title: '状态', dataIndex: 'status', width: 84, render: (s: string) => <Tag color={STATUS_META[s].color}>{STATUS_META[s].label}</Tag> },
          {
            title: '实测变化（未校正）', width: 130, align: 'right' as const,
            render: (_v, p) => {
              const eff = effectOf(p);
              if (!eff || eff.changePct === null) return <span className="muted">—</span>;
              return <span style={{ color: eff.changePct < 0 ? '#389e0d' : '#cf1322' }}>{eff.changePct >= 0 ? '+' : ''}{eff.changePct.toFixed(1)}%</span>;
            },
          },
          {
            title: '操作', width: 150,
            render: (_v, p) => editable ? (
              <Space size={4}>
                <a onClick={(e) => { e.stopPropagation(); openEdit(p); }}>编辑</a>
                {p.status === 'inProgress' && <a onClick={(e) => { e.stopPropagation(); setArchiveEval(''); setArchiveTarget(p); }}><CheckOutlined /> 验收归档</a>}
              </Space>
            ) : null,
          },
        ]}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} width={720} title={detail?.name}>
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="状态"><Tag color={STATUS_META[detail.status].color}>{STATUS_META[detail.status].label}</Tag></Descriptions.Item>
              <Descriptions.Item label="实施日期">{detail.implementDate}</Descriptions.Item>
              <Descriptions.Item label="措施" span={2}>{detail.measure}</Descriptions.Item>
              <Descriptions.Item label="投资">{fmtInt(detail.investment)} 元</Descriptions.Item>
              <Descriptions.Item label="计划节能">{detail.plannedSaving}%</Descriptions.Item>
              <Descriptions.Item label="责任人">{detail.owner}</Descriptions.Item>
              <Descriptions.Item label="依据资料">{detail.evidence}</Descriptions.Item>
              {detail.baseline && (
                <Descriptions.Item label="基期" span={2}>{detail.baseline.from} 至 {detail.baseline.to}（{detail.baseline.note}）</Descriptions.Item>
              )}
              <Descriptions.Item label="评估结论" span={2}>{detail.evaluation}</Descriptions.Item>
            </Descriptions>
            {detail.baseline && (() => {
              const eff = effectOf(detail);
              if (!eff) return <div className="muted">暂无可对比的计量数据</div>;
              return (
                <ChartCard
                  title="基期 vs 观察期日均用电（kWh/日）"
                  height={260}
                  note={`基期日均 ${eff.baseAvg.toFixed(0)}，观察期（${eff.obsFrom}起，${eff.obsDays}日）日均 ${eff.obsAvg.toFixed(0)}；变化为“未经校正的变化量”，正式节能量需归因评估`}
                >
                  <EnergyBarChart
                    x={['基期日均', '观察期日均']}
                    series={[{ name: '日均用电', data: [Math.round(eff.baseAvg), Math.round(eff.obsAvg)], color: '#1668dc' }]}
                    unit="kWh"
                    height={250}
                    showLegend={false}
                  />
                </ChartCard>
              );
            })()}
          </Space>
        )}
      </Drawer>

      <Modal
        title={editProject === 'new' ? '新建节能项目' : `编辑项目：${editProject ? editProject.name : ''}`}
        open={!!editProject}
        onOk={save}
        onCancel={() => setEditProject(null)}
        okText="保存"
        cancelText="取消"
        width={680}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="项目名称" rules={[{ required: true }]}><Input placeholder="如 教学楼照明LED改造" /></Form.Item>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="type" label="措施类型" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={[
                { value: '照明改造', label: '照明改造' },
                { value: '运行优化', label: '运行优化' },
                { value: '管网检漏', label: '管网检漏' },
                { value: '机房节能', label: '机房节能' },
                { value: '可再生能源', label: '可再生能源' },
                { value: '节水器具', label: '节水器具' },
                { value: '变频改造', label: '变频改造' },
              ]} />
            </Form.Item>
            <Form.Item name="status" label="项目状态" rules={[{ required: true }]}>
              <Select style={{ width: 120 }} options={[
                { value: 'planned', label: '计划中' },
                { value: 'inProgress', label: '实施中' },
                { value: 'completed', label: '已验收' },
              ]} />
            </Form.Item>
            <Form.Item name="implementDate" label="实施日期" rules={[{ required: true }]}><DatePicker /></Form.Item>
          </Space>
          <Form.Item name="buildings" label="涉及建筑" rules={[{ required: true }]}>
            <Select
              mode="multiple"
              showSearch
              optionFilterProp="label"
              options={entities.buildings.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.name }))}
            />
          </Form.Item>
          <Form.Item name="measure" label="措施描述" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Space size={12}>
            <Form.Item name="investment" label="投资(元)" initialValue={0}><InputNumber min={0} style={{ width: 130 }} /></Form.Item>
            <Form.Item name="plannedSaving" label="计划节能(%)" initialValue={5}><InputNumber min={0} max={100} style={{ width: 110 }} /></Form.Item>
            <Form.Item name="owner" label="责任人" initialValue="张启明"><Input style={{ width: 130 }} /></Form.Item>
          </Space>
          <Space size={12}>
            <Form.Item name="baselineFrom" label="基期开始（无可不填）"><DatePicker /></Form.Item>
            <Form.Item name="baselineTo" label="基期结束"><DatePicker /></Form.Item>
          </Space>
          <Form.Item name="baselineNote" label="基期口径说明"><Input placeholder="如 改造前春学期同口径" /></Form.Item>
          <Form.Item name="evidence" label="依据资料"><Input placeholder="如 施工验收单编号、可行性报告" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`验收归档：${archiveTarget?.name ?? ''}`}
        open={!!archiveTarget}
        onOk={doArchive}
        onCancel={() => setArchiveTarget(null)}
        okText="归档"
        cancelText="取消"
      >
        {archiveTarget && (() => {
          const eff = effectOf(archiveTarget);
          return (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <div className="small">
                观察期实测变化：{eff && eff.changePct !== null ? `${eff.changePct >= 0 ? '+' : ''}${eff.changePct.toFixed(1)}%（未经校正的变化量）` : '暂无可比数据'}
              </div>
              <Input.TextArea
                rows={3}
                placeholder="验收评估结论（必填）：注明未经天气/使用强度校正，正式节能量需归因评估"
                value={archiveEval}
                onChange={(e) => setArchiveEval(e.target.value)}
              />
            </Space>
          );
        })()}
      </Modal>
      <div className="muted small mt8">
        评估原则：若未修正天气、使用人数、教学时长等关键变量，前后差值仅作为线索；验收归档项目保留基线说明与实测观察期。
      </div>
    </div>
  );
}