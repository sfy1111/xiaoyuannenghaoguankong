import { useMemo, useState } from 'react';
import {
  App, Button, Card, Descriptions, Form, Input, Modal, Select, Space, Table, Tabs, Tag, Tooltip,
} from 'antd';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import PointPreviewDrawer from '../../components/PointPreviewDrawer';
import { ChartCard, EnergyLineChart } from '../../components/charts';
import { QualityTag } from '../../components/StatusTags';
import { canApprove } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeHourly } from '../../services/energyStats';
import { getSeries, qualityOfCode, hourIndexFromTs, hourIndexOf, TOTAL_HOURS } from '../../services/telemetry';
import { ENERGY_LABEL } from '../../domain/units';
import { lastNDays } from '../../domain/time';
import type { DataCorrection, Quality } from '../../domain/types';

export default function FoundationDataQualityPage() {
  const { message } = App.useApp();
  const entities = getEntities();
  const [drawerPoint, setDrawerPoint] = useState<string | null>(null);
  const [reviewTarget, setReviewTarget] = useState<DataCorrection | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [form] = Form.useForm();
  const approver = canApprove('dataQuality');
  const days30 = lastNDays(META.dataWindow.end, 30);

  const qualityRows = useMemo(() => {
    return entities.meteringPoints.map((p) => {
      const series = getSeries(p.id);
      let valid = 0;
      let missing = 0;
      let estimated = 0;
      let invalid = 0;
      let corrected = 0;
      let lastValidIdx = -1;
      if (series) {
        const startDi = hourIndexOf(days30[0], 0);
        for (let i = startDi; i < TOTAL_HOURS; i++) {
          const q = qualityOfCode(series.quality[i]);
          if (q === 'valid') valid++;
          else if (q === 'missing') missing++;
          else if (q === 'estimated') estimated++;
          else if (q === 'invalid') invalid++;
          else if (q === 'manual_corrected') corrected++;
        }
        for (let i = TOTAL_HOURS - 1; i >= 0; i--) {
          const q = qualityOfCode(series.quality[i]);
          if (q !== 'missing' && q !== 'invalid') { lastValidIdx = i; break; }
        }
      }
      const total = valid + missing + estimated + invalid + corrected;
      const corrections = entities.corrections.filter((c) => c.pointId === p.id);
      return {
        id: p.id,
        name: p.name,
        energy: p.energyType,
        building: p.buildingId ? entities.buildings.find((b) => b.id === p.buildingId)?.name ?? '—' : '公共设施/关口',
        validRate: total === 0 ? null : (valid + corrected) / total,
        missing, estimated, invalid, corrected,
        lastSeen: lastValidIdx >= 0 ? new Date(META.asOf).getTime() - ((TOTAL_HOURS - 1 - lastValidIdx) * 3600000) : null,
        offlineHours: lastValidIdx >= 0 ? TOTAL_HOURS - 1 - lastValidIdx : TOTAL_HOURS,
        hasPendingCorrection: corrections.some((c) => c.status === 'pending'),
        corrections,
      };
    }).filter((r) => r.missing + r.estimated + r.invalid + r.corrected > 0 || r.offlineHours > 4);
  }, [entities, days30]);

  const kpis = useMemo(() => {
    const all = entities.meteringPoints.length;
    const online = qualityRows.filter((r) => r.offlineHours <= 4).length;
    const missingPoints = qualityRows.filter((r) => r.missing > 0).length;
    const anomalyPoints = qualityRows.filter((r) => r.invalid > 0 || r.estimated > 0).length;
    const pending = entities.corrections.filter((c) => c.status === 'pending').length;
    const avgRate = qualityRows.length > 0 ? qualityRows.reduce((a, r) => a + (r.validRate ?? 1), 0) / qualityRows.length : 1;
    return { all, online, missingPoints, anomalyPoints, pending, avgRate };
  }, [qualityRows, entities]);

  const pendingCorrections = entities.corrections.filter((c) => c.status === 'pending');
  const historyCorrections = entities.corrections.filter((c) => c.status !== 'pending');

  const submitApply = async () => {
    const v = await form.validateFields();
    const startH = hourIndexFromTs(v.start);
    const endH = hourIndexFromTs(v.end);
    if (endH < startH) {
      message.error('结束时刻不能早于开始时刻');
      return;
    }
    const values = (v.values as string).split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean).map(Number);
    if (values.some((n) => Number.isNaN(n) || n < 0)) {
      message.error('补录值必须为非负数值');
      return;
    }
    if (values.length !== endH - startH + 1) {
      message.error(`补录值个数（${values.length}）应与时段小时数（${endH - startH + 1}）一致`);
      return;
    }
    entities.actions.submitCorrection({
      pointId: v.pointId,
      start: v.start,
      end: v.end,
      values,
      quality: 'manual_corrected',
      source: v.source,
      reason: v.reason,
      evidence: v.evidence,
      applicant: '王建国',
    });
    message.success('补录申请已提交，待审核；审核通过前原始缺失样本保持不变');
    setApplyOpen(false);
  };

  const doReview = (approve: boolean) => {
    if (!reviewTarget) return;
    if (!reviewNote.trim()) {
      message.warning('请填写审核意见');
      return;
    }
    entities.actions.reviewCorrection(reviewTarget.id, approve, reviewNote, '张启明');
    message.success(approve
      ? '审核通过：补录值生效并标记为人工修正，原始IoT缺失样本保留；相关日/月指标已重算'
      : '已退回补录申请，原始数据保持缺失状态');
    setReviewTarget(null);
    setReviewNote('');
  };

  const focusPreview = qualityRows.find((r) => r.id === 'P-D2-W');
  const focusHourly = scopeHourly('water', { buildingId: 'B-D2' }, '2026-09-19', '2026-09-21');

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '数据质量与补录']}
        title="数据质量与人工补录"
        subtitle={
          <Space size={8} wrap>
            <span>缺数不默认为0；估算与人工修正计入统计并保留标记；无审批不覆盖原始IoT采样值</span>
            <span className="muted">数据更新：{dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}</span>
          </Space>
        }
      />
      <div className="kpi-row">
        <StatCard label="计量点总数" value={kpis.all} unit="个" sub={`在线 ${kpis.online}，离线/迟到 ${qualityRows.filter((r) => r.offlineHours > 4).length}`} />
        <StatCard label="30日平均有效率" value={Math.round(kpis.avgRate * 1000) / 10} unit="%" sub="有效+人工修正 / 全部样本" />
        <StatCard label="缺数点位" value={kpis.missingPoints} unit="个" sub={`累计缺失样本 ${qualityRows.reduce((a, r) => a + r.missing, 0)} 小时`} />
        <StatCard label="异常/估算点位" value={kpis.anomalyPoints} unit="个" sub={`无效 ${qualityRows.reduce((a, r) => a + r.invalid, 0)} 样本，估算 ${qualityRows.reduce((a, r) => a + r.estimated, 0)} 样本`} />
        <StatCard label="待审核补录" value={kpis.pending} unit="条" sub={approver ? '当前角色可审核' : '需后勤主管审核'} />
      </div>

      {focusPreview && (
        <ChartCard
          title="质量事件示例：兰园2号公寓水表（换表+缺失+人工修正）"
          height={260}
          note="2026-09-12 换表读数重置；09-20 部分缺失经补录审批标记人工修正；09-21 缺口补录待审核，仍显示缺失"
        >
          <EnergyLineChart
            x={focusHourly.map((r) => r.ts.slice(5, 13))}
            series={[{ name: '小时用水', data: focusHourly.map((r) => r.value === null ? null : Math.round(r.value * 100) / 100), color: '#13c2c2' }]}
            unit="m³/h"
            height={250}
            showLegend={false}
          />
        </ChartCard>
      )}

      <Tabs
        className="mt12"
        items={[
          {
            key: 'points',
            label: '计量点质量看板',
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={{ pageSize: 10 }}
                dataSource={qualityRows}
                onRow={(r) => ({ onClick: () => setDrawerPoint(r.id), style: { cursor: 'pointer' } })}
                columns={[
                  { title: '计量点', dataIndex: 'name' },
                  { title: '所属', dataIndex: 'building', width: 150 },
                  { title: '能源', dataIndex: 'energy', width: 76, render: (e: string) => <Tag>{ENERGY_LABEL[e as 'electricity']}</Tag> },
                  {
                    title: '30日有效率', dataIndex: 'validRate', width: 100, align: 'right' as const,
                    render: (v: number | null) => v === null ? '—' : <Tag color={v >= 0.98 ? 'green' : v >= 0.9 ? 'blue' : 'orange'}>{(v * 100).toFixed(1)}%</Tag>,
                  },
                  { title: '缺失(h)', dataIndex: 'missing', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : 0 },
                  { title: '估算(h)', dataIndex: 'estimated', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Tag color="gold">{v}</Tag> : 0 },
                  { title: '无效(h)', dataIndex: 'invalid', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Tag color="red">{v}</Tag> : 0 },
                  { title: '修正(h)', dataIndex: 'corrected', width: 80, align: 'right' as const, render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : 0 },
                  {
                    title: '最后有效上报', width: 130,
                    render: (_v, r) => r.offlineHours <= 4
                      ? <Tag color="green">{r.offlineHours}小时内</Tag>
                      : <Tooltip title={`已 ${r.offlineHours} 小时无有效上报`}><Tag color="red">离线/迟到</Tag></Tooltip>,
                  },
                  {
                    title: '待审核补录', width: 96,
                    render: (_v, r) => r.hasPendingCorrection ? <Tag color="orange">待审核</Tag> : '—',
                  },
                ]}
              />
            ),
          },
          {
            key: 'pending',
            label: `补录审核（${pendingCorrections.length}）`,
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Button size="small" type="primary" onClick={() => { form.resetFields(); setApplyOpen(true); }}>提交补录申请</Button>
                {pendingCorrections.length === 0 && <div className="muted">当前无待审核补录申请</div>}
                {pendingCorrections.map((c) => (
                  <Card key={c.id} size="small">
                    <Descriptions size="small" column={3} bordered>
                      <Descriptions.Item label="编号">{c.id}</Descriptions.Item>
                      <Descriptions.Item label="计量点">{entities.meteringPoints.find((p) => p.id === c.pointId)?.name ?? c.pointId}</Descriptions.Item>
                      <Descriptions.Item label="时段">{c.start} 至 {c.end}（{c.values.length}小时）</Descriptions.Item>
                      <Descriptions.Item label="数据来源">{c.source}</Descriptions.Item>
                      <Descriptions.Item label="申请人">{c.applicant}</Descriptions.Item>
                      <Descriptions.Item label="提交时间">{c.appliedAt}</Descriptions.Item>
                      <Descriptions.Item label="原因" span={2}>{c.reason}</Descriptions.Item>
                      <Descriptions.Item label="凭据">{c.evidence}</Descriptions.Item>
                      <Descriptions.Item label="补录值" span={3}>
                        <Space size={4} wrap>
                          {c.values.map((v, i) => <Tag key={i}>{v}</Tag>)}
                        </Space>
                      </Descriptions.Item>
                    </Descriptions>
                    <Space className="mt8">
                      {approver ? (
                        <>
                          <Button size="small" type="primary" onClick={() => { setReviewNote(''); setReviewTarget(c); }}>审核</Button>
                          <span className="muted small">通过后：补录值替换缺失样本并标记人工修正，原始样本保留</span>
                        </>
                      ) : (
                        <span className="muted">需后勤能源主管审核</span>
                      )}
                    </Space>
                  </Card>
                ))}
              </Space>
            ),
          },
          {
            key: 'history',
            label: '修正历史',
            children: (
              <Table
                size="small"
                rowKey="id"
                pagination={false}
                dataSource={historyCorrections}
                columns={[
                  { title: '编号', dataIndex: 'id', width: 130 },
                  { title: '计量点', dataIndex: 'pointId', render: (v: string) => entities.meteringPoints.find((p) => p.id === v)?.name ?? v },
                  { title: '时段', width: 260, render: (_v, c) => `${c.start} 至 ${c.end}` },
                  { title: '状态', dataIndex: 'status', width: 90, render: (s: string) => <QualityTag quality={(s === 'approved' ? 'manual_corrected' : s === 'pending' ? 'estimated' : 'invalid') as Quality} /> },
                  { title: '审核人', dataIndex: 'reviewer', width: 90 },
                  { title: '审核意见', dataIndex: 'reviewNote' },
                ]}
              />
            ),
          },
        ]}
      />

      <Modal
        title="提交补录申请"
        open={applyOpen}
        onOk={submitApply}
        onCancel={() => setApplyOpen(false)}
        okText="提交（待审核）"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="pointId" label="计量点" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={entities.meteringPoints.map((p) => ({ value: p.id, label: `${p.name}（${ENERGY_LABEL[p.energyType]}）` }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="start" label="起始时刻（YYYY-MM-DDTHH:mm）" rules={[{ required: true }]}><Input placeholder="2026-10-22T00:00" /></Form.Item>
            <Form.Item name="end" label="结束时刻" rules={[{ required: true }]}><Input placeholder="2026-10-22T06:00" /></Form.Item>
          </Space>
          <Form.Item name="values" label="逐小时补录值（逗号或空格分隔，个数与时段一致）" rules={[{ required: true }]}><Input.TextArea rows={2} placeholder="如：1.8, 1.5, 1.4, 1.3, 1.5, 2.4, 5.8" /></Form.Item>
          <Form.Item name="source" label="数据来源" rules={[{ required: true }]}>
            <Select options={[
              { value: '现场抄表读数', label: '现场抄表读数' },
              { value: '供应商账单量', label: '供应商账单量' },
              { value: '估算值', label: '估算值（需注明方法）' },
            ]} />
          </Form.Item>
          <Form.Item name="reason" label="补录原因" rules={[{ required: true }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="evidence" label="证据说明（附件留档）" rules={[{ required: true }]}><Input placeholder="如 抄表记录照片编号、账单编号" /></Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`补录审核：${reviewTarget?.id ?? ''}`}
        open={!!reviewTarget}
        footer={[
          <Button key="reject" danger onClick={() => doReview(false)}>退回</Button>,
          <Button key="approve" type="primary" onClick={() => doReview(true)}>通过并生效</Button>,
        ]}
        onCancel={() => setReviewTarget(null)}
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div className="small">
            计量点：{reviewTarget ? entities.meteringPoints.find((p) => p.id === reviewTarget.pointId)?.name : ''}
            ；时段：{reviewTarget?.start} 至 {reviewTarget?.end}；补录值合计：{reviewTarget?.values.reduce((a, b) => a + b, 0).toFixed(1)}
          </div>
          <Input.TextArea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="审核意见（必填，将写入审计与修正版本）" />
          <div className="muted small">通过后原始缺失样本保留、补录值标记为人工修正并触发关联指标重算；退回则保持缺失。</div>
        </Space>
      </Modal>

      <PointPreviewDrawer pointId={drawerPoint} open={!!drawerPoint} onClose={() => setDrawerPoint(null)} />
    </div>
  );
}