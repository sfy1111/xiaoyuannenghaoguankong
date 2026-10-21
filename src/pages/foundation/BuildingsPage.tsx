import { useMemo, useState } from 'react';
import {
  App, Button, Card, Drawer, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tree,
} from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import ExportButton from '../../components/ExportButton';
import { canEdit } from '../../stores/identity';
import { getEntities, META } from '../../services/repository';
import { scopeUsage } from '../../services/energyStats';
import { ALL_CATEGORIES, CATEGORY_LABEL, fmtInt } from '../../domain/units';
import { useBuildingOptions, useCategoryOptions } from '../../components/FilterBar';
import type { Building, BuildingCategory } from '../../domain/types';

interface BuildingForm {
  code: string;
  name: string;
  campusId: string;
  category: BuildingCategory;
  buildingArea: number;
  assessmentArea: number;
  floors: number;
  builtYear: number;
  departmentId: string;
  coolingMode: string;
  heatingMode: string;
  remark?: string;
}

export default function FoundationBuildingsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const entities = getEntities();
  const [treeKey, setTreeKey] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Building | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Building | null>(null);
  const [form] = Form.useForm<BuildingForm>();

  const treeData = useMemo(() => {
    const campusNodes = entities.campuses.map((c) => {
      const cats = ALL_CATEGORIES.filter((cat) => entities.buildings.some((b) => b.campusId === c.id && b.category === cat));
      return {
        title: c.name,
        key: c.id,
        children: cats.map((cat) => ({
          title: `${CATEGORY_LABEL[cat]}（${entities.buildings.filter((b) => b.campusId === c.id && b.category === cat).length}）`,
          key: `${c.id}|${cat}`,
          children: entities.buildings
            .filter((b) => b.campusId === c.id && b.category === cat)
            .map((b) => ({ title: b.status === 'active' ? b.name : `${b.name}（已停用）`, key: b.id, isLeaf: true })),
        })),
      };
    });
    return [{ title: `全部建筑（${entities.buildings.length}）`, key: 'all', children: campusNodes }];
  }, [entities]);

  const buildings = useMemo(() => {
    let list = entities.buildings;
    if (treeKey !== 'all') {
      if (treeKey.includes('|')) {
        const [cid, cat] = treeKey.split('|');
        list = list.filter((b) => b.campusId === cid && b.category === cat);
      } else if (treeKey.startsWith('C-')) {
        list = list.filter((b) => b.campusId === treeKey);
      } else {
        list = list.filter((b) => b.id === treeKey);
      }
    }
    if (search) list = list.filter((b) => b.name.includes(search) || b.code.includes(search));
    return list;
  }, [entities, treeKey, search]);

  const meterCount = (id: string) => entities.meteringPoints.filter((p) => p.buildingId === id).length;

  const openAdd = () => {
    form.resetFields();
    setEditTarget(null);
    setAddOpen(true);
  };
  const openEdit = (b: Building) => {
    form.setFieldsValue({
      code: b.code, name: b.name, campusId: b.campusId, category: b.category,
      buildingArea: b.buildingArea, assessmentArea: b.assessmentArea, floors: b.floors,
      builtYear: b.builtYear, departmentId: b.departmentId, coolingMode: b.coolingMode, heatingMode: b.heatingMode,
      remark: b.remark,
    });
    setEditTarget(b);
    setAddOpen(true);
  };

  const submit = async () => {
    const values = await form.validateFields();
    if (editTarget) {
      entities.actions.updateBuilding(editTarget.id, { ...values });
      message.success('建筑档案已更新（编码与历史能耗数据保持不变）');
    } else {
      const created = entities.actions.addBuilding(values);
      if (!created) {
        message.error('建筑编码已存在，编码在学校内必须唯一');
        return;
      }
      message.success(`建筑「${values.name}」已建档：新建筑默认无计量接入，需在计量关系页绑定IoT属性后产生数据`);
    }
    setAddOpen(false);
  };

  const exportSheet = {
    name: '建筑清单',
    headers: ['建筑编码', '名称', '校区', '类别', '建筑面积(m²)', '考核面积(m²)', '层数', '建成年份', '责任部门', '状态', '计量点数'],
    rows: buildings.map((b) => [
      b.code, b.name, entities.campuses.find((c) => c.id === b.campusId)?.name ?? b.campusId,
      CATEGORY_LABEL[b.category], b.buildingArea, b.assessmentArea, b.floors, b.builtYear,
      entities.departments.find((d) => d.id === b.departmentId)?.name ?? b.departmentId,
      b.status === 'active' ? '在用' : '停用', meterCount(b.id),
    ]),
  };

  const detailPoints = detail ? entities.meteringPoints.filter((p) => p.buildingId === detail.id) : [];
  const detailAlarms = detail ? entities.alarms.filter((a) => a.buildingId === detail.id) : [];
  const usage = detail ? scopeUsage('electricity', { buildingId: detail.id }, '2026-10-20', '2026-10-20') : null;

  return (
    <div>
      <PageHeader
        breadcrumb={['基础档案', '校区与建筑档案']}
        title="校区与建筑档案"
        subtitle={`统一建筑台账：编码唯一、停用保留历史；面积等分母用于强度与分摊指标。数据更新：${dayjs(META.asOf).format('YYYY-MM-DD HH:mm')}`}
        extra={
          <Space>
            {canEdit('foundation') && <Button size="small" type="primary" icon={<PlusOutlined />} onClick={openAdd}>新增建筑</Button>}
            <ExportButton filename="建筑清单" sheet={exportSheet} metaNote="建筑台账导出；面积口径为考核面积" />
          </Space>
        }
      />
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Card size="small" style={{ width: 260, flexShrink: 0 }} styles={{ body: { padding: 8 } }}>
          <Input allowClear placeholder="搜索建筑/编码" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
          <Tree
            defaultExpandAll
            selectedKeys={[treeKey]}
            treeData={treeData}
            onSelect={(keys) => setTreeKey((keys[0] as string) ?? 'all')}
          />
        </Card>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={buildings}
            pagination={{ pageSize: 12 }}
            columns={[
              { title: '编码', dataIndex: 'code', width: 120 },
              { title: '名称', dataIndex: 'name' },
              { title: '校区', dataIndex: 'campusId', width: 80, render: (c: string) => entities.campuses.find((x) => x.id === c)?.name },
              { title: '类别', dataIndex: 'category', width: 90, render: (c: BuildingCategory) => CATEGORY_LABEL[c] },
              { title: '考核面积(m²)', dataIndex: 'assessmentArea', width: 110, align: 'right' as const, render: (v: number) => fmtInt(v) },
              { title: '责任部门', dataIndex: 'departmentId', width: 130, render: (d: string) => entities.departments.find((x) => x.id === d)?.name ?? '—' },
              { title: '计量点', dataIndex: 'id', width: 80, align: 'right' as const, render: (id: string) => meterCount(id) || <Tag color="red">未接入</Tag> },
              {
                title: '状态', dataIndex: 'status', width: 76,
                render: (s: string) => <Tag color={s === 'active' ? 'green' : 'default'}>{s === 'active' ? '在用' : '停用'}</Tag>,
              },
              {
                title: '操作', width: 170,
                render: (_v, b) => (
                  <Space size={4}>
                    <a onClick={() => setDetail(b)}>详情</a>
                    {canEdit('foundation') && <a onClick={() => openEdit(b)}>编辑</a>}
                    {canEdit('foundation') && (
                      b.status === 'active'
                        ? (
                          <a style={{ color: '#cf1322' }} onClick={() => {
                            modal.confirm({
                              title: `确认停用「${b.name}」？`,
                              content: '停用后不参与统计与筛选，历史能耗数据全部保留，可重新启用。',
                              okText: '停用',
                              cancelText: '取消',
                              onOk: () => {
                                entities.actions.setBuildingStatus(b.id, 'inactive');
                                message.success('建筑已停用，历史数据保留');
                              },
                            });
                          }}>停用</a>
                        )
                        : (
                          <a onClick={() => {
                            entities.actions.setBuildingStatus(b.id, 'active');
                            message.success('建筑已重新启用，纳入统计与筛选');
                          }}>启用</a>
                        )
                    )}
                  </Space>
                ),
              },
            ]}
          />
        </div>
      </div>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        width={640}
        title={detail ? `${detail.name}（${detail.code}）` : ''}
      >
        {detail && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Table
              size="small"
              pagination={false}
              dataSource={[
                { k: '校区', v: entities.campuses.find((c) => c.id === detail.campusId)?.name ?? '—' },
                { k: '类别', v: CATEGORY_LABEL[detail.category] },
                { k: '建筑面积 / 考核面积', v: `${fmtInt(detail.buildingArea)} / ${fmtInt(detail.assessmentArea)} m²` },
                { k: '层数 / 建成年份', v: `${detail.floors} 层 / ${detail.builtYear}` },
                { k: '责任部门', v: entities.departments.find((d) => d.id === detail.departmentId)?.name ?? '—' },
                { k: '供冷/供热方式', v: `${detail.hasCentralCooling ? '集中供冷' : detail.coolingMode} / ${detail.heatingMode === 'central' ? '集中供热' : detail.heatingMode}` },
                { k: '状态', v: detail.status === 'active' ? '在用' : '停用（历史保留）' },
                { k: '备注', v: detail.remark || '—' },
              ]}
              columns={[{ dataIndex: 'k', width: 140, render: (v: string) => <b>{v}</b> }, { dataIndex: 'v' }]}
              rowKey="k"
            />
            <div>
              <b>计量接入摘要：</b>
              {detailPoints.length === 0 ? (
                <Tag color="red" style={{ marginLeft: 8 }}>暂无有效计量数据（未绑定计量点）</Tag>
              ) : (
                <span style={{ marginLeft: 8 }}>
                  {detailPoints.length} 个计量点（主表 {detailPoints.filter((p) => p.role === 'main').length}、分表 {detailPoints.filter((p) => p.role === 'submeter').length}），
                  昨日用电 {fmtInt(usage?.total ?? 0)} kWh，
                  覆盖率 {usage ? (usage.coverage * 100).toFixed(0) : '—'}%
                </span>
              )}
            </div>
            <div>
              <b>关联告警：</b>{detailAlarms.length === 0 ? ' 无' : detailAlarms.map((a) => a.title).join('；')}
            </div>
            <Space>
              <Button size="small" type="primary" onClick={() => navigate(`/monitor/building/${detail.id}?from=2026-10-20&to=2026-10-20&campus=${detail.campusId}&back=${encodeURIComponent('/base/buildings')}`)}>
                进入楼宇能耗详情
              </Button>
              {detailPoints.length === 0 && canEdit('foundation') && (
                <Button size="small" onClick={() => navigate('/base/metering')}>去绑定计量点</Button>
              )}
            </Space>
          </Space>
        )}
      </Drawer>

      <Modal
        title={editTarget ? `编辑建筑档案：${editTarget.name}` : '新增建筑'}
        open={addOpen}
        onOk={submit}
        onCancel={() => setAddOpen(false)}
        okText="保存"
        cancelText="取消"
        width={620}
      >
        <Form form={form} layout="vertical" initialValues={{ campusId: 'C-E', category: 'teaching', coolingMode: 'multi-split', heatingMode: 'multi-split', builtYear: 2020, floors: 5 }}>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="code" label="建筑编码" rules={[{ required: true, message: '请输入唯一编码' }, { pattern: /^[A-Za-z0-9-]+$/, message: '仅允许字母、数字与横线' }]}>
              <Input disabled={!!editTarget} placeholder="如 MC-E-JX03" />
            </Form.Item>
            <Form.Item name="name" label="建筑名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如 明理楼（教学楼C）" />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="campusId" label="所属校区" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={entities.campuses.map((c) => ({ value: c.id, label: c.name }))} />
            </Form.Item>
            <Form.Item name="category" label="建筑类别" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={useCategoryOptions(false)} />
            </Form.Item>
            <Form.Item name="departmentId" label="责任部门" rules={[{ required: true }]}>
              <Select style={{ width: 200 }} showSearch optionFilterProp="label" options={entities.departments.map((d) => ({ value: d.id, label: d.name }))} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="buildingArea" label="建筑面积(m²)" rules={[{ required: true }, { type: 'number', min: 1, message: '面积必须为正数' }]}>
              <InputNumber min={1} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="assessmentArea" label="考核面积(m²)" rules={[{ required: true }, { type: 'number', min: 0 }]}>
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="floors" label="层数" rules={[{ required: true }]}>
              <InputNumber min={1} style={{ width: 90 }} />
            </Form.Item>
            <Form.Item name="builtYear" label="建成年份" rules={[{ required: true }]}>
              <InputNumber min={1950} max={2026} style={{ width: 100 }} />
            </Form.Item>
          </Space>
          <Space size={12} style={{ display: 'flex' }}>
            <Form.Item name="coolingMode" label="供冷方式">
              <Select style={{ width: 150 }} options={[{ value: 'multi-split', label: '分体/VRV空调' }, { value: 'central', label: '楼内中央空调' }, { value: 'none', label: '无' }]} />
            </Form.Item>
            <Form.Item name="heatingMode" label="供热方式">
              <Select style={{ width: 150 }} options={[{ value: 'multi-split', label: '分体/VRV热泵' }, { value: 'central', label: '集中供热' }, { value: 'none', label: '无' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="混合用途、特殊设备等说明" />
          </Form.Item>
        </Form>
      </Modal>
      <div className="muted small mt8">
        说明：新增建筑默认无计量接入，能耗页面将显示“暂无有效计量数据”；须在计量关系维护页人工逐点绑定IoT属性并确认后纳入统计。
        历史已产生能耗的建筑不可物理删除，仅可停用。当前可筛选建筑：{useBuildingOptions('all').length - 1} 栋。
      </div>
    </div>
  );
}