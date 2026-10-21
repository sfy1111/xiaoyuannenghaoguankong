import { useMemo, useState } from 'react';
import {
  App, Card, Descriptions, Input, Modal, Select, Space, Table, Tag, Tree, Tooltip,
} from 'antd';
import { LinkOutlined, DisconnectOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { ChartCard, EnergyBarChart } from '../../components/charts';
import { canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { dailyRows } from '../../services/energyStats';
import { isDescendantOf } from '../../domain/energy/boundaries';
import { lastNDays } from '../../domain/time';
import { ENERGY_LABEL } from '../../domain/units';
import type { EnergyType, IotCandidate, MeteringPoint } from '../../domain/types';

export default function FoundationMeteringPage() {
  const { message } = App.useApp();
  const entities = getEntities();
  const [buildingId, setBuildingId] = useState<string>('B-TA');
  const [pointId, setPointId] = useState<string | null>('P-TA-M');
  const [bindModal, setBindModal] = useState<{ kind: 'bind'; prop: IotCandidate } | { kind: 'unbind' } | null>(null);
  const [reason, setReason] = useState('');
  const [relModal, setRelModal] = useState(false);
  const [relParent, setRelParent] = useState<string>('');
  const [relChild, setRelChild] = useState<string>('');
  const [relType, setRelType] = useState<'contains' | 'supplies'>('contains');
  const editable = canEdit('foundation');

  const treeData = entities.campuses.map((c) => ({
    title: c.name,
    key: c.id,
    children: entities.buildings.filter((b) => b.campusId === c.id && b.status === 'active').map((b) => ({
      title: `${b.name}${entities.meteringPoints.some((p) => p.buildingId === b.id) ? '' : '（未接入）'}`,
      key: b.id,
    })),
  }));

  const building = entities.buildings.find((b) => b.id === buildingId);
  const points = entities.meteringPoints.filter((p) => p.buildingId === buildingId);
  const point = pointId ? entities.meteringPoints.find((p) => p.id === pointId) ?? null : null;
  const meter = point ? entities.meters.find((m) => m.id === point.meterId) : null;
  const candidates = entities.iotCandidates;
  const bindHistory = pointId ? entities.auditLogs.filter((a) => a.objectId === pointId && a.module === '计量关系') : [];

  const relations = useMemo(
    () => entities.meterRelations.filter((r) => points.some((p) => p.id === r.childId || p.id === r.parentId)),
    [entities, points],
  );

  const pointName = (id: string) => entities.meteringPoints.find((p) => p.id === id)?.name ?? id;

  const validateCandidate = (cand: IotCandidate, target: MeteringPoint | null): { ok: boolean; reasons: string[] } => {
    if (!target) return { ok: false, reasons: ['未选择计量点'] };
    const reasons: string[] = [];
    if (cand.energyType !== target.energyType) reasons.push(`能源类型不一致（属性：${ENERGY_LABEL[cand.energyType]}，计量点：${ENERGY_LABEL[target.energyType]}）`);
    if (cand.unit !== target.unit) reasons.push(`单位量纲不一致（属性：${cand.unit}，计量点：${target.unit}）`);
    const expectType = target.readingType === 'cumulative' ? 'cumulative' : 'instantaneous';
    if (cand.valueType !== expectType) reasons.push('量值语义不一致：累计量计量点不可绑定瞬时量属性，不得将瞬时功率直接当区间电量');
    if (cand.boundPointId && cand.boundPointId !== target.id) reasons.push('该属性已绑定其他计量点，同一时间范围不允许两个未定义优先级的活动主源');
    return { ok: reasons.length === 0, reasons };
  };

  const days7 = lastNDays(META.dataWindow.end, 7);
  const previewRows = pointId ? dailyRows([pointId], days7[0], days7[6]) : [];

  const doBind = (cand: IotCandidate) => {
    if (!point) return;
    const check = validateCandidate(cand, point);
    if (!check.ok) {
      message.error(`绑定被校验阻止：${check.reasons[0]}`);
      return;
    }
    if (!reason.trim()) {
      message.warning('请填写绑定/换绑理由（留痕要求）');
      return;
    }
    const ok = entities.actions.bindIotProperty(point.id, cand.id, reason);
    if (ok) {
      message.success(`已绑定 ${cand.name}（${cand.code}），有效期自当前时刻；历史关联与影响范围已记录审计`);
    } else {
      message.error('绑定失败：语义校验未通过');
    }
    setBindModal(null);
    setReason('');
  };

  const doUnbind = () => {
    if (!point) return;
    if (!reason.trim()) {
      message.warning('请填写解绑理由');
      return;
    }
    entities.actions.unbindIotProperty(point.id, reason);
    message.success('已解绑；该点位统计将缺失直至重新绑定');
    setBindModal(null);
    setReason('');
  };

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '计量关系与点位维护']}
        title="计量关系与点位维护"
        subtitle={
          <Space size={8} wrap>
            <span>人工逐点选择IoT属性完成绑定（先预览后确认）；系统不做自动匹配、不提供公式编辑器</span>
            <span className="muted">总量按“入口合计−明确外供/排除量”内置模型计算，参与点位由人工维护</span>
          </Space>
        }
      />
      <div style={{ display: 'grid', gridTemplateColumns: '230px 1.2fr 1.6fr', gap: 12, alignItems: 'start' }}>
        <Card size="small" title="校区/建筑" styles={{ body: { padding: 8 } }}>
          <Tree
            defaultExpandAll
            selectedKeys={[buildingId]}
            treeData={treeData}
            onSelect={(keys) => {
              const key = keys[0] as string;
              if (key?.startsWith('B-')) {
                setBuildingId(key);
                const first = entities.meteringPoints.find((p) => p.buildingId === key);
                setPointId(first?.id ?? null);
              }
            }}
          />
        </Card>

        <Card size="small" title={`${building?.name ?? ''} 计量点（${points.length}）`} styles={{ body: { padding: 8 } }}>
          <Table
            size="small"
            rowKey="id"
            pagination={false}
            dataSource={points}
            scroll={{ y: 420 }}
            rowClassName={(r) => (r.id === pointId ? 'ant-table-row-selected' : '')}
            onRow={(r) => ({ onClick: () => setPointId(r.id), style: { cursor: 'pointer' } })}
            columns={[
              { title: '名称', dataIndex: 'name', ellipsis: true },
              { title: '角色', dataIndex: 'role', width: 66, render: (r: string) => <Tag color={r === 'main' ? 'blue' : r === 'plantOutput' ? 'purple' : 'default'}>{r === 'main' ? '主表' : r === 'plantOutput' ? '产出' : r === 'public' ? '公共' : '分表'}</Tag> },
              {
                title: 'IoT绑定', dataIndex: 'iotPropertyId', width: 90,
                render: (v: string | null) => v ? <Tag color="green">已绑定</Tag> : <Tag color="red">未绑定</Tag>,
              },
            ]}
          />
        </Card>

        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          {point ? (
            <>
              <Card size="small" title={`${point.name}（${point.code}）`} styles={{ body: { padding: 8 } }}>
                <Descriptions size="small" bordered column={2}>
                  <Descriptions.Item label="能源/单位">{ENERGY_LABEL[point.energyType]} / {point.unit}</Descriptions.Item>
                  <Descriptions.Item label="量值类型">{point.readingType === 'cumulative' ? '累计量（差分统计）' : point.readingType}</Descriptions.Item>
                  <Descriptions.Item label="计量方向/用途">{point.direction} / {point.usage}</Descriptions.Item>
                  <Descriptions.Item label="计量器具">{meter?.name ?? '—'}（{meter?.meterNo ?? '—'}）</Descriptions.Item>
                  <Descriptions.Item label="当前绑定" span={2}>
                    {point.iotPropertyId ? (
                      <Tag color="green">{point.iotPropertyId}</Tag>
                    ) : (
                      <Tag color="red">未绑定（统计缺失）</Tag>
                    )}
                    {' '}
                    {editable && point.iotPropertyId && (
                       <a onClick={() => { setReason(''); setBindModal({ kind: 'unbind' }); }}><DisconnectOutlined /> 解绑</a>
                    )}
                  </Descriptions.Item>
                  <Descriptions.Item label="有效期" span={2}>{point.validFrom} 起{point.validTo ? ` 至 ${point.validTo}` : '（长期）'}；换绑将保留原有效期并新增版本</Descriptions.Item>
                </Descriptions>
              </Card>

              <ChartCard title="近7日数据预览（绑定前校验）" height={200} note="预览来自该点位当前序列；解绑后此点位无统计">
                <EnergyBarChart
                  x={previewRows.map((r) => r.date.slice(5))}
                  series={[{ name: '日用量', data: previewRows.map((r) => Math.round(r.total)), color: '#1668dc' }]}
                  unit={point.unit}
                  height={190}
                  showLegend={false}
                />
              </ChartCard>

              <Card
                size="small"
                title="候选IoT属性（人工逐点选择，先校验后绑定）"
                styles={{ body: { padding: 8 } }}
                extra={<span className="muted small">共 {candidates.filter((c) => !c.boundPointId).length} 个可绑定</span>}
              >
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={candidates}
                  columns={[
                    { title: '属性', dataIndex: 'name', width: 120 },
                    { title: '设备', dataIndex: 'deviceName', ellipsis: true },
                    { title: '语义', dataIndex: 'readingType', width: 70, render: (t: string) => <Tag>{t}</Tag> },
                    { title: '单位', dataIndex: 'unit', width: 60 },
                    {
                      title: '校验', width: 70,
                      render: (_v, c) => {
                        const check = validateCandidate(c, point);
                        return check.ok ? <Tag color="green">通过</Tag> : (
                          <Tooltip title={check.reasons.join('；')}>
                            <Tag color="red">不匹配</Tag>
                          </Tooltip>
                        );
                      },
                    },
                    {
                      title: '', width: 80,
                      render: (_v, c) => {
                        const check = validateCandidate(c, point);
                        return editable && !c.boundPointId ? (
                           <a onClick={() => { setReason(''); setBindModal({ kind: 'bind', prop: c }); }} className={!check.ok ? 'muted' : ''}>
                            <LinkOutlined /> 绑定
                          </a>
                        ) : c.boundPointId ? <Tag>已占用</Tag> : null;
                      },
                    },
                  ]}
                />
              </Card>

              {bindHistory.length > 0 && (
                <Card size="small" title="绑定历史与版本记录" styles={{ body: { padding: 8 } }}>
                  <Table
                    size="small"
                    rowKey="id"
                    pagination={false}
                    dataSource={bindHistory}
                    columns={[
                      { title: '时间', dataIndex: 'time', width: 130 },
                      { title: '操作人', dataIndex: 'actor', width: 90 },
                      { title: '操作', dataIndex: 'action', width: 110 },
                      { title: '说明', dataIndex: 'detail' },
                    ]}
                  />
                </Card>
              )}

              <Card size="small" title={`${building?.name} 计量拓扑与参与统计点位`} styles={{ body: { padding: 8 } }}
                extra={editable ? <a onClick={() => { setRelParent(''); setRelChild(''); setRelType('contains'); setRelModal(true); }}>新增关系</a> : undefined}
              >
                <Table
                  size="small"
                  rowKey="id"
                  pagination={false}
                  dataSource={relations}
                  columns={[
                    { title: '父节点', dataIndex: 'parentId', render: (v: string) => pointName(v) },
                    { title: '关系', dataIndex: 'relationType', width: 80, render: (t: string) => <Tag color={t === 'contains' ? 'blue' : 'purple'}>{t === 'contains' ? '包含' : '供给'}</Tag> },
                    { title: '子节点', dataIndex: 'childId', render: (v: string) => pointName(v) },
                    { title: '生效', dataIndex: 'validFrom', width: 100 },
                    {
                      title: '', width: 60,
                      render: (_v, r) => editable ? (
                        <a style={{ color: '#cf1322' }} onClick={() => {
                          Modal.confirm({
                            title: '移除计量关系',
                            content: `确认移除「${pointName(r.parentId)} → ${pointName(r.childId)}」？总量统计边界将同步调整，影响范围已记录审计。`,
                            onOk: () => {
                              entities.actions.removeMeterRelation(r.id);
                              message.success('计量关系已移除，统计边界更新');
                            },
                          });
                        }}>移除</a>
                      ) : null,
                    },
                  ]}
                />
                <div className="muted small mt8">
                  总量边界：{points.filter((p) => p.role === 'main' && p.direction !== 'export').map((p) => p.name).join('、')}（计入总量）；
                  分项：{points.filter((p) => p.role === 'submeter').length} 个支路表（仅作分项与覆盖统计，不重复计入）。
                  修改参与点位将更新关系版本并触发受影响楼宇、指标、费用与报表重算提示。
                </div>
              </Card>
            </>
          ) : (
            <Card size="small"><div className="muted" style={{ padding: 24 }}>请先在左侧选择建筑与计量点</div></Card>
          )}
        </Space>
      </div>

      <Modal
        title={`新增计量关系（${building?.name ?? ''}）`}
        open={relModal}
        onOk={() => {
          if (!relParent || !relChild) {
            message.warning('请选择父节点与子节点');
            return;
          }
          if (relParent === relChild) {
            message.error('父节点与子节点不能相同');
            return;
          }
          const parent = entities.meteringPoints.find((p) => p.id === relParent);
          const child = entities.meteringPoints.find((p) => p.id === relChild);
          if (parent && child && parent.energyType !== child.energyType) {
            message.error('能源类型不一致，禁止建立关系');
            return;
          }
          if (entities.meterRelations.some((r) => r.parentId === relParent && r.childId === relChild)) {
            message.error('该父子关系已存在，禁止重复定义');
            return;
          }
          const idx = { points: entities.meteringPoints, relations: entities.meterRelations };
          if (isDescendantOf(idx, relParent, relChild)) {
            message.error('校验未通过：将形成循环包含关系（所选父节点已是子节点的后代）');
            return;
          }
          entities.actions.addMeterRelation(relParent, relChild, relType);
          message.success(`已新增关系：${entities.meteringPoints.find((p) => p.id === relParent)?.name} ${relType === 'contains' ? '包含' : '供给'} ${entities.meteringPoints.find((p) => p.id === relChild)?.name}；统计边界更新并记录审计`);
          setRelModal(false);
        }}
        onCancel={() => setRelModal(false)}
        okText="保存（执行边界校验）"
        cancelText="取消"
      >
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div>
            <div className="small">关系类型</div>
            <Select style={{ width: 160 }} value={relType} onChange={setRelType} options={[
              { value: 'contains', label: '包含（父表含子表支路）' },
              { value: 'supplies', label: '供给（能源站→建筑）' },
            ]} />
          </div>
          <div>
            <div className="small">父节点（总表/产出侧）</div>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              value={relParent || undefined}
              onChange={setRelParent}
              options={entities.meteringPoints
                .filter((p) => (p.buildingId === buildingId || (!p.buildingId && p.campusId === building?.campusId)) && (p.role === 'main' || p.role === 'plantOutput'))
                .map((p) => ({ value: p.id, label: `${p.name}（${p.energyType}）` }))}
            />
          </div>
          <div>
            <div className="small">子节点（分表/末端计量）</div>
            <Select
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              value={relChild || undefined}
              onChange={setRelChild}
              options={entities.meteringPoints
                .filter((p) => p.buildingId === buildingId || (!p.buildingId && p.campusId === building?.campusId))
                .map((p) => ({ value: p.id, label: `${p.name}（${p.role === 'main' ? '主表' : p.role === 'submeter' ? '分表' : p.role === 'public' ? '公共' : '产出'}）` }))}
            />
          </div>
          <div className="muted small">
            保存时校验：能源类型一致、关系不重复、不形成循环包含；父表与子表不重复计入总量，分项覆盖统计按关系更新。
          </div>
        </Space>
      </Modal>

      <Modal
        title={bindModal?.kind === 'unbind' ? '解绑IoT属性' : bindModal?.kind === 'bind' ? `绑定 ${bindModal.prop.name}` : ''}
        open={!!bindModal}
        onOk={() => {
          if (bindModal?.kind === 'unbind') doUnbind();
          else if (bindModal?.kind === 'bind') doBind(bindModal.prop);
        }}
        onCancel={() => setBindModal(null)}
        okText="确认"
        cancelText="取消"
      >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          {bindModal?.kind === 'bind' && (
            <div className="small">
              属性：{bindModal.prop.code}（{bindModal.prop.deviceName}，{bindModal.prop.online ? '在线' : '离线'}，
              最后上报 {dayjs(bindModal.prop.lastSeen).format('MM-DD HH:mm')}）；
              语义校验：{validateCandidate(bindModal.prop, point).ok ? '通过' : '不通过'}
            </div>
          )}
          <Input.TextArea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="填写绑定/换绑理由（必填，审计留痕）"
          />
          <div className="muted small">
            变更发布后保留原有效期和历史关联；影响范围提示到楼宇、指标及报表。
          </div>
        </Space>
      </Modal>
    </div>
  );
}